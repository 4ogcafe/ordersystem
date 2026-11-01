import bcrypt from 'bcryptjs';
import { ObjectId } from 'mongodb';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import { closeMongo, db } from '../src/lib/mongo.js';
import { prisma } from '../src/lib/prisma.js';

const app = createApp();
const STAFF_PASSWORD = 'correct horse battery staple';
let adminCookie: string[];
let itemId: string;
let slot: string;

const cookieOf = (res: request.Response) => res.headers['set-cookie'] as unknown as string[];

async function register(email: string) {
  const res = await request(app).post('/api/v1/customers/register').send({ name: 'Hanako', email, phone: '090-0000-0000', password: 'member-pass-1' });
  expect(res.status).toBe(201);
  return { cookie: cookieOf(res), body: res.body };
}

const placeOrder = (cookie: string[] | null, extra: Record<string, unknown> = {}) => {
  const req = request(app).post('/api/v1/orders');
  if (cookie) req.set('Cookie', cookie);
  return req.send({ name: 'Hanako', phone: '090-0000-0000', pickupAt: slot, items: [{ itemId, quantity: 3 }], ...extra });
};

const moveOrder = async (number: number, ...statuses: string[]) => {
  const list = await request(app).get('/api/v1/orders').set('Cookie', adminCookie);
  const id = list.body.find((o: { number: number }) => o.number === number).id;
  for (const status of statuses) await request(app).patch(`/api/v1/orders/${id}/status`).set('Cookie', adminCookie).send({ status }).expect(200);
};

beforeAll(async () => {
  await db().dropDatabase();
  const now = new Date();
  await db().collection('User').insertOne({
    _id: new ObjectId(), email: 'admin@test.local', name: 'Admin', role: 'ADMIN', isActive: true,
    passwordHash: await bcrypt.hash(STAFF_PASSWORD, 4), createdAt: now, updatedAt: now,
  });
  adminCookie = cookieOf(await request(app).post('/api/v1/auth/login').send({ email: 'admin@test.local', password: STAFF_PASSWORD }));
  await request(app).put('/api/v1/settings').set('Cookie', adminCookie)
    .send({ pickupEnabled: true, pickupHours: '00:00-23:45', pickupLeadMinutes: 0, signupBonusPoints: 100 }).expect(200);
  itemId = (await request(app).post('/api/v1/menu/items').set('Cookie', adminCookie)
    .send({ nameEn: 'Curry', price: 1000, categoryName: 'Takeout' }).expect(201)).body.id;
  slot = (await request(app).get('/api/v1/orders/slots')).body.slots[0].at;
});

afterAll(async () => {
  await db().dropDatabase();
  await Promise.all([closeMongo(), prisma.$disconnect()]);
});

describe('customer accounts', () => {
  it('registers with a welcome bonus, rejects duplicate emails, and logs in case-insensitively', async () => {
    const { body } = await register('hanako@test.local');
    expect(body.customer.points).toBe(100);
    expect(body.customer.passwordHash).toBeUndefined();

    const dup = await request(app).post('/api/v1/customers/register').send({ name: 'X', email: 'HANAKO@test.local', password: 'member-pass-1' });
    expect(dup.status).toBe(409);

    await request(app).post('/api/v1/customers/login').send({ email: 'Hanako@Test.local', password: 'member-pass-1' }).expect(200);
    expect((await request(app).post('/api/v1/customers/login').send({ email: 'hanako@test.local', password: 'nope' })).status).toBe(401);
  });

  it('keeps customer and staff sessions apart', async () => {
    const { cookie } = await register('apart@test.local');
    expect((await request(app).get('/api/v1/orders').set('Cookie', cookie)).status).toBe(401);
    expect((await request(app).get('/api/v1/customers/me').set('Cookie', adminCookie)).body.customer).toBeNull();
    expect((await request(app).get('/api/v1/customers').set('Cookie', cookie)).status).toBe(401);
  });

  it('changes the password only with the current one', async () => {
    const { cookie } = await register('pw@test.local');
    expect((await request(app).put('/api/v1/customers/me/password').set('Cookie', cookie).send({ currentPassword: 'wrong', newPassword: 'another-pass-2' })).status).toBe(400);
    await request(app).put('/api/v1/customers/me/password').set('Cookie', cookie).send({ currentPassword: 'member-pass-1', newPassword: 'another-pass-2' }).expect(200);
    await request(app).post('/api/v1/customers/login').send({ email: 'pw@test.local', password: 'another-pass-2' }).expect(200);
  });
});

describe('member profile', () => {
  it('saves and returns the full profile, and clears fields sent empty', async () => {
    const { cookie } = await register('profile@test.local');
    const res = await request(app).put('/api/v1/customers/me').set('Cookie', cookie).send({
      nameKana: 'ヤマダ ハナコ',
      birthDate: '1990-05-17',
      address: { postalCode: '360-0023', prefecture: '埼玉県', city: '熊谷市', line1: '佐谷田1-2-3', building: '' },
      preferences: { allergens: ['えび', '乳'], otherAllergies: 'マンゴー', diets: ['VEGETARIAN'], spiceLevel: 2, note: '' },
      newsletterOptIn: true,
    }).expect(200);
    expect(res.body.customer).toMatchObject({
      nameKana: 'ヤマダ ハナコ',
      birthDate: '1990-05-17',
      address: { postalCode: '360-0023', prefecture: '埼玉県', city: '熊谷市', line1: '佐谷田1-2-3', building: '' },
      preferences: { allergens: ['えび', '乳'], otherAllergies: 'マンゴー', diets: ['VEGETARIAN'], spiceLevel: 2 },
      newsletterOptIn: true,
    });
    expect(res.body.customer.passwordHash).toBeUndefined();

    const cleared = await request(app).put('/api/v1/customers/me').set('Cookie', cookie).send({ birthDate: '', nameKana: '' }).expect(200);
    expect(cleared.body.customer).toMatchObject({ birthDate: '', nameKana: '', address: { city: '熊谷市' } });
  });

  it('rejects invalid profile values', async () => {
    const { cookie } = await register('invalid@test.local');
    const put = (body: object) => request(app).put('/api/v1/customers/me').set('Cookie', cookie).send(body);
    expect((await put({ birthDate: '2999-01-01' })).status).toBe(400);
    expect((await put({ nameKana: 'やまだ' })).status).toBe(400);
    expect((await put({ address: { postalCode: '12-345' } })).status).toBe(400);
    expect((await put({ address: { prefecture: 'Tokyo' } })).status).toBe(400);
    expect((await put({ preferences: { spiceLevel: 9 } })).status).toBe(400);
  });

  it('changes the email only with the current password and never to a taken one', async () => {
    const { cookie } = await register('old@test.local');
    await register('taken@test.local');
    const change = (email: string, currentPassword: string) =>
      request(app).put('/api/v1/customers/me/email').set('Cookie', cookie).send({ email, currentPassword });
    expect((await change('new@test.local', 'wrong')).status).toBe(400);
    expect((await change('taken@test.local', 'member-pass-1')).status).toBe(409);
    await change('New@Test.local', 'member-pass-1').expect(200);
    await request(app).post('/api/v1/customers/login').send({ email: 'new@test.local', password: 'member-pass-1' }).expect(200);
  });

  it('deletes an account by erasing personal data, and ends the session', async () => {
    const { cookie } = await register('leaving@test.local');
    await request(app).put('/api/v1/customers/me').set('Cookie', cookie).send({ birthDate: '1985-01-01', address: { city: '熊谷市' } }).expect(200);
    expect((await request(app).delete('/api/v1/customers/me').set('Cookie', cookie).send({ currentPassword: 'wrong' })).status).toBe(400);
    await request(app).delete('/api/v1/customers/me').set('Cookie', cookie).send({ currentPassword: 'member-pass-1' }).expect(204);

    expect((await request(app).get('/api/v1/customers/me').set('Cookie', cookie)).body.customer).toBeNull();
    expect((await request(app).get('/api/v1/customers/me/orders').set('Cookie', cookie)).status).toBe(401);
    expect((await request(app).post('/api/v1/customers/login').send({ email: 'leaving@test.local', password: 'member-pass-1' })).status).toBe(401);
    const stored = await db().collection('Customer').findOne({ name: '退会済み会員' });
    expect(stored).toMatchObject({ isActive: false });
    expect(stored?.birthDate).toBeUndefined();
    expect(stored?.address).toBeUndefined();
    // The email is free to register again.
    await register('leaving@test.local');
  });

  it('shows a member\'s allergies to staff on their orders', async () => {
    const { cookie } = await register('allergic@test.local');
    await request(app).put('/api/v1/customers/me').set('Cookie', cookie).send({ preferences: { allergens: ['落花生'], diets: ['HALAL'] } }).expect(200);
    const placed = await placeOrder(cookie).expect(201);
    const list = await request(app).get('/api/v1/orders').set('Cookie', adminCookie).expect(200);
    const order = list.body.find((o: { number: number }) => o.number === placed.body.number);
    expect(order.dietaryAlert).toEqual({ allergens: ['落花生'], otherAllergies: '', diets: ['HALAL'] });
  });
});

describe('delivery', () => {
  const address = { postalCode: '360-0023', prefecture: '埼玉県', city: '熊谷市', line1: '佐谷田1-2-3' };
  const settings = (body: object) => request(app).put('/api/v1/settings').set('Cookie', adminCookie).send(body).expect(200);
  const deliverySlot = async () => (await request(app).get('/api/v1/orders/slots?type=delivery')).body.slots[0]?.at;
  const deliver = (cookie: string[], extra: Record<string, unknown> = {}) =>
    placeOrder(cookie, { fulfillment: 'DELIVERY', deliveryAddress: address, ...extra });

  it('is refused while switched off, and offered once switched on', async () => {
    const { cookie } = await register('deliver-off@test.local');
    await settings({ deliveryEnabled: false });
    expect((await request(app).get('/api/v1/orders/slots')).body.delivery.enabled).toBe(false);
    expect((await deliver(cookie)).body.error.code).toBe('FULFILLMENT_UNAVAILABLE');

    await settings({ deliveryEnabled: true, deliveryHours: '00:00-23:45', deliveryLeadMinutes: 0, deliveryFee: 300, deliveryFreeOver: 5000, deliveryMinOrder: 1500, deliveryAreas: ['360', '熊谷市'] });
    const slots = await request(app).get('/api/v1/orders/slots?type=delivery').expect(200);
    expect(slots.body.delivery).toMatchObject({ enabled: true, fee: 300, freeOver: 5000, minOrder: 1500 });
    expect(slots.body.slots.length).toBeGreaterThan(0);
  });

  it('adds the fee, checks the area and minimum, and stores the address', async () => {
    const { cookie } = await register('deliver@test.local');
    const pickupAt = await deliverySlot();

    const quote = await request(app).post('/api/v1/orders/quote').set('Cookie', cookie)
      .send({ items: [{ itemId, quantity: 3 }], fulfillment: 'DELIVERY' }).expect(200);
    expect(quote.body).toMatchObject({ subtotal: 3000, deliveryFee: 300, grandTotal: 3000 + quote.body.tax + 300 });

    expect((await deliver(cookie, { pickupAt, deliveryAddress: { ...address, postalCode: '100-0001', city: '千代田区', prefecture: '東京都' } })).body.error.code).toBe('OUTSIDE_DELIVERY_AREA');
    expect((await deliver(cookie, { pickupAt, items: [{ itemId, quantity: 1 }] })).body.error.code).toBe('BELOW_MINIMUM');
    expect((await deliver(cookie, { pickupAt, deliveryAddress: undefined })).status).toBe(400);

    const placed = await deliver(cookie, { pickupAt }).expect(201);
    const tracked = await request(app).get(`/api/v1/orders/track/${placed.body.token}`).expect(200);
    expect(tracked.body).toMatchObject({ fulfillment: 'DELIVERY', deliveryFee: 300, deliveryAddress: { city: '熊谷市', line1: '佐谷田1-2-3' } });
  });

  it('is free above the threshold', async () => {
    const quote = await request(app).post('/api/v1/orders/quote')
      .send({ items: [{ itemId, quantity: 5 }], fulfillment: 'DELIVERY' }).expect(200);
    expect(quote.body.deliveryFee).toBe(0);
  });

  it('lets the admin switch pickup off while delivery stays on', async () => {
    const { cookie } = await register('pickup-off@test.local');
    await settings({ pickupEnabled: false });
    expect((await placeOrder(cookie)).body.error.code).toBe('FULFILLMENT_UNAVAILABLE');
    expect((await request(app).get('/api/v1/orders/slots')).body.enabled).toBe(true);
    await settings({ pickupEnabled: true });
  });
});

describe('member orders, offers and points', () => {
  it('applies an offer and points, earns on pickup, and shows it all in the member history', async () => {
    const { cookie } = await register('member@test.local'); // 100 bonus points
    const offer = await request(app).post('/api/v1/offers').set('Cookie', adminCookie)
      .send({ titleJa: '500円引き', discountType: 'AMOUNT', discountValue: 500, minSubtotal: 2000, oncePerCustomer: true }).expect(201);

    const quote = await request(app).post('/api/v1/orders/quote').set('Cookie', cookie)
      .send({ items: [{ itemId, quantity: 3 }], offerId: offer.body.id, pointsToUse: 100 }).expect(200);
    // Tax is charged on what is paid after the offer and points: 8% of ¥2,400.
    expect(quote.body).toMatchObject({ subtotal: 3000, offerDiscount: 500, pointsUsed: 100, total: 2400, taxRate: 8, tax: 192, grandTotal: 2592, pointsToEarn: 24 });

    const placed = await placeOrder(cookie, { offerId: offer.body.id, pointsToUse: 100 }).expect(201);
    expect(placed.body).toMatchObject({ total: 2400, tax: 192, grandTotal: 2592 });
    expect((await request(app).get('/api/v1/customers/me/points').set('Cookie', cookie)).body.balance).toBe(0);

    const again = await placeOrder(cookie, { offerId: offer.body.id });
    expect(again.body.error.code).toBe('OFFER_USED');

    // The member's offers show as used on their profile, both for them and for staff.
    const mine = await request(app).get('/api/v1/customers/me/offers').set('Cookie', cookie).expect(200);
    expect(mine.body.find((o: { id: string }) => o.id === offer.body.id)).toMatchObject({ used: true });
    expect(mine.body[0].startsAt).toBeTruthy();
    const memberId = (await request(app).get('/api/v1/customers/me').set('Cookie', cookie)).body.customer.id;
    const profile = await request(app).get(`/api/v1/customers/${memberId}/offers`).set('Cookie', adminCookie).expect(200);
    expect(profile.body.available.find((o: { id: string }) => o.id === offer.body.id)).toMatchObject({ used: true });
    expect(profile.body.used[0]).toMatchObject({ titleJa: '500円引き', discount: 500 });
    expect((await request(app).get(`/api/v1/customers/${memberId}/offers`).set('Cookie', cookie)).status).toBe(401);

    await moveOrder(placed.body.number, 'CONFIRMED', 'READY', 'COMPLETED');
    const points = await request(app).get('/api/v1/customers/me/points').set('Cookie', cookie);
    expect(points.body.balance).toBe(24);
    expect(points.body.history.map((h: { type: string }) => h.type)).toEqual(['EARN', 'REDEEM', 'BONUS']);

    const orders = await request(app).get('/api/v1/customers/me/orders').set('Cookie', cookie);
    expect(orders.body[0]).toMatchObject({ status: 'COMPLETED', offerTitle: '500円引き', pointsUsed: 100, pointsEarned: 24, total: 2400, tax: 192, grandTotal: 2592 });
  });

  it('refunds points when an order is cancelled', async () => {
    const { cookie } = await register('refund@test.local');
    const placed = await placeOrder(cookie, { pointsToUse: 50 }).expect(201);
    expect((await request(app).get('/api/v1/customers/me').set('Cookie', cookie)).body.customer.points).toBe(50);
    await moveOrder(placed.body.number, 'CANCELLED');
    expect((await request(app).get('/api/v1/customers/me').set('Cookie', cookie)).body.customer.points).toBe(100);
  });

  it('does not let guests place orders', async () => {
    expect((await placeOrder(null, { pointsToUse: 10 })).status).toBe(401);
    expect((await placeOrder(null)).status).toBe(401);
  });

  it('lets an admin adjust points but not below zero', async () => {
    const { body } = await register('adjust@test.local');
    const adjust = (points: number) => request(app).post(`/api/v1/customers/${body.customer.id}/points`).set('Cookie', adminCookie).send({ points, note: 'test' });
    expect((await adjust(50)).body.points).toBe(150);
    expect((await adjust(-500)).status).toBe(409);
  });

  it('lets an admin set a temporary password for a customer who forgot theirs', async () => {
    const { body } = await register('forgot@test.local');
    await request(app).post(`/api/v1/customers/${body.customer.id}/password`).set('Cookie', adminCookie).send({ password: 'temporary-123' }).expect(200);
    await request(app).post('/api/v1/customers/login').send({ email: 'forgot@test.local', password: 'temporary-123' }).expect(200);
  });

  it('rejects offers with impossible discounts', async () => {
    const res = await request(app).post('/api/v1/offers').set('Cookie', adminCookie).send({ titleJa: 'x', discountType: 'PERCENT', discountValue: 150 });
    expect(res.status).toBe(400);
  });
});
