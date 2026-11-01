import { useEffect, useState } from 'react';
import { apiFetch, errorMessage } from '../../lib/api';
import type { Fulfillment } from './fulfillment';

export interface Quote {
  subtotal: number;
  offerDiscount: number;
  /** Yen taken off by a stamp-card reward. */
  rewardDiscount: number;
  /** The stamp-card reward applied, if any (a PERK takes nothing off but is handed over with the order). */
  reward: { id: string; titleJa: string; kind: 'AMOUNT_OFF' | 'PERK' } | null;
  /** The offer(s) applied, if any. */
  offer?: { id: string; titleJa: string } | null;
  pointsUsed: number;
  pointsDiscount: number;
  total: number;
  taxRate: number;
  tax: number;
  /** Tax-included; 0 for pickup. */
  deliveryFee: number;
  /** Delivery only: yen of food still needed to reach the minimum order. */
  minOrderShortfall: number;
  grandTotal: number;
  pointsToEarn: number;
}

export interface Savings {
  offerId?: string;
  offerIds?: string[];
  rewardId: string;
  pointsToUse: number;
}

const QUOTE_DELAY_MS = 300;

/** The server's price for these items: offers, points and tax worked out exactly as the order will be saved. */
export function useOrderQuote(items: { itemId: string; quantity: number }[], savings: Savings, isMember: boolean, fulfillment: Fulfillment = 'PICKUP') {
  const [quote, setQuote] = useState<Quote | null>(null);
  const [problem, setProblem] = useState('');
  // Keyed on the serialized items: callers pass a new array on every render.
  const itemsKey = JSON.stringify(items);
  const rawOfferIds = savings.offerIds && savings.offerIds.length > 0
    ? savings.offerIds
    : savings.offerId
      ? [savings.offerId]
      : [];
  const offerIdsKey = JSON.stringify(rawOfferIds);

  useEffect(() => {
    const parsed: { itemId: string; quantity: number }[] = JSON.parse(itemsKey);
    if (parsed.length === 0) return;
    let cancelled = false;
    const timer = setTimeout(async () => {
      try {
        const targetOfferIds: string[] = JSON.parse(offerIdsKey);
        const res = await apiFetch('/api/v1/orders/quote', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            items: parsed,
            fulfillment,
            // Offers can be used by both members and guests
            offerIds: targetOfferIds,
            offerId: targetOfferIds[0] || null,
            ...(isMember ? { rewardId: savings.rewardId || null, pointsToUse: savings.pointsToUse } : {}),
          }),
        });
        if (cancelled) return;
        if (res.ok) {
          setQuote(await res.json());
          setProblem('');
        } else {
          setQuote(null);
          setProblem(await errorMessage(res, '料金を計算できませんでした。'));
        }
      } catch {
        if (!cancelled) setProblem('通信エラーのため料金を計算できませんでした。');
      }
    }, QUOTE_DELAY_MS);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [itemsKey, offerIdsKey, savings.rewardId, savings.pointsToUse, isMember, fulfillment]);

  return { quote, problem };
}
