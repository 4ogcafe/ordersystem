import { useState, useEffect } from 'react';
import { Sparkles, Flame, Heart, Quote } from 'lucide-react';
import { assetUrl, getPublic } from '../lib/api';
import EmphasisText from '../components/EmphasisText';

export default function About() {
  const [settings, setSettings] = useState<any>({});

  useEffect(() => {
    getPublic<any>('/api/v1/settings')
      .then(data => setSettings(data))
      .catch(console.error);
  }, []);

  const storyParagraphs = (settings.aboutStoryJa || 'Adarsha（アダルサ）は、サンスクリット語で「理想」や「模範」を意味します。\n私たちは、インドの伝統的なスパイスと製法を守りながら、日本の皆さまの味覚に寄り添う新しいインディアン・ダイニングを創造しています。\n\n本場インドのホテルで腕を磨いたシェフが、厳選された数十種類のスパイスを巧みにブレンド。\n特注のタンドール（土窯）で焼き上げる備長炭の香ばしいナンやタンドリーチキンは、多くのお客様に愛されています。').split('\n').filter((p: string) => p.trim().length > 0);

  return (
    <main>
      <title>私たちについて | Adarsha (アダルサ) 熊谷の本格インド料理</title>
      <meta name="description" content="埼玉県熊谷市の本格インド料理店アダルサの物語、伝統スパイスへのこだわり、特注の備長炭タンドール窯、シェフをご紹介します。" />
      <link rel="canonical" href="https://pnglike.com/about" />
      <meta property="og:title" content="私たちについて | Adarsha (アダルサ) 熊谷の本格インド料理" />
      <meta property="og:description" content="埼玉県熊谷市の本格インド料理店アダルサの物語、伝統スパイスへのこだわり、特注の備長炭タンドール窯、シェフをご紹介します。" />
      <meta property="og:type" content="website" />
      <meta property="og:url" content="https://pnglike.com/about" />
      <meta property="og:image" content={assetUrl(settings.aboutHeroImage) || "https://pnglike.com/bg-hero-img.webp"} />
      <meta name="twitter:card" content="summary_large_image" />
      <meta name="twitter:title" content="私たちについて | Adarsha (アダルサ)" />
      <meta name="twitter:description" content="熊谷の本格インド料理店アダルサの物語、スパイスへのこだわり、シェフをご紹介します。" />
      <meta name="twitter:image" content={assetUrl(settings.aboutHeroImage) || "https://pnglike.com/bg-hero-img.webp"} />

      {/* Structured Data */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify({
            '@context': 'https://schema.org',
            '@type': 'BreadcrumbList',
            'itemListElement': [
              {
                '@type': 'ListItem',
                'position': 1,
                'name': 'ホーム',
                'item': 'https://pnglike.com/'
              },
              {
                '@type': 'ListItem',
                'position': 2,
                'name': '私たちについて',
                'item': 'https://pnglike.com/about'
              }
            ]
          })
        }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify({
            '@context': 'https://schema.org',
            '@type': 'AboutPage',
            '@id': 'https://pnglike.com/about#webpage',
            'url': 'https://pnglike.com/about',
            'name': '私たちについて | Adarsha (アダルサ)',
            'description': '熊谷の本格インド料理店アダルサの物語、スパイスへのこだわり、シェフをご紹介します。',
            'mainEntity': {
              '@type': 'Restaurant',
              '@id': 'https://pnglike.com/#restaurant',
              'name': 'Adarsha (アダルサ)'
            }
          })
        }}
      />

      {/* About Hero */}
      <div className="home-hero" style={{ height: '50vh', minHeight: '400px' }}>
        <img
          src={assetUrl(settings.aboutHeroImage) || "/bg-hero-img.webp"}
          alt=""
          fetchPriority="high"
          className="slide-bg-img"
          onError={(e) => {
            const target = e.currentTarget;
            if (!target.src.endsWith('/bg-hero-img.webp')) {
              target.src = '/bg-hero-img.webp';
            }
          }}
          style={{ opacity: 0.5, objectFit: 'cover' }}
        />
        <div className="hero-content">
          <div className="hero-tag">{settings.aboutHeroTag || '私たちについて'}</div>
          <h1 className="hero-title">
            <EmphasisText text={settings.aboutHeroTitle || '私たちに<em>ついて</em>'} />
          </h1>
        </div>
      </div>

      {/* Story Section — High-End Restaurant Editorial */}
      <section
        style={{
          position: 'relative',
          backgroundColor: '#faf7f2',
          backgroundImage: 'radial-gradient(circle at 10% 20%, rgba(242, 168, 59, 0.08), transparent 40%), radial-gradient(circle at 90% 80%, rgba(181, 69, 27, 0.05), transparent 40%)',
          padding: 'clamp(4rem, 8vw, 6rem) 20px',
          overflow: 'hidden',
          borderBottom: '1px solid rgba(0, 0, 0, 0.05)',
        }}
      >
        {/* Subtle decorative watermark */}
        <div
          style={{
            position: 'absolute',
            top: '4%',
            right: '3%',
            fontFamily: 'var(--font-display)',
            fontSize: 'clamp(4rem, 12vw, 10rem)',
            fontWeight: 900,
            color: 'rgba(181, 69, 27, 0.035)',
            letterSpacing: '0.08em',
            pointerEvents: 'none',
            userSelect: 'none',
            lineHeight: 1,
          }}
        >
          {settings.aboutStoryWatermark || 'アダルサ'}
        </div>

        <div style={{ maxWidth: '1180px', margin: '0 auto', position: 'relative', zIndex: 2 }}>
          {/* Section Header */}
          <div style={{ textAlign: 'center', maxWidth: '780px', margin: '0 auto clamp(2.5rem, 5vw, 3.5rem)' }}>
            <div
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '8px',
                backgroundColor: '#ffffff',
                border: '1px solid rgba(181, 69, 27, 0.25)',
                borderRadius: '9999px',
                padding: '6px 18px',
                boxShadow: '0 2px 10px rgba(181, 69, 27, 0.06)',
                marginBottom: '1.25rem',
              }}
            >
              <Sparkles size={14} color="var(--spice)" />
              <span
                style={{
                  fontFamily: 'var(--font-display)',
                  color: 'var(--spice)',
                  fontWeight: 700,
                  letterSpacing: '2.5px',
                  fontSize: '0.8rem',
                  textTransform: 'uppercase',
                }}
              >
                {settings.aboutStoryLabelJa || '私たちの物語'}
              </span>
            </div>

            <h2
              className="section-title"
              style={{
                fontSize: 'clamp(2rem, 5vw, 3.1rem)',
                lineHeight: 1.25,
                margin: '0 0 1.25rem',
                color: 'var(--dark-bark)',
                letterSpacing: '-0.02em',
              }}
            >
              <EmphasisText text={settings.aboutStoryTitleJa || '本場インドの味を、<em>熊谷へ</em>'} />
            </h2>

            <div
              className="divider"
              style={{
                width: '60px',
                height: '3px',
                backgroundColor: 'var(--gold)',
                margin: '0 auto 1.5rem',
                borderRadius: '2px',
              }}
            />

            {/* Sanskrit Origin Callout */}
            <div
              style={{
                display: 'inline-block',
                backgroundColor: '#ffffff',
                border: '1px solid rgba(242, 168, 59, 0.35)',
                borderLeft: '4px solid var(--spice)',
                borderRadius: '12px',
                padding: '14px 22px',
                boxShadow: '0 6px 20px rgba(0, 0, 0, 0.04)',
                textAlign: 'left',
                maxWidth: '680px',
              }}
            >
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  color: 'var(--spice)',
                  fontWeight: 700,
                  fontSize: '0.92rem',
                  marginBottom: '4px',
                }}
              >
                <Quote size={16} />
                <span>{settings.aboutStoryOriginTitleJa || '店名「Adarsha（アダルサ）」に込めた想い'}</span>
              </div>
              <p style={{ margin: 0, fontSize: '0.92rem', color: 'var(--dark-bark)', lineHeight: 1.65 }}>
                {settings.aboutStoryOriginTextJa || 'サンスクリット語で「理想」や「模範」を意味します。インド何千年の食の知恵を受け継ぎ、日本の皆さまの心を満たす理想の美味しさを創り出します。'}
              </p>
            </div>
          </div>

          {/* 2-Column Grid: Visual Framing + Editorial Narrative */}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 480px), 1fr))',
              gap: 'clamp(2.5rem, 5vw, 4.5rem)',
              alignItems: 'center',
            }}
          >
            {/* Visual Collage Column */}
            <div style={{ position: 'relative' }}>
              {/* Backing decorative glow frame */}
              <div
                style={{
                  position: 'absolute',
                  inset: '-12px',
                  background: 'linear-gradient(135deg, rgba(242, 168, 59, 0.22), rgba(181, 69, 27, 0.14))',
                  borderRadius: '26px',
                  transform: 'rotate(-1.5deg)',
                  zIndex: 0,
                }}
              />

              {/* Main Image Container */}
              <div
                style={{
                  position: 'relative',
                  borderRadius: '20px',
                  overflow: 'hidden',
                  boxShadow: '0 20px 45px -12px rgba(42, 35, 33, 0.22)',
                  border: '4px solid #ffffff',
                  zIndex: 1,
                  aspectRatio: '4 / 3',
                  backgroundColor: '#2a2321',
                }}
              >
                <img
                  src={assetUrl(settings.aboutStoryImage) || "/bg-hero-img.webp"}
                  alt={settings.aboutStoryTitleJa?.replace(/<[^>]*>/g, '') || "本場インドの味を、熊谷へ"}
                  loading="lazy"
                  decoding="async"
                  onError={(e) => {
                    const target = e.currentTarget;
                    if (!target.src.endsWith('/bg-hero-img.webp')) {
                      target.src = '/bg-hero-img.webp';
                    }
                  }}
                  style={{
                    width: '100%',
                    height: '100%',
                    objectFit: 'cover',
                    display: 'block',
                  }}
                />
                {/* Subtle bottom vignette gradient */}
                <div
                  style={{
                    position: 'absolute',
                    inset: 0,
                    background: 'linear-gradient(to top, rgba(0,0,0,0.45) 0%, transparent 60%)',
                    pointerEvents: 'none',
                  }}
                />
              </div>

              {/* Floating Signature Quality Badge */}
              <div
                style={{
                  position: 'absolute',
                  bottom: '-22px',
                  right: '18px',
                  backgroundColor: '#ffffff',
                  borderRadius: '16px',
                  padding: '12px 20px',
                  boxShadow: '0 12px 30px rgba(0, 0, 0, 0.14)',
                  border: '1.5px solid rgba(242, 168, 59, 0.45)',
                  zIndex: 2,
                  display: 'flex',
                  alignItems: 'center',
                  gap: '12px',
                }}
              >
                <div
                  style={{
                    width: '42px',
                    height: '42px',
                    borderRadius: '12px',
                    backgroundColor: '#fff7ed',
                    border: '1px solid #fed7aa',
                    display: 'grid',
                    placeItems: 'center',
                    color: 'var(--spice)',
                    flexShrink: 0,
                  }}
                >
                  <Flame size={22} />
                </div>
                <div>
                  <div
                    style={{
                      fontSize: '0.72rem',
                      fontWeight: 800,
                      color: 'var(--spice)',
                      letterSpacing: '1px',
                    }}
                  >
                    {settings.aboutStoryBadgeSubJa || '炭火仕込み'}
                  </div>
                  <div style={{ fontSize: '0.94rem', fontWeight: 800, color: 'var(--dark-bark)' }}>
                    {settings.aboutStoryBadgeTitleJa || '備長炭タンドール窯焼き'}
                  </div>
                </div>
              </div>
            </div>

            {/* Narrative Column */}
            <div>
              <div style={{ fontSize: '1.05rem', lineHeight: '2.1', color: 'var(--dark-bark)' }}>
                {storyParagraphs.map((para: string, i: number) => (
                  <p
                    key={i}
                    style={{
                      marginBottom: '18px',
                      color: i === 0 ? 'var(--dark-bark)' : '#5c524c',
                      fontWeight: i === 0 ? 500 : 400,
                    }}
                  >
                    {para}
                  </p>
                ))}
              </div>

              {/* 3 Core Quality Pillars */}
              <div style={{ display: 'grid', gap: '12px', marginTop: '24px' }}>
                <StoryPillar
                  icon={Flame}
                  title={settings.aboutStoryPillar1TitleJa || '特注タンドール（土窯）炭火仕立て'}
                  desc={settings.aboutStoryPillar1DescJa || '高温の備長炭で焼き上げるナンは外サクッ中モチッ。チキンは肉汁を逃さず芳醇な燻香をまといます。'}
                />
                <StoryPillar
                  icon={Sparkles}
                  title={settings.aboutStoryPillar2TitleJa || '30種以上の厳選直輸入スパイス'}
                  desc={settings.aboutStoryPillar2DescJa || 'インド各地より厳選したスパイスを毎朝調合。香り・辛み・薬効の黄金バランスを追求しています。'}
                />
                <StoryPillar
                  icon={Heart}
                  title={settings.aboutStoryPillar3TitleJa || '日本の皆さまの味覚に寄り添う心'}
                  desc={settings.aboutStoryPillar3DescJa || '辛さはお子様用甘口〜激辛まで自由に調節。ベジタリアンやアレルギーにも丁寧に対応いたします。'}
                />
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Spice & Ingredients Section */}
      <div className="section" style={{ backgroundColor: 'var(--cream)' }}>
        <div style={{ maxWidth: '1100px', margin: '0 auto', display: 'flex', flexWrap: 'wrap', gap: '40px', alignItems: 'center' }}>
          <div style={{ flex: '1 1 400px' }}>
            <img
              src={assetUrl(settings.aboutSpiceImage) || "/bg-hero-img.webp"}
              alt={settings.aboutSpiceTitleJa?.replace(/<[^>]*>/g, '') || "厳選直輸入スパイス"}
              loading="lazy"
              decoding="async"
              onError={(e) => {
                const target = e.currentTarget;
                if (!target.src.endsWith('/bg-hero-img.webp')) {
                  target.src = '/bg-hero-img.webp';
                }
              }}
              style={{ width: '100%', borderRadius: '16px', boxShadow: '0 10px 30px rgba(0,0,0,0.1)' }}
            />
          </div>
          <div style={{ flex: '1 1 400px' }}>
            <div className="section-label">{settings.aboutSpiceLabelJa || 'こだわり'}</div>
            <h2 className="section-title" style={{ fontSize: '2.5rem' }}>
              <EmphasisText text={settings.aboutSpiceTitleJa || '命を吹き込む、<em>スパイス</em>'} />
            </h2>
            <div className="divider" style={{ margin: '0 0 1.5rem 0' }}></div>
            <div style={{ lineHeight: '1.8', color: 'var(--text-muted)' }}>
              {(settings.aboutSpiceDescJa || 'カレーの味の決め手となるスパイスは、インドから直接取り寄せた最高品質のものを使用しています。クミン、コリアンダー、ターメリック、カルダモン... それぞれのスパイスが持つ薬効や香りを最大限に引き出すため、独自に配合し、挽きたてを使用しています。').split('\n').map((line: string, i: number) => (
                <p key={i} style={{ marginBottom: '10px' }}>{line}</p>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Chef Section */}
      <div className="section" style={{ backgroundColor: 'white' }}>
        <div style={{ maxWidth: '1100px', margin: '0 auto', display: 'flex', flexWrap: 'wrap', gap: '40px', alignItems: 'center', flexDirection: 'row-reverse' }}>
          <div style={{ flex: '1 1 400px' }}>
            <img
              src={assetUrl(settings.aboutChefImage) || "/bg-hero-img.webp"}
              alt={settings.aboutChefTitleJa?.replace(/<[^>]*>/g, '') || "熟練のシェフ"}
              loading="lazy"
              decoding="async"
              onError={(e) => {
                const target = e.currentTarget;
                if (!target.src.endsWith('/bg-hero-img.webp')) {
                  target.src = '/bg-hero-img.webp';
                }
              }}
              style={{ width: '100%', borderRadius: '16px', boxShadow: '0 10px 30px rgba(0,0,0,0.1)' }}
            />
          </div>
          <div style={{ flex: '1 1 400px' }}>
            <div className="section-label">{settings.aboutChefLabelJa || 'シェフ紹介'}</div>
            <h2 className="section-title" style={{ fontSize: '2.5rem' }}>
              <EmphasisText text={settings.aboutChefTitleJa || '熟練の<em>技</em>'} />
            </h2>
            <div className="divider" style={{ margin: '0 0 1.5rem 0' }}></div>
            <div style={{ lineHeight: '1.8', color: 'var(--text-muted)' }}>
              {(settings.aboutChefDescJa || '長年の経験を積み、日本の皆さまに「本物のインド料理」を届けるために来日しました。カレーの奥深さ、スパイスの魔法、そしてインドの温かいおもてなしの心を、一皿一皿に込めて提供しています。辛さの調節や、ベジタリアン対応などもお気軽にお声がけください。').split('\n').map((line: string, i: number) => (
                <p key={i} style={{ marginBottom: '10px' }}>{line}</p>
              ))}
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}

function StoryPillar({
  icon: Icon,
  title,
  desc,
}: {
  icon: React.ComponentType<{ size?: number; color?: string }>;
  title: string;
  desc: string;
}) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'flex-start',
        gap: '14px',
        backgroundColor: '#ffffff',
        borderRadius: '14px',
        padding: '14px 18px',
        border: '1px solid rgba(0, 0, 0, 0.06)',
        boxShadow: '0 2px 8px rgba(0, 0, 0, 0.03)',
      }}
    >
      <div
        style={{
          width: '38px',
          height: '38px',
          borderRadius: '10px',
          backgroundColor: '#fff7ed',
          border: '1px solid #fed7aa',
          display: 'grid',
          placeItems: 'center',
          color: 'var(--spice)',
          flexShrink: 0,
          marginTop: '2px',
        }}
      >
        <Icon size={18} />
      </div>
      <div>
        <h4 style={{ margin: '0 0 3px', fontSize: '0.96rem', fontWeight: 700, color: 'var(--dark-bark)' }}>
          {title}
        </h4>
        <p style={{ margin: 0, fontSize: '0.84rem', color: '#6b7280', lineHeight: 1.5 }}>
          {desc}
        </p>
      </div>
    </div>
  );
}
