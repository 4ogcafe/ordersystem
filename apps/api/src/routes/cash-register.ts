import crypto from 'node:crypto';
import express from 'express';
import { z } from 'zod';
import { AppError } from '../lib/errors.js';
import { prisma } from '../lib/prisma.js';
import {
  adoptOpenShiftIfNeeded,
  allTransactions,
  branchPayload,
  computeBranchStats,
  findOpenShift,
  findTransaction,
  getBranchState,
  loadMultiRegisterState,
  normalizeStoreId,
  saveMultiRegisterState,
  tokyoTodayPrefix,
  type CashMovement,
  type CashRegisterShift,
  type CashRegisterTransaction,
} from '../lib/cash-register-state.js';
import { requireKitchen } from '../middleware/auth.js';
import { settleMemberPoints, settleMemberStamp } from './orders.js';

const router = express.Router();

function requireStoreId(raw: unknown): string {
  const id = normalizeStoreId(raw);
  if (!id) throw new AppError(400, 'STORE_REQUIRED', '店舗（storeId）を指定してください。');
  return id;
}

function storeIdFromQuery(req: express.Request): string | null {
  return normalizeStoreId(req.query.storeId);
}

// ── GET /api/v1/cash-register?storeId= ───────────────────────────────────────
// With storeId → that branch ledger. Without → all branches + org summary.
router.get('/', requireKitchen, async (req, res) => {
  const state = await loadMultiRegisterState();
  const storeId = storeIdFromQuery(req);
  res.setHeader('Cache-Control', 'no-store');

  if (storeId) {
    // Read-only for this branch — do not move shifts between stores on GET
    const branch = getBranchState(state, storeId);
    const payload = branchPayload(storeId, branch);
    const otherOpen = findOpenShift(state);
    res.json({
      ...payload,
      openShiftStoreId: branch.currentShift?.isOpen
        ? storeId
        : (otherOpen?.storeId ?? null),
    });
    return;
  }

  const branches = Object.keys(state.byStore).map((id) => branchPayload(id, getBranchState(state, id)));
  const todayPrefix = tokyoTodayPrefix();
  const allTx = allTransactions(state).filter(
    (t) => !t.isVoided && t.timestamp && (t.timestamp.startsWith(todayPrefix) || t.timestamp.slice(0, 10) === todayPrefix),
  );
  const byPaymentMethod: Record<string, { count: number; total: number }> = {};
  let cashSales = 0;
  let nonCashSales = 0;
  for (const t of allTx) {
    const method = t.paymentMethod || 'OTHER';
    if (!byPaymentMethod[method]) byPaymentMethod[method] = { count: 0, total: 0 };
    byPaymentMethod[method].count += 1;
    byPaymentMethod[method].total += t.total || 0;
    if (method === 'CASH') cashSales += t.total || 0;
    else nonCashSales += t.total || 0;
  }

  res.json({
    storeId: null,
    shift: null,
    branches,
    stats: {
      todaySales: cashSales + nonCashSales,
      cashSales,
      nonCashSales,
      transactionCount: allTx.length,
      cashIn: branches.reduce((s, b) => s + (b.stats.cashIn || 0), 0),
      cashOut: branches.reduce((s, b) => s + (b.stats.cashOut || 0), 0),
      startingFloat: 0,
      expectedDrawerCash: 0,
      byPaymentMethod,
    },
    todayTransactions: allTx,
    recentMovements: [],
    closedShifts: [],
  });
});

// ── POST /api/v1/cash-register/shift/open ────────────────────────────────────
const openShiftSchema = z.object({
  startingFloat: z.number().int().min(0).max(10_000_000).default(30_000),
  storeId: z.string().min(1),
});

router.post('/shift/open', requireKitchen, async (req, res) => {
  const { startingFloat, storeId: rawStoreId } = openShiftSchema.parse(req.body);
  const storeId = requireStoreId(rawStoreId);
  const state = await loadMultiRegisterState();
  const branch = getBranchState(state, storeId);

  if (branch.currentShift?.isOpen) {
    throw new AppError(409, 'SHIFT_ALREADY_OPEN', 'この店舗のレジは既に開設されています。');
  }

  const newShift: CashRegisterShift = {
    id: crypto.randomUUID(),
    isOpen: true,
    openedAt: new Date().toISOString(),
    openedBy: req.user?.name || 'Staff',
    openedById: req.user?.id,
    startingFloat,
    storeId,
  };

  branch.currentShift = newShift;
  await saveMultiRegisterState(state);
  res.status(201).json({ success: true, shift: newShift });
});

// ── POST /api/v1/cash-register/shift/close ───────────────────────────────────
const closeShiftSchema = z.object({
  countedTotal: z.number().int().min(0).max(50_000_000),
  denominations: z.record(z.string(), z.number()).optional(),
  notes: z.string().optional(),
  storeId: z.string().min(1),
});

router.post('/shift/close', requireKitchen, async (req, res) => {
  const { countedTotal, denominations, notes, storeId: rawStoreId } = closeShiftSchema.parse(req.body);
  const storeId = requireStoreId(rawStoreId);
  const state = await loadMultiRegisterState();
  const branch = getBranchState(state, storeId);

  if (!branch.currentShift?.isOpen) {
    throw new AppError(409, 'NO_OPEN_SHIFT', 'この店舗に開設中のレジがありません。');
  }

  const shiftStart = new Date(branch.currentShift.openedAt).getTime();
  const shiftCashSales = branch.transactions
    .filter((t) => !t.isVoided && t.paymentMethod === 'CASH' && new Date(t.timestamp).getTime() >= shiftStart)
    .reduce((sum, t) => sum + (t.total || 0), 0);
  const shiftIn = branch.movements
    .filter((m) => m.type === 'IN' && new Date(m.timestamp).getTime() >= shiftStart)
    .reduce((sum, m) => sum + m.amount, 0);
  const shiftOut = branch.movements
    .filter((m) => m.type === 'OUT' && new Date(m.timestamp).getTime() >= shiftStart)
    .reduce((sum, m) => sum + m.amount, 0);

  const expectedTotal = branch.currentShift.startingFloat + shiftCashSales + shiftIn - shiftOut;
  const closedShift: CashRegisterShift = {
    ...branch.currentShift,
    isOpen: false,
    closedAt: new Date().toISOString(),
    closedBy: req.user?.name || 'Staff',
    closedById: req.user?.id,
    countedTotal,
    expectedTotal,
    variance: countedTotal - expectedTotal,
    denominations,
    notes,
    storeId,
  };

  branch.closedShifts.push(closedShift);
  branch.currentShift = null;
  await saveMultiRegisterState(state);
  res.json({ success: true, shift: closedShift });
});

// ── POST /api/v1/cash-register/movement ──────────────────────────────────────
const movementSchema = z.object({
  type: z.enum(['IN', 'OUT']),
  amount: z.number().int().positive().max(10_000_000),
  reason: z.string().trim().min(1).max(200),
  memo: z.string().trim().max(500).optional(),
  storeId: z.string().min(1),
});

router.post('/movement', requireKitchen, async (req, res) => {
  const input = movementSchema.parse(req.body);
  const storeId = requireStoreId(input.storeId);
  const state = await loadMultiRegisterState();
  const branch = adoptOpenShiftIfNeeded(state, storeId);

  if (!branch.currentShift?.isOpen) {
    throw new AppError(409, 'NO_OPEN_SHIFT', 'この店舗のレジを開設してから入出金を登録してください。');
  }

  const movement: CashMovement = {
    id: crypto.randomUUID(),
    timestamp: new Date().toISOString(),
    type: input.type,
    amount: input.amount,
    reason: input.reason,
    memo: input.memo,
    staffName: req.user?.name || 'Staff',
    staffId: req.user?.id,
    storeId,
  };

  branch.movements.push(movement);
  await saveMultiRegisterState(state);
  res.status(201).json({ success: true, movement });
});

// ── POST /api/v1/cash-register/transaction ───────────────────────────────────
const transactionSchema = z.object({
  orderId: z.string().optional().nullable(),
  orderIds: z.array(z.string().min(1)).optional(),
  orderNumber: z.number().optional().nullable(),
  tableNumber: z.string().optional().nullable(),
  type: z.enum(['ORDER_SETTLEMENT', 'WALK_IN', 'REFUND']).default('ORDER_SETTLEMENT'),
  fulfillment: z.enum(['DINE_IN', 'PICKUP', 'DELIVERY']).optional(),
  customerName: z.string().optional(),
  itemsSummary: z.string().min(1),
  items: z
    .array(
      z.object({
        nameJa: z.string().optional().nullable(),
        nameEn: z.string(),
        quantity: z.number().int().positive(),
        unitPrice: z.number().int().nonnegative(),
        lineTotal: z.number().int().nonnegative(),
      }),
    )
    .optional(),
  subtotal: z.number().int().nonnegative(),
  tax: z.number().int().nonnegative(),
  taxRate: z.number().int().nonnegative().default(10),
  originalTotal: z.number().int().nonnegative().optional().nullable(),
  discount: z.number().int().nonnegative().default(0),
  discountReason: z.string().optional().nullable(),
  total: z.number().int().nonnegative(),
  paymentMethod: z.enum([
    'CASH',
    'CARD',
    'BANK_TRANSFER',
    'PAYPAY',
    'RAKUTEN_PAY',
    'D_PAY',
    'AU_PAY',
    'MERPAY',
    'WECHAT_PAY',
    'IC',
    'ID_QUICPAY',
    'INVOICE',
  ]),
  amountTendered: z.number().int().nonnegative(),
  changeAmount: z.number().int().nonnegative(),
  storeId: z.string().min(1),
  storeName: z.string().optional(),
  markCompleted: z.boolean().optional().default(true),
  note: z.string().optional(),
  squarePaymentId: z.string().trim().max(200).optional().nullable(),
});

async function completeOrdersForSettlement(orderIds: string[]) {
  const completedOrderIds: string[] = [];
  for (const orderId of orderIds) {
    try {
      const before = await (prisma as any).pickupOrder.findUnique({
        where: { id: orderId },
        select: {
          id: true,
          status: true,
          customerId: true,
          pointsUsed: true,
          reward: true,
          confirmedAt: true,
          number: true,
          total: true,
        },
      });
      if (!before) continue;
      if (before.status === 'COMPLETED') {
        completedOrderIds.push(orderId);
        continue;
      }
      await (prisma as any).pickupOrder.update({
        where: { id: orderId },
        data: {
          status: 'COMPLETED',
          completedAt: new Date(),
          updatedAt: new Date(),
        },
      });
      await settleMemberPoints(before, 'COMPLETED');
      await settleMemberStamp(before, 'COMPLETED');
      completedOrderIds.push(orderId);
    } catch (err) {
      console.warn('Could not mark order COMPLETED via register settlement:', err);
    }
  }
  return completedOrderIds;
}

const createBillSchema = z.object({
  fulfillment: z.enum(['DINE_IN', 'PICKUP', 'DELIVERY']).default('PICKUP'),
  customerName: z.string().optional(),
  tableNumber: z.string().optional(),
  phone: z.string().optional(),
  note: z.string().optional(),
  storeId: z.string().min(1),
  storeName: z.string().optional(),
  storeAddress: z.string().optional(),
  storePhone: z.string().optional(),
  taxRate: z.number().int().optional(),
  items: z
    .array(
      z.object({
        itemId: z.string().optional(),
        id: z.string().optional(),
        nameJa: z.string().optional(),
        nameEn: z.string().optional(),
        price: z.number().int().optional(),
        unitPrice: z.number().int().optional(),
        quantity: z.number().int().positive().default(1),
      }),
    )
    .min(1),
});

router.post('/bill', requireKitchen, async (req, res) => {
  const input = createBillSchema.parse(req.body);
  const storeId = requireStoreId(input.storeId);
  const fulfillment = input.fulfillment;
  const tableNum = input.tableNumber?.trim();
  const customerName =
    input.customerName?.trim() ||
    (tableNum ? `テーブル ${tableNum}` : fulfillment === 'DINE_IN' ? '店内客' : '店頭客');
  const phone = input.phone?.trim() || '00-0000-0000';
  let note = input.note?.trim() || '';
  if (tableNum && !note.includes('[テーブル:')) {
    note = `[テーブル: ${tableNum}] ${note}`.trim();
  }
  if (input.storeName && !note.includes('【受取店舗:')) {
    note = `${note} 【受取店舗: ${input.storeName}】`.trim();
  }

  const taxRate = input.taxRate ?? (fulfillment === 'DINE_IN' ? 10 : 8);
  const menuIds = [
    ...new Set(input.items.map((it) => it.itemId || it.id).filter((id): id is string => Boolean(id))),
  ];
  const menuRows = menuIds.length
    ? await prisma.menuItem.findMany({
        where: { id: { in: menuIds } },
        select: { id: true, price: true, nameJa: true, nameEn: true },
      })
    : [];
  const menuById = new Map(menuRows.map((m) => [m.id, m]));

  let subtotal = 0;
  const processedItems = input.items.map((it, idx) => {
    const menuId = it.itemId || it.id;
    const menu = menuId ? menuById.get(menuId) : undefined;
    const nameJa = it.nameJa || menu?.nameJa || it.nameEn || menu?.nameEn || '商品';
    const nameEn = it.nameEn || menu?.nameEn || nameJa;
    const qty = it.quantity || 1;
    const unitPrice = menu ? Number(menu.price) || 0 : (it.price ?? it.unitPrice ?? 0);
    const lineTotal = unitPrice * qty;
    subtotal += lineTotal;
    const itemObj: Record<string, unknown> = {
      itemId: menuId || crypto.randomUUID(),
      nameJa,
      nameEn,
      unitPrice,
      quantity: qty,
      lineTotal,
    };
    if (idx === 0) {
      itemObj.store = {
        id: storeId,
        name: input.storeName || '',
        address: input.storeAddress || '',
        phone: input.storePhone || '',
      };
    }
    return itemObj;
  });

  const tax = Math.round((subtotal * taxRate) / 100);
  const grandTotal = subtotal + tax;
  const orderId = crypto.randomUUID();
  const now = new Date();
  const dateKey = tokyoTodayPrefix(now);
  const token = crypto.randomBytes(16).toString('base64url');

  const maxRow = await (prisma as any).$queryRaw<[{ maxNum: bigint | null }]>`
    SELECT MAX(number) as maxNum FROM PickupOrder WHERE dateKey = ${dateKey}
  `;
  const number = Number(maxRow[0]?.maxNum ?? 0) + 1;

  const order = await (prisma as any).pickupOrder.create({
    data: {
      id: orderId,
      number,
      dateKey,
      token,
      status: 'NEW',
      fulfillment,
      deliveryFee: 0,
      customerName,
      phone,
      note: note || null,
      pickupAt: now,
      items: processedItems,
      subtotal,
      total: grandTotal,
      taxRate,
      tax,
      grandTotal,
      pointsEarned: 0,
      stampAwarded: false,
    },
  });

  res.status(201).json({ success: true, order });
});

router.post('/transaction', requireKitchen, async (req, res) => {
  const input = transactionSchema.parse(req.body);
  const storeId = requireStoreId(input.storeId);
  const state = await loadMultiRegisterState();
  const branch = adoptOpenShiftIfNeeded(state, storeId);

  if (!branch.currentShift?.isOpen) {
    throw new AppError(409, 'NO_OPEN_SHIFT', 'この店舗のレジを開設してから会計してください。店舗を選んで「レジ開設」を押してください。');
  }

  const linkedIds = [
    ...new Set([...(input.orderIds || []), ...(input.orderId ? [input.orderId] : [])].filter(Boolean)),
  ];

  let completedOrderIds: string[] = [];
  if (input.markCompleted && linkedIds.length > 0) {
    completedOrderIds = await completeOrdersForSettlement(linkedIds);
  }

  const transaction: CashRegisterTransaction = {
    id: crypto.randomUUID(),
    timestamp: new Date().toISOString(),
    ...input,
    storeId,
    orderId: input.orderId || linkedIds[0] || null,
    orderIds: linkedIds.length > 0 ? linkedIds : undefined,
    completedOrderIds: completedOrderIds.length > 0 ? completedOrderIds : undefined,
    staffName: req.user?.name || 'Staff',
    staffId: req.user?.id,
  };

  branch.transactions.push(transaction);
  await saveMultiRegisterState(state);
  res.status(201).json({ success: true, transaction });
});

// ── POST /api/v1/cash-register/transaction/:id/void ──────────────────────────
router.post('/transaction/:id/void', requireKitchen, async (req, res) => {
  const id = String(req.params.id || '');
  const state = await loadMultiRegisterState();
  const found = findTransaction(state, id);
  if (!found) throw new AppError(404, 'TRANSACTION_NOT_FOUND', 'Transaction not found.');
  if (found.tx.isVoided) {
    res.json({ success: true, message: 'Transaction already voided.' });
    return;
  }

  found.tx.isVoided = true;

  const reopenIds = [
    ...new Set([
      ...(found.tx.completedOrderIds || []),
      ...(found.tx.orderIds || []),
      ...(found.tx.orderId ? [found.tx.orderId] : []),
    ]),
  ];
  for (const orderId of reopenIds) {
    try {
      const order = await (prisma as any).pickupOrder.findUnique({
        where: { id: orderId },
        select: { id: true, status: true },
      });
      if (order?.status === 'COMPLETED') {
        await (prisma as any).pickupOrder.update({
          where: { id: orderId },
          data: {
            status: 'READY',
            completedAt: null,
            updatedAt: new Date(),
          },
        });
      }
    } catch (err) {
      console.warn('Could not reopen order after void:', err);
    }
  }

  await saveMultiRegisterState(state);
  res.json({ success: true, message: 'Transaction voided.' });
});

// ── GET /api/v1/cash-register/shifts?storeId= ────────────────────────────────
router.get('/shifts', requireKitchen, async (req, res) => {
  const state = await loadMultiRegisterState();
  const storeId = storeIdFromQuery(req);
  res.setHeader('Cache-Control', 'no-store');

  if (storeId) {
    const branch = getBranchState(state, storeId);
    res.json({ storeId, shifts: [...branch.closedShifts].slice(-30).reverse() });
    return;
  }

  const shifts = Object.entries(state.byStore)
    .flatMap(([sid, branch]) =>
      (branch.closedShifts || []).map((s) => ({ ...s, storeId: s.storeId || sid })),
    )
    .sort((a, b) => String(b.closedAt || '').localeCompare(String(a.closedAt || '')))
    .slice(0, 60);

  res.json({ storeId: null, shifts });
});

// ── GET /api/v1/cash-register/sales?storeId= ─────────────────────────────────
// Sales record breakdown (today, by payment method) for one or all branches.
router.get('/sales', requireKitchen, async (req, res) => {
  const state = await loadMultiRegisterState();
  const storeId = storeIdFromQuery(req);
  const todayPrefix = tokyoTodayPrefix();
  res.setHeader('Cache-Control', 'no-store');

  const buildSales = (sid: string) => {
    const branch = getBranchState(state, sid);
    const stats = computeBranchStats(branch, todayPrefix);
    const txs = (branch.transactions || []).filter(
      (t) => !t.isVoided && t.timestamp && (t.timestamp.startsWith(todayPrefix) || t.timestamp.slice(0, 10) === todayPrefix),
    );
    return {
      storeId: sid,
      date: todayPrefix,
      shiftOpen: Boolean(branch.currentShift?.isOpen),
      shift: branch.currentShift,
      stats,
      transactions: txs,
    };
  };

  if (storeId) {
    res.json(buildSales(storeId));
    return;
  }

  const stores = Object.keys(state.byStore).map(buildSales);
  res.json({
    date: todayPrefix,
    stores,
    totals: {
      todaySales: stores.reduce((s, x) => s + x.stats.todaySales, 0),
      cashSales: stores.reduce((s, x) => s + x.stats.cashSales, 0),
      nonCashSales: stores.reduce((s, x) => s + x.stats.nonCashSales, 0),
      transactionCount: stores.reduce((s, x) => s + x.stats.transactionCount, 0),
    },
  });
});

export default router;
