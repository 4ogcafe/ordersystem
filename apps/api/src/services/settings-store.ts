import type { DeliverySettings } from '../lib/fulfillment.js';
import type { LoyaltySettings } from '../lib/loyalty.js';
import { prisma } from '../lib/prisma.js';
import type { PickupSettings } from '../lib/pickup.js';
import type { StampSettings } from '../lib/stamps.js';

export type StoredSettings = PickupSettings & DeliverySettings & LoyaltySettings & StampSettings & {
  pickupNoteJa?: string | null;
  taxRatePercent?: number | null;
  orderingPausedUntil?: Date | null;
  lunchOrderEnabled?: boolean | null;
  lunchOrderHours?: string | null;
  dinnerOrderEnabled?: boolean | null;
  dinnerOrderHours?: string | null;
  takeoutOrderHours?: string | null;
  enforceOrderTimeWindow?: boolean | null;
};

export const loadSettings = async (): Promise<StoredSettings> => {
  const row = await prisma.settings.findFirst();
  const extRecord = await prisma.appSecret.findUnique({ where: { id: 'PAGE_SETTINGS_EXT' } }).catch(() => null);
  let ext: Record<string, unknown> = {};
  if (extRecord?.publicKey) {
    try {
      ext = JSON.parse(extRecord.publicKey);
    } catch {
      ext = {};
    }
  }
  return { ...(row ?? {}), ...ext } as unknown as StoredSettings;
};
