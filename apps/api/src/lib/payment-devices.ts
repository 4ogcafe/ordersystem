import crypto from 'node:crypto';
import { prisma } from './prisma.js';

export const PAYMENT_DEVICES_SECRET_ID = 'PAYMENT_RECEIVING_DEVICES';

/** Japan payment tenders a device can accept. */
export type DeviceCapability =
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

export type PaymentDeviceProvider =
  | 'SQUARE_TERMINAL'
  | 'CAT_TERMINAL'
  | 'QR_DISPLAY'
  | 'CASH_DRAWER'
  | 'MANUAL';

export interface PaymentReceivingDevice {
  id: string;
  name: string;
  /** Device category (Square, CAT, QR display, drawer, manual). */
  provider: PaymentDeviceProvider;
  /** Square Terminal device id (e.g. device:XXXX). Empty until pairing completes. */
  squareDeviceId: string;
  model: string | null;
  /** null / '' = available for every store */
  storeId: string | null;
  isDefault: boolean;
  isActive: boolean;
  status: string;
  /** Pairing code from Square Devices API (shown once while waiting). */
  pairingCode: string | null;
  pairingExpiresAt: string | null;
  squareDeviceCodeId: string | null;
  pairedAt: string | null;
  lastSyncedAt: string | null;
  /** Tenders this device can take at the counter. */
  capabilities: DeviceCapability[];
  /** CAT / multi-payment terminal serial or TID. */
  terminalSerial: string | null;
  /** Merchant / shop ID for QR or CAT. */
  merchantId: string | null;
  /** Static store QR payload / URL for QR_DISPLAY. */
  qrPayload: string | null;
  notes: string | null;
  /** Linked payment gateway connection id (manual Connect). */
  gatewayId: string | null;
  createdAt: string;
  updatedAt: string;
}

type Store = { devices: PaymentReceivingDevice[] };

export const DEFAULT_CAPABILITIES: Record<PaymentDeviceProvider, DeviceCapability[]> = {
  SQUARE_TERMINAL: ['CARD', 'IC', 'ID_QUICPAY'],
  CAT_TERMINAL: ['CARD', 'IC', 'ID_QUICPAY', 'PAYPAY', 'RAKUTEN_PAY', 'D_PAY', 'AU_PAY', 'WECHAT_PAY'],
  QR_DISPLAY: ['PAYPAY', 'RAKUTEN_PAY', 'D_PAY', 'AU_PAY', 'MERPAY', 'WECHAT_PAY'],
  CASH_DRAWER: ['CASH'],
  MANUAL: ['INVOICE', 'BANK_TRANSFER', 'CASH'],
};

function isProvider(v: unknown): v is PaymentDeviceProvider {
  return (
    v === 'SQUARE_TERMINAL' ||
    v === 'CAT_TERMINAL' ||
    v === 'QR_DISPLAY' ||
    v === 'CASH_DRAWER' ||
    v === 'MANUAL'
  );
}

function normalizeCapabilities(raw: unknown, provider: PaymentDeviceProvider): DeviceCapability[] {
  if (Array.isArray(raw) && raw.length > 0) {
    return raw.filter((x): x is DeviceCapability => typeof x === 'string');
  }
  return [...DEFAULT_CAPABILITIES[provider]];
}

/** Upgrade legacy Square-only rows to the multi-provider shape. */
export function normalizePaymentDevice(raw: Record<string, unknown>): PaymentReceivingDevice {
  const provider: PaymentDeviceProvider = isProvider(raw.provider) ? raw.provider : 'SQUARE_TERMINAL';
  const now = new Date().toISOString();
  const squareDeviceId =
    typeof raw.squareDeviceId === 'string'
      ? raw.squareDeviceId
      : typeof raw.deviceId === 'string'
        ? raw.deviceId
        : '';
  return {
    id: typeof raw.id === 'string' ? raw.id : crypto.randomUUID(),
    name: typeof raw.name === 'string' ? raw.name : 'Device',
    provider,
    squareDeviceId,
    model: typeof raw.model === 'string' ? raw.model : raw.model === null ? null : null,
    storeId: typeof raw.storeId === 'string' ? raw.storeId : null,
    isDefault: Boolean(raw.isDefault),
    isActive: raw.isActive !== false,
    status: typeof raw.status === 'string' ? raw.status : provider === 'SQUARE_TERMINAL' ? 'UNPAIRED' : 'READY',
    pairingCode: typeof raw.pairingCode === 'string' ? raw.pairingCode : null,
    pairingExpiresAt: typeof raw.pairingExpiresAt === 'string' ? raw.pairingExpiresAt : null,
    squareDeviceCodeId: typeof raw.squareDeviceCodeId === 'string' ? raw.squareDeviceCodeId : null,
    pairedAt: typeof raw.pairedAt === 'string' ? raw.pairedAt : null,
    lastSyncedAt: typeof raw.lastSyncedAt === 'string' ? raw.lastSyncedAt : null,
    capabilities: normalizeCapabilities(raw.capabilities, provider),
    terminalSerial: typeof raw.terminalSerial === 'string' ? raw.terminalSerial : null,
    merchantId: typeof raw.merchantId === 'string' ? raw.merchantId : null,
    qrPayload: typeof raw.qrPayload === 'string' ? raw.qrPayload : null,
    notes: typeof raw.notes === 'string' ? raw.notes : null,
    gatewayId: typeof raw.gatewayId === 'string' ? raw.gatewayId : null,
    createdAt: typeof raw.createdAt === 'string' ? raw.createdAt : now,
    updatedAt: typeof raw.updatedAt === 'string' ? raw.updatedAt : now,
  };
}

async function readStore(): Promise<Store> {
  const row = await prisma.appSecret.findUnique({ where: { id: PAYMENT_DEVICES_SECRET_ID } }).catch(() => null);
  if (!row?.publicKey) return { devices: [] };
  try {
    const parsed = JSON.parse(row.publicKey) as Store;
    const list = Array.isArray(parsed.devices) ? parsed.devices : [];
    return {
      devices: list
        .filter(d => d && typeof d === 'object')
        .map(d => normalizePaymentDevice(d as unknown as Record<string, unknown>)),
    };
  } catch {
    return { devices: [] };
  }
}

async function writeStore(store: Store): Promise<void> {
  const publicKey = JSON.stringify({ devices: store.devices.map(d => normalizePaymentDevice(d as unknown as Record<string, unknown>)) });
  await prisma.appSecret.upsert({
    where: { id: PAYMENT_DEVICES_SECRET_ID },
    create: { id: PAYMENT_DEVICES_SECRET_ID, publicKey, privateKey: '' },
    update: { publicKey },
  });
}

export async function listPaymentDevices(opts?: {
  storeId?: string | null;
  activeOnly?: boolean;
  method?: string | null;
  provider?: string | null;
}): Promise<PaymentReceivingDevice[]> {
  const { devices } = await readStore();
  let list = devices;
  if (opts?.activeOnly) list = list.filter(d => d.isActive !== false);
  if (opts?.storeId) {
    const sid = opts.storeId;
    list = list.filter(d => !d.storeId || d.storeId === sid);
  }
  if (opts?.provider) {
    list = list.filter(d => d.provider === opts.provider);
  }
  if (opts?.method) {
    const method = opts.method;
    list = list.filter(d => d.capabilities.includes(method as DeviceCapability));
  }
  return list.sort((a, b) => {
    if (a.isDefault !== b.isDefault) return a.isDefault ? -1 : 1;
    return a.name.localeCompare(b.name, 'ja');
  });
}

export async function getPaymentDevice(id: string): Promise<PaymentReceivingDevice | null> {
  const { devices } = await readStore();
  return devices.find(d => d.id === id) ?? null;
}

export async function savePaymentDevice(device: PaymentReceivingDevice): Promise<PaymentReceivingDevice> {
  const store = await readStore();
  const normalized = normalizePaymentDevice(device as unknown as Record<string, unknown>);
  const idx = store.devices.findIndex(d => d.id === normalized.id);
  // Only one default per store+provider group (or global).
  if (normalized.isDefault) {
    for (const d of store.devices) {
      if (d.id === normalized.id) continue;
      if ((d.storeId || null) === (normalized.storeId || null) && d.provider === normalized.provider) {
        d.isDefault = false;
      }
    }
  }
  const next = { ...normalized, updatedAt: new Date().toISOString() };
  if (idx >= 0) store.devices[idx] = next;
  else store.devices.push(next);
  await writeStore(store);
  return next;
}

export async function removePaymentDevice(id: string): Promise<boolean> {
  const store = await readStore();
  const before = store.devices.length;
  store.devices = store.devices.filter(d => d.id !== id);
  if (store.devices.length === before) return false;
  await writeStore(store);
  return true;
}

export function newPaymentDevice(
  partial: Partial<PaymentReceivingDevice> & { name: string; provider?: PaymentDeviceProvider },
): PaymentReceivingDevice {
  const now = new Date().toISOString();
  const provider: PaymentDeviceProvider = partial.provider ?? 'SQUARE_TERMINAL';
  return normalizePaymentDevice({
    id: crypto.randomUUID(),
    squareDeviceId: partial.squareDeviceId ?? '',
    name: partial.name.trim(),
    model: partial.model ?? null,
    storeId: partial.storeId ?? null,
    isDefault: Boolean(partial.isDefault),
    isActive: partial.isActive !== false,
    status: partial.status ?? (provider === 'SQUARE_TERMINAL' ? 'UNPAIRED' : 'READY'),
    pairingCode: partial.pairingCode ?? null,
    pairingExpiresAt: partial.pairingExpiresAt ?? null,
    squareDeviceCodeId: partial.squareDeviceCodeId ?? null,
    pairedAt: partial.pairedAt ?? null,
    lastSyncedAt: partial.lastSyncedAt ?? null,
    provider,
    capabilities: partial.capabilities ?? DEFAULT_CAPABILITIES[provider],
    terminalSerial: partial.terminalSerial ?? null,
    merchantId: partial.merchantId ?? null,
    qrPayload: partial.qrPayload ?? null,
    notes: partial.notes ?? null,
    gatewayId: partial.gatewayId ?? null,
    createdAt: now,
    updatedAt: now,
  });
}

/** Prefer store default Square device, else first active paired Square device. Returns squareDeviceId. */
export async function resolveDefaultDeviceId(storeId?: string | null): Promise<string | null> {
  const devices = await listPaymentDevices({
    storeId: storeId || undefined,
    activeOnly: true,
    provider: 'SQUARE_TERMINAL',
  });
  const withSquareId = devices.filter(d => d.squareDeviceId);
  const preferred = withSquareId.find(d => d.isDefault) ?? withSquareId[0];
  return preferred?.squareDeviceId ?? null;
}

/** Devices ready to take a specific tender at a store. */
export async function devicesForMethod(
  method: string,
  storeId?: string | null,
): Promise<PaymentReceivingDevice[]> {
  const devices = await listPaymentDevices({
    storeId: storeId || undefined,
    activeOnly: true,
    method,
  });
  return devices.filter(d => {
    if (d.provider === 'SQUARE_TERMINAL') return Boolean(d.squareDeviceId);
    return d.status !== 'DISABLED' && d.status !== 'UNPAIRED';
  });
}
