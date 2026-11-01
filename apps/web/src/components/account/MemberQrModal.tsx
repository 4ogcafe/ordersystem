import { useEffect, useMemo, useRef, useState } from 'react';
import { X, CheckCircle2, Sparkles, ArrowRight } from 'lucide-react';
import qrcode from 'qrcode-generator';
import { apiFetch } from '../../lib/api';
import { formatMemberCode } from '../../lib/format';
import { stampChime } from '../../lib/push';
import type { StampCardData } from './types';

// The standard 4-module white border; less makes some phone cameras miss the code.
const QUIET_ZONE = 4;
const POLL_INTERVAL_MS = 2000;

interface AwardedInfo {
  position: number;
  perCard: number;
  cardCompleted: boolean;
  rewards: { titleJa: string }[];
}

/** The member's code as a QR for staff to scan at the counter, with real-time dynamic detection. */
export default function MemberQrModal({
  code,
  name,
  currentCard,
  onStampAwarded,
  onClose,
}: {
  code: string;
  name: string;
  currentCard?: StampCardData | null;
  onStampAwarded?: (newCard: StampCardData) => void;
  onClose: () => void;
}) {
  const closeRef = useRef<HTMLButtonElement>(null);
  const [awardedInfo, setAwardedInfo] = useState<AwardedInfo | null>(null);
  const initialTotalStamps = useRef(currentCard?.totalStamps ?? 0);

  const path = useMemo(() => {
    const qr = qrcode(0, 'M');
    qr.addData(`ADARSHA:${code}`);
    qr.make();
    const size = qr.getModuleCount();
    let d = '';
    for (let row = 0; row < size; row += 1) {
      for (let col = 0; col < size; col += 1) {
        if (qr.isDark(row, col)) d += `M${col + QUIET_ZONE},${row + QUIET_ZONE}h1v1h-1z`;
      }
    }
    return { d, size: size + QUIET_ZONE * 2 };
  }, [code]);

  useEffect(() => {
    closeRef.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', onKey);
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = overflow;
    };
  }, [onClose]);

  // Handle a new stamp arrival
  const handleStampReceived = (card: StampCardData, info?: Partial<AwardedInfo>) => {
    if (awardedInfo) return; // already celebrating
    stampChime();
    setAwardedInfo({
      position: card.stamps,
      perCard: card.perCard,
      cardCompleted: card.stamps === 0 && card.completedCards > (currentCard?.completedCards ?? 0),
      rewards: info?.rewards ?? [],
    });
    onStampAwarded?.(card);
  };

  // Real-time listener: SSE + fallback short-polling while QR is open
  useEffect(() => {
    let cancelled = false;
    let sse: EventSource | null = null;

    // 1. SSE Connection
    try {
      sse = new EventSource('/api/v1/customers/me/stamps/live');
      sse.onmessage = (event) => {
        if (cancelled) return;
        try {
          const data = JSON.parse(event.data);
          if (data.type === 'STAMP_AWARDED') {
            if (data.card) {
              handleStampReceived(data.card, data.event);
            } else {
              // Fetch latest card if card was not included in event
              apiFetch('/api/v1/customers/me/stamps')
                .then(res => res.ok ? res.json() : null)
                .then(card => {
                  if (card && !cancelled) handleStampReceived(card, data.event);
                })
                .catch(() => undefined);
            }
          }
        } catch {
          // ignore parse error
        }
      };
    } catch {
      // SSE not supported
    }

    // 2. Short-polling fallback every 2s
    const pollTimer = setInterval(async () => {
      if (cancelled || awardedInfo) return;
      try {
        const res = await apiFetch('/api/v1/customers/me/stamps');
        if (!res.ok || cancelled) return;
        const card: StampCardData = await res.json();
        if (card.totalStamps > initialTotalStamps.current) {
          handleStampReceived(card);
        }
      } catch {
        // network glitch
      }
    }, POLL_INTERVAL_MS);

    return () => {
      cancelled = true;
      clearInterval(pollTimer);
      if (sse) sse.close();
    };
  }, [awardedInfo]);

  return (
    <div className="qr-overlay" onClick={onClose}>
      <div className="qr-sheet" role="dialog" aria-modal="true" aria-labelledby="qr-title" onClick={e => e.stopPropagation()}>
        <button ref={closeRef} type="button" className="qr-close" onClick={onClose} aria-label="閉じる">
          <X size={20} />
        </button>

        {awardedInfo ? (
          /* Celebration View when stamp is stamped at the counter */
          <div style={{ textAlign: 'center', padding: '10px 0 16px', animation: 'fadeIn 0.3s ease' }}>
            <div style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: '70px', height: '70px', borderRadius: '50%', backgroundColor: '#ecfdf5', color: '#059669', marginBottom: '14px' }}>
              <CheckCircle2 size={42} strokeWidth={2.5} />
            </div>

            <h2 id="qr-title" style={{ fontSize: '1.4rem', fontWeight: 800, color: 'var(--dark-bark)', margin: '0 0 6px' }}>
              スタンプを獲得しました！
            </h2>
            <p style={{ margin: '0 0 16px', color: '#6b7280', fontSize: '0.92rem' }}>
              店頭でスタッフがスタンプを押しました。
            </p>

            <div style={{ display: 'inline-flex', flexDirection: 'column', alignItems: 'center', gap: '8px', backgroundColor: '#fffdf6', border: '2px solid #e7c695', borderRadius: '14px', padding: '16px 28px', margin: '0 auto 16px' }}>
              <div style={{ width: '64px', height: '64px' }}>
                <svg viewBox="0 0 100 100" className="stamp-mark" aria-hidden="true" style={{ width: '100%', height: '100%', animation: 'stamp-press 0.6s cubic-bezier(0.2, 1.4, 0.4, 1) both' }}>
                  <circle cx="50" cy="50" r="44" fill="#fffdf6" stroke="#b91c1c" strokeWidth="7" />
                  <circle cx="50" cy="50" r="35" fill="none" stroke="#b91c1c" strokeWidth="2" />
                  <text x="50" y={52} textAnchor="middle" fontSize="19" fontWeight="900" fill="#b91c1c" letterSpacing="-1">アダルサ</text>
                  <text x="50" y={72} textAnchor="middle" fontSize="12" fontWeight="700" fill="#b91c1c">STAMP</text>
                </svg>
              </div>
              <div style={{ fontSize: '1.15rem', fontWeight: 800, color: 'var(--dark-bark)' }}>
                {awardedInfo.cardCompleted ? (
                  <span style={{ color: '#059669' }}>カード満了達成！🎉</span>
                ) : (
                  <span>{awardedInfo.position} / {awardedInfo.perCard} 個達成</span>
                )}
              </div>
            </div>

            {awardedInfo.rewards && awardedInfo.rewards.length > 0 && (
              <div style={{ backgroundColor: '#fef3c7', border: '1px solid #fde68a', borderRadius: '10px', padding: '10px 14px', margin: '0 auto 16px', maxWidth: '320px', fontSize: '0.88rem', color: '#92400e', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '8px', justifyContent: 'center' }}>
                <Sparkles size={18} color="#d97706" />
                <span>特典獲得：{awardedInfo.rewards.map(r => r.titleJa).join('、')}</span>
              </div>
            )}

            <button
              type="button"
              onClick={onClose}
              className="order-btn order-btn-solid order-btn-lg"
              style={{ width: '100%', marginTop: '6px' }}
            >
              スタンプカードを見る <ArrowRight size={18} />
            </button>
          </div>
        ) : (
          /* Normal QR View */
          <>
            <h2 id="qr-title">会員証</h2>
            <p className="qr-name">{name} 様</p>
            <svg viewBox={`0 0 ${path.size} ${path.size}`} className="qr-code" role="img" aria-label={`会員コード ${formatMemberCode(code)} のQRコード`} shapeRendering="crispEdges">
              <rect width={path.size} height={path.size} fill="#fff" />
              <path d={path.d} fill="#1a1a1a" />
            </svg>
            <p className="qr-code-text">{formatMemberCode(code)}</p>

            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', fontSize: '0.85rem', color: '#047857', fontWeight: 600, backgroundColor: '#ecfdf5', padding: '6px 12px', borderRadius: '20px', margin: '8px auto 10px', maxWidth: 'fit-content' }}>
              <span style={{ width: '8px', height: '8px', borderRadius: '50%', backgroundColor: '#10b981', display: 'inline-block', boxShadow: '0 0 0 2px rgba(16, 185, 129, 0.3)' }} />
              スキャン待機中（自動でスタンプが反映されます）
            </div>

            <p className="qr-hint">お会計の際にスタッフへこの画面をご提示ください。スキャンされると自動でスタンプが押されます。</p>
          </>
        )}
      </div>
    </div>
  );
}
