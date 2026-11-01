import React, { useEffect, useMemo, useState } from 'react';
import { toast } from 'react-hot-toast';
import {
  Calendar,
  Check,
  CheckCheck,
  Clock,
  Copy,
  Download,
  Mail,
  MapPin,
  MessageSquare,
  Phone,
  Search,
  Trash2,
  User,
  Users,
  UtensilsCrossed,
  X,
} from 'lucide-react';
import { apiFetch, errorMessage } from '../../lib/api';

export interface ContactMessage {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  type: 'GENERAL' | 'RESERVATION' | 'CATERING' | 'FEEDBACK';
  date: string | null;
  guests: number | null;
  message: string;
  isRead: boolean;
  ip: string | null;
  createdAt: string;
}

export type CategoryKey = 'reservations' | 'newsletter' | 'inquiries' | 'all';
type StatusFilter = 'all' | 'unread' | 'read';

export function isReservation(m: ContactMessage): boolean {
  return m.type === 'RESERVATION' || Boolean(m.date || m.guests);
}

export function extractReservationStore(messageText: string): string | null {
  if (!messageText) return null;
  const match = messageText.match(/【(?:ご予約希望店舗|店舗|予約店舗):\s*([^】\n]+)】/);
  return match ? match[1].trim() : null;
}

export function isNewsletter(m: ContactMessage): boolean {
  if (isReservation(m)) return false;
  const name = (m.name || '').toLowerCase();
  const msg = (m.message || '').toLowerCase();
  return (
    name.includes('newsletter') ||
    msg.includes('newsletter') ||
    name.includes('ニュースレター') ||
    msg.includes('ニュースレター') ||
    msg.includes('メルマガ')
  );
}

export function isGeneralInquiry(m: ContactMessage): boolean {
  return !isReservation(m) && !isNewsletter(m);
}

function formatReservationDateTime(dateStr: string | null): { date: string; time: string; full: string; isPast: boolean } {
  if (!dateStr) return { date: '未設定', time: '', full: '未設定', isPast: false };
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return { date: dateStr, time: '', full: dateStr, isPast: false };
  const y = d.getFullYear();
  const m = d.getMonth() + 1;
  const day = d.getDate();
  const dayOfWeek = ['日', '月', '火', '水', '木', '金', '土'][d.getDay()];
  const hours = String(d.getHours()).padStart(2, '0');
  const minutes = String(d.getMinutes()).padStart(2, '0');
  const isPast = d.getTime() < Date.now();
  return {
    date: `${y}/${m}/${day} (${dayOfWeek})`,
    time: `${hours}:${minutes}`,
    full: `${y}年${m}月${day}日 (${dayOfWeek}) ${hours}:${minutes}`,
    isPast,
  };
}

function formatSubmittedAt(dateStr: string): string {
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return dateStr;
  return d.toLocaleString('ja-JP', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export default function MessagesTab() {
  const [messages, setMessages] = useState<ContactMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeCategory, setActiveCategory] = useState<CategoryKey>('reservations');
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [selectedMessage, setSelectedMessage] = useState<ContactMessage | null>(null);
  const [copied, setCopied] = useState(false);

  const fetchMessages = async () => {
    try {
      setLoading(true);
      const res = await apiFetch('/api/v1/contact');
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data)) {
          setMessages(data);
        }
      }
    } catch (err) {
      console.error(err);
      toast.error('メッセージの読み込みに失敗しました。');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchMessages();
  }, []);

  // Split into categories
  const reservations = useMemo(() => messages.filter(isReservation), [messages]);
  const newsletters = useMemo(() => messages.filter(isNewsletter), [messages]);
  const inquiries = useMemo(() => messages.filter(isGeneralInquiry), [messages]);

  const unreadReservations = useMemo(() => reservations.filter(m => !m.isRead).length, [reservations]);
  const unreadNewsletters = useMemo(() => newsletters.filter(m => !m.isRead).length, [newsletters]);
  const unreadInquiries = useMemo(() => inquiries.filter(m => !m.isRead).length, [inquiries]);

  // Current list based on category
  const currentList = useMemo(() => {
    switch (activeCategory) {
      case 'reservations':
        return reservations;
      case 'newsletter':
        return newsletters;
      case 'inquiries':
        return inquiries;
      case 'all':
      default:
        return messages;
    }
  }, [activeCategory, reservations, newsletters, inquiries, messages]);

  // Apply search & status filter
  const filteredList = useMemo(() => {
    const q = search.trim().toLowerCase();
    return currentList.filter(m => {
      // Status filter
      if (statusFilter === 'unread' && m.isRead) return false;
      if (statusFilter === 'read' && !m.isRead) return false;

      // Search filter
      if (!q) return true;
      const name = (m.name || '').toLowerCase();
      const email = (m.email || '').toLowerCase();
      const phone = (m.phone || '').toLowerCase();
      const msg = (m.message || '').toLowerCase();
      return name.includes(q) || email.includes(q) || phone.includes(q) || msg.includes(q);
    });
  }, [currentList, search, statusFilter]);

  // Toggle Read Status
  const toggleStatus = async (message: ContactMessage) => {
    const nextRead = !message.isRead;
    try {
      const res = await apiFetch(`/api/v1/contact/${message.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isRead: nextRead }),
      });
      if (res.ok) {
        setMessages(prev => prev.map(m => (m.id === message.id ? { ...m, isRead: nextRead } : m)));
        if (selectedMessage?.id === message.id) {
          setSelectedMessage(prev => (prev ? { ...prev, isRead: nextRead } : null));
        }
        toast.success(nextRead ? '既読・確認済みにしました' : '未読に戻しました');
      } else {
        toast.error(await errorMessage(res, '更新に失敗しました'));
      }
    } catch {
      toast.error('通信エラーが発生しました');
    }
  };

  // Mark all unread in current view as read
  const markAllRead = async () => {
    const unreadIds = filteredList.filter(m => !m.isRead).map(m => m.id);
    if (unreadIds.length === 0) {
      toast('未読のメッセージはありません');
      return;
    }
    try {
      const res = await apiFetch('/api/v1/contact/mark-read', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids: unreadIds }),
      });
      if (res.ok) {
        setMessages(prev => prev.map(m => (unreadIds.includes(m.id) ? { ...m, isRead: true } : m)));
        toast.success(`${unreadIds.length}件を既読にしました`);
      } else {
        toast.error(await errorMessage(res, '更新に失敗しました'));
      }
    } catch {
      toast.error('通信エラーが発生しました');
    }
  };

  // Delete message
  const handleDelete = async (id: string) => {
    if (!window.confirm('このメッセージを削除してもよろしいですか？この操作は取り消せません。')) return;
    try {
      const res = await apiFetch(`/api/v1/contact/${id}`, { method: 'DELETE' });
      if (res.ok) {
        setMessages(prev => prev.filter(m => m.id !== id));
        if (selectedMessage?.id === id) setSelectedMessage(null);
        toast.success('削除しました');
      } else {
        toast.error(await errorMessage(res, '削除に失敗しました'));
      }
    } catch {
      toast.error('通信エラーが発生しました');
    }
  };

  // Copy all newsletter emails
  const copyNewsletterEmails = () => {
    const emails = Array.from(new Set(newsletters.map(n => n.email.trim()).filter(Boolean)));
    if (emails.length === 0) {
      toast('コピーするメールアドレスがありません');
      return;
    }
    const text = emails.join(', ');
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
      toast.success(`${emails.length}件のメールアドレスをコピーしました`);
    });
  };

  // Export newsletter CSV
  const exportNewsletterCsv = () => {
    if (newsletters.length === 0) {
      toast('エクスポートするデータがありません');
      return;
    }
    const header = ['登録日時', 'メールアドレス', 'ステータス'];
    const rows = newsletters.map(m => [
      `"${formatSubmittedAt(m.createdAt)}"`,
      `"${m.email}"`,
      `"${m.isRead ? '確認済み' : '新規'}"`,
    ]);
    const csvContent = '\uFEFF' + [header.join(','), ...rows.map(r => r.join(','))].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `adarsha-newsletter-${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    toast.success('ニュースレターCSVをダウンロードしました');
  };

  // Export reservation CSV
  const exportReservationsCsv = () => {
    if (reservations.length === 0) {
      toast('エクスポートするデータがありません');
      return;
    }
    const header = ['予約店舗', '予約日時', '人数', 'お客様名', '電話番号', 'メールアドレス', 'ご要望', '申込日時', 'ステータス'];
    const rows = reservations.map(m => {
      const dt = formatReservationDateTime(m.date);
      const storeName = extractReservationStore(m.message) || '未指定';
      return [
        `"${storeName}"`,
        `"${dt.full}"`,
        `"${m.guests ? `${m.guests}名` : ''}"`,
        `"${m.name}"`,
        `"${m.phone || ''}"`,
        `"${m.email}"`,
        `"${(m.message || '').replace(/"/g, '""')}"`,
        `"${formatSubmittedAt(m.createdAt)}"`,
        `"${m.isRead ? '確認済み' : '未確認'}"`,
      ];
    });
    const csvContent = '\uFEFF' + [header.join(','), ...rows.map(r => r.join(','))].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `adarsha-reservations-${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    toast.success('予約一覧CSVをダウンロードしました');
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
      {/* 3 Summary Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '16px' }}>
        {/* Card 1: Reservations */}
        <button
          type="button"
          onClick={() => setActiveCategory('reservations')}
          style={{
            background: '#fff',
            border: activeCategory === 'reservations' ? '2px solid #b5451b' : '1px solid #e5e7eb',
            borderRadius: '14px',
            padding: '20px',
            textAlign: 'left',
            cursor: 'pointer',
            boxShadow: activeCategory === 'reservations' ? '0 8px 24px rgba(181, 69, 27, 0.12)' : '0 1px 3px rgba(0,0,0,0.04)',
            transition: 'all 0.2s ease',
            display: 'flex',
            flexDirection: 'column',
            gap: '8px',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', fontWeight: 700, color: '#111827', fontSize: '1rem' }}>
              <span style={{ width: '32px', height: '32px', borderRadius: '8px', background: '#fef3c7', color: '#b45309', display: 'grid', placeItems: 'center' }}>
                <UtensilsCrossed size={18} />
              </span>
              席を予約する
            </span>
            {unreadReservations > 0 ? (
              <span style={{ padding: '3px 9px', borderRadius: '9999px', background: '#ef4444', color: '#fff', fontSize: '0.72rem', fontWeight: 800 }}>
                {unreadReservations}件 未確認
              </span>
            ) : (
              <span style={{ padding: '3px 9px', borderRadius: '9999px', background: '#f3f4f6', color: '#6b7280', fontSize: '0.72rem', fontWeight: 600 }}>
                確認済み
              </span>
            )}
          </div>
          <div style={{ fontSize: '1.8rem', fontWeight: 800, color: '#111827', fontFamily: 'var(--font-display, inherit)', lineHeight: 1.1 }}>
            {reservations.length}<span style={{ fontSize: '0.9rem', fontWeight: 500, color: '#6b7280', marginLeft: '4px' }}>件の予約</span>
          </div>
          <div style={{ fontSize: '0.8rem', color: '#6b7280' }}>
            来店日時・人数・連絡先の確認と管理
          </div>
        </button>

        {/* Card 2: Newsletter */}
        <button
          type="button"
          onClick={() => setActiveCategory('newsletter')}
          style={{
            background: '#fff',
            border: activeCategory === 'newsletter' ? '2px solid #b5451b' : '1px solid #e5e7eb',
            borderRadius: '14px',
            padding: '20px',
            textAlign: 'left',
            cursor: 'pointer',
            boxShadow: activeCategory === 'newsletter' ? '0 8px 24px rgba(181, 69, 27, 0.12)' : '0 1px 3px rgba(0,0,0,0.04)',
            transition: 'all 0.2s ease',
            display: 'flex',
            flexDirection: 'column',
            gap: '8px',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', fontWeight: 700, color: '#111827', fontSize: '1rem' }}>
              <span style={{ width: '32px', height: '32px', borderRadius: '8px', background: '#e0e7ff', color: '#4338ca', display: 'grid', placeItems: 'center' }}>
                <Mail size={18} />
              </span>
              ニュースレター
            </span>
            {unreadNewsletters > 0 ? (
              <span style={{ padding: '3px 9px', borderRadius: '9999px', background: '#3b82f6', color: '#fff', fontSize: '0.72rem', fontWeight: 800 }}>
                {unreadNewsletters}件 新規
              </span>
            ) : (
              <span style={{ padding: '3px 9px', borderRadius: '9999px', background: '#f3f4f6', color: '#6b7280', fontSize: '0.72rem', fontWeight: 600 }}>
                配信リスト
              </span>
            )}
          </div>
          <div style={{ fontSize: '1.8rem', fontWeight: 800, color: '#111827', fontFamily: 'var(--font-display, inherit)', lineHeight: 1.1 }}>
            {newsletters.length}<span style={{ fontSize: '0.9rem', fontWeight: 500, color: '#6b7280', marginLeft: '4px' }}>名の購読者</span>
          </div>
          <div style={{ fontSize: '0.8rem', color: '#6b7280' }}>
            ホームページからのメルマガ登録アドレス一覧
          </div>
        </button>

        {/* Card 3: Inquiries */}
        <button
          type="button"
          onClick={() => setActiveCategory('inquiries')}
          style={{
            background: '#fff',
            border: activeCategory === 'inquiries' ? '2px solid #b5451b' : '1px solid #e5e7eb',
            borderRadius: '14px',
            padding: '20px',
            textAlign: 'left',
            cursor: 'pointer',
            boxShadow: activeCategory === 'inquiries' ? '0 8px 24px rgba(181, 69, 27, 0.12)' : '0 1px 3px rgba(0,0,0,0.04)',
            transition: 'all 0.2s ease',
            display: 'flex',
            flexDirection: 'column',
            gap: '8px',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', fontWeight: 700, color: '#111827', fontSize: '1rem' }}>
              <span style={{ width: '32px', height: '32px', borderRadius: '8px', background: '#f3e8ff', color: '#7e22ce', display: 'grid', placeItems: 'center' }}>
                <MessageSquare size={18} />
              </span>
              一般お問い合わせ
            </span>
            {unreadInquiries > 0 ? (
              <span style={{ padding: '3px 9px', borderRadius: '9999px', background: '#a855f7', color: '#fff', fontSize: '0.72rem', fontWeight: 800 }}>
                {unreadInquiries}件 未読
              </span>
            ) : (
              <span style={{ padding: '3px 9px', borderRadius: '9999px', background: '#f3f4f6', color: '#6b7280', fontSize: '0.72rem', fontWeight: 600 }}>
                すべて確認済み
              </span>
            )}
          </div>
          <div style={{ fontSize: '1.8rem', fontWeight: 800, color: '#111827', fontFamily: 'var(--font-display, inherit)', lineHeight: 1.1 }}>
            {inquiries.length}<span style={{ fontSize: '0.9rem', fontWeight: 500, color: '#6b7280', marginLeft: '4px' }}>件のメッセージ</span>
          </div>
          <div style={{ fontSize: '0.8rem', color: '#6b7280' }}>
            貸切・ケータリング・ご質問などのお問い合わせ
          </div>
        </button>
      </div>

      {/* Category Tabs & Action Bar */}
      <div
        style={{
          background: '#fff',
          borderRadius: '14px',
          border: '1px solid #e5e7eb',
          boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
          overflow: 'hidden',
        }}
      >
        {/* Sub-tab navigation */}
        <div
          style={{
            display: 'flex',
            borderBottom: '1px solid #e5e7eb',
            background: '#fafafa',
            padding: '4px 8px 0',
            gap: '4px',
            overflowX: 'auto',
          }}
        >
          <TabButton
            active={activeCategory === 'reservations'}
            onClick={() => setActiveCategory('reservations')}
            icon={<UtensilsCrossed size={16} />}
            label="席を予約する"
            count={reservations.length}
            unread={unreadReservations}
          />
          <TabButton
            active={activeCategory === 'newsletter'}
            onClick={() => setActiveCategory('newsletter')}
            icon={<Mail size={16} />}
            label="ニュースレター"
            count={newsletters.length}
            unread={unreadNewsletters}
          />
          <TabButton
            active={activeCategory === 'inquiries'}
            onClick={() => setActiveCategory('inquiries')}
            icon={<MessageSquare size={16} />}
            label="一般お問い合わせ"
            count={inquiries.length}
            unread={unreadInquiries}
          />
          <TabButton
            active={activeCategory === 'all'}
            onClick={() => setActiveCategory('all')}
            label="すべて"
            count={messages.length}
            unread={unreadReservations + unreadNewsletters + unreadInquiries}
          />
        </div>

        {/* Filters & Actions Toolbar */}
        <div
          style={{
            padding: '16px 20px',
            display: 'flex',
            flexWrap: 'wrap',
            gap: '12px',
            alignItems: 'center',
            justifyContent: 'space-between',
            borderBottom: '1px solid #f3f4f6',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flex: '1 1 300px' }}>
            <div style={{ position: 'relative', width: '100%', maxWidth: '340px' }}>
              <Search
                size={16}
                style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: '#9ca3af' }}
              />
              <input
                type="text"
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder={
                  activeCategory === 'reservations'
                    ? 'お名前、電話、メール、要望で検索...'
                    : activeCategory === 'newsletter'
                      ? 'メールアドレスで検索...'
                      : 'キーワードで検索...'
                }
                style={{
                  width: '100%',
                  padding: '9px 12px 9px 36px',
                  border: '1px solid #d1d5db',
                  borderRadius: '8px',
                  fontSize: '0.88rem',
                  outline: 'none',
                  boxSizing: 'border-box',
                }}
              />
              {search && (
                <button
                  type="button"
                  onClick={() => setSearch('')}
                  style={{ position: 'absolute', right: '10px', top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', color: '#9ca3af', cursor: 'pointer' }}
                >
                  <X size={14} />
                </button>
              )}
            </div>

            {/* Status pills */}
            <div style={{ display: 'flex', gap: '4px', background: '#f3f4f6', padding: '3px', borderRadius: '8px' }}>
              <button
                type="button"
                onClick={() => setStatusFilter('all')}
                style={{
                  padding: '5px 12px',
                  borderRadius: '6px',
                  border: 'none',
                  background: statusFilter === 'all' ? '#fff' : 'transparent',
                  color: statusFilter === 'all' ? '#111827' : '#6b7280',
                  fontWeight: statusFilter === 'all' ? 700 : 500,
                  fontSize: '0.78rem',
                  cursor: 'pointer',
                  boxShadow: statusFilter === 'all' ? '0 1px 2px rgba(0,0,0,0.06)' : 'none',
                }}
              >
                すべて
              </button>
              <button
                type="button"
                onClick={() => setStatusFilter('unread')}
                style={{
                  padding: '5px 12px',
                  borderRadius: '6px',
                  border: 'none',
                  background: statusFilter === 'unread' ? '#fff' : 'transparent',
                  color: statusFilter === 'unread' ? '#b5451b' : '#6b7280',
                  fontWeight: statusFilter === 'unread' ? 700 : 500,
                  fontSize: '0.78rem',
                  cursor: 'pointer',
                  boxShadow: statusFilter === 'unread' ? '0 1px 2px rgba(0,0,0,0.06)' : 'none',
                }}
              >
                未読のみ
              </button>
              <button
                type="button"
                onClick={() => setStatusFilter('read')}
                style={{
                  padding: '5px 12px',
                  borderRadius: '6px',
                  border: 'none',
                  background: statusFilter === 'read' ? '#fff' : 'transparent',
                  color: statusFilter === 'read' ? '#059669' : '#6b7280',
                  fontWeight: statusFilter === 'read' ? 700 : 500,
                  fontSize: '0.78rem',
                  cursor: 'pointer',
                  boxShadow: statusFilter === 'read' ? '0 1px 2px rgba(0,0,0,0.06)' : 'none',
                }}
              >
                確認済み
              </button>
            </div>
          </div>

          {/* Action buttons on the right */}
          <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
            {activeCategory === 'newsletter' && (
              <>
                <button
                  type="button"
                  onClick={copyNewsletterEmails}
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '6px',
                    padding: '8px 14px',
                    borderRadius: '8px',
                    border: '1px solid #d1d5db',
                    background: '#fff',
                    color: '#374151',
                    fontSize: '0.85rem',
                    fontWeight: 600,
                    cursor: 'pointer',
                  }}
                  title="全購読者のメールアドレスをクリップボードにコピー"
                >
                  {copied ? <Check size={15} style={{ color: '#059669' }} /> : <Copy size={15} />}
                  {copied ? 'コピー完了' : '全メールコピー'}
                </button>
                <button
                  type="button"
                  onClick={exportNewsletterCsv}
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '6px',
                    padding: '8px 14px',
                    borderRadius: '8px',
                    border: '1px solid #d1d5db',
                    background: '#fff',
                    color: '#374151',
                    fontSize: '0.85rem',
                    fontWeight: 600,
                    cursor: 'pointer',
                  }}
                >
                  <Download size={15} /> CSV保存
                </button>
              </>
            )}

            {activeCategory === 'reservations' && (
              <button
                type="button"
                onClick={exportReservationsCsv}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '6px',
                  padding: '8px 14px',
                  borderRadius: '8px',
                  border: '1px solid #d1d5db',
                  background: '#fff',
                  color: '#374151',
                  fontSize: '0.85rem',
                  fontWeight: 600,
                  cursor: 'pointer',
                }}
              >
                <Download size={15} /> 予約一覧CSV
              </button>
            )}

            <button
              type="button"
              onClick={markAllRead}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
                padding: '8px 14px',
                borderRadius: '8px',
                border: '1px solid #d1d5db',
                background: '#fff',
                color: '#4b5563',
                fontSize: '0.85rem',
                fontWeight: 600,
                cursor: 'pointer',
              }}
              title="表示中の未読メッセージをすべて確認済みにする"
            >
              <CheckCheck size={16} /> すべて既読にする
            </button>
          </div>
        </div>

        {/* Content Table */}
        {loading ? (
          <div style={{ padding: '60px', textAlign: 'center', color: '#9ca3af' }}>読み込み中…</div>
        ) : filteredList.length === 0 ? (
          <div style={{ padding: '60px 20px', textAlign: 'center', color: '#6b7280' }}>
            <div style={{ fontSize: '2rem', marginBottom: '8px' }}>📭</div>
            <div style={{ fontWeight: 600 }}>メッセージはありません</div>
            <div style={{ fontSize: '0.85rem', color: '#9ca3af', marginTop: '4px' }}>
              {search || statusFilter !== 'all' ? '検索条件を変更してください' : '新しいメッセージが届くとここに表示されます'}
            </div>
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            {activeCategory === 'reservations' && (
              <ReservationsTable
                items={filteredList}
                onSelect={setSelectedMessage}
                onToggleStatus={toggleStatus}
                onDelete={handleDelete}
              />
            )}
            {activeCategory === 'newsletter' && (
              <NewsletterTable
                items={filteredList}
                onSelect={setSelectedMessage}
                onToggleStatus={toggleStatus}
                onDelete={handleDelete}
              />
            )}
            {activeCategory === 'inquiries' && (
              <InquiriesTable
                items={filteredList}
                onSelect={setSelectedMessage}
                onToggleStatus={toggleStatus}
                onDelete={handleDelete}
              />
            )}
            {activeCategory === 'all' && (
              <AllMessagesTable
                items={filteredList}
                onSelect={setSelectedMessage}
                onToggleStatus={toggleStatus}
                onDelete={handleDelete}
              />
            )}
          </div>
        )}
      </div>

      {/* Message Detail Modal */}
      {selectedMessage && (
        <MessageDetailModal
          message={selectedMessage}
          onClose={() => setSelectedMessage(null)}
          onToggleStatus={() => toggleStatus(selectedMessage)}
          onDelete={() => handleDelete(selectedMessage.id)}
        />
      )}
    </div>
  );
}

// -----------------------------------------------------------------------------
// Sub-components: Sub-tab button
// -----------------------------------------------------------------------------
function TabButton({
  active,
  onClick,
  icon,
  label,
  count,
  unread,
}: {
  active: boolean;
  onClick: () => void;
  icon?: React.ReactNode;
  label: string;
  count: number;
  unread: number;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: '8px',
        padding: '12px 18px',
        border: 'none',
        borderBottom: active ? '3px solid #b5451b' : '3px solid transparent',
        background: active ? '#fff' : 'transparent',
        color: active ? '#111827' : '#6b7280',
        fontWeight: active ? 700 : 600,
        fontSize: '0.92rem',
        cursor: 'pointer',
        borderTopLeftRadius: '8px',
        borderTopRightRadius: '8px',
        whiteSpace: 'nowrap',
        transition: 'all 0.15s',
      }}
    >
      {icon}
      <span>{label}</span>
      <span
        style={{
          padding: '2px 7px',
          borderRadius: '9999px',
          background: unread > 0 ? '#ef4444' : '#e5e7eb',
          color: unread > 0 ? '#fff' : '#4b5563',
          fontSize: '0.72rem',
          fontWeight: 700,
        }}
      >
        {unread > 0 ? unread : count}
      </span>
    </button>
  );
}

// -----------------------------------------------------------------------------
// Table 1: Reservations ("席を予約する")
// -----------------------------------------------------------------------------
function ReservationsTable({
  items,
  onSelect,
  onToggleStatus,
  onDelete,
}: {
  items: ContactMessage[];
  onSelect: (m: ContactMessage) => void;
  onToggleStatus: (m: ContactMessage) => void;
  onDelete: (id: string) => void;
}) {
  return (
    <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
      <thead>
        <tr style={{ background: '#f9fafb', borderBottom: '1px solid #e5e7eb' }}>
          <th style={thStyle}>予約店舗</th>
          <th style={thStyle}>予約希望日時</th>
          <th style={thStyle}>人数</th>
          <th style={thStyle}>お客様名</th>
          <th style={thStyle}>電話番号</th>
          <th style={thStyle}>メール</th>
          <th style={thStyle}>ご要望など</th>
          <th style={thStyle}>申込日時</th>
          <th style={thStyle}>ステータス</th>
          <th style={{ ...thStyle, textAlign: 'right' }}>操作</th>
        </tr>
      </thead>
      <tbody>
        {items.map(m => {
          const dt = formatReservationDateTime(m.date);
          const storeName = extractReservationStore(m.message);
          return (
            <tr
              key={m.id}
              onClick={() => onSelect(m)}
              style={{
                borderBottom: '1px solid #f3f4f6',
                background: !m.isRead ? '#fffdf7' : '#fff',
                cursor: 'pointer',
                transition: 'background 0.15s',
              }}
              onMouseEnter={e => (e.currentTarget.style.background = '#f9fafb')}
              onMouseLeave={e => (e.currentTarget.style.background = !m.isRead ? '#fffdf7' : '#fff')}
            >
              {/* Store Name Badge */}
              <td style={tdStyle}>
                {storeName ? (
                  <span
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '4px',
                      padding: '4px 10px',
                      borderRadius: '8px',
                      backgroundColor: '#faede2',
                      color: '#b3471c',
                      fontWeight: 700,
                      fontSize: '0.82rem',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    <MapPin size={12} /> {storeName}
                  </span>
                ) : (
                  <span style={{ color: '#9ca3af', fontSize: '0.82rem' }}>未指定</span>
                )}
              </td>

              {/* Reservation Date & Time */}
              <td style={tdStyle}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <Calendar size={16} style={{ color: '#b5451b', flexShrink: 0 }} />
                  <div>
                    <div style={{ fontWeight: 700, color: '#111827', fontSize: '0.92rem' }}>{dt.date}</div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '0.8rem', color: '#6b7280' }}>
                      <Clock size={12} /> {dt.time || '時間指定なし'}
                    </div>
                  </div>
                </div>
              </td>

              {/* Guests count */}
              <td style={tdStyle}>
                <span
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '4px',
                    padding: '4px 10px',
                    borderRadius: '8px',
                    background: '#fef3c7',
                    color: '#92400e',
                    fontWeight: 700,
                    fontSize: '0.85rem',
                  }}
                >
                  <Users size={14} /> {m.guests ? `${m.guests}名様` : '未定'}
                </span>
              </td>

              {/* Name */}
              <td style={tdStyle}>
                <div style={{ fontWeight: 600, color: '#111827' }}>{m.name} 様</div>
              </td>

              {/* Phone */}
              <td style={tdStyle}>
                {m.phone ? (
                  <a
                    href={`tel:${m.phone}`}
                    onClick={e => e.stopPropagation()}
                    style={{ color: '#b5451b', fontWeight: 600, textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: '4px' }}
                  >
                    <Phone size={13} /> {m.phone}
                  </a>
                ) : (
                  <span style={{ color: '#9ca3af' }}>—</span>
                )}
              </td>

              {/* Email */}
              <td style={tdStyle}>
                <a
                  href={`mailto:${m.email}`}
                  onClick={e => e.stopPropagation()}
                  style={{ color: '#4b5563', textDecoration: 'none', fontSize: '0.82rem' }}
                >
                  {m.email}
                </a>
              </td>

              {/* Message snippet */}
              <td style={{ ...tdStyle, maxWidth: '200px' }}>
                <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: '#4b5563', fontSize: '0.85rem' }}>
                  {m.message || <span style={{ color: '#9ca3af' }}>なし</span>}
                </div>
              </td>

              {/* Booked at */}
              <td style={{ ...tdStyle, fontSize: '0.8rem', color: '#6b7280', whiteSpace: 'nowrap' }}>
                {formatSubmittedAt(m.createdAt)}
              </td>

              {/* Status button */}
              <td style={tdStyle} onClick={e => e.stopPropagation()}>
                <button
                  type="button"
                  onClick={() => onToggleStatus(m)}
                  style={{
                    padding: '4px 10px',
                    borderRadius: '9999px',
                    border: 'none',
                    background: m.isRead ? '#f3f4f6' : '#fee2e2',
                    color: m.isRead ? '#4b5563' : '#dc2626',
                    fontSize: '0.75rem',
                    fontWeight: 700,
                    cursor: 'pointer',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '4px',
                  }}
                  title="クリックでステータス切り替え"
                >
                  {m.isRead ? '確認済み' : '● 未確認'}
                </button>
              </td>

              {/* Actions */}
              <td style={{ ...tdStyle, textAlign: 'right', whiteSpace: 'nowrap' }} onClick={e => e.stopPropagation()}>
                <button
                  type="button"
                  onClick={() => onSelect(m)}
                  style={{
                    padding: '6px 12px',
                    borderRadius: '6px',
                    border: '1px solid #d1d5db',
                    background: '#fff',
                    color: '#374151',
                    fontSize: '0.8rem',
                    fontWeight: 600,
                    cursor: 'pointer',
                    marginRight: '6px',
                  }}
                >
                  詳細
                </button>
                <button
                  type="button"
                  onClick={() => onDelete(m.id)}
                  style={{
                    padding: '6px 8px',
                    borderRadius: '6px',
                    border: 'none',
                    background: 'transparent',
                    color: '#9ca3af',
                    cursor: 'pointer',
                  }}
                  title="削除"
                  onMouseEnter={e => (e.currentTarget.style.color = '#ef4444')}
                  onMouseLeave={e => (e.currentTarget.style.color = '#9ca3af')}
                >
                  <Trash2 size={16} />
                </button>
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

// -----------------------------------------------------------------------------
// Table 2: Newsletter ("ニュースレター")
// -----------------------------------------------------------------------------
function NewsletterTable({
  items,
  onSelect,
  onToggleStatus,
  onDelete,
}: {
  items: ContactMessage[];
  onSelect: (m: ContactMessage) => void;
  onToggleStatus: (m: ContactMessage) => void;
  onDelete: (id: string) => void;
}) {
  return (
    <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
      <thead>
        <tr style={{ background: '#f9fafb', borderBottom: '1px solid #e5e7eb' }}>
          <th style={thStyle}>登録日時</th>
          <th style={thStyle}>メールアドレス</th>
          <th style={thStyle}>登録元</th>
          <th style={thStyle}>ステータス</th>
          <th style={{ ...thStyle, textAlign: 'right' }}>操作</th>
        </tr>
      </thead>
      <tbody>
        {items.map(m => (
          <tr
            key={m.id}
            onClick={() => onSelect(m)}
            style={{
              borderBottom: '1px solid #f3f4f6',
              background: !m.isRead ? '#eff6ff' : '#fff',
              cursor: 'pointer',
              transition: 'background 0.15s',
            }}
            onMouseEnter={e => (e.currentTarget.style.background = '#f9fafb')}
            onMouseLeave={e => (e.currentTarget.style.background = !m.isRead ? '#eff6ff' : '#fff')}
          >
            <td style={{ ...tdStyle, fontSize: '0.85rem', color: '#6b7280', whiteSpace: 'nowrap' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Clock size={14} style={{ color: '#9ca3af' }} />
                {formatSubmittedAt(m.createdAt)}
              </div>
            </td>

            <td style={tdStyle}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Mail size={16} style={{ color: '#4338ca' }} />
                <span style={{ fontWeight: 700, color: '#111827', fontSize: '0.95rem', fontFamily: 'monospace' }}>
                  {m.email}
                </span>
              </div>
            </td>

            <td style={tdStyle}>
              <span style={{ padding: '3px 8px', borderRadius: '6px', background: '#f3f4f6', color: '#4b5563', fontSize: '0.78rem' }}>
                ホームページ ニュースレターフォーム
              </span>
            </td>

            <td style={tdStyle} onClick={e => e.stopPropagation()}>
              <button
                type="button"
                onClick={() => onToggleStatus(m)}
                style={{
                  padding: '4px 10px',
                  borderRadius: '9999px',
                  border: 'none',
                  background: m.isRead ? '#f3f4f6' : '#dbeafe',
                  color: m.isRead ? '#4b5563' : '#1d4ed8',
                  fontSize: '0.75rem',
                  fontWeight: 700,
                  cursor: 'pointer',
                }}
              >
                {m.isRead ? '確認済み' : '● 新規登録'}
              </button>
            </td>

            <td style={{ ...tdStyle, textAlign: 'right', whiteSpace: 'nowrap' }} onClick={e => e.stopPropagation()}>
              <a
                href={`mailto:${m.email}`}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '4px',
                  padding: '6px 12px',
                  borderRadius: '6px',
                  border: '1px solid #d1d5db',
                  background: '#fff',
                  color: '#374151',
                  fontSize: '0.8rem',
                  fontWeight: 600,
                  textDecoration: 'none',
                  marginRight: '6px',
                }}
              >
                <Mail size={13} /> メール作成
              </a>
              <button
                type="button"
                onClick={() => onDelete(m.id)}
                style={{
                  padding: '6px 8px',
                  borderRadius: '6px',
                  border: 'none',
                  background: 'transparent',
                  color: '#9ca3af',
                  cursor: 'pointer',
                }}
                title="削除"
                onMouseEnter={e => (e.currentTarget.style.color = '#ef4444')}
                onMouseLeave={e => (e.currentTarget.style.color = '#9ca3af')}
              >
                <Trash2 size={16} />
              </button>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

// -----------------------------------------------------------------------------
// Table 3: Inquiries ("一般お問い合わせ")
// -----------------------------------------------------------------------------
function InquiriesTable({
  items,
  onSelect,
  onToggleStatus,
  onDelete,
}: {
  items: ContactMessage[];
  onSelect: (m: ContactMessage) => void;
  onToggleStatus: (m: ContactMessage) => void;
  onDelete: (id: string) => void;
}) {
  return (
    <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
      <thead>
        <tr style={{ background: '#f9fafb', borderBottom: '1px solid #e5e7eb' }}>
          <th style={thStyle}>受信日時</th>
          <th style={thStyle}>お名前</th>
          <th style={thStyle}>種別</th>
          <th style={thStyle}>電話番号</th>
          <th style={thStyle}>メール</th>
          <th style={thStyle}>内容</th>
          <th style={thStyle}>ステータス</th>
          <th style={{ ...thStyle, textAlign: 'right' }}>操作</th>
        </tr>
      </thead>
      <tbody>
        {items.map(m => (
          <tr
            key={m.id}
            onClick={() => onSelect(m)}
            style={{
              borderBottom: '1px solid #f3f4f6',
              background: !m.isRead ? '#fdf4ff' : '#fff',
              cursor: 'pointer',
              transition: 'background 0.15s',
            }}
            onMouseEnter={e => (e.currentTarget.style.background = '#f9fafb')}
            onMouseLeave={e => (e.currentTarget.style.background = !m.isRead ? '#fdf4ff' : '#fff')}
          >
            <td style={{ ...tdStyle, fontSize: '0.85rem', color: '#6b7280', whiteSpace: 'nowrap' }}>
              {formatSubmittedAt(m.createdAt)}
            </td>

            <td style={tdStyle}>
              <div style={{ fontWeight: 600, color: '#111827' }}>{m.name}</div>
            </td>

            <td style={tdStyle}>
              <span
                style={{
                  padding: '3px 8px',
                  borderRadius: '6px',
                  background: '#f3f4f6',
                  color: '#4b5563',
                  fontSize: '0.78rem',
                  fontWeight: 600,
                }}
              >
                {m.type === 'CATERING' ? 'ケータリング' : m.type === 'FEEDBACK' ? 'ご意見' : '一般問い合わせ'}
              </span>
            </td>

            <td style={tdStyle}>
              {m.phone ? (
                <a href={`tel:${m.phone}`} onClick={e => e.stopPropagation()} style={{ color: '#4b5563', textDecoration: 'none' }}>
                  {m.phone}
                </a>
              ) : (
                <span style={{ color: '#9ca3af' }}>—</span>
              )}
            </td>

            <td style={tdStyle}>
              <a href={`mailto:${m.email}`} onClick={e => e.stopPropagation()} style={{ color: '#4b5563', textDecoration: 'none', fontSize: '0.82rem' }}>
                {m.email}
              </a>
            </td>

            <td style={{ ...tdStyle, maxWidth: '240px' }}>
              <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: '#4b5563', fontSize: '0.85rem' }}>
                {m.message}
              </div>
            </td>

            <td style={tdStyle} onClick={e => e.stopPropagation()}>
              <button
                type="button"
                onClick={() => onToggleStatus(m)}
                style={{
                  padding: '4px 10px',
                  borderRadius: '9999px',
                  border: 'none',
                  background: m.isRead ? '#f3f4f6' : '#fae8ff',
                  color: m.isRead ? '#4b5563' : '#86198f',
                  fontSize: '0.75rem',
                  fontWeight: 700,
                  cursor: 'pointer',
                }}
              >
                {m.isRead ? '既読' : '● 未読'}
              </button>
            </td>

            <td style={{ ...tdStyle, textAlign: 'right', whiteSpace: 'nowrap' }} onClick={e => e.stopPropagation()}>
              <button
                type="button"
                onClick={() => onSelect(m)}
                style={{
                  padding: '6px 12px',
                  borderRadius: '6px',
                  border: '1px solid #d1d5db',
                  background: '#fff',
                  color: '#374151',
                  fontSize: '0.8rem',
                  fontWeight: 600,
                  cursor: 'pointer',
                  marginRight: '6px',
                }}
              >
                詳細
              </button>
              <button
                type="button"
                onClick={() => onDelete(m.id)}
                style={{
                  padding: '6px 8px',
                  borderRadius: '6px',
                  border: 'none',
                  background: 'transparent',
                  color: '#9ca3af',
                  cursor: 'pointer',
                }}
                title="削除"
                onMouseEnter={e => (e.currentTarget.style.color = '#ef4444')}
                onMouseLeave={e => (e.currentTarget.style.color = '#9ca3af')}
              >
                <Trash2 size={16} />
              </button>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

// -----------------------------------------------------------------------------
// Table 4: All Messages ("すべて")
// -----------------------------------------------------------------------------
function AllMessagesTable({
  items,
  onSelect,
  onToggleStatus,
  onDelete,
}: {
  items: ContactMessage[];
  onSelect: (m: ContactMessage) => void;
  onToggleStatus: (m: ContactMessage) => void;
  onDelete: (id: string) => void;
}) {
  return (
    <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
      <thead>
        <tr style={{ background: '#f9fafb', borderBottom: '1px solid #e5e7eb' }}>
          <th style={thStyle}>受信日時</th>
          <th style={thStyle}>カテゴリ</th>
          <th style={thStyle}>お名前 / メール</th>
          <th style={thStyle}>連絡先</th>
          <th style={thStyle}>概要</th>
          <th style={thStyle}>ステータス</th>
          <th style={{ ...thStyle, textAlign: 'right' }}>操作</th>
        </tr>
      </thead>
      <tbody>
        {items.map(m => {
          const res = isReservation(m);
          const nl = isNewsletter(m);
          const dt = res ? formatReservationDateTime(m.date) : null;
          return (
            <tr
              key={m.id}
              onClick={() => onSelect(m)}
              style={{
                borderBottom: '1px solid #f3f4f6',
                background: !m.isRead ? '#fefce8' : '#fff',
                cursor: 'pointer',
                transition: 'background 0.15s',
              }}
              onMouseEnter={e => (e.currentTarget.style.background = '#f9fafb')}
              onMouseLeave={e => (e.currentTarget.style.background = !m.isRead ? '#fefce8' : '#fff')}
            >
              <td style={{ ...tdStyle, fontSize: '0.85rem', color: '#6b7280', whiteSpace: 'nowrap' }}>
                {formatSubmittedAt(m.createdAt)}
              </td>

              <td style={tdStyle}>
                {res && (
                  <span style={{ padding: '3px 8px', borderRadius: '6px', background: '#fef3c7', color: '#92400e', fontSize: '0.78rem', fontWeight: 700, display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                    <UtensilsCrossed size={12} /> 席を予約
                  </span>
                )}
                {nl && (
                  <span style={{ padding: '3px 8px', borderRadius: '6px', background: '#dbeafe', color: '#1d4ed8', fontSize: '0.78rem', fontWeight: 700, display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                    <Mail size={12} /> ニュースレター
                  </span>
                )}
                {!res && !nl && (
                  <span style={{ padding: '3px 8px', borderRadius: '6px', background: '#f3f4f6', color: '#4b5563', fontSize: '0.78rem', fontWeight: 700, display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                    <MessageSquare size={12} /> お問い合わせ
                  </span>
                )}
              </td>

              <td style={tdStyle}>
                <div style={{ fontWeight: 600, color: '#111827' }}>{m.name}</div>
                <div style={{ fontSize: '0.8rem', color: '#6b7280' }}>{m.email}</div>
              </td>

              <td style={tdStyle}>
                <span style={{ fontSize: '0.85rem', color: '#4b5563' }}>{m.phone || '—'}</span>
              </td>

              <td style={{ ...tdStyle, maxWidth: '240px' }}>
                {res && dt && (
                  <div style={{ fontSize: '0.85rem', fontWeight: 600, color: '#b5451b' }}>
                    📅 {dt.date} {dt.time} ({m.guests || '?'}名)
                  </div>
                )}
                <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: '#4b5563', fontSize: '0.82rem' }}>
                  {m.message}
                </div>
              </td>

              <td style={tdStyle} onClick={e => e.stopPropagation()}>
                <button
                  type="button"
                  onClick={() => onToggleStatus(m)}
                  style={{
                    padding: '4px 10px',
                    borderRadius: '9999px',
                    border: 'none',
                    background: m.isRead ? '#f3f4f6' : '#fee2e2',
                    color: m.isRead ? '#4b5563' : '#dc2626',
                    fontSize: '0.75rem',
                    fontWeight: 700,
                    cursor: 'pointer',
                  }}
                >
                  {m.isRead ? '確認済み' : '● 新規・未読'}
                </button>
              </td>

              <td style={{ ...tdStyle, textAlign: 'right', whiteSpace: 'nowrap' }} onClick={e => e.stopPropagation()}>
                <button
                  type="button"
                  onClick={() => onSelect(m)}
                  style={{
                    padding: '6px 12px',
                    borderRadius: '6px',
                    border: '1px solid #d1d5db',
                    background: '#fff',
                    color: '#374151',
                    fontSize: '0.8rem',
                    fontWeight: 600,
                    cursor: 'pointer',
                    marginRight: '6px',
                  }}
                >
                  詳細
                </button>
                <button
                  type="button"
                  onClick={() => onDelete(m.id)}
                  style={{
                    padding: '6px 8px',
                    borderRadius: '6px',
                    border: 'none',
                    background: 'transparent',
                    color: '#9ca3af',
                    cursor: 'pointer',
                  }}
                  title="削除"
                  onMouseEnter={e => (e.currentTarget.style.color = '#ef4444')}
                  onMouseLeave={e => (e.currentTarget.style.color = '#9ca3af')}
                >
                  <Trash2 size={16} />
                </button>
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

// -----------------------------------------------------------------------------
// Message Detail Modal
// -----------------------------------------------------------------------------
function MessageDetailModal({
  message,
  onClose,
  onToggleStatus,
  onDelete,
}: {
  message: ContactMessage;
  onClose: () => void;
  onToggleStatus: () => void;
  onDelete: () => void;
}) {
  const res = isReservation(message);
  const nl = isNewsletter(message);
  const dt = res ? formatReservationDateTime(message.date) : null;

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 100,
        backgroundColor: 'rgba(0,0,0,0.5)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '20px',
      }}
      onClick={onClose}
    >
      <div
        style={{
          backgroundColor: '#fff',
          borderRadius: '16px',
          width: '100%',
          maxWidth: '560px',
          maxHeight: '90vh',
          overflowY: 'auto',
          boxShadow: '0 20px 50px rgba(0,0,0,0.15)',
          display: 'flex',
          flexDirection: 'column',
        }}
        onClick={e => e.stopPropagation()}
      >
        {/* Modal Header */}
        <div style={{ padding: '24px 24px 16px', borderBottom: '1px solid #f3f4f6', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px' }}>
              {res && (
                <span style={{ padding: '3px 10px', borderRadius: '6px', background: '#fef3c7', color: '#92400e', fontSize: '0.8rem', fontWeight: 800, display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                  <UtensilsCrossed size={14} /> 席の予約リクエスト
                </span>
              )}
              {nl && (
                <span style={{ padding: '3px 10px', borderRadius: '6px', background: '#dbeafe', color: '#1d4ed8', fontSize: '0.8rem', fontWeight: 800, display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                  <Mail size={14} /> ニュースレター購読
                </span>
              )}
              {!res && !nl && (
                <span style={{ padding: '3px 10px', borderRadius: '6px', background: '#f3e8ff', color: '#7e22ce', fontSize: '0.8rem', fontWeight: 800, display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                  <MessageSquare size={14} /> お問い合わせ
                </span>
              )}
              <span style={{ fontSize: '0.8rem', color: '#9ca3af' }}>{formatSubmittedAt(message.createdAt)}</span>
            </div>
            <h2 style={{ margin: 0, fontSize: '1.25rem', color: '#111827', fontWeight: 700 }}>
              {res ? `${message.name} 様の席予約` : nl ? 'ニュースレター登録情報' : `${message.name} 様からのお問い合わせ`}
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            style={{ width: '32px', height: '32px', borderRadius: '50%', border: 'none', background: '#f3f4f6', cursor: 'pointer', display: 'grid', placeItems: 'center', color: '#6b7280' }}
          >
            <X size={18} />
          </button>
        </div>

        {/* Modal Body */}
        <div style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
          {/* Reservation Callout */}
          {res && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {extractReservationStore(message.message) && (
                <div style={{ background: '#faede2', border: '1px solid #ebd9c8', borderRadius: '10px', padding: '10px 16px', display: 'flex', alignItems: 'center', gap: '8px', color: '#b3471c', fontWeight: 700, fontSize: '0.94rem' }}>
                  <MapPin size={16} />
                  <span>ご予約希望店舗: <strong>{extractReservationStore(message.message)}</strong></span>
                </div>
              )}
              {dt && (
                <div style={{ background: '#fef8ee', border: '1px solid #fde68a', borderRadius: '12px', padding: '16px 20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px' }}>
                  <div>
                    <div style={{ fontSize: '0.78rem', color: '#92400e', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                      予約希望日時
                    </div>
                    <div style={{ fontSize: '1.35rem', fontWeight: 800, color: '#78350f', marginTop: '2px' }}>
                      {dt.full}
                    </div>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <div style={{ fontSize: '0.78rem', color: '#92400e', fontWeight: 700 }}>ご来店人数</div>
                    <div style={{ fontSize: '1.35rem', fontWeight: 800, color: '#78350f', marginTop: '2px' }}>
                      {message.guests ? `${message.guests} 名様` : '人数未定'}
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Customer Contacts */}
          <div style={{ background: '#f9fafb', borderRadius: '12px', padding: '16px', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '12px' }}>
            <div>
              <div style={fieldLabelStyle}><User size={13} /> お名前</div>
              <div style={{ fontWeight: 700, color: '#111827' }}>{message.name || '（名前なし）'}</div>
            </div>
            <div>
              <div style={fieldLabelStyle}><Mail size={13} /> メールアドレス</div>
              <div style={{ fontWeight: 600 }}>
                <a href={`mailto:${message.email}`} style={{ color: '#b5451b', textDecoration: 'none' }}>{message.email}</a>
              </div>
            </div>
            {message.phone && (
              <div>
                <div style={fieldLabelStyle}><Phone size={13} /> 電話番号</div>
                <div style={{ fontWeight: 600 }}>
                  <a href={`tel:${message.phone}`} style={{ color: '#b5451b', textDecoration: 'none' }}>{message.phone}</a>
                </div>
              </div>
            )}
          </div>

          {/* Message / Requests */}
          <div>
            <div style={fieldLabelStyle}>ご要望・メッセージ本文</div>
            <div
              style={{
                background: '#fff',
                border: '1px solid #e5e7eb',
                borderRadius: '8px',
                padding: '14px',
                fontSize: '0.92rem',
                lineHeight: 1.6,
                color: '#1f2937',
                whiteSpace: 'pre-wrap',
                minHeight: '80px',
              }}
            >
              {message.message || <span style={{ color: '#9ca3af' }}>（メッセージはありません）</span>}
            </div>
          </div>

          {/* Status block */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 16px', background: '#f9fafb', borderRadius: '8px' }}>
            <span style={{ fontSize: '0.88rem', fontWeight: 600, color: '#374151' }}>現在の対応ステータス</span>
            <button
              type="button"
              onClick={onToggleStatus}
              style={{
                padding: '6px 14px',
                borderRadius: '9999px',
                border: 'none',
                background: message.isRead ? '#d1fae5' : '#fee2e2',
                color: message.isRead ? '#065f46' : '#991b1b',
                fontWeight: 700,
                fontSize: '0.82rem',
                cursor: 'pointer',
              }}
            >
              {message.isRead ? '✓ 確認済み（クリックで未読に変更）' : '● 未確認（クリックで確認済みに変更）'}
            </button>
          </div>
        </div>

        {/* Modal Footer */}
        <div style={{ padding: '16px 24px', borderTop: '1px solid #f3f4f6', background: '#fafafa', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <button
            type="button"
            onClick={onDelete}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
              padding: '8px 14px',
              borderRadius: '8px',
              border: 'none',
              background: '#fee2e2',
              color: '#dc2626',
              fontSize: '0.85rem',
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            <Trash2 size={15} /> 削除する
          </button>

          <div style={{ display: 'flex', gap: '8px' }}>
            {message.phone && (
              <a
                href={`tel:${message.phone}`}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '6px',
                  padding: '9px 16px',
                  borderRadius: '8px',
                  border: '1px solid #d1d5db',
                  background: '#fff',
                  color: '#374151',
                  fontSize: '0.88rem',
                  fontWeight: 600,
                  textDecoration: 'none',
                }}
              >
                <Phone size={15} /> 電話をかける
              </a>
            )}
            <a
              href={`mailto:${message.email}`}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
                padding: '9px 16px',
                borderRadius: '8px',
                border: 'none',
                background: '#b5451b',
                color: '#fff',
                fontSize: '0.88rem',
                fontWeight: 700,
                textDecoration: 'none',
              }}
            >
              <Mail size={15} /> 返信メールを作成
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}

const thStyle: React.CSSProperties = {
  padding: '12px 16px',
  fontSize: '0.78rem',
  textTransform: 'uppercase',
  color: '#6b7280',
  fontWeight: 700,
  letterSpacing: '0.5px',
  whiteSpace: 'nowrap',
};

const tdStyle: React.CSSProperties = {
  padding: '14px 16px',
  fontSize: '0.9rem',
  color: '#374151',
};

const fieldLabelStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: '4px',
  fontSize: '0.78rem',
  fontWeight: 700,
  color: '#6b7280',
  marginBottom: '4px',
  textTransform: 'uppercase',
  letterSpacing: '0.5px',
};
