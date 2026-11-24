/**
 * Table QR session APIs (parity with PHP /api/v1/qr/* and /admin/tables/qr).
 * Uses the TableQrCode MySQL table created by the PHP migrator.
 */
import crypto from 'node:crypto';
import express from 'express';
import jwt from 'jsonwebtoken';
import { z } from 'zod';
import { config } from '../config.js';
import { AppError } from '../lib/errors.js';
import { prisma } from '../lib/prisma.js';
import { requireStaff } from '../middleware/auth.js';
import {
  getOrCreateTableSession,
  isTableLockedForToken,
} from '../lib/table-session.js';
import { getStoredStores } from './stores.js';

const router = express.Router();
const QR_COOKIE = 'kalpana_qr_session';
const QR_SESSION_TTL = 4 * 60 * 60; // 4 hours

type TableQrRow = {
  id: string;
  storeId: string;
  tableNumber: string;
  qrCode: string;
  isActive: number | boolean;
  expiresAt: Date | string | null;
  lastScannedAt?: Date | string | null;
};

async function ensureTable(): Promise<void> {
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS \`TableQrCode\` (
      \`id\` VARCHAR(191) NOT NULL,
      \`storeId\` VARCHAR(191) NOT NULL,
      \`tableNumber\` VARCHAR(64) NOT NULL,
      \`qrCode\` VARCHAR(191) NOT NULL,
      \`isActive\` BOOLEAN NOT NULL DEFAULT true,
      \`expiresAt\` DATETIME(3) NULL,
      \`lastScannedAt\` DATETIME(3) NULL,
      \`createdAt\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
      \`updatedAt\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
      PRIMARY KEY (\`id\`),
      UNIQUE KEY \`TableQrCode_qrCode_key\` (\`qrCode\`),
      INDEX \`TableQrCode_store_table_idx\` (\`storeId\`, \`tableNumber\`),
      INDEX \`TableQrCode_isActive_idx\` (\`isActive\`)
    )
  `);
}

function defaultTablesFromSettings(dineInTableNames: string | null | undefined): string[] {
  const fallback = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '10', '11', '12', '14', '15', 'カウンター1', 'カウンター2', 'カウンター3'];
  if (!dineInTableNames?.trim()) return fallback;
  const custom = dineInTableNames.split(/[,、\n]+/).map((t) => t.trim()).filter(Boolean);
  return custom.length > 0 ? [...new Set([...fallback, ...custom])] : fallback;
}

async function ensureStoreTableQrCodes(): Promise<number> {
  await ensureTable();
  const stores = await getStoredStores().catch(() => []);
  const settings = await prisma.settings.findFirst().catch(() => null);
  const tables = defaultTablesFromSettings((settings as { dineInTableNames?: string } | null)?.dineInTableNames);
  const storeList = stores.length > 0 ? stores : [{ id: 'musashisakai', name: '武蔵境店' }];

  let created = 0;
  for (const store of storeList) {
    const storeId = store.id;
    if (!storeId) continue;
    for (const tableNumber of tables) {
      const existing = await prisma.$queryRawUnsafe<Array<{ id: string }>>(
        'SELECT id FROM TableQrCode WHERE storeId = ? AND tableNumber = ? LIMIT 1',
        storeId,
        tableNumber,
      );
      if (existing.length > 0) continue;
      const id = `tqr_${crypto.randomBytes(10).toString('hex')}`;
      const hash = crypto.createHmac('sha256', config.jwtSecret).update(`table_qr:${storeId}:${tableNumber}`).digest('hex').slice(0, 16);
      const qrCode = `qr_${storeId}_${tableNumber}_${hash}`;
      await prisma.$executeRawUnsafe(
        'INSERT INTO TableQrCode (id, storeId, tableNumber, qrCode, isActive, createdAt, updatedAt) VALUES (?, ?, ?, ?, 1, NOW(3), NOW(3))',
        id,
        storeId,
        tableNumber,
        qrCode,
      );
      created += 1;
    }
  }
  return created;
}

/** Pull qr / store / table out of a bare code or a full /order?… URL. */
function parseQrInput(raw: string): { qrCode: string; storeId?: string; tableNumber?: string } {
  const value = raw.trim();
  if (!value) return { qrCode: '' };

  let storeId: string | undefined;
  let tableNumber: string | undefined;
  if (/[?&](store|table)=/i.test(value) || /^https?:\/\//i.test(value) || value.includes('/order')) {
    try {
      const href = value.includes('://')
        ? value
        : `https://local.invalid${value.startsWith('/') ? value : `/${value}`}`;
      const u = new URL(href);
      storeId = u.searchParams.get('store') || undefined;
      tableNumber = u.searchParams.get('table') || undefined;
    } catch {
      /* ignore malformed URL */
    }
  }

  const fromQuery = value.match(/[?&]qr=([a-zA-Z0-9_\-]+)/);
  if (fromQuery) return { qrCode: fromQuery[1], storeId, tableNumber };
  const fromPath = value.match(/\/qr\/([a-zA-Z0-9_\-]+)/);
  if (fromPath) return { qrCode: fromPath[1], storeId, tableNumber };

  // Bare table QR token (not a URL)
  if (!value.includes('://') && !value.includes('?') && !value.includes('/')) {
    return { qrCode: value, storeId, tableNumber };
  }
  return { qrCode: '', storeId, tableNumber };
}

async function findQrRow(opts: {
  qrCode?: string;
  storeId?: string;
  tableNumber?: string;
}): Promise<TableQrRow | null> {
  await ensureTable();
  const parsed = opts.qrCode ? parseQrInput(opts.qrCode) : { qrCode: '' };
  const qrCode = parsed.qrCode;
  const storeId = (opts.storeId || parsed.storeId || '').trim();
  const tableNumber = (opts.tableNumber || parsed.tableNumber || '').trim();

  if (qrCode) {
    const rows = await prisma.$queryRawUnsafe<TableQrRow[]>(
      'SELECT * FROM TableQrCode WHERE qrCode = ? LIMIT 1',
      qrCode,
    );
    if (rows[0]) return rows[0];
  }
  if (storeId && tableNumber) {
    const rows = await prisma.$queryRawUnsafe<TableQrRow[]>(
      'SELECT * FROM TableQrCode WHERE storeId = ? AND tableNumber = ? LIMIT 1',
      storeId,
      tableNumber,
    );
    if (rows[0]) return rows[0];
    // Auto-create missing table QR so printed store+table links still work
    await ensureStoreTableQrCodes();
    const again = await prisma.$queryRawUnsafe<TableQrRow[]>(
      'SELECT * FROM TableQrCode WHERE storeId = ? AND tableNumber = ? LIMIT 1',
      storeId,
      tableNumber,
    );
    return again[0] || null;
  }
  // Table-only links are ambiguous across branches — require storeId (対象店舗).
  return null;
}

function issueQrSession(row: TableQrRow) {
  const payload = {
    typ: 'qr_session',
    qrId: row.id,
    storeId: row.storeId,
    tableNumber: row.tableNumber,
    qrCode: row.qrCode,
  };
  const sessionToken = jwt.sign(payload, config.jwtSecret, {
    expiresIn: QR_SESSION_TTL,
    algorithm: 'HS256',
  });
  const decoded = jwt.decode(sessionToken) as { exp?: number } | null;
  return { sessionToken, expiresAt: decoded?.exp ?? Math.floor(Date.now() / 1000) + QR_SESSION_TTL };
}

function readQrToken(req: express.Request): string | undefined {
  const header = req.header('X-QR-Session');
  if (header?.trim()) return header.trim();
  for (const part of (req.headers.cookie ?? '').split(';')) {
    const [key, ...rest] = part.trim().split('=');
    if (key === QR_COOKIE) return decodeURIComponent(rest.join('='));
  }
  return undefined;
}

function setQrCookie(res: express.Response, token: string) {
  res.cookie(QR_COOKIE, token, {
    httpOnly: true,
    secure: config.isProduction,
    sameSite: 'lax',
    path: '/',
  });
}

function clearQrCookie(res: express.Response) {
  res.clearCookie(QR_COOKIE, {
    httpOnly: true,
    secure: config.isProduction,
    sameSite: 'lax',
    path: '/',
  });
}

const validateSchema = z.object({
  qrCode: z.string().optional(),
  qr: z.string().optional(),
  storeId: z.string().optional(),
  store: z.string().optional(),
  tableNumber: z.string().optional(),
  table: z.string().optional(),
  /** Resume an existing owner session after refresh (optional). */
  sessionToken: z.string().optional(),
});

router.post('/validate', async (req, res) => {
  const input = validateSchema.parse(req.body ?? {});
  const rawQr = input.qrCode || input.qr || '';
  const parsed = rawQr ? parseQrInput(rawQr) : { qrCode: '' };
  const qrCode = parsed.qrCode || rawQr;
  const storeId = input.storeId || input.store || parsed.storeId || '';
  const tableNumber = input.tableNumber || input.table || parsed.tableNumber || '';

  if (!qrCode && !tableNumber) {
    throw new AppError(400, 'QR_REQUIRED', 'QRコードをスキャンしてください。');
  }
  // Require store+table (or a resolvable QR code) — never silently bind the wrong branch.
  if (!qrCode && tableNumber && !storeId) {
    throw new AppError(400, 'STORE_REQUIRED', '店舗情報がないQRです。正しいお席のQRコードをスキャンしてください。');
  }

  const row = await findQrRow({ qrCode, storeId, tableNumber });
  if (!row) {
    throw new AppError(404, 'INVALID_QR', '無効なQRコードです。お席のQRコードをご確認ください。');
  }
  if (storeId && row.storeId && storeId !== row.storeId) {
    throw new AppError(403, 'STORE_MISMATCH', 'QRの店舗と選択店舗が一致しません。正しいお席のQRをご利用ください。');
  }
  if (tableNumber && String(row.tableNumber) !== String(tableNumber)) {
    throw new AppError(403, 'TABLE_MISMATCH', 'QRのお席番号が一致しません。正しいお席のQRをご利用ください。');
  }
  if (!row.isActive) {
    throw new AppError(403, 'QR_DISABLED', 'このお席のQRコードは現在無効化されています。店員にお声がけください。');
  }
  if (row.expiresAt && new Date(row.expiresAt).getTime() < Date.now()) {
    throw new AppError(403, 'QR_EXPIRED', 'QRコードの有効期限が切れています。新しいQRコードをお確かめください。');
  }

  try {
    await prisma.$executeRawUnsafe(
      'UPDATE TableQrCode SET lastScannedAt = NOW(3), updatedAt = NOW(3) WHERE id = ?',
      row.id,
    );
  } catch {
    /* optional column */
  }

  const stores = await getStoredStores().catch(() => []);
  const store = stores.find((s) => s.id === row.storeId) || {
    id: row.storeId,
    name: row.storeId,
  };

  const existingToken = (input.sessionToken || readQrToken(req) || '').trim();
  const tableSession = await getOrCreateTableSession(row.storeId, String(row.tableNumber));
  const lock = isTableLockedForToken(tableSession, existingToken || null);

  if (lock.locked) {
    clearQrCookie(res);
    res.status(409).json({
      valid: false,
      tableLocked: true,
      canOrder: false,
      lockStatus: lock.status,
      storeId: row.storeId,
      tableNumber: row.tableNumber,
      qrCode: row.qrCode,
      store,
      restaurantName: 'Adarsha (アダルサ)',
      error: {
        code: 'TABLE_LOCKED',
        message:
          'このお席では現在、未会計の注文が進行中です。新しいご注文はお受けできません。お困りの際は店員にお声がけください。',
      },
    });
    return;
  }

  // Owner refresh: reuse the same token so order history / lock ownership stays intact.
  let sessionToken = existingToken;
  let expiresAt = Math.floor(Date.now() / 1000) + QR_SESSION_TTL;
  if (lock.isOwner && existingToken) {
    try {
      const payload = jwt.verify(existingToken, config.jwtSecret, { algorithms: ['HS256'] }) as {
        typ?: string;
        storeId?: string;
        tableNumber?: string;
        exp?: number;
      };
      if (
        payload.typ === 'qr_session' &&
        String(payload.storeId || '') === row.storeId &&
        String(payload.tableNumber || '') === String(row.tableNumber)
      ) {
        expiresAt = payload.exp || expiresAt;
      } else {
        sessionToken = '';
      }
    } catch {
      sessionToken = '';
    }
  } else {
    sessionToken = '';
  }

  if (!sessionToken) {
    const issued = issueQrSession(row);
    sessionToken = issued.sessionToken;
    expiresAt = issued.expiresAt;
  }
  setQrCookie(res, sessionToken);

  res.json({
    valid: true,
    canOrder: true,
    tableLocked: false,
    lockStatus: lock.status,
    sessionToken,
    storeId: row.storeId,
    tableNumber: row.tableNumber,
    qrCode: row.qrCode,
    store,
    restaurantName: 'Adarsha (アダルサ)',
    expiresAt,
  });
});

router.get('/session', async (req, res) => {
  const token = readQrToken(req);
  if (!token) {
    res.json({ valid: false });
    return;
  }
  try {
    const payload = jwt.verify(token, config.jwtSecret, { algorithms: ['HS256'] }) as {
      typ?: string;
      qrCode?: string;
      storeId?: string;
      tableNumber?: string;
      exp?: number;
    };
    if (payload.typ !== 'qr_session' || !payload.qrCode) {
      res.json({ valid: false });
      return;
    }
    const rows = await prisma.$queryRawUnsafe<TableQrRow[]>(
      'SELECT * FROM TableQrCode WHERE qrCode = ? AND isActive = 1 LIMIT 1',
      payload.qrCode,
    );
    if (!rows[0]) {
      res.json({ valid: false });
      return;
    }
    res.json({
      valid: true,
      sessionToken: token,
      storeId: payload.storeId || rows[0].storeId,
      tableNumber: payload.tableNumber || rows[0].tableNumber,
      qrCode: payload.qrCode,
      expiresAt: payload.exp,
    });
  } catch {
    res.json({ valid: false });
  }
});

router.post('/clear', (_req, res) => {
  clearQrCookie(res);
  res.json({ cleared: true });
});

/** Staff: list / seed / regenerate / toggle table QR codes */
const adminRouter = express.Router();
adminRouter.use(requireStaff);

adminRouter.get('/', async (_req, res) => {
  await ensureStoreTableQrCodes();
  const rows = await prisma.$queryRawUnsafe<TableQrRow[]>(
    'SELECT * FROM TableQrCode ORDER BY storeId ASC, LENGTH(tableNumber) ASC, tableNumber ASC',
  );
  // Support both shapes used by admin UI
  res.json({ tables: rows, length: rows.length });
});

adminRouter.post('/regenerate', async (req, res) => {
  const storeId = String(req.body?.storeId || '').trim();
  const tableNumber = String(req.body?.tableNumber || '').trim();
  if (!storeId || !tableNumber) {
    throw new AppError(400, 'PARAMS_REQUIRED', '店舗とテーブル番号を指定してください。');
  }
  await ensureTable();
  const newQrCode = `qr_${storeId}_${tableNumber}_${crypto.randomBytes(8).toString('hex')}`;
  await prisma.$executeRawUnsafe(
    'UPDATE TableQrCode SET qrCode = ?, updatedAt = NOW(3) WHERE storeId = ? AND tableNumber = ?',
    newQrCode,
    storeId,
    tableNumber,
  );
  res.json({ success: true, qrCode: newQrCode });
});

adminRouter.post('/toggle', async (req, res) => {
  const id = String(req.body?.id || '').trim();
  const isActive = Boolean(req.body?.isActive);
  if (!id) throw new AppError(400, 'ID_REQUIRED', 'QR id is required');
  await ensureTable();
  await prisma.$executeRawUnsafe(
    'UPDATE TableQrCode SET isActive = ?, updatedAt = NOW(3) WHERE id = ?',
    isActive ? 1 : 0,
    id,
  );
  res.json({ success: true, isActive });
});

/** Verify a QR table session from X-QR-Session / cookie / body token. */
export function verifyQrSessionFromRequest(
  req: express.Request,
  opts?: { sessionToken?: string | null; expectedTable?: string | null; expectedStoreId?: string | null },
): { storeId: string; tableNumber: string; qrCode: string } {
  const token = (opts?.sessionToken || '').trim() || readQrToken(req) || '';
  if (!token) {
    throw new AppError(401, 'QR_SESSION_REQUIRED', 'お席のQRセッションが必要です。もう一度QRコードをスキャンしてください。');
  }
  try {
    const payload = jwt.verify(token, config.jwtSecret, { algorithms: ['HS256'] }) as {
      typ?: string;
      qrCode?: string;
      storeId?: string;
      tableNumber?: string;
    };
    if (payload.typ !== 'qr_session' || !payload.tableNumber) {
      throw new AppError(401, 'QR_SESSION_INVALID', 'お席セッションが無効です。もう一度QRコードをスキャンしてください。');
    }
    if (opts?.expectedTable && String(opts.expectedTable) !== String(payload.tableNumber)) {
      throw new AppError(403, 'QR_TABLE_MISMATCH', 'QRのお席番号と注文のお席が一致しません。');
    }
    if (opts?.expectedStoreId && payload.storeId && String(opts.expectedStoreId) !== String(payload.storeId)) {
      throw new AppError(403, 'QR_STORE_MISMATCH', 'QRの店舗と注文の店舗が一致しません。');
    }
    return {
      storeId: String(payload.storeId || ''),
      tableNumber: String(payload.tableNumber),
      qrCode: String(payload.qrCode || ''),
    };
  } catch (err) {
    if (err instanceof AppError) throw err;
    throw new AppError(401, 'QR_SESSION_EXPIRED', 'お席セッションの有効期限が切れました。もう一度QRコードをスキャンしてください。');
  }
}

export { adminRouter as qrAdminRoutes };
export default router;
