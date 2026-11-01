import { localDateKey, localDayStart, localHourAndWeekday } from './pickup.js';

// Business analytics for the admin overview. Pure functions only (no req/res, no database), so the
// figures can be tested and always agree with each other.

export const RANGES = ['today', 'yesterday', '7d', '30d', '90d', 'month', 'custom'] as const;
export type Range = (typeof RANGES)[number];
export const MAX_CUSTOM_DAYS = 366;

export interface Period {
  range: Range;
  start: Date;
  end: Date;
  /** The same length of time just before, for "vs previous period". */
  previousStart: Date;
  previousEnd: Date;
  /** Hourly buckets for a single day, daily otherwise. */
  bucket: 'hour' | 'day';
  /** Local date keys (YYYY-MM-DD) in the period, oldest first. */
  days: string[];
}

const DAY_RANGE: Partial<Record<Range, number>> = { '7d': 7, '30d': 30, '90d': 90 };

function daysBetween(fromKey: string, toKey: string): number {
  return Math.round((Date.parse(`${toKey}T00:00:00Z`) - Date.parse(`${fromKey}T00:00:00Z`)) / 86_400_000);
}

function keyPlus(key: string, days: number): string {
  const date = new Date(Date.parse(`${key}T00:00:00Z`) + days * 86_400_000);
  return date.toISOString().slice(0, 10);
}

/** The period a range covers, in the restaurant's timezone. "7d" means the last 7 days including today. */
export function periodFor(range: Range, timeZone: string | null | undefined, now: Date = new Date(), custom?: { from: string; to: string }): Period {
  const today = localDateKey(now, timeZone);
  let firstKey: string;
  let lastKey: string;
  if (range === 'today') firstKey = lastKey = today;
  else if (range === 'yesterday') firstKey = lastKey = keyPlus(today, -1);
  else if (range === 'month') {
    firstKey = `${today.slice(0, 8)}01`;
    lastKey = today;
  } else if (range === 'custom' && custom) {
    [firstKey, lastKey] = custom.from <= custom.to ? [custom.from, custom.to] : [custom.to, custom.from];
    if (daysBetween(firstKey, lastKey) >= MAX_CUSTOM_DAYS) firstKey = keyPlus(lastKey, -(MAX_CUSTOM_DAYS - 1));
  } else {
    const length = DAY_RANGE[range] ?? 7;
    firstKey = keyPlus(today, -(length - 1));
    lastKey = today;
  }
  const length = daysBetween(firstKey, lastKey) + 1;
  const start = localDayStart(firstKey, timeZone);
  const end = localDayStart(lastKey, timeZone, 1);
  return {
    range,
    start,
    end,
    previousStart: localDayStart(firstKey, timeZone, -length),
    previousEnd: start,
    bucket: length === 1 ? 'hour' : 'day',
    days: Array.from({ length }, (_, i) => keyPlus(firstKey, i)),
  };
}

export interface OrderFact {
  status: string;
  fulfillment?: string | null;
  createdAt: Date;
  pickupAt?: Date | null;
  confirmedAt?: Date | null;
  readyAt?: Date | null;
  customerId?: { toString(): string } | null;
  total?: number | null;
  tax?: number | null;
  grandTotal?: number | null;
  deliveryFee?: number | null;
  subtotal?: number | null;
  pointsDiscount?: number | null;
  offer?: { titleJa?: string; discount?: number } | null;
  reward?: { titleJa?: string; discount?: number } | null;
  items?: { itemId?: { toString(): string }; nameEn?: string; nameJa?: string | null; quantity?: number; lineTotal?: number }[];
}

/** What the customer paid, tax and delivery included (older orders without tax fall back to the total). */
export const paidAmount = (order: OrderFact) => Number(order.grandTotal ?? order.total) || 0;

const share = (part: number, whole: number) => (whole > 0 ? part / whole : null);
const average = (values: number[]) => (values.length ? values.reduce((a, b) => a + b, 0) / values.length : null);

export interface Headline {
  sales: number;
  orders: number;
  averageOrder: number | null;
  itemsSold: number;
  cancelled: number;
  /** Cancelled orders out of all orders placed (0-1). */
  cancelRate: number | null;
  /** Minutes from accepting an order to marking it ready. */
  averagePrepMinutes: number | null;
  /** Orders ready by their pickup / delivery time (0-1). */
  onTimeRate: number | null;
  discounts: number;
  deliveryFees: number;
  memberOrders: number;
  /** Completed orders placed by members (0-1). */
  memberShare: number | null;
}

/** The headline numbers for a set of orders placed in one period. Sales count completed orders only. */
export function headline(orders: OrderFact[]): Headline {
  const completed = orders.filter((order) => order.status === 'COMPLETED');
  const cancelled = orders.filter((order) => order.status === 'CANCELLED').length;
  const sales = completed.reduce((sum, order) => sum + paidAmount(order), 0);
  const prepared = orders.filter((order) => order.confirmedAt && order.readyAt);
  const timed = orders.filter((order) => order.readyAt && order.pickupAt);
  const memberOrders = completed.filter((order) => order.customerId).length;
  return {
    sales,
    orders: completed.length,
    averageOrder: completed.length ? Math.round(sales / completed.length) : null,
    itemsSold: completed.reduce((sum, order) => sum + (order.items ?? []).reduce((n, line) => n + (Number(line.quantity) || 0), 0), 0),
    cancelled,
    cancelRate: share(cancelled, orders.length),
    averagePrepMinutes: (() => {
      const value = average(prepared.map((order) => (order.readyAt!.getTime() - order.confirmedAt!.getTime()) / 60_000));
      return value === null ? null : Math.round(value * 10) / 10;
    })(),
    onTimeRate: share(timed.filter((order) => order.readyAt! <= order.pickupAt!).length, timed.length),
    discounts: completed.reduce((sum, order) => sum + (order.offer?.discount ?? 0) + (order.reward?.discount ?? 0) + (Number(order.pointsDiscount) || 0), 0),
    deliveryFees: completed.reduce((sum, order) => sum + (Number(order.deliveryFee) || 0), 0),
    memberOrders,
    memberShare: share(memberOrders, completed.length),
  };
}

/** Sales and order counts per hour (single day) or per day, every bucket present even when empty. */
export function salesSeries(orders: OrderFact[], period: Period, timeZone: string | null | undefined) {
  const keys = period.bucket === 'hour' ? Array.from({ length: 24 }, (_, hour) => String(hour)) : period.days;
  const buckets = new Map(keys.map((key) => [key, { key, sales: 0, orders: 0, cancelled: 0 }]));
  for (const order of orders) {
    if (order.createdAt < period.start || order.createdAt >= period.end) continue;
    const key = period.bucket === 'hour' ? String(localHourAndWeekday(order.createdAt, timeZone).hour) : localDateKey(order.createdAt, timeZone);
    const bucket = buckets.get(key);
    if (!bucket) continue;
    if (order.status === 'COMPLETED') {
      bucket.sales += paidAmount(order);
      bucket.orders += 1;
    } else if (order.status === 'CANCELLED') bucket.cancelled += 1;
  }
  return [...buckets.values()];
}

/** Orders placed (not cancelled) by weekday × hour, for staffing: rows Sunday-Saturday, columns 0-23. */
export function busyHours(orders: OrderFact[], timeZone: string | null | undefined): number[][] {
  const grid = Array.from({ length: 7 }, () => Array.from({ length: 24 }, () => 0));
  for (const order of orders) {
    if (order.status === 'CANCELLED') continue;
    const { weekday, hour } = localHourAndWeekday(order.createdAt, timeZone);
    grid[weekday][hour] += 1;
  }
  return grid;
}

/** Best sellers among completed orders, by quantity. */
export function topItems(orders: OrderFact[], limit = 10) {
  const items = new Map<string, { nameEn: string; nameJa: string | null; quantity: number; sales: number; orders: number }>();
  for (const order of orders) {
    if (order.status !== 'COMPLETED') continue;
    for (const line of order.items ?? []) {
      const key = String(line.itemId ?? line.nameEn);
      const entry = items.get(key) ?? { nameEn: line.nameEn ?? '', nameJa: line.nameJa ?? null, quantity: 0, sales: 0, orders: 0 };
      entry.quantity += Number(line.quantity) || 0;
      entry.sales += Number(line.lineTotal) || 0;
      entry.orders += 1;
      items.set(key, entry);
    }
  }
  return [...items.values()].sort((a, b) => b.quantity - a.quantity || b.sales - a.sales).slice(0, limit);
}

/** Pickup vs delivery vs dine-in among completed orders. */
export function fulfillmentSplit(orders: OrderFact[]) {
  const split = { PICKUP: { orders: 0, sales: 0 }, DELIVERY: { orders: 0, sales: 0 }, DINE_IN: { orders: 0, sales: 0 } };
  for (const order of orders) {
    if (order.status !== 'COMPLETED') continue;
    const type = order.fulfillment === 'DELIVERY' ? 'DELIVERY' : order.fulfillment === 'DINE_IN' ? 'DINE_IN' : 'PICKUP';
    split[type].orders += 1;
    split[type].sales += paidAmount(order);
  }
  return split;
}

/** How often each offer and stamp reward was used on completed orders. */
export function promotionUse(orders: OrderFact[]) {
  const offers = new Map<string, { title: string; uses: number; discount: number }>();
  const add = (kind: string, title: string | undefined, discount: number | undefined) => {
    if (!title) return;
    const key = `${kind}:${title}`;
    const entry = offers.get(key) ?? { title: kind === 'reward' ? `スタンプ: ${title}` : title, uses: 0, discount: 0 };
    entry.uses += 1;
    entry.discount += discount ?? 0;
    offers.set(key, entry);
  };
  for (const order of orders) {
    if (order.status !== 'COMPLETED') continue;
    add('offer', order.offer?.titleJa, order.offer?.discount);
    add('reward', order.reward?.titleJa, order.reward?.discount);
  }
  return [...offers.values()].sort((a, b) => b.uses - a.uses);
}

/** Change from the previous period, as a fraction (0.12 = +12%); null when there is nothing to compare with. */
export function change(current: number | null, previous: number | null): number | null {
  if (current === null || previous === null || previous === 0) return null;
  return (current - previous) / previous;
}
