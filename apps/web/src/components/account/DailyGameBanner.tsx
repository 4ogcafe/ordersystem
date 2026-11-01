import { useEffect, useState, type CSSProperties } from 'react';
import { Sparkles, ArrowRight, CheckCircle2, Clock } from 'lucide-react';
import { apiFetch } from '../../lib/api';
import MiniGameModal, { type GameStatusResponse } from './MiniGameModal';

interface DailyGameBannerProps {
  onRewardClaimed?: () => void;
  compact?: boolean;
}

export default function DailyGameBanner({ onRewardClaimed, compact = false }: DailyGameBannerProps) {
  const [status, setStatus] = useState<GameStatusResponse | null>(null);
  const [modalOpen, setModalOpen] = useState(false);

  const fetchStatus = async () => {
    try {
      const res = await apiFetch('/api/v1/game/status');
      if (res.ok) {
        const data = await res.json();
        setStatus(data);
      }
    } catch {
      // ignore
    }
  };

  useEffect(() => {
    fetchStatus();
  }, []);

  if (!status || !status.enabled) {
    return null;
  }

  const { canPlay, nextPlayAt, spendStatus } = status;
  const config = status.config ?? {
    enabled: status.enabled,
    mode: (status as any).mode ?? 'LUCKY_WHEEL',
    titleJa: (status as any).titleJa ?? '毎日チャレンジ！ミニゲーム',
    subtitleJa: (status as any).subtitleJa ?? 'ゲームに挑戦して、お得なポイントや割引クーポンをGETしよう！',
    prizes: (status as any).prizes ?? [],
  };
  const gameMode = config?.mode ?? 'LUCKY_WHEEL';
  const gameIcon = gameMode === 'LUCKY_WHEEL' ? '🎯' : gameMode === 'SCRATCH_CARD' ? '🎫' : '🎰';
  const isSpendRequired = spendStatus?.requireOrderSpend ?? false;
  const availablePlays = spendStatus?.availablePlays ?? (canPlay ? 1 : 0);

  const handleClaim = () => {
    fetchStatus();
    onRewardClaimed?.();
  };

  return (
    <>
      <div
        onClick={() => setModalOpen(true)}
        className={`daily-game-banner ${compact ? 'is-compact' : ''}`}
        role="button"
        tabIndex={0}
        onKeyDown={e => e.key === 'Enter' && setModalOpen(true)}
      >
        {/* Glow ambient background effect */}
        <div style={glowLayerStyle} />

        <div className="daily-game-banner-body">
          {/* Game Visual Icon Badge */}
          <div className="daily-game-banner-icon">
            <span style={{ fontSize: compact ? '1.8rem' : '2.2rem', lineHeight: 1 }}>{gameIcon}</span>
          </div>

          <div style={{ minWidth: 0, flex: 1 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px', flexWrap: 'wrap' }}>
              {isSpendRequired ? (
                availablePlays > 0 ? (
                  <span style={{
                    fontSize: '0.75rem',
                    fontWeight: 800,
                    letterSpacing: '0.5px',
                    padding: '2px 10px',
                    borderRadius: '9999px',
                    backgroundColor: '#10b981',
                    color: '#ffffff',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '4px',
                  }}>
                    <Sparkles size={12} /> 4,999円サイクル達成！挑戦可能（残り {availablePlays} 回）
                  </span>
                ) : (
                  <>
                    <span style={{
                      fontSize: '0.75rem',
                      fontWeight: 800,
                      letterSpacing: '0.5px',
                      padding: '2px 8px',
                      borderRadius: '9999px',
                      backgroundColor: 'rgba(251, 191, 36, 0.2)',
                      color: '#fbbf24',
                      border: '1px solid rgba(251, 191, 36, 0.4)',
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '4px',
                    }}>
                      🔒 4,999円購入サイクルで解放
                    </span>
                    <span style={{ fontSize: '0.75rem', color: '#fef08a', display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                      あと ¥{(spendStatus?.remainingToNextPlay ?? 4999).toLocaleString()} のご注文
                    </span>
                  </>
                )
              ) : (
                <span style={{
                  fontSize: '0.75rem',
                  fontWeight: 800,
                  letterSpacing: '0.5px',
                  padding: '2px 8px',
                  borderRadius: '9999px',
                  backgroundColor: canPlay ? '#fbbf24' : 'rgba(255,255,255,0.2)',
                  color: canPlay ? '#111827' : '#e5e7eb',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '4px',
                }}>
                  {canPlay ? (
                    <>
                      <Sparkles size={12} /> 本日無料・挑戦可能！
                    </>
                  ) : (
                    <>
                      <CheckCircle2 size={12} /> 本日プレイ済み
                    </>
                  )}
                </span>
              )}

              {!canPlay && nextPlayAt && !isSpendRequired && (
                <span style={{ fontSize: '0.75rem', color: '#fef08a', display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                  <Clock size={12} /> 次回: {new Date(nextPlayAt).toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' })}〜
                </span>
              )}
            </div>

            <h3 style={{ margin: 0, fontSize: compact ? '1.05rem' : '1.25rem', fontWeight: 800, color: '#fff' }}>
              {config.titleJa}
            </h3>

            {/* Spend progress bar if spend-gated and plays === 0 */}
            {isSpendRequired && availablePlays === 0 && spendStatus && (
              <div style={{ marginTop: '8px', maxWidth: '360px', width: '100%' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.73rem', color: '#fef08a', marginBottom: '3px' }}>
                  <span>進捗: ¥{spendStatus.currentCycleSpent.toLocaleString()} / ¥{spendStatus.cycleSpendAmount.toLocaleString()}</span>
                  <span style={{ fontWeight: 800 }}>{spendStatus.progressPercent}%</span>
                </div>
                <div style={{ width: '100%', height: '6px', backgroundColor: 'rgba(255,255,255,0.2)', borderRadius: '9999px', overflow: 'hidden' }}>
                  <div style={{
                    width: `${spendStatus.progressPercent}%`,
                    height: '100%',
                    background: 'linear-gradient(90deg, #f59e0b, #fbbf24)',
                    borderRadius: '9999px',
                    transition: 'width 0.4s ease',
                  }} />
                </div>
              </div>
            )}

            <p style={{ margin: '4px 0 0', fontSize: '0.82rem', color: '#fde68a', opacity: 0.95, lineHeight: 1.45 }}>
              {isSpendRequired
                ? availablePlays > 0
                  ? `おめでとうございます！運試しゲームに挑戦して、お得なポイントや割引クーポンをGETしよう！`
                  : `4,999円のお買い物ごとに1回挑戦可能！当たったポイントやクーポンは次回のお会計で使えます`
                : (config.subtitleJa || 'ゲームに挑戦して、お得なポイントや割引クーポンをGET！')}
            </p>
          </div>
        </div>

        {/* Action Button */}
        <div className="daily-game-banner-action">
          <button
            type="button"
            className="daily-game-play-btn"
            onClick={e => {
              e.stopPropagation();
              setModalOpen(true);
            }}
            style={{
              backgroundColor: canPlay ? '#fbbf24' : 'rgba(255, 255, 255, 0.15)',
              color: canPlay ? '#111827' : '#ffffff',
            }}
          >
            {canPlay ? (availablePlays > 1 ? `プレイ！(残${availablePlays}回)` : '今すぐプレイ！') : 'ゲームと景品を見る'}
            <ArrowRight size={16} />
          </button>
        </div>
      </div>

      {modalOpen && (
        <MiniGameModal
          isOpen={modalOpen}
          onClose={() => setModalOpen(false)}
          onRewardClaimed={handleClaim}
        />
      )}
    </>
  );
}

const glowLayerStyle: CSSProperties = {
  position: 'absolute',
  inset: 0,
  background: 'radial-gradient(circle at 15% 50%, rgba(251, 191, 36, 0.2), transparent 45%), radial-gradient(circle at 85% 50%, rgba(236, 72, 153, 0.15), transparent 45%)',
  pointerEvents: 'none',
};
