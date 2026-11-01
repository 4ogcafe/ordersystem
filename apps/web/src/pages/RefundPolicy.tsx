import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { RotateCcw, AlertTriangle, CheckCircle2, Clock, Phone, Mail, ArrowRight, ShoppingBag } from 'lucide-react';
import { getPublic } from '../lib/api';

interface RestaurantInfo {
  name?: string;
  addressJa?: string;
  phone?: string;
  email?: string;
}

export default function RefundPolicy() {
  const [info, setInfo] = useState<RestaurantInfo>({});
  const lastUpdated = '2026年10月1日 改定';

  useEffect(() => {
    getPublic<RestaurantInfo>('/api/v1/settings')
      .then(data => setInfo(data || {}))
      .catch(() => {});
  }, []);

  const restaurantName = info.name || '本格インド料理 アダルサ (Adarsha)';
  const phoneClean = info.phone ? info.phone.replace(/[^\d+]/g, '') : '';

  return (
    <main style={{ backgroundColor: '#faf7f2', minHeight: '100vh', color: '#1f2937' }}>
      <title>返金・キャンセルポリシー (特定商取引法に基づく表記) | Adarsha (アダルサ)</title>
      <meta name="description" content="本格インド料理アダルサの返金・キャンセルポリシーです。テイクアウト、デリバリー、お席のご予約に関するキャンセルや返金基準をご案内します。" />
      <link rel="canonical" href="https://pnglike.com/refund-policy" />
      <meta property="og:title" content="返金・キャンセルポリシー | Adarsha (アダルサ)" />
      <meta property="og:description" content="本格インド料理アダルサの返金・キャンセルポリシーです。" />
      <meta property="og:type" content="website" />
      <meta property="og:url" content="https://pnglike.com/refund-policy" />

      {/* Hero Header */}
      <div style={{
        background: 'linear-gradient(135deg, #1f2937 0%, #111827 100%)',
        color: '#fff',
        padding: 'clamp(3.5rem, 6vw, 5rem) 20px',
        textAlign: 'center',
        position: 'relative',
        overflow: 'hidden',
      }}>
        <div style={{
          position: 'absolute',
          inset: 0,
          background: 'radial-gradient(circle at 20% 80%, rgba(217, 119, 6, 0.18), transparent 50%)',
          pointerEvents: 'none',
        }} />
        <div style={{ maxWidth: '800px', margin: '0 auto', position: 'relative', zIndex: 1 }}>
          <div style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '6px',
            backgroundColor: 'rgba(217, 119, 6, 0.2)',
            color: '#fbbf24',
            border: '1px solid rgba(251, 191, 36, 0.3)',
            borderRadius: '9999px',
            padding: '4px 14px',
            fontSize: '0.85rem',
            fontWeight: 700,
            marginBottom: '1rem',
          }}>
            <RotateCcw size={16} /> Refund & Cancellation Policy
          </div>
          <h1 style={{
            fontSize: 'clamp(1.8rem, 4vw, 2.5rem)',
            fontWeight: 800,
            letterSpacing: '-0.5px',
            margin: '0 0 0.75rem',
          }}>
            返金・キャンセルポリシー
          </h1>
          <p style={{ color: '#d1d5db', fontSize: '0.95rem', margin: 0 }}>
            {restaurantName}（以下「当店」）では、お客様に常にできたての美味しいお料理を安心してお召し上がりいただけるよう、ご注文のキャンセルおよび返金に関して明確な基準を設けております。
          </p>
          <div style={{ marginTop: '1rem', fontSize: '0.82rem', color: '#9ca3af' }}>
            最終更新日: {lastUpdated}
          </div>
        </div>
      </div>

      {/* Urgent Notice Banner */}
      <div style={{ maxWidth: '860px', margin: '0 auto', padding: '2rem 20px 0' }}>
        <div style={{
          backgroundColor: '#fffbeb',
          border: '1.5px solid #fde68a',
          borderRadius: '12px',
          padding: '16px 20px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: '16px',
          flexWrap: 'wrap',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <AlertTriangle size={22} color="#d97706" style={{ flexShrink: 0 }} />
            <div>
              <div style={{ fontWeight: 800, color: '#92400e', fontSize: '0.95rem' }}>
                ご注文後の変更・至急のキャンセルについて
              </div>
              <div style={{ fontSize: '0.84rem', color: '#b45309' }}>
                調理開始前であればキャンセルが可能です。至急お電話にてご連絡ください。
              </div>
            </div>
          </div>
          {info.phone && (
            <a
              href={`tel:${phoneClean}`}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
                backgroundColor: '#d97706',
                color: '#fff',
                padding: '8px 16px',
                borderRadius: '8px',
                fontWeight: 700,
                fontSize: '0.88rem',
                textDecoration: 'none',
              }}
            >
              <Phone size={15} /> 店舗に電話する: {info.phone}
            </a>
          )}
        </div>
      </div>

      {/* Content Body */}
      <div style={{ maxWidth: '860px', margin: '0 auto', padding: '1.5rem 20px 4rem' }}>
        
        <div style={{
          backgroundColor: '#fff',
          borderRadius: '16px',
          padding: 'clamp(1.5rem, 4vw, 2.75rem)',
          boxShadow: '0 4px 20px rgba(0,0,0,0.04)',
          border: '1px solid #e5e7eb',
          lineHeight: 1.8,
        }}>

          <section style={clauseStyle}>
            <h2 style={h2Style}>1. 飲食・食品の特性について</h2>
            <p>
              当店が提供するカレー、ナン、タンドリーチキン等の食品および飲料は、すべてご注文を受けてから真心を込めて調理する「生鮮食品・加熱調理品」です。
              衛生管理および食品安全上の観点から、他のお客様への再提供ができないため、原則として<strong>お客様のご都合による調理開始後の返品・交換・返金はお受けいたしかねます</strong>。あらかじめご了承ください。
            </p>
          </section>

          <section style={clauseStyle}>
            <h2 style={h2Style}>2. ご注文のキャンセル・変更の受付条件</h2>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '14px', margin: '1rem 0' }}>
              <div style={{ backgroundColor: '#ecfdf5', border: '1px solid #a7f3d0', borderRadius: '10px', padding: '14px 16px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: '#065f46', fontWeight: 800, fontSize: '0.95rem', marginBottom: '4px' }}>
                  <CheckCircle2 size={18} color="#059669" /> 調理開始前（ご注文直後）
                </div>
                <p style={{ margin: 0, fontSize: '0.84rem', color: '#047857', lineHeight: 1.6 }}>
                  ご注文後すぐにお電話にてご連絡いただき、店舗でまだ調理を開始していない場合に限り、ご注文のキャンセルまたは内容変更が可能です。お支払い金額は100%返金いたします。
                </p>
              </div>

              <div style={{ backgroundColor: '#fef2f2', border: '1px solid #fecaca', borderRadius: '10px', padding: '14px 16px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: '#991b1b', fontWeight: 800, fontSize: '0.95rem', marginBottom: '4px' }}>
                  <AlertTriangle size={18} color="#dc2626" /> 調理開始後・配達中
                </div>
                <p style={{ margin: 0, fontSize: '0.84rem', color: '#b91c1c', lineHeight: 1.6 }}>
                  シェフがすでに調理を開始している場合、またはデリバリースタッフが出発した後は、お客様都合によるキャンセル・返金は承ることができません。
                </p>
              </div>
            </div>
          </section>

          <section style={clauseStyle}>
            <h2 style={h2Style}>3. 店舗都合・品切れによるキャンセルと全額返金</h2>
            <p>
              万が一、食材の予期せぬ品切れ、天災、荒天、機器トラブル、配達員の突発事故等により、ご注文をお受けできない状況が発生した場合は、速やかにお客様へお電話またはメールにてご連絡し、<strong>全額（100%）返金</strong>いたします。
            </p>
            <p style={{ fontSize: '0.88rem', color: '#6b7280' }}>
              ※ ご利用いただいた割引クーポンやアダルサポイントも、即座にお客様の会員アカウントへ返還（ロールバック）されますのでご安心ください。
            </p>
          </section>

          <section style={clauseStyle}>
            <h2 style={h2Style}>4. 商品の不備・誤配送・品質トラブル時のご対応</h2>
            <p>
              当店では細心の注意を払ってお料理を調理・梱包・お渡ししておりますが、万が一以下の事由がございましたら、お召し上がりにならず直ちに店舗までご連絡ください。
            </p>
            <ul style={listStyle}>
              <li>注文したメニューと異なる商品が届いた（品違い）</li>
              <li>商品に不足があった（ナンやドリンクの入れ忘れ等）</li>
              <li>容器の破損、こぼれ、異物の混入が認められた場合</li>
              <li>注文時に指定したアレルゲン除去要望が反映されていなかった場合</li>
            </ul>
            <div style={{ backgroundColor: '#f9fafb', border: '1px solid #e5e7eb', borderRadius: '10px', padding: '12px 16px', marginTop: '10px' }}>
              <strong>【当店の対応方針】</strong>
              <div style={{ fontSize: '0.88rem', color: '#4b5563', marginTop: '4px' }}>
                速やかに<strong>「出来立ての正しい商品の再配達/再提供」</strong>または<strong>「該当商品または全額のご返金」</strong>を、お客様のご希望に合わせて迅速に対応させていただきます。
              </div>
            </div>
          </section>

          <section style={clauseStyle}>
            <h2 style={h2Style}>5. 返金方法と反映タイミング</h2>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.88rem', marginTop: '10px' }}>
              <thead>
                <tr style={{ backgroundColor: '#f9fafb', borderBottom: '1.5px solid #e5e7eb', textAlign: 'left' }}>
                  <th style={{ padding: '10px' }}>お支払い方法</th>
                  <th style={{ padding: '10px' }}>返金処理方法</th>
                  <th style={{ padding: '10px' }}>反映の目安</th>
                </tr>
              </thead>
              <tbody>
                <tr style={{ borderBottom: '1px solid #f3f4f6' }}>
                  <td style={{ padding: '10px', fontWeight: 600 }}>クレジットカード / オンライン決済</td>
                  <td style={{ padding: '10px' }}>決済会社を通じて即時返金（キャンセル）処理</td>
                  <td style={{ padding: '10px', color: '#6b7280' }}>カード会社所定の締め日または数日以内</td>
                </tr>
                <tr style={{ borderBottom: '1px solid #f3f4f6' }}>
                  <td style={{ padding: '10px', fontWeight: 600 }}>アダルサポイント利用分</td>
                  <td style={{ padding: '10px' }}>会員アカウントへ自動ポイント返還</td>
                  <td style={{ padding: '10px', color: '#059669', fontWeight: 700 }}>即時</td>
                </tr>
                <tr style={{ borderBottom: '1px solid #f3f4f6' }}>
                  <td style={{ padding: '10px', fontWeight: 600 }}>店頭現金払い / 配達時現金決済</td>
                  <td style={{ padding: '10px' }}>店頭での直接現金返金、または銀行振込</td>
                  <td style={{ padding: '10px', color: '#6b7280' }}>店頭即時 / 振込時は翌営業日以内</td>
                </tr>
              </tbody>
            </table>
          </section>

          <section style={clauseStyle}>
            <h2 style={h2Style}>6. テーブル席ご予約のキャンセル規定</h2>
            <p>
              イートインのお席のご予約をキャンセルまたは人数変更される場合は、前日の営業時間内までにお電話にてご連絡をお願いいたします。
            </p>
            <ul style={listStyle}>
              <li><strong>前日までのご連絡:</strong> キャンセル料は発生いたしません。</li>
              <li><strong>当日無断キャンセル（No-Show）:</strong> コース料理や特別仕込みをご注文の場合、料理代金の100%をご請求させていただく場合がございます。</li>
            </ul>
          </section>

          <section style={{ ...clauseStyle, borderBottom: 'none', marginBottom: 0, paddingBottom: 0 }}>
            <h2 style={h2Style}>7. 返金・キャンセルに関するお問い合わせ窓口</h2>
            <p>ご不明な点や緊急のキャンセル・トラブル連絡は、下記まで直接お電話ください。</p>
            <div style={{
              backgroundColor: '#f9fafb',
              border: '1px solid #e5e7eb',
              borderRadius: '10px',
              padding: '16px 20px',
              marginTop: '12px',
            }}>
              <div style={{ fontWeight: 700, fontSize: '1rem', color: '#111827', marginBottom: '8px' }}>
                {restaurantName} カスタマーサポート窓口
              </div>
              {info.phone && (
                <div style={infoRowStyle}>
                  <Phone size={15} color="#d97706" /> <span>お電話: <strong><a href={`tel:${phoneClean}`} style={{ color: '#d97706' }}>{info.phone}</a></strong>（営業時間内受付）</span>
                </div>
              )}
              {info.email && (
                <div style={infoRowStyle}>
                  <Mail size={15} color="#6b7280" /> <span>メール: <a href={`mailto:${info.email}`} style={{ color: '#4b5563' }}>{info.email}</a></span>
                </div>
              )}
              {info.addressJa && (
                <div style={infoRowStyle}>
                  <Clock size={15} color="#6b7280" /> <span>住所: {info.addressJa}</span>
                </div>
              )}
            </div>
          </section>

        </div>

        {/* Footer Quick Links */}
        <div style={{
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          gap: '20px',
          marginTop: '2.5rem',
          flexWrap: 'wrap',
          fontSize: '0.9rem',
        }}>
          <Link to="/privacy-policy" style={linkStyle}>
            プライバシーポリシー <ArrowRight size={14} />
          </Link>
          <span style={{ color: '#d1d5db' }}>|</span>
          <Link to="/careers" style={linkStyle}>
            採用情報（スタッフ募集） <ArrowRight size={14} />
          </Link>
          <span style={{ color: '#d1d5db' }}>|</span>
          <Link to="/menu/takeout" style={linkStyle}>
            <ShoppingBag size={14} /> メニューを見る
          </Link>
        </div>

      </div>
    </main>
  );
}

const clauseStyle = {
  marginBottom: '2rem',
  paddingBottom: '1.75rem',
  borderBottom: '1px solid #f3f4f6',
};

const h2Style = {
  fontSize: '1.15rem',
  fontWeight: 700,
  color: '#92400e',
  margin: '0 0 0.75rem',
  display: 'flex',
  alignItems: 'center',
  gap: '6px',
};

const listStyle = {
  paddingLeft: '1.25rem',
  margin: '0.5rem 0',
  display: 'flex',
  flexDirection: 'column' as const,
  gap: '6px',
};

const infoRowStyle = {
  display: 'flex',
  alignItems: 'center',
  gap: '8px',
  fontSize: '0.88rem',
  color: '#4b5563',
  marginTop: '4px',
};

const linkStyle = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: '4px',
  color: '#b45309',
  fontWeight: 600,
  textDecoration: 'none',
};
