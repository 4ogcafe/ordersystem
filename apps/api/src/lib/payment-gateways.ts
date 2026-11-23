import crypto from 'node:crypto';
import { prisma } from './prisma.js';
import type { DeviceCapability, PaymentDeviceProvider } from './payment-devices.js';

export const PAYMENT_GATEWAYS_SECRET_ID = 'PAYMENT_GATEWAYS';

export type PaymentGatewayKind =
  | 'SQUARE'
  | 'PAYPAY'
  | 'RAKUTEN_PAY'
  | 'D_PAY'
  | 'AU_PAY'
  | 'MERPAY'
  | 'WECHAT_PAY'
  | 'GMO_PG'
  | 'CAT_MULT'
  | 'DIGITAL_WAGE'
  | 'MANUAL';

export type PaymentGatewayConnection = {
  id: string;
  kind: PaymentGatewayKind;
  /** Display label, e.g. "武蔵境 Square" */
  label: string;
  storeId: string | null;
  status: 'CONNECTED' | 'DISCONNECTED' | 'PENDING';
  /** Public merchant / shop identifiers (safe to show). */
  merchantId: string;
  shopId: string;
  locationId: string;
  terminalId: string;
  /** Digital wage: designated fund-transfer operator account / company code */
  wageAccountId: string;
  wageProvider: string;
  environment: 'sandbox' | 'production';
  /** Secrets stored server-side; never returned in full. */
  apiKey: string;
  apiSecret: string;
  accessToken: string;
  notes: string;
  connectedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type PaymentGatewayCatalogItem = {
  kind: PaymentGatewayKind;
  labelJa: string;
  description: string;
  deviceProvider: PaymentDeviceProvider;
  defaultCapabilities: DeviceCapability[];
  fields: Array<{
    key: keyof Pick<
      PaymentGatewayConnection,
      | 'merchantId'
      | 'shopId'
      | 'locationId'
      | 'terminalId'
      | 'wageAccountId'
      | 'wageProvider'
      | 'apiKey'
      | 'apiSecret'
      | 'accessToken'
      | 'notes'
      | 'environment'
    >;
    labelJa: string;
    secret?: boolean;
    placeholder?: string;
    required?: boolean;
  }>;
};

export const PAYMENT_GATEWAY_CATALOG: PaymentGatewayCatalogItem[] = [
  {
    kind: 'SQUARE',
    labelJa: 'Square',
    description: 'Square 加盟店アカウント（Access Token / Location ID）を手動接続',
    deviceProvider: 'SQUARE_TERMINAL',
    defaultCapabilities: ['CARD', 'IC', 'ID_QUICPAY'],
    fields: [
      { key: 'accessToken', labelJa: 'Access Token', secret: true, required: true, placeholder: 'EAAAxxxx…' },
      { key: 'locationId', labelJa: 'Location ID', required: true, placeholder: 'LXXXX…' },
      { key: 'merchantId', labelJa: 'Merchant ID（任意）', placeholder: 'MLXXXX…' },
      { key: 'environment', labelJa: '環境 (sandbox / production)', placeholder: 'production' },
      { key: 'notes', labelJa: 'メモ' },
    ],
  },
  {
    kind: 'PAYPAY',
    labelJa: 'PayPay for Business',
    description: 'PayPay 加盟店（店舗QR / 決済）を手動接続',
    deviceProvider: 'QR_DISPLAY',
    defaultCapabilities: ['PAYPAY'],
    fields: [
      { key: 'merchantId', labelJa: '加盟店 ID / 店舗 ID', required: true },
      { key: 'apiKey', labelJa: 'API Key（任意）', secret: true },
      { key: 'apiSecret', labelJa: 'API Secret（任意）', secret: true },
      { key: 'shopId', labelJa: 'Shop ID（任意）' },
      { key: 'notes', labelJa: 'メモ / 静的QRメモ' },
    ],
  },
  {
    kind: 'RAKUTEN_PAY',
    labelJa: '楽天ペイ',
    description: '楽天ペイ加盟店を手動接続',
    deviceProvider: 'QR_DISPLAY',
    defaultCapabilities: ['RAKUTEN_PAY'],
    fields: [
      { key: 'merchantId', labelJa: '加盟店番号', required: true },
      { key: 'shopId', labelJa: '店舗番号' },
      { key: 'apiKey', labelJa: 'API Key（任意）', secret: true },
      { key: 'notes', labelJa: 'メモ' },
    ],
  },
  {
    kind: 'D_PAY',
    labelJa: 'd払い',
    description: 'd払い加盟店を手動接続',
    deviceProvider: 'QR_DISPLAY',
    defaultCapabilities: ['D_PAY'],
    fields: [
      { key: 'merchantId', labelJa: '加盟店 ID', required: true },
      { key: 'shopId', labelJa: '店舗コード' },
      { key: 'apiKey', labelJa: 'API Key（任意）', secret: true },
      { key: 'notes', labelJa: 'メモ' },
    ],
  },
  {
    kind: 'AU_PAY',
    labelJa: 'au PAY',
    description: 'au PAY 加盟店を手動接続',
    deviceProvider: 'QR_DISPLAY',
    defaultCapabilities: ['AU_PAY'],
    fields: [
      { key: 'merchantId', labelJa: '加盟店 ID', required: true },
      { key: 'shopId', labelJa: '店舗 ID' },
      { key: 'apiKey', labelJa: 'API Key（任意）', secret: true },
      { key: 'notes', labelJa: 'メモ' },
    ],
  },
  {
    kind: 'MERPAY',
    labelJa: 'メルペイ',
    description: 'メルペイ加盟店を手動接続',
    deviceProvider: 'QR_DISPLAY',
    defaultCapabilities: ['MERPAY'],
    fields: [
      { key: 'merchantId', labelJa: '加盟店 ID', required: true },
      { key: 'apiKey', labelJa: 'API Key（任意）', secret: true },
      { key: 'notes', labelJa: 'メモ' },
    ],
  },
  {
    kind: 'WECHAT_PAY',
    labelJa: 'WeChat Pay',
    description: 'WeChat Pay 加盟店を手動接続',
    deviceProvider: 'QR_DISPLAY',
    defaultCapabilities: ['WECHAT_PAY'],
    fields: [
      { key: 'merchantId', labelJa: 'Merchant ID (mch_id)', required: true },
      { key: 'apiKey', labelJa: 'API Key', secret: true },
      { key: 'shopId', labelJa: 'App ID（任意）' },
      { key: 'notes', labelJa: 'メモ' },
    ],
  },
  {
    kind: 'GMO_PG',
    labelJa: 'GMOペイメントゲートウェイ',
    description: 'GMO-PG ショップ ID / パスワードを手動接続',
    deviceProvider: 'CAT_TERMINAL',
    defaultCapabilities: ['CARD', 'IC', 'ID_QUICPAY', 'PAYPAY', 'RAKUTEN_PAY', 'AU_PAY', 'D_PAY'],
    fields: [
      { key: 'shopId', labelJa: 'Shop ID', required: true },
      { key: 'apiKey', labelJa: 'Shop Pass / API パスワード', secret: true, required: true },
      { key: 'merchantId', labelJa: 'Site ID（任意）' },
      { key: 'apiSecret', labelJa: 'Site Pass（任意）', secret: true },
      { key: 'notes', labelJa: 'メモ' },
    ],
  },
  {
    kind: 'CAT_MULT',
    labelJa: 'CAT / マルチ決済端末ゲートウェイ',
    description: 'ステラ端末・VEGA・その他 CAT の加盟店情報を手動接続',
    deviceProvider: 'CAT_TERMINAL',
    defaultCapabilities: ['CARD', 'IC', 'ID_QUICPAY', 'PAYPAY', 'RAKUTEN_PAY', 'AU_PAY', 'D_PAY', 'WECHAT_PAY'],
    fields: [
      { key: 'merchantId', labelJa: '加盟店番号', required: true },
      { key: 'terminalId', labelJa: '端末 TID / シリアル' },
      { key: 'shopId', labelJa: '店舗コード' },
      { key: 'apiKey', labelJa: '接続キー（任意）', secret: true },
      { key: 'notes', labelJa: 'メモ' },
    ],
  },
  {
    kind: 'DIGITAL_WAGE',
    labelJa: '賃金のデジタル払い（Digital Wage）',
    description: 'PayPay給与受取・楽天ペイ給与・au PAY給与など指定資金移動業者への手動接続',
    deviceProvider: 'MANUAL',
    defaultCapabilities: ['BANK_TRANSFER'],
    fields: [
      {
        key: 'wageProvider',
        labelJa: '指定資金移動業者',
        required: true,
        placeholder: 'PayPay給与受取 / 楽天ペイ給与受取 / au PAY給与受取 / COIN+',
      },
      { key: 'wageAccountId', labelJa: '入金用口座番号 / アカウント ID', required: true },
      { key: 'merchantId', labelJa: '事業所・会社コード（任意）' },
      { key: 'notes', labelJa: '労使協定・運用メモ' },
    ],
  },
  {
    kind: 'MANUAL',
    labelJa: 'その他 / 手動ゲートウェイ',
    description: '上記以外の決済事業者をメモ付きで手動登録',
    deviceProvider: 'MANUAL',
    defaultCapabilities: ['INVOICE', 'BANK_TRANSFER'],
    fields: [
      { key: 'merchantId', labelJa: '加盟店 ID / アカウント', required: true },
      { key: 'apiKey', labelJa: 'API Key（任意）', secret: true },
      { key: 'notes', labelJa: '接続内容メモ', required: true },
    ],
  },
];

type Store = { gateways: PaymentGatewayConnection[] };

function maskSecret(value: string): string {
  if (!value) return '';
  if (value.length <= 8) return '••••••••';
  return `${value.slice(0, 4)}…${value.slice(-4)}`;
}

function keepSecret(incoming: string | undefined | null, previous: string): string {
  if (incoming === undefined || incoming === null) return previous;
  const trimmed = String(incoming).trim();
  if (!trimmed || trimmed.includes('…') || trimmed.includes('•')) return previous;
  return trimmed;
}

function emptyGateway(partial: Partial<PaymentGatewayConnection> & { kind: PaymentGatewayKind; label: string }): PaymentGatewayConnection {
  const now = new Date().toISOString();
  return {
    id: partial.id || crypto.randomUUID(),
    kind: partial.kind,
    label: partial.label.trim(),
    storeId: partial.storeId ?? null,
    status: partial.status || 'CONNECTED',
    merchantId: String(partial.merchantId || '').trim(),
    shopId: String(partial.shopId || '').trim(),
    locationId: String(partial.locationId || '').trim(),
    terminalId: String(partial.terminalId || '').trim(),
    wageAccountId: String(partial.wageAccountId || '').trim(),
    wageProvider: String(partial.wageProvider || '').trim(),
    environment: partial.environment === 'sandbox' ? 'sandbox' : 'production',
    apiKey: String(partial.apiKey || '').trim(),
    apiSecret: String(partial.apiSecret || '').trim(),
    accessToken: String(partial.accessToken || '').trim(),
    notes: String(partial.notes || '').trim(),
    connectedAt: partial.connectedAt ?? now,
    createdAt: partial.createdAt || now,
    updatedAt: now,
  };
}

function normalizeGateway(raw: Record<string, unknown>): PaymentGatewayConnection {
  const kind = (typeof raw.kind === 'string' ? raw.kind : 'MANUAL') as PaymentGatewayKind;
  return emptyGateway({
    id: typeof raw.id === 'string' ? raw.id : crypto.randomUUID(),
    kind,
    label: typeof raw.label === 'string' ? raw.label : kind,
    storeId: typeof raw.storeId === 'string' ? raw.storeId : null,
    status: raw.status === 'DISCONNECTED' || raw.status === 'PENDING' || raw.status === 'CONNECTED' ? raw.status : 'CONNECTED',
    merchantId: typeof raw.merchantId === 'string' ? raw.merchantId : '',
    shopId: typeof raw.shopId === 'string' ? raw.shopId : '',
    locationId: typeof raw.locationId === 'string' ? raw.locationId : '',
    terminalId: typeof raw.terminalId === 'string' ? raw.terminalId : '',
    wageAccountId: typeof raw.wageAccountId === 'string' ? raw.wageAccountId : '',
    wageProvider: typeof raw.wageProvider === 'string' ? raw.wageProvider : '',
    environment: raw.environment === 'sandbox' ? 'sandbox' : 'production',
    apiKey: typeof raw.apiKey === 'string' ? raw.apiKey : '',
    apiSecret: typeof raw.apiSecret === 'string' ? raw.apiSecret : '',
    accessToken: typeof raw.accessToken === 'string' ? raw.accessToken : '',
    notes: typeof raw.notes === 'string' ? raw.notes : '',
    connectedAt: typeof raw.connectedAt === 'string' ? raw.connectedAt : null,
    createdAt: typeof raw.createdAt === 'string' ? raw.createdAt : undefined,
    updatedAt: typeof raw.updatedAt === 'string' ? raw.updatedAt : undefined,
  });
}

async function readStore(): Promise<Store> {
  const row = await prisma.appSecret.findUnique({ where: { id: PAYMENT_GATEWAYS_SECRET_ID } }).catch(() => null);
  if (!row?.publicKey) return { gateways: [] };
  try {
    const parsed = JSON.parse(row.publicKey) as Store;
    const list = Array.isArray(parsed.gateways) ? parsed.gateways : [];
    return {
      gateways: list
        .filter(g => g && typeof g === 'object')
        .map(g => normalizeGateway(g as unknown as Record<string, unknown>)),
    };
  } catch {
    return { gateways: [] };
  }
}

async function writeStore(store: Store): Promise<void> {
  const publicKey = JSON.stringify({ gateways: store.gateways });
  await prisma.appSecret.upsert({
    where: { id: PAYMENT_GATEWAYS_SECRET_ID },
    create: { id: PAYMENT_GATEWAYS_SECRET_ID, publicKey, privateKey: '' },
    update: { publicKey },
  });
}

/** Safe for admin UI — secrets masked. */
export function toAdminGateway(g: PaymentGatewayConnection) {
  return {
    ...g,
    apiKey: maskSecret(g.apiKey),
    apiSecret: maskSecret(g.apiSecret),
    accessToken: maskSecret(g.accessToken),
    hasApiKey: Boolean(g.apiKey),
    hasApiSecret: Boolean(g.apiSecret),
    hasAccessToken: Boolean(g.accessToken),
  };
}

export async function listPaymentGateways(opts?: {
  storeId?: string | null;
  kind?: string | null;
  connectedOnly?: boolean;
}): Promise<PaymentGatewayConnection[]> {
  let list = (await readStore()).gateways;
  if (opts?.connectedOnly) list = list.filter(g => g.status === 'CONNECTED');
  if (opts?.kind) list = list.filter(g => g.kind === opts.kind);
  if (opts?.storeId) {
    const sid = opts.storeId;
    list = list.filter(g => !g.storeId || g.storeId === sid);
  }
  return list.sort((a, b) => a.label.localeCompare(b.label, 'ja'));
}

export async function getPaymentGateway(id: string): Promise<PaymentGatewayConnection | null> {
  const list = (await readStore()).gateways;
  return list.find(g => g.id === id) ?? null;
}

export async function connectPaymentGateway(
  input: Partial<PaymentGatewayConnection> & { kind: PaymentGatewayKind; label: string },
): Promise<PaymentGatewayConnection> {
  const store = await readStore();
  const gateway = emptyGateway({
    ...input,
    status: 'CONNECTED',
    connectedAt: new Date().toISOString(),
  });
  store.gateways.push(gateway);
  await writeStore(store);
  return gateway;
}

export async function updatePaymentGateway(
  id: string,
  patch: Partial<PaymentGatewayConnection>,
): Promise<PaymentGatewayConnection | null> {
  const store = await readStore();
  const idx = store.gateways.findIndex(g => g.id === id);
  if (idx < 0) return null;
  const current = store.gateways[idx];
  const next = emptyGateway({
    ...current,
    ...patch,
    id: current.id,
    kind: patch.kind || current.kind,
    label: patch.label?.trim() || current.label,
    apiKey: keepSecret(patch.apiKey, current.apiKey),
    apiSecret: keepSecret(patch.apiSecret, current.apiSecret),
    accessToken: keepSecret(patch.accessToken, current.accessToken),
    createdAt: current.createdAt,
    connectedAt: patch.status === 'CONNECTED' ? new Date().toISOString() : current.connectedAt,
  });
  store.gateways[idx] = next;
  await writeStore(store);
  return next;
}

export async function disconnectPaymentGateway(id: string): Promise<boolean> {
  const store = await readStore();
  const before = store.gateways.length;
  store.gateways = store.gateways.filter(g => g.id !== id);
  if (store.gateways.length === before) return false;
  await writeStore(store);
  return true;
}

export function catalogItem(kind: PaymentGatewayKind): PaymentGatewayCatalogItem | undefined {
  return PAYMENT_GATEWAY_CATALOG.find(c => c.kind === kind);
}
