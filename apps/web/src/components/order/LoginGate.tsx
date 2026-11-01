import { Link } from 'react-router-dom';
import { LogIn, UserPlus, ArrowRight } from 'lucide-react';

const PERKS = ['ご注文ごとにポイントが貯まります', '会員限定の特典が使えます', '注文履歴からワンタップで再注文'];

/** Shown at checkout to visitors who aren't signed in: lets members sign in or continue as guest. */
export default function LoginGate({ onGuestCheckout }: { onGuestCheckout?: () => void }) {
  const next = encodeURIComponent('/order');
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
      <div>
        <h2 style={{ fontSize: '1.3rem', color: 'var(--dark-bark)', margin: '0 0 6px' }}>会員ログイン・新規登録</h2>
        <p style={{ margin: 0, color: 'var(--text-muted)', lineHeight: 1.6, fontSize: '0.92rem' }}>
          会員登録するとポイントやスタンプが貯まり、次回から簡単にご注文いただけます。登録なしのゲスト注文も可能です。
        </p>
      </div>
      <Link to={`/account/login?next=${next}`} className="order-btn order-btn-solid order-btn-lg" style={{ textDecoration: 'none' }}>
        <LogIn size={18} aria-hidden="true" />ログインして注文する
      </Link>
      <Link to={`/account/register?next=${next}`} className="order-btn order-btn-outline order-btn-lg" style={{ textDecoration: 'none' }}>
        <UserPlus size={18} aria-hidden="true" />はじめての方：無料で会員登録
      </Link>
      {onGuestCheckout && (
        <button
          type="button"
          onClick={onGuestCheckout}
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '6px',
            background: 'none',
            border: '1px solid #d1d5db',
            borderRadius: '8px',
            color: '#4b5563',
            cursor: 'pointer',
            fontSize: '0.92rem',
            padding: '12px 16px',
            fontWeight: 500,
            marginTop: '4px',
            backgroundColor: '#ffffff',
          }}
        >
          会員登録せずにゲストとして注文する <ArrowRight size={16} />
        </button>
      )}
      <ul style={{ margin: 0, paddingLeft: '1.2em', color: 'var(--text-muted)', fontSize: '0.88rem', lineHeight: 1.8 }}>
        {PERKS.map(perk => <li key={perk}>{perk}</li>)}
      </ul>
    </div>
  );
}
