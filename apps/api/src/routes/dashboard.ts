import crypto from 'node:crypto';
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
import { orderMatchesStore, resolveOrderStoreId } from '../lib/order-store.js';
import { prisma } from '../lib/prisma.js';
import { localDayStart, localDateKey } from '../lib/pickup.js';
import { stampConfig } from '../lib/stamps.js';
import { listPaymentDevices } from '../lib/payment-devices.js';
import { loadMultiRegisterState, getBranchState } from '../lib/cash-register-state.js';
import { requireAdmin, requireStaff } from '../middleware/auth.js';
import { loadSettings } from '../services/settings-store.js';
import { getStoredStores } from './stores.js';

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

const ORDER_STORE_SELECT = {
  note: true,
  items: true,
} as const;

function storeIdFromQuery(req: express.Request): string | null {
  const raw = typeof req.query.storeId === 'string' ? req.query.storeId.trim() : '';
  return raw && raw !== 'ALL' ? raw : null;
}

/** What needs attention right now. Optional ?storeId= scopes open/today/recent orders to one branch. */
router.get('/live', requireStaff, async (req, res) => {
  const settings = await loadSettings();
  const now = new Date();
  const todayStart = localDayStart(localDateKey(now, settings.timezone), settings.timezone);
  const storeId = storeIdFromQuery(req);
  const stores = await getStoredStores().catch(() => []);
  const storeRefs = stores.map(s => ({ id: s.id, name: s.name }));

  const [openRaw, todayRaw, recentRaw, unread, recentMessages, reservations, soldOut, menuCount, liveOffersCount, registerState, devices] = await Promise.all([
    db.pickupOrder.findMany({
      where: { status: { in: ACTIVE } },
      select: { status: true, pickupAt: true, number: true, customerName: true, ...ORDER_STORE_SELECT },
      orderBy: { pickupAt: 'asc' },
    }),
    db.pickupOrder.findMany({
      where: { createdAt: { gte: todayStart } },
      select: { status: true, grandTotal: true, total: true, ...ORDER_STORE_SELECT },
    }),
    db.pickupOrder.findMany({
      select: {
        id: true, number: true, status: true, fulfillment: true, customerName: true, customerId: true,
        grandTotal: true, total: true, createdAt: true, pickupAt: true, ...ORDER_STORE_SELECT,
      },
      orderBy: { createdAt: 'desc' },
      take: storeId ? 40 : RECENT_ORDERS,
    }),
    db.contactMessage.count({ where: { isRead: false } }),
    db.contactMessage.findMany({ select: { id: true, name: true, type: true, isRead: true, createdAt: true, date: true, guests: true }, orderBy: { createdAt: 'desc' }, take: RECENT_MESSAGES }),
    db.contactMessage.findMany({ where: { type: 'RESERVATION', date: { gte: todayStart } }, select: { id: true, name: true, date: true, guests: true, isRead: true, phone: true, message: true }, orderBy: { date: 'asc' }, take: UPCOMING_RESERVATIONS }),
    db.menuItem.findMany({ where: { isSoldOut: true }, select: { nameEn: true, nameJa: true }, take: SOLD_OUT_LIST }),
    db.menuItem.count(),
    db.offer.count({ where: { isActive: { not: false }, OR: [{ endsAt: null }, { endsAt: { gte: now } }] } }),
    loadMultiRegisterState().catch(() => null),
    listPaymentDevices({ storeId: storeId || undefined, activeOnly: true }).catch(() => []),
  ]) as [
    Record<string, unknown>[],
    Record<string, unknown>[],
    Record<string, unknown>[],
    number,
    Record<string, unknown>[],
    Record<string, unknown>[],
    Record<string, unknown>[],
    number,
    number,
    Awaited<ReturnType<typeof loadMultiRegisterState>> | null,
    Awaited<ReturnType<typeof listPaymentDevices>>,
  ];

  const open = openRaw.filter(o => orderMatchesStore(o, storeId, storeRefs));
  const todayOrders = todayRaw.filter(o => orderMatchesStore(o, storeId, storeRefs));
  const recentOrders = recentRaw
    .filter(o => orderMatchesStore(o, storeId, storeRefs))
    .slice(0, RECENT_ORDERS);

  const late = open.filter((o) => o.status !== 'READY' && (o.pickupAt as Date) < now);
  const completedToday = todayOrders.filter((o) => o.status === 'COMPLETED');
  const isAdmin = req.user?.role === 'ADMIN';
  const nextDue = open.find((o) => o.status !== 'READY');

  let register: { isOpen: boolean; openedAt?: string; openedBy?: string; startingFloat?: number } | null = null;
  if (storeId && registerState) {
    const branch = getBranchState(registerState, storeId);
    const shift = branch.currentShift;
    register = shift?.isOpen
      ? {
          isOpen: true,
          openedAt: shift.openedAt,
          openedBy: shift.openedBy,
          startingFloat: shift.startingFloat,
        }
      : { isOpen: false };
  }

  const scopedReservations = storeId
    ? reservations.filter(r => {
        const msg = typeof r.message === 'string' ? r.message : '';
        const store = stores.find(s => s.id === storeId);
        if (!store) return true;
        return msg.includes(store.name) || msg.includes(store.id) || msg.includes(store.name.replace(/^アダルサ\s*/, ''));
      })
    : reservations;

  res.setHeader('Cache-Control', 'no-store');
  res.json({
    serverTime: now,
    storeId: storeId || null,
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
    ordering: {
      ...fulfillmentOptions(settings),
      stampCard: stampConfig(settings).enabled,
      liveOffers: liveOffersCount,
      masterEnabled: settings.orderingEnabled !== false,
      switches: {
        orderingEnabled: settings.orderingEnabled !== false,
        pickupEnabled: Boolean(settings.pickupEnabled),
        deliveryEnabled: Boolean(settings.deliveryEnabled),
        dineInEnabled: Boolean((settings as { dineInEnabled?: boolean | null }).dineInEnabled),
      },
      maintenanceMode: Boolean((settings as { maintenanceMode?: boolean | null }).maintenanceMode),
      maintenanceMessageJa: String((settings as { maintenanceMessageJa?: string | null }).maintenanceMessageJa ?? ''),
      maintenanceMessageEn: String((settings as { maintenanceMessageEn?: string | null }).maintenanceMessageEn ?? ''),
    },
    register,
    devices: {
      active: devices.length,
      paired: devices.filter(d => d.provider !== 'SQUARE_TERMINAL' || Boolean(d.squareDeviceId)).length,
    },
    recentOrders: recentOrders.map(({ id, grandTotal, total, customerId, note: _n, items: _i, ...order }) => ({
      id,
      ...order,
      member: Boolean(customerId),
      amount: isAdmin ? ((grandTotal ?? total) as number | null) : null,
      storeId: resolveOrderStoreId({ note: _n, items: _i }, storeRefs),
    })),
    messages: { unread, recent: recentMessages.map(({ id: _id, ...msg }) => ({ id: _id, ...msg })) },
    reservations: scopedReservations.map(({ id: _id, ...r }) => ({ id: _id, ...r })),
    menu: { total: menuCount, soldOut: (soldOut as Record<string, unknown>[]).map((i) => i.nameJa || i.nameEn) },
  });
});

/** Per-branch snapshot for Overview "All branches" board. */
router.get('/branches', requireStaff, async (req, res) => {
  const settings = await loadSettings();
  const now = new Date();
  const todayStart = localDayStart(localDateKey(now, settings.timezone), settings.timezone);
  const stores = await getStoredStores().catch(() => []);
  const storeRefs = stores.map(s => ({ id: s.id, name: s.name }));
  const isAdmin = req.user?.role === 'ADMIN';

  const [openRaw, todayRaw, registerState, devices] = await Promise.all([
    db.pickupOrder.findMany({
      where: { status: { in: ACTIVE } },
      select: { status: true, pickupAt: true, ...ORDER_STORE_SELECT },
    }),
    db.pickupOrder.findMany({
      where: { createdAt: { gte: todayStart } },
      select: { status: true, grandTotal: true, total: true, ...ORDER_STORE_SELECT },
    }),
    loadMultiRegisterState().catch(() => null),
    listPaymentDevices({ activeOnly: true }).catch(() => []),
  ]) as [Record<string, unknown>[], Record<string, unknown>[], Awaited<ReturnType<typeof loadMultiRegisterState>> | null, Awaited<ReturnType<typeof listPaymentDevices>>];

  const branches = stores.map(store => {
    const open = openRaw.filter(o => orderMatchesStore(o, store.id, storeRefs));
    const today = todayRaw.filter(o => orderMatchesStore(o, store.id, storeRefs));
    const completed = today.filter(o => o.status === 'COMPLETED');
    const late = open.filter(o => o.status !== 'READY' && (o.pickupAt as Date) < now);
    const branch = registerState ? getBranchState(registerState, store.id) : null;
    const shift = branch?.currentShift;
    const storeDevices = devices.filter(d => !d.storeId || d.storeId === store.id);
    return {
      storeId: store.id,
      name: store.name,
      area: store.area,
      phone: store.phone,
      open: {
        NEW: open.filter(o => o.status === 'NEW').length,
        CONFIRMED: open.filter(o => o.status === 'CONFIRMED').length,
        READY: open.filter(o => o.status === 'READY').length,
        late: late.length,
        total: open.length,
      },
      today: {
        placed: today.filter(o => o.status !== 'CANCELLED').length,
        completed: completed.length,
        cancelled: today.filter(o => o.status === 'CANCELLED').length,
        sales: isAdmin ? completed.reduce((sum, o) => sum + paidAmount(o as unknown as OrderFact), 0) : null,
      },
      register: shift?.isOpen
        ? { isOpen: true, openedAt: shift.openedAt, openedBy: shift.openedBy }
        : { isOpen: false },
      devices: { active: storeDevices.length },
    };
  });

  res.setHeader('Cache-Control', 'no-store');
  res.json({ serverTime: now, branches });
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
  else if (!settings.pickupEnabled && !settings.deliveryEnabled && !(settings as { dineInEnabled?: boolean }).dineInEnabled) {
    notes.push({ id: 'ordering-off', tone: 'info', title: 'Online ordering is off', detail: 'Pickup, delivery and dine-in are all switched off', tab: 'Orders' });
  }
  if ((settings as { maintenanceMode?: boolean }).maintenanceMode) {
    notes.push({ id: 'maintenance', tone: 'warning', title: 'Site is in maintenance mode', detail: 'Visitors see a maintenance banner', tab: 'Overview' });
  }
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

/** Sales, orders, customers and loyalty for a period, with the previous period for comparison. Optional ?storeId=. */
router.get('/analytics', requireAdmin, async (req, res) => {
  const { settings, period } = await periodFrom(req.query);
  const tz = settings.timezone;
  const inPeriod = { gte: period.start, lt: period.end };
  const storeId = storeIdFromQuery(req);
  const stores = await getStoredStores().catch(() => []);
  const storeRefs = stores.map(s => ({ id: s.id, name: s.name }));

  const ORDER_SELECT = {
    number: true, status: true, fulfillment: true, createdAt: true, pickupAt: true, confirmedAt: true,
    readyAt: true, customerId: true, customerName: true, subtotal: true, total: true, tax: true,
    grandTotal: true, deliveryFee: true, pointsDiscount: true, offer: true, reward: true, items: true,
    note: true,
  };

  const [currentAll, previousAll, membersTotal, newMembers, previousNewMembers, newsletter, pointsGroups, stampsCount, rewardsEarnedCount, rewardsUsedCount, messageGroups, outstanding] = await Promise.all([
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

  const current = (currentAll as OrderFact[]).filter(o =>
    orderMatchesStore(o as unknown as Record<string, unknown>, storeId, storeRefs),
  );
  const previous = (previousAll as OrderFact[]).filter(o =>
    orderMatchesStore(o as unknown as Record<string, unknown>, storeId, storeRefs),
  );

  // Returning members: had a completed order before this period, and ordered again in it.
  const buyerIds = [...new Set(current.filter((o) => o.status === 'COMPLETED' && o.customerId).map((o) => String(o.customerId)))];
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

  const byStore = !storeId
    ? storeRefs.map(s => {
        const orders = (currentAll as OrderFact[]).filter(o =>
          orderMatchesStore(o as unknown as Record<string, unknown>, s.id, storeRefs),
        );
        const h = headline(orders as unknown as OrderFact[]);
        return { storeId: s.id, name: s.name, sales: h.sales, orders: h.orders, averageOrder: h.averageOrder };
      })
    : undefined;

  res.setHeader('Cache-Control', 'no-store');
  res.json({
    period: { range: period.range, start: period.start, end: period.end, previousStart: period.previousStart, bucket: period.bucket, days: period.days, timezone: tz ?? 'Asia/Tokyo' },
    storeId: storeId || null,
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
    byStore,
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
  number: true,
  status: true,
  fulfillment: true,
  createdAt: true,
  pickupAt: true,
  confirmedAt: true,
  readyAt: true,
  customerId: true,
  customerName: true,
  note: true,
  subtotal: true,
  total: true,
  tax: true,
  taxRate: true,
  grandTotal: true,
  deliveryFee: true,
  pointsDiscount: true,
  offer: true,
  reward: true,
  items: true,
  phone: true,
};

type OrderExportRow = {
  number: number;
  status: string;
  fulfillment: 'PICKUP' | 'DELIVERY' | 'DINE_IN' | string;
  createdAt: string;
  pickupAt: string;
  customerName: string;
  member: boolean;
  phone: string | null;
  tableNumber: string | null;
  items: string;
  itemCount: number;
  subtotal: number;
  offerDiscount: number;
  rewardDiscount: number;
  pointsDiscount: number;
  tax: number;
  taxRate: number | null;
  deliveryFee: number;
  paid: number;
};

function extractTableFromNote(note: unknown): string | null {
  if (typeof note !== 'string' || !note) return null;
  const match = note.match(/\[テーブル[:\s]*([^\]]+)\]/);
  return match?.[1]?.trim() || null;
}

async function loadOrderExport(reqQuery: unknown) {
  const { settings, period } = await periodFrom(reqQuery);
  const q = (reqQuery && typeof reqQuery === 'object' ? reqQuery : {}) as Record<string, unknown>;
  const storeId =
    typeof q.storeId === 'string' && q.storeId.trim() && q.storeId !== 'ALL' ? q.storeId.trim() : null;
  const stores = await getStoredStores().catch(() => []);
  const storeRefs = stores.map(s => ({ id: s.id, name: s.name }));
  const rowsAll = await db.pickupOrder.findMany({
    where: { createdAt: { gte: period.start, lt: period.end } },
    select: ORDER_CSV_SELECT,
    orderBy: { createdAt: 'asc' },
    take: MAX_EXPORT_ROWS,
  }) as Record<string, unknown>[];
  const rows = storeId ? rowsAll.filter(o => orderMatchesStore(o, storeId, storeRefs)) : rowsAll;
  const tz = settings.timezone ?? 'Asia/Tokyo';
  const whenIso = (date: unknown) => (date instanceof Date ? date.toISOString() : '');
  const orders: OrderExportRow[] = rows.map((order) => {
    const lines = (order.items ?? []) as { quantity: number; nameEn?: string; nameJa?: string }[];
    const itemCount = lines.reduce((sum, line) => sum + (Number(line.quantity) || 0), 0);
    return {
      number: Number(order.number),
      status: String(order.status ?? ''),
      fulfillment: String(order.fulfillment ?? 'PICKUP'),
      createdAt: whenIso(order.createdAt),
      pickupAt: whenIso(order.pickupAt),
      customerName: String(order.customerName ?? ''),
      member: Boolean(order.customerId),
      phone: order.phone ? String(order.phone) : null,
      tableNumber: extractTableFromNote(order.note),
      items: lines.map((line) => `${line.quantity}×${line.nameJa || line.nameEn || 'item'}`).join('、'),
      itemCount,
      subtotal: Number(order.subtotal ?? order.total ?? 0),
      offerDiscount: Number((order.offer as { discount?: number } | null)?.discount ?? 0),
      rewardDiscount: Number((order.reward as { discount?: number } | null)?.discount ?? 0),
      pointsDiscount: Number(order.pointsDiscount ?? 0),
      tax: Number(order.tax ?? 0),
      taxRate: order.taxRate == null ? null : Number(order.taxRate),
      deliveryFee: Number(order.deliveryFee ?? 0),
      paid: paidAmount(order as unknown as OrderFact),
    };
  });
  const completed = orders.filter((o) => o.status === 'COMPLETED');
  const cancelled = orders.filter((o) => o.status === 'CANCELLED');
  const byType = {
    pickup: orders.filter((o) => o.fulfillment === 'PICKUP').length,
    delivery: orders.filter((o) => o.fulfillment === 'DELIVERY').length,
    dineIn: orders.filter((o) => o.fulfillment === 'DINE_IN').length,
  };

  /** Consumption-tax buckets for Japanese invoice / bookkeeping (軽減8% / 標準10%). */
  const taxBuckets = { rate8: { count: 0, exclusive: 0, tax: 0, inclusive: 0 }, rate10: { count: 0, exclusive: 0, tax: 0, inclusive: 0 } };
  for (const order of completed) {
    const rate =
      order.taxRate === 10 || order.taxRate === 8
        ? order.taxRate
        : order.fulfillment === 'DINE_IN' || order.deliveryFee > 0
          ? 10
          : 8;
    const inclusive = order.paid;
    const tax =
      order.tax > 0
        ? order.tax
        : Math.floor((inclusive * rate) / (100 + rate));
    const exclusive = Math.max(0, inclusive - tax);
    const bucket = rate === 10 ? taxBuckets.rate10 : taxBuckets.rate8;
    bucket.count += 1;
    bucket.exclusive += exclusive;
    bucket.tax += tax;
    bucket.inclusive += inclusive;
  }

  const s = settings as {
    name?: string | null;
    addressJa?: string | null;
    phone?: string | null;
    email?: string | null;
  };

  return {
    settings,
    period,
    restaurantName: String(s.name || '本格インド料理 アダルサ'),
    addressJa: String(s.addressJa || ''),
    phone: String(s.phone || ''),
    email: String(s.email || ''),
    timezone: tz,
    orders,
    summary: {
      totalOrders: orders.length,
      completed: completed.length,
      cancelled: cancelled.length,
      sales: completed.reduce((sum, o) => sum + o.paid, 0),
      tax: completed.reduce((sum, o) => sum + o.tax, 0),
      exclusive: taxBuckets.rate8.exclusive + taxBuckets.rate10.exclusive,
      averageOrder: completed.length
        ? Math.round(completed.reduce((sum, o) => sum + o.paid, 0) / completed.length)
        : 0,
      byType,
      taxBuckets,
    },
  };
}

/** Structured orders for PDF / spreadsheet clients. */
router.get('/analytics/orders', requireAdmin, async (req, res) => {
  const data = await loadOrderExport(req.query);
  res.setHeader('Cache-Control', 'no-store');
  res.json({
    restaurantName: data.restaurantName,
    addressJa: data.addressJa,
    phone: data.phone,
    email: data.email,
    timezone: data.timezone,
    period: {
      range: data.period.range,
      start: data.period.start,
      end: data.period.end,
      days: data.period.days,
    },
    summary: data.summary,
    orders: data.orders,
    generatedAt: new Date().toISOString(),
  });
});

/** Every order in the period as a spreadsheet (legacy). */
router.get('/analytics/orders.csv', requireAdmin, async (req, res) => {
  const data = await loadOrderExport(req.query);
  const header = ['Placed', 'Order no.', 'Status', 'Type', 'Due', 'Customer', 'Member', 'Items', 'Subtotal', 'Offer discount', 'Stamp reward', 'Points used (¥)', 'Tax', 'Delivery fee', 'Paid (tax incl.)'];
  const lines = data.orders.map((order) =>
    [
      order.createdAt,
      order.number,
      order.status,
      order.fulfillment,
      order.pickupAt,
      order.customerName,
      order.member ? 'yes' : 'no',
      order.items,
      order.subtotal,
      order.offerDiscount,
      order.rewardDiscount,
      order.pointsDiscount,
      order.tax,
      order.deliveryFee,
      order.paid,
    ]
      .map(csvCell)
      .join(','),
  );
  const name = `adarsha-orders-${data.period.days[0]}_${data.period.days[data.period.days.length - 1]}.csv`;
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="${name}"`);
  res.setHeader('Cache-Control', 'no-store');
  res.send(`﻿${[header.join(','), ...lines].join('\r\n')}`);
});

// ── Full configuration backup (export / import) ─────────────────────────────

const BACKUP_SECRET_IDS = [
  'PAGE_SETTINGS_EXT',
  'PAYMENT_RECEIVING_DEVICES',
  'PAYMENT_GATEWAYS',
  'LINE_BOT_CONFIG',
  'MINI_GAME_CONFIG',
] as const;

const SECRET_STRIP_KEYS = new Set([
  'channelSecret',
  'channelAccessToken',
  'accessToken',
  'secret',
  'privateKey',
  'webhookSecret',
  'apiKey',
]);

function stripSecrets(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stripSecrets);
  if (!value || typeof value !== 'object') return value;
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
    if (SECRET_STRIP_KEYS.has(k)) continue;
    out[k] = stripSecrets(v);
  }
  return out;
}

const importSchema = z.object({
  version: z.number().int().optional(),
  exportedAt: z.string().optional(),
  sections: z
    .object({
      settings: z.boolean().optional(),
      pageExt: z.boolean().optional(),
      categories: z.boolean().optional(),
      menuItems: z.boolean().optional(),
      offers: z.boolean().optional(),
      carousels: z.boolean().optional(),
      secrets: z.boolean().optional(),
    })
    .optional(),
  data: z.object({
    settings: z.record(z.string(), z.unknown()).optional().nullable(),
    pageExt: z.record(z.string(), z.unknown()).optional().nullable(),
    categories: z.array(z.record(z.string(), z.unknown())).optional(),
    menuItems: z.array(z.record(z.string(), z.unknown())).optional(),
    offers: z.array(z.record(z.string(), z.unknown())).optional(),
    carousels: z.array(z.record(z.string(), z.unknown())).optional(),
    secrets: z.record(z.string(), z.unknown()).optional(),
  }),
});

/** Snapshot of restaurant config (settings, menu, offers, carousels, AppSecret configs). No customer/order PII. */
router.get('/export', requireAdmin, async (_req, res) => {
  const [settingsRow, categories, menuItems, offers, carousels, secretRows] = await Promise.all([
    prisma.settings.findFirst(),
    prisma.category.findMany({ orderBy: { sortOrder: 'asc' } }),
    prisma.menuItem.findMany({ orderBy: [{ categoryId: 'asc' }, { sortOrder: 'asc' }] }),
    db.offer.findMany({ orderBy: { createdAt: 'desc' } }),
    db.carouselSlide.findMany({ orderBy: { sortOrder: 'asc' } }),
    prisma.appSecret.findMany({ where: { id: { in: [...BACKUP_SECRET_IDS] } } }),
  ]);

  const secrets: Record<string, unknown> = {};
  let pageExt: Record<string, unknown> = {};
  for (const row of secretRows) {
    let parsed: unknown = null;
    try {
      parsed = row.publicKey ? JSON.parse(row.publicKey) : null;
    } catch {
      parsed = null;
    }
    const cleaned = stripSecrets(parsed);
    secrets[row.id] = cleaned;
    if (row.id === 'PAGE_SETTINGS_EXT' && cleaned && typeof cleaned === 'object') {
      pageExt = cleaned as Record<string, unknown>;
    }
  }

  const settingsPlain = settingsRow
    ? stripSecrets({ ...(settingsRow as unknown as Record<string, unknown>) })
    : null;

  const payload = {
    version: 1,
    exportedAt: new Date().toISOString(),
    app: 'adarsha',
    data: {
      settings: settingsPlain,
      pageExt,
      categories,
      menuItems,
      offers,
      carousels,
      secrets,
    },
  };

  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="adarsha-backup-${localDateKey(new Date(), 'Asia/Tokyo')}.json"`);
  res.setHeader('Cache-Control', 'no-store');
  res.json(payload);
});

/** Restore selected sections from a previously exported backup. */
router.post('/import', requireAdmin, async (req, res) => {
  const body = importSchema.parse(req.body);
  const sections = {
    settings: body.sections?.settings !== false,
    pageExt: body.sections?.pageExt !== false,
    categories: body.sections?.categories === true,
    menuItems: body.sections?.menuItems === true,
    offers: body.sections?.offers === true,
    carousels: body.sections?.carousels === true,
    secrets: body.sections?.secrets === true,
  };
  const data = body.data;
  const result: Record<string, number | string | boolean> = { ok: true };

  if (sections.settings && data.settings && typeof data.settings === 'object') {
    const existing = await prisma.settings.findFirst();
    const raw = { ...(data.settings as Record<string, unknown>) };
    delete raw.id;
    // Keep only columns that already exist on Settings (avoids EXT / unknown keys).
    const allowed = existing
      ? new Set(Object.keys(existing as object))
      : new Set(Object.keys(raw));
    const prismaData: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(raw)) {
      if (!allowed.has(k) || k === 'id') continue;
      prismaData[k] = v;
    }
    if (existing) {
      await db.settings.update({ where: { id: existing.id }, data: prismaData });
    } else {
      await db.settings.create({ data: { id: crypto.randomUUID(), ...prismaData } });
    }
    result.settings = 1;
  }

  if (sections.pageExt && data.pageExt && typeof data.pageExt === 'object') {
    const cleaned = stripSecrets(data.pageExt);
    await prisma.appSecret.upsert({
      where: { id: 'PAGE_SETTINGS_EXT' },
      create: { id: 'PAGE_SETTINGS_EXT', publicKey: JSON.stringify(cleaned), privateKey: '' },
      update: { publicKey: JSON.stringify(cleaned) },
    });
    result.pageExt = 1;
  }

  if (sections.secrets && data.secrets && typeof data.secrets === 'object') {
    let n = 0;
    for (const [id, value] of Object.entries(data.secrets)) {
      if (!BACKUP_SECRET_IDS.includes(id as (typeof BACKUP_SECRET_IDS)[number])) continue;
      if (id === 'PAGE_SETTINGS_EXT' && sections.pageExt) continue;
      const cleaned = stripSecrets(value);
      await prisma.appSecret.upsert({
        where: { id },
        create: { id, publicKey: JSON.stringify(cleaned ?? {}), privateKey: '' },
        update: { publicKey: JSON.stringify(cleaned ?? {}) },
      });
      n += 1;
    }
    result.secrets = n;
  }

  const dropRelations = (row: Record<string, unknown>, extra: string[] = []) => {
    const next = { ...row };
    for (const key of ['category', 'variants', 'optionGroups', 'parent', 'subCategories', 'menus', 'items', ...extra]) {
      delete next[key];
    }
    delete next.id;
    return next;
  };

  if (sections.categories && Array.isArray(data.categories)) {
    let n = 0;
    for (const cat of data.categories) {
      const id = typeof cat.id === 'string' ? cat.id : null;
      if (!id) continue;
      const rest = dropRelations(cat);
      try {
        await db.category.upsert({ where: { id }, create: { id, ...rest }, update: rest });
        n += 1;
      } catch (err) {
        console.warn('category import skipped', id, err);
      }
    }
    result.categories = n;
  }

  if (sections.menuItems && Array.isArray(data.menuItems)) {
    let n = 0;
    for (const item of data.menuItems) {
      const id = typeof item.id === 'string' ? item.id : null;
      if (!id) continue;
      const rest = dropRelations(item);
      try {
        await db.menuItem.upsert({ where: { id }, create: { id, ...rest }, update: rest });
        n += 1;
      } catch (err) {
        console.warn('menuItem import skipped', id, err);
      }
    }
    result.menuItems = n;
  }

  if (sections.offers && Array.isArray(data.offers)) {
    let n = 0;
    for (const offer of data.offers) {
      const id = typeof offer.id === 'string' ? offer.id : null;
      if (!id) continue;
      const rest = dropRelations(offer);
      try {
        await db.offer.upsert({ where: { id }, create: { id, ...rest }, update: rest });
        n += 1;
      } catch (err) {
        console.warn('offer import skipped', id, err);
      }
    }
    result.offers = n;
  }

  if (sections.carousels && Array.isArray(data.carousels)) {
    let n = 0;
    for (const slide of data.carousels) {
      const id = typeof slide.id === 'string' ? slide.id : null;
      if (!id) continue;
      const rest = dropRelations(slide);
      try {
        await db.carouselSlide.upsert({ where: { id }, create: { id, ...rest }, update: rest });
        n += 1;
      } catch (err) {
        console.warn('carousel import skipped', id, err);
      }
    }
    result.carousels = n;
  }

  await prisma.auditLog.create({
    data: {
      userId: req.user!.id,
      action: 'dashboard.import',
      entity: 'Backup',
      entityId: 'config',
      diff: { sections, counts: result },
    },
  }).catch(() => undefined);

  res.json({ success: true, imported: result });
});

export default router;
