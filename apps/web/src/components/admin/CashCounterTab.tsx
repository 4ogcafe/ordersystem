import { useState, useEffect, useMemo, type CSSProperties } from 'react';
import { toast } from 'react-hot-toast';
import {
  Banknote,
  Coins,
  Calculator,
  Receipt,
  CreditCard,
  QrCode,
  Smartphone,
  ArrowUpDown,
  Plus,
  Trash2,
  History,
  FileSpreadsheet,
  CheckCircle2,
  Printer,
  Store,
  Search,
  RefreshCw,
  UtensilsCrossed,
  ShoppingBag,
  ShieldCheck,
  ExternalLink,
  X,
  FileText
} from 'lucide-react';
import { apiFetch, errorMessage } from '../../lib/api';
import { yen, formatOrderNumber } from '../../lib/format';
import { DEFAULT_STORE_LOCATIONS, type StoreLocation } from '../../lib/stores';
import { printCustomerReceipt, printHtml, DEFAULT_STORE_SETTINGS, type ReceiptOrder } from '../../lib/receipt';

// ── Types ───────────────────────────────────────────────────────────────────

export type PaymentMethod = 'CASH' | 'CARD' | 'PAYPAY' | 'IC' | 'ID_QUICPAY' | 'INVOICE';

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
  discount?: number;
  total: number;
  paymentMethod: PaymentMethod;
  amountTendered: number;
  changeAmount: number;
  staffName?: string;
  staffId?: string;
  storeId?: string;
  note?: string;
  isVoided?: boolean;
}

interface ActiveOrder {
  id: string;
  number: number;
  status: string;
  customerName: string;
  phone: string;
  note: string | null;
  pickupAt: string;
  createdAt: string;
  fulfillment?: 'DINE_IN' | 'PICKUP' | 'DELIVERY';
  items: Array<{
    nameEn: string;
    nameJa?: string | null;
    quantity: number;
    unitPrice?: number;
    lineTotal: number;
    options?: any[];
  }>;
  subtotal?: number;
  taxRate?: number;
  tax?: number;
  deliveryFee?: number;
  pointsDiscount?: number;
  pointsUsed?: number;
  total: number;
  grandTotal?: number;
  store?: any;
}

interface QuickSaleItem {
  id: string;
  nameJa: string;
  nameEn: string;
  price: number;
  categoryJa: string;
  taxRate: number; // 8 for takeout, 10 for dine-in
}

const JAPAN_DENOMINATIONS = [
  { yen: 10000, label: '10,000円札 (一万円)', type: 'bill' },
  { yen: 5000, label: '5,000円札 (五千円)', type: 'bill' },
  { yen: 2000, label: '2,000円札 (二千円)', type: 'bill' },
  { yen: 1000, label: '1,000円札 (千円)', type: 'bill' },
  { yen: 500, label: '500円玉 (五百円)', type: 'coin' },
  { yen: 100, label: '100円玉 (百円)', type: 'coin' },
  { yen: 50, label: '50円玉 (五十円)', type: 'coin' },
  { yen: 10, label: '10円玉 (十円)', type: 'coin' },
  { yen: 5, label: '5円玉 (五円)', type: 'coin' },
  { yen: 1, label: '1円玉 (一円)', type: 'coin' },
];

const PAYMENT_METHODS: Array<{ id: PaymentMethod; label: string; icon: any; color: string; bg: string }> = [
  { id: 'CASH', label: '現金 (Cash)', icon: Banknote, color: '#15803d', bg: '#f0fdf4' },
  { id: 'CARD', label: 'クレジットカード', icon: CreditCard, color: '#1d4ed8', bg: '#eff6ff' },
  { id: 'PAYPAY', label: 'PayPay / QRコード', icon: QrCode, color: '#dc2626', bg: '#fef2f2' },
  { id: 'IC', label: '交通系IC (Suica等)', icon: Smartphone, color: '#0284c7', bg: '#f0f9ff' },
  { id: 'ID_QUICPAY', label: 'iD / QUICPay', icon: Smartphone, color: '#7c3aed', bg: '#faf5ff' },
  { id: 'INVOICE', label: '売掛・請求書払い', icon: FileText, color: '#475569', bg: '#f8fafc' },
];

const PRESET_QUICK_ITEMS: QuickSaleItem[] = [
  { id: 'quick-curry-bento', nameJa: '日替わりカレー弁当', nameEn: 'Daily Curry Bento', price: 850, categoryJa: '弁当・セット', taxRate: 8 },
  { id: 'quick-chicken-bento', nameJa: 'チキンカレー弁当', nameEn: 'Chicken Curry Bento', price: 950, categoryJa: '弁当・セット', taxRate: 8 },
  { id: 'quick-mutton-bento', nameJa: 'マトンカレー弁当', nameEn: 'Mutton Curry Bento', price: 1050, categoryJa: '弁当・セット', taxRate: 8 },
  { id: 'quick-butter-chicken', nameJa: 'バターチキンカレー単品', nameEn: 'Butter Chicken Curry', price: 980, categoryJa: 'カレー', taxRate: 8 },
  { id: 'quick-cheese-naan', nameJa: 'チーズナン', nameEn: 'Cheese Naan', price: 580, categoryJa: 'ナン・ライス', taxRate: 8 },
  { id: 'quick-plain-naan', nameJa: 'プレーンナン', nameEn: 'Plain Naan', price: 350, categoryJa: 'ナン・ライス', taxRate: 8 },
  { id: 'quick-samosa', nameJa: 'サモサ (2個)', nameEn: 'Samosa (2pcs)', price: 480, categoryJa: 'サイド', taxRate: 8 },
  { id: 'quick-tandoori', nameJa: 'タンドリーチキン (2個)', nameEn: 'Tandoori Chicken (2pcs)', price: 600, categoryJa: 'サイド', taxRate: 8 },
  { id: 'quick-mango-lassi', nameJa: 'マンゴーラッシー', nameEn: 'Mango Lassi', price: 380, categoryJa: 'ドリンク', taxRate: 8 },
  { id: 'quick-chai', nameJa: 'マサラチャイ (Hot/Ice)', nameEn: 'Masala Chai', price: 300, categoryJa: 'ドリンク', taxRate: 8 },
  { id: 'quick-lunch-buffet', nameJa: 'ランチビュッフェ・店内食べ放題', nameEn: 'Lunch Buffet Dine-in', price: 1200, categoryJa: '店内飲食', taxRate: 10 },
  { id: 'quick-dinner-set', nameJa: 'ディナーアダルサスペシャルセット', nameEn: 'Adarsha Special Set', price: 1850, categoryJa: '店内飲食', taxRate: 10 },
];

function playCashChime() {
  try {
    const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
    const osc1 = ctx.createOscillator();
    const osc2 = ctx.createOscillator();
    const gain = ctx.createGain();

    osc1.type = 'sine';
    osc1.frequency.setValueAtTime(987.77, ctx.currentTime);
    osc1.frequency.exponentialRampToValueAtTime(1318.51, ctx.currentTime + 0.08);

    osc2.type = 'triangle';
    osc2.frequency.setValueAtTime(1318.51, ctx.currentTime + 0.08);
    osc2.frequency.setValueAtTime(1760, ctx.currentTime + 0.16);

    gain.gain.setValueAtTime(0.15, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.45);

    osc1.connect(gain);
    osc2.connect(gain);
    gain.connect(ctx.destination);

    osc1.start(ctx.currentTime);
    osc2.start(ctx.currentTime + 0.08);
    osc1.stop(ctx.currentTime + 0.45);
    osc2.stop(ctx.currentTime + 0.45);
  } catch {}
}

export function extractTableNumber(note?: string | null): string | null {
  if (!note) return null;
  const match = note.match(/\[テーブル[:\s]*([^\]]+)\]/);
  return match ? match[1].trim() : null;
}

export function calculateOptimalChange(change: number): string {
  if (change <= 0) return 'お釣りなし';
  let remaining = change;
  const counts: Record<number, number> = {};
  const denoms = [10000, 5000, 2000, 1000, 500, 100, 50, 10, 5, 1];

  for (const d of denoms) {
    if (remaining >= d) {
      const c = Math.floor(remaining / d);
      counts[d] = c;
      remaining %= d;
    }
  }

  const parts = Object.entries(counts)
    .sort((a, b) => Number(b[0]) - Number(a[0]))
    .map(([yenVal, count]) => {
      const num = Number(yenVal);
      const name = num >= 1000 ? `${(num / 1000).toLocaleString()}千円札` : `${num}円玉`;
      return `${name}×${count}`;
    });

  return parts.join(', ');
}

export default function CashCounterTab({ user }: { user?: any }) {
  const [activeSubTab, setActiveSubTab] = useState<'checkout' | 'walkin' | 'drawer' | 'history'>('checkout');
  const [stores, setStores] = useState<StoreLocation[]>(DEFAULT_STORE_LOCATIONS);
  const [selectedStoreId, setSelectedStoreId] = useState<string>('ALL');

  // Register State
  const [shift, setShift] = useState<CashRegisterShift | null>(null);
  const [movements, setMovements] = useState<CashMovement[]>([]);
  const [transactions, setTransactions] = useState<CashRegisterTransaction[]>([]);
  const [stats, setStats] = useState({
    todaySales: 0,
    cashSales: 0,
    nonCashSales: 0,
    transactionCount: 0,
    cashIn: 0,
    cashOut: 0,
    startingFloat: 30000,
    expectedDrawerCash: 30000,
  });

  // Active Unsettled Orders
  const [orders, setOrders] = useState<ActiveOrder[]>([]);
  const [selectedOrder, setSelectedOrder] = useState<ActiveOrder | null>(null);
  const [orderFilter, setOrderFilter] = useState<'ALL' | 'DINE_IN' | 'PICKUP' | 'DELIVERY'>('ALL');
  const [orderSearch, setOrderSearch] = useState('');
  const [loadingOrders, setLoadingOrders] = useState(false);

  // Settlement Form State
  const [settlementMethod, setSettlementMethod] = useState<PaymentMethod>('CASH');
  const [amountTenderedStr, setAmountTenderedStr] = useState<string>('');
  const [settlementNote, setSettlementNote] = useState<string>('');
  const [settling, setSettling] = useState(false);

  // Walk-in Quick Sale State
  const [walkinCart, setWalkinCart] = useState<Array<{ item: QuickSaleItem; quantity: number }>>([]);
  const [customItemName, setCustomItemName] = useState('');
  const [customItemPrice, setCustomItemPrice] = useState('');
  const [customTaxRate, setCustomTaxRate] = useState<number>(8);
  const [walkinPaymentMethod, setWalkinPaymentMethod] = useState<PaymentMethod>('CASH');
  const [walkinTenderedStr, setWalkinTenderedStr] = useState<string>('');

  // Cash Count (Denominations) State
  const [denominationsCount, setDenominationsCount] = useState<Record<number, number>>({
    10000: 0,
    5000: 0,
    2000: 0,
    1000: 0,
    500: 0,
    100: 0,
    50: 0,
    10: 0,
    5: 0,
    1: 0,
  });
  const [closeShiftNotes, setCloseShiftNotes] = useState('');

  // Modals
  const [openShiftModal, setOpenShiftModal] = useState(false);
  const [startingFloatInput, setStartingFloatInput] = useState<string>('30000');
  const [movementModal, setMovementModal] = useState(false);
  const [movementType, setMovementType] = useState<'IN' | 'OUT'>('OUT');
  const [movementAmount, setMovementAmount] = useState<string>('');
  const [movementReason, setMovementReason] = useState<string>('食材買い出し');
  const [movementMemo, setMovementMemo] = useState<string>('');

  // History search/filter
  const [historyFilter, setHistoryFilter] = useState<string>('ALL');
  const [historySearch, setHistorySearch] = useState<string>('');

  // ── Load Register Data & Orders ───────────────────────────────────────────

  const loadRegisterData = async () => {
    try {
      const res = await apiFetch('/api/v1/cash-register');
      if (res.ok) {
        const data = await res.json();
        setShift(data.shift || null);
        if (data.stats) setStats(data.stats);
        if (Array.isArray(data.todayTransactions)) setTransactions(data.todayTransactions);
        if (Array.isArray(data.recentMovements)) setMovements(data.recentMovements);
      }
    } catch (err) {
      console.warn('Could not load cash register server data:', err);
    }
  };

  const loadActiveOrders = async () => {
    setLoadingOrders(true);
    try {
      const res = await apiFetch('/api/v1/orders?scope=active');
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data)) {
          setOrders(data);
          // If current selected order is now completed, reset
          if (selectedOrder && !data.some((o: ActiveOrder) => o.id === selectedOrder.id)) {
            setSelectedOrder(null);
            setAmountTenderedStr('');
          }
        }
      }
    } catch (err) {
      console.warn('Could not load active orders:', err);
    } finally {
      setLoadingOrders(false);
    }
  };

  useEffect(() => {
    Promise.all([
      apiFetch('/api/v1/stores').then(r => r.ok ? r.json() : []).catch(() => DEFAULT_STORE_LOCATIONS),
      loadRegisterData(),
      loadActiveOrders(),
    ]).then(([storeList]) => {
      if (Array.isArray(storeList) && storeList.length > 0) setStores(storeList);
    });

    const interval = setInterval(() => {
      loadActiveOrders();
    }, 15000);
    return () => clearInterval(interval);
  }, []);

  // Amount tendered starts blank for manual entry
  useEffect(() => {
    if (selectedOrder) {
      setAmountTenderedStr('');
    }
  }, [selectedOrder]);

  // ── Handlers: Shift Open / Close & Movement ───────────────────────────────

  const handleOpenShift = async () => {
    const floatVal = parseInt(startingFloatInput, 10);
    if (isNaN(floatVal) || floatVal < 0) {
      toast.error('有効な準備金を入力してください。');
      return;
    }
    try {
      const res = await apiFetch('/api/v1/cash-register/shift/open', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ startingFloat: floatVal, storeId: selectedStoreId }),
      });
      if (!res.ok) throw new Error(await errorMessage(res, 'レジ開設に失敗しました'));
      const data = await res.json();
      setShift(data.shift);
      setOpenShiftModal(false);
      toast.success(`レジを開設しました（釣銭準備金: ${yen(floatVal)}）`);
      loadRegisterData();
    } catch (err: any) {
      toast.error(err.message || 'エラーが発生しました');
    }
  };

  const handleRecordMovement = async () => {
    const amt = parseInt(movementAmount, 10);
    if (isNaN(amt) || amt <= 0) {
      toast.error('有効な金額を入力してください。');
      return;
    }
    try {
      const res = await apiFetch('/api/v1/cash-register/movement', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: movementType,
          amount: amt,
          reason: movementReason,
          memo: movementMemo,
        }),
      });
      if (!res.ok) throw new Error(await errorMessage(res, '入出金の登録に失敗しました'));
      setMovementModal(false);
      setMovementAmount('');
      setMovementMemo('');
      toast.success(`${movementType === 'IN' ? '入金' : '出金'} ${yen(amt)} を登録しました`);
      loadRegisterData();
    } catch (err: any) {
      toast.error(err.message || 'エラーが発生しました');
    }
  };

  // Denomination Cash Count Total
  const actualCountedCash = useMemo(() => {
    return JAPAN_DENOMINATIONS.reduce((sum, { yen: val }) => {
      const count = denominationsCount[val] || 0;
      return sum + val * count;
    }, 0);
  }, [denominationsCount]);

  const cashVariance = actualCountedCash - stats.expectedDrawerCash;

  const handleCloseShift = async () => {
    try {
      const res = await apiFetch('/api/v1/cash-register/shift/close', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          countedTotal: actualCountedCash,
          denominations: denominationsCount,
          notes: closeShiftNotes,
        }),
      });
      if (!res.ok) throw new Error(await errorMessage(res, 'レジ締めに失敗しました'));
      const data = await res.json();
      toast.success('本日のレジ締めが完了しました！');
      printClosingZReport(data.shift);
      loadRegisterData();
    } catch (err: any) {
      toast.error(err.message || 'エラーが発生しました');
    }
  };

  // ── Settle Order ──────────────────────────────────────────────────────────

  const handleSettleOrder = async () => {
    if (!selectedOrder) return;
    const orderTotal = selectedOrder.grandTotal ?? selectedOrder.total;
    const tendered = parseInt(amountTenderedStr, 10) || orderTotal;

    if (settlementMethod === 'CASH' && tendered < orderTotal) {
      toast.error(`お預かり金額が不足しています（不足: ${yen(orderTotal - tendered)}）`);
      return;
    }

    const change = settlementMethod === 'CASH' ? Math.max(0, tendered - orderTotal) : 0;
    const tableNum = extractTableNumber(selectedOrder.note);

    setSettling(true);
    try {
      const itemsSummary = selectedOrder.items.map(i => `${i.nameJa || i.nameEn} × ${i.quantity}`).join(', ');

      const res = await apiFetch('/api/v1/cash-register/transaction', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          orderId: selectedOrder.id,
          orderIds: (selectedOrder as any).orderIds || [selectedOrder.id],
          orderNumber: selectedOrder.number,
          tableNumber: tableNum || (selectedOrder as any).tableNumber,
          type: 'ORDER_SETTLEMENT',
          fulfillment: selectedOrder.fulfillment || 'PICKUP',
          customerName: selectedOrder.customerName,
          itemsSummary,
          items: selectedOrder.items.map(i => ({
            nameJa: i.nameJa,
            nameEn: i.nameEn,
            quantity: i.quantity,
            unitPrice: i.unitPrice ?? Math.round(i.lineTotal / i.quantity),
            lineTotal: i.lineTotal,
          })),
          subtotal: selectedOrder.subtotal || Math.round(orderTotal / 1.1),
          tax: selectedOrder.tax || Math.round(orderTotal - orderTotal / 1.1),
          taxRate: selectedOrder.taxRate || (selectedOrder.fulfillment === 'DINE_IN' ? 10 : 8),
          discount: selectedOrder.pointsDiscount || 0,
          total: orderTotal,
          paymentMethod: settlementMethod,
          amountTendered: tendered,
          changeAmount: change,
          storeId: selectedStoreId,
          note: settlementNote,
        }),
      });

      if (!res.ok) throw new Error(await errorMessage(res, '会計処理に失敗しました'));

      playCashChime();

      if (settlementMethod === 'CASH') {
        toast.success(`🎉 会計完了！ お釣り: ${yen(change)} (${calculateOptimalChange(change)})`, { duration: 6000 });
      } else {
        toast.success(`🎉 ${PAYMENT_METHODS.find(m => m.id === settlementMethod)?.label} でのお会計完了！`);
      }

      // Automatically offer receipt printing
      handlePrintReceiptForOrder(selectedOrder, tendered, change, settlementMethod);

      setSelectedOrder(null);
      setAmountTenderedStr('');
      setSettlementNote('');
      loadRegisterData();
      loadActiveOrders();
    } catch (err: any) {
      toast.error(err.message || 'エラーが発生しました');
    } finally {
      setSettling(false);
    }
  };

  // ── Walk-in Quick Checkout ────────────────────────────────────────────────

  const walkinSubtotal = useMemo(() => {
    return walkinCart.reduce((sum, line) => sum + line.item.price * line.quantity, 0);
  }, [walkinCart]);

  const walkinTaxRate = useMemo(() => {
    return walkinCart.some(line => line.item.taxRate === 10) ? 10 : 8;
  }, [walkinCart]);

  const walkinTax = Math.round((walkinSubtotal * walkinTaxRate) / 100);
  const walkinGrandTotal = walkinSubtotal + walkinTax;

  useEffect(() => {
    setWalkinTenderedStr(String(walkinGrandTotal));
  }, [walkinGrandTotal]);

  const handleAddWalkinItem = (item: QuickSaleItem) => {
    setWalkinCart(prev => {
      const idx = prev.findIndex(p => p.item.id === item.id);
      if (idx >= 0) {
        const next = [...prev];
        next[idx] = { ...next[idx], quantity: next[idx].quantity + 1 };
        return next;
      }
      return [...prev, { item, quantity: 1 }];
    });
  };

  const handleAddCustomWalkinItem = () => {
    const price = parseInt(customItemPrice, 10);
    if (!customItemName.trim() || isNaN(price) || price <= 0) {
      toast.error('商品名と有効な金額を入力してください。');
      return;
    }
    const item: QuickSaleItem = {
      id: `custom-${Date.now()}`,
      nameJa: customItemName.trim(),
      nameEn: customItemName.trim(),
      price,
      categoryJa: 'その他・手入力',
      taxRate: customTaxRate,
    };
    handleAddWalkinItem(item);
    setCustomItemName('');
    setCustomItemPrice('');
  };

  const handleSettleWalkin = async () => {
    if (walkinCart.length === 0) {
      toast.error('カートに商品を追加してください。');
      return;
    }
    const tendered = parseInt(walkinTenderedStr, 10) || walkinGrandTotal;
    if (walkinPaymentMethod === 'CASH' && tendered < walkinGrandTotal) {
      toast.error(`お預かり金額が不足しています（不足: ${yen(walkinGrandTotal - tendered)}）`);
      return;
    }
    const change = walkinPaymentMethod === 'CASH' ? Math.max(0, tendered - walkinGrandTotal) : 0;

    setSettling(true);
    try {
      const itemsSummary = walkinCart.map(l => `${l.item.nameJa} × ${l.quantity}`).join(', ');

      const res = await apiFetch('/api/v1/cash-register/transaction', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          orderNumber: Math.floor(100 + Math.random() * 900),
          type: 'WALK_IN',
          fulfillment: walkinTaxRate === 10 ? 'DINE_IN' : 'PICKUP',
          customerName: '店頭レジ客 (Walk-in)',
          itemsSummary,
          items: walkinCart.map(l => ({
            nameJa: l.item.nameJa,
            nameEn: l.item.nameEn,
            quantity: l.quantity,
            unitPrice: l.item.price,
            lineTotal: l.item.price * l.quantity,
          })),
          subtotal: walkinSubtotal,
          tax: walkinTax,
          taxRate: walkinTaxRate,
          total: walkinGrandTotal,
          paymentMethod: walkinPaymentMethod,
          amountTendered: tendered,
          changeAmount: change,
          storeId: selectedStoreId,
          note: '店頭クイック会計',
        }),
      });

      if (!res.ok) throw new Error(await errorMessage(res, 'クイック会計に失敗しました'));

      playCashChime();
      toast.success(`🎉 クイック会計完了！ お釣り: ${yen(change)}`, { duration: 6000 });

      // Print receipt
      printWalkinReceipt(walkinCart, walkinSubtotal, walkinTax, walkinGrandTotal, tendered, change, walkinPaymentMethod);

      setWalkinCart([]);
      loadRegisterData();
    } catch (err: any) {
      toast.error(err.message || 'エラーが発生しました');
    } finally {
      setSettling(false);
    }
  };

  // ── Print Receipts & Z-Reports ────────────────────────────────────────────

  const handlePrintReceiptForOrder = (order: ActiveOrder, tendered: number, change: number, method: PaymentMethod) => {
    const tableNum = extractTableNumber(order.note);
    const receiptOrder: ReceiptOrder = {
      id: order.id,
      number: order.number,
      customerName: order.customerName,
      phone: order.phone,
      note: [tableNum ? `[テーブル: ${tableNum}]` : null, `決済方法: ${PAYMENT_METHODS.find(m => m.id === method)?.label}`, `お預かり: ${yen(tendered)}`, `お釣り: ${yen(change)}`].filter(Boolean).join(' '),
      pickupAt: order.pickupAt,
      fulfillment: order.fulfillment || 'PICKUP',
      items: order.items.map(i => ({
        nameJa: i.nameJa,
        nameEn: i.nameEn,
        quantity: i.quantity,
        unitPrice: i.unitPrice ?? Math.round(i.lineTotal / i.quantity),
        lineTotal: i.lineTotal,
      })),
      subtotal: order.subtotal,
      tax: order.tax,
      taxRate: order.taxRate || (order.fulfillment === 'DINE_IN' ? 10 : 8),
      pointsUsed: order.pointsUsed,
      pointsDiscount: order.pointsDiscount,
      total: order.total,
      grandTotal: order.grandTotal ?? order.total,
      store: order.store,
    };
    printCustomerReceipt(receiptOrder);
  };

  const printWalkinReceipt = (
    cart: Array<{ item: QuickSaleItem; quantity: number }>,
    subtotal: number,
    tax: number,
    total: number,
    tendered: number,
    change: number,
    method: PaymentMethod
  ) => {
    const receiptOrder: ReceiptOrder = {
      number: Math.floor(100 + Math.random() * 900),
      customerName: '店頭即時販売 (Walk-in)',
      pickupAt: new Date().toISOString(),
      fulfillment: 'PICKUP',
      note: `決済方法: ${PAYMENT_METHODS.find(m => m.id === method)?.label} | お預かり: ${yen(tendered)} | お釣り: ${yen(change)}`,
      items: cart.map(l => ({
        nameJa: l.item.nameJa,
        nameEn: l.item.nameEn,
        quantity: l.quantity,
        unitPrice: l.item.price,
        lineTotal: l.item.price * l.quantity,
      })),
      subtotal,
      tax,
      taxRate: 8,
      total,
      grandTotal: total,
    };
    printCustomerReceipt(receiptOrder);
  };

  const printClosingZReport = (closedShiftData: CashRegisterShift) => {
    const branch = stores.find(s => s.id === selectedStoreId) || stores[0];
    const storeName = branch?.name || DEFAULT_STORE_SETTINGS.storeNameJa;
    const now = new Date().toLocaleString('ja-JP', { timeZone: 'Asia/Tokyo' });

    const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>日計レジ締め精算表 (Z-Report)</title>
  <style>
    body { font-family: monospace, sans-serif; width: 300px; margin: 0 auto; padding: 12px; font-size: 13px; line-height: 1.4; color: #000; }
    .center { text-align: center; }
    .bold { font-weight: bold; }
    .divider { border-top: 1px dashed #000; margin: 8px 0; }
    .double-divider { border-top: 2px solid #000; margin: 8px 0; }
    .row { display: flex; justify-content: space-between; margin: 2px 0; }
    .large { font-size: 16px; }
  </style>
</head>
<body>
  <div class="center bold large">${storeName}</div>
  <div class="center bold">日計精算レシート (Z-Report)</div>
  <div class="center">${now}</div>
  <div class="divider"></div>
  <div class="row"><span>レジ担当:</span><span>${closedShiftData.closedBy || 'Staff'}</span></div>
  <div class="row"><span>開設日時:</span><span>${new Date(closedShiftData.openedAt).toLocaleTimeString('ja-JP')}</span></div>
  <div class="row"><span>締め日時:</span><span>${new Date(closedShiftData.closedAt || '').toLocaleTimeString('ja-JP')}</span></div>
  <div class="double-divider"></div>
  <div class="row bold"><span>本日売上合計:</span><span>${yen(stats.todaySales)}</span></div>
  <div class="row"><span>└ 現金売上:</span><span>${yen(stats.cashSales)}</span></div>
  <div class="row"><span>└ キャッシュレス売上:</span><span>${yen(stats.nonCashSales)}</span></div>
  <div class="row"><span>取引件数:</span><span>${stats.transactionCount} 件</span></div>
  <div class="divider"></div>
  <div class="row"><span>釣銭準備金 (開始時):</span><span>${yen(closedShiftData.startingFloat)}</span></div>
  <div class="row"><span>+ 入金 (釣銭補充等):</span><span>${yen(stats.cashIn)}</span></div>
  <div class="row"><span>- 出金 (小口経費等):</span><span>${yen(stats.cashOut)}</span></div>
  <div class="row bold"><span>理論現金有高:</span><span>${yen(closedShiftData.expectedTotal || 0)}</span></div>
  <div class="row bold"><span>実査現金有高:</span><span>${yen(closedShiftData.countedTotal || 0)}</span></div>
  <div class="divider"></div>
  <div class="row bold large">
    <span>過不足金:</span>
    <span>${(closedShiftData.variance ?? 0) === 0 ? '±¥0 (過不足なし)' : (closedShiftData.variance ?? 0) > 0 ? `+${yen(closedShiftData.variance ?? 0)} (過剰)` : `-${yen(Math.abs(closedShiftData.variance ?? 0))} (不足)`}</span>
  </div>
  <div class="double-divider"></div>
  <div class="center">本日もお疲れ様でした。</div>
</body>
</html>`;
    printHtml(html);
  };

  // ── Excel Export ──────────────────────────────────────────────────────────

  const handleExportExcel = async () => {
    try {
      const XLSX = await import('xlsx');
      const dataToExport = transactions.map(t => ({
        '決済日時': new Date(t.timestamp).toLocaleString('ja-JP'),
        '伝票/注文番号': t.orderNumber ? formatOrderNumber(t.orderNumber) : '店頭即時',
        'テーブル番号': t.tableNumber || '-',
        '区分': t.fulfillment === 'DINE_IN' ? '店内飲食' : t.fulfillment === 'DELIVERY' ? 'デリバリー' : 'テイクアウト',
        'お客様名': t.customerName || '店頭客',
        '注文内容': t.itemsSummary,
        '小計': t.subtotal,
        '消費税': t.tax,
        '適用税率': `${t.taxRate}%`,
        '割引額': t.discount || 0,
        '合計支払額': t.total,
        '決済方法': PAYMENT_METHODS.find(m => m.id === t.paymentMethod)?.label || t.paymentMethod,
        'お預かり金額': t.amountTendered,
        'お釣り': t.changeAmount,
        'レジ担当': t.staffName || 'Staff',
        '備考': t.note || '',
        '取消フラグ': t.isVoided ? '取消済' : '正常',
      }));

      const ws = XLSX.utils.json_to_sheet(dataToExport);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, '本日決済ジャーナル');
      XLSX.writeFile(wb, `レジ決済ジャーナル_${new Date().toISOString().split('T')[0]}.xlsx`);
      toast.success('Excelファイルをダウンロードしました！');
    } catch (err) {
      toast.error('Excelエクスポートに失敗しました');
    }
  };

  // ── Filtered Active Orders & Transactions ─────────────────────────────────

  const consolidatedOrders = useMemo(() => {
    const result: any[] = [];
    const tableGroups: Record<string, any[]> = {};

    orders.forEach((o: any) => {
      const tableNum = extractTableNumber(o.note) || (o.fulfillment === 'DINE_IN' ? (o.tableNumber || '1') : null);
      if (!tableNum && o.fulfillment !== 'DINE_IN') {
        result.push({
          ...o,
          orderIds: [o.id],
          orderNumbers: [o.number],
          orderCount: 1,
          isConsolidatedTable: false,
          tableNumber: null,
        });
        return;
      }

      const storeKey = o.storeId || o.store?.id || 'main';
      const groupKey = `${storeKey}_table_${tableNum}`;
      if (!tableGroups[groupKey]) {
        tableGroups[groupKey] = [];
      }
      tableGroups[groupKey].push(o);
    });

    Object.values(tableGroups).forEach(group => {
      group.sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
      const primary = group[0];
      const tableNum = extractTableNumber(primary.note) || (primary.fulfillment === 'DINE_IN' ? ((primary as any).tableNumber || '1') : '1');
      const mergedItems: any[] = [];
      let subtotal = 0;
      let tax = 0;
      let total = 0;
      let grandTotal = 0;
      const orderNumbers: number[] = [];
      const orderIds: string[] = [];

      group.forEach((ord, roundIdx) => {
        orderIds.push(ord.id);
        orderNumbers.push(ord.number);
        const ordGrand = ord.grandTotal ?? ord.total;
        grandTotal += ordGrand;
        total += (ord.total || ordGrand);
        const ordSub = ord.subtotal || Math.round(ordGrand / 1.1);
        subtotal += ordSub;
        tax += (ord.tax || (ordGrand - ordSub));

        (ord.items || []).forEach((line: any) => {
          mergedItems.push({
            ...line,
            roundNumber: roundIdx + 1,
            orderNumber: ord.number,
            unitPrice: line.unitPrice ?? Math.round((line.lineTotal || 0) / (line.quantity || 1)),
            lineTotal: line.lineTotal || (line.unitPrice ? line.unitPrice * (line.quantity || 1) : 0),
          });
        });
      });

      result.push({
        ...primary,
        id: group.length > 1 ? `table-${tableNum}-${primary.id}` : primary.id,
        orderIds,
        number: primary.number,
        orderNumbers,
        orderCount: group.length,
        isConsolidatedTable: true,
        tableNumber: tableNum,
        customerName: primary.customerName || `テーブル ${tableNum}`,
        items: mergedItems,
        subtotal,
        tax,
        total,
        grandTotal,
        note: group.length > 1 ? `[テーブル: ${tableNum}] ${group.length}回注文合算` : primary.note,
        rawOrders: group,
      });
    });

    return result;
  }, [orders]);

  const filteredOrders = useMemo(() => {
    return consolidatedOrders.filter(o => {
      if (orderFilter !== 'ALL' && o.fulfillment !== orderFilter) return false;
      if (orderSearch.trim()) {
        const q = orderSearch.toLowerCase();
        const numMatch = String(o.number).includes(q) || (o.orderNumbers && o.orderNumbers.some((n: number) => String(n).includes(q)));
        const nameMatch = o.customerName.toLowerCase().includes(q);
        const tableMatch = (o.tableNumber || extractTableNumber(o.note))?.toLowerCase().includes(q);
        if (!numMatch && !nameMatch && !tableMatch) return false;
      }
      return true;
    });
  }, [consolidatedOrders, orderFilter, orderSearch]);

  const filteredTransactions = useMemo(() => {
    return transactions.filter(t => {
      if (historyFilter !== 'ALL' && t.paymentMethod !== historyFilter) return false;
      if (historySearch.trim()) {
        const q = historySearch.toLowerCase();
        const numMatch = t.orderNumber ? String(t.orderNumber).includes(q) : false;
        const nameMatch = (t.customerName || '').toLowerCase().includes(q);
        const itemMatch = t.itemsSummary.toLowerCase().includes(q);
        if (!numMatch && !nameMatch && !itemMatch) return false;
      }
      return true;
    });
  }, [transactions, historyFilter, historySearch]);

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem', paddingBottom: '3rem' }}>
      
      {/* Kiosk Display Promo Banner */}
      <div style={{
        backgroundColor: '#0f172a',
        color: '#f8fafc',
        borderRadius: '12px',
        padding: '12px 18px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        flexWrap: 'wrap',
        gap: '10px'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <Banknote size={20} color="#22c55e" />
          <span style={{ fontSize: '0.9rem', fontWeight: 600 }}>
            タブレット端末やレジ専用モニターで全画面表示できます（キッチンディスプレイと同様の独立画面）
          </span>
        </div>
        <a
          href="/cash-counter"
          target="_blank"
          rel="noopener"
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '6px',
            backgroundColor: '#16a34a',
            color: '#fff',
            textDecoration: 'none',
            padding: '8px 16px',
            borderRadius: '8px',
            fontWeight: 800,
            fontSize: '0.85rem'
          }}
        >
          <ExternalLink size={15} /> 専用レジ画面を開く (Open Cash Counter Display) ↗
        </a>
      </div>
      
      {/* Top Shift Status & Action Bar */}
      <div style={{
        backgroundColor: '#ffffff',
        borderRadius: '12px',
        border: '1px solid #e5e7eb',
        padding: '1rem 1.5rem',
        display: 'flex',
        flexWrap: 'wrap',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: '1rem',
        boxShadow: '0 1px 3px rgba(0,0,0,0.05)'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
          <div style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '8px',
            padding: '6px 14px',
            borderRadius: '9999px',
            fontSize: '0.875rem',
            fontWeight: 700,
            backgroundColor: shift?.isOpen ? '#dcfce7' : '#f3f4f6',
            color: shift?.isOpen ? '#15803d' : '#4b5563',
          }}>
            <span style={{ width: 9, height: 9, borderRadius: '50%', backgroundColor: shift?.isOpen ? '#16a34a' : '#9ca3af' }} />
            {shift?.isOpen ? 'レジ稼働中 (Register Open)' : 'レジ休止・未開設'}
          </div>

          {shift?.isOpen && (
            <div style={{ fontSize: '0.85rem', color: '#6b7280' }}>
              担当: <strong>{shift.openedBy || user?.name || 'Staff'}</strong> · 開設: {new Date(shift.openedAt).toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' })}
            </div>
          )}

          {stores.length > 1 && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginLeft: '0.5rem' }}>
              <Store size={16} color="#6b7280" />
              <select
                value={selectedStoreId}
                onChange={e => setSelectedStoreId(e.target.value)}
                style={{ padding: '4px 8px', borderRadius: '6px', border: '1px solid #d1d5db', fontSize: '0.85rem', outline: 'none' }}
              >
                <option value="ALL">全店舗共通</option>
                {stores.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </div>
          )}
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
          {!shift?.isOpen ? (
            <button
              type="button"
              onClick={() => setOpenShiftModal(true)}
              style={actionBtnStyle('#16a34a', '#ffffff')}
            >
              <Banknote size={16} /> レジ開設 (Open Shift)
            </button>
          ) : (
            <>
              <button
                type="button"
                onClick={() => setMovementModal(true)}
                style={actionBtnStyle('#4b5563', '#ffffff')}
              >
                <ArrowUpDown size={15} /> 釣銭補充・出金 (In/Out)
              </button>
              <button
                type="button"
                onClick={() => setActiveSubTab('drawer')}
                style={actionBtnStyle('#dc2626', '#ffffff')}
              >
                <ShieldCheck size={16} /> レジ締め・日計精算 (Close)
              </button>
            </>
          )}

          <button
            type="button"
            onClick={() => { loadRegisterData(); loadActiveOrders(); toast.success('最新情報に更新しました'); }}
            style={{ ...actionBtnStyle('#ffffff', '#374151'), border: '1px solid #d1d5db' }}
            title="最新情報に更新"
          >
            <RefreshCw size={15} className={loadingOrders ? 'spin' : ''} />
          </button>
        </div>
      </div>

      {/* 4 Metric KPI Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '1rem' }}>
        <MetricCard
          icon={<Banknote size={24} color="#16a34a" />}
          label="現有ドロワー現金 (理論値)"
          value={yen(stats.expectedDrawerCash)}
          sublabel={`準備金: ${yen(stats.startingFloat)} | 入金: +${yen(stats.cashIn)} | 出金: -${yen(stats.cashOut)}`}
          bg="#f0fdf4"
          border="#bbf7d0"
        />
        <MetricCard
          icon={<Calculator size={24} color="#2563eb" />}
          label="本日の総売上 (Total Sales)"
          value={yen(stats.todaySales)}
          sublabel={`決済件数: ${stats.transactionCount} 件`}
          bg="#eff6ff"
          border="#bfdbfe"
        />
        <MetricCard
          icon={<CreditCard size={24} color="#7c3aed" />}
          label="売上内訳 (現金 / キャッシュレス)"
          value={`${yen(stats.cashSales)} / ${yen(stats.nonCashSales)}`}
          sublabel="現金 vs カード・PayPay・IC"
          bg="#faf5ff"
          border="#e9d5ff"
        />
        <MetricCard
          icon={<UtensilsCrossed size={24} color="#ea580c" />}
          label="未会計の注文・伝票"
          value={`${orders.length} 件`}
          sublabel={orders.some(o => o.fulfillment === 'DINE_IN') ? 'お席テーブル注文あり' : '全伝票待機中'}
          bg="#fff7ed"
          border="#fed7aa"
        />
      </div>

      {/* Sub-tab Navigation */}
      <div style={{ display: 'flex', borderBottom: '2px solid #e5e7eb', gap: '8px' }}>
        <SubTabButton
          active={activeSubTab === 'checkout'}
          onClick={() => setActiveSubTab('checkout')}
          icon={<Receipt size={17} />}
          label="未精算伝票・レジ会計"
          badge={orders.length}
        />
        <SubTabButton
          active={activeSubTab === 'walkin'}
          onClick={() => setActiveSubTab('walkin')}
          icon={<Plus size={17} />}
          label="クイック即時販売 (Walk-in)"
          badge={walkinCart.length > 0 ? walkinCart.length : undefined}
        />
        <SubTabButton
          active={activeSubTab === 'drawer'}
          onClick={() => setActiveSubTab('drawer')}
          icon={<Coins size={17} />}
          label="ドロワー管理・金種計算 (Balancing)"
        />
        <SubTabButton
          active={activeSubTab === 'history'}
          onClick={() => setActiveSubTab('history')}
          icon={<History size={17} />}
          label="本日決済ジャーナル (History)"
          badge={transactions.length}
        />
      </div>

      {/* =================================================================== */}
      {/* SUB-TAB 1: UNSETTLED ORDERS & CHECKOUT PANEL                        */}
      {/* =================================================================== */}
      {activeSubTab === 'checkout' && (
        <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr', gap: '1.5rem', alignItems: 'start' }}>
          
          {/* Left Column: Order List */}
          <div style={{ backgroundColor: '#ffffff', borderRadius: '12px', border: '1px solid #e5e7eb', padding: '1.25rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem', flexWrap: 'wrap', gap: '8px' }}>
              <h3 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 700, color: '#111827' }}>
                お会計待ちの伝票一覧 ({filteredOrders.length})
              </h3>
              
              <div style={{ display: 'flex', gap: '6px' }}>
                {(['ALL', 'DINE_IN', 'PICKUP', 'DELIVERY'] as const).map(f => (
                  <button
                    key={f}
                    type="button"
                    onClick={() => setOrderFilter(f)}
                    style={{
                      padding: '4px 10px',
                      borderRadius: '6px',
                      fontSize: '0.75rem',
                      fontWeight: 600,
                      border: '1px solid',
                      borderColor: orderFilter === f ? '#111827' : '#e5e7eb',
                      backgroundColor: orderFilter === f ? '#111827' : '#ffffff',
                      color: orderFilter === f ? '#ffffff' : '#4b5563',
                      cursor: 'pointer',
                    }}
                  >
                    {f === 'ALL' ? 'すべて' : f === 'DINE_IN' ? '🍽️ テーブル' : f === 'PICKUP' ? '🛍️ お持ち帰り' : '🛵 配達'}
                  </button>
                ))}
              </div>
            </div>

            <div style={{ position: 'relative', marginBottom: '1rem' }}>
              <Search size={16} color="#9ca3af" style={{ position: 'absolute', left: 10, top: 10 }} />
              <input
                type="text"
                placeholder="テーブル番号、伝票番号、お客様名で検索…"
                value={orderSearch}
                onChange={e => setOrderSearch(e.target.value)}
                style={{
                  width: '100%',
                  padding: '8px 10px 8px 34px',
                  borderRadius: '8px',
                  border: '1px solid #d1d5db',
                  fontSize: '0.875rem',
                  outline: 'none',
                  boxSizing: 'border-box'
                }}
              />
            </div>

            {filteredOrders.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '3rem 1rem', color: '#6b7280' }}>
                <CheckCircle2 size={40} color="#16a34a" style={{ margin: '0 auto 8px', opacity: 0.6 }} />
                <p style={{ margin: 0, fontWeight: 600 }}>未会計の注文はありません</p>
                <small style={{ color: '#9ca3af' }}>新しい注文が入るとここに即時表示されます</small>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', maxHeight: '680px', overflowY: 'auto' }}>
                {filteredOrders.map(order => {
                  const isSelected = selectedOrder?.id === order.id;
                  const tableNum = extractTableNumber(order.note);
                  const grandTotal = order.grandTotal ?? order.total;
                  return (
                    <div
                      key={order.id}
                      onClick={() => setSelectedOrder(order)}
                      style={{
                        padding: '12px 14px',
                        borderRadius: '10px',
                        border: `2px solid ${isSelected ? '#16a34a' : '#e5e7eb'}`,
                        backgroundColor: isSelected ? '#f0fdf4' : '#ffffff',
                        cursor: 'pointer',
                        transition: 'all 0.15s ease',
                        boxShadow: isSelected ? '0 2px 8px rgba(22, 163, 74, 0.15)' : 'none'
                      }}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                        <div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                            {tableNum ? (
                              <span style={{ backgroundColor: '#fed7aa', color: '#9a3412', padding: '2px 8px', borderRadius: '4px', fontSize: '0.8rem', fontWeight: 800 }}>
                                🪑 {tableNum}
                              </span>
                            ) : order.fulfillment === 'DELIVERY' ? (
                              <span style={{ backgroundColor: '#e0e7ff', color: '#3730a3', padding: '2px 8px', borderRadius: '4px', fontSize: '0.8rem', fontWeight: 700 }}>
                                🛵 配達 #{formatOrderNumber(order.number)}
                              </span>
                            ) : (
                              <span style={{ backgroundColor: '#f3f4f6', color: '#1f2937', padding: '2px 8px', borderRadius: '4px', fontSize: '0.8rem', fontWeight: 700 }}>
                                🛍️ 伝票 #{formatOrderNumber(order.number)}
                              </span>
                            )}
                            <strong style={{ fontSize: '0.95rem', color: '#111827' }}>{order.customerName}</strong>
                          </div>

                          <div style={{ fontSize: '0.8rem', color: '#6b7280', marginTop: '2px' }}>
                            {order.items.map((i: any) => `${i.nameJa || i.nameEn} ×${i.quantity}`).join(', ')}
                          </div>
                        </div>

                        <div style={{ textAlign: 'right' }}>
                          <div style={{ fontSize: '1.15rem', fontWeight: 800, color: '#111827' }}>
                            {yen(grandTotal)}
                          </div>
                          <small style={{ fontSize: '0.75rem', color: '#9ca3af' }}>
                            {new Date(order.createdAt).toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' })}
                          </small>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Right Column: Active Order Checkout Calculator */}
          <div style={{ backgroundColor: '#ffffff', borderRadius: '12px', border: '1px solid #e5e7eb', padding: '1.25rem', position: 'sticky', top: '1rem' }}>
            {selectedOrder ? (
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid #e5e7eb', paddingBottom: '0.75rem', marginBottom: '1rem' }}>
                  <div>
                    <h3 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 700, color: '#111827' }}>
                      伝票 #{formatOrderNumber(selectedOrder.number)} のお会計
                    </h3>
                    <small style={{ color: '#6b7280' }}>
                      {extractTableNumber(selectedOrder.note) ? `お席: ${extractTableNumber(selectedOrder.note)}` : selectedOrder.customerName}
                    </small>
                  </div>
                  <button
                    type="button"
                    onClick={() => setSelectedOrder(null)}
                    style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#9ca3af' }}
                  >
                    <X size={18} />
                  </button>
                </div>

                {/* Items Summary Table */}
                <div style={{ maxHeight: '180px', overflowY: 'auto', marginBottom: '1rem', borderBottom: '1px solid #f3f4f6', paddingBottom: '0.5rem' }}>
                  {selectedOrder.items.map((line, idx) => (
                    <div key={idx} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem', padding: '4px 0' }}>
                      <span>{line.nameJa || line.nameEn} × {line.quantity}</span>
                      <strong>{yen(line.lineTotal)}</strong>
                    </div>
                  ))}
                </div>

                {/* Bill Breakdown */}
                <div style={{ backgroundColor: '#f9fafb', borderRadius: '8px', padding: '10px 14px', marginBottom: '1.25rem' }}>
                  {typeof selectedOrder.subtotal === 'number' && (
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem', color: '#4b5563', marginBottom: '4px' }}>
                      <span>小計 (税抜)</span>
                      <span>{yen(selectedOrder.subtotal)}</span>
                    </div>
                  )}
                  {typeof selectedOrder.tax === 'number' && (
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem', color: '#4b5563', marginBottom: '4px' }}>
                      <span>消費税 ({selectedOrder.taxRate ?? (selectedOrder.fulfillment === 'DINE_IN' ? 10 : 8)}%)</span>
                      <span>{yen(selectedOrder.tax)}</span>
                    </div>
                  )}
                  {Boolean(selectedOrder.pointsDiscount) && (
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem', color: '#dc2626', marginBottom: '4px' }}>
                      <span>ポイント・特典値引き</span>
                      <span>-{yen(selectedOrder.pointsDiscount!)}</span>
                    </div>
                  )}
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '1.35rem', fontWeight: 800, color: '#111827', borderTop: '1px solid #e5e7eb', paddingTop: '6px', marginTop: '6px' }}>
                    <span>お支払い合計</span>
                    <span style={{ color: '#16a34a' }}>{yen(selectedOrder.grandTotal ?? selectedOrder.total)}</span>
                  </div>
                </div>

                {/* Payment Method Selector */}
                <div style={{ marginBottom: '1.25rem' }}>
                  <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 700, color: '#374151', marginBottom: '8px' }}>
                    決済方法の選択
                  </label>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                    {PAYMENT_METHODS.map(m => {
                      const Icon = m.icon;
                      const isSel = settlementMethod === m.id;
                      return (
                        <button
                          key={m.id}
                          type="button"
                          onClick={() => setSettlementMethod(m.id)}
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: '8px',
                            padding: '10px',
                            borderRadius: '8px',
                            border: `2px solid ${isSel ? m.color : '#e5e7eb'}`,
                            backgroundColor: isSel ? m.bg : '#ffffff',
                            color: isSel ? m.color : '#374151',
                            fontWeight: isSel ? 700 : 500,
                            fontSize: '0.8rem',
                            cursor: 'pointer',
                          }}
                        >
                          <Icon size={16} />
                          <span>{m.label}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Cash Calculator (if cash selected) */}
                {settlementMethod === 'CASH' && (
                  <div style={{ backgroundColor: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: '10px', padding: '12px', marginBottom: '1.25rem' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                      <label style={{ fontSize: '0.85rem', fontWeight: 700, color: '#166534' }}>
                        お預かり金額 (Tendered)
                      </label>
                      <button
                        type="button"
                        onClick={() => setAmountTenderedStr(String(selectedOrder.grandTotal ?? selectedOrder.total))}
                        style={{ background: 'none', border: 'none', color: '#15803d', fontSize: '0.75rem', fontWeight: 700, cursor: 'pointer' }}
                      >
                        ちょうど (Exact)
                      </button>
                    </div>

                    <div style={{ display: 'flex', gap: '8px', marginBottom: '10px' }}>
                      <input
                        type="number"
                        value={amountTenderedStr}
                        onChange={e => setAmountTenderedStr(e.target.value)}
                        style={{
                          flex: 1,
                          fontSize: '1.25rem',
                          fontWeight: 700,
                          padding: '8px 12px',
                          borderRadius: '8px',
                          border: '1px solid #86efac',
                          backgroundColor: '#ffffff',
                          outline: 'none',
                        }}
                      />
                    </div>

                    {/* Quick Bill Buttons */}
                    <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', marginBottom: '10px' }}>
                      {[1000, 5000, 10000].map(addVal => (
                        <button
                          key={addVal}
                          type="button"
                          onClick={() => setAmountTenderedStr(String(addVal))}
                          style={{
                            padding: '4px 8px',
                            backgroundColor: '#ffffff',
                            border: '1px solid #86efac',
                            borderRadius: '6px',
                            fontSize: '0.75rem',
                            fontWeight: 600,
                            cursor: 'pointer'
                          }}
                        >
                          {yen(addVal)}札
                        </button>
                      ))}
                      {[1000, 5000].map(addVal => (
                        <button
                          key={`plus-${addVal}`}
                          type="button"
                          onClick={() => setAmountTenderedStr(prev => String((parseInt(prev, 10) || 0) + addVal))}
                          style={{
                            padding: '4px 8px',
                            backgroundColor: '#ffffff',
                            border: '1px solid #86efac',
                            borderRadius: '6px',
                            fontSize: '0.75rem',
                            fontWeight: 600,
                            cursor: 'pointer'
                          }}
                        >
                          +{yen(addVal)}
                        </button>
                      ))}
                    </div>

                    {/* Change Display */}
                    {(() => {
                      const total = selectedOrder.grandTotal ?? selectedOrder.total;
                      const tendered = parseInt(amountTenderedStr, 10) || 0;
                      const change = Math.max(0, tendered - total);
                      const isShort = tendered < total;

                      return (
                        <div style={{ borderTop: '1px dashed #86efac', paddingTop: '8px' }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <span style={{ fontSize: '0.9rem', fontWeight: 700, color: isShort ? '#dc2626' : '#15803d' }}>
                              {isShort ? '不足額' : 'お釣り (Change)'}
                            </span>
                            <span style={{ fontSize: '1.4rem', fontWeight: 800, color: isShort ? '#dc2626' : '#15803d' }}>
                              {isShort ? `-${yen(total - tendered)}` : yen(change)}
                            </span>
                          </div>
                          {!isShort && change > 0 && (
                            <div style={{ fontSize: '0.75rem', color: '#166534', marginTop: '2px', textAlign: 'right' }}>
                              推奨出金: <strong>{calculateOptimalChange(change)}</strong>
                            </div>
                          )}
                        </div>
                      );
                    })()}
                  </div>
                )}

                {/* Action Buttons */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  <button
                    type="button"
                    disabled={settling}
                    onClick={handleSettleOrder}
                    style={{
                      width: '100%',
                      padding: '12px',
                      backgroundColor: '#16a34a',
                      color: '#ffffff',
                      border: 'none',
                      borderRadius: '8px',
                      fontSize: '1rem',
                      fontWeight: 800,
                      cursor: settling ? 'not-allowed' : 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: '8px',
                      boxShadow: '0 2px 6px rgba(22, 163, 74, 0.3)'
                    }}
                  >
                    <CheckCircle2 size={18} />
                    {settling ? '処理中…' : 'お会計完了・伝票クローズ (Settle)'}
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      const total = selectedOrder.grandTotal ?? selectedOrder.total;
                      const tendered = parseInt(amountTenderedStr, 10) || total;
                      const change = settlementMethod === 'CASH' ? Math.max(0, tendered - total) : 0;
                      handlePrintReceiptForOrder(selectedOrder, tendered, change, settlementMethod);
                    }}
                    style={{
                      width: '100%',
                      padding: '8px',
                      backgroundColor: '#ffffff',
                      color: '#374151',
                      border: '1px solid #d1d5db',
                      borderRadius: '8px',
                      fontSize: '0.85rem',
                      fontWeight: 600,
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: '6px'
                    }}
                  >
                    <Printer size={15} /> 領収書・レシート印刷プレビュー
                  </button>
                </div>
              </div>
            ) : (
              <div style={{ textAlign: 'center', padding: '4rem 1rem', color: '#6b7280' }}>
                <Receipt size={48} color="#9ca3af" style={{ margin: '0 auto 12px', opacity: 0.5 }} />
                <h4 style={{ margin: '0 0 4px', color: '#111827', fontSize: '1rem' }}>伝票を選択してください</h4>
                <p style={{ margin: 0, fontSize: '0.85rem' }}>左側の一覧から会計を行うテーブル席やお持ち帰り注文をクリックしてください。</p>
              </div>
            )}
          </div>

        </div>
      )}

      {/* =================================================================== */}
      {/* SUB-TAB 2: DIRECT WALK-IN SALE (クイック即時販売)                   */}
      {/* =================================================================== */}
      {activeSubTab === 'walkin' && (
        <div style={{ display: 'grid', gridTemplateColumns: '1.4fr 1fr', gap: '1.5rem', alignItems: 'start' }}>
          
          {/* Quick Menu Picker */}
          <div style={{ backgroundColor: '#ffffff', borderRadius: '12px', border: '1px solid #e5e7eb', padding: '1.25rem' }}>
            <h3 style={{ margin: '0 0 1rem', fontSize: '1.1rem', fontWeight: 700, color: '#111827' }}>
              店頭クイック商品選択 (Quick Menu)
            </h3>

            {/* Popular Items Grid */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(170px, 1fr))', gap: '10px', marginBottom: '1.5rem' }}>
              {PRESET_QUICK_ITEMS.map(item => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => handleAddWalkinItem(item)}
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    justifyContent: 'space-between',
                    padding: '12px',
                    borderRadius: '8px',
                    border: '1px solid #e5e7eb',
                    backgroundColor: '#f9fafb',
                    textAlign: 'left',
                    cursor: 'pointer',
                    transition: 'all 0.15s ease',
                  }}
                  onMouseEnter={e => (e.currentTarget.style.backgroundColor = '#f0fdf4')}
                  onMouseLeave={e => (e.currentTarget.style.backgroundColor = '#f9fafb')}
                >
                  <div>
                    <span style={{ fontSize: '0.7rem', color: '#6b7280', display: 'block' }}>{item.categoryJa}</span>
                    <strong style={{ fontSize: '0.85rem', color: '#111827', display: 'block', marginTop: '2px' }}>{item.nameJa}</strong>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '8px' }}>
                    <span style={{ fontSize: '0.95rem', fontWeight: 800, color: '#16a34a' }}>{yen(item.price)}</span>
                    <span style={{ backgroundColor: '#ffffff', border: '1px solid #d1d5db', borderRadius: '4px', padding: '2px 6px', fontSize: '0.7rem', fontWeight: 700 }}>+ 追加</span>
                  </div>
                </button>
              ))}
            </div>

            {/* Custom Amount Keypad */}
            <div style={{ borderTop: '1px solid #e5e7eb', paddingTop: '1.25rem' }}>
              <h4 style={{ margin: '0 0 8px', fontSize: '0.95rem', fontWeight: 700, color: '#374151' }}>
                手入力金額・任意商品追加 (Custom Item)
              </h4>
              <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr auto', gap: '8px', alignItems: 'center' }}>
                <input
                  type="text"
                  placeholder="品名 (例: ディナー宴会特別セット)"
                  value={customItemName}
                  onChange={e => setCustomItemName(e.target.value)}
                  style={{ padding: '8px 10px', borderRadius: '6px', border: '1px solid #d1d5db', fontSize: '0.85rem', outline: 'none' }}
                />
                <input
                  type="number"
                  placeholder="単価 (円)"
                  value={customItemPrice}
                  onChange={e => setCustomItemPrice(e.target.value)}
                  style={{ padding: '8px 10px', borderRadius: '6px', border: '1px solid #d1d5db', fontSize: '0.85rem', outline: 'none' }}
                />
                <select
                  value={customTaxRate}
                  onChange={e => setCustomTaxRate(Number(e.target.value))}
                  style={{ padding: '8px 10px', borderRadius: '6px', border: '1px solid #d1d5db', fontSize: '0.85rem', outline: 'none' }}
                >
                  <option value={8}>軽減 8% (テイクアウト)</option>
                  <option value={10}>標準 10% (店内飲食)</option>
                </select>
                <button
                  type="button"
                  onClick={handleAddCustomWalkinItem}
                  style={{ padding: '8px 16px', backgroundColor: '#111827', color: '#ffffff', border: 'none', borderRadius: '6px', fontSize: '0.85rem', fontWeight: 700, cursor: 'pointer' }}
                >
                  カート追加
                </button>
              </div>
            </div>
          </div>

          {/* Walk-in Cart & Checkout */}
          <div style={{ backgroundColor: '#ffffff', borderRadius: '12px', border: '1px solid #e5e7eb', padding: '1.25rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem', borderBottom: '1px solid #e5e7eb', paddingBottom: '0.5rem' }}>
              <h3 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 700, color: '#111827' }}>
                店頭販売カート ({walkinCart.length}品)
              </h3>
              {walkinCart.length > 0 && (
                <button
                  type="button"
                  onClick={() => setWalkinCart([])}
                  style={{ background: 'none', border: 'none', color: '#dc2626', fontSize: '0.75rem', fontWeight: 700, cursor: 'pointer' }}
                >
                  カートを空にする
                </button>
              )}
            </div>

            {walkinCart.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '3rem 1rem', color: '#9ca3af' }}>
                <ShoppingBag size={40} style={{ margin: '0 auto 8px', opacity: 0.4 }} />
                <p style={{ margin: 0, fontWeight: 600 }}>カートは空です</p>
                <small>左のメニューボタンをクリックして商品を追加してください</small>
              </div>
            ) : (
              <div>
                <div style={{ maxHeight: '220px', overflowY: 'auto', marginBottom: '1rem' }}>
                  {walkinCart.map(({ item, quantity }, idx) => (
                    <div key={idx} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 0', borderBottom: '1px solid #f3f4f6' }}>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontSize: '0.85rem', fontWeight: 600, color: '#111827' }}>{item.nameJa}</div>
                        <small style={{ color: '#6b7280' }}>{yen(item.price)} (税{item.taxRate}%)</small>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <button
                          type="button"
                          onClick={() => {
                            setWalkinCart(prev => prev.map((p, i) => i === idx ? { ...p, quantity: Math.max(1, p.quantity - 1) } : p));
                          }}
                          style={{ width: 26, height: 26, borderRadius: '4px', border: '1px solid #d1d5db', backgroundColor: '#fff', cursor: 'pointer' }}
                        >
                          -
                        </button>
                        <span style={{ fontSize: '0.9rem', fontWeight: 700, minWidth: '20px', textAlign: 'center' }}>{quantity}</span>
                        <button
                          type="button"
                          onClick={() => {
                            setWalkinCart(prev => prev.map((p, i) => i === idx ? { ...p, quantity: p.quantity + 1 } : p));
                          }}
                          style={{ width: 26, height: 26, borderRadius: '4px', border: '1px solid #d1d5db', backgroundColor: '#fff', cursor: 'pointer' }}
                        >
                          +
                        </button>
                        <button
                          type="button"
                          onClick={() => setWalkinCart(prev => prev.filter((_, i) => i !== idx))}
                          style={{ background: 'none', border: 'none', color: '#dc2626', cursor: 'pointer', padding: '2px 4px' }}
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>

                <div style={{ backgroundColor: '#f9fafb', borderRadius: '8px', padding: '10px 14px', marginBottom: '1rem' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem', color: '#4b5563', marginBottom: '4px' }}>
                    <span>小計 (税抜)</span>
                    <span>{yen(walkinSubtotal)}</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem', color: '#4b5563', marginBottom: '4px' }}>
                    <span>消費税 ({walkinTaxRate}%)</span>
                    <span>{yen(walkinTax)}</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '1.35rem', fontWeight: 800, color: '#111827', borderTop: '1px solid #e5e7eb', paddingTop: '6px', marginTop: '6px' }}>
                    <span>合計金額</span>
                    <span style={{ color: '#16a34a' }}>{yen(walkinGrandTotal)}</span>
                  </div>
                </div>

                {/* Payment Methods */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px', marginBottom: '1rem' }}>
                  {PAYMENT_METHODS.slice(0, 4).map(m => (
                    <button
                      key={m.id}
                      type="button"
                      onClick={() => setWalkinPaymentMethod(m.id)}
                      style={{
                        padding: '8px',
                        borderRadius: '6px',
                        border: `2px solid ${walkinPaymentMethod === m.id ? m.color : '#e5e7eb'}`,
                        backgroundColor: walkinPaymentMethod === m.id ? m.bg : '#fff',
                        fontSize: '0.75rem',
                        fontWeight: 700,
                        cursor: 'pointer',
                      }}
                    >
                      {m.label}
                    </button>
                  ))}
                </div>

                {walkinPaymentMethod === 'CASH' && (
                  <div style={{ backgroundColor: '#f0fdf4', padding: '10px', borderRadius: '8px', marginBottom: '1rem' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem', fontWeight: 700, color: '#166534', marginBottom: '4px' }}>
                      <span>お預かり</span>
                      <span>お釣り: {yen(Math.max(0, (parseInt(walkinTenderedStr, 10) || 0) - walkinGrandTotal))}</span>
                    </div>
                    <input
                      type="number"
                      value={walkinTenderedStr}
                      onChange={e => setWalkinTenderedStr(e.target.value)}
                      style={{ width: '100%', padding: '6px 10px', borderRadius: '6px', border: '1px solid #86efac', fontSize: '1.1rem', fontWeight: 700, boxSizing: 'border-box' }}
                    />
                  </div>
                )}

                <button
                  type="button"
                  disabled={settling}
                  onClick={handleSettleWalkin}
                  style={{
                    width: '100%',
                    padding: '12px',
                    backgroundColor: '#16a34a',
                    color: '#fff',
                    border: 'none',
                    borderRadius: '8px',
                    fontSize: '1rem',
                    fontWeight: 800,
                    cursor: settling ? 'not-allowed' : 'pointer',
                  }}
                >
                  {settling ? '処理中…' : '即時会計完了・レシート発行'}
                </button>
              </div>
            )}
          </div>

        </div>
      )}

      {/* =================================================================== */}
      {/* SUB-TAB 3: CASH DRAWER & BALANCING (ドロワー金種計算・レジ締め)       */}
      {/* =================================================================== */}
      {activeSubTab === 'drawer' && (
        <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr', gap: '1.5rem', alignItems: 'start' }}>
          
          {/* Denomination Counter Table */}
          <div style={{ backgroundColor: '#ffffff', borderRadius: '12px', border: '1px solid #e5e7eb', padding: '1.25rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
              <div>
                <h3 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 700, color: '#111827' }}>
                  金種別実査点呼・枚数カウンター
                </h3>
                <small style={{ color: '#6b7280' }}>ドロワー内の紙幣・硬貨の枚数を数えて入力してください</small>
              </div>
              <button
                type="button"
                onClick={() => setDenominationsCount({ 10000: 0, 5000: 0, 2000: 0, 1000: 0, 500: 0, 100: 0, 50: 0, 10: 0, 5: 0, 1: 0 })}
                style={{ background: 'none', border: 'none', color: '#6b7280', fontSize: '0.75rem', fontWeight: 600, cursor: 'pointer' }}
              >
                枚数をリセット
              </button>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {JAPAN_DENOMINATIONS.map(({ yen: val, label, type }) => {
                const count = denominationsCount[val] || 0;
                const lineTotal = val * count;
                return (
                  <div
                    key={val}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      padding: '8px 12px',
                      borderRadius: '8px',
                      backgroundColor: type === 'bill' ? '#f8fafc' : '#ffffff',
                      border: '1px solid #e2e8f0',
                    }}
                  >
                    <div style={{ width: '150px' }}>
                      <strong style={{ fontSize: '0.9rem', color: '#1e293b' }}>{label}</strong>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <button
                        type="button"
                        onClick={() => setDenominationsCount(prev => ({ ...prev, [val]: Math.max(0, (prev[val] || 0) - 1) }))}
                        style={{ width: 28, height: 28, borderRadius: '4px', border: '1px solid #cbd5e1', backgroundColor: '#fff', cursor: 'pointer' }}
                      >
                        -
                      </button>
                      <input
                        type="number"
                        min="0"
                        value={count || ''}
                        onChange={e => {
                          const v = parseInt(e.target.value, 10);
                          setDenominationsCount(prev => ({ ...prev, [val]: isNaN(v) ? 0 : Math.max(0, v) }));
                        }}
                        style={{
                          width: '60px',
                          textAlign: 'center',
                          padding: '4px',
                          borderRadius: '4px',
                          border: '1px solid #cbd5e1',
                          fontWeight: 700,
                          fontSize: '0.95rem'
                        }}
                      />
                      <button
                        type="button"
                        onClick={() => setDenominationsCount(prev => ({ ...prev, [val]: (prev[val] || 0) + 1 }))}
                        style={{ width: 28, height: 28, borderRadius: '4px', border: '1px solid #cbd5e1', backgroundColor: '#fff', cursor: 'pointer' }}
                      >
                        +
                      </button>
                      <button
                        type="button"
                        onClick={() => setDenominationsCount(prev => ({ ...prev, [val]: (prev[val] || 0) + 10 }))}
                        style={{ padding: '2px 6px', borderRadius: '4px', border: '1px solid #cbd5e1', backgroundColor: '#fff', fontSize: '0.75rem', fontWeight: 600, cursor: 'pointer' }}
                      >
                        +10
                      </button>
                    </div>

                    <div style={{ width: '100px', textAlign: 'right', fontWeight: 800, fontSize: '0.95rem', color: '#0f172a' }}>
                      {yen(lineTotal)}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Cash Variance & Close Shift Panel */}
          <div style={{ backgroundColor: '#ffffff', borderRadius: '12px', border: '1px solid #e5e7eb', padding: '1.25rem' }}>
            <h3 style={{ margin: '0 0 1rem', fontSize: '1.1rem', fontWeight: 700, color: '#111827' }}>
              現金過不足・レジ締め精算判定
            </h3>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginBottom: '1.25rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 12px', backgroundColor: '#f8fafc', borderRadius: '6px' }}>
                <span style={{ color: '#475569', fontSize: '0.85rem' }}>釣銭準備金 (Float)</span>
                <strong>{yen(stats.startingFloat)}</strong>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 12px', backgroundColor: '#f8fafc', borderRadius: '6px' }}>
                <span style={{ color: '#475569', fontSize: '0.85rem' }}>+ 本日現金売上 (Cash Sales)</span>
                <strong style={{ color: '#16a34a' }}>+{yen(stats.cashSales)}</strong>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 12px', backgroundColor: '#f8fafc', borderRadius: '6px' }}>
                <span style={{ color: '#475569', fontSize: '0.85rem' }}>+ 入金合計 (Cash In)</span>
                <strong>+{yen(stats.cashIn)}</strong>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 12px', backgroundColor: '#f8fafc', borderRadius: '6px' }}>
                <span style={{ color: '#475569', fontSize: '0.85rem' }}>- 出金合計 (Cash Out)</span>
                <strong style={{ color: '#dc2626' }}>-{yen(stats.cashOut)}</strong>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 12px', backgroundColor: '#f1f5f9', borderRadius: '8px', borderTop: '2px solid #cbd5e1' }}>
                <span style={{ fontWeight: 700, color: '#1e293b' }}>理論現金有高 (Expected)</span>
                <span style={{ fontSize: '1.15rem', fontWeight: 800 }}>{yen(stats.expectedDrawerCash)}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 12px', backgroundColor: '#f0fdf4', borderRadius: '8px', border: '1px solid #bbf7d0' }}>
                <span style={{ fontWeight: 700, color: '#166534' }}>実査現金合計 (Actual Counted)</span>
                <span style={{ fontSize: '1.25rem', fontWeight: 800, color: '#15803d' }}>{yen(actualCountedCash)}</span>
              </div>
            </div>

            {/* Variance Box */}
            <div style={{
              padding: '14px',
              borderRadius: '8px',
              textAlign: 'center',
              backgroundColor: cashVariance === 0 ? '#f0fdf4' : cashVariance > 0 ? '#eff6ff' : '#fef2f2',
              border: `2px solid ${cashVariance === 0 ? '#86efac' : cashVariance > 0 ? '#93c5fd' : '#fca5a5'}`,
              marginBottom: '1.25rem'
            }}>
              <div style={{ fontSize: '0.85rem', fontWeight: 700, color: cashVariance === 0 ? '#166534' : cashVariance > 0 ? '#1e40af' : '#991b1b' }}>
                {cashVariance === 0 ? '過不足判定: 一致 (Exact Match)' : cashVariance > 0 ? '過大 (Surplus): 現金過剰' : '不足 (Shortage): 現金不足'}
              </div>
              <div style={{ fontSize: '1.6rem', fontWeight: 900, marginTop: '4px', color: cashVariance === 0 ? '#16a34a' : cashVariance > 0 ? '#2563eb' : '#dc2626' }}>
                {cashVariance === 0 ? '±¥0 (過不足なし)' : cashVariance > 0 ? `+${yen(cashVariance)}` : `-${yen(Math.abs(cashVariance))}`}
              </div>
            </div>

            <div style={{ marginBottom: '1rem' }}>
              <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, color: '#4b5563', marginBottom: '4px' }}>
                締め備考・引継ぎ事項 (Notes)
              </label>
              <textarea
                rows={2}
                placeholder="過不足の理由や夜勤への引き継ぎメモなど…"
                value={closeShiftNotes}
                onChange={e => setCloseShiftNotes(e.target.value)}
                style={{ width: '100%', padding: '8px', borderRadius: '6px', border: '1px solid #d1d5db', fontSize: '0.85rem', boxSizing: 'border-box' }}
              />
            </div>

            <button
              type="button"
              onClick={handleCloseShift}
              style={{
                width: '100%',
                padding: '12px',
                backgroundColor: '#dc2626',
                color: '#fff',
                border: 'none',
                borderRadius: '8px',
                fontSize: '1rem',
                fontWeight: 800,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '8px',
                boxShadow: '0 2px 6px rgba(220, 38, 38, 0.3)',
                marginBottom: '1rem'
              }}
            >
              <ShieldCheck size={18} /> 本日のレジ締めを実行 (Close & Print Z-Report)
            </button>

            {/* Recent Cash Movements */}
            {movements.length > 0 && (
              <div style={{ borderTop: '1px solid #e5e7eb', paddingTop: '1rem' }}>
                <h4 style={{ margin: '0 0 8px', fontSize: '0.9rem', fontWeight: 700, color: '#374151' }}>
                  直近の入出金履歴 ({movements.length}件)
                </h4>
                <div style={{ maxHeight: '140px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '4px' }}>
                  {movements.slice(0, 8).map(m => (
                    <div key={m.id} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.75rem', padding: '4px 6px', backgroundColor: '#f8fafc', borderRadius: '4px' }}>
                      <span>
                        <strong style={{ color: m.type === 'IN' ? '#16a34a' : '#dc2626' }}>{m.type === 'IN' ? '【入金】' : '【出金】'}</strong> {m.reason}
                      </span>
                      <strong>{m.type === 'IN' ? '+' : '-'}{yen(m.amount)}</strong>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

        </div>
      )}

      {/* =================================================================== */}
      {/* SUB-TAB 4: TRANSACTION JOURNAL (決済履歴)                          */}
      {/* =================================================================== */}
      {activeSubTab === 'history' && (
        <div style={{ backgroundColor: '#ffffff', borderRadius: '12px', border: '1px solid #e5e7eb', padding: '1.25rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem', flexWrap: 'wrap', gap: '10px' }}>
            <h3 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 700, color: '#111827' }}>
              本日決済ジャーナル ({filteredTransactions.length}件)
            </h3>

            <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
              <div style={{ position: 'relative' }}>
                <Search size={15} color="#9ca3af" style={{ position: 'absolute', left: 8, top: 8 }} />
                <input
                  type="text"
                  placeholder="注文番号、お客様、商品で検索…"
                  value={historySearch}
                  onChange={e => setHistorySearch(e.target.value)}
                  style={{ padding: '6px 10px 6px 28px', borderRadius: '6px', border: '1px solid #d1d5db', fontSize: '0.8rem', outline: 'none' }}
                />
              </div>

              <select
                value={historyFilter}
                onChange={e => setHistoryFilter(e.target.value)}
                style={{ padding: '6px 8px', borderRadius: '6px', border: '1px solid #d1d5db', fontSize: '0.8rem', outline: 'none' }}
              >
                <option value="ALL">全決済方法</option>
                {PAYMENT_METHODS.map(m => (
                  <option key={m.id} value={m.id}>{m.label}</option>
                ))}
              </select>

              <button
                type="button"
                onClick={handleExportExcel}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  padding: '6px 12px',
                  backgroundColor: '#15803d',
                  color: '#ffffff',
                  border: 'none',
                  borderRadius: '6px',
                  fontSize: '0.8rem',
                  fontWeight: 700,
                  cursor: 'pointer'
                }}
              >
                <FileSpreadsheet size={15} /> Excelエクスポート
              </button>
            </div>
          </div>

          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem', textAlign: 'left' }}>
              <thead>
                <tr style={{ backgroundColor: '#f8fafc', borderBottom: '2px solid #e2e8f0', color: '#475569' }}>
                  <th style={{ padding: '10px 12px' }}>決済時刻</th>
                  <th style={{ padding: '10px 12px' }}>伝票 / 席番</th>
                  <th style={{ padding: '10px 12px' }}>区分</th>
                  <th style={{ padding: '10px 12px' }}>お客様</th>
                  <th style={{ padding: '10px 12px' }}>商品内容</th>
                  <th style={{ padding: '10px 12px' }}>決済方法</th>
                  <th style={{ padding: '10px 12px', textAlign: 'right' }}>金額</th>
                  <th style={{ padding: '10px 12px', textAlign: 'center' }}>担当</th>
                  <th style={{ padding: '10px 12px', textAlign: 'center' }}>操作</th>
                </tr>
              </thead>
              <tbody>
                {filteredTransactions.length === 0 ? (
                  <tr>
                    <td colSpan={9} style={{ textAlign: 'center', padding: '2rem', color: '#9ca3af' }}>
                      決済履歴は見つかりませんでした
                    </td>
                  </tr>
                ) : (
                  filteredTransactions.map((tx) => (
                    <tr
                      key={tx.id}
                      style={{
                        borderBottom: '1px solid #f1f5f9',
                        backgroundColor: tx.isVoided ? '#fef2f2' : 'transparent',
                        opacity: tx.isVoided ? 0.6 : 1,
                      }}
                    >
                      <td style={{ padding: '10px 12px' }}>
                        {new Date(tx.timestamp).toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                      </td>
                      <td style={{ padding: '10px 12px', fontWeight: 700 }}>
                        {tx.tableNumber ? `🪑 ${tx.tableNumber}` : tx.orderNumber ? `#${formatOrderNumber(tx.orderNumber)}` : '店頭'}
                      </td>
                      <td style={{ padding: '10px 12px' }}>
                        <span style={{
                          padding: '2px 6px',
                          borderRadius: '4px',
                          fontSize: '0.75rem',
                          fontWeight: 600,
                          backgroundColor: tx.fulfillment === 'DINE_IN' ? '#ffedd5' : '#f1f5f9',
                          color: tx.fulfillment === 'DINE_IN' ? '#9a3412' : '#334155'
                        }}>
                          {tx.fulfillment === 'DINE_IN' ? '店内' : tx.fulfillment === 'DELIVERY' ? '配達' : '持帰'}
                        </span>
                      </td>
                      <td style={{ padding: '10px 12px' }}>{tx.customerName || '-'}</td>
                      <td style={{ padding: '10px 12px', maxWidth: '240px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={tx.itemsSummary}>
                        {tx.itemsSummary}
                      </td>
                      <td style={{ padding: '10px 12px' }}>
                        <span style={{ fontWeight: 700, color: PAYMENT_METHODS.find(m => m.id === tx.paymentMethod)?.color || '#111' }}>
                          {PAYMENT_METHODS.find(m => m.id === tx.paymentMethod)?.label || tx.paymentMethod}
                        </span>
                      </td>
                      <td style={{ padding: '10px 12px', textAlign: 'right', fontWeight: 800, color: tx.isVoided ? '#dc2626' : '#111827' }}>
                        {tx.isVoided && '(取消) '}{yen(tx.total)}
                      </td>
                      <td style={{ padding: '10px 12px', textAlign: 'center', color: '#64748b' }}>
                        {tx.staffName || 'Staff'}
                      </td>
                      <td style={{ padding: '10px 12px', textAlign: 'center' }}>
                        <button
                          type="button"
                          onClick={() => {
                            const recOrder: ReceiptOrder = {
                              number: tx.orderNumber || 999,
                              customerName: tx.customerName || '店頭客',
                              pickupAt: tx.timestamp,
                              fulfillment: tx.fulfillment || 'PICKUP',
                              note: `決済方法: ${tx.paymentMethod} | お預かり: ${yen(tx.amountTendered)} | お釣り: ${yen(tx.changeAmount)}`,
                              items: (tx.items || []).map(i => ({
                                nameJa: i.nameJa,
                                nameEn: i.nameEn,
                                quantity: i.quantity,
                                unitPrice: i.unitPrice,
                                lineTotal: i.lineTotal,
                              })),
                              subtotal: tx.subtotal,
                              tax: tx.tax,
                              taxRate: tx.taxRate,
                              total: tx.total,
                              grandTotal: tx.total,
                            };
                            printCustomerReceipt(recOrder);
                          }}
                          style={{ background: 'none', border: 'none', color: '#2563eb', cursor: 'pointer', padding: '2px 4px' }}
                          title="レシート再発行"
                        >
                          <Printer size={15} />
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* =================================================================== */}
      {/* MODAL 1: OPEN SHIFT                                                */}
      {/* =================================================================== */}
      {openShiftModal && (
        <div style={modalOverlayStyle}>
          <div style={modalBoxStyle}>
            <h3 style={{ margin: '0 0 12px', fontSize: '1.2rem', fontWeight: 800 }}>レジ開設 (Open Register Shift)</h3>
            <p style={{ margin: '0 0 16px', color: '#6b7280', fontSize: '0.85rem' }}>
              本日の営業を開始します。ドロワーに入れる釣銭準備金（開始金額）を入力してください。
            </p>

            <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 700, marginBottom: '6px' }}>
              釣銭準備金 (Starting Float)
            </label>
            <input
              type="number"
              value={startingFloatInput}
              onChange={e => setStartingFloatInput(e.target.value)}
              style={{ width: '100%', padding: '10px', fontSize: '1.25rem', fontWeight: 800, borderRadius: '8px', border: '1px solid #d1d5db', marginBottom: '16px', boxSizing: 'border-box' }}
            />

            <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
              <button
                type="button"
                onClick={() => setOpenShiftModal(false)}
                style={{ padding: '8px 16px', borderRadius: '6px', border: '1px solid #d1d5db', background: '#fff', cursor: 'pointer', fontWeight: 600 }}
              >
                キャンセル
              </button>
              <button
                type="button"
                onClick={handleOpenShift}
                style={{ padding: '8px 20px', borderRadius: '6px', border: 'none', background: '#16a34a', color: '#fff', cursor: 'pointer', fontWeight: 800 }}
              >
                レジを開設する
              </button>
            </div>
          </div>
        </div>
      )}

      {/* =================================================================== */}
      {/* MODAL 2: CASH IN / CASH OUT (入出金)                                */}
      {/* =================================================================== */}
      {movementModal && (
        <div style={modalOverlayStyle}>
          <div style={modalBoxStyle}>
            <h3 style={{ margin: '0 0 12px', fontSize: '1.2rem', fontWeight: 800 }}>釣銭補充・小口出金 (Cash Movement)</h3>
            
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', marginBottom: '14px' }}>
              <button
                type="button"
                onClick={() => setMovementType('OUT')}
                style={{
                  padding: '10px',
                  borderRadius: '6px',
                  fontWeight: 700,
                  border: `2px solid ${movementType === 'OUT' ? '#dc2626' : '#e5e7eb'}`,
                  backgroundColor: movementType === 'OUT' ? '#fef2f2' : '#fff',
                  color: movementType === 'OUT' ? '#dc2626' : '#4b5563',
                  cursor: 'pointer',
                }}
              >
                小口出金 (Cash Out)
              </button>
              <button
                type="button"
                onClick={() => setMovementType('IN')}
                style={{
                  padding: '10px',
                  borderRadius: '6px',
                  fontWeight: 700,
                  border: `2px solid ${movementType === 'IN' ? '#16a34a' : '#e5e7eb'}`,
                  backgroundColor: movementType === 'IN' ? '#f0fdf4' : '#fff',
                  color: movementType === 'IN' ? '#16a34a' : '#4b5563',
                  cursor: 'pointer',
                }}
              >
                釣銭補充・入金 (Cash In)
              </button>
            </div>

            <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 700, marginBottom: '4px' }}>
              金額 (円)
            </label>
            <input
              type="number"
              placeholder="例: 5000"
              value={movementAmount}
              onChange={e => setMovementAmount(e.target.value)}
              style={{ width: '100%', padding: '8px', fontSize: '1.1rem', fontWeight: 700, borderRadius: '6px', border: '1px solid #d1d5db', marginBottom: '12px', boxSizing: 'border-box' }}
            />

            <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 700, marginBottom: '4px' }}>
              理由 / 勘定科目
            </label>
            <select
              value={movementReason}
              onChange={e => setMovementReason(e.target.value)}
              style={{ width: '100%', padding: '8px', borderRadius: '6px', border: '1px solid #d1d5db', marginBottom: '12px', boxSizing: 'border-box' }}
            >
              <option value="食材買い出し">食材買い出し (緊急スーパー購入)</option>
              <option value="氷・備品購入">氷・消耗品・備品購入</option>
              <option value="釣銭補充">釣銭補充 (両替戻り)</option>
              <option value="配達用釣銭持ち出し">配達用釣銭持ち出し</option>
              <option value="銀行預け入れ">銀行預け入れ</option>
              <option value="その他">その他</option>
            </select>

            <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 700, marginBottom: '4px' }}>
              備考メモ
            </label>
            <input
              type="text"
              placeholder="レシート添付、購入品メモなど"
              value={movementMemo}
              onChange={e => setMovementMemo(e.target.value)}
              style={{ width: '100%', padding: '8px', borderRadius: '6px', border: '1px solid #d1d5db', marginBottom: '16px', boxSizing: 'border-box' }}
            />

            <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
              <button
                type="button"
                onClick={() => setMovementModal(false)}
                style={{ padding: '8px 16px', borderRadius: '6px', border: '1px solid #d1d5db', background: '#fff', cursor: 'pointer', fontWeight: 600 }}
              >
                キャンセル
              </button>
              <button
                type="button"
                onClick={handleRecordMovement}
                style={{ padding: '8px 20px', borderRadius: '6px', border: 'none', background: '#111827', color: '#fff', cursor: 'pointer', fontWeight: 800 }}
              >
                登録する
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}

// ── Components & Style Helpers ──────────────────────────────────────────────

function MetricCard({ icon, label, value, sublabel, bg, border }: { icon: any; label: string; value: string; sublabel: string; bg: string; border: string }) {
  return (
    <div style={{
      backgroundColor: bg,
      border: `1px solid ${border}`,
      borderRadius: '12px',
      padding: '1.1rem',
      display: 'flex',
      alignItems: 'flex-start',
      gap: '12px',
      boxShadow: '0 1px 3px rgba(0,0,0,0.02)'
    }}>
      <div style={{ padding: '8px', borderRadius: '10px', backgroundColor: '#ffffff', boxShadow: '0 1px 2px rgba(0,0,0,0.05)' }}>
        {icon}
      </div>
      <div style={{ overflow: 'hidden' }}>
        <span style={{ fontSize: '0.8rem', fontWeight: 600, color: '#4b5563', display: 'block' }}>{label}</span>
        <strong style={{ fontSize: '1.35rem', fontWeight: 800, color: '#111827', display: 'block', marginTop: '2px', lineHeight: 1.2 }}>{value}</strong>
        <small style={{ fontSize: '0.75rem', color: '#6b7280', display: 'block', marginTop: '4px', textOverflow: 'ellipsis', overflow: 'hidden', whiteSpace: 'nowrap' }}>{sublabel}</small>
      </div>
    </div>
  );
}

function SubTabButton({ active, onClick, icon, label, badge }: { active: boolean; onClick: () => void; icon: any; label: string; badge?: number }) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: '8px',
        padding: '10px 16px',
        border: 'none',
        borderBottom: `3px solid ${active ? '#16a34a' : 'transparent'}`,
        backgroundColor: 'transparent',
        color: active ? '#16a34a' : '#6b7280',
        fontWeight: active ? 700 : 500,
        fontSize: '0.9rem',
        cursor: 'pointer',
        transition: 'all 0.15s ease'
      }}
    >
      {icon}
      <span>{label}</span>
      {typeof badge === 'number' && (
        <span style={{
          backgroundColor: active ? '#16a34a' : '#e5e7eb',
          color: active ? '#ffffff' : '#4b5563',
          padding: '1px 6px',
          borderRadius: '9999px',
          fontSize: '0.75rem',
          fontWeight: 700
        }}>
          {badge}
        </span>
      )}
    </button>
  );
}

function actionBtnStyle(bg: string, color: string): CSSProperties {
  return {
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
    padding: '7px 14px',
    backgroundColor: bg,
    color,
    border: 'none',
    borderRadius: '8px',
    fontSize: '0.825rem',
    fontWeight: 700,
    cursor: 'pointer',
    boxShadow: '0 1px 2px rgba(0,0,0,0.05)',
  };
}

const modalOverlayStyle: CSSProperties = {
  position: 'fixed',
  inset: 0,
  backgroundColor: 'rgba(0,0,0,0.5)',
  zIndex: 1000,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  padding: '1rem',
};

const modalBoxStyle: CSSProperties = {
  backgroundColor: '#ffffff',
  borderRadius: '12px',
  padding: '1.5rem',
  maxWidth: '460px',
  width: '100%',
  boxShadow: '0 10px 25px rgba(0,0,0,0.2)',
};
