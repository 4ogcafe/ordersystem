import bcrypt from 'bcryptjs';
import { ObjectId } from 'mongodb';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import { closeMongo, db } from '../src/lib/mongo.js';
import { prisma } from '../src/lib/prisma.js';

const app = createApp();
const PASSWORD = 'correct horse battery staple';
const PNG_BYTES = Buffer.from('89504e470d0a1a0a0000000d49484452', 'hex');

async function createUser(email: string, role: 'ADMIN' | 'STAFF') {
  const now = new Date();
  await db().collection('User').insertOne({
    _id: new ObjectId(), email, name: role, role, isActive: true,
    passwordHash: await bcrypt.hash(PASSWORD, 4), createdAt: now, updatedAt: now,
  });
}

async function login(email: string) {
  const res = await request(app).post('/api/v1/auth/login').send({ email, password: PASSWORD });
  expect(res.status).toBe(200);
  return res.headers['set-cookie'] as unknown as string[];
}

let adminCookie: string[];
let staffCookie: string[];

beforeAll(async () => {
  await db().dropDatabase();
  await createUser('admin@test.local', 'ADMIN');
  await createUser('staff@test.local', 'STAFF');
  adminCookie = await login('admin@test.local');
  staffCookie = await login('staff@test.local');
});

afterAll(async () => {
  await db().dropDatabase();
  await Promise.all([closeMongo(), prisma.$disconnect()]);
});

describe('authentication', () => {
  it('rejects the old hard-coded admin bypass', async () => {
    const res = await request(app).post('/api/v1/auth/login').send({ email: 'admin@example.com', password: 'admin123' });
    expect(res.status).toBe(401);
  });

  it('sets an httpOnly session cookie and does not return the token', async () => {
    const res = await request(app).post('/api/v1/auth/login').send({ email: 'admin@test.local', password: PASSWORD });
    expect(res.body.token).toBeUndefined();
    expect(String(res.headers['set-cookie'])).toMatch(/HttpOnly/i);
    expect(String(res.headers['set-cookie'])).toMatch(/SameSite=Strict/i);
  });

  it('does not lock out after many successful logins, but does after repeated wrong passwords', async () => {
    for (let i = 0; i < 12; i++) await login('staff@test.local');

    const attempt = () => request(app).post('/api/v1/auth/login').send({ email: 'locked@test.local', password: 'wrong' });
    const statuses = [];
    for (let i = 0; i < 11; i++) statuses.push((await attempt()).status);
    expect(statuses.slice(0, 10).every((status) => status === 401)).toBe(true);
    expect(statuses[10]).toBe(429);
  });

  it('removes the unauthenticated /auth/setup endpoint', async () => {
    expect((await request(app).post('/api/v1/auth/setup')).status).toBe(404);
  });

  it.each([
    ['put', '/api/v1/settings'],
    ['get', '/api/v1/users'],
    ['get', '/api/v1/contact'],
    ['post', '/api/v1/menu/items'],
    ['post', '/api/v1/upload'],
    ['get', '/api/v1/dashboard/stats'],
    ['get', '/api/v1/orders'],
    ['patch', `/api/v1/orders/${new ObjectId().toHexString()}/status`],
  ] as const)('%s %s requires login', async (method, path) => {
    expect((await request(app)[method](path)).status).toBe(401);
  });

  it.each([
    ['put', '/api/v1/settings'],
    ['get', '/api/v1/users'],
    ['get', '/api/v1/contact'],
    ['delete', `/api/v1/menu/items/${new ObjectId().toHexString()}`],
    ['post', '/api/v1/menu/categories'],
  ] as const)('STAFF gets 403 on %s %s', async (method, path) => {
    expect((await request(app)[method](path).set('Cookie', staffCookie)).status).toBe(403);
  });

  it('stops an admin from removing their own admin role', async () => {
    const me = await request(app).get('/api/v1/auth/me').set('Cookie', adminCookie);
    const res = await request(app).put(`/api/v1/users/${me.body.user.id}`).set('Cookie', adminCookie).send({ role: 'STAFF' });
    expect(res.status).toBe(400);
  });
});

describe('settings', () => {
  it('only updates the fields that were sent', async () => {
    await request(app).put('/api/v1/settings').set('Cookie', adminCookie)
      .send({ name: 'Adarsha', phone: '000', googleMapsLink: 'https://maps.google.com/x' }).expect(200);
    await request(app).put('/api/v1/settings').set('Cookie', adminCookie).send({ aboutJa: 'about' }).expect(200);
    const res = await request(app).get('/api/v1/settings').expect(200);
    expect(res.body).toMatchObject({ name: 'Adarsha', phone: '000', googleMapsLink: 'https://maps.google.com/x', aboutJa: 'about' });
  });

  it('rejects non-https links', async () => {
    const res = await request(app).put('/api/v1/settings').set('Cookie', adminCookie).send({ storeReviewLink: 'javascript:alert(1)' });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });
});

describe('menu', () => {
  it('deleting a parent category removes subcategory items so the menu still loads', async () => {
    const parent = await request(app).post('/api/v1/menu/categories').set('Cookie', adminCookie).send({ nameEn: 'Parent' }).expect(201);
    const child = await request(app).post('/api/v1/menu/categories').set('Cookie', adminCookie)
      .send({ nameEn: 'Child', parentId: parent.body.id }).expect(201);
    await request(app).post('/api/v1/menu/items').set('Cookie', staffCookie)
      .send({ nameEn: 'Naan', price: '300', categoryName: 'Child', isRecommended: false }).expect(201);

    await request(app).delete(`/api/v1/menu/categories/${parent.body.id}`).set('Cookie', adminCookie).expect(200);

    const items = await request(app).get('/api/v1/menu/items').expect(200);
    expect(items.body.some((item: { categoryId: string }) => item.categoryId === child.body.id)).toBe(false);
  });

  it('returns the rating that was saved instead of dropping it', async () => {
    await request(app).post('/api/v1/menu/items').set('Cookie', staffCookie)
      .send({ nameEn: 'Dal', price: 800, categoryName: 'Curry', rating: '4.2' }).expect(201);
    const items = await request(app).get('/api/v1/menu/items').expect(200);
    expect(items.body.find((item: { nameEn: string }) => item.nameEn === 'Dal').rating).toBe(4.2);
  });

  it('returns 400 for a malformed id instead of 500', async () => {
    expect((await request(app).delete('/api/v1/menu/items/not-an-id').set('Cookie', adminCookie)).status).toBe(400);
  });
});

describe('carousels', () => {
  it('a slide created without alt text does not break the public carousel', async () => {
    await request(app).post('/api/v1/carousels').set('Cookie', adminCookie)
      .send({ titleJa: 'タイトル', imageUrl: '/uploads/a.jpg' }).expect(201);
    const res = await request(app).get('/api/v1/carousels').expect(200);
    expect(res.body).toHaveLength(1);
  });
});

describe('uploads', () => {
  it('rejects a non-image file even when it claims to be one', async () => {
    const res = await request(app).post('/api/v1/upload').set('Cookie', staffCookie)
      .attach('image', Buffer.from('<script>alert(1)</script>'), { filename: 'x.png', contentType: 'image/png' });
    expect(res.status).toBe(415);
  });

  it('accepts a PNG and names it from its contents', async () => {
    const res = await request(app).post('/api/v1/upload').set('Cookie', staffCookie)
      .attach('image', PNG_BYTES, { filename: 'evil.html', contentType: 'text/html' });
    expect(res.status).toBe(201);
    expect(res.body.imageUrl).toMatch(/^\/uploads\/[\w-]+\.png$/);
    await import('node:fs/promises').then((fs) => fs.rm(`public${res.body.imageUrl}`));
  });
});

describe('contact', () => {
  it('rejects an invalid enquiry type so the admin inbox keeps loading', async () => {
    const res = await request(app).post('/api/v1/contact').send({ name: 'A', email: 'a@b.co', type: 'BOGUS' });
    expect(res.status).toBe(400);
    await request(app).get('/api/v1/contact').set('Cookie', adminCookie).expect(200);
  });

  it('drops honeypot submissions and rate-limits per IP', async () => {
    await request(app).post('/api/v1/contact').send({ name: 'Bot', email: 'b@b.co', website: 'spam' }).expect(201);
    const inbox = await request(app).get('/api/v1/contact').set('Cookie', adminCookie);
    expect(inbox.body.some((m: { name: string }) => m.name === 'Bot')).toBe(false);

    const statuses = [];
    for (let i = 0; i < 5; i++) {
      statuses.push((await request(app).post('/api/v1/contact').send({ name: 'P', email: 'p@p.co' })).status);
    }
    expect(statuses.at(-1)).toBe(429);
  });
});

describe('pickup orders', () => {
  let takeoutId: string;
  let grandId: string;
  let slot: string;

  let memberCookie: string[];

  const order = (overrides: Record<string, unknown> = {}) =>
    request(app).post('/api/v1/orders').set('Cookie', memberCookie).send({
      name: 'Tanaka', phone: '090-1234-5678', pickupAt: slot,
      items: [{ itemId: takeoutId, quantity: 2 }], ...overrides,
    });

  beforeAll(async () => {
    const member = await request(app).post('/api/v1/customers/register')
      .send({ name: 'Tanaka', email: 'tanaka@test.local', password: 'member-pass-1' }).expect(201);
    memberCookie = member.headers['set-cookie'] as unknown as string[];
    // Every slot of the day is open and there is no lead time, so the test never depends on the clock.
    await request(app).put('/api/v1/settings').set('Cookie', adminCookie)
      .send({ pickupEnabled: true, pickupHours: '00:00-23:45', pickupLeadMinutes: 0, pickupClosedDays: [], pickupClosedDates: [] })
      .expect(200);
    takeoutId = (await request(app).post('/api/v1/menu/items').set('Cookie', staffCookie)
      .send({ nameEn: 'Takeout Biryani', price: 1000, categoryName: 'Takeout Rice' }).expect(201)).body.id;
    grandId = (await request(app).post('/api/v1/menu/items').set('Cookie', staffCookie)
      .send({ nameEn: 'Dine-in Thali', price: 2000, categoryName: 'Grand Sets' }).expect(201)).body.id;
    const slots = await request(app).get('/api/v1/orders/slots').expect(200);
    expect(slots.body.enabled).toBe(true);
    slot = slots.body.slots[0].at;
  });

  it('rejects pickup hours the slot logic cannot read', async () => {
    const res = await request(app).put('/api/v1/settings').set('Cookie', adminCookie).send({ pickupHours: 'lunch time' });
    expect(res.status).toBe(400);
  });

  it('prices the order from the database and walks it through to completion', async () => {
    const placed = await order({ items: [{ itemId: takeoutId, quantity: 2, price: 1 }] }).expect(201);
    expect(placed.body).toMatchObject({ number: expect.any(Number), total: 2000 });

    const tracked = await request(app).get(`/api/v1/orders/track/${placed.body.token}`).expect(200);
    expect(tracked.body).toMatchObject({ status: 'NEW', total: 2000 });
    expect(tracked.body.phone).toBeUndefined();

    const active = await request(app).get('/api/v1/orders').set('Cookie', staffCookie).expect(200);
    const id = active.body.find((o: { number: number }) => o.number === placed.body.number).id;
    expect(active.body[0].token).toBeUndefined();

    const move = (status: string) => request(app).patch(`/api/v1/orders/${id}/status`).set('Cookie', staffCookie).send({ status });
    await move('CONFIRMED').expect(200);
    expect((await move('COMPLETED')).status).toBe(409);
    await move('READY').expect(200);
    await move('COMPLETED').expect(200);

    const after = await request(app).get('/api/v1/orders').set('Cookie', staffCookie).expect(200);
    expect(after.body.some((o: { id: string }) => o.id === id)).toBe(false);
    expect(await db().collection('AuditLog').countDocuments({ entityId: id })).toBe(3);
  });

  it('accepts items from any menu but refuses sold-out ones', async () => {
    const grand = await order({ items: [{ itemId: grandId, quantity: 1 }] });
    expect(grand.status).toBe(201);
    expect(grand.body.total).toBe(2000);

    const setSoldOut = (isSoldOut: boolean) =>
      request(app).put(`/api/v1/menu/items/${takeoutId}`).set('Cookie', staffCookie).send({ isSoldOut }).expect(200);
    await setSoldOut(true);
    expect((await order()).status).toBe(409);
    await setSoldOut(false);
  });

  it('refuses a pickup time that is not an offered slot', async () => {
    const res = await order({ pickupAt: '2020-01-01T03:07:00.000Z' });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('SLOT_UNAVAILABLE');
  });

  it('refuses orders from visitors who are not logged in', async () => {
    const res = await request(app).post('/api/v1/orders')
      .send({ name: 'Guest', phone: '090-1234-5678', pickupAt: slot, items: [{ itemId: takeoutId, quantity: 1 }] });
    expect(res.status).toBe(401);
  });

  it('returns 404 for an unknown tracking token', async () => {
    expect((await request(app).get('/api/v1/orders/track/AAAAAAAAAAAAAAAAAAAAAA')).status).toBe(404);
  });
});

describe('footer settings', () => {
  it('saves the footer and rejects unsafe links', async () => {
    const cookie = adminCookie;
    const ok = await request(app).put('/api/v1/settings').set('Cookie', cookie).send({
      footerBrand: 'アダルサ',
      footerTaglineJa: '熊谷の本格インド料理',
      footerCopyright: '© {year} アダルサ',
      footerLinks: [{ label: 'ホーム', url: '/' }, { label: 'Instagram', url: 'https://instagram.com/x' }],
      footerShowHours: true,
    });
    expect(ok.status).toBe(200);
    expect(ok.body).toMatchObject({ footerBrand: 'アダルサ', footerLinks: [{ label: 'ホーム', url: '/' }, { label: 'Instagram', url: 'https://instagram.com/x' }] });
    for (const url of ['javascript:alert(1)', '//evil.example', 'http://insecure.example']) {
      expect((await request(app).put('/api/v1/settings').set('Cookie', cookie).send({ footerLinks: [{ label: 'x', url }] })).status, url).toBe(400);
    }
  });
});
