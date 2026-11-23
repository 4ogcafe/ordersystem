import crypto from 'node:crypto';
import express from 'express';
import QRCode from 'qrcode';
import { z } from 'zod';
import { config } from '../config.js';
import { AppError } from '../lib/errors.js';
import { prisma } from '../lib/prisma.js';
import { isSquareConfigured, squareFetch, yenToAmount } from '../lib/square.js';
import {
  serializePayment,
  type PaymentStatus,
} from '../lib/square-payments.js';
import {
  getPaymentDevice,
  listPaymentDevices,
  newPaymentDevice,
  removePaymentDevice,
  resolveDefaultDeviceId,
  savePaymentDevice,
  type PaymentReceivingDevice,
} from '../lib/payment-devices.js';
import {
  PAYMENT_GATEWAY_CATALOG,
  catalogItem,
  connectPaymentGateway,
  disconnectPaymentGateway,
  getPaymentGateway,
  listPaymentGateways,
  toAdminGateway,
  updatePaymentGateway,
  type PaymentGatewayKind,
} from '../lib/payment-gateways.js';
import { requireAdmin, requireStaff } from '../middleware/auth.js';

const router = express.Router();

// ── Schemas ──────────────────────────────────────────────────────────────────

const SESSION_ID_PATTERN = /^[0-9a-f-]{36}$/i; // UUID

const linkSchema = z.object({
  sessionId: z.string().regex(SESSION_ID_PATTERN, 'Invalid session ID'),
  amount: z.number().int().positive().max(10_000_000),
  label: z.string().trim().min(1).max(100).optional(),
});

const terminalSchema = z.object({
  sessionId: z.string().regex(SESSION_ID_PATTERN, 'Invalid session ID'),
  amount: z.number().int().positive().max(10_000_000),
  deviceId: z.string().min(1).max(100).optional(),
  storeId: z.string().trim().max(100).optional(),
  label: z.string().trim().min(1).max(100).optional(),
  orderIds: z.array(z.string().trim().min(1).max(100)).max(50).optional(),
});

const paymentDeviceProviderSchema = z.enum([
  'SQUARE_TERMINAL',
  'CAT_TERMINAL',
  'QR_DISPLAY',
  'CASH_DRAWER',
  'MANUAL',
]);

const deviceCapabilitySchema = z.enum([
  'CASH',
  'CARD',
  'PAYPAY',
  'RAKUTEN_PAY',
  'D_PAY',
  'AU_PAY',
  'MERPAY',
  'WECHAT_PAY',
  'IC',
  'ID_QUICPAY',
  'INVOICE',
  'BANK_TRANSFER',
]);

const deviceUpsertSchema = z.object({
  name: z.string().trim().min(1).max(100),
  provider: paymentDeviceProviderSchema.optional(),
  storeId: z.string().trim().max(100).nullable().optional(),
  isDefault: z.boolean().optional(),
  isActive: z.boolean().optional(),
  squareDeviceId: z.string().trim().max(120).optional(),
  model: z.string().trim().max(100).nullable().optional(),
  capabilities: z.array(deviceCapabilitySchema).max(20).optional(),
  terminalSerial: z.string().trim().max(120).nullable().optional(),
  merchantId: z.string().trim().max(120).nullable().optional(),
  qrPayload: z.string().trim().max(2000).nullable().optional(),
  notes: z.string().trim().max(500).nullable().optional(),
  status: z.string().trim().max(40).optional(),
  gatewayId: z.string().trim().max(100).nullable().optional(),
});

const devicePatchSchema = deviceUpsertSchema.partial();

const gatewayKindSchema = z.enum([
  'SQUARE',
  'PAYPAY',
  'RAKUTEN_PAY',
  'D_PAY',
  'AU_PAY',
  'MERPAY',
  'WECHAT_PAY',
  'GMO_PG',
  'CAT_MULT',
  'DIGITAL_WAGE',
  'MANUAL',
]);

const gatewayConnectSchema = z.object({
  kind: gatewayKindSchema,
  label: z.string().trim().min(1).max(120),
  storeId: z.string().trim().max(100).nullable().optional(),
  merchantId: z.string().trim().max(200).optional(),
  shopId: z.string().trim().max(200).optional(),
  locationId: z.string().trim().max(200).optional(),
  terminalId: z.string().trim().max(200).optional(),
  wageAccountId: z.string().trim().max(200).optional(),
  wageProvider: z.string().trim().max(200).optional(),
  environment: z.enum(['sandbox', 'production']).optional(),
  apiKey: z.string().trim().max(2000).optional(),
  apiSecret: z.string().trim().max(2000).optional(),
  accessToken: z.string().trim().max(4000).optional(),
  notes: z.string().trim().max(1000).optional(),
  /** When true, also create a matching payment receiving device. */
  createDevice: z.boolean().optional(),
  deviceName: z.string().trim().max(100).optional(),
});

const gatewayPatchSchema = gatewayConnectSchema.partial().omit({ kind: true, createDevice: true, deviceName: true }).extend({
  kind: gatewayKindSchema.optional(),
  status: z.enum(['CONNECTED', 'DISCONNECTED', 'PENDING']).optional(),
  label: z.string().trim().min(1).max(120).optional(),
});

const onlinePaymentSchema = z.object({
  sessionId: z.string().regex(SESSION_ID_PATTERN, 'Invalid session ID'),
  amount: z.number().int().positive().max(10_000_000),
  token: z.string().min(1).max(500),   // sourceId from Square Web Payments SDK
  label: z.string().trim().min(1).max(100).optional(),
});

const refundSchema = z.object({
  squarePaymentId: z.string().min(1).max(200),
  amount: z.number().int().positive().max(10_000_000).optional(),
  reason: z.string().trim().max(192).optional(),
});

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const payments = () => (prisma as any).squarePayment;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const webhookEvents = () => (prisma as any).squareWebhookEvent;

// ── Helpers ──────────────────────────────────────────────────────────────────

function squareRequired() {
  if (!isSquareConfigured()) throw new AppError(503, 'SQUARE_NOT_CONFIGURED', 'Square is not configured on this server.');
}

// ── Config ──────────────────────────────────────────────────────────────────

/** Public: only non-secret fields so the dine-in UI can hide online pay when Square is off. */
router.get('/public-config', (_req, res) => {
  const configured = isSquareConfigured();
  res.setHeader('Cache-Control', 'public, max-age=60');
  res.json({
    configured,
    environment: config.square.environment,
    applicationId: configured ? config.square.applicationId : null,
  });
});

router.get('/config', requireStaff, (_req, res) => {
  const configured = isSquareConfigured();
  res.json({
    configured,
    environment: config.square.environment,
    locationId: configured ? config.square.locationId : null,
    applicationId: configured ? config.square.applicationId : null,
  });
});

// ── Payment links (QR) ──────────────────────────────────────────────────────

router.post('/payment-link', requireStaff, async (req, res) => {
  squareRequired();
  const { sessionId, amount, label } = linkSchema.parse(req.body);
  const tableNumber = '';

  const idempotencyKey = crypto.randomUUID();
  const record = await payments().create({
    data: {
      sessionId,
      tableNumber,
      channel: 'qr',
      amount,
      currency: 'JPY',
      status: 'pending',
      idempotencyKey,
      squarePaymentId: null,
      squareCheckoutId: null,
      squareLinkId: null,
      squareOrderId: null,
      deviceId: null,
      failureCode: null,
      refundedAmount: 0,
      closedByUserId: req.user!.id,
    },
  });

  const data = await squareFetch<{
    payment_link: { id: string; url: string };
    related_resources?: { orders?: { id: string }[] };
  }>('POST', '/online-checkout/payment-links', {
    idempotency_key: idempotencyKey,
    quick_pay: {
      name: label ?? 'Adarsha Restaurant',
      price_money: { amount: yenToAmount(amount), currency: 'JPY' },
      location_id: config.square.locationId,
    },
    payment_note: `Session ${sessionId}`,
  });

  const url = data.payment_link?.url ?? '';
  const orderId = data.related_resources?.orders?.[0]?.id ?? null;

  await payments().update({
    where: { id: record.id },
    data: { squareLinkId: data.payment_link.id, squareOrderId: orderId },
  });

  const qrDataUrl = url
    ? await QRCode.toDataURL(url, { width: 280, margin: 2, color: { dark: '#1a1814', light: '#ffffff' } })
    : null;

  res.json({ linkId: data.payment_link.id, url, orderId, qrDataUrl, paymentRecordId: record.id });
});

router.get('/payment-link/:orderId/status', requireStaff, async (req, res) => {
  squareRequired();
  const data = await squareFetch<{
    order?: { state: string; tenders?: { payment_id?: string }[] };
  }>('GET', `/orders/${encodeURIComponent(String(req.params.orderId))}`);
  const state = data.order?.state ?? 'OPEN';
  const paid = state === 'COMPLETED';
  const squarePaymentId = paid ? (data.order?.tenders?.[0]?.payment_id ?? null) : null;

  if (paid && squarePaymentId) {
    await payments().updateMany({
      where: { squareOrderId: String(req.params.orderId), status: 'pending' },
      data: { squarePaymentId, status: 'completed' },
    });
  }

  res.json({ state, paid, squarePaymentId });
});

// ── Terminal checkouts ───────────────────────────────────────────────────────

router.post('/terminal/checkout', requireStaff, async (req, res) => {
  squareRequired();
  const parsed = terminalSchema.parse(req.body);
  const { sessionId, amount, label, storeId, orderIds } = parsed;
  const tableNumber = '';

  let deviceId = (parsed.deviceId || '').trim();
  if (!deviceId) {
    deviceId = (await resolveDefaultDeviceId(storeId)) || '';
  }
  if (!deviceId) {
    throw new AppError(400, 'NO_DEVICE', 'No payment receiving device selected or configured for this store.');
  }

  // Prevent concurrent active checkouts for the same session.
  const active = await payments().findFirst({ where: { sessionId, status: 'pending' } });
  if (active?.squareCheckoutId) {
    return res.json({
      checkoutId: active.squareCheckoutId,
      status: 'IN_PROGRESS',
      paymentRecordId: active.id,
      deviceId: active.deviceId,
    });
  }

  const idempotencyKey = crypto.randomUUID();
  const noteParts = [label ?? 'Adarsha Restaurant'];
  if (orderIds?.length) noteParts.push(`orders:${orderIds.join(',')}`);
  const note = noteParts.join(' · ').slice(0, 500);

  const record = await payments().create({
    data: {
      sessionId,
      tableNumber,
      channel: 'terminal',
      amount,
      currency: 'JPY',
      status: 'pending',
      idempotencyKey,
      squarePaymentId: null,
      squareCheckoutId: null,
      squareLinkId: null,
      squareOrderId: null,
      deviceId,
      failureCode: null,
      refundedAmount: 0,
      closedByUserId: req.user!.id,
    },
  });

  const data = await squareFetch<{ checkout?: { id: string; status: string } }>(
    'POST',
    '/terminals/checkouts',
    {
      idempotency_key: idempotencyKey,
      checkout: {
        amount_money: { amount: yenToAmount(amount), currency: 'JPY' },
        reference_id: sessionId,
        note,
        device_options: { device_id: deviceId, skip_receipt_screen: false },
      },
    },
  );

  const checkoutId = data.checkout?.id ?? null;
  await payments().update({ where: { id: record.id }, data: { squareCheckoutId: checkoutId } });

  res.json({ checkoutId, status: data.checkout?.status, paymentRecordId: record.id, deviceId });
});

router.get('/terminal/checkout/:checkoutId/status', requireStaff, async (req, res) => {
  squareRequired();
  const data = await squareFetch<{
    checkout?: { status: string; payment_ids?: string[] };
  }>('GET', `/terminals/checkouts/${encodeURIComponent(String(req.params.checkoutId))}`);
  const status = data.checkout?.status ?? 'PENDING';
  const paid = status === 'COMPLETED';
  const squarePaymentId = paid ? (data.checkout?.payment_ids?.[0] ?? null) : null;

  if (paid && squarePaymentId) {
    await payments().updateMany({
      where: { squareCheckoutId: String(req.params.checkoutId), status: 'pending' },
      data: { squarePaymentId, status: 'completed' },
    });
  } else if (status === 'CANCELED' || status === 'CANCEL_REQUESTED') {
    await payments().updateMany({
      where: { squareCheckoutId: String(req.params.checkoutId), status: 'pending' },
      data: { status: 'canceled' },
    });
  }

  res.json({
    status,
    paid,
    cancelled: status === 'CANCELED' || status === 'CANCEL_REQUESTED',
    squarePaymentId,
  });
});

router.post('/terminal/checkout/:checkoutId/cancel', requireStaff, async (req, res) => {
  squareRequired();
  await squareFetch('POST', `/terminals/checkouts/${encodeURIComponent(String(req.params.checkoutId))}/cancel`);
  await payments().updateMany({
    where: { squareCheckoutId: String(req.params.checkoutId), status: 'pending' },
    data: { status: 'canceled' },
  });
  res.json({ success: true });
});

router.get('/terminal/devices', requireStaff, async (_req, res) => {
  if (!isSquareConfigured()) return res.json({ devices: [] });
  const data = await squareFetch<{
    devices?: { id: string; name?: string; status?: { category?: string }; attributes?: { model?: string } }[];
  }>('GET', '/devices');
  const devices = (data.devices ?? []).map(d => ({
    id: d.id,
    name: d.name ?? d.id,
    status: d.status?.category ?? 'UNKNOWN',
    model: d.attributes?.model ?? null,
  }));
  res.json({ devices });
});

// ── Manual payment gateway Connect (Digital Wage / merchant credentials) ─────

router.get('/gateways', requireStaff, async (req, res) => {
  const storeId = typeof req.query.storeId === 'string' ? req.query.storeId : undefined;
  const kind = typeof req.query.kind === 'string' ? req.query.kind : undefined;
  const connectedOnly = req.query.connected === '1' || req.query.connected === 'true';
  const gateways = await listPaymentGateways({ storeId, kind, connectedOnly });
  res.setHeader('Cache-Control', 'private, no-store');
  res.json({
    catalog: PAYMENT_GATEWAY_CATALOG,
    gateways: gateways.map(toAdminGateway),
    squareEnvConfigured: isSquareConfigured(),
  });
});

router.post('/gateways/connect', requireAdmin, async (req, res) => {
  const body = gatewayConnectSchema.parse(req.body);
  const meta = catalogItem(body.kind as PaymentGatewayKind);
  if (!meta) throw new AppError(400, 'UNKNOWN_GATEWAY', 'Unknown payment gateway kind.');

  // Light required-field check from catalog.
  for (const field of meta.fields) {
    if (!field.required) continue;
    const val = (body as Record<string, unknown>)[field.key];
    if (!val || String(val).trim() === '') {
      throw new AppError(400, 'VALIDATION_ERROR', `${field.labelJa} は必須です`);
    }
  }

  const gateway = await connectPaymentGateway({
    kind: body.kind,
    label: body.label,
    storeId: body.storeId ?? null,
    merchantId: body.merchantId,
    shopId: body.shopId,
    locationId: body.locationId,
    terminalId: body.terminalId,
    wageAccountId: body.wageAccountId,
    wageProvider: body.wageProvider,
    environment: body.environment,
    apiKey: body.apiKey,
    apiSecret: body.apiSecret,
    accessToken: body.accessToken,
    notes: body.notes,
  });

  let device: PaymentReceivingDevice | null = null;
  if (body.createDevice !== false) {
    device = await savePaymentDevice(
      newPaymentDevice({
        name: body.deviceName?.trim() || `${meta.labelJa} 端末`,
        provider: meta.deviceProvider,
        storeId: body.storeId ?? null,
        isDefault: false,
        capabilities: meta.defaultCapabilities,
        merchantId: body.merchantId || body.shopId || null,
        terminalSerial: body.terminalId || null,
        notes: body.notes || `Gateway:${gateway.id}`,
        gatewayId: gateway.id,
        status: meta.deviceProvider === 'SQUARE_TERMINAL' ? 'UNPAIRED' : 'READY',
      }),
    );
  }

  res.status(201).json({
    gateway: toAdminGateway(gateway),
    device,
  });
});

router.patch('/gateways/:id', requireAdmin, async (req, res) => {
  const existing = await getPaymentGateway(String(req.params.id));
  if (!existing) throw new AppError(404, 'NOT_FOUND', 'Payment gateway not found.');
  const body = gatewayPatchSchema.parse(req.body);
  const updated = await updatePaymentGateway(existing.id, body);
  res.json(toAdminGateway(updated!));
});

router.delete('/gateways/:id', requireAdmin, async (req, res) => {
  const ok = await disconnectPaymentGateway(String(req.params.id));
  if (!ok) throw new AppError(404, 'NOT_FOUND', 'Payment gateway not found.');
  res.json({ success: true });
});

// ── Admin-managed payment receiving devices ──────────────────────────────────

router.get('/devices', requireStaff, async (req, res) => {
  const storeId = typeof req.query.storeId === 'string' ? req.query.storeId : undefined;
  const method = typeof req.query.method === 'string' ? req.query.method : undefined;
  const provider = typeof req.query.provider === 'string' ? req.query.provider : undefined;
  const activeOnly = req.query.active === '1' || req.query.active === 'true';
  const devices = await listPaymentDevices({ storeId, activeOnly, method, provider });
  res.setHeader('Cache-Control', 'private, no-store');
  res.json({
    configured: isSquareConfigured(),
    environment: config.square.environment,
    locationId: isSquareConfigured() ? config.square.locationId : null,
    devices,
  });
});

router.post('/devices', requireAdmin, async (req, res) => {
  const body = deviceUpsertSchema.parse(req.body);
  const provider = body.provider ?? 'SQUARE_TERMINAL';
  const device = newPaymentDevice({
    name: body.name,
    provider,
    storeId: body.storeId ?? null,
    isDefault: body.isDefault,
    isActive: body.isActive,
    squareDeviceId: body.squareDeviceId ?? '',
    model: body.model ?? null,
    capabilities: body.capabilities,
    terminalSerial: body.terminalSerial ?? null,
    merchantId: body.merchantId ?? null,
    qrPayload: body.qrPayload ?? null,
    notes: body.notes ?? null,
    gatewayId: body.gatewayId ?? null,
    status:
      body.status ||
      (provider === 'SQUARE_TERMINAL'
        ? body.squareDeviceId
          ? 'UNKNOWN'
          : 'UNPAIRED'
        : 'READY'),
  });
  const saved = await savePaymentDevice(device);
  res.status(201).json(saved);
});

router.patch('/devices/:id', requireAdmin, async (req, res) => {
  const existing = await getPaymentDevice(String(req.params.id));
  if (!existing) throw new AppError(404, 'NOT_FOUND', 'Payment device not found.');
  const body = devicePatchSchema.parse(req.body);
  const next: PaymentReceivingDevice = {
    ...existing,
    name: body.name?.trim() || existing.name,
    provider: body.provider ?? existing.provider,
    storeId: body.storeId === undefined ? existing.storeId : body.storeId,
    isDefault: body.isDefault ?? existing.isDefault,
    isActive: body.isActive ?? existing.isActive,
    squareDeviceId: body.squareDeviceId !== undefined ? body.squareDeviceId.trim() : existing.squareDeviceId,
    model: body.model === undefined ? existing.model : body.model,
    capabilities: body.capabilities ?? existing.capabilities,
    terminalSerial: body.terminalSerial === undefined ? existing.terminalSerial : body.terminalSerial,
    merchantId: body.merchantId === undefined ? existing.merchantId : body.merchantId,
    qrPayload: body.qrPayload === undefined ? existing.qrPayload : body.qrPayload,
    notes: body.notes === undefined ? existing.notes : body.notes,
    gatewayId: body.gatewayId === undefined ? existing.gatewayId : body.gatewayId,
    status: body.status ?? existing.status,
  };
  res.json(await savePaymentDevice(next));
});

router.delete('/devices/:id', requireAdmin, async (req, res) => {
  const ok = await removePaymentDevice(String(req.params.id));
  if (!ok) throw new AppError(404, 'NOT_FOUND', 'Payment device not found.');
  res.json({ success: true });
});

/** Create a Square Terminal pairing code; staff enters it on the device. */
router.post('/devices/:id/pair', requireAdmin, async (req, res) => {
  squareRequired();
  const existing = await getPaymentDevice(String(req.params.id));
  if (!existing) throw new AppError(404, 'NOT_FOUND', 'Payment device not found.');
  if (existing.provider !== 'SQUARE_TERMINAL') {
    throw new AppError(400, 'NOT_SQUARE', 'Pairing is only available for Square Terminal devices.');
  }

  const idempotencyKey = crypto.randomUUID();
  const data = await squareFetch<{
    device_code?: {
      id?: string;
      code?: string;
      status?: string;
      device_id?: string;
      pair_by?: string;
      name?: string;
    };
  }>('POST', '/devices/codes', {
    idempotency_key: idempotencyKey,
    device_code: {
      product_type: 'TERMINAL_API',
      location_id: config.square.locationId,
      name: existing.name,
    },
  });

  const code = data.device_code;
  const updated = await savePaymentDevice({
    ...existing,
    pairingCode: code?.code ?? null,
    pairingExpiresAt: code?.pair_by ?? null,
    squareDeviceCodeId: code?.id ?? null,
    squareDeviceId: code?.device_id || existing.squareDeviceId,
    status: code?.device_id ? 'ONLINE' : 'PAIRING',
    pairedAt: code?.device_id ? new Date().toISOString() : existing.pairedAt,
  });

  res.json({
    device: updated,
    pairingCode: updated.pairingCode,
    expiresAt: updated.pairingExpiresAt,
  });
});

/** Refresh pairing status / live Square device list into the registry. */
router.post('/devices/sync', requireAdmin, async (_req, res) => {
  squareRequired();
  const registry = await listPaymentDevices();

  // Refresh any open device codes.
  for (const device of registry) {
    if (!device.squareDeviceCodeId || device.squareDeviceId) continue;
    try {
      const data = await squareFetch<{
        device_code?: { status?: string; device_id?: string; code?: string; pair_by?: string };
      }>('GET', `/devices/codes/${encodeURIComponent(device.squareDeviceCodeId)}`);
      const code = data.device_code;
      if (code?.device_id) {
        await savePaymentDevice({
          ...device,
          squareDeviceId: code.device_id,
          status: 'ONLINE',
          pairingCode: null,
          pairingExpiresAt: null,
          pairedAt: new Date().toISOString(),
          lastSyncedAt: new Date().toISOString(),
        });
      } else if (code) {
        await savePaymentDevice({
          ...device,
          pairingCode: code.code ?? device.pairingCode,
          pairingExpiresAt: code.pair_by ?? device.pairingExpiresAt,
          status: code.status === 'EXPIRED' ? 'EXPIRED' : 'PAIRING',
          lastSyncedAt: new Date().toISOString(),
        });
      }
    } catch {
      // Keep going for other devices.
    }
  }

  // Merge live Square devices (status / model / import unknown).
  const live = await squareFetch<{
    devices?: { id: string; name?: string; status?: { category?: string }; attributes?: { model?: string; name?: string } }[];
  }>('GET', '/devices').catch(() => ({ devices: [] as { id: string; name?: string; status?: { category?: string }; attributes?: { model?: string; name?: string } }[] }));

  const afterCodes = await listPaymentDevices();
  const bySquareId = new Map(afterCodes.filter(d => d.squareDeviceId).map(d => [d.squareDeviceId, d]));

  for (const liveDevice of live.devices ?? []) {
    const existing = bySquareId.get(liveDevice.id);
    const status = liveDevice.status?.category ?? 'UNKNOWN';
    const model = liveDevice.attributes?.model ?? null;
    const liveName = liveDevice.name || liveDevice.attributes?.name || liveDevice.id;
    if (existing) {
      await savePaymentDevice({
        ...existing,
        status,
        model: model ?? existing.model,
        lastSyncedAt: new Date().toISOString(),
      });
    } else {
      await savePaymentDevice(
        newPaymentDevice({
          name: liveName,
          squareDeviceId: liveDevice.id,
          model,
          status,
          lastSyncedAt: new Date().toISOString(),
          pairedAt: new Date().toISOString(),
        }),
      );
    }
  }

  res.json({
    configured: true,
    devices: await listPaymentDevices(),
  });
});

// ── Online payment (Square Web Payments SDK) ─────────────────────────────────

router.post('/payment', requireStaff, async (req, res) => {
  squareRequired();
  const { sessionId, amount, token, label } = onlinePaymentSchema.parse(req.body);
  const tableNumber = '';

  const concurrent = await payments().findFirst({ where: { sessionId, status: 'pending' } });
  if (concurrent) throw new AppError(409, 'PAYMENT_IN_PROGRESS', 'A payment is already in progress for this session.');

  const idempotencyKey = crypto.randomUUID();
  const record = await payments().create({
    data: {
      sessionId,
      tableNumber,
      channel: 'online',
      amount,
      currency: 'JPY',
      status: 'pending',
      idempotencyKey,
      squarePaymentId: null,
      squareCheckoutId: null,
      squareLinkId: null,
      squareOrderId: null,
      deviceId: null,
      failureCode: null,
      refundedAmount: 0,
      closedByUserId: req.user!.id,
    },
  });

  let squarePaymentId: string | null = null;
  let finalStatus: PaymentStatus = 'failed';

  try {
    const data = await squareFetch<{
      payment?: { id: string; status: string; failure_code?: string };
      errors?: { code: string; detail: string }[];
    }>('POST', '/payments', {
      idempotency_key: idempotencyKey,
      source_id: token,
      amount_money: { amount: yenToAmount(amount), currency: 'JPY' },
      location_id: config.square.locationId,
      note: label ?? 'Adarsha Restaurant',
      reference_id: sessionId,
    });

    squarePaymentId = data.payment?.id ?? null;
    const squareStatus = data.payment?.status ?? 'FAILED';
    finalStatus = squareStatus === 'COMPLETED' || squareStatus === 'APPROVED' ? 'completed' : 'failed';

    await payments().update({ where: { id: record.id }, data: { squarePaymentId, status: finalStatus } });

    if (finalStatus === 'failed') {
      throw new AppError(402, 'PAYMENT_DECLINED', data.errors?.[0]?.detail ?? 'Payment declined by Square.');
    }
  } catch (e) {
    if (!(e instanceof AppError)) {
      await payments().update({ where: { id: record.id }, data: { status: 'failed' } });
    }
    throw e;
  }

  res.json({ squarePaymentId, status: finalStatus, paymentRecordId: record.id });
});

// ── Payments list (for session history / refund access) ──────────────────────

router.get('/payments', requireStaff, async (req, res) => {
  const sessionId = String(req.query.sessionId ?? '');
  if (!SESSION_ID_PATTERN.test(sessionId)) throw new AppError(400, 'INVALID_ID', 'Invalid session ID.');
  const list = await payments().findMany({
    where: { sessionId },
    orderBy: { createdAt: 'desc' },
  });
  res.json({ payments: (list as unknown[]).map((p) => serializePayment(p as unknown as Parameters<typeof serializePayment>[0])) });
});

// ── Refunds ──────────────────────────────────────────────────────────────────

router.post('/refund', requireStaff, async (req, res) => {
  squareRequired();
  const { squarePaymentId, amount, reason } = refundSchema.parse(req.body);

  const record = await payments().findFirst({ where: { squarePaymentId } });
  if (!record) throw new AppError(404, 'PAYMENT_NOT_FOUND', 'Payment record not found.');
  if (record.status !== 'completed' && record.status !== 'partially_refunded') {
    throw new AppError(409, 'NOT_REFUNDABLE', `Payment status is ${record.status}; only completed payments can be refunded.`);
  }

  const refundable = record.amount - record.refundedAmount;
  const refundAmount = amount ?? refundable;

  if (refundAmount <= 0 || refundAmount > refundable) {
    throw new AppError(400, 'INVALID_REFUND_AMOUNT', `Refund amount must be between 1 and ${refundable} yen.`);
  }

  const idempotencyKey = crypto.randomUUID();
  const data = await squareFetch<{
    refund?: { id: string; status: string };
    errors?: { code: string; detail: string }[];
  }>('POST', '/refunds', {
    idempotency_key: idempotencyKey,
    payment_id: squarePaymentId,
    amount_money: { amount: yenToAmount(refundAmount), currency: 'JPY' },
    reason: reason ?? '返金処理',
  });

  const refundId = data.refund?.id ?? null;
  const newRefunded = record.refundedAmount + refundAmount;
  const newStatus: PaymentStatus = newRefunded >= record.amount ? 'refunded' : 'partially_refunded';

  await payments().update({ where: { id: record.id }, data: { refundedAmount: newRefunded, status: newStatus } });

  res.json({
    refundId,
    refundedAmount: newRefunded,
    remaining: record.amount - newRefunded,
    status: newStatus,
  });
});

// ── Webhook ──────────────────────────────────────────────────────────────────
// Prefer mounting with express.raw in app.ts BEFORE express.json (see handleSquareWebhook).

router.post('/webhook', express.raw({ type: 'application/json' }), (req, res, next) => {
  Promise.resolve(handleSquareWebhook(req, res)).catch(next);
});

/** Called with a raw Buffer body (signature verification). */
export async function handleSquareWebhook(req: express.Request, res: express.Response) {
  const body = Buffer.isBuffer(req.body) ? req.body.toString('utf-8') : JSON.stringify(req.body ?? {});

  const sigKey = config.square.webhookSignatureKey;
  if (!sigKey) {
    res.status(503).json({ error: 'Webhook signature key not configured' });
    return;
  }
  const sig = req.headers['x-square-hmacsha256-signature'] as string | undefined;
  const payload = config.square.webhookUrl + body;
  const expected = crypto.createHmac('sha256', sigKey).update(payload).digest('base64');
  if (!sig || sig !== expected) {
    res.status(403).json({ error: 'Invalid signature' });
    return;
  }

  res.json({ ok: true });

  const event = JSON.parse(body) as Record<string, unknown>;
  const eventId = event.event_id as string | undefined;
  const eventType = event.type as string | undefined;
  if (!eventId || !eventType) return;

  setImmediate(() => void processWebhookEvent(eventId, eventType, event));
}

async function processWebhookEvent(
  eventId: string,
  eventType: string,
  event: Record<string, unknown>,
) {
  // Deduplicate: unique constraint on squareEventId prevents double-processing.
  try {
    await webhookEvents().create({
      data: {
        squareEventId: eventId,
        eventType,
        receivedAt: new Date(),
        processedAt: null,
        processingStatus: 'pending',
        payload: event,
        retryCount: 0,
      },
    });
  } catch {
    return; // Duplicate event
  }

  try {
    const data = event.data as Record<string, unknown> | undefined;
    const obj = data?.object as Record<string, unknown> | undefined;

    switch (eventType) {
      case 'payment.completed': {
        const p = obj?.payment as { id: string } | undefined;
        if (p?.id) {
          await payments().updateMany({
            where: { squarePaymentId: p.id, status: 'pending' },
            data: { status: 'completed' },
          });
        }
        break;
      }
      case 'payment.failed': {
        const p = obj?.payment as { id: string; failure_code?: string } | undefined;
        if (p?.id) {
          await payments().updateMany({
            where: { squarePaymentId: p.id, status: 'pending' },
            data: { status: 'failed', failureCode: p.failure_code ?? null },
          });
        }
        break;
      }
      case 'terminal.checkout.updated': {
        const c = obj?.checkout as { id: string; status: string; payment_ids?: string[] } | undefined;
        if (c?.id) {
          if (c.status === 'COMPLETED') {
            await payments().updateMany({
              where: { squareCheckoutId: c.id, status: 'pending' },
              data: { status: 'completed', squarePaymentId: c.payment_ids?.[0] ?? null },
            });
          } else if (c.status === 'CANCELED' || c.status === 'CANCEL_REQUESTED') {
            await payments().updateMany({
              where: { squareCheckoutId: c.id, status: 'pending' },
              data: { status: 'canceled' },
            });
          }
        }
        break;
      }
      default:
        await webhookEvents().update({
          where: { squareEventId: eventId },
          data: { processingStatus: 'skipped', processedAt: new Date() },
        });
        return;
    }

    await webhookEvents().update({
      where: { squareEventId: eventId },
      data: { processingStatus: 'processed', processedAt: new Date() },
    });
  } catch {
    await webhookEvents().update({
      where: { squareEventId: eventId },
      data: { processingStatus: 'failed', retryCount: { increment: 1 } },
    });
  }
}

export default router;
