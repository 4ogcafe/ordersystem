import { Gift, Stamp } from 'lucide-react';
import { formatDate, formatDateTime, yen } from '../../lib/format';
import type { StampCardData } from './types';
import { mutedStyle } from './styles';

/** Rewards earned from the stamp card, and where each stamp came from. */
export default function StampRewards({ card }: { card: StampCardData }) {
  return (
    <div className="acc-grid-2" style={{ alignItems: 'start' }}>
      <section className="acc-card" aria-labelledby="stamp-rewards-heading">
        <div className="acc-section-head"><h2 id="stamp-rewards-heading"><Gift size={18} aria-hidden="true" style={{ verticalAlign: '-3px', color: 'var(--acc-accent)' }} /> スタンプ特典</h2></div>
        {card.rewards.length === 0 ? (
          <p style={{ ...mutedStyle, margin: 0 }}>
            {card.milestones.length > 0 ? `スタンプ${card.milestones[0].at}個で最初の特典がもらえます。` : '現在、特典はありません。'}
          </p>
        ) : (
          <ul className="stamp-reward-list">
            {card.rewards.map(reward => (
              <li key={reward.id} className="stamp-ticket">
                <span className="stamp-ticket-value">{reward.kind === 'AMOUNT_OFF' ? yen(reward.amount) : '🎁'}<small>{reward.kind === 'AMOUNT_OFF' ? 'OFF' : 'GIFT'}</small></span>
                <span style={{ minWidth: 0 }}>
                  <strong style={{ display: 'block' }}>{reward.titleJa}</strong>
                  <span style={mutedStyle}>
                    {reward.kind === 'AMOUNT_OFF' ? 'オンライン注文時に選択、または店頭で会員証をご提示ください。' : 'ご注文時に選択、または店頭で会員証をご提示ください。'}
                    {reward.expiresAt && <><br />有効期限：{formatDate(reward.expiresAt)}まで</>}
                  </span>
                </span>
              </li>
            ))}
          </ul>
        )}
        {card.pastRewards.length > 0 && (
          <details style={{ marginTop: '14px' }}>
            <summary className="acc-link" style={{ cursor: 'pointer' }}>使用済み・期限切れ（{card.pastRewards.length}）</summary>
            <ul style={{ listStyle: 'none', padding: 0, margin: '10px 0 0', display: 'grid', gap: '6px', ...mutedStyle }}>
              {card.pastRewards.map(reward => (
                <li key={reward.id}>{reward.titleJa} ・ {reward.status === 'USED' ? `${reward.usedAt ? formatDate(reward.usedAt) : ''} 使用済み` : '期限切れ'}</li>
              ))}
            </ul>
          </details>
        )}
      </section>

      <section className="acc-card" aria-labelledby="stamp-history-heading">
        <div className="acc-section-head">
          <h2 id="stamp-history-heading"><Stamp size={18} aria-hidden="true" style={{ verticalAlign: '-3px', color: 'var(--acc-accent)' }} /> スタンプ履歴</h2>
          <span style={mutedStyle}>累計 {card.totalStamps}個</span>
        </div>
        {card.history.length === 0 ? (
          <p style={{ ...mutedStyle, margin: 0 }}>{yen(card.rules.minAmount)}以上のご注文が受け取り完了になると、スタンプが押されます。</p>
        ) : (
          <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
            {card.history.slice(0, 10).map((entry, index) => (
              <li key={entry.id} style={{ display: 'flex', justifyContent: 'space-between', gap: '12px', padding: '10px 0', borderTop: index ? '1px solid var(--acc-border)' : 'none', fontSize: '0.9rem' }}>
                <span>
                  <strong>{entry.card}枚目 {entry.position}個目</strong>
                  <span style={{ ...mutedStyle, display: 'block' }}>{entry.source === 'ORDER' ? `オンライン注文${entry.orderNumber ? ` #${entry.orderNumber}` : ''}` : '店頭でのご利用'} ・ {yen(entry.amount)}</span>
                </span>
                <span style={{ ...mutedStyle, whiteSpace: 'nowrap' }}>{formatDateTime(entry.createdAt)}</span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
