// Footer links and branding constants for Adarsha (アダルサ)

export interface FooterLink {
  label: string;
  url: string;
}

export const DEFAULT_FOOTER_LINKS: FooterLink[] = [
  { label: 'ホーム', url: '/' },
  { label: '私たちについて', url: '/about' },
  { label: 'ランチメニュー', url: '/menu/lunch' },
  { label: 'テイクアウト', url: '/menu/takeout' },
  { label: 'グランドメニュー', url: '/menu/grand' },
  { label: 'オンライン注文', url: '/order' },
  { label: '公式ブログ・コラム', url: '/blog' },
  { label: '採用情報', url: '/careers' },
  { label: 'お問い合わせ', url: '/contact' },
];

export const DEFAULT_TAGLINE = '伝統的な炭火タンドール窯と30種以上の厳選スパイスで手作りする本格インド・ネパール料理。武蔵境本店をはじめ全15店舗で、心温まる本場の美味しさをお届けします。';

