import { AppError } from '../lib/errors.js';
import { deliveryFeeFor, type Fulfillment } from '../lib/fulfillment.js';
import { isOfferLive, loyaltyConfig, offerDiscount, priceBreakdown, type OfferRule, type PriceBreakdown } from '../lib/loyalty.js';
import { prisma } from '../lib/prisma.js';
import type { StampRewardKind } from '../lib/stamps.js';
import { consumptionTax, taxRatePercent } from '../lib/tax.js';
import type { StoredSettings } from './settings-store.js';
import { findUsableReward } from './stamps.js';

export const MAX_QUANTITY = 20;

export interface OrderLineOption {
  groupId: string;
  groupNameJa: string;
  optionId: string;
  nameJa: string;
  priceAdjust: number;
}

export interface OrderLine {
  itemId: string;
  nameEn: string;
  nameJa: string | null;
  unitPrice: number;
  quantity: number;
  lineTotal: number;
  options?: OrderLineOption[];
  doneAt?: string | null;
}

export interface AppliedOffer {
  id: string;
  titleJa: string;
  discount: number;
}

export interface AppliedReward {
  id: string;
  titleJa: string;
  kind: StampRewardKind;
  discount: number;
}

export interface TaxBreakdown {
  taxRate: number;
  tax: number;
  /** Delivery fee, tax included; 0 for pickup. */
  deliveryFee: number;
  /** For delivery: how much more food is needed to reach the minimum order (0 when met). */
  minOrderShortfall: number;
  /** What the customer pays on receipt, tax included. */
  grandTotal: number;
}

export interface OrderQuote {
  lines: OrderLine[];
  breakdown: PriceBreakdown & TaxBreakdown;
  offer: AppliedOffer | null;
  reward: AppliedReward | null;
}

type OptionChoice = { id: string; nameJa?: string; nameEn?: string; priceAdjust?: number };

/** Resolve and validate selected options against the item's option groups; recompute priceAdjust. */
function resolveLineOptions(
  itemName: string,
  groups: { id: string; nameJa: string; type: string; required: boolean; options: unknown }[],
  selected: OrderLineOption[] | undefined
): { options: OrderLineOption[]; optionAdjust: number } {
  const picks = selected ?? [];
  const byGroup = new Map<string, OrderLineOption[]>();
  for (const pick of picks) {
    const list = byGroup.get(pick.groupId) ?? [];
    list.push(pick);
    byGroup.set(pick.groupId, list);
  }

  const resolved: OrderLineOption[] = [];
  let optionAdjust = 0;

  for (const group of groups) {
    const choices = Array.isArray(group.options) ? (group.options as OptionChoice[]) : [];
    const chosen = byGroup.get(group.id) ?? [];

    if (group.required && chosen.length === 0) {
      throw new AppError(400, 'OPTIONS_REQUIRED', `「${itemName}」の「${group.nameJa}」を選んでください。`, {
        groupId: group.id,
      });
    }

    if (group.type === 'RADIO' && chosen.length > 1) {
      throw new AppError(400, 'OPTIONS_INVALID', `「${group.nameJa}」は1つだけ選べます。`);
    }

    for (const pick of chosen) {
      const opt = choices.find((c) => c.id === pick.optionId);
      if (!opt) {
        throw new AppError(400, 'OPTIONS_INVALID', `「${group.nameJa}」の選択が無効です。`);
      }
      const adjust = Number(opt.priceAdjust) || 0;
      optionAdjust += adjust;
      resolved.push({
        groupId: group.id,
        groupNameJa: group.nameJa,
        optionId: opt.id,
        nameJa: opt.nameJa || pick.nameJa || opt.id,
        priceAdjust: adjust,
      });
    }
  }

  return { options: resolved, optionAdjust };
}

/** Prices and availability come from the database, never from the client. */
export async function priceLines(
  requested: { itemId: string; quantity: number; optionAdjust?: number; options?: OrderLineOption[] }[]
): Promise<OrderLine[]> {
  // Keep each cart line separate so two sets with different curry/spice stay distinct.
  const ids = [...new Set(requested.map((r) => r.itemId))];
  const items = await prisma.menuItem.findMany({
    where: { id: { in: ids } },
    include: {
      optionGroups: {
        select: { id: true, nameJa: true, type: true, required: true, options: true, sortOrder: true },
        orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
      },
    },
  });

  return requested.map((req) => {
    const item = items.find((candidate) => candidate.id === req.itemId);
    const orderable = item && item.isActive !== false && !item.isSoldOut;
    if (!item || !orderable) {
      const name = item?.nameJa || item?.nameEn || req.itemId;
      throw new AppError(409, 'ITEM_UNAVAILABLE', `「${name}」は現在ご注文いただけません。カートから削除してください。`, {
        itemId: req.itemId,
      });
    }
    const quantity = Math.min(req.quantity, MAX_QUANTITY);
    const displayName = item.nameJa || item.nameEn;
    const { options, optionAdjust } = resolveLineOptions(displayName, item.optionGroups, req.options);
    const unitPrice = (Number(item.price) || 0) + optionAdjust;
    return {
      itemId: item.id,
      nameEn: item.nameEn,
      nameJa: item.nameJa ?? null,
      unitPrice,
      quantity,
      lineTotal: unitPrice * quantity,
      ...(options.length ? { options } : {}),
    };
  });
}

/** Has this customer already used a once-per-customer offer on an order that wasn't cancelled? */
export async function offerAlreadyUsed(offerId: string, customerId: string): Promise<boolean> {
  // Stacked offers store a comma-joined id ("idA,idB"); FIND_IN_SET matches each part.
  const rows = await prisma.$queryRaw<[{ cnt: bigint }]>`
    SELECT COUNT(*) as cnt FROM PickupOrder
    WHERE customerId = ${customerId}
      AND offer IS NOT NULL
      AND FIND_IN_SET(${offerId}, JSON_UNQUOTE(JSON_EXTRACT(offer, '$.id'))) > 0
      AND status != 'CANCELLED'
    LIMIT 1
  `;
  return Number(rows[0]?.cnt ?? 0) > 0;
}

async function usableOffer(offerId: string, customerId?: string | null) {
  const offer = await prisma.offer.findUnique({ where: { id: offerId } });
  if (!offer || !isOfferLive(offer as unknown as OfferRule)) {
    throw new AppError(409, 'OFFER_UNAVAILABLE', 'この特典は現在ご利用いただけません。');
  }
  // "Once per customer" only works for signed-in members; guests must log in first.
  if (offer.oncePerCustomer && !customerId) {
    throw new AppError(401, 'UNAUTHENTICATED', 'この特典は会員ログイン後にお一人様1回限りご利用いただけます。');
  }
  if (offer.oncePerCustomer && customerId && (await offerAlreadyUsed(offer.id, customerId))) {
    throw new AppError(409, 'OFFER_USED', 'この特典はすでにご利用済みです。');
  }
  return offer;
}

const MAX_STACKED_OFFERS = 5;

/** The full price of a cart for this customer (or guest), with the chosen offer(s) and points applied. */
export async function quoteOrder(input: {
  items: { itemId: string; quantity: number; optionAdjust?: number; options?: OrderLineOption[] }[];
  offerId?: string | string[] | null;
  offerIds?: string[] | null;
  rewardId?: string | null;
  pointsToUse?: number;
  customerId?: string;
  fulfillment?: Fulfillment;
  settings: StoredSettings;
}): Promise<OrderQuote> {
  const lines = await priceLines(input.items);
  const subtotal = lines.reduce((sum, line) => sum + line.lineTotal, 0);
  const isMember = Boolean(input.customerId);

  if ((input.rewardId || input.pointsToUse) && !input.customerId) {
    throw new AppError(401, 'UNAUTHENTICATED', 'スタンプ特典やポイントのご利用には会員ログインが必要です。');
  }

  const rawIds = input.offerIds && Array.isArray(input.offerIds)
    ? input.offerIds
    : Array.isArray(input.offerId)
      ? input.offerId
      : input.offerId
        ? [input.offerId]
        : [];
  const targetOfferIds = [...new Set(rawIds.filter(Boolean))];
  if (targetOfferIds.length > MAX_STACKED_OFFERS) {
    throw new AppError(400, 'VALIDATION_ERROR', `クーポンは一度に${MAX_STACKED_OFFERS}件まで併用できます。`);
  }

  const appliedOffers: { id: string; titleJa: string; discount: number }[] = [];
  let currentSubtotalForDiscount = subtotal;
  let totalOfferDiscount = 0;

  for (const id of targetOfferIds) {
    const offerDoc = await usableOffer(id, input.customerId);
    const rule = offerDoc as unknown as OfferRule;
    if (subtotal < (rule.minSubtotal ?? 0)) {
      throw new AppError(409, 'OFFER_MIN_SUBTOTAL', `特典「${offerDoc.titleJa}」は¥${(rule.minSubtotal ?? 0).toLocaleString('ja-JP')}以上のご注文でご利用いただけます。`);
    }
    const disc = offerDiscount(rule, currentSubtotalForDiscount);
    if (disc > 0) {
      totalOfferDiscount += disc;
      currentSubtotalForDiscount = Math.max(0, currentSubtotalForDiscount - disc);
      appliedOffers.push({ id: offerDoc.id, titleJa: String(offerDoc.titleJa), discount: disc });
    }
  }

  const rewardDoc = input.rewardId && input.customerId ? await findUsableReward(input.rewardId, input.customerId) : null;

  const customer = input.customerId
    ? await prisma.customer.findUnique({ where: { id: input.customerId }, select: { points: true } })
    : null;

  const breakdown = priceBreakdown({
    subtotal,
    offerDiscount: totalOfferDiscount,
    rewardAmount: rewardDoc?.kind === 'AMOUNT_OFF' ? Number(rewardDoc.amount) || 0 : 0,
    pointsRequested: input.pointsToUse,
    pointsBalance: Number(customer?.points) || 0,
    loyalty: loyaltyConfig(input.settings),
    isMember,
  });

  // Discounts and points reduce the taxable amount, so tax is charged on what is actually paid.
  // Dine-in has standard 10% tax in Japan, while takeaway and delivery use reduced 8% rate.
  const isDineIn = input.fulfillment === 'DINE_IN';
  const taxRate = isDineIn
    ? (Number((input.settings as any).dineInTaxRatePercent) || 10)
    : taxRatePercent(input.settings);
  const tax = consumptionTax(breakdown.total, taxRate);
  // The fee is entered tax-included and charged on top of the food; it earns no points.
  const isDelivery = input.fulfillment === 'DELIVERY';
  const deliveryFee = isDelivery ? deliveryFeeFor(input.settings, subtotal) : 0;
  const minOrderShortfall = isDelivery ? Math.max(0, (input.settings.deliveryMinOrder ?? 0) - subtotal) : 0;

  return {
    lines,
    breakdown: { ...breakdown, taxRate, tax, deliveryFee, minOrderShortfall, grandTotal: breakdown.total + tax + deliveryFee },
    offer: appliedOffers.length > 0
      ? {
          id: appliedOffers.map((o) => o.id).join(','),
          titleJa: appliedOffers.map((o) => o.titleJa).join(' ＋ '),
          discount: totalOfferDiscount,
        }
      : null,
    reward: rewardDoc
      ? { id: rewardDoc.id, titleJa: String(rewardDoc.titleJa), kind: rewardDoc.kind as StampRewardKind, discount: breakdown.rewardDiscount }
      : null,
  };
}

/** Price fields shown to customers; orders placed before member pricing have only `total`. */
export function pricingSummary(order: Record<string, unknown>) {
  const total = Number(order.total) || 0;
  const offer = order.offer as { titleJa?: string; discount?: number } | null | undefined;
  const reward = order.reward as { titleJa?: string; kind?: string; discount?: number } | null | undefined;
  return {
    subtotal: typeof order.subtotal === 'number' ? order.subtotal : total,
    offerTitle: offer?.titleJa ?? null,
    offerDiscount: offer?.discount ?? 0,
    rewardTitle: reward?.titleJa ?? null,
    rewardKind: reward?.kind ?? null,
    rewardDiscount: reward?.discount ?? 0,
    pointsUsed: Number(order.pointsUsed) || 0,
    pointsDiscount: Number(order.pointsDiscount) || 0,
    total,
    // Orders from before tax was recorded show no tax line and their tax-excluded total.
    taxRate: typeof order.taxRate === 'number' ? order.taxRate : null,
    tax: Number(order.tax) || 0,
    grandTotal: typeof order.grandTotal === 'number' ? order.grandTotal : total,
    pointsEarned: Number(order.pointsEarned) || 0,
    // Orders from before delivery existed are pickups.
    fulfillment: order.fulfillment === 'DELIVERY' ? 'DELIVERY' : order.fulfillment === 'DINE_IN' ? 'DINE_IN' : 'PICKUP',
    deliveryFee: Number(order.deliveryFee) || 0,
    deliveryAddress: (order.deliveryAddress as Record<string, string> | null | undefined) ?? null,
  };
}
