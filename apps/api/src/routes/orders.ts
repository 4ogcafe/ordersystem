import crypto from 'node:crypto';
import express from 'express';
import { z } from 'zod';
import { config } from '../config.js';
import { AppError, notFound } from '../lib/errors.js';
import { dietaryAlert } from '../lib/customer-profile.js';
import { earnedPoints, loyaltyConfig } from '../lib/loyalty.js';
import { FULFILLMENTS, deliveryAddressSchema, fulfillmentOptions, isEnabled, isInDeliveryArea, pausedUntil, slotsFor } from '../lib/fulfillment.js';
import { localDateKey } from '../lib/pickup.js';
import { idParam, objectIdString, optionalText } from '../lib/schemas.js';
import { requireKitchen } from '../middleware/auth.js';
import { optionalCustomer } from '../middleware/customerAuth.js';
import { rateLimit } from '../middleware/rateLimit.js';
import { MAX_QUANTITY, pricingSummary, quoteOrder, type OrderLine } from '../services/order-pricing.js';
import { changePoints } from '../services/points.js';
import { loadSettings } from '../services/settings-store.js';
import { awardStamp, releaseReward, useReward } from '../services/stamps.js';
import { notifyOrderReady } from '../services/push.js';
import { stampAmount } from '../lib/stamps.js';
import { prisma } from '../lib/prisma.js';
import { getStoredStores, type StoreLocation } from './stores.js';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = prisma as any;

const router = express.Router();

const ORDER_WINDOW_MS = 60 * 60 * 1000;
const MAX_LINES = 30;
const MAX_POINTS_PER_ORDER = 1_000_000;
const HISTORY_LIMIT = 200;
const TOKEN_BYTES = 16;
const TOKEN_PATTERN = /^[A-Za-z0-9_-]{22}$/;

export const ORDER_STATUSES = ['NEW', 'CONFIRMED', 'READY', 'COMPLETED', 'CANCELLED'] as const;
type OrderStatus = (typeof ORDER_STATUSES)[number];
const ACTIVE_STATUSES: OrderStatus[] = ['NEW', 'CONFIRMED', 'READY'];

/**
 * Which statuses an order may move to from each status; COMPLETED and CANCELLED are final.
 * READY can go back to CONFIRMED when the kitchen marked it ready by mistake.
 */
const NEXT_STATUSES: Record<OrderStatus, OrderStatus[]> = {
  NEW: ['CONFIRMED', 'READY', 'CANCELLED'],
  CONFIRMED: ['READY', 'COMPLETED', 'CANCELLED', 'CONFIRMED'],
  READY: ['COMPLETED', 'CANCELLED', 'CONFIRMED'],
  COMPLETED: [],
  CANCELLED: [],
};

const cartSchema = {
  items: z
    .array(z.object({ itemId: objectIdString, quantity: z.number().int().min(1).max(MAX_QUANTITY) }))
    .min(1)
    .max(MAX_LINES),
  offerId: z.union([objectIdString, z.array(objectIdString)]).nullable().optional(),
  offerIds: z.array(objectIdString).nullable().optional(),
  rewardId: objectIdString.nullable().optional(),
  pointsToUse: z.number().int().min(0).max(MAX_POINTS_PER_ORDER).optional(),
  fulfillment: z.enum(FULFILLMENTS).default('PICKUP'),
};

const quoteSchema = z.object(cartSchema);

const orderStoreSchema = z.object({
  id: z.string().trim().max(100),
  number: z.string().trim().max(20).optional(),
  name: z.string().trim().max(120),
  area: z.string().trim().max(120).optional(),
  badge: z.string().trim().max(80).optional(),
  address: z.string().trim().max(300).optional(),
  access: z.string().trim().max(200).optional(),
  hours: z.string().trim().max(200).optional(),
  holiday: z.string().trim().max(120).optional(),
  phone: z.string().trim().max(50).optional(),
});

const orderSchema = z.object({
  ...cartSchema,
  name: z.string().trim().min(1).max(100),
  phone: z.string().trim().regex(/^[\d\s()+-]{8,20}$/, 'Invalid phone number'),
  email: z.union([z.literal(''), z.email().max(254)]).nullable().optional(),
  note: optionalText(500),
  // The chosen time: pickup time, or delivery time for deliveries.
  pickupAt: z.iso.datetime(),
  deliveryAddress: deliveryAddressSchema.optional(),
  storeId: z.string().trim().max(100).optional(),
  storeName: z.string().trim().max(120).optional(),
  storeAddress: z.string().trim().max(300).optional(),
  storePhone: z.string().trim().max(50).optional(),
  store: orderStoreSchema.optional(),
  // Honeypot: hidden from people, filled in by bots.
  website: z.string().optional(),
});

const statusSchema = z.object({ status: z.enum(ORDER_STATUSES) });
const listQuerySchema = z.object({ scope: z.enum(['active', 'history', 'cashier']).default('active') });

const orderLimiter = rateLimit({
  windowMs: ORDER_WINDOW_MS,
  max: config.orderMaxPerHour,
  key: (req) => req.ip ?? 'unknown',
});

/** Short daily order numbers (1, 2, 3…) that staff can call out at the counter. */
async function nextOrderNumber(dateKey: string): Promise<number> {
  // Atomic upsert: creates the counter row if missing (seq=1) or increments it.
  const result = await prisma.orderCounter.upsert({
    where: { id: dateKey },
    update: { seq: { increment: 1 } },
    create: { id: dateKey, seq: 1 },
  });
  return (result as { seq: number }).seq;
}

// ---- Public --------------------------------------------------------------

const slotsQuerySchema = z.object({
  type: z.enum(['pickup', 'delivery', 'dine_in']).default('pickup'),
  storeId: z.string().trim().max(100).optional(),
});

function buildBranchPickupSettings<T extends Record<string, any>>(settings: T, store?: StoreLocation | null): T {
  const lunchEnabled = settings.lunchOrderEnabled !== false;
  const dinnerEnabled = settings.dinnerOrderEnabled !== false;
  const customLunch = typeof settings.lunchOrderHours === 'string' ? settings.lunchOrderHours.trim() : '';
  const customDinner = typeof settings.dinnerOrderHours === 'string' ? settings.dinnerOrderHours.trim() : '';
  const customTakeout = typeof settings.takeoutOrderHours === 'string' ? settings.takeoutOrderHours.trim() : '';

  // Extract ranges from store.hours if present (e.g. "ランチ 11:00–15:00 / ディナー 17:00–22:00" or "11:00–23:00")
  const storeRanges: string[] = [];
  if (store?.hours) {
    const cleaned = store.hours.replace(/[（(][^）)]*[）)]/g, ' ');
    const regex = /(\d{1,2}:\d{2})\s*[-–~〜]\s*(\d{1,2}:\d{2})/g;
    let m: RegExpExecArray | null;
    while ((m = regex.exec(cleaned)) !== null) {
      storeRanges.push(`${m[1]}-${m[2]}`);
    }
  }

  let effectiveLunch = customLunch || (storeRanges.length >= 2 ? storeRanges[0] : storeRanges.length === 1 ? `${storeRanges[0].split('-')[0]}-16:30` : '11:00-15:00');
  let effectiveDinner = customDinner || (storeRanges.length >= 2 ? storeRanges.slice(1).join(', ') : storeRanges.length === 1 ? `16:30-${storeRanges[0].split('-')[1]}` : '17:00-22:00');

  const activeParts: string[] = [];
  if (lunchEnabled && effectiveLunch) activeParts.push(effectiveLunch);
  if (dinnerEnabled && effectiveDinner) activeParts.push(effectiveDinner);

  const combinedHours = activeParts.length > 0
    ? activeParts.join(', ')
    : customTakeout || settings.pickupHours || '11:00-15:00, 17:00-22:00';

  // Merge branch regular holiday into pickupClosedDays
  const closedDays = new Set<number>(Array.isArray(settings.pickupClosedDays) ? settings.pickupClosedDays : []);
  if (store?.holiday && !/無休|なし/.test(store.holiday)) {
    const dayMap: [string, number][] = [
      ['日曜', 0], ['月曜', 1], ['火曜', 2], ['水曜', 3], ['木曜', 4], ['金曜', 5], ['土曜', 6],
    ];
    for (const [label, idx] of dayMap) {
      if (store.holiday.includes(label)) closedDays.add(idx);
    }
  }

  return {
    ...settings,
    pickupHours: combinedHours,
    pickupClosedDays: [...closedDays],
    _effectiveLunchHours: lunchEnabled ? effectiveLunch : '',
    _effectiveDinnerHours: dinnerEnabled ? effectiveDinner : '',
    _effectiveTakeoutHours: combinedHours,
  };
}

/** Which ordering options are on, and the times offered for the requested one. */
router.get('/slots', async (req, res) => {
  const { type, storeId } = slotsQuerySchema.parse(req.query);
  const rawSettings = await loadSettings();
  const stores = await getStoredStores().catch(() => [] as StoreLocation[]);
  const matchedStore = storeId ? stores.find((s) => s.id === storeId) : stores[0];
  const settings = buildBranchPickupSettings(rawSettings as any, matchedStore);
  const options = fulfillmentOptions(settings);
  const fulfillment = type === 'delivery' ? 'DELIVERY' : type === 'dine_in' ? 'DINE_IN' : 'PICKUP';
  res.setHeader('Cache-Control', 'no-store');
  const masterEnabled = (settings as any).orderingEnabled !== false;
  const isAvailable = Boolean(options.pickup.enabled || options.delivery.enabled || options.dineIn?.enabled);
  res.json({
    enabled: masterEnabled && isAvailable,
    orderingEnabled: masterEnabled,
    note: masterEnabled
      ? (fulfillment === 'DINE_IN' ? (options.dineIn?.note || '') : options.pickup.note)
      : 'ただいまオンラインでのご注文を停止しています。',
    lunchOrderEnabled: (rawSettings as any).lunchOrderEnabled !== false,
    dinnerOrderEnabled: (rawSettings as any).dinnerOrderEnabled !== false,
    lunchHours: (settings as any)._effectiveLunchHours || '11:00-15:00',
    dinnerHours: (settings as any)._effectiveDinnerHours || '17:00-22:00',
    takeoutHours: (settings as any)._effectiveTakeoutHours || '11:00-15:00, 17:00-22:00',
    enforceOrderTimeWindow: (rawSettings as any).enforceOrderTimeWindow !== false,
    ...options,
    slots: masterEnabled ? slotsFor(settings, fulfillment) : [],
  });
});

/** Live price for the checkout page: offer and points discounts as the order would be saved. */
router.post('/quote', optionalCustomer, async (req, res) => {
  const input = quoteSchema.parse(req.body);
  const quote = await quoteOrder({ ...input, customerId: req.customer?.id, settings: await loadSettings() });
  res.setHeader('Cache-Control', 'no-store');
  res.json({
    ...quote.breakdown,
    offer: quote.offer && { id: quote.offer.id, titleJa: quote.offer.titleJa },
    reward: quote.reward && { id: quote.reward.id, titleJa: quote.reward.titleJa, kind: quote.reward.kind },
  });
});

// Both members and guests can place orders. Signed-in members earn points/stamps and can use point rewards.
router.post('/', orderLimiter, optionalCustomer, async (req, res) => {
  const { website, ...input } = orderSchema.parse(req.body);
  if (website) {
    res.status(201).json({ token: crypto.randomBytes(TOKEN_BYTES).toString('base64url') });
    return;
  }

  const rawSettings = await loadSettings();
  const stores = await getStoredStores().catch(() => [] as StoreLocation[]);
  const matchedStore =
    (input.storeId ? stores.find((s) => s.id === input.storeId) : null) ||
    (input.store?.id ? stores.find((s) => s.id === input.store?.id) : null) ||
    (input.storeName ? stores.find((s) => s.name === input.storeName) : null) ||
    stores[0] ||
    null;
  const settings = buildBranchPickupSettings(rawSettings as any, matchedStore);

  const isDelivery = input.fulfillment === 'DELIVERY';
  const paused = pausedUntil(settings);
  if (paused) {
    const until = paused.toLocaleTimeString('ja-JP', { timeZone: settings.timezone ?? 'Asia/Tokyo', hour: '2-digit', minute: '2-digit' });
    throw new AppError(409, 'ORDERING_PAUSED', `ただいま大変混み合っているため、${until}頃までご注文の受付を一時停止しています。`);
  }
  if (!isEnabled(settings, input.fulfillment)) {
    throw new AppError(409, 'FULFILLMENT_UNAVAILABLE', isDelivery ? '現在デリバリーは受け付けておりません。' : '現在お持ち帰りのご注文は受け付けておりません。');
  }
  const pickupAt = new Date(input.pickupAt);
  const branchSlots = slotsFor(settings, input.fulfillment);
  const defaultSlots = slotsFor(rawSettings, input.fulfillment);
  if (
    !branchSlots.some((slot) => new Date(slot.at).getTime() === pickupAt.getTime()) &&
    !defaultSlots.some((slot) => new Date(slot.at).getTime() === pickupAt.getTime())
  ) {
    throw new AppError(409, 'SLOT_UNAVAILABLE', `この${isDelivery ? 'お届け' : '受け取り'}時間は選択できません。別の時間をお選びください。`);
  }
  if (isDelivery) {
    if (!input.deliveryAddress) throw new AppError(400, 'ADDRESS_REQUIRED', 'お届け先の住所を入力してください。');
    if (!isInDeliveryArea(input.deliveryAddress, settings.deliveryAreas)) {
      throw new AppError(409, 'OUTSIDE_DELIVERY_AREA', '申し訳ありません。このご住所は配達エリア外です。お持ち帰りをご利用ください。');
    }
  }

  const customerId = req.customer?.id;
  const { lines, breakdown, offer, reward } = await quoteOrder({ ...input, customerId, settings });
  if (breakdown.minOrderShortfall > 0) {
    throw new AppError(409, 'BELOW_MINIMUM', `デリバリーは¥${(settings.deliveryMinOrder ?? 0).toLocaleString('ja-JP')}以上のご注文で承ります。`);
  }

  const orderId = crypto.randomUUID();
  const dateKey = localDateKey(pickupAt, settings.timezone);
  const number = await nextOrderNumber(dateKey);

  if (customerId && reward && !(await useReward(reward.id, customerId, { orderId, orderNumber: number }))) {
    throw new AppError(409, 'REWARD_UNAVAILABLE', 'このスタンプ特典はすでにご利用済みです。');
  }
  if (customerId && breakdown.pointsUsed > 0) {
    const reserved = await changePoints(customerId, -breakdown.pointsUsed, 'REDEEM', { orderId, orderNumber: number });
    if (!reserved) {
      if (reward) await releaseReward(orderId);
      throw new AppError(409, 'POINTS_CHANGED', 'ポイント残高が変わりました。もう一度お試しください。');
    }
  }

  const token = crypto.randomBytes(TOKEN_BYTES).toString('base64url');

  const resolvedStore = matchedStore
    ? {
        id: matchedStore.id,
        number: matchedStore.number,
        name: matchedStore.name,
        area: matchedStore.area,
        badge: matchedStore.badge,
        address: matchedStore.address,
        access: matchedStore.access,
        hours: matchedStore.hours,
        holiday: matchedStore.holiday,
        phone: matchedStore.phone,
      }
    : input.store
      ? input.store
      : input.storeName
        ? {
            id: input.storeId || 'branch',
            number: '01',
            name: input.storeName,
            address: input.storeAddress || '',
            phone: input.storePhone || '',
          }
        : stores[0]
          ? {
              id: stores[0].id,
              number: stores[0].number,
              name: stores[0].name,
              area: stores[0].area,
              badge: stores[0].badge,
              address: stores[0].address,
              access: stores[0].access,
              hours: stores[0].hours,
              holiday: stores[0].holiday,
              phone: stores[0].phone,
            }
          : null;

  const linesWithStore = lines.map((line, idx) =>
    idx === 0 && resolvedStore ? ({ ...line, store: resolvedStore } as OrderLine) : line
  );

  try {
    await db.pickupOrder.create({
      data: {
        id: orderId,
        number,
        dateKey,
        token,
        status: 'NEW',
        fulfillment: input.fulfillment,
        deliveryAddress: isDelivery ? input.deliveryAddress : null,
        deliveryFee: breakdown.deliveryFee,
        customerName: input.name,
        phone: input.phone,
        email: input.email || null,
        note: input.note || null,
        pickupAt,
        items: linesWithStore,
        customerId: customerId ?? null,
        subtotal: breakdown.subtotal,
        offer: offer ?? null,
        reward: reward ?? null,
        pointsUsed: breakdown.pointsUsed,
        pointsDiscount: breakdown.pointsDiscount,
        total: breakdown.total,
        taxRate: breakdown.taxRate,
        tax: breakdown.tax,
        grandTotal: breakdown.grandTotal,
        pointsEarned: 0,
        stampAwarded: false,
        ip: req.ip ?? null,
      },
    });
  } catch (err) {
    if (customerId && breakdown.pointsUsed > 0) {
      await changePoints(customerId, breakdown.pointsUsed, 'REFUND', { orderId, orderNumber: number, note: 'Order could not be saved' });
    }
    if (reward) await releaseReward(orderId);
    throw err;
  }
  res.status(201).json({
    token,
    number,
    total: breakdown.total,
    tax: breakdown.tax,
    grandTotal: breakdown.grandTotal,
    pickupAt,
    store: resolvedStore,
  });
});

function extractOrderStore(order: Record<string, unknown>) {
  const items = order.items as Array<Record<string, unknown>> | undefined;
  const firstStore = Array.isArray(items) && items[0]?.store && typeof items[0].store === 'object' ? (items[0].store as Record<string, unknown>) : null;
  if (firstStore) return firstStore;
  return null;
}

/** The customer's status page. The unguessable token is the only key, so order ids can't be enumerated. */
router.get('/track/:token', async (req, res) => {
  const token = req.params.token;
  if (!TOKEN_PATTERN.test(token)) throw notFound('Order');
  const order = await db.pickupOrder.findFirst({ where: { token } });
  if (!order) throw notFound('Order');

  const store = extractOrderStore(order as unknown as Record<string, unknown>);
  res.setHeader('Cache-Control', 'no-store');
  res.json({
    token: order.token,
    number: order.number,
    status: order.status,
    customerName: order.customerName,
    phone: order.phone,
    note: order.note,
    pickupAt: order.pickupAt,
    store,
    storeId: store?.id ?? null,
    storeName: store?.name ?? null,
    storeAddress: store?.address ?? null,
    storePhone: store?.phone ?? null,
    items: (order.items as OrderLine[]).map((line) => ({
      nameEn: line.nameEn,
      nameJa: line.nameJa,
      quantity: line.quantity,
      unitPrice: line.unitPrice,
      lineTotal: line.lineTotal,
      options: line.options,
    })),
    ...pricingSummary(order as unknown as Record<string, unknown>),
    isMember: Boolean(order.customerId),
    createdAt: order.createdAt,
  });
});

// ---- Staff ---------------------------------------------------------------

router.get('/', requireKitchen, async (req, res) => {
  const { scope } = listQuerySchema.parse(req.query);
  const active = scope === 'active';
  const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000);

  const whereClause = scope === 'cashier'
    ? {
        OR: [
          { status: { in: ACTIVE_STATUSES } },
          { status: 'COMPLETED', createdAt: { gte: cutoff } },
        ],
      }
    : { status: active ? { in: ACTIVE_STATUSES } : { notIn: ACTIVE_STATUSES } };

  const orders = await db.pickupOrder.findMany({
    where: whereClause,
    orderBy: { pickupAt: (active || scope === 'cashier') ? 'asc' : 'desc' },
    ...(active || scope === 'cashier' ? {} : { take: HISTORY_LIMIT }),
  });

  res.setHeader('Cache-Control', 'no-store');
  res.json(await withDietaryAlerts((orders as Record<string, unknown>[]).map(({ token: _t, ip: _ip, ...o }) => ({
    ...o,
    store: extractOrderStore(o),
  }))));
});

/** The kitchen sees each member's allergies and dietary needs on their orders. */
async function withDietaryAlerts(orders: Record<string, unknown>[]) {
  const memberIds = [...new Set(orders.map((o) => o.customerId).filter((id): id is string => typeof id === 'string' && id.length > 0))];
  const members = memberIds.length > 0
    ? await prisma.customer.findMany({ where: { id: { in: memberIds } }, select: { id: true, preferences: true } })
    : [];
  const alerts = new Map(members.map((m) => [m.id, dietaryAlert(m as unknown as Record<string, unknown>)]));
  return orders.map((order) => ({
    ...order,
    store: extractOrderStore(order),
    dietaryAlert: typeof order.customerId === 'string' ? (alerts.get(order.customerId) ?? null) : null,
  }));
}

// ---- Kitchen display -----------------------------------------------------

const KITCHEN_DONE_LIMIT = 40;
const DAY_MS = 24 * 60 * 60 * 1000;
const MAX_PAUSE_MINUTES = 4 * 60;
const pauseSchema = z.object({ minutes: z.number().int().min(0).max(MAX_PAUSE_MINUTES) });
const itemDoneSchema = z.object({ done: z.boolean() });

/** Everything the kitchen screen shows, in one request: open orders, today's finished ones, and stats. */
router.get('/kitchen', requireKitchen, async (_req, res) => {
  const settings = await loadSettings();
  const now = new Date();
  const today = localDateKey(now, settings.timezone);
  const cutoff = new Date(now.getTime() - DAY_MS);

  const [active, finishedRecent, todayOrders] = await Promise.all([
    db.pickupOrder.findMany({ where: { status: { in: ACTIVE_STATUSES } }, orderBy: { pickupAt: 'asc' } }),
    db.pickupOrder.findMany({
      where: { status: { in: ['COMPLETED', 'CANCELLED'] }, updatedAt: { gte: cutoff } },
      orderBy: { updatedAt: 'desc' },
      take: KITCHEN_DONE_LIMIT,
    }),
    db.pickupOrder.findMany({
      where: { OR: [{ createdAt: { gte: cutoff } }, { updatedAt: { gte: cutoff } }] },
      select: { status: true, createdAt: true, updatedAt: true, confirmedAt: true, readyAt: true, completedAt: true, cancelledAt: true, items: true },
    }),
  ]) as [Record<string, unknown>[], Record<string, unknown>[], Record<string, unknown>[]];

  const done = (finishedRecent as Record<string, unknown>[]).filter((o) => localDateKey(o.updatedAt as Date, settings.timezone) === today);

  const isToday = (value: unknown) => value instanceof Date && localDateKey(value, settings.timezone) === today;
  const received = todayOrders.filter((o) => isToday(o.createdAt) && o.status !== 'CANCELLED');
  const prepMinutes = todayOrders
    .filter((o) => o.confirmedAt instanceof Date && isToday(o.readyAt))
    .map((o) => ((o.readyAt as Date).getTime() - (o.confirmedAt as Date).getTime()) / 60_000);

  const stripPrivate = (o: Record<string, unknown>) => {
    const { token: _t, ip: _i, email: _e, ...rest } = o;
    return rest;
  };

  res.setHeader('Cache-Control', 'no-store');
  res.json({
    serverTime: now,
    pausedUntil: pausedUntil(settings, now),
    ordering: fulfillmentOptions(settings),
    active: await withDietaryAlerts((active as Record<string, unknown>[]).map(stripPrivate)),
    done: await withDietaryAlerts(done.map(stripPrivate)),
    stats: {
      ordersToday: received.length,
      completedToday: todayOrders.filter((o) => o.status === 'COMPLETED' && isToday(o.completedAt ?? o.updatedAt)).length,
      cancelledToday: todayOrders.filter((o) => o.status === 'CANCELLED' && isToday(o.cancelledAt ?? o.updatedAt)).length,
      itemsToday: received.reduce((sum, o) => sum + (o.items as { quantity: number }[]).reduce((n, line) => n + line.quantity, 0), 0),
      avgPrepMinutes: prepMinutes.length ? Math.round(prepMinutes.reduce((a, b) => a + b, 0) / prepMinutes.length) : null,
    },
  });
});

/** "Too busy": stop new online orders for a while (0 resumes now). */
router.post('/kitchen/pause', requireKitchen, async (req, res) => {
  const { minutes } = pauseSchema.parse(req.body);
  const until = minutes > 0 ? new Date(Date.now() + minutes * 60_000) : null;
  const existing = await prisma.settings.findFirst({ select: { id: true } });
  if (existing) {
    await db.settings.update({ where: { id: existing.id }, data: { orderingPausedUntil: until } });
  }

  await prisma.auditLog.create({
    data: {
      userId: req.user!.id,
      action: 'ordering.pause',
      entity: 'Settings',
      entityId: 'ordering',
      diff: { minutes, until },
    },
  });
  res.json({ pausedUntil: until });
});

/** Ticks one dish off (or back on) while an order is being prepared. */
router.patch('/:id/items/:index', requireKitchen, async (req, res) => {
  const id = idParam(req.params);
  const index = Number(req.params.index);
  if (!Number.isInteger(index) || index < 0 || index >= MAX_LINES) throw notFound('Order line');
  const { done } = itemDoneSchema.parse(req.body);

  const order = await db.pickupOrder.findUnique({
    where: { id },
    select: { id: true, status: true, items: true },
  });

  if (!order) throw notFound('Order');
  if (!['NEW', 'CONFIRMED', 'READY'].includes(order.status)) throw notFound('Order line');

  let items: any[] = [];
  try {
    items = typeof order.items === 'string' ? JSON.parse(order.items) : (Array.isArray(order.items) ? [...order.items] : []);
  } catch {
    items = [];
  }

  if (index >= items.length) throw notFound('Order line');

  items[index] = {
    ...items[index],
    doneAt: done ? new Date().toISOString() : null,
  };

  await db.pickupOrder.update({
    where: { id },
    data: { items, updatedAt: new Date() },
  });

  res.json({ success: true });
});

router.patch('/:id/status', requireKitchen, async (req, res) => {
  const id = idParam(req.params);
  const { status } = statusSchema.parse(req.body);
  const allowedFrom = ORDER_STATUSES.filter((from) => NEXT_STATUSES[from].includes(status));

  // Fetch current state before updating.
  const before = await db.pickupOrder.findUnique({
    where: { id },
    select: { id: true, status: true, customerId: true, pointsUsed: true, reward: true, confirmedAt: true, number: true, total: true },
  }) as Record<string, unknown> | null;

  if (!before) throw notFound('Order');
  if (!allowedFrom.includes(before.status as OrderStatus)) {
    throw new AppError(409, 'INVALID_STATUS_CHANGE', `Cannot change an order from ${before.status} to ${status}`);
  }

  // Build the update — each step's timestamp is recorded for kitchen timers.
  const updateData: Record<string, unknown> = { status, updatedAt: new Date() };
  if (status === 'CONFIRMED') { updateData.confirmedAt = new Date(); updateData.readyAt = null; }
  else if (status === 'READY') updateData.readyAt = new Date();
  else if (status === 'COMPLETED') updateData.completedAt = new Date();
  else if (status === 'CANCELLED') updateData.cancelledAt = new Date();

  await db.pickupOrder.update({ where: { id }, data: updateData });

  // Sent back from "ready" to the kitchen: keep the original confirmed time so the prep timer is continuous.
  if (before.status === 'READY' && status === 'CONFIRMED' && before.confirmedAt) {
    await db.pickupOrder.update({ where: { id }, data: { confirmedAt: before.confirmedAt } });
  }

  await settleMemberPoints(before, status);
  const stamp = await settleMemberStamp(before, status);
  if (status === 'READY') void notifyOrderReady(before);

  await prisma.auditLog.create({
    data: {
      userId: req.user?.id ?? 'system',
      action: 'order.status',
      entity: 'PickupOrder',
      entityId: id,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      diff: { from: String(before.status), to: status } as any,
    },
  });
  res.json({ success: true, status, stamp });
});

/** Members earn points when an order is picked up, and get spent points back when it is cancelled. */
async function settleMemberPoints(order: Record<string, unknown>, status: OrderStatus) {
  const customerId = typeof order.customerId === 'string' ? order.customerId : null;
  if (!customerId) return;
  const orderId = String(order.id);
  const orderNumber = Number(order.number);

  if (status === 'COMPLETED') {
    const points = earnedPoints(Number(order.total) || 0, loyaltyConfig(await loadSettings()));
    if (points > 0) {
      await changePoints(customerId, points, 'EARN', { orderId, orderNumber });
      await db.pickupOrder.update({ where: { id: orderId }, data: { pointsEarned: points } });
    }
  }
  const pointsUsed = Number(order.pointsUsed) || 0;
  if (status === 'CANCELLED' && pointsUsed > 0) {
    await changePoints(customerId, pointsUsed, 'REFUND', { orderId, orderNumber });
  }
  if (status === 'CANCELLED' && order.reward) await releaseReward(orderId);
}

/** A completed member order earns a stamp when it is large enough and the last stamp was long enough ago. */
async function settleMemberStamp(order: Record<string, unknown>, status: OrderStatus) {
  const customerId = typeof order.customerId === 'string' ? order.customerId : null;
  if (status !== 'COMPLETED' || !customerId) return null;
  const orderId = String(order.id);
  const result = await awardStamp(customerId, { source: 'ORDER', amount: stampAmount(order), orderId, orderNumber: Number(order.number) });
  if (result.status === 'AWARDED') await db.pickupOrder.update({ where: { id: orderId }, data: { stampAwarded: true } });
  return result;
}

export default router;
