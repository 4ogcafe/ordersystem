import { useCallback, useEffect, useRef, useState, type CSSProperties } from 'react';
import { toast } from 'react-hot-toast';
import { Image, Plus, Trash2, Eye, EyeOff, Upload, X, RotateCcw, ArrowUp, ArrowDown } from 'lucide-react';
import FooterSettings from './FooterSettings';
import GoogleReviewsSettings from './GoogleReviewsSettings';
import StoreLocationsManager from './StoreLocationsManager';
import { apiFetch, assetUrl, errorMessage } from '../../lib/api';

// ── Types ──────────────────────────────────────────────────────────────────────
interface Settings {
  heroTagJa?: string;
  heroSubJa?: string;
  welcomeTitleEn?: string;
  welcomeTitleJa?: string;
  welcomeTextJa?: string;
  menuExplorerLabelJa?: string;
  menuExplorerTitleJa?: string;
  aboutJa?: string;
  recommendedLabelJa?: string;
  recommendedTitleJa?: string;
  recommendedSubJa?: string;
  storeSectionLabelJa?: string;
  storeSectionTitleJa?: string;
  storeSectionSubJa?: string;
  storeLocationJa?: string;
  storeBadgeJa?: string;
  storeReviewScore?: string;
  storeReviewText?: string;
  storeReviewLink?: string;
  newsletterTitleJa?: string;
  newsletterSubJa?: string;
  newsletterBgImage?: string;
  aboutHeroImage?: string;
  aboutHeroTag?: string;
  aboutHeroTitle?: string;
  contactHeroImage?: string;
  menuGrandHeroImage?: string;
  menuLunchHeroImage?: string;
  menuTakeoutHeroImage?: string;
  aboutStoryLabelJa?: string;
  aboutStoryTitleJa?: string;
  aboutStoryJa?: string;
  aboutStoryImage?: string;
  aboutStoryWatermark?: string;
  aboutStoryOriginTitleJa?: string;
  aboutStoryOriginTextJa?: string;
  aboutStoryBadgeSubJa?: string;
  aboutStoryBadgeTitleJa?: string;
  aboutStoryPillar1TitleJa?: string;
  aboutStoryPillar1DescJa?: string;
  aboutStoryPillar2TitleJa?: string;
  aboutStoryPillar2DescJa?: string;
  aboutStoryPillar3TitleJa?: string;
  aboutStoryPillar3DescJa?: string;
  aboutSpiceLabelJa?: string;
  aboutSpiceTitleJa?: string;
  aboutSpiceDescJa?: string;
  aboutSpiceImage?: string;
  aboutChefLabelJa?: string;
  aboutChefTitleJa?: string;
  aboutChefDescJa?: string;
  aboutChefImage?: string;
}

export const DEFAULT_ABOUT_CONTENT: Record<string, string> = {
  aboutHeroTag: '私たちについて',
  aboutHeroTitle: '私たちに<em>ついて</em>',
  aboutHeroImage: 'https://images.unsplash.com/photo-1552566626-52f8b828add9?auto=format&fit=crop&w=1920&q=80',
  aboutStoryLabelJa: '私たちの物語',
  aboutStoryTitleJa: '本場インドの味を、<em>熊谷へ</em>',
  aboutStoryJa: 'Adarsha（アダルサ）は、サンスクリット語で「理想」や「模範」を意味します。\n私たちは、インドの伝統的なスパイスと製法を守りながら、日本の皆さまの味覚に寄り添う新しいインディアン・ダイニングを創造しています。\n\n本場インドのホテルで腕を磨いたシェフが、厳選された数十種類のスパイスを巧みにブレンド。\n特注のタンドール（土窯）で焼き上げる備長炭の香ばしいナンやタンドリーチキンは、多くのお客様に愛されています。',
  aboutStoryImage: 'https://images.unsplash.com/photo-1585937421612-70a008356fbe?auto=format&fit=crop&w=1200&q=80',
  aboutStoryWatermark: 'アダルサ',
  aboutStoryOriginTitleJa: '店名「Adarsha（アダルサ）」に込めた想い',
  aboutStoryOriginTextJa: 'サンスクリット語で「理想」や「模範」を意味します。インド何千年の食の知恵を受け継ぎ、日本の皆さまの心を満たす理想の美味しさを創り出します。',
  aboutStoryBadgeSubJa: '炭火仕込み',
  aboutStoryBadgeTitleJa: '備長炭タンドール窯焼き',
  aboutStoryPillar1TitleJa: '特注タンドール（土窯）炭火仕立て',
  aboutStoryPillar1DescJa: '高温の備長炭で焼き上げるナンは外サクッ中モチッ。チキンは肉汁を逃さず芳醇な燻香をまといます。',
  aboutStoryPillar2TitleJa: '30種以上の厳選直輸入スパイス',
  aboutStoryPillar2DescJa: 'インド各地より厳選したスパイスを毎朝調合。香り・辛み・薬効の黄金バランスを追求しています。',
  aboutStoryPillar3TitleJa: '日本の皆さまの味覚に寄り添う心',
  aboutStoryPillar3DescJa: '辛さはお子様用甘口〜激辛まで自由に調節。ベジタリアンやアレルギーにも丁寧に対応いたします。',
  aboutSpiceLabelJa: 'こだわり',
  aboutSpiceTitleJa: '命を吹き込む、<em>スパイス</em>',
  aboutSpiceDescJa: 'カレーの味の決め手となるスパイスは、インドから直接取り寄せた最高品質のものを使用しています。クミン、コリアンダー、ターメリック、カルダモン... それぞれのスパイスが持つ薬効や香りを最大限に引き出すため、独自に配合し、挽きたてを使用しています。',
  aboutSpiceImage: 'https://images.unsplash.com/photo-1596040033229-a9821ebd058d?auto=format&fit=crop&w=800&q=80',
  aboutChefLabelJa: 'シェフ紹介',
  aboutChefTitleJa: '熟練の<em>技</em>',
  aboutChefDescJa: '長年の経験を積み、日本の皆さまに「本物のインド料理」を届けるために来日しました。カレーの奥深さ、スパイスの魔法、そしてインドの温かいおもてなしの心を、一皿一皿に込めて提供しています。辛さの調節や、ベジタリアン対応などもお気軽にお声がけください。',
  aboutChefImage: 'https://images.unsplash.com/photo-1583394838336-acd977736f90?auto=format&fit=crop&w=800&q=80',
};

export const DEFAULT_HOME_CONTENT: Record<string, string> = {
  heroTagJa: '埼玉・熊谷で味わう、本場のインド料理',
  heroSubJa: '愛とスパイス、そして伝統に彩られた数世紀にわたるレシピを。\nAdarsha Indian Cuisineで皆様をお待ちしております。',
  welcomeTitleEn: 'Authentic Indian Flavors',
  welcomeTitleJa: '本格インドの味わい',
  welcomeTextJa: 'インドの豊かな食文化と鮮やかなスパイスを体験してください。熟練のシェフが伝統的なタンドール窯と新鮮な食材を使用し、すべての料理をゼロから手作りしています。忘れられない特別なひとときをお届けします。',
  menuExplorerLabelJa: 'メニューを見る',
  menuExplorerTitleJa: 'キッチンからお届け',
  aboutJa: '毎日手作りの新鮮な味 — 手挽きのスパイス、本格的な粘土窯（タンドール）、妥協のない調理',
  recommendedLabelJa: 'シェフの厳選',
  recommendedTitleJa: 'おすすめメニュー',
  recommendedSubJa: '全店舗で愛され続けている、不動の人気メニュー',
  storeSectionLabelJa: '店舗を探す',
  storeSectionTitleJa: '私たちの店舗',
  storeSectionSubJa: '店舗を選択して、住所、営業時間、地図をご確認ください。',
  storeLocationJa: '埼玉県熊谷市佐谷田2081（国道17号沿い・加賀家食堂隣）',
  storeBadgeJa: '🍛 インド料理',
  storeReviewScore: '4.5',
  storeReviewText: 'Googleでレビューを見る',
  storeReviewLink: 'https://www.google.com/maps/place/Adarsha+Indian+Cuisine/@36.1250995,138.8116637,10z/data=!4m6!3m5!1s0x601f2b0605446c1f:0x1a31a406a1c1b3d6!8m2!3d36.1250995!4d139.4214049!16s%2Fg%2F11mf64qypb?entry=ttu',
  newsletterTitleJa: 'ニュースレターに登録',
  newsletterSubJa: '最新のメニュー、シークレットレシピ、そして限定のお得な情報を\nあなたのメールボックスへ直接お届けします。',
};

interface Slide {
  id: string;
  titleEn?: string;
  titleJa?: string;
  altEn?: string;
  imageUrl: string;
  placement: 'HOME' | 'CONTACT';
  isActive: boolean;
  sortOrder: number;
}

const PLACEMENTS = ['HOME', 'CONTACT'] as const;

// ── Helpers ────────────────────────────────────────────────────────────────────
async function uploadImage(file: File): Promise<string> {
  const body = new FormData();
  body.append('image', file);
  const res = await apiFetch('/api/v1/upload', { method: 'POST', body });
  const data = await res.json().catch(() => ({}));
  if (res.ok && data.imageUrl) return data.imageUrl;
  throw new Error(data?.error?.message ?? 'Upload failed');
}

// ── Shared UI ──────────────────────────────────────────────────────────────────
const card: CSSProperties = { background: '#fff', borderRadius: '12px', padding: '1.75rem 2rem', boxShadow: '0 1px 3px rgba(0,0,0,0.08)', marginBottom: '1.5rem' };
const h3: CSSProperties = { margin: '0 0 1.25rem', fontSize: '1.1rem', fontWeight: 600 };
const lbl: CSSProperties = { display: 'flex', flexDirection: 'column', gap: '0.35rem', fontSize: '0.85rem', fontWeight: 500, color: '#374151', marginBottom: '0.75rem' };
const inp: CSSProperties = { padding: '0.6rem 0.75rem', border: '1px solid #d1d5db', borderRadius: '8px', background: '#f9fafb', fontSize: '0.9rem', width: '100%', boxSizing: 'border-box' };
const muted: CSSProperties = { color: '#6b7280', fontSize: '0.78rem', fontWeight: 400 };
const saveBtn: CSSProperties = { padding: '0.65rem 1.5rem', background: '#111', color: '#fff', border: 'none', borderRadius: '8px', fontWeight: 600, cursor: 'pointer', fontSize: '0.9rem' };
const outlineBtn: CSSProperties = { padding: '0.6rem 1rem', background: '#fff', border: '1px solid #d1d5db', borderRadius: '8px', cursor: 'pointer', fontWeight: 500, fontSize: '0.85rem', display: 'inline-flex', alignItems: 'center', gap: '6px' };
const dangerBtn: CSSProperties = { ...outlineBtn, color: '#dc2626', borderColor: '#fca5a5' };

function Thumb({ src }: { src?: string }) {
  if (!src) return null;
  const url = assetUrl(src) || src;
  return (
    <div style={{ marginTop: '0.5rem', borderRadius: '8px', overflow: 'hidden', width: 120, height: 72, background: '#f3f4f6', border: '1px solid #e5e7eb', flexShrink: 0 }}>
      <img src={url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }} />
    </div>
  );
}

interface ImageFieldProps {
  label: string;
  hint?: string;
  value: string;
  onChange: (v: string) => void;
  onUpload?: (url: string) => void;
}
function ImageField({ label, hint, value, onChange, onUpload }: ImageFieldProps) {
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const url = await uploadImage(file);
      onChange(url);
      onUpload?.(url);
    } catch (err: any) {
      toast.error(err.message ?? 'Upload failed');
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  return (
    <label style={lbl}>
      {label}
      {hint && <span style={muted}>{hint}</span>}
      <div style={{ display: 'flex', gap: '8px', alignItems: 'flex-start', flexWrap: 'wrap' }}>
        <div style={{ flex: 1, minWidth: 200 }}>
          <input
            type="text"
            value={value}
            onChange={e => onChange(e.target.value)}
            placeholder="https://..."
            style={inp}
          />
          <Thumb src={value} />
        </div>
        <label style={{ ...outlineBtn, cursor: uploading ? 'wait' : 'pointer', marginTop: 0, height: 38, boxSizing: 'border-box' }}>
          <Upload size={14} />
          {uploading ? 'Uploading…' : 'Upload'}
          <input ref={fileRef} type="file" accept="image/*" hidden onChange={handleFile} />
        </label>
        {value && (
          <button type="button" style={{ ...outlineBtn, height: 38, boxSizing: 'border-box' }} onClick={() => onChange('')}>
            <X size={14} />
          </button>
        )}
      </div>
    </label>
  );
}

// ── Section save helper ────────────────────────────────────────────────────────
async function saveFields(fields: Partial<Settings>, label: string) {
  const res = await apiFetch('/api/v1/settings', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(fields),
  });
  if (res.ok) toast.success(`${label} saved.`);
  else toast.error(await errorMessage(res, `Could not save ${label}.`));
}

// ── Sub-tabs ───────────────────────────────────────────────────────────────────

function HomePageTab({ settings, setSettings }: { settings: Settings; setSettings: (p: Partial<Settings>) => void }) {
  const [saving, setSaving] = useState(false);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      await saveFields({
        heroTagJa: settings.heroTagJa,
        heroSubJa: settings.heroSubJa,
        welcomeTitleEn: settings.welcomeTitleEn,
        welcomeTitleJa: settings.welcomeTitleJa,
        welcomeTextJa: settings.welcomeTextJa,
        menuExplorerLabelJa: settings.menuExplorerLabelJa,
        menuExplorerTitleJa: settings.menuExplorerTitleJa,
        aboutJa: settings.aboutJa,
        recommendedLabelJa: settings.recommendedLabelJa,
        recommendedTitleJa: settings.recommendedTitleJa,
        recommendedSubJa: settings.recommendedSubJa,
        storeSectionLabelJa: settings.storeSectionLabelJa,
        storeSectionTitleJa: settings.storeSectionTitleJa,
        storeSectionSubJa: settings.storeSectionSubJa,
        storeLocationJa: settings.storeLocationJa,
        storeBadgeJa: settings.storeBadgeJa,
        storeReviewScore: settings.storeReviewScore,
        storeReviewText: settings.storeReviewText,
        storeReviewLink: settings.storeReviewLink,
        newsletterTitleJa: settings.newsletterTitleJa,
        newsletterSubJa: settings.newsletterSubJa,
      }, 'Home page content');
    } finally {
      setSaving(false);
    }
  };

  const handleLoadDefaults = () => {
    setSettings(DEFAULT_HOME_CONTENT);
    toast.success('Loaded default home page content into form.');
  };

  const set = (key: keyof Settings) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setSettings({ [key]: e.target.value });

  return (
    <form onSubmit={handleSave} style={{ display: 'flex', flexDirection: 'column' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem', flexWrap: 'wrap', gap: '0.75rem' }}>
        <div>
          <h2 style={{ fontSize: '1.2rem', fontWeight: 700, margin: '0 0 0.25rem 0', color: '#111827' }}>Home Page Content</h2>
          <p style={{ margin: 0, color: '#6b7280', fontSize: '0.85rem' }}>Manage all text sections displayed on the public home page.</p>
        </div>
        <button
          type="button"
          onClick={handleLoadDefaults}
          style={{ ...outlineBtn, padding: '0.5rem 1rem' }}
          title="Fill in standard Japanese & English texts for the home page"
        >
          <RotateCcw size={14} /> Fill Default Home Content
        </button>
      </div>

      <div style={card}>
        <h3 style={h3}>Hero Banner Section</h3>
        <label style={lbl}>
          Hero Tagline (JA)
          <span style={muted}>Badge text above the main banner headline (e.g. 埼玉・熊谷で味わう、本場のインド料理)</span>
          <input style={inp} type="text" value={settings.heroTagJa ?? ''} onChange={set('heroTagJa')} placeholder="埼玉・熊谷で味わう、本場のインド料理" />
        </label>
        <label style={lbl}>
          Hero Subtitle (JA)
          <span style={muted}>Paragraph text under the main headline</span>
          <textarea style={{ ...inp, height: 80, resize: 'vertical', fontFamily: 'inherit' }} value={settings.heroSubJa ?? ''} onChange={set('heroSubJa')} placeholder="愛とスパイス、そして伝統に彩られた数世紀にわたるレシピを..." />
        </label>
      </div>

      <div style={card}>
        <h3 style={h3}>Indian Food Section (Welcome)</h3>
        <label style={lbl}>
          Title (EN)
          <input style={inp} type="text" value={settings.welcomeTitleEn ?? ''} onChange={set('welcomeTitleEn')} placeholder="Authentic Indian Flavors" />
        </label>
        <label style={lbl}>
          Title (JA)
          <input style={inp} type="text" value={settings.welcomeTitleJa ?? ''} onChange={set('welcomeTitleJa')} placeholder="本格インドの味わい" />
        </label>
        <label style={lbl}>
          Description (JA)
          <textarea style={{ ...inp, height: 120, resize: 'vertical', fontFamily: 'inherit' }} value={settings.welcomeTextJa ?? ''} onChange={set('welcomeTextJa')} placeholder="インドの豊かな食文化と鮮やかなスパイスを体験してください..." />
        </label>
      </div>

      <div style={card}>
        <h3 style={h3}>Menu Explorer Section</h3>
        <label style={lbl}>
          Section Label (JA)
          <input style={inp} type="text" value={settings.menuExplorerLabelJa ?? ''} onChange={set('menuExplorerLabelJa')} placeholder="メニューを見る" />
        </label>
        <label style={lbl}>
          Section Title (JA)
          <span style={muted}>Supports &lt;em&gt; tags for stylized emphasis (e.g. キッチンから&lt;em&gt;お届け&lt;/em&gt;)</span>
          <input style={inp} type="text" value={settings.menuExplorerTitleJa ?? ''} onChange={set('menuExplorerTitleJa')} placeholder="キッチンからお届け" />
        </label>
        <label style={lbl}>
          Subtitle (JA)
          <textarea style={{ ...inp, height: 80, resize: 'vertical', fontFamily: 'inherit' }} value={settings.aboutJa ?? ''} onChange={set('aboutJa')} placeholder="毎日手作りの新鮮な味 — 手挽きのスパイス、本格的な粘土窯（タンドール）、妥協のない調理" />
        </label>
      </div>

      <div style={card}>
        <h3 style={h3}>Recommended Menu Section</h3>
        <label style={lbl}>
          Section Label (JA)
          <input style={inp} type="text" value={settings.recommendedLabelJa ?? ''} onChange={set('recommendedLabelJa')} placeholder="シェフの厳選" />
        </label>
        <label style={lbl}>
          Section Title (JA)
          <input style={inp} type="text" value={settings.recommendedTitleJa ?? ''} onChange={set('recommendedTitleJa')} placeholder="おすすめメニュー" />
        </label>
        <label style={lbl}>
          Subtitle (JA)
          <textarea style={{ ...inp, height: 70, resize: 'vertical', fontFamily: 'inherit' }} value={settings.recommendedSubJa ?? ''} onChange={set('recommendedSubJa')} placeholder="全店舗で愛され続けている、不動の人気メニュー" />
        </label>
      </div>

      <div style={card}>
        <h3 style={h3}>Our Store Section</h3>
        <label style={lbl}>
          Section Label
          <input style={inp} type="text" value={settings.storeSectionLabelJa ?? ''} onChange={set('storeSectionLabelJa')} placeholder="店舗を探す" />
        </label>
        <label style={lbl}>
          Section Title
          <input style={inp} type="text" value={settings.storeSectionTitleJa ?? ''} onChange={set('storeSectionTitleJa')} placeholder="私たちの店舗" />
        </label>
        <label style={lbl}>
          Subtitle Text
          <textarea style={{ ...inp, height: 80, resize: 'vertical', fontFamily: 'inherit' }} value={settings.storeSectionSubJa ?? ''} onChange={set('storeSectionSubJa')} placeholder="店舗を選択して..." />
        </label>
      </div>

      <StoreLocationsManager />

      <div style={card}>
        <h3 style={h3}>Google Review Display</h3>
        <label style={lbl}>
          Review Score (e.g. 4.4)
          <input style={{ ...inp, maxWidth: 140 }} type="text" value={settings.storeReviewScore ?? ''} onChange={set('storeReviewScore')} placeholder="4.4" />
        </label>
        <label style={lbl}>
          Link Text
          <input style={inp} type="text" value={settings.storeReviewText ?? ''} onChange={set('storeReviewText')} placeholder="Googleでレビューを見る" />
        </label>
        <label style={lbl}>
          Link URL
          <input style={inp} type="url" value={settings.storeReviewLink ?? ''} onChange={set('storeReviewLink')} placeholder="https://..." />
        </label>
      </div>

      <div style={card}>
        <h3 style={h3}>Newsletter Section</h3>
        <label style={lbl}>
          Section Title (JA)
          <input style={inp} type="text" value={settings.newsletterTitleJa ?? ''} onChange={set('newsletterTitleJa')} placeholder="ニュースレターに登録" />
        </label>
        <label style={lbl}>
          Subtitle Text (JA)
          <textarea style={{ ...inp, height: 80, resize: 'vertical', fontFamily: 'inherit' }} value={settings.newsletterSubJa ?? ''} onChange={set('newsletterSubJa')} placeholder="最新のメニュー、シークレットレシピ、そして限定のお得な情報を..." />
        </label>
      </div>

      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '1rem', marginTop: '1rem', marginBottom: '2rem' }}>
        <button type="submit" disabled={saving} style={saveBtn}>{saving ? 'Saving…' : 'Save Home Page'}</button>
      </div>
    </form>
  );
}

function AboutPageTab({ settings, setSettings }: { settings: Settings; setSettings: (p: Partial<Settings>) => void }) {
  const [saving, setSaving] = useState(false);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      await saveFields({
        aboutHeroTag: settings.aboutHeroTag,
        aboutHeroTitle: settings.aboutHeroTitle,
        aboutHeroImage: settings.aboutHeroImage,
        aboutStoryLabelJa: settings.aboutStoryLabelJa,
        aboutStoryTitleJa: settings.aboutStoryTitleJa,
        aboutStoryJa: settings.aboutStoryJa,
        aboutStoryImage: settings.aboutStoryImage,
        aboutStoryWatermark: settings.aboutStoryWatermark,
        aboutStoryOriginTitleJa: settings.aboutStoryOriginTitleJa,
        aboutStoryOriginTextJa: settings.aboutStoryOriginTextJa,
        aboutStoryBadgeSubJa: settings.aboutStoryBadgeSubJa,
        aboutStoryBadgeTitleJa: settings.aboutStoryBadgeTitleJa,
        aboutStoryPillar1TitleJa: settings.aboutStoryPillar1TitleJa,
        aboutStoryPillar1DescJa: settings.aboutStoryPillar1DescJa,
        aboutStoryPillar2TitleJa: settings.aboutStoryPillar2TitleJa,
        aboutStoryPillar2DescJa: settings.aboutStoryPillar2DescJa,
        aboutStoryPillar3TitleJa: settings.aboutStoryPillar3TitleJa,
        aboutStoryPillar3DescJa: settings.aboutStoryPillar3DescJa,
        aboutSpiceLabelJa: settings.aboutSpiceLabelJa,
        aboutSpiceTitleJa: settings.aboutSpiceTitleJa,
        aboutSpiceDescJa: settings.aboutSpiceDescJa,
        aboutSpiceImage: settings.aboutSpiceImage,
        aboutChefLabelJa: settings.aboutChefLabelJa,
        aboutChefTitleJa: settings.aboutChefTitleJa,
        aboutChefDescJa: settings.aboutChefDescJa,
        aboutChefImage: settings.aboutChefImage,
      }, 'About ページ設定');
    } finally {
      setSaving(false);
    }
  };

  const handleLoadDefaults = () => {
    setSettings(DEFAULT_ABOUT_CONTENT);
    toast.success('About ページの標準日本語コンテンツをセットしました。');
  };

  const set = (key: keyof Settings) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setSettings({ [key]: e.target.value });

  return (
    <form onSubmit={handleSave} style={{ display: 'flex', flexDirection: 'column' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem', flexWrap: 'wrap', gap: '0.75rem' }}>
        <div>
          <h2 style={{ fontSize: '1.2rem', fontWeight: 700, margin: '0 0 0.25rem 0', color: '#111827' }}>About ページ設定（私たちについて）</h2>
          <p style={{ margin: 0, color: '#6b7280', fontSize: '0.85rem' }}>ブランドストーリー、店名の由来、3つのこだわり、スパイス、シェフ紹介などすべての日本語コンテンツを動的に管理できます。</p>
        </div>
        <button
          type="button"
          onClick={handleLoadDefaults}
          style={{ ...outlineBtn, padding: '0.5rem 1rem' }}
          title="標準の日本語コンテンツを入力欄にセットします"
        >
          <RotateCcw size={14} /> デフォルト日本語内容をセット
        </button>
      </div>

      <div style={card}>
        <h3 style={h3}>ヒーローバナー設定（Hero Banner）</h3>
        <label style={lbl}>
          タグ（英数字または日本語）
          <input style={inp} type="text" value={settings.aboutHeroTag ?? ''} onChange={set('aboutHeroTag')} placeholder="私たちについて" />
        </label>
        <label style={lbl}>
          メインタイトル (JA)
          <span style={muted}>&lt;em&gt; タグでアクセント文字（金色・強調）を付けられます（例: 私たちに&lt;em&gt;ついて&lt;/em&gt;）</span>
          <input style={inp} type="text" value={settings.aboutHeroTitle ?? ''} onChange={set('aboutHeroTitle')} placeholder="私たちに<em>ついて</em>" />
        </label>
        <ImageField
          label="ヒーロー背景画像"
          hint="ページ最上部に表示される大きなバナー画像です。"
          value={settings.aboutHeroImage ?? ''}
          onChange={v => setSettings({ aboutHeroImage: v })}
        />
      </div>

      <div style={card}>
        <h3 style={h3}>私たちの物語 — ブランドストーリー設定</h3>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '1rem', marginBottom: '1rem' }}>
          <label style={lbl}>
            セクションラベル (バッジ文字)
            <input style={inp} type="text" value={settings.aboutStoryLabelJa ?? ''} onChange={set('aboutStoryLabelJa')} placeholder="私たちの物語" />
          </label>
          <label style={lbl}>
            セクションタイトル
            <span style={muted}>&lt;em&gt; で一部文字を強調表示（例: 本場インドの味を、&lt;em&gt;熊谷へ&lt;/em&gt;）</span>
            <input style={inp} type="text" value={settings.aboutStoryTitleJa ?? ''} onChange={set('aboutStoryTitleJa')} placeholder="本場インドの味を、<em>熊谷へ</em>" />
          </label>
          <label style={lbl}>
            背景の透かし文字（ウォーターマーク）
            <input style={inp} type="text" value={settings.aboutStoryWatermark ?? ''} onChange={set('aboutStoryWatermark')} placeholder="アダルサ" />
          </label>
        </div>

        {/* 店名の由来・哲学 Callout */}
        <div style={{ background: '#fffbeb', border: '1px solid #fde68a', borderRadius: '10px', padding: '1rem', marginBottom: '1.25rem' }}>
          <h4 style={{ margin: '0 0 0.5rem', fontSize: '0.95rem', color: '#92400e', fontWeight: 700 }}>店名の由来・哲学（ハイライト枠）</h4>
          <label style={lbl}>
            引用見出し
            <input style={inp} type="text" value={settings.aboutStoryOriginTitleJa ?? ''} onChange={set('aboutStoryOriginTitleJa')} placeholder="店名「Adarsha（アダルサ）」に込めた想い" />
          </label>
          <label style={lbl}>
            引用本文
            <textarea style={{ ...inp, height: 75, resize: 'vertical', fontFamily: 'inherit' }} value={settings.aboutStoryOriginTextJa ?? ''} onChange={set('aboutStoryOriginTextJa')} placeholder="サンスクリット語で「理想」や「模範」を意味します..." />
          </label>
        </div>

        {/* メイン写真 & フローティングバッジ */}
        <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '10px', padding: '1rem', marginBottom: '1.25rem' }}>
          <h4 style={{ margin: '0 0 0.5rem', fontSize: '0.95rem', color: '#334155', fontWeight: 700 }}>ストーリー写真 ＆ 写真上バッジ</h4>
          <ImageField
            label="ストーリー写真"
            hint="タンドール料理やカレーの魅力的な写真。"
            value={settings.aboutStoryImage ?? ''}
            onChange={v => setSettings({ aboutStoryImage: v })}
          />
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginTop: '0.75rem' }}>
            <label style={lbl}>
              バッジ上部サブテキスト
              <input style={inp} type="text" value={settings.aboutStoryBadgeSubJa ?? ''} onChange={set('aboutStoryBadgeSubJa')} placeholder="炭火仕込み" />
            </label>
            <label style={lbl}>
              バッジ主テキスト
              <input style={inp} type="text" value={settings.aboutStoryBadgeTitleJa ?? ''} onChange={set('aboutStoryBadgeTitleJa')} placeholder="備長炭タンドール窯焼き" />
            </label>
          </div>
        </div>

        {/* ストーリー本文 */}
        <label style={lbl}>
          ストーリー本文（改行で段落分けされます）
          <textarea style={{ ...inp, height: 140, resize: 'vertical', fontFamily: 'inherit' }} value={settings.aboutStoryJa ?? ''} onChange={set('aboutStoryJa')} placeholder="レストランの歴史やミッションについて..." />
        </label>

        {/* 3つのこだわり・特徴（Story Pillars） */}
        <div style={{ marginTop: '1.25rem', paddingTop: '1rem', borderTop: '1px dashed #e5e7eb' }}>
          <h4 style={{ margin: '0 0 0.75rem', fontSize: '1rem', color: '#111827', fontWeight: 700 }}>こだわり・特徴 3本柱（Story Pillars）</h4>
          
          <div style={{ display: 'grid', gap: '0.75rem' }}>
            <div style={{ background: '#fafafa', border: '1px solid #f0f0f0', borderRadius: '8px', padding: '0.85rem' }}>
              <div style={{ fontWeight: 600, fontSize: '0.85rem', color: '#ea580c', marginBottom: '0.4rem' }}>こだわり 1</div>
              <div style={{ display: 'grid', gridTemplateColumns: 'minmax(180px, 1fr) 2fr', gap: '0.75rem' }}>
                <input style={inp} type="text" value={settings.aboutStoryPillar1TitleJa ?? ''} onChange={set('aboutStoryPillar1TitleJa')} placeholder="特注タンドール（土窯）炭火仕立て" />
                <input style={inp} type="text" value={settings.aboutStoryPillar1DescJa ?? ''} onChange={set('aboutStoryPillar1DescJa')} placeholder="高温の備長炭で焼き上げるナンは外サクッ中モチッ..." />
              </div>
            </div>

            <div style={{ background: '#fafafa', border: '1px solid #f0f0f0', borderRadius: '8px', padding: '0.85rem' }}>
              <div style={{ fontWeight: 600, fontSize: '0.85rem', color: '#ea580c', marginBottom: '0.4rem' }}>こだわり 2</div>
              <div style={{ display: 'grid', gridTemplateColumns: 'minmax(180px, 1fr) 2fr', gap: '0.75rem' }}>
                <input style={inp} type="text" value={settings.aboutStoryPillar2TitleJa ?? ''} onChange={set('aboutStoryPillar2TitleJa')} placeholder="30種以上の厳選直輸入スパイス" />
                <input style={inp} type="text" value={settings.aboutStoryPillar2DescJa ?? ''} onChange={set('aboutStoryPillar2DescJa')} placeholder="インド各地より厳選したスパイスを毎朝調合..." />
              </div>
            </div>

            <div style={{ background: '#fafafa', border: '1px solid #f0f0f0', borderRadius: '8px', padding: '0.85rem' }}>
              <div style={{ fontWeight: 600, fontSize: '0.85rem', color: '#ea580c', marginBottom: '0.4rem' }}>こだわり 3</div>
              <div style={{ display: 'grid', gridTemplateColumns: 'minmax(180px, 1fr) 2fr', gap: '0.75rem' }}>
                <input style={inp} type="text" value={settings.aboutStoryPillar3TitleJa ?? ''} onChange={set('aboutStoryPillar3TitleJa')} placeholder="日本の皆さまの味覚に寄り添う心" />
                <input style={inp} type="text" value={settings.aboutStoryPillar3DescJa ?? ''} onChange={set('aboutStoryPillar3DescJa')} placeholder="辛さはお子様用甘口〜激辛まで自由に調節..." />
              </div>
            </div>
          </div>
        </div>
      </div>

      <div style={card}>
        <h3 style={h3}>こだわり — Spice Section</h3>
        <label style={lbl}>
          Label
          <input style={inp} type="text" value={settings.aboutSpiceLabelJa ?? ''} onChange={set('aboutSpiceLabelJa')} placeholder="こだわり" />
        </label>
        <label style={lbl}>
          Title
          <input style={inp} type="text" value={settings.aboutSpiceTitleJa ?? ''} onChange={set('aboutSpiceTitleJa')} placeholder="命を吹き込む、スパイス" />
        </label>
        <label style={lbl}>
          Description
          <textarea style={{ ...inp, height: 100, resize: 'vertical', fontFamily: 'inherit' }} value={settings.aboutSpiceDescJa ?? ''} onChange={set('aboutSpiceDescJa')} placeholder="スパイスへのこだわりについて..." />
        </label>
        <ImageField
          label="Section Image"
          value={settings.aboutSpiceImage ?? ''}
          onChange={v => setSettings({ aboutSpiceImage: v })}
        />
      </div>

      <div style={card}>
        <h3 style={h3}>シェフ紹介 — Chef Section</h3>
        <label style={lbl}>
          Label
          <input style={inp} type="text" value={settings.aboutChefLabelJa ?? ''} onChange={set('aboutChefLabelJa')} placeholder="シェフ紹介" />
        </label>
        <label style={lbl}>
          Title
          <input style={inp} type="text" value={settings.aboutChefTitleJa ?? ''} onChange={set('aboutChefTitleJa')} placeholder="熟練の技" />
        </label>
        <label style={lbl}>
          Description
          <textarea style={{ ...inp, height: 100, resize: 'vertical', fontFamily: 'inherit' }} value={settings.aboutChefDescJa ?? ''} onChange={set('aboutChefDescJa')} placeholder="シェフの紹介や経歴について..." />
        </label>
        <ImageField
          label="Chef Photo"
          value={settings.aboutChefImage ?? ''}
          onChange={v => setSettings({ aboutChefImage: v })}
        />
      </div>

      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '1rem', marginTop: '1rem', marginBottom: '2rem' }}>
        <button type="submit" disabled={saving} style={saveBtn}>{saving ? 'Saving…' : 'Save About Page'}</button>
      </div>
    </form>
  );
}

const BANNER_FIELDS: { key: keyof Settings; label: string; hint: string }[] = [
  { key: 'aboutHeroImage', label: 'About Us — Hero Image', hint: 'Banner shown at the top of the About page.' },
  { key: 'contactHeroImage', label: 'Contact Us — Hero Image', hint: 'Banner shown at the top of the Contact page.' },
  { key: 'menuGrandHeroImage', label: 'Grand Menu — Hero Image', hint: 'Banner shown at the top of the Grand Menu page.' },
  { key: 'menuLunchHeroImage', label: 'Lunch Menu — Hero Image', hint: 'Banner shown at the top of the Lunch Menu page.' },
  { key: 'menuTakeoutHeroImage', label: 'Takeout Menu — Hero Image', hint: 'Banner shown at the top of the Takeout Menu page.' },
];

function PageBannersTab({ settings, setSettings }: { settings: Settings; setSettings: (p: Partial<Settings>) => void }) {
  const [saving, setSaving] = useState(false);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      await saveFields({
        aboutHeroImage: settings.aboutHeroImage,
        contactHeroImage: settings.contactHeroImage,
        menuGrandHeroImage: settings.menuGrandHeroImage,
        menuLunchHeroImage: settings.menuLunchHeroImage,
        menuTakeoutHeroImage: settings.menuTakeoutHeroImage,
      }, 'Page banners');
    } finally {
      setSaving(false);
    }
  };

  return (
    <form onSubmit={handleSave}>
      <div style={card}>
        <h3 style={h3}>Page Hero Images</h3>
        <p style={{ ...muted, marginTop: 0, marginBottom: '1.5rem' }}>
          Each page can show a large hero banner image at the top. Paste an image URL or upload a file.
        </p>
        {BANNER_FIELDS.map(({ key, label, hint }) => (
          <div key={key} style={{ marginBottom: '1.5rem' }}>
            <ImageField
              label={label}
              hint={hint}
              value={(settings[key] as string) ?? ''}
              onChange={v => setSettings({ [key]: v })}
            />
          </div>
        ))}
      </div>
      <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
        <button type="submit" disabled={saving} style={saveBtn}>{saving ? 'Saving…' : 'Save Banners'}</button>
      </div>
    </form>
  );
}

const BLANK_SLIDE: { titleEn: string; titleJa: string; altEn: string; imageUrl: string; placement: 'HOME' | 'CONTACT' } = {
  titleEn: '',
  titleJa: '',
  altEn: '',
  imageUrl: '',
  placement: 'HOME',
};

function CarouselTab() {
  const [slides, setSlides] = useState<Slide[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<Slide | null>(null);
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState(BLANK_SLIDE);
  const [saving, setSaving] = useState(false);
  const [filterPlacement, setFilterPlacement] = useState<'ALL' | 'HOME' | 'CONTACT'>('ALL');

  const fetch = useCallback(() => {
    setLoading(true);
    apiFetch('/api/v1/carousels?all=true')
      .then(r => r.json())
      .then(data => { if (Array.isArray(data)) setSlides(data); })
      .catch(() => toast.error('Could not load carousels'))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { fetch(); }, [fetch]);

  const handleToggleActive = async (slide: Slide) => {
    const res = await apiFetch(`/api/v1/carousels/${slide.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ isActive: !slide.isActive }),
    });
    if (res.ok) {
      setSlides(prev => prev.map(s => s.id === slide.id ? { ...s, isActive: !s.isActive } : s));
    } else {
      toast.error('Failed to update.');
    }
  };

  const handleDelete = async (id: string) => {
    if (!window.confirm('Delete this slide? This cannot be undone.')) return;
    const res = await apiFetch(`/api/v1/carousels/${id}`, { method: 'DELETE' });
    if (res.ok) {
      setSlides(prev => prev.filter(s => s.id !== id));
      toast.success('Slide deleted.');
    } else {
      toast.error('Failed to delete.');
    }
  };

  const handleSaveEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editing) return;
    setSaving(true);
    try {
      const res = await apiFetch(`/api/v1/carousels/${editing.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ titleEn: editing.titleEn, titleJa: editing.titleJa, altEn: editing.altEn, imageUrl: editing.imageUrl, isActive: editing.isActive }),
      });
      if (res.ok) {
        setEditing(null);
        fetch();
        toast.success('Slide updated.');
      } else {
        toast.error(await errorMessage(res, 'Failed to save.'));
      }
    } finally {
      setSaving(false);
    }
  };

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      const res = await apiFetch('/api/v1/carousels', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      if (res.ok) {
        setAdding(false);
        setForm(BLANK_SLIDE);
        fetch();
        toast.success('Slide added.');
      } else {
        toast.error(await errorMessage(res, 'Failed to add.'));
      }
    } finally {
      setSaving(false);
    }
  };

  const handleMove = async (slide: Slide, direction: 'up' | 'down') => {
    const list = [...visible];
    const index = list.findIndex(s => s.id === slide.id);
    const targetIndex = direction === 'up' ? index - 1 : index + 1;
    if (targetIndex < 0 || targetIndex >= list.length) return;
    const targetSlide = list[targetIndex];

    const currentOrder = slide.sortOrder;
    const targetOrder = targetSlide.sortOrder ?? targetIndex;

    setSlides(prev =>
      prev.map(s => {
        if (s.id === slide.id) return { ...s, sortOrder: targetOrder };
        if (s.id === targetSlide.id) return { ...s, sortOrder: currentOrder };
        return s;
      }).sort((a, b) => a.sortOrder - b.sortOrder)
    );

    await Promise.all([
      apiFetch(`/api/v1/carousels/${slide.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sortOrder: targetOrder }),
      }),
      apiFetch(`/api/v1/carousels/${targetSlide.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sortOrder: currentOrder }),
      }),
    ]);
    fetch();
  };

  const handleRestoreDefaults = async () => {
    if (slides.length > 0 && !window.confirm('Add default restaurant slides? Existing slides will remain.')) return;
    setSaving(true);
    try {
      const DEFAULT_SLIDES = [
        {
          placement: 'HOME' as const,
          imageUrl: 'https://images.unsplash.com/photo-1517248135467-4c7edcad34c4?auto=format&fit=crop&w=1920&q=80',
          titleEn: 'Authentic Indian Flavors',
          titleJa: 'インドの香りを、そのままに',
          altEn: 'Authentic Indian restaurant atmosphere with traditional dishes',
        },
        {
          placement: 'HOME' as const,
          imageUrl: 'https://images.unsplash.com/photo-1589302168068-964664d93dc0?auto=format&fit=crop&w=1920&q=80',
          titleEn: 'Freshly Baked Naan & Curries',
          titleJa: '焼きたてナンと本格スパイスカレー',
          altEn: 'Freshly baked tandoori naan and rich curry bowls',
        },
        {
          placement: 'HOME' as const,
          imageUrl: 'https://images.unsplash.com/photo-1552566626-52f8b828add9?auto=format&fit=crop&w=1920&q=80',
          titleEn: 'Traditional Charcoal Tandoor',
          titleJa: '炭火粘土窯で焼き上げるタンドール料理',
          altEn: 'Master chef preparing tandoori specialties in traditional clay oven',
        },
        {
          placement: 'CONTACT' as const,
          imageUrl: 'https://images.unsplash.com/photo-1517248135467-4c7edcad34c4?auto=format&fit=crop&w=1920&q=80',
          titleEn: 'Visit Adarsha in Kumagaya',
          titleJa: '熊谷でお待ちしております',
          altEn: 'Adarsha Indian Cuisine dining hall in Kumagaya',
        },
      ];
      for (const slide of DEFAULT_SLIDES) {
        await apiFetch('/api/v1/carousels', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(slide),
        });
      }
      toast.success('Default carousel slides created.');
      fetch();
    } catch {
      toast.error('Failed to restore slides.');
    } finally {
      setSaving(false);
    }
  };

  const visible = filterPlacement === 'ALL' ? slides : slides.filter(s => s.placement === filterPlacement);

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.25rem', flexWrap: 'wrap', gap: '0.75rem' }}>
        <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
          {(['ALL', 'HOME', 'CONTACT'] as const).map(p => (
            <button key={p} type="button" onClick={() => setFilterPlacement(p)} style={{ padding: '0.4rem 0.85rem', borderRadius: '6px', border: '1px solid #d1d5db', background: filterPlacement === p ? '#111' : '#fff', color: filterPlacement === p ? '#fff' : '#374151', fontWeight: 500, cursor: 'pointer', fontSize: '0.85rem' }}>
              {p}
            </button>
          ))}
        </div>
        <div style={{ display: 'flex', gap: '0.5rem' }}>
          <button type="button" onClick={handleRestoreDefaults} disabled={saving} style={{ ...outlineBtn, display: 'inline-flex', alignItems: 'center', gap: '6px' }} title="Load standard preset slides for the restaurant">
            <RotateCcw size={14} /> Restore Default Slides
          </button>
          <button type="button" onClick={() => setAdding(true)} style={{ ...saveBtn, display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
            <Plus size={15} /> Add Slide
          </button>
        </div>
      </div>

      {loading ? (
        <div style={{ padding: '2rem', textAlign: 'center', color: '#6b7280' }}>Loading…</div>
      ) : visible.length === 0 ? (
        <div style={{ ...card, textAlign: 'center', color: '#6b7280', padding: '3rem' }}>
          <Image size={40} style={{ margin: '0 auto 0.75rem', display: 'block', opacity: 0.3 }} />
          No slides yet for this placement.
          <div style={{ marginTop: '1rem' }}>
            <button type="button" onClick={handleRestoreDefaults} style={{ ...saveBtn, display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
              <RotateCcw size={14} /> Load Default Slides
            </button>
          </div>
        </div>
      ) : (
        <div style={{ display: 'grid', gap: '1rem' }}>
          {visible.map((slide, index) => (
            <div key={slide.id} style={{ background: '#fff', borderRadius: '12px', border: '1px solid #e5e7eb', display: 'flex', alignItems: 'stretch', overflow: 'hidden', opacity: slide.isActive ? 1 : 0.6 }}>
              <div style={{ width: 140, flexShrink: 0, background: '#f3f4f6' }}>
                {slide.imageUrl ? (
                  <img
                    src={assetUrl(slide.imageUrl) || slide.imageUrl}
                    alt={slide.altEn || slide.titleEn || ''}
                    onError={(e) => {
                      const target = e.currentTarget;
                      if (!target.src.endsWith('/bg-hero-img.webp')) {
                        target.src = '/bg-hero-img.webp';
                      }
                    }}
                    style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block', minHeight: 88 }}
                  />
                ) : (
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', minHeight: 88, color: '#9ca3af' }}>
                    <Image size={28} />
                  </div>
                )}
              </div>
              <div style={{ flex: 1, padding: '0.9rem 1.25rem', display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: '0.2rem', minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
                  <span style={{ fontSize: '0.95rem', fontWeight: 600, color: '#111' }}>{slide.titleEn || slide.titleJa || '(no title)'}</span>
                  <span style={{ fontSize: '0.75rem', padding: '2px 8px', borderRadius: '99px', background: slide.placement === 'HOME' ? '#dbeafe' : '#fef3c7', color: slide.placement === 'HOME' ? '#1d4ed8' : '#92400e', fontWeight: 600 }}>{slide.placement}</span>
                  <span style={{ fontSize: '0.75rem', padding: '2px 8px', borderRadius: '99px', background: slide.isActive ? '#dcfce7' : '#f3f4f6', color: slide.isActive ? '#16a34a' : '#6b7280', fontWeight: 600 }}>{slide.isActive ? 'Active' : 'Hidden'}</span>
                </div>
                {slide.titleJa && <div style={{ fontSize: '0.82rem', color: '#6b7280' }}>{slide.titleJa}</div>}
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', padding: '0 1rem', flexShrink: 0 }}>
                <button type="button" title="Move Up" disabled={index === 0} onClick={() => handleMove(slide, 'up')} style={{ ...outlineBtn, padding: '0.5rem', opacity: index === 0 ? 0.3 : 1 }}>
                  <ArrowUp size={14} />
                </button>
                <button type="button" title="Move Down" disabled={index === visible.length - 1} onClick={() => handleMove(slide, 'down')} style={{ ...outlineBtn, padding: '0.5rem', opacity: index === visible.length - 1 ? 0.3 : 1 }}>
                  <ArrowDown size={14} />
                </button>
                <button type="button" title={slide.isActive ? 'Hide' : 'Show'} onClick={() => handleToggleActive(slide)} style={outlineBtn}>
                  {slide.isActive ? <EyeOff size={15} /> : <Eye size={15} />}
                </button>
                <button type="button" onClick={() => setEditing({ ...slide })} style={outlineBtn}>Edit</button>
                <button type="button" onClick={() => handleDelete(slide.id)} style={dangerBtn}><Trash2 size={15} /></button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Add modal */}
      {adding && (
        <Modal title="Add New Slide" onClose={() => setAdding(false)}>
          <form onSubmit={handleAdd} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            <label style={lbl}>
              Placement
              <select value={form.placement} onChange={e => setForm({ ...form, placement: e.target.value as 'HOME' | 'CONTACT' })} style={inp}>
                {PLACEMENTS.map(p => <option key={p} value={p}>{p}</option>)}
              </select>
            </label>
            <label style={lbl}>
              Title (EN)
              <input style={inp} type="text" value={form.titleEn} onChange={e => setForm({ ...form, titleEn: e.target.value })} />
            </label>
            <label style={lbl}>
              Title (JA)
              <input style={inp} type="text" value={form.titleJa} onChange={e => setForm({ ...form, titleJa: e.target.value })} />
            </label>
            <label style={lbl}>
              Alt Text
              <input style={inp} type="text" value={form.altEn} onChange={e => setForm({ ...form, altEn: e.target.value })} placeholder="Describe the image for accessibility" />
            </label>
            <ImageField
              label="Image *"
              value={form.imageUrl}
              onChange={v => setForm({ ...form, imageUrl: v })}
            />
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem', marginTop: '0.5rem' }}>
              <button type="button" onClick={() => setAdding(false)} style={outlineBtn}>Cancel</button>
              <button type="submit" disabled={saving || !form.imageUrl} style={saveBtn}>{saving ? 'Adding…' : 'Add Slide'}</button>
            </div>
          </form>
        </Modal>
      )}

      {/* Edit modal */}
      {editing && (
        <Modal title="Edit Slide" onClose={() => setEditing(null)}>
          <form onSubmit={handleSaveEdit} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            <label style={lbl}>
              Placement
              <span style={{ ...inp, background: '#f3f4f6', color: '#6b7280', cursor: 'not-allowed' }}>{editing.placement}</span>
              <span style={muted}>Placement cannot be changed after creation.</span>
            </label>
            <label style={lbl}>
              Title (EN)
              <input style={inp} type="text" value={editing.titleEn ?? ''} onChange={e => setEditing({ ...editing, titleEn: e.target.value })} />
            </label>
            <label style={lbl}>
              Title (JA)
              <input style={inp} type="text" value={editing.titleJa ?? ''} onChange={e => setEditing({ ...editing, titleJa: e.target.value })} />
            </label>
            <label style={lbl}>
              Alt Text
              <input style={inp} type="text" value={editing.altEn ?? ''} onChange={e => setEditing({ ...editing, altEn: e.target.value })} />
            </label>
            <label style={lbl}>
              Status
              <select value={editing.isActive ? 'active' : 'hidden'} onChange={e => setEditing({ ...editing, isActive: e.target.value === 'active' })} style={inp}>
                <option value="active">Active — visible on site</option>
                <option value="hidden">Hidden</option>
              </select>
            </label>
            <ImageField
              label="Image"
              value={editing.imageUrl}
              onChange={v => setEditing({ ...editing, imageUrl: v })}
            />
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem', marginTop: '0.5rem' }}>
              <button type="button" onClick={() => setEditing(null)} style={outlineBtn}>Cancel</button>
              <button type="submit" disabled={saving} style={saveBtn}>{saving ? 'Saving…' : 'Save Changes'}</button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}

function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100 }} onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div style={{ background: '#fff', borderRadius: '14px', padding: '1.75rem 2rem', width: '100%', maxWidth: 520, maxHeight: '90vh', overflowY: 'auto', boxShadow: '0 20px 60px rgba(0,0,0,0.25)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem' }}>
          <h2 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 600 }}>{title}</h2>
          <button type="button" onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 4, color: '#6b7280' }}><X size={18} /></button>
        </div>
        {children}
      </div>
    </div>
  );
}

// ── Sub-tab labels ─────────────────────────────────────────────────────────────
const SUBTABS = ['Home Page', 'About Page', 'Page Banners', 'Carousel Slider', 'Google Reviews', 'Footer'] as const;
type SubTab = typeof SUBTABS[number];

// ── Root export ────────────────────────────────────────────────────────────────
export default function PageSettingsTab({ onOpenRestaurantSettings }: { onOpenRestaurantSettings?: () => void }) {
  const [subTab, setSubTab] = useState<SubTab>('Home Page');
  const [settings, setSettings] = useState<Settings>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    apiFetch('/api/v1/settings')
      .then(r => r.json())
      .then(data => { if (data) setSettings(data); })
      .catch(() => toast.error('Could not load settings.'))
      .finally(() => setLoading(false));
  }, []);

  const patch = useCallback((partial: Partial<Settings>) => setSettings(prev => ({ ...prev, ...partial })), []);

  return (
    <div>
      {/* Sub-tab navigation */}
      <div style={{ display: 'flex', gap: 0, marginBottom: '2rem', borderBottom: '1px solid #e5e7eb', overflowX: 'auto', scrollbarWidth: 'none' }}>
        {SUBTABS.map(tab => (
          <button key={tab} onClick={() => setSubTab(tab)} style={{ padding: '0.75rem 1.1rem', background: 'none', border: 'none', borderBottom: subTab === tab ? '2px solid #111' : '2px solid transparent', fontWeight: subTab === tab ? 600 : 500, color: subTab === tab ? '#111' : '#6b7280', cursor: 'pointer', fontSize: '0.9rem', whiteSpace: 'nowrap', flexShrink: 0, transition: 'color 0.15s' }}>
            {tab}
          </button>
        ))}
      </div>

      {loading ? (
        <div style={{ padding: '3rem', textAlign: 'center', color: '#6b7280' }}>Loading settings…</div>
      ) : (
        <>
          {subTab === 'Home Page' && <HomePageTab settings={settings} setSettings={patch} />}
          {subTab === 'About Page' && <AboutPageTab settings={settings} setSettings={patch} />}
          {subTab === 'Page Banners' && <PageBannersTab settings={settings} setSettings={patch} />}
          {subTab === 'Carousel Slider' && <CarouselTab />}
          {subTab === 'Google Reviews' && <GoogleReviewsSettings />}
          {subTab === 'Footer' && <FooterSettings onOpenRestaurantSettings={onOpenRestaurantSettings} />}
        </>
      )}
    </div>
  );
}
