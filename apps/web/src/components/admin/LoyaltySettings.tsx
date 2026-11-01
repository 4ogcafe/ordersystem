import { useEffect, useState, type CSSProperties } from 'react';
import { toast } from 'react-hot-toast';
import { apiFetch, errorMessage } from '../../lib/api';

interface LoyaltyForm {
  pointsEnabled: boolean;
  pointsPer100Yen: number;
  pointValueYen: number;
  signupBonusPoints: number;
}

// Same defaults as the API (lib/loyalty.ts): 1 point per ¥100, 1 point = ¥1.
const DEFAULTS: LoyaltyForm = { pointsEnabled: true, pointsPer100Yen: 1, pointValueYen: 1, signupBonusPoints: 0 };

export default function LoyaltySettings() {
  const [form, setForm] = useState<LoyaltyForm | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    apiFetch('/api/v1/settings')
      .then(res => res.json())
      .then(data =>
        setForm({
          pointsEnabled: data.pointsEnabled !== false,
          pointsPer100Yen: data.pointsPer100Yen ?? DEFAULTS.pointsPer100Yen,
          pointValueYen: data.pointValueYen ?? DEFAULTS.pointValueYen,
          signupBonusPoints: data.signupBonusPoints ?? DEFAULTS.signupBonusPoints,
        }),
      )
      .catch(console.error);
  }, []);

  if (!form) return null;
  const update = (patch: Partial<LoyaltyForm>) => setForm({ ...form, ...patch });
  const returnRate = ((form.pointsPer100Yen * form.pointValueYen) / 100) * 100;

  const save = async () => {
    setSaving(true);
    try {
      const res = await apiFetch('/api/v1/settings', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(form) });
      if (res.ok) toast.success('Points settings saved.');
      else toast.error(await errorMessage(res, 'Failed to save points settings.'));
    } catch {
      toast.error('Network error.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <section style={{ backgroundColor: '#fff', borderRadius: '12px', boxShadow: '0 1px 3px rgba(0,0,0,0.05)', border: '1px solid #e5e7eb', padding: '1.5rem' }}>
      <h3 style={{ margin: 0, fontSize: '1.25rem', fontWeight: 600 }}>Points Program</h3>
      <p style={{ margin: '0.25rem 0 1.25rem', color: '#6b7280', fontSize: '0.875rem' }}>
        Members earn points when an order is picked up and can spend them on later orders. Currently members get back <strong>{returnRate.toFixed(1)}%</strong> of what they pay.
      </p>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 200px), 1fr))', gap: '1.25rem' }}>
        <label style={{ ...labelStyle, flexDirection: 'row', alignItems: 'center', gridColumn: '1 / -1' }}>
          <input type="checkbox" checked={form.pointsEnabled} onChange={e => update({ pointsEnabled: e.target.checked })} style={{ width: '18px', height: '18px' }} />
          Points program on (when off, balances are kept but can't be earned or spent)
        </label>
        <label style={labelStyle}>
          Points per ¥100 paid
          <input type="number" min={0} max={100} value={form.pointsPer100Yen} onChange={e => update({ pointsPer100Yen: Number(e.target.value) })} style={inputStyle} />
        </label>
        <label style={labelStyle}>
          Value of 1 point (¥)
          <input type="number" min={1} max={100} value={form.pointValueYen} onChange={e => update({ pointValueYen: Number(e.target.value) })} style={inputStyle} />
        </label>
        <label style={labelStyle}>
          Welcome bonus (points)
          <input type="number" min={0} max={100000} value={form.signupBonusPoints} onChange={e => update({ signupBonusPoints: Number(e.target.value) })} style={inputStyle} />
        </label>
      </div>
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '1.25rem' }}>
        <button type="button" onClick={save} disabled={saving} style={{ padding: '0.65rem 1.25rem', backgroundColor: '#000', color: '#fff', border: 'none', borderRadius: '8px', fontWeight: 600, cursor: 'pointer' }}>
          {saving ? 'Saving…' : 'Save Points Settings'}
        </button>
      </div>
    </section>
  );
}

const labelStyle: CSSProperties = { display: 'flex', flexDirection: 'column', gap: '0.4rem', fontSize: '0.875rem', fontWeight: 500, color: '#374151' };
const inputStyle: CSSProperties = { width: '100%', padding: '0.65rem', border: '1px solid #d1d5db', borderRadius: '8px', backgroundColor: '#f9fafb', boxSizing: 'border-box', fontSize: '0.95rem' };
