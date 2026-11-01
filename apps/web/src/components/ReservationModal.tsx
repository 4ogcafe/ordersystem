import React, { useEffect, useState, useMemo } from 'react';
import { toast } from 'react-hot-toast';
import { 
  X, 
  MapPin, 
  Clock, 
  Phone, 
  CheckCircle2, 
  ExternalLink,
  ChevronRight,
  Sparkles,
  Info,
  Check,
  Store,
  Calendar
} from 'lucide-react';
import { apiFetch, errorMessage } from '../lib/api';
import { DEFAULT_STORE_LOCATIONS, type StoreLocation } from '../lib/stores';
import { useCustomer } from '../lib/customer-context';

interface ReservationModalProps {
  isOpen: boolean;
  onClose: () => void;
  defaultStoreId?: string;
}

const DINING_TYPES = [
  'お席のみのご予約',
  'ランチ利用',
  'ディナー利用',
  'コース・飲み放題',
  '記念日・お祝い',
];

export default function ReservationModal({
  isOpen,
  onClose,
  defaultStoreId,
}: ReservationModalProps) {
  const { customer } = useCustomer();
  const [stores, setStores] = useState<StoreLocation[]>(DEFAULT_STORE_LOCATIONS);
  const [selectedStoreId, setSelectedStoreId] = useState<string>(
    defaultStoreId || DEFAULT_STORE_LOCATIONS[0].id
  );
  const [selectedArea, setSelectedArea] = useState<string>('all');
  const [date, setDate] = useState<string>('');
  const [time, setTime] = useState<string>('18:00');
  const [guests, setGuests] = useState<string>('2');
  const [diningType, setDiningType] = useState<string>(DINING_TYPES[0]);
  const [name, setName] = useState<string>('');
  const [email, setEmail] = useState<string>('');
  const [phone, setPhone] = useState<string>('');
  const [message, setMessage] = useState<string>('');
  const [submitting, setSubmitting] = useState<boolean>(false);
  const [isSubmitted, setIsSubmitted] = useState<boolean>(false);
  const [submittedStore, setSubmittedStore] = useState<StoreLocation | null>(null);

  // Auto-fill logged-in customer info
  useEffect(() => {
    if (customer) {
      if (customer.name && !name) setName(customer.name);
      if (customer.email && !email) setEmail(customer.email);
      if (customer.phone && !phone) setPhone(customer.phone);
    }
  }, [customer]);

  // Load stores dynamically from API whenever modal opens or mounts
  useEffect(() => {
    if (!isOpen) return;
    let isMounted = true;
    apiFetch('/api/v1/stores')
      .then(res => (res.ok ? res.json() : null))
      .then(data => {
        if (isMounted && Array.isArray(data) && data.length > 0) {
          setStores(data);
        }
      })
      .catch(() => undefined);
    return () => {
      isMounted = false;
    };
  }, [isOpen]);

  // Update selected store when defaultStoreId changes
  useEffect(() => {
    if (defaultStoreId) {
      setSelectedStoreId(defaultStoreId);
    }
  }, [defaultStoreId]);

  // Set default date to today or tomorrow
  useEffect(() => {
    if (!date) {
      const today = new Date();
      const yyyy = today.getFullYear();
      const mm = String(today.getMonth() + 1).padStart(2, '0');
      const dd = String(today.getDate()).padStart(2, '0');
      setDate(`${yyyy}-${mm}-${dd}`);
    }
  }, [date]);

  // Lock body scroll when modal is open
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
      const onKeyDown = (e: KeyboardEvent) => {
        if (e.key === 'Escape') onClose();
      };
      window.addEventListener('keydown', onKeyDown);
      return () => {
        document.body.style.overflow = '';
        window.removeEventListener('keydown', onKeyDown);
      };
    }
  }, [isOpen, onClose]);

  const selectedStore = useMemo(() => {
    return stores.find(s => s.id === selectedStoreId) || stores[0] || DEFAULT_STORE_LOCATIONS[0];
  }, [stores, selectedStoreId]);

  // Dynamically extract all unique areas/prefectures from currently registered stores
  const dynamicAreas = useMemo(() => {
    const set = new Set<string>();
    stores.forEach(s => {
      const match = s.address.match(/(東京都|神奈川県|千葉県|埼玉県|茨城県|群馬県|栃木県|大阪府|[^\s]+[都道府県])/);
      if (match) {
        set.add(match[1]);
      } else if (s.area) {
        const parts = s.area.split(/[・\s]/);
        const pref = parts.find(p => /[都道府県]/.test(p));
        if (pref) set.add(pref);
        else set.add('その他');
      }
    });
    return Array.from(set);
  }, [stores]);

  const filteredStores = useMemo(() => {
    if (selectedArea === 'all') return stores;
    return stores.filter(s => s.address.includes(selectedArea) || s.area.includes(selectedArea));
  }, [stores, selectedArea]);

  const dynamicAreaTabs = useMemo(() => {
    return [
      { id: 'all', label: `すべて (${stores.length})` },
      ...dynamicAreas.map(a => ({
        id: a,
        label: `${a.replace(/[都府県]/, '')} (${stores.filter(s => s.address.includes(a) || s.area.includes(a)).length})`,
      })),
    ];
  }, [stores, dynamicAreas]);

  // Check if chosen date coincides with store regular holiday
  const isSelectedStoreHoliday = useMemo(() => {
    if (!selectedStore?.holiday || !date) return false;
    try {
      const [y, m, d] = date.split('-').map(Number);
      const dayOfWeekIndex = new Date(y, m - 1, d).getDay();
      const dayNames = ['日曜日', '月曜日', '火曜日', '水曜日', '木曜日', '金曜日', '土曜日'];
      const targetDay = dayNames[dayOfWeekIndex];
      return selectedStore.holiday.includes(targetDay) || selectedStore.holiday.includes(targetDay.replace('曜日', '曜'));
    } catch {
      return false;
    }
  }, [selectedStore, date]);

  const minDate = useMemo(() => {
    const today = new Date();
    const yyyy = today.getFullYear();
    const mm = String(today.getMonth() + 1).padStart(2, '0');
    const dd = String(today.getDate()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
  }, []);

  const setPresetDate = (daysAhead: number) => {
    const d = new Date();
    d.setDate(d.getDate() + daysAhead);
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    setDate(`${yyyy}-${mm}-${dd}`);
  };

  // Download .ics calendar event file
  const downloadIcs = () => {
    if (!submittedStore) return;
    try {
      const [year, month, day] = date.split('-').map(Number);
      const [hour, minute] = time.split(':').map(Number);
      const start = new Date(year, month - 1, day, hour, minute);
      const end = new Date(start.getTime() + 2 * 60 * 60 * 1000); // 2 hours duration
      const pad = (n: number) => String(n).padStart(2, '0');
      const toIcsDate = (d: Date) =>
        `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}T${pad(d.getHours())}${pad(d.getMinutes())}00`;
      const ics = [
        'BEGIN:VCALENDAR',
        'VERSION:2.0',
        'PRODID:-//Adarsha Restaurant//Reservation//JA',
        'CALSCALE:GREGORIAN',
        'METHOD:PUBLISH',
        'BEGIN:VEVENT',
        `SUMMARY:お席のご予約: ${submittedStore.name}`,
        `DESCRIPTION:ご予約人数: ${guests}名様\\nプラン: ${diningType}\\nお電話: ${submittedStore.phone}\\n住所: ${submittedStore.address}`,
        `LOCATION:${submittedStore.address}`,
        `DTSTART:${toIcsDate(start)}`,
        `DTEND:${toIcsDate(end)}`,
        'STATUS:CONFIRMED',
        'END:VEVENT',
        'END:VCALENDAR',
      ].join('\r\n');
      const blob = new Blob([ics], { type: 'text/calendar;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `adarsha-${submittedStore.id}-${date}.ics`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success('カレンダー情報をダウンロードしました！');
    } catch {
      toast.error('カレンダーの作成に失敗しました');
    }
  };

  const handleModalClose = () => {
    onClose();
    setTimeout(() => {
      setIsSubmitted(false);
      setSubmittedStore(null);
    }, 300);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedStore) {
      toast.error('店舗を選択してください');
      return;
    }
    if (!date || !time) {
      toast.error('予約日時を選択してください');
      return;
    }
    if (!name.trim()) {
      toast.error('お名前を入力してください');
      return;
    }
    if (!phone.trim()) {
      toast.error('電話番号を入力してください');
      return;
    }
    if (!email.trim()) {
      toast.error('メールアドレスを入力してください');
      return;
    }

    setSubmitting(true);
    try {
      // Compose a rich, clear structured message for backwards-compatibility with Prisma & Admin
      const combinedMessage = [
        `【ご予約希望店舗: ${selectedStore.name}】`,
        `【店舗住所: ${selectedStore.address}】`,
        `【店舗TEL: ${selectedStore.phone}】`,
        `【ご希望プラン: ${diningType}】`,
        message.trim() ? `【ご要望・メモ】\n${message.trim()}` : '',
      ]
        .filter(Boolean)
        .join('\n');

      const res = await apiFetch('/api/v1/contact', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: name.trim(),
          email: email.trim(),
          phone: phone.trim(),
          type: 'RESERVATION',
          date: `${date}T${time}:00`,
          guests: parseInt(guests, 10) || 2,
          message: combinedMessage,
        }),
      });

      if (res.ok) {
        setSubmittedStore(selectedStore);
        setIsSubmitted(true);
        toast.success(`${selectedStore.name}への予約リクエストを送信しました！`);
      } else {
        toast.error(await errorMessage(res, '予約リクエストの送信に失敗しました'));
      }
    } catch {
      toast.error('通信エラーが発生しました。ネットワークをご確認ください。');
    } finally {
      setSubmitting(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        backgroundColor: 'rgba(15, 12, 10, 0.78)',
        backdropFilter: 'blur(8px)',
        WebkitBackdropFilter: 'blur(8px)',
        zIndex: 99999,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '16px',
        boxSizing: 'border-box',
        overflowY: 'auto',
      }}
      onClick={handleModalClose}
    >
      <div
        style={{
          backgroundColor: '#ffffff',
          borderRadius: '24px',
          overflow: 'hidden',
          maxWidth: '680px',
          width: '100%',
          position: 'relative',
          margin: 'auto',
          boxShadow: '0 25px 60px -15px rgba(0, 0, 0, 0.4), 0 0 0 1px rgba(0, 0, 0, 0.05)',
          fontFamily: "'Inter', 'Noto Sans JP', sans-serif",
          animation: 'modalSlideUp 0.28s cubic-bezier(0.16, 1, 0.3, 1)',
        }}
        onClick={e => e.stopPropagation()}
      >
        <style>{`
          @keyframes modalSlideUp {
            from { opacity: 0; transform: translateY(18px) scale(0.98); }
            to { opacity: 1; transform: translateY(0) scale(1); }
          }
          .store-scroll::-webkit-scrollbar {
            height: 6px;
          }
          .store-scroll::-webkit-scrollbar-track {
            background: #f1f1f1;
            border-radius: 4px;
          }
          .store-scroll::-webkit-scrollbar-thumb {
            background: #d1c7bc;
            border-radius: 4px;
          }
          .store-scroll::-webkit-scrollbar-thumb:hover {
            background: #b3471c;
          }
          .store-grid-scroll::-webkit-scrollbar {
            width: 5px;
          }
          .store-grid-scroll::-webkit-scrollbar-track {
            background: #f9fafb;
            border-radius: 4px;
          }
          .store-grid-scroll::-webkit-scrollbar-thumb {
            background: #e5e7eb;
            border-radius: 4px;
          }
          .store-grid-scroll::-webkit-scrollbar-thumb:hover {
            background: #b3471c;
          }
        `}</style>

        {/* Top Header Banner */}
        <div
          style={{
            position: 'relative',
            background: 'linear-gradient(135deg, #1f1612 0%, #3d1b11 60%, #b3471c 100%)',
            color: '#ffffff',
            padding: '24px 28px',
            overflow: 'hidden',
          }}
        >
          {/* Subtle decorative glow */}
          <div
            style={{
              position: 'absolute',
              top: '-40px',
              right: '-40px',
              width: '180px',
              height: '180px',
              background: 'radial-gradient(circle, rgba(245, 158, 11, 0.35) 0%, transparent 70%)',
              borderRadius: '50%',
              pointerEvents: 'none',
            }}
          />

          <button
            type="button"
            onClick={handleModalClose}
            aria-label="閉じる"
            style={{
              position: 'absolute',
              top: '18px',
              right: '18px',
              width: '36px',
              height: '36px',
              borderRadius: '50%',
              backgroundColor: 'rgba(255, 255, 255, 0.15)',
              border: '1px solid rgba(255, 255, 255, 0.25)',
              color: '#ffffff',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: 'pointer',
              transition: 'all 0.2s',
            }}
            onMouseOver={e => (e.currentTarget.style.backgroundColor = 'rgba(255, 255, 255, 0.3)')}
            onMouseOut={e => (e.currentTarget.style.backgroundColor = 'rgba(255, 255, 255, 0.15)')}
          >
            <X size={18} />
          </button>

          <div style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', padding: '4px 12px', borderRadius: '20px', backgroundColor: 'rgba(255, 255, 255, 0.12)', backdropFilter: 'blur(4px)', fontSize: '0.78rem', fontWeight: 700, letterSpacing: '1px', textTransform: 'uppercase', color: '#fcd34d', marginBottom: '8px' }}>
            <Sparkles size={13} />
            <span>Adarsha Table Booking ・ 全{stores.length}店舗対応</span>
          </div>

          <h2 style={{ margin: '0 0 6px 0', fontSize: '1.65rem', fontWeight: 800, letterSpacing: '-0.5px' }}>
            オンライン席予約
          </h2>
          <p style={{ margin: 0, fontSize: '0.88rem', color: 'rgba(255, 255, 255, 0.85)', lineHeight: 1.5 }}>
            ご希望の店舗を選択して、簡単にお席をご予約いただけます。
          </p>
        </div>

        {/* Modal Body */}
        <div style={{ padding: '24px 28px', maxHeight: 'calc(90vh - 140px)', overflowY: 'auto' }}>
          {isSubmitted && submittedStore ? (
            /* Success State */
            <div style={{ textAlign: 'center', padding: '16px 8px' }}>
              <div
                style={{
                  width: '64px',
                  height: '64px',
                  borderRadius: '50%',
                  backgroundColor: '#ecfdf5',
                  color: '#059669',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  margin: '0 auto 18px',
                  boxShadow: '0 0 0 8px #f0fdf4',
                }}
              >
                <CheckCircle2 size={38} strokeWidth={2.4} />
              </div>

              <h3 style={{ fontSize: '1.45rem', fontWeight: 800, color: '#111827', margin: '0 0 8px' }}>
                ご予約リクエストを受け付けました
              </h3>
              <p style={{ color: '#4b5563', fontSize: '0.92rem', lineHeight: 1.6, maxWidth: '460px', margin: '0 auto 24px' }}>
                ご予約リクエストを承りました。店舗スタッフより内容を確認のうえ、折り返しご連絡いたします。
              </p>

              {/* Reservation Receipt Card */}
              <div
                style={{
                  backgroundColor: '#fbf8f5',
                  border: '1px solid #ebd9c8',
                  borderRadius: '16px',
                  padding: '20px',
                  textAlign: 'left',
                  marginBottom: '24px',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '12px',
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid #ebd9c8', paddingBottom: '12px' }}>
                  <div style={{ fontSize: '0.82rem', color: '#8c786a', fontWeight: 600 }}>ご予約店舗</div>
                  <div style={{ fontWeight: 800, color: '#b3471c', fontSize: '1.05rem' }}>
                    {submittedStore.name}
                  </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', fontSize: '0.9rem' }}>
                  <div>
                    <div style={{ fontSize: '0.78rem', color: '#8c786a', fontWeight: 600 }}>ご予約日時</div>
                    <div style={{ fontWeight: 700, color: '#111827', marginTop: '2px' }}>
                      {date} {time}
                    </div>
                  </div>
                  <div>
                    <div style={{ fontSize: '0.78rem', color: '#8c786a', fontWeight: 600 }}>人数・プラン</div>
                    <div style={{ fontWeight: 700, color: '#111827', marginTop: '2px' }}>
                      {guests}名様 （{diningType}）
                    </div>
                  </div>
                  <div>
                    <div style={{ fontSize: '0.78rem', color: '#8c786a', fontWeight: 600 }}>お名前</div>
                    <div style={{ fontWeight: 700, color: '#111827', marginTop: '2px' }}>
                      {name} 様
                    </div>
                  </div>
                  <div>
                    <div style={{ fontSize: '0.78rem', color: '#8c786a', fontWeight: 600 }}>電話番号</div>
                    <div style={{ fontWeight: 700, color: '#111827', marginTop: '2px' }}>
                      {phone}
                    </div>
                  </div>
                </div>

                <div style={{ borderTop: '1px solid #ebd9c8', paddingTop: '12px', fontSize: '0.85rem', color: '#6b7280', display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <MapPin size={16} style={{ color: '#b3471c', flexShrink: 0 }} />
                  <span>{submittedStore.address}（TEL: {submittedStore.phone}）</span>
                </div>
              </div>

              <div style={{ display: 'flex', gap: '10px', justifyContent: 'center', flexWrap: 'wrap' }}>
                <button
                  type="button"
                  onClick={downloadIcs}
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '6px',
                    padding: '11px 18px',
                    borderRadius: '10px',
                    backgroundColor: '#fff',
                    color: '#1e293b',
                    border: '1px solid #cbd5e1',
                    fontWeight: 700,
                    fontSize: '0.9rem',
                    cursor: 'pointer',
                    boxShadow: '0 1px 3px rgba(0,0,0,0.06)',
                  }}
                >
                  <Calendar size={15} style={{ color: '#b3471c' }} />
                  <span>カレンダーに追加 (.ics)</span>
                </button>
                <a
                  href={`tel:${submittedStore.phone.replace(/[^0-9]/g, '')}`}
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '6px',
                    padding: '11px 18px',
                    borderRadius: '10px',
                    backgroundColor: '#fff',
                    color: '#b3471c',
                    border: '1px solid #ebd9c8',
                    fontWeight: 700,
                    fontSize: '0.9rem',
                    textDecoration: 'none',
                    boxShadow: '0 1px 3px rgba(0,0,0,0.06)',
                  }}
                >
                  <Phone size={15} />
                  <span>店舗に電話する</span>
                </a>
                <a
                  href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(submittedStore.name + ' ' + submittedStore.address)}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '6px',
                    padding: '11px 18px',
                    borderRadius: '10px',
                    backgroundColor: '#fff',
                    color: '#4b5563',
                    border: '1px solid #d1d5db',
                    fontWeight: 600,
                    fontSize: '0.9rem',
                    textDecoration: 'none',
                  }}
                >
                  <ExternalLink size={15} /> Googleマップ
                </a>
                <button
                  type="button"
                  onClick={handleModalClose}
                  style={{
                    padding: '11px 24px',
                    borderRadius: '10px',
                    backgroundColor: '#b3471c',
                    color: '#ffffff',
                    border: 'none',
                    fontWeight: 700,
                    fontSize: '0.92rem',
                    cursor: 'pointer',
                    boxShadow: '0 2px 8px rgba(179, 71, 28, 0.25)',
                  }}
                >
                  完了・閉じる
                </button>
              </div>
            </div>
          ) : (
            /* Multi-store Form */
            <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '22px' }}>
              
              {/* Step 1: Select Store */}
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
                  <label style={{ fontSize: '0.94rem', fontWeight: 800, color: '#1f1612', display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: '24px', height: '24px', borderRadius: '50%', backgroundColor: '#b3471c', color: '#fff', fontSize: '0.8rem', fontWeight: 800 }}>1</span>
                    ご来店店舗の選択
                    <span style={{ color: '#b3471c', fontSize: '0.85rem' }}>*</span>
                  </label>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '0.78rem', color: '#8c786a', fontWeight: 600 }}>
                    <Store size={14} style={{ color: '#b3471c' }} />
                    <span>全{stores.length}店舗対応</span>
                  </div>
                </div>

                {/* Area Filter Tabs (Dynamically Generated from DB) */}
                <div style={{ display: 'flex', gap: '6px', marginBottom: '10px', flexWrap: 'wrap' }}>
                  {dynamicAreaTabs.map(tab => {
                    const active = selectedArea === tab.id;
                    return (
                      <button
                        key={tab.id}
                        type="button"
                        onClick={() => setSelectedArea(tab.id)}
                        style={{
                          padding: '4px 12px',
                          borderRadius: '20px',
                          border: active ? '1.5px solid #b3471c' : '1px solid #e5e7eb',
                          backgroundColor: active ? '#b3471c' : '#f9fafb',
                          color: active ? '#ffffff' : '#4b5563',
                          fontSize: '0.78rem',
                          fontWeight: active ? 700 : 500,
                          cursor: 'pointer',
                          transition: 'all 0.15s ease',
                        }}
                      >
                        {tab.label}
                      </button>
                    );
                  })}
                </div>

                {/* 2-Column Responsive Store Cards Grid */}
                <div
                  className="store-grid-scroll"
                  style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))',
                    gap: '8px',
                    maxHeight: '215px',
                    overflowY: 'auto',
                    padding: '2px 4px 6px 2px',
                    marginBottom: '12px',
                  }}
                >
                  {filteredStores.map(store => {
                    const isSelected = store.id === selectedStoreId;
                    return (
                      <button
                        key={store.id}
                        type="button"
                        onClick={() => setSelectedStoreId(store.id)}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: '10px',
                          padding: '10px 12px',
                          borderRadius: '12px',
                          border: isSelected ? '2px solid #b3471c' : '1px solid #e5e7eb',
                          backgroundColor: isSelected ? '#fff9f5' : '#ffffff',
                          boxShadow: isSelected ? '0 4px 12px rgba(179, 71, 28, 0.14)' : '0 1px 2px rgba(0, 0, 0, 0.04)',
                          textAlign: 'left',
                          cursor: 'pointer',
                          transition: 'all 0.18s cubic-bezier(0.16, 1, 0.3, 1)',
                          position: 'relative',
                        }}
                        onMouseOver={e => {
                          if (!isSelected) {
                            e.currentTarget.style.borderColor = '#d1c7bc';
                            e.currentTarget.style.backgroundColor = '#faf9f8';
                          }
                        }}
                        onMouseOut={e => {
                          if (!isSelected) {
                            e.currentTarget.style.borderColor = '#e5e7eb';
                            e.currentTarget.style.backgroundColor = '#ffffff';
                          }
                        }}
                      >
                        {/* Number Badge */}
                        <div
                          style={{
                            width: '30px',
                            height: '30px',
                            borderRadius: '50%',
                            backgroundColor: isSelected ? '#b3471c' : '#f3f4f6',
                            color: isSelected ? '#ffffff' : '#6b7280',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            fontWeight: 800,
                            fontSize: '0.78rem',
                            flexShrink: 0,
                            transition: 'all 0.15s ease',
                          }}
                        >
                          {store.number}
                        </div>

                        {/* Store Info */}
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
                            <span style={{ fontWeight: 800, fontSize: '0.88rem', color: isSelected ? '#b3471c' : '#111827' }}>
                              {store.name.replace('アダルサ ', '')}
                            </span>
                            <span style={{ fontSize: '0.68rem', padding: '1px 5px', borderRadius: '4px', backgroundColor: isSelected ? '#faede2' : '#f3f4f6', color: isSelected ? '#b3471c' : '#6b7280', fontWeight: 600 }}>
                              {store.badge}
                            </span>
                          </div>
                          <div style={{ fontSize: '0.74rem', color: '#6b7280', marginTop: '2px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {store.access || store.area}
                          </div>
                        </div>

                        {/* Check Indicator */}
                        <div
                          style={{
                            width: '18px',
                            height: '18px',
                            borderRadius: '50%',
                            border: isSelected ? 'none' : '1.5px solid #d1d5db',
                            backgroundColor: isSelected ? '#b3471c' : 'transparent',
                            color: '#ffffff',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            flexShrink: 0,
                            transition: 'all 0.15s ease',
                          }}
                        >
                          {isSelected && <Check size={11} strokeWidth={3} />}
                        </div>
                      </button>
                    );
                  })}
                </div>

                {/* Selected Store Showcase Card */}
                {selectedStore && (
                  <div
                    style={{
                      backgroundColor: '#fbf8f5',
                      border: '1.5px solid #ebd9c8',
                      borderLeft: '4px solid #b3471c',
                      borderRadius: '14px',
                      padding: '14px 16px',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '8px',
                      boxShadow: '0 2px 8px rgba(0, 0, 0, 0.04)',
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '8px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                        <span style={{ fontSize: '0.72rem', fontWeight: 800, padding: '2px 7px', borderRadius: '5px', backgroundColor: '#b3471c', color: '#fff' }}>
                          No.{selectedStore.number}
                        </span>
                        <h4 style={{ margin: 0, fontSize: '1.02rem', fontWeight: 800, color: '#111827' }}>
                          {selectedStore.name}
                        </h4>
                        <span style={{ fontSize: '0.74rem', padding: '2px 7px', borderRadius: '5px', backgroundColor: '#faede2', color: '#b3471c', fontWeight: 700 }}>
                          {selectedStore.badge}
                        </span>
                      </div>
                      <a
                        href={`tel:${selectedStore.phone.replace(/[^0-9]/g, '')}`}
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '5px',
                          padding: '5px 10px',
                          borderRadius: '8px',
                          backgroundColor: '#ffffff',
                          border: '1px solid #ebd9c8',
                          color: '#b3471c',
                          fontWeight: 700,
                          fontSize: '0.84rem',
                          textDecoration: 'none',
                        }}
                      >
                        <Phone size={13} />
                        <span>{selectedStore.phone}</span>
                      </a>
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '6px', borderTop: '1px solid #ebd9c8', paddingTop: '8px' }}>
                      <div style={{ display: 'flex', alignItems: 'flex-start', gap: '6px', fontSize: '0.82rem', color: '#4b5563' }}>
                        <MapPin size={14} style={{ color: '#b3471c', flexShrink: 0, marginTop: '2px' }} />
                        <div>
                          <span style={{ fontWeight: 600, color: '#111827' }}>{selectedStore.address}</span>
                          {selectedStore.access && (
                            <span style={{ color: '#6b7280', fontSize: '0.76rem', display: 'block' }}>{selectedStore.access}</span>
                          )}
                        </div>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'flex-start', gap: '6px', fontSize: '0.82rem', color: '#4b5563' }}>
                        <Clock size={14} style={{ color: '#15803d', flexShrink: 0, marginTop: '2px' }} />
                        <div>
                          <span style={{ fontWeight: 700, color: '#15803d' }}>{selectedStore.hours}</span>
                          {selectedStore.holiday && (
                            <span style={{ color: '#6b7280', fontSize: '0.76rem', display: 'block' }}>定休日: {selectedStore.holiday}</span>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* Step 2: Date, Time, Guests & Plan */}
              <div>
                <label style={{ fontSize: '0.92rem', fontWeight: 800, color: '#1f1612', display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '10px' }}>
                  <span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: '22px', height: '22px', borderRadius: '50%', backgroundColor: '#b3471c', color: '#fff', fontSize: '0.78rem', fontWeight: 800 }}>2</span>
                  ご来店日時・人数
                  <span style={{ color: '#b3471c', fontSize: '0.82rem' }}>*</span>
                </label>

                {/* Date & Time Row */}
                <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr', gap: '12px', marginBottom: '10px' }}>
                  <div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
                      <span style={{ fontSize: '0.8rem', fontWeight: 700, color: '#4b5563' }}>日付</span>
                      <div style={{ display: 'flex', gap: '4px' }}>
                        <button
                          type="button"
                          onClick={() => setPresetDate(0)}
                          style={chipStyle}
                        >
                          今日
                        </button>
                        <button
                          type="button"
                          onClick={() => setPresetDate(1)}
                          style={chipStyle}
                        >
                          明日
                        </button>
                        <button
                          type="button"
                          onClick={() => setPresetDate(2)}
                          style={chipStyle}
                        >
                          明後日
                        </button>
                      </div>
                    </div>
                    <div style={{ position: 'relative' }}>
                      <input
                        required
                        type="date"
                        min={minDate}
                        value={date}
                        onChange={e => setDate(e.target.value)}
                        style={inputStyle}
                      />
                    </div>
                  </div>

                  <div>
                    <span style={{ display: 'block', fontSize: '0.8rem', fontWeight: 700, color: '#4b5563', marginBottom: '4px' }}>時間</span>
                    <select
                      required
                      value={time}
                      onChange={e => setTime(e.target.value)}
                      style={{ ...inputStyle, backgroundColor: '#fff', cursor: 'pointer' }}
                    >
                      <optgroup label="☀️ ランチ">
                        <option value="11:30">11:30</option>
                        <option value="12:00">12:00</option>
                        <option value="12:30">12:30</option>
                        <option value="13:00">13:00</option>
                        <option value="13:30">13:30</option>
                        <option value="14:00">14:00</option>
                      </optgroup>
                      <optgroup label="🌙 ディナー">
                        <option value="17:00">17:00</option>
                        <option value="17:30">17:30</option>
                        <option value="18:00">18:00</option>
                        <option value="18:30">18:30</option>
                        <option value="19:00">19:00</option>
                        <option value="19:30">19:30</option>
                        <option value="20:00">20:00</option>
                        <option value="20:30">20:30</option>
                        <option value="21:00">21:00</option>
                      </optgroup>
                    </select>
                  </div>
                </div>

                {/* Holiday Warning Notice */}
                {isSelectedStoreHoliday && (
                  <div style={{ marginBottom: '12px', padding: '9px 13px', borderRadius: '10px', backgroundColor: '#fef2f2', border: '1px solid #fecaca', color: '#b91c1c', fontSize: '0.8rem', display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <Info size={16} style={{ flexShrink: 0 }} />
                    <span>
                      選択された日時は<strong>{selectedStore.name}</strong>の定休日（{selectedStore.holiday}）の可能性があります。リクエスト送信後、店舗より確認のご連絡を差し上げます。
                    </span>
                  </div>
                )}

                {/* Guests selector pills */}
                <div style={{ marginBottom: '12px' }}>
                  <span style={{ display: 'block', fontSize: '0.8rem', fontWeight: 700, color: '#4b5563', marginBottom: '6px' }}>ご来店人数</span>
                  <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                    {['1', '2', '3', '4', '5', '6', '7', '8+'].map(g => {
                      const isSel = guests === g || (g === '8+' && parseInt(guests, 10) >= 8);
                      return (
                        <button
                          key={g}
                          type="button"
                          onClick={() => setGuests(g === '8+' ? '8' : g)}
                          style={{
                            padding: '6px 14px',
                            borderRadius: '8px',
                            border: isSel ? '2px solid #b3471c' : '1px solid #d1d5db',
                            backgroundColor: isSel ? '#b3471c' : '#fff',
                            color: isSel ? '#ffffff' : '#374151',
                            fontWeight: 700,
                            fontSize: '0.86rem',
                            cursor: 'pointer',
                            transition: 'all 0.15s',
                          }}
                        >
                          {g === '8+' ? '8名様以上' : `${g}名様`}
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Dining Type Pills */}
                <div>
                  <span style={{ display: 'block', fontSize: '0.8rem', fontWeight: 700, color: '#4b5563', marginBottom: '6px' }}>ご予約プラン・目的</span>
                  <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                    {DINING_TYPES.map(type => {
                      const isSel = diningType === type;
                      return (
                        <button
                          key={type}
                          type="button"
                          onClick={() => setDiningType(type)}
                          style={{
                            padding: '5px 12px',
                            borderRadius: '20px',
                            border: isSel ? '1px solid #b3471c' : '1px solid #e5e7eb',
                            backgroundColor: isSel ? '#faede2' : '#f9fafb',
                            color: isSel ? '#b3471c' : '#4b5563',
                            fontWeight: isSel ? 700 : 500,
                            fontSize: '0.8rem',
                            cursor: 'pointer',
                          }}
                        >
                          {type}
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>

              {/* Step 3: Customer Information */}
              <div>
                <label style={{ fontSize: '0.92rem', fontWeight: 800, color: '#1f1612', display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '10px' }}>
                  <span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: '22px', height: '22px', borderRadius: '50%', backgroundColor: '#b3471c', color: '#fff', fontSize: '0.78rem', fontWeight: 800 }}>3</span>
                  お客様情報・ご要望
                </label>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                    <div>
                      <span style={{ display: 'block', fontSize: '0.8rem', fontWeight: 700, color: '#4b5563', marginBottom: '4px' }}>お名前 <span style={{ color: '#b3471c' }}>*</span></span>
                      <input
                        required
                        type="text"
                        value={name}
                        onChange={e => setName(e.target.value)}
                        placeholder="山田 太郎"
                        style={inputStyle}
                      />
                    </div>
                    <div>
                      <span style={{ display: 'block', fontSize: '0.8rem', fontWeight: 700, color: '#4b5563', marginBottom: '4px' }}>電話番号 <span style={{ color: '#b3471c' }}>*</span></span>
                      <input
                        required
                        type="tel"
                        value={phone}
                        onChange={e => setPhone(e.target.value)}
                        placeholder="090-1234-5678"
                        style={inputStyle}
                      />
                    </div>
                  </div>

                  <div>
                    <span style={{ display: 'block', fontSize: '0.8rem', fontWeight: 700, color: '#4b5563', marginBottom: '4px' }}>メールアドレス <span style={{ color: '#b3471c' }}>*</span></span>
                    <input
                      required
                      type="email"
                      value={email}
                      onChange={e => setEmail(e.target.value)}
                      placeholder="taro@example.com"
                      style={inputStyle}
                    />
                  </div>

                  <div>
                    <span style={{ display: 'block', fontSize: '0.8rem', fontWeight: 700, color: '#4b5563', marginBottom: '4px' }}>ご要望・アレルギー・記念日など（任意）</span>
                    <textarea
                      rows={2}
                      value={message}
                      onChange={e => setMessage(e.target.value)}
                      placeholder="アレルギー、お子様連れ、記念日プレート希望などございましたらご記入ください"
                      style={{ ...inputStyle, resize: 'vertical' }}
                    />
                  </div>
                </div>
              </div>

              {/* Notice & Submit Bar */}
              <div style={{ borderTop: '1px solid #f3f4f6', paddingTop: '16px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', backgroundColor: '#fefce8', border: '1px solid #fef08a', borderRadius: '10px', padding: '10px 14px', marginBottom: '14px', fontSize: '0.8rem', color: '#854d0e' }}>
                  <Info size={16} style={{ flexShrink: 0 }} />
                  <span>
                    送信後、店舗よりお電話またはメールにて予約確定のご連絡を差し上げます。当日の混雑状況によりご希望に添えない場合がございます。
                  </span>
                </div>

                <button
                  type="submit"
                  disabled={submitting}
                  style={{
                    width: '100%',
                    padding: '16px 24px',
                    borderRadius: '12px',
                    border: 'none',
                    background: 'linear-gradient(135deg, #b3471c 0%, #d97706 100%)',
                    color: '#ffffff',
                    fontWeight: 800,
                    fontSize: '1.05rem',
                    cursor: submitting ? 'not-allowed' : 'pointer',
                    boxShadow: '0 4px 16px rgba(179, 71, 28, 0.35)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '10px',
                    transition: 'all 0.2s ease',
                    opacity: submitting ? 0.7 : 1,
                  }}
                  onMouseOver={e => {
                    if (!submitting) e.currentTarget.style.transform = 'translateY(-1px)';
                  }}
                  onMouseOut={e => {
                    if (!submitting) e.currentTarget.style.transform = 'translateY(0)';
                  }}
                >
                  {submitting ? (
                    <span>送信中...</span>
                  ) : (
                    <>
                      <span>{selectedStore.name}の席を予約する</span>
                      <ChevronRight size={18} />
                    </>
                  )}
                </button>
              </div>

            </form>
          )}
        </div>
      </div>
    </div>
  );
}

const inputStyle: React.CSSProperties = {
  width: '100%',
  padding: '11px 14px',
  borderRadius: '10px',
  border: '1px solid #d1d5db',
  fontSize: '0.92rem',
  color: '#111827',
  backgroundColor: '#f9fafb',
  outline: 'none',
  boxSizing: 'border-box',
  fontFamily: 'inherit',
  transition: 'border-color 0.15s, background-color 0.15s',
};

const chipStyle: React.CSSProperties = {
  padding: '2px 8px',
  fontSize: '0.72rem',
  fontWeight: 600,
  borderRadius: '4px',
  border: '1px solid #e5e7eb',
  backgroundColor: '#f3f4f6',
  color: '#4b5563',
  cursor: 'pointer',
};
