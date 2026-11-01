import bcrypt from 'bcryptjs';
import { ObjectId } from 'mongodb';
import request from 'supertest';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { createApp } from '../src/app.js';
import { config } from '../src/config.js';
import { closeMongo, db } from '../src/lib/mongo.js';
import { prisma } from '../src/lib/prisma.js';
import { isStale, refreshIfStale, toCache } from '../src/services/google-reviews.js';

const app = createApp();
const PASSWORD = 'correct horse battery staple';
let adminCookie: string[];
const cookieOf = (res: request.Response) => res.headers['set-cookie'] as unknown as string[];

const PLACE = {
  id: 'ChIJtest123',
  displayName: { text: 'アダルサ' },
  rating: 4.6,
  userRatingCount: 128,
  googleMapsUri: 'https://maps.google.com/?cid=1',
  reviews: [
    { rating: 5, text: { text: 'ナンが最高！' }, relativePublishTimeDescription: '1 週間前', publishTime: '2026-10-01T00:00:00Z', authorAttribution: { displayName: '山田', uri: 'https://www.google.com/maps/contrib/1', photoUri: 'https://lh3.googleusercontent.com/a' } },
    { rating: 2, text: { text: '少し待ちました' }, relativePublishTimeDescription: '2 週間前', authorAttribution: { displayName: '佐藤' } },
    { rating: 4, text: { text: '' }, authorAttribution: { displayName: 'No text' } },
  ],
};

/** Stands in for Google: answers place details and text search. */
function googleStub(details: unknown = PLACE, ok = true) {
  return vi.fn(async (url: string | URL) => {
    const href = String(url);
    if (href.includes('searchText')) {
      return new Response(JSON.stringify({ places: [{ id: 'ChIJtest123', displayName: { text: 'アダルサ' }, formattedAddress: '埼玉県熊谷市', rating: 4.6, userRatingCount: 128 }] }), { status: 200 });
    }
    return new Response(JSON.stringify(ok ? details : { error: { message: 'API key not valid' } }), { status: ok ? 200 : 403 });
  });
}

beforeAll(async () => {
  await db().dropDatabase();
  const now = new Date();
  await db().collection('User').insertOne({
    _id: new ObjectId(), email: 'admin@test.local', name: 'Admin', role: 'ADMIN', isActive: true,
    passwordHash: await bcrypt.hash(PASSWORD, 4), createdAt: now, updatedAt: now,
  });
  adminCookie = cookieOf(await request(app).post('/api/v1/auth/login').send({ email: 'admin@test.local', password: PASSWORD }));
});

afterEach(() => {
  vi.unstubAllGlobals();
  config.googlePlacesApiKey = '';
});

afterAll(async () => {
  await db().dropDatabase();
  await Promise.all([closeMongo(), prisma.$disconnect()]);
});

describe('google review rules', () => {
  it('keeps what the website needs and refreshes monthly', () => {
    const cache = toCache('ChIJtest123', PLACE, new Date('2026-10-01T00:00:00Z'));
    expect(cache).toMatchObject({ rating: 4.6, userRatingCount: 128, name: 'アダルサ' });
    expect(cache.reviews[0]).toMatchObject({ authorName: '山田', rating: 5, text: 'ナンが最高！', relativeTime: '1 週間前' });
    expect(isStale(cache, 'ChIJtest123', new Date('2026-10-20T00:00:00Z'))).toBe(false);
    expect(isStale(cache, 'ChIJtest123', new Date('2026-11-01T00:00:00Z'))).toBe(true);
    expect(isStale(cache, 'another-place', new Date('2026-10-02T00:00:00Z'))).toBe(true);
    expect(isStale(null, 'ChIJtest123')).toBe(true);
  });
});

describe('reviews on the website', () => {
  it('falls back to the typed-in score until Google is connected', async () => {
    await request(app).put('/api/v1/settings').set('Cookie', adminCookie).send({ storeReviewScore: '4.4' }).expect(200);
    const res = await request(app).get('/api/v1/reviews').expect(200);
    expect(res.body).toMatchObject({ source: 'manual', rating: 4.4, reviews: [] });
    // Reviews copied from Google show straight away, before an API key is set up.
    await request(app).put('/api/v1/settings').set('Cookie', adminCookie)
      .send({ storeReviewCount: 214, featuredReviews: [{ authorName: '山田', rating: 5, text: 'ナンが最高！', dateLabel: '2026年9月' }] }).expect(200);
    const withReviews = await request(app).get('/api/v1/reviews').expect(200);
    expect(withReviews.body).toMatchObject({ source: 'manual', rating: 4.4, userRatingCount: 214 });
    expect(withReviews.body.reviews[0]).toMatchObject({ authorName: '山田', rating: 5, text: 'ナンが最高！', relativeTime: '2026年9月' });
    expect((await request(app).put('/api/v1/settings').set('Cookie', adminCookie).send({ featuredReviews: [{ authorName: 'x', rating: 9, text: 'y' }] })).status).toBe(400);
  });

  it('lets the admin find the restaurant, refresh, and shows live Google reviews', async () => {
    config.googlePlacesApiKey = 'test-key';
    const google = googleStub();
    vi.stubGlobal('fetch', google);

    const found = await request(app).post('/api/v1/reviews/admin/search').set('Cookie', adminCookie).send({ query: 'アダルサ 熊谷' }).expect(200);
    expect(found.body[0]).toMatchObject({ placeId: 'ChIJtest123', address: '埼玉県熊谷市' });
    // The key goes to Google in a header, never in the URL.
    expect(String(google.mock.calls[0][0])).not.toContain('test-key');

    await request(app).put('/api/v1/settings').set('Cookie', adminCookie).send({ googlePlaceId: 'ChIJtest123', googleReviewsMinRating: 3 }).expect(200);
    const refreshed = await request(app).post('/api/v1/reviews/admin/refresh').set('Cookie', adminCookie).expect(200);
    expect(refreshed.body).toMatchObject({ rating: 4.6, userRatingCount: 128, reviewCount: 3 });

    const site = await request(app).get('/api/v1/reviews').expect(200);
    expect(site.body).toMatchObject({ source: 'google', rating: 4.6, userRatingCount: 128 });
    // Below the minimum stars, or without text, are not shown.
    expect(site.body.reviews.map((r: { authorName: string }) => r.authorName)).toEqual(['山田']);
    expect(site.body.writeReviewUrl).toContain('placeid=ChIJtest123');

    const status = await request(app).get('/api/v1/reviews/admin').set('Cookie', adminCookie).expect(200);
    expect(status.body).toMatchObject({ hasKey: true, placeId: 'ChIJtest123', reviewCount: 3, lastError: null });
    expect(new Date(status.body.nextRefreshAt).getTime() - new Date(status.body.fetchedAt).getTime()).toBe(30 * 86_400_000);
  });

  it('keeps the last good reviews when Google fails, and only refreshes when a month old', async () => {
    config.googlePlacesApiKey = 'test-key';
    vi.stubGlobal('fetch', googleStub(PLACE, false));
    const failed = await request(app).post('/api/v1/reviews/admin/refresh').set('Cookie', adminCookie);
    expect(failed.status).toBe(502);
    expect(failed.body.error.message).toContain('API key not valid');
    expect((await request(app).get('/api/v1/reviews')).body).toMatchObject({ source: 'google', rating: 4.6 });

    // Fresh copy: the scheduler leaves Google alone.
    const google = googleStub();
    vi.stubGlobal('fetch', google);
    await db().collection('GoogleReviewCache').updateOne({}, { $set: { lastErrorAt: null } });
    await refreshIfStale();
    expect(google).not.toHaveBeenCalled();
    // A month later it fetches again.
    await db().collection('GoogleReviewCache').updateOne({}, { $set: { fetchedAt: new Date(Date.now() - 31 * 86_400_000) } });
    await refreshIfStale();
    expect(google).toHaveBeenCalledTimes(1);
  });

  it('keeps admin tools to admins and rejects bad place IDs', async () => {
    expect((await request(app).get('/api/v1/reviews/admin')).status).toBe(401);
    expect((await request(app).post('/api/v1/reviews/admin/refresh')).status).toBe(401);
    expect((await request(app).put('/api/v1/settings').set('Cookie', adminCookie).send({ googlePlaceId: 'bad id!' })).status).toBe(400);
  });
});
