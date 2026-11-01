import bcrypt from 'bcryptjs';
import { ObjectId } from 'mongodb';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

// Push notifications go to the browsers' push services; here we only record what would be sent.
const sent = vi.hoisted(() => [] as { endpoint: string; payload: Record<string, string> }[]);
const failWith = vi.hoisted(() => ({ status: 0 }));
vi.mock('web-push', async (original) => {
  const real = (await original()) as { default: Record<string, unknown> };
  return {
    default: {
      ...real.default,
      sendNotification: vi.fn(async (sub: { endpoint: string }, payload: string) => {
        if (failWith.status) throw Object.assign(new Error('gone'), { statusCode: failWith.status });
        sent.push({ endpoint: sub.endpoint, payload: JSON.parse(payload) });
        return { statusCode: 201 };
      }),
    },
  };
});

const { createApp } = await import('../src/app.js');
const { closeMongo, db } = await import('../src/lib/mongo.js');
const { prisma } = await import('../src/lib/prisma.js');
const { isPushEndpoint, readyMessage } = await import('../src/services/push.js');

const app = createApp();
const PASSWORD = 'correct horse battery staple';
let adminCookie: string[];
let memberCookie: string[];
let itemId: string;
let slot: string;
const cookieOf = (res: request.Response) => res.headers['set-cookie'] as unknown as string[];
const sub = (n: number) => ({ endpoint: `https://fcm.googleapis.com/fcm/send/device-${n}`, keys: { p256dh: 'BPfakekeyfakekeyfakekey', auth: 'authsecret1' } });
const wait = () => new Promise((resolve) => setTimeout(resolve, 150));

async function moveTo(id: string, ...statuses: string[]) {
  for (const status of statuses) await request(app).patch(`/api/v1/orders/${id}/status`).set('Cookie', adminCookie).send({ status }).expect(200);
}

beforeAll(async () => {
  await db().dropDatabase();
  const now = new Date();
  await db().collection('User').insertOne({
    _id: new ObjectId(), email: 'admin@test.local', name: 'Admin', role: 'ADMIN', isActive: true,
    passwordHash: await bcrypt.hash(PASSWORD, 4), createdAt: now, updatedAt: now,
  });
  adminCookie = cookieOf(await request(app).post('/api/v1/auth/login').send({ email: 'admin@test.local', password: PASSWORD }));
  await request(app).put('/api/v1/settings').set('Cookie', adminCookie).send({ name: 'アダルサ', pickupEnabled: true, pickupHours: '00:00-23:45', pickupLeadMinutes: 0, diningEnabled: true }).expect(200);
  itemId = (await request(app).post('/api/v1/menu/items').set('Cookie', adminCookie).send({ nameEn: 'Curry', price: 1000, categoryName: 'Curry' }).expect(201)).body.id;
  slot = (await request(app).get('/api/v1/orders/slots')).body.slots[0].at;
  memberCookie = cookieOf(await request(app).post('/api/v1/customers/register').send({ name: 'Hanako', email: 'push@test.local', password: 'member-pass-1' }).expect(201));
});

beforeEach(() => {
  sent.length = 0;
  failWith.status = 0;
});

afterAll(async () => {
  await db().dropDatabase();
  await Promise.all([closeMongo(), prisma.$disconnect()]);
});

describe('ready notifications', () => {
  it('only accepts real browser push addresses', () => {
    expect(isPushEndpoint('https://fcm.googleapis.com/fcm/send/abc')).toBe(true);
    expect(isPushEndpoint('https://web.push.apple.com/abc')).toBe(true);
    expect(isPushEndpoint('https://evil.example/fcm.googleapis.com')).toBe(false);
    expect(isPushEndpoint('http://fcm.googleapis.com/x')).toBe(false);
    expect(readyMessage({ number: 7, fulfillment: 'PICKUP' }, 'アダルサ').body).toContain('#007');
    expect(readyMessage({ number: 7, fulfillment: 'DELIVERY' }, 'アダルサ').title).toContain('配達');
  });

  it('tells the customer their food is ready, once, when staff mark it ready', async () => {
    const key = await request(app).get('/api/v1/push/key').expect(200);
    expect(key.body.publicKey).toMatch(/^[A-Za-z0-9_-]{80,}$/);
    // The same key every time (kept in the database).
    expect((await request(app).get('/api/v1/push/key')).body.publicKey).toBe(key.body.publicKey);

    const placed = await request(app).post('/api/v1/orders').set('Cookie', memberCookie)
      .send({ name: 'Hanako', phone: '090-0000-0000', pickupAt: slot, items: [{ itemId, quantity: 1 }] }).expect(201);
    await request(app).post('/api/v1/push/subscribe').send({ subscription: sub(1), orderToken: placed.body.token }).expect(201);
    expect((await request(app).post('/api/v1/push/subscribe').send({ subscription: { ...sub(2), endpoint: 'https://attacker.example/x' }, orderToken: placed.body.token })).status).toBe(400);
    expect((await request(app).post('/api/v1/push/subscribe').send({ subscription: sub(3) })).status).toBe(400);

    const id = (await request(app).get('/api/v1/orders').set('Cookie', adminCookie)).body.find((o: { number: number }) => o.number === placed.body.number).id;
    await moveTo(id, 'CONFIRMED');
    await wait();
    expect(sent).toHaveLength(0);
    await moveTo(id, 'READY');
    await wait();
    expect(sent).toHaveLength(1);
    expect(sent[0].payload).toMatchObject({ title: 'アダルサ：ご注文の準備ができました 🎉', url: `/order/${placed.body.token}` });
    expect(sent[0].payload.body).toContain('店頭でお受け取りください');
  });

  it("notifies a signed-in member's browser about their later orders too, and forgets expired browsers", async () => {
    await request(app).post('/api/v1/push/subscribe').set('Cookie', memberCookie).send({ subscription: sub(4) }).expect(201);
    const placed = await request(app).post('/api/v1/orders').set('Cookie', memberCookie)
      .send({ name: 'Hanako', phone: '090-0000-0000', pickupAt: slot, items: [{ itemId, quantity: 1 }] }).expect(201);
    const id = (await request(app).get('/api/v1/orders').set('Cookie', adminCookie)).body.find((o: { number: number }) => o.number === placed.body.number).id;
    failWith.status = 410;
    await moveTo(id, 'CONFIRMED', 'READY');
    await wait();
    // Device 4 follows the member, so it was told (and, having expired, is forgotten). Device 1 only
    // followed the first order, so it wasn't contacted about this one.
    expect(await db().collection('PushSubscription').countDocuments({ endpoint: sub(4).endpoint })).toBe(0);
    expect(await db().collection('PushSubscription').countDocuments({ endpoint: sub(1).endpoint })).toBe(1);
  });

  it('tells table guests their food is coming', async () => {
    const table = (await request(app).post('/api/v1/dining/tables').set('Cookie', adminCookie).send({ number: '9' }).expect(201)).body;
    await request(app).post(`/api/v1/dining/tables/${table.id}/open`).set('Cookie', adminCookie).send({ guests: 2 }).expect(201);
    const sessionId = (await request(app).get(`/api/v1/dining/t/${table.qrToken}`)).body.session.id;
    await request(app).post('/api/v1/push/subscribe').send({ subscription: sub(5), tableToken: table.qrToken, sessionId }).expect(201);
    expect((await request(app).post('/api/v1/push/subscribe').send({ subscription: sub(6), tableToken: table.qrToken, sessionId: new ObjectId().toHexString() })).status).toBe(404);

    await request(app).post(`/api/v1/dining/t/${table.qrToken}/orders`).send({ sessionId, items: [{ itemId, quantity: 1 }] }).expect(201);
    const order = (await request(app).get(`/api/v1/dining/sessions/${sessionId}`).set('Cookie', adminCookie)).body.orders[0];
    await moveTo(order.id, 'CONFIRMED', 'READY');
    await wait();
    expect(sent.map((s) => s.endpoint)).toEqual([sub(5).endpoint]);
    expect(sent[0].payload.body).toContain('テーブル 9');
  });
});
