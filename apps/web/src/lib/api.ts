import { getStaffToken, getCustomerToken, clearStaffSession } from './auth-storage';

/**
 * Empty in development: Vite proxies /api and /uploads to the API (see vite.config.ts).
 * On order.adarsha.jp the SPA still needs the main API for JSON — media stays same-origin.
 */
function resolveApiBase(): string {
  const fromEnv = (import.meta.env.VITE_API_URL ?? '').replace(/\/$/, '');
  if (fromEnv) return fromEnv;
  if (typeof window !== 'undefined') {
    const host = window.location.hostname.toLowerCase();
    if (
      host === 'order.adarsha.jp' ||
      (host.endsWith('.adarsha.jp') && host !== 'adarsha.jp' && host !== 'www.adarsha.jp')
    ) {
      return 'https://adarsha.jp';
    }
  }
  return '';
}

const API_BASE = resolveApiBase();

// Any host in front of /uploads/ is this app's own file, including older copies of the site.
const UPLOAD_ORIGIN_REGEX = /^https?:\/\/[^/]+(?=\/uploads\/)/;
const DOMAIN_STRIP_REGEX = /^https?:\/\/((?:[\w-]+\.)?adarsha\.jp|localhost(:\d+)?|127\.0\.0\.1(:\d+)?)/i;
const LOCAL_IMAGE = '';
const PUBLIC_CACHE_MS = 60_000;

/**
 * Normalizes image URLs to same-origin paths.
 * adarsha.jp and order.adarsha.jp each keep their own /uploads — never cross-host.
 */
export function assetUrl(url: string | null | undefined): string {
  if (!url) return '';
  const trimmed = url.trim();
  if (!trimmed || trimmed === 'null' || trimmed === 'undefined') return '';

  // Drop the old placeholder / stock photos — show nothing instead of a default image.
  if (/bg-hero-img/i.test(trimmed) || /unsplash\.com/i.test(trimmed)) return LOCAL_IMAGE;
  if (/^(data:|blob:)/i.test(trimmed)) return trimmed;

  // Strip any adarsha host so the current domain serves its own copy of the file.
  let path = trimmed.replace(UPLOAD_ORIGIN_REGEX, '').replace(DOMAIN_STRIP_REGEX, '');

  if (/^uploads\//i.test(path)) {
    path = `/${path}`;
  } else if (/^\/?public\/uploads\//i.test(path)) {
    path = path.replace(/^\/?public/, '');
  }

  if (path.includes('hero-slide-1') || path.includes('1793707743') || path.includes('0d3ca7b4cb55a2c2') || path.includes('1791677310137')) {
    return `/uploads/hero-slide-1-special-set-v2.webp`;
  }
  if (path.includes('hero-slide-2') || path.includes('1793707859') || path.includes('11e753d772ddb0d5') || path.includes('1791677360469')) {
    return `/uploads/hero-slide-2-garlic-naan-v2.webp`;
  }
  if (path.includes('hero-slide-3') || path.includes('1793707977') || path.includes('52b4ff533e02d77d') || path.includes('1791677400636')) {
    return `/uploads/hero-slide-3-green-salad-v2.webp`;
  }

  const bare = path.replace(/^\//, '');

  if (/^(adarsha-log|logo-white|new-logo|site-logo|web-logo)[^/]*\.(webp|png|jpg|svg)$/i.test(bare)) {
    return `/uploads/${bare}`;
  }

  if (path.startsWith('/uploads/')) {
    return path;
  }

  if (/^\d{10,14}-[a-zA-Z0-9_-]+\.(jpg|jpeg|png|webp|gif|svg)$/i.test(bare)) {
    return `/uploads/${bare}`;
  }

  if (/^\/[\w.-]+\.(webp|png|jpe?g|gif|svg)$/i.test(path) && !path.includes('/', 1)) {
    return `/uploads/${bare}`;
  }

  if (!/^https?:\/\//i.test(path) && !path.startsWith('/')) {
    return `/${path}`;
  }

  return path;
}

/** Canonical logo paths (also imported via BrandMark for hashed Vite assets). */
export const SITE_LOGO_URL = '/brand/adarsha-logo.webp';
export const SITE_OG_IMAGE_URL = '/brand/site-logo.webp';
export const SITE_LOGO_SVG_URL = '/brand/adarsha-stamp-logo.svg';

/** Authenticated request: sends session cookies and Authorization Bearer header, never using HTTP cache. */
export async function apiFetch(path: string, init: RequestInit = {}): Promise<Response> {
  const staffToken = getStaffToken();
  const customerToken = getCustomerToken();
  const isCustomerPath = path.includes('/customers') || path.includes('/customer');
  const token = isCustomerPath ? (customerToken || staffToken) : (staffToken || customerToken);

  const headers = new Headers(init.headers || {});
  if (token && !headers.has('Authorization')) {
    headers.set('Authorization', `Bearer ${token}`);
  }

  try {
    if (typeof window !== 'undefined' && !headers.has('X-QR-Session')) {
      const rawQr = sessionStorage.getItem('adarsha_qr_session');
      if (rawQr) {
        const parsed = JSON.parse(rawQr);
        if (parsed?.sessionToken) {
          headers.set('X-QR-Session', parsed.sessionToken);
        }
      }
    }
  } catch {}

  const res = await fetch(`${API_BASE}${path}`, {
    cache: 'no-store',
    credentials: 'include',
    ...init,
    headers,
  });

  if (res.status === 401 && typeof window !== 'undefined') {
    const p = window.location.pathname;
    if (p.startsWith('/admin') || p.startsWith('/kitchen') || p.startsWith('/cash-counter') || p.startsWith('/cashier')) {
      clearStaffSession();
      window.location.assign('/login?reason=session_expired');
    }
  }
  return res;
}

const publicCache = new Map<string, { expires: number; promise: Promise<unknown> }>();

/** Drop cached public GETs (e.g. after a failed dine-in menu load). */
export function clearPublicCache(prefix = '/api/v1/menu'): void {
  for (const key of publicCache.keys()) {
    if (key.startsWith(prefix)) publicCache.delete(key);
  }
}

/** Public GET shared by every component on the page, so e.g. settings is fetched once, not per component. */
export function getPublic<T>(path: string): Promise<T> {
  const fresh = path.startsWith('/api/v1/orders/slots');
  const cached = publicCache.get(path);
  if (!fresh && cached && cached.expires > Date.now()) return cached.promise as Promise<T>;

  const promise = fetch(`${API_BASE}${path}`, { cache: 'no-store' }).then((res) => {
    if (!res.ok) throw new Error(`GET ${path} failed with ${res.status}`);
    return res.json() as Promise<T>;
  });
  promise.catch(() => publicCache.delete(path));
  if (!fresh) publicCache.set(path, { expires: Date.now() + PUBLIC_CACHE_MS, promise });
  return promise;
}

/** Reads the message from the API's { error: { message } } shape. */
export async function errorMessage(res: Response, fallback: string): Promise<string> {
  try {
    const body = await res.json();
    return body?.error?.message || fallback;
  } catch {
    return fallback;
  }
}
