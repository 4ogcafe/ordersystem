import { Bike, ShoppingBag, UtensilsCrossed } from 'lucide-react';
import { yen } from '../../lib/format';
import type { DeliveryOptions, Fulfillment } from './fulfillment';

export interface DineInOptions {
  enabled: boolean;
  leadMinutes?: number;
  times?: string;
  taxRatePercent?: number;
  note?: string;
  tableCount?: number;
}

/** Pickup / delivery / dine-in choice, shown only when multiple modes are enabled. */
export default function FulfillmentPicker({ value, onChange, pickupEnabled, delivery, dineIn }: {
  value: Fulfillment;
  onChange: (value: Fulfillment) => void;
  pickupEnabled: boolean;
  delivery: DeliveryOptions;
  dineIn?: DineInOptions;
}) {
  const options = [
    pickupEnabled && { value: 'PICKUP' as const, icon: ShoppingBag, title: 'お持ち帰り', detail: '店頭で受け取り・お支払い（消費税8%）' },
    delivery?.enabled && {
      value: 'DELIVERY' as const,
      icon: Bike,
      title: 'デリバリー',
      detail: [
        delivery.fee > 0 ? `配達料 ${yen(delivery.fee)}` : '配達料無料',
        delivery.fee > 0 && delivery.freeOver > 0 ? `${yen(delivery.freeOver)}以上で無料` : '',
        delivery.minOrder > 0 ? `${yen(delivery.minOrder)}以上で承ります` : '',
      ].filter(Boolean).join(' ・ '),
    },
    dineIn?.enabled && {
      value: 'DINE_IN' as const,
      icon: UtensilsCrossed,
      title: '店内テーブル注文',
      detail: dineIn.note || 'お席でスマホ注文・お食事（消費税10%）',
    },
  ].filter(Boolean) as { value: Fulfillment; icon: typeof Bike; title: string; detail: string }[];

  // With only one option on there is nothing to choose, so no choice is shown.
  if (options.length < 2) return null;

  return (
    <fieldset className="fulfill-picker">
      <legend>受け取り・注文方法</legend>
      <div className="fulfill-options">
        {options.map(option => {
          const Icon = option.icon;
          const selected = value === option.value;
          return (
            <label key={option.value} className={`fulfill-option${selected ? ' is-on' : ''}`}>
              <input type="radio" name="fulfillment" value={option.value} checked={selected} onChange={() => onChange(option.value)} />
              <Icon size={22} aria-hidden="true" />
              <span>
                <strong>{option.title}</strong>
                <small>{option.detail}</small>
              </span>
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}
