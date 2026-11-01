import express from 'express';
import { z } from 'zod';
import {
  RANGES,
  busyHours,
  change,
  fulfillmentSplit,
  headline,
  paidAmount,
  periodFor,
  promotionUse,
  salesSeries,
  topItems,
  type OrderFact,
} from '../lib/analytics.js';
import { fulfillmentOptions, pausedUntil } from '../lib/fulfillment.js';
import { prisma } from '../lib/prisma.js';
import { localDayStart, localDateKey } from '../lib/pickup.js';
import { stampConfig } from '../lib/stamps.js';
import { requireAdmin, requireStaff } from '../middleware/auth.js';
import { loadSettings } from '../services/settings-store.js';

const router = express.Router();

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = prisma as any;

const ACTIVE = ['NEW', 'CONFIRMED', 'READY'];
const RECENT_ORDERS = 8;
const RECENT_MESSAGES = 5;
const SOLD_OUT_LIST = 12;
const UPCOMING_RESERVATIONS = 6;
const MAX_EXPORT_ROWS = 20_000;

router.get('/stats', requireStaff, async (_req, res) => {
  const [menuItemsCount, soldOutItemsCount, categoriesCount, carouselsCount, unreadMessagesCount, newOrdersCount, activeOrdersCount, customersCount] = await Promise.all([
    prisma.menuItem.count(),
    db.menuItem.count({ where: { isSoldOut: true } }),
    prisma.category.count(),
    db.carouselSlide.count({ where: { isActive: { not: false } } }),
    db.contactMessage.count({ where: { isRead: false } }),
    db.pickupOrder.count({ where: { status: 'NEW' } }),
    db.pickupOrder.count({ where: { status: { in: ACTIVE } } }),
    prisma.customer.count(),
  ]);

  res.setHeader('Cache-Control', 'no-store');
  res.json({ menuItemsCount, soldOutItemsCount, categoriesCount, carouselsCount, unreadMessagesCount, newOrdersCount, activeOrdersCount, customersCount });
});

/** What needs attention right now. */
router.get('/live', requireStaff, async (req, res) => {
  const settings = await loadSettings();
  const now = new Date();
  const todayStart = localDayStart(localDateKey(now, settings.timezone), settings.timezone);

  const [open, todayOrders, recentOrders, unread, recentMessages, reservations, soldOut, menuCount, liveOffersCount] = await Promise.all([
    db.pickupOrder.findMany({ where: { status: { in: ACTIVE } }, select: { status: true, pickupAt: true, number: true, customerName: true }, orderBy: { pickupAt: 'asc' } }),
    db.pickupOrder.findMany({ where: { createdAt: { gte: todayStart } }, select: { status: true, grandTotal: true, total: true } }),
    db.pickupOrder.findMany({ select: { id: true, number: true, status: true, fulfillment: true, customerName: true, customerId: true, grandTotal: true, total: true, createdAt: true, pickupAt: true }, orderBy: { createdAt: 'desc' }, take: RECENT_ORDERS }),
    db.contactMessage.count({ where: { isRead: false } }),
    db.contactMessage.findMany({ select: { id: true, name: true, type: true, isRead: true, createdAt: true, date: true, guests: true }, orderBy: { createdAt: 'desc' }, take: RECENT_MESSAGES }),
    db.contactMessage.findMany({ where: { type: 'RESERVATION', date: { gte: todayStart } }, select: { id: true, name: true, date: true, guests: true, isRead: true, phone: true, message: true }, orderBy: { date: 'asc' }, take: UPCOMING_RESERVATIONS }),
    db.menuItem.findMany({ where: { isSoldOut: true }, select: { nameEn: true, nameJa: true }, take: SOLD_OUT_LIST }),
    db.menuItem.count(),
    db.offer.count({ where: { isActive: { not: false }, OR: [{ endsAt: null }, { endsAt: { gte: now } }] } }),
  ]) as [Record<string, unknown>[], Record<string, unknown>[], Record<string, unknown>[], number, Record<string, unknown>[], Record<string, unknown>[], Record<string, unknown>[], number, number];

  const late = open.filter((o) => o.status !== 'READY' && (o.pickupAt as Date) < now);
  const completedToday = todayOrders.filter((o) => o.status === 'COMPLETED');
  const isAdmin = req.user?.role === 'ADMIN';
  const nextDue = open.find((o) => o.status !== 'READY');

  res.setHeader('Cache-Control', 'no-store');
  res.json({
    serverTime: now,
    open: {
      NEW: open.filter((o) => o.status === 'NEW').length,
      CONFIRMED: open.filter((o) => o.status === 'CONFIRMED').length,
      READY: open.filter((o) => o.status === 'READY').length,
      late: late.length,
      nextDue: nextDue ? { number: nextDue.number, customerName: nextDue.customerName, pickupAt: nextDue.pickupAt } : null,
    },
    today: {
      placed: todayOrders.filter((o) => o.status !== 'CANCELLED').length,
      completed: completedToday.length,
      cancelled: todayOrders.filter((o) => o.status === 'CANCELLED').length,
      sales: isAdmin ? completedToday.reduce((sum, o) => sum + paidAmount(o as unknown as OrderFact), 0) : null,
    },
    ordering: { ...fulfillmentOptions(settings), stampCard: stampConfig(settings).enabled, liveOffers: liveOffersCount },
    recentOrders: recentOrders.map(({ id, grandTotal, total, customerId, ...order }) => ({
      id,
      ...order,
      member: Boolean(customerId),
      amount: isAdmin ? ((grandTotal ?? total) as number | null) : null,
    })),
    messages: { unread, recent: recentMessages.map(({ id: _id, ...msg }) => ({ id: _id, ...msg })) },
    reservations: reservations.map(({ id: _id, ...r }) => ({ id: _id, ...r })),
    menu: { total: menuCount, soldOut: (soldOut as Record<string, unknown>[]).map((i) => i.nameJa || i.nameEn) },
  });
});

// ---- Admin top bar: search and notifications ----------------------------------------

const SEARCH_LIMIT = 6;
const searchQuery = z.object({ q: z.string().trim().min(1).max(100) });

/** One box to find orders, members, dishes and messages. */
router.get('/search', requireStaff, async (req, res) => {
  const { q } = searchQuery.parse(req.query);
  const isAdmin = req.user?.role === 'ADMIN';
  const digits = q.replace(/\D/g, '');
  const number = /^#?\d{1,4}$/.test(q) ? Number(q.replace('#', '')) : null;
  const since = new Date(Date.now() - 30 * 86_400_000);

  const orderOrConditions: Record<string, unknown>[] = [{ customerName: { contains: q } }];
  if (number !== null) orderOrConditions.push({ number, createdAt: { gte: since } });
  if (digits.length >= 4) orderOrConditions.push({ phone: { contains: digits } });

  const memberOrConditions: Record<string, unknown>[] = [
    { name: { contains: q } },
    { nameKana: { contains: q } },
    { email: { contains: q } },
  ];
  if (digits.length >= 4) memberOrConditions.push({ phone: { contains: digits } });

  const [orders, members, items, messages] = await Promise.all([
    db.pickupOrder.findMany({ where: { OR: orderOrConditions }, select: { id: true, number: true, status: true, fulfillment: true, customerName: true, createdAt: true }, orderBy: { createdAt: 'desc' }, take: SEARCH_LIMIT }),
    isAdmin
      ? db.customer.findMany({ where: { deletedAt: null, OR: memberOrConditions }, select: { id: true, name: true, email: true, phone: true }, take: SEARCH_LIMIT })
      : Promise.resolve([]),
    db.menuItem.findMany({ where: { OR: [{ nameEn: { contains: q } }, { nameJa: { contains: q } }] }, select: { id: true, nameEn: true, nameJa: true, price: true, isSoldOut: true }, take: SEARCH_LIMIT }),
    isAdmin
      ? db.contactMessage.findMany({ where: { OR: [{ name: { contains: q } }, { email: { contains: q } }, { message: { contains: q } }] }, select: { id: true, name: true, type: true, createdAt: true, isRead: true }, orderBy: { createdAt: 'desc' }, take: SEARCH_LIMIT })
      : Promise.resolve([]),
  ]) as [Record<string, unknown>[], Record<string, unknown>[], Record<string, unknown>[], Record<string, unknown>[]];

  res.setHeader('Cache-Control', 'no-store');
  res.json({
    orders: orders.map((o) => ({ id: o.id, number: o.number, status: o.status, fulfillment: o.fulfillment ?? 'PICKUP', customerName: o.customerName, createdAt: o.createdAt })),
    members: members.map((m) => ({ id: m.id, name: m.name, email: m.email, phone: m.phone ?? '' })),
    menuItems: items.map((i) => ({ id: i.id, nameEn: i.nameEn, nameJa: i.nameJa ?? null, price: i.price, isSoldOut: Boolean(i.isSoldOut) })),
    tables: [],
    messages: messages.map((m) => ({ id: m.id, name: m.name, type: m.type, createdAt: m.createdAt, isRead: Boolean(m.isRead) })),
  });
});

/** Everything waiting for someone, newest problems first. */
router.get('/notifications', requireStaff, async (req, res) => {
  const isAdmin = req.user?.role === 'ADMIN';
  const settings = await loadSettings();
  const now = new Date();
  const [newOrders, lateCount, unread, soldOut] = await Promise.all([
    db.pickupOrder.findMany({ where: { status: 'NEW' }, select: { id: true, number: true, fulfillment: true, customerName: true, createdAt: true }, orderBy: { createdAt: 'desc' }, take: 10 }),
    db.pickupOrder.count({ where: { status: { in: ['NEW', 'CONFIRMED'] }, pickupAt: { lt: now } } }),
    isAdmin ? db.contactMessage.findMany({ where: { isRead: false }, select: { id: true, name: true, type: true, createdAt: true }, orderBy: { createdAt: 'desc' }, take: 5 }) : Promise.resolve([]),
    db.menuItem.findMany({ where: { isSoldOut: true }, select: { id: true, nameEn: true, nameJa: true }, take: 20 }),
  ]) as [Record<string, unknown>[], number, Record<string, unknown>[], Record<string, unknown>[]];

  type Note = { id: string; tone: 'critical' | 'warning' | 'info'; title: string; detail?: string; tab: string; at?: string };
  const notes: Note[] = [];
  const late = Number(lateCount);
  if (late > 0) notes.push({ id: 'late', tone: 'critical', title: `${late} order${late === 1 ? '' : 's'} past due time`, detail: 'Not ready yet', tab: 'Orders' });
  for (const order of newOrders) {
    const fulfillment = String(order.fulfillment ?? 'PICKUP');
    const where = fulfillment === 'DELIVERY' ? `Delivery · ${order.customerName}` : `Pickup · ${order.customerName}`;
    notes.push({ id: `order-${order.id}`, tone: 'warning', title: `New order #${String(order.number).padStart(3, '0')}`, detail: where, tab: 'Orders', at: String(order.createdAt) });
  }
  const paused = pausedUntil(settings, now);
  if (paused) notes.push({ id: 'paused', tone: 'warning', title: 'Online orders paused by the kitchen', detail: `Until ${paused.toLocaleTimeString('ja-JP', { timeZone: settings.timezone ?? 'Asia/Tokyo', hour: '2-digit', minute: '2-digit' })}`, tab: 'Orders' });
  else if (!settings.pickupEnabled && !settings.deliveryEnabled) notes.push({ id: 'ordering-off', tone: 'info', title: 'Online ordering is off', detail: 'Pickup and delivery are both switched off', tab: 'Orders' });
  for (const message of unread) {
    notes.push({ id: `msg-${message.id}`, tone: 'info', title: `Message from ${message.name}`, detail: String(message.type ?? 'GENERAL').toLowerCase(), tab: 'Contact Messages', at: String(message.createdAt) });
  }
  if (soldOut.length) notes.push({ id: 'sold-out', tone: 'info', title: `${soldOut.length} item${soldOut.length === 1 ? '' : 's'} sold out`, detail: soldOut.slice(0, 4).map((i) => i.nameJa || i.nameEn).join('、'), tab: 'Menu Management' });

  res.setHeader('Cache-Control', 'no-store');
  res.json({ count: notes.filter((note) => note.id !== 'sold-out' && note.id !== 'ordering-off').length, items: notes });
});

const analyticsQuery = z
  .object({
    range: z.enum(RANGES).default('7d'),
    from: z.iso.date().optional(),
    to: z.iso.date().optional(),
  })
  .refine((query) => query.range !== 'custom' || (query.from && query.to), 'A custom range needs from and to');

const periodFrom = async (query: unknown) => {
  const { range, from, to } = analyticsQuery.parse(query);
  const settings = await loadSettings();
  return { settings, period: periodFor(range, settings.timezone, new Date(), from && to ? { from, to } : undefined) };
};

/** Sales, orders, customers and loyalty for a period, with the previous period for comparison. */
router.get('/analytics', requireAdmin, async (req, res) => {
  const { settings, period } = await periodFrom(req.query);
  const tz = settings.timezone;
  const inPeriod = { gte: period.start, lt: period.end };

  const ORDER_SELECT = {
    number: true, status: true, fulfillment: true, createdAt: true, pickupAt: true, confirmedAt: true,
    readyAt: true, customerId: true, customerName: true, subtotal: true, total: true, tax: true,
    grandTotal: true, deliveryFee: true, pointsDiscount: true, offer: true, reward: true, items: true,
  };

  const [current, previous, membersTotal, newMembers, previousNewMembers, newsletter, pointsGroups, stampsCount, rewardsEarnedCount, rewardsUsedCount, messageGroups, outstanding] = await Promise.all([
    db.pickupOrder.findMany({ where: { createdAt: inPeriod }, select: ORDER_SELECT }) as Promise<OrderFact[]>,
    db.pickupOrder.findMany({ where: { createdAt: { gte: period.previousStart, lt: period.previousEnd } }, select: ORDER_SELECT }) as Promise<OrderFact[]>,
    prisma.customer.count({ where: { deletedAt: null } }),
    prisma.customer.count({ where: { createdAt: inPeriod } }),
    prisma.customer.count({ where: { createdAt: { gte: period.previousStart, lt: period.previousEnd } } }),
    prisma.customer.count({ where: { newsletterOptIn: true, deletedAt: null } }),
    db.pointTransaction.groupBy({ by: ['type'], where: { createdAt: inPeriod }, _sum: { points: true } }) as Promise<{ type: string; _sum: { points: number } }[]>,
    db.stamp.count({ where: { createdAt: inPeriod } }),
    db.stampReward.count({ where: { earnedAt: inPeriod } }),
    db.stampReward.count({ where: { usedAt: inPeriod } }),
    db.contactMessage.groupBy({ by: ['type'], where: { createdAt: inPeriod }, _count: { id: true } }) as Promise<{ type: string | null; _count: { id: number } }[]>,
    prisma.customer.aggregate({ where: { deletedAt: null }, _sum: { points: true } }),
  ]);

  // Returning members: had a completed order before this period, and ordered again in it.
  const buyerIds = [...new Set((current as OrderFact[]).filter((o) => o.status === 'COMPLETED' && o.customerId).map((o) => String(o.customerId)))];
  const returning = buyerIds.length
    ? (await db.pickupOrder.findMany({
        where: { customerId: { in: buyerIds }, status: 'COMPLETED', createdAt: { lt: period.start } },
        distinct: ['customerId'],
        select: { customerId: true },
      }) as { customerId: string }[]).length
    : 0;

  const now = headline(current as unknown as OrderFact[]);
  const before = headline(previous as unknown as OrderFact[]);
  const pointsBy = (type: string) => (pointsGroups as { type: string; _sum: { points: number } }[]).find((e) => e.type === type)?._sum?.points ?? 0;

  res.setHeader('Cache-Control', 'no-store');
  res.json({
    period: { range: period.range, start: period.start, end: period.end, previousStart: period.previousStart, bucket: period.bucket, days: period.days, timezone: tz ?? 'Asia/Tokyo' },
    headline: now,
    previous: before,
    change: {
      sales: change(now.sales, before.sales),
      orders: change(now.orders, before.orders),
      averageOrder: change(now.averageOrder, before.averageOrder),
      newMembers: change(newMembers, previousNewMembers),
    },
    series: salesSeries(current as unknown as OrderFact[], period, tz),
    busyHours: busyHours(current as unknown as OrderFact[], tz),
    topItems: topItems(current as unknown as OrderFact[]),
    fulfillment: fulfillmentSplit(current as unknown as OrderFact[]),
    promotions: promotionUse(current as unknown as OrderFact[]),
    members: {
      total: membersTotal,
      new: newMembers,
      previousNew: previousNewMembers,
      newsletter,
      buyers: buyerIds.length,
      returning,
    },
    loyalty: {
      pointsEarned: pointsBy('EARN') + pointsBy('BONUS'),
      pointsRedeemed: -pointsBy('REDEEM') - pointsBy('REFUND'),
      pointsOutstanding: outstanding._sum.points ?? 0,
      stampsGiven: stampsCount,
      rewardsEarned: rewardsEarnedCount,
      rewardsUsed: rewardsUsedCount,
    },
    messages: Object.fromEntries((messageGroups as { type: string | null; _count: { id: number } }[]).map((e) => [e.type ?? 'GENERAL', e._count.id])),
  });
});

// Cells starting with these would run as formulas when the file is opened in Excel.
const csvCell = (value: unknown) => {
  const text = value === null || value === undefined ? '' : String(value);
  const safe = /^[=+\-@\t\r]/.test(text) ? `'${text}` : text;
  return /[",\n\r]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
};

const ORDER_CSV_SELECT = {
  number: true, status: true, fulfillment: true, createdAt: true, pickupAt: true, confirmedAt: true,
  readyAt: true, customerId: true, customerName: true, subtotal: true, total: true, tax: true,
  grandTotal: true, deliveryFee: true, pointsDiscount: true, offer: true, reward: true, items: true, phone: true,
};

/** Every order in the period as a spreadsheet. */
router.get('/analytics/orders.csv', requireAdmin, async (req, res) => {
  const { settings, period } = await periodFrom(req.query);
  const rows = await db.pickupOrder.findMany({
    where: { createdAt: { gte: period.start, lt: period.end } },
    select: ORDER_CSV_SELECT,
    orderBy: { createdAt: 'asc' },
    take: MAX_EXPORT_ROWS,
  }) as Record<string, unknown>[];
  const when = (date: unknown) => (date instanceof Date ? date.toLocaleString('ja-JP', { timeZone: settings.timezone ?? 'Asia/Tokyo' }) : '');
  const header = ['Placed', 'Order no.', 'Status', 'Type', 'Due', 'Customer', 'Member', 'Items', 'Subtotal', 'Offer discount', 'Stamp reward', 'Points used (¥)', 'Tax', 'Delivery fee', 'Paid (tax incl.)'];
  const lines = rows.map((order) =>
    [
      when(order.createdAt),
      order.number,
      order.status,
      order.fulfillment === 'DELIVERY' ? 'Delivery' : 'Pickup',
      when(order.pickupAt),
      order.customerName,
      order.customerId ? 'yes' : 'no',
      ((order.items ?? []) as { quantity: number; nameEn: string }[]).map((line) => `${line.quantity}x ${line.nameEn}`).join(' / '),
      order.subtotal ?? order.total,
      (order.offer as { discount?: number } | null)?.discount ?? 0,
      (order.reward as { discount?: number } | null)?.discount ?? 0,
      order.pointsDiscount ?? 0,
      order.tax ?? 0,
      order.deliveryFee ?? 0,
      paidAmount(order as unknown as OrderFact),
    ]
      .map(csvCell)
      .join(','),
  );
  const name = `adarsha-orders-${period.days[0]}_${period.days[period.days.length - 1]}.csv`;
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="${name}"`);
  res.setHeader('Cache-Control', 'no-store');
  res.send(`﻿${[header.join(','), ...lines].join('\r\n')}`);
});

export default router;
