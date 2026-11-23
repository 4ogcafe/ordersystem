/**
 * Per-branch cash register ledger stored in AppSecret (CASH_REGISTER_STATE).
 * v2 shape: { version: 2, byStore: { [storeId]: BranchState } }
 * Legacy flat blobs are migrated on read.
 */
import { prisma } from './prisma.js';

export const STATE_SECRET_ID = 'CASH_REGISTER_STATE';
export const DEFAULT_STORE_ID = 'musashisakai';

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
  storeId: string;
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
  storeId: string;
}

export interface CashRegisterTransaction {
  id: string;
  timestamp: string;
  orderId?: string | null;
  orderIds?: string[];
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
  paymentMethod:
    | 'CASH'
    | 'CARD'
    | 'BANK_TRANSFER'
    | 'PAYPAY'
    | 'RAKUTEN_PAY'
    | 'D_PAY'
    | 'AU_PAY'
    | 'MERPAY'
    | 'WECHAT_PAY'
    | 'IC'
    | 'ID_QUICPAY'
    | 'INVOICE';
  amountTendered: number;
  changeAmount: number;
  staffName?: string;
  staffId?: string;
  storeId: string;
  storeName?: string;
  note?: string;
  isVoided?: boolean;
  completedOrderIds?: string[];
  squarePaymentId?: string | null;
}

export interface BranchRegisterState {
  currentShift: CashRegisterShift | null;
  movements: CashMovement[];
  transactions: CashRegisterTransaction[];
  closedShifts: CashRegisterShift[];
}

export interface MultiStoreRegisterState {
  version: 2;
  byStore: Record<string, BranchRegisterState>;
}

export interface RegisterStats {
  todaySales: number;
  cashSales: number;
  nonCashSales: number;
  transactionCount: number;
  cashIn: number;
  cashOut: number;
  startingFloat: number;
  expectedDrawerCash: number;
  byPaymentMethod: Record<string, { count: number; total: number }>;
}

const emptyBranch = (): BranchRegisterState => ({
  currentShift: null,
  movements: [],
  transactions: [],
  closedShifts: [],
});

export function tokyoTodayPrefix(d = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Tokyo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(d);
}

export function normalizeStoreId(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const id = raw.trim();
  if (!id || id.toUpperCase() === 'ALL') return null;
  return id;
}

function migrateFlatToMulti(parsed: Record<string, unknown>): MultiStoreRegisterState {
  const byStore: Record<string, BranchRegisterState> = {};
  const ensure = (id: string) => {
    if (!byStore[id]) byStore[id] = emptyBranch();
    return byStore[id];
  };

  const flatShift = (parsed.currentShift as CashRegisterShift | null) ?? null;
  const flatMovements = Array.isArray(parsed.movements) ? (parsed.movements as CashMovement[]) : [];
  const flatTx = Array.isArray(parsed.transactions) ? (parsed.transactions as CashRegisterTransaction[]) : [];
  const flatClosed = Array.isArray(parsed.closedShifts) ? (parsed.closedShifts as CashRegisterShift[]) : [];

  const fallback =
    normalizeStoreId(flatShift?.storeId) ||
    normalizeStoreId(flatTx.find((t) => t.storeId)?.storeId) ||
    DEFAULT_STORE_ID;

  if (flatShift) {
    const sid = normalizeStoreId(flatShift.storeId) || fallback;
    const branch = ensure(sid);
    branch.currentShift = { ...flatShift, storeId: sid };
  }

  for (const tx of flatTx) {
    const sid = normalizeStoreId(tx.storeId) || fallback;
    ensure(sid).transactions.push({ ...tx, storeId: sid });
  }

  for (const m of flatMovements) {
    const sid = normalizeStoreId((m as CashMovement).storeId) || fallback;
    ensure(sid).movements.push({ ...m, storeId: sid });
  }

  for (const s of flatClosed) {
    const sid = normalizeStoreId(s.storeId) || fallback;
    ensure(sid).closedShifts.push({ ...s, storeId: sid });
  }

  if (Object.keys(byStore).length === 0) {
    byStore[DEFAULT_STORE_ID] = emptyBranch();
  }

  return { version: 2, byStore };
}

export function parseRegisterState(raw: string | null | undefined): MultiStoreRegisterState {
  if (!raw) return { version: 2, byStore: { [DEFAULT_STORE_ID]: emptyBranch() } };
  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    if (parsed && parsed.version === 2 && parsed.byStore && typeof parsed.byStore === 'object') {
      const byStore: Record<string, BranchRegisterState> = {};
      for (const [id, branch] of Object.entries(parsed.byStore as Record<string, BranchRegisterState>)) {
        byStore[id] = {
          currentShift: branch?.currentShift ?? null,
          movements: Array.isArray(branch?.movements) ? branch.movements : [],
          transactions: Array.isArray(branch?.transactions) ? branch.transactions : [],
          closedShifts: Array.isArray(branch?.closedShifts) ? branch.closedShifts : [],
        };
      }
      if (Object.keys(byStore).length === 0) byStore[DEFAULT_STORE_ID] = emptyBranch();
      return { version: 2, byStore };
    }
    return migrateFlatToMulti(parsed || {});
  } catch {
    return { version: 2, byStore: { [DEFAULT_STORE_ID]: emptyBranch() } };
  }
}

export async function loadMultiRegisterState(): Promise<MultiStoreRegisterState> {
  try {
    const record = await prisma.appSecret.findUnique({ where: { id: STATE_SECRET_ID } }).catch(() => null);
    return parseRegisterState(record?.publicKey);
  } catch {
    return { version: 2, byStore: { [DEFAULT_STORE_ID]: emptyBranch() } };
  }
}

export function getBranchState(state: MultiStoreRegisterState, storeId: string): BranchRegisterState {
  const id = normalizeStoreId(storeId) || DEFAULT_STORE_ID;
  if (!state.byStore[id]) state.byStore[id] = emptyBranch();
  return state.byStore[id];
}

/** Find any open shift across branches (legacy recovery / UI hints). */
export function findOpenShift(
  state: MultiStoreRegisterState,
): { storeId: string; shift: CashRegisterShift } | null {
  for (const [storeId, branch] of Object.entries(state.byStore)) {
    if (branch.currentShift?.isOpen) {
      return {
        storeId: normalizeStoreId(branch.currentShift.storeId) || storeId,
        shift: { ...branch.currentShift, storeId: normalizeStoreId(branch.currentShift.storeId) || storeId },
      };
    }
  }
  return null;
}

/**
 * Re-key an open shift onto `storeId` only when it already belongs to that store
 * (tagged storeId / bucket mismatch). Never steals another branch's open register.
 */
export function adoptOpenShiftIfNeeded(
  state: MultiStoreRegisterState,
  storeId: string,
): BranchRegisterState {
  const branch = getBranchState(state, storeId);
  if (branch.currentShift?.isOpen) {
    branch.currentShift = { ...branch.currentShift, storeId };
    return branch;
  }

  // Look for a shift that is tagged for this store but stored under the wrong key
  for (const [bucketId, other] of Object.entries(state.byStore)) {
    if (bucketId === storeId || !other.currentShift?.isOpen) continue;
    const tagged = normalizeStoreId(other.currentShift.storeId) || bucketId;
    if (tagged !== storeId) continue;
    branch.currentShift = { ...other.currentShift, storeId, isOpen: true };
    other.currentShift = null;
    break;
  }
  return branch;
}

export async function saveMultiRegisterState(state: MultiStoreRegisterState): Promise<void> {
  const byStore: Record<string, BranchRegisterState> = {};
  for (const [id, branch] of Object.entries(state.byStore)) {
    byStore[id] = {
      currentShift: branch.currentShift,
      movements: (branch.movements || []).slice(-100),
      transactions: (branch.transactions || []).slice(-300),
      closedShifts: (branch.closedShifts || []).slice(-50),
    };
  }
  const payload: MultiStoreRegisterState = { version: 2, byStore };
  const serialized = JSON.stringify(payload);
  await prisma.appSecret.upsert({
    where: { id: STATE_SECRET_ID },
    create: { id: STATE_SECRET_ID, publicKey: serialized, privateKey: '' },
    update: { publicKey: serialized },
  });
}

/** Find a transaction across all branches (for void). */
export function findTransaction(
  state: MultiStoreRegisterState,
  txId: string,
): { storeId: string; branch: BranchRegisterState; tx: CashRegisterTransaction } | null {
  for (const [storeId, branch] of Object.entries(state.byStore)) {
    const tx = branch.transactions.find((t) => t.id === txId);
    if (tx) return { storeId, branch, tx };
  }
  return null;
}

/** All non-voided transactions (for order paid-matching). Prefer orderId match. */
export function allTransactions(state: MultiStoreRegisterState): CashRegisterTransaction[] {
  const out: CashRegisterTransaction[] = [];
  for (const branch of Object.values(state.byStore)) {
    out.push(...(branch.transactions || []));
  }
  return out;
}

export function computeBranchStats(branch: BranchRegisterState, todayPrefix = tokyoTodayPrefix()): RegisterStats {
  const todayTransactions = (branch.transactions || []).filter(
    (t) => !t.isVoided && t.timestamp && (t.timestamp.startsWith(todayPrefix) || t.timestamp.slice(0, 10) === todayPrefix),
  );

  const byPaymentMethod: RegisterStats['byPaymentMethod'] = {};
  let cashSales = 0;
  let nonCashSales = 0;
  for (const t of todayTransactions) {
    const tot = t.total || 0;
    const method = t.paymentMethod || 'OTHER';
    if (!byPaymentMethod[method]) byPaymentMethod[method] = { count: 0, total: 0 };
    byPaymentMethod[method].count += 1;
    byPaymentMethod[method].total += tot;
    if (method === 'CASH') cashSales += tot;
    else nonCashSales += tot;
  }

  const todayMovements = (branch.movements || []).filter(
    (m) => m.timestamp && (m.timestamp.startsWith(todayPrefix) || m.timestamp.slice(0, 10) === todayPrefix),
  );
  const cashIn = todayMovements.filter((m) => m.type === 'IN').reduce((s, m) => s + m.amount, 0);
  const cashOut = todayMovements.filter((m) => m.type === 'OUT').reduce((s, m) => s + m.amount, 0);
  const startingFloat = branch.currentShift?.startingFloat || 0;

  return {
    todaySales: cashSales + nonCashSales,
    cashSales,
    nonCashSales,
    transactionCount: todayTransactions.length,
    cashIn,
    cashOut,
    startingFloat,
    expectedDrawerCash: startingFloat + cashSales + cashIn - cashOut,
    byPaymentMethod,
  };
}

export function branchPayload(storeId: string, branch: BranchRegisterState) {
  const todayPrefix = tokyoTodayPrefix();
  const stats = computeBranchStats(branch, todayPrefix);
  const todayTransactions = (branch.transactions || []).filter(
    (t) => !t.isVoided && t.timestamp && (t.timestamp.startsWith(todayPrefix) || t.timestamp.slice(0, 10) === todayPrefix),
  );
  return {
    storeId,
    shift: branch.currentShift,
    stats,
    todayTransactions,
    recentMovements: [...(branch.movements || [])].slice(-30).reverse(),
    closedShifts: [...(branch.closedShifts || [])].slice(-30).reverse(),
  };
}
