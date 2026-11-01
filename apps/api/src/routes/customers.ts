import crypto from 'node:crypto';
import bcrypt from 'bcryptjs';
import express from 'express';
import { Prisma } from '@prisma/client';
import { z } from 'zod';
import { config } from '../config.js';
import { AppError, notFound } from '../lib/errors.js';
import { isOfferLive, loyaltyConfig, type OfferRule } from '../lib/loyalty.js';
import { profileSchema, profileUpdate, publicProfile } from '../lib/customer-profile.js';
import { prisma } from '../lib/prisma.js';
import { idParam, optionalText } from '../lib/schemas.js';
import { requireAdmin } from '../middleware/auth.js';
import { clearCustomerSession, issueCustomerSession, optionalCustomer, requireCustomer } from '../middleware/customerAuth.js';
import { rateLimit } from '../middleware/rateLimit.js';
import { offerAlreadyUsed, pricingSummary } from '../services/order-pricing.js';
import { changePoints } from '../services/points.js';
import { loadSettings } from '../services/settings-store.js';
import { stampCardFor } from '../services/stamps.js';
import { stampConfig } from '../lib/stamps.js';
import { stampEvents } from '../lib/stamp-events.js';

const router = express.Router();

const BCRYPT_COST = 12;
const MIN_PASSWORD = 8;
const HOUR_MS = 60 * 60 * 1000;
const LOGIN_WINDOW_MS = 15 * 60 * 1000;
const ORDER_HISTORY_LIMIT = 100;
const POINT_HISTORY_LIMIT = 100;
const ADMIN_LIST_LIMIT = 500;

const email = z.email().max(254).transform((value) => value.trim().toLowerCase());
const password = z.string().min(MIN_PASSWORD, `パスワードは${MIN_PASSWORD}文字以上にしてください`).max(200);
const phone = z.union([z.literal(''), z.string().trim().regex(/^[\d\s()+-]{8,20}$/, '電話番号の形式が正しくありません')]).nullable().optional();

const registerSchema = z.object({ name: z.string().trim().min(1).max(100), email, phone, password });
const loginSchema = z.object({ email, password: z.string().min(1).max(200) });
const emailChangeSchema = z.object({ email, currentPassword: z.string().min(1).max(200) });
const deleteSchema = z.object({ currentPassword: z.string().min(1).max(200) });
const passwordSchema = z.object({ currentPassword: z.string().min(1).max(200), newPassword: password });
const resetSchema = z.object({ password });
const adjustSchema = z.object({ points: z.number().int().min(-1_000_000).max(1_000_000).refine((n) => n !== 0), note: optionalText(200) });

const registerLimiter = rateLimit({ windowMs: HOUR_MS, max: config.registerMaxPerHour, key: (req) => req.ip ?? 'unknown' });
const loginLimiter = rateLimit({
  windowMs: LOGIN_WINDOW_MS,
  max: 10,
  failuresOnly: true,
  key: (req) => `${req.ip}|${String(req.body?.email ?? '').trim().toLowerCase()}`,
});

let dummyHash: string | undefined;
const getDummyHash = async () => (dummyHash ??= await bcrypt.hash('not-a-real-password', BCRYPT_COST));

// ---- Account -------------------------------------------------------------

router.post('/register', registerLimiter, async (req, res) => {
  const input = registerSchema.parse(req.body);
  const exists = await prisma.customer.findUnique({ where: { email: input.email } });
  if (exists) throw new AppError(409, 'EMAIL_TAKEN', 'このメールアドレスはすでに登録されています。ログインしてください。');

  const customer = await prisma.customer.create({
    data: {
      name: input.name,
      email: input.email,
      phone: input.phone || null,
      passwordHash: await bcrypt.hash(input.password, BCRYPT_COST),
      points: 0,
      isActive: true,
    },
  });

  const loyalty = loyaltyConfig(await loadSettings());
  if (loyalty.enabled && loyalty.signupBonusPoints > 0) {
    await changePoints(customer.id, loyalty.signupBonusPoints, 'BONUS', { note: '新規会員登録ボーナス' });
  }

  issueCustomerSession(res, customer.id);
  const saved = await prisma.customer.findUnique({ where: { id: customer.id } });
  res.status(201).json({ customer: publicProfile(saved as unknown as Record<string, unknown>) });
});

router.post('/login', loginLimiter, async (req, res) => {
  const input = loginSchema.parse(req.body);
  const customer = await prisma.customer.findUnique({ where: { email: input.email } });
  const matches = await bcrypt.compare(input.password, customer?.passwordHash ?? (await getDummyHash()));
  if (!customer || !matches || customer.isActive === false) {
    throw new AppError(401, 'INVALID_CREDENTIALS', 'メールアドレスまたはパスワードが正しくありません。');
  }
  issueCustomerSession(res, customer.id);
  res.json({ customer: publicProfile(customer as unknown as Record<string, unknown>) });
});

router.post('/logout', (_req, res) => {
  clearCustomerSession(res);
  res.status(204).end();
});

router.get('/me', optionalCustomer, async (req, res) => {
  const customer = req.customer
    ? await prisma.customer.findUnique({ where: { id: req.customer.id } })
    : null;
  res.setHeader('Cache-Control', 'no-store');
  if (!customer) {
    res.json({ customer: null, loyalty: null });
    return;
  }
  const loyalty = loyaltyConfig(await loadSettings());
  res.json({
    customer: publicProfile(customer as unknown as Record<string, unknown>),
    loyalty: { enabled: loyalty.enabled, pointsPer100Yen: loyalty.pointsPer100Yen, pointValueYen: loyalty.pointValueYen },
  });
});

router.put('/me', requireCustomer, async (req, res) => {
  const update = { ...profileUpdate(profileSchema.parse(req.body)), updatedAt: new Date() };
  const customer = await prisma.customer.update({
    where: { id: req.customer!.id },
    data: update as Parameters<typeof prisma.customer.update>[0]['data'],
  });
  res.json({ customer: publicProfile(customer as unknown as Record<string, unknown>) });
});

async function verifiedCustomer(customerId: string, currentPassword: string) {
  const customer = await prisma.customer.findUnique({ where: { id: customerId } });
  if (!customer || !(await bcrypt.compare(currentPassword, customer.passwordHash))) {
    throw new AppError(400, 'WRONG_PASSWORD', '現在のパスワードが正しくありません。');
  }
  return customer;
}

router.put('/me/email', requireCustomer, async (req, res) => {
  const input = emailChangeSchema.parse(req.body);
  await verifiedCustomer(req.customer!.id, input.currentPassword);
  const existing = await prisma.customer.findUnique({ where: { email: input.email } });
  if (existing) throw new AppError(409, 'EMAIL_TAKEN', 'このメールアドレスはすでに使われています。');
  const customer = await prisma.customer.update({
    where: { id: req.customer!.id },
    data: { email: input.email },
  });
  res.json({ customer: customer && publicProfile(customer as unknown as Record<string, unknown>) });
});

router.delete('/me', requireCustomer, async (req, res) => {
  const { currentPassword } = deleteSchema.parse(req.body);
  const customer = await verifiedCustomer(req.customer!.id, currentPassword);
  const active = await prisma.pickupOrder.count({
    where: { customerId: customer.id, status: { in: ['NEW', 'CONFIRMED', 'READY'] } },
  });
  if (active) throw new AppError(409, 'ACTIVE_ORDERS', '進行中のご注文があるため、受け取り後に退会してください。');

  await prisma.customer.update({
    where: { id: customer.id },
    data: {
      email: `deleted-${customer.id}@deleted.invalid`,
      name: '退会済み会員',
      passwordHash: await bcrypt.hash(crypto.randomUUID(), BCRYPT_COST),
      isActive: false,
      points: 0,
      deletedAt: new Date(),
      nameKana: null,
      phone: null,
      birthDate: null,
      address: Prisma.DbNull,
      preferences: Prisma.DbNull,
      newsletterOptIn: false,
      newsletterOptInAt: null,
    },
  });

  await prisma.pickupOrder.updateMany({
    where: { customerId: customer.id },
    data: { customerName: '退会済み会員', phone: '', email: null },
  });

  clearCustomerSession(res);
  res.status(204).end();
});

router.put('/me/password', requireCustomer, async (req, res) => {
  const input = passwordSchema.parse(req.body);
  const customer = await prisma.customer.findUnique({ where: { id: req.customer!.id } });
  if (!customer || !(await bcrypt.compare(input.currentPassword, customer.passwordHash))) {
    throw new AppError(400, 'WRONG_PASSWORD', '現在のパスワードが正しくありません。');
  }
  await prisma.customer.update({
    where: { id: customer.id },
    data: { passwordHash: await bcrypt.hash(input.newPassword, BCRYPT_COST) },
  });
  res.json({ success: true });
});

// ---- Member data ---------------------------------------------------------

router.get('/me/orders', requireCustomer, async (req, res) => {
  const orders = await prisma.pickupOrder.findMany({
    where: { customerId: req.customer!.id },
    orderBy: { createdAt: 'desc' },
    take: ORDER_HISTORY_LIMIT,
  });
  res.setHeader('Cache-Control', 'no-store');
  res.json(
    orders.map((order) => {
      const rawItems = order.items as Array<Record<string, unknown>> | undefined;
      const store = Array.isArray(rawItems) && rawItems[0]?.store && typeof rawItems[0].store === 'object' ? rawItems[0].store : null;
      return {
        token: order.token,
        number: order.number,
        status: order.status,
        pickupAt: order.pickupAt,
        createdAt: order.createdAt,
        store,
        items: (order.items as { itemId?: string; nameEn?: string; nameJa?: string; unitPrice?: number; quantity?: number; lineTotal?: number }[]).map((line) => ({
          itemId: String(line.itemId ?? ''),
          nameEn: line.nameEn,
          nameJa: line.nameJa,
          unitPrice: line.unitPrice,
          quantity: line.quantity,
          lineTotal: line.lineTotal,
        })),
        ...pricingSummary(order as unknown as Record<string, unknown>),
        stampAwarded: Boolean(order.stampAwarded),
      };
    }),
  );
});

router.get('/me/stamps', requireCustomer, async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  res.json(await stampCardFor(req.customer!.id));
});

router.get('/me/stamps/live', requireCustomer, (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders?.();

  const customerId = req.customer!.id;
  res.write(`data: ${JSON.stringify({ type: 'CONNECTED' })}\n\n`);

  const eventName = `stamp:${customerId}`;
  const onStamp = async (data: unknown) => {
    try {
      const card = await stampCardFor(customerId);
      res.write(`data: ${JSON.stringify({ type: 'STAMP_AWARDED', card, event: data })}\n\n`);
    } catch {
      res.write(`data: ${JSON.stringify({ type: 'STAMP_AWARDED', event: data })}\n\n`);
    }
  };

  stampEvents.on(eventName, onStamp);

  const heartbeat = setInterval(() => {
    res.write(': ping\n\n');
  }, 20000);

  req.on('close', () => {
    clearInterval(heartbeat);
    stampEvents.off(eventName, onStamp);
  });
});

router.get('/me/points', requireCustomer, async (req, res) => {
  const [customer, history] = await Promise.all([
    prisma.customer.findUnique({ where: { id: req.customer!.id }, select: { points: true } }),
    prisma.pointTransaction.findMany({
      where: { customerId: req.customer!.id },
      orderBy: { createdAt: 'desc' },
      take: POINT_HISTORY_LIMIT,
    }),
  ]);
  res.setHeader('Cache-Control', 'no-store');
  res.json({
    balance: customer?.points ?? 0,
    history: history.map((entry) => ({
      id: entry.id,
      type: entry.type,
      points: entry.points,
      balanceAfter: entry.balanceAfter,
      orderNumber: entry.orderNumber,
      note: entry.note,
      createdAt: entry.createdAt,
    })),
  });
});

router.get('/me/offers', requireCustomer, async (req, res) => {
  const offers = await prisma.offer.findMany({
    where: { isActive: { not: false } },
    orderBy: [{ endsAt: 'asc' }, { createdAt: 'desc' }],
  });
  const liveOffers = offers.filter((offer) => isOfferLive(offer as unknown as OfferRule));
  const result = await Promise.all(
    liveOffers.map(async (offer) => ({
      id: offer.id,
      titleJa: offer.titleJa,
      descriptionJa: offer.descriptionJa ?? '',
      imageUrl: offer.imageUrl ?? '',
      discountType: offer.discountType,
      discountValue: offer.discountValue,
      minSubtotal: offer.minSubtotal,
      endsAt: offer.endsAt ?? null,
      startsAt: offer.startsAt ?? offer.createdAt ?? null,
      oncePerCustomer: offer.oncePerCustomer,
      used: offer.oncePerCustomer ? await offerAlreadyUsed(offer.id, req.customer!.id) : false,
    })),
  );
  res.setHeader('Cache-Control', 'no-store');
  res.json(result);
});

// ---- Admin ---------------------------------------------------------------

router.get('/', requireAdmin, async (_req, res) => {
  const customers = await prisma.customer.findMany({
    where: { deletedAt: null },
    select: {
      id: true, email: true, name: true, nameKana: true, phone: true, birthDate: true,
      address: true, preferences: true, newsletterOptIn: true, newsletterOptInAt: true,
      points: true, isActive: true, deletedAt: true, memberCode: true,
      stampCount: true, stampCardsCompleted: true, lastStampAt: true, createdAt: true, updatedAt: true,
    },
    orderBy: { createdAt: 'desc' },
    take: ADMIN_LIST_LIMIT,
  });

  const customerIds = customers.map((c) => c.id);

  // Completed order stats per customer.
  const orderStats = await prisma.pickupOrder.groupBy({
    by: ['customerId'],
    where: { customerId: { in: customerIds }, status: 'COMPLETED' },
    _count: { id: true },
    _sum: { total: true },
  });
  const ordersByCustomer = new Map(orderStats.map((s) => [s.customerId!, { orders: s._count.id, spent: s._sum.total ?? 0 }]));

  // Available rewards per customer.
  const now = new Date();
  const rewardStats = await prisma.stampReward.groupBy({
    by: ['customerId'],
    where: {
      customerId: { in: customerIds },
      status: 'AVAILABLE',
      OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
    },
    _count: { id: true },
  });
  const rewardsByCustomer = new Map(rewardStats.map((s) => [s.customerId, s._count.id]));

  const { perCard } = stampConfig(await loadSettings());

  res.setHeader('Cache-Control', 'no-store');
  res.json(
    customers.map((customer) => ({
      ...publicProfile(customer as unknown as Record<string, unknown>),
      completedOrders: ordersByCustomer.get(customer.id)?.orders ?? 0,
      totalSpent: ordersByCustomer.get(customer.id)?.spent ?? 0,
      memberCode: customer.memberCode ?? null,
      stamps: Math.min(customer.stampCount, perCard),
      stampsPerCard: perCard,
      completedCards: customer.stampCardsCompleted,
      lastStampAt: customer.lastStampAt ?? null,
      availableRewards: rewardsByCustomer.get(customer.id) ?? 0,
    })),
  );
});

router.get('/:id/offers', requireAdmin, async (req, res) => {
  const id = idParam(req.params);
  const exists = await prisma.customer.count({ where: { id } });
  if (!exists) throw notFound('Customer');

  const [offers, usedOrders] = await Promise.all([
    prisma.offer.findMany({ where: { isActive: { not: false } }, orderBy: { createdAt: 'desc' } }),
    prisma.pickupOrder.findMany({
      where: {
        customerId: id,
        status: { not: 'CANCELLED' },
      },
      select: { number: true, offer: true, createdAt: true, status: true },
      orderBy: { createdAt: 'desc' },
      take: 50,
    }),
  ]);

  const usedIds = new Set(
    usedOrders
      .filter((order) => order.offer !== null)
      .map((order) => (order.offer as { id?: string } | null)?.id)
      .filter(Boolean),
  );

  res.setHeader('Cache-Control', 'no-store');
  res.json({
    available: offers
      .filter((offer) => isOfferLive(offer as unknown as OfferRule))
      .map((offer) => ({
        id: offer.id,
        titleJa: offer.titleJa,
        discountType: offer.discountType,
        discountValue: offer.discountValue,
        minSubtotal: offer.minSubtotal,
        endsAt: offer.endsAt ?? null,
        oncePerCustomer: offer.oncePerCustomer,
        used: usedIds.has(offer.id),
      })),
    used: usedOrders.map((order) => ({
      orderNumber: order.number,
      titleJa: (order.offer as { titleJa?: string } | null)?.titleJa ?? '',
      discount: (order.offer as { discount?: number } | null)?.discount ?? 0,
      createdAt: order.createdAt,
      status: order.status,
    })),
  });
});

router.post('/:id/points', requireAdmin, async (req, res) => {
  const id = idParam(req.params);
  const { points, note } = adjustSchema.parse(req.body);
  const exists = await prisma.customer.count({ where: { id } });
  if (!exists) throw notFound('Customer');

  const ok = await changePoints(id, points, 'ADJUST', { note: note || 'Adjusted by staff', userId: req.user!.id });
  if (!ok) throw new AppError(409, 'INSUFFICIENT_POINTS', 'The customer does not have that many points to remove.');

  await prisma.auditLog.create({
    data: {
      userId: req.user!.id,
      action: 'customer.points',
      entity: 'Customer',
      entityId: id,
      diff: { points, note: note ?? null },
    },
  });

  const customer = await prisma.customer.findUnique({ where: { id }, select: { points: true } });
  res.json({ success: true, points: customer?.points ?? 0 });
});

router.post('/:id/password', requireAdmin, async (req, res) => {
  const id = idParam(req.params);
  const input = resetSchema.parse(req.body);
  const passwordHash = await bcrypt.hash(input.password, BCRYPT_COST);
  try {
    await prisma.customer.update({ where: { id }, data: { passwordHash } });
  } catch {
    throw notFound('Customer');
  }
  await prisma.auditLog.create({
    data: {
      userId: req.user!.id,
      action: 'customer.password_reset',
      entity: 'Customer',
      entityId: id,
      diff: Prisma.DbNull,
    },
  });
  res.json({ success: true });
});

export default router;
