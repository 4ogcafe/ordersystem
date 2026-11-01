import express from 'express';
import { z } from 'zod';
import { notFound } from '../lib/errors.js';
import { isOfferLive, type OfferRule } from '../lib/loyalty.js';
import { prisma } from '../lib/prisma.js';
import { idParam, imageUrl, optionalText } from '../lib/schemas.js';
import { requireAdmin } from '../middleware/auth.js';

const router = express.Router();

const MAX_DISCOUNT_YEN = 1_000_000;
const MAX_PERCENT = 100;

const optionalDate = z.preprocess(
  (value) => (value === '' || value === null ? null : value),
  z.coerce.date().nullable().optional(),
);

const offerSchema = z
  .object({
    titleJa: z.string().trim().min(1).max(100),
    descriptionJa: optionalText(1000),
    imageUrl: imageUrl.nullable().optional(),
    discountType: z.enum(['PERCENT', 'AMOUNT']),
    discountValue: z.number().int().min(1).max(MAX_DISCOUNT_YEN),
    minSubtotal: z.number().int().min(0).max(MAX_DISCOUNT_YEN).default(0),
    startsAt: optionalDate,
    endsAt: optionalDate,
    oncePerCustomer: z.boolean().default(false),
    isActive: z.boolean().default(true),
  })
  .refine((offer) => offer.discountType !== 'PERCENT' || offer.discountValue <= MAX_PERCENT, {
    message: 'A percentage discount must be 100 or less',
    path: ['discountValue'],
  })
  .refine((offer) => !offer.startsAt || !offer.endsAt || offer.startsAt < offer.endsAt, {
    message: 'The end date must be after the start date',
    path: ['endsAt'],
  });

async function audit(userId: string | undefined, action: string, entityId: string, diff: unknown) {
  if (!userId) return;
  await prisma.auditLog.create({
    data: { userId, action, entity: 'Offer', entityId, diff: diff as object ?? {} },
  });
}

const serializeOffer = (offer: Record<string, unknown>) => ({
  id: String(offer.id),
  titleJa: offer.titleJa,
  descriptionJa: offer.descriptionJa ?? '',
  imageUrl: offer.imageUrl ?? '',
  discountType: offer.discountType,
  discountValue: offer.discountValue,
  minSubtotal: offer.minSubtotal ?? 0,
  startsAt: offer.startsAt ?? null,
  endsAt: offer.endsAt ?? null,
  oncePerCustomer: offer.oncePerCustomer ?? false,
  isActive: offer.isActive ?? true,
  createdAt: offer.createdAt,
  updatedAt: offer.updatedAt,
});

/** Live member offers, for the public site to advertise. */
router.get('/', async (_req, res) => {
  const offers = await prisma.offer.findMany({
    where: { isActive: { not: false } },
    orderBy: { createdAt: 'desc' },
  });
  res.setHeader('Cache-Control', 'public, max-age=60');
  res.json(
    offers
      .filter((offer) => isOfferLive(offer as unknown as OfferRule))
      .map((offer) => ({
        id: offer.id,
        titleJa: offer.titleJa,
        descriptionJa: offer.descriptionJa ?? '',
        imageUrl: offer.imageUrl ?? '',
        discountType: offer.discountType,
        discountValue: offer.discountValue,
        minSubtotal: offer.minSubtotal,
        endsAt: offer.endsAt ?? null,
      })),
  );
});

router.get('/all', requireAdmin, async (_req, res) => {
  const offers = await prisma.offer.findMany({ orderBy: { createdAt: 'desc' } });
  if (offers.length === 0) {
    res.setHeader('Cache-Control', 'no-store');
    res.json([]);
    return;
  }

  // Count how many non-cancelled orders used each offer (supporting both single and combined offers)
  const nonCancelledOrders = await (prisma as any).pickupOrder.findMany({
    where: { status: { not: 'CANCELLED' } },
    select: { offer: true },
  });
  const uses = new Map<string, number>();
  for (const order of nonCancelledOrders) {
    const offerObj = order.offer as { id?: string } | null;
    if (offerObj?.id) {
      const ids = String(offerObj.id).split(',').map((s) => s.trim());
      for (const id of ids) {
        uses.set(id, (uses.get(id) ?? 0) + 1);
      }
    }
  }

  res.setHeader('Cache-Control', 'no-store');
  res.json(offers.map((offer) => ({ ...serializeOffer(offer as unknown as Record<string, unknown>), uses: uses.get(offer.id) ?? 0 })));
});

router.patch('/:id/toggle', requireAdmin, async (req, res) => {
  const id = idParam(req.params);
  const current = await prisma.offer.findUnique({ where: { id } });
  if (!current) throw notFound('Offer');
  const updated = await prisma.offer.update({
    where: { id },
    data: { isActive: !current.isActive },
  });
  await audit(req.user?.id, 'offer.toggle', id, { isActive: updated.isActive });
  res.json({ success: true, isActive: updated.isActive });
});

router.post('/', requireAdmin, async (req, res) => {
  const input = offerSchema.parse(req.body);
  const offer = await prisma.offer.create({
    data: {
      ...input,
      discountType: input.discountType as 'PERCENT' | 'AMOUNT',
      descriptionJa: input.descriptionJa ?? null,
      imageUrl: input.imageUrl ?? null,
      startsAt: input.startsAt ?? null,
      endsAt: input.endsAt ?? null,
    },
  });
  await audit(req.user?.id, 'offer.create', offer.id, input);
  res.status(201).json(serializeOffer(offer as unknown as Record<string, unknown>));
});

router.put('/:id', requireAdmin, async (req, res) => {
  const id = idParam(req.params);
  const input = offerSchema.parse(req.body);
  try {
    await prisma.offer.update({
      where: { id },
      data: {
        ...input,
        discountType: input.discountType as 'PERCENT' | 'AMOUNT',
        startsAt: input.startsAt ?? null,
        endsAt: input.endsAt ?? null,
      },
    });
  } catch {
    throw notFound('Offer');
  }
  await audit(req.user?.id, 'offer.update', id, input);
  res.json({ success: true });
});

router.delete('/:id', requireAdmin, async (req, res) => {
  const id = idParam(req.params);
  try {
    await prisma.offer.delete({ where: { id } });
  } catch {
    throw notFound('Offer');
  }
  await audit(req.user?.id, 'offer.delete', id, null);
  res.json({ success: true });
});

export default router;
