import { useEffect, useState, useMemo } from 'react';
import { useParams, Link } from 'react-router-dom';
import { 
  Clock, 
  ArrowLeft, 
  Calendar, 
  Share2, 
  Tag, 
  ChefHat, 
  Sparkles, 
  ChevronRight, 
  BookOpen,
  List
} from 'lucide-react';
import { toast } from 'react-hot-toast';
import { assetUrl, getPublic } from '../lib/api';

interface PostDetail {
  id: string;
  slug: string;
  title: string;
  content: string;
  excerpt?: string | null;
  coverImage?: string | null;
  category?: string | null;
  tags?: string[] | null;
  author?: string | null;
  readTimeMinutes: number;
  publishedAt?: string | null;
  metaTitle?: string | null;
  metaDescription?: string | null;
  createdAt: string;
  updatedAt: string;
}

interface RelatedPost {
  id: string;
  slug: string;
  title: string;
  excerpt?: string | null;
  coverImage?: string | null;
  category?: string | null;
  readTimeMinutes: number;
  publishedAt?: string | null;
}

export default function BlogPost() {
  const { slug } = useParams<{ slug: string }>();
  const [post, setPost] = useState<PostDetail | null>(null);
  const [relatedPosts, setRelatedPosts] = useState<RelatedPost[]>([]);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    if (!slug) return;
    setLoading(true);
    setNotFound(false);
    window.scrollTo({ top: 0, behavior: 'smooth' });

    getPublic<{ post: PostDetail; relatedPosts: RelatedPost[] }>(`/api/v1/blogs/${encodeURIComponent(slug)}`)
      .then(data => {
        if (!data || !data.post) {
          setNotFound(true);
        } else {
          setPost(data.post);
          setRelatedPosts(data.relatedPosts || []);
        }
      })
      .catch(err => {
        console.error('Error fetching blog post:', err);
        setNotFound(true);
      })
      .finally(() => setLoading(false));
  }, [slug]);

  // Extract H2 headings for Table of Contents (DEO / AI SEO Friendly)
  const headings = useMemo(() => {
    if (!post?.content) return [];
    const lines = post.content.split('\n');
    const items: { id: string; text: string; level: number }[] = [];
    lines.forEach((line, index) => {
      const trimmed = line.trim();
      if (trimmed.startsWith('## ')) {
        const text = trimmed.slice(3).trim();
        items.push({ id: `section-${index}`, text, level: 2 });
      } else if (trimmed.startsWith('### ')) {
        const text = trimmed.slice(4).trim();
        items.push({ id: `section-${index}`, text, level: 3 });
      }
    });
    return items;
  }, [post?.content]);

  // Key takeaways bullet points extracted from excerpt or intro
  const takeaways = useMemo(() => {
    if (!post?.excerpt) return [];
    return post.excerpt
      .split(/[。.]\s*/)
      .map(s => s.trim())
      .filter(s => s.length > 5);
  }, [post?.excerpt]);

  const handleShare = () => {
    if (navigator.share) {
      navigator.share({
        title: post?.title,
        text: post?.excerpt || post?.title,
        url: window.location.href,
      }).catch(() => {});
    } else {
      navigator.clipboard.writeText(window.location.href);
      toast.success('記事URLをクリップボードにコピーしました！');
    }
  };

  if (loading) {
    return (
      <main style={{ backgroundColor: '#faf7f2', minHeight: '80vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <p style={{ color: '#6b7280', fontSize: '1.1rem' }}>記事を読み込み中…</p>
      </main>
    );
  }

  if (notFound || !post) {
    return (
      <main style={{ backgroundColor: '#faf7f2', minHeight: '70vh', padding: '100px 20px', textAlign: 'center' }}>
        <title>記事が見つかりません | Adarsha (アダルサ)</title>
        <BookOpen size={48} style={{ color: '#9ca3af', margin: '0 auto 1rem' }} />
        <h1 style={{ fontSize: '1.75rem', color: '#1f2937', margin: '0 0 1rem' }}>お探しの記事が見つかりませんでした</h1>
        <p style={{ color: '#6b7280', margin: '0 0 2rem' }}>指定された記事は移動されたか、非公開に設定されている可能性があります。</p>
        <Link
          to="/blog"
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '8px',
            backgroundColor: '#c75626',
            color: '#fff',
            padding: '10px 24px',
            borderRadius: '8px',
            textDecoration: 'none',
            fontWeight: 700
          }}
        >
          <ArrowLeft size={16} /> ブログ一覧に戻る
        </Link>
      </main>
    );
  }

  const canonicalUrl = `https://pnglike.com/blog/${post.slug}`;
  const pageTitle = post.metaTitle?.trim() || `${post.title} | Adarsha (アダルサ) 熊谷`;
  const pageDescription = post.metaDescription?.trim() || post.excerpt || `${post.title} - 埼玉県熊谷市の本格インド料理店Adarsha（アダルサ）公式ブログ。`;
  const postImage = assetUrl(post.coverImage) || 'https://pnglike.com/bg-hero-img.webp';

  // AI SEO & DEO (Direct Engine Optimization) BlogPosting Schema
  const blogPostingJsonLd = {
    '@context': 'https://schema.org',
    '@type': 'BlogPosting',
    '@id': `${canonicalUrl}#article`,
    'mainEntityOfPage': {
      '@type': 'WebPage',
      '@id': canonicalUrl
    },
    'headline': post.title,
    'description': pageDescription,
    'image': [postImage],
    'datePublished': post.publishedAt || post.createdAt,
    'dateModified': post.updatedAt || post.createdAt,
    'author': {
      '@type': 'Person',
      'name': post.author || 'Adarsha シェフ',
      'jobTitle': 'インド料理スパイスシェフ',
      'worksFor': {
        '@type': 'Restaurant',
        'name': '本格インド料理 Adarsha (アダルサ)'
      }
    },
    'publisher': {
      '@type': 'Restaurant',
      'name': '本格インド料理 Adarsha (アダルサ)',
      'url': 'https://pnglike.com',
      'logo': {
        '@type': 'ImageObject',
        'url': 'https://pnglike.com/adarsha-log.webp'
      },
      'address': {
        '@type': 'PostalAddress',
        'streetAddress': '佐谷田2081',
        'addressLocality': '熊谷市',
        'addressRegion': '埼玉県',
        'postalCode': '360-0023',
        'addressCountry': 'JP'
      },
      'telephone': '048-514-8386'
    },
    'keywords': Array.isArray(post.tags) ? post.tags.join(', ') : 'インドカレー, スパイス, 熊谷',
    'articleSection': post.category || 'インド料理',
    'inLanguage': 'ja'
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
      },
      {
        '@type': 'ListItem',
        'position': 3,
        'name': post.title,
        'item': canonicalUrl
      }
    ]
  };

  return (
    <main style={{ backgroundColor: '#faf7f2', minHeight: '100vh', color: '#1f2937' }}>
      {/* Dynamic SEO & AI DEO Meta Tags */}
      <title>{pageTitle}</title>
      <meta name="description" content={pageDescription} />
      <link rel="canonical" href={canonicalUrl} />
      <meta property="og:title" content={post.title} />
      <meta property="og:description" content={pageDescription} />
      <meta property="og:type" content="article" />
      <meta property="og:url" content={canonicalUrl} />
      <meta property="og:image" content={postImage} />
      <meta property="article:published_time" content={post.publishedAt || post.createdAt} />
      <meta property="article:modified_time" content={post.updatedAt || post.createdAt} />
      <meta property="article:author" content={post.author || 'Adarsha シェフ'} />
      <meta property="article:section" content={post.category || 'インド料理'} />
      <meta name="twitter:card" content="summary_large_image" />
      <meta name="twitter:title" content={post.title} />
      <meta name="twitter:description" content={pageDescription} />
      <meta name="twitter:image" content={postImage} />

      {/* Local GEO Tags for Direct Engines */}
      <meta name="geo.region" content="JP-11" />
      <meta name="geo.placename" content="熊谷市" />
      <meta name="geo.position" content="36.1251;139.4188" />

      {/* Structured Data Scripts */}
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(blogPostingJsonLd) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbJsonLd) }} />

      {/* Breadcrumb Navigation Bar */}
      <div style={{ backgroundColor: '#ffffff', borderBottom: '1px solid #e5e7eb', padding: '12px 20px' }}>
        <div style={{ maxWidth: '860px', margin: '0 auto', display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.82rem', color: '#6b7280', flexWrap: 'wrap' }}>
          <Link to="/" style={{ color: 'inherit', textDecoration: 'none' }}>ホーム</Link>
          <ChevronRight size={13} />
          <Link to="/blog" style={{ color: 'inherit', textDecoration: 'none' }}>ブログ・コラム</Link>
          <ChevronRight size={13} />
          <span style={{ color: '#c75626', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '300px' }}>
            {post.title}
          </span>
        </div>
      </div>

      <article style={{ maxWidth: '860px', margin: '0 auto', padding: '2.5rem 20px 4rem' }}>
        
        {/* Article Header */}
        <header style={{ marginBottom: '2rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap', marginBottom: '1rem' }}>
            {post.category && (
              <Link
                to={`/blog?category=${encodeURIComponent(post.category)}`}
                style={{
                  backgroundColor: '#fef3c7',
                  color: '#92400e',
                  padding: '4px 12px',
                  borderRadius: '6px',
                  fontSize: '0.82rem',
                  fontWeight: 700,
                  textDecoration: 'none'
                }}
              >
                {post.category}
              </Link>
            )}

            <span style={{ fontSize: '0.82rem', color: '#6b7280', display: 'flex', alignItems: 'center', gap: '4px' }}>
              <Calendar size={14} />
              <time dateTime={post.publishedAt || post.createdAt}>
                {post.publishedAt ? new Date(post.publishedAt).toLocaleDateString('ja-JP', { year: 'numeric', month: 'long', day: 'numeric' }) : ''}
              </time>
            </span>

            <span style={{ fontSize: '0.82rem', color: '#6b7280', display: 'flex', alignItems: 'center', gap: '4px' }}>
              <Clock size={14} />
              読了目安: 約{post.readTimeMinutes}分
            </span>
          </div>

          <h1 style={{
            fontSize: 'clamp(1.75rem, 4.5vw, 2.5rem)',
            fontWeight: 800,
            lineHeight: 1.35,
            color: '#111827',
            margin: '0 0 1.5rem',
            fontFamily: 'var(--font-display, serif)',
            letterSpacing: '-0.01em'
          }}>
            {post.title}
          </h1>

          {/* Author and Share Bar */}
          <div style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            paddingTop: '1rem',
            paddingBottom: '1rem',
            borderTop: '1px solid #e5e7eb',
            borderBottom: '1px solid #e5e7eb',
            flexWrap: 'wrap',
            gap: '12px'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <div style={{
                width: '40px',
                height: '40px',
                borderRadius: '50%',
                backgroundColor: '#fed7aa',
                display: 'grid',
                placeItems: 'center',
                flexShrink: 0
              }}>
                <ChefHat size={22} color="#c75626" />
              </div>
              <div>
                <div style={{ fontSize: '0.9rem', fontWeight: 700, color: '#111827' }}>
                  {post.author || 'Adarsha シェフ'}
                </div>
                <div style={{ fontSize: '0.78rem', color: '#6b7280' }}>
                  本格インド料理 Adarsha 熊谷店
                </div>
              </div>
            </div>

            <button
              type="button"
              onClick={handleShare}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
                padding: '8px 16px',
                borderRadius: '8px',
                border: '1px solid #d1d5db',
                backgroundColor: '#ffffff',
                color: '#374151',
                fontSize: '0.85rem',
                fontWeight: 600,
                cursor: 'pointer',
                transition: 'background-color 0.15s'
              }}
            >
              <Share2 size={15} /> 記事をシェア
            </button>
          </div>
        </header>

        {/* Featured Cover Image */}
        {post.coverImage && (
          <div style={{
            borderRadius: '16px',
            overflow: 'hidden',
            marginBottom: '2.5rem',
            boxShadow: '0 10px 30px rgba(0,0,0,0.08)'
          }}>
            <img
              src={assetUrl(post.coverImage) || '/bg-hero-img.webp'}
              alt={post.title}
              onError={(e) => {
                const target = e.currentTarget;
                if (!target.src.endsWith('/bg-hero-img.webp')) {
                  target.src = '/bg-hero-img.webp';
                }
              }}
              style={{ width: '100%', maxHeight: '480px', objectFit: 'cover', display: 'block' }}
            />
          </div>
        )}

        {/* AI DEO / Generative Engine Highlight Box (Key Takeaways) */}
        {takeaways.length > 0 && (
          <div style={{
            backgroundColor: '#fff7ed',
            border: '1px solid #ffedd5',
            borderLeft: '5px solid #c75626',
            borderRadius: '12px',
            padding: '1.5rem',
            marginBottom: '2.5rem',
            boxShadow: '0 4px 15px rgba(199, 86, 38, 0.05)'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#9a3412', fontWeight: 800, fontSize: '1rem', marginBottom: '10px' }}>
              <Sparkles size={18} color="#c75626" />
              <span>この記事のポイント（要約 / Key Takeaways）</span>
            </div>
            <ul style={{ margin: 0, paddingLeft: '1.25rem', lineHeight: 1.8, fontSize: '0.95rem', color: '#431407' }}>
              {takeaways.map((point, i) => (
                <li key={i} style={{ marginBottom: '6px' }}>{point}</li>
              ))}
            </ul>
          </div>
        )}

        {/* Table of Contents (TOC) */}
        {headings.length >= 2 && (
          <nav aria-label="目次" style={{
            backgroundColor: '#ffffff',
            borderRadius: '12px',
            border: '1px solid #e5e7eb',
            padding: '1.25rem 1.5rem',
            marginBottom: '2.5rem'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.95rem', fontWeight: 700, color: '#111827', marginBottom: '12px' }}>
              <List size={18} color="#c75626" />
              <span>目次 (Table of Contents)</span>
            </div>
            <ol style={{ margin: 0, paddingLeft: '1.25rem', lineHeight: 1.9, fontSize: '0.9rem', color: '#4b5563' }}>
              {headings.map(h => (
                <li key={h.id} style={{ marginLeft: h.level === 3 ? '1.2rem' : 0 }}>
                  <a
                    href={`#${h.id}`}
                    style={{ color: '#c75626', textDecoration: 'none', fontWeight: h.level === 2 ? 600 : 400 }}
                  >
                    {h.text}
                  </a>
                </li>
              ))}
            </ol>
          </nav>
        )}

        {/* Article Body Renderer */}
        <div className="blog-prose" style={{
          backgroundColor: '#ffffff',
          borderRadius: '16px',
          padding: 'clamp(1.5rem, 4vw, 3rem)',
          border: '1px solid #f1f5f9',
          boxShadow: '0 4px 20px rgba(0,0,0,0.03)',
          lineHeight: 1.9,
          fontSize: '1.02rem',
          color: '#292524'
        }}>
          {post.content.split('\n\n').map((paragraph, index) => {
            const trimmed = paragraph.trim();

            // H2 Heading
            if (trimmed.startsWith('## ')) {
              return (
                <h2
                  key={index}
                  id={`section-${index}`}
                  style={{
                    fontSize: '1.5rem',
                    fontWeight: 800,
                    color: '#1c1917',
                    marginTop: index === 0 ? '0' : '2.5rem',
                    marginBottom: '1rem',
                    paddingBottom: '0.5rem',
                    borderBottom: '2px solid #fed7aa',
                    lineHeight: 1.4
                  }}
                >
                  {trimmed.slice(3)}
                </h2>
              );
            }

            // H3 Heading
            if (trimmed.startsWith('### ')) {
              return (
                <h3
                  key={index}
                  id={`section-${index}`}
                  style={{
                    fontSize: '1.25rem',
                    fontWeight: 700,
                    color: '#292524',
                    marginTop: '2rem',
                    marginBottom: '0.75rem',
                    lineHeight: 1.4
                  }}
                >
                  {trimmed.slice(4)}
                </h3>
              );
            }

            // Blockquote
            if (trimmed.startsWith('> ')) {
              return (
                <blockquote
                  key={index}
                  style={{
                    borderLeft: '4px solid #c75626',
                    backgroundColor: '#fffbeb',
                    padding: '1rem 1.25rem',
                    margin: '1.5rem 0',
                    borderRadius: '0 8px 8px 0',
                    color: '#78350f',
                    lineHeight: 1.7,
                    fontSize: '0.95rem'
                  }}
                >
                  {trimmed.slice(2)}
                </blockquote>
              );
            }

            // Bullet list
            if (trimmed.startsWith('- ') || trimmed.startsWith('* ')) {
              const items = trimmed.split('\n').filter(Boolean);
              return (
                <ul key={index} style={{ paddingLeft: '1.5rem', margin: '1rem 0' }}>
                  {items.map((item, i) => (
                    <li key={i} style={{ marginBottom: '6px' }}>
                      {item.replace(/^[-*]\s*/, '').replace(/\*\*(.*?)\*\*/g, '$1')}
                    </li>
                  ))}
                </ul>
              );
            }

            // Numbered list
            if (/^\d+\.\s/.test(trimmed)) {
              const items = trimmed.split('\n').filter(Boolean);
              return (
                <ol key={index} style={{ paddingLeft: '1.5rem', margin: '1rem 0' }}>
                  {items.map((item, i) => (
                    <li key={i} style={{ marginBottom: '8px' }}>
                      {item.replace(/^\d+\.\s*/, '').replace(/\*\*(.*?)\*\*/g, '$1')}
                    </li>
                  ))}
                </ol>
              );
            }

            // Standard Paragraph
            return (
              <p key={index} style={{ margin: '0 0 1.25rem' }}>
                {trimmed}
              </p>
            );
          })}
        </div>

        {/* Tags */}
        {Array.isArray(post.tags) && post.tags.length > 0 && (
          <div style={{ marginTop: '2rem', display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
            <Tag size={16} color="#9ca3af" />
            {post.tags.map(t => (
              <span
                key={t}
                style={{
                  backgroundColor: '#f3f4f6',
                  color: '#4b5563',
                  padding: '4px 12px',
                  borderRadius: '9999px',
                  fontSize: '0.8rem',
                  fontWeight: 500
                }}
              >
                #{t}
              </span>
            ))}
          </div>
        )}

        {/* Author Bio Box */}
        <div style={{
          marginTop: '3rem',
          backgroundColor: '#ffffff',
          borderRadius: '16px',
          padding: '1.75rem',
          border: '1px solid #e5e7eb',
          display: 'flex',
          gap: '1.25rem',
          alignItems: 'center',
          boxShadow: '0 4px 15px rgba(0,0,0,0.03)'
        }}>
          <div style={{
            width: '64px',
            height: '64px',
            borderRadius: '50%',
            backgroundColor: '#fed7aa',
            display: 'grid',
            placeItems: 'center',
            flexShrink: 0
          }}>
            <ChefHat size={32} color="#c75626" />
          </div>
          <div>
            <div style={{ fontSize: '1rem', fontWeight: 800, color: '#111827', marginBottom: '4px' }}>
              執筆・監修：{post.author || 'Adarsha シェフ'}
            </div>
            <p style={{ margin: 0, fontSize: '0.88rem', color: '#6b7280', lineHeight: 1.6 }}>
              インド本場のホテルや一流レストランで長年腕を磨いた熟練シェフ。日本の皆さまの味覚に寄り添いながら、30種類以上の直輸入スパイスと特注備長炭タンドールによる本物の味を追求しています。
            </p>
          </div>
        </div>

        {/* Restaurant Visit CTA Box */}
        <div style={{
          marginTop: '3rem',
          background: 'linear-gradient(135deg, #1c1917 0%, #292524 100%)',
          color: '#ffffff',
          borderRadius: '20px',
          padding: 'clamp(2rem, 5vw, 3rem)',
          textAlign: 'center',
          boxShadow: '0 15px 35px rgba(0,0,0,0.15)'
        }}>
          <h2 style={{ fontSize: '1.65rem', fontWeight: 800, margin: '0 0 1rem', color: '#fdba74' }}>
            熊谷で味わう本場スパイスカレー＆焼きたてナン
          </h2>
          <p style={{ color: 'rgba(255, 255, 255, 0.85)', lineHeight: 1.7, maxWidth: '620px', margin: '0 auto 1.75rem', fontSize: '0.95rem' }}>
            記事でご紹介した本格インド料理は、Adarsha（アダルサ）熊谷店にていつでもお楽しみいただけます。ランチのナン・ライスおかわり無料や、テイクアウトのWEB事前注文もご利用ください。
          </p>

          <div style={{ display: 'flex', justifyContent: 'center', gap: '1rem', flexWrap: 'wrap' }}>
            <Link
              to="/menu/grand"
              style={{
                backgroundColor: '#c75626',
                color: '#ffffff',
                padding: '12px 26px',
                borderRadius: '8px',
                fontWeight: 700,
                textDecoration: 'none',
                boxShadow: '0 4px 15px rgba(199, 86, 38, 0.4)'
              }}
            >
              メニューを見る
            </Link>
            <Link
              to="/order"
              style={{
                backgroundColor: 'rgba(255, 255, 255, 0.15)',
                color: '#ffffff',
                padding: '12px 26px',
                borderRadius: '8px',
                fontWeight: 700,
                textDecoration: 'none',
                border: '1px solid rgba(255, 255, 255, 0.3)'
              }}
            >
              テイクアウト注文
            </Link>
          </div>
        </div>

        {/* Related Posts Section (Internal Links for SEO) */}
        {relatedPosts.length > 0 && (
          <section style={{ marginTop: '4.5rem' }}>
            <h2 style={{ fontSize: '1.35rem', fontWeight: 800, color: '#111827', marginBottom: '1.5rem', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <BookOpen size={20} color="#c75626" />
              あわせて読みたいおすすめ記事
            </h2>

            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 250px), 1fr))',
              gap: '1.5rem'
            }}>
              {relatedPosts.map(rel => (
                <Link
                  key={rel.id}
                  to={`/blog/${rel.slug}`}
                  style={{
                    backgroundColor: '#ffffff',
                    borderRadius: '12px',
                    overflow: 'hidden',
                    border: '1px solid #f1f5f9',
                    boxShadow: '0 4px 15px rgba(0,0,0,0.03)',
                    textDecoration: 'none',
                    display: 'flex',
                    flexDirection: 'column',
                    transition: 'transform 0.2s',
                  }}
                  onMouseEnter={(e) => e.currentTarget.style.transform = 'translateY(-3px)'}
                  onMouseLeave={(e) => e.currentTarget.style.transform = 'translateY(0)'}
                >
                  <div style={{ height: '140px', overflow: 'hidden' }}>
                    <img
                      src={assetUrl(rel.coverImage) || '/bg-hero-img.webp'}
                      alt={rel.title}
                      loading="lazy"
                      onError={(e) => {
                        const target = e.currentTarget;
                        if (!target.src.endsWith('/bg-hero-img.webp')) {
                          target.src = '/bg-hero-img.webp';
                        }
                      }}
                      style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                    />
                  </div>
                  <div style={{ padding: '1rem', display: 'flex', flexDirection: 'column', flex: 1 }}>
                    <div style={{ fontSize: '0.75rem', color: '#9ca3af', marginBottom: '6px', display: 'flex', alignItems: 'center', gap: '4px' }}>
                      <Clock size={11} /> 約{rel.readTimeMinutes}分
                      {rel.category && <span>• {rel.category}</span>}
                    </div>
                    <h3 style={{
                      fontSize: '0.95rem',
                      fontWeight: 700,
                      color: '#111827',
                      margin: '0 0 0.5rem',
                      lineHeight: 1.45,
                      display: '-webkit-box',
                      WebkitLineClamp: 2,
                      WebkitBoxOrient: 'vertical',
                      overflow: 'hidden'
                    }}>
                      {rel.title}
                    </h3>
                    <span style={{ marginTop: 'auto', fontSize: '0.8rem', color: '#c75626', fontWeight: 600 }}>
                      記事を読む →
                    </span>
                  </div>
                </Link>
              ))}
            </div>
          </section>
        )}

        {/* Back Link */}
        <div style={{ marginTop: '3.5rem', textAlign: 'center' }}>
          <Link
            to="/blog"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
              color: '#4b5563',
              fontSize: '0.9rem',
              fontWeight: 600,
              textDecoration: 'none',
              padding: '8px 20px',
              borderRadius: '8px',
              backgroundColor: '#ffffff',
              border: '1px solid #d1d5db'
            }}
          >
            <ArrowLeft size={16} /> ブログ記事一覧に戻る
          </Link>
        </div>

      </article>
    </main>
  );
}
