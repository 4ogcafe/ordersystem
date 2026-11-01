import { Sparkles, Dices } from 'lucide-react';
import type { Loyalty } from '../../lib/customer-context';
import { formatDate, formatDateTime, formatOrderNumber, yen } from '../../lib/format';
import { headingStyle, mutedStyle } from './styles';
import type { PointEntry } from './types';

const TYPE_LABEL: Record<PointEntry['type'], string> = {
  EARN: 'ご注文で獲得',
  REDEEM: 'お支払いに利用',
  REFUND: 'キャンセルによる返還',
  BONUS: 'ボーナス',
  ADJUST: '店舗による調整',
};

const isGameEntry = (entry: PointEntry) =>
  entry.type === 'BONUS' && Boolean(entry.note && (entry.note.includes('ミニゲーム') || entry.note.includes('ルーレット') || entry.note.includes('スクラッチ') || entry.note.includes('スロット')));

function PointsCard({ balance, loyalty, gamePointsWon = 0, compact = false }: { balance: number; loyalty: Loyalty | null; gamePointsWon?: number; compact?: boolean }) {
  const value = balance * (loyalty?.pointValueYen ?? 1);
  return (
    <div style={{ borderRadius: '24px', padding: compact ? '18px 20px' : 'clamp(18px, 5vw, 28px)', color: 'white', background: 'radial-gradient(circle at 85% 15%, rgba(242,168,59,0.55), transparent 45%), linear-gradient(135deg, #c4521f 0%, #8a3313 60%, #5e220c 100%)' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '8px' }}>
        <div style={{ fontSize: '0.85rem', opacity: 0.9, letterSpacing: '1px' }}>ADARSHA POINTS</div>
        {gamePointsWon > 0 && (
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: '5px', backgroundColor: 'rgba(255, 255, 255, 0.2)', padding: '3px 10px', borderRadius: '9999px', fontSize: '0.78rem', fontWeight: 600 }}>
            <Sparkles size={13} color="#fef08a" />
            <span>ゲーム獲得累計: <strong>{gamePointsWon}pt</strong></span>
          </div>
        )}
      </div>
      <div style={{ fontSize: compact ? '2.2rem' : 'clamp(2.2rem, 8vw, 2.8rem)', fontWeight: 'bold', fontFamily: 'var(--font-display)', lineHeight: 1.2, margin: '6px 0 2px' }}>
        {balance.toLocaleString('ja-JP')}<span style={{ fontSize: '1rem', marginLeft: '4px' }}>pt</span>
      </div>
      <div style={{ fontSize: '0.9rem', opacity: 0.95 }}>{yen(value)}分としてご利用いただけます</div>
    </div>
  );
}

export default function PointsPanel({ balance, history, loyalty }: { balance: number; history: PointEntry[]; loyalty: Loyalty | null }) {
  const gamePointsWon = history.filter(isGameEntry).reduce((sum, e) => sum + (e.points > 0 ? e.points : 0), 0);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      <PointsCard balance={balance} loyalty={loyalty} gamePointsWon={gamePointsWon} />

      {loyalty?.enabled ? (
        <section className="acc-card" aria-labelledby="how-heading">
          <h2 id="how-heading" style={headingStyle}>ポイントのしくみ</h2>
          <ul style={{ margin: 0, paddingLeft: '1.2em', lineHeight: 1.9 }}>
            <li>毎日1回無料の「ミニゲーム（ルーレット・スクラッチ・スロット）」で遊ぶと、最大100pt以上のボーナスポイントが即時アダルサポイントに加算されます！</li>
            <li>お支払い金額¥100ごとに{loyalty.pointsPer100Yen}ptが貯まります（商品のお受け取り時に加算）。</li>
            <li>1pt = {yen(loyalty.pointValueYen)}として、次回のご注文時にお使いいただけます。</li>
            <li>ご注文をキャンセルした場合、利用したポイントはお戻しします。</li>
          </ul>
        </section>
      ) : (
        <p className="acc-card" style={{ margin: 0 }}>現在ポイントプログラムは休止中です。貯まっているポイントは保持されます。</p>
      )}

      <section className="acc-card" aria-labelledby="history-heading">
        <h2 id="history-heading" style={headingStyle}>ポイント履歴</h2>
        {history.length === 0 ? (
          <p style={{ ...mutedStyle, margin: 0 }}>まだポイントの履歴はありません。</p>
        ) : (
          <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
            {history.map(entry => {
              const isGame = isGameEntry(entry);
              return (
                <li key={entry.id} style={{ display: 'flex', justifyContent: 'space-between', gap: '12px', padding: '14px 0', borderBottom: '1px solid #f0ebe3' }}>
                  <div style={{ minWidth: 0, flex: 1 }}>
                    {isGame ? (
                      <div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap', marginBottom: '3px' }}>
                          <span style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '4px',
                            backgroundColor: '#fef3c7',
                            color: '#b45309',
                            padding: '2px 8px',
                            borderRadius: '6px',
                            fontSize: '0.75rem',
                            fontWeight: 700,
                            border: '1px solid #fde68a',
                          }}>
                            <Dices size={13} />
                            ミニゲーム当選
                          </span>
                          <span style={{ fontWeight: 'bold', color: 'var(--dark-bark)', fontSize: '0.95rem' }}>
                            {entry.note ? entry.note.replace(/^ミニゲーム当選:\s*/, '') : 'ミニゲームボーナス'}
                          </span>
                        </div>
                        <div style={{ fontSize: '0.8rem', color: '#6b7280' }}>
                          {formatDateTime(entry.createdAt)} ・ アダルサポイント即時加算
                        </div>
                      </div>
                    ) : (
                      <div>
                        <div style={{ fontWeight: 'bold', color: 'var(--dark-bark)' }}>
                          {TYPE_LABEL[entry.type]}{entry.orderNumber ? `（受付番号 ${formatOrderNumber(entry.orderNumber)}）` : ''}
                        </div>
                        <div style={mutedStyle}>
                          {formatDate(entry.createdAt)}{entry.note && entry.type !== 'EARN' ? ` ・ ${entry.note}` : ''}
                        </div>
                      </div>
                    )}
                  </div>
                  <div style={{ textAlign: 'right', whiteSpace: 'nowrap', flexShrink: 0 }}>
                    <div style={{
                      fontWeight: 800,
                      fontSize: '1.05rem',
                      color: entry.points > 0 ? '#047857' : '#b91c1c',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'flex-end',
                      gap: '4px',
                    }}>
                      {isGame && <Sparkles size={14} color="#d97706" />}
                      <span>{entry.points > 0 ? '+' : ''}{entry.points}pt</span>
                    </div>
                    <div style={mutedStyle}>残高 {entry.balanceAfter}pt</div>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}

