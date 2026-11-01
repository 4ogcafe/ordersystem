import { useEffect, useState, useMemo } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Clock, Search, ArrowRight, BookOpen, Sparkles, ChefHat, MapPin } from 'lucide-react';
import { assetUrl, getPublic } from '../lib/api';

interface BlogPostSummary {
  id: string;
  slug: string;
  title: string;
  excerpt?: string | null;
  coverImage?: string | null;
  category?: string | null;
  tags?: string[] | null;
  author?: string | null;
  readTimeMinutes: number;
  publishedAt?: string | null;
  createdAt: string;
}

interface BlogApiResponse {
  posts: BlogPostSummary[];
  total: number;
  categories: string[];
}

export default function Blog() {
  const [searchParams, setSearchParams] = useSearchParams();
  const currentCategory = searchParams.get('category') || 'all';

  const [posts, setPosts] = useState<BlogPostSummary[]>([]);
  const [categories, setCategories] = useState<string[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');

  useEffect(() => {
    setLoading(true);
    const params = new URLSearchParams();
    if (currentCategory && currentCategory !== 'all') {
      params.set('category', currentCategory);
    }
    const url = `/api/v1/blogs${params.toString() ? `?${params.toString()}` : ''}`;

    getPublic<BlogApiResponse>(url)
      .then(data => {
        setPosts(data.posts || []);
        setTotal(data.total || 0);
        if (data.categories && data.categories.length > 0) {
          setCategories(data.categories);
        }
      })
      .catch(err => {
        console.error('Failed to load blog posts:', err);
        setPosts([]);
      })
      .finally(() => setLoading(false));
  }, [currentCategory]);

  const filteredPosts = useMemo(() => {
    if (!searchQuery.trim()) return posts;
    const q = searchQuery.toLowerCase();
    return posts.filter(p => 
      p.title.toLowerCase().includes(q) ||
      (p.excerpt && p.excerpt.toLowerCase().includes(q)) ||
      (p.category && p.category.toLowerCase().includes(q)) ||
      (Array.isArray(p.tags) && p.tags.some(t => t.toLowerCase().includes(q)))
    );
  }, [posts, searchQuery]);

  const featuredPost = filteredPosts.length > 0 && !searchQuery.trim() && currentCategory === 'all' 
    ? filteredPosts[0] 
    : null;

  const regularPosts = featuredPost 
    ? filteredPosts.slice(1) 
    : filteredPosts;

  const handleSelectCategory = (cat: string) => {
    if (cat === 'all') {
      searchParams.delete('category');
    } else {
      searchParams.set('category', cat);
    }
    setSearchParams(searchParams);
  };

  // Structured Data (Schema.org Blog + BreadcrumbList) for AI SEO & Direct Engine Optimization
  const blogJsonLd = {
    '@context': 'https://schema.org',
    '@type': 'Blog',
    '@id': 'https://pnglike.com/blog#blog',
    'name': 'Adarsha (アダルサ) 公式ブログ・スパイスコラム',
    'description': '埼玉県熊谷市の本格インド料理店Adarsha（アダルサ）がお届けする、スパイスの秘密、備長炭タンドール料理、お得なランチ情報や食文化コラム。',
    'url': 'https://pnglike.com/blog',
    'inLanguage': 'ja',
    'publisher': {
      '@type': 'Restaurant',
      'name': 'Adarsha (アダルサ)',
      'url': 'https://pnglike.com',
      'logo': 'https://pnglike.com/adarsha-log.webp',
      'address': {
        '@type': 'PostalAddress',
        'streetAddress': '佐谷田2081',
        'addressLocality': '熊谷市',
        'addressRegion': '埼玉県',
        'postalCode': '360-0023',
        'addressCountry': 'JP'
      }
    },
    'blogPost': posts.map(p => ({
      '@type': 'BlogPosting',
      'headline': p.title,
      'description': p.excerpt || p.title,
      'url': `https://pnglike.com/blog/${p.slug}`,
      'datePublished': p.publishedAt || p.createdAt,
      'image': p.coverImage || 'https://pnglike.com/bg-hero-img.webp',
      'author': {
        '@type': 'Person',
        'name': p.author || 'Adarsha シェフ'
      }
    }))
  };

  const breadcrumbJsonLd = {
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
        'name': 'ブログ・コラム',
        'item': 'https://pnglike.com/blog'
      }
    ]
  };

  return (
    <main style={{ backgroundColor: '#faf7f2', minHeight: '100vh', color: '#1f2937' }}>
      <title>ブログ・スパイスコラム | Adarsha (アダルサ) 熊谷の本格インド料理</title>
      <meta name="description" content="熊谷の本格インド料理店アダルサ（Adarsha）がお届けするブログ＆コラム。30種以上の直輸入スパイスの効能、備長炭タンドール窯焼きナン、ランチ情報、シェフ直伝のこだわりをお届けします。" />
      <meta name="keywords" content="熊谷 カレー ブログ, スパイス 効能, インド料理 コラム, チーズナン 熊谷, タンドール窯, アダルサ, Adarsha" />
      <link rel="canonical" href="https://pnglike.com/blog" />
      <meta property="og:title" content="ブログ・スパイスコラム | Adarsha (アダルサ) 熊谷" />
      <meta property="og:description" content="熊谷の本格インド料理店アダルサの公式ブログ。スパイスの秘密、備長炭窯焼きナン、ランチやイベント情報を発信中。" />
      <meta property="og:type" content="blog" />
      <meta property="og:url" content="https://pnglike.com/blog" />
      <meta property="og:image" content="https://pnglike.com/bg-hero-img.webp" />

      {/* Structured Data for Generative AI & Google Rich Snippets */}
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(blogJsonLd) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbJsonLd) }} />

      {/* Hero Header */}
      <section style={{
        background: 'linear-gradient(135deg, #1c1917 0%, #292524 50%, #442114 100%)',
        color: '#ffffff',
        padding: 'clamp(4rem, 8vw, 6rem) 20px 3.5rem',
        textAlign: 'center',
        position: 'relative',
        overflow: 'hidden'
      }}>
        {/* Subtle spice decorative background */}
        <div style={{
          position: 'absolute',
          inset: 0,
          backgroundImage: 'radial-gradient(circle at 20% 30%, rgba(199, 86, 38, 0.25) 0%, transparent 50%), radial-gradient(circle at 80% 70%, rgba(217, 119, 6, 0.2) 0%, transparent 50%)',
          pointerEvents: 'none'
        }} />

        <div style={{ maxWidth: '860px', margin: '0 auto', position: 'relative', zIndex: 1 }}>
          <div style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '8px',
            backgroundColor: 'rgba(199, 86, 38, 0.25)',
            border: '1px solid rgba(199, 86, 38, 0.4)',
            padding: '6px 16px',
            borderRadius: '9999px',
            fontSize: '0.85rem',
            color: '#fdba74',
            marginBottom: '1rem',
            fontWeight: 600,
            letterSpacing: '0.05em'
          }}>
            <Sparkles size={14} />
            <span>ADARSHA BLOG &amp; COLUMN</span>
          </div>

          <h1 style={{
            fontSize: 'clamp(2rem, 5vw, 3rem)',
            fontWeight: 800,
            margin: '0 0 1rem',
            fontFamily: 'var(--font-display, serif)',
            letterSpacing: '0.02em',
            lineHeight: 1.25
          }}>
            ブログ &amp; スパイスコラム
          </h1>

          <p style={{
            fontSize: 'clamp(0.95rem, 2vw, 1.15rem)',
            color: 'rgba(255, 255, 255, 0.82)',
            margin: '0 auto 2rem',
            lineHeight: 1.7,
            maxWidth: '680px'
          }}>
            インド各地から直輸入する30種以上のスパイスの知恵や効能、備長炭タンドール窯で焼き上げるナンとチキンのこだわり、熊谷店のお得な情報をお届けします。
          </p>

          {/* Search Bar */}
          <div style={{ maxWidth: '520px', margin: '0 auto', position: 'relative' }}>
            <Search size={18} style={{ position: 'absolute', left: '16px', top: '50%', transform: 'translateY(-50%)', color: '#9ca3af' }} />
            <input
              type="text"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              placeholder="スパイス、チーズナン、ランチで検索..."
              style={{
                width: '100%',
                padding: '14px 16px 14px 46px',
                borderRadius: '9999px',
                border: 'none',
                backgroundColor: 'rgba(255, 255, 255, 0.95)',
                color: '#111827',
                fontSize: '0.95rem',
                outline: 'none',
                boxShadow: '0 10px 25px rgba(0,0,0,0.2)',
                boxSizing: 'border-box'
              }}
            />
          </div>
        </div>
      </section>

      {/* Main Content Area */}
      <div style={{ maxWidth: '1200px', margin: '0 auto', padding: '2.5rem 20px 4rem' }}>
        
        {/* Category Filter Pills */}
        <div style={{
          display: 'flex',
          gap: '8px',
          overflowX: 'auto',
          paddingBottom: '12px',
          marginBottom: '2.5rem',
          scrollbarWidth: 'none',
        }}>
          <button
            type="button"
            onClick={() => handleSelectCategory('all')}
            style={{
              padding: '8px 20px',
              borderRadius: '9999px',
              fontSize: '0.88rem',
              fontWeight: 700,
              border: 'none',
              cursor: 'pointer',
              whiteSpace: 'nowrap',
              backgroundColor: currentCategory === 'all' ? '#c75626' : '#ffffff',
              color: currentCategory === 'all' ? '#ffffff' : '#4b5563',
              boxShadow: currentCategory === 'all' ? '0 4px 12px rgba(199, 86, 38, 0.3)' : '0 1px 3px rgba(0,0,0,0.06)',
              transition: 'all 0.2s',
            }}
          >
            すべて ({total})
          </button>

          {categories.map(cat => (
            <button
              key={cat}
              type="button"
              onClick={() => handleSelectCategory(cat)}
              style={{
                padding: '8px 18px',
                borderRadius: '9999px',
                fontSize: '0.88rem',
                fontWeight: 600,
                border: 'none',
                cursor: 'pointer',
                whiteSpace: 'nowrap',
                backgroundColor: currentCategory === cat ? '#c75626' : '#ffffff',
                color: currentCategory === cat ? '#ffffff' : '#4b5563',
                boxShadow: currentCategory === cat ? '0 4px 12px rgba(199, 86, 38, 0.3)' : '0 1px 3px rgba(0,0,0,0.06)',
                transition: 'all 0.2s',
              }}
            >
              {cat}
            </button>
          ))}
        </div>

        {/* Loading State */}
        {loading ? (
          <div style={{ padding: '4rem', textAlign: 'center', color: '#9ca3af' }}>
            記事を読み込み中…
          </div>
        ) : filteredPosts.length === 0 ? (
          <div style={{
            backgroundColor: '#ffffff',
            borderRadius: '16px',
            padding: '4rem 20px',
            textAlign: 'center',
            border: '1px dashed #d1d5db',
            maxWidth: '600px',
            margin: '0 auto'
          }}>
            <BookOpen size={48} style={{ color: '#d1d5db', margin: '0 auto 1rem' }} />
            <h2 style={{ fontSize: '1.25rem', color: '#374151', margin: '0 0 0.5rem' }}>該当する記事が見つかりませんでした</h2>
            <p style={{ color: '#6b7280', fontSize: '0.9rem', margin: '0 0 1.5rem' }}>
              検索条件を変更するか、カテゴリーフィルターを「すべて」に戻してお試しください。
            </p>
            <button
              type="button"
              onClick={() => { handleSelectCategory('all'); setSearchQuery(''); }}
              style={{
                padding: '10px 24px',
                borderRadius: '8px',
                border: 'none',
                backgroundColor: '#c75626',
                color: '#ffffff',
                fontWeight: 600,
                cursor: 'pointer'
              }}
            >
              すべての記事を表示
            </button>
          </div>
        ) : (
          <>
            {/* Featured Post (Hero Card) */}
            {featuredPost && (
              <article style={{
                backgroundColor: '#ffffff',
                borderRadius: '20px',
                overflow: 'hidden',
                boxShadow: '0 10px 30px rgba(0,0,0,0.06)',
                border: '1px solid #f1f5f9',
                marginBottom: '3rem',
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 420px), 1fr))',
              }}>
                <div style={{ height: '360px', overflow: 'hidden', position: 'relative' }}>
                  <img
                    src={assetUrl(featuredPost.coverImage) || '/bg-hero-img.webp'}
                    alt={featuredPost.title}
                    onError={(e) => {
                      const target = e.currentTarget;
                      if (!target.src.endsWith('/bg-hero-img.webp')) {
                        target.src = '/bg-hero-img.webp';
                      }
                    }}
                    style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                  />
                  <div style={{
                    position: 'absolute',
                    top: '16px',
                    left: '16px',
                    backgroundColor: '#c75626',
                    color: '#ffffff',
                    padding: '4px 12px',
                    borderRadius: '9999px',
                    fontSize: '0.78rem',
                    fontWeight: 700,
                    letterSpacing: '0.05em'
                  }}>
                    ★ 注目の最新記事
                  </div>
                </div>

                <div style={{ padding: 'clamp(1.5rem, 4vw, 2.5rem)', display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '12px', flexWrap: 'wrap' }}>
                    {featuredPost.category && (
                      <span style={{
                        backgroundColor: '#fef3c7',
                        color: '#92400e',
                        padding: '3px 10px',
                        borderRadius: '6px',
                        fontSize: '0.8rem',
                        fontWeight: 600
                      }}>
                        {featuredPost.category}
                      </span>
                    )}
                    <span style={{ fontSize: '0.82rem', color: '#6b7280', display: 'flex', alignItems: 'center', gap: '4px' }}>
                      <Clock size={13} /> 約{featuredPost.readTimeMinutes}分で読める
                    </span>
                    <span style={{ fontSize: '0.82rem', color: '#6b7280' }}>
                      {featuredPost.publishedAt ? new Date(featuredPost.publishedAt).toLocaleDateString('ja-JP', { year: 'numeric', month: 'long', day: 'numeric' }) : ''}
                    </span>
                  </div>

                  <h2 style={{
                    fontSize: 'clamp(1.25rem, 2.5vw, 1.65rem)',
                    fontWeight: 800,
                    margin: '0 0 1rem',
                    color: '#111827',
                    lineHeight: 1.4
                  }}>
                    <Link to={`/blog/${featuredPost.slug}`} style={{ color: 'inherit', textDecoration: 'none' }}>
                      {featuredPost.title}
                    </Link>
                  </h2>

                  <p style={{
                    fontSize: '0.95rem',
                    color: '#4b5563',
                    lineHeight: 1.7,
                    margin: '0 0 1.5rem',
                    display: '-webkit-box',
                    WebkitLineClamp: 3,
                    WebkitBoxOrient: 'vertical',
                    overflow: 'hidden'
                  }}>
                    {featuredPost.excerpt}
                  </p>

                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 'auto', paddingTop: '1rem', borderTop: '1px solid #f1f5f9' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <div style={{ width: '32px', height: '32px', borderRadius: '50%', backgroundColor: '#fef3c7', display: 'grid', placeItems: 'center' }}>
                        <ChefHat size={18} color="#b45309" />
                      </div>
                      <span style={{ fontSize: '0.85rem', fontWeight: 600, color: '#374151' }}>
                        {featuredPost.author || 'Adarsha シェフ'}
                      </span>
                    </div>

                    <Link
                      to={`/blog/${featuredPost.slug}`}
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '6px',
                        color: '#c75626',
                        fontWeight: 700,
                        fontSize: '0.9rem',
                        textDecoration: 'none'
                      }}
                    >
                      記事を読む <ArrowRight size={16} />
                    </Link>
                  </div>
                </div>
              </article>
            )}

            {/* Regular Posts Grid */}
            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(min(100%, 340px), 1fr))',
              gap: '2rem',
            }}>
              {regularPosts.map(post => (
                <article
                  key={post.id}
                  style={{
                    backgroundColor: '#ffffff',
                    borderRadius: '16px',
                    overflow: 'hidden',
                    border: '1px solid #f1f5f9',
                    boxShadow: '0 4px 20px rgba(0,0,0,0.04)',
                    display: 'flex',
                    flexDirection: 'column',
                    transition: 'transform 0.2s, box-shadow 0.2s',
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.transform = 'translateY(-4px)';
                    e.currentTarget.style.boxShadow = '0 12px 28px rgba(0,0,0,0.08)';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.transform = 'translateY(0)';
                    e.currentTarget.style.boxShadow = '0 4px 20px rgba(0,0,0,0.04)';
                  }}
                >
                  <Link to={`/blog/${post.slug}`} style={{ display: 'block', height: '200px', overflow: 'hidden', position: 'relative' }}>
                    <img
                      src={assetUrl(post.coverImage) || '/bg-hero-img.webp'}
                      alt={post.title}
                      loading="lazy"
                      onError={(e) => {
                        const target = e.currentTarget;
                        if (!target.src.endsWith('/bg-hero-img.webp')) {
                          target.src = '/bg-hero-img.webp';
                        }
                      }}
                      style={{ width: '100%', height: '100%', objectFit: 'cover', transition: 'transform 0.3s' }}
                    />
                    {post.category && (
                      <span style={{
                        position: 'absolute',
                        top: '12px',
                        left: '12px',
                        backgroundColor: 'rgba(255, 255, 255, 0.95)',
                        color: '#92400e',
                        padding: '4px 10px',
                        borderRadius: '6px',
                        fontSize: '0.75rem',
                        fontWeight: 700,
                        boxShadow: '0 2px 6px rgba(0,0,0,0.1)'
                      }}>
                        {post.category}
                      </span>
                    )}
                  </Link>

                  <div style={{ padding: '1.5rem', display: 'flex', flexDirection: 'column', flex: 1 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.78rem', color: '#9ca3af', marginBottom: '8px' }}>
                      <Clock size={12} />
                      <span>約{post.readTimeMinutes}分</span>
                      <span>•</span>
                      <span>
                        {post.publishedAt ? new Date(post.publishedAt).toLocaleDateString('ja-JP', { year: 'numeric', month: 'short', day: 'numeric' }) : ''}
                      </span>
                    </div>

                    <h3 style={{
                      fontSize: '1.15rem',
                      fontWeight: 700,
                      margin: '0 0 0.75rem',
                      color: '#111827',
                      lineHeight: 1.45,
                    }}>
                      <Link to={`/blog/${post.slug}`} style={{ color: 'inherit', textDecoration: 'none' }}>
                        {post.title}
                      </Link>
                    </h3>

                    <p style={{
                      fontSize: '0.88rem',
                      color: '#6b7280',
                      lineHeight: 1.6,
                      margin: '0 0 1.25rem',
                      display: '-webkit-box',
                      WebkitLineClamp: 3,
                      WebkitBoxOrient: 'vertical',
                      overflow: 'hidden'
                    }}>
                      {post.excerpt}
                    </p>

                    <div style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      marginTop: 'auto',
                      paddingTop: '0.75rem',
                      borderTop: '1px solid #f8fafc'
                    }}>
                      <span style={{ fontSize: '0.8rem', color: '#6b7280', fontWeight: 500 }}>
                        {post.author || 'Adarsha シェフ'}
                      </span>

                      <Link
                        to={`/blog/${post.slug}`}
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '4px',
                          color: '#c75626',
                          fontWeight: 700,
                          fontSize: '0.85rem',
                          textDecoration: 'none'
                        }}
                      >
                        続きを読む <ArrowRight size={14} />
                      </Link>
                    </div>
                  </div>
                </article>
              ))}
            </div>
          </>
        )}

        {/* Restaurant Experience CTA Banner */}
        <section style={{
          marginTop: '5rem',
          backgroundColor: '#ffffff',
          borderRadius: '20px',
          padding: 'clamp(2rem, 5vw, 3.5rem)',
          border: '1px solid #fed7aa',
          boxShadow: '0 10px 30px rgba(199, 86, 38, 0.08)',
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 320px), 1fr))',
          gap: '2rem',
          alignItems: 'center'
        }}>
          <div>
            <div style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', color: '#c75626', fontSize: '0.85rem', fontWeight: 700, marginBottom: '8px' }}>
              <MapPin size={16} />
              <span>埼玉県熊谷市佐谷田2081（国道17号沿い・駐車場12台完備）</span>
            </div>
            <h2 style={{ fontSize: '1.75rem', fontWeight: 800, color: '#1c1917', margin: '0 0 1rem' }}>
              本場直輸入スパイスと焼きたてナンを店舗で
            </h2>
            <p style={{ color: '#4b5563', lineHeight: 1.7, margin: 0 }}>
              Adarsha（アダルサ）では、記事でご紹介したスパイスカレーや備長炭タンドール料理をご提供しております。ランチのナン・ライスおかわり無料サービスや、WEB事前テイクアウト注文も大好評です。
            </p>
          </div>

          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '12px', justifyContent: 'flex-start' }}>
            <Link
              to="/menu/grand"
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '8px',
                backgroundColor: '#c75626',
                color: '#ffffff',
                padding: '12px 24px',
                borderRadius: '8px',
                fontWeight: 700,
                textDecoration: 'none',
                boxShadow: '0 4px 12px rgba(199, 86, 38, 0.3)'
              }}
            >
              グランドメニューを見る
            </Link>
            <Link
              to="/order"
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '8px',
                backgroundColor: '#1c1917',
                color: '#ffffff',
                padding: '12px 24px',
                borderRadius: '8px',
                fontWeight: 700,
                textDecoration: 'none',
              }}
            >
              テイクアウトを注文する
            </Link>
          </div>
        </section>

      </div>
    </main>
  );
}
