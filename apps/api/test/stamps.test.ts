import bcrypt from 'bcryptjs';
import { ObjectId } from 'mongodb';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import { closeMongo, db } from '../src/lib/mongo.js';
import { prisma } from '../src/lib/prisma.js';
import { DEFAULT_STAMP_REWARDS, nextStampAt, normalizeMemberCode, stampAmount, stampConfig } from '../src/lib/stamps.js';

const app = createApp();
const STAFF_PASSWORD = 'correct horse battery staple';
const HOUR_MS = 60 * 60 * 1000;
let adminCookie: string[];
let curryId: string; // ¥1,000
let teaId: string; // ¥300
let slot: string;

const cookieOf = (res: request.Response) => res.headers['set-cookie'] as unknown as string[];

async function register(email: string) {
  const res = await request(app).post('/api/v1/customers/register').send({ name: 'Hanako', email, password: 'member-pass-1' });
  expect(res.status).toBe(201);
  return cookieOf(res);
}

const placeOrder = (cookie: string[], items: { itemId: string; quantity: number }[], extra: Record<string, unknown> = {}) =>
  request(app).post('/api/v1/orders').set('Cookie', cookie).send({ name: 'Hanako', phone: '090-0000-0000', pickupAt: slot, items, ...extra });

async function complete(number: number, finalStatus = 'COMPLETED') {
  const list = await request(app).get('/api/v1/orders').set('Cookie', adminCookie);
  const id = list.body.find((o: { number: number }) => o.number === number).id;
  const steps = finalStatus === 'CANCELLED' ? ['CANCELLED'] : ['CONFIRMED', 'READY', 'COMPLETED'];
  let last: request.Response | undefined;
  for (const status of steps) last = await request(app).patch(`/api/v1/orders/${id}/status`).set('Cookie', adminCookie).send({ status }).expect(200);
  return last!.body;
}

const card = async (cookie: string[]) => (await request(app).get('/api/v1/customers/me/stamps').set('Cookie', cookie).expect(200)).body;
const settings = (body: object) => request(app).put('/api/v1/settings').set('Cookie', adminCookie).send(body);
/** Pretends the member's last stamp was given `hours` ago. */
const ageLastStamp = (memberCode: string, hours: number) =>
  db().collection('Customer').updateOne({ memberCode }, { $set: { lastStampAt: new Date(Date.now() - hours * HOUR_MS) } });

beforeAll(async () => {
  await db().dropDatabase();
  const now = new Date();
  await db().collection('User').insertOne({
    _id: new ObjectId(), email: 'admin@test.local', name: 'Admin', role: 'ADMIN', isActive: true,
    passwordHash: await bcrypt.hash(STAFF_PASSWORD, 4), createdAt: now, updatedAt: now,
  });
  adminCookie = cookieOf(await request(app).post('/api/v1/auth/login').send({ email: 'admin@test.local', password: STAFF_PASSWORD }));
  await settings({ pickupEnabled: true, pickupHours: '00:00-23:45', pickupLeadMinutes: 0 }).expect(200);
  curryId = (await request(app).post('/api/v1/menu/items').set('Cookie', adminCookie).send({ nameEn: 'Curry', price: 1000, categoryName: 'Takeout' }).expect(201)).body.id;
  teaId = (await request(app).post('/api/v1/menu/items').set('Cookie', adminCookie).send({ nameEn: 'Chai', price: 300, categoryName: 'Takeout' }).expect(201)).body.id;
  slot = (await request(app).get('/api/v1/orders/slots')).body.slots[0].at;
});

afterAll(async () => {
  await db().dropDatabase();
  await Promise.all([closeMongo(), prisma.$disconnect()]);
});

describe('stamp card rules', () => {
  it('defaults to 10 stamps, ¥1,000 and 12 hours, with rewards at 5 and 10', () => {
    expect(stampConfig({})).toMatchObject({ enabled: true, perCard: 10, minAmount: 1000, cooldownHours: 12, rewards: DEFAULT_STAMP_REWARDS });
    // Rewards beyond a shortened card are dropped.
    expect(stampConfig({ stampsPerCard: 6 }).rewards.map((r) => r.at)).toEqual([5]);
  });

  it('counts food paid with tax, and waits out the gap', () => {
    expect(stampAmount({ total: 926, tax: 74 })).toBe(1000);
    const config = stampConfig({});
    const last = new Date('2026-10-01T10:00:00Z');
    expect(nextStampAt(last, config, new Date('2026-10-01T21:59:00Z'))?.toISOString()).toBe('2026-10-01T22:00:00.000Z');
    expect(nextStampAt(last, config, new Date('2026-10-01T22:00:00Z'))).toBeNull();
  });

  it('reads member codes the way people type or scanners send them', () => {
    expect(normalizeMemberCode('adarsha:k7mp-2qxa')).toBe('K7MP2QXA');
    expect(normalizeMemberCode('kalpna:k7mp-2qxa')).toBe('K7MP2QXA');
    expect(normalizeMemberCode('kalpana:k7mp-2qxa')).toBe('K7MP2QXA');
    expect(normalizeMemberCode(' K7MP 2QXA ')).toBe('K7MP2QXA');
  });
});

describe('stamps from online orders', () => {
  it('stamps a completed order of ¥1,000 or more, at most once per 12 hours', async () => {
    const cookie = await register('online@test.local');
    const first = await placeOrder(cookie, [{ itemId: curryId, quantity: 1 }]).expect(201); // ¥1,080
    const done = await complete(first.body.number);
    expect(done.stamp).toMatchObject({ status: 'AWARDED', position: 1 });

    const second = await placeOrder(cookie, [{ itemId: curryId, quantity: 2 }]).expect(201);
    expect((await complete(second.body.number)).stamp.status).toBe('TOO_SOON');

    const { memberCode } = await card(cookie);
    await ageLastStamp(memberCode, 13);
    const third = await placeOrder(cookie, [{ itemId: curryId, quantity: 1 }]).expect(201);
    expect((await complete(third.body.number)).stamp).toMatchObject({ status: 'AWARDED', position: 2 });

    const orders = (await request(app).get('/api/v1/customers/me/orders').set('Cookie', cookie)).body;
    expect(orders.map((o: { stampAwarded: boolean }) => o.stampAwarded)).toEqual([true, false, true]);
    expect((await card(cookie)).stamps).toBe(2);
  });

  it('gives no stamp below the minimum, or for cancelled orders', async () => {
    const cookie = await register('small@test.local');
    const small = await placeOrder(cookie, [{ itemId: teaId, quantity: 3 }]).expect(201); // ¥972
    expect((await complete(small.body.number)).stamp).toMatchObject({ status: 'BELOW_MINIMUM', minAmount: 1000 });
    const cancelled = await placeOrder(cookie, [{ itemId: curryId, quantity: 2 }]).expect(201);
    expect((await complete(cancelled.body.number, 'CANCELLED')).stamp).toBeNull();
    expect((await card(cookie)).stamps).toBe(0);
  });
});

describe('stamps at the counter', () => {
  it('lets staff stamp by member code, with the same minimum and gap', async () => {
    const cookie = await register('counter@test.local');
    const { memberCode } = await card(cookie);
    expect(memberCode).toMatch(/^[2-9A-Z]{8}$/);

    const lookup = await request(app).get(`/api/v1/stamps/member/kalpana:${memberCode.toLowerCase()}`).set('Cookie', adminCookie).expect(200);
    expect(lookup.body.member.name).toBe('Hanako');

    const stamp = (amount: number) => request(app).post(`/api/v1/stamps/member/${memberCode}`).set('Cookie', adminCookie).send({ amount });
    expect((await stamp(999)).body.error.code).toBe('BELOW_MINIMUM');
    expect((await stamp(1200)).status).toBe(201);
    const tooSoon = await stamp(5000);
    expect(tooSoon.body.error.code).toBe('TOO_SOON');
    expect(new Date(tooSoon.body.error.details.nextAt).getTime()).toBeGreaterThan(Date.now() + 11 * HOUR_MS);

    expect((await request(app).get(`/api/v1/stamps/member/${memberCode}`).set('Cookie', cookie)).status).toBe(401);
    expect((await request(app).get('/api/v1/stamps/member/NOTACODE1').set('Cookie', adminCookie)).status).toBe(400);
  });

  it('finds members by email, phone or code, giving each a member code', async () => {
    await request(app).post('/api/v1/customers/register').send({ name: 'Find Me', email: 'findme@test.local', phone: '080-4321-9876', password: 'member-pass-1' }).expect(201);
    const search = (q: string) => request(app).get('/api/v1/stamps/search').query({ q }).set('Cookie', adminCookie).expect(200);
    const byEmail = await search('FINDME@');
    expect(byEmail.body).toHaveLength(1);
    expect(byEmail.body[0].memberCode).toMatch(/^[2-9A-Z]{8}$/);
    expect((await search(byEmail.body[0].memberCode.slice(0, 4) + '-' + byEmail.body[0].memberCode.slice(4))).body[0].email).toBe('findme@test.local');
    expect((await search('08043219876')).body[0].name).toBe('Find Me');
    expect((await search('+81 80-4321-9876')).body[0].name).toBe('Find Me');
    expect((await search('.*')).body).toHaveLength(0);
  });
});

describe('rewards', () => {
  it('earns the rewards at 5 and 10, starts a new card, and uses the discount at checkout once', async () => {
    const cookie = await register('loyal@test.local');
    const { memberCode } = await card(cookie);
    const stamp = () => request(app).post(`/api/v1/stamps/member/${memberCode}`).set('Cookie', adminCookie).send({ amount: 1500 }).expect(201);

    for (let i = 1; i <= 5; i += 1) {
      await ageLastStamp(memberCode, 24);
      await stamp();
    }
    let state = await card(cookie);
    expect(state.stamps).toBe(5);
    expect(state.rewards).toHaveLength(1);
    expect(state.rewards[0]).toMatchObject({ kind: 'PERK', titleJa: '次回セットのナングレードアップ無料', at: 5 });

    // Staff hand over the naan upgrade at the counter.
    await request(app).post(`/api/v1/stamps/rewards/${state.rewards[0].id}/use`).set('Cookie', adminCookie).expect(200);
    expect((await request(app).post(`/api/v1/stamps/rewards/${state.rewards[0].id}/use`).set('Cookie', adminCookie)).status).toBe(409);

    for (let i = 6; i <= 10; i += 1) {
      await ageLastStamp(memberCode, 24);
      await stamp();
    }
    state = await card(cookie);
    expect(state).toMatchObject({ stamps: 0, completedCards: 1, totalStamps: 10 });
    const discount = state.rewards.find((r: { kind: string }) => r.kind === 'AMOUNT_OFF');
    expect(discount).toMatchObject({ amount: 1000, at: 10 });

    const quote = await request(app).post('/api/v1/orders/quote').set('Cookie', cookie)
      .send({ items: [{ itemId: curryId, quantity: 3 }], rewardId: discount.id }).expect(200);
    expect(quote.body).toMatchObject({ subtotal: 3000, rewardDiscount: 1000, total: 2000, tax: 160, grandTotal: 2160 });

    const placed = await placeOrder(cookie, [{ itemId: curryId, quantity: 3 }], { rewardId: discount.id }).expect(201);
    expect(placed.body.grandTotal).toBe(2160);
    expect((await placeOrder(cookie, [{ itemId: curryId, quantity: 3 }], { rewardId: discount.id })).body.error.code).toBe('REWARD_UNAVAILABLE');
    expect((await card(cookie)).rewards).toHaveLength(0);

    // Cancelling gives the reward back.
    await complete(placed.body.number, 'CANCELLED');
    expect((await card(cookie)).rewards.map((r: { id: string }) => r.id)).toEqual([discount.id]);
  });

  it('does not let one member use another member\'s reward, or guests use any', async () => {
    const owner = await register('owner@test.local');
    const { memberCode } = await card(owner);
    await settings({ stampRewards: [{ at: 1, titleJa: '500円引き', kind: 'AMOUNT_OFF', amount: 500 }] }).expect(200);
    await request(app).post(`/api/v1/stamps/member/${memberCode}`).set('Cookie', adminCookie).send({ amount: 1000 }).expect(201);
    const rewardId = (await card(owner)).rewards[0].id;

    const other = await register('other@test.local');
    expect((await request(app).post('/api/v1/orders/quote').set('Cookie', other).send({ items: [{ itemId: curryId, quantity: 1 }], rewardId })).body.error.code).toBe('REWARD_UNAVAILABLE');
    expect((await request(app).post('/api/v1/orders/quote').send({ items: [{ itemId: curryId, quantity: 1 }], rewardId })).status).toBe(401);
  });

  it('expires rewards after the valid days', async () => {
    await settings({ stampRewardValidDays: 30, stampRewards: [{ at: 1, titleJa: '500円引き', kind: 'AMOUNT_OFF', amount: 500 }] }).expect(200);
    const cookie = await register('expiry@test.local');
    const { memberCode } = await card(cookie);
    await request(app).post(`/api/v1/stamps/member/${memberCode}`).set('Cookie', adminCookie).send({ amount: 1000 }).expect(201);
    const reward = (await card(cookie)).rewards[0];
    expect(new Date(reward.expiresAt).getTime()).toBeGreaterThan(Date.now() + 29 * 24 * HOUR_MS);

    await db().collection('StampReward').updateOne({ _id: new ObjectId(reward.id) }, { $set: { expiresAt: new Date(Date.now() - 1000) } });
    const after = await card(cookie);
    expect(after.rewards).toHaveLength(0);
    expect(after.pastRewards[0]).toMatchObject({ id: reward.id, status: 'EXPIRED' });
  });
});

describe('stamp settings', () => {
  it('validates rewards against the card length', async () => {
    expect((await settings({ stampsPerCard: 8, stampRewards: [{ at: 9, titleJa: 'x', kind: 'PERK' }] })).status).toBe(400);
    expect((await settings({ stampRewards: [{ at: 2, titleJa: 'a', kind: 'PERK' }, { at: 2, titleJa: 'b', kind: 'PERK' }] })).status).toBe(400);
    expect((await settings({ stampRewards: [{ at: 2, titleJa: 'a', kind: 'AMOUNT_OFF', amount: 0 }] })).status).toBe(400);
  });

  it('gives no stamps while the card is switched off', async () => {
    await settings({ stampCardEnabled: false }).expect(200);
    const cookie = await register('off@test.local');
    const { memberCode, enabled } = await card(cookie);
    expect(enabled).toBe(false);
    expect((await request(app).post(`/api/v1/stamps/member/${memberCode}`).set('Cookie', adminCookie).send({ amount: 2000 })).body.error.code).toBe('STAMPS_DISABLED');
    await settings({ stampCardEnabled: true }).expect(200);
  });
});
