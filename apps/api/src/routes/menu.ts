import express from 'express';
import { z } from 'zod';
import { notFound, AppError } from '../lib/errors.js';
import { prisma } from '../lib/prisma.js';
import { definedOnly, idParam, imageUrl, objectIdString, optionalNumber, optionalText } from '../lib/schemas.js';
import { requireAdmin, requireStaff } from '../middleware/auth.js';
import { publicCache } from '../middleware/cache.js';

const router = express.Router();

const MAX_PRICE = 10_000_000;

const categoryCreateSchema = z.object({
  nameEn: z.string().trim().min(1).max(100),
  nameJa: optionalText(100),
  parentId: objectIdString.nullable().optional(),
});

const categoryUpdateSchema = z.object({
  nameEn: z.string().trim().min(1).max(100).optional(),
  nameJa: optionalText(100),
  sortOrder: optionalNumber(z.number().int().min(0).max(10_000)),
  parentId: z.preprocess((value) => (value === '' ? null : value), objectIdString.nullable().optional()),
});

const itemFields = {
  nameEn: z.string().trim().min(1).max(200),
  nameJa: optionalText(200),
  descriptionEn: optionalText(2000),
  descriptionJa: optionalText(2000),
  price: z.coerce.number().int().min(0).max(MAX_PRICE),
  imageUrl: imageUrl.optional(),
  rating: optionalNumber(z.number().min(0).max(5)),
  spiceLevel: z.coerce.number().int().min(0).max(5).optional(),
  isRecommended: z.boolean().optional(),
  isVegetarian: z.boolean().optional(),
  isVegan: z.boolean().optional(),
  isHalal: z.boolean().optional(),
  isGlutenFree: z.boolean().optional(),
  isSoldOut: z.boolean().optional(),
  isOrderable: z.boolean().optional(),
  isActive: z.boolean().optional(),
  sortOrder: z.coerce.number().int().min(0).max(10000).optional(),
  menuTypes: z.array(z.enum(['LUNCH', 'TAKEOUT', 'GRAND'])).optional(),
  allergens: z.array(z.string().trim().max(50)).optional(),
};

const itemCreateSchema = z.object({
  ...itemFields,
  categoryId: objectIdString.optional(),
  categoryName: z.string().trim().min(1).max(100).optional(),
}).refine(d => d.categoryId || d.categoryName, { message: 'categoryId or categoryName is required' });

const itemUpdateSchema = z.object({
  ...itemFields,
  nameEn: itemFields.nameEn.optional(),
  price: itemFields.price.optional(),
  categoryId: objectIdString.optional(),
  optionGroupIds: z.array(objectIdString).optional(),
});

// ---- Categories ----------------------------------------------------------

export const FIXED_CATEGORY_NAMES = ['Lunch Menu', 'Takeout Menu', 'Grand Menu'];

function isFixedCategory(cat: { nameEn: string }): boolean {
  return FIXED_CATEGORY_NAMES.map(n => n.toLowerCase()).includes((cat.nameEn || '').trim().toLowerCase());
}

router.get('/categories', publicCache, async (_req, res) => {
  const categories = await prisma.category.findMany({ orderBy: { sortOrder: 'asc' } });
  res.json(categories);
});

router.post('/categories', requireAdmin, async (req, res) => {
  const { nameEn, nameJa, parentId } = categoryCreateSchema.parse(req.body);
  const category = await prisma.category.create({
    data: {
      nameEn,
      nameJa: nameJa ?? nameEn,
      sortOrder: 0,
      parentId: parentId ?? null,
    },
  });
  res.status(201).json(category);
});

router.put('/categories/:id', requireAdmin, async (req, res) => {
  const id = idParam(req.params);
  const existing = await prisma.category.findUnique({ where: { id } });
  if (!existing) throw notFound('Category');

  const { parentId, ...fields } = categoryUpdateSchema.parse(req.body);
  if (parentId && parentId === id) {
    throw new AppError(400, 'VALIDATION_ERROR', 'A category cannot be its own parent');
  }

  // Prevent modifying parent or names of fixed root categories
  if (isFixedCategory(existing)) {
    if (fields.nameEn && fields.nameEn.trim().toLowerCase() !== existing.nameEn.trim().toLowerCase()) {
      throw new AppError(400, 'VALIDATION_ERROR', 'Cannot rename fixed main categories (Lunch Menu, Takeout Menu, Grand Menu)');
    }
    if (parentId !== undefined && parentId !== null) {
      throw new AppError(400, 'VALIDATION_ERROR', 'Main menu categories cannot have a parent category');
    }
  }

  const data: Record<string, unknown> = { ...definedOnly(fields) };
  if (parentId !== undefined) data.parentId = parentId ?? null;

  try {
    await prisma.category.update({ where: { id }, data });
  } catch {
    throw notFound('Category');
  }
  res.json({ success: true });
});

router.put('/categories-reorder', requireAdmin, async (req, res) => {
  const schema = z.object({
    orders: z.array(z.object({
      id: objectIdString,
      sortOrder: z.number().int().min(0).max(10_000),
    })).min(1).max(500),
  });

  const { orders } = schema.parse(req.body);

  await prisma.$transaction(
    orders.map(({ id, sortOrder }) =>
      prisma.category.update({
        where: { id },
        data: { sortOrder },
      })
    )
  );

  res.json({ success: true });
});

router.put('/items-reorder', requireStaff, async (req, res) => {
  const schema = z.object({
    orders: z.array(z.object({
      id: objectIdString,
      sortOrder: z.number().int().min(0).max(10_000),
    })).min(1).max(500),
  });

  const { orders } = schema.parse(req.body);

  await prisma.$transaction(
    orders.map(({ id, sortOrder }) =>
      prisma.menuItem.update({
        where: { id },
        data: { sortOrder },
      })
    )
  );

  res.json({ success: true });
});

/** The category plus every descendant so deletes never leave orphaned children. */
async function categoryTree(rootId: string): Promise<string[]> {
  const ids = [rootId];
  for (let frontier = [rootId]; frontier.length > 0; ) {
    const children = await prisma.category.findMany({
      where: { parentId: { in: frontier } },
      select: { id: true },
    });
    frontier = children.map((c) => c.id).filter((cid) => !ids.includes(cid));
    ids.push(...frontier);
  }
  return ids;
}

router.delete('/categories/:id', requireAdmin, async (req, res) => {
  const id = idParam(req.params);
  const existing = await prisma.category.findUnique({ where: { id } });
  if (!existing) throw notFound('Category');

  if (isFixedCategory(existing)) {
    throw new AppError(400, 'VALIDATION_ERROR', 'Cannot delete fixed main categories (Lunch Menu, Takeout Menu, Grand Menu)');
  }

  const ids = await categoryTree(id);
  // Delete items first so the FK from MenuItem to Category isn't violated.
  await prisma.menuItem.deleteMany({ where: { categoryId: { in: ids } } });
  await prisma.category.deleteMany({ where: { id: { in: ids } } });
  res.json({ success: true });
});

// ---- Items ---------------------------------------------------------------

router.get('/items', publicCache, async (_req, res) => {
  const items = await prisma.menuItem.findMany({
    include: {
      category: true,
      variants: { orderBy: { sortOrder: 'asc' } },
      optionGroups: { select: { id: true, nameJa: true, nameEn: true, type: true } },
    },
    orderBy: [{ categoryId: 'asc' }, { sortOrder: 'asc' }, { createdAt: 'desc' }],
  });
  res.json(items);
});

router.post('/items', requireStaff, async (req, res) => {
  const { categoryId, categoryName, optionGroupIds, ...fields } = itemCreateSchema.parse(req.body) as any;

  let catId = categoryId as string | undefined;
  if (!catId) {
    let category = await prisma.category.findFirst({ where: { nameEn: categoryName } });
    if (!category) {
      category = await prisma.category.create({
        data: { nameEn: categoryName, nameJa: categoryName, sortOrder: 0 },
      });
    }
    catId = category.id;
  }

  const item = await prisma.menuItem.create({
    data: {
      categoryId: catId,
      menuTypes: fields.menuTypes ?? [],
      nameEn: fields.nameEn,
      nameJa: fields.nameJa ?? null,
      descriptionEn: fields.descriptionEn ?? '',
      descriptionJa: fields.descriptionJa ?? null,
      price: fields.price,
      imageUrl: fields.imageUrl ?? '',
      rating: fields.rating ?? null,
      spiceLevel: fields.spiceLevel ?? 0,
      allergens: fields.allergens ?? [],
      isRecommended: fields.isRecommended ?? false,
      isVegetarian: fields.isVegetarian ?? false,
      isVegan: fields.isVegan ?? false,
      isHalal: fields.isHalal ?? false,
      isGlutenFree: fields.isGlutenFree ?? false,
      isSoldOut: fields.isSoldOut ?? false,
      isOrderable: fields.isOrderable ?? true,
      isActive: fields.isActive ?? true,
      sortOrder: fields.sortOrder ?? 0,
      ...(optionGroupIds?.length ? { optionGroups: { connect: (optionGroupIds as string[]).map((id: string) => ({ id })) } } : {}),
    },
  });
  res.status(201).json(item);
});

// ---- Bulk import (CSV / Excel, parsed in the browser) -----------------------

const MAX_IMPORT_ROWS = 200;

const importRowSchema = z.object({
  ...itemFields,
  // "Lunch Menu > Lunch Set" creates/uses a sub-category under "Lunch Menu".
  categoryPath: z.array(z.string().trim().min(1).max(100)).min(1).max(4),
});

const importSchema = z.object({
  mode: z.enum(['upsert', 'create']).default('upsert'),
  targetCategoryId: z.string().trim().optional(),
  rows: z.array(z.unknown()).min(1).max(MAX_IMPORT_ROWS),
  // Row number in the user's file, so errors point at the right line.
  rowNumbers: z.array(z.number().int()).optional(),
});

const sameName = (a: string | null | undefined, b: string) => (a ?? '').trim().toLowerCase() === b.trim().toLowerCase();

/**
 * Creates or updates many menu items at once.
 * When targetCategoryId is provided, all imported items are placed directly into that selected category
 * without creating any new categories.
 */
router.post('/items/import', requireAdmin, async (req, res) => {
  const { mode, targetCategoryId, rows, rowNumbers } = importSchema.parse(req.body);

  const categories = await prisma.category.findMany();
  let explicitCategory = targetCategoryId ? categories.find(c => c.id === targetCategoryId) : null;
  const categoryCache = new Map<string, string>();

  const resolveCategory = async (path: string[]): Promise<string> => {
    if (explicitCategory) {
      return explicitCategory.id;
    }

    let parentId: string | null = null;
    for (let depth = 0; depth < path.length; depth++) {
      const key = path.slice(0, depth + 1).join('\u0000').toLowerCase();
      const cached = categoryCache.get(key);
      if (cached) { parentId = cached; continue; }
      const name = path[depth];
      let found = categories.find((c) => (c.parentId ?? null) === parentId && (sameName(c.nameEn, name) || sameName(c.nameJa, name)));
      if (!found) {
        // Fallback: match by root category name without parent restriction
        found = categories.find((c) => sameName(c.nameEn, name) || sameName(c.nameJa, name));
      }
      if (!found) {
        throw new Error(`Category "${name}" does not exist. Please create categories first or import into a selected category.`);
      }
      categoryCache.set(key, found.id);
      parentId = found.id;
    }
    return parentId as string;
  };

  let created = 0;
  let updated = 0;
  const errors: { row: number; message: string }[] = [];

  for (let index = 0; index < rows.length; index++) {
    const rowNumber = rowNumbers?.[index] ?? index + 1;
    const parsed = importRowSchema.safeParse(rows[index]);
    if (!parsed.success) {
      const issue = parsed.error.issues[0];
      errors.push({ row: rowNumber, message: `${issue.path.join('.') || 'row'}: ${issue.message}` });
      continue;
    }
    const { categoryPath, ...fields } = parsed.data;
    try {
      const categoryId = await resolveCategory(categoryPath);
      const existing = mode === 'upsert'
        ? await prisma.menuItem.findFirst({
            where: {
              categoryId,
              OR: [{ nameEn: fields.nameEn }, ...(fields.nameJa ? [{ nameJa: fields.nameJa }] : [])],
            },
            select: { id: true },
          })
        : null;

      if (existing) {
        await prisma.menuItem.update({ where: { id: existing.id }, data: definedOnly(fields) as any });
        updated++;
      } else {
        await prisma.menuItem.create({
          data: {
            categoryId,
            menuTypes: fields.menuTypes ?? [],
            nameEn: fields.nameEn,
            nameJa: fields.nameJa ?? null,
            descriptionEn: fields.descriptionEn ?? '',
            descriptionJa: fields.descriptionJa ?? null,
            price: fields.price,
            imageUrl: fields.imageUrl ?? '',
            rating: fields.rating ?? null,
            spiceLevel: fields.spiceLevel ?? 0,
            allergens: fields.allergens ?? [],
            isRecommended: fields.isRecommended ?? false,
            isVegetarian: fields.isVegetarian ?? false,
            isVegan: fields.isVegan ?? false,
            isHalal: fields.isHalal ?? false,
            isGlutenFree: fields.isGlutenFree ?? false,
            isSoldOut: fields.isSoldOut ?? false,
            isOrderable: fields.isOrderable ?? true,
            isActive: fields.isActive ?? true,
            sortOrder: fields.sortOrder ?? 0,
          },
        });
        created++;
      }
    } catch (err) {
      errors.push({ row: rowNumber, message: err instanceof Error ? err.message : 'Could not save' });
    }
  }

  res.json({ created, updated, failed: errors.length, errors });
});

router.put('/items/:id', requireStaff, async (req, res) => {
  const id = idParam(req.params);
  const { optionGroupIds, categoryId, menuTypes, allergens, ...rest } = definedOnly(itemUpdateSchema.parse(req.body));

  const data: Record<string, unknown> = { ...rest };
  if (categoryId !== undefined) data.categoryId = categoryId;
  if (menuTypes !== undefined) data.menuTypes = menuTypes;
  if (allergens !== undefined) data.allergens = allergens;

  const connectDisconnect = optionGroupIds !== undefined
    ? { optionGroups: { set: optionGroupIds.map((gid: string) => ({ id: gid })) } }
    : {};

  try {
    await prisma.menuItem.update({ where: { id }, data: { ...data, ...connectDisconnect } as any });
  } catch {
    throw notFound('Menu item');
  }
  res.json({ success: true });
});

router.delete('/items/:id', requireAdmin, async (req, res) => {
  const id = idParam(req.params);
  try {
    await prisma.menuItem.delete({ where: { id } });
  } catch {
    throw notFound('Menu item');
  }
  res.json({ success: true });
});

// ---- Option Groups ---------------------------------------------------------

const optionChoiceSchema = z.object({
  id: z.string().trim().min(1).max(50),
  nameJa: z.string().trim().min(1).max(100),
  nameEn: z.string().trim().min(1).max(100),
  priceAdjust: z.coerce.number().int().min(-100000).max(100000).default(0),
});

const optionGroupSchema = z.object({
  nameJa: z.string().trim().min(1).max(100),
  nameEn: z.string().trim().min(1).max(100),
  type: z.enum(['RADIO', 'CHECKBOX']).default('RADIO'),
  required: z.boolean().default(true),
  options: z.array(optionChoiceSchema).min(1).max(30),
  sortOrder: z.coerce.number().int().min(0).max(10000).default(0),
});

router.get('/option-groups', publicCache, async (_req, res) => {
  const groups = await prisma.optionGroup.findMany({ orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }] });
  res.json(groups.map((g) => ({
    id: g.id,
    nameJa: g.nameJa,
    nameEn: g.nameEn,
    type: g.type,
    required: g.required,
    options: g.options,
    sortOrder: g.sortOrder,
  })));
});

router.post('/option-groups', requireAdmin, async (req, res) => {
  const data = optionGroupSchema.parse(req.body);
  const group = await prisma.optionGroup.create({ data: { ...data, options: data.options as unknown as Parameters<typeof prisma.optionGroup.create>[0]['data']['options'] } });
  res.status(201).json({ id: group.id, ...data });
});

router.put('/option-groups/:id', requireAdmin, async (req, res) => {
  const id = idParam(req.params);
  const group = await prisma.optionGroup.findUnique({ where: { id } });
  if (!group) throw notFound('OptionGroup');
  const data = optionGroupSchema.partial().parse(req.body);
  const updated = await prisma.optionGroup.update({
    where: { id },
    data: data.options !== undefined
      ? { ...data, options: data.options as unknown as Parameters<typeof prisma.optionGroup.update>[0]['data']['options'] }
      : data,
  });
  res.json({ id: updated.id, nameJa: updated.nameJa, nameEn: updated.nameEn, type: updated.type, required: updated.required, options: updated.options, sortOrder: updated.sortOrder });
});

router.delete('/option-groups/:id', requireAdmin, async (req, res) => {
  const id = idParam(req.params);
  try {
    await prisma.optionGroup.delete({ where: { id } });
  } catch {
    throw notFound('OptionGroup');
  }
  res.status(204).end();
});

export default router;
