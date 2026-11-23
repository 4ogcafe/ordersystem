/**
 * Ensure set menu items require Spice / Drink / Curry / Naan / Snacks.
 * Run: pnpm --filter api exec tsx scripts/ensure-set-options.ts
 */
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const SET_GROUP_ORDER = [
  { nameEn: 'Spice Level', nameJa: '辛さ', sortOrder: 1 },
  { nameEn: 'Drink', nameJa: 'ドリンク', sortOrder: 2 },
  { nameEn: 'Curry Choice', nameJa: 'カレーの選択', sortOrder: 3 },
  { nameEn: 'Naan Choice', nameJa: 'ナンの種類', sortOrder: 4 },
  { nameEn: 'Snacks', nameJa: 'スナック', sortOrder: 5 },
] as const;

async function ensureSnacksGroup() {
  const existing = await prisma.optionGroup.findFirst({
    where: { OR: [{ nameEn: 'Snacks' }, { nameJa: 'スナック' }] },
  });
  if (existing) {
    await prisma.optionGroup.update({
      where: { id: existing.id },
      data: { required: true, type: 'RADIO', sortOrder: existing.sortOrder || 8 },
    });
    return existing.id;
  }
  const created = await prisma.optionGroup.create({
    data: {
      nameJa: 'スナック',
      nameEn: 'Snacks',
      type: 'RADIO',
      required: true,
      sortOrder: 8,
      options: [
        { id: 'snack-samosa', nameJa: 'サモサ', nameEn: 'Samosa', priceAdjust: 0 },
        { id: 'snack-onion-bhaji', nameJa: 'オニオンバジ', nameEn: 'Onion Bhaji', priceAdjust: 0 },
        { id: 'snack-papadum', nameJa: 'パパダム', nameEn: 'Papadum', priceAdjust: 0 },
        { id: 'snack-none', nameJa: 'なし', nameEn: 'None', priceAdjust: 0 },
      ],
    },
  });
  console.log('  ✓ Created Snacks option group');
  return created.id;
}

async function main() {
  const snacksId = await ensureSnacksGroup();

  // Make Drink required for set flows.
  await prisma.optionGroup.updateMany({
    where: { OR: [{ nameEn: 'Drink' }, { nameJa: 'ドリンク' }] },
    data: { required: true },
  });

  const groups = await prisma.optionGroup.findMany();
  const byEn = new Map(groups.map((g) => [g.nameEn, g]));
  const byJa = new Map(groups.map((g) => [g.nameJa, g]));

  const setGroupIds: string[] = [];
  for (const def of SET_GROUP_ORDER) {
    const g = byEn.get(def.nameEn) || byJa.get(def.nameJa);
    if (!g) {
      console.warn(`  ! Missing option group: ${def.nameEn}`);
      continue;
    }
    if (!g.required) {
      await prisma.optionGroup.update({ where: { id: g.id }, data: { required: true } });
    }
    setGroupIds.push(g.id);
  }
  if (!setGroupIds.includes(snacksId)) setGroupIds.push(snacksId);

  const setItems = await prisma.menuItem.findMany({
    where: {
      OR: [
        { nameJa: { contains: 'セット' } },
        { nameEn: { contains: 'Set' } },
        { category: { nameJa: { contains: 'セット' } } },
        { category: { nameEn: { contains: 'Set' } } },
      ],
    },
    include: { optionGroups: { select: { id: true } }, category: { select: { nameJa: true, nameEn: true } } },
  });

  console.log(`  Found ${setItems.length} set item(s); linking ${setGroupIds.length} required groups`);

  for (const item of setItems) {
    await prisma.menuItem.update({
      where: { id: item.id },
      data: { optionGroups: { set: setGroupIds.map((id) => ({ id })) } },
    });
    console.log(`  ✓ ${item.nameJa || item.nameEn} ← ${setGroupIds.length} groups`);
  }

  console.log('Done.');
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
