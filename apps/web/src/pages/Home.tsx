import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { toast } from 'react-hot-toast';
import { MapPin, Clock, Phone, ChevronUp } from 'lucide-react';
import { apiFetch, assetUrl, errorMessage, getPublic } from '../lib/api';
import OfferSticker from '../components/MemberOffers';
import GoogleReviews from '../components/GoogleReviews';
import EmphasisText from '../components/EmphasisText';
import { DEFAULT_STORE_LOCATIONS, saveOrderStoreId, type StoreLocation } from '../lib/stores';

const DEFAULT_HERO_IMAGES = [
  "https://images.unsplash.com/photo-1517248135467-4c7edcad34c4?auto=format&fit=crop&w=1920&q=80",
];

const UNSPLASH_WIDTHS = [640, 1080, 1920];
// Unsplash images can be resized by URL, so phones get a 640px image instead of the 1920px one.
const responsiveSrcSet = (url: string) =>
  url.startsWith('https://images.unsplash.com/')
    ? UNSPLASH_WIDTHS.map(w => `${url.replace(/([?&])w=\d+/, `$1w=${w}`)} ${w}w`).join(', ')
    : undefined;
const prefersReducedMotion = () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

export default function Home() {
  const [currentSlide, setCurrentSlide] = useState(0);
  const [carousels, setCarousels] = useState<any[]>([]);
  const [menuItems, setMenuItems] = useState<any[]>([]);
  const [settings, setSettings] = useState<any>({});
  const [newsletterEmail, setNewsletterEmail] = useState('');
  const [submittingNewsletter, setSubmittingNewsletter] = useState(false);
  const [menuSlideIndex, setMenuSlideIndex] = useState(0);
  // Only slides that have been shown (plus the next one) are mounted, so hidden hero images don't compete with the first one.
  const [loadedSlides, setLoadedSlides] = useState(1);
  const [stores, setStores] = useState<StoreLocation[]>(DEFAULT_STORE_LOCATIONS);
  const [selectedStoreId, setSelectedStoreId] = useState<string>('musashisakai');
  const selectedStore = stores.find(s => s.id === selectedStoreId) || stores[0] || DEFAULT_STORE_LOCATIONS[0];

  // Scroll to top floating button state
  const [showScrollTop, setShowScrollTop] = useState<boolean>(false);

  useEffect(() => {
    const handleScroll = () => {
      setShowScrollTop(window.scrollY > 280);
    };
    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  const scrollToTop = () => {
    window.scrollTo({
      top: 0,
      behavior: 'smooth',
    });
  };

  const handleNewsletterSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanEmail = newsletterEmail.trim();
    if (!cleanEmail || submittingNewsletter) return;

    // Email regex validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(cleanEmail)) {
      toast.error('有効なメールアドレスを入力してください。');
      return;
    }

    setSubmittingNewsletter(true);
    try {
      const res = await apiFetch('/api/v1/contact', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: 'ニュースレター購読者',
          email: cleanEmail,
          message: 'ニュースレターに登録 (Subscribed to Newsletter)',
          type: 'GENERAL',
          isNewsletter: true
        })
      });

      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        if (data.alreadySubscribed) {
          toast.success('既にニュースレターにご登録いただいております。最新情報をお届けします！');
        } else {
          toast.success('ニュースレターのご登録ありがとうございます！');
        }
        setNewsletterEmail('');
      } else {
        const errorMsg = data?.error?.message || (await errorMessage(res, '登録に失敗しました。'));
        toast.error(errorMsg);
      }
    } catch {
      toast.error('通信エラーが発生しました。インターネット接続をご確認ください。');
    } finally {
      setSubmittingNewsletter(false);
    }
  };

  useEffect(() => {
    // Fetch Settings
    getPublic<any>('/api/v1/settings')
      .then(data => setSettings(data))
      .catch(console.error);

    // Fetch Carousels
    getPublic<any>('/api/v1/carousels')
      .then(data => setCarousels(data))
      .catch(console.error);

    // Fetch Menu Items
    getPublic<any>('/api/v1/menu/items')
      .then(data => {
        if(Array.isArray(data)) setMenuItems(data);
      })
      .catch(console.error);

    // Fetch Stores dynamically
    getPublic<StoreLocation[]>('/api/v1/stores')
      .then(data => {
        if (Array.isArray(data) && data.length > 0) {
          setStores(data);
          setSelectedStoreId(prev => (data.some(s => s.id === prev) ? prev : data[0].id));
        }
      })
      .catch(console.error);
  }, []);

  const heroImages = carousels.length > 0 ? carousels.map(c => assetUrl(c.imageUrl)) : DEFAULT_HERO_IMAGES;
  const recommendedItems = menuItems.filter(item => item.isRecommended).slice(0, 4);
  const regularItems = menuItems.filter(item => !item.isRecommended);

  useEffect(() => {
    if (regularItems.length <= 1 || prefersReducedMotion()) return;
    const timer = setInterval(() => {
      setMenuSlideIndex((prev) => (prev + 1) % regularItems.length);
    }, 4000);
    return () => clearInterval(timer);
  }, [regularItems.length]);

  useEffect(() => {
    setLoadedSlides(prev => Math.max(prev, Math.min(currentSlide + 2, heroImages.length)));
  }, [currentSlide, heroImages.length]);

  useEffect(() => {
    if (heroImages.length <= 1 || prefersReducedMotion()) return;
    const timer = setInterval(() => {
      setCurrentSlide((prev) => (prev + 1) % heroImages.length);
    }, 5000);
    return () => clearInterval(timer);
  }, [heroImages.length]);

  return (
    <main>
      <title>Adarsha (アダルサ) | 熊谷の本格インド料理</title>
      <meta name="description" content="埼玉・熊谷の本格インド料理店アダルサ。タンドール窯で焼き上げるナン、スパイス香るカレー、ランチ・テイクアウト・グランドメニューをご案内します。" />
      <link rel="canonical" href="https://pnglike.com/" />
      <meta property="og:title" content="Adarsha (アダルサ) | 熊谷の本格インド料理" />
      <meta property="og:description" content="埼玉・熊谷の本格インド料理店アダルサ。タンドール窯で焼き上げるナン、スパイス香るカレー、ランチ・テイクアウト・グランドメニューをご案内します。" />
      <meta property="og:type" content="website" />
      <meta property="og:url" content="https://pnglike.com/" />
      <meta property="og:image" content="https://pnglike.com/bg-hero-img.webp" />
      <meta name="twitter:card" content="summary_large_image" />
      <meta name="twitter:title" content="Adarsha (アダルサ) | 熊谷の本格インド料理" />
      <meta name="twitter:description" content="埼玉・熊谷の本格インド料理店アダルサ。ランチ、テイクアウト、グランドメニューをご案内します。" />
      <meta name="twitter:image" content="https://pnglike.com/bg-hero-img.webp" />
      {/* Hero Slider */}
      <div className="home-hero">
        {heroImages.slice(0, loadedSlides).map((img, index) => (
          <img 
            key={index}
            src={img} 
            srcSet={responsiveSrcSet(img)}
            sizes="100vw"
            alt=""
            fetchPriority={index === 0 ? 'high' : 'low'}
            decoding="async" 
            className="slide-bg-img" 
            style={{ 
              opacity: currentSlide === index ? 0.6 : 0, 
              transition: 'opacity 1s ease-in-out',
              position: 'absolute',
              top: 0,
              left: 0,
              width: '100%',
              height: '100%',
              objectFit: 'cover'
            }} 
          />
        ))}
        
        {/* Member offers (Admin → Stamps, Offers & Points): a bouncing gift on the banner */}
        <OfferSticker />

        <div className="hero-content">
          <div className="hero-tag">{settings.heroTagJa || '埼玉・熊谷で味わう、本場のインド料理'}</div>
          <h1 className="hero-title">{carousels[currentSlide]?.titleJa || 'インドの香りを、そのままに'}</h1>
          <p className="hero-sub" style={{ whiteSpace: 'pre-line' }}>{settings.heroSubJa || <>愛とスパイス、そして伝統に彩られた数世紀にわたるレシピを。<br/>Adarsha Indian Cuisineで皆様をお待ちしております。</>}</p>
          <div className="hero-btns">
            <Link to="/menu/lunch" style={{ textDecoration: 'none' }}>
              <button className="btn-warm">ランチメニューを見る</button>
            </Link>
            <button className="btn-outline-warm" onClick={() => document.getElementById('locations')?.scrollIntoView({ behavior: 'smooth' })}>店舗案内</button>
          </div>
        </div>
        
        {/* Slider Controls (Prev / Next) */}
        {heroImages.length > 1 && (
          <>
            <button
              type="button"
              onClick={() => setCurrentSlide((prev) => (prev - 1 + heroImages.length) % heroImages.length)}
              aria-label="Previous slide"
              style={{
                position: 'absolute',
                left: '20px',
                top: '50%',
                transform: 'translateY(-50%)',
                zIndex: 20,
                width: '44px',
                height: '44px',
                borderRadius: '50%',
                background: 'rgba(0, 0, 0, 0.35)',
                color: '#fff',
                border: '1px solid rgba(255, 255, 255, 0.3)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                cursor: 'pointer',
                backdropFilter: 'blur(4px)',
                transition: 'all 0.2s',
                fontSize: '18px',
              }}
              onMouseEnter={(e) => (e.currentTarget.style.background = 'rgba(0, 0, 0, 0.65)')}
              onMouseLeave={(e) => (e.currentTarget.style.background = 'rgba(0, 0, 0, 0.35)')}
            >
              ❮
            </button>
            <button
              type="button"
              onClick={() => setCurrentSlide((prev) => (prev + 1) % heroImages.length)}
              aria-label="Next slide"
              style={{
                position: 'absolute',
                right: '20px',
                top: '50%',
                transform: 'translateY(-50%)',
                zIndex: 20,
                width: '44px',
                height: '44px',
                borderRadius: '50%',
                background: 'rgba(0, 0, 0, 0.35)',
                color: '#fff',
                border: '1px solid rgba(255, 255, 255, 0.3)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                cursor: 'pointer',
                backdropFilter: 'blur(4px)',
                transition: 'all 0.2s',
                fontSize: '18px',
              }}
              onMouseEnter={(e) => (e.currentTarget.style.background = 'rgba(0, 0, 0, 0.65)')}
              onMouseLeave={(e) => (e.currentTarget.style.background = 'rgba(0, 0, 0, 0.35)')}
            >
              ❯
            </button>
          </>
        )}

        {/* Slider Indicators */}
        <div style={{ position: 'absolute', bottom: '30px', display: 'flex', gap: '10px', zIndex: 20 }}>
          {heroImages.map((_, idx) => (
            <button 
              key={idx}
              onClick={() => setCurrentSlide(idx)}
              style={{
                width: '12px', height: '12px', borderRadius: '50%', border: 'none', cursor: 'pointer',
                backgroundColor: currentSlide === idx ? 'var(--gold)' : 'rgba(255,255,255,0.5)',
                transition: 'background-color 0.3s'
              }}
              aria-label={`Go to slide ${idx + 1}`}
            />
          ))}
        </div>
      </div>

      {/* Indian Food Welcome Section */}
      <div className="section" style={{ backgroundColor: 'white', padding: '4rem 20px' }}>
        <div className="centered" style={{ maxWidth: '800px', margin: '0 auto' }}>
          <div className="section-label">{settings.welcomeTitleEn || 'Authentic Indian Flavors'}</div>
          <h2 className="section-title" style={{ fontSize: '2.5rem', marginBottom: '1.5rem', color: 'var(--dark-bark)' }}>
            {settings.welcomeTitleJa || '本格インドの味わい'}
          </h2>
          <div className="divider" style={{ marginBottom: '2rem' }}></div>
          <p style={{ fontSize: '1.1rem', lineHeight: '1.8', color: 'var(--text-muted)', whiteSpace: 'pre-wrap' }}>
            {settings.welcomeTextJa || 'インドの豊かな食文化と鮮やかなスパイスを体験してください。熟練のシェフが伝統的なタンドール窯と新鮮な食材を使用し、すべての料理をゼロから手作りしています。忘れられない特別なひとときをお届けします。'}
          </p>
        </div>
      </div>

      {/* Menu Explorer */}
      <div className="section" style={{ backgroundColor: 'var(--cream)' }}>
        <div className="centered" style={{ marginBottom: '40px' }}>
          <div className="section-label">{settings.menuExplorerLabelJa || 'メニューを見る'}</div>
          <h2 className="section-title"><EmphasisText text={settings.menuExplorerTitleJa || 'キッチンから<em>お届け</em>'} /></h2>
          <div className="divider"></div>
          <p className="section-sub">{settings.aboutJa || '毎日手作りの新鮮な味 — 手挽きのスパイス、本格的な粘土窯（タンドール）、妥協のない調理'}</p>
        </div>

        <div style={{ maxWidth: '1200px', margin: '0 auto', padding: '0 20px' }}>
          
          {/* Tabs */}
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px', justifyContent: 'center', marginBottom: '40px' }}>
            <Link to="/menu/grand" style={{ textDecoration: 'none' }}><button style={{ backgroundColor: 'var(--spice)', color: 'white', border: '1px solid var(--spice)', padding: '10px 24px', borderRadius: '4px', fontWeight: 'bold', cursor: 'pointer', fontSize: '0.9rem' }}>すべて</button></Link>
            <Link to="/menu/grand" style={{ textDecoration: 'none' }}><button style={{ backgroundColor: 'white', color: 'var(--dark-bark)', border: '1px solid #e5dbcd', padding: '10px 24px', borderRadius: '4px', fontWeight: 'bold', cursor: 'pointer', fontSize: '0.9rem' }}>グランドメニュー</button></Link>
            <Link to="/menu/lunch" style={{ textDecoration: 'none' }}><button style={{ backgroundColor: 'white', color: 'var(--dark-bark)', border: '1px solid #e5dbcd', padding: '10px 24px', borderRadius: '4px', fontWeight: 'bold', cursor: 'pointer', fontSize: '0.9rem' }}>ランチメニュー</button></Link>
            <Link to="/menu/takeout" style={{ textDecoration: 'none' }}><button style={{ backgroundColor: 'white', color: 'var(--dark-bark)', border: '1px solid #e5dbcd', padding: '10px 24px', borderRadius: '4px', fontWeight: 'bold', cursor: 'pointer', fontSize: '0.9rem' }}>テイクアウト</button></Link>
          </div>

          {/* Slider */}
          <div style={{ overflow: 'hidden', padding: '10px 0' }}>
            <div 
              style={{ 
                display: 'flex', 
                gap: '24px', 
                transition: 'transform 0.6s cubic-bezier(0.25, 1, 0.5, 1)', 
                transform: `translateX(calc(-${menuSlideIndex * 304}px))` 
              }}
            >
              {regularItems.length > 0 ? [...regularItems, ...regularItems, ...regularItems].map((item, idx) => (
                <div key={`${item.id}-${idx}`} style={{ minWidth: '280px', flex: '0 0 280px', backgroundColor: 'white', borderRadius: '12px', overflow: 'hidden', boxShadow: '0 4px 15px rgba(0,0,0,0.05)', display: 'flex', flexDirection: 'column' }}>
                  <div style={{ height: '220px', width: '100%', backgroundColor: '#f9f6f0', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px' }}>
                    <img
                      src={assetUrl(item.imageUrl) || "/bg-hero-img.webp"}
                      alt={item.nameJa || item.nameEn}
                      loading="lazy"
                      decoding="async"
                      width={240}
                      height={180}
                      onError={(e) => {
                        const target = e.currentTarget;
                        if (!target.src.endsWith('/bg-hero-img.webp')) {
                          target.src = '/bg-hero-img.webp';
                        }
                      }}
                      style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: '8px' }}
                    />
                  </div>
                  <div style={{ padding: '24px', display: 'flex', flexDirection: 'column', flex: '1' }}>
                    <h3 style={{ fontSize: '1.2rem', color: 'var(--dark-bark)', margin: '0 0 10px 0' }}>{item.nameJa || item.nameEn}</h3>
                    <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', lineHeight: '1.5', margin: '0 0 16px 0', flex: '1' }}>{item.descriptionJa || item.descriptionEn || '本格インドの味をお楽しみください。'}</p>
                    
                    {typeof item.rating === 'number' && (
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '12px' }}>
                        <span aria-hidden="true" style={{ color: 'var(--gold)', letterSpacing: '2px', fontSize: '0.8rem' }}>{'★'.repeat(Math.round(item.rating))}{'☆'.repeat(5 - Math.round(item.rating))}</span>
                        <span style={{ color: 'var(--text-muted)', fontSize: '0.8rem' }}>{item.rating.toFixed(1)}</span>
                      </div>
                    )}
                    
                    <div style={{ color: 'var(--spice)', fontSize: '1.4rem', fontWeight: 'bold', fontFamily: 'serif' }}>
                      ¥{item.price.toLocaleString()} <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)', fontWeight: 'normal', fontFamily: 'sans-serif' }}>(税込)</span>
                    </div>
                  </div>
                </div>
              )) : <div style={{ color: 'var(--text-muted)', textAlign: 'center', width: '100%' }}>メニュー項目がありません。</div>}
            </div>
          </div>
        </div>
      </div>

      {/* Recommended Menu */}
      {recommendedItems.length > 0 && (
        <div className="section" style={{ backgroundColor: 'var(--cream)', paddingTop: '0' }}>
          <div className="centered" style={{ marginBottom: '40px' }}>
            <div className="section-label">{settings.recommendedLabelJa || 'シェフの厳選'}</div>
            <h2 className="section-title"><EmphasisText text={settings.recommendedTitleJa || 'おすすめ<em>メニュー</em>'} /></h2>
            <div className="divider"></div>
            <p className="section-sub">{settings.recommendedSubJa || '全店舗で愛され続けている、不動の人気メニュー'}</p>
          </div>

          <div style={{ maxWidth: '1200px', margin: '0 auto', padding: '0 20px' }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(min(100%, 260px), 1fr))', gap: '24px' }}>
              {recommendedItems.map(item => (
                <div key={item.id} style={{ backgroundColor: 'white', borderRadius: '12px', overflow: 'hidden', boxShadow: '0 4px 15px rgba(0,0,0,0.05)', display: 'flex', flexDirection: 'column' }}>
                  <div style={{ height: '220px', width: '100%', backgroundColor: '#f9f6f0', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px' }}>
                    <img
                      src={assetUrl(item.imageUrl) || "/bg-hero-img.webp"}
                      alt={item.nameJa || item.nameEn}
                      loading="lazy"
                      decoding="async"
                      width={240}
                      height={180}
                      onError={(e) => {
                        const target = e.currentTarget;
                        if (!target.src.endsWith('/bg-hero-img.webp')) {
                          target.src = '/bg-hero-img.webp';
                        }
                      }}
                      style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: '8px' }}
                    />
                  </div>
                  <div style={{ padding: '24px', display: 'flex', flexDirection: 'column', flex: '1' }}>
                    <h3 style={{ fontSize: '1.2rem', color: 'var(--dark-bark)', margin: '0 0 10px 0' }}>{item.nameJa || item.nameEn}</h3>
                    <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', lineHeight: '1.5', margin: '0 0 16px 0', flex: '1' }}>{item.descriptionJa || item.descriptionEn}</p>
                    
                    {typeof item.rating === 'number' && (
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '12px' }}>
                        <span aria-hidden="true" style={{ color: 'var(--gold)', letterSpacing: '2px', fontSize: '0.8rem' }}>{'★'.repeat(Math.round(item.rating))}{'☆'.repeat(5 - Math.round(item.rating))}</span>
                        <span style={{ color: 'var(--text-muted)', fontSize: '0.8rem' }}>{item.rating.toFixed(1)}</span>
                      </div>
                    )}
                    
                    <div style={{ color: 'var(--spice)', fontSize: '1.4rem', fontWeight: 'bold', fontFamily: 'serif' }}>
                      ¥{item.price.toLocaleString()} <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)', fontWeight: 'normal', fontFamily: 'sans-serif' }}>(税込)</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Store Location Section */}
      <div id="locations" className="section" style={{ backgroundColor: 'var(--cream)', padding: '4.5rem 20px' }}>
        <div style={{ textAlign: 'center', marginBottom: '26px' }}>
          <div style={{ fontSize: '0.82rem', fontWeight: 700, color: '#b3471c', letterSpacing: '0.12em', marginBottom: '8px' }}>
            {settings.storeSectionLabelJa || '店舗を探す'}
          </div>
          <h2 style={{ fontSize: '2.6rem', fontWeight: 800, color: '#261c14', margin: '0 0 8px 0', letterSpacing: '0.02em', lineHeight: 1.2 }}>
            <EmphasisText text={settings.storeSectionTitleJa || '私たちの<em>店舗</em>'} />
          </h2>
          <div style={{ width: '42px', height: '3px', backgroundColor: '#c4521f', margin: '12px auto 14px', borderRadius: '2px' }}></div>
          <p style={{ color: '#6b5d52', fontSize: '1.02rem', margin: 0, fontWeight: 500 }}>
            {settings.storeSectionSubJa || '店舗を選択して、住所、営業時間、地図をご確認ください'}
          </p>
        </div>

        {/* Store Tabs Pills */}
        <div style={{
          maxWidth: '1080px',
          margin: '0 auto 32px',
          display: 'flex',
          flexWrap: 'wrap',
          justifyContent: 'center',
          gap: '10px 12px',
        }}>
          {stores.map(store => {
            const isActive = store.id === selectedStore.id;
            return (
              <button
                key={store.id}
                type="button"
                onClick={() => setSelectedStoreId(store.id)}
                style={{
                  backgroundColor: isActive ? '#b3471c' : '#ffffff',
                  color: isActive ? '#ffffff' : '#3d3027',
                  border: isActive ? '1px solid #b3471c' : '1px solid #ebdcd0',
                  borderRadius: '6px',
                  padding: '9px 18px',
                  fontSize: '0.9rem',
                  fontWeight: isActive ? 700 : 600,
                  cursor: 'pointer',
                  boxShadow: isActive ? '0 4px 12px rgba(179, 71, 28, 0.28)' : '0 1px 4px rgba(0, 0, 0, 0.03)',
                  transition: 'all 0.2s ease',
                  outline: 'none',
                  whiteSpace: 'nowrap',
                }}
              >
                {store.name}
              </button>
            );
          })}
        </div>

        {/* Main Store Card */}
        <div style={{ maxWidth: '1140px', margin: '0 auto' }}>
          <div style={{
            backgroundColor: '#ffffff',
            borderRadius: '16px',
            display: 'flex',
            flexWrap: 'wrap',
            overflow: 'hidden',
            boxShadow: '0 10px 36px rgba(0, 0, 0, 0.06)',
            border: '1px solid #f2e9df',
          }}>
            {/* Left Info Column */}
            <div style={{
              flex: '1 1 420px',
              padding: '36px 36px 32px',
              position: 'relative',
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'space-between',
              minWidth: '320px',
            }}>
              {/* Large Watermark Number */}
              <div style={{
                position: 'absolute',
                top: '16px',
                left: '28px',
                fontSize: '5.8rem',
                fontWeight: 900,
                color: '#faede2',
                zIndex: 0,
                lineHeight: 1,
                fontFamily: 'serif',
                pointerEvents: 'none',
                userSelect: 'none',
              }}>
                {selectedStore.number}
              </div>

              <div style={{ position: 'relative', zIndex: 1 }}>
                {/* Store Header */}
                <div style={{ marginBottom: '18px' }}>
                  <h3 style={{ fontSize: '1.75rem', fontWeight: 800, margin: '0 0 4px 0', color: '#261c14' }}>
                    {selectedStore.name}
                  </h3>
                  <p style={{ color: '#b3471c', fontSize: '0.85rem', margin: '0 0 12px 0', fontWeight: 700 }}>
                    {selectedStore.area}
                  </p>
                  <span style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '6px',
                    backgroundColor: '#fdf5ef',
                    border: '1px solid #f6ded0',
                    padding: '4px 14px',
                    borderRadius: '9999px',
                    fontSize: '0.82rem',
                    color: '#b3471c',
                    fontWeight: 700,
                  }}>
                    {selectedStore.badge}
                  </span>
                </div>

                {/* Details List */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '20px', marginBottom: '22px' }}>
                  {/* Address */}
                  <div style={{ display: 'flex', gap: '14px', alignItems: 'flex-start' }}>
                    <div style={{
                      width: '38px',
                      height: '38px',
                      borderRadius: '50%',
                      backgroundColor: '#faede2',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      flexShrink: 0,
                      color: '#b3471c',
                    }}>
                      <MapPin size={18} strokeWidth={2.2} />
                    </div>
                    <div>
                      <div style={{ fontSize: '0.75rem', color: '#8a7c73', fontWeight: 700, marginBottom: '2px' }}>住所</div>
                      <div style={{ color: '#261c14', fontSize: '0.92rem', fontWeight: 600, lineHeight: '1.45' }}>
                        {selectedStore.address}
                      </div>
                      {selectedStore.access && (
                        <div style={{ color: '#574b43', fontSize: '0.88rem', marginTop: '2px' }}>
                          {selectedStore.access}
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Hours */}
                  <div style={{ display: 'flex', gap: '14px', alignItems: 'flex-start' }}>
                    <div style={{
                      width: '38px',
                      height: '38px',
                      borderRadius: '50%',
                      backgroundColor: '#faede2',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      flexShrink: 0,
                      color: '#b3471c',
                    }}>
                      <Clock size={18} strokeWidth={2.2} />
                    </div>
                    <div>
                      <div style={{ fontSize: '0.75rem', color: '#8a7c73', fontWeight: 700, marginBottom: '2px' }}>営業時間</div>
                      <div style={{ color: '#15803d', fontSize: '0.92rem', fontWeight: 700, lineHeight: '1.45' }}>
                        {selectedStore.hours}
                        {selectedStore.holiday && (
                          <span style={{ marginLeft: '6px' }}>・ {selectedStore.holiday}</span>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Phone */}
                  <div style={{ display: 'flex', gap: '14px', alignItems: 'flex-start' }}>
                    <div style={{
                      width: '38px',
                      height: '38px',
                      borderRadius: '50%',
                      backgroundColor: '#faede2',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      flexShrink: 0,
                      color: '#b3471c',
                    }}>
                      <Phone size={18} strokeWidth={2.2} />
                    </div>
                    <div>
                      <div style={{ fontSize: '0.75rem', color: '#8a7c73', fontWeight: 700, marginBottom: '2px' }}>電話番号</div>
                      <div style={{ color: '#261c14', fontSize: '1rem', fontWeight: 600 }}>
                        <a href={`tel:${selectedStore.phone.replace(/[^0-9]/g, '')}`} style={{ color: 'inherit', textDecoration: 'none' }}>
                          {selectedStore.phone}
                        </a>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Reviews Pill */}
                <div style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '6px',
                  backgroundColor: '#fdf8ee',
                  border: '1px solid #f7ebd1',
                  borderRadius: '6px',
                  padding: '8px 14px',
                  fontSize: '0.88rem',
                  marginBottom: '20px',
                }}>
                  <span style={{ color: '#d97706', letterSpacing: '1px', fontSize: '0.9rem' }}>★★★★★</span>
                  <span style={{ fontWeight: 800, color: '#261c14' }}>{selectedStore.rating.toFixed(1)}</span>
                  <span style={{ color: '#78716c', fontSize: '0.82rem' }}>
                    · Googleで{selectedStore.reviewCount}件のレビュー
                  </span>
                </div>

                {/* Actions: Order, Book Table & Route */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginTop: '4px' }}>
                  <Link
                    to={`/order?store=${selectedStore.id}`}
                    onClick={() => saveOrderStoreId(selectedStore.id)}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: '8px',
                      background: 'linear-gradient(135deg, #c8501a, #e8682c)',
                      color: '#ffffff',
                      textDecoration: 'none',
                      padding: '13px 16px',
                      borderRadius: '6px',
                      fontWeight: 800,
                      fontSize: '0.95rem',
                      boxShadow: '0 4px 12px rgba(200, 80, 26, 0.28)',
                      transition: 'all 0.2s',
                    }}
                  >
                    🛍️ この店舗（{selectedStore.name}）でテイクアウト・デリバリー注文
                  </Link>
                  <div style={{ display: 'grid', gridTemplateColumns: '1.25fr 1fr', gap: '10px' }}>
                    <button
                      type="button"
                      onClick={() => {
                        window.dispatchEvent(
                          new CustomEvent('adarsha:open-reservation', { detail: { storeId: selectedStore.id } })
                        );
                      }}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: '8px',
                        backgroundColor: '#b3471c',
                        color: '#ffffff',
                        border: 'none',
                        padding: '13px 16px',
                        borderRadius: '6px',
                        fontWeight: 800,
                        fontSize: '0.94rem',
                        cursor: 'pointer',
                        boxShadow: '0 4px 12px rgba(179, 71, 28, 0.25)',
                        transition: 'all 0.2s',
                      }}
                      onMouseOver={e => e.currentTarget.style.backgroundColor = '#993913'}
                      onMouseOut={e => e.currentTarget.style.backgroundColor = '#b3471c'}
                    >
                      📅 席を予約する
                    </button>
                    <a
                      href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(selectedStore.name + ' ' + selectedStore.address)}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: '6px',
                        backgroundColor: '#ffffff',
                        color: '#b3471c',
                        border: '1.5px solid #b3471c',
                        textDecoration: 'none',
                        padding: '13px 12px',
                        borderRadius: '6px',
                        fontWeight: 700,
                        fontSize: '0.9rem',
                        transition: 'all 0.2s',
                      }}
                      onMouseOver={e => e.currentTarget.style.backgroundColor = '#faede2'}
                      onMouseOut={e => e.currentTarget.style.backgroundColor = '#ffffff'}
                    >
                      🗺️ ルート検索
                    </a>
                  </div>
                </div>
              </div>
            </div>

            {/* Right Map Column */}
            <div style={{
              flex: '1 1 500px',
              minHeight: '460px',
              backgroundColor: '#e8e6e1',
              position: 'relative',
            }}>
              <iframe
                key={selectedStore.id}
                src={selectedStore.mapEmbedUrl}
                title={`Google マップ: ${selectedStore.name}`}
                width="100%"
                height="100%"
                style={{ border: 0, position: 'absolute', top: 0, left: 0, width: '100%', height: '100%' }}
                allowFullScreen={false}
                loading="lazy"
                referrerPolicy="no-referrer-when-downgrade"
              />
            </div>
          </div>
        </div>
      </div>

      {/* Google Reviews Section: live from Google, refreshed monthly */}
      <GoogleReviews fallbackLink={settings.storeReviewLink || settings.googleMapsLink || 'https://www.google.com/maps/search/?api=1&query=' + encodeURIComponent(settings.name || 'Adarsha Indian Cuisine')} />
      
      {/* Subscription Section */}
      <div className="section" style={{ position: 'relative', padding: '100px 20px', backgroundColor: 'var(--dark-bark)', color: 'white', overflow: 'hidden' }}>
        <div style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', opacity: 0.15, backgroundImage: `url(${settings.newsletterBgImage || 'https://images.unsplash.com/photo-1596797038530-2c107229654b?auto=format&fit=crop&w=1920&q=80'})`, backgroundSize: 'cover', backgroundPosition: 'center', zIndex: 0 }}></div>
        <div style={{ position: 'relative', zIndex: 1, maxWidth: '800px', margin: '0 auto', textAlign: 'center' }}>
          <h2 style={{ fontSize: '2.5rem', fontFamily: 'var(--font-display)', marginBottom: '16px', letterSpacing: '2px' }}>{settings.newsletterTitleJa || 'ニュースレターに登録'}</h2>
          <p style={{ fontSize: '1.1rem', color: 'rgba(255,255,255,0.8)', marginBottom: '40px', lineHeight: '1.6', whiteSpace: 'pre-line' }}>{settings.newsletterSubJa || <>最新のメニュー、シークレットレシピ、そして限定のお得な情報を<br/>あなたのメールボックスへ直接お届けします。</>}</p>
          
          <form style={{ display: 'flex', gap: '10px', maxWidth: '500px', margin: '0 auto', flexWrap: 'wrap', justifyContent: 'center' }} onSubmit={handleNewsletterSubmit}>
            <input 
              type="email" 
              aria-label="メールアドレス" 
              value={newsletterEmail} 
              onChange={(e) => setNewsletterEmail(e.target.value)} 
              placeholder="メールアドレスを入力" 
              required 
              disabled={submittingNewsletter}
              style={{ flex: '1', minWidth: '250px', padding: '16px 24px', borderRadius: '50px', border: 'none', fontSize: '1rem', outline: 'none' }} 
            />
            <button 
              type="submit" 
              disabled={submittingNewsletter}
              style={{ 
                backgroundColor: 'var(--spice)', 
                color: 'white', 
                border: 'none', 
                padding: '16px 36px', 
                borderRadius: '50px', 
                fontWeight: 'bold', 
                fontSize: '1rem', 
                cursor: submittingNewsletter ? 'not-allowed' : 'pointer', 
                opacity: submittingNewsletter ? 0.7 : 1,
                transition: 'all 0.3s', 
                whiteSpace: 'nowrap', 
                boxShadow: '0 4px 15px rgba(181, 69, 27, 0.4)' 
              }}
            >
              {submittingNewsletter ? '登録中…' : '登録する'}
            </button>
          </form>
        </div>
      </div>

      {/* ── SCROLL TO TOP FLOATING BUTTON (Bottom to Top) ── */}
      <button
        type="button"
        className={`home-scroll-top-btn ${showScrollTop ? 'is-visible' : ''}`}
        onClick={scrollToTop}
        aria-label="ページ最上部へ戻る"
        title="最上部へ戻る"
        style={{
          position: 'fixed',
          bottom: '26px',
          right: '22px',
          zIndex: 90,
          width: '46px',
          height: '48px',
          background: '#ffffff',
          color: '#b82e1f',
          border: '1.5px solid #fed7aa',
          borderRadius: '14px',
          boxShadow: '0 4px 16px rgba(184, 46, 31, 0.18), 0 2px 6px rgba(0, 0, 0, 0.08)',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          cursor: 'pointer',
          opacity: showScrollTop ? 1 : 0,
          transform: showScrollTop ? 'translateY(0) scale(1)' : 'translateY(14px) scale(0.9)',
          pointerEvents: showScrollTop ? 'auto' : 'none',
          transition: 'all 0.22s ease-out',
        }}
      >
        <ChevronUp size={20} strokeWidth={2.8} />
        <span style={{ fontSize: '0.62rem', fontWeight: 900, marginTop: '-2px' }}>TOP</span>
      </button>
    </main>
  );
}
