import { useEffect, useState, useMemo, type CSSProperties, type FormEvent } from 'react';
import { toast } from 'react-hot-toast';
import { 
  BookOpen, 
  Plus, 
  Trash2, 
  Edit3, 
  RefreshCw, 
  ExternalLink, 
  Search, 
  Eye, 
  Clock, 
  Upload, 
  X, 
  Sparkles,
  FileText
} from 'lucide-react';
import { apiFetch, assetUrl, errorMessage } from '../../lib/api';

export interface BlogPostItem {
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
  isPublished: boolean;
  publishedAt?: string | null;
  metaTitle?: string | null;
  metaDescription?: string | null;
  createdAt: string;
  updatedAt: string;
}

const CATEGORY_PRESETS = [
  'スパイスのこだわり',
  'シェフのこだわり',
  'お知らせ・ランチ',
  '熊谷グルメ・観光',
  'インド食文化・豆知識',
  'その他',
];

const EMPTY_POST: Omit<BlogPostItem, 'id' | 'createdAt' | 'updatedAt'> = {
  title: '',
  slug: '',
  content: '',
  excerpt: '',
  coverImage: '',
  category: 'スパイスのこだわり',
  tags: ['スパイス', 'インドカレー', '熊谷'],
  author: 'Adarsha シェフ',
  readTimeMinutes: 3,
  isPublished: true,
  publishedAt: new Date().toISOString().slice(0, 16),
  metaTitle: '',
  metaDescription: '',
};

export default function BlogPostsTab() {
  const [posts, setPosts] = useState<BlogPostItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'PUBLISHED' | 'DRAFT'>('ALL');
  const [categoryFilter, setCategoryFilter] = useState('ALL');

  // Modal State
  const [editingPost, setEditingPost] = useState<(Partial<BlogPostItem> & { rawTags?: string }) | null>(null);
  const [isNew, setIsNew] = useState(false);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [previewTab, setPreviewTab] = useState<'edit' | 'preview'>('edit');

  const loadPosts = async () => {
    setLoading(true);
    try {
      const res = await apiFetch('/api/v1/blogs/admin/all');
      if (!res.ok) throw new Error(await errorMessage(res, '記事の取得に失敗しました'));
      const data = await res.json();
      setPosts(data.posts || []);
    } catch (err: any) {
      toast.error(err.message || 'ブログ記事の読み込みに失敗しました');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadPosts();
  }, []);

  const categories = useMemo(() => {
    const set = new Set<string>();
    posts.forEach(p => {
      if (p.category) set.add(p.category);
    });
    return Array.from(set);
  }, [posts]);

  const filteredPosts = useMemo(() => {
    return posts.filter(post => {
      if (statusFilter === 'PUBLISHED' && !post.isPublished) return false;
      if (statusFilter === 'DRAFT' && post.isPublished) return false;
      if (categoryFilter !== 'ALL' && post.category !== categoryFilter) return false;
      if (search.trim()) {
        const q = search.toLowerCase();
        const inTitle = post.title.toLowerCase().includes(q);
        const inSlug = post.slug.toLowerCase().includes(q);
        const inCategory = (post.category || '').toLowerCase().includes(q);
        const inExcerpt = (post.excerpt || '').toLowerCase().includes(q);
        if (!inTitle && !inSlug && !inCategory && !inExcerpt) return false;
      }
      return true;
    });
  }, [posts, statusFilter, categoryFilter, search]);

  const handleOpenCreate = () => {
    setIsNew(true);
    setEditingPost({
      ...EMPTY_POST,
      slug: `post-${Date.now().toString(36)}`,
      rawTags: 'スパイス, インドカレー, 熊谷',
    });
    setPreviewTab('edit');
  };

  const handleOpenEdit = (post: BlogPostItem) => {
    setIsNew(false);
    setEditingPost({
      ...post,
      rawTags: Array.isArray(post.tags) ? post.tags.join(', ') : '',
      publishedAt: post.publishedAt ? post.publishedAt.slice(0, 16) : new Date().toISOString().slice(0, 16),
    });
    setPreviewTab('edit');
  };

  const handleCloseModal = () => {
    setEditingPost(null);
  };

  const handleImageUpload = async (file: File) => {
    if (!file) return;
    setUploading(true);
    const fd = new FormData();
    fd.append('file', file);
    try {
      const res = await apiFetch('/api/v1/upload', {
        method: 'POST',
        body: fd,
      });
      if (!res.ok) throw new Error(await errorMessage(res, '画像のアップロードに失敗しました'));
      const data = await res.json();
      if (data.url) {
        setEditingPost(prev => prev ? { ...prev, coverImage: data.url } : null);
        toast.success('画像をアップロードしました');
      }
    } catch (err: any) {
      toast.error(err.message || '画像アップロードエラー');
    } finally {
      setUploading(false);
    }
  };

  const handleTogglePublish = async (post: BlogPostItem) => {
    const nextStatus = !post.isPublished;
    try {
      const res = await apiFetch(`/api/v1/blogs/admin/${post.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isPublished: nextStatus }),
      });
      if (!res.ok) throw new Error(await errorMessage(res, 'ステータス更新に失敗しました'));
      setPosts(prev => prev.map(p => p.id === post.id ? { ...p, isPublished: nextStatus } : p));
      toast.success(nextStatus ? '記事を公開しました' : '記事を下書きに設定しました');
    } catch (err: any) {
      toast.error(err.message);
    }
  };

  const handleDelete = async (post: BlogPostItem) => {
    if (!window.confirm(`「${post.title}」を削除してもよろしいですか？この操作は取り消せません。`)) {
      return;
    }
    try {
      const res = await apiFetch(`/api/v1/blogs/admin/${post.id}`, {
        method: 'DELETE',
      });
      if (!res.ok) throw new Error(await errorMessage(res, '削除に失敗しました'));
      setPosts(prev => prev.filter(p => p.id !== post.id));
      toast.success('記事を削除しました');
    } catch (err: any) {
      toast.error(err.message);
    }
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!editingPost) return;

    if (!editingPost.title?.trim()) {
      toast.error('タイトルを入力してください');
      return;
    }

    setSaving(true);
    const parsedTags = editingPost.rawTags
      ? editingPost.rawTags.split(',').map(s => s.trim()).filter(Boolean)
      : [];

    const payload = {
      title: editingPost.title.trim(),
      slug: (editingPost.slug || '').trim() || undefined,
      content: editingPost.content || '',
      excerpt: editingPost.excerpt?.trim() || undefined,
      coverImage: editingPost.coverImage?.trim() || undefined,
      category: editingPost.category?.trim() || 'スパイスのこだわり',
      tags: parsedTags,
      author: editingPost.author?.trim() || 'Adarsha シェフ',
      readTimeMinutes: Number(editingPost.readTimeMinutes) || 3,
      isPublished: Boolean(editingPost.isPublished),
      publishedAt: editingPost.publishedAt ? new Date(editingPost.publishedAt).toISOString() : new Date().toISOString(),
      metaTitle: editingPost.metaTitle?.trim() || undefined,
      metaDescription: editingPost.metaDescription?.trim() || undefined,
    };

    try {
      const url = isNew ? '/api/v1/blogs/admin' : `/api/v1/blogs/admin/${editingPost.id}`;
      const method = isNew ? 'POST' : 'PUT';
      const res = await apiFetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (!res.ok) throw new Error(await errorMessage(res, '保存に失敗しました'));
      const data = await res.json();
      const saved = data.post;

      if (isNew) {
        setPosts(prev => [saved, ...prev]);
        toast.success('新しいブログ記事を作成しました');
      } else {
        setPosts(prev => prev.map(p => p.id === saved.id ? saved : p));
        toast.success('記事を更新しました');
      }
      handleCloseModal();
    } catch (err: any) {
      toast.error(err.message || 'エラーが発生しました');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
      
      {/* Top Banner & Quick Actions */}
      <div style={{ 
        backgroundColor: '#ffffff', 
        borderRadius: '12px', 
        padding: '1.5rem', 
        border: '1px solid #e5e7eb',
        display: 'flex',
        flexWrap: 'wrap',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: '1rem',
        boxShadow: '0 1px 3px rgba(0,0,0,0.05)'
      }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
            <BookOpen size={22} color="#c75626" />
            <h2 style={{ margin: 0, fontSize: '1.25rem', fontWeight: 700, color: '#111827' }}>ブログ・コラム管理 (AI SEO & DEO対応)</h2>
          </div>
          <p style={{ margin: 0, fontSize: '0.875rem', color: '#6b7280' }}>
            本場インドスパイスの効能やこだわり、熊谷のお得なランチ情報を発信し、AI検索（Perplexity/Gemini/Google AI Overviews）からの流入を最大化します。
          </p>
        </div>

        <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
          <button
            type="button"
            onClick={loadPosts}
            style={{ ...btnBase, backgroundColor: '#f3f4f6', color: '#374151' }}
            title="再読み込み"
          >
            <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
            更新
          </button>
          <a
            href="/blog"
            target="_blank"
            rel="noopener noreferrer"
            style={{ ...btnBase, backgroundColor: '#f8fafc', color: '#0284c7', border: '1px solid #bae6fd' }}
          >
            <Eye size={16} />
            公開ブログを見る
          </a>
          <button
            type="button"
            onClick={handleOpenCreate}
            style={{ ...btnBase, backgroundColor: '#c75626', color: '#ffffff', fontWeight: 600 }}
          >
            <Plus size={18} />
            新規記事を書く
          </button>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div style={{ 
        backgroundColor: '#ffffff', 
        borderRadius: '12px', 
        padding: '1rem 1.5rem', 
        border: '1px solid #e5e7eb',
        display: 'flex',
        flexWrap: 'wrap',
        gap: '1rem',
        alignItems: 'center',
        justifyContent: 'space-between'
      }}>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.75rem', alignItems: 'center', flex: 1, minWidth: '280px' }}>
          <div style={{ position: 'relative', width: '280px' }}>
            <Search size={16} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: '#9ca3af' }} />
            <input
              type="text"
              placeholder="タイトル・キーワード検索..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              style={{ ...inpBase, paddingLeft: '36px', height: '38px', fontSize: '0.875rem' }}
            />
          </div>

          <div style={{ display: 'flex', gap: '4px', backgroundColor: '#f3f4f6', padding: '3px', borderRadius: '8px' }}>
            {(['ALL', 'PUBLISHED', 'DRAFT'] as const).map(st => (
              <button
                key={st}
                type="button"
                onClick={() => setStatusFilter(st)}
                style={{
                  padding: '6px 12px',
                  borderRadius: '6px',
                  border: 'none',
                  fontSize: '0.8rem',
                  fontWeight: 600,
                  cursor: 'pointer',
                  backgroundColor: statusFilter === st ? '#ffffff' : 'transparent',
                  color: statusFilter === st ? '#111827' : '#6b7280',
                  boxShadow: statusFilter === st ? '0 1px 2px rgba(0,0,0,0.06)' : 'none',
                  transition: 'all 0.15s',
                }}
              >
                {st === 'ALL' ? 'すべて' : st === 'PUBLISHED' ? '公開中' : '下書き'}
              </button>
            ))}
          </div>

          {categories.length > 0 && (
            <select
              value={categoryFilter}
              onChange={e => setCategoryFilter(e.target.value)}
              style={{ ...inpBase, height: '38px', width: 'auto', fontSize: '0.85rem' }}
            >
              <option value="ALL">全カテゴリー ({posts.length})</option>
              {categories.map(c => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
          )}
        </div>

        <div style={{ fontSize: '0.85rem', color: '#6b7280' }}>
          {filteredPosts.length} 件の記事
        </div>
      </div>

      {/* Posts List Table / Cards */}
      {loading ? (
        <div style={{ padding: '3rem', textAlign: 'center', backgroundColor: '#ffffff', borderRadius: '12px', color: '#9ca3af' }}>
          読み込み中…
        </div>
      ) : filteredPosts.length === 0 ? (
        <div style={{ 
          padding: '3.5rem 1.5rem', 
          textAlign: 'center', 
          backgroundColor: '#ffffff', 
          borderRadius: '12px', 
          border: '1px dashed #d1d5db' 
        }}>
          <FileText size={44} style={{ color: '#d1d5db', margin: '0 auto 1rem' }} />
          <h3 style={{ fontSize: '1.1rem', fontWeight: 600, color: '#374151', margin: '0 0 0.5rem' }}>記事が見つかりません</h3>
          <p style={{ fontSize: '0.875rem', color: '#6b7280', margin: '0 0 1.5rem' }}>
            {search || statusFilter !== 'ALL' || categoryFilter !== 'ALL'
              ? '検索条件に一致する記事がありません。フィルターをリセットしてください。'
              : 'まだ記事が登録されていません。最初のブログ記事を作成してみましょう！'}
          </p>
          <button
            type="button"
            onClick={handleOpenCreate}
            style={{ ...btnBase, backgroundColor: '#c75626', color: '#ffffff', margin: '0 auto' }}
          >
            <Plus size={16} /> 最初の記事を書く
          </button>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          {filteredPosts.map(post => (
            <div
              key={post.id}
              style={{
                backgroundColor: '#ffffff',
                borderRadius: '12px',
                border: '1px solid #e5e7eb',
                padding: '1.25rem',
                display: 'flex',
                gap: '1.25rem',
                alignItems: 'center',
                boxShadow: '0 1px 2px rgba(0,0,0,0.03)',
                transition: 'box-shadow 0.2s',
              }}
            >
              {/* Thumbnail */}
              <div style={{
                width: '120px',
                height: '84px',
                borderRadius: '8px',
                backgroundColor: '#f3f4f6',
                overflow: 'hidden',
                flexShrink: 0,
                display: 'grid',
                placeItems: 'center',
                border: '1px solid #f1f5f9'
              }}>
                {post.coverImage ? (
                  <img
                    src={assetUrl(post.coverImage) || '/bg-hero-img.webp'}
                    alt={post.title}
                    onError={(e) => {
                      const target = e.currentTarget;
                      if (!target.src.endsWith('/bg-hero-img.webp')) {
                        target.src = '/bg-hero-img.webp';
                      }
                    }}
                    style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                  />
                ) : (
                  <BookOpen size={28} color="#cbd5e1" />
                )}
              </div>

              {/* Main Content Info */}
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px', flexWrap: 'wrap' }}>
                  <span style={{
                    padding: '2px 8px',
                    borderRadius: '9999px',
                    fontSize: '0.72rem',
                    fontWeight: 700,
                    backgroundColor: post.isPublished ? '#dcfce7' : '#f3f4f6',
                    color: post.isPublished ? '#15803d' : '#6b7280',
                  }}>
                    {post.isPublished ? '● 公開中' : '○ 下書き'}
                  </span>

                  {post.category && (
                    <span style={{
                      padding: '2px 8px',
                      borderRadius: '6px',
                      fontSize: '0.72rem',
                      fontWeight: 600,
                      backgroundColor: '#fef3c7',
                      color: '#92400e',
                    }}>
                      {post.category}
                    </span>
                  )}

                  <span style={{ fontSize: '0.75rem', color: '#9ca3af', display: 'flex', alignItems: 'center', gap: '4px' }}>
                    <Clock size={12} /> 約{post.readTimeMinutes}分で読める
                  </span>

                  <span style={{ fontSize: '0.75rem', color: '#9ca3af' }}>
                    {post.publishedAt ? new Date(post.publishedAt).toLocaleDateString('ja-JP', { year: 'numeric', month: 'short', day: 'numeric' }) : '未設定'}
                  </span>
                </div>

                <h3 style={{ 
                  margin: '0 0 6px 0', 
                  fontSize: '1.05rem', 
                  fontWeight: 700, 
                  color: '#111827',
                  whiteSpace: 'nowrap',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis'
                }}>
                  {post.title}
                </h3>

                <p style={{ 
                  margin: 0, 
                  fontSize: '0.85rem', 
                  color: '#6b7280', 
                  lineHeight: 1.45,
                  display: '-webkit-box',
                  WebkitLineClamp: 2,
                  WebkitBoxOrient: 'vertical',
                  overflow: 'hidden'
                }}>
                  {post.excerpt || post.content.slice(0, 120)}
                </p>

                <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginTop: '6px', fontSize: '0.75rem', color: '#9ca3af' }}>
                  <span>URL: <code style={{ backgroundColor: '#f1f5f9', padding: '1px 5px', borderRadius: '4px' }}>/blog/{post.slug}</code></span>
                  {post.author && <span>著者: {post.author}</span>}
                </div>
              </div>

              {/* Actions */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexShrink: 0 }}>
                {post.isPublished && (
                  <a
                    href={`/blog/${post.slug}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{ ...actionBtn, color: '#0284c7', backgroundColor: '#f0f9ff' }}
                    title="記事ページを開く"
                  >
                    <ExternalLink size={16} />
                  </a>
                )}

                <button
                  type="button"
                  onClick={() => handleTogglePublish(post)}
                  style={{
                    ...actionBtn,
                    color: post.isPublished ? '#d97706' : '#16a34a',
                    backgroundColor: post.isPublished ? '#fffbeb' : '#f0fdf4',
                  }}
                  title={post.isPublished ? '下書きに戻す' : '公開する'}
                >
                  {post.isPublished ? '下書きへ' : '公開へ'}
                </button>

                <button
                  type="button"
                  onClick={() => handleOpenEdit(post)}
                  style={{ ...actionBtn, color: '#374151', backgroundColor: '#f3f4f6' }}
                  title="編集"
                >
                  <Edit3 size={16} />
                </button>

                <button
                  type="button"
                  onClick={() => handleDelete(post)}
                  style={{ ...actionBtn, color: '#dc2626', backgroundColor: '#fef2f2' }}
                  title="削除"
                >
                  <Trash2 size={16} />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Create / Edit Modal */}
      {editingPost && (
        <div style={{
          position: 'fixed',
          inset: 0,
          backgroundColor: 'rgba(0, 0, 0, 0.65)',
          zIndex: 9999,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '20px',
        }}>
          <div style={{
            backgroundColor: '#ffffff',
            borderRadius: '16px',
            width: '100%',
            maxWidth: '900px',
            maxHeight: '90vh',
            display: 'flex',
            flexDirection: 'column',
            boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)',
            overflow: 'hidden'
          }}>
            {/* Modal Header */}
            <div style={{
              padding: '1.25rem 1.5rem',
              borderBottom: '1px solid #e5e7eb',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              backgroundColor: '#fafaf9'
            }}>
              <div>
                <h3 style={{ margin: 0, fontSize: '1.25rem', fontWeight: 700, color: '#111827' }}>
                  {isNew ? '新しいブログ記事を作成' : '記事の編集'}
                </h3>
                <span style={{ fontSize: '0.8rem', color: '#78716c' }}>
                  AI SEO &amp; DEO最適化された記事を公開します
                </span>
              </div>
              <button
                type="button"
                onClick={handleCloseModal}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#9ca3af', padding: '4px' }}
              >
                <X size={20} />
              </button>
            </div>

            {/* Modal Form Body */}
            <form onSubmit={handleSubmit} style={{ overflowY: 'auto', padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
              
              {/* Title & Slug */}
              <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '1rem' }}>
                <div>
                  <label style={labelStyle}>
                    記事タイトル <span style={{ color: '#dc2626' }}>*</span>
                  </label>
                  <input
                    type="text"
                    required
                    value={editingPost.title || ''}
                    onChange={e => setEditingPost({ ...editingPost, title: e.target.value })}
                    placeholder="例: 本場インドのスパイス30種が織りなす極上カレー"
                    style={{ ...inpBase, fontWeight: 600, fontSize: '1rem' }}
                  />
                </div>

                <div>
                  <label style={labelStyle}>
                    URLスラッグ (URL Slug)
                  </label>
                  <input
                    type="text"
                    value={editingPost.slug || ''}
                    onChange={e => setEditingPost({ ...editingPost, slug: e.target.value })}
                    placeholder="例: indian-curry-spices"
                    style={inpBase}
                  />
                  <span style={{ fontSize: '0.72rem', color: '#9ca3af' }}>半角英数字とハイフン推奨</span>
                </div>
              </div>

              {/* Category, Tags, Author, Read Time */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '1rem' }}>
                <div>
                  <label style={labelStyle}>カテゴリー</label>
                  <input
                    list="category-suggestions"
                    type="text"
                    value={editingPost.category || ''}
                    onChange={e => setEditingPost({ ...editingPost, category: e.target.value })}
                    placeholder="カテゴリー名を入力または選択"
                    style={inpBase}
                  />
                  <datalist id="category-suggestions">
                    {CATEGORY_PRESETS.map(c => <option key={c} value={c} />)}
                  </datalist>
                </div>

                <div>
                  <label style={labelStyle}>タグ (カンマ区切り)</label>
                  <input
                    type="text"
                    value={editingPost.rawTags || ''}
                    onChange={e => setEditingPost({ ...editingPost, rawTags: e.target.value })}
                    placeholder="スパイス, 熊谷ランチ, チーズナン"
                    style={inpBase}
                  />
                </div>

                <div>
                  <label style={labelStyle}>著者 (Author)</label>
                  <input
                    type="text"
                    value={editingPost.author || ''}
                    onChange={e => setEditingPost({ ...editingPost, author: e.target.value })}
                    placeholder="Adarsha シェフ"
                    style={inpBase}
                  />
                </div>

                <div>
                  <label style={labelStyle}>読了目安時間 (分)</label>
                  <input
                    type="number"
                    min={1}
                    max={60}
                    value={editingPost.readTimeMinutes || 3}
                    onChange={e => setEditingPost({ ...editingPost, readTimeMinutes: Number(e.target.value) })}
                    style={inpBase}
                  />
                </div>
              </div>

              {/* Cover Image */}
              <div>
                <label style={labelStyle}>アイキャッチ画像 (Cover Image)</label>
                <div style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
                  <input
                    type="text"
                    value={editingPost.coverImage || ''}
                    onChange={e => setEditingPost({ ...editingPost, coverImage: e.target.value })}
                    placeholder="https://... または画像をアップロード"
                    style={{ ...inpBase, flex: 1 }}
                  />
                  <label style={{ ...btnBase, backgroundColor: '#f3f4f6', color: '#374151', cursor: uploading ? 'wait' : 'pointer' }}>
                    <Upload size={16} />
                    {uploading ? 'アップロード中…' : '画像をアップロード'}
                    <input
                      type="file"
                      accept="image/*"
                      hidden
                      disabled={uploading}
                      onChange={e => e.target.files?.[0] && handleImageUpload(e.target.files[0])}
                    />
                  </label>
                </div>
                {editingPost.coverImage && (
                  <div style={{ marginTop: '8px', height: '100px', width: '180px', borderRadius: '8px', overflow: 'hidden', border: '1px solid #e5e7eb' }}>
                    <img
                      src={assetUrl(editingPost.coverImage) || '/bg-hero-img.webp'}
                      alt="プレビュー"
                      onError={(e) => {
                        const target = e.currentTarget;
                        if (!target.src.endsWith('/bg-hero-img.webp')) {
                          target.src = '/bg-hero-img.webp';
                        }
                      }}
                      style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                    />
                  </div>
                )}
              </div>

              {/* Excerpt / AI DEO Takeaways */}
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
                  <label style={labelStyle}>
                    要約・抜粋 (AI SEO / DEO スニペット要約)
                  </label>
                  <span style={{ fontSize: '0.72rem', color: '#c75626', fontWeight: 600 }}>
                    💡 AI検索やGoogle検索結果に引用される重要テキストです
                  </span>
                </div>
                <textarea
                  rows={2}
                  value={editingPost.excerpt || ''}
                  onChange={e => setEditingPost({ ...editingPost, excerpt: e.target.value })}
                  placeholder="記事の核心となる要約文（100〜160文字程度）。AI検索エンジン（Perplexity、ChatGPT等）が回答を生成する際の要約元として重宝されます。"
                  style={{ ...inpBase, height: 'auto', resize: 'vertical' }}
                />
              </div>

              {/* Content Editor */}
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                  <label style={labelStyle}>
                    本文 (Markdown記法 / HTML対応) <span style={{ color: '#dc2626' }}>*</span>
                  </label>
                  <div style={{ display: 'flex', gap: '4px', backgroundColor: '#f3f4f6', padding: '2px', borderRadius: '6px' }}>
                    <button
                      type="button"
                      onClick={() => setPreviewTab('edit')}
                      style={{
                        padding: '4px 10px',
                        borderRadius: '4px',
                        border: 'none',
                        fontSize: '0.75rem',
                        fontWeight: 600,
                        cursor: 'pointer',
                        backgroundColor: previewTab === 'edit' ? '#ffffff' : 'transparent',
                        color: previewTab === 'edit' ? '#111827' : '#6b7280',
                      }}
                    >
                      編集
                    </button>
                    <button
                      type="button"
                      onClick={() => setPreviewTab('preview')}
                      style={{
                        padding: '4px 10px',
                        borderRadius: '4px',
                        border: 'none',
                        fontSize: '0.75rem',
                        fontWeight: 600,
                        cursor: 'pointer',
                        backgroundColor: previewTab === 'preview' ? '#ffffff' : 'transparent',
                        color: previewTab === 'preview' ? '#111827' : '#6b7280',
                      }}
                    >
                      プレビュー
                    </button>
                  </div>
                </div>

                {previewTab === 'edit' ? (
                  <div>
                    <textarea
                      rows={12}
                      required
                      value={editingPost.content || ''}
                      onChange={e => setEditingPost({ ...editingPost, content: e.target.value })}
                      placeholder={"## 見出し2\n\nここに段落テキストを書きます。\n\n### 見出し3\n\n- リスト項目1\n- リスト項目2\n\n> 引用や補足情報"}
                      style={{ ...inpBase, fontFamily: 'monospace', fontSize: '0.9rem', lineHeight: 1.6, height: 'auto', resize: 'vertical' }}
                    />
                    <div style={{ fontSize: '0.75rem', color: '#9ca3af', marginTop: '4px', display: 'flex', gap: '12px' }}>
                      <span>文字数: {(editingPost.content || '').length}</span>
                      <span>見出し: ## (H2), ### (H3)</span>
                      <span>強調: **太字**</span>
                      <span>リスト: - 項目</span>
                    </div>
                  </div>
                ) : (
                  <div style={{
                    minHeight: '260px',
                    padding: '1.25rem',
                    backgroundColor: '#fafaf9',
                    borderRadius: '8px',
                    border: '1px solid #e7e5e4',
                    lineHeight: 1.8,
                    fontSize: '0.92rem',
                    color: '#292524',
                    overflowY: 'auto',
                    maxHeight: '380px'
                  }}>
                    {editingPost.content ? (
                      editingPost.content.split('\n\n').map((paragraph, idx) => {
                        const trimmed = paragraph.trim();
                        if (trimmed.startsWith('## ')) {
                          return <h2 key={idx} style={{ fontSize: '1.3rem', fontWeight: 700, margin: '1.2rem 0 0.6rem', color: '#1c1917' }}>{trimmed.slice(3)}</h2>;
                        }
                        if (trimmed.startsWith('### ')) {
                          return <h3 key={idx} style={{ fontSize: '1.1rem', fontWeight: 600, margin: '1rem 0 0.5rem', color: '#292524' }}>{trimmed.slice(4)}</h3>;
                        }
                        if (trimmed.startsWith('> ')) {
                          return <blockquote key={idx} style={{ borderLeft: '3px solid #c75626', paddingLeft: '1rem', color: '#78716c', margin: '0.8rem 0', fontStyle: 'italic' }}>{trimmed.slice(2)}</blockquote>;
                        }
                        return <p key={idx} style={{ margin: '0 0 0.8rem' }}>{paragraph}</p>;
                      })
                    ) : (
                      <span style={{ color: '#a8a29e' }}>本文を入力するとプレビューが表示されます</span>
                    )}
                  </div>
                )}
              </div>

              {/* SEO & DEO Meta Settings (Accordion) */}
              <details style={{
                backgroundColor: '#f8fafc',
                border: '1px solid #e2e8f0',
                borderRadius: '8px',
                padding: '0.75rem 1rem'
              }}>
                <summary style={{ cursor: 'pointer', fontWeight: 600, fontSize: '0.9rem', color: '#334155', display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <Sparkles size={16} color="#0284c7" />
                  SEO &amp; AI検索エンジン（DEO）詳細設定（任意）
                </summary>

                <div style={{ marginTop: '1rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                  <div>
                    <label style={labelStyle}>カスタムSEOタイトル (&lt;title&gt;)</label>
                    <input
                      type="text"
                      value={editingPost.metaTitle || ''}
                      onChange={e => setEditingPost({ ...editingPost, metaTitle: e.target.value })}
                      placeholder={editingPost.title ? `${editingPost.title} | Adarsha (アダルサ) 熊谷` : '未入力の場合は記事タイトルが使用されます'}
                      style={inpBase}
                    />
                  </div>

                  <div>
                    <label style={labelStyle}>カスタムSEO説明文 (meta description)</label>
                    <textarea
                      rows={2}
                      value={editingPost.metaDescription || ''}
                      onChange={e => setEditingPost({ ...editingPost, metaDescription: e.target.value })}
                      placeholder={editingPost.excerpt || '未入力の場合は抜粋文が使用されます'}
                      style={{ ...inpBase, height: 'auto', resize: 'vertical' }}
                    />
                  </div>
                </div>
              </details>

              {/* Publish Controls */}
              <div style={{
                display: 'flex',
                flexWrap: 'wrap',
                justifyContent: 'space-between',
                alignItems: 'center',
                gap: '1rem',
                paddingTop: '1rem',
                borderTop: '1px solid #e5e7eb'
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '1.5rem' }}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', fontWeight: 600, fontSize: '0.9rem', color: '#111827' }}>
                    <input
                      type="checkbox"
                      checked={Boolean(editingPost.isPublished)}
                      onChange={e => setEditingPost({ ...editingPost, isPublished: e.target.checked })}
                      style={{ width: '18px', height: '18px', accentColor: '#c75626' }}
                    />
                    すぐに公開する (Published)
                  </label>

                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <span style={{ fontSize: '0.8rem', color: '#6b7280' }}>公開日時:</span>
                    <input
                      type="datetime-local"
                      value={editingPost.publishedAt || ''}
                      onChange={e => setEditingPost({ ...editingPost, publishedAt: e.target.value })}
                      style={{ ...inpBase, width: 'auto', padding: '4px 8px', height: '32px', fontSize: '0.8rem' }}
                    />
                  </div>
                </div>

                <div style={{ display: 'flex', gap: '0.75rem' }}>
                  <button
                    type="button"
                    onClick={handleCloseModal}
                    style={{ ...btnBase, backgroundColor: '#f3f4f6', color: '#4b5563' }}
                  >
                    キャンセル
                  </button>
                  <button
                    type="submit"
                    disabled={saving}
                    style={{ ...btnBase, backgroundColor: '#c75626', color: '#ffffff', fontWeight: 600 }}
                  >
                    {saving ? '保存中…' : isNew ? '記事を公開・作成' : '変更を保存'}
                  </button>
                </div>
              </div>

            </form>
          </div>
        </div>
      )}

    </div>
  );
}

const btnBase: CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: '6px',
  padding: '8px 16px',
  borderRadius: '8px',
  border: 'none',
  fontSize: '0.875rem',
  cursor: 'pointer',
  transition: 'opacity 0.15s, transform 0.1s',
};

const actionBtn: CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  padding: '6px 10px',
  borderRadius: '6px',
  border: 'none',
  fontSize: '0.78rem',
  fontWeight: 600,
  cursor: 'pointer',
  transition: 'all 0.15s',
};

const inpBase: CSSProperties = {
  width: '100%',
  padding: '8px 12px',
  borderRadius: '8px',
  border: '1px solid #d1d5db',
  backgroundColor: '#ffffff',
  color: '#111827',
  fontSize: '0.9rem',
  boxSizing: 'border-box',
  outline: 'none',
};

const labelStyle: CSSProperties = {
  display: 'block',
  fontSize: '0.85rem',
  fontWeight: 600,
  color: '#374151',
  marginBottom: '4px',
};
