import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Gift, X } from 'lucide-react';
import { apiFetch } from '../lib/api';
import { useCustomer } from '../lib/customer-context';
import { formatDate, offerLabel, yen } from '../lib/format';

// The offers created in Admin → Stamps, Offers & Points → Member Offers, shown on the public site:
// a bouncing clip-art gift on the home banner (tap → coupons), and a strip on the menu pages.

interface PublicOffer {
  id: string;
  titleJa: string;
  descriptionJa: string;
  imageUrl: string;
  discountType: 'PERCENT' | 'AMOUNT';
  discountValue: number;
  minSubtotal: number;
  endsAt: string | null;
}

const ROTATE_MS = 4_000;
const HIDDEN_KEY = 'adarsha_offer_sticker_hidden';

/** Live offers, with "used" marked for the signed-in member. */
function useOffers() {
  const { customer } = useCustomer();
  const [offers, setOffers] = useState<PublicOffer[] | null>(null);
  const [used, setUsed] = useState<Set<string>>(new Set());

  useEffect(() => {
    fetch('/api/v1/offers')
      .then(res => (res.ok ? res.json() : []))
      .then(setOffers)
      .catch(() => setOffers([]));
  }, []);

  useEffect(() => {
    if (!customer) return;
    apiFetch('/api/v1/customers/me/offers')
      .then(res => (res.ok ? res.json() : []))
      .then((mine: { id: string; used: boolean }[]) => setUsed(new Set(mine.filter(offer => offer.used).map(offer => offer.id))))
      .catch(() => undefined);
  }, [customer]);

  return { offers, used: customer ? used : new Set<string>(), isMember: Boolean(customer) };
}

/** Big text for the burst: "10%OFF" or "¥300引き". */
const burstText = (offer: PublicOffer) => offerLabel(offer).replace('OFF', 'OFF!');

/** A 14-point comic starburst, as an SVG polygon. */
const BURST_POINTS = Array.from({ length: 28 }, (_, i) => {
  const angle = (Math.PI * 2 * i) / 28 - Math.PI / 2;
  const radius = i % 2 ? 41 : 50;
  return `${(50 + Math.cos(angle) * radius).toFixed(1)},${(50 + Math.sin(angle) * radius).toFixed(1)}`;
}).join(' ');

/** Cartoon gift box: flat colours, thick outlines. */
function GiftClipArt() {
  const ink = '#3b2416';
  return (
    <svg viewBox="0 0 120 120" className="os-giftsvg" aria-hidden="true">
      {/* bow */}
      <path d="M60 36 C46 14 22 18 30 34 C35 43 50 40 60 36 Z" fill="#ffc93c" stroke={ink} strokeWidth="4" strokeLinejoin="round" />
      <path d="M60 36 C74 14 98 18 90 34 C85 43 70 40 60 36 Z" fill="#ffc93c" stroke={ink} strokeWidth="4" strokeLinejoin="round" />
      {/* box */}
      <rect x="20" y="54" width="80" height="54" rx="8" fill="#e2412f" stroke={ink} strokeWidth="4" />
      <rect x="28" y="62" width="10" height="26" rx="5" fill="#fff" opacity="0.35" />
      {/* lid */}
      <rect x="13" y="38" width="94" height="20" rx="6" fill="#f2603f" stroke={ink} strokeWidth="4" />
      {/* ribbon */}
      <rect x="52" y="38" width="16" height="70" fill="#ffc93c" stroke={ink} strokeWidth="4" />
      <circle cx="60" cy="36" r="7" fill="#ffb000" stroke={ink} strokeWidth="4" />
      {/* polka dots */}
      <circle cx="84" cy="74" r="3.5" fill="#ffd8c9" />
      <circle cx="40" cy="96" r="3.5" fill="#ffd8c9" />
      <circle cx="86" cy="96" r="3" fill="#ffd8c9" />
    </svg>
  );
}

function Sparkle({ className }: { className: string }) {
  return (
    <svg viewBox="0 0 24 24" className={`os-sparkle ${className}`} aria-hidden="true">
      <path d="M12 1 L14.2 9.8 L23 12 L14.2 14.2 L12 23 L9.8 14.2 L1 12 L9.8 9.8 Z" fill="#fff6b0" stroke="#3b2416" strokeWidth="1.6" strokeLinejoin="round" />
    </svg>
  );
}

/** The bouncing gift on the home banner. Renders nothing when there are no live offers. */
export default function OfferSticker() {
  const { offers, used, isMember } = useOffers();
  const [index, setIndex] = useState(0);
  const [open, setOpen] = useState(false);
  const [hidden, setHidden] = useState(() => {
    try {
      return sessionStorage.getItem(HIDDEN_KEY) === '1';
    } catch {
      return false;
    }
  });
  const usable = (offers ?? []).filter(offer => !used.has(offer.id));

  // Cycle through the offers on the burst.
  useEffect(() => {
    if (usable.length < 2) return;
    const intervalId = setInterval(() => setIndex(i => i + 1), ROTATE_MS);
    return () => clearInterval(intervalId);
  }, [usable.length]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open]);

  if (!offers || offers.length === 0 || (usable.length === 0 && !open)) return null;
  const current = usable[index % Math.max(1, usable.length)];

  const hide = () => {
    setHidden(true);
    try {
      sessionStorage.setItem(HIDDEN_KEY, '1');
    } catch {
      // Not remembered in private mode.
    }
  };

  return (
    <>
      {!hidden && current && (
        <div className="os">
          <button type="button" className="os-hit" onClick={() => setOpen(true)} aria-label={`会員限定オファー：${current.titleJa}（${offerLabel(current)}）。タップして特典を見る`}>
            <span className="os-burst" key={current.id}>
              <svg viewBox="0 0 100 100" aria-hidden="true"><polygon points={BURST_POINTS} /></svg>
              <span className="os-burst-text">
                <small>会員限定</small>
                <strong className={burstText(current).length > 5 ? 'is-long' : undefined}>{burstText(current)}</strong>
              </span>
            </span>
            <span className="os-gift">
              <GiftClipArt />
            </span>
            <span className="os-shadow" aria-hidden="true" />
            <Sparkle className="s1" />
            <Sparkle className="s2" />
            <Sparkle className="s3" />
            <span className="os-pill">{usable.length > 1 ? `特典 ${usable.length}件 ▶` : 'タップで特典 ▶'}</span>
          </button>
          <button type="button" className="os-close" onClick={hide} aria-label="特典の表示を閉じる"><X size={14} /></button>
        </div>
      )}

      {open && (
        <div className="os-modal" role="dialog" aria-modal="true" aria-labelledby="offers-title" onClick={() => setOpen(false)}>
          <div className="os-sheet" onClick={e => e.stopPropagation()}>
            <button type="button" className="os-sheet-close" onClick={() => setOpen(false)} aria-label="閉じる"><X size={20} /></button>
            <div className="os-sheet-art" aria-hidden="true"><GiftClipArt /></div>
            <h2 id="offers-title">会員限定オファー</h2>
            <p className="os-sheet-sub">{isMember ? 'ご注文時に特典を選ぶだけ！' : '無料の会員登録で、オンライン注文にすぐ使えます！'}</p>
            <ul className="os-coupons">
              {offers.map(offer => {
                const isUsed = used.has(offer.id);
                return (
                  <li key={offer.id} className={`os-coupon${isUsed ? ' is-used' : ''}`}>
                    <div className="os-coupon-stub">
                      <Gift size={18} aria-hidden="true" />
                      <strong>{offerLabel(offer)}</strong>
                    </div>
                    <div className="os-coupon-body">
                      <h3>{offer.titleJa}</h3>
                      {offer.descriptionJa && <p>{offer.descriptionJa}</p>}
                      <small>
                        {[offer.minSubtotal > 0 && `${yen(offer.minSubtotal)}以上で利用可`, offer.endsAt && `${formatDate(offer.endsAt)}まで`].filter(Boolean).join(' ・ ')}
                      </small>
                      {isUsed && <span className="os-used">ご利用済み</span>}
                    </div>
                  </li>
                );
              })}
            </ul>
            {isMember ? (
              <Link to="/menu/takeout" className="os-cta" onClick={() => setOpen(false)}>特典を使って注文する</Link>
            ) : (
              <div className="os-actions">
                <Link to="/account/register?next=/menu/takeout" className="os-cta" onClick={() => setOpen(false)}>無料で会員登録して使う</Link>
                <Link to="/account/login?next=/menu/takeout" className="os-login" onClick={() => setOpen(false)}>会員の方はログイン</Link>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}

export function MemberOfferStrip(_props?: { next?: string }) {
  return null;
}
