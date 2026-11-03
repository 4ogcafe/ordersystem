import { useEffect, useState, type ChangeEvent, type FormEvent } from 'react';
import { Link, Navigate, useSearchParams } from 'react-router-dom';
import { apiFetch, getPublic } from '../lib/api';
import { useCustomer } from '../lib/customer-context';
import { setCustomerSession } from '../lib/auth-storage';
import { offerLabel, toHalfWidth, yen } from '../lib/format';
import { cardStyle, inputStyle, labelStyle, mutedStyle } from '../components/account/styles';
import {
  CheckCircle2,
  Mail,
  RefreshCw,
  ShieldCheck,
  Info,
  Eye,
  EyeOff,
  ChevronLeft,
  Ticket,
  Coins,
  Award,
  History,
  Zap,
  Gift,
  LogIn,
  UserPlus,
  Sparkles,
  HelpCircle,
  Lock,
  User,
  Phone,
} from 'lucide-react';

interface BenefitItem {
  iconType: 'coupon' | 'bonus' | 'points' | 'stamps' | 'history' | 'speed';
  title: string;
  subtitle?: string;
  badge?: string;
  highlight?: boolean;
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
function useBenefits(): BenefitItem[] {
  const [settings, setSettings] = useState<PublicSettings | null>(null);
  const [offers, setOffers] = useState<{ id: string; titleJa: string; discountType: 'PERCENT' | 'AMOUNT'; discountValue: number; minSubtotal: number }[]>([]);
  useEffect(() => {
    getPublic<PublicSettings>('/api/v1/settings').then(setSettings).catch(() => setSettings({}));
    fetch('/api/v1/offers').then(res => (res.ok ? res.json() : [])).then(setOffers).catch(() => setOffers([]));
  }, []);

  const list: BenefitItem[] = [];
  const bonus = settings?.signupBonusPoints ?? 0;
  const pointsOn = settings?.pointsEnabled !== false;

  if (pointsOn && bonus > 0) {
    list.push({
      iconType: 'bonus',
      title: `新規入会特典：${bonus.toLocaleString('ja-JP')}pt プレゼント`,
      subtitle: '登録完了後、初回のご注文からすぐにお値引きに使えます',
      badge: '入会記念',
      highlight: true,
    });
  }

  for (const offer of offers.slice(0, 2)) {
    list.push({
      iconType: 'coupon',
      title: `会員限定：${offer.titleJa}`,
      subtitle: `${offerLabel(offer)}${offer.minSubtotal > 0 ? `（${yen(offer.minSubtotal)}以上のご注文）` : ''}`,
      badge: '特別クーポン',
      highlight: true,
    });
  }

  if (pointsOn) {
    list.push({
      iconType: 'points',
      title: `ご利用¥100ごとに${settings?.pointsPer100Yen ?? 1}pt貯まる`,
      subtitle: '1pt＝1円として、次回テイクアウトや店内飲食で使えます',
      badge: 'ポイント還元',
    });
  }

  if (settings?.stampCardEnabled !== false) {
    const minAmt = settings?.stampMinAmount ?? 1000;
    const firstReward = [...(settings?.stampRewards ?? [])].sort((a, b) => a.at - b.at)[0];
    list.push({
      iconType: 'stamps',
      title: `${yen(minAmt)}以上のご注文でスタンプ1個`,
      subtitle: firstReward ? `${firstReward.at}個達成で「${firstReward.titleJa}」を無料進呈！` : 'スタンプを貯めて豪華無料プレゼントを獲得',
      badge: 'スタンプカード',
    });
  }

  list.push({
    iconType: 'history',
    title: '注文履歴からワンタップで再注文',
    subtitle: 'いつものカレーやナンをお気に入りのカスタマイズで簡単注文',
  });

  list.push({
    iconType: 'speed',
    title: 'お名前・電話番号の入力が不要に',
    subtitle: '事前WEB注文やテイクアウトが最短数タップで完了します',
  });

  return list;
}

function BenefitIcon({ type }: { type: BenefitItem['iconType'] }) {
  switch (type) {
    case 'bonus':
      return (
        <div style={{ width: 36, height: 36, borderRadius: '10px', background: 'linear-gradient(135deg, #f97316, #ea580c)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, boxShadow: '0 2px 6px rgba(234,88,12,0.25)' }}>
          <Gift size={18} />
        </div>
      );
    case 'coupon':
      return (
        <div style={{ width: 36, height: 36, borderRadius: '10px', background: 'linear-gradient(135deg, #b3471c, #9a3412)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, boxShadow: '0 2px 6px rgba(179,71,28,0.25)' }}>
          <Ticket size={18} />
        </div>
      );
    case 'points':
      return (
        <div style={{ width: 36, height: 36, borderRadius: '10px', background: 'linear-gradient(135deg, #f59e0b, #d97706)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, boxShadow: '0 2px 6px rgba(217,119,6,0.25)' }}>
          <Coins size={18} />
        </div>
      );
    case 'stamps':
      return (
        <div style={{ width: 36, height: 36, borderRadius: '10px', background: 'linear-gradient(135deg, #ef4444, #dc2626)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, boxShadow: '0 2px 6px rgba(220,38,38,0.25)' }}>
          <Award size={18} />
        </div>
      );
    case 'history':
      return (
        <div style={{ width: 36, height: 36, borderRadius: '10px', background: 'linear-gradient(135deg, #3b82f6, #2563eb)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, boxShadow: '0 2px 6px rgba(37,99,235,0.25)' }}>
          <History size={18} />
        </div>
      );
    case 'speed':
      return (
        <div style={{ width: 36, height: 36, borderRadius: '10px', background: 'linear-gradient(135deg, #10b981, #059669)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, boxShadow: '0 2px 6px rgba(5,150,105,0.25)' }}>
          <Zap size={18} />
        </div>
      );
  }
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
  const [showPassword, setShowPassword] = useState(false);
  const [showForgotHelp, setShowForgotHelp] = useState(false);
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
  }, [params, next, signIn, rememberMe]);

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
      <title>{`${step === 'verify' ? 'メール認証' : isRegister ? '会員登録' : '会員ログイン'} | Adarsha (アダルサ)`}</title>
      <meta name="robots" content="noindex" />
      <div className="section" style={{ backgroundColor: 'var(--cream)', paddingTop: '96px', paddingBottom: '80px', minHeight: '80vh' }}>
        <div style={{ maxWidth: '980px', margin: '0 auto', padding: '0 16px' }}>
          
          {/* Breadcrumb / Return to Top */}
          <div style={{ marginBottom: '22px' }}>
            <Link
              to="/"
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
                fontSize: '0.86rem',
                color: '#8c786a',
                textDecoration: 'none',
                fontWeight: 600,
                transition: 'color 0.15s ease'
              }}
              onMouseEnter={e => (e.currentTarget.style.color = '#b3471c')}
              onMouseLeave={e => (e.currentTarget.style.color = '#8c786a')}
            >
              <ChevronLeft size={16} />
              ホーム（トップページ）へ戻る
            </Link>
          </div>

          <div className="centered" style={{ marginBottom: '32px' }}>
            <div className="section-label" style={{ letterSpacing: '2px', color: '#b3471c' }}>ADARSHA MEMBERS CLUB</div>
            <h1 className="section-title" style={{ marginTop: '4px', marginBottom: '8px' }}>
              {step === 'verify' ? (
                <>メール<em>認証</em></>
              ) : isRegister ? (
                <>新規<em>会員登録</em></>
              ) : (
                <>会員<em>ログイン</em></>
              )}
            </h1>
            <p style={{ margin: 0, color: '#6b7280', fontSize: '0.94rem' }}>
              {isRegister
                ? '簡単30秒で登録完了！今すぐ使えるお得なクーポンやポイントを進呈中'
                : 'ログインしてポイント残高の確認や特別クーポンをご利用ください'}
            </p>
            <div className="divider" style={{ marginTop: '16px' }}></div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 340px), 1fr))', gap: '28px', alignItems: 'start' }}>
            {step === 'verify' ? (
              <form onSubmit={handleVerifySubmit} style={{ ...cardStyle, boxShadow: '0 4px 20px rgba(0,0,0,0.06)', display: 'flex', flexDirection: 'column', gap: '18px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, background: '#fff7ed', border: '1px solid #fed7aa', padding: '12px 14px', borderRadius: 10 }}>
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

                <button type="submit" className="btn-warm" disabled={submitting || verificationCode.length < 6} style={{ opacity: submitting || verificationCode.length < 6 ? 0.7 : 1, padding: '14px', fontSize: '1rem', fontWeight: 700 }}>
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
                    <RefreshCw size={14} />
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
              <form onSubmit={handleSubmit} style={{ ...cardStyle, boxShadow: '0 4px 20px rgba(0,0,0,0.06)', display: 'flex', flexDirection: 'column', gap: '16px' }}>
                
                {/* Mode Switcher Tabs */}
                <div style={{ display: 'flex', background: '#f3efe8', padding: '4px', borderRadius: '12px', gap: '4px', marginBottom: '4px' }}>
                  <Link
                    to={`/account/login${params.get('next') ? `?next=${encodeURIComponent(next)}` : ''}`}
                    style={{
                      flex: 1,
                      textAlign: 'center',
                      padding: '10px 14px',
                      borderRadius: '8px',
                      fontWeight: 700,
                      fontSize: '0.92rem',
                      textDecoration: 'none',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: '6px',
                      transition: 'all 0.15s ease',
                      background: !isRegister ? '#ffffff' : 'transparent',
                      color: !isRegister ? '#b3471c' : '#6b7280',
                      boxShadow: !isRegister ? '0 2px 6px rgba(0,0,0,0.06)' : 'none',
                    }}
                  >
                    <LogIn size={16} /> ログイン
                  </Link>
                  <Link
                    to={`/account/register${params.get('next') ? `?next=${encodeURIComponent(next)}` : ''}`}
                    style={{
                      flex: 1,
                      textAlign: 'center',
                      padding: '10px 14px',
                      borderRadius: '8px',
                      fontWeight: 700,
                      fontSize: '0.92rem',
                      textDecoration: 'none',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: '6px',
                      transition: 'all 0.15s ease',
                      background: isRegister ? '#ffffff' : 'transparent',
                      color: isRegister ? '#b3471c' : '#6b7280',
                      boxShadow: isRegister ? '0 2px 6px rgba(0,0,0,0.06)' : 'none',
                    }}
                  >
                    <UserPlus size={16} /> 新規登録（無料）
                  </Link>
                </div>

                {reason === 'idle_timeout' && (
                  <div role="status" style={{ display: 'flex', alignItems: 'flex-start', gap: '8px', color: '#92400e', backgroundColor: '#fef3c7', border: '1px solid #fde68a', padding: '0.65rem 0.75rem', borderRadius: '8px', fontSize: '0.85rem', lineHeight: 1.4 }}>
                    <Info size={18} style={{ flexShrink: 0, marginTop: '2px' }} />
                    <div>一定時間操作がなかったため、セキュリティ保護のため安全に自動ログアウトしました。</div>
                  </div>
                )}
                {reason === 'session_expired' && (
                  <div role="status" style={{ display: 'flex', alignItems: 'flex-start', gap: '8px', color: '#1e40af', backgroundColor: '#eff6ff', border: '1px solid #bfdbfe', padding: '0.65rem 0.75rem', borderRadius: '8px', fontSize: '0.85rem', lineHeight: 1.4 }}>
                    <Info size={18} style={{ flexShrink: 0, marginTop: '2px' }} />
                    <div>セッションが終了しました。再度ログインしてください。</div>
                  </div>
                )}

                {isRegister && (
                  <label style={labelStyle}>
                    <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <User size={15} style={{ color: '#b3471c' }} /> お名前
                    </span>
                    <input
                      name="name"
                      required
                      maxLength={100}
                      autoComplete="name"
                      placeholder="例：山田 太郎"
                      value={form.name}
                      onChange={handleChange}
                      style={inputStyle}
                    />
                  </label>
                )}

                <label style={labelStyle}>
                  <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <Mail size={15} style={{ color: '#b3471c' }} /> メールアドレス
                  </span>
                  <input
                    name="email"
                    type="email"
                    required
                    maxLength={254}
                    autoComplete="email"
                    placeholder="example@email.com"
                    value={form.email}
                    onChange={handleChange}
                    style={inputStyle}
                  />
                </label>

                {isRegister && (
                  <label style={labelStyle}>
                    <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <Phone size={15} style={{ color: '#b3471c' }} /> 電話番号（任意・ご注文時に自動反映）
                    </span>
                    <input
                      name="phone"
                      type="tel"
                      inputMode="tel"
                      pattern="[\d\s\-\+\(\)]{8,20}"
                      autoComplete="tel"
                      placeholder="090-1234-5678"
                      value={form.phone}
                      onChange={handleChange}
                      style={inputStyle}
                    />
                  </label>
                )}

                <label style={labelStyle}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <Lock size={15} style={{ color: '#b3471c' }} /> パスワード{isRegister && '（6文字以上）'}
                    </span>
                    {!isRegister && (
                      <button
                        type="button"
                        onClick={() => setShowForgotHelp(prev => !prev)}
                        style={{
                          background: 'none',
                          border: 'none',
                          color: '#b3471c',
                          fontSize: '0.78rem',
                          fontWeight: 600,
                          cursor: 'pointer',
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: 3,
                          padding: 0
                        }}
                      >
                        <HelpCircle size={13} />
                        パスワードをお忘れですか？
                      </button>
                    )}
                  </div>
                  <div style={{ position: 'relative' }}>
                    <input
                      name="password"
                      type={showPassword ? 'text' : 'password'}
                      required
                      minLength={isRegister ? 6 : 1}
                      maxLength={200}
                      autoComplete={isRegister ? 'new-password' : 'current-password'}
                      placeholder={isRegister ? '半角英数6文字以上' : 'パスワードを入力'}
                      value={form.password}
                      onChange={handleChange}
                      style={{ ...inputStyle, paddingRight: '44px' }}
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(prev => !prev)}
                      aria-label={showPassword ? 'パスワードを隠す' : 'パスワードを表示'}
                      style={{
                        position: 'absolute',
                        right: '12px',
                        top: '50%',
                        transform: 'translateY(-50%)',
                        background: 'none',
                        border: 'none',
                        color: '#9ca3af',
                        cursor: 'pointer',
                        padding: '4px',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                      }}
                    >
                      {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                    </button>
                  </div>
                </label>

                {showForgotHelp && (
                  <div style={{ background: '#fdfbf7', border: '1.5px solid #fed7aa', borderRadius: '10px', padding: '12px 14px', fontSize: '0.82rem', color: '#7c2d12', lineHeight: 1.6 }}>
                    <div style={{ fontWeight: 700, marginBottom: 4, display: 'flex', alignItems: 'center', gap: 6 }}>
                      <HelpCircle size={15} color="#ea580c" /> パスワードをお忘れのお客様
                    </div>
                    ご登録のメールアドレスとお名前をお手元にご用意の上、店頭スタッフにお声がけいただくか、お電話（<a href="tel:0422388991" style={{ color: '#b3471c', fontWeight: 700, textDecoration: 'underline' }}>042-238-8991</a>）または <Link to="/contact" style={{ color: '#b3471c', fontWeight: 700, textDecoration: 'underline' }}>お問い合わせフォーム</Link> よりご連絡ください。安全にアカウント確認およびパスワード再設定をご案内いたします。
                  </div>
                )}

                {/* Auto Logout & Remember Me Box */}
                <div style={{ background: '#faf8f5', border: '1px solid #ebd9c8', borderRadius: '12px', padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <input
                      id="customer-remember"
                      type="checkbox"
                      checked={rememberMe}
                      onChange={e => setRememberMe(e.target.checked)}
                      style={{ width: '18px', height: '18px', cursor: 'pointer', accentColor: '#b3471c' }}
                    />
                    <label htmlFor="customer-remember" style={{ fontSize: '0.88rem', fontWeight: 700, color: '#1f1612', cursor: 'pointer', userSelect: 'none' }}>
                      ログイン状態を保持する（次回から自動ログイン）
                    </label>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'flex-start', gap: '6px', fontSize: '0.76rem', color: '#6b7280', lineHeight: 1.45, paddingLeft: '28px' }}>
                    <ShieldCheck size={14} style={{ color: '#059669', flexShrink: 0, marginTop: '2px' }} />
                    <span>未選択時はブラウザ終了またはシステム再起動で自動ログアウトされます。共用端末でも安心です。</span>
                  </div>
                </div>

                {error && <p role="alert" style={{ margin: 0, color: '#b91c1c', fontSize: '0.88rem', background: '#fef2f2', padding: '8px 12px', borderRadius: '8px', border: '1px solid #fecaca' }}>{error}</p>}
                {infoMsg && <p style={{ margin: 0, color: '#166534', fontSize: '0.88rem', background: '#f0fdf4', padding: '8px 12px', borderRadius: '8px', border: '1px solid #bbf7d0' }}>{infoMsg}</p>}

                <button
                  type="submit"
                  className="btn-warm"
                  disabled={submitting}
                  style={{
                    opacity: submitting ? 0.7 : 1,
                    padding: '14px',
                    fontSize: '1rem',
                    fontWeight: 700,
                    boxShadow: '0 4px 14px rgba(179,71,28,0.25)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '8px'
                  }}
                >
                  {isRegister ? <UserPlus size={18} /> : <LogIn size={18} />}
                  {submitting ? '処理中…' : isRegister ? '認証コードを送信して登録' : 'ログイン'}
                </button>

                <p style={{ ...mutedStyle, margin: 0, textAlign: 'center', fontSize: '0.88rem' }}>
                  {isRegister ? 'すでに会員アカウントをお持ちの方は' : 'まだアカウントをお持ちでない方は'}{' '}
                  <Link to={otherLink} style={{ color: '#b3471c', fontWeight: 'bold', textDecoration: 'underline' }}>
                    {isRegister ? 'ログイン' : '会員登録（無料）'}
                  </Link>
                </p>

                <div style={{ borderTop: '1px dashed #e5e7eb', paddingTop: '10px', marginTop: '4px', textAlign: 'center', fontSize: '0.76rem', color: '#9ca3af', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}>
                  <Lock size={12} /> SSL 256bit 暗号化通信により安全に保護されています
                </div>
              </form>
            )}

            {/* Right Side: Member Benefits Card */}
            <section
              style={{
                ...cardStyle,
                background: 'linear-gradient(180deg, #ffffff 0%, #fffcf8 100%)',
                boxShadow: '0 4px 20px rgba(0,0,0,0.05)',
                border: '1px solid #ebd9c8',
                padding: '24px',
              }}
              aria-labelledby="benefits-heading"
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '18px', paddingBottom: '14px', borderBottom: '1px solid #f0e6dc', flexWrap: 'wrap', gap: '8px' }}>
                <div>
                  <h2 id="benefits-heading" style={{ fontSize: '1.25rem', fontWeight: 800, color: '#1f1612', margin: 0, display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <Sparkles size={20} style={{ color: 'var(--gold)' }} />
                    会員特典・メリット
                  </h2>
                  <p style={{ margin: '4px 0 0', fontSize: '0.8rem', color: '#8c786a' }}>
                    アダルサ公式メンバーズクラブ限定の特別優待
                  </p>
                </div>
                <span style={{ fontSize: '0.74rem', fontWeight: 700, padding: '4px 10px', borderRadius: '20px', background: '#ecfdf5', color: '#047857', border: '1px solid #a7f3d0' }}>
                  入会金・年会費 ずっと無料
                </span>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                {benefits.map((b, i) => (
                  <div
                    key={i}
                    style={{
                      display: 'flex',
                      gap: '12px',
                      alignItems: 'flex-start',
                      padding: '11px 13px',
                      borderRadius: '12px',
                      background: b.highlight ? '#fff8f3' : '#faf8f5',
                      border: b.highlight ? '1.5px solid #fed7aa' : '1px solid #f3efe8',
                      transition: 'all 0.15s ease'
                    }}
                  >
                    <BenefitIcon type={b.iconType} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
                        <span style={{ fontSize: '0.92rem', fontWeight: b.highlight ? 800 : 700, color: b.highlight ? '#b3471c' : '#1f1612', lineHeight: 1.4 }}>
                          {b.title}
                        </span>
                        {b.badge && (
                          <span style={{ fontSize: '0.68rem', padding: '1px 6px', borderRadius: '4px', background: b.highlight ? '#fef3c7' : '#e5e7eb', color: b.highlight ? '#92400e' : '#4b5563', fontWeight: 700 }}>
                            {b.badge}
                          </span>
                        )}
                      </div>
                      {b.subtitle && (
                        <div style={{ fontSize: '0.78rem', color: '#6b7280', marginTop: '3px', lineHeight: 1.45 }}>
                          {b.subtitle}
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>

              {step === 'verify' && (
                <div style={{ marginTop: 20, paddingTop: 16, borderTop: '1px solid #f3f4f6', fontSize: '0.8rem', color: '#6b7280' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: '#059669', fontWeight: 700, marginBottom: 4 }}>
                    <CheckCircle2 size={16} /> メールアドレス認証の安全性
                  </div>
                  認証完了後、すぐにお持ち帰り・店内注文のポイント還元や特典をご利用いただけます。
                </div>
              )}

              <div style={{ marginTop: '22px', paddingTop: '16px', borderTop: '1px solid #f0e6dc', display: 'flex', flexDirection: 'column', gap: '8px', fontSize: '0.76rem', color: '#8c786a' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: '#059669', fontWeight: 700 }}>
                  <ShieldCheck size={16} />
                  <span>SSL 256bit 暗号化通信により、安全に保護されています</span>
                </div>
                <div>※ 店内モバイルオーダー・テイクアウト事前WEB注文のどちらでもポイントやクーポンをご利用いただけます。</div>
              </div>
            </section>
          </div>
        </div>
      </div>
    </main>
  );
}
