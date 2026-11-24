/**
 * Server-authoritative dine-in table session state machine.
 * AVAILABLE → ACTIVE_UNPAID → PAYMENT_PENDING → PAID_SETTLED → AVAILABLE
 */
import crypto from 'node:crypto';
import { prisma } from './prisma.js';

export type TableSessionStatus =
  | 'AVAILABLE'
  | 'ACTIVE_UNPAID'
  | 'PAYMENT_PENDING'
  | 'PAID_SETTLED';

export type TableSessionRow = {
  id: string;
  storeId: string;
  tableNumber: string;
  status: TableSessionStatus;
  ownerTokenHash: string | null;
  orderIdsJson: string | null;
  openedAt: Date | string | null;
  paidAt: Date | string | null;
  closedAt: Date | string | null;
  updatedAt: Date | string;
};

const ACTIVE: TableSessionStatus[] = ['ACTIVE_UNPAID', 'PAYMENT_PENDING'];

export function hashSessionToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}

export async function ensureTableSessionSchema(): Promise<void> {
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS \`TableSession\` (
      \`id\` VARCHAR(191) NOT NULL,
      \`storeId\` VARCHAR(191) NOT NULL,
      \`tableNumber\` VARCHAR(64) NOT NULL,
      \`status\` VARCHAR(32) NOT NULL DEFAULT 'AVAILABLE',
      \`ownerTokenHash\` VARCHAR(64) NULL,
      \`orderIdsJson\` TEXT NULL,
      \`openedAt\` DATETIME(3) NULL,
      \`paidAt\` DATETIME(3) NULL,
      \`closedAt\` DATETIME(3) NULL,
      \`createdAt\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
      \`updatedAt\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
      PRIMARY KEY (\`id\`),
      UNIQUE KEY \`TableSession_store_table_key\` (\`storeId\`, \`tableNumber\`),
      INDEX \`TableSession_status_idx\` (\`status\`)
    )
  `);
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS \`TableSessionEvent\` (
      \`id\` VARCHAR(191) NOT NULL,
      \`sessionId\` VARCHAR(191) NOT NULL,
      \`storeId\` VARCHAR(191) NOT NULL,
      \`tableNumber\` VARCHAR(64) NOT NULL,
      \`fromStatus\` VARCHAR(32) NULL,
      \`toStatus\` VARCHAR(32) NOT NULL,
      \`actor\` VARCHAR(32) NOT NULL DEFAULT 'QR_CLIENT',
      \`metaJson\` TEXT NULL,
      \`createdAt\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
      PRIMARY KEY (\`id\`),
      INDEX \`TableSessionEvent_session_idx\` (\`sessionId\`),
      INDEX \`TableSessionEvent_store_table_idx\` (\`storeId\`, \`tableNumber\`)
    )
  `);
}

async function logEvent(params: {
  sessionId: string;
  storeId: string;
  tableNumber: string;
  fromStatus: string | null;
  toStatus: string;
  actor: string;
  meta?: Record<string, unknown>;
}): Promise<void> {
  const id = `tse_${crypto.randomBytes(10).toString('hex')}`;
  await prisma.$executeRawUnsafe(
    `INSERT INTO TableSessionEvent
      (id, sessionId, storeId, tableNumber, fromStatus, toStatus, actor, metaJson, createdAt)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, NOW(3))`,
    id,
    params.sessionId,
    params.storeId,
    params.tableNumber,
    params.fromStatus,
    params.toStatus,
    params.actor,
    params.meta ? JSON.stringify(params.meta) : null,
  );
}

export async function getOrCreateTableSession(
  storeId: string,
  tableNumber: string,
): Promise<TableSessionRow> {
  await ensureTableSessionSchema();
  const rows = await prisma.$queryRawUnsafe<TableSessionRow[]>(
    'SELECT * FROM TableSession WHERE storeId = ? AND tableNumber = ? LIMIT 1',
    storeId,
    tableNumber,
  );
  if (rows[0]) return rows[0];

  const id = `ts_${crypto.randomBytes(10).toString('hex')}`;
  await prisma.$executeRawUnsafe(
    `INSERT INTO TableSession
      (id, storeId, tableNumber, status, createdAt, updatedAt)
     VALUES (?, ?, ?, 'AVAILABLE', NOW(3), NOW(3))`,
    id,
    storeId,
    tableNumber,
  );
  const created = await prisma.$queryRawUnsafe<TableSessionRow[]>(
    'SELECT * FROM TableSession WHERE id = ? LIMIT 1',
    id,
  );
  return created[0]!;
}

export function isTableLockedForToken(
  session: TableSessionRow,
  sessionToken: string | null | undefined,
): { locked: boolean; isOwner: boolean; status: TableSessionStatus } {
  const status = (session.status || 'AVAILABLE') as TableSessionStatus;
  const isActive = ACTIVE.includes(status);
  if (!isActive) {
    return { locked: false, isOwner: true, status };
  }
  const hash = sessionToken ? hashSessionToken(sessionToken) : '';
  const isOwner = Boolean(session.ownerTokenHash && hash && session.ownerTokenHash === hash);
  return { locked: !isOwner, isOwner, status };
}

/** Bind table to this QR session on first unpaid dine-in order (atomic). */
export async function activateTableSession(params: {
  storeId: string;
  tableNumber: string;
  sessionToken: string;
  orderId: string;
  actor?: string;
}): Promise<{ ok: true; session: TableSessionRow } | { ok: false; code: string; message: string; session: TableSessionRow }> {
  await ensureTableSessionSchema();
  const { storeId, tableNumber, sessionToken, orderId } = params;
  const actor = params.actor || 'QR_CLIENT';
  const tokenHash = hashSessionToken(sessionToken);

  return prisma.$transaction(async (tx) => {
    await tx.$executeRawUnsafe(
      `INSERT INTO TableSession (id, storeId, tableNumber, status, createdAt, updatedAt)
       VALUES (?, ?, ?, 'AVAILABLE', NOW(3), NOW(3))
       ON DUPLICATE KEY UPDATE updatedAt = updatedAt`,
      `ts_${crypto.randomBytes(10).toString('hex')}`,
      storeId,
      tableNumber,
    );

    const rows = await tx.$queryRawUnsafe<TableSessionRow[]>(
      'SELECT * FROM TableSession WHERE storeId = ? AND tableNumber = ? LIMIT 1 FOR UPDATE',
      storeId,
      tableNumber,
    );
    const session = rows[0]!;
    const status = (session.status || 'AVAILABLE') as TableSessionStatus;

    if (ACTIVE.includes(status) && session.ownerTokenHash && session.ownerTokenHash !== tokenHash) {
      return {
        ok: false as const,
        code: 'TABLE_LOCKED',
        message: 'This table currently has an active unpaid order. Please ask staff for assistance.',
        session,
      };
    }

    let orderIds: string[] = [];
    try {
      orderIds = session.orderIdsJson ? JSON.parse(String(session.orderIdsJson)) : [];
      if (!Array.isArray(orderIds)) orderIds = [];
    } catch {
      orderIds = [];
    }
    if (!orderIds.includes(orderId)) orderIds.push(orderId);

    const nextStatus: TableSessionStatus = 'ACTIVE_UNPAID';
    await tx.$executeRawUnsafe(
      `UPDATE TableSession SET
        status = ?,
        ownerTokenHash = ?,
        orderIdsJson = ?,
        openedAt = COALESCE(openedAt, NOW(3)),
        paidAt = NULL,
        closedAt = NULL,
        updatedAt = NOW(3)
       WHERE id = ?`,
      nextStatus,
      tokenHash,
      JSON.stringify(orderIds),
      session.id,
    );

    await logEvent({
      sessionId: session.id,
      storeId,
      tableNumber,
      fromStatus: status,
      toStatus: nextStatus,
      actor,
      meta: { orderId },
    });

    const updated = await tx.$queryRawUnsafe<TableSessionRow[]>(
      'SELECT * FROM TableSession WHERE id = ? LIMIT 1',
      session.id,
    );
    return { ok: true as const, session: updated[0]! };
  });
}

export async function markTablePaymentPending(params: {
  storeId: string;
  tableNumber: string;
  sessionToken: string;
  actor?: string;
}): Promise<void> {
  const session = await getOrCreateTableSession(params.storeId, params.tableNumber);
  const gate = isTableLockedForToken(session, params.sessionToken);
  if (gate.locked) return;
  if (!ACTIVE.includes(gate.status) && gate.status !== 'AVAILABLE') return;

  const from = session.status;
  await prisma.$executeRawUnsafe(
    `UPDATE TableSession SET status = 'PAYMENT_PENDING', updatedAt = NOW(3) WHERE id = ?`,
    session.id,
  );
  await logEvent({
    sessionId: session.id,
    storeId: params.storeId,
    tableNumber: params.tableNumber,
    fromStatus: from,
    toStatus: 'PAYMENT_PENDING',
    actor: params.actor || 'QR_CLIENT',
  });
}

export async function settleTableSession(params: {
  storeId: string;
  tableNumber: string;
  actor?: string;
  paymentRef?: string;
}): Promise<void> {
  const session = await getOrCreateTableSession(params.storeId, params.tableNumber);
  const from = session.status;
  await prisma.$executeRawUnsafe(
    `UPDATE TableSession SET
      status = 'AVAILABLE',
      ownerTokenHash = NULL,
      orderIdsJson = NULL,
      paidAt = NOW(3),
      closedAt = NOW(3),
      updatedAt = NOW(3)
     WHERE id = ?`,
    session.id,
  );
  await logEvent({
    sessionId: session.id,
    storeId: params.storeId,
    tableNumber: params.tableNumber,
    fromStatus: from,
    toStatus: 'PAID_SETTLED',
    actor: params.actor || 'STAFF',
    meta: params.paymentRef ? { paymentRef: params.paymentRef } : undefined,
  });
  await logEvent({
    sessionId: session.id,
    storeId: params.storeId,
    tableNumber: params.tableNumber,
    fromStatus: 'PAID_SETTLED',
    toStatus: 'AVAILABLE',
    actor: params.actor || 'STAFF',
  });
}

export async function forceUnlockTable(params: {
  storeId: string;
  tableNumber: string;
  actor?: string;
  reason?: string;
}): Promise<void> {
  await settleTableSession({
    storeId: params.storeId,
    tableNumber: params.tableNumber,
    actor: params.actor || 'STAFF',
    paymentRef: params.reason || 'force_unlock',
  });
}
