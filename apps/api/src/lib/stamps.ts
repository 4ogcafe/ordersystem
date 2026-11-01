import crypto from 'node:crypto';

// Stamp card: one stamp per qualifying visit or order, with a minimum gap between stamps, and
// rewards at chosen stamps. Pure functions only (no req/res, no database).

export const STAMP_REWARD_KINDS = ['AMOUNT_OFF', 'PERK'] as const;
export type StampRewardKind = (typeof STAMP_REWARD_KINDS)[number];

export interface StampRewardRule {
  /** The stamp (1-based) that earns the reward. */
  at: number;
  titleJa: string;
  /** AMOUNT_OFF takes `amount` yen off an order; PERK is something staff give (e.g. a free naan upgrade). */
  kind: StampRewardKind;
  amount?: number | null;
}

export interface StampSettings {
  stampCardEnabled?: boolean | null;
  stampsPerCard?: number | null;
  /** Minimum paid amount (tax included) for a stamp. */
  stampMinAmount?: number | null;
  /** Minimum hours between two stamps for the same member. */
  stampCooldownHours?: number | null;
  /** Days a reward stays usable after it is earned; 0 = no expiry. */
  stampRewardValidDays?: number | null;
  stampRewards?: StampRewardRule[] | null;
}

export interface StampConfig {
  enabled: boolean;
  perCard: number;
  minAmount: number;
  cooldownHours: number;
  rewardValidDays: number;
  rewards: StampRewardRule[];
}

export const MIN_STAMPS_PER_CARD = 2;
export const MAX_STAMPS_PER_CARD = 30;
export const DEFAULT_STAMPS_PER_CARD = 10;
export const DEFAULT_STAMP_MIN_AMOUNT = 1000;
export const DEFAULT_STAMP_COOLDOWN_HOURS = 6;

export const DEFAULT_STAMP_REWARDS: StampRewardRule[] = [
  { at: 5, titleJa: '次回セットのナングレードアップ無料', kind: 'PERK', amount: 0 },
  { at: 10, titleJa: '次回1グループ 1,000円引き', kind: 'AMOUNT_OFF', amount: 1000 },
];

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

/** The card is on unless the admin switched it off; missing values fall back to 10 stamps, ¥1,000, 12 hours. */
export function stampConfig(settings: StampSettings): StampConfig {
  const perCard = Math.min(MAX_STAMPS_PER_CARD, Math.max(MIN_STAMPS_PER_CARD, settings.stampsPerCard ?? DEFAULT_STAMPS_PER_CARD));
  return {
    enabled: settings.stampCardEnabled !== false,
    perCard,
    minAmount: settings.stampMinAmount ?? DEFAULT_STAMP_MIN_AMOUNT,
    cooldownHours: settings.stampCooldownHours ?? DEFAULT_STAMP_COOLDOWN_HOURS,
    rewardValidDays: settings.stampRewardValidDays ?? 0,
    rewards: (settings.stampRewards ?? DEFAULT_STAMP_REWARDS).filter((reward) => reward.at >= 1 && reward.at <= perCard).sort((a, b) => a.at - b.at),
  };
}

/** The amount that counts toward a stamp: what was paid for food, tax included (delivery fee excluded). */
export function stampAmount(order: { total?: unknown; tax?: unknown }): number {
  return (Number(order.total) || 0) + (Number(order.tax) || 0);
}

/** When the member can next earn a stamp, or null if they can now. */
export function nextStampAt(lastStampAt: Date | null | undefined, config: StampConfig, now: Date = new Date()): Date | null {
  if (!lastStampAt || config.cooldownHours <= 0) return null;
  const next = new Date(lastStampAt.getTime() + config.cooldownHours * HOUR_MS);
  return next > now ? next : null;
}

export function cooldownCutoff(config: StampConfig, now: Date = new Date()): Date {
  return new Date(now.getTime() - config.cooldownHours * HOUR_MS);
}

/** Rewards earned by landing on this stamp. */
export function rewardsForStamp(position: number, config: StampConfig): StampRewardRule[] {
  return config.rewards.filter((reward) => reward.at === position);
}

export function rewardExpiry(earnedAt: Date, config: StampConfig): Date | null {
  return config.rewardValidDays > 0 ? new Date(earnedAt.getTime() + config.rewardValidDays * DAY_MS) : null;
}

// No 0/O/1/I/L, so the code is easy to read out or type at the counter.
const CODE_ALPHABET = '23456789ABCDEFGHJKMNPQRSTUVWXYZ';
const CODE_LENGTH = 8;
export const MEMBER_CODE_PATTERN = /^[2-9A-HJKMNP-Z]{8}$/;

/** The code on a member's in-store card (shown as a QR code), e.g. "K7MP2QXA". */
export function newMemberCode(): string {
  const bytes = crypto.randomBytes(CODE_LENGTH);
  return [...bytes].map((byte) => CODE_ALPHABET[byte % CODE_ALPHABET.length]).join('');
}

/** Accepts what a person types or a scanner sends: lower case, spaces, a dash or an "ADARSHA:" / "KALPNA:" / "KALPANA:" prefix. */
export function normalizeMemberCode(input: string): string {
  return input.toUpperCase().replace(/^(ADARSHA|KALPNA|KALPANA):/, '').replace(/[\s-]/g, '');
}
