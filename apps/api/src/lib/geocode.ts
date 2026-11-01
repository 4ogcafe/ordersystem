import { logger } from './logger.js';
import type { LatLng } from './geo.js';

/**
 * Server-side geocoding through OpenStreetMap Nominatim (free, no API key).
 *
 * Why proxy through the API instead of calling Nominatim from the browser?
 *  - Nominatim's usage policy (https://operations.osmfoundation.org/policies/nominatim/) requires
 *    an identifying User-Agent, max 1 request/second and caching. Browsers can't set User-Agent,
 *    and we can't enforce the rate limit across visitors from the client.
 *  - Swapping to Google / Mapbox later only touches this file, and their keys stay on the server.
 *
 * For heavy traffic, self-host Nominatim or move to a paid geocoder: the public instance is
 * best-effort and may block you.
 */

export interface GeocodeResult extends LatLng {
  /** Human-readable place name returned by the geocoder. */
  label: string;
}

const NOMINATIM_URL = process.env.GEOCODER_URL?.trim() || 'https://nominatim.openstreetmap.org/search';
// Identify the app as the policy requires. Set GEOCODER_USER_AGENT to include a contact URL/email.
const USER_AGENT = process.env.GEOCODER_USER_AGENT?.trim() || 'AdarshaRestaurantWeb/1.0 (store-locator)';
const REQUEST_TIMEOUT_MS = 6000;
const MIN_INTERVAL_MS = 1100; // public Nominatim: absolute max 1 req/s
const CACHE_TTL_MS = 24 * 60 * 60 * 1000;
const CACHE_MAX_ENTRIES = 1000;

const cache = new Map<string, { expires: number; value: GeocodeResult | null }>();
let nextSlot = 0;

/** Japanese postcode like 180-0022 or 1800022 (also accepts full-width digits). */
const POSTCODE_RE = /^〒?\s*(\d{3})-?(\d{4})$/;

function normalise(query: string): string {
  // Full-width digits / hyphens → ASCII so "１８０－００２２" matches the postcode pattern.
  return query
    .replace(/[０-９]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xfee0))
    .replace(/[－ー−‐]/g, '-')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Serialises outgoing requests so we never exceed MIN_INTERVAL_MS between them (per process). */
async function waitForSlot(): Promise<void> {
  const now = Date.now();
  const slot = Math.max(now, nextSlot);
  nextSlot = slot + MIN_INTERVAL_MS;
  if (slot > now) await new Promise((resolve) => setTimeout(resolve, slot - now));
}

/**
 * Geocode a Japanese postcode or address. Resolves to null when nothing was found.
 * Throws only on network / upstream errors so callers can tell "not found" from "service down".
 */
export async function geocodeAddress(rawQuery: string): Promise<GeocodeResult | null> {
  const query = normalise(rawQuery);
  if (!query) return null;

  const cached = cache.get(query);
  if (cached && cached.expires > Date.now()) return cached.value;

  const params = new URLSearchParams({
    format: 'jsonv2',
    limit: '1',
    countrycodes: 'jp', // all branches are in Japan; this greatly improves accuracy
    'accept-language': 'ja',
  });
  const postcode = query.match(POSTCODE_RE);
  if (postcode) params.set('postalcode', `${postcode[1]}-${postcode[2]}`);
  else params.set('q', query.replace(/^〒?\s*\d{3}-?\d{4}\s*/, '')); // a leading postcode confuses free-text search

  await waitForSlot();
  const res = await fetch(`${NOMINATIM_URL}?${params}`, {
    headers: { 'User-Agent': USER_AGENT, Accept: 'application/json' },
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
  if (!res.ok) throw new Error(`Geocoder responded with ${res.status}`);

  const data = (await res.json()) as Array<{ lat: string; lon: string; display_name?: string }>;
  const hit = data[0];
  const value: GeocodeResult | null = hit
    ? { lat: Number(hit.lat), lng: Number(hit.lon), label: hit.display_name || query }
    : null;

  if (cache.size >= CACHE_MAX_ENTRIES) cache.delete(cache.keys().next().value as string);
  cache.set(query, { expires: Date.now() + CACHE_TTL_MS, value });
  return value;
}

/** Best-effort variant for background use (e.g. filling store coordinates on save). Never throws. */
export async function tryGeocode(query: string): Promise<GeocodeResult | null> {
  try {
    return await geocodeAddress(query);
  } catch (err) {
    logger.warn({ err, query }, 'Geocoding failed');
    return null;
  }
}
