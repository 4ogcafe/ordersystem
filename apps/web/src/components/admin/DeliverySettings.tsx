import { useEffect, useState, type CSSProperties } from 'react';
import { toast } from 'react-hot-toast';
import { apiFetch, errorMessage } from '../../lib/api';

// Same default as the API (lib/fulfillment.ts).
const DEFAULT_LEAD_MINUTES = 60;

interface DeliveryForm {
  deliveryHours: string;
  deliveryLeadMinutes: number;
  deliveryFee: number;
  deliveryFreeOver: number;
  deliveryMinOrder: number;
  deliveryAreas: string;
  deliveryNoteJa: string;
}

/** Delivery details. Switching delivery on and off is done in OrderingSwitches. */
export default function DeliverySettings({ onSaved }: { onSaved?: () => void }) {
  const [form, setForm] = useState<DeliveryForm | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    apiFetch('/api/v1/settings')
      .then(res => res.json())
      .then(data => setForm({
        deliveryHours: data.deliveryHours || '',
        deliveryLeadMinutes: data.deliveryLeadMinutes ?? DEFAULT_LEAD_MINUTES,
        deliveryFee: data.deliveryFee ?? 0,
        deliveryFreeOver: data.deliveryFreeOver ?? 0,
        deliveryMinOrder: data.deliveryMinOrder ?? 0,
        deliveryAreas: Array.isArray(data.deliveryAreas) ? data.deliveryAreas.join(', ') : '',
        deliveryNoteJa: data.deliveryNoteJa || '',
      }))
      .catch(console.error);
  }, []);

  if (!form) return null;
  const update = (patch: Partial<DeliveryForm>) => setForm({ ...form, ...patch });
  const areas = form.deliveryAreas.split(/[,、\n]+/).map(area => area.trim()).filter(Boolean);

  const save = async () => {
    setSaving(true);
    try {
      const res = await apiFetch('/api/v1/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...form, deliveryAreas: areas }),
      });
      if (res.ok) {
        toast.success('Delivery settings saved.');
        onSaved?.();
      } else toast.error(await errorMessage(res, 'Failed to save delivery settings.'));
    } catch {
      toast.error('Network error while saving delivery settings.');
    } finally {
      setSaving(false);
    }
  };

  const yenInput = (key: 'deliveryFee' | 'deliveryFreeOver' | 'deliveryMinOrder') => (
    <input type="number" min={0} step={50} value={form[key]} onChange={e => update({ [key]: Math.max(0, Number(e.target.value) || 0) })} style={inputStyle} />
  );

  return (
    <section style={{ backgroundColor: '#fff', borderRadius: '12px', boxShadow: '0 1px 3px rgba(0,0,0,0.05)', border: '1px solid #e5e7eb' }}>
      <div style={{ padding: '1.5rem', borderBottom: '1px solid #e5e7eb' }}>
        <h3 style={{ margin: 0, fontSize: '1.25rem', fontWeight: 600 }}>Delivery Settings</h3>
        <p style={{ margin: '0.25rem 0 0 0', color: '#6b7280', fontSize: '0.875rem' }}>
          Customers pay in cash when the order arrives. Closed days set under Pickup &amp; Shop Settings apply to delivery too.
        </p>
      </div>
      <div style={{ padding: '1.5rem', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 240px), 1fr))', gap: '1.5rem' }}>
        <label style={labelStyle}>
          Delivery hours
          <input type="text" placeholder="17:00-21:00" value={form.deliveryHours} onChange={e => update({ deliveryHours: e.target.value })} style={inputStyle} />
          <span style={hintStyle}>Earliest and latest delivery time. Leave empty to use the pickup hours.</span>
        </label>
        <label style={labelStyle}>
          Minimum notice (minutes)
          <input type="number" min={0} max={1440} step={5} value={form.deliveryLeadMinutes} onChange={e => update({ deliveryLeadMinutes: Number(e.target.value) })} style={inputStyle} />
          <span style={hintStyle}>Cooking plus travel time before the earliest delivery.</span>
        </label>
        <label style={labelStyle}>
          Delivery fee (¥, tax included)
          {yenInput('deliveryFee')}
          <span style={hintStyle}>0 = free delivery.</span>
        </label>
        <label style={labelStyle}>
          Free delivery from (¥)
          {yenInput('deliveryFreeOver')}
          <span style={hintStyle}>Food total (before tax) for free delivery. 0 = never free.</span>
        </label>
        <label style={labelStyle}>
          Minimum order (¥)
          {yenInput('deliveryMinOrder')}
          <span style={hintStyle}>Smallest food total accepted for delivery. 0 = no minimum.</span>
        </label>
        <label style={{ ...labelStyle, gridColumn: '1 / -1' }}>
          Delivery area
          <input type="text" placeholder="360, 熊谷市, 行田市" value={form.deliveryAreas} onChange={e => update({ deliveryAreas: e.target.value })} style={inputStyle} />
          <span style={hintStyle}>
            Postal-code starts (e.g. <code>360</code> or <code>360-08</code>) or town names, separated by commas. Empty = deliver anywhere.
            {areas.length > 0 && <> Currently: {areas.join(' · ')}</>}
          </span>
        </label>
        <label style={{ ...labelStyle, gridColumn: '1 / -1' }}>
          Note shown to customers (Japanese)
          <textarea rows={2} placeholder="例: 配達まで30〜60分ほどお時間をいただきます。" value={form.deliveryNoteJa} onChange={e => update({ deliveryNoteJa: e.target.value })} style={inputStyle} />
        </label>
        <div style={{ gridColumn: '1 / -1', display: 'flex', justifyContent: 'flex-end' }}>
          <button type="button" onClick={save} disabled={saving} style={{ padding: '0.75rem 1.5rem', backgroundColor: '#000', color: '#fff', border: 'none', borderRadius: '8px', fontWeight: 500, cursor: 'pointer' }}>
            {saving ? 'Saving…' : 'Save Delivery Settings'}
          </button>
        </div>
      </div>
    </section>
  );
}

const labelStyle: CSSProperties = { display: 'flex', flexDirection: 'column', gap: '0.5rem', fontSize: '0.875rem', fontWeight: 500, color: '#374151' };
const inputStyle: CSSProperties = { width: '100%', padding: '0.75rem', border: '1px solid #d1d5db', borderRadius: '8px', backgroundColor: '#f9fafb', fontWeight: 400, fontFamily: 'inherit' };
const hintStyle: CSSProperties = { fontSize: '0.75rem', color: '#6b7280', fontWeight: 400 };
