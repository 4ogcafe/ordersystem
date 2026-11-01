import React, { useState, useEffect } from 'react';
import { toast } from 'react-hot-toast';
import { Phone, Mail, Globe, Clock, PartyPopper, Send, CheckCircle2, ArrowRight } from 'lucide-react';
import { apiFetch, errorMessage, getPublic } from '../lib/api';
import { DEFAULT_STORE_LOCATIONS, type StoreLocation } from '../lib/stores';
import { useCustomer } from '../lib/customer-context';
import ReservationModal from '../components/ReservationModal';

export default function Contact() {
  const { customer } = useCustomer();
  const [stores, setStores] = useState<StoreLocation[]>(DEFAULT_STORE_LOCATIONS);
  const [settings, setSettings] = useState<any>({});
  const [submitted, setSubmitted] = useState(false);
  const [loading, setLoading] = useState(false);
  const [isReservationModalOpen, setIsReservationModalOpen] = useState(false);

  const [formData, setFormData] = useState({
    name: '',
    email: '',
    subject: '一般のお問い合わせ',
    preferredStoreId: '',
    message: '',
    website: '', // Honeypot anti-spam
  });

  // Auto-fill logged-in customer info
  useEffect(() => {
    if (customer) {
      setFormData(prev => ({
        ...prev,
        name: prev.name || customer.name || '',
        email: prev.email || customer.email || '',
      }));
    }
  }, [customer]);

  // Fetch settings & stores dynamically
  useEffect(() => {
    getPublic<any>('/api/v1/settings')
      .then(data => setSettings(data || {}))
      .catch(console.error);

    getPublic<StoreLocation[]>('/api/v1/stores')
      .then(data => {
        if (Array.isArray(data) && data.length > 0) {
          setStores(data);
        }
      })
      .catch(console.error);
  }, []);

  const handleChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>
  ) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!formData.name.trim()) {
      toast.error('お名前を入力してください');
      return;
    }
    if (!formData.email.trim()) {
      toast.error('メールアドレスを入力してください');
      return;
    }
    if (!formData.message.trim()) {
      toast.error('お問い合わせ内容を入力してください');
      return;
    }

    setLoading(true);
    try {
      const selectedStore = stores.find(s => s.id === formData.preferredStoreId);

      // Determine contact type from subject
      let contactType = 'GENERAL';
      const subjLower = (formData.subject || '').toLowerCase();
      if (subjLower.includes('reserv') || subjLower.includes('予約')) {
        contactType = 'RESERVATION';
      } else if (subjLower.includes('cater') || subjLower.includes('event') || subjLower.includes('イベント') || subjLower.includes('貸切')) {
        contactType = 'CATERING';
      } else if (subjLower.includes('feed') || subjLower.includes('感想') || subjLower.includes('意見')) {
        contactType = 'FEEDBACK';
      }

      // Format clean structured message for admin dashboard
      const structuredMessage = [
        formData.subject.trim() ? `【件名: ${formData.subject.trim()}】` : '',
        selectedStore ? `【ご希望店舗: No.${selectedStore.number} ${selectedStore.name}】` : '',
        selectedStore ? `【店舗住所: ${selectedStore.address} (TEL: ${selectedStore.phone})】` : '',
        `【お問い合わせ内容】:\n${formData.message.trim()}`,
      ]
        .filter(Boolean)
        .join('\n');

      const res = await apiFetch('/api/v1/contact', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: formData.name.trim(),
          email: formData.email.trim(),
          type: contactType,
          message: structuredMessage,
          website: formData.website, // honeypot
        }),
      });

      if (res.ok) {
        setSubmitted(true);
        toast.success('メッセージを送信しました。24時間以内にご返信いたします。');
      } else {
        toast.error(await errorMessage(res, '送信に失敗しました。'));
      }
    } catch {
      toast.error('通信エラーが発生しました。ネットワーク接続をご確認ください。');
    } finally {
      setLoading(false);
    }
  };

  const handleReset = () => {
    setSubmitted(false);
    setFormData({
      name: customer?.name || '',
      email: customer?.email || '',
      subject: '一般のお問い合わせ',
      preferredStoreId: '',
      message: '',
      website: '',
    });
  };

  const mainPhone = settings.phone || '0422-36-2210';
  const mainEmail = settings.email || 'info@adarsha.jp';
  const eventPhone = settings.eventPhone || '0422-36-2220';
  const eventEmail = settings.eventEmail || 'events@adarsha.jp';
  const receptionHours = settings.receptionHours || '平日 10:00〜18:00';
  const websiteUrl = settings.websiteUrl || 'www.pnglike.com';

  const socialLinks = [
    { label: 'Facebook', icon: '📘', url: settings.facebookUrl || 'https://facebook.com' },
    { label: 'Instagram', icon: '📸', url: settings.instagramUrl || 'https://instagram.com' },
    { label: 'Twitter / X', icon: '🐦', url: settings.twitterUrl || 'https://twitter.com' },
    { label: 'YouTube', icon: '▶️', url: settings.youtubeUrl || 'https://youtube.com' },
  ];

  const faqItems = [
    {
      icon: '🍽️',
      question: '予約は必要ですか？',
      answer:
        '予約なしでのご来店も大歓迎です。6名様以上のグループの場合は、お席を確保するため事前にお電話いただくことをお勧めします。',
    },
    {
      icon: '🫓',
      question: 'ナンは本当に食べ放題ですか？',
      answer:
        'はい！ランチタイム（11:00〜16:30）は、すべてのカレーセットにタンドールで焼きたてのナン食べ放題が含まれています。',
    },
    {
      icon: '🎉',
      question: '大規模なイベントのケータリングは可能ですか？',
      answer: `もちろん可能です。パーティー、法人イベント、結婚式などのケータリングパッケージをご用意しております。${eventEmail} までお問い合わせください。`,
    },
    {
      icon: '🥗',
      question: 'ベジタリアンやヴィーガンのメニューはありますか？',
      answer:
        'はい。多くのメニューがベジタリアン対応で、調整も可能です。食事制限がある場合はスタッフにお申し付けください。',
    },
    {
      icon: '📦',
      question: 'テイクアウトは全店舗で利用できますか？',
      answer:
        'はい、全店舗でテイクアウトが可能です。大量注文の場合は30分前までにお電話いただくことをお勧めします。',
    },
  ];

  return (
    <main style={{ backgroundColor: '#fdfbf7', minHeight: '100vh', color: '#261c14' }}>
      <title>お問い合わせ・ご予約 | Adarsha (アダルサ) 熊谷</title>
      <meta
        name="description"
        content="アダルサへのお問い合わせ、お席のご予約・ケータリング・貸切のご相談はこちらから承ります。お電話（048-514-8386）またはWEBフォームより受付中。"
      />
      <link rel="canonical" href="https://pnglike.com/contact" />
      <meta property="og:title" content="お問い合わせ・ご予約 | Adarsha (アダルサ) 熊谷" />
      <meta property="og:description" content="アダルサへのお問い合わせ、お席のご予約・ケータリング・貸切のご相談はこちらから承ります。お電話またはWEBフォームより受付中。" />
      <meta property="og:type" content="website" />
      <meta property="og:url" content="https://pnglike.com/contact" />
      <meta property="og:image" content="https://pnglike.com/bg-hero-img.webp" />
      <meta name="twitter:card" content="summary_large_image" />
      <meta name="twitter:title" content="お問い合わせ・ご予約 | Adarsha (アダルサ)" />
      <meta name="twitter:description" content="アダルサへのお問い合わせ、ご予約・ケータリング・貸切のご相談はこちらから承ります。" />
      <meta name="twitter:image" content="https://pnglike.com/bg-hero-img.webp" />

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
                'name': 'お問い合わせ',
                'item': 'https://pnglike.com/contact'
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
            '@type': 'ContactPage',
            '@id': 'https://pnglike.com/contact#webpage',
            'url': 'https://pnglike.com/contact',
            'name': 'お問い合わせ・ご予約 | Adarsha (アダルサ)',
            'description': 'アダルサへのお問い合わせ、ご予約・ケータリング・貸切のご相談ページ。',
            'mainEntity': {
              '@type': 'Restaurant',
              '@id': 'https://pnglike.com/#restaurant',
              'name': 'Adarsha (アダルサ)',
              'telephone': '048-514-8386'
            }
          })
        }}
      />

      <div
        style={{
          maxWidth: '1200px',
          margin: '0 auto',
          padding: '36px 20px 70px',
          boxSizing: 'border-box',
        }}
      >
        {/* ================= 最上部: お席のご予約 SECTION ================= */}
        <div style={{ marginBottom: '50px' }}>
          {/* Section Header */}
          <div style={{ textAlign: 'center', marginBottom: '24px' }}>
            <div
              style={{
                fontSize: '0.78rem',
                fontWeight: 700,
                color: '#c4521f',
                letterSpacing: '0.14em',
                marginBottom: '4px',
              }}
            >
              ご予約
            </div>
            <h2
              style={{
                fontSize: 'clamp(1.85rem, 3.2vw, 2.3rem)',
                fontWeight: 800,
                color: '#1f1612',
                margin: '0 0 8px 0',
                lineHeight: 1.2,
                letterSpacing: '0.02em',
              }}
            >
              お席の
              <span
                style={{
                  fontFamily: "Georgia, 'Times New Roman', serif",
                  fontStyle: 'italic',
                  color: '#c4521f',
                  fontWeight: 700,
                  marginLeft: '4px',
                }}
              >
                ご予約
              </span>
            </h2>
            <div
              style={{
                width: '40px',
                height: '3px',
                backgroundColor: '#c4521f',
                borderRadius: '2px',
                margin: '8px auto 12px',
              }}
            />
            <p
              style={{
                color: '#6b5d52',
                fontSize: '0.94rem',
                lineHeight: 1.55,
                maxWidth: '600px',
                margin: '0 auto',
                fontWeight: 500,
              }}
            >
              特別な日のお食事や、グループでのご利用に。お電話またはオンラインでご予約を承っております。
            </p>
          </div>

          {/* Grid Layout: Left Store Phone Cards (takes remaining space) + Right Online Reservation Card (compact) */}
          <div
            style={{
              display: 'flex',
              flexWrap: 'wrap',
              gap: '20px',
              alignItems: 'flex-start',
            }}
          >
            {/* Left Box: 各店舗へのお電話予約 */}
            <div
              style={{
                backgroundColor: '#ffffff',
                borderRadius: '20px',
                padding: '24px 22px',
                border: '1px solid #ebdcd0',
                boxShadow: '0 4px 20px rgba(0, 0, 0, 0.03)',
                flex: '1 1 580px',
                minWidth: '320px',
              }}
            >
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  marginBottom: '16px',
                }}
              >
                <Phone size={20} style={{ color: '#b3471c' }} />
                <h3
                  style={{
                    margin: 0,
                    fontSize: '1.2rem',
                    fontWeight: 800,
                    color: '#261c14',
                  }}
                >
                  各店舗へのお電話予約
                </h3>
              </div>

              {/* 2-column Store Grid */}
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))',
                  gap: '10px',
                }}
              >
                {stores.map(store => {
                  const areaTag = store.area ? store.area.split('・')[0] : '店舗';
                  return (
                    <div
                      key={store.id}
                      style={{
                        backgroundColor: '#fdfbf7',
                        border: '1px solid #ebd9c8',
                        borderRadius: '12px',
                        padding: '12px 14px',
                        transition: 'all 0.18s ease',
                      }}
                      onMouseOver={e => {
                        e.currentTarget.style.borderColor = '#b3471c';
                        e.currentTarget.style.boxShadow = '0 3px 10px rgba(179, 71, 28, 0.1)';
                      }}
                      onMouseOut={e => {
                        e.currentTarget.style.borderColor = '#ebd9c8';
                        e.currentTarget.style.boxShadow = 'none';
                      }}
                    >
                      <div
                        style={{
                          fontSize: '0.74rem',
                          fontWeight: 800,
                          color: '#b3471c',
                          marginBottom: '2px',
                        }}
                      >
                        {areaTag}
                      </div>
                      <div
                        style={{
                          fontSize: '0.94rem',
                          fontWeight: 800,
                          color: '#1f1612',
                          marginBottom: '6px',
                          lineHeight: 1.3,
                        }}
                      >
                        {store.name}
                      </div>
                      <div
                        style={{
                          width: '20px',
                          height: '2px',
                          backgroundColor: '#c4521f',
                          borderRadius: '2px',
                          marginBottom: '6px',
                        }}
                      />
                      <div
                        style={{
                          fontSize: '0.8rem',
                          color: '#5c4e43',
                          display: 'flex',
                          alignItems: 'baseline',
                          gap: '5px',
                        }}
                      >
                        <span style={{ fontWeight: 700 }}>TEL:</span>
                        <a
                          href={`tel:${store.phone.replace(/[^0-9]/g, '')}`}
                          style={{
                            fontWeight: 800,
                            fontSize: '0.98rem',
                            color: '#1f1612',
                            textDecoration: 'none',
                          }}
                        >
                          {store.phone}
                        </a>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Right Box: オンライン予約 (Compact height & width) */}
            <div
              style={{
                backgroundColor: '#ffffff',
                borderRadius: '20px',
                padding: '36px 26px',
                border: '1px solid #ebdcd0',
                boxShadow: '0 4px 20px rgba(0, 0, 0, 0.03)',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                textAlign: 'center',
                flex: '0 0 280px',
                minWidth: '260px',
                boxSizing: 'border-box',
              }}
            >
              <div
                style={{
                  width: '52px',
                  height: '52px',
                  borderRadius: '14px',
                  backgroundColor: '#fbf8f5',
                  border: '1px solid #ebd9c8',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: '24px',
                  marginBottom: '14px',
                  boxShadow: '0 2px 6px rgba(0, 0, 0, 0.03)',
                }}
              >
                📱
              </div>

              <h3
                style={{
                  fontSize: '1.28rem',
                  fontWeight: 800,
                  color: '#261c14',
                  margin: '0 0 10px 0',
                }}
              >
                オンライン予約
              </h3>

              <p
                style={{
                  color: '#6b5d52',
                  fontSize: '0.86rem',
                  lineHeight: 1.6,
                  margin: '0 0 22px 0',
                  maxWidth: '230px',
                }}
              >
                24時間いつでもWebからご予約いただけます。即時に確認メールをお送りします。
              </p>

              <button
                type="button"
                onClick={() => setIsReservationModalOpen(true)}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '8px',
                  backgroundColor: '#b3471c',
                  color: '#ffffff',
                  border: 'none',
                  padding: '13px 22px',
                  borderRadius: '8px',
                  fontWeight: 800,
                  fontSize: '0.94rem',
                  cursor: 'pointer',
                  boxShadow: '0 6px 18px rgba(179, 71, 28, 0.25)',
                  transition: 'all 0.2s ease',
                  width: '100%',
                }}
                onMouseOver={e => {
                  e.currentTarget.style.backgroundColor = '#9c3c16';
                  e.currentTarget.style.transform = 'translateY(-1px)';
                }}
                onMouseOut={e => {
                  e.currentTarget.style.backgroundColor = '#b3471c';
                  e.currentTarget.style.transform = 'none';
                }}
              >
                <span>今すぐ席を予約</span>
                <ArrowRight size={16} />
              </button>
            </div>
          </div>
        </div>

        {/* ================= 中央部: 代表窓口 & メッセージフォーム ================= */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))',
            gap: '32px 40px',
            alignItems: 'start',
          }}
        >
          {/* ================= 左カラム: 代表窓口・お問い合わせ案内 ================= */}
          <div style={{ maxWidth: '520px' }}>
            {/* Tagline */}
            <div
              style={{
                fontSize: '0.78rem',
                fontWeight: 800,
                color: '#c4521f',
                letterSpacing: '0.14em',
                textTransform: 'uppercase',
                marginBottom: '10px',
              }}
            >
              代表窓口・メインオフィス
            </div>

            {/* Heading */}
            <h1
              style={{
                fontSize: 'clamp(2.1rem, 4vw, 2.75rem)',
                fontWeight: 800,
                color: '#1f1612',
                margin: '0 0 16px 0',
                lineHeight: 1.25,
                letterSpacing: '-0.01em',
              }}
            >
              お気軽に、
              <span
                style={{
                  fontFamily: "Georgia, 'Times New Roman', serif",
                  fontStyle: 'italic',
                  color: '#c4521f',
                  fontWeight: 700,
                }}
              >
                お問い合わせください。
              </span>
            </h1>

            {/* Orange Accent Underline Bar */}
            <div
              style={{
                width: '46px',
                height: '3.5px',
                backgroundColor: '#c4521f',
                borderRadius: '2px',
                marginBottom: '36px',
              }}
            />

            {/* Group 1: 一般のお問い合わせ */}
            <div style={{ marginBottom: '36px' }}>
              <h2
                style={{
                  fontSize: '1.25rem',
                  fontWeight: 700,
                  color: '#261c14',
                  margin: '0 0 18px 0',
                  paddingBottom: '12px',
                  borderBottom: '1px solid #ebdcd0',
                }}
              >
                一般のお問い合わせ
              </h2>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '18px' }}>
                {/* Main Phone */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                  <div
                    style={{
                      width: '44px',
                      height: '44px',
                      borderRadius: '50%',
                      backgroundColor: '#faede2',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      flexShrink: 0,
                    }}
                  >
                    <Phone size={19} style={{ color: '#b3471c' }} />
                  </div>
                  <div>
                    <div
                      style={{
                        fontSize: '0.72rem',
                        fontWeight: 800,
                        color: '#b3471c',
                        letterSpacing: '0.08em',
                        marginBottom: '2px',
                      }}
                    >
                      代表電話番号
                    </div>
                    <a
                      href={`tel:${mainPhone.replace(/[^0-9]/g, '')}`}
                      style={{
                        fontSize: '1rem',
                        fontWeight: 600,
                        color: '#261c14',
                        textDecoration: 'none',
                      }}
                    >
                      {mainPhone}
                    </a>
                  </div>
                </div>

                {/* Main Email */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                  <div
                    style={{
                      width: '44px',
                      height: '44px',
                      borderRadius: '50%',
                      backgroundColor: '#faede2',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      flexShrink: 0,
                    }}
                  >
                    <Mail size={19} style={{ color: '#b3471c' }} />
                  </div>
                  <div>
                    <div
                      style={{
                        fontSize: '0.72rem',
                        fontWeight: 800,
                        color: '#b3471c',
                        letterSpacing: '0.08em',
                        marginBottom: '2px',
                      }}
                    >
                      代表メールアドレス
                    </div>
                    <a
                      href={`mailto:${mainEmail}`}
                      style={{
                        fontSize: '1rem',
                        fontWeight: 600,
                        color: '#261c14',
                        textDecoration: 'none',
                      }}
                    >
                      {mainEmail}
                    </a>
                  </div>
                </div>

                {/* Website */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                  <div
                    style={{
                      width: '44px',
                      height: '44px',
                      borderRadius: '50%',
                      backgroundColor: '#faede2',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      flexShrink: 0,
                    }}
                  >
                    <Globe size={19} style={{ color: '#0284c7' }} />
                  </div>
                  <div>
                    <div
                      style={{
                        fontSize: '0.72rem',
                        fontWeight: 800,
                        color: '#b3471c',
                        letterSpacing: '0.08em',
                        marginBottom: '2px',
                      }}
                    >
                      公式ウェブサイト
                    </div>
                    <a
                      href={`https://${websiteUrl.replace(/^https?:\/\//, '')}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      style={{
                        fontSize: '1rem',
                        fontWeight: 600,
                        color: '#261c14',
                        textDecoration: 'none',
                      }}
                    >
                      {websiteUrl}
                    </a>
                  </div>
                </div>

                {/* Reception Hours */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                  <div
                    style={{
                      width: '44px',
                      height: '44px',
                      borderRadius: '50%',
                      backgroundColor: '#faede2',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      flexShrink: 0,
                    }}
                  >
                    <Clock size={19} style={{ color: '#78716c' }} />
                  </div>
                  <div>
                    <div
                      style={{
                        fontSize: '0.72rem',
                        fontWeight: 800,
                        color: '#b3471c',
                        letterSpacing: '0.08em',
                        marginBottom: '2px',
                      }}
                    >
                      受付時間
                    </div>
                    <div style={{ fontSize: '1rem', fontWeight: 600, color: '#261c14' }}>
                      {receptionHours}
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Group 2: ケータリング・貸切イベント */}
            <div style={{ marginBottom: '36px' }}>
              <h2
                style={{
                  fontSize: '1.25rem',
                  fontWeight: 700,
                  color: '#261c14',
                  margin: '0 0 18px 0',
                  paddingBottom: '12px',
                  borderBottom: '1px solid #ebdcd0',
                }}
              >
                ケータリング・貸切イベント
              </h2>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '18px' }}>
                {/* Event Hotline */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                  <div
                    style={{
                      width: '44px',
                      height: '44px',
                      borderRadius: '50%',
                      backgroundColor: '#faede2',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      flexShrink: 0,
                    }}
                  >
                    <PartyPopper size={19} style={{ color: '#d97706' }} />
                  </div>
                  <div>
                    <div
                      style={{
                        fontSize: '0.72rem',
                        fontWeight: 800,
                        color: '#b3471c',
                        letterSpacing: '0.08em',
                        marginBottom: '2px',
                      }}
                    >
                      イベント・ケータリング専用ダイヤル
                    </div>
                    <a
                      href={`tel:${eventPhone.replace(/[^0-9]/g, '')}`}
                      style={{
                        fontSize: '1rem',
                        fontWeight: 600,
                        color: '#261c14',
                        textDecoration: 'none',
                      }}
                    >
                      {eventPhone}
                    </a>
                  </div>
                </div>

                {/* Event Email */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                  <div
                    style={{
                      width: '44px',
                      height: '44px',
                      borderRadius: '50%',
                      backgroundColor: '#faede2',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      flexShrink: 0,
                    }}
                  >
                    <Mail size={19} style={{ color: '#b3471c' }} />
                  </div>
                  <div>
                    <div
                      style={{
                        fontSize: '0.72rem',
                        fontWeight: 800,
                        color: '#b3471c',
                        letterSpacing: '0.08em',
                        marginBottom: '2px',
                      }}
                    >
                      イベント専用メールアドレス
                    </div>
                    <a
                      href={`mailto:${eventEmail}`}
                      style={{
                        fontSize: '1rem',
                        fontWeight: 600,
                        color: '#261c14',
                        textDecoration: 'none',
                      }}
                    >
                      {eventEmail}
                    </a>
                  </div>
                </div>
              </div>
            </div>

            {/* Group 3: 公式SNSアカウント */}
            <div>
              <h2
                style={{
                  fontSize: '1.25rem',
                  fontWeight: 700,
                  color: '#261c14',
                  margin: '0 0 16px 0',
                }}
              >
                公式SNSアカウント
              </h2>

              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px' }}>
                {socialLinks.map(s => (
                  <a
                    key={s.label}
                    href={s.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '8px',
                      padding: '9px 16px',
                      backgroundColor: '#ffffff',
                      border: '1px solid #ebdcd0',
                      borderRadius: '8px',
                      color: '#261c14',
                      fontSize: '0.86rem',
                      fontWeight: 600,
                      textDecoration: 'none',
                      boxShadow: '0 1px 3px rgba(0, 0, 0, 0.03)',
                      transition: 'all 0.18s ease',
                    }}
                    onMouseOver={e => {
                      e.currentTarget.style.borderColor = '#c4521f';
                      e.currentTarget.style.transform = 'translateY(-1px)';
                      e.currentTarget.style.boxShadow = '0 3px 8px rgba(196, 82, 31, 0.12)';
                    }}
                    onMouseOut={e => {
                      e.currentTarget.style.borderColor = '#ebdcd0';
                      e.currentTarget.style.transform = 'none';
                      e.currentTarget.style.boxShadow = '0 1px 3px rgba(0, 0, 0, 0.03)';
                    }}
                  >
                    <span>{s.icon}</span>
                    <span>{s.label}</span>
                  </a>
                ))}
              </div>
            </div>
          </div>

          {/* ================= 右カラム: メッセージ送信カード ================= */}
          <div
            style={{
              backgroundColor: '#ffffff',
              borderRadius: '24px',
              padding: '44px',
              boxShadow: '0 18px 50px rgba(0, 0, 0, 0.05)',
              border: '1px solid #f0e6dc',
            }}
          >
            <h2
              style={{
                fontFamily: "'Inter', 'Noto Sans JP', sans-serif",
                fontSize: '1.85rem',
                fontWeight: 800,
                color: '#261c14',
                margin: '0 0 8px 0',
              }}
            >
              メッセージを送信
            </h2>
            <p
              style={{
                color: '#6b5d52',
                fontSize: '0.92rem',
                lineHeight: 1.6,
                margin: '0 0 28px 0',
              }}
            >
              ご予約・ケータリング・貸切のご相談・ご意見など、お気軽にお問い合わせください。24時間以内に担当者よりご連絡いたします。
            </p>

            {submitted ? (
              <div
                style={{
                  padding: '36px 24px',
                  backgroundColor: '#fbf8f5',
                  borderRadius: '16px',
                  border: '1px solid #ebd9c8',
                  textAlign: 'center',
                }}
              >
                <div
                  style={{
                    width: '54px',
                    height: '54px',
                    borderRadius: '50%',
                    backgroundColor: '#ecfdf5',
                    color: '#059669',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    margin: '0 auto 16px',
                    boxShadow: '0 0 0 8px #f0fdf4',
                  }}
                >
                  <CheckCircle2 size={32} />
                </div>
                <h3 style={{ fontSize: '1.35rem', fontWeight: 800, color: '#111827', margin: '0 0 8px' }}>
                  メッセージを送信しました
                </h3>
                <p style={{ color: '#4b5563', fontSize: '0.92rem', lineHeight: 1.6, maxWidth: '440px', margin: '0 auto 20px' }}>
                  お問い合わせいただきありがとうございます。店舗担当者より内容を確認のうえ、24時間以内に折り返しご連絡を差し上げます。
                </p>
                <button
                  type="button"
                  onClick={handleReset}
                  style={{
                    padding: '11px 22px',
                    borderRadius: '8px',
                    backgroundColor: '#b3471c',
                    color: '#ffffff',
                    border: 'none',
                    fontWeight: 700,
                    fontSize: '0.9rem',
                    cursor: 'pointer',
                    boxShadow: '0 2px 8px rgba(179, 71, 28, 0.25)',
                  }}
                >
                  別のお問い合わせを送信する
                </button>
              </div>
            ) : (
              <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                {/* 行 1: お名前 & メールアドレス */}
                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
                    gap: '16px',
                  }}
                >
                  <div>
                    <label
                      htmlFor="contact-name"
                      style={{
                        display: 'block',
                        fontSize: '0.78rem',
                        fontWeight: 800,
                        letterSpacing: '0.04em',
                        color: '#4a3b32',
                        marginBottom: '6px',
                      }}
                    >
                      お名前 <span style={{ color: '#b3471c' }}>*</span>
                    </label>
                    <input
                      id="contact-name"
                      name="name"
                      required
                      type="text"
                      value={formData.name}
                      onChange={handleChange}
                      placeholder="山田 太郎"
                      style={fieldInputStyle}
                    />
                  </div>

                  <div>
                    <label
                      htmlFor="contact-email"
                      style={{
                        display: 'block',
                        fontSize: '0.78rem',
                        fontWeight: 800,
                        letterSpacing: '0.04em',
                        color: '#4a3b32',
                        marginBottom: '6px',
                      }}
                    >
                      メールアドレス <span style={{ color: '#b3471c' }}>*</span>
                    </label>
                    <input
                      id="contact-email"
                      name="email"
                      required
                      type="email"
                      value={formData.email}
                      onChange={handleChange}
                      placeholder="example@domain.com"
                      style={fieldInputStyle}
                    />
                  </div>
                </div>

                {/* 行 2: 件名 */}
                <div>
                  <label
                    htmlFor="contact-subject"
                    style={{
                      display: 'block',
                      fontSize: '0.78rem',
                      fontWeight: 800,
                      letterSpacing: '0.04em',
                      color: '#4a3b32',
                      marginBottom: '6px',
                    }}
                  >
                    件名
                  </label>
                  <input
                    id="contact-subject"
                    name="subject"
                    type="text"
                    value={formData.subject}
                    onChange={handleChange}
                    placeholder="一般のお問い合わせ"
                    style={fieldInputStyle}
                  />
                </div>

                {/* 行 3: ご来店・ご希望店舗 */}
                <div>
                  <label
                    htmlFor="contact-store"
                    style={{
                      display: 'block',
                      fontSize: '0.78rem',
                      fontWeight: 800,
                      letterSpacing: '0.04em',
                      color: '#4a3b32',
                      marginBottom: '6px',
                    }}
                  >
                    ご来店・ご希望店舗
                  </label>
                  <select
                    id="contact-store"
                    name="preferredStoreId"
                    value={formData.preferredStoreId}
                    onChange={handleChange}
                    style={{
                      ...fieldInputStyle,
                      backgroundColor: '#ffffff',
                      cursor: 'pointer',
                    }}
                  >
                    <option value="">— ご希望の店舗を選択してください —</option>
                    {stores.map(store => (
                      <option key={store.id} value={store.id}>
                        No.{store.number} {store.name} ({store.area || store.address})
                      </option>
                    ))}
                  </select>
                </div>

                {/* 行 4: お問い合わせ内容 */}
                <div>
                  <label
                    htmlFor="contact-message"
                    style={{
                      display: 'block',
                      fontSize: '0.78rem',
                      fontWeight: 800,
                      letterSpacing: '0.04em',
                      color: '#4a3b32',
                      marginBottom: '6px',
                    }}
                  >
                    お問い合わせ内容 <span style={{ color: '#b3471c' }}>*</span>
                  </label>
                  <textarea
                    id="contact-message"
                    name="message"
                    required
                    rows={5}
                    value={formData.message}
                    onChange={handleChange}
                    placeholder="ご質問やご要望をご入力ください..."
                    style={{
                      ...fieldInputStyle,
                      resize: 'vertical',
                      lineHeight: 1.5,
                      minHeight: '120px',
                    }}
                  />
                </div>

                {/* Honeypot hidden input */}
                <input
                  type="text"
                  name="website"
                  value={formData.website}
                  onChange={handleChange}
                  tabIndex={-1}
                  autoComplete="off"
                  aria-hidden="true"
                  style={{ position: 'absolute', left: '-9999px', width: '1px', height: '1px' }}
                />

                {/* 送信ボタン */}
                <button
                  type="submit"
                  disabled={loading}
                  style={{
                    backgroundColor: '#b3471c',
                    color: '#ffffff',
                    border: 'none',
                    padding: '16px 24px',
                    borderRadius: '8px',
                    fontWeight: 800,
                    fontSize: '0.96rem',
                    letterSpacing: '0.06em',
                    cursor: loading ? 'not-allowed' : 'pointer',
                    transition: 'all 0.2s ease',
                    boxShadow: '0 4px 14px rgba(179, 71, 28, 0.25)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '8px',
                    marginTop: '6px',
                    opacity: loading ? 0.7 : 1,
                  }}
                  onMouseOver={e => {
                    if (!loading) e.currentTarget.style.backgroundColor = '#9c3c16';
                  }}
                  onMouseOut={e => {
                    if (!loading) e.currentTarget.style.backgroundColor = '#b3471c';
                  }}
                >
                  <span>{loading ? '送信中...' : 'メッセージを送信する'}</span>
                  <Send size={16} />
                </button>
              </form>
            )}
          </div>
        </div>

        {/* ================= よくあるご質問 (FAQ SECTION) ================= */}
        <div style={{ marginTop: '50px', maxWidth: '880px', margin: '50px auto 0' }}>
          {/* Header */}
          <div style={{ textAlign: 'center', marginBottom: '22px' }}>
            <div
              style={{
                fontSize: '0.8rem',
                fontWeight: 700,
                color: '#c4521f',
                letterSpacing: '0.12em',
                marginBottom: '8px',
              }}
            >
              よくある質問
            </div>
            <h2
              style={{
                fontSize: 'clamp(2rem, 3.6vw, 2.5rem)',
                fontWeight: 800,
                color: '#1f1612',
                margin: '0 0 10px 0',
                lineHeight: 1.2,
                letterSpacing: '0.02em',
              }}
            >
              よくある
              <span
                style={{
                  fontFamily: "Georgia, 'Times New Roman', serif",
                  fontStyle: 'italic',
                  color: '#c4521f',
                  fontWeight: 700,
                  marginLeft: '4px',
                }}
              >
                ご質問
              </span>
            </h2>
            <div
              style={{
                width: '44px',
                height: '3.5px',
                backgroundColor: '#c4521f',
                borderRadius: '2px',
                margin: '12px auto 0',
              }}
            />
          </div>

          {/* FAQ Cards List */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
            {faqItems.map((faq, index) => (
              <div
                key={index}
                style={{
                  backgroundColor: '#ffffff',
                  borderRadius: '16px',
                  border: '1px solid #f0e6dc',
                  padding: '22px 26px',
                  boxShadow: '0 2px 10px rgba(0, 0, 0, 0.025)',
                  display: 'flex',
                  alignItems: 'flex-start',
                  gap: '18px',
                  transition: 'all 0.2s ease',
                }}
                onMouseOver={e => {
                  e.currentTarget.style.borderColor = '#c4521f';
                  e.currentTarget.style.boxShadow = '0 6px 20px rgba(196, 82, 31, 0.08)';
                  e.currentTarget.style.transform = 'translateY(-1px)';
                }}
                onMouseOut={e => {
                  e.currentTarget.style.borderColor = '#f0e6dc';
                  e.currentTarget.style.boxShadow = '0 2px 10px rgba(0, 0, 0, 0.025)';
                  e.currentTarget.style.transform = 'none';
                }}
              >
                {/* Icon Circle */}
                <div
                  style={{
                    width: '44px',
                    height: '44px',
                    borderRadius: '12px',
                    backgroundColor: '#faf7f2',
                    border: '1px solid #ebdcd0',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: '1.35rem',
                    flexShrink: 0,
                    marginTop: '2px',
                  }}
                >
                  {faq.icon}
                </div>

                {/* Question & Answer */}
                <div style={{ flex: 1 }}>
                  <h3
                    style={{
                      margin: '0 0 6px 0',
                      fontSize: '1.02rem',
                      fontWeight: 800,
                      color: '#1f1612',
                      lineHeight: 1.4,
                    }}
                  >
                    {faq.question}
                  </h3>
                  <p
                    style={{
                      margin: 0,
                      fontSize: '0.88rem',
                      color: '#5c4e43',
                      lineHeight: 1.65,
                    }}
                  >
                    {faq.answer}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Reservation Modal */}
      <ReservationModal
        isOpen={isReservationModalOpen}
        onClose={() => setIsReservationModalOpen(false)}
      />
    </main>
  );
}

const fieldInputStyle: React.CSSProperties = {
  width: '100%',
  padding: '13px 16px',
  borderRadius: '8px',
  border: '1px solid #ebdcd0',
  backgroundColor: '#fdfbf9',
  fontSize: '0.94rem',
  color: '#261c14',
  outline: 'none',
  boxSizing: 'border-box',
  transition: 'border-color 0.2s, background-color 0.2s',
  fontFamily: 'inherit',
};
