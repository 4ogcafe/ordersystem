import express from 'express';
import { z } from 'zod';
import { AppError } from '../lib/errors.js';
import { PICKUP_HOURS_PATTERN } from '../lib/pickup.js';
import { MAX_STAMPS_PER_CARD, MIN_STAMPS_PER_CARD, STAMP_REWARD_KINDS, withStampCardAlias } from '../lib/stamps.js';
import { definedOnly, googleMapEmbedUrl, httpsUrl, imageUrl, optionalText } from '../lib/schemas.js';
import { prisma } from '../lib/prisma.js';
import { readSession, requireAdmin } from '../middleware/auth.js';

const router = express.Router();

const SHORT_TEXT = 300;
const LONG_TEXT = 5000;

const text = (max = SHORT_TEXT) => optionalText(max);
const image = imageUrl.nullable().optional();
const jsonObject = z.record(z.string(), z.unknown()).optional();
const MAX_LEAD_MINUTES = 24 * 60;
const MAX_CLOSED_DATES = 100;
const MAX_YEN = 1_000_000;
const MAX_DELIVERY_AREAS = 100;
const MAX_COOLDOWN_HOURS = 24 * 30;
const MAX_REWARD_DAYS = 3650;

const stampRewardSchema = z.object({
  at: z.number().int().min(1).max(MAX_STAMPS_PER_CARD),
  titleJa: z.string().trim().min(1).max(100),
  kind: z.enum(STAMP_REWARD_KINDS),
  amount: z.number().int().min(0).max(MAX_YEN).nullable().optional(),
});

const settingsSchema = z.object({
  name: text(),
  email: z.union([z.literal(''), z.email().max(254)]).nullable().optional(),
  phone: text(50),
  addressEn: text(),
  addressJa: text(),
  weeklyHours: jsonObject,
  holidays: jsonObject,
  socials: jsonObject,
  mapUrl: httpsUrl.nullable().optional(),
  googleMapsLink: httpsUrl.nullable().optional(),
  aboutEn: text(LONG_TEXT),
  aboutJa: text(LONG_TEXT),
  aboutHeroTag: text(),
  aboutHeroTitle: text(),
  aboutStoryJa: text(LONG_TEXT),
  aboutStoryLabelJa: text(),
  aboutStoryTitleJa: text(),
  aboutStoryImage: image,
  aboutStoryWatermark: text(),
  aboutStoryOriginTitleJa: text(),
  aboutStoryOriginTextJa: text(LONG_TEXT),
  aboutStoryBadgeSubJa: text(),
  aboutStoryBadgeTitleJa: text(),
  aboutStoryPillar1TitleJa: text(),
  aboutStoryPillar1DescJa: text(LONG_TEXT),
  aboutStoryPillar2TitleJa: text(),
  aboutStoryPillar2DescJa: text(LONG_TEXT),
  aboutStoryPillar3TitleJa: text(),
  aboutStoryPillar3DescJa: text(LONG_TEXT),
  aboutSpiceLabelJa: text(),
  aboutSpiceTitleJa: text(),
  aboutSpiceDescJa: text(LONG_TEXT),
  aboutSpiceImage: image,
  aboutChefLabelJa: text(),
  aboutChefTitleJa: text(),
  aboutChefDescJa: text(LONG_TEXT),
  aboutChefImage: image,
  welcomeTitleEn: text(),
  welcomeTitleJa: text(),
  welcomeTextJa: text(LONG_TEXT),
  storeSectionLabelJa: text(),
  storeSectionTitleJa: text(),
  storeSectionSubJa: text(LONG_TEXT),
  storeLocationJa: text(),
  storeBadgeJa: text(),
  storeReviewScore: text(10),
  storeReviewText: text(),
  storeReviewLink: httpsUrl.nullable().optional(),
  storeLocations: z
    .array(
      z
        .object({
          id: z.string().trim().min(1).max(80),
          name: z.string().trim().min(1).max(100),
          address: z.string().trim().max(300).optional(),
          mapEmbedUrl: googleMapEmbedUrl.optional(),
        })
        .passthrough(),
    )
    .max(50)
    .optional(),
  heroTagJa: text(),
  heroSubJa: text(LONG_TEXT),
  menuExplorerLabelJa: text(),
  menuExplorerTitleJa: text(),
  recommendedLabelJa: text(),
  recommendedTitleJa: text(),
  recommendedSubJa: text(),
  newsletterTitleJa: text(),
  newsletterSubJa: text(LONG_TEXT),
  newsletterBgImage: image,
  footerLogo: image,
  footerBrand: text(60),
  footerTaglineJa: text(500),
  footerCopyright: text(200),
  footerLinks: z
    .array(
      z.object({
        label: z.string().trim().min(1).max(40),
        url: z.string().trim().max(300).refine((value) => /^\/[^/]/.test(value) || value === '/' || /^https:\/\//.test(value), 'Use a path like /menu/grand or an https:// link'),
      }),
    )
    .max(12)
    .optional(),
  footerShowHours: z.boolean().optional(),
  footerShowSocials: z.boolean().optional(),
  googlePlaceId: z.string().trim().max(300).regex(/^[A-Za-z0-9_-]*$/, 'Invalid Google Place ID').optional(),
  googleReviewsMinRating: z.number().int().min(1).max(5).optional(),
  storeReviewCount: z.number().int().min(0).max(1_000_000).nullable().optional(),
  featuredReviews: z
    .array(
      z.object({
        authorName: z.string().trim().min(1).max(60),
        rating: z.number().int().min(1).max(5),
        text: z.string().trim().min(1).max(1000),
        dateLabel: z.string().trim().max(30).optional().default(''),
      }),
    )
    .max(12)
    .optional(),
  aboutHeroImage: image,
  contactHeroImage: image,
  menuGrandHeroImage: image,
  menuLunchHeroImage: image,
  menuTakeoutHeroImage: image,
  orderingEnabled: z.boolean().optional(),
  pickupEnabled: z.boolean().optional(),
  pickupHours: z
    .string()
    .trim()
    .max(SHORT_TEXT)
    .refine((value) => value === '' || PICKUP_HOURS_PATTERN.test(value), 'Use the format 11:30-14:30, 17:00-21:30')
    .optional(),
  lunchOrderEnabled: z.boolean().optional(),
  lunchOrderHours: z
    .string()
    .trim()
    .max(SHORT_TEXT)
    .refine((value) => value === '' || PICKUP_HOURS_PATTERN.test(value), 'Use the format 11:00-15:00')
    .optional(),
  dinnerOrderEnabled: z.boolean().optional(),
  dinnerOrderHours: z
    .string()
    .trim()
    .max(SHORT_TEXT)
    .refine((value) => value === '' || PICKUP_HOURS_PATTERN.test(value), 'Use the format 17:00-22:00')
    .optional(),
  takeoutOrderHours: z
    .string()
    .trim()
    .max(SHORT_TEXT)
    .refine((value) => value === '' || PICKUP_HOURS_PATTERN.test(value), 'Use the format 11:00-15:00, 17:00-22:00')
    .optional(),
  enforceOrderTimeWindow: z.boolean().optional(),
  geolocationEnabled: z.boolean().optional(),
  geolocationAutoSelect: z.boolean().optional(),
  geolocationMaxDistanceKm: z.number().min(1).max(100).optional(),
  pickupClosedDays: z.array(z.number().int().min(0).max(6)).max(7).optional(),
  pickupClosedDates: z.array(z.iso.date()).max(MAX_CLOSED_DATES).optional(),
  pickupLeadMinutes: z.number().int().min(0).max(MAX_LEAD_MINUTES).optional(),
  pickupNoteJa: text(1000),
  deliveryEnabled: z.boolean().optional(),
  deliveryHours: z.string().trim().max(SHORT_TEXT).refine((value) => value === '' || PICKUP_HOURS_PATTERN.test(value), 'Use the format 11:30-14:30, 17:00-21:30').optional(),
  deliveryLeadMinutes: z.number().int().min(0).max(MAX_LEAD_MINUTES).optional(),
  deliveryFee: z.number().int().min(0).max(MAX_YEN).optional(),
  deliveryFreeOver: z.number().int().min(0).max(MAX_YEN).optional(),
  deliveryMinOrder: z.number().int().min(0).max(MAX_YEN).optional(),
  deliveryAreas: z.array(z.string().trim().min(1).max(50)).max(MAX_DELIVERY_AREAS).optional(),
  deliveryNoteJa: text(1000),
  publicSiteUrl: z
    .string()
    .trim()
    .max(200)
    .refine((value) => value === '' || /^https?:\/\/[^\s/?#]+(:\d+)?\/?$/.test(value), 'Use a site address like https://adarsha.example')
    .transform((value) => value.replace(/\/$/, ''))
    .optional(),
  pointsEnabled: z.boolean().optional(),
  pointsPer100Yen: z.number().int().min(0).max(100).optional(),
  pointValueYen: z.number().int().min(1).max(100).optional(),
  signupBonusPoints: z.number().int().min(0).max(100_000).optional(),
  taxRatePercent: z.number().int().min(0).max(25).optional(),
  stampCardEnabled: z.boolean().optional(),
  stampsPerCard: z.number().int().min(MIN_STAMPS_PER_CARD).max(MAX_STAMPS_PER_CARD).optional(),
  stampMinAmount: z.number().int().min(0).max(MAX_YEN).optional(),
  stampCooldownHours: z.number().int().min(0).max(MAX_COOLDOWN_HOURS).optional(),
  stampRewardValidDays: z.number().int().min(0).max(MAX_REWARD_DAYS).optional(),
  stampRewards: z
    .array(stampRewardSchema)
    .max(MAX_STAMPS_PER_CARD)
    .refine((rewards) => new Set(rewards.map((r) => r.at)).size === rewards.length, 'Only one reward per stamp')
    .refine((rewards) => rewards.every((r) => r.kind !== 'AMOUNT_OFF' || (r.amount ?? 0) > 0), 'A discount reward needs an amount')
    .optional(),
  printerConfigs: z.record(z.string(), z.any()).optional(),
  dineInEnabled: z.boolean().optional(),
  dineInHours: z.string().trim().max(SHORT_TEXT).optional(),
  dineInLeadMinutes: z.number().int().min(0).max(MAX_LEAD_MINUTES).optional(),
  dineInTaxRatePercent: z.number().int().min(0).max(25).optional(),
  dineInTableCount: z.number().int().min(1).max(500).optional(),
  dineInTablePrefix: z.string().trim().max(20).optional(),
  dineInTableNames: z.string().trim().max(2000).optional(),
  dineInRequireTableNumber: z.boolean().optional(),
  dineInAllowPayAtRegister: z.boolean().optional(),
  dineInAllowOnlinePay: z.boolean().optional(),
  dineInNoteJa: text(1000),
  /** Which POS tender types appear on the cash counter (admin-managed). */
  cashierPaymentMethods: z
    .object({
      CASH: z.boolean().optional(),
      CARD: z.boolean().optional(),
      PAYPAY: z.boolean().optional(),
      RAKUTEN_PAY: z.boolean().optional(),
      D_PAY: z.boolean().optional(),
      AU_PAY: z.boolean().optional(),
      MERPAY: z.boolean().optional(),
      WECHAT_PAY: z.boolean().optional(),
      IC: z.boolean().optional(),
      ID_QUICPAY: z.boolean().optional(),
      INVOICE: z.boolean().optional(),
      BANK_TRANSFER: z.boolean().optional(),
    })
    .optional(),
  /** Public site maintenance banner; ordering stays independently controllable. */
  maintenanceMode: z.boolean().optional(),
  maintenanceMessageJa: text(500),
  maintenanceMessageEn: text(500),
});

const EXT_KEYS = [
  'aboutStoryImage',
  'aboutStoryWatermark',
  'aboutStoryOriginTitleJa',
  'aboutStoryOriginTextJa',
  'aboutStoryBadgeSubJa',
  'aboutStoryBadgeTitleJa',
  'aboutStoryPillar1TitleJa',
  'aboutStoryPillar1DescJa',
  'aboutStoryPillar2TitleJa',
  'aboutStoryPillar2DescJa',
  'aboutStoryPillar3TitleJa',
  'aboutStoryPillar3DescJa',
  'storeLocations',
  'lunchOrderEnabled',
  'lunchOrderHours',
  'dinnerOrderEnabled',
  'dinnerOrderHours',
  'takeoutOrderHours',
  'enforceOrderTimeWindow',
  'geolocationEnabled',
  'geolocationAutoSelect',
  'geolocationMaxDistanceKm',
  'printerConfigs',
  'dineInEnabled',
  'dineInHours',
  'dineInLeadMinutes',
  'dineInTaxRatePercent',
  'dineInTableCount',
  'dineInTablePrefix',
  'dineInTableNames',
  'dineInRequireTableNumber',
  'dineInAllowPayAtRegister',
  'dineInAllowOnlinePay',
  'dineInNoteJa',
  'cashierPaymentMethods',
  'maintenanceMode',
  'maintenanceMessageJa',
  'maintenanceMessageEn',
] as const;

router.get('/', async (req, res) => {
  const settings = await prisma.settings.findFirst();
  const extRecord = await prisma.appSecret.findUnique({ where: { id: 'PAGE_SETTINGS_EXT' } }).catch(() => null);
  const ext = extRecord?.publicKey ? JSON.parse(extRecord.publicKey) : {};
  const body: Record<string, unknown> = { ...(settings ?? {}), ...ext };
  const user = await readSession(req);
  const staff = user && (user.role === 'ADMIN' || user.role === 'STAFF' || user.role === 'KITCHEN');
  // Printer addresses are for the kitchen, not the public website.
  if (!staff) delete body.printerConfigs;
  res.setHeader('Cache-Control', staff ? 'private, no-store' : 'public, no-cache');
  res.setHeader('Vary', 'Cookie');
  res.json(withStampCardAlias(body));
});

router.put('/', requireAdmin, async (req, res) => {
  const raw = definedOnly(settingsSchema.parse(req.body));
  const perCard = (raw as Record<string, unknown>).stampsPerCard as number | undefined;
  const stampRewards = (raw as Record<string, unknown>).stampRewards as { at: number }[] | undefined;
  if (perCard !== undefined && stampRewards?.some((r) => r.at > perCard)) {
    throw new AppError(400, 'VALIDATION_ERROR', `Rewards must be on stamps 1–${perCard}.`);
  }

  // Handle extended page settings via AppSecret
  const extData: Record<string, unknown> = {};
  let hasExt = false;
  for (const key of EXT_KEYS) {
    if (key in (raw as Record<string, unknown>)) {
      extData[key] = (raw as Record<string, unknown>)[key];
      hasExt = true;
    }
  }

  if (hasExt) {
    const existingExt = await prisma.appSecret.findUnique({ where: { id: 'PAGE_SETTINGS_EXT' } }).catch(() => null);
    const prev = existingExt?.publicKey ? JSON.parse(existingExt.publicKey) : {};
    const mergedExt = { ...prev, ...extData };
    await prisma.appSecret.upsert({
      where: { id: 'PAGE_SETTINGS_EXT' },
      create: { id: 'PAGE_SETTINGS_EXT', publicKey: JSON.stringify(mergedExt), privateKey: '' },
      update: { publicKey: JSON.stringify(mergedExt) },
    });
  }

  // Map stampCardEnabled → stampsEnabled for the schema column name.
  const { stampCardEnabled, deliveryHours, deliveryNoteJa, deliveryFreeOver, ...rest } = raw as Record<string, unknown>;
  const data: Record<string, unknown> = { ...rest };
  if (stampCardEnabled !== undefined) data.stampsEnabled = stampCardEnabled;

  // Clean extended keys so Prisma does not reject unknown columns
  for (const key of EXT_KEYS) {
    delete data[key];
  }

  // Arrays that can't be stored as plain undefined go in as JSON.
  if ('pickupClosedDays' in data) data.pickupClosedDays = data.pickupClosedDays ?? null;
  if ('pickupClosedDates' in data) data.pickupClosedDates = data.pickupClosedDates ?? null;
  if ('stampRewards' in data) data.stampRewards = data.stampRewards ?? null;
  if ('footerLinks' in data) data.footerLinks = data.footerLinks ?? null;
  if ('featuredReviews' in data) data.featuredReviews = data.featuredReviews ?? null;

  const existing = await prisma.settings.findFirst();

  // The master switch is the website on/off. Turning it on while pickup, delivery, and
  // table ordering are all off would still hide every order button, so open pickup.
  const setsChannel = 'pickupEnabled' in data || 'deliveryEnabled' in data || 'dineInEnabled' in extData;
  if (data.orderingEnabled === true && !setsChannel && existing) {
    const extRecord = await prisma.appSecret.findUnique({ where: { id: 'PAGE_SETTINGS_EXT' } }).catch(() => null);
    const storedExt = extRecord?.publicKey ? JSON.parse(extRecord.publicKey) : {};
    const pickupOn = existing.pickupEnabled === true;
    const deliveryOn = existing.deliveryEnabled === true;
    const dineInOn = storedExt.dineInEnabled === true;
    if (!pickupOn && !deliveryOn && !dineInOn) {
      data.pickupEnabled = true;
      const hours = typeof existing.pickupHours === 'string' ? existing.pickupHours.trim() : '';
      if (!hours) data.pickupHours = '11:30-15:00, 17:00-22:00';
    }
  }

  if (existing) {
    await prisma.settings.update({ where: { id: existing.id }, data });
  } else {
    await prisma.settings.create({
      data: {
        timezone: 'Asia/Tokyo',
        currency: 'JPY',
        weeklyHours: { monday: '11:00-15:00, 17:00-22:00' },
        holidays: { regular: 'Tuesday' },
        socials: { instagram: '@adarsha_restro' },
        ...data,
      },
    });
  }

  const updatedSettings = await prisma.settings.findFirst();
  const finalExt = await prisma.appSecret.findUnique({ where: { id: 'PAGE_SETTINGS_EXT' } }).catch(() => null);
  const ext = finalExt?.publicKey ? JSON.parse(finalExt.publicKey) : {};
  res.json(withStampCardAlias({ ...(updatedSettings ?? {}), ...ext }));
});

export default router;
