import { AppError } from '../lib/errors.js';
import { prisma } from '../lib/prisma.js';
import {
  cooldownCutoff,
  newMemberCode,
  nextStampAt,
  rewardExpiry,
  rewardsForStamp,
  stampConfig,
  type StampConfig,
  type StampRewardKind,
} from '../lib/stamps.js';
import { loadSettings } from './settings-store.js';
import { emitStampAwarded } from '../lib/stamp-events.js';

const HISTORY_LIMIT = 50;

/** The member's in-store code, created the first time it is needed. */
export async function memberCodeFor(customerId: string): Promise<string> {
  const existing = await prisma.customer.findUnique({
    where: { id: customerId },
    select: { memberCode: true },
  });
  if (existing?.memberCode) return existing.memberCode;

  // Assign a unique code. Retry on the rare collision from the UNIQUE constraint.
  for (;;) {
    const code = newMemberCode();
    try {
      const result = await prisma.customer.updateMany({
        where: { id: customerId, memberCode: null },
        data: { memberCode: code },
      });
      if (result.count > 0) return code;
      // Another request raced ahead — return whatever was set.
      const again = await prisma.customer.findUnique({ where: { id: customerId }, select: { memberCode: true } });
      return again?.memberCode ?? code;
    } catch {
      // Unique constraint violation — try a different code.
    }
  }
}

export type StampSource = 'ORDER' | 'STAFF';

export type StampResult =
  | { status: 'AWARDED'; position: number; perCard: number; cardCompleted: boolean; rewards: { titleJa: string; kind: StampRewardKind; amount: number }[] }
  | { status: 'DISABLED' }
  | { status: 'BELOW_MINIMUM'; minAmount: number }
  | { status: 'TOO_SOON'; nextAt: Date }
  | { status: 'NOT_FOUND' };

/**
 * Gives a member one stamp if the amount qualifies and the minimum gap has passed.
 * Uses an atomic UPDATE WHERE to ensure a stamp is never given twice.
 */
export async function awardStamp(
  customerId: string,
  input: { source: StampSource; amount: number; orderId?: string; orderNumber?: number; userId?: string; note?: string; bypassCooldown?: boolean },
  config?: StampConfig,
  now: Date = new Date(),
): Promise<StampResult> {
  const settings = config ?? stampConfig(await loadSettings());
  if (!settings.enabled) return { status: 'DISABLED' };
  if (input.source !== 'STAFF' && input.amount < settings.minAmount) {
    return { status: 'BELOW_MINIMUM', minAmount: settings.minAmount };
  }

  // When not bypassing cooldown, atomically claim the stamp slot only when the cooldown has passed.
  const updateWhere: {
    id: string;
    deletedAt: null;
    OR?: Array<{ lastStampAt: null } | { lastStampAt: { lte: Date } }>;
  } = {
    id: customerId,
    deletedAt: null,
  };

  if (!input.bypassCooldown) {
    const cutoff = cooldownCutoff(settings, now);
    updateWhere.OR = [
      { lastStampAt: null },
      { lastStampAt: { lte: cutoff } },
    ];
  }

  const updated = await prisma.customer.updateMany({
    where: updateWhere,
    data: {
      stampCount: { increment: 1 },
      stampTotal: { increment: 1 },
      lastStampAt: now,
      updatedAt: now,
    },
  });

  if (updated.count === 0) {
    const customer = await prisma.customer.findFirst({
      where: { id: customerId, deletedAt: null },
      select: { lastStampAt: true },
    });
    if (!customer) return { status: 'NOT_FOUND' };
    return { status: 'TOO_SOON', nextAt: nextStampAt(customer.lastStampAt, settings, now) ?? now };
  }

  const customer = await prisma.customer.findUnique({
    where: { id: customerId },
    select: { stampCount: true, stampCardsCompleted: true },
  });

  const count = customer?.stampCount ?? 1;
  const position = Math.min(count, settings.perCard);
  const card = (customer?.stampCardsCompleted ?? 0) + 1;
  const cardCompleted = position >= settings.perCard;

  const stampNote = input.note
    ? (input.bypassCooldown ? `${input.note} (Cooldown override)` : input.note)
    : (input.bypassCooldown ? 'Cooldown override' : null);

  await prisma.stamp.create({
    data: {
      customerId,
      card,
      position,
      source: input.source,
      amount: input.amount,
      orderId: input.orderId ?? null,
      orderNumber: input.orderNumber ?? null,
      userId: input.userId ?? null,
      note: stampNote,
      createdAt: now,
    },
  });

  const rewards = rewardsForStamp(position, settings).map((rule) => ({
    titleJa: rule.titleJa,
    kind: rule.kind,
    amount: rule.kind === 'AMOUNT_OFF' ? (rule.amount ?? 0) : 0,
  }));

  if (rewards.length > 0) {
    await prisma.stampReward.createMany({
      data: rewards.map((reward) => ({
        customerId,
        ...reward,
        card,
        at: position,
        status: 'AVAILABLE',
        earnedAt: now,
        expiresAt: rewardExpiry(now, settings) ?? null,
      })),
    });
  }

  if (cardCompleted) {
    // Reset the stamp counter atomically; only when it still matches what we read.
    await prisma.customer.updateMany({
      where: { id: customerId, stampCount: count },
      data: { stampCount: 0, stampCardsCompleted: { increment: 1 } },
    });
  }

  const awardedResult = { status: 'AWARDED' as const, position, perCard: settings.perCard, cardCompleted, rewards };
  try {
    emitStampAwarded(customerId, awardedResult);
  } catch {
    // Non-fatal if event listener throws
  }
  return awardedResult;
}

const now = () => new Date();

/** A reward the member holds that can be used now. */
export async function findUsableReward(rewardId: string, customerId: string) {
  const reward = await prisma.stampReward.findFirst({
    where: {
      id: rewardId,
      customerId,
      status: 'AVAILABLE',
      OR: [{ expiresAt: null }, { expiresAt: { gt: now() } }],
    },
  });
  if (!reward) throw new AppError(409, 'REWARD_UNAVAILABLE', 'このスタンプ特典はご利用いただけません。スタンプカードで達成後にご利用いただけます。');
  return reward;
}

/** Marks a reward used atomically. Returns false if it was already used. */
export async function useReward(
  rewardId: string,
  customerId: string,
  meta: { orderId?: string; orderNumber?: number; userId?: string },
) {
  const result = await prisma.stampReward.updateMany({
    where: {
      id: rewardId,
      customerId,
      status: 'AVAILABLE',
      OR: [{ expiresAt: null }, { expiresAt: { gt: now() } }],
    },
    data: {
      status: 'USED',
      usedAt: new Date(),
      orderId: meta.orderId ?? null,
      orderNumber: meta.orderNumber ?? null,
      usedBy: meta.userId ?? null,
    },
  });
  return result.count === 1;
}

/** Returns a reward when the order it was used on is cancelled. */
export async function releaseReward(orderId: string) {
  await prisma.stampReward.updateMany({
    where: { orderId, status: 'USED' },
    data: { status: 'AVAILABLE', usedAt: null, orderId: null, orderNumber: null },
  });
}

const publicReward = (reward: Record<string, unknown>) => ({
  id: String(reward.id),
  titleJa: reward.titleJa,
  kind: reward.kind,
  amount: Number(reward.amount) || 0,
  at: reward.at,
  card: reward.card,
  status: reward.status,
  earnedAt: reward.earnedAt,
  expiresAt: reward.expiresAt ?? null,
  usedAt: reward.usedAt ?? null,
});

/** Everything the member's stamp card page needs. */
export async function stampCardFor(customerId: string) {
  const config = stampConfig(await loadSettings());
  const n = new Date();
  const [customer, history, rewards] = await Promise.all([
    prisma.customer.findUnique({
      where: { id: customerId },
      select: { stampCount: true, stampTotal: true, stampCardsCompleted: true, lastStampAt: true },
    }),
    prisma.stamp.findMany({
      where: { customerId },
      orderBy: { createdAt: 'desc' },
      take: HISTORY_LIMIT,
    }),
    prisma.stampReward.findMany({
      where: { customerId },
      orderBy: { earnedAt: 'desc' },
      take: HISTORY_LIMIT,
    }),
  ]);

  const isUsable = (reward: { status: string; expiresAt: Date | null }) =>
    reward.status === 'AVAILABLE' && !(reward.expiresAt && reward.expiresAt <= n);

  return {
    enabled: config.enabled,
    memberCode: await memberCodeFor(customerId),
    perCard: config.perCard,
    stamps: Math.min(customer?.stampCount ?? 0, config.perCard),
    totalStamps: customer?.stampTotal ?? 0,
    completedCards: customer?.stampCardsCompleted ?? 0,
    lastStampAt: customer?.lastStampAt ?? null,
    nextStampAt: nextStampAt(customer?.lastStampAt ?? null, config, n),
    rules: { minAmount: config.minAmount, cooldownHours: config.cooldownHours, rewardValidDays: config.rewardValidDays },
    milestones: config.rewards.map(({ at, titleJa, kind, amount }) => ({ at, titleJa, kind, amount: kind === 'AMOUNT_OFF' ? (amount ?? 0) : 0 })),
    rewards: rewards.filter(isUsable).map(publicReward),
    pastRewards: rewards.filter((r) => !isUsable(r)).map((r) => ({ ...publicReward(r as unknown as Record<string, unknown>), status: r.status === 'AVAILABLE' ? 'EXPIRED' : r.status })),
    history: history.map((stamp) => ({
      id: stamp.id,
      card: stamp.card,
      position: stamp.position,
      source: stamp.source,
      amount: stamp.amount,
      orderNumber: stamp.orderNumber,
      createdAt: stamp.createdAt,
    })),
  };
}

/**
 * Resets or updates the stamp cooldown (lastStampAt) for a member.
 * If targetLastStampAt is provided, sets lastStampAt directly.
 * If nextStampAt is provided, computes lastStampAt = nextStampAt - cooldownHours so nextStampAt matches.
 * If neither is provided, sets lastStampAt = null, completely removing the cooldown.
 */
export async function resetStampCooldown(
  customerId: string,
  options?: { targetLastStampAt?: Date | null; nextStampAt?: Date | null },
) {
  const customer = await prisma.customer.findFirst({
    where: { id: customerId, deletedAt: null },
    select: { id: true, lastStampAt: true },
  });
  if (!customer) return null;

  let newLastStampAt: Date | null = null;
  if (options?.nextStampAt) {
    const settings = stampConfig(await loadSettings());
    newLastStampAt = new Date(options.nextStampAt.getTime() - settings.cooldownHours * 60 * 60 * 1000);
  } else if (options?.targetLastStampAt !== undefined) {
    newLastStampAt = options.targetLastStampAt;
  }

  await prisma.customer.update({
    where: { id: customerId },
    data: { lastStampAt: newLastStampAt },
  });

  return { id: customerId, previousLastStampAt: customer.lastStampAt, newLastStampAt };
}
