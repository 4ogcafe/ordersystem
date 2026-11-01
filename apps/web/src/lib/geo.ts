/**
 * Browser-side geo helpers for the nearest-store feature.
 *
 *  - getCurrentPosition(): Promise wrapper around the Geolocation API with typed failure reasons
 *  - haversineKm():        great-circle distance in km
 *  - rankStoresByDistance(): stable nearest-first sort (stores without coordinates go last)
 */
import type { StoreLocation } from './stores';

export interface LatLng {
  lat: number;
  lng: number;
}

/** Mean Earth radius in km (IUGG). */
const EARTH_RADIUS_KM = 6371.0088;
const toRad = (deg: number) => (deg * Math.PI) / 180;

/** Haversine distance between two points, in kilometres. */
export function haversineKm(a: LatLng, b: LatLng): number {
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** True when the store has usable coordinates. */
export function storeLatLng(store: StoreLocation): LatLng | null {
  const { latitude: lat, longitude: lng } = store;
  if (typeof lat !== 'number' || typeof lng !== 'number' || !Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  if (Math.abs(lat) > 90 || Math.abs(lng) > 180) return null;
  return { lat, lng };
}

/** "1.2 km" (one decimal, as shown next to store names). */
export function formatKm(km: number): string {
  return `${km < 0.1 ? '0.1' : km.toFixed(1)} km`;
}

export interface RankedStore {
  store: StoreLocation;
  /** null when the store has no coordinates. */
  distanceKm: number | null;
}

/** Nearest first. Stores without coordinates keep their original relative order at the end. */
export function rankStoresByDistance(stores: StoreLocation[], origin: LatLng): RankedStore[] {
  return stores
    .map((store, index) => {
      const pos = storeLatLng(store);
      return { store, index, distanceKm: pos ? haversineKm(origin, pos) : null };
    })
    .sort((a, b) => {
      if (a.distanceKm === null && b.distanceKm === null) return a.index - b.index;
      if (a.distanceKm === null) return 1;
      if (b.distanceKm === null) return -1;
      return a.distanceKm - b.distanceKm || a.index - b.index;
    })
    .map(({ store, distanceKm }) => ({ store, distanceKm }));
}

export type GeoFailureReason = 'unsupported' | 'insecure' | 'denied' | 'unavailable' | 'timeout';

export class GeoError extends Error {
  readonly reason: GeoFailureReason;
  constructor(reason: GeoFailureReason) {
    super(reason);
    this.name = 'GeoError';
    this.reason = reason;
  }
}

/**
 * Asks the browser for the user's position.
 * Rejects with a GeoError whose `reason` tells the UI which message to show.
 */
export function getCurrentPosition(options: PositionOptions = {}): Promise<LatLng> {
  return new Promise((resolve, reject) => {
    if (typeof navigator === 'undefined' || !('geolocation' in navigator)) {
      reject(new GeoError('unsupported'));
      return;
    }
    // Geolocation only works in a secure context (HTTPS, or http://localhost during development).
    if (typeof window !== 'undefined' && window.isSecureContext === false) {
      reject(new GeoError('insecure'));
      return;
    }
    navigator.geolocation.getCurrentPosition(
      pos => resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
      err => {
        const reason: GeoFailureReason =
          err.code === err.PERMISSION_DENIED ? 'denied' : err.code === err.TIMEOUT ? 'timeout' : 'unavailable';
        reject(new GeoError(reason));
      },
      {
        enableHighAccuracy: true, // use GPS on phones when available
        timeout: 10_000, // give up after 10 s
        maximumAge: 5 * 60_000, // a fix from the last 5 minutes is fine for picking a branch
        ...options,
      },
    );
  });
}
