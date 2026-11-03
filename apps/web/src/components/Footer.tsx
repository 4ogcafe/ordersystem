import { useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { BookOpen, Clock, ExternalLink, Mail, MapPin, Phone, Store } from 'lucide-react';
import { DEFAULT_FOOTER_LINKS, DEFAULT_TAGLINE } from '../lib/footer';

const SOCIALS = [
  {
    key: 'instagram',
    label: 'Instagram',
    url: 'https://instagram.com/adarsha_restro',
    path: 'M12 2.2c3.2 0 3.6 0 4.8.1 1.2.1 1.8.2 2.2.4.6.2 1 .5 1.4.9.4.4.7.8.9 1.4.2.4.4 1.1.4 2.2.1 1.3.1 1.6.1 4.8s0 3.6-.1 4.8c-.1 1.2-.2 1.8-.4 2.2-.2.6-.5 1-.9 1.4-.4.4-.8.7-1.4.9-.4.2-1.1.4-2.2.4-1.3.1-1.6.1-4.8.1s-3.6 0-4.8-.1c-1.2-.1-1.8-.2-2.2-.4-.6-.2-1-.5-1.4-.9-.4-.4-.7-.8-.9-1.4-.2-.4-.4-1.1-.4-2.2C2.2 15.6 2.2 15.2 2.2 12s0-3.6.1-4.8c.1-1.2.2-1.8.4-2.2.2-.6.5-1 .9-1.4.4-.4.8-.7 1.4-.9.4-.2 1.1-.4 2.2-.4C8.4 2.2 8.8 2.2 12 2.2zm0 4.7a5.1 5.1 0 1 0 0 10.2 5.1 5.1 0 0 0 0-10.2zm0 8.4a3.3 3.3 0 1 1 0-6.6 3.3 3.3 0 0 1 0 6.6zm5.3-9.8a1.2 1.2 0 1 0 0 2.4 1.2 1.2 0 0 0 0-2.4z',
  },
  {
    key: 'x',
    label: 'X (Twitter)',
    url: 'https://x.com/adarsha_japan',
    path: 'M17.8 3h3.1l-6.8 7.7L22 21h-6.3l-4.9-6.4L5.2 21H2.1l7.3-8.3L1.8 3h6.4l4.4 5.9L17.8 3zm-1.1 16.2h1.7L7.4 4.7H5.6l11.1 14.5z',
  },
  {
    key: 'facebook',
    label: 'Facebook',
    url: 'https://facebook.com/adarsharestaurant',
    path: 'M22 12a10 10 0 1 0-11.6 9.9v-7H7.9V12h2.5V9.8c0-2.5 1.5-3.9 3.8-3.9 1.1 0 2.2.2 2.2.2v2.5h-1.3c-1.2 0-1.6.8-1.6 1.6V12h2.8l-.4 2.9h-2.3v7A10 10 0 0 0 22 12z',
  },
  {
    key: 'youtube',
    label: 'YouTube',
    url: 'https://youtube.com/@adarsharestaurant',
    path: 'M23 7.2a3 3 0 0 0-2.1-2.1C19 4.6 12 4.6 12 4.6s-7 0-8.9.5A3 3 0 0 0 1 7.2 31 31 0 0 0 .5 12a31 31 0 0 0 .5 4.8 3 3 0 0 0 2.1 2.1c1.9.5 8.9.5 8.9.5s7 0 8.9-.5a3 3 0 0 0 2.1-2.1 31 31 0 0 0 .5-4.8 31 31 0 0 0-.5-4.8zM9.8 15V9l5.8 3-5.8 3z',
  },
];

const MAIN_STORE = {
  name: 'アダルサ 本店（武蔵境店）',
  address: '〒180-0022 東京都武蔵野市境2-14-10 クレール武蔵野1F',
  access: 'JR中央線 武蔵境駅 nonowa口より徒歩1分',
  hours: 'ランチ 11:00〜16:30 / ディナー 16:30〜23:00',
  holiday: '年中無休',
  phone: '0422-36-2210',
  email: 'info@adarsha.jp',
  mapsUrl: 'https://maps.google.com/?q=%E6%9D%B1%E4%BA%AC%E9%83%BD%E6%AD%A6%E8%94%B5%E9%87%8E%E5%B8%82%E5%A2%832-14-10+%E3%82%AF%E3%83%AC%E3%83%BC%E3%83%AB%E6%AD%A6%E8%94%B5%E9%87%8E1F+%E3%82%A2%E3%83%80%E3%83%AB%E3%82%サ',
};

export default function Footer() {
  const { pathname } = useLocation();
  const [year] = useState(() => String(new Date().getFullYear()));

  const isCurrent = (url: string) => {
    if (url === '/') return pathname === '/';
    return pathname.startsWith(url);
  };

  return (
    <footer className="footer" role="contentinfo">
      <div style={{ maxWidth: '1200px', margin: '0 auto', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 260px), 1fr))', gap: '40px' }}>
        {/* Column 1: Brand & About */}
        <div>
          <Link to="/" style={{ display: 'inline-flex', alignItems: 'center', gap: '10px', textDecoration: 'none', marginBottom: '18px' }} aria-label="Adarsha ホーム">
            <div style={{ height: '44px', width: '44px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <img
                src="/adarsha-log.webp"
                alt="Adarsha (アダルサ) ロゴ"
                width={44}
                height={44}
                style={{ height: '100%', width: '100%', objectFit: 'contain', borderRadius: '50%' }}
              />
            </div>
            <div>
              <div style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: '1.5rem', lineHeight: 1, color: '#ffffff', letterSpacing: '0.02em' }}>
                アダルサ<span style={{ color: 'var(--spice)' }}>.</span>
              </div>
              <span style={{ fontSize: '0.74rem', color: 'rgba(255, 255, 255, 0.72)', display: 'block', marginTop: '3px', letterSpacing: '0.04em' }}>
                本格インド料理店 · ADARSHA
              </span>
            </div>
          </Link>

          <p style={{ fontSize: '0.88rem', lineHeight: 1.8, color: 'rgba(255, 255, 255, 0.8)', margin: '0 0 18px' }}>
            {DEFAULT_TAGLINE}
          </p>

          <div style={{ marginBottom: '20px' }}>
            <Link
              to="/blog"
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '8px',
                backgroundColor: '#c75626',
                color: '#fff',
                padding: '9px 18px',
                borderRadius: '8px',
                fontSize: '0.85rem',
                fontWeight: 700,
                textDecoration: 'none',
                boxShadow: '0 2px 8px rgba(199, 86, 38, 0.35)',
                transition: 'all 0.2s ease',
              }}
              onMouseEnter={e => { e.currentTarget.style.backgroundColor = '#d86330'; e.currentTarget.style.transform = 'translateY(-1px)'; }}
              onMouseLeave={e => { e.currentTarget.style.backgroundColor = '#c75626'; e.currentTarget.style.transform = 'translateY(0)'; }}
            >
              <BookOpen size={16} aria-hidden="true" />
              <span>公式ブログ・スパイスコラム</span>
            </Link>
          </div>

          <ul className="footer-socials" aria-label="SNS公式アカウント">
            {SOCIALS.map(social => (
              <li key={social.key}>
                <a
                  href={social.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label={`Adarsha公式 ${social.label}`}
                  title={`Adarsha公式 ${social.label}`}
                >
                  <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
                    <path d={social.path} fill="currentColor" />
                  </svg>
                </a>
              </li>
            ))}
          </ul>
        </div>

        {/* Column 2: Quick Links */}
        <div>
          <h3>メニュー・リンク</h3>
          <ul style={{ listStyle: 'none', padding: 0, margin: 0, lineHeight: '2.1' }}>
            {DEFAULT_FOOTER_LINKS.map(link => (
              <li key={link.url}>
                <Link
                  to={link.url}
                  className="footer-link"
                  aria-current={isCurrent(link.url) ? 'page' : undefined}
                >
                  {link.label}
                </Link>
              </li>
            ))}
          </ul>
        </div>

        {/* Column 3: Store & Head Office Information */}
        <div>
          <h3>店舗・代表情報</h3>
          <ul className="footer-info">
            <li className="footer-info-name" style={{ fontSize: '1rem', color: '#fff', marginBottom: '4px' }}>
              {MAIN_STORE.name}
            </li>
            <li>
              <MapPin size={16} aria-hidden="true" />
              <div>
                <a
                  href={MAIN_STORE.mapsUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  title="Googleマップで店舗の場所を確認する"
                  style={{ color: '#fed7aa', textDecoration: 'none' }}
                >
                  {MAIN_STORE.address}
                  <ExternalLink size={12} style={{ display: 'inline', marginLeft: '4px', verticalAlign: 'middle', opacity: 0.8 }} />
                </a>
                <span style={{ display: 'block', fontSize: '0.78rem', color: 'rgba(255,255,255,0.65)', marginTop: '2px' }}>
                  {MAIN_STORE.access}
                </span>
              </div>
            </li>
            <li>
              <Clock size={16} aria-hidden="true" />
              <div>
                <span>{MAIN_STORE.hours}</span>
                <span style={{ display: 'block', fontSize: '0.78rem', color: '#86efac', marginTop: '2px', fontWeight: 600 }}>
                  ● {MAIN_STORE.holiday}
                </span>
              </div>
            </li>
            <li>
              <Phone size={16} aria-hidden="true" />
              <a href={`tel:${MAIN_STORE.phone.replace(/[^\d+]/g, '')}`} style={{ fontWeight: 700, color: '#ffffff' }}>
                {MAIN_STORE.phone}
              </a>
            </li>
            <li>
              <Mail size={16} aria-hidden="true" />
              <a href={`mailto:${MAIN_STORE.email}`}>
                {MAIN_STORE.email}
              </a>
            </li>
            <li style={{ marginTop: '8px', paddingTop: '10px', borderTop: '1px dashed rgba(255,255,255,0.15)' }}>
              <Store size={16} aria-hidden="true" style={{ color: '#ea580c' }} />
              <div>
                <span style={{ fontSize: '0.82rem', color: 'rgba(255,255,255,0.85)', display: 'block' }}>
                  全15店舗展開中（武蔵境・東小金井・武蔵小金井 ほか）
                </span>
                <Link
                  to="/about"
                  style={{ fontSize: '0.8rem', color: '#fed7aa', fontWeight: 700, textDecoration: 'none', display: 'inline-block', marginTop: '3px' }}
                >
                  全店舗一覧・詳細を見る →
                </Link>
              </div>
            </li>
          </ul>
        </div>
      </div>

      {/* Bottom Bar: Copyright & Policies */}
      <div
        style={{
          maxWidth: '1200px',
          margin: '40px auto 0',
          paddingTop: '20px',
          borderTop: '1px solid rgba(255,255,255,0.12)',
          display: 'flex',
          flexWrap: 'wrap',
          justifyContent: 'space-between',
          alignItems: 'center',
          gap: '14px',
          fontSize: '0.85rem',
          color: '#9ca3af',
        }}
      >
        <div>
          © {year} インド料理レストラン アダルサ (Adarsha). All Rights Reserved.
        </div>
        <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap', alignItems: 'center' }}>
          <Link to="/privacy-policy" style={{ color: '#d1d5db', textDecoration: 'none' }} className="footer-link">
            プライバシーポリシー
          </Link>
          <span style={{ opacity: 0.3 }}>|</span>
          <Link to="/refund-policy" style={{ color: '#d1d5db', textDecoration: 'none' }} className="footer-link">
            返金・キャンセルポリシー
          </Link>
          <span style={{ opacity: 0.3 }}>|</span>
          <Link to="/careers" style={{ color: '#d1d5db', textDecoration: 'none' }} className="footer-link">
            採用情報
          </Link>
          <span style={{ opacity: 0.3 }}>|</span>
          <Link to="/contact" style={{ color: '#d1d5db', textDecoration: 'none' }} className="footer-link">
            お問い合わせ
          </Link>
          <span style={{ opacity: 0.3 }}>|</span>
          <Link to="/login" style={{ color: '#9ca3af', textDecoration: 'none', fontSize: '0.78rem' }} className="footer-link">
            管理者ログイン
          </Link>
        </div>
      </div>
    </footer>
  );
}
