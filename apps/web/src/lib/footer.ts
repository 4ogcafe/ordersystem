// Footer defaults, used until the admin sets their own (Page Settings → Footer).

export interface FooterLink {
  label: string;
  url: string;
}

/** Used until the admin sets their own (Page Settings → Footer). */
export const DEFAULT_FOOTER_LINKS: FooterLink[] = [
  { label: 'ホーム', url: '/' },
  { label: '私たちについて', url: '/about' },
  { label: 'メニュー', url: '/menu/grand' },
  { label: 'ブログ・コラム', url: '/blog' },
  { label: '採用情報', url: '/careers' },
  { label: 'お問い合わせ', url: '/contact' },
  { label: '管理者ログイン', url: '/login' },
];
export const DEFAULT_TAGLINE = '埼玉・熊谷にある本格インド料理店。古代インドのスパイスルートを旅するような体験をお届けします。';
