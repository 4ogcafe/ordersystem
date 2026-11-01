import express from 'express';
import { z } from 'zod';
import { AppError } from '../lib/errors.js';
import { prisma } from '../lib/prisma.js';
import { requireAdmin } from '../middleware/auth.js';
import { requireCustomer } from '../middleware/customerAuth.js';
import {
  getGameConfig,
  saveGameConfig,
  getCustomerGameStatus,
  playCustomerGame,
  type GameConfig,
} from '../services/game.js';

const router = express.Router();

const prizeSchema = z.object({
  id: z.string().min(1),
  titleJa: z.string().trim().min(1).max(100),
  type: z.enum(['POINTS', 'DISCOUNT_COUPON', 'PERK', 'NO_PRIZE']),
  value: z.number().int().min(0).max(1_000_000),
  probability: z.number().min(0).max(100),
  color: z.string().regex(/^#([0-9a-f]{3}|[0-9a-f]{6})$/i, 'Invalid hex color'),
  icon: z.string().optional(),
  descriptionJa: z.string().optional(),
});

const gameConfigSchema = z.object({
  enabled: z.boolean(),
  mode: z.enum(['LUCKY_WHEEL', 'SCRATCH_CARD', 'SLOT_MACHINE']),
  cooldownHours: z.number().int().min(0).max(720),
  titleJa: z.string().trim().min(1).max(100),
  subtitleJa: z.string().trim().max(300),
  requireOrderSpend: z.boolean().default(true),
  cycleSpendAmount: z.number().int().min(100).max(1_000_000).default(4999),
  allowSingleOrderQualify: z.boolean().default(true),
  prizes: z.array(prizeSchema).min(2).max(12),
});

// Customer: Check if customer can play and get public game details
router.get('/status', requireCustomer, async (req, res) => {
  const customerId = req.customer!.id;
  const status = await getCustomerGameStatus(customerId);
  res.json(status);
});

// Customer: Play game and claim winning prize
router.post('/play', requireCustomer, async (req, res) => {
  const customerId = req.customer!.id;
  try {
    const result = await playCustomerGame(customerId);
    res.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'ゲームの実行に失敗しました。';
    throw new AppError(400, 'GAME_ERROR', message);
  }
});

// Admin: Get game configuration (including probability weights)
router.get('/admin/config', requireAdmin, async (_req, res) => {
  const config = await getGameConfig();
  res.json(config);
});

// Admin: Update game configuration
router.put('/admin/config', requireAdmin, async (req, res) => {
  const parsed = gameConfigSchema.parse(req.body);
  const saved = await saveGameConfig(parsed as GameConfig);
  res.json(saved);
});

// Admin: Toggle enabled/disabled state instantly
router.patch('/admin/toggle', requireAdmin, async (_req, res) => {
  const current = await getGameConfig();
  const updated = { ...current, enabled: !current.enabled };
  await saveGameConfig(updated);
  res.json({ enabled: updated.enabled });
});

// Admin: Get summary of customer spending and eligibility for the 4999 yen cycle
router.get('/admin/stats', requireAdmin, async (_req, res) => {
  const config = await getGameConfig();
  const customers = await prisma.customer.findMany({
    where: { isActive: true },
    select: {
      id: true,
      name: true,
      email: true,
      phone: true,
      preferences: true,
      createdAt: true,
    },
  });

  const orders = await prisma.pickupOrder.findMany({
    where: { status: 'COMPLETED', customerId: { not: null } },
    select: { customerId: true, total: true, grandTotal: true },
  });

  const spentByCustomer = new Map<string, number>();
  const ordersByCustomer = new Map<string, number>();
  for (const o of orders) {
    if (!o.customerId) continue;
    spentByCustomer.set(o.customerId, (spentByCustomer.get(o.customerId) ?? 0) + (o.grandTotal || o.total || 0));
    ordersByCustomer.set(o.customerId, (ordersByCustomer.get(o.customerId) ?? 0) + 1);
  }

  const cycleAmount = config.cycleSpendAmount || 4999;
  const customerStats = customers.map(c => {
    const totalSpent = spentByCustomer.get(c.id) ?? 0;
    const orderCount = ordersByCustomer.get(c.id) ?? 0;
    const prefs = (c.preferences as Record<string, unknown> | null) ?? {};
    const cyclePlays = Math.floor(totalSpent / cycleAmount);
    const gamePlaysUsed = typeof prefs.gamePlaysUsed === 'number' ? prefs.gamePlaysUsed : (prefs.lastGamePlayAt ? 1 : 0);
    const availablePlays = Math.max(0, cyclePlays - gamePlaysUsed);
    const currentCycleSpent = totalSpent % cycleAmount;
    const remainingToNextPlay = availablePlays > 0 ? 0 : Math.max(0, cycleAmount - currentCycleSpent);

    return {
      id: c.id,
      name: c.name,
      email: c.email,
      phone: c.phone,
      totalSpent,
      orderCount,
      cyclePlaysEarned: cyclePlays,
      gamePlaysUsed,
      availablePlays,
      currentCycleSpent,
      remainingToNextPlay,
      hasQualified: totalSpent >= cycleAmount,
      lastGamePlayAt: typeof prefs.lastGamePlayAt === 'string' ? prefs.lastGamePlayAt : null,
      lastGamePrize: prefs.lastGamePrize ?? null,
    };
  });

  res.json({
    cycleSpendAmount: cycleAmount,
    requireOrderSpend: config.requireOrderSpend ?? true,
    customers: customerStats,
  });
});

export default router;
