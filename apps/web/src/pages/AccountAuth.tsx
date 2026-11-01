import { useEffect, useState, type ChangeEvent, type FormEvent } from 'react';
import { Link, Navigate, useNavigate, useSearchParams } from 'react-router-dom';
import { apiFetch, errorMessage, getPublic } from '../lib/api';
import { useCustomer } from '../lib/customer-context';
import { offerLabel, toHalfWidth, yen } from '../lib/format';
import { cardStyle, inputStyle, labelStyle, mutedStyle } from '../components/account/styles';

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


export default function AccountAuth({ mode }: { mode: 'login' | 'register' }) {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const { customer, signIn } = useCustomer();
  const benefits = useBenefits();
  const [form, setForm] = useState({ name: '', email: '', phone: '', password: '' });
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const next = safeNext(params.get('next'));
  const isRegister = mode === 'register';

  if (customer) return <Navigate to={next} replace />;

  const handleChange = (e: ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setForm(prev => ({ ...prev, [name]: name === 'phone' ? toHalfWidth(value) : value }));
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    setSubmitting(true);
    try {
      const body = isRegister ? form : { email: form.email, password: form.password };
      const res = await apiFetch(`/api/v1/customers/${isRegister ? 'register' : 'login'}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        setError(await errorMessage(res, isRegister ? '登録できませんでした。入力内容をご確認ください。' : 'ログインできませんでした。'));
        return;
      }
      const data = await res.json();
      if (data.token) {
        localStorage.setItem('kalpana_customer_token', data.token);
      }
      signIn(data.customer);
      navigate(next, { replace: true });
    } catch {
      setError('通信エラーが発生しました。もう一度お試しください。');
    } finally {
      setSubmitting(false);
    }
  };

  const otherLink = `${isRegister ? '/account/login' : '/account/register'}${params.get('next') ? `?next=${encodeURIComponent(next)}` : ''}`;

  return (
    <main>
      <title>{`${isRegister ? '会員登録' : 'ログイン'} | Adarsha (アダルサ)`}</title>
      <meta name="robots" content="noindex" />
      <div className="section" style={{ backgroundColor: 'var(--cream)', paddingTop: '120px', minHeight: '70vh' }}>
        <div style={{ maxWidth: '960px', margin: '0 auto', padding: '0 16px' }}>
          <div className="centered" style={{ marginBottom: '32px' }}>
            <div className="section-label">MEMBERS</div>
            <h1 className="section-title">{isRegister ? <>会員<em>登録</em></> : <>会員<em>ログイン</em></>}</h1>
            <div className="divider"></div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 280px), 1fr))', gap: '24px', alignItems: 'start' }}>
            <form onSubmit={handleSubmit} style={{ ...cardStyle, display: 'flex', flexDirection: 'column', gap: '16px' }}>
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
                パスワード{isRegister && '（8文字以上）'}
                <input name="password" type="password" required minLength={isRegister ? 8 : 1} maxLength={200} autoComplete={isRegister ? 'new-password' : 'current-password'} value={form.password} onChange={handleChange} style={inputStyle} />
              </label>

              {error && <p role="alert" style={{ margin: 0, color: '#b91c1c', fontSize: '0.9rem' }}>{error}</p>}

              <button type="submit" className="btn-warm" disabled={submitting} style={{ opacity: submitting ? 0.7 : 1 }}>
                {submitting ? '送信中…' : isRegister ? '登録してはじめる' : 'ログイン'}
              </button>
              <p style={{ ...mutedStyle, margin: 0, textAlign: 'center' }}>
                {isRegister ? 'すでに会員の方は' : 'はじめての方は'} <Link to={otherLink} style={{ color: 'var(--spice)', fontWeight: 'bold' }}>{isRegister ? 'ログイン' : '会員登録（無料）'}</Link>
              </p>
              {!isRegister && <p style={{ ...mutedStyle, margin: 0, textAlign: 'center' }}>パスワードをお忘れの方は店舗までお問い合わせください。</p>}
            </form>

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
            </section>
          </div>
        </div>
      </div>
    </main>
  );
}
