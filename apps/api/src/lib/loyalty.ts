// Member pricing rules: offers and points. Pure functions only, so checkout quotes and the
// order that is finally saved are always computed the same way.

export const DEFAULT_POINTS_PER_100_YEN = 1;
export const DEFAULT_POINT_VALUE_YEN = 1;
const YEN_PER_EARN_STEP = 100;

export interface LoyaltySettings {
  pointsEnabled?: boolean | null;
  pointsPer100Yen?: number | null;
  pointValueYen?: number | null;
  signupBonusPoints?: number | null;
}

export interface LoyaltyConfig {
  enabled: boolean;
  pointsPer100Yen: number;
  pointValueYen: number;
  signupBonusPoints: number;
}

/** Points are on unless the admin switched them off; missing numbers fall back to 1 pt per ¥100, 1 pt = ¥1. */
export function loyaltyConfig(settings: LoyaltySettings): LoyaltyConfig {
  return {
    enabled: settings.pointsEnabled !== false,
    pointsPer100Yen: settings.pointsPer100Yen ?? DEFAULT_POINTS_PER_100_YEN,
    pointValueYen: Math.max(1, settings.pointValueYen ?? DEFAULT_POINT_VALUE_YEN),
    signupBonusPoints: settings.signupBonusPoints ?? 0,
  };
}

export type DiscountType = 'PERCENT' | 'AMOUNT';

export interface OfferRule {
  discountType: DiscountType;
  discountValue: number;
  minSubtotal?: number | null;
  startsAt?: Date | null;
  endsAt?: Date | null;
  isActive?: boolean;
}

export function isOfferLive(offer: OfferRule, now: Date = new Date()): boolean {
  if (offer.isActive === false) return false;
  if (offer.startsAt && offer.startsAt > now) return false;
  if (offer.endsAt && offer.endsAt < now) return false;
  return true;
}

/** Yen taken off the subtotal; 0 when the order is below the offer's minimum. Never more than the subtotal. */
export function offerDiscount(offer: OfferRule, subtotal: number): number {
  if (subtotal < (offer.minSubtotal ?? 0)) return 0;
  const raw = offer.discountType === 'PERCENT' ? Math.floor((subtotal * offer.discountValue) / 100) : offer.discountValue;
  return Math.max(0, Math.min(raw, subtotal));
}

export interface PriceBreakdown {
  subtotal: number;
  offerDiscount: number;
  /** Yen taken off by a stamp-card reward. */
  rewardDiscount: number;
  pointsUsed: number;
  pointsDiscount: number;
  total: number;
  pointsToEarn: number;
}

/** What the customer pays at the counter, and the points the order will earn once picked up. */
export function priceBreakdown(input: {
  subtotal: number;
  offer?: OfferRule | null;
  offerDiscount?: number;
  /** Yen a stamp-card reward takes off, applied after the offer. */
  rewardAmount?: number;
  pointsRequested?: number;
  pointsBalance?: number;
  loyalty: LoyaltyConfig;
  isMember: boolean;
}): PriceBreakdown {
  const { subtotal, loyalty, isMember } = input;
  const discount = typeof input.offerDiscount === 'number'
    ? Math.max(0, Math.min(input.offerDiscount, subtotal))
    : input.offer
      ? offerDiscount(input.offer, subtotal)
      : 0;
  const reward = Math.max(0, Math.min(input.rewardAmount ?? 0, subtotal - discount));
  const afterOffer = subtotal - discount - reward;

  const canUsePoints = isMember && loyalty.enabled;
  const maxPointsForOrder = Math.floor(afterOffer / loyalty.pointValueYen);
  const pointsUsed = canUsePoints
    ? Math.max(0, Math.min(Math.floor(input.pointsRequested ?? 0), input.pointsBalance ?? 0, maxPointsForOrder))
    : 0;
  const pointsDiscount = pointsUsed * loyalty.pointValueYen;
  const total = afterOffer - pointsDiscount;

  return {
    subtotal,
    offerDiscount: discount,
    rewardDiscount: reward,
    pointsUsed,
    pointsDiscount,
    total,
    pointsToEarn: canUsePoints ? earnedPoints(total, loyalty) : 0,
  };
}

export function earnedPoints(paidTotal: number, loyalty: LoyaltyConfig): number {
  if (!loyalty.enabled) return 0;
  return Math.floor(paidTotal / YEN_PER_EARN_STEP) * loyalty.pointsPer100Yen;
}
