import crypto from 'node:crypto';
import express from 'express';
import { z } from 'zod';
import { AppError } from '../lib/errors.js';
import { prisma } from '../lib/prisma.js';
import { requireKitchen } from '../middleware/auth.js';

const router = express.Router();

const STATE_SECRET_ID = 'CASH_REGISTER_STATE';

export interface CashRegisterShift {
  id: string;
  isOpen: boolean;
  openedAt: string;
  openedBy: string;
  openedById?: string;
  startingFloat: number;
  closedAt?: string;
  closedBy?: string;
  closedById?: string;
  countedTotal?: number;
  expectedTotal?: number;
  variance?: number;
  denominations?: Record<string, number>;
  notes?: string;
  storeId?: string;
}

export interface CashMovement {
  id: string;
  timestamp: string;
  type: 'IN' | 'OUT';
  amount: number;
  reason: string;
  staffName?: string;
  staffId?: string;
  memo?: string;
}

export interface CashRegisterTransaction {
  id: string;
  timestamp: string;
  orderId?: string | null;
  orderNumber?: number | null;
  tableNumber?: string | null;
  type: 'ORDER_SETTLEMENT' | 'WALK_IN' | 'REFUND';
  fulfillment?: 'DINE_IN' | 'PICKUP' | 'DELIVERY';
  customerName?: string;
  itemsSummary: string;
  items?: Array<{ nameJa?: string | null; nameEn: string; quantity: number; unitPrice: number; lineTotal: number }>;
  subtotal: number;
  tax: number;
  taxRate: number;
  originalTotal?: number | null;
  discount?: number;
  discountReason?: string | null;
  total: number;
  paymentMethod: 'CASH' | 'CARD' | 'BANK_TRANSFER' | 'PAYPAY' | 'IC' | 'ID_QUICPAY' | 'INVOICE';
  amountTendered: number;
  changeAmount: number;
  staffName?: string;
  staffId?: string;
  storeId?: string;
  note?: string;
  isVoided?: boolean;
}

interface StoredRegisterState {
  currentShift: CashRegisterShift | null;
  movements: CashMovement[];
  transactions: CashRegisterTransaction[];
  closedShifts: CashRegisterShift[];
}

const DEFAULT_STATE: StoredRegisterState = {
  currentShift: null,
  movements: [],
  transactions: [],
  closedShifts: [],
};

async function loadRegisterState(): Promise<StoredRegisterState> {
  try {
    const record = await prisma.appSecret.findUnique({ where: { id: STATE_SECRET_ID } }).catch(() => null);
    if (!record?.publicKey) return { ...DEFAULT_STATE };
    const parsed = JSON.parse(record.publicKey);
    return {
      currentShift: parsed.currentShift ?? null,
      movements: Array.isArray(parsed.movements) ? parsed.movements : [],
      transactions: Array.isArray(parsed.transactions) ? parsed.transactions : [],
      closedShifts: Array.isArray(parsed.closedShifts) ? parsed.closedShifts : [],
    };
  } catch {
    return { ...DEFAULT_STATE };
  }
}

async function saveRegisterState(state: StoredRegisterState): Promise<void> {
  // Cap history to keep JSON payload performant
  const cappedTransactions = state.transactions.slice(-300);
  const cappedMovements = state.movements.slice(-100);
  const cappedClosedShifts = state.closedShifts.slice(-50);

  const payload: StoredRegisterState = {
    currentShift: state.currentShift,
    movements: cappedMovements,
    transactions: cappedTransactions,
    closedShifts: cappedClosedShifts,
  };

  const serialized = JSON.stringify(payload);
  await prisma.appSecret.upsert({
    where: { id: STATE_SECRET_ID },
    create: { id: STATE_SECRET_ID, publicKey: serialized, privateKey: '' },
    update: { publicKey: serialized },
  });
}

// ── GET /api/v1/cash-register ────────────────────────────────────────────────
router.get('/', requireKitchen, async (_req, res) => {
  const state = await loadRegisterState();

  // Calculate live stats
  const todayPrefix = new Date().toISOString().split('T')[0];
  const todayTransactions = state.transactions.filter(
    (t) => !t.isVoided && t.timestamp.startsWith(todayPrefix)
  );

  const cashSales = todayTransactions
    .filter((t) => t.paymentMethod === 'CASH')
    .reduce((sum, t) => sum + (t.total || 0), 0);

  const nonCashSales = todayTransactions
    .filter((t) => t.paymentMethod !== 'CASH')
    .reduce((sum, t) => sum + (t.total || 0), 0);

  const totalSales = cashSales + nonCashSales;

  const totalIn = state.movements
    .filter((m) => m.type === 'IN' && m.timestamp.startsWith(todayPrefix))
    .reduce((sum, m) => sum + m.amount, 0);

  const totalOut = state.movements
    .filter((m) => m.type === 'OUT' && m.timestamp.startsWith(todayPrefix))
    .reduce((sum, m) => sum + m.amount, 0);

  const startingFloat = state.currentShift?.startingFloat || 0;
  const expectedDrawerCash = startingFloat + cashSales + totalIn - totalOut;

  res.setHeader('Cache-Control', 'no-store');
  res.json({
    shift: state.currentShift,
    stats: {
      todaySales: totalSales,
      cashSales,
      nonCashSales,
      transactionCount: todayTransactions.length,
      cashIn: totalIn,
      cashOut: totalOut,
      startingFloat,
      expectedDrawerCash,
    },
    todayTransactions,
    recentMovements: state.movements.slice(-30).reverse(),
  });
});

// ── POST /api/v1/cash-register/shift/open ────────────────────────────────────
const openShiftSchema = z.object({
  startingFloat: z.number().int().min(0).max(10_000_000).default(30_000),
  storeId: z.string().optional(),
});

router.post('/shift/open', requireKitchen, async (req, res) => {
  const { startingFloat, storeId } = openShiftSchema.parse(req.body);
  const state = await loadRegisterState();

  if (state.currentShift?.isOpen) {
    throw new AppError(409, 'SHIFT_ALREADY_OPEN', 'A register shift is already currently open.');
  }

  const staffName = req.user?.name || 'Staff';
  const staffId = req.user?.id;

  const newShift: CashRegisterShift = {
    id: crypto.randomUUID(),
    isOpen: true,
    openedAt: new Date().toISOString(),
    openedBy: staffName,
    openedById: staffId,
    startingFloat,
    storeId,
  };

  state.currentShift = newShift;
  await saveRegisterState(state);

  res.status(201).json({ success: true, shift: newShift });
});

// ── POST /api/v1/cash-register/shift/close ───────────────────────────────────
const closeShiftSchema = z.object({
  countedTotal: z.number().int().min(0).max(50_000_000),
  denominations: z.record(z.string(), z.number()).optional(),
  notes: z.string().optional(),
});

router.post('/shift/close', requireKitchen, async (req, res) => {
  const { countedTotal, denominations, notes } = closeShiftSchema.parse(req.body);
  const state = await loadRegisterState();

  if (!state.currentShift || !state.currentShift.isOpen) {
    throw new AppError(409, 'NO_OPEN_SHIFT', 'No open register shift found to close.');
  }

  const staffName = req.user?.name || 'Staff';
  const staffId = req.user?.id;

  // Calculate theoretical expected cash during this shift
  const shiftStart = new Date(state.currentShift.openedAt).getTime();
  const shiftCashSales = state.transactions
    .filter((t) => !t.isVoided && t.paymentMethod === 'CASH' && new Date(t.timestamp).getTime() >= shiftStart)
    .reduce((sum, t) => sum + (t.total || 0), 0);

  const shiftIn = state.movements
    .filter((m) => m.type === 'IN' && new Date(m.timestamp).getTime() >= shiftStart)
    .reduce((sum, m) => sum + m.amount, 0);

  const shiftOut = state.movements
    .filter((m) => m.type === 'OUT' && new Date(m.timestamp).getTime() >= shiftStart)
    .reduce((sum, m) => sum + m.amount, 0);

  const expectedTotal = state.currentShift.startingFloat + shiftCashSales + shiftIn - shiftOut;
  const variance = countedTotal - expectedTotal;

  const closedShift: CashRegisterShift = {
    ...state.currentShift,
    isOpen: false,
    closedAt: new Date().toISOString(),
    closedBy: staffName,
    closedById: staffId,
    countedTotal,
    expectedTotal,
    variance,
    denominations,
    notes,
  };

  state.closedShifts.push(closedShift);
  state.currentShift = null;
  await saveRegisterState(state);

  res.json({ success: true, shift: closedShift });
});

// ── POST /api/v1/cash-register/movement ──────────────────────────────────────
const movementSchema = z.object({
  type: z.enum(['IN', 'OUT']),
  amount: z.number().int().positive().max(10_000_000),
  reason: z.string().trim().min(1).max(200),
  memo: z.string().trim().max(500).optional(),
});

router.post('/movement', requireKitchen, async (req, res) => {
  const input = movementSchema.parse(req.body);
  const state = await loadRegisterState();

  const movement: CashMovement = {
    id: crypto.randomUUID(),
    timestamp: new Date().toISOString(),
    type: input.type,
    amount: input.amount,
    reason: input.reason,
    memo: input.memo,
    staffName: req.user?.name || 'Staff',
    staffId: req.user?.id,
  };

  state.movements.push(movement);
  await saveRegisterState(state);

  res.status(201).json({ success: true, movement });
});

// ── POST /api/v1/cash-register/transaction ───────────────────────────────────
const transactionSchema = z.object({
  orderId: z.string().optional().nullable(),
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
      })
    )
    .optional(),
  subtotal: z.number().int().nonnegative(),
  tax: z.number().int().nonnegative(),
  taxRate: z.number().int().nonnegative().default(10),
  originalTotal: z.number().int().nonnegative().optional().nullable(),
  discount: z.number().int().nonnegative().default(0),
  discountReason: z.string().optional().nullable(),
  total: z.number().int().nonnegative(),
  paymentMethod: z.enum(['CASH', 'CARD', 'BANK_TRANSFER', 'PAYPAY', 'IC', 'ID_QUICPAY', 'INVOICE']),
  amountTendered: z.number().int().nonnegative(),
  changeAmount: z.number().int().nonnegative(),
  storeId: z.string().optional(),
  storeName: z.string().optional(),
  markCompleted: z.boolean().optional().default(true),
  note: z.string().optional(),
});

const createBillSchema = z.object({
  fulfillment: z.enum(['DINE_IN', 'PICKUP', 'DELIVERY']).default('PICKUP'),
  customerName: z.string().optional(),
  tableNumber: z.string().optional(),
  phone: z.string().optional(),
  note: z.string().optional(),
  storeId: z.string().optional(),
  storeName: z.string().optional(),
  storeAddress: z.string().optional(),
  storePhone: z.string().optional(),
  taxRate: z.number().int().optional(),
  items: z.array(z.object({
    itemId: z.string().optional(),
    id: z.string().optional(),
    nameJa: z.string().optional(),
    nameEn: z.string().optional(),
    price: z.number().int().optional(),
    unitPrice: z.number().int().optional(),
    quantity: z.number().int().positive().default(1),
  })).min(1),
});

router.post('/bill', requireKitchen, async (req, res) => {
  const input = createBillSchema.parse(req.body);
  const fulfillment = input.fulfillment;
  const tableNum = input.tableNumber?.trim();
  const customerName = input.customerName?.trim() || (tableNum ? `テーブル ${tableNum}` : (fulfillment === 'DINE_IN' ? '店内客' : '店頭客'));
  const phone = input.phone?.trim() || '00-0000-0000';
  let note = input.note?.trim() || '';
  if (tableNum && !note.includes('[テーブル:')) {
    note = `[テーブル: ${tableNum}] ${note}`.trim();
  }
  if (input.storeName && !note.includes('【受取店舗:')) {
    note = `${note} 【受取店舗: ${input.storeName}】`.trim();
  }

  const taxRate = input.taxRate ?? (fulfillment === 'DINE_IN' ? 10 : 8);
  let subtotal = 0;
  const processedItems = input.items.map((it, idx) => {
    const nameJa = it.nameJa || it.nameEn || '商品';
    const nameEn = it.nameEn || nameJa;
    const qty = it.quantity || 1;
    const unitPrice = it.price ?? it.unitPrice ?? 0;
    const lineTotal = unitPrice * qty;
    subtotal += lineTotal;
    const itemObj: any = {
      itemId: it.itemId || it.id || crypto.randomUUID(),
      nameJa,
      nameEn,
      unitPrice,
      quantity: qty,
      lineTotal,
    };
    if (idx === 0 && (input.storeId || input.storeName)) {
      itemObj.store = {
        id: input.storeId,
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
  const dateKey = now.toISOString().slice(0, 10);
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
  const state = await loadRegisterState();

  const transaction: CashRegisterTransaction = {
    id: crypto.randomUUID(),
    timestamp: new Date().toISOString(),
    ...input,
    staffName: req.user?.name || 'Staff',
    staffId: req.user?.id,
  };

  state.transactions.push(transaction);

  // If this was linked to an active PickupOrder, mark that order as COMPLETED if requested
  if (input.orderId && input.markCompleted) {
    try {
      await (prisma as any).pickupOrder.update({
        where: { id: input.orderId },
        data: {
          status: 'COMPLETED',
          completedAt: new Date(),
          updatedAt: new Date(),
        },
      });
    } catch (err) {
      console.warn('Could not mark order COMPLETED via register settlement:', err);
    }
  }

  await saveRegisterState(state);

  res.status(201).json({ success: true, transaction });
});

// ── POST /api/v1/cash-register/transaction/:id/void ──────────────────────────
router.post('/transaction/:id/void', requireKitchen, async (req, res) => {
  const { id } = req.params;
  const state = await loadRegisterState();

  const tx = state.transactions.find((t) => t.id === id);
  if (!tx) throw new AppError(404, 'TRANSACTION_NOT_FOUND', 'Transaction not found.');

  tx.isVoided = true;
  await saveRegisterState(state);

  res.json({ success: true, message: 'Transaction voided.' });
});

// ── GET /api/v1/cash-register/shifts ─────────────────────────────────────────
router.get('/shifts', requireKitchen, async (_req, res) => {
  const state = await loadRegisterState();
  res.setHeader('Cache-Control', 'no-store');
  res.json({ shifts: state.closedShifts.slice(-30).reverse() });
});

export default router;
