import { describe, expect, it } from 'vitest';
import { parsePickupHours, pickupSlots } from '../src/lib/pickup.js';

const base = { pickupEnabled: true, pickupHours: '11:30-12:00, 17:00-17:30', pickupLeadMinutes: 30, timezone: 'Asia/Tokyo' };
// 2026-10-13 (Tuesday) 10:00 in Tokyo.
const tuesdayMorning = new Date('2026-10-13T01:00:00Z');

describe('pickup hours', () => {
  it('parses several ranges and Japanese separators', () => {
    expect(parsePickupHours('11:30〜14:00、17:00-21:30')).toEqual([{ open: 690, close: 840 }, { open: 1020, close: 1290 }]);
  });

  it('ignores malformed text instead of offering random slots', () => {
    expect(parsePickupHours('lunch and dinner')).toEqual([]);
  });
});

describe('pickup slots', () => {
  it('offers 15-minute slots for today and tomorrow in the restaurant timezone', () => {
    const slots = pickupSlots(base, tuesdayMorning);
    expect(slots.filter((slot) => slot.date === '2026-10-13').map((slot) => slot.time)).toEqual(['11:30', '11:45', '12:00', '17:00', '17:15', '17:30']);
    expect(slots.some((slot) => slot.date === '2026-10-14')).toBe(true);
    expect(slots[0].at).toBe('2026-10-13T02:30:00.000Z');
  });

  it('skips slots inside the lead time', () => {
    const slots = pickupSlots(base, new Date('2026-10-13T02:40:00Z')); // 11:40 Tokyo
    expect(slots[0].time).toBe('17:00');
  });

  it('skips closed weekdays and closed dates', () => {
    const slots = pickupSlots({ ...base, pickupClosedDays: [2], pickupClosedDates: ['2026-10-14'] }, tuesdayMorning);
    expect(slots).toEqual([]);
  });

  it('offers nothing while ordering is switched off', () => {
    expect(pickupSlots({ ...base, pickupEnabled: false }, tuesdayMorning)).toEqual([]);
  });
});
