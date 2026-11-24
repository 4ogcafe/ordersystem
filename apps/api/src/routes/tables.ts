/**
 * Table floor alerts + guest call-staff / request-bill (parity with PHP /api/v1/tables/*).
 */
import crypto from 'node:crypto';
import express from 'express';
import { z } from 'zod';
import { AppError } from '../lib/errors.js';
import { prisma } from '../lib/prisma.js';
import { requireKitchen } from '../middleware/auth.js';
import { verifyQrSessionFromRequest } from './qr.js';

const router = express.Router();
const SECRET_ID = 'TABLE_FLOOR_ALERTS';
const ALERT_TTL_MS = 3 * 60 * 60 * 1000;

type FloorAlert = {
  id: string;
  storeId: string;
  tableNumber: string;
  kind: 'CALL' | 'BILL';
  reason: string;
  createdAt: string;
  ackedAt?: string | null;
};

async function loadAlerts(): Promise<FloorAlert[]> {
  const row = await prisma.appSecret.findUnique({ where: { id: SECRET_ID } }).catch(() => null);
  const bag = (row?.value as { alerts?: FloorAlert[] } | null) ?? null;
  return Array.isArray(bag?.alerts) ? bag!.alerts! : [];
}

async function saveAlerts(alerts: FloorAlert[]): Promise<void> {
  await prisma.appSecret.upsert({
    where: { id: SECRET_ID },
    create: { id: SECRET_ID, value: { alerts } },
    update: { value: { alerts } },
  });
}

function liveAlerts(alerts: FloorAlert[], storeFilter = ''): FloorAlert[] {
  const cutoff = Date.now() - ALERT_TTL_MS;
  return alerts.filter((a) => {
    if (!a || a.ackedAt) return false;
    const ts = a.createdAt ? Date.parse(a.createdAt) : 0;
    if (ts && ts < cutoff) return false;
    if (storeFilter && a.storeId && a.storeId !== storeFilter) return false;
    return true;
  });
}

router.get('/alerts', requireKitchen, async (req, res) => {
  const storeFilter = String(req.query.storeId || '').trim();
  const alerts = liveAlerts(await loadAlerts(), storeFilter).map((a) => ({
    id: a.id,
    storeId: a.storeId,
    tableNumber: a.tableNumber,
    kind: a.kind,
    reason: a.reason,
    createdAt: a.createdAt,
  }));
  res.setHeader('Cache-Control', 'no-store');
  res.json({ alerts });
});

router.post('/alerts/ack', requireKitchen, async (req, res) => {
  const id = String(req.body?.id || '').trim();
  if (!id) throw new AppError(400, 'ID_REQUIRED', 'Alert id is required');
  const alerts = await loadAlerts();
  let found = false;
  const next = alerts.map((a) => {
    if (a.id !== id) return a;
    found = true;
    return { ...a, ackedAt: new Date().toISOString() };
  });
  if (!found) throw new AppError(404, 'NOT_FOUND', 'Alert not found');
  await saveAlerts(next);
  res.json({ success: true });
});

const guestAlertSchema = z.object({
  storeId: z.string().trim().max(100).optional(),
  tableNumber: z.string().trim().min(1).max(64),
  reason: z.string().trim().max(200).optional(),
  qrSessionToken: z.string().trim().max(2000).optional(),
});

router.post('/call-staff', async (req, res) => {
  const input = guestAlertSchema.parse(req.body ?? {});
  const session = verifyQrSessionFromRequest(req, {
    sessionToken: input.qrSessionToken,
    expectedTable: input.tableNumber,
    expectedStoreId: input.storeId,
  });
  const alert: FloorAlert = {
    id: `fa_${crypto.randomBytes(8).toString('hex')}`,
    storeId: session.storeId || input.storeId || '',
    tableNumber: session.tableNumber,
    kind: 'CALL',
    reason: (input.reason || 'スタッフ呼び出し').slice(0, 200),
    createdAt: new Date().toISOString(),
  };
  const alerts = await loadAlerts();
  alerts.unshift(alert);
  await saveAlerts(alerts.slice(0, 200));
  res.status(201).json({ success: true, alert });
});

router.post('/request-bill', async (req, res) => {
  const input = guestAlertSchema.parse(req.body ?? {});
  const session = verifyQrSessionFromRequest(req, {
    sessionToken: input.qrSessionToken,
    expectedTable: input.tableNumber,
    expectedStoreId: input.storeId,
  });
  const alert: FloorAlert = {
    id: `fa_${crypto.randomBytes(8).toString('hex')}`,
    storeId: session.storeId || input.storeId || '',
    tableNumber: session.tableNumber,
    kind: 'BILL',
    reason: (input.reason || 'お会計のご依頼').slice(0, 200),
    createdAt: new Date().toISOString(),
  };
  const alerts = await loadAlerts();
  alerts.unshift(alert);
  await saveAlerts(alerts.slice(0, 200));
  res.status(201).json({ success: true, alert });
});

export default router;
