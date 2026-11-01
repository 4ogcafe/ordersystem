import { useState } from 'react';
import { Link } from 'react-router-dom';
import { assetUrl } from '../../lib/api';
import { formatDate, offerLabel, yen } from '../../lib/format';
import { cardStyle, mutedStyle } from './styles';
import type { MemberOffer } from './types';

const NEW_FOR_MS = 7 * 24 * 60 * 60 * 1000;

export default function OffersList({ offers, limit }: { offers: MemberOffer[]; limit?: number }) {
  // Measured once per mount, so the NEW badges don't flicker as the page re-renders.
  const [now] = useState(() => Date.now());
  const shown = limit ? offers.filter(offer => !offer.used).slice(0, limit) : offers;
  if (shown.length === 0) {
    return <p style={{ ...cardStyle, ...mutedStyle, margin: 0 }}>現在ご利用いただける特典はありません。新しい特典をお楽しみに。</p>;
  }
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(min(100%, 260px), 1fr))', gap: '16px' }}>
      {shown.map(offer => (
        <article key={offer.id} style={{ ...cardStyle, padding: 0, overflow: 'hidden', opacity: offer.used ? 0.6 : 1, display: 'flex', flexDirection: 'column' }}>
          {offer.imageUrl && <img src={assetUrl(offer.imageUrl)} alt="" loading="lazy" style={{ width: '100%', height: '140px', objectFit: 'cover' }} />}
          <div style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: '8px', flex: 1 }}>
            <span style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
              <span style={{ padding: '4px 12px', borderRadius: '9999px', backgroundColor: 'var(--gold)', color: 'var(--dark-bark)', fontWeight: 'bold', fontSize: '0.85rem' }}>
                {offerLabel(offer)}
              </span>
              {!offer.used && offer.startsAt && now - new Date(offer.startsAt).getTime() < NEW_FOR_MS && (
                <span style={{ padding: '3px 8px', borderRadius: '6px', backgroundColor: 'var(--spice)', color: '#fff', fontWeight: 800, fontSize: '0.7rem', letterSpacing: '0.05em' }}>NEW</span>
              )}
            </span>
            <h3 style={{ margin: 0, color: 'var(--dark-bark)', fontSize: '1.1rem' }}>{offer.titleJa}</h3>
            {offer.descriptionJa && <p style={{ margin: 0, lineHeight: 1.6, fontSize: '0.9rem', whiteSpace: 'pre-wrap' }}>{offer.descriptionJa}</p>}
            <div style={{ ...mutedStyle, marginTop: 'auto' }}>
              {offer.minSubtotal > 0 && <div>{yen(offer.minSubtotal)}以上のご注文で利用可</div>}
              {offer.oncePerCustomer && <div>お一人様1回限り</div>}
              {offer.endsAt && <div>{formatDate(offer.endsAt)}まで</div>}
            </div>
            {offer.used ? (
              <span style={{ fontWeight: 'bold', color: 'var(--text-muted)' }}>利用済み</span>
            ) : (
              <Link to="/menu/takeout" style={{ color: 'var(--spice)', fontWeight: 'bold' }}>この特典で注文する →</Link>
            )}
          </div>
        </article>
      ))}
    </div>
  );
}
