import { useEffect, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { BookOpen, Clock, Mail, MapPin, Phone } from 'lucide-react';
import { assetUrl, getPublic } from '../lib/api';
import { DEFAULT_FOOTER_LINKS, DEFAULT_TAGLINE, type FooterLink } from '../lib/footer';

// Everything in the footer comes from the admin: Page Settings → Footer (logo, name, description,
// links, copyright) and Restaurant Settings (address, phone, email, hours, social links).

interface FooterSettings {
  name?: string;
  addressJa?: string;
  phone?: string;
  email?: string;
  googleMapsLink?: string;
  weeklyHours?: { monday?: string };
  socials?: { instagram?: string; facebook?: string; x?: string; youtube?: string };
  footerLogo?: string;
  footerBrand?: string;
  footerTaglineJa?: string;
  footerCopyright?: string;
  footerLinks?: FooterLink[];
  footerShowHours?: boolean;
  footerShowSocials?: boolean;
}

const DEFAULT_LOGO = '/adarsha-log.webp';

const formatSocialUrl = (key: keyof NonNullable<FooterSettings['socials']>, val?: string) => {
  if (!val || !val.trim()) return '';
  const trimmed = val.trim();
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  const handle = trimmed.replace(/^@/, '');
  switch (key) {
    case 'instagram': return `https://instagram.com/${handle}`;
    case 'facebook': return `https://facebook.com/${handle}`;
    case 'x': return `https://x.com/${handle}`;
    case 'youtube': return `https://youtube.com/${handle}`;
    default: return `https://${trimmed}`;
  }
};

const SOCIALS: { key: keyof NonNullable<FooterSettings['socials']>; label: string; path: string; fallbackUrl?: string }[] = [
  { key: 'instagram', label: 'Instagram', path: 'M12 2.2c3.2 0 3.6 0 4.8.1 1.2.1 1.8.2 2.2.4.6.2 1 .5 1.4.9.4.4.7.8.9 1.4.2.4.4 1.1.4 2.2.1 1.3.1 1.6.1 4.8s0 3.6-.1 4.8c-.1 1.2-.2 1.8-.4 2.2-.2.6-.5 1-.9 1.4-.4.4-.8.7-1.4.9-.4.2-1.1.4-2.2.4-1.3.1-1.6.1-4.8.1s-3.6 0-4.8-.1c-1.2-.1-1.8-.2-2.2-.4-.6-.2-1-.5-1.4-.9-.4-.4-.7-.8-.9-1.4-.2-.4-.4-1.1-.4-2.2C2.2 15.6 2.2 15.2 2.2 12s0-3.6.1-4.8c.1-1.2.2-1.8.4-2.2.2-.6.5-1 .9-1.4.4-.4.8-.7 1.4-.9.4-.2 1.1-.4 2.2-.4C8.4 2.2 8.8 2.2 12 2.2zm0 4.7a5.1 5.1 0 1 0 0 10.2 5.1 5.1 0 0 0 0-10.2zm0 8.4a3.3 3.3 0 1 1 0-6.6 3.3 3.3 0 0 1 0 6.6zm5.3-9.8a1.2 1.2 0 1 0 0 2.4 1.2 1.2 0 0 0 0-2.4z', fallbackUrl: 'https://instagram.com/adarsha_restro' },
  { key: 'x', label: 'X', path: 'M17.8 3h3.1l-6.8 7.7L22 21h-6.3l-4.9-6.4L5.2 21H2.1l7.3-8.3L1.8 3h6.4l4.4 5.9L17.8 3zm-1.1 16.2h1.7L7.4 4.7H5.6l11.1 14.5z' },
  { key: 'facebook', label: 'Facebook', path: 'M22 12a10 10 0 1 0-11.6 9.9v-7H7.9V12h2.5V9.8c0-2.5 1.5-3.9 3.8-3.9 1.1 0 2.2.2 2.2.2v2.5h-1.3c-1.2 0-1.6.8-1.6 1.6V12h2.8l-.4 2.9h-2.3v7A10 10 0 0 0 22 12z' },
  { key: 'youtube', label: 'YouTube', path: 'M23 7.2a3 3 0 0 0-2.1-2.1C19 4.6 12 4.6 12 4.6s-7 0-8.9.5A3 3 0 0 0 1 7.2 31 31 0 0 0 .5 12a31 31 0 0 0 .5 4.8 3 3 0 0 0 2.1 2.1c1.9.5 8.9.5 8.9.5s7 0 8.9-.5a3 3 0 0 0 2.1-2.1 31 31 0 0 0 .5-4.8 31 31 0 0 0-.5-4.8zM9.8 15V9l5.8 3-5.8 3z' },
];

const isExternal = (url: string) => /^https?:\/\//.test(url);

export default function Footer() {
  const { pathname } = useLocation();
  const [settings, setSettings] = useState<FooterSettings | null>(null);
  // The year for "© {year}", read once.
  const [year] = useState(() => String(new Date().getFullYear()));

  useEffect(() => {
    getPublic<FooterSettings>('/api/v1/settings')
      .then(setSettings)
      .catch(() => setSettings({}));
  }, []);

  const s = settings ?? {};
  const name = s.name?.trim() ?? '';
  const brand = s.footerBrand?.trim() || name;
  const rawLinks = s.footerLinks?.length ? s.footerLinks : DEFAULT_FOOTER_LINKS;
  let links = (rawLinks || []).filter(
    link => link &&
            !['/privacy-policy', '/refund-policy'].includes(link.url) &&
            !['プライバシーポリシー', '返金・キャンセルポリシー'].includes(link.label)
  );
  if (!links.some(l => l.url === '/blog')) {
    links = [...links, { label: 'ブログ・コラム', url: '/blog' }];
  }
  const copyright = (s.footerCopyright?.trim() || `© {year} ${name || 'Adarsha'}. All Rights Reserved.`).replace(/\{year\}/g, year);
  
  const activeSocials = s.footerShowSocials === false ? [] : SOCIALS
    .map(social => ({
      ...social,
      url: formatSocialUrl(social.key, s.socials?.[social.key]) || social.fallbackUrl || '',
    }))
    .filter(item => Boolean(item.url));

  const hours = s.footerShowHours === false ? '' : s.weeklyHours?.monday?.trim() ?? '';
  const isCurrent = (url: string) => (url === '/' ? pathname === '/' : !isExternal(url) && pathname.startsWith(url.startsWith('/menu') ? '/menu' : url));

  return (
    <footer className="footer">
      <div style={{ maxWidth: '1200px', margin: '0 auto', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 250px), 1fr))', gap: '40px' }}>
        <div>
          <Link to="/" style={{ display: 'inline-flex', alignItems: 'center', gap: '10px', textDecoration: 'none', marginBottom: '20px' }} aria-label="Adarsha ホーム">
            <div style={{ height: '42px', width: '42px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <img
                src={assetUrl(s.footerLogo) || DEFAULT_LOGO}
                alt={brand ? `${brand} ロゴ` : 'Adarsha ロゴ'}
                width={42}
                height={42}
                onError={(e) => {
                  const target = e.currentTarget;
                  if (!target.src.endsWith(DEFAULT_LOGO)) {
                    target.src = DEFAULT_LOGO;
                  }
                }}
                style={{ height: '100%', width: '100%', objectFit: 'contain', borderRadius: '50%' }}
              />
            </div>
            <div>
              <div style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: '1.45rem', lineHeight: 1, color: '#ffffff' }}>
                {brand && brand !== 'Adarsha' && brand !== 'アダルサ' ? brand : 'アダルサ'}<span style={{ color: 'var(--spice)' }}>.</span>
              </div>
              <span style={{ fontSize: '0.72rem', color: 'rgba(255, 255, 255, 0.7)', display: 'block', marginTop: '2px', letterSpacing: '0.02em' }}>
                本格インド料理店
              </span>
            </div>
          </Link>
          <p style={{ whiteSpace: 'pre-line' }}>{settings ? s.footerTaglineJa?.trim() || DEFAULT_TAGLINE : ''}</p>
          <div style={{ marginTop: '16px', marginBottom: '16px' }}>
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
                fontWeight: '600',
                textDecoration: 'none',
                boxShadow: '0 2px 8px rgba(199, 86, 38, 0.35)',
                transition: 'transform 0.15s, background-color 0.2s',
              }}
              onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = '#d86330'; e.currentTarget.style.transform = 'translateY(-1px)'; }}
              onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = '#c75626'; e.currentTarget.style.transform = 'translateY(0)'; }}
            >
              <BookOpen size={16} aria-hidden="true" />
              <span>公式ブログ・スパイスコラム</span>
            </Link>
          </div>
          {activeSocials.length > 0 && (
            <ul className="footer-socials" aria-label="SNS">
              {activeSocials.map(social => (
                <li key={social.key}>
                  <a href={social.url} target="_blank" rel="noopener noreferrer" aria-label={social.label}>
                    <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path d={social.path} fill="currentColor" /></svg>
                  </a>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div>
          <h3>リンク</h3>
          <ul style={{ listStyle: 'none', padding: 0, margin: 0, lineHeight: '2' }}>
            {links.map(link => (
              <li key={`${link.label}-${link.url}`}>
                {isExternal(link.url) ? (
                  <a href={link.url} target="_blank" rel="noopener noreferrer" className="footer-link">{link.label}</a>
                ) : (
                  <Link to={link.url} className="footer-link" aria-current={isCurrent(link.url) ? 'page' : undefined}>{link.label}</Link>
                )}
              </li>
            ))}
          </ul>
        </div>

        <div>
          <h3>店舗情報</h3>
          {/* Only what the restaurant filled in: no placeholder numbers or addresses. */}
          <ul className="footer-info">
            {name && <li className="footer-info-name">{name}</li>}
            {s.addressJa?.trim() && (
              <li>
                <MapPin size={15} aria-hidden="true" />
                {s.googleMapsLink ? <a href={s.googleMapsLink} target="_blank" rel="noopener noreferrer">{s.addressJa}</a> : <span>{s.addressJa}</span>}
              </li>
            )}
            {hours && <li><Clock size={15} aria-hidden="true" /><span>{hours}</span></li>}
            {s.phone?.trim() && <li><Phone size={15} aria-hidden="true" /><a href={`tel:${s.phone.replace(/[^\d+]/g, '')}`}>{s.phone}</a></li>}
            {s.email?.trim() && <li><Mail size={15} aria-hidden="true" /><a href={`mailto:${s.email}`}>{s.email}</a></li>}
          </ul>
        </div>
      </div>

      <div style={{
        maxWidth: '1200px',
        margin: '40px auto 0',
        paddingTop: '20px',
        borderTop: '1px solid rgba(255,255,255,0.1)',
        display: 'flex',
        flexWrap: 'wrap',
        justifyContent: 'space-between',
        alignItems: 'center',
        gap: '12px',
        fontSize: '0.85rem',
        color: '#9ca3af',
      }}>
        <div>{settings ? copyright : ''}</div>
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
        </div>
      </div>
    </footer>
  );
}
