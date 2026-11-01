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
let kitchenCookie: string[];
let memberCookie: string[];
let itemId: string;
let slot: string;

const cookieOf = (res: request.Response) => res.headers['set-cookie'] as unknown as string[];
const kitchen = () => request(app).get('/api/v1/orders/kitchen').set('Cookie', kitchenCookie).expect(200);
const placeOrder = () =>
  request(app).post('/api/v1/orders').set('Cookie', memberCookie).send({ name: 'Hanako', phone: '090-0000-0000', pickupAt: slot, items: [{ itemId, quantity: 2 }] });
const move = (id: string, status: string) => request(app).patch(`/api/v1/orders/${id}/status`).set('Cookie', kitchenCookie).send({ status });

beforeAll(async () => {
  await db().dropDatabase();
  const now = new Date();
  await db().collection('User').insertOne({
    _id: new ObjectId(), email: 'admin@test.local', name: 'Admin', role: 'ADMIN', isActive: true,
    passwordHash: await bcrypt.hash(STAFF_PASSWORD, 4), createdAt: now, updatedAt: now,
  });
  adminCookie = cookieOf(await request(app).post('/api/v1/auth/login').send({ email: 'admin@test.local', password: STAFF_PASSWORD }));
  await request(app).put('/api/v1/settings').set('Cookie', adminCookie).send({ pickupEnabled: true, pickupHours: '00:00-23:45', pickupLeadMinutes: 0 }).expect(200);
  itemId = (await request(app).post('/api/v1/menu/items').set('Cookie', adminCookie).send({ nameEn: 'Curry', price: 1000, categoryName: 'Takeout' }).expect(201)).body.id;
  slot = (await request(app).get('/api/v1/orders/slots')).body.slots[0].at;
  memberCookie = cookieOf(await request(app).post('/api/v1/customers/register').send({ name: 'Hanako', email: 'cook@test.local', password: 'member-pass-1' }).expect(201));
});

afterAll(async () => {
  await db().dropDatabase();
  await Promise.all([closeMongo(), prisma.$disconnect()]);
});

describe('kitchen accounts', () => {
  it('are created by an admin, log in, and see only the kitchen', async () => {
    const created = await request(app).post('/api/v1/users').set('Cookie', adminCookie)
      .send({ name: 'Kitchen', email: 'Kitchen@Test.local', role: 'KITCHEN', password: 'kitchen-pass-1' }).expect(201);
    expect(created.body).toMatchObject({ email: 'kitchen@test.local', role: 'KITCHEN' });
    expect((await request(app).post('/api/v1/users').set('Cookie', adminCookie)
      .send({ name: 'Again', email: 'kitchen@test.local', role: 'STAFF', password: 'kitchen-pass-1' })).status).toBe(409);

    const login = await request(app).post('/api/v1/auth/login').send({ email: 'kitchen@test.local', password: 'kitchen-pass-1' }).expect(200);
    kitchenCookie = cookieOf(login);
    expect((await request(app).get('/api/v1/auth/me').set('Cookie', kitchenCookie)).body.user.role).toBe('KITCHEN');

    await kitchen();
    for (const path of ['/api/v1/customers', '/api/v1/dashboard/stats', '/api/v1/users', '/api/v1/stamps/search?q=a']) {
      expect((await request(app).get(path).set('Cookie', kitchenCookie)).status, path).toBe(403);
    }
    expect((await request(app).put('/api/v1/settings').set('Cookie', kitchenCookie).send({ pickupEnabled: false })).status).toBe(403);
  });

  it('lets an admin reset a staff password', async () => {
    const id = (await request(app).get('/api/v1/users').set('Cookie', adminCookie)).body.find((u: { email: string }) => u.email === 'kitchen@test.local').id;
    await request(app).put(`/api/v1/users/${id}`).set('Cookie', adminCookie).send({ password: 'kitchen-pass-2' }).expect(200);
    kitchenCookie = cookieOf(await request(app).post('/api/v1/auth/login').send({ email: 'kitchen@test.local', password: 'kitchen-pass-2' }).expect(200));
  });
});

describe('kitchen display', () => {
  it('moves an order through the kitchen, ticks dishes off, and times the prep', async () => {
    const placed = await placeOrder().expect(201);
    let board = await kitchen();
    const order = board.body.active.find((o: { number: number }) => o.number === placed.body.number);
    expect(order).toMatchObject({ status: 'NEW', customerName: 'Hanako' });
    expect(order.token).toBeUndefined();
    expect(order.email).toBeUndefined();

    await move(order.id, 'CONFIRMED').expect(200);
    await request(app).patch(`/api/v1/orders/${order.id}/items/0`).set('Cookie', kitchenCookie).send({ done: true }).expect(200);
    expect((await request(app).patch(`/api/v1/orders/${order.id}/items/5`).set('Cookie', kitchenCookie).send({ done: true })).status).toBe(404);
    board = await kitchen();
    const cooking = board.body.active.find((o: { id: string }) => o.id === order.id);
    expect(cooking.items[0].doneAt).toBeTruthy();
    expect(cooking.confirmedAt).toBeTruthy();

    // Marked ready by mistake, sent back, then ready and picked up.
    await move(order.id, 'READY').expect(200);
    await move(order.id, 'CONFIRMED').expect(200);
    const back = (await kitchen()).body.active.find((o: { id: string }) => o.id === order.id);
    expect(back.readyAt).toBeNull();
    expect(back.confirmedAt).toBe(cooking.confirmedAt);
    await move(order.id, 'READY').expect(200);
    await move(order.id, 'COMPLETED').expect(200);

    board = await kitchen();
    expect(board.body.active.some((o: { id: string }) => o.id === order.id)).toBe(false);
    expect(board.body.done[0]).toMatchObject({ id: order.id, status: 'COMPLETED' });
    expect(board.body.stats).toMatchObject({ ordersToday: 1, completedToday: 1, itemsToday: 2, avgPrepMinutes: 0 });
    // A finished order's dishes can't be changed any more.
    expect((await request(app).patch(`/api/v1/orders/${order.id}/items/0`).set('Cookie', kitchenCookie).send({ done: false })).status).toBe(404);
  });

  it('pauses and resumes new online orders', async () => {
    const paused = await request(app).post('/api/v1/orders/kitchen/pause').set('Cookie', kitchenCookie).send({ minutes: 30 }).expect(200);
    expect(new Date(paused.body.pausedUntil).getTime()).toBeGreaterThan(Date.now() + 29 * 60_000);

    const slots = await request(app).get('/api/v1/orders/slots');
    expect(slots.body.enabled).toBe(false);
    expect(slots.body.pausedUntil).toBeTruthy();
    expect((await placeOrder()).body.error.code).toBe('ORDERING_PAUSED');

    await request(app).post('/api/v1/orders/kitchen/pause').set('Cookie', kitchenCookie).send({ minutes: 0 }).expect(200);
    expect((await request(app).get('/api/v1/orders/slots')).body.enabled).toBe(true);
    await placeOrder().expect(201);
  });

  it('is closed to customers and guests', async () => {
    expect((await request(app).get('/api/v1/orders/kitchen').set('Cookie', memberCookie)).status).toBe(401);
    expect((await request(app).post('/api/v1/orders/kitchen/pause').send({ minutes: 10 })).status).toBe(401);
  });
});
