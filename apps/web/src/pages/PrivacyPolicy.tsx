import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { ShieldCheck, Lock, Eye, UserCheck, Phone, Mail, MapPin, ArrowRight } from 'lucide-react';
import { getPublic } from '../lib/api';

interface RestaurantInfo {
  name?: string;
  addressJa?: string;
  phone?: string;
  email?: string;
}

export default function PrivacyPolicy() {
  const [info, setInfo] = useState<RestaurantInfo>({});
  const lastUpdated = '2026年10月1日 改定';

  useEffect(() => {
    getPublic<RestaurantInfo>('/api/v1/settings')
      .then(data => setInfo(data || {}))
      .catch(() => {});
  }, []);

  const restaurantName = info.name || '本格インド料理 アダルサ (Adarsha)';

  return (
    <main style={{ backgroundColor: '#faf7f2', minHeight: '100vh', color: '#1f2937' }}>
      <title>プライバシーポリシー (個人情報保護方針) | Adarsha (アダルサ)</title>
      <meta name="description" content="本格インド料理アダルサのプライバシーポリシーです。お客様の個人情報の適切な保護と取り扱いに関する方針をご案内します。" />
      <link rel="canonical" href="https://pnglike.com/privacy-policy" />
      <meta property="og:title" content="プライバシーポリシー | Adarsha (アダルサ)" />
      <meta property="og:description" content="本格インド料理アダルサのプライバシーポリシーです。" />
      <meta property="og:type" content="website" />
      <meta property="og:url" content="https://pnglike.com/privacy-policy" />

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
          background: 'radial-gradient(circle at 80% 20%, rgba(217, 119, 6, 0.18), transparent 50%)',
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
            <ShieldCheck size={16} /> Privacy Policy
          </div>
          <h1 style={{
            fontSize: 'clamp(1.8rem, 4vw, 2.5rem)',
            fontWeight: 800,
            letterSpacing: '-0.5px',
            margin: '0 0 0.75rem',
          }}>
            プライバシーポリシー（個人情報保護方針）
          </h1>
          <p style={{ color: '#d1d5db', fontSize: '0.95rem', margin: 0 }}>
            {restaurantName}（以下「当店」）は、お客様の個人情報を大切に保護し、安心してお食事やご注文をお楽しみいただけるよう、適切な取り扱いに努めます。
          </p>
          <div style={{ marginTop: '1rem', fontSize: '0.82rem', color: '#9ca3af' }}>
            最終更新日: {lastUpdated}
          </div>
        </div>
      </div>

      {/* Content Body */}
      <div style={{ maxWidth: '860px', margin: '0 auto', padding: 'clamp(2rem, 5vw, 4rem) 20px' }}>
        
        {/* Quick Navigation Cards */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
          gap: '12px',
          marginBottom: '2.5rem',
        }}>
          <div style={navCardStyle}>
            <Lock size={20} color="#d97706" />
            <div>
              <div style={{ fontWeight: 700, fontSize: '0.9rem' }}>安全管理措置</div>
              <div style={{ fontSize: '0.78rem', color: '#6b7280' }}>SSL暗号化通信・厳重保管</div>
            </div>
          </div>
          <div style={navCardStyle}>
            <Eye size={20} color="#059669" />
            <div>
              <div style={{ fontWeight: 700, fontSize: '0.9rem' }}>利用目的の特定</div>
              <div style={{ fontSize: '0.78rem', color: '#6b7280' }}>注文・配達・予約・会員特典</div>
            </div>
          </div>
          <div style={navCardStyle}>
            <UserCheck size={20} color="#2563eb" />
            <div>
              <div style={{ fontWeight: 700, fontSize: '0.9rem' }}>開示・削除請求</div>
              <div style={{ fontSize: '0.78rem', color: '#6b7280' }}>会員マイページまたは窓口</div>
            </div>
          </div>
        </div>

        {/* Legal Policy Clauses */}
        <div style={{
          backgroundColor: '#fff',
          borderRadius: '16px',
          padding: 'clamp(1.5rem, 4vw, 2.75rem)',
          boxShadow: '0 4px 20px rgba(0,0,0,0.04)',
          border: '1px solid #e5e7eb',
          lineHeight: 1.8,
        }}>
          
          <section style={clauseStyle}>
            <h2 style={h2Style}>1. 基本方針</h2>
            <p>
              当店は、個人情報の保護に関する日本の法令（個人情報の保護に関する法律、関連省庁のガイドライン等）および本プライバシーポリシーを遵守し、お客様からお預かりした個人情報の適切な管理と保護に万全を尽くします。
            </p>
          </section>

          <section style={clauseStyle}>
            <h2 style={h2Style}>2. 収集する個人情報の項目</h2>
            <p>当店は、サービスの円滑な提供のために以下の情報を必要最小限の範囲で収集いたします。</p>
            <ul style={listStyle}>
              <li><strong>会員登録・ご連絡先情報:</strong> お名前、フリガナ、電話番号、メールアドレス、ご住所（デリバリー時）。</li>
              <li><strong>ご注文・予約情報:</strong> 注文商品、テイクアウト/デリバリー受け取り希望日時、席予約日時、ご来店人数、アレルギー・食事制限等のご要望。</li>
              <li><strong>ポイント・スタンプ・キャンペーン情報:</strong> 会員コード、獲得・利用ポイント履歴、スタンプカード進捗、ミニゲーム当選特典。</li>
              <li><strong>お問い合わせ内容:</strong> お問い合わせフォームからのご意見、ご感想、ご質問内容。</li>
              <li><strong>自動取得情報:</strong> IPアドレス、Cookie、端末情報、アクセスログ（サイトの機能維持および利便性向上のため）。</li>
            </ul>
            <p style={{ fontSize: '0.88rem', color: '#6b7280', marginTop: '8px' }}>
              ※ クレジットカード決済時のカード情報は、PCI-DSS準拠の決済代行機関（Stripe / Square等）により安全に暗号化処理され、当店のサーバーにはカード番号は保管されません。
            </p>
          </section>

          <section style={clauseStyle}>
            <h2 style={h2Style}>3. 個人情報の利用目的</h2>
            <p>お預かりした個人情報は、以下の目的のためにのみ利用いたします。</p>
            <ul style={listStyle}>
              <li>テイクアウトおよびデリバリーのご注文の受付、調理、梱包、配達、お会計処理のため</li>
              <li>お席のご予約確認、来店状況の管理、緊急時のご連絡のため</li>
              <li>会員向けポイントプログラム、スタンプカード、ミニゲーム特典の付与および利用管理のため</li>
              <li>アレルギー食材や辛さの好みに応じた安心・安全な料理提供のため</li>
              <li>ご注文完了時や調理完了時のプッシュ通知・メール連絡のため</li>
              <li>お客様からのお問い合わせに対する回答およびアフターサポートのため</li>
              <li>新メニュー、お得なオファー、季節限定キャンペーンのご案内（希望されたお客様のみ）のため</li>
              <li>不正利用防止およびウェブサイトのセキュリティ確保のため</li>
            </ul>
          </section>

          <section style={clauseStyle}>
            <h2 style={h2Style}>4. 個人情報の安全管理措置</h2>
            <p>
              当店は、個人情報の漏洩、滅失、毀損、不正アクセスを防止するため、以下の安全管理措置を講じています。
            </p>
            <ul style={listStyle}>
              <li><strong>通信の暗号化（SSL/TLS）:</strong> 当サイト上のすべてのデータ通信は常時SSLにより強力に暗号化されています。</li>
              <li><strong>アクセス制限とパスワード保護:</strong> 管理者アカウントおよび会員パスワードは不可逆ハッシュ化（bcrypt）の上、厳重に保護されています。</li>
              <li><strong>従業員の教育・監督:</strong> 個人情報を取り扱うスタッフに対して守秘義務および適正管理の周知徹底を行っています。</li>
            </ul>
          </section>

          <section style={clauseStyle}>
            <h2 style={h2Style}>5. 第三者への開示・提供の禁止</h2>
            <p>
              当店は、法令に基づく場合を除き、お客様の同意を得ることなく個人情報を第三者に開示・提供することはありません。ただし、以下の場合は除きます。
            </p>
            <ul style={listStyle}>
              <li>お客様の同意がある場合</li>
              <li>デリバリー配達業務や決済処理業務など、利用目的の達成に必要な範囲で信頼できる提携事業者へ業務委託する場合</li>
              <li>法令に基づき裁判所、警察等の公的機関から正式な照会を受けた場合</li>
              <li>人の生命、身体または財産の保護のために必要があり、本人の同意を得ることが困難である場合</li>
            </ul>
          </section>

          <section style={clauseStyle}>
            <h2 style={h2Style}>6. クッキー（Cookie）およびアクセス解析の利用</h2>
            <p>
              当サイトでは、ショッピングカートの保持、ログインセッションの維持、お客様の利便性向上のためにCookieを利用しています。お客様はブラウザの設定によりCookieの受け取りを拒否することができますが、その場合一部のサービス（オンライン注文等）が正常に機能しない場合があります。
            </p>
          </section>

          <section style={clauseStyle}>
            <h2 style={h2Style}>7. 個人情報の開示・訂正・利用停止・削除について</h2>
            <p>
              会員のお客様は、マイページの「会員情報変更」画面より、ご自身の登録情報をいつでも確認・訂正することができます。
              また、退会や個人情報の消去・利用停止をご希望の場合は、マイページまたは下記お問い合わせ窓口までお申し出いただければ、ご本人様確認の上、速やかに対応いたします。
            </p>
          </section>

          <section style={clauseStyle}>
            <h2 style={h2Style}>8. お問い合わせ窓口</h2>
            <p>当店の個人情報の取り扱いに関するご質問、開示・訂正等のご請求は、下記までお問い合わせください。</p>
            <div style={{
              backgroundColor: '#f9fafb',
              border: '1px solid #e5e7eb',
              borderRadius: '10px',
              padding: '16px 20px',
              marginTop: '12px',
            }}>
              <div style={{ fontWeight: 700, fontSize: '1rem', color: '#111827', marginBottom: '8px' }}>
                {restaurantName} 個人情報保護窓口
              </div>
              {info.addressJa && (
                <div style={infoRowStyle}>
                  <MapPin size={15} color="#6b7280" /> <span>{info.addressJa}</span>
                </div>
              )}
              {info.phone && (
                <div style={infoRowStyle}>
                  <Phone size={15} color="#6b7280" /> <span>{info.phone}</span>
                </div>
              )}
              {info.email && (
                <div style={infoRowStyle}>
                  <Mail size={15} color="#6b7280" /> <span>{info.email}</span>
                </div>
              )}
            </div>
          </section>

          <section style={{ ...clauseStyle, borderBottom: 'none', marginBottom: 0, paddingBottom: 0 }}>
            <h2 style={h2Style}>9. プライバシーポリシーの改定</h2>
            <p>
              当店は、法令の改正や事業運営の改善に伴い、本プライバシーポリシーを予告なく改定することがあります。改定後のプライバシーポリシーは、本ウェブサイトに掲載された時点で効力を生じるものとします。
            </p>
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
          <Link to="/refund-policy" style={linkStyle}>
            返金・キャンセルポリシー <ArrowRight size={14} />
          </Link>
          <span style={{ color: '#d1d5db' }}>|</span>
          <Link to="/careers" style={linkStyle}>
            採用情報（スタッフ募集） <ArrowRight size={14} />
          </Link>
          <span style={{ color: '#d1d5db' }}>|</span>
          <Link to="/contact" style={linkStyle}>
            お問い合わせ <ArrowRight size={14} />
          </Link>
        </div>

      </div>
    </main>
  );
}

const navCardStyle = {
  backgroundColor: '#fff',
  borderRadius: '12px',
  padding: '12px 16px',
  display: 'flex',
  alignItems: 'center',
  gap: '12px',
  border: '1px solid #e5e7eb',
  boxShadow: '0 1px 3px rgba(0,0,0,0.03)',
};

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
