import express from 'express';
import { z } from 'zod';
import { AppError, notFound } from '../lib/errors.js';
import { prisma } from '../lib/prisma.js';
import { idParam, optionalText } from '../lib/schemas.js';
import { MEMBER_CODE_PATTERN, normalizeMemberCode } from '../lib/stamps.js';
import { requireStaff } from '../middleware/auth.js';
import { awardStamp, memberCodeFor, resetStampCooldown, stampCardFor, useReward } from '../services/stamps.js';

// Staff use this page to give stamps and hand over rewards at the counter.

const router = express.Router();
router.use(requireStaff);

const MAX_AMOUNT = 10_000_000;
const stampSchema = z.object({
  amount: z.number().int().min(0).max(MAX_AMOUNT).optional().default(0),
  note: optionalText(200),
  bypassCooldown: z.boolean().optional(),
});

const resetCooldownSchema = z.object({
  lastStampAt: z.union([z.null(), z.coerce.date()]).optional(),
  nextAt: z.union([z.null(), z.coerce.date()]).optional(),
});

async function memberByCode(rawCode: string) {
  const code = normalizeMemberCode(rawCode);
  if (!MEMBER_CODE_PATTERN.test(code)) throw new AppError(400, 'INVALID_CODE', 'That is not a member code.');
  const customer = await prisma.customer.findFirst({
    where: { memberCode: code, deletedAt: null, isActive: { not: false } },
    select: { id: true, name: true, nameKana: true, isActive: true, lastStampAt: true },
  });
  if (!customer) throw notFound('Member');
  return customer;
}

const audit = (userId: string, action: string, entityId: string, diff: unknown) =>
  prisma.auditLog.create({
    data: { userId, action, entity: 'Customer', entityId, diff: diff as object ?? {} },
  });

const memberView = async (customer: { id: string; name: string; nameKana: string | null }) => ({
  member: { id: customer.id, name: customer.name, nameKana: customer.nameKana ?? '' },
  card: await stampCardFor(customer.id),
});

const SEARCH_LIMIT = 10;
const searchSchema = z.object({ q: z.string().trim().min(1).max(100) });

router.get('/search', async (req, res) => {
  const { q } = searchSchema.parse(req.query);
  const code = normalizeMemberCode(q);
  const digits = q.replace(/\D/g, '');

  // Build OR conditions for the text search.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const orConditions: any[] = [
    { name: { contains: q } },
    { nameKana: { contains: q } },
    { email: { contains: q } },
  ];
  if (MEMBER_CODE_PATTERN.test(code)) orConditions.push({ memberCode: code });

  const customers = await prisma.customer.findMany({
    where: {
      deletedAt: null,
      isActive: { not: false },
      OR: orConditions,
    },
    select: { id: true, name: true, nameKana: true, email: true, phone: true },
    orderBy: { name: 'asc' },
    take: SEARCH_LIMIT,
  });

  // Also search by phone digits if provided.
  let phoneMatches: typeof customers = [];
  if (digits.length >= 4) {
    phoneMatches = await prisma.customer.findMany({
      where: {
        deletedAt: null,
        isActive: { not: false },
        phone: { contains: digits },
      },
      select: { id: true, name: true, nameKana: true, email: true, phone: true },
      take: SEARCH_LIMIT,
    });
  }

  const seen = new Set(customers.map((c) => c.id));
  const combined = [...customers, ...phoneMatches.filter((c) => !seen.has(c.id))].slice(0, SEARCH_LIMIT);

  res.setHeader('Cache-Control', 'no-store');
  res.json(
    await Promise.all(
      combined.map(async (customer) => ({
        name: customer.name,
        nameKana: customer.nameKana ?? '',
        email: customer.email,
        phone: customer.phone ?? '',
        memberCode: await memberCodeFor(customer.id),
      })),
    ),
  );
});

router.get('/member/:code', async (req, res) => {
  const customer = await memberByCode(String(req.params.code));
  res.setHeader('Cache-Control', 'no-store');
  res.json(await memberView(customer));
});

router.post('/member/:code', async (req, res) => {
  const customer = await memberByCode(String(req.params.code));
  const { amount, note, bypassCooldown } = stampSchema.parse(req.body);
  const result = await awardStamp(customer.id, {
    source: 'STAFF',
    amount,
    userId: req.user!.id,
    note: note ?? undefined,
    bypassCooldown: Boolean(bypassCooldown),
  });

  if (result.status === 'DISABLED') throw new AppError(409, 'STAMPS_DISABLED', 'The stamp card is switched off.');
  if (result.status === 'NOT_FOUND') throw notFound('Member');
  if (result.status === 'BELOW_MINIMUM') {
    throw new AppError(409, 'BELOW_MINIMUM', `A stamp needs a purchase of at least ¥${result.minAmount.toLocaleString('en-US')}.`, { minAmount: result.minAmount });
  }
  if (result.status === 'TOO_SOON') {
    throw new AppError(409, 'TOO_SOON', 'This member already got a stamp recently.', { nextAt: result.nextAt.toISOString() });
  }
  await audit(req.user!.id, 'customer.stamp', customer.id, {
    amount,
    position: result.position,
    note: note ?? null,
    bypassCooldown: Boolean(bypassCooldown),
  });
  res.status(201).json({ result, ...(await memberView(customer)) });
});

router.post('/member/:code/reset-cooldown', async (req, res) => {
  const customer = await memberByCode(String(req.params.code));
  const { lastStampAt, nextAt } = resetCooldownSchema.parse(req.body ?? {});
  const result = await resetStampCooldown(customer.id, {
    targetLastStampAt: lastStampAt,
    nextStampAt: nextAt,
  });
  if (!result) throw notFound('Member');
  await audit(req.user!.id, 'customer.stamp_cooldown_reset', customer.id, {
    previousLastStampAt: result.previousLastStampAt,
    newLastStampAt: result.newLastStampAt,
  });
  res.json({ success: true, ...(await memberView(customer)) });
});

router.post('/rewards/:id/use', async (req, res) => {
  const id = idParam(req.params);
  const reward = await prisma.stampReward.findUnique({ where: { id } });
  if (!reward) throw notFound('Reward');
  const used = await useReward(id, reward.customerId, { userId: req.user!.id });
  if (!used) throw new AppError(409, 'REWARD_UNAVAILABLE', 'This reward was already used or has expired.');
  await audit(req.user!.id, 'customer.reward_used', reward.customerId, { rewardId: id, titleJa: reward.titleJa });
  res.json({ success: true });
});

export default router;
