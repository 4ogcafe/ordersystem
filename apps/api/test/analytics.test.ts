import bcrypt from 'bcryptjs';
import { ObjectId } from 'mongodb';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { busyHours, change, headline, periodFor, salesSeries, topItems, type OrderFact } from '../src/lib/analytics.js';
import { createApp } from '../src/app.js';
import { closeMongo, db } from '../src/lib/mongo.js';
import { prisma } from '../src/lib/prisma.js';

const TZ = 'Asia/Tokyo';
// 2026-10-14 15:00 in Tokyo.
const NOW = new Date('2026-10-14T06:00:00Z');
const at = (iso: string) => new Date(iso);

const order = (overrides: Partial<OrderFact>): OrderFact => ({
  status: 'COMPLETED',
  createdAt: at('2026-10-14T03:00:00Z'), // 12:00 Tokyo
  total: 1000,
  tax: 80,
  grandTotal: 1080,
  items: [{ itemId: 'curry', nameEn: 'Curry', quantity: 1, lineTotal: 1000 }],
  ...overrides,
});

describe('periods', () => {
  it('uses restaurant-local days and the same length before for comparison', () => {
    const today = periodFor('today', TZ, NOW);
    expect(today.start.toISOString()).toBe('2026-10-13T15:00:00.000Z'); // midnight Tokyo
    expect(today.end.toISOString()).toBe('2026-10-14T15:00:00.000Z');
    expect(today.previousStart.toISOString()).toBe('2026-10-12T15:00:00.000Z');
    expect(today.bucket).toBe('hour');

    const week = periodFor('7d', TZ, NOW);
    expect(week.days).toEqual(['2026-10-08', '2026-10-09', '2026-10-10', '2026-10-11', '2026-10-12', '2026-10-13', '2026-10-14']);
    expect(week.bucket).toBe('day');
    expect(week.previousEnd).toEqual(week.start);

    expect(periodFor('month', TZ, NOW).days[0]).toBe('2026-10-01');
    expect(periodFor('custom', TZ, NOW, { from: '2026-10-05', to: '2026-10-01' }).days).toHaveLength(5);
    expect(periodFor('custom', TZ, NOW, { from: '2020-01-01', to: '2026-10-14' }).days).toHaveLength(366);
  });
});

describe('headline figures', () => {
  it('counts sales from completed orders, with cancellations, prep time and discounts', () => {
    const facts = [
      order({ customerId: 'm1', offer: { titleJa: '300円引き', discount: 300 }, pointsDiscount: 50 }),
      order({ grandTotal: 2160, fulfillment: 'DELIVERY', deliveryFee: 300, confirmedAt: at('2026-10-14T03:00:00Z'), readyAt: at('2026-10-14T03:20:00Z'), pickupAt: at('2026-10-14T03:30:00Z') }),
      order({ status: 'CANCELLED' }),
      order({ status: 'NEW', confirmedAt: at('2026-10-14T03:00:00Z'), readyAt: at('2026-10-14T03:10:00Z'), pickupAt: at('2026-10-14T03:05:00Z') }),
    ];
    expect(headline(facts)).toMatchObject({
      sales: 3240,
      orders: 2,
      averageOrder: 1620,
      itemsSold: 2,
      cancelled: 1,
      cancelRate: 0.25,
      averagePrepMinutes: 15,
      onTimeRate: 0.5,
      discounts: 350,
      deliveryFees: 300,
      memberOrders: 1,
      memberShare: 0.5,
    });
    expect(headline([])).toMatchObject({ sales: 0, averageOrder: null, cancelRate: null, averagePrepMinutes: null });
  });

  it('buckets by hour for one day and by day otherwise, keeping empty buckets', () => {
    const facts = [order({}), order({ createdAt: at('2026-10-13T03:00:00Z') }), order({ status: 'CANCELLED' })];
    const hourly = salesSeries(facts, periodFor('today', TZ, NOW), TZ);
    expect(hourly).toHaveLength(24);
    expect(hourly[12]).toMatchObject({ sales: 1080, orders: 1, cancelled: 1 });
    const daily = salesSeries(facts, periodFor('7d', TZ, NOW), TZ);
    expect(daily.map((d) => d.orders)).toEqual([0, 0, 0, 0, 0, 1, 1]);
  });

  it('finds busy hours and best sellers', () => {
    const facts = [order({}), order({ items: [{ itemId: 'naan', nameEn: 'Naan', quantity: 3, lineTotal: 900 }] }), order({ status: 'CANCELLED' })];
    expect(busyHours(facts, TZ)[3][12]).toBe(2); // Wednesday, 12:00
    expect(topItems(facts).map((item) => item.nameEn)).toEqual(['Naan', 'Curry']);
  });

  it('compares with the previous period', () => {
    expect(change(120, 100)).toBeCloseTo(0.2);
    expect(change(5, 0)).toBeNull();
    expect(change(null, 3)).toBeNull();
  });
});

describe('dashboard endpoints', () => {
  const app = createApp();
  const PASSWORD = 'correct horse battery staple';
  let adminCookie: string[];
  let staffCookie: string[];
  const cookieOf = (res: request.Response) => res.headers['set-cookie'] as unknown as string[];

  beforeAll(async () => {
    await db().dropDatabase();
    const now = new Date();
    const hash = await bcrypt.hash(PASSWORD, 4);
    await db().collection('User').insertMany([
      { _id: new ObjectId(), email: 'admin@test.local', name: 'Admin', role: 'ADMIN', isActive: true, passwordHash: hash, createdAt: now, updatedAt: now },
      { _id: new ObjectId(), email: 'staff@test.local', name: 'Staff', role: 'STAFF', isActive: true, passwordHash: hash, createdAt: now, updatedAt: now },
    ]);
    adminCookie = cookieOf(await request(app).post('/api/v1/auth/login').send({ email: 'admin@test.local', password: PASSWORD }));
    staffCookie = cookieOf(await request(app).post('/api/v1/auth/login').send({ email: 'staff@test.local', password: PASSWORD }));
    const base = { dateKey: 'x', token: 'x', phone: '0', pickupAt: now, items: [{ itemId: new ObjectId(), nameEn: 'Curry', nameJa: 'カレー', quantity: 2, lineTotal: 2000 }], total: 2000, tax: 160, grandTotal: 2160, createdAt: now, updatedAt: now };
    await db().collection('PickupOrder').insertMany([
      { ...base, _id: new ObjectId(), number: 1, status: 'COMPLETED', customerName: '=HYPERLINK("x")' },
      { ...base, _id: new ObjectId(), number: 2, status: 'NEW', customerName: 'Hanako', pickupAt: new Date(Date.now() - 60_000) },
    ]);
  });

  afterAll(async () => {
    await db().dropDatabase();
    await Promise.all([closeMongo(), prisma.$disconnect()]);
  });

  it('gives admins analytics for a period', async () => {
    const res = await request(app).get('/api/v1/dashboard/analytics?range=today').set('Cookie', adminCookie).expect(200);
    expect(res.body.headline).toMatchObject({ sales: 2160, orders: 1, itemsSold: 2 });
    expect(res.body.series).toHaveLength(24);
    expect(res.body.topItems[0]).toMatchObject({ nameEn: 'Curry', quantity: 2 });
    expect((await request(app).get('/api/v1/dashboard/analytics?range=custom').set('Cookie', adminCookie)).status).toBe(400);
  });

  it('exports orders as a spreadsheet that is safe to open', async () => {
    const res = await request(app).get('/api/v1/dashboard/analytics/orders.csv?range=today').set('Cookie', adminCookie).expect(200);
    expect(res.headers['content-type']).toContain('text/csv');
    expect(res.text).toContain(`"'=HYPERLINK(""x"")"`);
  });

  it('searches orders, dishes and members, hiding members and messages from staff', async () => {
    await db().collection('Customer').insertOne({ _id: new ObjectId(), name: 'Hanako Search', email: 'hanako@search.test', phone: '090-1234-5678', createdAt: new Date() });
    await db().collection('MenuItem').insertOne({ _id: new ObjectId(), nameEn: 'Butter Chicken', nameJa: 'バターチキン', price: 1200, createdAt: new Date() });
    const admin = await request(app).get('/api/v1/dashboard/search').query({ q: 'hanako' }).set('Cookie', adminCookie).expect(200);
    expect(admin.body.orders.map((o: { number: number }) => o.number)).toContain(2);
    expect(admin.body.members[0]).toMatchObject({ name: 'Hanako Search' });
    expect((await request(app).get('/api/v1/dashboard/search').query({ q: '#1' }).set('Cookie', adminCookie)).body.orders[0].number).toBe(1);
    expect((await request(app).get('/api/v1/dashboard/search').query({ q: 'バター' }).set('Cookie', adminCookie)).body.menuItems[0].nameEn).toBe('Butter Chicken');
    expect((await request(app).get('/api/v1/dashboard/search').query({ q: '090-1234' }).set('Cookie', adminCookie)).body.members).toHaveLength(1);
    const staff = await request(app).get('/api/v1/dashboard/search').query({ q: 'hanako' }).set('Cookie', staffCookie).expect(200);
    expect(staff.body.members).toEqual([]);
    expect(staff.body.messages).toEqual([]);
    expect((await request(app).get('/api/v1/dashboard/search').query({ q: '.*' }).set('Cookie', adminCookie)).body.orders).toEqual([]);
  });

  it('lists what needs attention for the bell', async () => {
    const res = await request(app).get('/api/v1/dashboard/notifications').set('Cookie', staffCookie).expect(200);
    const titles = res.body.items.map((item: { title: string }) => item.title);
    expect(titles).toContain('New order #002');
    expect(titles).toContain('1 order past due time');
    expect(res.body.count).toBeGreaterThanOrEqual(2);
  });

  it('shows staff the live view without sales, and keeps analytics admin-only', async () => {
    const live = await request(app).get('/api/v1/dashboard/live').set('Cookie', staffCookie).expect(200);
    expect(live.body.open).toMatchObject({ NEW: 1, late: 1 });
    expect(live.body.today.sales).toBeNull();
    expect(live.body.recentOrders[0].amount).toBeNull();
    expect((await request(app).get('/api/v1/dashboard/live').set('Cookie', adminCookie)).body.today.sales).toBe(2160);
    expect((await request(app).get('/api/v1/dashboard/analytics').set('Cookie', staffCookie)).status).toBe(403);
    expect((await request(app).get('/api/v1/dashboard/analytics/orders.csv').set('Cookie', staffCookie)).status).toBe(403);
  });
});
