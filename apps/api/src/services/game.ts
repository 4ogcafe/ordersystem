import { prisma } from '../lib/prisma.js';
import { changePoints } from './points.js';

export interface GamePrize {
  id: string;
  titleJa: string;
  type: 'POINTS' | 'DISCOUNT_COUPON' | 'PERK' | 'NO_PRIZE';
  value: number; // e.g. 50 (points), 10 (10% off), 500 (¥500 off), 0 (perk/miss)
  probability: number; // percentage weight, e.g. 20 for 20%
  color: string; // Hex color for wheel segment / card styling
  icon?: string;
  descriptionJa?: string;
}

export interface GameConfig {
  enabled: boolean;
  mode: 'LUCKY_WHEEL' | 'SCRATCH_CARD' | 'SLOT_MACHINE';
  cooldownHours: number; // default 24
  titleJa: string;
  subtitleJa: string;
  prizes: GamePrize[];
  requireOrderSpend: boolean; // Must spend 4,999 yen in cycle to unlock
  cycleSpendAmount: number;   // 4999 yen per cycle
  allowSingleOrderQualify: boolean; // single order >= 4999 yen immediately qualifies
}

export interface CustomerSpendStatus {
  requireOrderSpend: boolean;
  cycleSpendAmount: number;
  totalSpent: number;
  currentCycleSpent: number;
  remainingToNextPlay: number;
  totalPlaysEarned: number;
  gamePlaysUsed: number;
  availablePlays: number;
  progressPercent: number;
  qualifyingOrderCount: number;
}

export const DEFAULT_GAME_CONFIG: GameConfig = {
  enabled: true,
  mode: 'LUCKY_WHEEL',
  cooldownHours: 24,
  titleJa: '毎日チャレンジ！ミニゲーム',
  subtitleJa: 'ゲームに挑戦して、お得なポイントや割引クーポンをGETしよう！',
  requireOrderSpend: true,
  cycleSpendAmount: 4999,
  allowSingleOrderQualify: true,
  prizes: [
    { id: 'p1', titleJa: '100ポイント', type: 'POINTS', value: 100, probability: 15, color: '#e11d48', icon: 'Coins' },
    { id: 'p2', titleJa: '10% OFF クーポン', type: 'DISCOUNT_COUPON', value: 10, probability: 10, color: '#d97706', icon: 'Tag' },
    { id: 'p3', titleJa: '50ポイント', type: 'POINTS', value: 50, probability: 25, color: '#2563eb', icon: 'Sparkles' },
    { id: 'p4', titleJa: 'チーズナン無料券', type: 'PERK', value: 0, probability: 10, color: '#7c3aed', icon: 'Gift' },
    { id: 'p5', titleJa: '20ポイント', type: 'POINTS', value: 20, probability: 25, color: '#059669', icon: 'Smile' },
    { id: 'p6', titleJa: '残念！また明日', type: 'NO_PRIZE', value: 0, probability: 15, color: '#64748b', icon: 'Frown' },
  ],
};

const SECRET_KEY = 'MINI_GAME_CONFIG';

/** Load game configuration from AppSecret key-value store, falling back to defaults */
export async function getGameConfig(): Promise<GameConfig> {
  try {
    const record = await prisma.appSecret.findUnique({ where: { id: SECRET_KEY } });
    if (record?.publicKey) {
      const parsed = JSON.parse(record.publicKey);
      return { ...DEFAULT_GAME_CONFIG, ...parsed };
    }
  } catch (err) {
    console.error('Failed to load game config, using defaults', err);
  }
  return DEFAULT_GAME_CONFIG;
}

/** Save game configuration */
export async function saveGameConfig(config: GameConfig): Promise<GameConfig> {
  const json = JSON.stringify(config);
  await prisma.appSecret.upsert({
    where: { id: SECRET_KEY },
    create: { id: SECRET_KEY, publicKey: json, privateKey: '' },
    update: { publicKey: json },
  });
  return config;
}

/** Calculate customer completed order spending and cycle status towards 4,999 yen */
export async function calculateCustomerSpendStatus(
  customerId: string,
  config: GameConfig,
  prefs: Record<string, unknown>,
): Promise<CustomerSpendStatus> {
  const cycleAmount = Math.max(100, Number(config.cycleSpendAmount) || 4999);

  if (!config.requireOrderSpend) {
    return {
      requireOrderSpend: false,
      cycleSpendAmount: cycleAmount,
      totalSpent: 0,
      currentCycleSpent: 0,
      remainingToNextPlay: 0,
      totalPlaysEarned: 1,
      gamePlaysUsed: 0,
      availablePlays: 1,
      progressPercent: 100,
      qualifyingOrderCount: 0,
    };
  }

  const orders = await prisma.pickupOrder.findMany({
    where: {
      customerId,
      status: 'COMPLETED',
    },
    select: {
      id: true,
      total: true,
      grandTotal: true,
      completedAt: true,
    },
    orderBy: { createdAt: 'asc' },
  });

  const totalSpent = orders.reduce((sum, o) => sum + (o.grandTotal || o.total || 0), 0);
  const singleQualifyingCount = config.allowSingleOrderQualify
    ? orders.filter(o => (o.grandTotal || o.total || 0) >= cycleAmount).length
    : 0;

  const cyclePlays = Math.floor(totalSpent / cycleAmount);
  const totalPlaysEarned = Math.max(cyclePlays, singleQualifyingCount);

  const gamePlaysUsed = typeof prefs.gamePlaysUsed === 'number'
    ? prefs.gamePlaysUsed
    : (prefs.lastGamePlayAt ? Math.min(totalPlaysEarned, 1) : 0);

  const availablePlays = Math.max(0, totalPlaysEarned - gamePlaysUsed);
  const currentCycleSpent = totalSpent % cycleAmount;
  const remainingToNextPlay = availablePlays > 0 ? 0 : Math.max(0, cycleAmount - currentCycleSpent);
  const progressPercent = Math.min(100, Math.round((currentCycleSpent / cycleAmount) * 100));

  return {
    requireOrderSpend: true,
    cycleSpendAmount: cycleAmount,
    totalSpent,
    currentCycleSpent,
    remainingToNextPlay,
    totalPlaysEarned,
    gamePlaysUsed,
    availablePlays,
    progressPercent,
    qualifyingOrderCount: orders.length,
  };
}

/** Check if customer is eligible to play */
export async function getCustomerGameStatus(customerId: string): Promise<{
  enabled: boolean;
  canPlay: boolean;
  nextPlayAt: string | null;
  config: Omit<GameConfig, 'prizes'> & { prizes: Array<Omit<GamePrize, 'probability'>> };
  spendStatus: CustomerSpendStatus;
}> {
  const config = await getGameConfig();
  const customer = await prisma.customer.findUnique({
    where: { id: customerId },
    select: { preferences: true },
  });

  const prefs = (customer?.preferences as Record<string, unknown> | null) ?? {};
  const spendStatus = await calculateCustomerSpendStatus(customerId, config, prefs);

  if (!config.enabled) {
    return {
      enabled: false,
      canPlay: false,
      nextPlayAt: null,
      config: sanitizeConfig(config),
      spendStatus,
    };
  }

  const lastPlayIso = typeof prefs.lastGamePlayAt === 'string' ? prefs.lastGamePlayAt : null;
  let canPlay = true;
  let nextPlayAt: string | null = null;

  if (config.requireOrderSpend) {
    if (spendStatus.availablePlays <= 0) {
      canPlay = false;
    }
  }

  if (canPlay && lastPlayIso && config.cooldownHours > 0) {
    const lastTime = new Date(lastPlayIso).getTime();
    const unlockTime = lastTime + config.cooldownHours * 60 * 60 * 1000;
    if (Date.now() < unlockTime) {
      canPlay = false;
      nextPlayAt = new Date(unlockTime).toISOString();
    }
  }

  return {
    enabled: config.enabled,
    canPlay,
    nextPlayAt,
    config: sanitizeConfig(config),
    spendStatus,
  };
}

/**
 * Executes a game play for the customer.
 * Uses probability weights to pick the prize, applies point/reward mutations,
 * and updates lastGamePlayAt and gamePlaysUsed.
 */
export async function playCustomerGame(customerId: string): Promise<{
  prizeIndex: number;
  prize: GamePrize;
  pointsAdded: number;
  newPointsBalance?: number;
  nextPlayAt: string;
  availablePlays: number;
  spendStatus: CustomerSpendStatus;
}> {
  const config = await getGameConfig();
  if (!config.enabled) {
    throw new Error('ミニゲームは現在停止中です。');
  }

  const customer = await prisma.customer.findUnique({
    where: { id: customerId },
    select: { id: true, points: true, preferences: true },
  });
  if (!customer) throw new Error('Customer not found');

  const prefs = (customer.preferences as Record<string, unknown> | null) ?? {};
  const spendStatus = await calculateCustomerSpendStatus(customerId, config, prefs);

  if (config.requireOrderSpend && spendStatus.availablePlays <= 0) {
    throw new Error(
      `ミニゲームの解放条件（${spendStatus.cycleSpendAmount.toLocaleString()}円購入サイクル）に達していません。あと ¥${spendStatus.remainingToNextPlay.toLocaleString()} のご注文で挑戦できます。`
    );
  }

  const lastPlayIso = typeof prefs.lastGamePlayAt === 'string' ? prefs.lastGamePlayAt : null;
  if (lastPlayIso && config.cooldownHours > 0) {
    const unlockTime = new Date(lastPlayIso).getTime() + config.cooldownHours * 60 * 60 * 1000;
    if (Date.now() < unlockTime) {
      throw new Error(`本日はすでに挑戦済みです。次回は ${new Date(unlockTime).toLocaleTimeString('ja-JP')} 以降に挑戦できます。`);
    }
  }

  // Pick winning prize according to configured weights
  const { index, prize } = selectPrizeByWeight(config.prizes);

  let pointsAdded = 0;
  let newPointsBalance = customer.points;

  // Award prize
  const modeLabel =
    config.mode === 'LUCKY_WHEEL'
      ? '🎯 ラッキールーレット'
      : config.mode === 'SCRATCH_CARD'
        ? '🎫 スクラッチくじ'
        : '🎰 ラッキースロット';

  if (prize.type === 'POINTS' && prize.value > 0) {
    pointsAdded = prize.value;
    await changePoints(customerId, prize.value, 'BONUS', {
      note: `ミニゲーム当選: ${prize.titleJa}（${modeLabel} / ${config.titleJa}）`,
    });
    const updated = await prisma.customer.findUnique({ where: { id: customerId }, select: { points: true } });
    newPointsBalance = updated?.points ?? customer.points + pointsAdded;
  } else if (prize.type === 'DISCOUNT_COUPON') {
    await prisma.stampReward.create({
      data: {
        customerId,
        titleJa: `【ミニゲーム特典】${prize.titleJa}`,
        kind: 'AMOUNT_OFF',
        amount: prize.value,
        status: 'AVAILABLE',
        earnedAt: new Date(),
        expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 30 days validity
      },
    });
  } else if (prize.type === 'PERK') {
    await prisma.stampReward.create({
      data: {
        customerId,
        titleJa: `【ミニゲーム特典】${prize.titleJa}`,
        kind: 'PERK',
        amount: 0,
        status: 'AVAILABLE',
        earnedAt: new Date(),
        expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      },
    });
  }

  const now = new Date();
  const nextPlayAt = new Date(now.getTime() + config.cooldownHours * 60 * 60 * 1000).toISOString();
  const newPlaysUsed = spendStatus.gamePlaysUsed + 1;

  // Save lastGamePlayAt and increment gamePlaysUsed in customer preferences
  await prisma.customer.update({
    where: { id: customerId },
    data: {
      preferences: {
        ...prefs,
        gamePlaysUsed: newPlaysUsed,
        lastGamePlayAt: now.toISOString(),
        lastGamePrize: {
          id: prize.id,
          titleJa: prize.titleJa,
          type: prize.type,
          value: prize.value,
          wonAt: now.toISOString(),
        },
      },
    },
  });

  const updatedSpendStatus: CustomerSpendStatus = {
    ...spendStatus,
    gamePlaysUsed: newPlaysUsed,
    availablePlays: Math.max(0, spendStatus.totalPlaysEarned - newPlaysUsed),
  };

  return {
    prizeIndex: index,
    prize,
    pointsAdded,
    newPointsBalance,
    nextPlayAt,
    availablePlays: updatedSpendStatus.availablePlays,
    spendStatus: updatedSpendStatus,
  };
}

/** Weighted random selection */
export function selectPrizeByWeight(prizes: GamePrize[]): { index: number; prize: GamePrize } {
  if (prizes.length === 0) {
    const fallback = DEFAULT_GAME_CONFIG.prizes[0];
    return { index: 0, prize: fallback };
  }
  const totalWeight = prizes.reduce((sum, p) => sum + Math.max(1, p.probability || 1), 0);
  let randomVal = Math.random() * totalWeight;

  for (let i = 0; i < prizes.length; i++) {
    const weight = Math.max(1, prizes[i].probability || 1);
    if (randomVal < weight) {
      return { index: i, prize: prizes[i] };
    }
    randomVal -= weight;
  }
  return { index: prizes.length - 1, prize: prizes[prizes.length - 1] };
}

/** Sanitize config so customers cannot inspect raw probabilities on client */
export function sanitizeConfig(config: GameConfig): Omit<GameConfig, 'prizes'> & { prizes: Array<Omit<GamePrize, 'probability'>> } {
  return {
    enabled: config.enabled,
    mode: config.mode,
    cooldownHours: config.cooldownHours,
    titleJa: config.titleJa,
    subtitleJa: config.subtitleJa,
    requireOrderSpend: config.requireOrderSpend ?? true,
    cycleSpendAmount: config.cycleSpendAmount ?? 4999,
    allowSingleOrderQualify: config.allowSingleOrderQualify ?? true,
    prizes: config.prizes.map(({ probability: _prob, ...rest }) => rest),
  };
}
