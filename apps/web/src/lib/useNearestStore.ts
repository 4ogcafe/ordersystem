/**
 * useNearestStore: finds the closest branch from the visitor's GPS position or from a postcode /
 * address they type in, and reports what happened in a human-friendly message.
 *
 * Flow
 *   locate() / locateByAddress(q)
 *     → origin (lat/lng)                      shared with other hook instances via sessionStorage
 *     → rank stores with Haversine            `ranked`, `distanceById`
 *     → nearest ≤ maxKm ? onSelect(store)     the caller saves it and fires adarsha:store-changed
 *                       : "no branch nearby"  selection left untouched
 *   On any failure the origin is cleared, so `ranked` falls back to the normal (unsorted) order.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { apiFetch, errorMessage } from './api';
import { formatKm, GeoError, getCurrentPosition, rankStoresByDistance, type GeoFailureReason, type LatLng, type RankedStore } from './geo';
import type { StoreLocation } from './stores';

/** Don't auto-select a branch further away than this. */
export const NEAREST_STORE_MAX_KM = 10;

export interface GeoOrigin extends LatLng {
  source: 'gps' | 'address';
  /** Geocoder label for address searches. */
  label?: string;
}

export type NearestStatus = 'idle' | 'locating' | 'searching' | 'selected' | 'too-far' | 'no-coords' | 'not-found' | 'failed';
export type NearestTone = 'info' | 'success' | 'warning' | 'error';

interface NearestState {
  status: NearestStatus;
  message: string;
  tone: NearestTone;
}

interface Options {
  stores: StoreLocation[];
  /** Called with the nearest store when it is within `maxKm`. Save it as an 'auto' selection here. */
  onSelect: (store: StoreLocation, distanceKm: number) => void;
  maxKm?: number;
}

// sessionStorage (cleared when the tab closes) so the order page and cart drawer share one lookup
// without keeping the visitor's location around long-term.
const ORIGIN_STORAGE_KEY = 'adarsha_geo_origin';
const ORIGIN_EVENT = 'adarsha:geo-origin';

function readOrigin(): GeoOrigin | null {
  try {
    const raw = sessionStorage.getItem(ORIGIN_STORAGE_KEY);
    const o = raw ? (JSON.parse(raw) as GeoOrigin) : null;
    return o && Number.isFinite(o.lat) && Number.isFinite(o.lng) ? o : null;
  } catch {
    return null;
  }
}

function publishOrigin(origin: GeoOrigin | null): void {
  try {
    if (origin) sessionStorage.setItem(ORIGIN_STORAGE_KEY, JSON.stringify(origin));
    else sessionStorage.removeItem(ORIGIN_STORAGE_KEY);
  } catch {
    // Storage unavailable: other components simply won't see the distances.
  }
  window.dispatchEvent(new CustomEvent<GeoOrigin | null>(ORIGIN_EVENT, { detail: origin }));
}

const MANUAL_HINT = '一覧から店舗をお選びいただくか、郵便番号・住所で検索してください。';

const FAILURE_MESSAGES: Record<GeoFailureReason, string> = {
  denied: `位置情報の利用が許可されていません。${MANUAL_HINT}`,
  timeout: `現在地の取得に時間がかかったため中断しました。${MANUAL_HINT}`,
  unavailable: `現在地を取得できませんでした。${MANUAL_HINT}`,
  unsupported: `お使いのブラウザは位置情報に対応していません。${MANUAL_HINT}`,
  insecure: `位置情報は安全な接続（HTTPS）でのみ利用できます。${MANUAL_HINT}`,
};

const IDLE: NearestState = { status: 'idle', message: '', tone: 'info' };

export function useNearestStore({ stores, onSelect, maxKm = NEAREST_STORE_MAX_KM }: Options) {
  const [origin, setOrigin] = useState<GeoOrigin | null>(readOrigin);
  const [state, setState] = useState<NearestState>(IDLE);

  // Refs so async callbacks always see the latest stores / callback without re-creating them.
  const storesRef = useRef(stores);
  const onSelectRef = useRef(onSelect);
  useEffect(() => {
    storesRef.current = stores;
    onSelectRef.current = onSelect;
  });
  // Ignore results from an older request if the user clicked again meanwhile.
  const requestId = useRef(0);

  // Pick up lookups made by another component (e.g. the cart drawer after the order page located).
  useEffect(() => {
    const onOrigin = (e: Event) => setOrigin((e as CustomEvent<GeoOrigin | null>).detail ?? null);
    window.addEventListener(ORIGIN_EVENT, onOrigin);
    return () => window.removeEventListener(ORIGIN_EVENT, onOrigin);
  }, []);

  const ranked: RankedStore[] = useMemo(
    () => (origin ? rankStoresByDistance(stores, origin) : stores.map(store => ({ store, distanceKm: null }))),
    [stores, origin],
  );

  const distanceById = useMemo(() => {
    const map = new Map<string, number>();
    for (const r of ranked) if (r.distanceKm !== null) map.set(r.store.id, r.distanceKm);
    return map;
  }, [ranked]);

  const fail = useCallback((status: NearestStatus, message: string, tone: NearestTone = 'warning') => {
    publishOrigin(null); // back to the normal, unsorted list
    setOrigin(null);
    setState({ status, message, tone });
  }, []);

  /** Ranks stores from `o`, auto-selects the nearest one if it is close enough, and sets the message. */
  const applyOrigin = useCallback(
    (o: GeoOrigin) => {
      const list = rankStoresByDistance(storesRef.current, o);
      const nearest = list[0];
      if (!nearest || nearest.distanceKm === null) {
        fail('no-coords', `店舗の位置情報が未登録のため、距離で並べ替えできませんでした。${MANUAL_HINT}`);
        return;
      }

      publishOrigin(o);
      setOrigin(o);
      const where = o.source === 'address' ? '入力された住所' : '現在地';

      if (nearest.distanceKm > maxKm) {
        setState({
          status: 'too-far',
          tone: 'warning',
          message: `${where}の近く（${maxKm} km以内）に店舗がありません。最寄りは「${nearest.store.name}」（約${formatKm(nearest.distanceKm)}）です。一覧から店舗をお選びください。`,
        });
        return;
      }

      onSelectRef.current(nearest.store, nearest.distanceKm);
      setState({
        status: 'selected',
        tone: 'success',
        message: `最寄りの店舗を選択しました：${nearest.store.name}（${where}から約${formatKm(nearest.distanceKm)}）`,
      });
    },
    [fail, maxKm],
  );

  /** Uses the browser Geolocation API (high accuracy, 10 s timeout). */
  const locate = useCallback(async () => {
    const id = ++requestId.current;
    setState({ status: 'locating', tone: 'info', message: '現在地を確認しています…' });
    try {
      const pos = await getCurrentPosition();
      if (id !== requestId.current) return;
      applyOrigin({ ...pos, source: 'gps' });
    } catch (err) {
      if (id !== requestId.current) return;
      const reason: GeoFailureReason = err instanceof GeoError ? err.reason : 'unavailable';
      fail('failed', FAILURE_MESSAGES[reason]);
    }
  }, [applyOrigin, fail]);

  /** Fallback: geocode a postcode or address on the server, then rank from there. */
  const locateByAddress = useCallback(
    async (query: string) => {
      const q = query.trim();
      if (q.length < 3) {
        setState({ status: 'not-found', tone: 'warning', message: '郵便番号（例：180-0022）または住所を入力してください。' });
        return;
      }
      const id = ++requestId.current;
      setState({ status: 'searching', tone: 'info', message: '住所を検索しています…' });
      try {
        // Public endpoint: no cookies needed, and the browser may reuse the server's 24 h cache.
        const res = await apiFetch(`/api/v1/stores/geocode?q=${encodeURIComponent(q)}`, { credentials: 'omit', cache: 'default' });
        if (id !== requestId.current) return;
        if (res.status === 404) {
          fail('not-found', `「${q}」の場所が見つかりませんでした。郵便番号や住所をご確認いただくか、一覧から店舗をお選びください。`);
          return;
        }
        if (!res.ok) {
          fail('failed', await errorMessage(res, `住所検索に失敗しました。${MANUAL_HINT}`), 'error');
          return;
        }
        const hit = (await res.json()) as { lat: number; lng: number; label?: string };
        if (id !== requestId.current) return;
        applyOrigin({ lat: hit.lat, lng: hit.lng, label: hit.label, source: 'address' });
      } catch {
        if (id !== requestId.current) return;
        fail('failed', `通信エラーのため住所検索ができませんでした。${MANUAL_HINT}`, 'error');
      }
    },
    [applyOrigin, fail],
  );

  const busy = state.status === 'locating' || state.status === 'searching';

  return { ...state, busy, origin, ranked, distanceById, locate, locateByAddress };
}
