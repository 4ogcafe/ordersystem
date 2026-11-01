import type { DeliveryAddress, Fulfillment } from '../order/fulfillment';
import type { OrderStoreSnapshot } from '../../lib/stores';

export interface MemberOrder {
  token: string;
  number: number;
  status: string;
  pickupAt: string;
  createdAt: string;
  store?: OrderStoreSnapshot | null;
  items: { itemId: string; nameEn: string; nameJa: string | null; unitPrice: number; quantity: number; lineTotal: number; store?: OrderStoreSnapshot | null }[];
  subtotal: number;
  offerTitle: string | null;
  offerDiscount: number;
  rewardTitle: string | null;
  rewardKind: 'AMOUNT_OFF' | 'PERK' | null;
  rewardDiscount: number;
  pointsUsed: number;
  pointsDiscount: number;
  total: number;
  taxRate: number | null;
  tax: number;
  grandTotal: number;
  pointsEarned: number;
  fulfillment: Fulfillment;
  deliveryFee: number;
  deliveryAddress: DeliveryAddress | null;
  stampAwarded: boolean;
}

export interface PointEntry {
  id: string;
  type: 'EARN' | 'REDEEM' | 'REFUND' | 'BONUS' | 'ADJUST';
  points: number;
  balanceAfter: number;
  orderNumber: number | null;
  note: string | null;
  createdAt: string;
}

export interface MemberOffer {
  id: string;
  titleJa: string;
  descriptionJa: string;
  imageUrl: string;
  discountType: 'PERCENT' | 'AMOUNT';
  discountValue: number;
  minSubtotal: number;
  endsAt: string | null;
  /** When it became available; offers from the last week are marked NEW. */
  startsAt?: string | null;
  oncePerCustomer: boolean;
  used: boolean;
}

export type StampRewardKind = 'AMOUNT_OFF' | 'PERK';

export interface StampReward {
  id: string;
  titleJa: string;
  kind: StampRewardKind;
  amount: number;
  at: number;
  card: number;
  status: 'AVAILABLE' | 'USED' | 'EXPIRED';
  earnedAt: string;
  expiresAt: string | null;
  usedAt: string | null;
}

export interface StampCardData {
  enabled: boolean;
  memberCode: string;
  perCard: number;
  /** Stamps on the current card. */
  stamps: number;
  totalStamps: number;
  completedCards: number;
  lastStampAt: string | null;
  /** When the next stamp can be earned; null if now. */
  nextStampAt: string | null;
  rules: { minAmount: number; cooldownHours: number; rewardValidDays: number };
  milestones: { at: number; titleJa: string; kind: StampRewardKind; amount: number }[];
  rewards: StampReward[];
  pastRewards: StampReward[];
  history: { id: string; card: number; position: number; source: 'ORDER' | 'STAFF'; amount: number; orderNumber: number | null; createdAt: string }[];
}
