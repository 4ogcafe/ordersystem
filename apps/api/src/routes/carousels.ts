import express from 'express';
import { z } from 'zod';
import { notFound } from '../lib/errors.js';
import { prisma } from '../lib/prisma.js';
import { definedOnly, idParam, imageUrl, optionalText } from '../lib/schemas.js';
import { requireAdmin } from '../middleware/auth.js';
import { publicCache } from '../middleware/cache.js';

const router = express.Router();

const placement = z.enum(['HOME', 'CONTACT']);

const slideUpdateSchema = z.object({
  titleEn: optionalText(200),
  titleJa: optionalText(200),
  altEn: optionalText(300),
  imageUrl: imageUrl.optional(),
  isActive: z.boolean().optional(),
  sortOrder: z.number().int().optional(),
});

const slideCreateSchema = z.object({
  titleEn: optionalText(200),
  titleJa: optionalText(200),
  altEn: optionalText(300),
  imageUrl: imageUrl.refine((value) => value !== '', 'An image is required'),
  placement: placement.default('HOME'),
});

router.get('/', publicCache, async (req, res) => {
  const showAll = req.query.all === 'true';
  const slides = await prisma.carouselSlide.findMany({
    orderBy: { sortOrder: 'asc' },
    where: showAll ? undefined : { placement: placement.catch('HOME').parse(req.query.placement), isActive: true },
  });
  if (showAll) res.setHeader('Cache-Control', 'no-store');
  res.json(slides);
});

router.put('/:id', requireAdmin, async (req, res) => {
  const id = idParam(req.params);
  const fields = definedOnly(slideUpdateSchema.parse(req.body));
  if (fields.altEn === null) fields.altEn = '';
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await prisma.carouselSlide.update({ where: { id }, data: fields as any });
  } catch {
    throw notFound('Slide');
  }
  res.json({ success: true });
});

router.delete('/:id', requireAdmin, async (req, res) => {
  const id = idParam(req.params);
  try {
    await prisma.carouselSlide.delete({ where: { id } });
  } catch {
    throw notFound('Slide');
  }
  res.json({ success: true });
});

router.post('/', requireAdmin, async (req, res) => {
  const { titleEn, titleJa, altEn, imageUrl: image, placement: slidePlacement } = slideCreateSchema.parse(req.body);
  const count = await prisma.carouselSlide.count({ where: { placement: slidePlacement as 'HOME' | 'CONTACT' } });

  const slide = await prisma.carouselSlide.create({
    data: {
      titleEn: titleEn ?? '',
      titleJa: titleJa ?? '',
      altEn: altEn || titleEn || titleJa || '',
      imageUrl: image,
      placement: slidePlacement as 'HOME' | 'CONTACT',
      isActive: true,
      sortOrder: count,
    },
  });
  res.status(201).json(slide);
});

export default router;
