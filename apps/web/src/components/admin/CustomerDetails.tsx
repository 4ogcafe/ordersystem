import { useEffect, useState, type CSSProperties, type ReactNode } from 'react';
import { apiFetch } from '../../lib/api';
import { X } from 'lucide-react';
import { formatMemberCode, offerLabel, yen } from '../../lib/format';
import { DIET_LABELS, SPICE_LABELS } from './dietary';

export interface MemberDetails {
  id: string;
  name: string;
  nameKana: string;
  email: string;
  phone: string;
  birthDate: string;
  address: { postalCode: string; prefecture: string; city: string; line1: string; building: string };
  preferences: { allergens: string[]; otherAllergies: string; diets: string[]; spiceLevel: number | null; note: string };
  newsletterOptIn: boolean;
  points: number;
  createdAt: string;
  completedOrders: number;
  totalSpent: number;
  memberCode: string | null;
  stamps: number;
  stampsPerCard: number;
  completedCards: number;
  lastStampAt: string | null;
  availableRewards: number;
}

interface MemberOffers {
  available: { id: string; titleJa: string; discountType: 'PERCENT' | 'AMOUNT'; discountValue: number; minSubtotal: number; endsAt: string | null; oncePerCustomer: boolean; used: boolean }[];
  used: { orderNumber: number; titleJa: string; discount: number; createdAt: string }[];
}

const age = (birthDate: string) => {
  const born = new Date(`${birthDate}T00:00:00`);
  const now = new Date();
  const hadBirthday = now.getMonth() > born.getMonth() || (now.getMonth() === born.getMonth() && now.getDate() >= born.getDate());
  return now.getFullYear() - born.getFullYear() - (hadBirthday ? 0 : 1);
};

/** Everything a member told us, on one screen, for quick reference at the counter or on the phone. */
export default function CustomerDetails({ member, onClose }: { member: MemberDetails; onClose: () => void }) {
  const { address, preferences } = member;
  const fullAddress = [address.postalCode && `〒${address.postalCode}`, address.prefecture, address.city, address.line1, address.building].filter(Boolean).join(' ');
  const allergies = [...preferences.allergens, ...(preferences.otherAllergies ? [preferences.otherAllergies] : [])];
  const birthMonth = member.birthDate ? Number(member.birthDate.slice(5, 7)) : null;
  const [thisMonth] = useState(() => new Date().getMonth() + 1);
  const [offers, setOffers] = useState<MemberOffers | null>(null);
  useEffect(() => {
    apiFetch(`/api/v1/customers/${member.id}/offers`)
      .then(res => (res.ok ? res.json() : null))
      .then(setOffers)
      .catch(() => setOffers(null));
  }, [member.id]);

  return (
    <div role="dialog" aria-modal="true" aria-labelledby="member-details-title" style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 50, padding: '1rem' }} onClick={onClose}>
      <div style={{ backgroundColor: '#fff', borderRadius: '12px', width: '100%', maxWidth: '560px', maxHeight: '90vh', overflowY: 'auto', padding: '1.5rem' }} onClick={e => e.stopPropagation()}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '1rem' }}>
          <div>
            <h2 id="member-details-title" style={{ margin: 0, fontSize: '1.3rem' }}>{member.name}</h2>
            {member.nameKana && <div style={{ color: '#6b7280' }}>{member.nameKana}</div>}
          </div>
          <button type="button" onClick={onClose} aria-label="Close" style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '4px' }}><X size={22} /></button>
        </div>

        {allergies.length > 0 && (
          <div style={{ marginTop: '1rem', padding: '0.75rem 1rem', borderRadius: '8px', backgroundColor: '#fef2f2', border: '1px solid #fecaca', color: '#b91c1c', fontWeight: 600 }}>
            ⚠ Allergies: {allergies.join(', ')}
          </div>
        )}

        <dl style={{ display: 'grid', gridTemplateColumns: 'minmax(110px, auto) 1fr', gap: '0.6rem 1rem', margin: '1.25rem 0 0', fontSize: '0.92rem' }}>
          <Row label="Email">{member.email}</Row>
          <Row label="Phone">{member.phone ? <a href={`tel:${member.phone}`}>{member.phone}</a> : '—'}</Row>
          <Row label="Birthday">{member.birthDate ? `${member.birthDate} (age ${age(member.birthDate)})${birthMonth === thisMonth ? ' 🎂 this month' : ''}` : '—'}</Row>
          <Row label="Address">{fullAddress || '—'}</Row>
          <Row label="Diet">{preferences.diets.length ? preferences.diets.map(diet => DIET_LABELS[diet] ?? diet).join(', ') : '—'}</Row>
          <Row label="Spice">{preferences.spiceLevel !== null ? SPICE_LABELS[preferences.spiceLevel] : '—'}</Row>
          <Row label="Notes">{preferences.note || '—'}</Row>
          <Row label="Newsletter">{member.newsletterOptIn ? 'Subscribed' : 'Not subscribed'}</Row>
          <Row label="Member since">{new Date(member.createdAt).toLocaleDateString('ja-JP')}</Row>
          <Row label="Orders">{member.completedOrders} picked up · {yen(member.totalSpent)} spent</Row>
          <Row label="Points">{member.points.toLocaleString('ja-JP')}pt</Row>
          <Row label="Stamp card">
            {member.stamps}/{member.stampsPerCard} stamps · {member.completedCards} full card{member.completedCards === 1 ? '' : 's'}
            {member.availableRewards > 0 && ` · 🎁 ${member.availableRewards} reward${member.availableRewards === 1 ? '' : 's'} to use`}
            {member.lastStampAt && <div style={{ color: '#6b7280' }}>Last stamp {new Date(member.lastStampAt).toLocaleString('ja-JP', { timeZone: 'Asia/Tokyo' })}</div>}
          </Row>
          <Row label="Member code">{member.memberCode ? formatMemberCode(member.memberCode) : 'Not shown yet (created when the member opens their card)'}</Row>
        </dl>

        <h3 style={{ margin: '1.5rem 0 0.5rem', fontSize: '1rem' }}>Offers</h3>
        {!offers ? (
          <p style={{ color: '#6b7280', margin: 0, fontSize: '0.9rem' }}>Loading…</p>
        ) : (
          <>
            {offers.available.length === 0 ? (
              <p style={{ color: '#6b7280', margin: 0, fontSize: '0.9rem' }}>現在有効なオファー・クーポンはありません（会員・特典設定 → 割引オファー・クーポン設定）。</p>
            ) : (
              <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'grid', gap: '6px' }}>
                {offers.available.map(offer => (
                  <li key={offer.id} style={{ display: 'flex', justifyContent: 'space-between', gap: '8px', alignItems: 'center', padding: '6px 10px', borderRadius: '8px', backgroundColor: offer.used ? '#f3f4f6' : '#f0fdf4', fontSize: '0.88rem' }}>
                    <span>
                      <strong>{offer.titleJa}</strong> <span style={{ color: '#6b7280' }}>· {offerLabel(offer)}{offer.minSubtotal > 0 ? ` · from ${yen(offer.minSubtotal)}` : ''}{offer.endsAt ? ` · until ${new Date(offer.endsAt).toLocaleDateString('ja-JP')}` : ''}</span>
                    </span>
                    <span style={{ fontWeight: 600, color: offer.used ? '#6b7280' : '#047857', whiteSpace: 'nowrap' }}>{offer.used ? 'Used' : 'Can use'}</span>
                  </li>
                ))}
              </ul>
            )}
            {offers.used.length > 0 && (
              <details style={{ marginTop: '8px', fontSize: '0.88rem' }}>
                <summary style={{ cursor: 'pointer', color: '#1d4ed8' }}>Used {offers.used.length} time{offers.used.length === 1 ? '' : 's'} · saved {yen(offers.used.reduce((sum, u) => sum + u.discount, 0))}</summary>
                <ul style={{ margin: '6px 0 0', paddingLeft: '1.1rem', color: '#4b5563' }}>
                  {offers.used.map(u => <li key={`${u.orderNumber}-${u.createdAt}`}>{new Date(u.createdAt).toLocaleDateString('ja-JP')} · order #{u.orderNumber} · {u.titleJa} (−{yen(u.discount)})</li>)}
                </ul>
              </details>
            )}
          </>
        )}
      </div>
    </div>
  );
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <>
      <dt style={dtStyle}>{label}</dt>
      <dd style={{ margin: 0, overflowWrap: 'anywhere' }}>{children}</dd>
    </>
  );
}

const dtStyle: CSSProperties = { color: '#6b7280', fontWeight: 500 };
