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
      <div className="mx-auto grid max-w-[1200px] grid-cols-[repeat(auto-fit,minmax(min(100%,260px),1fr))] gap-10">
        {/* Column 1: Brand & About */}
        <div>
          <Link to="/" className="mb-[18px] inline-flex items-center gap-2.5 no-underline" aria-label="Adarsha ホーム">
            <div className="flex h-11 w-11 items-center justify-center">
              <img
                src="/uploads/adarsha-log.webp"
                alt="Adarsha (アダルサ) ロゴ"
                width={44}
                height={44}
                className="h-full w-full rounded-full object-contain"
              />
            </div>
            <div>
              <div className="font-display text-2xl font-extrabold leading-none tracking-[0.02em] text-white">
                アダルサ<span className="text-spice">.</span>
              </div>
              <span className="mt-[3px] block text-[0.74rem] tracking-[0.04em] text-white/70">
                本格インド料理店 · ADARSHA
              </span>
            </div>
          </Link>

          <p className="mb-[18px] text-[0.88rem] leading-[1.8] text-white/80">
            {DEFAULT_TAGLINE}
          </p>

          <div className="mb-5">
            <Link
              to="/blog"
              className="inline-flex items-center gap-2 rounded-lg bg-[#c75626] px-[18px] py-[9px] text-[0.85rem] font-bold text-white no-underline shadow-[0_2px_8px_rgba(199,86,38,0.35)] transition-all duration-200 hover:-translate-y-px hover:bg-[#d86330]"
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
            <li className="footer-info-name mb-1 text-base text-white">
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
                  className="text-[#fed7aa] no-underline"
                >
                  {MAIN_STORE.address}
                  <ExternalLink size={12} className="ml-1 inline align-middle opacity-80" />
                </a>
                <span className="mt-0.5 block text-[0.78rem] text-white/65">
                  {MAIN_STORE.access}
                </span>
              </div>
            </li>
            <li>
              <Clock size={16} aria-hidden="true" />
              <div>
                <span>{MAIN_STORE.hours}</span>
                <span className="mt-0.5 block text-[0.78rem] font-semibold text-[#86efac]">
                  ● {MAIN_STORE.holiday}
                </span>
              </div>
            </li>
            <li>
              <Phone size={16} aria-hidden="true" />
              <a href={`tel:${MAIN_STORE.phone.replace(/[^\d+]/g, '')}`} className="font-bold text-white">
                {MAIN_STORE.phone}
              </a>
            </li>
            <li>
              <Mail size={16} aria-hidden="true" />
              <a href={`mailto:${MAIN_STORE.email}`}>
                {MAIN_STORE.email}
              </a>
            </li>
            <li className="mt-2 border-t border-dashed border-white/15 pt-2.5">
              <Store size={16} aria-hidden="true" className="text-[#ea580c]" />
              <div>
                <span className="block text-[0.82rem] text-white/85">
                  全15店舗展開中（武蔵境・東小金井・武蔵小金井 ほか）
                </span>
                <Link
                  to="/about"
                  className="mt-[3px] inline-block text-[0.8rem] font-bold text-[#fed7aa] no-underline"
                >
                  全店舗一覧・詳細を見る →
                </Link>
              </div>
            </li>
          </ul>
        </div>
      </div>

      {/* Bottom Bar: Copyright & Policies */}
      <div className="mx-auto mt-10 flex max-w-[1200px] flex-wrap items-center justify-between gap-3.5 border-t border-white/12 pt-5 text-[0.85rem] text-gray-400">
        <div>
          © {year} インド料理レストラン アダルサ (Adarsha). All Rights Reserved.
        </div>
        <div className="flex flex-wrap items-center gap-4">
          <Link to="/privacy-policy" className="footer-link text-gray-300 no-underline">
            プライバシーポリシー
          </Link>
          <span className="opacity-30">|</span>
          <Link to="/refund-policy" className="footer-link text-gray-300 no-underline">
            返金・キャンセルポリシー
          </Link>
          <span className="opacity-30">|</span>
          <Link to="/careers" className="footer-link text-gray-300 no-underline">
            採用情報
          </Link>
          <span className="opacity-30">|</span>
          <Link to="/contact" className="footer-link text-gray-300 no-underline">
            お問い合わせ
          </Link>
          <span className="opacity-30">|</span>
          <Link to="/login" className="footer-link text-[0.78rem] text-gray-400 no-underline">
            管理者ログイン
          </Link>
        </div>
      </div>
    </footer>
  );
}
