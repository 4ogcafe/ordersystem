import { getStaffToken, getCustomerToken, clearStaffSession } from './auth-storage';

// Empty in development: Vite proxies /api and /uploads to the API (see vite.config.ts).
// In production set VITE_API_URL if the API is served from another origin.
const API_BASE = (import.meta.env.VITE_API_URL ?? '').replace(/\/$/, '');

// Matches http://localhost:PORT/uploads/, http://127.0.0.1:PORT/uploads/, https://pnglike.com/uploads/, https://adarsha.jp/uploads/
const UPLOAD_ORIGIN_REGEX = /^https?:\/\/[^/]+(?=\/uploads\/)/;
const DOMAIN_STRIP_REGEX = /^https?:\/\/(pnglike\.com|www\.pnglike\.com|adarsha\.jp|www\.adarsha\.jp|kalpnacurry\.com|www\.kalpnacurry\.com|localhost(:\d+)?|127\.0\.0\.1(:\d+)?)/i;
const PUBLIC_CACHE_MS = 60_000;

/**
 * Normalizes any image URL (relative, absolute localhost, or missing leading slashes)
 * so it works reliably in development, production, and nested routes (/admin/*, /menu/*).
 */
export function assetUrl(url: string | null | undefined): string {
  if (!url) return '';
  const trimmed = url.trim();
  if (!trimmed || trimmed === 'null' || trimmed === 'undefined') return '';

  // 1. External remote images (Unsplash, external CDN, data URIs, blob URIs)
  if (/^(data:|blob:|https?:\/\/images\.unsplash\.com|https?:\/\/plus\.unsplash\.com)/i.test(trimmed)) {
    return trimmed;
  }

  // 2. Strip origin if it points to an upload directory or self domain (kalpnacurry.com, adarsha.jp, localhost)
  let path = trimmed.replace(UPLOAD_ORIGIN_REGEX, '').replace(DOMAIN_STRIP_REGEX, '');

  // 3. Fix missing leading slash for uploads
  if (/^uploads\//i.test(path)) {
    path = `/${path}`;
  } else if (/^\/?public\/uploads\//i.test(path)) {
    path = path.replace(/^\/?public/, '');
  }

  // 3b. Map carousel slide images to clean versioned banners
  if (path.includes('hero-slide-1') || path.includes('1793707743') || path.includes('0d3ca7b4cb55a2c2') || path.includes('1791677310137')) {
    return `${API_BASE}/uploads/hero-slide-1-special-set-v2.webp`;
  }
  if (path.includes('hero-slide-2') || path.includes('1793707859') || path.includes('11e753d772ddb0d5') || path.includes('1791677360469')) {
    return `${API_BASE}/uploads/hero-slide-2-garlic-naan-v2.webp`;
  }
  if (path.includes('hero-slide-3') || path.includes('1793707977') || path.includes('52b4ff533e02d77d') || path.includes('1791677400636')) {
    return `${API_BASE}/uploads/hero-slide-3-green-salad-v2.webp`;
  }

  // 4. If path starts with /uploads/
  if (path.startsWith('/uploads/')) {
    return `${API_BASE}${path}`;
  }

  // 5. If it's a known upload filename without directory prefix (e.g. 179...-....jpg|webp|png)
  if (/^\d{10,14}-[a-zA-Z0-9_-]+\.(jpg|jpeg|png|webp|gif|svg)$/i.test(path)) {
    return `${API_BASE}/uploads/${path}`;
  }

  // 6. Root assets (logos, background images) - ensure they have a leading slash so nested routes don't break
  if (/^(adarsha-log|bg-hero-img|logo-white|new-logo|site-logo|web-logo)[^/]*\.(webp|png|jpg|svg)$/i.test(path)) {
    return `/${path}`;
  }

  // 7. If path is a relative path without leading slash, and not external http/https, prepend slash
  if (!/^https?:\/\//i.test(path) && !path.startsWith('/')) {
    return `/${path}`;
  }

  return path;
}

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

  // Attach verified QR session token if available for dine-in authorization
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

/** Public GET shared by every component on the page, so e.g. settings is fetched once, not per component. */
export function getPublic<T>(path: string): Promise<T> {
  const cached = publicCache.get(path);
  if (cached && cached.expires > Date.now()) return cached.promise as Promise<T>;

  const promise = fetch(`${API_BASE}${path}`).then((res) => {
    if (!res.ok) throw new Error(`GET ${path} failed with ${res.status}`);
    return res.json() as Promise<T>;
  });
  promise.catch(() => publicCache.delete(path));
  publicCache.set(path, { expires: Date.now() + PUBLIC_CACHE_MS, promise });
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
