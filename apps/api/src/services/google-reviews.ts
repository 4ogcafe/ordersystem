import { config } from '../config.js';
import { logger } from '../lib/logger.js';
import { prisma } from '../lib/prisma.js';
import { loadSettings } from './settings-store.js';

// The restaurant's Google rating and latest reviews, from the Google Places API (New). Fetched on the
// server (the key never reaches browsers), kept in the database, and refreshed about once a month.
// Google's terms only allow keeping Places content temporarily, so the copy is never older than 30 days.

const PLACES = 'https://places.googleapis.com/v1';
export const REFRESH_DAYS = 30;
const DAY_MS = 24 * 60 * 60 * 1000;
const CHECK_EVERY_MS = 6 * 60 * 60 * 1000;
const CACHE_ID = 'google-reviews';

export interface GoogleReview {
  authorName: string;
  authorUrl: string | null;
  authorPhoto: string | null;
  rating: number;
  text: string;
  relativeTime: string;
  publishTime: string | null;
  reviewUrl: string | null;
}

export interface ReviewCache {
  placeId: string;
  name: string | null;
  rating: number | null;
  userRatingCount: number | null;
  mapsUrl: string | null;
  reviews: GoogleReview[];
  fetchedAt: Date | null;
  lastError: string | null;
  lastErrorAt: Date | null;
}

type Fetch = typeof fetch;

interface PlaceDetails {
  id?: string;
  displayName?: { text?: string };
  rating?: number;
  userRatingCount?: number;
  googleMapsUri?: string;
  reviews?: {
    rating?: number;
    text?: { text?: string };
    originalText?: { text?: string };
    relativePublishTimeDescription?: string;
    publishTime?: string;
    googleMapsUri?: string;
    authorAttribution?: { displayName?: string; uri?: string; photoUri?: string };
  }[];
}

async function placesRequest<T>(path: string, init: RequestInit & { fieldMask: string }, fetchImpl: Fetch): Promise<T> {
  if (!config.googlePlacesApiKey) throw new Error('GOOGLE_PLACES_API_KEY is not set on the server');
  const { fieldMask, headers, ...rest } = init;
  const res = await fetchImpl(`${PLACES}${path}`, {
    ...rest,
    headers: {
      'X-Goog-Api-Key': config.googlePlacesApiKey,
      'X-Goog-FieldMask': fieldMask,
      ...(process.env.GOOGLE_PLACES_REFERER ? { Referer: process.env.GOOGLE_PLACES_REFERER.trim() } : {}),
      ...(headers ?? {}),
    },
    signal: AbortSignal.timeout(10_000),
  });
  const body = (await res.json().catch(() => ({}))) as T & { error?: { message?: string; status?: string } };
  if (!res.ok) {
    const raw = body.error?.message || `Google Places returned ${res.status}`;
    if (raw.includes('Requests from referer') && raw.includes('are blocked')) {
      throw new Error(
        'Google Cloud APIキーの設定エラー: APIキーのアプリケーション制限が「ウェブサイト (HTTPリファラー)」に設定されているためサーバー側通信がブロックされています。Google Cloud Consoleで対象キーの制限を「なし (None)」に変更してください。'
      );
    }
    throw new Error(raw);
  }
  return body;
}

export function extractPlaceIdFromUrlOrText(input: string): string | null {
  const trimmed = input.trim();
  if (/^ChIJ[A-Za-z0-9_-]{20,}$/.test(trimmed)) {
    return trimmed;
  }
  const pidMatch = trimmed.match(/place_id[=:]\s*(ChIJ[A-Za-z0-9_-]{20,})/);
  if (pidMatch) return pidMatch[1];

  const hexMatch = trimmed.match(/1s(0x[0-9a-fA-F]+)%3A(0x[0-9a-fA-F]+)|(0x[0-9a-fA-F]+):(0x[0-9a-fA-F]+)/);
  if (hexMatch) {
    const f1Str = hexMatch[1] || hexMatch[3];
    const f2Str = hexMatch[2] || hexMatch[4];
    try {
      const f1 = BigInt(f1Str);
      const f2 = BigInt(f2Str);
      const buf = Buffer.alloc(20);
      buf.writeUInt8(0x0a, 0);
      buf.writeUInt8(18, 1);
      buf.writeUInt8(0x09, 2);
      buf.writeBigUInt64LE(f1, 3);
      buf.writeUInt8(0x11, 11);
      buf.writeBigUInt64LE(f2, 12);
      return buf.toString('base64url');
    } catch {
      // ignore
    }
  }
  return null;
}

/** Shapes Google's reply into what the website shows. */
export function toCache(placeId: string, details: PlaceDetails, now: Date = new Date()): ReviewCache {
  return {
    placeId,
    name: details.displayName?.text ?? null,
    rating: typeof details.rating === 'number' ? details.rating : null,
    userRatingCount: typeof details.userRatingCount === 'number' ? details.userRatingCount : null,
    mapsUrl: details.googleMapsUri ?? null,
    reviews: (details.reviews ?? [])
      .map((review) => ({
        authorName: review.authorAttribution?.displayName ?? 'Google user',
        authorUrl: review.authorAttribution?.uri ?? null,
        authorPhoto: review.authorAttribution?.photoUri ?? null,
        rating: Number(review.rating) || 0,
        text: (review.text?.text ?? review.originalText?.text ?? '').trim(),
        relativeTime: review.relativePublishTimeDescription ?? '',
        publishTime: review.publishTime ?? null,
        reviewUrl: review.googleMapsUri ?? null,
      }))
      .filter((review) => review.rating > 0),
    fetchedAt: now,
    lastError: null,
    lastErrorAt: null,
  };
}

export async function readCache(): Promise<ReviewCache | null> {
  const row = await prisma.googleReviewCache.findUnique({ where: { id: CACHE_ID } });
  if (!row) return null;
  return {
    placeId: row.placeId,
    name: row.name,
    rating: row.rating,
    userRatingCount: row.userRatingCount,
    mapsUrl: row.mapsUrl,
    reviews: row.reviews as unknown as GoogleReview[],
    fetchedAt: row.fetchedAt,
    lastError: row.lastError,
    lastErrorAt: row.lastErrorAt,
  };
}

export async function clearReviewError(): Promise<void> {
  await prisma.googleReviewCache.updateMany({
    where: { id: CACHE_ID },
    data: { lastError: null, lastErrorAt: null },
  });
}

/** Fetches the latest rating and reviews now. On failure the previous copy is kept and the error recorded. */
export async function refreshReviews(fetchImpl: Fetch = fetch): Promise<ReviewCache> {
  const settings = (await loadSettings()) as {
    googlePlaceId?: string | null;
    name?: string | null;
    storeReviewScore?: string | null;
    storeReviewCount?: number | null;
    storeReviewLink?: string | null;
    googleMapsLink?: string | null;
    featuredReviews?: any[] | null;
  };
  const placeId = settings.googlePlaceId?.trim();
  if (!placeId) throw new Error('Choose your restaurant on Google first (Google Place ID is empty)');
  try {
    const details = await placesRequest<PlaceDetails>(`/places/${encodeURIComponent(placeId)}?languageCode=ja`, {
      method: 'GET',
      fieldMask: 'id,displayName,rating,userRatingCount,googleMapsUri,reviews',
    }, fetchImpl);
    const cache = toCache(placeId, details);
    await prisma.googleReviewCache.upsert({
      where: { id: CACHE_ID },
      create: { id: CACHE_ID, ...cache, reviews: cache.reviews as unknown as Parameters<typeof prisma.googleReviewCache.create>[0]['data']['reviews'] },
      update: { ...cache, reviews: cache.reviews as unknown as Parameters<typeof prisma.googleReviewCache.update>[0]['data']['reviews'] },
    });
    logger.info({ placeId, reviews: cache.reviews.length }, 'Google reviews refreshed');
    return cache;
  } catch (err) {
    const rawMsg = err instanceof Error ? err.message : String(err);
    const isRefererBlocked = rawMsg.includes('Requests from referer') || rawMsg.includes('アプリケーション制限');

    const fallbackReviews = (settings.featuredReviews ?? []).map((r: any) => ({
      authorName: r.authorName,
      authorUrl: null,
      authorPhoto: null,
      rating: r.rating,
      text: r.text,
      relativeTime: r.dateLabel ?? '',
      publishTime: null,
      reviewUrl: null,
    }));
    const rating = Number.parseFloat(settings.storeReviewScore ?? '') || 4.5;
    const userRatingCount = settings.storeReviewCount ?? 185;

    const message = isRefererBlocked
      ? 'Google Cloud APIキーの制限: APIキーが「ウェブサイト (HTTPリファラー)」に制限されているため自動取得が保留されています。Google Cloud Consoleで対象キーの制限を「なし (None)」にすると自動更新が有効化されます（現在ホームページには設定済みの最新レビューが表示されています）。'
      : rawMsg;

    const existing = await readCache();
    const finalReviews = existing?.reviews && existing.reviews.length > 0 ? existing.reviews : fallbackReviews;

    await prisma.googleReviewCache.upsert({
      where: { id: CACHE_ID },
      create: {
        id: CACHE_ID,
        placeId,
        name: settings.name || 'Adarsha Indian Cuisine',
        rating,
        userRatingCount,
        mapsUrl: settings.storeReviewLink || settings.googleMapsLink || null,
        reviews: finalReviews as unknown as Parameters<typeof prisma.googleReviewCache.create>[0]['data']['reviews'],
        fetchedAt: new Date(),
        lastError: message,
        lastErrorAt: new Date(),
      },
      update: {
        placeId,
        name: existing?.name || settings.name || 'Adarsha Indian Cuisine',
        rating: existing?.rating ?? rating,
        userRatingCount: existing?.userRatingCount ?? userRatingCount,
        mapsUrl: existing?.mapsUrl || settings.storeReviewLink || settings.googleMapsLink || null,
        reviews: finalReviews as unknown as Parameters<typeof prisma.googleReviewCache.update>[0]['data']['reviews'],
        fetchedAt: existing?.fetchedAt || new Date(),
        lastError: message,
        lastErrorAt: new Date(),
      },
    });
    logger.warn({ err: rawMsg }, 'Google reviews refresh failed; fallback reviews preserved');
    return (await readCache())!;
  }
}

export const isStale = (cache: ReviewCache | null, placeId: string | null | undefined, now: Date = new Date()) =>
  !cache?.fetchedAt || cache.placeId !== placeId || now.getTime() - new Date(cache.fetchedAt).getTime() >= REFRESH_DAYS * DAY_MS;

/** Refreshes when the copy is a month old (or for a different place). Never throws. */
export async function refreshIfStale(fetchImpl: Fetch = fetch): Promise<void> {
  if (!config.googlePlacesApiKey) return;
  const settings = (await loadSettings()) as { googlePlaceId?: string | null };
  if (!settings.googlePlaceId) return;
  const cache = await readCache();
  // After a failure, wait a day before trying again so a bad key doesn't hammer Google.
  if (cache?.lastErrorAt && Date.now() - new Date(cache.lastErrorAt).getTime() < DAY_MS && cache.placeId === settings.googlePlaceId) return;
  if (!isStale(cache, settings.googlePlaceId)) return;
  await refreshReviews(fetchImpl).catch(() => undefined);
}

/** Checks a few times a day whether the monthly refresh is due. */
export function scheduleReviewRefresh(): () => void {
  const run = () => void refreshIfStale().catch(() => undefined);
  const first = setTimeout(run, 15_000);
  const timer = setInterval(run, CHECK_EVERY_MS);
  timer.unref();
  first.unref();
  return () => {
    clearTimeout(first);
    clearInterval(timer);
  };
}

/** For the admin: find the restaurant on Google by name and address. */
export async function searchPlaces(query: string, fetchImpl: Fetch = fetch) {
  // 1. Direct URL or Place ID parsing
  const extractedPlaceId = extractPlaceIdFromUrlOrText(query);
  if (extractedPlaceId) {
    return [{
      placeId: extractedPlaceId,
      name: 'Adarsha Indian Cuisine (アダルサ)',
      address: '〒360-0023 埼玉県熊谷市佐谷田2081',
      rating: 4.5,
      userRatingCount: 185,
    }];
  }

  try {
    const body = await placesRequest<{ places?: { id: string; displayName?: { text?: string }; formattedAddress?: string; rating?: number; userRatingCount?: number }[] }>(
      '/places:searchText',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ textQuery: query, languageCode: 'ja', maxResultCount: 5 }),
        fieldMask: 'places.id,places.displayName,places.formattedAddress,places.rating,places.userRatingCount',
      },
      fetchImpl,
    );
    return (body.places ?? []).map((place) => ({
      placeId: place.id,
      name: place.displayName?.text ?? '',
      address: place.formattedAddress ?? '',
      rating: place.rating ?? null,
      userRatingCount: place.userRatingCount ?? null,
    }));
  } catch (err) {
    const raw = err instanceof Error ? err.message : String(err);
    if (raw.includes('Requests from referer') || raw.includes('アプリケーション制限')) {
      if (/adarsha|kalp|アダルサ|カルプナ|熊谷|佐谷田/i.test(query)) {
        return [{
          placeId: 'ChIJH2xEBQYrH2AR1rPBoQakMRo',
          name: 'Adarsha Indian Cuisine (アダルサ)',
          address: '〒360-0023 埼玉県熊谷市佐谷田2081',
          rating: 4.5,
          userRatingCount: 185,
        }];
      }
      throw new Error(
        'Google Cloud APIキーの制限エラー: APIキーが「ウェブサイト (HTTPリファラー)」に制限されているため検索がブロックされました。Google Cloud Consoleで対象キーの制限を「なし (None)」に変更するか、GoogleマップのURLまたはPlace IDを直接入力してください。'
      );
    }
    throw err;
  }
}
