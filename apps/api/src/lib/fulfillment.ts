import { z } from 'zod';
import { PREFECTURES } from './customer-profile.js';
import { pickupSlots, type PickupSettings, type PickupSlot } from './pickup.js';

// How an order reaches the customer: picked up at the counter, or delivered. Each can be switched
// on and off by the admin. Pure functions only (no req/res, no database).

export const FULFILLMENTS = ['PICKUP', 'DELIVERY', 'DINE_IN'] as const;
export type Fulfillment = (typeof FULFILLMENTS)[number];

export const DEFAULT_DELIVERY_LEAD_MINUTES = 60;

export interface DeliverySettings {
  deliveryEnabled?: boolean | null;
  deliveryHours?: string | null;
  deliveryLeadMinutes?: number | null;
  /** Tax-included yen added to the order. */
  deliveryFee?: number | null;
  /** Food subtotal at or above which delivery is free (0 / null = never free). */
  deliveryFreeOver?: number | null;
  /** Minimum food subtotal for delivery orders. */
  deliveryMinOrder?: number | null;
  /** Postal-code prefixes ("360", "360-08") or town names ("熊谷市"); empty = anywhere. */
  deliveryAreas?: string[] | null;
  deliveryNoteJa?: string | null;
}

export interface DineInSettings {
  dineInEnabled?: boolean | null;
  dineInHours?: string | null;
  dineInLeadMinutes?: number | null;
  dineInTaxRatePercent?: number | null;
  dineInTableCount?: number | null;
  dineInTablePrefix?: string | null;
  dineInTableNames?: string | null;
  dineInRequireTableNumber?: boolean | null;
  dineInAllowPayAtRegister?: boolean | null;
  dineInAllowOnlinePay?: boolean | null;
  dineInNoteJa?: string | null;
}

export type FulfillmentSettings = PickupSettings &
  DeliverySettings &
  DineInSettings & {
    orderingEnabled?: boolean | null;
    pickupNoteJa?: string | null;
    /** Set from the kitchen display when it is too busy: no new online orders until then. */
    orderingPausedUntil?: Date | null;
  };

/** The time new orders resume, while the kitchen has paused them; otherwise null. */
export function pausedUntil(settings: FulfillmentSettings, now: Date = new Date()): Date | null {
  const until = settings.orderingPausedUntil;
  return until instanceof Date && until > now ? until : null;
}

export function isEnabled(settings: FulfillmentSettings, type: Fulfillment, now: Date = new Date()): boolean {
  if (settings.orderingEnabled === false) return false;
  if (pausedUntil(settings, now)) return false;
  if (type === 'DINE_IN') return settings.dineInEnabled !== false;
  return type === 'PICKUP' ? Boolean(settings.pickupEnabled) : Boolean(settings.deliveryEnabled);
}

/** Times the customer may choose. Delivery has its own hours and notice; closed days are shared. */
export function slotsFor(settings: FulfillmentSettings, type: Fulfillment, now: Date = new Date()): PickupSlot[] {
  if (type === 'PICKUP') return pickupSlots(settings, now);
  if (type === 'DINE_IN') {
    return pickupSlots(
      {
        ...settings,
        pickupEnabled: settings.dineInEnabled !== false,
        pickupHours: settings.dineInHours || settings.pickupHours || '10:00-23:00',
        pickupLeadMinutes: settings.dineInLeadMinutes ?? 0,
      },
      now,
    );
  }
  return pickupSlots(
    {
      ...settings,
      pickupEnabled: Boolean(settings.deliveryEnabled),
      // Without its own hours, delivery follows the pickup hours.
      pickupHours: settings.deliveryHours || settings.pickupHours,
      pickupLeadMinutes: settings.deliveryLeadMinutes ?? DEFAULT_DELIVERY_LEAD_MINUTES,
    },
    now,
  );
}

export function deliveryFeeFor(settings: DeliverySettings, foodSubtotal: number): number {
  const fee = settings.deliveryFee ?? 0;
  const freeOver = settings.deliveryFreeOver ?? 0;
  return freeOver > 0 && foodSubtotal >= freeOver ? 0 : fee;
}

export const deliveryAddressSchema = z.object({
  postalCode: z.string().trim().regex(/^\d{3}-?\d{4}$/, '郵便番号は7桁で入力してください'),
  prefecture: z.enum(PREFECTURES, '都道府県を選択してください'),
  city: z.string().trim().min(1, '市区町村を入力してください').max(100),
  line1: z.string().trim().min(1, '番地を入力してください').max(200),
  building: z.string().trim().max(200).optional().default(''),
});

export type DeliveryAddress = z.infer<typeof deliveryAddressSchema>;

const digits = (value: string) => value.replace(/\D/g, '');

/** Inside the delivery area when the postal code starts with an area prefix, or the town matches. */
export function isInDeliveryArea(address: DeliveryAddress, areas: string[] | null | undefined): boolean {
  const list = (areas ?? []).map((area) => area.trim()).filter(Boolean);
  if (list.length === 0) return true;
  const postal = digits(address.postalCode);
  const town = `${address.prefecture}${address.city}`;
  return list.some((area) => (/^[\d-]+$/.test(area) ? postal.startsWith(digits(area)) : town.includes(area)));
}

/** What the website needs to offer the options, without exposing anything else from settings. */
export function fulfillmentOptions(settings: FulfillmentSettings) {
  return {
    pausedUntil: pausedUntil(settings),
    pickup: { enabled: isEnabled(settings, 'PICKUP'), note: settings.pickupNoteJa ?? '' },
    delivery: {
      enabled: isEnabled(settings, 'DELIVERY'),
      fee: settings.deliveryFee ?? 0,
      freeOver: settings.deliveryFreeOver ?? 0,
      minOrder: settings.deliveryMinOrder ?? 0,
      areas: settings.deliveryAreas ?? [],
      note: settings.deliveryNoteJa ?? '',
    },
    dineIn: {
      enabled: isEnabled(settings, 'DINE_IN'),
      hours: settings.dineInHours ?? '',
      tableCount: settings.dineInTableCount ?? 20,
      tablePrefix: settings.dineInTablePrefix ?? 'T-',
      tableNames: settings.dineInTableNames ?? '',
      requireTableNumber: settings.dineInRequireTableNumber !== false,
      allowPayAtRegister: settings.dineInAllowPayAtRegister !== false,
      allowOnlinePay: settings.dineInAllowOnlinePay !== false,
      taxRate: settings.dineInTaxRatePercent ?? 10,
      note: settings.dineInNoteJa ?? '',
    },
  };
}
