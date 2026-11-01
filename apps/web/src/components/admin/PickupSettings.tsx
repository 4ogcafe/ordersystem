import { useEffect, useState, type CSSProperties } from 'react';
import { toast } from 'react-hot-toast';
import { Clock, Moon, Sun } from 'lucide-react';
import { apiFetch, errorMessage } from '../../lib/api';
import { taxRateOf } from '../../lib/price';

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const DEFAULT_LEAD_MINUTES = 30;
const MAX_TAX_RATE = 25;
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

// Switching pickup on and off is done in OrderingSwitches; this form holds the details.
interface PickupForm {
  lunchOrderEnabled: boolean;
  lunchOrderHours: string;
  dinnerOrderEnabled: boolean;
  dinnerOrderHours: string;
  enforceOrderTimeWindow: boolean;
  pickupHours: string;
  pickupClosedDays: number[];
  pickupClosedDates: string;
  pickupLeadMinutes: number;
  taxRatePercent: number;
  pickupNoteJa: string;
}

export default function PickupSettings({ onSaved }: { onSaved?: () => void }) {
  const [form, setForm] = useState<PickupForm | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    apiFetch('/api/v1/settings')
      .then(res => res.json())
      .then(data => {
        const rawPickup = (data.pickupHours || '11:00-15:00, 17:00-22:00').split(/[,、]/).map((s: string) => s.trim()).filter(Boolean);
        setForm({
          lunchOrderEnabled: data.lunchOrderEnabled !== false,
          lunchOrderHours: data.lunchOrderHours || rawPickup[0] || '11:00-15:00',
          dinnerOrderEnabled: data.dinnerOrderEnabled !== false,
          dinnerOrderHours: data.dinnerOrderHours || rawPickup[1] || '17:00-22:00',
          enforceOrderTimeWindow: data.enforceOrderTimeWindow !== false,
          pickupHours: data.pickupHours || '11:00-15:00, 17:00-22:00',
          pickupClosedDays: Array.isArray(data.pickupClosedDays) ? data.pickupClosedDays : [],
          pickupClosedDates: Array.isArray(data.pickupClosedDates) ? data.pickupClosedDates.join(', ') : '',
          pickupLeadMinutes: typeof data.pickupLeadMinutes === 'number' ? data.pickupLeadMinutes : DEFAULT_LEAD_MINUTES,
          taxRatePercent: taxRateOf(data),
          pickupNoteJa: data.pickupNoteJa || '',
        });
      })
      .catch(console.error);
  }, []);

  if (!form) return null;

  const update = (patch: Partial<PickupForm>) => {
    const next = { ...form, ...patch };
    // Auto-sync combined pickupHours when lunch or dinner hours/toggles change
    if ('lunchOrderHours' in patch || 'dinnerOrderHours' in patch || 'lunchOrderEnabled' in patch || 'dinnerOrderEnabled' in patch) {
      const parts: string[] = [];
      if (next.lunchOrderEnabled && next.lunchOrderHours.trim()) parts.push(next.lunchOrderHours.trim());
      if (next.dinnerOrderEnabled && next.dinnerOrderHours.trim()) parts.push(next.dinnerOrderHours.trim());
      if (parts.length > 0) {
        next.pickupHours = parts.join(', ');
      }
    }
    setForm(next);
  };

  const toggleDay = (day: number) =>
    update({ pickupClosedDays: form.pickupClosedDays.includes(day) ? form.pickupClosedDays.filter(d => d !== day) : [...form.pickupClosedDays, day].sort() });

  const handleSave = async () => {
    const closedDates = form.pickupClosedDates.split(/[\s,、]+/).filter(Boolean);
    const badDate = closedDates.find(date => !DATE_PATTERN.test(date));
    if (badDate) {
      toast.error(`"${badDate}" is not a date. Use YYYY-MM-DD, e.g. 2026-12-31.`);
      return;
    }

    setSaving(true);
    try {
      // Only the pickup & order timing fields are sent; the API leaves every other setting untouched.
      const res = await apiFetch('/api/v1/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...form,
          takeoutOrderHours: form.pickupHours,
          pickupClosedDates: closedDates,
        }),
      });
      if (res.ok) {
        toast.success('Lunch, Dinner & Takeout timing settings saved.');
        onSaved?.();
      } else {
        toast.error(await errorMessage(res, 'Failed to save pickup settings.'));
      }
    } catch {
      toast.error('Network error while saving pickup settings.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <section style={{ backgroundColor: '#fff', borderRadius: '12px', boxShadow: '0 1px 3px rgba(0,0,0,0.05)', border: '1px solid #e5e7eb' }}>
      <div style={{ padding: '1.5rem', borderBottom: '1px solid #e5e7eb' }}>
        <h3 style={{ margin: 0, fontSize: '1.25rem', fontWeight: 600 }}>Lunch, Dinner & Takeout Order Timing Settings</h3>
        <p style={{ margin: '0.25rem 0 0 0', color: '#6b7280', fontSize: '0.875rem' }}>
          Configure Lunch and Dinner Takeout order hours. When an order is attempted outside the configured time window, customers are shown a clear notification with the active order schedule.
        </p>
      </div>

      <div style={{ padding: '1.5rem', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 260px), 1fr))', gap: '1.5rem' }}>
        {/* Lunch Order Time Box */}
        <div style={{ border: '1px solid #fde68a', backgroundColor: '#fffbeb', borderRadius: '10px', padding: '1rem', display: 'flex', flexDirection: 'column', gap: '0.65rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', fontWeight: 700, color: '#92400e', fontSize: '0.92rem' }}>
              <Sun size={17} /> ランチ注文受付時間 (Lunch Order Time)
            </span>
            <label style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', fontSize: '0.8rem', fontWeight: 600, color: '#92400e', cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={form.lunchOrderEnabled}
                onChange={e => update({ lunchOrderEnabled: e.target.checked })}
              />
              有効
            </label>
          </div>
          <input
            type="text"
            placeholder="11:00-15:00"
            value={form.lunchOrderHours}
            disabled={!form.lunchOrderEnabled}
            onChange={e => update({ lunchOrderHours: e.target.value })}
            style={{ ...inputStyle, backgroundColor: form.lunchOrderEnabled ? '#fff' : '#f3f4f6' }}
          />
          <span style={hintStyle}>例: 11:00-15:00（この時間帯のみランチ注文を受付、時間外は通知を表示）</span>
        </div>

        {/* Dinner Order Time Box */}
        <div style={{ border: '1px solid #c7d2fe', backgroundColor: '#eef2ff', borderRadius: '10px', padding: '1rem', display: 'flex', flexDirection: 'column', gap: '0.65rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', fontWeight: 700, color: '#3730a3', fontSize: '0.92rem' }}>
              <Moon size={17} /> ディナー注文受付時間 (Dinner Order Time)
            </span>
            <label style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', fontSize: '0.8rem', fontWeight: 600, color: '#3730a3', cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={form.dinnerOrderEnabled}
                onChange={e => update({ dinnerOrderEnabled: e.target.checked })}
              />
              有効
            </label>
          </div>
          <input
            type="text"
            placeholder="17:00-22:00"
            value={form.dinnerOrderHours}
            disabled={!form.dinnerOrderEnabled}
            onChange={e => update({ dinnerOrderHours: e.target.value })}
            style={{ ...inputStyle, backgroundColor: form.dinnerOrderEnabled ? '#fff' : '#f3f4f6' }}
          />
          <span style={hintStyle}>例: 17:00-22:00（ディナー・グランドメニューおよび夜間テイクアウト受付時間）</span>
        </div>

        {/* Combined Takeout Hours & Strict Notification Toggle */}
        <div style={{ gridColumn: '1 / -1', border: '1px solid #e5e7eb', backgroundColor: '#f9fafb', borderRadius: '10px', padding: '1rem', display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '8px' }}>
            <label style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', fontWeight: 700, fontSize: '0.92rem', color: '#111827', cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={form.enforceOrderTimeWindow}
                onChange={e => update({ enforceOrderTimeWindow: e.target.checked })}
                style={{ width: '18px', height: '18px', accentColor: '#b3471c' }}
              />
              <Clock size={17} style={{ color: '#b3471c' }} />
              受付時間外の注文制限＆お知らせ通知を有効にする（推奨）
            </label>
            <span style={{ fontSize: '0.78rem', color: '#4b5563', backgroundColor: '#e5e7eb', padding: '3px 10px', borderRadius: '999px', fontWeight: 600 }}>
              テイクアウト合計受付枠: {form.pickupHours || '未設定'}
            </span>
          </div>
          <span style={hintStyle}>
            オンにすると、ランチ時間外にランチメニューを注文しようとした場合や、営業時間外（準備中・深夜・早朝・定休日）にテイクアウト注文を行おうとした場合に、受付時間の案内通知を自動表示します。
          </span>
        </div>

        <label style={labelStyle}>
          Takeout / Pickup hours (Combined)
          <input type="text" placeholder="11:00-15:00, 17:00-22:00" value={form.pickupHours} onChange={e => update({ pickupHours: e.target.value })} style={inputStyle} />
          <span style={hintStyle}>Earliest and latest pickup time; automatically synced from Lunch & Dinner hours above.</span>
        </label>
        <label style={labelStyle}>
          Minimum notice (minutes)
          <input type="number" min={0} max={1440} step={5} value={form.pickupLeadMinutes} onChange={e => update({ pickupLeadMinutes: Number(e.target.value) })} style={inputStyle} />
          <span style={hintStyle}>How long the kitchen needs before the earliest pickup.</span>
        </label>
        <label style={labelStyle}>
          Consumption tax (%)
          <input type="number" min={0} max={MAX_TAX_RATE} value={form.taxRatePercent} onChange={e => update({ taxRatePercent: Number(e.target.value) })} style={inputStyle} />
          <span style={hintStyle}>Added to online orders. Takeout food is normally 8% (reduced rate). Past orders keep the rate they were placed with.</span>
        </label>
        <fieldset style={{ border: 'none', padding: 0, margin: 0 }}>
          <legend style={labelStyle}>Closed days (no pickup or delivery)</legend>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
            {WEEKDAYS.map((name, day) => (
              <label key={name} style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '0.875rem' }}>
                <input type="checkbox" checked={form.pickupClosedDays.includes(day)} onChange={() => toggleDay(day)} />
                {name}
              </label>
            ))}
          </div>
        </fieldset>
        <label style={labelStyle}>
          Closed dates
          <input type="text" placeholder="2026-12-31, 2027-01-01" value={form.pickupClosedDates} onChange={e => update({ pickupClosedDates: e.target.value })} style={inputStyle} />
          <span style={hintStyle}>Holidays or days you can't take orders, as YYYY-MM-DD.</span>
        </label>
        <label style={{ ...labelStyle, gridColumn: '1 / -1' }}>
          Note shown to customers (Japanese)
          <textarea rows={3} placeholder="例: ご来店時にレジで受付番号をお伝えください。" value={form.pickupNoteJa} onChange={e => update({ pickupNoteJa: e.target.value })} style={inputStyle} />
        </label>
        <div style={{ gridColumn: '1 / -1', display: 'flex', justifyContent: 'flex-end' }}>
          <button type="button" onClick={handleSave} disabled={saving} style={{ padding: '0.75rem 1.5rem', backgroundColor: '#000', color: '#fff', border: 'none', borderRadius: '8px', fontWeight: 500, cursor: 'pointer' }}>
            {saving ? 'Saving…' : 'Save Timing & Pickup Settings'}
          </button>
        </div>
      </div>
    </section>
  );
}

const labelStyle: CSSProperties = { display: 'flex', flexDirection: 'column', gap: '0.5rem', fontSize: '0.875rem', fontWeight: 500, color: '#374151' };
const inputStyle: CSSProperties = { width: '100%', padding: '0.75rem', border: '1px solid #d1d5db', borderRadius: '8px', backgroundColor: '#f9fafb', fontWeight: 400, boxSizing: 'border-box', fontFamily: 'inherit' };
const hintStyle: CSSProperties = { fontSize: '0.75rem', color: '#6b7280', fontWeight: 400 };
