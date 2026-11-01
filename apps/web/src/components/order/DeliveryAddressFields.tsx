import type { CSSProperties, ReactNode } from 'react';
import { toHalfWidth } from '../../lib/format';
import { PREFECTURES } from '../account/profile-options';
import type { AddressErrors, DeliveryAddress } from './fulfillment';

/** Where to deliver. Starts from the member's saved address; they can change it for this order. */
export default function DeliveryAddressFields({ value, onChange, errors, saveToProfile, onSaveToProfileChange, areas }: {
  value: DeliveryAddress;
  onChange: (value: DeliveryAddress) => void;
  errors: AddressErrors;
  saveToProfile: boolean;
  onSaveToProfileChange: (value: boolean) => void;
  areas: string[];
}) {
  const set = (patch: Partial<DeliveryAddress>) => onChange({ ...value, ...patch });
  const field = (id: keyof DeliveryAddress, label: string, input: ReactNode, required = true) => (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', gridColumn: id === 'building' || id === 'line1' ? '1 / -1' : undefined }}>
      <label htmlFor={`addr-${id}`} style={labelStyle}>{label} {required && <span style={{ color: 'var(--spice)' }}>*</span>}</label>
      {input}
      {errors[id] && <span id={`addr-${id}-error`} role="alert" style={{ color: '#b91c1c', fontSize: '0.85rem' }}>{errors[id]}</span>}
    </div>
  );
  const invalid = (id: keyof DeliveryAddress) => (errors[id] ? { 'aria-invalid': true as const, 'aria-describedby': `addr-${id}-error` } : {});

  return (
    <fieldset style={{ border: '1px solid #efe7dc', borderRadius: '12px', padding: '14px 16px 16px', margin: 0, display: 'flex', flexDirection: 'column', gap: '12px' }}>
      <legend style={{ ...labelStyle, padding: '0 6px' }}>お届け先</legend>
      {areas.length > 0 && <p style={{ margin: 0, fontSize: '0.85rem', color: 'var(--text-muted)' }}>配達エリア：{areas.join('、')}</p>}
      <div className="addr-grid">
        {field('postalCode', '郵便番号', <input id="addr-postalCode" inputMode="numeric" autoComplete="postal-code" placeholder="360-0023" maxLength={8} value={value.postalCode} onChange={e => set({ postalCode: toHalfWidth(e.target.value) })} {...invalid('postalCode')} style={input(errors.postalCode)} />)}
        {field('prefecture', '都道府県', (
          <select id="addr-prefecture" autoComplete="address-level1" value={value.prefecture} onChange={e => set({ prefecture: e.target.value })} {...invalid('prefecture')} style={input(errors.prefecture)}>
            <option value="">選択してください</option>
            {PREFECTURES.map(prefecture => <option key={prefecture} value={prefecture}>{prefecture}</option>)}
          </select>
        ))}
        {field('city', '市区町村', <input id="addr-city" autoComplete="address-level2" maxLength={100} placeholder="熊谷市" value={value.city} onChange={e => set({ city: e.target.value })} {...invalid('city')} style={input(errors.city)} />)}
        {field('line1', '番地', <input id="addr-line1" autoComplete="address-line1" maxLength={200} placeholder="鎌倉町1-2-3" value={value.line1} onChange={e => set({ line1: e.target.value })} {...invalid('line1')} style={input(errors.line1)} />)}
        {field('building', '建物名・部屋番号', <input id="addr-building" autoComplete="address-line2" maxLength={200} value={value.building} onChange={e => set({ building: e.target.value })} style={input()} />, false)}
      </div>
      <label style={{ display: 'flex', gap: '8px', alignItems: 'center', fontSize: '0.88rem', cursor: 'pointer' }}>
        <input type="checkbox" checked={saveToProfile} onChange={e => onSaveToProfileChange(e.target.checked)} style={{ width: '18px', height: '18px', accentColor: 'var(--spice)' }} />
        この住所を会員情報に保存する
      </label>
    </fieldset>
  );
}

const labelStyle: CSSProperties = { fontWeight: 'bold', color: 'var(--dark-bark)', fontSize: '0.9rem' };
const input = (error?: string): CSSProperties => ({
  padding: '12px', border: `1px solid ${error ? '#dc2626' : '#e5dbcd'}`, borderRadius: '8px', fontSize: '1rem', fontFamily: 'inherit', width: '100%', backgroundColor: '#fff',
});
