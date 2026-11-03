import { useEffect, useState, type ChangeEvent, type FormEvent } from 'react';
import { Link, Navigate, useSearchParams } from 'react-router-dom';
import { apiFetch, getPublic } from '../lib/api';
import { useCustomer } from '../lib/customer-context';
import { setCustomerSession } from '../lib/auth-storage';
import { offerLabel, toHalfWidth, yen } from '../lib/format';
import { cardStyle, inputStyle, labelStyle, mutedStyle } from '../components/account/styles';
import { CheckCircle2, Mail, RefreshCw, ShieldCheck, Info } from 'lucide-react';

interface Benefit {
  icon: string;
  text: string;
  strong?: boolean;
}

interface PublicSettings {
  signupBonusPoints?: number;
  pointsEnabled?: boolean;
  pointsPer100Yen?: number;
  stampCardEnabled?: boolean;
  stampsPerCard?: number;
  stampMinAmount?: number;
  stampRewards?: { at: number; titleJa: string }[];
}

/** The benefits list, built from the live settings and offers (Admin → Stamps, Offers & Points). */
function useBenefits(): Benefit[] {
  const [settings, setSettings] = useState<PublicSettings | null>(null);
  const [offers, setOffers] = useState<{ id: string; titleJa: string; discountType: 'PERCENT' | 'AMOUNT'; discountValue: number; minSubtotal: number }[]>([]);
  useEffect(() => {
    getPublic<PublicSettings>('/api/v1/settings').then(setSettings).catch(() => setSettings({}));
    fetch('/api/v1/offers').then(res => (res.ok ? res.json() : [])).then(setOffers).catch(() => setOffers([]));
  }, []);

  const list: Benefit[] = [];
  const bonus = settings?.signupBonusPoints ?? 0;
  const pointsOn = settings?.pointsEnabled !== false;
  if (pointsOn && bonus > 0) list.push({ icon: '🎉', text: `今なら会員登録で ${bonus.toLocaleString('ja-JP')}pt プレゼント`, strong: true });
  for (const offer of offers.slice(0, 3)) {
    list.push({ icon: '🏷️', text: `会員限定：${offer.titleJa}（${offerLabel(offer)}${offer.minSubtotal > 0 ? `・${yen(offer.minSubtotal)}以上` : ''}）`, strong: true });
  }
  if (pointsOn) list.push({ icon: '🎁', text: `¥100ごとに${settings?.pointsPer100Yen ?? 1}ptが貯まり、次回のお支払いに使えます` });
  if (settings?.stampCardEnabled !== false && settings) {
    const firstReward = [...(settings.stampRewards ?? [])].sort((a, b) => a.at - b.at)[0];
    list.push({
      icon: '🟥',
      text: `${yen(settings.stampMinAmount ?? 1000)}以上のご注文でスタンプ1個${firstReward ? `。${firstReward.at}個で「${firstReward.titleJa}」` : ''}`,
    });
  }
  if (offers.length === 0) list.push({ icon: '🏷️', text: '会員限定のお得な特典をご利用いただけます' });
  list.push({ icon: '🧾', text: '注文履歴から、いつものメニューをワンタップで再注文' });
  list.push({ icon: '⚡', text: 'お名前・電話番号の入力が不要になり、注文がスムーズに' });
  return list;
}

/** Only same-site paths are followed after login, so ?next= can't send people to another website. */
const safeNext = (next: string | null) => (next && next.startsWith('/') && !next.startsWith('//') ? next : '/account');

export default function AccountAuth({ mode }: { mode: 'login' | 'register' | 'verify' }) {
  const [params] = useSearchParams();
  const { customer, signIn } = useCustomer();
  const benefits = useBenefits();
  const next = safeNext(params.get('next'));
  const isRegister = mode === 'register';

  const [step, setStep] = useState<'form' | 'verify'>(mode === 'verify' ? 'verify' : 'form');
  const [form, setForm] = useState({ name: '', email: '', phone: '', password: '' });
  const [rememberMe, setRememberMe] = useState(false);
  const [verifyingEmail, setVerifyingEmail] = useState<string>(params.get('email') || '');
  const [verificationCode, setVerificationCode] = useState<string>('');
  const [error, setError] = useState('');
  const [infoMsg, setInfoMsg] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [resendCooldown, setResendCooldown] = useState(0);
  const reason = params.get('reason');

  // Auto-verify if ?token= and ?email= are present in URL
  useEffect(() => {
    const token = params.get('token');
    const email = params.get('email');
    if (token && email) {
      setStep('verify');
      setVerifyingEmail(email);
      setSubmitting(true);
      setError('');
      apiFetch(`/api/v1/customers/verify-code`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, token, rememberMe }),
      })
        .then(async res => {
          if (res.ok) {
            const data = await res.json();
            if (data.token) setCustomerSession(data.token, rememberMe);
            if (data.customer) signIn(data.customer);
            window.location.assign(next);
          } else {
            setError('認証リンクの有効期限が切れているか無効です。確認コードを入力してください。');
          }
        })
        .catch(() => {
          setError('認証リンクの確認中にエラーが発生しました。コードを入力してください。');
        })
        .finally(() => setSubmitting(false));
    }
  }, [params, next, signIn]);

  // Resend cooldown timer
  useEffect(() => {
    if (resendCooldown <= 0) return;
    const timer = setInterval(() => {
      setResendCooldown(prev => Math.max(0, prev - 1));
    }, 1000);
    return () => clearInterval(timer);
  }, [resendCooldown]);

  if (customer) return <Navigate to={next} replace />;

  const handleChange = (e: ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setForm(prev => ({ ...prev, [name]: name === 'phone' ? toHalfWidth(value) : value }));
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    setInfoMsg('');
    setSubmitting(true);
    try {
      const body = isRegister ? { ...form, rememberMe } : { email: form.email, password: form.password, rememberMe };
      const res = await apiFetch(`/api/v1/customers/${isRegister ? 'register' : 'login'}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      const data = await res.json();

      if (!res.ok) {
        if (data?.requiresVerification) {
          setVerifyingEmail(data.email || form.email);
          setStep('verify');
          setInfoMsg(data.error?.message || 'メールアドレスの確認が完了していません。確認コードを入力してください。');
          setResendCooldown(60);
          return;
        }
        setError(data?.error?.message || (isRegister ? '登録できませんでした。入力内容をご確認ください。' : 'ログインできませんでした。'));
        return;
      }

      if (data.requiresVerification) {
        setVerifyingEmail(data.email || form.email);
        setStep('verify');
        setInfoMsg(data.message || `確認コードを ${data.email || form.email} 宛に送信しました。`);
        setResendCooldown(60);
        return;
      }

      if (data.token) {
        setCustomerSession(data.token, rememberMe);
      }
      if (data.customer) {
        signIn(data.customer);
      }
      window.location.assign(next);
    } catch {
      setError('通信エラーが発生しました。もう一度お試しください。');
    } finally {
      setSubmitting(false);
    }
  };

  const handleVerifySubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!verificationCode.trim()) {
      setError('6桁の確認コードを入力してください。');
      return;
    }
    setError('');
    setInfoMsg('');
    setSubmitting(true);
    try {
      const res = await apiFetch('/api/v1/customers/verify-code', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: verifyingEmail, code: verificationCode.trim(), rememberMe }),
      });

      const data = await res.json();
      if (!res.ok) {
        setError(data?.error?.message || '確認コードが正しくありません。再度ご確認ください。');
        return;
      }

      if (data.token) {
        setCustomerSession(data.token, rememberMe);
      }
      if (data.customer) {
        signIn(data.customer);
      }
      window.location.assign(next);
    } catch {
      setError('通信エラーが発生しました。もう一度お試しください。');
    } finally {
      setSubmitting(false);
    }
  };

  const handleResend = async () => {
    if (resendCooldown > 0 || !verifyingEmail) return;
    setError('');
    setInfoMsg('');
    try {
      const res = await apiFetch('/api/v1/customers/resend-code', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: verifyingEmail }),
      });
      const data = await res.json();
      if (res.ok) {
        setInfoMsg(data.message || '新しい確認コードをメールに再送信しました。');
        setResendCooldown(60);
      } else {
        setError(data?.error?.message || '再送信に失敗しました。時間をおいてお試しください。');
      }
    } catch {
      setError('再送信に失敗しました。通信環境をご確認ください。');
    }
  };

  const otherLink = `${isRegister ? '/account/login' : '/account/register'}${params.get('next') ? `?next=${encodeURIComponent(next)}` : ''}`;

  return (
    <main>
      <title>{`${step === 'verify' ? 'メール認証' : isRegister ? '会員登録' : 'ログイン'} | Adarsha (アダルサ)`}</title>
      <meta name="robots" content="noindex" />
      <div className="section" style={{ backgroundColor: 'var(--cream)', paddingTop: '120px', minHeight: '70vh' }}>
        <div style={{ maxWidth: '960px', margin: '0 auto', padding: '0 16px' }}>
          <div className="centered" style={{ marginBottom: '32px' }}>
            <div className="section-label">MEMBERS</div>
            <h1 className="section-title">
              {step === 'verify' ? (
                <>メール<em>認証</em></>
              ) : isRegister ? (
                <>会員<em>登録</em></>
              ) : (
                <>会員<em>ログイン</em></>
              )}
            </h1>
            <div className="divider"></div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 280px), 1fr))', gap: '24px', alignItems: 'start' }}>
            {step === 'verify' ? (
              <form onSubmit={handleVerifySubmit} style={{ ...cardStyle, display: 'flex', flexDirection: 'column', gap: '16px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, background: '#fff7ed', border: '1px solid #fed7aa', padding: '12px 14px', borderRadius: 8 }}>
                  <Mail size={24} color="#ea580c" />
                  <div style={{ fontSize: '0.86rem', color: '#7c2d12', lineHeight: 1.5 }}>
                    <strong>確認コードを送信しました</strong>
                    <div style={{ marginTop: 2, wordBreak: 'break-all' }}>{verifyingEmail}</div>
                  </div>
                </div>

                <p style={{ margin: 0, fontSize: '0.88rem', color: '#4b5563', lineHeight: 1.6 }}>
                  メール宛に届いた<strong>6桁の確認コード</strong>を入力して認証を完了してください。（送信元: <code>4ogcafe@gmail.com</code>）
                </p>

                {infoMsg && (
                  <div style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 8, padding: '10px 12px', color: '#166534', fontSize: '0.85rem' }}>
                    {infoMsg}
                  </div>
                )}

                {error && (
                  <div role="alert" style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 8, padding: '10px 12px', color: '#b91c1c', fontSize: '0.85rem' }}>
                    {error}
                  </div>
                )}

                <label style={labelStyle}>
                  確認コード（6桁の数字）
                  <input
                    type="text"
                    inputMode="numeric"
                    pattern="[0-9]*"
                    maxLength={6}
                    required
                    autoFocus
                    placeholder="123456"
                    value={verificationCode}
                    onChange={e => setVerificationCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                    style={{
                      ...inputStyle,
                      textAlign: 'center',
                      fontSize: '1.6rem',
                      letterSpacing: '0.3em',
                      fontWeight: 800,
                      padding: '12px',
                    }}
                  />
                </label>

                <button type="submit" className="btn-warm" disabled={submitting || verificationCode.length < 6} style={{ opacity: submitting || verificationCode.length < 6 ? 0.7 : 1 }}>
                  {submitting ? '認証中…' : '認証を完了してログイン'}
                </button>

                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 8 }}>
                  <button
                    type="button"
                    onClick={handleResend}
                    disabled={resendCooldown > 0}
                    style={{
                      background: 'none',
                      border: 'none',
                      color: resendCooldown > 0 ? '#9ca3af' : 'var(--spice)',
                      fontWeight: 700,
                      fontSize: '0.82rem',
                      cursor: resendCooldown > 0 ? 'not-allowed' : 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: 4,
                      padding: 0,
                    }}
                  >
                    <RefreshCw size={14} className={resendCooldown > 0 ? '' : ''} />
                    {resendCooldown > 0 ? `再送信まで（${resendCooldown}秒）` : 'コードを再送信'}
                  </button>

                  <button
                    type="button"
                    onClick={() => { setStep('form'); setError(''); }}
                    style={{
                      background: 'none',
                      border: 'none',
                      color: '#6b7280',
                      fontSize: '0.82rem',
                      cursor: 'pointer',
                      padding: 0,
                      textDecoration: 'underline',
                    }}
                  >
                    メールアドレスを変更
                  </button>
                </div>
              </form>
            ) : (
              <form onSubmit={handleSubmit} style={{ ...cardStyle, display: 'flex', flexDirection: 'column', gap: '16px' }}>
                {reason === 'idle_timeout' && (
                  <div role="status" style={{ display: 'flex', alignItems: 'flex-start', gap: '8px', color: '#92400e', backgroundColor: '#fef3c7', border: '1px solid #fde68a', padding: '0.65rem 0.75rem', borderRadius: '6px', fontSize: '0.85rem', lineHeight: 1.4 }}>
                    <Info size={18} style={{ flexShrink: 0, marginTop: '2px' }} />
                    <div>一定時間操作がなかったため、セキュリティ保護のため安全に自動ログアウトしました。</div>
                  </div>
                )}
                {reason === 'session_expired' && (
                  <div role="status" style={{ display: 'flex', alignItems: 'flex-start', gap: '8px', color: '#1e40af', backgroundColor: '#eff6ff', border: '1px solid #bfdbfe', padding: '0.65rem 0.75rem', borderRadius: '6px', fontSize: '0.85rem', lineHeight: 1.4 }}>
                    <Info size={18} style={{ flexShrink: 0, marginTop: '2px' }} />
                    <div>セッションが終了しました。再度ログインしてください。</div>
                  </div>
                )}
                {isRegister && (
                  <label style={labelStyle}>
                    お名前
                    <input name="name" required maxLength={100} autoComplete="name" value={form.name} onChange={handleChange} style={inputStyle} />
                  </label>
                )}
                <label style={labelStyle}>
                  メールアドレス
                  <input name="email" type="email" required maxLength={254} autoComplete="email" value={form.email} onChange={handleChange} style={inputStyle} />
                </label>
                {isRegister && (
                  <label style={labelStyle}>
                    電話番号（任意・ご注文時に自動入力）
                    <input name="phone" type="tel" inputMode="tel" pattern="[\d\s\-\+\(\)]{8,20}" autoComplete="tel" placeholder="090-1234-5678" value={form.phone} onChange={handleChange} style={inputStyle} />
                  </label>
                )}
                <label style={labelStyle}>
                  パスワード{isRegister && '（6文字以上）'}
                  <input name="password" type="password" required minLength={isRegister ? 6 : 1} maxLength={200} autoComplete={isRegister ? 'new-password' : 'current-password'} value={form.password} onChange={handleChange} style={inputStyle} />
                </label>

                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', margin: '2px 0' }}>
                  <input
                    id="customer-remember"
                    type="checkbox"
                    checked={rememberMe}
                    onChange={e => setRememberMe(e.target.checked)}
                    style={{ width: '16px', height: '16px', cursor: 'pointer', accentColor: 'var(--spice)' }}
                  />
                  <label htmlFor="customer-remember" style={{ fontSize: '0.85rem', color: '#374151', cursor: 'pointer', userSelect: 'none' }}>
                    ログイン状態を保持する（次回から自動ログイン）
                  </label>
                </div>

                <div style={{ padding: '0.5rem 0.75rem', backgroundColor: '#f9fafb', borderRadius: '6px', border: '1px solid #e5e7eb', fontSize: '0.75rem', color: '#6b7280', display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <ShieldCheck size={14} style={{ color: '#059669', flexShrink: 0 }} />
                  <span>未選択時はブラウザ終了またはシステム再起動で自動ログアウトされます。</span>
                </div>

                {error && <p role="alert" style={{ margin: 0, color: '#b91c1c', fontSize: '0.9rem' }}>{error}</p>}
                {infoMsg && <p style={{ margin: 0, color: '#166534', fontSize: '0.9rem' }}>{infoMsg}</p>}

                <button type="submit" className="btn-warm" disabled={submitting} style={{ opacity: submitting ? 0.7 : 1 }}>
                  {submitting ? '送信中…' : isRegister ? '認証コードを送信して登録' : 'ログイン'}
                </button>
                <p style={{ ...mutedStyle, margin: 0, textAlign: 'center' }}>
                  {isRegister ? 'すでに会員の方は' : 'はじめての方は'} <Link to={otherLink} style={{ color: 'var(--spice)', fontWeight: 'bold' }}>{isRegister ? 'ログイン' : '会員登録（無料）'}</Link>
                </p>
                {!isRegister && <p style={{ ...mutedStyle, margin: 0, textAlign: 'center' }}>パスワードをお忘れの方は店舗までお問い合わせください。</p>}
              </form>
            )}

            <section style={cardStyle} aria-labelledby="benefits-heading">
              <h2 id="benefits-heading" style={{ fontSize: '1.2rem', color: 'var(--dark-bark)', marginTop: 0 }}>会員特典</h2>
              <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: '14px' }}>
                {benefits.map(benefit => (
                  <li key={benefit.text} style={{ display: 'flex', gap: '12px', alignItems: 'flex-start', lineHeight: 1.6 }}>
                    <span aria-hidden="true" style={{ fontSize: '1.4rem' }}>{benefit.icon}</span>
                    <span style={benefit.strong ? { fontWeight: 700, color: 'var(--spice)' } : undefined}>{benefit.text}</span>
                  </li>
                ))}
              </ul>
              {step === 'verify' && (
                <div style={{ marginTop: 20, paddingTop: 16, borderTop: '1px solid #f3f4f6', fontSize: '0.8rem', color: '#6b7280' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: '#059669', fontWeight: 700, marginBottom: 4 }}>
                    <CheckCircle2 size={16} /> メールアドレス認証の安全性
                  </div>
                  認証完了後、すぐにお持ち帰り・店内注文のポイント還元や特典をご利用いただけます。
                </div>
              )}
            </section>
          </div>
        </div>
      </div>
    </main>
  );
}
