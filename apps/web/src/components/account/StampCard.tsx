import { useEffect, useState } from 'react';
import { QrCode } from 'lucide-react';
import { apiFetch } from '../../lib/api';
import { formatDateTime, yen } from '../../lib/format';
import { stampChime } from '../../lib/push';
import MemberQrModal from './MemberQrModal';
import type { StampCardData } from './types';

const MAX_PER_ROW = 5;
const SEEN_KEY = 'adarsha_stamps_seen';

/** Rows of at most five, as even as possible (10 → 5+5, 8 → 4+4, 7 → 4+3). */
const columnsFor = (perCard: number) => Math.ceil(perCard / Math.ceil(perCard / MAX_PER_ROW));

const readSeen = () => {
  try {
    return Number(localStorage.getItem(SEEN_KEY) ?? localStorage.getItem('kalpana_stamps_seen')) || 0;
  } catch {
    return 0;
  }
};

/** The member's stamp card, drawn like the paper one: stamps joined by a line, rewards under their stamp. */
export default function StampCard({ card, memberName, preview = false, onCardUpdate }: {
  card: StampCardData;
  memberName: string;
  /** The admin's settings preview: no QR button, nothing remembered. */
  preview?: boolean;
  onCardUpdate?: (newCard: StampCardData) => void;
}) {
  const [showQr, setShowQr] = useState(false);
  const [lastStampedPosition, setLastStampedPosition] = useState<number | null>(null);

  // The newest stamp is "pressed" with an animation the first time the member sees it.
  const [seenTotal] = useState(readSeen);
  const animateLatest = !preview && card.totalStamps > seenTotal && card.stamps > 0;

  useEffect(() => {
    if (preview) return;
    try {
      localStorage.setItem(SEEN_KEY, String(card.totalStamps));
    } catch {
      // Storage may be blocked; the animation just plays again next time.
    }
  }, [card.totalStamps, preview]);

  // Real-time SSE background listener on the stamp card
  useEffect(() => {
    if (preview) return;
    let cancelled = false;
    let sse: EventSource | null = null;

    try {
      sse = new EventSource('/api/v1/customers/me/stamps/live');
      sse.onmessage = (event) => {
        if (cancelled) return;
        try {
          const data = JSON.parse(event.data);
          if (data.type === 'STAMP_AWARDED') {
            if (data.card) {
              setLastStampedPosition(data.card.stamps);
              stampChime();
              onCardUpdate?.(data.card);
            } else {
              apiFetch('/api/v1/customers/me/stamps')
                .then(res => res.ok ? res.json() : null)
                .then(newCard => {
                  if (newCard && !cancelled) {
                    setLastStampedPosition(newCard.stamps);
                    stampChime();
                    onCardUpdate?.(newCard);
                  }
                })
                .catch(() => undefined);
            }
          }
        } catch {
          // ignore error
        }
      };
    } catch {
      // ignore
    }

    return () => {
      cancelled = true;
      if (sse) sse.close();
    };
  }, [preview, onCardUpdate]);

  const columns = columnsFor(card.perCard);
  const nextMilestone = card.milestones.find(milestone => milestone.at > card.stamps);
  const stampDates = new Map(card.history.filter(entry => entry.card === card.completedCards + 1).map(entry => [entry.position, entry.createdAt]));

  return (
    <section className="stamp-card" aria-labelledby="stamp-card-title">
      <div className="stamp-card-head">
        <div>
          <div className="stamp-card-kicker">STAMP CARD</div>
          <h2 id="stamp-card-title">スタンプカード</h2>
        </div>
        <div className="stamp-card-count" aria-label={`${card.perCard}個中${card.stamps}個`}>
          <strong>{card.stamps}</strong>/{card.perCard}
        </div>
      </div>

      {card.completedCards > 0 && card.stamps === 0 && (
        <p className="stamp-card-banner">
          🎉 <strong>{card.completedCards}枚目のカードがゴール達成（満了）しました！</strong>
          <span style={{ display: 'block', fontSize: '0.82rem', marginTop: '4px', opacity: 0.95 }}>
            カードは自動リセットされ、{card.completedCards + 1}枚目がスタートしました。獲得した特典は各1回のみご利用いただけます。
          </span>
        </p>
      )}

      <ol className="stamp-grid" style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }}>
        {Array.from({ length: card.perCard }, (_, index) => {
          const position = index + 1;
          const stamped = position <= card.stamps;
          const milestone = card.milestones.find(m => m.at === position);
          const isGoal = position === card.perCard;
          const rowEnd = position % columns === 0 || position === card.perCard;
          const date = stampDates.get(position);
          const isNewlyStamped = stamped && (animateLatest || lastStampedPosition === position);

          return (
            <li key={position} className={`stamp-cell${rowEnd ? ' is-row-end' : ''}`}>
              <span className="stamp-slot-wrap">
                <span
                  role="img"
                  className={`stamp-slot${stamped ? ' is-stamped' : ''}${isNewlyStamped ? ' is-new' : ''}${milestone ? ' is-milestone' : ''}${isGoal ? ' is-goal' : ''}`}
                  aria-label={`${position}個目${isGoal ? '（ゴール）' : ''}${stamped ? '：押印済み' : ''}`}
                >
                  {stamped ? <StampMark date={date} /> : <img src="/adarsha-log.webp" alt="" className="stamp-ghost" style={{ borderRadius: '50%' }} />}
                  {!stamped && isGoal && <span className="stamp-gift" aria-hidden="true" title="ゴール">🏁</span>}
                  {!stamped && !isGoal && milestone && <span className="stamp-gift" aria-hidden="true">🎁</span>}
                </span>
              </span>
              {position === 1 && !milestone && <span className="stamp-start">スタート!</span>}
              {isGoal && <span className="stamp-goal-badge">🏁 ゴール!</span>}
              {milestone && <span className="stamp-reward-label">{milestone.titleJa}</span>}
              {milestone && (
                <span
                  className="stamp-reward-tag"
                  aria-hidden="true"
                  style={isGoal ? { background: '#d97706' } : undefined}
                >
                  {isGoal ? '🏁 ゴール特典' : `特典${card.milestones.indexOf(milestone) + 1}`}
                </span>
              )}
            </li>
          );
        })}
      </ol>

      {card.milestones.length > 0 && (
        <ul className="stamp-legend">
          {card.milestones.map((milestone, index) => {
            const isGoal = milestone.at === card.perCard;
            return (
              <li key={milestone.at} className={milestone.at <= card.stamps ? 'is-reached' : undefined}>
                <span className="stamp-reward-tag" style={isGoal ? { background: '#d97706' } : undefined}>
                  {isGoal ? '🏁 ゴール特典' : `特典${index + 1}`}
                </span>
                <span>
                  {milestone.at}個目{isGoal ? '（ゴール）' : ''}：{milestone.titleJa}
                  <span style={{ fontSize: '0.72rem', color: '#b45309', marginLeft: '6px', fontWeight: 600 }}>
                    （1回限り有効）
                  </span>
                </span>
              </li>
            );
          })}
        </ul>
      )}

      <div className="stamp-card-foot">
        <div className="stamp-card-rules">
          {nextMilestone ? (
            <strong>
              あと{nextMilestone.at - card.stamps}個で{nextMilestone.at === card.perCard ? 'ゴール！' : ''}「{nextMilestone.titleJa}」
            </strong>
          ) : (
            <strong>
              あと{card.perCard - card.stamps}個でゴール！（カード満了・次回自動リセット）
            </strong>
          )}
          <span>
            {yen(card.rules.minAmount)}以上（税込）のご注文・ご来店ごとに1個
            {card.rules.cooldownHours > 0 && `（${card.rules.cooldownHours}時間に1回まで）`}
          </span>
          {card.nextStampAt && <span>次のスタンプは {formatDateTime(card.nextStampAt)} 以降に押せます</span>}
        </div>
        {!preview && (
          <button type="button" className="stamp-qr-btn" onClick={() => setShowQr(true)}>
            <QrCode size={18} aria-hidden="true" />店頭で提示
          </button>
        )}
      </div>

      {showQr && (
        <MemberQrModal
          code={card.memberCode}
          name={memberName}
          currentCard={card}
          onStampAwarded={(newCard) => {
            setLastStampedPosition(newCard.stamps);
            onCardUpdate?.(newCard);
          }}
          onClose={() => setShowQr(false)}
        />
      )}
    </section>
  );
}

/** A red "アダルサ" seal, like the rubber stamp at the counter. */
function StampMark({ date }: { date?: string }) {
  const label = date ? new Date(date).toLocaleDateString('ja-JP', { month: 'numeric', day: 'numeric', timeZone: 'Asia/Tokyo' }) : '';
  return (
    <svg viewBox="0 0 100 100" className="stamp-mark" aria-hidden="true">
      <circle cx="50" cy="50" r="44" fill="#fffdf6" stroke="currentColor" strokeWidth="7" />
      <circle cx="50" cy="50" r="35" fill="none" stroke="currentColor" strokeWidth="2" />
      <text x="50" y={label ? 52 : 58} textAnchor="middle" fontSize="19" fontWeight="900" fill="currentColor" letterSpacing="-1">アダルサ</text>
      {label && <text x="50" y="72" textAnchor="middle" fontSize="12" fontWeight="700" fill="currentColor">{label}</text>}
    </svg>
  );
}
