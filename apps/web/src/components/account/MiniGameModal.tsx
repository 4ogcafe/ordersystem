import { useEffect, useRef, useState, useCallback, type CSSProperties } from 'react';
import { X, Sparkles, RefreshCw, AlertCircle, ArrowRight, Check, Coins } from 'lucide-react';
import { apiFetch, errorMessage } from '../../lib/api';

export type GameMode = 'LUCKY_WHEEL' | 'SCRATCH_CARD' | 'SLOT_MACHINE';
export type PrizeType = 'POINTS' | 'DISCOUNT_COUPON' | 'PERK' | 'NO_PRIZE';

export interface GamePrize {
  id: string;
  titleJa: string;
  type: PrizeType;
  value: number;
  color: string;
  icon?: string;
  probability?: number;
  descriptionJa?: string;
}

export interface SpendStatus {
  requireOrderSpend: boolean;
  cycleSpendAmount: number;
  totalSpent: number;
  currentCycleSpent: number;
  remainingToNextPlay: number;
  totalPlaysEarned: number;
  gamePlaysUsed: number;
  availablePlays: number;
  progressPercent: number;
  qualifyingOrderCount: number;
}

export interface GameStatusResponse {
  enabled: boolean;
  canPlay: boolean;
  nextPlayAt: string | null;
  config: {
    enabled: boolean;
    mode: GameMode;
    cooldownHours: number;
    titleJa: string;
    subtitleJa: string;
    requireOrderSpend?: boolean;
    cycleSpendAmount?: number;
    allowSingleOrderQualify?: boolean;
    prizes: GamePrize[];
  };
  spendStatus?: SpendStatus;
}

interface MiniGameModalProps {
  isOpen: boolean;
  onClose: () => void;
  isAdminPreview?: boolean;
  previewConfig?: {
    mode: GameMode;
    titleJa: string;
    subtitleJa: string;
    prizes: GamePrize[];
  };
  onRewardClaimed?: () => void;
}

// Sound synthesizer using Web Audio API (no external asset files needed)
function playWinSound() {
  try {
    const ctx = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
    const chords = [523.25, 659.25, 783.99, 1046.5]; // C5, E5, G5, C6
    chords.forEach((freq, idx) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      const startTime = ctx.currentTime + idx * 0.12;
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(freq, startTime);
      gain.gain.setValueAtTime(0.001, startTime);
      gain.gain.exponentialRampToValueAtTime(0.28, startTime + 0.03);
      gain.gain.exponentialRampToValueAtTime(0.0001, startTime + 0.5);
      osc.connect(gain).connect(ctx.destination);
      osc.start(startTime);
      osc.stop(startTime + 0.55);
    });
    setTimeout(() => ctx.close(), 1600);
  } catch {
    // audio not supported or muted
  }
}

function playTickSound() {
  try {
    const ctx = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(800, ctx.currentTime);
    gain.gain.setValueAtTime(0.05, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.04);
    osc.connect(gain).connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.045);
    setTimeout(() => ctx.close(), 100);
  } catch {
    // silent
  }
}

export default function MiniGameModal({
  isOpen,
  onClose,
  isAdminPreview = false,
  previewConfig,
  onRewardClaimed,
}: MiniGameModalProps) {
  const [loading, setLoading] = useState(!isAdminPreview);
  const [gameStatus, setGameStatus] = useState<GameStatusResponse | null>(null);
  const [gameState, setGameState] = useState<'IDLE' | 'PLAYING' | 'WON'>('IDLE');
  const [winningPrize, setWinningPrize] = useState<GamePrize | null>(null);
  const [pointsWon, setPointsWon] = useState<number>(0);
  const [errorMessageStr, setErrorMessageStr] = useState<string | null>(null);
  const confettiCanvasRef = useRef<HTMLCanvasElement | null>(null);

  // Load status on open
  const loadStatus = useCallback(async () => {
    if (isAdminPreview && previewConfig) {
      setGameStatus({
        enabled: true,
        canPlay: true,
        nextPlayAt: null,
        config: {
          enabled: true,
          mode: previewConfig.mode,
          cooldownHours: 24,
          titleJa: previewConfig.titleJa,
          subtitleJa: previewConfig.subtitleJa,
          prizes: previewConfig.prizes,
        },
      });
      setLoading(false);
      return;
    }

    setLoading(true);
    setErrorMessageStr(null);
    try {
      const res = await apiFetch('/api/v1/game/status');
      if (res.ok) {
        const data: GameStatusResponse = await res.json();
        setGameStatus(data);
      } else {
        setErrorMessageStr('ゲーム情報の取得に失敗しました。');
      }
    } catch {
      setErrorMessageStr('通信エラーが発生しました。');
    } finally {
      setLoading(false);
    }
  }, [isAdminPreview, previewConfig]);

  useEffect(() => {
    if (isOpen) {
      setGameState('IDLE');
      setWinningPrize(null);
      loadStatus();
    }
  }, [isOpen, loadStatus]);

  // Particle confetti effect on win
  useEffect(() => {
    if (gameState !== 'WON' || !confettiCanvasRef.current) return;
    const canvas = confettiCanvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    canvas.width = canvas.parentElement?.clientWidth || 400;
    canvas.height = canvas.parentElement?.clientHeight || 450;

    const colors = ['#f59e0b', '#ec4899', '#3b82f6', '#10b981', '#8b5cf6', '#ef4444', '#facc15'];
    const particles = Array.from({ length: 80 }).map(() => ({
      x: canvas.width / 2,
      y: canvas.height / 2,
      vx: (Math.random() - 0.5) * 14,
      vy: (Math.random() - 0.7) * 14,
      size: Math.random() * 8 + 4,
      color: colors[Math.floor(Math.random() * colors.length)],
      rotation: Math.random() * 360,
      vRot: (Math.random() - 0.5) * 10,
      life: 1,
    }));

    let animId: number;
    const render = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      let alive = false;
      particles.forEach(p => {
        p.x += p.vx;
        p.y += p.vy;
        p.vy += 0.35; // gravity
        p.vx *= 0.98;
        p.rotation += p.vRot;
        p.life -= 0.012;

        if (p.life > 0) {
          alive = true;
          ctx.save();
          ctx.translate(p.x, p.y);
          ctx.rotate((p.rotation * Math.PI) / 180);
          ctx.globalAlpha = Math.max(0, p.life);
          ctx.fillStyle = p.color;
          ctx.fillRect(-p.size / 2, -p.size / 2, p.size, p.size);
          ctx.restore();
        }
      });
      if (alive) {
        animId = requestAnimationFrame(render);
      }
    };
    render();

    return () => cancelAnimationFrame(animId);
  }, [gameState]);

  if (!isOpen) return null;

  const resolvedConfig = gameStatus?.config ?? (gameStatus as any);
  const currentMode: GameMode = previewConfig?.mode ?? resolvedConfig?.mode ?? 'LUCKY_WHEEL';
  const prizes: GamePrize[] = previewConfig?.prizes ?? resolvedConfig?.prizes ?? [];
  const title: string = previewConfig?.titleJa ?? resolvedConfig?.titleJa ?? '毎日チャレンジ！ミニゲーム';
  const subtitle: string = previewConfig?.subtitleJa ?? resolvedConfig?.subtitleJa ?? 'ゲームに挑戦して特典をゲット！';

  // Request play from server or simulate locally in preview mode
  const handleStartPlay = async (): Promise<{ index: number; prize: GamePrize }> => {
    if (isAdminPreview) {
      // Pick random prize based on probability weights
      const totalWeight = prizes.reduce((sum, p) => sum + (p.probability ?? 1), 0);
      let rand = Math.random() * (totalWeight || 1);
      let pickedIdx = 0;
      for (let i = 0; i < prizes.length; i++) {
        const weight = prizes[i].probability ?? 1;
        if (rand < weight) {
          pickedIdx = i;
          break;
        }
        rand -= weight;
      }
      const won = prizes[pickedIdx];
      setWinningPrize(won);
      setPointsWon(won.type === 'POINTS' ? won.value : 0);
      return { index: pickedIdx, prize: won };
    }

    const res = await apiFetch('/api/v1/game/play', { method: 'POST' });
    if (!res.ok) {
      const msg = await errorMessage(res, 'ゲームの開始に失敗しました。');
      throw new Error(msg);
    }
    const data = await res.json();
    setWinningPrize(data.prize);
    setPointsWon(data.pointsAdded || 0);
    return { index: data.prizeIndex, prize: data.prize };
  };

  const handleFinishWin = () => {
    setGameState('WON');
    playWinSound();
    onRewardClaimed?.();
  };

  return (
    <div style={backdropStyle} onClick={e => e.target === e.currentTarget && onClose()}>
      <div style={modalContainerStyle}>
        {/* Header */}
        <div style={modalHeaderStyle}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span style={{ fontSize: '1.4rem' }}>
              {currentMode === 'LUCKY_WHEEL' ? '🎯' : currentMode === 'SCRATCH_CARD' ? '🎫' : '🎰'}
            </span>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <h3 style={{ margin: 0, fontSize: '1.15rem', fontWeight: 800, color: '#fff' }}>{title}</h3>
                {gameStatus?.spendStatus?.requireOrderSpend && (gameStatus?.spendStatus?.availablePlays ?? 0) > 0 && (
                  <span style={{
                    backgroundColor: '#059669',
                    color: '#fff',
                    padding: '2px 8px',
                    borderRadius: '9999px',
                    fontSize: '0.72rem',
                    fontWeight: 800,
                  }}>
                    残り {gameStatus.spendStatus.availablePlays} 回
                  </span>
                )}
              </div>
              <p style={{ margin: 0, fontSize: '0.8rem', color: '#fbbf24' }}>{subtitle}</p>
            </div>
          </div>
          <button type="button" onClick={onClose} style={closeButtonStyle} aria-label="閉じる">
            <X size={20} />
          </button>
        </div>

        {/* Content Body */}
        <div style={modalBodyStyle}>
          {loading ? (
            <div style={{ textAlign: 'center', padding: '3rem 1rem', color: '#9ca3af' }}>
              <RefreshCw size={28} className="animate-spin" style={{ margin: '0 auto 0.5rem' }} />
              <p style={{ fontSize: '0.9rem' }}>ゲームを準備中…</p>
            </div>
          ) : errorMessageStr ? (
            <div style={{ textAlign: 'center', padding: '2rem 1rem' }}>
              <AlertCircle size={40} color="#f87171" style={{ margin: '0 auto 0.75rem' }} />
              <p style={{ color: '#fff', fontWeight: 600 }}>{errorMessageStr}</p>
              <button type="button" onClick={onClose} style={actionButtonStyle}>
                閉じる
              </button>
            </div>
          ) : !isAdminPreview && !gameStatus?.canPlay && gameState === 'IDLE' ? (
            gameStatus?.spendStatus?.requireOrderSpend && (gameStatus.spendStatus.availablePlays <= 0) ? (
              /* Spend Cycle Locked Screen */
              <div style={{ textAlign: 'center', padding: '2rem 1.25rem', color: '#fff' }}>
                <div style={{ width: '64px', height: '64px', borderRadius: '50%', backgroundColor: 'rgba(217, 119, 6, 0.2)', display: 'grid', placeItems: 'center', margin: '0 auto 1rem', border: '1.5px solid #f59e0b' }}>
                  <span style={{ fontSize: '2rem' }}>🔒</span>
                </div>
                <div style={{ display: 'inline-block', backgroundColor: 'rgba(245, 158, 11, 0.2)', color: '#fbbf24', border: '1px solid #f59e0b', borderRadius: '9999px', padding: '3px 12px', fontSize: '0.8rem', fontWeight: 800, marginBottom: '0.75rem' }}>
                  {(gameStatus.spendStatus.cycleSpendAmount || 4999).toLocaleString()}円購入サイクル解放条件
                </div>
                <h4 style={{ margin: '0 0 0.5rem', fontSize: '1.25rem', fontWeight: 800 }}>
                  お買い物サイクル達成で挑戦可能！
                </h4>
                <p style={{ color: '#d1d5db', fontSize: '0.88rem', lineHeight: 1.5, margin: '0 auto 1.25rem', maxWidth: '380px' }}>
                  累計 <strong>{(gameStatus.spendStatus.cycleSpendAmount || 4999).toLocaleString()}円</strong> のご注文（完了済み）を達成するごとに、運試しゲーム（ポイントや割引クーポンが当たるミニゲーム）の挑戦権が1回付与されます。
                </p>

                {/* Progress Card */}
                <div style={{
                  backgroundColor: 'rgba(255, 255, 255, 0.08)',
                  border: '1px solid rgba(251, 191, 36, 0.3)',
                  borderRadius: '14px',
                  padding: '14px 18px',
                  margin: '0 auto 1.5rem',
                  maxWidth: '380px',
                  textAlign: 'left',
                }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                    <span style={{ fontSize: '0.82rem', color: '#fbbf24', fontWeight: 700 }}>現在のサイクル進捗</span>
                    <span style={{ fontSize: '0.88rem', color: '#fff', fontWeight: 800 }}>
                      ¥{gameStatus.spendStatus.currentCycleSpent.toLocaleString()} / ¥{gameStatus.spendStatus.cycleSpendAmount.toLocaleString()}
                    </span>
                  </div>
                  <div style={{ width: '100%', height: '9px', backgroundColor: 'rgba(255,255,255,0.15)', borderRadius: '9999px', overflow: 'hidden', marginBottom: '8px' }}>
                    <div style={{
                      width: `${gameStatus.spendStatus.progressPercent}%`,
                      height: '100%',
                      background: 'linear-gradient(90deg, #f59e0b, #fbbf24)',
                      borderRadius: '9999px',
                      transition: 'width 0.4s ease',
                    }} />
                  </div>
                  <div style={{ fontSize: '0.82rem', color: '#fef08a', fontWeight: 700, textAlign: 'center' }}>
                    あと <span style={{ fontSize: '1.05rem', color: '#fff', fontWeight: 900 }}>¥{gameStatus.spendStatus.remainingToNextPlay.toLocaleString()}</span> のご注文でゲームがアンロックされます！
                  </div>
                </div>

                {/* Prizes Preview */}
                <div style={{ marginBottom: '1.5rem' }}>
                  <span style={{ fontSize: '0.78rem', color: '#9ca3af', display: 'block', marginBottom: '8px' }}>
                    当たった景品（ポイント・割引クーポン・ナン無料券）は次回以降のお会計ですぐに使えます！
                  </span>
                  <div style={{ display: 'flex', justifyContent: 'center', gap: '8px', flexWrap: 'wrap' }}>
                    {prizes.slice(0, 4).map(p => (
                      <span key={p.id} style={{
                        backgroundColor: 'rgba(255,255,255,0.06)',
                        border: '1px solid rgba(255,255,255,0.15)',
                        borderRadius: '8px',
                        padding: '4px 8px',
                        fontSize: '0.75rem',
                        color: '#f3f4f6',
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '4px',
                      }}>
                        <span>{p.icon || '🎁'}</span>
                        <span>{p.titleJa}</span>
                      </span>
                    ))}
                  </div>
                </div>

                <div style={{ display: 'flex', gap: '10px', justifyContent: 'center', flexWrap: 'wrap' }}>
                  <a
                    href="/menu/takeout"
                    style={{
                      ...actionButtonStyle,
                      backgroundColor: '#fbbf24',
                      color: '#111827',
                      fontWeight: 800,
                      textDecoration: 'none',
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '6px',
                    }}
                  >
                    メニューを見て注文する <ArrowRight size={16} />
                  </a>
                  <button type="button" onClick={onClose} style={actionButtonStyle}>
                    閉じる
                  </button>
                </div>
              </div>
            ) : (
              /* Cooldown Active Screen */
              <div style={{ textAlign: 'center', padding: '2.5rem 1.5rem', color: '#fff' }}>
                <div style={{ width: '64px', height: '64px', borderRadius: '50%', backgroundColor: 'rgba(251, 191, 36, 0.15)', display: 'grid', placeItems: 'center', margin: '0 auto 1rem', border: '1px solid #fbbf24' }}>
                  <Check size={32} color="#fbbf24" />
                </div>
                <h4 style={{ margin: '0 0 0.5rem', fontSize: '1.25rem', fontWeight: 700 }}>本日の挑戦は完了しました</h4>
                <p style={{ color: '#9ca3af', fontSize: '0.9rem', lineHeight: 1.6, margin: '0 0 1.5rem' }}>
                  次回は{' '}
                  <strong style={{ color: '#fbbf24' }}>
                    {gameStatus?.nextPlayAt ? new Date(gameStatus.nextPlayAt).toLocaleString('ja-JP', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : '明日'}
                  </strong>{' '}
                  以降にまた挑戦できます！毎日アクセスしてお得な特典をゲットしてください。
                </p>
                <button type="button" onClick={onClose} style={actionButtonStyle}>
                  マイページに戻る
                </button>
              </div>
            )
          ) : gameState === 'WON' && winningPrize ? (
            /* Win Result Screen */
            <div style={{ textAlign: 'center', padding: '2rem 1.5rem', color: '#fff', position: 'relative' }}>
              <canvas ref={confettiCanvasRef} style={confettiCanvasStyle} />
              <div style={{ fontSize: '3rem', marginBottom: '0.5rem', animation: 'bounce 1s infinite' }}>
                {winningPrize.icon || (winningPrize.type === 'POINTS' ? '🪙' : winningPrize.type === 'DISCOUNT_COUPON' ? '🎟️' : '🎁')}
              </div>
              <div style={{ display: 'inline-block', backgroundColor: 'rgba(251, 191, 36, 0.2)', color: '#fbbf24', border: '1px solid #fbbf24', borderRadius: '9999px', padding: '4px 14px', fontSize: '0.85rem', fontWeight: 700, marginBottom: '0.75rem' }}>
                {winningPrize.type === 'NO_PRIZE' ? '参加賞' : '🎉 当選おめでとうございます！'}
              </div>
              <h4 style={{ margin: '0 0 0.5rem', fontSize: '1.6rem', fontWeight: 900, color: '#fff' }}>
                {winningPrize.titleJa}
              </h4>
                {winningPrize.type === 'POINTS' ? (
                  <div style={{
                    backgroundColor: 'rgba(16, 185, 129, 0.15)',
                    border: '1px solid rgba(16, 185, 129, 0.4)',
                    borderRadius: '12px',
                    padding: '12px 16px',
                    margin: '0 auto 1.25rem',
                    maxWidth: '350px',
                    textAlign: 'left',
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: '#34d399', fontWeight: 800, fontSize: '0.92rem' }}>
                      <Coins size={17} /> アダルサポイント加算完了
                    </div>
                    <div style={{ fontSize: '0.84rem', color: '#d1fae5', marginTop: '4px', lineHeight: 1.5 }}>
                      <strong>+{pointsWon}pt</strong> がアダルサポイント残高に追加されました！「ポイント履歴」にゲーム当選の詳細が記録されています。
                    </div>
                  </div>
                ) : (
                  <p style={{ color: '#d1d5db', fontSize: '0.9rem', lineHeight: 1.5, margin: '0 auto 1.5rem', maxWidth: '340px' }}>
                    {winningPrize.type === 'DISCOUNT_COUPON'
                      ? '特別割引クーポンを獲得しました！マイページの特典一覧に追加されました。'
                      : winningPrize.type === 'PERK'
                        ? '特別特典を獲得しました！次回のご注文・お会計時にスタッフにご提示ください。'
                        : 'ご参加ありがとうございます！次回もぜひチャレンジしてください。'}
                  </p>
                )}
              <button
                type="button"
                onClick={onClose}
                style={{ ...actionButtonStyle, backgroundColor: '#fbbf24', color: '#111827', fontWeight: 800 }}
              >
                {winningPrize.type === 'POINTS' ? 'アダルサポイントを確認する' : 'マイページで特典を確認する'} <ArrowRight size={16} />
              </button>
            </div>
          ) : (
            /* Active Game Arena */
            <div style={{ position: 'relative', minHeight: '380px', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '1rem' }}>
              {currentMode === 'LUCKY_WHEEL' && (
                <WheelGame
                  prizes={prizes}
                  gameState={gameState}
                  setGameState={setGameState}
                  onStartPlay={handleStartPlay}
                  onFinish={handleFinishWin}
                />
              )}
              {currentMode === 'SCRATCH_CARD' && (
                <ScratchGame
                  prizes={prizes}
                  gameState={gameState}
                  setGameState={setGameState}
                  onStartPlay={handleStartPlay}
                  onFinish={handleFinishWin}
                />
              )}
              {currentMode === 'SLOT_MACHINE' && (
                <SlotMachineGame
                  prizes={prizes}
                  gameState={gameState}
                  setGameState={setGameState}
                  onStartPlay={handleStartPlay}
                  onFinish={handleFinishWin}
                />
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/** 1. LUCKY SPIN WHEEL ENGINE */
function WheelGame({
  prizes,
  gameState,
  setGameState,
  onStartPlay,
  onFinish,
}: {
  prizes: GamePrize[];
  gameState: 'IDLE' | 'PLAYING' | 'WON';
  setGameState: (s: 'IDLE' | 'PLAYING' | 'WON') => void;
  onStartPlay: () => Promise<{ index: number; prize: GamePrize }>;
  onFinish: () => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const rotationRef = useRef<number>(0);
  const animFrameRef = useRef<number>(0);

  const numSlices = prizes.length;
  const sliceAngle = (2 * Math.PI) / (numSlices || 1);

  // Render wheel canvas
  const drawWheel = useCallback((currentAngle: number) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const size = canvas.width;
    const center = size / 2;
    const radius = center - 12;

    ctx.clearRect(0, 0, size, size);

    // Outer golden bezel
    ctx.save();
    ctx.beginPath();
    ctx.arc(center, center, radius + 8, 0, 2 * Math.PI);
    ctx.fillStyle = '#b45309';
    ctx.shadowColor = 'rgba(251, 191, 36, 0.4)';
    ctx.shadowBlur = 12;
    ctx.fill();
    ctx.restore();

    // Outer bulb rim
    ctx.beginPath();
    ctx.arc(center, center, radius + 2, 0, 2 * Math.PI);
    ctx.fillStyle = '#1e293b';
    ctx.fill();

    // Decorative bulb dots
    const numBulbs = 24;
    for (let i = 0; i < numBulbs; i++) {
      const angle = (i * 2 * Math.PI) / numBulbs;
      const bx = center + (radius + 5) * Math.cos(angle);
      const by = center + (radius + 5) * Math.sin(angle);
      ctx.beginPath();
      ctx.arc(bx, by, 3, 0, 2 * Math.PI);
      ctx.fillStyle = i % 2 === 0 ? '#fbbf24' : '#ffffff';
      ctx.fill();
    }

    // Draw slices
    prizes.forEach((prize, i) => {
      const startA = currentAngle + i * sliceAngle;
      const endA = startA + sliceAngle;

      ctx.beginPath();
      ctx.moveTo(center, center);
      ctx.arc(center, center, radius, startA, endA);
      ctx.closePath();
      ctx.fillStyle = prize.color || '#3b82f6';
      ctx.fill();

      // Border between slices
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 2;
      ctx.stroke();

      // Text and Icon
      ctx.save();
      ctx.translate(center, center);
      ctx.rotate(startA + sliceAngle / 2);
      ctx.textAlign = 'right';
      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 12px sans-serif';
      ctx.shadowColor = 'rgba(0,0,0,0.6)';
      ctx.shadowBlur = 4;
      const text = `${prize.icon ?? '🎁'} ${prize.titleJa}`;
      ctx.fillText(text.slice(0, 11), radius - 16, 4);
      ctx.restore();
    });

    // Center Hub
    ctx.save();
    ctx.beginPath();
    ctx.arc(center, center, 28, 0, 2 * Math.PI);
    ctx.fillStyle = '#f59e0b';
    ctx.shadowColor = 'rgba(0,0,0,0.4)';
    ctx.shadowBlur = 6;
    ctx.fill();
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 3;
    ctx.stroke();

    ctx.fillStyle = '#111827';
    ctx.font = 'bold 11px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('START', center, center);
    ctx.restore();
  }, [prizes, sliceAngle]);

  useEffect(() => {
    drawWheel(rotationRef.current);
  }, [drawWheel]);

  const spin = async () => {
    if (gameState === 'PLAYING') return;
    setGameState('PLAYING');

    let winningIdx = 0;
    try {
      const res = await onStartPlay();
      winningIdx = res.index;
    } catch {
      setGameState('IDLE');
      return;
    }

    // Calculate landing angle: Top pointer is at -Math.PI / 2 (or 3 * Math.PI / 2)
    // Slice i is at [currentAngle + i * sliceAngle, currentAngle + (i+1)*sliceAngle]
    // To land slice i under the top pointer:
    const targetSliceCenter = winningIdx * sliceAngle + sliceAngle / 2;
    const pointerAngle = (3 * Math.PI) / 2;
    const finalAngleOffset = (pointerAngle - targetSliceCenter) % (2 * Math.PI);

    const fullSpins = 5 + Math.floor(Math.random() * 3);
    const startAngle = rotationRef.current % (2 * Math.PI);
    const totalDistance = fullSpins * 2 * Math.PI + (finalAngleOffset - startAngle);

    const duration = 4000;
    const startTime = performance.now();
    let lastTickAngle = startAngle;

    const animate = (time: number) => {
      const elapsed = time - startTime;
      const progress = Math.min(elapsed / duration, 1);
      // Quintic ease-out deceleration
      const ease = 1 - Math.pow(1 - progress, 4);
      const current = startAngle + totalDistance * ease;
      rotationRef.current = current;
      drawWheel(current);

      // Play tick sound every slice
      if (Math.abs(current - lastTickAngle) >= sliceAngle) {
        playTickSound();
        lastTickAngle = current;
      }

      if (progress < 1) {
        animFrameRef.current = requestAnimationFrame(animate);
      } else {
        setTimeout(onFinish, 400);
      }
    };

    animFrameRef.current = requestAnimationFrame(animate);
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
      {/* Pointer Pin at top */}
      <div style={{
        width: 0,
        height: 0,
        borderLeft: '14px solid transparent',
        borderRight: '14px solid transparent',
        borderTop: '22px solid #fbbf24',
        marginBottom: '-12px',
        zIndex: 5,
        filter: 'drop-shadow(0 2px 4px rgba(0,0,0,0.5))',
      }} />

      <canvas
        ref={canvasRef}
        width={320}
        height={320}
        style={{ cursor: gameState === 'PLAYING' ? 'default' : 'pointer', maxWidth: '100%' }}
        onClick={spin}
      />

      <button
        type="button"
        disabled={gameState === 'PLAYING'}
        onClick={spin}
        style={{
          marginTop: '1.25rem',
          padding: '10px 32px',
          backgroundColor: '#fbbf24',
          color: '#111827',
          borderRadius: '9999px',
          fontWeight: 800,
          fontSize: '1rem',
          border: 'none',
          cursor: gameState === 'PLAYING' ? 'not-allowed' : 'pointer',
          boxShadow: '0 4px 14px rgba(251, 191, 36, 0.4)',
          opacity: gameState === 'PLAYING' ? 0.7 : 1,
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
        }}
      >
        <Sparkles size={18} />
        {gameState === 'PLAYING' ? '抽選中…' : 'ルーレットを回す！'}
      </button>
    </div>
  );
}

/** 2. SCRATCH CARD ENGINE */
function ScratchGame({
  gameState,
  setGameState,
  onStartPlay,
  onFinish,
}: {
  prizes: GamePrize[];
  gameState: 'IDLE' | 'PLAYING' | 'WON';
  setGameState: (s: 'IDLE' | 'PLAYING' | 'WON') => void;
  onStartPlay: () => Promise<{ index: number; prize: GamePrize }>;
  onFinish: () => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [revealedPrize, setRevealedPrize] = useState<GamePrize | null>(null);
  const isScratchingRef = useRef(false);
  const scratchedPercentRef = useRef(0);

  // Initialize scratch foil
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Draw metallic silver-gold foil
    const grad = ctx.createLinearGradient(0, 0, canvas.width, canvas.height);
    grad.addColorStop(0, '#d4af37');
    grad.addColorStop(0.3, '#f5d77f');
    grad.addColorStop(0.6, '#aa771c');
    grad.addColorStop(1, '#e6ca65');

    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Decorative pattern
    ctx.fillStyle = 'rgba(255, 255, 255, 0.3)';
    for (let i = 0; i < canvas.width; i += 20) {
      for (let j = 0; j < canvas.height; j += 20) {
        ctx.fillRect(i, j, 4, 4);
      }
    }

    ctx.fillStyle = '#111827';
    ctx.font = 'bold 16px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('🪙 指やマウスで削ってね！', canvas.width / 2, canvas.height / 2 - 10);
    ctx.font = '12px sans-serif';
    ctx.fillStyle = '#374151';
    ctx.fillText('ここをスクラッチ！', canvas.width / 2, canvas.height / 2 + 16);
  }, []);

  const scratch = (clientX: number, clientY: number) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const rect = canvas.getBoundingClientRect();
    const x = clientX - rect.left;
    const y = clientY - rect.top;

    ctx.globalCompositeOperation = 'destination-out';
    ctx.beginPath();
    ctx.arc(x, y, 22, 0, 2 * Math.PI);
    ctx.fill();

    // Check scratched percentage occasionally
    scratchedPercentRef.current += 1.5;
    if (scratchedPercentRef.current > 40 && gameState !== 'WON') {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      onFinish();
    }
  };

  const handlePointerDown = async (e: React.PointerEvent) => {
    isScratchingRef.current = true;
    if (gameState === 'IDLE') {
      setGameState('PLAYING');
      try {
        const res = await onStartPlay();
        setRevealedPrize(res.prize);
      } catch {
        setGameState('IDLE');
        return;
      }
    }
    scratch(e.clientX, e.clientY);
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    if (!isScratchingRef.current) return;
    scratch(e.clientX, e.clientY);
  };

  const handlePointerUp = () => {
    isScratchingRef.current = false;
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
      <div style={{
        position: 'relative',
        width: 300,
        height: 200,
        borderRadius: '14px',
        overflow: 'hidden',
        boxShadow: '0 10px 25px rgba(0,0,0,0.5)',
        border: '3px solid #fbbf24',
        backgroundColor: '#1e293b',
      }}>
        {/* Revealed Content underneath */}
        <div style={{
          position: 'absolute',
          inset: 0,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: '#0f172a',
          color: '#fff',
          padding: '1rem',
          textAlign: 'center',
        }}>
          {revealedPrize ? (
            <>
              <span style={{ fontSize: '2.5rem', marginBottom: '4px' }}>{revealedPrize.icon || '🎁'}</span>
              <span style={{ fontSize: '0.8rem', color: '#fbbf24', fontWeight: 700 }}>あたり！</span>
              <span style={{ fontSize: '1.25rem', fontWeight: 900, color: '#fff' }}>{revealedPrize.titleJa}</span>
            </>
          ) : (
            <span style={{ color: '#9ca3af', fontSize: '0.9rem' }}>削って中身を確認！</span>
          )}
        </div>

        {/* Scratch Canvas on top */}
        <canvas
          ref={canvasRef}
          width={300}
          height={200}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          style={{ position: 'absolute', inset: 0, cursor: 'grab', touchAction: 'none' }}
        />
      </div>

      <p style={{ color: '#9ca3af', fontSize: '0.85rem', marginTop: '1rem' }}>
        カードの上をこすって削ると、隠れた景品が現れます！
      </p>
    </div>
  );
}

/** 3. SLOT MACHINE ENGINE */
function SlotMachineGame({
  prizes,
  gameState,
  setGameState,
  onStartPlay,
  onFinish,
}: {
  prizes: GamePrize[];
  gameState: 'IDLE' | 'PLAYING' | 'WON';
  setGameState: (s: 'IDLE' | 'PLAYING' | 'WON') => void;
  onStartPlay: () => Promise<{ index: number; prize: GamePrize }>;
  onFinish: () => void;
}) {
  const [reels, setReels] = useState<[string, string, string]>(['⭐', '⭐', '⭐']);
  const [isSpinning, setIsSpinning] = useState(false);

  const icons = prizes.map(p => p.icon || '🎁');
  if (icons.length === 0) icons.push('🎁', '💎', '🪙');

  const spin = async () => {
    if (isSpinning || gameState === 'PLAYING') return;
    setIsSpinning(true);
    setGameState('PLAYING');

    let wonPrize: GamePrize;
    try {
      const res = await onStartPlay();
      wonPrize = res.prize;
    } catch {
      setIsSpinning(false);
      setGameState('IDLE');
      return;
    }

    const targetIcon = wonPrize.icon || '🎁';

    // Rapid spinning simulation
    const spinInterval = setInterval(() => {
      setReels([
        icons[Math.floor(Math.random() * icons.length)],
        icons[Math.floor(Math.random() * icons.length)],
        icons[Math.floor(Math.random() * icons.length)],
      ]);
      playTickSound();
    }, 100);

    // Stop reel 1 after 1.5s
    setTimeout(() => {
      setReels(prev => [targetIcon, prev[1], prev[2]]);
      playTickSound();
    }, 1500);

    // Stop reel 2 after 2.3s
    setTimeout(() => {
      setReels(prev => [targetIcon, targetIcon, prev[2]]);
      playTickSound();
    }, 2300);

    // Stop reel 3 after 3.2s
    setTimeout(() => {
      clearInterval(spinInterval);
      setReels([targetIcon, targetIcon, targetIcon]);
      setIsSpinning(false);
      setTimeout(onFinish, 400);
    }, 3200);
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
      {/* Slot Machine Housing */}
      <div style={{
        backgroundColor: '#b45309',
        border: '4px solid #fbbf24',
        borderRadius: '16px',
        padding: '16px',
        boxShadow: '0 8px 24px rgba(0,0,0,0.5)',
        width: 290,
      }}>
        {/* Lights Top */}
        <div style={{ display: 'flex', justifyContent: 'space-around', marginBottom: '10px' }}>
          {[1, 2, 3, 4, 5].map(i => (
            <div
              key={i}
              style={{
                width: 10,
                height: 10,
                borderRadius: '50%',
                backgroundColor: isSpinning ? (i % 2 === 0 ? '#ef4444' : '#fbbf24') : '#fef08a',
                boxShadow: '0 0 6px #fbbf24',
              }}
            />
          ))}
        </div>

        {/* 3 Reels Window */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(3, 1fr)',
          gap: '8px',
          backgroundColor: '#0f172a',
          padding: '12px 8px',
          borderRadius: '10px',
          border: '2px solid #78350f',
        }}>
          {reels.map((icon, idx) => (
            <div
              key={idx}
              style={{
                height: '80px',
                backgroundColor: '#1e293b',
                borderRadius: '8px',
                display: 'grid',
                placeItems: 'center',
                fontSize: '2.5rem',
                border: '1px solid #334155',
                boxShadow: 'inset 0 4px 8px rgba(0,0,0,0.6)',
              }}
            >
              {icon}
            </div>
          ))}
        </div>
      </div>

      {/* Spin Button */}
      <button
        type="button"
        disabled={isSpinning}
        onClick={spin}
        style={{
          marginTop: '1.5rem',
          padding: '12px 36px',
          backgroundColor: '#fbbf24',
          color: '#111827',
          borderRadius: '9999px',
          fontWeight: 800,
          fontSize: '1.05rem',
          border: 'none',
          cursor: isSpinning ? 'not-allowed' : 'pointer',
          boxShadow: '0 4px 14px rgba(251, 191, 36, 0.4)',
          opacity: isSpinning ? 0.7 : 1,
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
        }}
      >
        <Sparkles size={18} />
        {isSpinning ? '回転中…' : 'スロットを回す！'}
      </button>
    </div>
  );
}

// Styling Constants
const backdropStyle: CSSProperties = {
  position: 'fixed',
  inset: 0,
  backgroundColor: 'rgba(0, 0, 0, 0.8)',
  backdropFilter: 'blur(6px)',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  zIndex: 9999,
  padding: '1rem',
};

const modalContainerStyle: CSSProperties = {
  backgroundColor: '#111827',
  borderRadius: '20px',
  border: '2px solid rgba(251, 191, 36, 0.4)',
  boxShadow: '0 20px 50px rgba(0, 0, 0, 0.8), 0 0 30px rgba(251, 191, 36, 0.2)',
  width: '100%',
  maxWidth: '440px',
  overflow: 'hidden',
  display: 'flex',
  flexDirection: 'column',
};

const modalHeaderStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  padding: '14px 18px',
  borderBottom: '1px solid rgba(255, 255, 255, 0.1)',
  backgroundColor: 'rgba(31, 41, 55, 0.7)',
};

const closeButtonStyle: CSSProperties = {
  background: 'none',
  border: 'none',
  color: '#9ca3af',
  cursor: 'pointer',
  padding: '4px',
  borderRadius: '6px',
  display: 'grid',
  placeItems: 'center',
};

const modalBodyStyle: CSSProperties = {
  position: 'relative',
  overflow: 'hidden',
};

const actionButtonStyle: CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  gap: '8px',
  padding: '10px 24px',
  backgroundColor: 'rgba(255, 255, 255, 0.1)',
  color: '#fff',
  borderRadius: '9999px',
  border: '1px solid rgba(255, 255, 255, 0.2)',
  fontWeight: 700,
  fontSize: '0.9rem',
  cursor: 'pointer',
};

const confettiCanvasStyle: CSSProperties = {
  position: 'absolute',
  inset: 0,
  pointerEvents: 'none',
  zIndex: 10,
};
