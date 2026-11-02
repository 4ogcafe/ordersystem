import { UtensilsCrossed, ShoppingBag, MapPin, ArrowRight, X } from 'lucide-react';
import { type StoreLocation } from '../../lib/stores';

interface QrFulfillmentChoiceModalProps {
  open: boolean;
  tableNumber: string;
  store: StoreLocation;
  lang?: 'ja' | 'en';
  onSelectDineIn: () => void;
  onSelectTakeout: () => void;
  onClose?: () => void;
}

export default function QrFulfillmentChoiceModal({
  open,
  tableNumber,
  store,
  lang = 'ja',
  onSelectDineIn,
  onSelectTakeout,
  onClose,
}: QrFulfillmentChoiceModalProps) {
  if (!open) return null;

  const isJa = lang === 'ja';

  return (
    <div
      role="dialog"
      aria-modal="true"
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 9999,
        backgroundColor: 'rgba(17, 24, 39, 0.72)',
        backdropFilter: 'blur(6px)',
        WebkitBackdropFilter: 'blur(6px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '16px',
        animation: 'dioFadeIn 0.2s ease-out',
      }}
      onClick={onClose}
    >
      <div
        style={{
          width: '100%',
          maxWidth: '430px',
          backgroundColor: '#ffffff',
          borderRadius: '24px',
          boxShadow: '0 20px 40px -15px rgba(0, 0, 0, 0.3)',
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column',
          maxHeight: '92vh',
          animation: 'dioSlideUp 0.25s cubic-bezier(0.16, 1, 0.3, 1)',
        }}
        onClick={e => e.stopPropagation()}
      >
        {/* Top Header Card */}
        <div
          style={{
            background: 'linear-gradient(135deg, #b82e1f 0%, #8b1d12 100%)',
            color: '#ffffff',
            padding: '24px 20px 20px',
            textAlign: 'center',
            position: 'relative',
          }}
        >
          {onClose && (
            <button
              type="button"
              onClick={onClose}
              style={{
                position: 'absolute',
                top: 14,
                right: 14,
                background: 'rgba(255, 255, 255, 0.2)',
                border: 'none',
                borderRadius: '50%',
                width: 32,
                height: 32,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#fff',
                cursor: 'pointer',
              }}
              title={isJa ? '閉じる' : 'Close'}
            >
              <X size={18} />
            </button>
          )}

          <div
            style={{
              width: 58,
              height: 58,
              borderRadius: '50%',
              backgroundColor: '#ffffff',
              border: '2px solid #fed7aa',
              margin: '0 auto 10px',
              padding: 2,
              boxShadow: '0 4px 12px rgba(0, 0, 0, 0.18)',
              overflow: 'hidden',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <img
              src="/adarsha-log.webp"
              alt="Adarsha"
              style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: '50%' }}
            />
          </div>

          <h2 style={{ margin: '0 0 4px', fontSize: '1.25rem', fontWeight: 900, letterSpacing: '-0.01em' }}>
            {isJa ? 'ようこそ Adarsha へ！' : 'Welcome to Adarsha!'}
          </h2>

          <div
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
              background: 'rgba(255, 255, 255, 0.18)',
              padding: '3px 12px',
              borderRadius: 9999,
              fontSize: '0.82rem',
              fontWeight: 700,
              marginTop: 4,
            }}
          >
            <MapPin size={13} />
            <span>{store.name}</span>
            <span style={{ opacity: 0.6 }}>·</span>
            <span style={{ color: '#fef08a' }}>
              {isJa ? `テーブル ${tableNumber}` : `Table ${tableNumber}`}
            </span>
          </div>

          <p style={{ margin: '8px 0 0', fontSize: '0.85rem', opacity: 0.92, lineHeight: 1.4 }}>
            {isJa
              ? 'QRコードを読み取りました。ご注文方法をお選びください:'
              : 'QR code scanned. Please choose your order method:'}
          </p>
        </div>

        {/* Action Choice Body */}
        <div style={{ padding: '20px 18px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '14px' }}>
          {/* OPTION 1: DINE IN */}
          <button
            type="button"
            onClick={onSelectDineIn}
            style={{
              display: 'flex',
              alignItems: 'flex-start',
              gap: '14px',
              padding: '16px 18px',
              backgroundColor: '#fff7ed',
              border: '2px solid #ea580c',
              borderRadius: '16px',
              textAlign: 'left',
              cursor: 'pointer',
              transition: 'all 0.15s ease',
              boxShadow: '0 4px 14px rgba(234, 88, 12, 0.08)',
              position: 'relative',
              outline: 'none',
            }}
          >
            <div
              style={{
                width: 46,
                height: 46,
                borderRadius: '12px',
                backgroundColor: '#ea580c',
                color: '#ffffff',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0,
                marginTop: 2,
              }}
            >
              <UtensilsCrossed size={24} />
            </div>

            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 2 }}>
                <span
                  style={{
                    backgroundColor: '#ea580c',
                    color: '#fff',
                    fontSize: '0.68rem',
                    fontWeight: 800,
                    padding: '2px 7px',
                    borderRadius: 9999,
                  }}
                >
                  {isJa ? 'お席でお食事' : 'Dine In'}
                </span>
                <span style={{ fontSize: '0.74rem', color: '#9a3412', fontWeight: 700 }}>
                  {isJa ? `お席 ${tableNumber} 番` : `Table ${tableNumber}`}
                </span>
              </div>

              <div style={{ fontSize: '1.08rem', fontWeight: 900, color: '#431407' }}>
                {isJa ? '店内でお食事（店内飲食）' : 'Dine-In at Table'}
              </div>

              <div style={{ fontSize: '0.78rem', color: '#7c2d12', marginTop: 3, lineHeight: 1.45 }}>
                {isJa
                  ? 'スマホから料理をそのまま厨房へ送信。出来立てをお席までお持ちします。'
                  : 'Order dishes from your table. Freshly prepared and served to your seat.'}
              </div>

              <div
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 4,
                  marginTop: 8,
                  fontSize: '0.84rem',
                  fontWeight: 800,
                  color: '#ea580c',
                }}
              >
                <span>{isJa ? '店内飲食で注文する' : 'Start Dine-In Order'}</span>
                <ArrowRight size={14} />
              </div>
            </div>
          </button>

          {/* OPTION 2: TAKEOUT */}
          <button
            type="button"
            onClick={onSelectTakeout}
            style={{
              display: 'flex',
              alignItems: 'flex-start',
              gap: '14px',
              padding: '16px 18px',
              backgroundColor: '#f8fafc',
              border: '2px solid #cbd5e1',
              borderRadius: '16px',
              textAlign: 'left',
              cursor: 'pointer',
              transition: 'all 0.15s ease',
              boxShadow: '0 2px 8px rgba(0, 0, 0, 0.04)',
              outline: 'none',
            }}
          >
            <div
              style={{
                width: 46,
                height: 46,
                borderRadius: '12px',
                backgroundColor: '#0f172a',
                color: '#ffffff',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0,
                marginTop: 2,
              }}
            >
              <ShoppingBag size={24} />
            </div>

            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 2 }}>
                <span
                  style={{
                    backgroundColor: '#0f172a',
                    color: '#fff',
                    fontSize: '0.68rem',
                    fontWeight: 800,
                    padding: '2px 7px',
                    borderRadius: 9999,
                  }}
                >
                  {isJa ? 'お持ち帰り' : 'To Go'}
                </span>
                <span style={{ fontSize: '0.74rem', color: '#475569', fontWeight: 600 }}>
                  {isJa ? '店頭受取' : 'Store Pickup'}
                </span>
              </div>

              <div style={{ fontSize: '1.08rem', fontWeight: 900, color: '#0f172a' }}>
                {isJa ? 'テイクアウト（お持ち帰り）' : 'Takeout / To Go'}
              </div>

              <div style={{ fontSize: '0.78rem', color: '#475569', marginTop: 3, lineHeight: 1.45 }}>
                {isJa
                  ? '出来立てをテイクアウト。店頭レジカウンターでお受け取りいただけます。'
                  : 'Take your food to go. Pick up your freshly prepared meal at the counter.'}
              </div>

              <div
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 4,
                  marginTop: 8,
                  fontSize: '0.84rem',
                  fontWeight: 800,
                  color: '#0f172a',
                }}
              >
                <span>{isJa ? 'テイクアウトで注文する' : 'Start Takeout Order'}</span>
                <ArrowRight size={14} />
              </div>
            </div>
          </button>
        </div>

        {/* Bottom Note */}
        <div
          style={{
            padding: '10px 18px 16px',
            backgroundColor: '#fafafa',
            borderTop: '1px solid #f1f5f9',
            textAlign: 'center',
            fontSize: '0.74rem',
            color: '#64748b',
          }}
        >
          {isJa
            ? '※ ご注文画面からいつでも店内飲食・テイクアウトを切り替えできます。'
            : '※ You can switch between Dine-In and Takeout anytime from the menu.'}
        </div>
      </div>
    </div>
  );
}
