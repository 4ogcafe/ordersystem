import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Tag, Check, Award, Sparkles } from 'lucide-react';
import { apiFetch } from '../../lib/api';
import { useCustomer } from '../../lib/customer-context';
import { offerLabel, yen } from '../../lib/format';
import type { MemberOffer, StampCardData, StampReward } from '../account/types';
import type { Quote, Savings } from './useOrderQuote';

/** Offer and points choices for members and guests. Supports combining multiple offers. */
export default function MemberSavings({ savings, onChange, quote, next }: {
  savings: Savings;
  onChange: (savings: Savings) => void;
  quote: Quote | null;
  /** Where to come back to after logging in. */
  next: string;
}) {
  const { customer, loyalty } = useCustomer();
  const [offers, setOffers] = useState<MemberOffer[]>([]);
  const [rewards, setRewards] = useState<StampReward[]>([]);
  const [stampCard, setStampCard] = useState<StampCardData | null>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let cancelled = false;

    if (customer) {
      // Logged-in member: fetch personalized offers with 'used' flags and stamp rewards
      Promise.all([
        apiFetch('/api/v1/customers/me/offers')
          .then(res => (res.ok ? res.json() : []))
          .catch(() => []),
        apiFetch('/api/v1/customers/me/stamps')
          .then(res => (res.ok ? res.json() : null))
          .catch(() => null),
      ]).then(([offersData, stampData]: [MemberOffer[], StampCardData | null]) => {
        if (cancelled) return;
        setOffers(offersData);
        setStampCard(stampData);
        setRewards(stampData?.rewards ?? []);
        setLoaded(true);
      });
    } else {
      // Guest visitor: fetch public live offers
      fetch('/api/v1/offers')
        .then(res => (res.ok ? res.json() : []))
        .then((publicOffers: any[]) => {
          if (cancelled) return;
          const mapped: MemberOffer[] = publicOffers.map(o => ({
            id: o.id,
            titleJa: o.titleJa,
            descriptionJa: o.descriptionJa ?? '',
            imageUrl: o.imageUrl ?? '',
            discountType: o.discountType,
            discountValue: o.discountValue,
            minSubtotal: o.minSubtotal ?? 0,
            endsAt: o.endsAt ?? null,
            startsAt: o.startsAt ?? null,
            oncePerCustomer: false,
            used: false,
          }));
          setOffers(mapped);
          setRewards([]);
          setLoaded(true);
        })
        .catch(() => {
          if (!cancelled) setLoaded(true);
        });
    }

    return () => {
      cancelled = true;
    };
  }, [customer]);

  const selectedOfferIds: string[] = savings.offerIds && savings.offerIds.length > 0
    ? savings.offerIds
    : savings.offerId
      ? [savings.offerId]
      : [];

  const toggleOffer = (offerId: string) => {
    const isSelected = selectedOfferIds.includes(offerId);
    const nextIds = isSelected
      ? selectedOfferIds.filter(id => id !== offerId)
      : [...selectedOfferIds, offerId];
    onChange({
      ...savings,
      offerIds: nextIds,
      offerId: nextIds[0] || '',
    });
  };

  // Ensure unachieved or stale rewards cannot remain selected
  useEffect(() => {
    if (savings.rewardId) {
      const isAchieved = rewards.some(r => r.id === savings.rewardId);
      if (!isAchieved) {
        onChange({ ...savings, rewardId: '' });
      }
    }
  }, [rewards, savings.rewardId]);

  const balance = customer?.points ?? 0;
  const pointsEnabled = Boolean(customer && loyalty?.enabled);
  const maxPoints = quote ? Math.min(balance, Math.floor((quote.subtotal - quote.offerDiscount - quote.rewardDiscount) / (loyalty?.pointValueYen ?? 1))) : balance;

  const subtotal = quote?.subtotal ?? 0;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '14px', backgroundColor: '#fffaf0', border: '1px solid #fed7aa', borderRadius: '10px', padding: '16px' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '8px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontWeight: 'bold', color: 'var(--dark-bark)', fontSize: '1rem' }}>
          <Tag size={18} color="var(--spice)" />
          <span>割引クーポン・オファー</span>
        </div>
        {offers.length > 1 && (
          <span style={{ fontSize: '0.78rem', color: '#9a3412', backgroundColor: '#ffedd5', padding: '2px 8px', borderRadius: '9999px', fontWeight: 600 }}>
            複数クーポンの併用OK
          </span>
        )}
      </div>

      {offers.length > 0 ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          {offers.map(offer => {
            const isSelected = selectedOfferIds.includes(offer.id);
            const isUnavailableSubtotal = offer.minSubtotal > 0 && subtotal < offer.minSubtotal;
            const isUsed = offer.used;
            const isDisabled = isUsed || isUnavailableSubtotal;

            return (
              <div
                key={offer.id}
                onClick={() => {
                  if (!isDisabled) toggleOffer(offer.id);
                }}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '10px 14px',
                  borderRadius: '8px',
                  border: isSelected ? '2px solid #059669' : '1px solid #e5dbcd',
                  backgroundColor: isSelected ? '#ecfdf5' : isDisabled ? '#f9fafb' : '#ffffff',
                  cursor: isDisabled ? 'not-allowed' : 'pointer',
                  opacity: isDisabled ? 0.65 : 1,
                  transition: 'all 0.15s ease',
                  userSelect: 'none',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                  <div
                    style={{
                      width: '20px',
                      height: '20px',
                      borderRadius: '4px',
                      border: isSelected ? 'none' : '1px solid #d1d5db',
                      backgroundColor: isSelected ? '#059669' : '#ffffff',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      flexShrink: 0,
                    }}
                  >
                    {isSelected && <Check size={14} color="#ffffff" strokeWidth={3} />}
                  </div>
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                      <span style={{ fontWeight: 600, fontSize: '0.92rem', color: '#1f2937' }}>{offer.titleJa}</span>
                      <span style={{ fontWeight: 700, fontSize: '0.82rem', color: '#b45309', backgroundColor: '#fef3c7', padding: '1px 6px', borderRadius: '4px' }}>
                        {offerLabel(offer)}
                      </span>
                    </div>
                    {offer.minSubtotal > 0 && (
                      <div style={{ fontSize: '0.78rem', color: isUnavailableSubtotal ? '#dc2626' : '#6b7280', marginTop: '2px' }}>
                        {yen(offer.minSubtotal)}以上のご注文で適用{isUnavailableSubtotal && '（小計が条件に達していません）'}
                      </div>
                    )}
                    {isUsed && (
                      <div style={{ fontSize: '0.78rem', color: '#6b7280', marginTop: '2px' }}>
                        ※すでにご利用済みです
                      </div>
                    )}
                  </div>
                </div>
                <div>
                  {isSelected ? (
                    <span style={{ fontSize: '0.78rem', fontWeight: 700, color: '#059669', backgroundColor: '#d1fae5', padding: '3px 8px', borderRadius: '6px' }}>
                      適用中
                    </span>
                  ) : (
                    <span style={{ fontSize: '0.78rem', color: '#6b7280' }}>
                      選択
                    </span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      ) : loaded ? (
        <div style={{ fontSize: '0.85rem', color: '#6b7280', padding: '4px 0' }}>
          現在利用可能なクーポンはありません。
        </div>
      ) : null}

      {/* Stamp card rewards for members */}
      {customer ? (
        rewards.length > 0 ? (
          <label style={{ display: 'flex', flexDirection: 'column', gap: '6px', fontSize: '0.9rem', fontWeight: 'bold', marginTop: '4px' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '6px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <Award size={16} color="var(--spice)" />
                <span>スタンプ特典を使う（獲得済み: {rewards.length}件）</span>
              </div>
              {stampCard && (
                <span style={{ fontSize: '0.78rem', color: '#6b7280', fontWeight: 'normal' }}>
                  スタンプ: {stampCard.stamps}/{stampCard.perCard}個
                </span>
              )}
            </div>
            <select
              value={savings.rewardId}
              onChange={e => onChange({ ...savings, rewardId: e.target.value })}
              style={{ padding: '10px', borderRadius: '8px', border: '1px solid #e5dbcd', fontFamily: 'inherit', fontSize: '0.95rem', backgroundColor: '#ffffff' }}
            >
              <option value="">使わない</option>
              {rewards.map(reward => (
                <option key={reward.id} value={reward.id}>
                  {reward.titleJa}{reward.kind === 'AMOUNT_OFF' ? `（${yen(reward.amount)}引き · 1回限り）` : '（商品お渡し時に適用 · 1回限り）'}
                </option>
              ))}
            </select>
            <span style={{ fontSize: '0.78rem', color: '#6b7280', marginTop: '2px' }}>
              ※ スタンプカードで達成・獲得した特典のみ選択できます（1回限り有効）。
            </span>
          </label>
        ) : (
          loaded && (
            <div style={{ padding: '10px 14px', borderRadius: '8px', backgroundColor: '#fffdf5', border: '1px solid #fed7aa', display: 'flex', flexDirection: 'column', gap: '4px', marginTop: '4px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.88rem', fontWeight: 'bold', color: 'var(--spice)' }}>
                <Award size={16} />
                <span>スタンプ特典を使う（未達成）</span>
              </div>
              <p style={{ margin: 0, fontSize: '0.82rem', color: '#78350f', lineHeight: 1.45 }}>
                {stampCard?.milestones && stampCard.milestones.find(m => m.at > (stampCard?.stamps ?? 0)) ? (
                  (() => {
                    const nextM = stampCard.milestones.find(m => m.at > (stampCard?.stamps ?? 0))!;
                    const remaining = nextM.at - (stampCard?.stamps ?? 0);
                    return (
                      <>
                        スタンプ特典はカード達成後にご利用いただけます。<br />
                        現在のスタンプ：<strong>{stampCard.stamps}/{stampCard.perCard}個</strong>（あと<strong>{remaining}個</strong>で「{nextM.titleJa}」を獲得！）
                      </>
                    );
                  })()
                ) : (
                  <>現在ご利用可能なスタンプ特典はありません。スタンプカードの対象スタンプに達すると自動で特典が付与され、ここで利用できるようになります。</>
                )}
              </p>
            </div>
          )
        )
      ) : (
        loaded && (
          <div style={{ padding: '10px 14px', borderRadius: '8px', backgroundColor: '#f9fafb', border: '1px solid #e5e7eb', display: 'flex', flexDirection: 'column', gap: '4px', marginTop: '4px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.88rem', fontWeight: 'bold', color: '#4b5563' }}>
              <Award size={16} color="#6b7280" />
              <span>スタンプ特典を使う</span>
            </div>
            <p style={{ margin: 0, fontSize: '0.82rem', color: '#6b7280', lineHeight: 1.45 }}>
              会員の方は<Link to={`/login?next=${encodeURIComponent(next)}`} style={{ color: 'var(--spice)', fontWeight: 600, textDecoration: 'underline' }}>ログイン</Link>すると、スタンプカードで達成・獲得した特典をご利用いただけます。
            </p>
          </div>
        )
      )}

      {/* Points usage for members */}
      {pointsEnabled && (
        <div style={{ fontSize: '0.9rem', marginTop: '4px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontWeight: 'bold', marginBottom: '6px' }}>
            <Sparkles size={16} color="var(--gold)" />
            <span>ポイントを使う（保有 {balance.toLocaleString('ja-JP')}pt）</span>
          </div>
          {balance === 0 ? (
            <div style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>ご注文の受け取り後にポイントが貯まります。</div>
          ) : (
            <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
              <input
                type="number"
                min={0}
                max={maxPoints}
                inputMode="numeric"
                aria-label="利用するポイント"
                value={savings.pointsToUse || ''}
                placeholder="0"
                onChange={e => onChange({ ...savings, pointsToUse: Math.max(0, Math.min(maxPoints, Math.floor(Number(e.target.value) || 0))) })}
                style={{ width: '120px', padding: '10px', borderRadius: '8px', border: '1px solid #e5dbcd', fontSize: '1rem', backgroundColor: '#ffffff' }}
              />
              <span style={{ fontSize: '0.9rem' }}>pt （1pt = 1円）</span>
              {maxPoints > 0 && (
                <button
                  type="button"
                  onClick={() => onChange({ ...savings, pointsToUse: maxPoints })}
                  style={{
                    padding: '6px 12px',
                    borderRadius: '6px',
                    border: '1px solid var(--spice)',
                    backgroundColor: '#fff',
                    color: 'var(--spice)',
                    fontSize: '0.82rem',
                    fontWeight: 600,
                    cursor: 'pointer',
                  }}
                >
                  全額利用
                </button>
              )}
            </div>
          )}
        </div>
      )}

      {/* Guest encouragement banner */}
      {!customer && (
        <div style={{ borderTop: '1px dashed #fed7aa', paddingTop: '10px', marginTop: '4px', fontSize: '0.85rem', lineHeight: 1.6, color: '#7c2d12' }}>
          <div style={{ fontWeight: 600 }}>💡 会員登録（無料）でさらにお得！</div>
          <div style={{ color: '#4b5563', fontSize: '0.82rem' }}>
            ログインするとご注文金額に応じたポイント還元や来店スタンプカードの特典も貯まります。
          </div>
          <div style={{ display: 'flex', gap: '14px', marginTop: '6px' }}>
            <Link to={`/account/login?next=${encodeURIComponent(next)}`} style={{ color: 'var(--spice)', fontWeight: 'bold' }}>ログイン</Link>
            <Link to={`/account/register?next=${encodeURIComponent(next)}`} style={{ color: 'var(--spice)', fontWeight: 'bold' }}>無料で会員登録</Link>
          </div>
        </div>
      )}
    </div>
  );
}
