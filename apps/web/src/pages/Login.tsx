import { useEffect, useState, type FormEvent } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { apiFetch, errorMessage } from '../lib/api';
import { setStaffSession, clearStaffSession } from '../lib/auth-storage';
import { ShieldCheck, Info } from 'lucide-react';

type Role = 'ADMIN' | 'STAFF' | 'KITCHEN';
interface SessionUser {
  name: string;
  email: string;
  role: Role;
}

const ROLE_LABEL: Record<Role, string> = { ADMIN: 'Admin', STAFF: 'Staff', KITCHEN: 'Kitchen' };

/** Where each account type works: kitchen accounts only have the kitchen display; admin and staff use the dashboard. */
const homeFor = (role: Role | undefined) => (role === 'KITCHEN' ? '/kitchen' : '/admin');

/** Sign-in for restaurant accounts (admin, staff, kitchen). Customers use マイページ (/account/login). */
export default function Login() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [rememberMe, setRememberMe] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  // Someone already signed in on this browser (undefined while checking).
  const [current, setCurrent] = useState<SessionUser | null | undefined>(undefined);

  const reason = params.get('reason');

  useEffect(() => {
    apiFetch('/api/v1/auth/me')
      .then(res => (res.ok ? res.json() : null))
      .then(data => {
        if (data?.user) {
          setCurrent(data.user);
          if (data.token) {
            setStaffSession(data.token, data.user, false);
          }
        } else {
          setCurrent(null);
        }
      })
      .catch(() => setCurrent(null));
  }, []);

  const signOut = async () => {
    clearStaffSession();
    await apiFetch('/api/v1/auth/logout', { method: 'POST' }).catch(() => undefined);
    setCurrent(null);
  };

  const handleLogin = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      const res = await apiFetch('/api/v1/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim(), password, rememberMe }),
      });
      if (!res.ok) {
        setError(
          res.status === 429
            ? await errorMessage(res, 'Too many attempts. Please wait a few minutes and try again.')
            : res.status === 401
              ? 'Wrong email or password, or this account is switched off.'
              : await errorMessage(res, `Sign-in failed (${res.status}). Is the API server running?`),
        );
        return;
      }
      const data = await res.json();
      const user = data.user as SessionUser;
      if (data.token) {
        setStaffSession(data.token, user, rememberMe);
      }
      const destination = homeFor(user.role);
      window.location.assign(destination);
    } catch {
      setError('Could not reach the server. Check the connection and try again.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div style={{ display: 'flex', minHeight: '100vh', alignItems: 'center', justifyContent: 'center', backgroundColor: '#f3f4f6', padding: '16px', boxSizing: 'border-box' }}>
      <title>Staff Login | Adarsha</title>
      <meta name="robots" content="noindex, nofollow" />
      <div style={{ backgroundColor: 'white', padding: '2rem', borderRadius: '12px', boxShadow: '0 4px 6px rgba(0,0,0,0.1)', width: '100%', maxWidth: '420px', boxSizing: 'border-box' }}>
        <h1 style={{ fontSize: '1.5rem', fontWeight: 'bold', margin: '0 0 0.25rem', textAlign: 'center' }}>Staff Login</h1>
        <p style={{ margin: '0 0 1.25rem', textAlign: 'center', color: '#6b7280', fontSize: '0.875rem' }}>For admin, staff and kitchen accounts.</p>

        {reason === 'idle_timeout' && (
          <div role="status" style={{ display: 'flex', alignItems: 'flex-start', gap: '8px', color: '#92400e', backgroundColor: '#fef3c7', border: '1px solid #fde68a', padding: '0.65rem 0.75rem', borderRadius: '6px', marginBottom: '1.25rem', fontSize: '0.85rem', lineHeight: 1.4 }}>
            <Info size={18} style={{ flexShrink: 0, marginTop: '2px' }} />
            <div>一定時間操作がなかったため、セキュリティ保護のため安全に自動ログアウトしました。</div>
          </div>
        )}

        {reason === 'session_expired' && (
          <div role="status" style={{ display: 'flex', alignItems: 'flex-start', gap: '8px', color: '#1e40af', backgroundColor: '#eff6ff', border: '1px solid #bfdbfe', padding: '0.65rem 0.75rem', borderRadius: '6px', marginBottom: '1.25rem', fontSize: '0.85rem', lineHeight: 1.4 }}>
            <Info size={18} style={{ flexShrink: 0, marginTop: '2px' }} />
            <div>セッションが終了しました。再度ログインしてください。</div>
          </div>
        )}

        {current && (
          <div style={{ marginBottom: '1.5rem', padding: '1rem', borderRadius: '8px', backgroundColor: '#f0fdf4', border: '1px solid #bbf7d0' }}>
            <div style={{ fontSize: '0.9rem' }}>
              Signed in as <strong>{current.name}</strong> ({ROLE_LABEL[current.role] ?? current.role})
              <div style={{ color: '#6b7280', fontSize: '0.8rem' }}>{current.email}</div>
            </div>
            <div style={{ display: 'flex', gap: '8px', marginTop: '0.75rem', flexWrap: 'wrap' }}>
              <button type="button" onClick={() => navigate(homeFor(current.role), { replace: true })} style={{ ...button, flex: 1 }}>
                Continue to {current.role === 'KITCHEN' ? 'kitchen' : 'dashboard'}
              </button>
              <button type="button" onClick={signOut} style={{ ...button, flex: 1, backgroundColor: '#fff', color: '#111827', border: '1px solid #d1d5db' }}>
                Use another account
              </button>
            </div>
          </div>
        )}

        {current === null && (
          <form onSubmit={handleLogin} noValidate>
            {error && <div role="alert" style={{ color: '#b91c1c', backgroundColor: '#fef2f2', padding: '0.6rem 0.75rem', borderRadius: '6px', marginBottom: '1rem', fontSize: '0.9rem' }}>{error}</div>}
            <div style={{ marginBottom: '1rem' }}>
              <label htmlFor="login-email" style={label}>Email</label>
              <input id="login-email" autoComplete="username" type="email" value={email} onChange={e => setEmail(e.target.value)} style={input} required autoFocus />
            </div>
            <div style={{ marginBottom: '1rem' }}>
              <label htmlFor="login-password" style={label}>Password</label>
              <input id="login-password" autoComplete="current-password" type="password" value={password} onChange={e => setPassword(e.target.value)} style={input} required />
            </div>

            <div style={{ marginBottom: '1.25rem', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <input
                id="login-remember"
                type="checkbox"
                checked={rememberMe}
                onChange={e => setRememberMe(e.target.checked)}
                style={{ width: '16px', height: '16px', cursor: 'pointer', accentColor: '#111827' }}
              />
              <label htmlFor="login-remember" style={{ fontSize: '0.85rem', color: '#374151', cursor: 'pointer', userSelect: 'none' }}>
                ログイン状態を保持する（次回から自動ログイン）
              </label>
            </div>

            <div style={{ marginBottom: '1rem', padding: '0.5rem 0.75rem', backgroundColor: '#f9fafb', borderRadius: '6px', border: '1px solid #e5e7eb', fontSize: '0.75rem', color: '#6b7280', display: 'flex', alignItems: 'center', gap: '6px' }}>
              <ShieldCheck size={14} style={{ color: '#059669', flexShrink: 0 }} />
              <span>未選択時はブラウザ終了またはシステム再起動で自動ログアウトされます。</span>
            </div>

            <button type="submit" disabled={busy || !email.trim() || !password} style={{ ...button, width: '100%', opacity: busy || !email.trim() || !password ? 0.6 : 1 }}>
              {busy ? 'Signing in…' : 'Sign In'}
            </button>
          </form>
        )}
        {current === undefined && <p style={{ textAlign: 'center', color: '#6b7280' }} aria-busy="true">Checking…</p>}

        <p style={{ margin: '1.5rem 0 0', textAlign: 'center', fontSize: '0.8rem', color: '#6b7280' }}>
          Customer? <Link to="/account/login" style={{ color: '#b5451b', fontWeight: 600 }}>会員ログインはこちら</Link>
        </p>
      </div>
    </div>
  );
}

const label = { display: 'block', marginBottom: '0.4rem', fontSize: '0.875rem', fontWeight: 500 } as const;
const input = { width: '100%', padding: '0.65rem', border: '1px solid #d1d5db', borderRadius: '6px', boxSizing: 'border-box', fontSize: '1rem' } as const;
const button = { padding: '0.75rem', backgroundColor: '#000', color: 'white', border: 'none', borderRadius: '6px', cursor: 'pointer', fontWeight: 'bold' } as const;
