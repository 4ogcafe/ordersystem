import { Minus, Plus } from 'lucide-react';

/** [ − ] qty [ + ] as one pill with fixed-size buttons, so the card never shifts as the number changes. */
export default function QuantitySelector({ value, min = 1, max, onChange, label, size = 'md' }: {
  value: number;
  min?: number;
  max: number;
  onChange: (value: number) => void;
  /** Item name, for the screen-reader labels. */
  label: string;
  size?: 'sm' | 'md';
}) {
  const icon = size === 'sm' ? 14 : 16;
  return (
    <div role="group" aria-label={`${label}の数量`} className={`qty-stepper qty-${size}`}>
      <button type="button" aria-label={`${label}を1つ減らす`} disabled={value <= min} onClick={() => onChange(value - 1)}>
        <Minus size={icon} aria-hidden="true" />
      </button>
      <span aria-live="polite">{value}</span>
      <button type="button" aria-label={`${label}を1つ増やす`} disabled={value >= max} onClick={() => onChange(value + 1)}>
        <Plus size={icon} aria-hidden="true" />
      </button>
    </div>
  );
}
