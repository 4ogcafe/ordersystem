import express from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { requireAdmin } from '../middleware/auth.js';
import { AppError } from '../lib/errors.js';
import { haversineKm, isValidLatLng, type LatLng } from '../lib/geo.js';
import { geocodeAddress, tryGeocode } from '../lib/geocode.js';
import { rateLimit } from '../middleware/rateLimit.js';

const router = express.Router();

export interface StoreLocation {
  id: string;
  number: string;
  name: string;
  area: string;
  badge: string;
  address: string;
  access: string;
  hours: string;
  holiday: string;
  phone: string;
  rating: number;
  reviewCount: number;
  mapEmbedUrl: string;
  /** WGS84 coordinates used by the nearest-store feature; null when unknown. */
  latitude?: number | null;
  longitude?: number | null;
  /** Response-only: true when the coordinates are the built-in station-level fallback. */
  coordsApproximate?: boolean;
}

export const DEFAULT_STORES: StoreLocation[] = [
  {
    id: 'musashisakai',
    number: '01',
    name: 'アダルサ 武蔵境店',
    area: '武蔵境・東京都武蔵野市',
    badge: '🍛 インド料理',
    address: '〒180-0022 東京都武蔵野市境2-14-10 クレール武蔵野1F',
    access: '武蔵境駅 nonowa口から徒歩1分',
    hours: 'ランチ 11:00–16:30 / ディナー 16:30–23:00',
    holiday: '年中無休',
    phone: '0422-36-2210',
    rating: 4.4,
    reviewCount: 325,
    mapEmbedUrl: 'https://maps.google.com/maps?q=%E6%9D%B1%E4%BA%AC%E9%83%BD%E6%AD%A6%E8%94%B5%E9%87%8E%E5%B8%82%E5%A2%832-14-10%20%E3%82%AF%E3%83%AC%E3%83%BC%E3%83%AB%E6%AD%A6%E8%94%B5%E9%87%8E&t=&z=16&ie=UTF8&iwloc=&output=embed',
  },
  {
    id: 'higashikoganei',
    number: '02',
    name: 'アダルサ 東小金井店',
    area: '東小金井・東京都小金井市',
    badge: '🍛 インド料理',
    address: '〒184-0002 東京都小金井市梶野町5-1-1',
    access: '東小金井駅 nonowa口から徒歩2分',
    hours: 'ランチ 11:00–16:30 / ディナー 16:30–23:00',
    holiday: '年中無休',
    phone: '042-385-2122',
    rating: 4.3,
    reviewCount: 285,
    mapEmbedUrl: 'https://maps.google.com/maps?q=%E6%9D%B1%E4%BA%AC%E9%83%BD%E5%B0%8F%E9%87%91%E4%BA%95%E5%B8%82%E6%A2%B6%E9%87%8E%E7%94%BA5-1-1&t=&z=16&ie=UTF8&iwloc=&output=embed',
  },
  {
    id: 'musashikoganei-1',
    number: '03',
    name: 'アダルサ 武蔵小金井店',
    area: '武蔵小金井・東京都小金井市',
    badge: '🍛 インド料理',
    address: '〒184-0004 東京都小金井市本町1-8-4 タイガービル1F',
    access: '武蔵小金井駅 北口から徒歩3分',
    hours: 'ランチ 11:00–16:30 / ディナー 16:30–23:00',
    holiday: '年中無休',
    phone: '042-385-6677',
    rating: 4.4,
    reviewCount: 310,
    mapEmbedUrl: 'https://maps.google.com/maps?q=%E6%9D%B1%E4%BA%AC%E9%83%BD%E5%B0%8F%E9%87%91%E4%BA%95%E5%B8%82%E6%9C%AC%E7%94%BA1-8-4&t=&z=16&ie=UTF8&iwloc=&output=embed',
  },
  {
    id: 'kokubunji',
    number: '04',
    name: 'アダルサ 国分寺店',
    area: '国分寺・東京都国分寺市',
    badge: '🍛 インド料理',
    address: '〒185-0012 東京都国分寺市本町3-4-15',
    access: '国分寺駅 北口から徒歩2分',
    hours: 'ランチ 11:00–16:30 / ディナー 16:30–23:00',
    holiday: '年中無休',
    phone: '042-321-5588',
    rating: 4.5,
    reviewCount: 295,
    mapEmbedUrl: 'https://maps.google.com/maps?q=%E6%9D%B1%E4%BA%AC%E9%83%BD%E5%9B%BD%E5%88%86%E5%AF%BA%E5%B8%82%E6%9C%AC%E7%94%BA3-4-15&t=&z=16&ie=UTF8&iwloc=&output=embed',
  },
  {
    id: 'chiba',
    number: '05',
    name: 'アダルサ 千葉店',
    area: '千葉・千葉県千葉市中央区',
    badge: '🍛 インド料理',
    address: '〒260-0015 千葉県千葉市中央区富士見2-7-1',
    access: 'JR千葉駅 東口から徒歩5分',
    hours: 'ランチ 11:00–16:30 / ディナー 16:30–23:00',
    holiday: '年中無休',
    phone: '043-224-3320',
    rating: 4.3,
    reviewCount: 240,
    mapEmbedUrl: 'https://maps.google.com/maps?q=%E5%8D%83%E8%91%89%E7%9C%8C%E5%8D%83%E8%91%89%E5%B8%82%E4%B8%AD%E5%A4%AE%E5%8C%BA%E5%AF%8C%E5%A3%AB%E8%A6%8B2-7-1&t=&z=16&ie=UTF8&iwloc=&output=embed',
  },
  {
    id: 'shinmaruko',
    number: '06',
    name: 'アダルサ 新丸子店',
    area: '新丸子・神奈川県川崎市中原区',
    badge: '🍛 インド料理',
    address: '〒211-0005 神奈川県川崎市中原区新丸子町738',
    access: '東急東横線 新丸子駅 東口から徒歩1分',
    hours: 'ランチ 11:00–16:30 / ディナー 16:30–23:00',
    holiday: '年中無休',
    phone: '044-733-5120',
    rating: 4.4,
    reviewCount: 260,
    mapEmbedUrl: 'https://maps.google.com/maps?q=%E7%A5%9E%E5%A5%88%E5%B7%9D%E7%9C%8C%E5%B7%9D%E5%B4%8E%E5%B8%82%E4%B8%AD%E5%8E%9F%E5%8C%BA%E6%96%B0%E4%B8%B8%E5%AD%90%E7%94%BA738&t=&z=16&ie=UTF8&iwloc=&output=embed',
  },
  {
    id: 'aroy',
    number: '07',
    name: 'タイ料理 アロイ',
    area: '武蔵小金井・東京都小金井市',
    badge: '🍲 本格タイ料理',
    address: '〒184-0004 東京都小金井市本町2-6-10',
    access: '武蔵小金井駅 北口から徒歩2分',
    hours: 'ランチ 11:30–15:00 / ディナー 17:00–23:00',
    holiday: '定休日: 月曜日',
    phone: '042-386-8800',
    rating: 4.5,
    reviewCount: 190,
    mapEmbedUrl: 'https://maps.google.com/maps?q=%E6%9D%B1%E4%BA%AC%E9%83%BD%E5%B0%8F%E9%87%91%E4%BA%95%E5%B8%82%E6%9C%AC%E7%94%BA2-6-10&t=&z=16&ie=UTF8&iwloc=&output=embed',
  },
  {
    id: 'musashikoganei-2',
    number: '08',
    name: 'アダルサ 武蔵小金井 第2店',
    area: '武蔵小金井・東京都小金井市',
    badge: '🍛 インド・アジアン料理',
    address: '〒184-0004 東京都小金井市本町5-19-7',
    access: '武蔵小金井駅 北口から徒歩4分',
    hours: 'ランチ 11:00–16:30 / ディナー 16:30–23:00',
    holiday: '年中無休',
    phone: '042-388-1122',
    rating: 4.3,
    reviewCount: 175,
    mapEmbedUrl: 'https://maps.google.com/maps?q=%E6%9D%B1%E4%BA%AC%E9%83%BD%E5%B0%8F%E9%87%91%E4%BA%95%E5%B8%82%E6%9C%AC%E7%94%BA5-19-7&t=&z=16&ie=UTF8&iwloc=&output=embed',
  },
  {
    id: 'takatsu',
    number: '09',
    name: 'ハーブ＆スパイス アダルサ 高津店',
    area: '高津・神奈川県川崎市高津区',
    badge: '🌿 ハーブ＆スパイス料理',
    address: '〒213-0001 神奈川県川崎市高津区溝口3-1-3',
    access: '東急田園都市線 高津駅 徒歩2分 / 溝の口駅 徒歩8分',
    hours: 'ランチ 11:00–16:00 / ディナー 17:00–23:00',
    holiday: '年中無休',
    phone: '044-811-9290',
    rating: 4.4,
    reviewCount: 220,
    mapEmbedUrl: 'https://maps.google.com/maps?q=%E7%A5%9E%E5%A5%88%E5%B7%9D%E7%9C%8C%E5%B7%9D%E5%B4%8E%E5%B8%82%E9%AB%98%E6%B4%A5%E5%8C%BA%E6%BA%9D%E5%8F%A33-1-3&t=&z=16&ie=UTF8&iwloc=&output=embed',
  },
  {
    id: 'hachioji',
    number: '10',
    name: 'アダルサ 八王子店',
    area: '八王子・東京都八王子市',
    badge: '🍛 インド料理',
    address: '〒192-0081 東京都八王子市中町3-2',
    access: 'JR八王子駅 北口から徒歩4分 / 京王八王子駅から徒歩7分',
    hours: 'ランチ 11:00–16:30 / ディナー 16:30–23:00',
    holiday: '年中無休',
    phone: '042-646-7780',
    rating: 4.3,
    reviewCount: 310,
    mapEmbedUrl: 'https://maps.google.com/maps?q=%E6%9D%B1%E4%BA%AC%E9%83%BD%E5%85%AB%E7%8E%8B%E5%AD%90%E5%B8%82%E4%B8%AD%E7%94%BA3-2&t=&z=16&ie=UTF8&iwloc=&output=embed',
  },
];

/**
 * Approximate (station-level, ±~500 m) coordinates for the built-in branches, keyed by store id.
 * Used only when a store has no latitude/longitude of its own, so older saved store lists keep
 * working with the nearest-store feature. Replace with exact values from the admin screen
 * (right-click the shop in Google Maps → copy the "35.70…, 139.54…" pair).
 */
const APPROX_STORE_COORDS: Record<string, LatLng> = {
  musashisakai: { lat: 35.7019, lng: 139.5437 },
  higashikoganei: { lat: 35.7011, lng: 139.5249 },
  musashikoganei: { lat: 35.6999, lng: 139.5077 },
  'musashikoganei-1': { lat: 35.6999, lng: 139.5077 },
  kokubunji: { lat: 35.701, lng: 139.4806 },
  chiba: { lat: 35.611, lng: 140.114 },
  shinmaruko: { lat: 35.5803, lng: 139.6612 },
  aroy: { lat: 35.7025, lng: 139.5055 },
  'musashikoganei-2': { lat: 35.703, lng: 139.503 },
  takatsu: { lat: 35.603, lng: 139.617 },
  hachioji: { lat: 35.659, lng: 139.3355 },
};

/** Ensures every store carries latitude/longitude when we know them (own value wins). */
function withCoords(stores: StoreLocation[]): StoreLocation[] {
  return stores.map((s) => {
    if (isValidLatLng(s.latitude, s.longitude)) return s;
    const approx = APPROX_STORE_COORDS[s.id];
    return approx
      ? { ...s, latitude: approx.lat, longitude: approx.lng, coordsApproximate: true }
      : { ...s, latitude: null, longitude: null };
  });
}

export async function getStoredStores(): Promise<StoreLocation[]> {
  try {
    const extRecord = await prisma.appSecret.findUnique({ where: { id: 'PAGE_SETTINGS_EXT' } });
    if (extRecord?.publicKey) {
      const data = JSON.parse(extRecord.publicKey);
      if (Array.isArray(data.storeLocations) && data.storeLocations.length > 0) {
        return data.storeLocations;
      }
    }
  } catch (err) {
    console.error('Failed to get stored stores:', err);
  }
  return DEFAULT_STORES;
}

async function saveStoredStores(stores: StoreLocation[]): Promise<void> {
  const existing = await prisma.appSecret.findUnique({ where: { id: 'PAGE_SETTINGS_EXT' } }).catch(() => null);
  const prev = existing?.publicKey ? JSON.parse(existing.publicKey) : {};
  const merged = { ...prev, storeLocations: stores };
  await prisma.appSecret.upsert({
    where: { id: 'PAGE_SETTINGS_EXT' },
    create: { id: 'PAGE_SETTINGS_EXT', publicKey: JSON.stringify(merged), privateKey: '' },
    update: { publicKey: JSON.stringify(merged) },
  });
}

const storeInputSchema = z.object({
  id: z.string().trim().optional(),
  name: z.string().trim().min(1, '店舗名を入力してください').max(100),
  area: z.string().trim().max(100).optional().default(''),
  badge: z.string().trim().max(50).optional().default('🍛 インド料理'),
  address: z.string().trim().min(1, '住所を入力してください').max(300),
  access: z.string().trim().max(200).optional().default(''),
  hours: z.string().trim().max(200).optional().default('ランチ 11:00–16:30 / ディナー 16:30–23:00'),
  holiday: z.string().trim().max(100).optional().default('年中無休'),
  phone: z.string().trim().max(50).optional().default(''),
  rating: z.coerce.number().min(0).max(5).optional().default(4.4),
  reviewCount: z.coerce.number().int().min(0).optional().default(100),
  mapEmbedUrl: z.string().trim().max(2000).optional().default(''),
  // Optional: left blank, the server geocodes the address when it is saved.
  latitude: optionalCoord(-90, 90),
  longitude: optionalCoord(-180, 180),
});

/** "" / null / undefined → null; otherwise a number within [min, max]. */
function optionalCoord(min: number, max: number) {
  return z.preprocess(
    (v) => (v === '' || v === null || v === undefined ? null : v),
    z.coerce.number().min(min).max(max).nullable(),
  ).optional();
}

/**
 * Works out the coordinates to store: explicit admin values win, then the previous values if the
 * address did not change, then a best-effort geocode of the address.
 */
async function resolveCoords(
  parsed: { address: string; latitude?: number | null; longitude?: number | null },
  existing?: StoreLocation,
): Promise<{ latitude: number | null; longitude: number | null }> {
  if (isValidLatLng(parsed.latitude, parsed.longitude)) {
    return { latitude: parsed.latitude!, longitude: parsed.longitude! };
  }
  if (existing && existing.address === parsed.address && isValidLatLng(existing.latitude, existing.longitude)) {
    return { latitude: existing.latitude!, longitude: existing.longitude! };
  }
  const hit = await tryGeocode(parsed.address);
  return hit ? { latitude: hit.lat, longitude: hit.lng } : { latitude: null, longitude: null };
}

function buildMapEmbedUrl(address: string, name?: string): string {
  const query = encodeURIComponent(`${address}${name ? ' ' + name : ''}`);
  return `https://maps.google.com/maps?q=${query}&t=&z=16&ie=UTF8&iwloc=&output=embed`;
}

// GET /api/v1/stores
router.get('/', async (_req, res) => {
  const stores = await getStoredStores();
  res.json(withCoords(stores));
});

const nearestQuerySchema = z.object({
  lat: z.coerce.number().min(-90).max(90),
  lng: z.coerce.number().min(-180).max(180),
  limit: z.coerce.number().int().min(1).max(50).optional().default(10),
  // Stores further than this are left out of the result entirely.
  maxKm: z.coerce.number().positive().max(20000).optional(),
});

/**
 * GET /api/v1/stores/nearest?lat=35.70&lng=139.54&limit=5&maxKm=10
 *
 * Returns stores sorted nearest-first, each with `distanceKm`. Stores without coordinates are
 * omitted. The branch list is a small JSON document, so Haversine in memory is the fastest option
 * here; with thousands of rows in their own table, push this into SQL instead (see
 * docs/NEAREST_STORE.md for MySQL ST_Distance_Sphere and PostGIS versions).
 */
router.get('/nearest', async (req, res) => {
  const { lat, lng, limit, maxKm } = nearestQuerySchema.parse(req.query);
  const origin = { lat, lng };
  const ranked = withCoords(await getStoredStores())
    .filter((s) => isValidLatLng(s.latitude, s.longitude))
    .map((s) => ({ ...s, distanceKm: Math.round(haversineKm(origin, { lat: s.latitude!, lng: s.longitude! }) * 100) / 100 }))
    .filter((s) => maxKm === undefined || s.distanceKm <= maxKm)
    .sort((a, b) => a.distanceKm - b.distanceKm)
    .slice(0, limit);
  res.json({ origin, stores: ranked });
});

const geocodeLimiter = rateLimit({ windowMs: 60_000, max: 10, key: (req) => `geocode:${req.ip}` });
const geocodeQuerySchema = z.object({ q: z.string().trim().min(3, '郵便番号または住所を入力してください').max(200) });

/**
 * GET /api/v1/stores/geocode?q=180-0022
 *
 * Turns a Japanese postcode or address into coordinates (OpenStreetMap Nominatim, proxied so we
 * can respect its usage policy). Responds 404 when nothing matches.
 */
router.get('/geocode', geocodeLimiter, async (req, res) => {
  const { q } = geocodeQuerySchema.parse(req.query);
  let hit;
  try {
    hit = await geocodeAddress(q);
  } catch {
    throw new AppError(503, 'GEOCODER_UNAVAILABLE', '住所検索サービスに接続できませんでした。時間をおいて再度お試しください。');
  }
  if (!hit) throw new AppError(404, 'NOT_FOUND', '該当する住所が見つかりませんでした。');
  res.setHeader('Cache-Control', 'public, max-age=86400');
  res.json(hit);
});

// POST /api/v1/stores (Admin)
router.post('/', requireAdmin, async (req, res) => {
  const parsed = storeInputSchema.parse(req.body);
  const stores = await getStoredStores();

  const nextNumber = String(stores.length + 1).padStart(2, '0');
  const id = parsed.id?.trim() || `store_${Date.now()}`;
  const mapEmbedUrl = parsed.mapEmbedUrl?.trim() || buildMapEmbedUrl(parsed.address, parsed.name);

  const newStore: StoreLocation = {
    id,
    number: nextNumber,
    name: parsed.name,
    area: parsed.area,
    badge: parsed.badge,
    address: parsed.address,
    access: parsed.access,
    hours: parsed.hours,
    holiday: parsed.holiday,
    phone: parsed.phone,
    rating: parsed.rating,
    reviewCount: parsed.reviewCount,
    mapEmbedUrl,
    ...(await resolveCoords(parsed)),
  };

  stores.push(newStore);
  // Renumber all stores
  stores.forEach((s, idx) => {
    s.number = String(idx + 1).padStart(2, '0');
  });

  await saveStoredStores(stores);
  res.status(201).json(newStore);
});

// PUT /api/v1/stores/reorder (Admin)
router.put('/reorder', requireAdmin, async (req, res) => {
  const { ids } = z.object({ ids: z.array(z.string()) }).parse(req.body);
  const stores = await getStoredStores();
  const storeMap = new Map(stores.map(s => [s.id, s]));

  const reordered: StoreLocation[] = [];
  for (const id of ids) {
    const s = storeMap.get(id);
    if (s) {
      reordered.push(s);
      storeMap.delete(id);
    }
  }
  // Append any unmentioned stores
  for (const remaining of storeMap.values()) {
    reordered.push(remaining);
  }

  // Renumber
  reordered.forEach((s, idx) => {
    s.number = String(idx + 1).padStart(2, '0');
  });

  await saveStoredStores(reordered);
  res.json(reordered);
});

// PUT /api/v1/stores/reset (Admin)
router.post('/reset', requireAdmin, async (_req, res) => {
  await saveStoredStores(DEFAULT_STORES);
  res.json(DEFAULT_STORES);
});

// PUT /api/v1/stores/:id (Admin)
router.put('/:id', requireAdmin, async (req, res) => {
  const storeId = req.params.id;
  const parsed = storeInputSchema.parse(req.body);
  const stores = await getStoredStores();

  const idx = stores.findIndex(s => s.id === storeId);
  if (idx === -1) {
    throw new AppError(404, 'NOT_FOUND', 'Store location not found');
  }

  const existing = stores[idx];
  const mapEmbedUrl = parsed.mapEmbedUrl?.trim() || buildMapEmbedUrl(parsed.address, parsed.name);

  const updated: StoreLocation = {
    ...existing,
    name: parsed.name,
    area: parsed.area,
    badge: parsed.badge,
    address: parsed.address,
    access: parsed.access,
    hours: parsed.hours,
    holiday: parsed.holiday,
    phone: parsed.phone,
    rating: parsed.rating,
    reviewCount: parsed.reviewCount,
    mapEmbedUrl,
    ...(await resolveCoords(parsed, existing)),
  };

  stores[idx] = updated;
  await saveStoredStores(stores);
  res.json(updated);
});

// DELETE /api/v1/stores/:id (Admin)
router.delete('/:id', requireAdmin, async (req, res) => {
  const storeId = req.params.id;
  let stores = await getStoredStores();

  const idx = stores.findIndex(s => s.id === storeId);
  if (idx === -1) {
    throw new AppError(404, 'NOT_FOUND', 'Store location not found');
  }

  stores.splice(idx, 1);
  // Renumber
  stores.forEach((s, i) => {
    s.number = String(i + 1).padStart(2, '0');
  });

  await saveStoredStores(stores);
  res.json({ success: true, count: stores.length });
});

export default router;
