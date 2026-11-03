import { useMemo } from 'react';
import { UtensilsCrossed, Sparkles } from 'lucide-react';
import '../../pages/dining-order.css';

interface QrScanPreloaderProps {
  tableNumber?: string;
  storeName?: string;
  isTakeout?: boolean;
  lang?: 'ja' | 'en';
  fadeOut?: boolean;
}

export default function QrScanPreloader({
  tableNumber = '1',
  storeName = 'アダルサ 武蔵境店',
  isTakeout = false,
  lang = 'ja',
  fadeOut = false,
}: QrScanPreloaderProps) {
  const displayTable = useMemo(() => {
    return (tableNumber || '1').replace(/[^0-9A-Za-z_-]/g, '') || tableNumber || '1';
  }, [tableNumber]);

  return (
    <div
      className={`dio-qr-preloader ${fadeOut ? 'is-fading-out' : ''}`}
      aria-live="polite"
      aria-busy="true"
    >
      <div className="dio-qr-preloader-backdrop" />
      <div className="dio-qr-preloader-card">
        {/* Top Mini Tag */}
        <div className="dio-qr-preloader-tag">
          <Sparkles size={13} color="#ea580c" />
          <span>{lang === 'ja' ? '卓上QRモバイルオーダー' : 'Table QR Mobile Order'}</span>
        </div>

        {/* Circular Logo with Pulse Ring */}
        <div className="dio-qr-preloader-logo-ring">
          <div className="dio-qr-preloader-pulse-glow" />
          <img
            src="/adarsha-log.webp"
            alt="Adarsha (アダルサ)"
            className="dio-qr-preloader-logo-img"
          />
        </div>

        {/* Restaurant Name */}
        <div className="dio-qr-preloader-brand">
          <h2 className="dio-qr-preloader-name">
            {lang === 'ja' ? 'アダルサ' : 'ADARSHA'}
          </h2>
          <p className="dio-qr-preloader-branch">{storeName}</p>
        </div>

        {/* Seat / Table Badge */}
        <div className="dio-qr-preloader-seat-badge">
          {isTakeout ? (
            <div className="dio-qr-preloader-seat-inner">
              <span className="dio-qr-preloader-seat-icon">🍱</span>
              <span className="dio-qr-preloader-seat-text">
                {lang === 'ja' ? 'テイクアウト注文' : 'Takeout Order'}
              </span>
            </div>
          ) : (
            <div className="dio-qr-preloader-seat-inner">
              <UtensilsCrossed size={16} color="#b82e1f" />
              <span className="dio-qr-preloader-seat-text">
                {lang === 'ja' ? `お席 ${displayTable} 番席` : `Table ${displayTable}`}
              </span>
            </div>
          )}
        </div>

        {/* Animated Progress Bar */}
        <div className="dio-qr-preloader-progress-wrap">
          <div className="dio-qr-preloader-progress-bar" />
        </div>

        {/* Status Message */}
        <div className="dio-qr-preloader-status">
          <p className="dio-qr-preloader-status-main">
            {lang === 'ja'
              ? isTakeout
                ? 'テイクアウトメニューを読み込んでいます...'
                : 'お席のメニューを読み込んでいます...'
              : 'Loading fresh menu items...'}
          </p>
          <p className="dio-qr-preloader-status-sub">
            {lang === 'ja'
              ? '少々お待ちください。まもなくご注文いただけます。'
              : 'Preparing your table menu. Just a moment...'}
          </p>
        </div>

        {/* Ambient Features Highlights */}
        <div className="dio-qr-preloader-features">
          <div className="dio-qr-preloader-feat-item">
            <span className="dio-qr-preloader-feat-emoji">🍛</span>
            <span>{lang === 'ja' ? '焼き立てナン＆カレー' : 'Fresh Tandoor & Curry'}</span>
          </div>
          <div className="dio-qr-preloader-feat-item">
            <span className="dio-qr-preloader-feat-emoji">📱</span>
            <span>{lang === 'ja' ? 'スマホでカンタン注文' : 'Fast Mobile Ordering'}</span>
          </div>
          <div className="dio-qr-preloader-feat-item">
            <span className="dio-qr-preloader-feat-emoji">🔔</span>
            <span>{lang === 'ja' ? '店員呼出・会計対応' : 'Call Staff Anytime'}</span>
          </div>
        </div>
      </div>
    </div>
  );
}
