/**
 * Shared cashier / POS payment methods (Japan-focused).
 * Enabled set is managed in Admin → Table Ordering (cashierPaymentMethods).
 */

export type PaymentDeviceProvider =
  | 'SQUARE_TERMINAL'
  | 'CAT_TERMINAL'
  | 'QR_DISPLAY'
  | 'CASH_DRAWER'
  | 'MANUAL';

export type CashierPaymentMethod =
  | 'CASH'
  | 'CARD'
  | 'PAYPAY'
  | 'RAKUTEN_PAY'
  | 'D_PAY'
  | 'AU_PAY'
  | 'MERPAY'
  | 'WECHAT_PAY'
  | 'IC'
  | 'ID_QUICPAY'
  | 'INVOICE'
  | 'BANK_TRANSFER';

export type CashierPaymentMethodFlags = Record<CashierPaymentMethod, boolean>;

export const ALL_CASHIER_PAYMENT_METHODS: Array<{
  id: CashierPaymentMethod;
  label: string;
  labelJa: string;
  color: string;
  bg: string;
  /** Device providers that can receive this tender at the counter. */
  deviceProviders: PaymentDeviceProvider[];
}> = [
  { id: 'CASH', label: 'Cash', labelJa: '現金 (Cash)', color: '#15803d', bg: '#f0fdf4', deviceProviders: ['CASH_DRAWER', 'MANUAL'] },
  { id: 'CARD', label: 'Card', labelJa: 'クレジットカード', color: '#1d4ed8', bg: '#eff6ff', deviceProviders: ['SQUARE_TERMINAL', 'CAT_TERMINAL'] },
  { id: 'PAYPAY', label: 'PayPay', labelJa: 'PayPay', color: '#dc2626', bg: '#fef2f2', deviceProviders: ['QR_DISPLAY', 'CAT_TERMINAL', 'MANUAL'] },
  { id: 'RAKUTEN_PAY', label: 'Rakuten Pay', labelJa: '楽天ペイ', color: '#bf1234', bg: '#fff1f2', deviceProviders: ['QR_DISPLAY', 'CAT_TERMINAL', 'MANUAL'] },
  { id: 'D_PAY', label: 'd払い', labelJa: 'd払い', color: '#cc0033', bg: '#fff1f2', deviceProviders: ['QR_DISPLAY', 'CAT_TERMINAL', 'MANUAL'] },
  { id: 'AU_PAY', label: 'au PAY', labelJa: 'au PAY', color: '#eb5505', bg: '#fff7ed', deviceProviders: ['QR_DISPLAY', 'CAT_TERMINAL', 'MANUAL'] },
  { id: 'MERPAY', label: 'Merpay', labelJa: 'メルペイ', color: '#e8383d', bg: '#fef2f2', deviceProviders: ['QR_DISPLAY', 'MANUAL'] },
  { id: 'WECHAT_PAY', label: 'WeChat Pay', labelJa: 'WeChat Pay（微信）', color: '#07c160', bg: '#ecfdf5', deviceProviders: ['QR_DISPLAY', 'CAT_TERMINAL', 'MANUAL'] },
  { id: 'IC', label: 'Transit IC', labelJa: '交通系IC (Suica等)', color: '#0284c7', bg: '#f0f9ff', deviceProviders: ['CAT_TERMINAL', 'SQUARE_TERMINAL', 'MANUAL'] },
  { id: 'ID_QUICPAY', label: 'iD / QUICPay', labelJa: 'iD / QUICPay', color: '#7c3aed', bg: '#faf5ff', deviceProviders: ['CAT_TERMINAL', 'SQUARE_TERMINAL', 'MANUAL'] },
  { id: 'INVOICE', label: 'Invoice', labelJa: '売掛・請求書払い', color: '#475569', bg: '#f8fafc', deviceProviders: ['MANUAL'] },
  { id: 'BANK_TRANSFER', label: 'Bank transfer', labelJa: '銀行振込 (振込)', color: '#d97706', bg: '#fffbeb', deviceProviders: ['MANUAL'] },
];

export const PAYMENT_DEVICE_PROVIDERS: Array<{
  id: PaymentDeviceProvider;
  labelJa: string;
  description: string;
  defaultCapabilities: CashierPaymentMethod[];
  needsPairing: boolean;
}> = [
  {
    id: 'SQUARE_TERMINAL',
    labelJa: 'Square Terminal',
    description: 'Square 決済端末（ペアリング後、カード・タッチ決済を自動送信）',
    defaultCapabilities: ['CARD', 'IC', 'ID_QUICPAY'],
    needsPairing: true,
  },
  {
    id: 'CAT_TERMINAL',
    labelJa: 'CAT / マルチ決済端末',
    description: 'クレジットカード・IC・QR 対応の据置／モバイル CAT（ステラ・GMO 等）',
    defaultCapabilities: ['CARD', 'IC', 'ID_QUICPAY', 'PAYPAY', 'RAKUTEN_PAY', 'D_PAY', 'AU_PAY', 'WECHAT_PAY'],
    needsPairing: false,
  },
  {
    id: 'QR_DISPLAY',
    labelJa: 'QRコード提示端末',
    description: 'PayPay・楽天ペイ・d払い・au PAY・WeChat などの店舗QR／タブレット表示',
    defaultCapabilities: ['PAYPAY', 'RAKUTEN_PAY', 'D_PAY', 'AU_PAY', 'MERPAY', 'WECHAT_PAY'],
    needsPairing: false,
  },
  {
    id: 'CASH_DRAWER',
    labelJa: 'キャッシュドロワー',
    description: '現金会計用ドロワー（店舗レジに紐づけ）',
    defaultCapabilities: ['CASH'],
    needsPairing: false,
  },
  {
    id: 'MANUAL',
    labelJa: '手動確認のみ',
    description: '端末なし／スタッフが目視確認してレジで受領確定',
    defaultCapabilities: ['INVOICE', 'BANK_TRANSFER', 'CASH'],
    needsPairing: false,
  },
];

export const DEFAULT_CASHIER_PAYMENT_METHODS: CashierPaymentMethodFlags = {
  CASH: true,
  CARD: true,
  PAYPAY: true,
  RAKUTEN_PAY: true,
  D_PAY: true,
  AU_PAY: true,
  MERPAY: false,
  WECHAT_PAY: false,
  IC: true,
  ID_QUICPAY: true,
  INVOICE: true,
  BANK_TRANSFER: false,
};

export function normalizeCashierPaymentMethods(
  raw: Partial<CashierPaymentMethodFlags> | null | undefined,
): CashierPaymentMethodFlags {
  return {
    ...DEFAULT_CASHIER_PAYMENT_METHODS,
    ...(raw && typeof raw === 'object' ? raw : {}),
  };
}

export function enabledCashierPaymentMethods(
  flags: CashierPaymentMethodFlags | null | undefined,
): typeof ALL_CASHIER_PAYMENT_METHODS {
  const normalized = normalizeCashierPaymentMethods(flags);
  const enabled = ALL_CASHIER_PAYMENT_METHODS.filter(m => normalized[m.id] !== false);
  return enabled.length > 0 ? enabled : ALL_CASHIER_PAYMENT_METHODS.filter(m => m.id === 'CASH');
}

export function cashierMethodLabel(id: string): string {
  return ALL_CASHIER_PAYMENT_METHODS.find(m => m.id === id)?.labelJa || id;
}

export function paymentDeviceProviderLabel(id: string): string {
  return PAYMENT_DEVICE_PROVIDERS.find(p => p.id === id)?.labelJa || id;
}

export function deviceSupportsMethod(
  capabilities: string[] | null | undefined,
  method: string,
): boolean {
  return Array.isArray(capabilities) && capabilities.includes(method);
}
