import express from 'express';
import { z } from 'zod';
import { config } from '../config.js';
import { AppError } from '../lib/errors.js';
import { requireAdmin } from '../middleware/auth.js';
import { REFRESH_DAYS, clearReviewError, readCache, refreshIfStale, refreshReviews, searchPlaces } from '../services/google-reviews.js';
import { loadSettings } from '../services/settings-store.js';

const router = express.Router();

const DAY_MS = 24 * 60 * 60 * 1000;
// Google's terms allow only temporary copies: if refreshing keeps failing, stop showing the old text.
const MAX_AGE_DAYS = REFRESH_DAYS + 5;

interface ReviewSettings {
  name?: string | null;
  googlePlaceId?: string | null;
  googleReviewsMinRating?: number | null;
  storeReviewScore?: string | null;
  storeReviewLink?: string | null;
  googleMapsLink?: string | null;
  storeReviewCount?: number | null;
  featuredReviews?: { authorName: string; rating: number; text: string; dateLabel?: string }[] | null;
}

/** The rating and reviews for the website: live from Google when connected, otherwise the score typed in the admin. */
router.get('/', async (_req, res) => {
  const settings = (await loadSettings()) as ReviewSettings;
  // A month-old copy is refreshed in the background; this request answers straight away.
  void refreshIfStale();
  const cache = await readCache();
  const fresh = cache?.fetchedAt && cache.placeId === settings.googlePlaceId && Date.now() - new Date(cache.fetchedAt).getTime() < MAX_AGE_DAYS * DAY_MS;
  res.setHeader('Cache-Control', 'public, max-age=3600');

  const manual = Number.parseFloat(settings.storeReviewScore ?? '');
  const featured = (settings.featuredReviews ?? []).map((review) => ({
    authorName: review.authorName,
    authorUrl: null,
    authorPhoto: null,
    rating: review.rating,
    text: review.text,
    relativeTime: review.dateLabel ?? '',
    publishTime: null,
    reviewUrl: null,
  }));

  if (config.googlePlacesApiKey && settings.googlePlaceId && fresh && cache) {
    const minRating = settings.googleReviewsMinRating ?? 1;
    const filtered = cache.reviews.filter((review) => review.rating >= minRating && review.text);
    res.json({
      source: 'google',
      name: cache.name || settings.name || 'Adarsha Indian Cuisine',
      rating: cache.rating ?? (Number.isFinite(manual) ? manual : 4.5),
      userRatingCount: cache.userRatingCount ?? settings.storeReviewCount ?? 185,
      mapsUrl: cache.mapsUrl ?? settings.storeReviewLink ?? null,
      writeReviewUrl: `https://search.google.com/local/writereview?placeid=${encodeURIComponent(settings.googlePlaceId)}`,
      reviews: filtered.length > 0 ? filtered : featured,
      fetchedAt: cache.fetchedAt,
    });
    return;
  }
  // Until Google is connected: the score and reviews the restaurant entered in the admin.
  res.json({
    source: Number.isFinite(manual) || featured.length ? 'manual' : 'none',
    rating: Number.isFinite(manual) ? manual : null,
    userRatingCount: settings.storeReviewCount ?? null,
    mapsUrl: settings.storeReviewLink || settings.googleMapsLink || null,
    writeReviewUrl: settings.googlePlaceId ? `https://search.google.com/local/writereview?placeid=${encodeURIComponent(settings.googlePlaceId)}` : null,
    reviews: featured,
    fetchedAt: null,
  });
});

/** Connection status for the admin. */
router.get('/admin', requireAdmin, async (_req, res) => {
  const settings = (await loadSettings()) as ReviewSettings;
  const cache = await readCache();
  const sameplace = cache?.placeId === settings.googlePlaceId;
  res.setHeader('Cache-Control', 'no-store');
  res.json({
    hasKey: Boolean(config.googlePlacesApiKey),
    placeId: settings.googlePlaceId ?? null,
    minRating: settings.googleReviewsMinRating ?? 1,
    manual: { score: settings.storeReviewScore ?? '', count: settings.storeReviewCount ?? null, reviews: settings.featuredReviews ?? [] },
    name: sameplace ? (cache?.name ?? null) : null,
    rating: sameplace ? (cache?.rating ?? null) : null,
    userRatingCount: sameplace ? (cache?.userRatingCount ?? null) : null,
    reviewCount: sameplace ? (cache?.reviews.length ?? 0) : 0,
    fetchedAt: sameplace ? (cache?.fetchedAt ?? null) : null,
    nextRefreshAt: sameplace && cache?.fetchedAt ? new Date(new Date(cache.fetchedAt).getTime() + REFRESH_DAYS * DAY_MS) : null,
    lastError: sameplace ? (cache?.lastError ?? null) : null,
    lastErrorAt: sameplace ? (cache?.lastErrorAt ?? null) : null,
  });
});

const searchSchema = z.object({ query: z.string().trim().min(2).max(2000) });

router.post('/admin/search', requireAdmin, async (req, res) => {
  const { query } = searchSchema.parse(req.body);
  try {
    res.json(await searchPlaces(query));
  } catch (err) {
    throw new AppError(502, 'GOOGLE_ERROR', err instanceof Error ? err.message : 'Google search failed');
  }
});

router.post('/admin/refresh', requireAdmin, async (_req, res) => {
  try {
    const cache = await refreshReviews();
    res.json({ success: true, rating: cache.rating, userRatingCount: cache.userRatingCount, reviewCount: cache.reviews.length, fetchedAt: cache.fetchedAt });
  } catch (err) {
    throw new AppError(502, 'GOOGLE_ERROR', err instanceof Error ? err.message : 'Could not refresh reviews');
  }
});

router.post('/admin/clear-error', requireAdmin, async (_req, res) => {
  await clearReviewError();
  res.json({ success: true });
});

export default router;
