import { useEffect, useRef, useState, type CSSProperties } from 'react';
import ReadyAlertButton from '../components/order/ReadyAlertButton';
import { readyChime } from '../lib/push';
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom';
import { CheckCircle2, ExternalLink, MapPin, Phone, Printer, Store } from 'lucide-react';
import { formatAddress, fulfillmentLabel, statusLabel, timeWord, type DeliveryAddress, type Fulfillment } from '../components/order/fulfillment';
import type { PlacedState } from './Order';
import { apiFetch, getPublic } from '../lib/api';
import { amountDue, formatOrderNumber, yen } from '../lib/format';
import { DEFAULT_STORE_LOCATIONS, resolveOrderStore, type OrderStoreSnapshot, type StoreLocation } from '../lib/stores';

import { printCustomerReceipt as printReceiptEngine } from '../lib/receipt';

interface TrackedOrder {
  token?: string;
  number: number;
  status: 'NEW' | 'CONFIRMED' | 'READY' | 'COMPLETED' | 'CANCELLED';
  customerName: string;
  phone?: string;
  note?: string | null;
  pickupAt: string;
  store?: OrderStoreSnapshot | null;
  storeId?: string | null;
  storeName?: string | null;
  storeAddress?: string | null;
  storePhone?: string | null;
  items: {
    nameEn: string;
    nameJa: string | null;
    quantity: number;
    unitPrice?: number;
    lineTotal: number;
    options?: any[];
    store?: OrderStoreSnapshot | null;
  }[];
  subtotal: number;
  offerTitle: string | null;
  offerDiscount: number;
  rewardTitle: string | null;
  rewardKind: 'AMOUNT_OFF' | 'PERK' | null;
  rewardDiscount: number;
  pointsUsed: number;
  pointsDiscount: number;
  total: number;
  taxRate: number | null;
  tax: number;
  grandTotal: number;
  pointsEarned: number;
  isMember: boolean;
  fulfillment: Fulfillment;
  deliveryFee: number;
  deliveryAddress: DeliveryAddress | null;
}

const POLL_MS = 20_000;
// While the food is being prepared, check more often so "ready" shows up quickly.
const POLL_ACTIVE_MS = 8_000;
const DEFAULT_TIMEZONE = 'Asia/Tokyo';

const STEP_STATUSES: TrackedOrder['status'][] = ['NEW', 'CONFIRMED', 'READY', 'COMPLETED'];

const HINTS: Record<Fulfillment, Partial<Record<TrackedOrder['status'], string>>> = {
  PICKUP: {
    NEW: 'ご注文を受け付けました。店舗の確認をお待ちください。',
    CONFIRMED: 'ご注文を確認し、準備を進めています。',
    READY: 'お受け取りいただけます。店頭で受付番号をお伝えください。',
    COMPLETED: 'ご利用ありがとうございました。',
  },
  DELIVERY: {
    NEW: 'ご注文を受け付けました。店舗の確認をお待ちください。',
    CONFIRMED: 'ご注文を確認し、準備を進めています。',
    READY: '商品をお届けに向かっています。お支払いの準備をしてお待ちください。',
    COMPLETED: 'お届けしました。ご利用ありがとうございました。',
  },
  DINE_IN: {
    NEW: 'ご注文を受け付けました。',
    CONFIRMED: '調理しています。',
    READY: 'まもなくお席へお持ちします。',
    COMPLETED: 'ごゆっくりお召し上がりください。',
  },
};

export function printCustomerReceipt(order: TrackedOrder, settings: any) {
  return printReceiptEngine(order, settings);
}

export default function OrderStatus() {
  const { token } = useParams();
  // Shown once, right after ordering: the flag is read from navigation state and then cleared,
  // since browsers keep that state across reloads.
  const location = useLocation();
  const navigate = useNavigate();
  const [justPlaced] = useState(() => (location.state as PlacedState | null)?.justPlaced === true);
  useEffect(() => {
    if (justPlaced) navigate(location.pathname, { replace: true, state: null });
  }, [justPlaced, navigate, location.pathname]);
  const [order, setOrder] = useState<TrackedOrder | null>(null);
  const [missing, setMissing] = useState(false);
  const [settings, setSettings] = useState<any>({});
  const [stores, setStores] = useState<StoreLocation[]>(DEFAULT_STORE_LOCATIONS);
  // Shown (with a chime) when the order turns ready while this page is open.
  const [readyAlert, setReadyAlert] = useState(false);
  const lastStatus = useRef<string | null>(null);
  const printedRef = useRef(false);

  useEffect(() => {
    getPublic<any>('/api/v1/settings').then(setSettings).catch(console.error);
    getPublic<{ stores?: StoreLocation[] }>('/api/v1/stores')
      .then(res => {
        if (Array.isArray(res?.stores) && res.stores.length > 0) setStores(res.stores);
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (justPlaced && order && !printedRef.current) {
      printedRef.current = true;
      const timer = setTimeout(() => {
        printCustomerReceipt(order, settings);
      }, 800);
      return () => clearTimeout(timer);
    }
  }, [justPlaced, order, settings]);

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    let cancelled = false;

    const load = async () => {
      try {
        const res = await apiFetch(`/api/v1/orders/track/${encodeURIComponent(token ?? '')}`);
        if (res.status === 404) {
          if (!cancelled) setMissing(true);
          return;
        }
        if (res.ok) {
          const data: TrackedOrder = await res.json();
          if (cancelled) return;
          if (lastStatus.current && lastStatus.current !== 'READY' && data.status === 'READY') {
            setReadyAlert(true);
            readyChime();
          }
          lastStatus.current = data.status;
          setOrder(data);
          if (data.status === 'COMPLETED' || data.status === 'CANCELLED') return;
        }
      } catch {
        // Network blip: try again on the next tick.
      }
      if (!cancelled) timer = setTimeout(load, lastStatus.current === 'NEW' || lastStatus.current === 'CONFIRMED' ? POLL_ACTIVE_MS : POLL_MS);
    };

    load();
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [token]);

  const timeZone = settings.timezone || DEFAULT_TIMEZONE;
  const resolvedBranch = resolveOrderStore(order, stores);
  const effectivePhone = resolvedBranch?.phone || settings.phone;
  const phoneLink = effectivePhone ? <a href={`tel:${effectivePhone}`} style={{ color: 'var(--spice)', fontWeight: 'bold' }}>{effectivePhone}</a> : null;
  const stepIndex = order ? STEP_STATUSES.indexOf(order.status) : -1;
  const fulfillment: Fulfillment = order?.fulfillment === 'DELIVERY' ? 'DELIVERY' : 'PICKUP';

  return (
    <main>
      <title>ご注文状況 | Adarsha (アダルサ)</title>
      <meta name="robots" content="noindex" />
      <div className="section" style={{ backgroundColor: 'var(--cream)', paddingTop: '120px', minHeight: '70vh' }}>
        <div style={{ maxWidth: '640px', margin: '0 auto', padding: '0 16px' }}>
          {missing ? (
            <div style={{ ...cardStyle, textAlign: 'center' }}>
              <h1 style={{ fontSize: '1.4rem', marginTop: 0 }}>ご注文が見つかりません</h1>
              <p>URLをご確認ください。{phoneLink && <>ご不明な点はお電話（{phoneLink}）でお問い合わせください。</>}</p>
              <Link to="/menu/takeout" className="btn-warm" style={{ display: 'inline-block', textDecoration: 'none' }}>テイクアウトメニュー</Link>
            </div>
          ) : !order ? (
            <p aria-busy="true" style={{ textAlign: 'center' }}>読み込み中…</p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            {readyAlert && order.status === 'READY' && (
              <div role="alert" className="ready-alert">
                <span aria-hidden="true">{fulfillment === 'DELIVERY' ? '🛵' : '🎉'}</span>
                <div>
                  <strong>{fulfillment === 'DELIVERY' ? '配達に出発しました！' : 'ご注文の準備ができました！'}</strong>
                  <span>{fulfillment === 'DELIVERY' ? 'まもなくお届けします。' : `受付番号 ${formatOrderNumber(order.number)} ・ 店頭でお受け取りください。`}</span>
                </div>
                <button type="button" onClick={() => setReadyAlert(false)} aria-label="閉じる">×</button>
              </div>
            )}
            {(order.status === 'NEW' || order.status === 'CONFIRMED') && token && <ReadyAlertButton target={{ orderToken: token }} />}
            {justPlaced && (
              <div role="status" style={{ display: 'flex', gap: '12px', alignItems: 'center', justifyContent: 'space-between', padding: '16px 20px', borderRadius: '14px', backgroundColor: '#ecfdf3', border: '1px solid #abefc6', color: '#067647', flexWrap: 'wrap' }}>
                <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
                  <CheckCircle2 size={26} aria-hidden="true" style={{ flexShrink: 0 }} />
                  <div>
                    <strong style={{ display: 'block', fontSize: '1.08rem' }}>ご注文が確定しました（受付完了）</strong>
                    <span style={{ fontSize: '0.9rem', lineHeight: 1.6 }}>受付番号 {formatOrderNumber(order.number)} ・ 控え・領収書を印刷できます。</span>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => printCustomerReceipt(order, settings)}
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '6px',
                    padding: '9px 18px',
                    borderRadius: '8px',
                    backgroundColor: '#067647',
                    color: '#fff',
                    border: 'none',
                    fontWeight: 700,
                    fontSize: '0.92rem',
                    cursor: 'pointer',
                    boxShadow: '0 2px 8px rgba(6, 118, 71, 0.25)',
                    whiteSpace: 'nowrap',
                  }}
                >
                  <Printer size={18} />
                  領収書を印刷
                </button>
              </div>
            )}
            <div style={cardStyle}>
              <div style={{ textAlign: 'center' }}>
                <div className="section-label">ORDER</div>
                <div style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>受付番号</div>
                <h1 style={{ fontSize: '3rem', color: 'var(--spice)', margin: '0 0 8px', fontFamily: 'var(--font-display)' }}>{formatOrderNumber(order.number)}</h1>
                <p style={{ margin: 0, color: 'var(--dark-bark)' }}>
                  {order.customerName} 様 ・ {fulfillmentLabel(fulfillment)} ・ {timeWord(fulfillment)}{' '}
                  <strong>
                    {new Date(order.pickupAt).toLocaleString('ja-JP', { timeZone, month: 'long', day: 'numeric', weekday: 'short', hour: '2-digit', minute: '2-digit' })}
                  </strong>
                </p>
                {order.deliveryAddress && (
                  <p style={{ margin: '6px 0 0', color: 'var(--text-muted)', fontSize: '0.9rem' }}>お届け先：{formatAddress(order.deliveryAddress)}</p>
                )}

                {resolvedBranch && (
                  <div
                    style={{
                      marginTop: '14px',
                      padding: '12px 16px',
                      borderRadius: '12px',
                      backgroundColor: '#fffaf4',
                      border: '1px solid rgba(200,80,26,0.28)',
                      textAlign: 'left',
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontWeight: 800, color: 'var(--dark-bark)', fontSize: '0.95rem' }}>
                        <Store size={16} style={{ color: 'var(--spice)' }} />
                        <span>{fulfillment === 'DELIVERY' ? '担当店舗：' : 'お受け取り店舗：'}Adarsha {resolvedBranch.name}</span>
                      </div>
                      <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                        {resolvedBranch.phone && (
                          <a
                            href={`tel:${resolvedBranch.phone}`}
                            style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', fontSize: '0.8rem', fontWeight: 700, color: 'var(--spice)', textDecoration: 'none' }}
                          >
                            <Phone size={13} /> {resolvedBranch.phone}
                          </a>
                        )}
                        <a
                          href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`Adarsha ${resolvedBranch.name} ${resolvedBranch.address}`)}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          style={{ display: 'inline-flex', alignItems: 'center', gap: '3px', fontSize: '0.78rem', fontWeight: 600, color: '#4b5563', textDecoration: 'none' }}
                        >
                          <ExternalLink size={12} /> 地図
                        </a>
                      </div>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'flex-start', gap: '5px', fontSize: '0.82rem', color: '#4b5563', marginTop: '6px' }}>
                      <MapPin size={14} style={{ color: 'var(--spice)', flexShrink: 0, marginTop: '2px' }} />
                      <div>
                        <div>{resolvedBranch.address}</div>
                        {resolvedBranch.access && <div style={{ fontSize: '0.75rem', color: '#6b7280' }}>🚃 {resolvedBranch.access}</div>}
                      </div>
                    </div>
                  </div>
                )}

                <div style={{ marginTop: '16px', display: 'flex', justifyContent: 'center' }}>
                  <button
                    type="button"
                    onClick={() => printCustomerReceipt(order, settings)}
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '8px',
                      padding: '10px 22px',
                      backgroundColor: '#fff8f5',
                      border: '1px solid #fed7cc',
                      color: 'var(--spice)',
                      borderRadius: '9999px',
                      fontWeight: 700,
                      fontSize: '0.92rem',
                      cursor: 'pointer',
                      boxShadow: '0 2px 8px rgba(184, 61, 39, 0.08)',
                      transition: 'all 0.2s ease',
                    }}
                  >
                    <Printer size={18} />
                    注文控え / 領収書を印刷
                  </button>
                </div>
              </div>

              {order.status === 'CANCELLED' ? (
                <div role="status" style={{ marginTop: '24px', padding: '16px', borderRadius: '8px', backgroundColor: '#fdecea', color: '#9b1c1c' }}>
                  このご注文はキャンセルされました。{phoneLink && <>ご不明な点はお電話（{phoneLink}）でお問い合わせください。</>}
                </div>
              ) : (
                <>
                  <ol style={{ display: 'flex', listStyle: 'none', padding: 0, margin: '28px 0 12px', gap: '4px' }}>
                    {STEP_STATUSES.map(status => ({ status, label: statusLabel(status, fulfillment) })).map((step, index) => (
                      <li key={step.status} aria-current={index === stepIndex ? 'step' : undefined} style={{ flex: 1, textAlign: 'center', fontSize: '0.8rem', fontWeight: index === stepIndex ? 'bold' : 'normal', color: index <= stepIndex ? 'var(--spice)' : 'var(--text-muted)' }}>
                        <div style={{ height: '6px', borderRadius: '3px', marginBottom: '6px', backgroundColor: index <= stepIndex ? 'var(--spice)' : '#e5dbcd' }} />
                        {step.label}
                      </li>
                    ))}
                  </ol>
                  <p role="status" style={{ textAlign: 'center', margin: '0 0 8px', color: 'var(--dark-bark)' }}>{order && HINTS[fulfillment][order.status]}</p>
                </>
              )}

              <ul style={{ listStyle: 'none', padding: 0, margin: '24px 0 0', borderTop: '1px solid #eee' }}>
                {order.items.map((line, index) => (
                  <li key={index} style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 0', borderBottom: '1px solid #eee' }}>
                    <span>{line.nameJa || line.nameEn} × {line.quantity}</span>
                    <span>{yen(line.lineTotal)}</span>
                  </li>
                ))}
              </ul>
              {order.offerDiscount > 0 && (
                <div style={discountRowStyle}><span>特典「{order.offerTitle}」</span><span>−{yen(order.offerDiscount)}</span></div>
              )}
              {order.rewardTitle && (
                <div style={discountRowStyle}><span>スタンプ特典「{order.rewardTitle}」</span><span>{order.rewardDiscount > 0 ? `−${yen(order.rewardDiscount)}` : 'お渡し時に適用'}</span></div>
              )}
              {order.pointsDiscount > 0 && (
                <div style={discountRowStyle}><span>ポイント利用（{order.pointsUsed}pt）</span><span>−{yen(order.pointsDiscount)}</span></div>
              )}
              {order.taxRate !== null && (
                <>
                  <div style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', fontSize: '0.9rem' }}><span>小計</span><span>{yen(order.total)}</span></div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', fontSize: '0.9rem' }}><span>消費税 ({order.taxRate}%)</span><span>{yen(order.tax)}</span></div>
                  {order.deliveryFee > 0 && (
                    <div style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', fontSize: '0.9rem' }}><span>配達料 (税込)</span><span>{yen(order.deliveryFee)}</span></div>
                  )}
                </>
              )}
              <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '12px', fontWeight: 'bold', fontSize: '1.15rem' }}>
                <span>お支払い金額 <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)', fontWeight: 'normal' }}>(税込)</span></span>
                <span style={{ color: 'var(--spice)' }}>{yen(amountDue(order).amount)}</span>
              </div>
              {order.isMember && order.status === 'COMPLETED' && order.pointsEarned > 0 && (
                <p style={{ margin: '12px 0 0', color: '#047857', fontWeight: 'bold', textAlign: 'center' }}>{order.pointsEarned}ポイントを獲得しました！</p>
              )}
              {order.isMember && (
                <p style={{ margin: '12px 0 0', textAlign: 'center' }}><Link to="/account" style={{ color: 'var(--spice)', fontWeight: 'bold' }}>マイページで注文履歴・ポイントを見る →</Link></p>
              )}

              <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', lineHeight: 1.6, marginTop: '24px', marginBottom: 0 }}>
                {fulfillment === 'DELIVERY' ? 'お支払いはお届け時に現金でお願いいたします。' : 'お支払いは受け取り時に店頭でお願いいたします。'}このページは自動で更新されます。ブックマークしておくと、後から状況を確認できます。
                {phoneLink && <> 変更・キャンセルはお電話（{phoneLink}）でご連絡ください。</>}
              </p>
            </div>
            </div>
          )}
        </div>
      </div>
    </main>
  );
}

const cardStyle: CSSProperties = { backgroundColor: 'white', borderRadius: '12px', padding: '24px', boxShadow: '0 4px 15px rgba(0,0,0,0.05)' };
const discountRowStyle: CSSProperties = { display: 'flex', justifyContent: 'space-between', padding: '6px 0', color: '#047857', fontSize: '0.9rem' };
