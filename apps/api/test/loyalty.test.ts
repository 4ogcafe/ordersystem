import { describe, expect, it } from 'vitest';
import { isOfferLive, loyaltyConfig, offerDiscount, priceBreakdown } from '../src/lib/loyalty.js';
import { consumptionTax, taxRatePercent } from '../src/lib/tax.js';

const loyalty = loyaltyConfig({});

describe('offers', () => {
  it('takes a percentage or a fixed amount, never more than the subtotal', () => {
    expect(offerDiscount({ discountType: 'PERCENT', discountValue: 10 }, 2345)).toBe(234);
    expect(offerDiscount({ discountType: 'AMOUNT', discountValue: 500 }, 300)).toBe(300);
  });

  it('gives nothing below the minimum order', () => {
    expect(offerDiscount({ discountType: 'AMOUNT', discountValue: 500, minSubtotal: 3000 }, 2999)).toBe(0);
  });

  it('is live only inside its dates and while active', () => {
    const now = new Date('2026-10-13T00:00:00Z');
    expect(isOfferLive({ discountType: 'AMOUNT', discountValue: 1, endsAt: new Date('2026-10-12T00:00:00Z') }, now)).toBe(false);
    expect(isOfferLive({ discountType: 'AMOUNT', discountValue: 1, startsAt: new Date('2026-10-14T00:00:00Z') }, now)).toBe(false);
    expect(isOfferLive({ discountType: 'AMOUNT', discountValue: 1, isActive: false }, now)).toBe(false);
    expect(isOfferLive({ discountType: 'AMOUNT', discountValue: 1 }, now)).toBe(true);
  });
});

describe('price breakdown', () => {
  it('applies the offer first, then points, and earns on what is actually paid', () => {
    const result = priceBreakdown({
      subtotal: 3000, offer: { discountType: 'AMOUNT', discountValue: 500 }, pointsRequested: 200, pointsBalance: 1000, loyalty, isMember: true,
    });
    expect(result).toEqual({ subtotal: 3000, offerDiscount: 500, rewardDiscount: 0, pointsUsed: 200, pointsDiscount: 200, total: 2300, pointsToEarn: 23 });
  });

  it('takes a stamp reward off after the offer, never below zero', () => {
    const offer = { discountType: 'AMOUNT' as const, discountValue: 500 };
    expect(priceBreakdown({ subtotal: 3000, offer, rewardAmount: 1000, loyalty, isMember: true })).toMatchObject({ rewardDiscount: 1000, total: 1500 });
    expect(priceBreakdown({ subtotal: 800, offer, rewardAmount: 1000, loyalty, isMember: true })).toMatchObject({ rewardDiscount: 300, total: 0 });
  });

  it('never uses more points than the balance or the amount left to pay', () => {
    expect(priceBreakdown({ subtotal: 1000, pointsRequested: 5000, pointsBalance: 300, loyalty, isMember: true }).pointsUsed).toBe(300);
    expect(priceBreakdown({ subtotal: 1000, pointsRequested: 5000, pointsBalance: 9000, loyalty, isMember: true }).total).toBe(0);
  });

  it('gives guests no points, and nothing when the program is off', () => {
    expect(priceBreakdown({ subtotal: 1000, pointsRequested: 100, pointsBalance: 100, loyalty, isMember: false })).toMatchObject({ pointsUsed: 0, pointsToEarn: 0 });
    const off = loyaltyConfig({ pointsEnabled: false });
    expect(priceBreakdown({ subtotal: 1000, pointsRequested: 100, pointsBalance: 100, loyalty: off, isMember: true })).toMatchObject({ pointsUsed: 0, pointsToEarn: 0 });
  });
});

describe('consumption tax', () => {
  it('defaults to the 8% takeout rate and rounds down to the yen', () => {
    expect(taxRatePercent({})).toBe(8);
    expect(consumptionTax(2345, 8)).toBe(187); // 187.6
    expect(consumptionTax(1000, taxRatePercent({ taxRatePercent: 10 }))).toBe(100);
  });
});
