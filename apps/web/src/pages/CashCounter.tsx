import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'react-hot-toast';
import {
  Banknote,
  Coins,
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
  Search,
  UtensilsCrossed,
  X,
  Maximize,
  Minimize,
  Volume2,
  VolumeX,
  ExternalLink,
  WifiOff,
  FileText,
  Check,
  Building2,
  Landmark,
  Percent,
  RotateCcw
} from 'lucide-react';
import { apiFetch, errorMessage, getPublic } from '../lib/api';
import { yen, formatOrderNumber } from '../lib/format';
import { DEFAULT_STORE_LOCATIONS, resolveOrderStore, type StoreLocation } from '../lib/stores';
import { printCustomerReceipt, printBillInvoice, printHtml, DEFAULT_STORE_SETTINGS, type ReceiptOrder } from '../lib/receipt';
import './cash-counter.css';

const TIMEZONE = 'Asia/Tokyo';
const POLL_MS = 5_000;
const SETTINGS_KEY = 'adarsha_cash_counter_prefs';

export type PaymentMethod = 'CASH' | 'CARD' | 'BANK_TRANSFER' | 'PAYPAY' | 'IC' | 'ID_QUICPAY' | 'INVOICE';

const PAYMENT_METHODS: Array<{ id: PaymentMethod; label: string; icon: any; color: string; bg: string }> = [
  { id: 'CASH', label: '現金 (Cash)', icon: Banknote, color: '#22c55e', bg: 'rgba(34, 197, 94, 0.15)' },
  { id: 'CARD', label: 'クレジットカード', icon: CreditCard, color: '#3b82f6', bg: 'rgba(59, 130, 246, 0.15)' },
  { id: 'BANK_TRANSFER', label: '銀行振込 (振込)', icon: Landmark, color: '#f59e0b', bg: 'rgba(245, 158, 11, 0.15)' },
  { id: 'PAYPAY', label: 'PayPay / QRコード', icon: QrCode, color: '#ef4444', bg: 'rgba(239, 68, 68, 0.15)' },
  { id: 'IC', label: '交通系IC (Suica等)', icon: Smartphone, color: '#06b6d4', bg: 'rgba(6, 182, 212, 0.15)' },
  { id: 'ID_QUICPAY', label: 'iD / QUICPay', icon: Smartphone, color: '#a855f7', bg: 'rgba(168, 85, 247, 0.15)' },
  { id: 'INVOICE', label: '売掛・請求書払い', icon: Receipt, color: '#94a3b8', bg: 'rgba(148, 163, 184, 0.15)' },
];

export type DiscountType = 'NONE' | 'PERCENT' | 'FIXED' | 'ROUND_10' | 'ROUND_100';

const OFFER_PRESETS = [
  { id: 'rainy', label: '🌧️ 雨の日10%OFF', type: 'PERCENT' as const, value: 10, reason: '雨の日特別10%OFF' },
  { id: 'vip', label: '🤝 常連様5%OFF', type: 'PERCENT' as const, value: 5, reason: '常連様・VIPご優待5%OFF' },
  { id: 'flyer', label: '🏷️ チラシ持参 (-¥200)', type: 'FIXED' as const, value: 200, reason: 'チラシ持参クーポン' },
  { id: 'lunch_set', label: '🍱 セット割 (-¥100)', type: 'FIXED' as const, value: 100, reason: 'ランチ特別セット割' },
  { id: 'staff', label: '👔 スタッフ20%OFF', type: 'PERCENT' as const, value: 20, reason: 'スタッフ・関係者20%OFF' },
  { id: 'round10', label: '🪙 10円未満端数切捨', type: 'ROUND_10' as const, value: 0, reason: '端数サービス(10円未満)' },
  { id: 'round100', label: '🪙 100円未満端数切捨', type: 'ROUND_100' as const, value: 0, reason: '端数サービス(100円未満)' },
];

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

const PRESET_QUICK_ITEMS = [
  { id: 'quick-curry-bento', nameJa: '日替わりカレー弁当', price: 850, taxRate: 8 },
  { id: 'quick-chicken-bento', nameJa: 'チキンカレー弁当', price: 950, taxRate: 8 },
  { id: 'quick-mutton-bento', nameJa: 'マトンカレー弁当', price: 1050, taxRate: 8 },
  { id: 'quick-butter-chicken', nameJa: 'バターチキンカレー単品', price: 980, taxRate: 8 },
  { id: 'quick-cheese-naan', nameJa: 'チーズナン', price: 580, taxRate: 8 },
  { id: 'quick-plain-naan', nameJa: 'プレーンナン', price: 350, taxRate: 8 },
  { id: 'quick-samosa', nameJa: 'サモサ (2個)', price: 480, taxRate: 8 },
  { id: 'quick-tandoori', nameJa: 'タンドリーチキン (2個)', price: 600, taxRate: 8 },
  { id: 'quick-mango-lassi', nameJa: 'マンゴーラッシー', price: 380, taxRate: 8 },
  { id: 'quick-chai', nameJa: 'マサラチャイ (Hot/Ice)', price: 300, taxRate: 8 },
  { id: 'quick-buffet', nameJa: 'ランチビュッフェ', price: 1200, taxRate: 10 },
  { id: 'quick-dinner-set', nameJa: 'アダルサスペシャルセット', price: 1850, taxRate: 10 },
];

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

export default function CashCounter() {
  const navigate = useNavigate();
  const [user, setUser] = useState<{ name: string; role: string } | null>(null);
  const [stores, setStores] = useState<StoreLocation[]>(DEFAULT_STORE_LOCATIONS);
  const [offline, setOffline] = useState(false);
  const [started, setStarted] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);
  const [sound, setSound] = useState(() => {
    try {
      const saved = localStorage.getItem(SETTINGS_KEY);
      return saved ? JSON.parse(saved).sound !== false : true;
    } catch {
      return true;
    }
  });

  const [filter, setFilter] = useState<'ALL' | 'DINE_IN' | 'PICKUP' | 'DELIVERY'>('ALL');
  const [paymentFilter, setPaymentFilter] = useState<'ALL' | 'UNPAID' | 'PAID'>('ALL');
  const [storeFilter, setStoreFilter] = useState('ALL');
  const [now, setNow] = useState(() => Date.now());

  // Register state
  const [shift, setShift] = useState<any>(null);
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
  const [orders, setOrders] = useState<any[]>([]);
  const [transactions, setTransactions] = useState<any[]>([]);
  const [movements, setMovements] = useState<any[]>([]);

  // Checkout Modal State
  const [activeCheckoutOrder, setActiveCheckoutOrder] = useState<any | null>(null);
  const [settlementMethod, setSettlementMethod] = useState<PaymentMethod>('CASH');
  const [amountTenderedStr, setAmountTenderedStr] = useState('');
  const [settling, setSettling] = useState(false);
  const [checkoutStep, setCheckoutStep] = useState<'CALC' | 'CONFIRM' | 'SUCCESS'>('CALC');
  const [markOrderCompleted, setMarkOrderCompleted] = useState(true);
  const [autoPrintReceipt, setAutoPrintReceipt] = useState(false);
  const [lastSettledResult, setLastSettledResult] = useState<{
    order: ReceiptOrder;
    change: number;
    tendered: number;
    methodLabel: string;
    discount?: number;
    discountReason?: string;
  } | null>(null);

  // Discount & Offer state
  const [discountType, setDiscountType] = useState<DiscountType>('NONE');
  const [discountValue, setDiscountValue] = useState<number>(0);
  const [discountReason, setDiscountReason] = useState<string>('');

  // Bill Invoice Preview Modal
  const [billPreviewOrder, setBillPreviewOrder] = useState<any | null>(null);

  // Modals & Panels
  const [createBillModal, setCreateBillModal] = useState(false);
  const [billFulfillment, setBillFulfillment] = useState<'DINE_IN' | 'PICKUP' | 'DELIVERY'>('DINE_IN');
  const [billTableNumber, setBillTableNumber] = useState('1');
  const [billCustomerName, setBillCustomerName] = useState('');
  const [billPhone, setBillPhone] = useState('');
  const [billNote, setBillNote] = useState('');
  const [billCart, setBillCart] = useState<Array<{ item: any; quantity: number }>>([]);
  const [customItemName, setCustomItemName] = useState('');
  const [customItemPrice, setCustomItemPrice] = useState('');
  const [creatingBill, setCreatingBill] = useState(false);

  // Non-cash payment authorization flag
  const [nonCashConfirmed, setNonCashConfirmed] = useState(false);

  const [movementModal, setMovementModal] = useState(false);
  const [movementType, setMovementType] = useState<'IN' | 'OUT'>('OUT');
  const [movementAmount, setMovementAmount] = useState('');
  const [movementReason, setMovementReason] = useState('食材買い出し');

  const [balancingModal, setBalancingModal] = useState(false);
  const [denominationsCount, setDenominationsCount] = useState<Record<number, number>>({
    10000: 0, 5000: 0, 2000: 0, 1000: 0, 500: 0, 100: 0, 50: 0, 10: 0, 5: 0, 1: 0
  });
  const [closeNotes, setCloseNotes] = useState('');

  const [historyModal, setHistoryModal] = useState(false);
  const [historySearch, setHistorySearch] = useState('');

  const audioRef = useRef<AudioContext | null>(null);

  // ── WakeLock & Fullscreen ─────────────────────────────────────────────────

  const requestWakeLock = useCallback(async () => {
    try {
      if ('wakeLock' in navigator) {
        await (navigator as any).wakeLock.request('screen');
      }
    } catch {}
  }, []);

  const toggleFullscreen = useCallback(() => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().then(() => setFullscreen(true)).catch(() => {});
    } else {
      document.exitFullscreen().then(() => setFullscreen(false)).catch(() => {});
    }
  }, []);

  const playChime = useCallback(() => {
    if (!sound) return;
    try {
      const ctx = audioRef.current || new (window.AudioContext || (window as any).webkitAudioContext)();
      audioRef.current = ctx;
      if (ctx.state === 'suspended') ctx.resume();

      const osc1 = ctx.createOscillator();
      const osc2 = ctx.createOscillator();
      const gain = ctx.createGain();

      osc1.type = 'sine';
      osc1.frequency.setValueAtTime(987.77, ctx.currentTime);
      osc1.frequency.exponentialRampToValueAtTime(1318.51, ctx.currentTime + 0.08);

      osc2.type = 'triangle';
      osc2.frequency.setValueAtTime(1318.51, ctx.currentTime + 0.08);
      osc2.frequency.setValueAtTime(1760, ctx.currentTime + 0.16);

      gain.gain.setValueAtTime(0.2, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.45);

      osc1.connect(gain);
      osc2.connect(gain);
      gain.connect(ctx.destination);

      osc1.start(ctx.currentTime);
      osc2.start(ctx.currentTime + 0.08);
      osc1.stop(ctx.currentTime + 0.45);
      osc2.stop(ctx.currentTime + 0.45);
    } catch {}
  }, [sound]);

  const handleStart = () => {
    setStarted(true);
    requestWakeLock();
    try {
      const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
      audioRef.current = ctx;
      ctx.resume();
    } catch {}
  };

  // ── Helper: Check if order is paid ─────────────────────────────────────────
  const getOrderTransaction = useCallback((order: any) => {
    if (order.transaction && !order.transaction.isVoided) return order.transaction;
    return transactions.find(t => (t.orderId === order.id || (t.orderNumber && Number(t.orderNumber) === Number(order.number))) && !t.isVoided);
  }, [transactions]);

  const isOrderPaid = useCallback((order: any) => {
    if (order.paymentStatus === 'PAID') return true;
    if (Boolean(getOrderTransaction(order))) return true;
    if (order.status === 'COMPLETED') return true;
    return false;
  }, [getOrderTransaction]);

  const createReceiptOrderFromOrder = useCallback((
    order: any,
    change = 0,
    tendered = 0,
    method?: string,
    manualDiscount = 0,
    manualDiscountReason?: string
  ): ReceiptOrder => {
    const branch = resolveOrderStore(order, stores);
    const tableNum = order.tableNumber || extractTableNumber(order.note);
    const baseTot = order.grandTotal ?? order.total;
    const finalTot = Math.max(0, baseTot - manualDiscount);
    const finalTendered = tendered > 0 ? tendered : finalTot;
    const roundInfo = order.orderCount > 1 ? `(${order.orderCount}回注文合算 伝票#${order.orderNumbers ? order.orderNumbers.map((n: number) => formatOrderNumber(n)).join(', #') : ''})` : null;
    return {
      id: order.id,
      number: order.number,
      customerName: order.customerName,
      phone: order.phone,
      note: [
        tableNum ? `[テーブル: ${tableNum}]` : null,
        roundInfo,
        method ? `決済方法: ${method}` : null,
        manualDiscount > 0 ? `値引: -${yen(manualDiscount)}${manualDiscountReason ? ` (${manualDiscountReason})` : ''}` : null,
        finalTendered > 0 ? `お預かり: ${yen(finalTendered)}` : null,
        change > 0 ? `お釣り: ${yen(change)}` : null,
        branch ? `【受取店舗: ${branch.name}】` : null,
      ].filter(Boolean).join(' '),
      pickupAt: order.pickupAt,
      fulfillment: order.fulfillment || 'PICKUP',
      store: branch,
      storeId: branch?.id,
      storeName: branch?.name,
      storeAddress: branch?.address,
      storePhone: branch?.phone,
      items: (order.items || []).map((i: any) => ({
        nameJa: i.nameJa,
        nameEn: i.nameEn,
        quantity: i.quantity,
        unitPrice: i.unitPrice ?? Math.round((i.lineTotal || 0) / (i.quantity || 1)),
        lineTotal: i.lineTotal,
        options: i.options,
      })),
      subtotal: order.subtotal,
      tax: order.tax,
      taxRate: order.taxRate || (order.fulfillment === 'DINE_IN' ? 10 : 8),
      total: order.total,
      grandTotal: finalTot,
      deliveryFee: order.deliveryFee,
      offerTitle: manualDiscount > 0 ? (manualDiscountReason || 'レジ即時割引') : order.offer?.titleJa,
      offerDiscount: (order.offer?.discount || 0) + manualDiscount,
      rewardTitle: order.reward?.titleJa,
      rewardDiscount: order.reward?.discount,
      pointsUsed: order.pointsUsed,
      pointsDiscount: order.pointsDiscount,
    };
  }, [stores]);

  // ── Load Server Data ──────────────────────────────────────────────────────

  const loadData = useCallback(async () => {
    try {
      const [regRes, ordRes] = await Promise.all([
        apiFetch('/api/v1/cash-register'),
        apiFetch('/api/v1/orders?scope=cashier'),
      ]);

      if (regRes.status === 401 || ordRes.status === 401) {
        navigate('/login', { replace: true });
        return;
      }

      if (regRes.ok) {
        const regData = await regRes.json();
        setShift(regData.shift);
        if (regData.stats) setStats(regData.stats);
        if (Array.isArray(regData.todayTransactions)) setTransactions(regData.todayTransactions);
        if (Array.isArray(regData.recentMovements)) setMovements(regData.recentMovements);
      }

      if (ordRes.ok) {
        const ordData = await ordRes.json();
        if (Array.isArray(ordData)) setOrders(ordData);
      }

      setOffline(false);
    } catch {
      setOffline(true);
    }
  }, [navigate]);

  useEffect(() => {
    apiFetch('/api/v1/auth/me')
      .then(r => r.ok ? r.json() : Promise.reject())
      .then(d => setUser(d.user))
      .catch(() => navigate('/login', { replace: true }));

    getPublic<any>('/api/v1/stores')
      .then(d => {
        if (Array.isArray(d?.stores) && d.stores.length > 0) setStores(d.stores);
        else if (Array.isArray(d) && d.length > 0) setStores(d);
      })
      .catch(() => {});
  }, [navigate]);

  useEffect(() => {
    if (!user) return;
    loadData();
    const interval = setInterval(loadData, POLL_MS);
    const clockInterval = setInterval(() => setNow(Date.now()), 1000);
    const onVis = () => document.visibilityState === 'visible' && loadData();
    document.addEventListener('visibilitychange', onVis);
    return () => {
      clearInterval(interval);
      clearInterval(clockInterval);
      document.removeEventListener('visibilitychange', onVis);
    };
  }, [user, loadData]);

  // Base total and live discount calculations for active checkout
  const baseTotal = useMemo(() => {
    if (!activeCheckoutOrder) return 0;
    return activeCheckoutOrder.grandTotal ?? activeCheckoutOrder.total ?? 0;
  }, [activeCheckoutOrder]);

  const computedDiscountAmount = useMemo(() => {
    if (!activeCheckoutOrder || discountType === 'NONE') return 0;
    if (discountType === 'PERCENT') {
      const pct = Math.min(100, Math.max(0, discountValue));
      return Math.round((baseTotal * pct) / 100);
    }
    if (discountType === 'FIXED') {
      return Math.min(baseTotal, Math.max(0, discountValue));
    }
    if (discountType === 'ROUND_10') {
      return baseTotal % 10;
    }
    if (discountType === 'ROUND_100') {
      return baseTotal % 100;
    }
    return 0;
  }, [activeCheckoutOrder, discountType, discountValue, baseTotal]);

  const finalPayableTotal = useMemo(() => {
    return Math.max(0, baseTotal - computedDiscountAmount);
  }, [baseTotal, computedDiscountAmount]);

  // Initialize checkout modal inputs (amount tendered starts blank for manual entry)
  useEffect(() => {
    if (activeCheckoutOrder) {
      setAmountTenderedStr('');
      setNonCashConfirmed(false);
      setDiscountType('NONE');
      setDiscountValue(0);
      setDiscountReason('');
      setCheckoutStep('CALC');
    }
  }, [activeCheckoutOrder]);

  // ── Settle Order ──────────────────────────────────────────────────────────

  const handleSettleActiveOrder = async () => {
    if (!activeCheckoutOrder) return;
    const baseTot = baseTotal;
    const discountAmt = computedDiscountAmount;
    const finalTot = finalPayableTotal;
    const tendered = parseInt(amountTenderedStr, 10);

    if (settlementMethod === 'CASH') {
      if (!amountTenderedStr.trim() || isNaN(tendered)) {
        toast.error('お預かり金額を入力してください');
        return;
      }
      if (tendered < finalTot) {
        toast.error(`お預かり金額が不足しています（不足: ${yen(finalTot - tendered)}）`);
        return;
      }
    } else {
      if (!nonCashConfirmed) {
        toast.error('決済端末での受領確認を行ってください');
        return;
      }
    }

    const finalTendered = settlementMethod === 'CASH' ? tendered : finalTot;
    const change = settlementMethod === 'CASH' ? Math.max(0, finalTendered - finalTot) : 0;
    const tableNum = extractTableNumber(activeCheckoutOrder.note);
    const orderBranch = resolveOrderStore(activeCheckoutOrder, stores);

    setSettling(true);
    try {
      const itemsSummary = activeCheckoutOrder.items.map((i: any) => `${i.nameJa || i.nameEn} × ${i.quantity}`).join(', ');

      const res = await apiFetch('/api/v1/cash-register/transaction', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          orderId: activeCheckoutOrder.id,
          orderIds: activeCheckoutOrder.orderIds || [activeCheckoutOrder.id],
          orderNumber: activeCheckoutOrder.number,
          tableNumber: tableNum || activeCheckoutOrder.tableNumber,
          type: 'ORDER_SETTLEMENT',
          fulfillment: activeCheckoutOrder.fulfillment || 'PICKUP',
          customerName: activeCheckoutOrder.customerName,
          itemsSummary,
          items: activeCheckoutOrder.items.map((i: any) => ({
            nameJa: i.nameJa,
            nameEn: i.nameEn,
            quantity: i.quantity,
            unitPrice: i.unitPrice ?? Math.round(i.lineTotal / i.quantity),
            lineTotal: i.lineTotal,
          })),
          subtotal: activeCheckoutOrder.subtotal || Math.round(finalTot / 1.1),
          tax: activeCheckoutOrder.tax || Math.round(finalTot - finalTot / 1.1),
          taxRate: activeCheckoutOrder.taxRate || (activeCheckoutOrder.fulfillment === 'DINE_IN' ? 10 : 8),
          originalTotal: baseTot,
          discount: discountAmt,
          discountReason: discountAmt > 0 ? (discountReason || 'レジ即時割引') : undefined,
          total: finalTot,
          paymentMethod: settlementMethod,
          amountTendered: finalTendered,
          changeAmount: change,
          storeId: orderBranch?.id || (storeFilter !== 'ALL' ? storeFilter : undefined),
          storeName: orderBranch?.name,
          markCompleted: true,
        }),
      });

      if (!res.ok) throw new Error(await errorMessage(res, '会計処理に失敗しました'));

      playChime();
      toast.success(`🎉 会計完了！ お釣り: ${yen(change)}`);

      const methodLabel = PAYMENT_METHODS.find(m => m.id === settlementMethod)?.label || settlementMethod;
      const receiptOrder = createReceiptOrderFromOrder(
        activeCheckoutOrder,
        change,
        finalTendered,
        methodLabel,
        discountAmt,
        discountReason
      );

      if (autoPrintReceipt) {
        printCustomerReceipt(receiptOrder);
      }

      setLastSettledResult({
        order: receiptOrder,
        change,
        tendered: finalTendered,
        methodLabel,
        discount: discountAmt,
        discountReason,
      });
      setCheckoutStep('SUCCESS');
      loadData();
    } catch (err: any) {
      toast.error(err.message || 'エラーが発生しました');
    } finally {
      setSettling(false);
    }
  };

  // ── Unpaid Bill Creation (Walk-in, Dining-in table, Pickup, Delivery) ─────

  const billTaxRate = billFulfillment === 'DINE_IN' ? 10 : 8;
  const billSubtotal = useMemo(() => {
    return billCart.reduce((sum, l) => sum + (l.item.price || 0) * l.quantity, 0);
  }, [billCart]);
  const billTax = Math.round((billSubtotal * billTaxRate) / 100);
  const billGrandTotal = billSubtotal + billTax;

  const handleCreateUnpaidBill = async (openCheckoutImmediately = false) => {
    if (billCart.length === 0) {
      toast.error('商品を選択してください');
      return;
    }
    const selectedBranch = stores.find(s => s.id === storeFilter) || stores[0] || DEFAULT_STORE_LOCATIONS[0];
    const tableNum = billFulfillment === 'DINE_IN' ? billTableNumber.trim() : '';
    const custName = billCustomerName.trim() || (tableNum ? `テーブル ${tableNum}` : (billFulfillment === 'DINE_IN' ? '店内客' : '店頭客'));

    setCreatingBill(true);
    try {
      const res = await apiFetch('/api/v1/cash-register/bill', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fulfillment: billFulfillment,
          tableNumber: tableNum || undefined,
          customerName: custName,
          phone: billPhone.trim() || '00-0000-0000',
          note: billNote.trim() || undefined,
          storeId: selectedBranch?.id,
          storeName: selectedBranch?.name,
          storeAddress: selectedBranch?.address,
          storePhone: selectedBranch?.phone,
          taxRate: billTaxRate,
          items: billCart.map(l => ({
            itemId: l.item.id,
            id: l.item.id,
            nameJa: l.item.nameJa,
            nameEn: l.item.nameEn || l.item.nameJa,
            price: l.item.price,
            unitPrice: l.item.price,
            quantity: l.quantity,
          })),
        }),
      });

      if (!res.ok) throw new Error(await errorMessage(res, '伝票発行に失敗しました'));
      const data = await res.json();
      const createdOrder = data.order;

      toast.success(`🎉 伝票 #${formatOrderNumber(createdOrder.number)} を発行しました（未精算）`);
      setCreateBillModal(false);
      setBillCart([]);
      setBillCustomerName('');
      setBillTableNumber('1');
      setBillNote('');

      await loadData();

      if (openCheckoutImmediately && createdOrder) {
        setActiveCheckoutOrder(createdOrder);
        setCheckoutStep('CALC');
        setAmountTenderedStr('');
        setNonCashConfirmed(false);
      }
    } catch (err: any) {
      toast.error(err.message || 'エラーが発生しました');
    } finally {
      setCreatingBill(false);
    }
  };

  // ── Cash Balancing & Close Shift ──────────────────────────────────────────

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
          notes: closeNotes,
        }),
      });
      if (!res.ok) throw new Error(await errorMessage(res, 'レジ締めに失敗しました'));
      const data = await res.json();
      toast.success('本日のレジ締めが完了しました！');
      setBalancingModal(false);

      // Print Z-Report
      const branch = stores.find(s => s.id === storeFilter) || stores[0];
      const storeName = branch?.name || DEFAULT_STORE_SETTINGS.storeNameJa;
      const reportHtml = `
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
  <div class="center">${new Date().toLocaleString('ja-JP')}</div>
  <div class="divider"></div>
  <div class="row"><span>レジ担当:</span><span>${data.shift?.closedBy || 'Staff'}</span></div>
  <div class="row"><span>締め日時:</span><span>${new Date().toLocaleTimeString('ja-JP')}</span></div>
  <div class="double-divider"></div>
  <div class="row bold"><span>本日売上合計:</span><span>${yen(stats.todaySales)}</span></div>
  <div class="row"><span>└ 現金売上:</span><span>${yen(stats.cashSales)}</span></div>
  <div class="row"><span>└ キャッシュレス売上:</span><span>${yen(stats.nonCashSales)}</span></div>
  <div class="row"><span>取引件数:</span><span>${stats.transactionCount} 件</span></div>
  <div class="divider"></div>
  <div class="row"><span>釣銭準備金 (開始時):</span><span>${yen(stats.startingFloat)}</span></div>
  <div class="row"><span>+ 入金 (釣銭補充等):</span><span>${yen(stats.cashIn)}</span></div>
  <div class="row"><span>- 出金 (小口経費等):</span><span>${yen(stats.cashOut)}</span></div>
  <div class="row bold"><span>理論現金有高:</span><span>${yen(stats.expectedDrawerCash)}</span></div>
  <div class="row bold"><span>実査現金有高:</span><span>${yen(actualCountedCash)}</span></div>
  <div class="divider"></div>
  <div class="row bold large">
    <span>過不足金:</span>
    <span>${cashVariance === 0 ? '±¥0 (一致)' : cashVariance > 0 ? `+${yen(cashVariance)} (過剰)` : `-${yen(Math.abs(cashVariance))} (不足)`}</span>
  </div>
  <div class="double-divider"></div>
  <div class="center">本日もお疲れ様でした。</div>
</body>
</html>`;
      printHtml(reportHtml);

      loadData();
    } catch (err: any) {
      toast.error(err.message || 'エラーが発生しました');
    }
  };

  // ── Branch & Stats Calculation ────────────────────────────────────────────

  const currentBranch = useMemo(() => {
    if (storeFilter === 'ALL') return null;
    return stores.find(s => s.id === storeFilter) || null;
  }, [storeFilter, stores]);

  const activeStats = useMemo(() => {
    if (storeFilter === 'ALL') return stats;
    const branchTxs = transactions.filter(t => !t.isVoided && (t.storeId === storeFilter || t.storeName === currentBranch?.name));
    const cash = branchTxs.filter(t => t.paymentMethod === 'CASH').reduce((sum, t) => sum + (t.total || 0), 0);
    const nonCash = branchTxs.filter(t => t.paymentMethod !== 'CASH').reduce((sum, t) => sum + (t.total || 0), 0);
    const total = cash + nonCash;
    return {
      todaySales: total,
      cashSales: cash,
      nonCashSales: nonCash,
      transactionCount: branchTxs.length,
      cashIn: stats.cashIn,
      cashOut: stats.cashOut,
      startingFloat: stats.startingFloat,
      expectedDrawerCash: stats.startingFloat + cash,
    };
  }, [stats, storeFilter, transactions, currentBranch]);

  // ── Table Reset / Free Table Handler ──────────────────────────────────────
  const handleResetTable = async (tableNum: string, storeId?: string) => {
    if (!window.confirm(`テーブル ${tableNum} の注文をすべて完了済にし、空席としてリセットしますか？\n（次の新しいお客様をご案内できるようになります）`)) {
      return;
    }
    try {
      const res = await apiFetch('/api/v1/tables/reset', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tableNumber: tableNum,
          storeId,
        }),
      });
      if (res.ok) {
        toast.success(`テーブル ${tableNum} を空席にリセットしました！`, { icon: '🪑' });
        await loadData();
      } else {
        toast.error('テーブルのリセットに失敗しました');
      }
    } catch {
      toast.error('通信エラーが発生しました');
    }
  };

  // ── Consolidated Table Orders ──────────────────────────────────────────────
  // When the same table orders multiple times (rounds: curry, naan, dessert, etc.),
  // consolidate all rounds into a single unified invoice/bill ticket.
  const consolidatedOrders = useMemo(() => {
    const result: any[] = [];
    const tableGroups: Record<string, any[]> = {};

    orders.forEach(o => {
      const tableNum = extractTableNumber(o.note) || (o.fulfillment === 'DINE_IN' ? (o.tableNumber || '1') : null);
      if (!tableNum && o.fulfillment !== 'DINE_IN') {
        // Non-table order (takeout, delivery)
        const isPaid = isOrderPaid(o);
        const grandTotal = o.grandTotal ?? o.total;
        result.push({
          ...o,
          orderIds: [o.id],
          orderNumbers: [o.number],
          orderCount: 1,
          isConsolidatedTable: false,
          paymentStatus: isPaid ? 'PAID' : 'UNPAID',
          tableNumber: null,
          grandTotal,
          items: o.items || [],
          rawOrders: [o],
        });
        return;
      }

      // Dine-in Table order
      const branch = resolveOrderStore(o, stores);
      const storeKey = branch?.id || 'main';
      const isPaid = isOrderPaid(o);

      // Group table orders:
      // - Unpaid orders for this table always group into a single consolidated active bill.
      // - Paid orders for this table group by table sitting session.
      const sittingDate = new Date(o.createdAt).toISOString().slice(0, 10);
      const groupKey = isPaid
        ? `${storeKey}_table_${tableNum}_PAID_${sittingDate}`
        : `${storeKey}_table_${tableNum}_UNPAID`;

      if (!tableGroups[groupKey]) {
        tableGroups[groupKey] = [];
      }
      tableGroups[groupKey].push(o);
    });

    // Consolidate each table group
    Object.values(tableGroups).forEach(group => {
      group.sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
      const primary = group[0];
      const latest = group[group.length - 1];
      const tableNum = extractTableNumber(primary.note) || (primary.fulfillment === 'DINE_IN' ? (primary.tableNumber || '1') : '1');
      const branch = resolveOrderStore(primary, stores);
      const anyUnpaid = group.some(o => !isOrderPaid(o));
      const isPaid = !anyUnpaid;

      const mergedItems: any[] = [];
      let subtotal = 0;
      let tax = 0;
      let total = 0;
      let grandTotal = 0;
      let pointsUsed = 0;
      let pointsDiscount = 0;
      let deliveryFee = 0;
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
        if (ord.pointsUsed) pointsUsed += ord.pointsUsed;
        if (ord.pointsDiscount) pointsDiscount += ord.pointsDiscount;
        if (ord.deliveryFee) deliveryFee += ord.deliveryFee;

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

      // Aggregate transaction info if paid
      let bestTx: any = null;
      let txTendered = 0;
      let txChange = 0;
      let txDiscount = 0;
      let txTotal = 0;

      group.forEach(ord => {
        const tx = getOrderTransaction(ord);
        if (tx) {
          if (!bestTx) bestTx = tx;
          txTotal += (tx.total || 0);
          txTendered += (tx.amountTendered || 0);
          txChange += (tx.changeAmount || 0);
          txDiscount += (tx.discount || 0);
        }
      });

      const consolidatedTx = bestTx ? {
        ...bestTx,
        total: txTotal > 0 ? txTotal : grandTotal,
        amountTendered: txTendered > 0 ? txTendered : grandTotal,
        changeAmount: txChange,
        discount: txDiscount,
      } : null;

      const note = group.length > 1
        ? `[テーブル: ${tableNum}] ${group.length}回注文合算 (伝票 #${orderNumbers.map(n => formatOrderNumber(n)).join(', #')})`
        : (primary.note || `[テーブル: ${tableNum}]`);

      result.push({
        ...primary,
        id: group.length > 1 ? `table-${branch?.id || 'main'}-${tableNum}-${isPaid ? 'paid' : 'unpaid'}-${primary.id}` : primary.id,
        orderIds,
        number: primary.number,
        orderNumbers,
        orderCount: group.length,
        isConsolidatedTable: true,
        status: anyUnpaid ? 'CONFIRMED' : 'COMPLETED',
        paymentStatus: isPaid ? 'PAID' : 'UNPAID',
        customerName: primary.customerName || `テーブル ${tableNum}`,
        phone: primary.phone || '',
        note,
        pickupAt: primary.pickupAt,
        createdAt: primary.createdAt,
        completedAt: latest.completedAt || (isPaid ? latest.updatedAt : undefined),
        fulfillment: 'DINE_IN',
        tableNumber: tableNum,
        items: mergedItems,
        subtotal,
        tax,
        taxRate: 10,
        total,
        grandTotal,
        offer: primary.offer,
        pointsUsed,
        pointsDiscount,
        deliveryFee,
        transaction: consolidatedTx,
        store: branch,
        rawOrders: group,
      });
    });

    return result.sort((a, b) => {
      if (a.paymentStatus === 'UNPAID' && b.paymentStatus === 'PAID') return -1;
      if (a.paymentStatus === 'PAID' && b.paymentStatus === 'UNPAID') return 1;
      return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
    });
  }, [orders, stores, isOrderPaid, getOrderTransaction]);

  // ── Filtered Orders ───────────────────────────────────────────────────────

  const visibleOrders = useMemo(() => {
    return consolidatedOrders.filter(o => {
      // Payment filter
      const paid = o.paymentStatus === 'PAID';
      if (paymentFilter === 'UNPAID' && paid) return false;
      if (paymentFilter === 'PAID' && !paid) return false;

      // Fulfillment filter
      if (filter !== 'ALL' && o.fulfillment !== filter) return false;

      // Store / Branch filter
      if (storeFilter !== 'ALL') {
        const resolved = resolveOrderStore(o, stores);
        if (resolved?.id !== storeFilter) return false;
      }
      return true;
    });
  }, [consolidatedOrders, paymentFilter, filter, storeFilter, stores]);

  const unpaidCount = useMemo(() => {
    return consolidatedOrders.filter(o => {
      if (storeFilter !== 'ALL') {
        const resolved = resolveOrderStore(o, stores);
        if (resolved?.id !== storeFilter) return false;
      }
      return o.paymentStatus === 'UNPAID';
    }).length;
  }, [consolidatedOrders, storeFilter, stores]);

  const paidCount = useMemo(() => {
    return consolidatedOrders.filter(o => {
      if (storeFilter !== 'ALL') {
        const resolved = resolveOrderStore(o, stores);
        if (resolved?.id !== storeFilter) return false;
      }
      return o.paymentStatus === 'PAID';
    }).length;
  }, [consolidatedOrders, storeFilter, stores]);

  if (!user) {
    return (
      <div className="cc cc-center">
        {offline ? <><WifiOff size={40} /><p>サーバーに接続できません…</p></> : <p>レジ画面を読み込み中…</p>}
      </div>
    );
  }

  return (
    <div className="cc">
      <title>{`${visibleOrders.length ? `(${visibleOrders.length}) ` : ''}Cash Counter | Adarsha`}</title>
      <meta name="robots" content="noindex, nofollow" />

      {/* Start Overlay (like Kitchen Display) */}
      {!started && (
        <div className="cc-start" role="dialog" aria-modal="true">
          <div className="cc-start-card">
            <Banknote size={54} color="#22c55e" />
            <h1 style={{ margin: 0, fontSize: '1.6rem', fontWeight: 800 }}>Cash Counter Display</h1>
            <p style={{ margin: 0, color: 'var(--cc-muted)', fontSize: '0.95rem', lineHeight: 1.5 }}>
              画面をタップしてレジディスプレイを開始します。<br />
              会計時のチャイム音と画面スリープ防止が有効になります。
            </p>
            <button type="button" className="cc-start-btn" onClick={handleStart} autoFocus>
              レジ画面を開始する (Start Register)
            </button>
            <button
              type="button"
              style={{ background: 'none', border: 'none', color: '#93c5fd', textDecoration: 'underline', cursor: 'pointer', fontWeight: 600 }}
              onClick={() => { handleStart(); toggleFullscreen(); }}
            >
              フルスクリーンで開始する (Full Screen)
            </button>
          </div>
        </div>
      )}

      {/* Top Header Bar (like Kitchen Display) */}
      <header className="cc-bar">
        <div className="cc-brand">
          <Banknote size={28} />
          <div>
            <strong>Adarsha Cash Counter</strong>
            <span className="cc-clock">
              {new Date(now).toLocaleString('ja-JP', { timeZone: TIMEZONE, month: 'numeric', day: 'numeric', weekday: 'short', hour: '2-digit', minute: '2-digit', second: '2-digit' })}
              {shift?.openedBy ? ` · レジ担当: ${shift.openedBy}` : ''}
            </span>
          </div>
        </div>

        {/* Real-time Metric Boxes */}
        <dl className="cc-stats">
          <div className="is-drawer">
            <dt>{currentBranch ? `${currentBranch.name.replace(/^本格インド料理\s*/, '')} 現金` : 'ドロワー現金'}</dt>
            <dd>{yen(activeStats.expectedDrawerCash)}</dd>
          </div>
          <div className="is-sales">
            <dt>{currentBranch ? `${currentBranch.name.replace(/^本格インド料理\s*/, '')} 売上` : '本日売上'}</dt>
            <dd>{yen(activeStats.todaySales)}</dd>
          </div>
          <div className="is-unpaid">
            <dt>未会計伝票</dt>
            <dd>{unpaidCount}</dd>
          </div>
          <div>
            <dt>本日精算</dt>
            <dd>{activeStats.transactionCount}<small style={{ fontSize: '0.75rem', color: 'var(--cc-muted)' }}> 件</small></dd>
          </div>
        </dl>

        {/* Payment Status Filter */}
        <div className="cc-filter" role="group" aria-label="Payment status filter">
          <button
            type="button"
            aria-pressed={paymentFilter === 'ALL'}
            onClick={() => setPaymentFilter('ALL')}
          >
            <span>すべて</span>
            <strong style={{ fontSize: '0.85rem' }}>
              {orders.filter(o => storeFilter === 'ALL' || resolveOrderStore(o, stores)?.id === storeFilter).length}
            </strong>
          </button>
          <button
            type="button"
            aria-pressed={paymentFilter === 'UNPAID'}
            onClick={() => setPaymentFilter('UNPAID')}
            style={{ color: paymentFilter === 'UNPAID' ? '#fca5a5' : undefined }}
          >
            <span>🔴 未精算</span>
            <strong style={{ fontSize: '0.85rem', color: '#ef4444' }}>
              {unpaidCount}
            </strong>
          </button>
          <button
            type="button"
            aria-pressed={paymentFilter === 'PAID'}
            onClick={() => setPaymentFilter('PAID')}
            style={{ color: paymentFilter === 'PAID' ? '#86efac' : undefined }}
          >
            <span>🟢 精算済み</span>
            <strong style={{ fontSize: '0.85rem', color: '#22c55e' }}>
              {paidCount}
            </strong>
          </button>
        </div>

        {/* Fulfillment & Branch Filter */}
        <div className="cc-filter" role="group" aria-label="Filter orders">
          {(['ALL', 'DINE_IN', 'PICKUP', 'DELIVERY'] as const).map(f => (
            <button
              key={f}
              type="button"
              aria-pressed={filter === f}
              onClick={() => setFilter(f)}
            >
              <span>{f === 'ALL' ? '全種別' : f === 'DINE_IN' ? '🍽️ 店内' : f === 'PICKUP' ? '🛍️ 持帰' : '🛵 配達'}</span>
              <strong style={{ fontSize: '0.85rem' }}>
                {orders.filter(o => {
                  if (storeFilter !== 'ALL' && resolveOrderStore(o, stores)?.id !== storeFilter) return false;
                  return f === 'ALL' || o.fulfillment === f;
                }).length}
              </strong>
            </button>
          ))}

          {stores.length > 1 && (
            <select
              value={storeFilter}
              onChange={e => setStoreFilter(e.target.value)}
              style={{
                backgroundColor: '#1f2937',
                color: '#f9fafb',
                border: '1px solid #374151',
                borderRadius: '8px',
                padding: '4px 8px',
                fontSize: '0.8rem',
                fontWeight: 700,
                cursor: 'pointer',
                marginLeft: '4px'
              }}
            >
              <option value="ALL">🏪 全店舗 ({stores.length})</option>
              {stores.map(st => <option key={st.id} value={st.id}>🏪 {st.name}</option>)}
            </select>
          )}
        </div>

        {/* Action Tools Bar */}
        <div className="cc-tools">
          <button
            type="button"
            className="cc-tool is-highlight"
            onClick={() => {
              setCreateBillModal(true);
              setBillCart([]);
              setBillCustomerName('');
              setBillTableNumber('1');
              setBillPhone('');
              setBillNote('');
            }}
            title="店内テーブル、店頭ウォークイン、テイクアウト、配達の未精算伝票を作成"
          >
            <Plus size={18} /><span>伝票発行・注文 (New Bill)</span>
          </button>
          <button type="button" className="cc-tool" onClick={() => setMovementModal(true)}>
            <ArrowUpDown size={16} /><span>入出金{movements.length > 0 ? ` (${movements.length})` : ''}</span>
          </button>
          <button type="button" className="cc-tool is-warn" onClick={() => setBalancingModal(true)}>
            <Coins size={16} /><span>レジ締め・精算</span>
          </button>
          <button type="button" className="cc-tool" onClick={() => setHistoryModal(true)}>
            <History size={16} /><span>ジャーナル ({transactions.length})</span>
          </button>

          <button
            type="button"
            className="cc-tool"
            onClick={() => setSound(s => !s)}
            title={sound ? '消音にする' : '音声を有効化'}
            style={{ padding: '0 10px' }}
          >
            {sound ? <Volume2 size={18} color="#22c55e" /> : <VolumeX size={18} color="#94a3b8" />}
          </button>

          <button
            type="button"
            className="cc-tool"
            onClick={toggleFullscreen}
            title={fullscreen ? '全画面を解除' : '全画面表示'}
            style={{ padding: '0 10px' }}
          >
            {fullscreen ? <Minimize size={18} /> : <Maximize size={18} />}
          </button>

          <a
            href="/admin"
            className="cc-tool"
            title="管理画面ダッシュボードに戻る"
            style={{ textDecoration: 'none', padding: '0 10px', color: 'var(--cc-muted)' }}
          >
            <ExternalLink size={16} />
          </a>
        </div>
      </header>

      {/* Main Board: Orders Tickets */}
      <main className="cc-board">
        {visibleOrders.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '5rem 1rem', color: 'var(--cc-muted)' }}>
            <CheckCircle2 size={56} color="#22c55e" style={{ margin: '0 auto 16px', opacity: 0.6 }} />
            <h2 style={{ fontSize: '1.4rem', fontWeight: 800, color: 'var(--cc-text)', margin: '0 0 6px' }}>該当する伝票はありません</h2>
            <p style={{ margin: 0 }}>テーブル注文やお持ち帰り注文が入るとここに即時表示されます。</p>
          </div>
        ) : (
          <div className="cc-grid">
            {visibleOrders.map(order => {
              const tableNum = order.tableNumber || extractTableNumber(order.note);
              const isTable = order.fulfillment === 'DINE_IN' || Boolean(tableNum);
              const isDeliv = order.fulfillment === 'DELIVERY';
              const grandTotal = order.grandTotal ?? order.total;
              const orderBranch = resolveOrderStore(order, stores);
              const paid = order.paymentStatus === 'PAID' || isOrderPaid(order);
              const tx = order.transaction || getOrderTransaction(order);

              return (
                <div
                  key={order.id}
                  className={`cc-card-ticket ${isTable ? 'is-table' : isDeliv ? 'is-delivery' : 'is-takeout'}`}
                >
                  {/* Branch & Status Bar */}
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '6px' }}>
                    <span className="cc-ticket-branch">
                      <Building2 size={12} /> {orderBranch?.name || 'アダルサ 本店'}
                    </span>
                    {paid ? (
                      <span className="cc-ticket-badge paid">
                        <Check size={13} /> 精算済 ({tx?.paymentMethod ? (PAYMENT_METHODS.find(m => m.id === tx.paymentMethod)?.label.split(' ')[0] || tx.paymentMethod) : '済'})
                      </span>
                    ) : (
                      <span className="cc-ticket-badge unpaid">
                        🔴 未精算 {order.orderCount > 1 ? `(${order.orderCount}回合算)` : ''}
                      </span>
                    )}
                  </div>

                  <div className="cc-ticket-head">
                    <div>
                      {tableNum ? (
                        <div>
                          <span className="cc-ticket-badge table" style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
                            <UtensilsCrossed size={14} /> テーブル {tableNum}
                            {order.orderCount > 1 && (
                              <span style={{ background: '#f59e0b', color: '#000', padding: '1px 6px', borderRadius: '4px', fontSize: '0.72rem', fontWeight: 800 }}>
                                {order.orderCount}回 注文合算
                              </span>
                            )}
                          </span>
                          {order.orderNumbers && order.orderNumbers.length > 1 && (
                            <small style={{ color: 'var(--cc-muted)', display: 'block', marginTop: '3px', fontSize: '0.74rem' }}>
                              伝票 #{order.orderNumbers.map((n: number) => formatOrderNumber(n)).join(', #')}
                            </small>
                          )}
                        </div>
                      ) : isDeliv ? (
                        <span className="cc-ticket-badge delivery">
                          🛵 配達 #{formatOrderNumber(order.number)}
                        </span>
                      ) : (
                        <span className="cc-ticket-badge takeout">
                          🛍️ 伝票 #{formatOrderNumber(order.number)}
                        </span>
                      )}
                      <strong style={{ display: 'block', fontSize: '1.1rem', marginTop: '6px', color: '#fff' }}>
                        {order.customerName}
                      </strong>
                    </div>

                    <div>
                      <div className="cc-ticket-amount">{yen(grandTotal)}</div>
                      <small style={{ color: 'var(--cc-muted)', display: 'block', textAlign: 'right' }}>
                        {new Date(order.createdAt).toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' })}
                      </small>
                    </div>
                  </div>

                  {/* Items list */}
                  <ul className="cc-ticket-items">
                    {order.items.map((line: any, idx: number) => (
                      <li key={idx}>
                        <span>
                          {line.roundNumber && order.orderCount > 1 && (
                            <span style={{ fontSize: '0.72rem', color: '#93c5fd', marginRight: '6px', fontWeight: 700 }}>
                              [第{line.roundNumber}回]
                            </span>
                          )}
                          {line.nameJa || line.nameEn}
                        </span>
                        <strong style={{ color: '#fcd34d' }}>× {line.quantity}</strong>
                      </li>
                    ))}
                  </ul>

                  {/* Payment Details Section */}
                  <div className={`cc-ticket-payment ${paid ? 'is-paid' : 'is-unpaid'}`}>
                    {paid ? (
                      <>
                        <div className="cc-payment-head">
                          <span className="cc-payment-status-label paid">
                            <Check size={14} /> お支払い完了 (PAID)
                          </span>
                          <span className="cc-payment-method-badge">
                            {tx?.paymentMethod ? (PAYMENT_METHODS.find(m => m.id === tx.paymentMethod)?.label || tx.paymentMethod) : '決済完了'}
                          </span>
                        </div>
                        <div className="cc-payment-grid">
                          <div className="cc-payment-row">
                            <span>精算総額</span>
                            <strong style={{ color: '#86efac', fontSize: '0.98rem' }}>{yen(tx?.total ?? grandTotal)}</strong>
                          </div>
                          {tx?.discount > 0 && (
                            <div className="cc-payment-row discount">
                              <span>値引き ({tx.discountReason || '特別割引'})</span>
                              <span>−{yen(tx.discount)}</span>
                            </div>
                          )}
                          {tx?.amountTendered > 0 && (
                            <div className="cc-payment-row">
                              <span>お預かり</span>
                              <span>{yen(tx.amountTendered)}</span>
                            </div>
                          )}
                          {tx?.changeAmount !== undefined && tx?.changeAmount > 0 && (
                            <div className="cc-payment-row">
                              <span>お釣り</span>
                              <strong style={{ color: '#86efac' }}>{yen(tx.changeAmount)}</strong>
                            </div>
                          )}
                          <div className="cc-payment-row sub">
                            <span>精算日時</span>
                            <span>
                              {tx?.timestamp
                                ? new Date(tx.timestamp).toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
                                : order.completedAt
                                  ? new Date(order.completedAt).toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' })
                                  : '精算済'}
                            </span>
                          </div>
                          {tx?.staffName && (
                            <div className="cc-payment-row sub">
                              <span>レジ担当</span>
                              <span>{tx.staffName}</span>
                            </div>
                          )}
                        </div>
                      </>
                    ) : (
                      <>
                        <div className="cc-payment-head">
                          <span className="cc-payment-status-label unpaid">
                            🔴 お支払い待ち (UNPAID)
                          </span>
                          <span className="cc-payment-expected">
                            {isDeliv ? '🛵 お届け時代金引換' : '🏪 店頭レジ精算'}
                          </span>
                        </div>
                        <div className="cc-payment-grid">
                          <div className="cc-payment-row">
                            <span>商品小計 (税抜)</span>
                            <span>{yen(order.subtotal || Math.round(grandTotal / (1 + (order.taxRate || 10) / 100)))}</span>
                          </div>
                          <div className="cc-payment-row">
                            <span>消費税 ({order.taxRate || (order.fulfillment === 'DINE_IN' ? 10 : 8)}%)</span>
                            <span>{yen(order.tax || (grandTotal - (order.subtotal || Math.round(grandTotal / (1 + (order.taxRate || 10) / 100)))))}</span>
                          </div>
                          {order.offer?.discount > 0 && (
                            <div className="cc-payment-row discount">
                              <span>特典「{order.offer?.titleJa || 'クーポン'}」</span>
                              <span>−{yen(order.offer.discount)}</span>
                            </div>
                          )}
                          {order.pointsDiscount > 0 && (
                            <div className="cc-payment-row discount">
                              <span>ポイント利用 ({order.pointsUsed}pt)</span>
                              <span>−{yen(order.pointsDiscount)}</span>
                            </div>
                          )}
                          {order.deliveryFee > 0 && (
                            <div className="cc-payment-row">
                              <span>配達料 (税込)</span>
                              <span>{yen(order.deliveryFee)}</span>
                            </div>
                          )}
                          <div className="cc-payment-row total">
                            <span>ご請求総額 (税込)</span>
                            <span style={{ color: '#86efac' }}>{yen(grandTotal)}</span>
                          </div>
                        </div>
                      </>
                    )}
                  </div>

                  {/* Action Buttons */}
                  <div style={{ display: 'grid', gridTemplateColumns: paid ? '1fr 1fr' : '1fr 1.6fr', gap: '8px', marginTop: 'auto' }}>
                    <button
                      type="button"
                      onClick={() => setBillPreviewOrder(order)}
                      style={{
                        padding: '10px 8px',
                        borderRadius: '8px',
                        border: '1px solid var(--cc-line)',
                        background: 'var(--cc-card)',
                        color: '#93c5fd',
                        fontSize: '0.85rem',
                        fontWeight: 700,
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: '6px'
                      }}
                      title="合算お会計伝票・請求書をプレビュー・印刷"
                    >
                      <FileText size={15} />
                      <span>伝票・請求書</span>
                    </button>

                    {paid ? (
                      <button
                        type="button"
                        onClick={() => {
                          const recOrder = createReceiptOrderFromOrder(order, tx?.changeAmount || 0, tx?.amountTendered || 0, tx?.paymentMethod);
                          printCustomerReceipt(recOrder);
                        }}
                        style={{
                          padding: '10px 8px',
                          borderRadius: '8px',
                          border: '1px solid #16a34a',
                          background: 'rgba(22, 163, 74, 0.15)',
                          color: '#86efac',
                          fontSize: '0.85rem',
                          fontWeight: 700,
                          cursor: 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          gap: '6px'
                        }}
                      >
                        <Printer size={15} />
                        <span>領収書再発行</span>
                      </button>
                    ) : (
                      <button
                        type="button"
                        className="cc-pay-btn"
                        onClick={() => {
                          setActiveCheckoutOrder(order);
                          setCheckoutStep('CALC');
                          setMarkOrderCompleted(true);
                          setAutoPrintReceipt(false);
                        }}
                        style={{ padding: '10px 8px', fontSize: '0.95rem' }}
                      >
                        <Receipt size={16} />
                        <span>お会計へ進む</span>
                      </button>
                    )}
                  </div>

                  {/* Free Table / Reset Table Button */}
                  {tableNum && (
                    <button
                      type="button"
                      onClick={() => handleResetTable(tableNum, orderBranch?.id)}
                      style={{
                        marginTop: '8px',
                        padding: '7px 10px',
                        borderRadius: '6px',
                        border: '1px solid rgba(239, 68, 68, 0.35)',
                        background: 'rgba(239, 68, 68, 0.08)',
                        color: '#fca5a5',
                        fontSize: '0.78rem',
                        fontWeight: 700,
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: '6px',
                        width: '100%',
                      }}
                      title="テーブルの注文をクローズし、空席としてリセットします"
                    >
                      <RotateCcw size={13} />
                      <span>卓解放・リセット (Free Table {tableNum})</span>
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </main>

      {/* ================================================================= */}
      {/* POS BILL CHECKOUT MODAL                                           */}
      {/* ================================================================= */}
      {activeCheckoutOrder && (() => {
        const orderBranch = resolveOrderStore(activeCheckoutOrder, stores);
        const tableNum = extractTableNumber(activeCheckoutOrder.note);
        const baseTot = baseTotal;
        const discountAmt = computedDiscountAmount;
        const tot = finalPayableTotal;
        const tendered = parseInt(amountTenderedStr, 10) || 0;
        const isTenderedEntered = amountTenderedStr.trim() !== '' && !isNaN(parseInt(amountTenderedStr, 10));
        const change = settlementMethod === 'CASH' && isTenderedEntered ? Math.max(0, tendered - tot) : 0;
        const isShort = settlementMethod === 'CASH' && (!isTenderedEntered || tendered < tot);
        const canProceed = settlementMethod === 'CASH' ? (!isShort && isTenderedEntered) : nonCashConfirmed;

        return (
          <div className="cc-modal-backdrop" onClick={() => { setActiveCheckoutOrder(null); setCheckoutStep('CALC'); }}>
            <div className="cc-modal-content" onClick={e => e.stopPropagation()}>
              {/* Header */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', borderBottom: '1px solid var(--cc-line)', paddingBottom: '12px', marginBottom: '16px' }}>
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap', marginBottom: '4px' }}>
                    <h2 style={{ margin: 0, fontSize: '1.25rem', fontWeight: 800 }}>
                      伝票 #{formatOrderNumber(activeCheckoutOrder.number)} のお会計
                    </h2>
                    <span className="cc-ticket-branch">
                      <Building2 size={12} /> {orderBranch?.name || 'アダルサ 本店'}
                    </span>
                  </div>
                  <small style={{ color: 'var(--cc-muted)' }}>
                    {tableNum ? `🪑 テーブル ${tableNum}` : activeCheckoutOrder.customerName}
                    {orderBranch?.address ? ` · ${orderBranch.address}` : ''}
                  </small>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <button
                    type="button"
                    onClick={() => setBillPreviewOrder(activeCheckoutOrder)}
                    style={{
                      padding: '6px 10px',
                      borderRadius: '6px',
                      border: '1px solid var(--cc-line)',
                      background: 'var(--cc-card)',
                      color: '#93c5fd',
                      fontSize: '0.8rem',
                      fontWeight: 700,
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '4px'
                    }}
                    title="お会計伝票・請求書を印刷"
                  >
                    <FileText size={14} /> 伝票印刷
                  </button>
                  <button
                    type="button"
                    onClick={() => { setActiveCheckoutOrder(null); setCheckoutStep('CALC'); }}
                    style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--cc-muted)' }}
                  >
                    <X size={22} />
                  </button>
                </div>
              </div>

              {/* STEP 1: CALC & PAYMENT METHOD SELECTION */}
              {checkoutStep === 'CALC' && (
                <>
                  {/* Total Due Banner */}
                  <div style={{ backgroundColor: '#1e293b', padding: '14px 18px', borderRadius: '12px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
                    <div>
                      <span style={{ fontSize: '0.9rem', fontWeight: 700, color: '#94a3b8' }}>お支払い合計金額 (税込)</span>
                      <div style={{ fontSize: '0.8rem', color: '#60a5fa', marginTop: '2px' }}>
                        🏪 {orderBranch?.name || 'アダルサ 本店'}
                      </div>
                    </div>
                    <div style={{ textAlign: 'right' }}>
                      {discountAmt > 0 && (
                        <div style={{ fontSize: '0.85rem', color: '#94a3b8', textDecoration: 'line-through', marginBottom: '2px' }}>
                          {yen(baseTot)}
                        </div>
                      )}
                      <span style={{ fontSize: '1.8rem', fontWeight: 900, color: '#86efac' }}>
                        {yen(tot)}
                      </span>
                    </div>
                  </div>

                  {/* Detailed Order Financial Breakdown */}
                  <div style={{ backgroundColor: '#0f172a', border: '1px solid #334155', borderRadius: '10px', padding: '12px 16px', marginBottom: '14px' }}>
                    <div style={{ fontSize: '0.82rem', fontWeight: 700, color: '#94a3b8', marginBottom: '6px', borderBottom: '1px solid #1e293b', paddingBottom: '4px' }}>
                      伝票明細・お会計計算内訳
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem', padding: '2px 0' }}>
                      <span style={{ color: '#cbd5e1' }}>商品小計 (税抜)</span>
                      <span>{yen(activeCheckoutOrder.subtotal || Math.round(baseTot / (1 + (activeCheckoutOrder.taxRate || 10) / 100)))}</span>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem', padding: '2px 0' }}>
                      <span style={{ color: '#cbd5e1' }}>消費税 ({activeCheckoutOrder.taxRate || (activeCheckoutOrder.fulfillment === 'DINE_IN' ? 10 : 8)}%)</span>
                      <span>{yen(activeCheckoutOrder.tax || (baseTot - (activeCheckoutOrder.subtotal || Math.round(baseTot / (1 + (activeCheckoutOrder.taxRate || 10) / 100)))))}</span>
                    </div>
                    {activeCheckoutOrder.offer?.discount > 0 && (
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem', padding: '2px 0', color: '#f87171' }}>
                        <span>特典「{activeCheckoutOrder.offer.titleJa || 'クーポン'}」</span>
                        <span>−{yen(activeCheckoutOrder.offer.discount)}</span>
                      </div>
                    )}
                    {activeCheckoutOrder.pointsDiscount > 0 && (
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem', padding: '2px 0', color: '#f87171' }}>
                        <span>ポイント利用 ({activeCheckoutOrder.pointsUsed}pt)</span>
                        <span>−{yen(activeCheckoutOrder.pointsDiscount)}</span>
                      </div>
                    )}
                    {activeCheckoutOrder.deliveryFee > 0 && (
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem', padding: '2px 0' }}>
                        <span style={{ color: '#cbd5e1' }}>配達料 (税込)</span>
                        <span>{yen(activeCheckoutOrder.deliveryFee)}</span>
                      </div>
                    )}
                    {discountAmt > 0 && (
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem', padding: '3px 0', color: '#fca5a5', fontWeight: 700, borderTop: '1px dashed #334155', marginTop: '3px' }}>
                        <span>レジ即時割引 ({discountReason || (discountType === 'PERCENT' ? `${discountValue}%割引` : '特別値引き')})</span>
                        <span>−{yen(discountAmt)}</span>
                      </div>
                    )}
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.95rem', fontWeight: 800, borderTop: '1px solid #334155', paddingTop: '6px', marginTop: '4px' }}>
                      <span>ご請求総額 (税込)</span>
                      <span style={{ color: '#86efac' }}>{yen(tot)}</span>
                    </div>
                  </div>

                  {/* On-The-Fly Discount & Offer Process System */}
                  <div className="cc-discount-box">
                    <div className="cc-discount-head">
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <Percent size={16} color="#fca5a5" />
                        <span style={{ fontSize: '0.9rem', fontWeight: 800, color: '#fff' }}>
                          レジ即時割引・オファー適用 (Discount / Offer)
                        </span>
                      </div>
                      {discountType !== 'NONE' && (
                        <button
                          type="button"
                          onClick={() => {
                            setDiscountType('NONE');
                            setDiscountValue(0);
                            setDiscountReason('');
                          }}
                          style={{
                            background: 'none',
                            border: '1px solid #ef4444',
                            color: '#fca5a5',
                            borderRadius: '4px',
                            padding: '2px 8px',
                            fontSize: '0.75rem',
                            cursor: 'pointer',
                            fontWeight: 700
                          }}
                        >
                          ✕ 割引を解除
                        </button>
                      )}
                    </div>

                    {/* Quick Offer Presets */}
                    <div className="cc-discount-presets">
                      {OFFER_PRESETS.map(preset => {
                        const isSel = discountType === preset.type && (
                          (preset.type === 'PERCENT' || preset.type === 'FIXED') ? discountValue === preset.value : true
                        );
                        return (
                          <button
                            key={preset.id}
                            type="button"
                            onClick={() => {
                              if (isSel) {
                                setDiscountType('NONE');
                                setDiscountValue(0);
                                setDiscountReason('');
                              } else {
                                setDiscountType(preset.type);
                                setDiscountValue(preset.value);
                                setDiscountReason(preset.reason);
                              }
                            }}
                            className={`cc-discount-preset-btn ${isSel ? 'active' : ''}`}
                          >
                            {preset.label}
                          </button>
                        );
                      })}
                    </div>

                    {/* Custom Discount Input Controls */}
                    <div style={{ display: 'grid', gridTemplateColumns: '130px 110px 1fr', gap: '8px', alignItems: 'center' }}>
                      <select
                        value={discountType}
                        onChange={e => {
                          const t = e.target.value as DiscountType;
                          setDiscountType(t);
                          if (t === 'NONE') {
                            setDiscountValue(0);
                            setDiscountReason('');
                          }
                        }}
                        style={{
                          padding: '8px',
                          borderRadius: '6px',
                          border: '1px solid var(--cc-line)',
                          background: '#1f2937',
                          color: '#fff',
                          fontSize: '0.8rem',
                          fontWeight: 700
                        }}
                      >
                        <option value="NONE">割引なし</option>
                        <option value="PERCENT">% 割合値引</option>
                        <option value="FIXED">¥ 金額値引</option>
                        <option value="ROUND_10">10円未満端数</option>
                        <option value="ROUND_100">100円未満端数</option>
                      </select>

                      {(discountType === 'PERCENT' || discountType === 'FIXED') ? (
                        <input
                          type="number"
                          min="0"
                          max={discountType === 'PERCENT' ? 100 : baseTot}
                          placeholder={discountType === 'PERCENT' ? '割引率 (%)' : '値引額 (円)'}
                          value={discountValue || ''}
                          onChange={e => setDiscountValue(Math.max(0, parseInt(e.target.value, 10) || 0))}
                          style={{
                            padding: '8px 10px',
                            borderRadius: '6px',
                            border: '1px solid var(--cc-line)',
                            background: '#111827',
                            color: '#fff',
                            fontSize: '0.85rem',
                            fontWeight: 700
                          }}
                        />
                      ) : (
                        <div style={{ fontSize: '0.75rem', color: 'var(--cc-muted)', textAlign: 'center' }}>
                          {discountType === 'NONE' ? '-' : '端数自動計算'}
                        </div>
                      )}

                      <input
                        type="text"
                        placeholder="割引理由 (例: 雨の日クーポン、常連様サービス)"
                        value={discountReason}
                        onChange={e => setDiscountReason(e.target.value)}
                        style={{
                          padding: '8px 10px',
                          borderRadius: '6px',
                          border: '1px solid var(--cc-line)',
                          background: '#111827',
                          color: '#fff',
                          fontSize: '0.85rem'
                        }}
                      />
                    </div>

                    {discountAmt > 0 && (
                      <div style={{ marginTop: '10px', padding: '8px 12px', background: 'rgba(239, 68, 68, 0.15)', border: '1px solid #ef4444', borderRadius: '8px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span style={{ fontSize: '0.85rem', color: '#fca5a5', fontWeight: 700 }}>
                          適用値引き: {discountReason || (discountType === 'PERCENT' ? `${discountValue}%割引` : '特別値引き')}
                        </span>
                        <strong style={{ fontSize: '1.1rem', color: '#ef4444' }}>
                          −{yen(discountAmt)}
                        </strong>
                      </div>
                    )}
                  </div>

                  {/* Payment Method Grid */}
                  <div style={{ marginBottom: '16px' }}>
                    <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 700, marginBottom: '8px', color: 'var(--cc-muted)' }}>
                      決済方法を選択 (Payment Method)
                    </label>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: '8px' }}>
                      {PAYMENT_METHODS.map(m => {
                        const Icon = m.icon;
                        const isSel = settlementMethod === m.id;
                        return (
                          <button
                            key={m.id}
                            type="button"
                            onClick={() => {
                              setSettlementMethod(m.id);
                              setAmountTenderedStr('');
                              setNonCashConfirmed(false);
                            }}
                            style={{
                              padding: '12px 8px',
                              borderRadius: '10px',
                              border: `2px solid ${isSel ? m.color : 'var(--cc-line)'}`,
                              backgroundColor: isSel ? m.bg : 'var(--cc-card)',
                              color: isSel ? '#fff' : 'var(--cc-muted)',
                              fontWeight: 800,
                              fontSize: '0.85rem',
                              cursor: 'pointer',
                              display: 'flex',
                              flexDirection: 'column',
                              alignItems: 'center',
                              gap: '6px'
                            }}
                          >
                            <Icon size={20} color={m.color} />
                            <span>{m.label}</span>
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {/* Bank Transfer Notice */}
                  {settlementMethod === 'BANK_TRANSFER' && (
                    <div className="cc-bank-notice">
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontWeight: 800, marginBottom: '4px' }}>
                        <Landmark size={18} color="#f59e0b" />
                        <span>銀行振込（前払い・売掛入金）によるお会計</span>
                      </div>
                      <div style={{ fontSize: '0.82rem', color: '#fde68a' }}>
                        ※ 口座への着金・振込控え（スクリーンショットまたは振込明細書）を確認のうえ「受領確認」を押してください。
                      </div>
                    </div>
                  )}

                  {/* Cash Manual Entry (When Cash Selected) */}
                  {settlementMethod === 'CASH' && (
                    <div style={{ backgroundColor: '#142a1e', border: '1px solid #166534', borderRadius: '12px', padding: '14px', marginBottom: '18px' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                        <label style={{ fontSize: '0.9rem', fontWeight: 800, color: '#86efac' }}>
                          お預かり金額 (手動入力 / Manual Entry)
                        </label>
                        <button
                          type="button"
                          onClick={() => setAmountTenderedStr(String(tot))}
                          style={{ background: 'none', border: 'none', color: '#86efac', fontWeight: 800, cursor: 'pointer', fontSize: '0.85rem' }}
                        >
                          [ ちょうど受取 ]
                        </button>
                      </div>

                      {!isTenderedEntered && (
                        <div style={{ fontSize: '0.8rem', color: '#fef08a', marginBottom: '8px', background: 'rgba(234, 179, 8, 0.15)', padding: '6px 10px', borderRadius: '6px', border: '1px solid rgba(234, 179, 8, 0.3)' }}>
                          ⚠️ お客様から受領した現金金額を手動入力してください
                        </div>
                      )}

                      <input
                        type="number"
                        placeholder="受取金額を入力 (例: 5000)"
                        value={amountTenderedStr}
                        onChange={e => setAmountTenderedStr(e.target.value)}
                        style={{
                          width: '100%',
                          padding: '10px 14px',
                          fontSize: '1.4rem',
                          fontWeight: 900,
                          borderRadius: '8px',
                          border: isShort ? '1px solid #ef4444' : '1px solid #22c55e',
                          backgroundColor: '#0f172a',
                          color: '#fff',
                          marginBottom: '10px',
                          boxSizing: 'border-box'
                        }}
                      />

                      {/* Quick Bills buttons */}
                      <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginBottom: '12px' }}>
                        {[1000, 5000, 10000].map(v => (
                          <button
                            key={v}
                            type="button"
                            onClick={() => setAmountTenderedStr(String(v))}
                            style={{ padding: '6px 12px', borderRadius: '6px', background: '#1e3a2b', border: '1px solid #22c55e', color: '#fff', fontWeight: 700, fontSize: '0.85rem', cursor: 'pointer' }}
                          >
                            {yen(v)}札
                          </button>
                        ))}
                        {[1000, 5000].map(v => (
                          <button
                            key={`p-${v}`}
                            type="button"
                            onClick={() => setAmountTenderedStr(p => String((parseInt(p, 10) || 0) + v))}
                            style={{ padding: '6px 12px', borderRadius: '6px', background: '#1e3a2b', border: '1px solid #22c55e', color: '#fff', fontWeight: 700, fontSize: '0.85rem', cursor: 'pointer' }}
                          >
                            +{yen(v)}
                          </button>
                        ))}
                        <button
                          type="button"
                          onClick={() => setAmountTenderedStr('')}
                          style={{ padding: '6px 12px', borderRadius: '6px', background: '#374151', border: '1px solid #4b5563', color: '#f3f4f6', fontWeight: 700, fontSize: '0.85rem', cursor: 'pointer' }}
                        >
                          クリア
                        </button>
                      </div>

                      {/* Change */}
                      <div style={{ borderTop: '1px dashed #166534', paddingTop: '10px' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <span style={{ fontSize: '1rem', fontWeight: 800, color: (isShort || !isTenderedEntered) ? '#fca5a5' : '#86efac' }}>
                            {!isTenderedEntered ? 'お預かり未入力' : isShort ? '不足金額' : 'お釣り (Change)'}
                          </span>
                          <span style={{ fontSize: '1.7rem', fontWeight: 900, color: (isShort || !isTenderedEntered) ? '#ef4444' : '#22c55e' }}>
                            {!isTenderedEntered ? '¥0' : isShort ? `-${yen(tot - tendered)}` : yen(change)}
                          </span>
                        </div>
                        {isTenderedEntered && !isShort && change > 0 && (
                          <div style={{ fontSize: '0.8rem', color: '#86efac', textAlign: 'right', marginTop: '4px' }}>
                            推奨金種: <strong>{calculateOptimalChange(change)}</strong>
                          </div>
                        )}
                      </div>
                    </div>
                  )}

                  {/* Non-Cash Payment Manual Verification Box */}
                  {settlementMethod !== 'CASH' && (
                    <div style={{ backgroundColor: '#1e293b', border: `1.5px solid ${nonCashConfirmed ? '#22c55e' : (PAYMENT_METHODS.find(m => m.id === settlementMethod)?.color || '#3b82f6')}`, borderRadius: '12px', padding: '16px', marginBottom: '18px' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                        <span style={{ fontSize: '0.9rem', fontWeight: 800, color: '#93c5fd' }}>
                          💳 決済端末・入金確認 (Payment Authorization)
                        </span>
                        <span style={{ fontSize: '0.8rem', color: '#94a3b8' }}>
                          {PAYMENT_METHODS.find(m => m.id === settlementMethod)?.label}
                        </span>
                      </div>
                      <div style={{ fontSize: '0.82rem', color: '#cbd5e1', marginBottom: '12px', lineHeight: 1.5 }}>
                        CAT端末でのカード決済、QRコード決済完了、または銀行振込着金をお確かめのうえ、下のボタンを押して受領を確認してください。
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          setNonCashConfirmed(true);
                          setAmountTenderedStr(String(tot));
                        }}
                        style={{
                          width: '100%',
                          padding: '12px',
                          borderRadius: '8px',
                          border: `2px solid ${nonCashConfirmed ? '#22c55e' : '#3b82f6'}`,
                          backgroundColor: nonCashConfirmed ? 'rgba(34, 197, 94, 0.2)' : 'rgba(59, 130, 246, 0.15)',
                          color: nonCashConfirmed ? '#86efac' : '#93c5fd',
                          fontSize: '0.95rem',
                          fontWeight: 800,
                          cursor: 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          gap: '8px'
                        }}
                      >
                        <CheckCircle2 size={18} />
                        <span>{nonCashConfirmed ? `✅ 決済受領を確認済み (${yen(tot)})` : `決済端末／振込での受領を確認 (${yen(tot)})`}</span>
                      </button>
                    </div>
                  )}

                  {/* Settlement Options */}
                  <div style={{ background: '#0f172a', border: '1px solid #334155', borderRadius: '10px', padding: '12px 14px', marginBottom: '18px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    <label style={{ display: 'flex', alignItems: 'center', gap: '10px', fontSize: '0.88rem', fontWeight: 700, cursor: 'pointer' }}>
                      <input
                        type="checkbox"
                        checked={markOrderCompleted}
                        onChange={e => setMarkOrderCompleted(e.target.checked)}
                        style={{ width: '18px', height: '18px', accentColor: '#16a34a', cursor: 'pointer' }}
                      />
                      <span>会計と同時にオーダーを受渡完了（COMPLETED）にする</span>
                    </label>
                    <label style={{ display: 'flex', alignItems: 'center', gap: '10px', fontSize: '0.88rem', fontWeight: 700, cursor: 'pointer' }}>
                      <input
                        type="checkbox"
                        checked={autoPrintReceipt}
                        onChange={e => setAutoPrintReceipt(e.target.checked)}
                        style={{ width: '18px', height: '18px', accentColor: '#16a34a', cursor: 'pointer' }}
                      />
                      <span>確定時にレシート・領収証を自動印刷する</span>
                    </label>
                  </div>

                  {/* Forward to Confirmation Step */}
                  <button
                    type="button"
                    disabled={!canProceed}
                    onClick={() => setCheckoutStep('CONFIRM')}
                    style={{
                      width: '100%',
                      padding: '16px',
                      borderRadius: '12px',
                      border: 'none',
                      background: !canProceed ? '#374151' : '#16a34a',
                      color: '#fff',
                      fontSize: '1.15rem',
                      fontWeight: 900,
                      cursor: !canProceed ? 'not-allowed' : 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: '8px',
                      boxShadow: !canProceed ? 'none' : '0 4px 14px rgba(22, 163, 74, 0.4)'
                    }}
                  >
                    <span>
                      {!canProceed
                        ? (settlementMethod === 'CASH'
                            ? (!isTenderedEntered ? '⚠️ お預かり金額を手動入力してください' : `⚠️ 不足: ${yen(tot - tendered)}`)
                            : '⚠️ 決済端末での受領を確認してください')
                        : 'お会計内容の確認へ進む (Review) →'}
                    </span>
                  </button>
                </>
              )}

              {/* STEP 2: CONFIRMATION (Explicit review, no automatic completion!) */}
              {checkoutStep === 'CONFIRM' && (
                <>
                  <div className="cc-confirm-box">
                    <h3 style={{ margin: '0 0 12px', fontSize: '1.15rem', fontWeight: 800, color: '#fcd34d' }}>
                      📋 お会計内容の最終確認 (Manual Payment Confirmation)
                    </h3>
                    <div className="cc-confirm-row">
                      <span style={{ color: 'var(--cc-muted)' }}>対象店舗 (Branch)</span>
                      <strong style={{ color: '#93c5fd' }}>🏪 {orderBranch?.name || 'アダルサ 本店'}</strong>
                    </div>
                    <div className="cc-confirm-row">
                      <span style={{ color: 'var(--cc-muted)' }}>伝票種別</span>
                      <strong style={{ color: '#fff' }}>
                        {activeCheckoutOrder.fulfillment === 'DINE_IN' ? '🍽️ 店内飲食' : activeCheckoutOrder.fulfillment === 'DELIVERY' ? '🛵 デリバリー' : '🛍️ テイクアウト / 店頭'}
                      </strong>
                    </div>
                    <div className="cc-confirm-row">
                      <span style={{ color: 'var(--cc-muted)' }}>伝票番号 / お席</span>
                      <strong>#{formatOrderNumber(activeCheckoutOrder.number)} {tableNum ? `(テーブル ${tableNum})` : `(${activeCheckoutOrder.customerName})`}</strong>
                    </div>

                    {/* Items Summary in Confirmation */}
                    <div style={{ background: 'rgba(0,0,0,0.25)', borderRadius: '8px', padding: '8px 12px', margin: '8px 0' }}>
                      <div style={{ fontSize: '0.8rem', color: 'var(--cc-muted)', marginBottom: '4px' }}>注文内容:</div>
                      <div style={{ fontSize: '0.85rem', color: '#e2e8f0', display: 'flex', flexDirection: 'column', gap: '3px' }}>
                        {activeCheckoutOrder.items.map((i: any, idx: number) => (
                          <div key={idx} style={{ display: 'flex', justifyContent: 'space-between' }}>
                            <span>{i.nameJa || i.nameEn}</span>
                            <span style={{ fontWeight: 700 }}>× {i.quantity}</span>
                          </div>
                        ))}
                      </div>
                    </div>

                    <div className="cc-confirm-row">
                      <span style={{ color: 'var(--cc-muted)' }}>通常ご請求額</span>
                      <span style={{ color: discountAmt > 0 ? '#94a3b8' : '#fff', textDecoration: discountAmt > 0 ? 'line-through' : 'none' }}>
                        {yen(baseTot)}
                      </span>
                    </div>
                    {discountAmt > 0 && (
                      <div className="cc-confirm-row">
                        <span style={{ color: '#fca5a5' }}>適用値引き・オファー</span>
                        <strong style={{ color: '#ef4444' }}>
                          −{yen(discountAmt)} ({discountReason || (discountType === 'PERCENT' ? `${discountValue}%割引` : '特別値引き')})
                        </strong>
                      </div>
                    )}
                    <div className="cc-confirm-row">
                      <span style={{ color: 'var(--cc-muted)' }}>最終お支払い合計金額 (税込)</span>
                      <strong style={{ fontSize: '1.45rem', color: '#86efac' }}>{yen(tot)}</strong>
                    </div>
                    <div className="cc-confirm-row">
                      <span style={{ color: 'var(--cc-muted)' }}>決済方法</span>
                      <strong style={{ color: '#fff', fontSize: '1rem' }}>{PAYMENT_METHODS.find(m => m.id === settlementMethod)?.label}</strong>
                    </div>

                    {settlementMethod === 'CASH' ? (
                      <>
                        <div className="cc-confirm-row" style={{ background: 'rgba(34, 197, 94, 0.1)', padding: '8px 10px', borderRadius: '6px' }}>
                          <span style={{ color: '#86efac', fontWeight: 800 }}>手動入力お預かり金額</span>
                          <strong style={{ fontSize: '1.25rem', color: '#86efac' }}>{yen(tendered)}</strong>
                        </div>
                        <div className="cc-confirm-row" style={{ background: 'rgba(34, 197, 94, 0.15)', padding: '8px 10px', borderRadius: '6px' }}>
                          <span style={{ color: '#86efac', fontWeight: 800 }}>お渡しするお釣り (Change)</span>
                          <strong style={{ fontSize: '1.35rem', color: '#22c55e' }}>{yen(change)}</strong>
                        </div>
                      </>
                    ) : (
                      <div className="cc-confirm-row" style={{ background: 'rgba(59, 130, 246, 0.15)', padding: '8px 10px', borderRadius: '6px' }}>
                        <span style={{ color: '#93c5fd' }}>決済受領確認</span>
                        <strong style={{ color: '#60a5fa' }}>✅ スタッフ確認済み (Authorized: {yen(tot)})</strong>
                      </div>
                    )}

                    <div className="cc-confirm-row">
                      <span style={{ color: 'var(--cc-muted)' }}>オーダー受渡状態</span>
                      <strong style={{ color: markOrderCompleted ? '#86efac' : '#fcd34d' }}>
                        {markOrderCompleted ? '受渡完了（COMPLETED）にする' : '厨房調理・提供継続（未完了のまま残す）'}
                      </strong>
                    </div>
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: '10px' }}>
                    <button
                      type="button"
                      onClick={() => setCheckoutStep('CALC')}
                      style={{
                        padding: '14px',
                        borderRadius: '10px',
                        border: '1px solid var(--cc-line)',
                        background: 'var(--cc-card)',
                        color: '#fff',
                        fontWeight: 700,
                        cursor: 'pointer'
                      }}
                    >
                      ⬅️ 修正する
                    </button>
                    <button
                      type="button"
                      disabled={settling}
                      onClick={handleSettleActiveOrder}
                      style={{
                        padding: '14px',
                        borderRadius: '10px',
                        border: 'none',
                        background: '#16a34a',
                        color: '#fff',
                        fontSize: '1.1rem',
                        fontWeight: 900,
                        cursor: settling ? 'not-allowed' : 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: '8px',
                        boxShadow: '0 4px 14px rgba(22, 163, 74, 0.4)'
                      }}
                    >
                      <CheckCircle2 size={20} />
                      <span>{settling ? '会計処理中…' : '✅ 会計を確定して精算実行'}</span>
                    </button>
                  </div>
                </>
              )}

              {/* STEP 3: SUCCESS (Controlled outcome, reprint receipts on demand) */}
              {checkoutStep === 'SUCCESS' && lastSettledResult && (
                <div style={{ textAlign: 'center', padding: '10px 0' }}>
                  <CheckCircle2 size={56} color="#22c55e" style={{ margin: '0 auto 12px' }} />
                  <h3 style={{ fontSize: '1.4rem', fontWeight: 900, color: '#fff', margin: '0 0 6px' }}>
                    🎉 お会計精算が完了しました！
                  </h3>
                  <div style={{ fontSize: '0.9rem', color: '#94a3b8', marginBottom: '16px' }}>
                    🏪 {orderBranch?.name || 'アダルサ 本店'} · 伝票 #{formatOrderNumber(activeCheckoutOrder.number)}
                  </div>

                  {lastSettledResult.discount !== undefined && lastSettledResult.discount > 0 && (
                    <div style={{ margin: '0 auto 16px', maxWidth: '340px', padding: '10px 14px', background: 'rgba(239, 68, 68, 0.15)', border: '1px solid #ef4444', borderRadius: '10px', fontSize: '0.88rem' }}>
                      <div style={{ color: '#fca5a5', marginBottom: '2px' }}>適用割引: {lastSettledResult.discountReason || '特別割引'}</div>
                      <strong style={{ color: '#ef4444', fontSize: '1.1rem' }}>−{yen(lastSettledResult.discount)}</strong>
                    </div>
                  )}

                  <div style={{ margin: '0 auto 16px', maxWidth: '340px', padding: '10px 14px', background: '#1e293b', border: '1px solid var(--cc-line)', borderRadius: '10px', fontSize: '0.88rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ color: 'var(--cc-muted)' }}>決済方法</span>
                    <strong style={{ color: '#fff' }}>{lastSettledResult.methodLabel}</strong>
                  </div>

                  {settlementMethod === 'CASH' && (
                    <div style={{ background: '#142a1e', border: '1px solid #166534', borderRadius: '12px', padding: '16px', maxWidth: '340px', margin: '0 auto 20px' }}>
                      <div style={{ fontSize: '0.85rem', color: '#86efac', marginBottom: '4px' }}>お釣り (Change)</div>
                      <div style={{ fontSize: '2.2rem', fontWeight: 900, color: '#22c55e' }}>{yen(lastSettledResult.change)}</div>
                      {lastSettledResult.change > 0 && (
                        <div style={{ fontSize: '0.8rem', color: '#86efac', marginTop: '6px' }}>
                          推奨金種: <strong>{calculateOptimalChange(lastSettledResult.change)}</strong>
                        </div>
                      )}
                    </div>
                  )}

                  <div style={{ display: 'flex', gap: '10px', justifyContent: 'center', flexWrap: 'wrap', marginBottom: '20px' }}>
                    <button
                      type="button"
                      onClick={() => printCustomerReceipt(lastSettledResult.order)}
                      style={{
                        padding: '12px 20px',
                        borderRadius: '10px',
                        border: '1px solid #22c55e',
                        background: '#166534',
                        color: '#fff',
                        fontWeight: 800,
                        fontSize: '0.95rem',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '8px'
                      }}
                    >
                      <Printer size={18} />
                      <span>領収書・レシートを印刷</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => printBillInvoice(lastSettledResult.order)}
                      style={{
                        padding: '12px 20px',
                        borderRadius: '10px',
                        border: '1px solid var(--cc-line)',
                        background: 'var(--cc-card)',
                        color: '#93c5fd',
                        fontWeight: 800,
                        fontSize: '0.95rem',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '8px'
                      }}
                    >
                      <FileText size={18} />
                      <span>お会計伝票を印刷</span>
                    </button>
                  </div>

                  <button
                    type="button"
                    onClick={() => { setActiveCheckoutOrder(null); setCheckoutStep('CALC'); }}
                    style={{
                      width: '100%',
                      padding: '14px',
                      borderRadius: '10px',
                      background: '#374151',
                      color: '#fff',
                      fontWeight: 800,
                      border: 'none',
                      cursor: 'pointer'
                    }}
                  >
                    完了して閉じる (Close)
                  </button>
                </div>
              )}
            </div>
          </div>
        );
      })()}

      {/* ================================================================= */}
      {/* BILL / INVOICE PREVIEW MODAL                                      */}
      {/* ================================================================= */}
      {billPreviewOrder && (() => {
        const orderBranch = resolveOrderStore(billPreviewOrder, stores);
        const tableNum = billPreviewOrder.tableNumber || extractTableNumber(billPreviewOrder.note);
        const tot = billPreviewOrder.grandTotal ?? billPreviewOrder.total;
        const recOrder = createReceiptOrderFromOrder(billPreviewOrder);

        return (
          <div className="cc-modal-backdrop" onClick={() => setBillPreviewOrder(null)}>
            <div className="cc-modal-content" style={{ maxWidth: '480px' }} onClick={e => e.stopPropagation()}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid var(--cc-line)', paddingBottom: '12px', marginBottom: '14px' }}>
                <div>
                  <h3 style={{ margin: 0, fontSize: '1.15rem', fontWeight: 800 }}>📄 お会計伝票・請求書プレビュー</h3>
                  <small style={{ color: 'var(--cc-muted)' }}>
                    🏪 {orderBranch?.name || 'アダルサ 本店'}
                  </small>
                </div>
                <button
                  type="button"
                  onClick={() => setBillPreviewOrder(null)}
                  style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--cc-muted)' }}
                >
                  <X size={20} />
                </button>
              </div>

              {/* Thermal Slip Styled Preview */}
              <div style={{ background: '#fff', color: '#000', borderRadius: '10px', padding: '18px 16px', fontFamily: 'monospace', fontSize: '0.85rem', lineHeight: 1.4, marginBottom: '16px' }}>
                <div style={{ textAlign: 'center', fontWeight: 'bold', fontSize: '1.05rem', marginBottom: '2px' }}>
                  {orderBranch?.name ? `本格インド料理 アダルサ ${orderBranch.name.replace(/^(アダルサ|本格インド料理\s*アダルサ)\s*/, '')}` : DEFAULT_STORE_SETTINGS.storeNameJa}
                </div>
                <div style={{ textAlign: 'center', fontSize: '0.75rem', color: '#444' }}>
                  {orderBranch?.address || DEFAULT_STORE_SETTINGS.addressJa}
                </div>
                <div style={{ textAlign: 'center', fontSize: '0.75rem', color: '#444', marginBottom: '8px' }}>
                  TEL: {orderBranch?.phone || DEFAULT_STORE_SETTINGS.phone}
                </div>
                <div style={{ textAlign: 'center', border: '1px solid #000', padding: '2px 8px', fontWeight: 'bold', margin: '6px auto', width: 'fit-content' }}>
                  お 会 計 伝 票
                </div>
                <div style={{ textAlign: 'center', fontSize: '0.75rem', color: '#555', marginBottom: '6px' }}>
                  兼 ご請求明細（Guest Check / Invoice）
                </div>
                <div style={{ borderTop: '1px dashed #000', margin: '6px 0' }} />
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem' }}>
                  <span>
                    伝票番号: {billPreviewOrder.orderNumbers && billPreviewOrder.orderNumbers.length > 1
                      ? billPreviewOrder.orderNumbers.map((n: number) => `#${formatOrderNumber(n)}`).join(', ')
                      : `#${formatOrderNumber(billPreviewOrder.number)}`}
                  </span>
                  <span>{tableNum ? `お席: 🪑 テーブル ${tableNum} ${billPreviewOrder.orderCount > 1 ? `(${billPreviewOrder.orderCount}回 注文合算)` : ''}` : billPreviewOrder.customerName}</span>
                </div>
                <div style={{ fontSize: '0.75rem', color: '#555' }}>
                  日時: {new Date(billPreviewOrder.createdAt).toLocaleString('ja-JP')}
                </div>
                <div style={{ borderTop: '1px solid #000', margin: '6px 0' }} />

                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', margin: '8px 0' }}>
                  {billPreviewOrder.items.map((line: any, idx: number) => {
                    const unit = line.unitPrice ?? Math.round((line.lineTotal || 0) / (line.quantity || 1));
                    return (
                      <div key={idx} style={{ display: 'flex', justifyContent: 'space-between' }}>
                        <span>
                          {line.roundNumber && billPreviewOrder.orderCount > 1 ? `[第${line.roundNumber}回] ` : ''}
                          {line.nameJa || line.nameEn} × {line.quantity}
                        </span>
                        <span>{yen(line.lineTotal || unit * line.quantity)}</span>
                      </div>
                    );
                  })}
                </div>

                <div style={{ borderTop: '1px dashed #000', margin: '6px 0' }} />
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem' }}>
                  <span>小計 (税抜)</span>
                  <span>{yen(billPreviewOrder.subtotal || Math.round(tot / (1 + (billPreviewOrder.taxRate || 10) / 100)))}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem' }}>
                  <span>消費税 ({billPreviewOrder.taxRate || (billPreviewOrder.fulfillment === 'DINE_IN' ? 10 : 8)}%)</span>
                  <span>{yen(billPreviewOrder.tax || (tot - (billPreviewOrder.subtotal || Math.round(tot / (1 + (billPreviewOrder.taxRate || 10) / 100)))))}</span>
                </div>
                {billPreviewOrder.offer?.discount > 0 && (
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem', color: '#b91c1c' }}>
                    <span>特典「{billPreviewOrder.offer.titleJa || 'クーポン'}」</span>
                    <span>−{yen(billPreviewOrder.offer.discount)}</span>
                  </div>
                )}
                {billPreviewOrder.pointsDiscount > 0 && (
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem', color: '#b91c1c' }}>
                    <span>ポイント利用 ({billPreviewOrder.pointsUsed}pt)</span>
                    <span>−{yen(billPreviewOrder.pointsDiscount)}</span>
                  </div>
                )}
                {billPreviewOrder.deliveryFee > 0 && (
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem' }}>
                    <span>配達料 (税込)</span>
                    <span>{yen(billPreviewOrder.deliveryFee)}</span>
                  </div>
                )}
                <div style={{ borderTop: '2px solid #000', margin: '6px 0' }} />
                <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 'bold', fontSize: '1.15rem' }}>
                  <span>お支払い合計</span>
                  <span>{yen(tot)}</span>
                </div>
                <div style={{ textAlign: 'center', fontSize: '0.72rem', color: '#555', marginTop: '10px' }}>
                  ※お帰りの際にこちらの伝票をレジカウンターまでお持ちください。
                </div>
              </div>

              <div style={{ display: 'flex', gap: '8px' }}>
                <button
                  type="button"
                  onClick={() => printBillInvoice(recOrder)}
                  style={{
                    flex: 2,
                    padding: '12px',
                    borderRadius: '8px',
                    border: 'none',
                    background: '#16a34a',
                    color: '#fff',
                    fontWeight: 800,
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '6px'
                  }}
                >
                  <Printer size={16} />
                  <span>お会計伝票を印刷 (Print Bill)</span>
                </button>
                <button
                  type="button"
                  onClick={() => setBillPreviewOrder(null)}
                  style={{
                    flex: 1,
                    padding: '12px',
                    borderRadius: '8px',
                    border: '1px solid var(--cc-line)',
                    background: 'var(--cc-card)',
                    color: '#fff',
                    fontWeight: 700,
                    cursor: 'pointer'
                  }}
                >
                  閉じる
                </button>
              </div>
            </div>
          </div>
        );
      })()}

      {/* ================================================================= */}
      {/* MODAL 1: CREATE NEW BILL TICKET (WALK-IN, DINE-IN, TAKEOUT, DELIV)*/}
      {/* ================================================================= */}
      {createBillModal && (
        <div className="cc-modal-backdrop" onClick={() => setCreateBillModal(false)}>
          <div className="cc-modal-content" style={{ maxWidth: '820px' }} onClick={e => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid var(--cc-line)', paddingBottom: '12px', marginBottom: '16px' }}>
              <div>
                <h2 style={{ margin: 0, fontSize: '1.25rem', fontWeight: 800 }}>🧾 新規未精算伝票の発行 (Create Unpaid Bill)</h2>
                <small style={{ color: 'var(--cc-muted)' }}>
                  店内飲食（テーブル）、店頭ウォークイン、テイクアウト、配達の未精算伝票を作成します
                </small>
              </div>
              <button type="button" onClick={() => setCreateBillModal(false)} style={{ background: 'none', border: 'none', color: 'var(--cc-muted)', cursor: 'pointer' }}><X size={20} /></button>
            </div>

            {/* Bill Details Controls: Fulfillment, Table, Customer, Store */}
            <div style={{ background: '#0f172a', border: '1px solid var(--cc-line)', borderRadius: '10px', padding: '12px 14px', marginBottom: '16px' }}>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '10px' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '0.78rem', color: 'var(--cc-muted)', marginBottom: '4px', fontWeight: 700 }}>区分 (Type)</label>
                  <div style={{ display: 'flex', gap: '4px' }}>
                    {(['DINE_IN', 'PICKUP', 'DELIVERY'] as const).map(f => (
                      <button
                        key={f}
                        type="button"
                        onClick={() => setBillFulfillment(f)}
                        style={{
                          flex: 1,
                          padding: '8px 4px',
                          borderRadius: '6px',
                          fontSize: '0.8rem',
                          fontWeight: 700,
                          border: `1.5px solid ${billFulfillment === f ? '#22c55e' : 'var(--cc-line)'}`,
                          background: billFulfillment === f ? 'rgba(34, 197, 94, 0.2)' : 'var(--cc-card)',
                          color: billFulfillment === f ? '#86efac' : 'var(--cc-muted)',
                          cursor: 'pointer'
                        }}
                      >
                        {f === 'DINE_IN' ? '🍽️ 店内' : f === 'PICKUP' ? '🛍️ 持帰' : '🛵 配達'}
                      </button>
                    ))}
                  </div>
                </div>

                {billFulfillment === 'DINE_IN' && (
                  <div>
                    <label style={{ display: 'block', fontSize: '0.78rem', color: 'var(--cc-muted)', marginBottom: '4px', fontWeight: 700 }}>テーブル番号</label>
                    <input
                      type="text"
                      placeholder="例: 1, 2, A, カウンター"
                      value={billTableNumber}
                      onChange={e => setBillTableNumber(e.target.value)}
                      style={{ width: '100%', padding: '7px 10px', borderRadius: '6px', border: '1px solid var(--cc-line)', background: '#1e293b', color: '#fff', fontSize: '0.85rem', boxSizing: 'border-box' }}
                    />
                  </div>
                )}

                <div>
                  <label style={{ display: 'block', fontSize: '0.78rem', color: 'var(--cc-muted)', marginBottom: '4px', fontWeight: 700 }}>お客様名 / 備考</label>
                  <input
                    type="text"
                    placeholder={billFulfillment === 'DINE_IN' ? (billTableNumber ? `テーブル ${billTableNumber}` : '店内客') : '店頭ウォークイン客'}
                    value={billCustomerName}
                    onChange={e => setBillCustomerName(e.target.value)}
                    style={{ width: '100%', padding: '7px 10px', borderRadius: '6px', border: '1px solid var(--cc-line)', background: '#1e293b', color: '#fff', fontSize: '0.85rem', boxSizing: 'border-box' }}
                  />
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '0.78rem', color: 'var(--cc-muted)', marginBottom: '4px', fontWeight: 700 }}>対象店舗 (Branch)</label>
                  <select
                    value={storeFilter !== 'ALL' ? storeFilter : (stores[0]?.id || '')}
                    onChange={e => setStoreFilter(e.target.value)}
                    style={{ width: '100%', padding: '7px 10px', borderRadius: '6px', border: '1px solid var(--cc-line)', background: '#1e293b', color: '#fff', fontSize: '0.85rem', boxSizing: 'border-box' }}
                  >
                    {stores.map(st => <option key={st.id} value={st.id}>🏪 {st.name}</option>)}
                  </select>
                </div>
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1.3fr 1fr', gap: '16px' }}>
              <div>
                <h4 style={{ margin: '0 0 8px', fontSize: '0.88rem', color: 'var(--cc-muted)' }}>クイックメニュー選択</h4>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(130px, 1fr))', gap: '8px', maxHeight: '240px', overflowY: 'auto', marginBottom: '12px' }}>
                  {PRESET_QUICK_ITEMS.map(item => (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => {
                        setBillCart(prev => {
                          const idx = prev.findIndex(p => p.item.id === item.id);
                          if (idx >= 0) {
                            const n = [...prev];
                            n[idx].quantity += 1;
                            return n;
                          }
                          return [...prev, { item, quantity: 1 }];
                        });
                      }}
                      style={{
                        padding: '8px 10px',
                        background: 'var(--cc-card)',
                        border: '1px solid var(--cc-line)',
                        borderRadius: '8px',
                        textAlign: 'left',
                        cursor: 'pointer',
                      }}
                    >
                      <div style={{ fontSize: '0.82rem', fontWeight: 700, color: '#fff' }}>{item.nameJa}</div>
                      <div style={{ fontSize: '0.92rem', fontWeight: 900, color: '#86efac', marginTop: '2px' }}>{yen(item.price)}</div>
                    </button>
                  ))}
                </div>

                {/* Custom Item Input */}
                <div style={{ background: '#1e293b', padding: '10px 12px', borderRadius: '8px', border: '1px solid var(--cc-line)' }}>
                  <div style={{ fontSize: '0.78rem', color: 'var(--cc-muted)', marginBottom: '6px', fontWeight: 700 }}>自由入力商品 (カスタム商品追加)</div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1.4fr 1fr auto', gap: '6px' }}>
                    <input
                      type="text"
                      placeholder="商品名 (例: 生ビール)"
                      value={customItemName}
                      onChange={e => setCustomItemName(e.target.value)}
                      style={{ padding: '6px 8px', borderRadius: '6px', border: '1px solid var(--cc-line)', background: '#0f172a', color: '#fff', fontSize: '0.82rem' }}
                    />
                    <input
                      type="number"
                      placeholder="金額 (円)"
                      value={customItemPrice}
                      onChange={e => setCustomItemPrice(e.target.value)}
                      style={{ padding: '6px 8px', borderRadius: '6px', border: '1px solid var(--cc-line)', background: '#0f172a', color: '#fff', fontSize: '0.82rem' }}
                    />
                    <button
                      type="button"
                      onClick={() => {
                        const price = parseInt(customItemPrice, 10);
                        if (!customItemName.trim()) return toast.error('商品名を入力してください');
                        if (isNaN(price) || price < 0) return toast.error('正しい金額を入力してください');
                        const customItem = {
                          id: `custom-${Date.now()}`,
                          nameJa: customItemName.trim(),
                          nameEn: customItemName.trim(),
                          price,
                        };
                        setBillCart(prev => [...prev, { item: customItem, quantity: 1 }]);
                        setCustomItemName('');
                        setCustomItemPrice('');
                      }}
                      style={{ padding: '6px 12px', borderRadius: '6px', background: '#3b82f6', color: '#fff', border: 'none', fontWeight: 700, fontSize: '0.82rem', cursor: 'pointer' }}
                    >
                      + 追加
                    </button>
                  </div>
                </div>
              </div>

              {/* Cart & Actions */}
              <div style={{ background: 'var(--cc-card)', borderRadius: '12px', padding: '14px', border: '1px solid var(--cc-line)', display: 'flex', flexDirection: 'column' }}>
                <h4 style={{ margin: '0 0 10px', fontSize: '0.9rem', color: 'var(--cc-muted)' }}>伝票カート ({billCart.length}品)</h4>
                <div style={{ maxHeight: '180px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '6px', marginBottom: '12px' }}>
                  {billCart.length === 0 ? (
                    <div style={{ textAlign: 'center', color: 'var(--cc-muted)', padding: '24px 0', fontSize: '0.85rem' }}>
                      商品を選択してください
                    </div>
                  ) : (
                    billCart.map(({ item, quantity }, idx) => (
                      <div key={idx} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.85rem', padding: '4px 0', borderBottom: '1px solid var(--cc-line)' }}>
                        <div>
                          <div style={{ fontWeight: 700 }}>{item.nameJa}</div>
                          <small style={{ color: '#86efac' }}>{yen(item.price)}</small>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                          <button type="button" onClick={() => setBillCart(p => p.map((l, i) => i === idx ? { ...l, quantity: Math.max(1, l.quantity - 1) } : l))} style={{ padding: '2px 6px', background: '#374151', border: 'none', borderRadius: '4px', cursor: 'pointer', color: '#fff' }}>-</button>
                          <strong>{quantity}</strong>
                          <button type="button" onClick={() => setBillCart(p => p.map((l, i) => i === idx ? { ...l, quantity: l.quantity + 1 } : l))} style={{ padding: '2px 6px', background: '#374151', border: 'none', borderRadius: '4px', cursor: 'pointer', color: '#fff' }}>+</button>
                          <button type="button" onClick={() => setBillCart(p => p.filter((_, i) => i !== idx))} style={{ background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer' }}><Trash2 size={13} /></button>
                        </div>
                      </div>
                    ))
                  )}
                </div>

                {/* Calculation breakdown */}
                <div style={{ borderTop: '1px solid var(--cc-line)', paddingTop: '8px', marginBottom: '14px', fontSize: '0.85rem' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '3px', color: 'var(--cc-muted)' }}>
                    <span>小計 (税抜):</span>
                    <span>{yen(billSubtotal)}</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px', color: 'var(--cc-muted)' }}>
                    <span>消費税 ({billTaxRate}%):</span>
                    <span>{yen(billTax)}</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '1.2rem', fontWeight: 900, color: '#86efac', borderTop: '1px dashed var(--cc-line)', paddingTop: '4px' }}>
                    <span>伝票合計:</span>
                    <span>{yen(billGrandTotal)}</span>
                  </div>
                </div>

                {/* Action Buttons */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginTop: 'auto' }}>
                  <button
                    type="button"
                    disabled={billCart.length === 0 || creatingBill}
                    onClick={() => handleCreateUnpaidBill(false)}
                    style={{
                      width: '100%',
                      padding: '11px',
                      borderRadius: '8px',
                      background: '#1e293b',
                      color: '#f8fafc',
                      border: '1.5px solid #475569',
                      fontWeight: 800,
                      cursor: billCart.length === 0 || creatingBill ? 'not-allowed' : 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: '6px'
                    }}
                  >
                    <FileText size={16} />
                    <span>{creatingBill ? '伝票発行中…' : '📄 未精算伝票を発行 (Boardに未精算登録)'}</span>
                  </button>

                  <button
                    type="button"
                    disabled={billCart.length === 0 || creatingBill}
                    onClick={() => handleCreateUnpaidBill(true)}
                    style={{
                      width: '100%',
                      padding: '12px',
                      borderRadius: '8px',
                      background: '#16a34a',
                      color: '#fff',
                      border: 'none',
                      fontWeight: 900,
                      cursor: billCart.length === 0 || creatingBill ? 'not-allowed' : 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: '6px',
                      boxShadow: '0 4px 12px rgba(22, 163, 74, 0.4)'
                    }}
                  >
                    <Receipt size={17} />
                    <span>{creatingBill ? '伝票発行中…' : '💳 伝票発行してお会計へ進む'}</span>
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ================================================================= */}
      {/* MODAL 2: CASH IN / OUT                                            */}
      {/* ================================================================= */}
      {movementModal && (
        <div className="cc-modal-backdrop" onClick={() => setMovementModal(false)}>
          <div className="cc-modal-content" style={{ maxWidth: '440px' }} onClick={e => e.stopPropagation()}>
            <h3 style={{ margin: '0 0 14px', fontSize: '1.2rem', fontWeight: 800 }}>釣銭補充・小口出金 (Cash Movement)</h3>
            
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', marginBottom: '14px' }}>
              <button
                type="button"
                onClick={() => setMovementType('OUT')}
                style={{
                  padding: '10px',
                  borderRadius: '8px',
                  fontWeight: 800,
                  border: `2px solid ${movementType === 'OUT' ? '#ef4444' : 'var(--cc-line)'}`,
                  background: movementType === 'OUT' ? 'rgba(239,68,68,0.2)' : 'var(--cc-card)',
                  color: movementType === 'OUT' ? '#fca5a5' : 'var(--cc-muted)',
                  cursor: 'pointer'
                }}
              >
                出金 (Cash Out)
              </button>
              <button
                type="button"
                onClick={() => setMovementType('IN')}
                style={{
                  padding: '10px',
                  borderRadius: '8px',
                  fontWeight: 800,
                  border: `2px solid ${movementType === 'IN' ? '#22c55e' : 'var(--cc-line)'}`,
                  background: movementType === 'IN' ? 'rgba(34,197,94,0.2)' : 'var(--cc-card)',
                  color: movementType === 'IN' ? '#86efac' : 'var(--cc-muted)',
                  cursor: 'pointer'
                }}
              >
                入金 (Cash In)
              </button>
            </div>

            <input
              type="number"
              placeholder="金額 (円)"
              value={movementAmount}
              onChange={e => setMovementAmount(e.target.value)}
              style={{ width: '100%', padding: '10px', fontSize: '1.2rem', fontWeight: 800, borderRadius: '8px', border: '1px solid var(--cc-line)', background: '#0f172a', color: '#fff', marginBottom: '12px', boxSizing: 'border-box' }}
            />

            <select
              value={movementReason}
              onChange={e => setMovementReason(e.target.value)}
              style={{ width: '100%', padding: '10px', borderRadius: '8px', border: '1px solid var(--cc-line)', background: '#1e293b', color: '#fff', marginBottom: '16px', boxSizing: 'border-box' }}
            >
              <option value="食材買い出し">食材買い出し (スーパー緊急購入)</option>
              <option value="氷・備品購入">氷・消耗品・備品購入</option>
              <option value="釣銭補充">釣銭補充 (両替戻り)</option>
              <option value="配達用釣銭持ち出し">配達用釣銭持ち出し</option>
              <option value="銀行預け入れ">銀行預け入れ</option>
              <option value="その他">その他</option>
            </select>

            <button
              type="button"
              onClick={async () => {
                const amt = parseInt(movementAmount, 10);
                if (isNaN(amt) || amt <= 0) return toast.error('金額を入力してください');
                await apiFetch('/api/v1/cash-register/movement', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ type: movementType, amount: amt, reason: movementReason }),
                });
                toast.success('登録しました');
                setMovementModal(false);
                loadData();
              }}
              style={{ width: '100%', padding: '12px', borderRadius: '8px', background: '#16a34a', color: '#fff', border: 'none', fontWeight: 800, cursor: 'pointer' }}
            >
              登録する
            </button>

            {movements.length > 0 && (
              <div style={{ marginTop: '16px', borderTop: '1px solid var(--cc-line)', paddingTop: '12px' }}>
                <div style={{ fontSize: '0.8rem', color: 'var(--cc-muted)', marginBottom: '8px' }}>本日入出金履歴 ({movements.length}件)</div>
                <div style={{ maxHeight: '120px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  {movements.slice(0, 5).map((m: any, idx: number) => (
                    <div key={idx} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem', padding: '4px 6px', background: 'rgba(255,255,255,0.03)', borderRadius: '4px' }}>
                      <span>{m.type === 'IN' ? '🟢 入金' : '🔴 出金'}: {m.reason}</span>
                      <strong style={{ color: m.type === 'IN' ? '#86efac' : '#fca5a5' }}>
                        {m.type === 'IN' ? '+' : '-'}{yen(m.amount)}
                      </strong>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ================================================================= */}
      {/* MODAL 3: CASH BALANCING & CLOSE SHIFT (金種実査・レジ締め)           */}
      {/* ================================================================= */}
      {balancingModal && (
        <div className="cc-modal-backdrop" onClick={() => setBalancingModal(false)}>
          <div className="cc-modal-content" style={{ maxWidth: '640px' }} onClick={e => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid var(--cc-line)', paddingBottom: '12px', marginBottom: '14px' }}>
              <h2 style={{ margin: 0, fontSize: '1.25rem', fontWeight: 800 }}>🧮 金種実査・レジ締め精算 (Balancing & Close)</h2>
              <button type="button" onClick={() => setBalancingModal(false)} style={{ background: 'none', border: 'none', color: 'var(--cc-muted)', cursor: 'pointer' }}><X size={20} /></button>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: '8px', maxHeight: '280px', overflowY: 'auto', marginBottom: '14px' }}>
              {JAPAN_DENOMINATIONS.map(({ yen: val, label }) => {
                const count = denominationsCount[val] || 0;
                return (
                  <div key={val} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '6px 10px', background: 'var(--cc-card)', borderRadius: '8px', border: '1px solid var(--cc-line)' }}>
                    <span style={{ fontSize: '0.85rem' }}>{label}</span>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <input
                        type="number"
                        min="0"
                        value={count || ''}
                        onChange={e => {
                          const v = parseInt(e.target.value, 10);
                          setDenominationsCount(p => ({ ...p, [val]: isNaN(v) ? 0 : Math.max(0, v) }));
                        }}
                        style={{ width: '50px', textAlign: 'center', padding: '4px', borderRadius: '4px', border: '1px solid #4b5563', background: '#0f172a', color: '#fff', fontWeight: 700 }}
                      />
                      <span style={{ minWidth: '65px', textAlign: 'right', fontSize: '0.85rem', fontWeight: 800, color: '#86efac' }}>{yen(val * count)}</span>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Theoretical vs Actual */}
            <div style={{ background: 'var(--cc-card)', padding: '12px 16px', borderRadius: '10px', border: '1px solid var(--cc-line)', marginBottom: '14px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.9rem', marginBottom: '4px' }}>
                <span style={{ color: 'var(--cc-muted)' }}>理論現金有高:</span>
                <strong>{yen(stats.expectedDrawerCash)}</strong>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.95rem', marginBottom: '6px' }}>
                <span style={{ color: '#86efac', fontWeight: 700 }}>実査現金合計:</span>
                <strong style={{ color: '#86efac', fontSize: '1.2rem' }}>{yen(actualCountedCash)}</strong>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', borderTop: '1px dashed var(--cc-line)', paddingTop: '6px', fontSize: '1.1rem', fontWeight: 900 }}>
                <span>過不足金 (Variance):</span>
                <span style={{ color: cashVariance === 0 ? '#22c55e' : cashVariance > 0 ? '#3b82f6' : '#ef4444' }}>
                  {cashVariance === 0 ? '±¥0 (過不足なし)' : cashVariance > 0 ? `+${yen(cashVariance)} (過剰)` : `-${yen(Math.abs(cashVariance))} (不足)`}
                </span>
              </div>
            </div>

            <textarea
              rows={2}
              placeholder="締めメモ・引き継ぎ事項など…"
              value={closeNotes}
              onChange={e => setCloseNotes(e.target.value)}
              style={{ width: '100%', padding: '8px', borderRadius: '8px', border: '1px solid var(--cc-line)', background: '#0f172a', color: '#fff', fontSize: '0.85rem', marginBottom: '14px', boxSizing: 'border-box' }}
            />

            <button
              type="button"
              onClick={handleCloseShift}
              style={{ width: '100%', padding: '14px', borderRadius: '10px', background: '#dc2626', color: '#fff', border: 'none', fontWeight: 900, cursor: 'pointer', fontSize: '1rem' }}
            >
              本日のレジ締めを実行＆Z-Report印刷
            </button>
          </div>
        </div>
      )}

      {/* ================================================================= */}
      {/* MODAL 4: TRANSACTION JOURNAL (決済ジャーナル)                      */}
      {/* ================================================================= */}
      {historyModal && (
        <div className="cc-modal-backdrop" onClick={() => setHistoryModal(false)}>
          <div className="cc-modal-content" style={{ maxWidth: '850px' }} onClick={e => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid var(--cc-line)', paddingBottom: '12px', marginBottom: '14px' }}>
              <h2 style={{ margin: 0, fontSize: '1.25rem', fontWeight: 800 }}>📜 本日決済ジャーナル ({transactions.length}件)</h2>
              <button
                type="button"
                onClick={async () => {
                  const XLSX = await import('xlsx');
                  const ws = XLSX.utils.json_to_sheet(transactions.map(t => ({
                    '時刻': new Date(t.timestamp).toLocaleTimeString('ja-JP'),
                    '番号': t.orderNumber || '店頭',
                    '席番': t.tableNumber || '-',
                    'お客様': t.customerName,
                    '内容': t.itemsSummary,
                    '金額': t.total,
                    '決済方法': t.paymentMethod,
                    '担当': t.staffName
                  })));
                  const wb = XLSX.utils.book_new();
                  XLSX.utils.book_append_sheet(wb, ws, 'Journal');
                  XLSX.writeFile(wb, `レジジャーナル_${new Date().toISOString().split('T')[0]}.xlsx`);
                }}
                style={{ padding: '6px 12px', background: '#16a34a', color: '#fff', border: 'none', borderRadius: '6px', fontWeight: 700, cursor: 'pointer', fontSize: '0.8rem', display: 'flex', alignItems: 'center', gap: '6px' }}
              >
                <FileSpreadsheet size={15} /> Excel
              </button>
            </div>

            <div style={{ display: 'flex', gap: '8px', marginBottom: '12px', alignItems: 'center' }}>
              <div style={{ position: 'relative', flex: 1 }}>
                <Search size={16} style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', color: 'var(--cc-muted)' }} />
                <input
                  type="text"
                  placeholder="注文番号、席番号、商品名、お客様名で検索..."
                  value={historySearch}
                  onChange={e => setHistorySearch(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '8px 10px 8px 34px',
                    borderRadius: '8px',
                    border: '1px solid var(--cc-line)',
                    background: '#111827',
                    color: '#fff',
                    fontSize: '0.85rem',
                    boxSizing: 'border-box'
                  }}
                />
              </div>
              {historySearch && (
                <button
                  type="button"
                  onClick={() => setHistorySearch('')}
                  style={{ padding: '6px 10px', background: '#374151', color: '#fff', border: 'none', borderRadius: '6px', fontSize: '0.8rem', cursor: 'pointer' }}
                >
                  クリア
                </button>
              )}
            </div>

            <div style={{ maxHeight: '380px', overflowY: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid var(--cc-line)', color: 'var(--cc-muted)', textAlign: 'left' }}>
                    <th style={{ padding: '8px' }}>時刻</th>
                    <th style={{ padding: '8px' }}>伝票/席</th>
                    <th style={{ padding: '8px' }}>商品</th>
                    <th style={{ padding: '8px' }}>方法</th>
                    <th style={{ padding: '8px', textAlign: 'right' }}>金額</th>
                    <th style={{ padding: '8px', textAlign: 'center' }}>再発行</th>
                  </tr>
                </thead>
                <tbody>
                  {transactions
                    .filter(tx => {
                      if (!historySearch.trim()) return true;
                      const q = historySearch.toLowerCase();
                      return (
                        String(tx.orderNumber || '').toLowerCase().includes(q) ||
                        String(tx.tableNumber || '').toLowerCase().includes(q) ||
                        (tx.customerName || '').toLowerCase().includes(q) ||
                        (tx.itemsSummary || '').toLowerCase().includes(q) ||
                        (tx.paymentMethod || '').toLowerCase().includes(q)
                      );
                    })
                    .map(tx => (
                    <tr key={tx.id} style={{ borderBottom: '1px solid var(--cc-line)' }}>
                      <td style={{ padding: '8px' }}>{new Date(tx.timestamp).toLocaleTimeString('ja-JP')}</td>
                      <td style={{ padding: '8px', fontWeight: 800 }}>{tx.tableNumber ? `🪑 ${tx.tableNumber}` : `#${formatOrderNumber(tx.orderNumber || 0)}`}</td>
                      <td style={{ padding: '8px', maxWidth: '240px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{tx.itemsSummary}</td>
                      <td style={{ padding: '8px' }}>{tx.paymentMethod}</td>
                      <td style={{ padding: '8px', textAlign: 'right', fontWeight: 800, color: '#86efac' }}>{yen(tx.total)}</td>
                      <td style={{ padding: '8px', textAlign: 'center' }}>
                        <button
                          type="button"
                          onClick={() => {
                            const recOrder: ReceiptOrder = {
                              number: tx.orderNumber || 999,
                              customerName: tx.customerName || '店頭客',
                              pickupAt: tx.timestamp,
                              fulfillment: tx.fulfillment || 'PICKUP',
                              note: `決済方法: ${tx.paymentMethod} | お預かり: ${yen(tx.amountTendered)} | お釣り: ${yen(tx.changeAmount)}`,
                              items: (tx.items || []).map((i: any) => ({
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
                          style={{ background: 'none', border: 'none', color: '#60a5fa', cursor: 'pointer' }}
                        >
                          <Printer size={15} />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
