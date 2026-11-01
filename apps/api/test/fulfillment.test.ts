import { describe, expect, it } from 'vitest';
import { deliveryFeeFor, isInDeliveryArea, slotsFor } from '../src/lib/fulfillment.js';

const address = { postalCode: '360-0023', prefecture: '埼玉県' as const, city: '熊谷市', line1: '1-2-3', building: '' };

describe('delivery area', () => {
  it('matches postal-code prefixes and town names, and allows anywhere when no area is set', () => {
    expect(isInDeliveryArea(address, ['360'])).toBe(true);
    expect(isInDeliveryArea(address, ['360-00'])).toBe(true);
    expect(isInDeliveryArea(address, ['熊谷市'])).toBe(true);
    expect(isInDeliveryArea(address, ['361', '行田市'])).toBe(false);
    expect(isInDeliveryArea(address, [])).toBe(true);
  });
});

describe('delivery fee', () => {
  it('is free from the threshold upwards', () => {
    expect(deliveryFeeFor({ deliveryFee: 300, deliveryFreeOver: 3000 }, 2999)).toBe(300);
    expect(deliveryFeeFor({ deliveryFee: 300, deliveryFreeOver: 3000 }, 3000)).toBe(0);
    expect(deliveryFeeFor({ deliveryFee: 300 }, 100000)).toBe(300);
  });
});

describe('delivery times', () => {
  const now = new Date('2026-10-13T01:00:00Z'); // 10:00 in Tokyo
  const base = { pickupEnabled: true, pickupHours: '11:00-12:00', pickupLeadMinutes: 0, timezone: 'Asia/Tokyo' };

  it('uses its own hours and notice, and is empty when switched off', () => {
    const delivery = slotsFor({ ...base, deliveryEnabled: true, deliveryHours: '17:00-17:30', deliveryLeadMinutes: 60 }, 'DELIVERY', now);
    expect(delivery.filter((slot) => slot.date === '2026-10-13').map((slot) => slot.time)).toEqual(['17:00', '17:15', '17:30']);
    expect(slotsFor({ ...base, deliveryEnabled: false }, 'DELIVERY', now)).toEqual([]);
  });

  it('falls back to the pickup hours when delivery has none', () => {
    const delivery = slotsFor({ ...base, deliveryEnabled: true, deliveryLeadMinutes: 0 }, 'DELIVERY', now);
    expect(delivery[0].time).toBe('11:00');
  });
});
