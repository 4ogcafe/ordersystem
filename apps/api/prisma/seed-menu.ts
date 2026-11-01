/**
 * Menu seed: categories, option groups, and sample items.
 * Run with:  npx tsx prisma/seed-menu.ts
 */
import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Seeding menu data…');

  // ── 1. Clean existing menu data (order matters for FK) ──────────────────────
  await prisma.stamp.deleteMany();       // references orderId which references items
  await prisma.stampReward.deleteMany();
  await prisma.$executeRaw`DELETE FROM \`_MenuItemToOptionGroup\``;
  await prisma.optionGroup.deleteMany();
  await prisma.menuItem.deleteMany();
  await prisma.category.deleteMany();
  console.log('  ✓ Cleared old menu data');

  // ── 2. Parent categories ────────────────────────────────────────────────────
  const lunchMenu = await prisma.category.create({
    data: { nameEn: 'Lunch Menu', nameJa: 'ランチメニュー', sortOrder: 1, dineIn: true },
  });
  const takeoutMenu = await prisma.category.create({
    data: { nameEn: 'Takeout Menu', nameJa: 'テイクアウトメニュー', sortOrder: 2, dineIn: false },
  });
  const grandMenu = await prisma.category.create({
    data: { nameEn: 'Grand Menu', nameJa: 'グランドメニュー', sortOrder: 3, dineIn: true },
  });
  console.log('  ✓ Created parent categories');

  // ── 3. Sub-categories: Lunch Menu ──────────────────────────────────────────
  const lunchSet = await prisma.category.create({
    data: { nameEn: 'Lunch Set', nameJa: 'ランチセット', sortOrder: 1, parentId: lunchMenu.id, dineIn: true },
  });
  const lunchTakeout = await prisma.category.create({
    data: { nameEn: 'Lunch Takeout', nameJa: 'ランチテイクアウト', sortOrder: 2, parentId: lunchMenu.id, dineIn: false },
  });
  const lunchDrinks = await prisma.category.create({
    data: { nameEn: 'Lunch Drinks', nameJa: 'ランチドリンク', sortOrder: 3, parentId: lunchMenu.id, dineIn: true },
  });

  // ── 4. Sub-categories: Takeout Menu ────────────────────────────────────────
  const dinnerTakeout = await prisma.category.create({
    data: { nameEn: 'Dinner Takeout', nameJa: 'ディナーテイクアウト', sortOrder: 1, parentId: takeoutMenu.id, dineIn: false },
  });
  const snacksTakeout = await prisma.category.create({
    data: { nameEn: 'Snacks & Sides', nameJa: 'スナック・サイド', sortOrder: 2, parentId: takeoutMenu.id, dineIn: false },
  });
  const breadsTakeout = await prisma.category.create({
    data: { nameEn: 'Breads (Takeout)', nameJa: 'ナン（テイクアウト）', sortOrder: 3, parentId: takeoutMenu.id, dineIn: false },
  });

  // ── 5. Sub-categories: Grand Menu ──────────────────────────────────────────
  const chickenCurries = await prisma.category.create({
    data: { nameEn: 'Chicken Curries', nameJa: 'チキンカレー', sortOrder: 1, parentId: grandMenu.id, dineIn: true },
  });
  const muttonCurries = await prisma.category.create({
    data: { nameEn: 'Mutton & Lamb', nameJa: 'マトン・ラム', sortOrder: 2, parentId: grandMenu.id, dineIn: true },
  });
  const seafoodCurries = await prisma.category.create({
    data: { nameEn: 'Seafood Curries', nameJa: 'シーフードカレー', sortOrder: 3, parentId: grandMenu.id, dineIn: true },
  });
  const vegCurries = await prisma.category.create({
    data: { nameEn: 'Vegetarian Curries', nameJa: 'ベジタリアンカレー', sortOrder: 4, parentId: grandMenu.id, dineIn: true },
  });
  const breadsGrand = await prisma.category.create({
    data: { nameEn: 'Breads & Rice', nameJa: 'ナン・ライス', sortOrder: 5, parentId: grandMenu.id, dineIn: true },
  });
  const tandoori = await prisma.category.create({
    data: { nameEn: 'Tandoori & Starters', nameJa: 'タンドリー・スターター', sortOrder: 6, parentId: grandMenu.id, dineIn: true },
  });
  const dessertsGrand = await prisma.category.create({
    data: { nameEn: 'Desserts', nameJa: 'デザート', sortOrder: 7, parentId: grandMenu.id, dineIn: true },
  });
  const drinksGrand = await prisma.category.create({
    data: { nameEn: 'Drinks', nameJa: 'ドリンク', sortOrder: 8, parentId: grandMenu.id, dineIn: true },
  });
  console.log('  ✓ Created all sub-categories');

  // ── 6. Option groups ────────────────────────────────────────────────────────
  const spiceLevel = await prisma.optionGroup.create({
    data: {
      nameJa: '辛さ', nameEn: 'Spice Level',
      type: 'RADIO', required: true, sortOrder: 1,
      options: [
        { id: 'spice-mild',       nameJa: '辛くない（マイルド）', nameEn: 'Mild',       priceAdjust: 0 },
        { id: 'spice-medium',     nameJa: '中辛（ミディアム）',   nameEn: 'Medium',     priceAdjust: 0 },
        { id: 'spice-hot',        nameJa: '辛口（ホット）',       nameEn: 'Hot',        priceAdjust: 0 },
        { id: 'spice-extra-hot',  nameJa: '激辛（エクストラ）',   nameEn: 'Extra Hot',  priceAdjust: 0 },
      ],
    },
  });

  const nanChoice = await prisma.optionGroup.create({
    data: {
      nameJa: 'ナンの種類', nameEn: 'Naan Choice',
      type: 'RADIO', required: true, sortOrder: 2,
      options: [
        { id: 'nan-plain',   nameJa: 'プレーンナン',   nameEn: 'Plain Naan',   priceAdjust: 0   },
        { id: 'nan-garlic',  nameJa: 'ガーリックナン', nameEn: 'Garlic Naan',  priceAdjust: 50  },
        { id: 'nan-butter',  nameJa: 'バターナン',     nameEn: 'Butter Naan',  priceAdjust: 50  },
        { id: 'nan-cheese',  nameJa: 'チーズナン',     nameEn: 'Cheese Naan',  priceAdjust: 150 },
        { id: 'nan-keema',   nameJa: 'キーマナン',     nameEn: 'Keema Naan',   priceAdjust: 200 },
      ],
    },
  });

  const riceChoice = await prisma.optionGroup.create({
    data: {
      nameJa: 'ライスの種類', nameEn: 'Rice Choice',
      type: 'RADIO', required: false, sortOrder: 3,
      options: [
        { id: 'rice-none',    nameJa: 'なし',                 nameEn: 'No Rice',      priceAdjust: 0   },
        { id: 'rice-basmati', nameJa: 'バスマティライス',     nameEn: 'Basmati Rice', priceAdjust: 0   },
        { id: 'rice-jeera',   nameJa: 'ジーラライス',         nameEn: 'Jeera Rice',   priceAdjust: 100 },
        { id: 'rice-biryani', nameJa: 'ビリヤニ風ライス',     nameEn: 'Biryani Rice', priceAdjust: 250 },
      ],
    },
  });

  const extras = await prisma.optionGroup.create({
    data: {
      nameJa: 'トッピング', nameEn: 'Add-ons',
      type: 'CHECKBOX', required: false, sortOrder: 4,
      options: [
        { id: 'extra-raita',    nameJa: 'ライタ',       nameEn: 'Raita',        priceAdjust: 100 },
        { id: 'extra-papadum',  nameJa: 'パパダム',     nameEn: 'Papadum',      priceAdjust: 100 },
        { id: 'extra-pickle',   nameJa: 'ピクルス',     nameEn: 'Pickle',       priceAdjust: 100 },
        { id: 'extra-chutney',  nameJa: 'チャツネ',     nameEn: 'Chutney',      priceAdjust: 100 },
        { id: 'extra-salad',    nameJa: 'サラダ',       nameEn: 'Salad',        priceAdjust: 200 },
      ],
    },
  });

  const drinkChoice = await prisma.optionGroup.create({
    data: {
      nameJa: 'ドリンク', nameEn: 'Drink',
      type: 'RADIO', required: false, sortOrder: 5,
      options: [
        { id: 'drink-water',   nameJa: 'お水',             nameEn: 'Water',          priceAdjust: 0   },
        { id: 'drink-lassi',   nameJa: 'ラッシー',         nameEn: 'Lassi',          priceAdjust: 0   },
        { id: 'drink-chai',    nameJa: 'チャイ',           nameEn: 'Masala Chai',    priceAdjust: 0   },
        { id: 'drink-mango',   nameJa: 'マンゴーラッシー', nameEn: 'Mango Lassi',    priceAdjust: 100 },
        { id: 'drink-cola',    nameJa: 'コーラ',           nameEn: 'Cola',           priceAdjust: 50  },
      ],
    },
  });

  const lunchCurryChoice = await prisma.optionGroup.create({
    data: {
      nameJa: 'カレーの選択', nameEn: 'Curry Choice',
      type: 'RADIO', required: true, sortOrder: 6,
      options: [
        { id: 'curry-butter',  nameJa: 'バターチキン',       nameEn: 'Butter Chicken',     priceAdjust: 0   },
        { id: 'curry-tikka',   nameJa: 'チキンティッカ',     nameEn: 'Chicken Tikka',      priceAdjust: 0   },
        { id: 'curry-keema',   nameJa: 'キーマカレー',       nameEn: 'Keema Curry',        priceAdjust: 0   },
        { id: 'curry-palak',   nameJa: 'パラックパニール',   nameEn: 'Palak Paneer',       priceAdjust: 0   },
        { id: 'curry-mutton',  nameJa: 'マトンカレー',       nameEn: 'Mutton Curry',       priceAdjust: 200 },
        { id: 'curry-prawn',   nameJa: 'プロウンカレー',     nameEn: 'Prawn Curry',        priceAdjust: 200 },
      ],
    },
  });

  const nanCount = await prisma.optionGroup.create({
    data: {
      nameJa: 'ナンの枚数', nameEn: 'Number of Naan',
      type: 'RADIO', required: true, sortOrder: 7,
      options: [
        { id: 'nan-1', nameJa: '1枚',  nameEn: '1 piece',   priceAdjust: 0   },
        { id: 'nan-2', nameJa: '2枚',  nameEn: '2 pieces',  priceAdjust: 250 },
        { id: 'nan-3', nameJa: '3枚',  nameEn: '3 pieces',  priceAdjust: 450 },
      ],
    },
  });
  console.log('  ✓ Created option groups');

  // ── 7. Sample menu items ────────────────────────────────────────────────────

  // Lunch Sets
  await prisma.menuItem.create({
    data: {
      categoryId: lunchSet.id,
      nameEn: 'Lunch Set A', nameJa: 'ランチセット A',
      descriptionEn: 'One curry of your choice + Naan (1 piece) + Mini Salad + Drink. A satisfying everyday lunch.',
      descriptionJa: 'カレー1種 + ナン1枚 + ミニサラダ + ドリンク。毎日食べたくなるランチセット。',
      price: 980, menuTypes: ['LUNCH'], spiceLevel: 1,
      allergens: ['小麦', '乳'], isRecommended: true, isActive: true, sortOrder: 1,
      optionGroups: { connect: [{ id: lunchCurryChoice.id }, { id: nanChoice.id }, { id: drinkChoice.id }, { id: spiceLevel.id }] },
    },
  });

  await prisma.menuItem.create({
    data: {
      categoryId: lunchSet.id,
      nameEn: 'Lunch Set B', nameJa: 'ランチセット B',
      descriptionEn: 'Two curries of your choice + Naan (2 pieces) + Salad + Lassi. Perfect for a big appetite.',
      descriptionJa: 'カレー2種 + ナン2枚 + サラダ + ラッシー。食べ応え抜群のセット。',
      price: 1380, menuTypes: ['LUNCH'], spiceLevel: 1,
      allergens: ['小麦', '乳'], isRecommended: false, isActive: true, sortOrder: 2,
      optionGroups: { connect: [{ id: nanChoice.id }, { id: extras.id }, { id: spiceLevel.id }] },
    },
  });

  await prisma.menuItem.create({
    data: {
      categoryId: lunchSet.id,
      nameEn: 'Vegetarian Lunch Set', nameJa: 'ベジタリアンランチセット',
      descriptionEn: 'Palak Paneer + Dal Tadka + Naan + Salad + Mango Lassi. 100% vegetarian.',
      descriptionJa: 'パラックパニール + ダルタドカ + ナン + サラダ + マンゴーラッシー。完全菜食メニュー。',
      price: 1080, menuTypes: ['LUNCH'], spiceLevel: 1,
      allergens: ['小麦', '乳'], isVegetarian: true, isActive: true, sortOrder: 3,
      optionGroups: { connect: [{ id: nanChoice.id }, { id: spiceLevel.id }] },
    },
  });

  // Lunch Takeout
  await prisma.menuItem.create({
    data: {
      categoryId: lunchTakeout.id,
      nameEn: 'Takeout Lunch Box', nameJa: 'テイクアウトランチボックス',
      descriptionEn: 'Curry of your choice + Basmati rice in an eco-friendly box.',
      descriptionJa: 'カレー1種 + バスマティライス。エコボックス入り。',
      price: 850, menuTypes: ['LUNCH', 'TAKEOUT'], spiceLevel: 1,
      allergens: [], isActive: true, sortOrder: 1,
      optionGroups: { connect: [{ id: lunchCurryChoice.id }, { id: spiceLevel.id }] },
    },
  });

  await prisma.menuItem.create({
    data: {
      categoryId: lunchTakeout.id,
      nameEn: 'Takeout Naan Set', nameJa: 'テイクアウトナンセット',
      descriptionEn: 'Curry + 2 Naan to go.',
      descriptionJa: 'カレー + ナン2枚のテイクアウトセット。',
      price: 980, menuTypes: ['LUNCH', 'TAKEOUT'], spiceLevel: 1,
      allergens: ['小麦', '乳'], isActive: true, sortOrder: 2,
      optionGroups: { connect: [{ id: lunchCurryChoice.id }, { id: nanChoice.id }, { id: spiceLevel.id }] },
    },
  });

  // Dinner Takeout
  await prisma.menuItem.create({
    data: {
      categoryId: dinnerTakeout.id,
      nameEn: 'Dinner Takeout Set', nameJa: 'ディナーテイクアウトセット',
      descriptionEn: 'Any 2 curries + 2 Naan + Rice. Ready in 20 min.',
      descriptionJa: 'カレー2種 + ナン2枚 + ライス。20分でご用意。',
      price: 1980, menuTypes: ['TAKEOUT'], spiceLevel: 2,
      allergens: ['小麦', '乳'], isActive: true, sortOrder: 1,
      optionGroups: { connect: [{ id: nanChoice.id }, { id: riceChoice.id }, { id: spiceLevel.id }, { id: extras.id }] },
    },
  });

  await prisma.menuItem.create({
    data: {
      categoryId: dinnerTakeout.id,
      nameEn: 'Party Pack (4–5 persons)', nameJa: 'パーティーセット（4〜5人前）',
      descriptionEn: '4 curries + 8 Naan + Salad + Raita. Perfect for parties and families.',
      descriptionJa: 'カレー4種 + ナン8枚 + サラダ + ライタ。ご家族・パーティーに最適。',
      price: 6800, menuTypes: ['TAKEOUT'], spiceLevel: 1,
      allergens: ['小麦', '乳'], isRecommended: true, isActive: true, sortOrder: 2,
      optionGroups: { connect: [{ id: spiceLevel.id }] },
    },
  });

  // Snacks
  await prisma.menuItem.create({
    data: {
      categoryId: snacksTakeout.id,
      nameEn: 'Samosa (2 pcs)', nameJa: 'サモサ（2個）',
      descriptionEn: 'Crispy pastry filled with spiced potato and peas. A classic Indian snack.',
      descriptionJa: 'スパイシーなポテトとグリーンピース入りのサクサクパイ。インドの定番スナック。',
      price: 450, menuTypes: ['TAKEOUT', 'GRAND'], spiceLevel: 1,
      allergens: ['小麦'], isVegetarian: true, isActive: true, sortOrder: 1,
    },
  });

  await prisma.menuItem.create({
    data: {
      categoryId: snacksTakeout.id,
      nameEn: 'Onion Bhaji (4 pcs)', nameJa: 'オニオンバジ（4個）',
      descriptionEn: 'Deep-fried onion fritters with gram flour and spices.',
      descriptionJa: '玉ねぎとひよこ豆粉のフリッター。',
      price: 500, menuTypes: ['TAKEOUT', 'GRAND'], spiceLevel: 1,
      allergens: ['小麦'], isVegetarian: true, isGlutenFree: false, isActive: true, sortOrder: 2,
    },
  });

  // Breads (Takeout)
  await prisma.menuItem.create({
    data: {
      categoryId: breadsTakeout.id,
      nameEn: 'Plain Naan (Takeout)', nameJa: 'プレーンナン（テイクアウト）',
      descriptionEn: 'Soft leavened flatbread baked in a clay tandoor oven.',
      descriptionJa: 'タンドール釜で焼いたふわふわのナン。',
      price: 180, menuTypes: ['TAKEOUT'], spiceLevel: 0,
      allergens: ['小麦', '乳'], isVegetarian: true, isActive: true, sortOrder: 1,
    },
  });

  await prisma.menuItem.create({
    data: {
      categoryId: breadsTakeout.id,
      nameEn: 'Garlic Naan (Takeout)', nameJa: 'ガーリックナン（テイクアウト）',
      descriptionEn: 'Naan topped with roasted garlic and cilantro.',
      descriptionJa: 'ローストガーリックとコリアンダーをのせたナン。',
      price: 220, menuTypes: ['TAKEOUT'], spiceLevel: 0,
      allergens: ['小麦', '乳'], isVegetarian: true, isActive: true, sortOrder: 2,
    },
  });

  // Grand Menu — Chicken Curries
  await prisma.menuItem.create({
    data: {
      categoryId: chickenCurries.id,
      nameEn: 'Butter Chicken', nameJa: 'バターチキン',
      descriptionEn: 'Tender chicken in a creamy, mildly spiced tomato-butter sauce. The crowd favourite.',
      descriptionJa: '柔らかいチキンをクリーミーなトマトバターソースで仕上げた定番カレー。',
      price: 1350, menuTypes: ['GRAND'], spiceLevel: 1,
      allergens: ['乳'], isRecommended: true, isActive: true, sortOrder: 1,
      optionGroups: { connect: [{ id: spiceLevel.id }, { id: extras.id }] },
    },
  });

  await prisma.menuItem.create({
    data: {
      categoryId: chickenCurries.id,
      nameEn: 'Chicken Tikka Masala', nameJa: 'チキンティッカマサラ',
      descriptionEn: 'Grilled chicken tikka in a rich, aromatic masala gravy.',
      descriptionJa: '炭火で焼いたチキンティッカを香り豊かなマサラソースで煮込んだカレー。',
      price: 1450, menuTypes: ['GRAND'], spiceLevel: 2,
      allergens: ['乳'], isActive: true, sortOrder: 2,
      optionGroups: { connect: [{ id: spiceLevel.id }, { id: extras.id }] },
    },
  });

  await prisma.menuItem.create({
    data: {
      categoryId: chickenCurries.id,
      nameEn: 'Chicken Vindaloo', nameJa: 'チキンヴィンダルー',
      descriptionEn: 'A fiery Goan-style curry with bold spices and a tangy vinegar base.',
      descriptionJa: 'ゴア風の激辛カレー。スパイスとビネガーが効いた大人の一品。',
      price: 1450, menuTypes: ['GRAND'], spiceLevel: 4,
      allergens: [], isActive: true, sortOrder: 3,
      optionGroups: { connect: [{ id: spiceLevel.id }] },
    },
  });

  await prisma.menuItem.create({
    data: {
      categoryId: chickenCurries.id,
      nameEn: 'Palak Chicken', nameJa: 'パラックチキン',
      descriptionEn: 'Chicken cooked with fresh spinach purée and aromatic spices.',
      descriptionJa: 'フレッシュほうれん草ピューレとスパイスで仕上げたチキンカレー。',
      price: 1380, menuTypes: ['GRAND'], spiceLevel: 2,
      allergens: [], isActive: true, sortOrder: 4,
      optionGroups: { connect: [{ id: spiceLevel.id }, { id: extras.id }] },
    },
  });

  // Grand Menu — Mutton & Lamb
  await prisma.menuItem.create({
    data: {
      categoryId: muttonCurries.id,
      nameEn: 'Mutton Curry', nameJa: 'マトンカレー',
      descriptionEn: 'Slow-cooked mutton pieces in a rich, fragrant curry sauce.',
      descriptionJa: 'じっくり煮込んだマトンの本格カレー。',
      price: 1680, menuTypes: ['GRAND'], spiceLevel: 3,
      allergens: [], isRecommended: true, isActive: true, sortOrder: 1,
      optionGroups: { connect: [{ id: spiceLevel.id }, { id: extras.id }] },
    },
  });

  await prisma.menuItem.create({
    data: {
      categoryId: muttonCurries.id,
      nameEn: 'Keema Curry', nameJa: 'キーマカレー',
      descriptionEn: 'Minced mutton with green peas, tomato, and warming spices.',
      descriptionJa: 'グリーンピースとトマトを加えたひき肉カレー。スパイスが効いて食欲をそそる。',
      price: 1480, menuTypes: ['GRAND', 'TAKEOUT'], spiceLevel: 2,
      allergens: [], isActive: true, sortOrder: 2,
      optionGroups: { connect: [{ id: spiceLevel.id }] },
    },
  });

  await prisma.menuItem.create({
    data: {
      categoryId: muttonCurries.id,
      nameEn: 'Lamb Rogan Josh', nameJa: 'ラムローガンジョシュ',
      descriptionEn: 'A Kashmiri classic: tender lamb in a deep-red sauce of whole spices.',
      descriptionJa: 'カシミール料理の傑作。ホールスパイスで仕込んだ深みのある赤いソース。',
      price: 1780, menuTypes: ['GRAND'], spiceLevel: 3,
      allergens: [], isActive: true, sortOrder: 3,
      optionGroups: { connect: [{ id: spiceLevel.id }, { id: extras.id }] },
    },
  });

  // Grand Menu — Seafood
  await prisma.menuItem.create({
    data: {
      categoryId: seafoodCurries.id,
      nameEn: 'Prawn Curry', nameJa: 'プロウンカレー',
      descriptionEn: 'Juicy prawns in a coconut-based South Indian curry.',
      descriptionJa: '南インド風ココナッツカレーにぷりぷりのエビ。',
      price: 1780, menuTypes: ['GRAND'], spiceLevel: 2,
      allergens: ['えび'], isActive: true, sortOrder: 1,
      optionGroups: { connect: [{ id: spiceLevel.id }, { id: extras.id }] },
    },
  });

  await prisma.menuItem.create({
    data: {
      categoryId: seafoodCurries.id,
      nameEn: 'Fish Curry', nameJa: 'フィッシュカレー',
      descriptionEn: 'White fish in a tangy Kerala-style curry with coconut milk and curry leaves.',
      descriptionJa: 'ケーララ風ホワイトフィッシュカレー。ラムのリーフが爽やか。',
      price: 1680, menuTypes: ['GRAND'], spiceLevel: 2,
      allergens: ['魚介類'], isActive: true, sortOrder: 2,
      optionGroups: { connect: [{ id: spiceLevel.id }] },
    },
  });

  // Grand Menu — Vegetarian
  await prisma.menuItem.create({
    data: {
      categoryId: vegCurries.id,
      nameEn: 'Palak Paneer', nameJa: 'パラックパニール',
      descriptionEn: 'Fresh cottage cheese in a silky spinach curry. A vegetarian classic.',
      descriptionJa: 'ほうれん草のピューレにパニールチーズを合わせた定番ベジカレー。',
      price: 1280, menuTypes: ['GRAND'], spiceLevel: 1,
      allergens: ['乳'], isVegetarian: true, isActive: true, sortOrder: 1,
      optionGroups: { connect: [{ id: spiceLevel.id }, { id: extras.id }] },
    },
  });

  await prisma.menuItem.create({
    data: {
      categoryId: vegCurries.id,
      nameEn: 'Dal Tadka', nameJa: 'ダルタドカ',
      descriptionEn: 'Yellow lentils tempered with cumin, garlic, and chilli. A comforting dal.',
      descriptionJa: 'クミン・ガーリック・チリで風味づけした黄色いレンズ豆のカレー。',
      price: 1180, menuTypes: ['GRAND'], spiceLevel: 1,
      allergens: [], isVegetarian: true, isVegan: true, isActive: true, sortOrder: 2,
      optionGroups: { connect: [{ id: spiceLevel.id }] },
    },
  });

  await prisma.menuItem.create({
    data: {
      categoryId: vegCurries.id,
      nameEn: 'Aloo Gobi', nameJa: 'アルーゴビ',
      descriptionEn: 'Potatoes and cauliflower dry-cooked with turmeric and cumin.',
      descriptionJa: 'じゃがいもとカリフラワーをターメリックとクミンで炒め煮した一品。',
      price: 1180, menuTypes: ['GRAND'], spiceLevel: 1,
      allergens: [], isVegetarian: true, isVegan: true, isActive: true, sortOrder: 3,
      optionGroups: { connect: [{ id: spiceLevel.id }] },
    },
  });

  await prisma.menuItem.create({
    data: {
      categoryId: vegCurries.id,
      nameEn: 'Chana Masala', nameJa: 'チャナマサラ',
      descriptionEn: 'Chickpeas in a bold, tangy tomato and onion masala.',
      descriptionJa: 'ひよこ豆をトマトと玉ねぎのマサラでじっくり煮込んだ一品。',
      price: 1180, menuTypes: ['GRAND'], spiceLevel: 2,
      allergens: [], isVegetarian: true, isVegan: true, isActive: true, sortOrder: 4,
      optionGroups: { connect: [{ id: spiceLevel.id }] },
    },
  });

  // Breads & Rice
  await prisma.menuItem.create({
    data: {
      categoryId: breadsGrand.id,
      nameEn: 'Plain Naan', nameJa: 'プレーンナン',
      descriptionEn: 'Soft leavened flatbread baked in a clay tandoor oven.',
      descriptionJa: 'タンドール釜で焼いたふわふわのナン。',
      price: 220, menuTypes: ['GRAND'], spiceLevel: 0,
      allergens: ['小麦', '乳'], isVegetarian: true, isActive: true, sortOrder: 1,
    },
  });

  await prisma.menuItem.create({
    data: {
      categoryId: breadsGrand.id,
      nameEn: 'Garlic Naan', nameJa: 'ガーリックナン',
      descriptionEn: 'Naan topped with roasted garlic and fresh cilantro.',
      descriptionJa: 'ローストガーリックとコリアンダーをのせた香り豊かなナン。',
      price: 280, menuTypes: ['GRAND'], spiceLevel: 0,
      allergens: ['小麦', '乳'], isVegetarian: true, isRecommended: true, isActive: true, sortOrder: 2,
      optionGroups: { connect: [{ id: nanCount.id }] },
    },
  });

  await prisma.menuItem.create({
    data: {
      categoryId: breadsGrand.id,
      nameEn: 'Cheese Naan', nameJa: 'チーズナン',
      descriptionEn: 'Naan stuffed and topped with melted cheese.',
      descriptionJa: 'とろけるチーズをたっぷり使った贅沢ナン。',
      price: 380, menuTypes: ['GRAND'], spiceLevel: 0,
      allergens: ['小麦', '乳'], isVegetarian: true, isActive: true, sortOrder: 3,
    },
  });

  await prisma.menuItem.create({
    data: {
      categoryId: breadsGrand.id,
      nameEn: 'Keema Naan', nameJa: 'キーマナン',
      descriptionEn: 'Naan stuffed with spiced minced meat.',
      descriptionJa: 'スパイシーなひき肉を詰め込んだナン。',
      price: 420, menuTypes: ['GRAND'], spiceLevel: 1,
      allergens: ['小麦', '乳'], isActive: true, sortOrder: 4,
    },
  });

  await prisma.menuItem.create({
    data: {
      categoryId: breadsGrand.id,
      nameEn: 'Basmati Rice', nameJa: 'バスマティライス',
      descriptionEn: 'Steamed long-grain basmati rice.',
      descriptionJa: '長粒種のバスマティライス。',
      price: 280, menuTypes: ['GRAND'], spiceLevel: 0,
      allergens: [], isVegetarian: true, isVegan: true, isGlutenFree: true, isActive: true, sortOrder: 5,
    },
  });

  await prisma.menuItem.create({
    data: {
      categoryId: breadsGrand.id,
      nameEn: 'Jeera Rice', nameJa: 'ジーラライス',
      descriptionEn: 'Basmati rice toasted with cumin seeds and ghee.',
      descriptionJa: 'クミンシードとギーで香ばしく仕上げたバスマティライス。',
      price: 380, menuTypes: ['GRAND'], spiceLevel: 0,
      allergens: ['乳'], isVegetarian: true, isActive: true, sortOrder: 6,
    },
  });

  // Tandoori & Starters
  await prisma.menuItem.create({
    data: {
      categoryId: tandoori.id,
      nameEn: 'Chicken Tikka', nameJa: 'チキンティッカ',
      descriptionEn: 'Marinated chicken chunks grilled in the tandoor oven. Served with mint chutney.',
      descriptionJa: 'ヨーグルトとスパイスに漬け込み、タンドール釜で焼いたチキン。ミントチャツネ添え。',
      price: 980, menuTypes: ['GRAND'], spiceLevel: 2,
      allergens: ['乳'], isRecommended: true, isGlutenFree: true, isActive: true, sortOrder: 1,
      optionGroups: { connect: [{ id: spiceLevel.id }] },
    },
  });

  await prisma.menuItem.create({
    data: {
      categoryId: tandoori.id,
      nameEn: 'Tandoori Chicken (half)', nameJa: 'タンドリーチキン（ハーフ）',
      descriptionEn: 'Whole chicken half marinated in yogurt and spices, roasted in the tandoor.',
      descriptionJa: 'チキンをまるごとヨーグルトとスパイスに漬けてタンドール焼き。',
      price: 1280, menuTypes: ['GRAND'], spiceLevel: 2,
      allergens: ['乳'], isGlutenFree: true, isActive: true, sortOrder: 2,
      optionGroups: { connect: [{ id: spiceLevel.id }] },
    },
  });

  await prisma.menuItem.create({
    data: {
      categoryId: tandoori.id,
      nameEn: 'Samosa (2 pcs)', nameJa: 'サモサ（2個）',
      descriptionEn: 'Crispy pastry filled with spiced potato and peas.',
      descriptionJa: 'スパイシーなポテトとグリーンピース入りのサクサクパイ。',
      price: 480, menuTypes: ['GRAND'], spiceLevel: 1,
      allergens: ['小麦'], isVegetarian: true, isActive: true, sortOrder: 3,
    },
  });

  // Desserts
  await prisma.menuItem.create({
    data: {
      categoryId: dessertsGrand.id,
      nameEn: 'Gulab Jamun', nameJa: 'グラブジャムン',
      descriptionEn: 'Soft milk-solid dumplings soaked in rose-scented sugar syrup.',
      descriptionJa: 'バラの香りの糖蜜に浸したミルクダンプリング。2個入り。',
      price: 480, menuTypes: ['GRAND'], spiceLevel: 0,
      allergens: ['小麦', '乳'], isVegetarian: true, isActive: true, sortOrder: 1,
    },
  });

  await prisma.menuItem.create({
    data: {
      categoryId: dessertsGrand.id,
      nameEn: 'Kheer (Rice Pudding)', nameJa: 'キール（ライスプディング）',
      descriptionEn: 'Creamy Indian rice pudding scented with cardamom and saffron.',
      descriptionJa: 'カルダモンとサフランの香りが漂うインド風ライスプディング。',
      price: 480, menuTypes: ['GRAND'], spiceLevel: 0,
      allergens: ['乳'], isVegetarian: true, isActive: true, sortOrder: 2,
    },
  });

  await prisma.menuItem.create({
    data: {
      categoryId: dessertsGrand.id,
      nameEn: 'Mango Kulfi', nameJa: 'マンゴークルフィ',
      descriptionEn: 'Traditional Indian ice cream made with condensed milk and mango.',
      descriptionJa: '練乳とマンゴーで作ったインド伝統のアイスクリーム。',
      price: 520, menuTypes: ['GRAND'], spiceLevel: 0,
      allergens: ['乳'], isVegetarian: true, isActive: true, sortOrder: 3,
    },
  });

  // Drinks
  await prisma.menuItem.create({
    data: {
      categoryId: drinksGrand.id,
      nameEn: 'Sweet Lassi', nameJa: 'スイートラッシー',
      descriptionEn: 'Chilled yogurt drink sweetened with sugar. Refreshing and cooling.',
      descriptionJa: 'ヨーグルトを使ったインドの定番ドリンク。甘くてさっぱり。',
      price: 380, menuTypes: ['GRAND', 'LUNCH'], spiceLevel: 0,
      allergens: ['乳'], isVegetarian: true, isActive: true, sortOrder: 1,
    },
  });

  await prisma.menuItem.create({
    data: {
      categoryId: drinksGrand.id,
      nameEn: 'Mango Lassi', nameJa: 'マンゴーラッシー',
      descriptionEn: 'Creamy yogurt drink blended with ripe Alphonso mangoes.',
      descriptionJa: 'アルフォンソマンゴーを使ったとろけるラッシー。',
      price: 480, menuTypes: ['GRAND', 'LUNCH'], spiceLevel: 0,
      allergens: ['乳'], isVegetarian: true, isRecommended: true, isActive: true, sortOrder: 2,
    },
  });

  await prisma.menuItem.create({
    data: {
      categoryId: drinksGrand.id,
      nameEn: 'Masala Chai', nameJa: 'マサラチャイ',
      descriptionEn: 'Spiced tea brewed with cardamom, ginger, cinnamon and steamed milk.',
      descriptionJa: 'カルダモン・生姜・シナモン入りのスパイシーな本格チャイ。',
      price: 380, menuTypes: ['GRAND', 'LUNCH'], spiceLevel: 0,
      allergens: ['乳'], isVegetarian: true, isActive: true, sortOrder: 3,
    },
  });

  await prisma.menuItem.create({
    data: {
      categoryId: lunchDrinks.id,
      nameEn: 'Soft Drink', nameJa: 'ソフトドリンク',
      descriptionEn: 'Cola, ginger ale, or orange juice.',
      descriptionJa: 'コーラ、ジンジャーエール、オレンジジュースからお選びください。',
      price: 280, menuTypes: ['LUNCH'], spiceLevel: 0,
      allergens: [], isVegetarian: true, isVegan: true, isActive: true, sortOrder: 1,
      optionGroups: { connect: [{ id: drinkChoice.id }] },
    },
  });

  console.log('  ✓ Created all menu items');

  // Summary
  const [catCount, itemCount, ogCount] = await Promise.all([
    prisma.category.count(),
    prisma.menuItem.count(),
    prisma.optionGroup.count(),
  ]);
  console.log(`\n✅ Done!`);
  console.log(`   Categories : ${catCount}`);
  console.log(`   Menu items : ${itemCount}`);
  console.log(`   Option groups: ${ogCount}`);
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (e) => { console.error(e); await prisma.$disconnect(); process.exit(1); });
