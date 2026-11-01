// Shared by the overview charts.

/** Categorical slots 1-2 of the reference palette (validated together on white). */
export const SERIES = { blue: '#2a78d6', orange: '#eb6834', aqua: '#1baf7a' };

/** 0, 2.5K, 12K, 1.2M — for axis ticks. */
export function compact(value: number): string {
  const abs = Math.abs(value);
  if (abs >= 1_000_000) return `${+(value / 1_000_000).toFixed(1)}M`;
  if (abs >= 1_000) return `${+(value / 1_000).toFixed(abs >= 10_000 ? 0 : 1)}K`;
  return String(Math.round(value));
}

