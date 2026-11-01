// Pickup-order rules shared by the order routes: which items can be ordered and which times can be chosen.
// Pure functions only (no req/res, no database) so they are easy to test.

export const SLOT_MINUTES = 15;
export const DEFAULT_LEAD_MINUTES = 30;
/** Today plus this many following days are offered as pickup days. */
export const EXTRA_PICKUP_DAYS = 1;
const DEFAULT_TIMEZONE = 'Asia/Tokyo';
const MINUTE_MS = 60_000;

/** "11:30-14:30, 17:00-21:30" (also accepts – ~ 〜 and 、 as separators). */
export const PICKUP_HOURS_PATTERN = /^\s*(\d{1,2}:\d{2}\s*[-–~〜]\s*\d{1,2}:\d{2})(\s*[,、]\s*\d{1,2}:\d{2}\s*[-–~〜]\s*\d{1,2}:\d{2})*\s*$/;

export interface PickupSettings {
  pickupEnabled?: boolean;
  pickupHours?: string | null;
  pickupClosedDays?: number[] | null;
  pickupClosedDates?: string[] | null;
  pickupLeadMinutes?: number | null;
  timezone?: string | null;
}

export interface PickupSlot {
  date: string; // YYYY-MM-DD in the restaurant's timezone
  time: string; // HH:MM
  at: string; // ISO instant
}

interface Window {
  open: number; // minutes after midnight
  close: number;
}

const toMinutes = (hhmm: string) => {
  const [hours, minutes] = hhmm.split(':').map(Number);
  return hours * 60 + minutes;
};

/** Parses pickup hours into minute ranges; malformed or inverted ranges are dropped. */
export function parsePickupHours(text: string | null | undefined): Window[] {
  if (!text || !PICKUP_HOURS_PATTERN.test(text)) return [];
  return text
    .split(/[,、]/)
    .map((range) => range.split(/[-–~〜]/).map((part) => toMinutes(part.trim())))
    .filter(([open, close]) => open < close && close <= 24 * 60)
    .map(([open, close]) => ({ open, close }));
}

interface LocalDate {
  year: number;
  month: number;
  day: number;
}

function wallClock(instant: number, timeZone: string) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(new Date(instant));
  const get = (type: string) => Number(parts.find((part) => part.type === type)?.value);
  return { year: get('year'), month: get('month'), day: get('day'), hour: get('hour'), minute: get('minute') };
}

/** The UTC instant at which the clock in `timeZone` shows the given local date and time. */
function zonedInstant(date: LocalDate, minutes: number, timeZone: string): number {
  const asUtc = Date.UTC(date.year, date.month - 1, date.day, 0, minutes);
  const offsetAt = (instant: number) => {
    const local = wallClock(instant, timeZone);
    return Date.UTC(local.year, local.month - 1, local.day, local.hour, local.minute) - Math.floor(instant / MINUTE_MS) * MINUTE_MS;
  };
  const first = asUtc - offsetAt(asUtc);
  // A second pass corrects the guess when a DST change falls between the two instants.
  return asUtc - offsetAt(first);
}

const pad = (value: number) => String(value).padStart(2, '0');
const dateKey = (date: LocalDate) => `${date.year}-${pad(date.month)}-${pad(date.day)}`;

function addDays(date: LocalDate, days: number): LocalDate {
  const shifted = new Date(Date.UTC(date.year, date.month - 1, date.day + days));
  return { year: shifted.getUTCFullYear(), month: shifted.getUTCMonth() + 1, day: shifted.getUTCDate() };
}

function validTimeZone(timeZone: string | null | undefined): string {
  if (!timeZone) return DEFAULT_TIMEZONE;
  try {
    new Intl.DateTimeFormat('en-US', { timeZone });
    return timeZone;
  } catch {
    return DEFAULT_TIMEZONE;
  }
}

/** The restaurant-local calendar date of an instant, as YYYY-MM-DD. */
export function localDateKey(instant: Date, timeZone: string | null | undefined): string {
  return dateKey(wallClock(instant.getTime(), validTimeZone(timeZone)));
}

/** Every pickup time a customer may choose right now, earliest first. */
export function pickupSlots(settings: PickupSettings, now: Date = new Date()): PickupSlot[] {
  if (!settings.pickupEnabled) return [];
  const windows = parsePickupHours(settings.pickupHours);
  if (windows.length === 0) return [];

  const timeZone = validTimeZone(settings.timezone);
  const closedDays = new Set(settings.pickupClosedDays ?? []);
  const closedDates = new Set(settings.pickupClosedDates ?? []);
  const earliest = now.getTime() + (settings.pickupLeadMinutes ?? DEFAULT_LEAD_MINUTES) * MINUTE_MS;
  const today = wallClock(now.getTime(), timeZone);

  const slots: PickupSlot[] = [];
  for (let offset = 0; offset <= EXTRA_PICKUP_DAYS; offset++) {
    const date = addDays(today, offset);
    const key = dateKey(date);
    const weekday = new Date(Date.UTC(date.year, date.month - 1, date.day)).getUTCDay();
    if (closedDays.has(weekday) || closedDates.has(key)) continue;

    for (const { open, close } of windows) {
      for (let minutes = open; minutes <= close; minutes += SLOT_MINUTES) {
        const at = zonedInstant(date, minutes, timeZone);
        if (at < earliest) continue;
        slots.push({ date: key, time: `${pad(Math.floor(minutes / 60))}:${pad(minutes % 60)}`, at: new Date(at).toISOString() });
      }
    }
  }
  return slots.sort((a, b) => a.at.localeCompare(b.at));
}

/** The instant the restaurant's day `key` (YYYY-MM-DD) starts, plus `days` whole days. */
export function localDayStart(key: string, timeZone: string | null | undefined, days = 0): Date {
  const [year, month, day] = key.split('-').map(Number);
  return new Date(zonedInstant(addDays({ year, month, day }, days), 0, validTimeZone(timeZone)));
}

/** Restaurant-local hour (0-23) and weekday (0 = Sunday) of an instant. */
export function localHourAndWeekday(instant: Date, timeZone: string | null | undefined): { hour: number; weekday: number } {
  const local = wallClock(instant.getTime(), validTimeZone(timeZone));
  return { hour: local.hour, weekday: new Date(Date.UTC(local.year, local.month - 1, local.day)).getUTCDay() };
}
