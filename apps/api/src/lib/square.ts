import { config } from '../config.js';

export function isSquareConfigured(): boolean {
  return Boolean(config.square.accessToken && config.square.locationId);
}

const BASE_URL = {
  sandbox: 'https://connect.squareupsandbox.com/v2',
  production: 'https://connect.squareup.com/v2',
};

export function squareBase(): string {
  return BASE_URL[config.square.environment] ?? BASE_URL.sandbox;
}

/** Typed Square API call using native fetch (Node 18+). Throws on non-2xx. */
export async function squareFetch<T = unknown>(
  method: string,
  path: string,
  body?: unknown,
): Promise<T> {
  const res = await fetch(`${squareBase()}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${config.square.accessToken}`,
      'Content-Type': 'application/json',
      'Square-Version': '2025-01-23',
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });

  const json = (await res.json()) as { errors?: { detail: string }[] } & T;
  if (!res.ok) {
    const msg = json?.errors?.[0]?.detail ?? `Square API error ${res.status}`;
    throw new Error(msg);
  }
  return json;
}

/** Yen to Square integer (JPY has no subunits — amount in yen = amount in "cents"). */
export const yenToAmount = (yen: number): number => Math.round(yen);
