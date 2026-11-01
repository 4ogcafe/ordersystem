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
import { requireStaff } from '../middleware/auth.js';

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
  deviceId: z.string().min(1).max(100),
  label: z.string().trim().min(1).max(100).optional(),
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
  const { sessionId, amount, deviceId, label } = terminalSchema.parse(req.body);
  const tableNumber = '';

  // Prevent concurrent active checkouts for the same session.
  const active = await payments().findFirst({ where: { sessionId, status: 'pending' } });
  if (active?.squareCheckoutId) {
    return res.json({ checkoutId: active.squareCheckoutId, status: 'IN_PROGRESS', paymentRecordId: active.id });
  }

  const idempotencyKey = crypto.randomUUID();
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
        note: label ?? 'Adarsha Restaurant',
        device_options: { device_id: deviceId, skip_receipt_screen: false },
      },
    },
  );

  const checkoutId = data.checkout?.id ?? null;
  await payments().update({ where: { id: record.id }, data: { squareCheckoutId: checkoutId } });

  res.json({ checkoutId, status: data.checkout?.status, paymentRecordId: record.id });
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

router.post(
  '/webhook',
  express.raw({ type: 'application/json' }),
  (req, res) => {
    const body = Buffer.isBuffer(req.body) ? req.body.toString('utf-8') : JSON.stringify(req.body);

    const sigKey = config.square.webhookSignatureKey;
    if (sigKey) {
      const sig = req.headers['x-square-hmacsha256-signature'] as string | undefined;
      const payload = config.square.webhookUrl + body;
      const expected = crypto.createHmac('sha256', sigKey).update(payload).digest('base64');
      if (!sig || sig !== expected) {
        res.status(403).json({ error: 'Invalid signature' });
        return;
      }
    }

    res.json({ ok: true });

    const event = JSON.parse(body) as Record<string, unknown>;
    const eventId = event.event_id as string | undefined;
    const eventType = event.type as string | undefined;
    if (!eventId || !eventType) return;

    setImmediate(() => void processWebhookEvent(eventId, eventType, event));
  },
);

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
