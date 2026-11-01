import { useEffect, useState } from 'react';
import { toast } from 'react-hot-toast';
import { Bike, ShoppingBag, ShoppingCart, UtensilsCrossed } from 'lucide-react';
import { apiFetch, errorMessage } from '../../lib/api';

interface Switches {
  orderingEnabled: boolean;
  pickupEnabled: boolean;
  deliveryEnabled: boolean;
  dineInEnabled: boolean;
  pickupHours: string;
  deliveryHours: string;
  dineInHours: string;
}

type Key = 'orderingEnabled' | 'pickupEnabled' | 'deliveryEnabled' | 'dineInEnabled';

/**
 * The main on/off controls for online ordering. Each switch saves immediately, so staff can pause
 * delivery on a busy night (or pickup during a private event, or table ordering) in one tap.
 */
export default function OrderingSwitches({ onChange }: { onChange?: () => void }) {
  const [state, setState] = useState<Switches | null>(null);
  const [saving, setSaving] = useState<Key | null>(null);

  useEffect(() => {
    apiFetch('/api/v1/settings')
      .then(res => res.json())
      .then(data => setState({
        orderingEnabled: data.orderingEnabled !== false,
        pickupEnabled: Boolean(data.pickupEnabled),
        deliveryEnabled: Boolean(data.deliveryEnabled),
        dineInEnabled: Boolean(data.dineInEnabled),
        pickupHours: data.pickupHours || '',
        deliveryHours: data.deliveryHours || '',
        dineInHours: data.dineInHours || '',
      }))
      .catch(console.error);
  }, []);

  if (!state) return null;

  const toggle = async (key: Key) => {
    const next = !state[key];
    const patch: Record<string, any> = { [key]: next };
    if (key !== 'orderingEnabled' && next) {
      let hours = key === 'pickupEnabled'
        ? state.pickupHours
        : key === 'deliveryEnabled'
        ? state.deliveryHours || state.pickupHours
        : state.dineInHours || state.pickupHours;
      if (!hours || !hours.trim()) {
        const defaultHours = key === 'dineInEnabled'
          ? '11:00-15:00, 17:00-22:30'
          : '11:30-15:00, 17:00-22:00';
        const hoursKey = key === 'pickupEnabled' ? 'pickupHours' : key === 'deliveryEnabled' ? 'deliveryHours' : 'dineInHours';
        patch[hoursKey] = defaultHours;
      }
    }
    setSaving(key);
    try {
      const res = await apiFetch('/api/v1/settings', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(patch) });
      if (!res.ok) {
        toast.error(await errorMessage(res, 'Could not update.'));
        return;
      }
      setState({ ...state, ...patch, [key]: next });
      const label = key === 'orderingEnabled'
        ? 'Master Online ordering system'
        : key === 'pickupEnabled'
        ? 'Pickup'
        : key === 'deliveryEnabled'
        ? 'Delivery'
        : 'Table Ordering (Dine-in)';
      toast.success(`${label} ${next ? 'is now ON — customers can order.' : 'is now OFF.'}`);
      onChange?.();
    } catch {
      toast.error('Network error.');
    } finally {
      setSaving(null);
    }
  };

  const options = [
    { key: 'orderingEnabled' as const, icon: ShoppingCart, title: 'Master Ordering System (全体注文受付)', detail: 'Turn online ordering on or off across the entire website. When OFF, all order buttons are hidden on food cards.' },
    { key: 'pickupEnabled' as const, icon: ShoppingBag, title: 'Pickup (お持ち帰り・テイクアウト)', detail: 'Customers order online and collect at the counter.' },
    { key: 'deliveryEnabled' as const, icon: Bike, title: 'Delivery (デリバリー・出前配達)', detail: 'Delivered to the customer within the delivery area.' },
    { key: 'dineInEnabled' as const, icon: UtensilsCrossed, title: 'Table Ordering / Dine-in (店内飲食・テーブル注文)', detail: 'Customers scan table QR code or order online directly from their table inside the restaurant.' },
  ];

  return (
    <section className="ordering-switches" aria-label="Online ordering">
      <div>
        <h3 style={{ margin: 0, fontSize: '1.15rem', fontWeight: 600 }}>Online ordering</h3>
        <p style={{ margin: '0.25rem 0 0', color: '#6b7280', fontSize: '0.875rem' }}>
          {state.pickupEnabled || state.deliveryEnabled ? 'Customers can order from the website.' : 'Online ordering is off. The website hides the order buttons.'}
        </p>
      </div>
      <div className="ordering-switch-list">
        {options.map(option => {
          const Icon = option.icon;
          const on = state[option.key];
          return (
            <div key={option.key} className={`ordering-switch${on ? ' is-on' : ''}`}>
              <Icon size={22} aria-hidden="true" />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 600 }}>{option.title}</div>
                <div style={{ color: '#6b7280', fontSize: '0.8rem' }}>{option.detail}</div>
              </div>
              <button
                type="button"
                role="switch"
                aria-checked={on}
                aria-label={`${option.title}: ${on ? 'on' : 'off'}`}
                disabled={saving !== null}
                onClick={() => toggle(option.key)}
                className="switch"
              >
                <span />
              </button>
            </div>
          );
        })}
      </div>
    </section>
  );
}
