import { useCallback, useEffect, useRef, useState } from 'react';
import ReadyAlertButton from '../components/order/ReadyAlertButton';
import { readyChime } from '../lib/push';
import { Link, Navigate, useSearchParams } from 'react-router-dom';
import { ArrowLeft, ChevronRight, Coins, House, LogOut, Receipt, ShoppingBag, Sparkles, Ticket, UserRound, Wallet, type LucideIcon } from 'lucide-react';
import { toast } from 'react-hot-toast';
import { apiFetch } from '../lib/api';
import { useCustomer } from '../lib/customer-context';
import { fulfillmentLabel, statusLabel, timeWord } from '../components/order/fulfillment';
import { amountDue, formatDateTime, formatOrderNumber, isActiveOrder, yen } from '../lib/format';
import OffersList from '../components/account/OffersList';
import OrderCard from '../components/account/OrderCard';
import PointsPanel from '../components/account/PointsPanel';
import ProfilePanel from '../components/account/ProfilePanel';
import StampCard from '../components/account/StampCard';
import StampRewards from '../components/account/StampRewards';
import DailyGameBanner from '../components/account/DailyGameBanner';
import type { MemberOffer, MemberOrder, PointEntry, StampCardData } from '../components/account/types';
import './account.css';

const TABS: { key: TabKey; label: string; title: string; icon: LucideIcon }[] = [
  { key: 'home', label: 'ホーム', title: 'ダッシュボード', icon: House },
  { key: 'orders', label: '注文履歴', title: '注文履歴', icon: Receipt },
  { key: 'benefits', label: 'ポイント・特典', title: 'ポイント・特典', icon: Sparkles },
  { key: 'settings', label: 'アカウント', title: 'アカウント設定', icon: UserRound },
];
type TabKey = 'home' | 'orders' | 'benefits' | 'settings';
type BenefitsSection = 'all' | 'points' | 'stamps' | 'offers';

const TRACKER_STEPS = ['NEW', 'CONFIRMED', 'READY', 'COMPLETED'];

// Active orders change while the customer watches, so the dashboard refreshes itself.
const POLL_MS = 30_000;

const greeting = () => {
  const hour = Number(new Date().toLocaleString('en-US', { timeZone: 'Asia/Tokyo', hour: 'numeric', hourCycle: 'h23' }));
  return hour < 11 ? 'おはようございます' : hour < 18 ? 'こんにちは' : 'こんばんは';
};

const SEEN_OFFERS_KEY = 'adarsha_seen_offers';

/** Tells the member once about offers added since their last visit (remembered in this browser). */
function announceNewOffers(offers: MemberOffer[], memberId: string) {
  const key = `${SEEN_OFFERS_KEY}_${memberId}`;
  try {
    const raw = localStorage.getItem(key) ?? localStorage.getItem(`kalpana_seen_offers_${memberId}`);
    const seen = new Set<string>(JSON.parse(raw ?? '[]'));
    const firstVisit = !localStorage.getItem(key);
    const fresh = offers.filter(offer => !offer.used && !seen.has(offer.id));
    if (fresh.length && !firstVisit) {
      toast(fresh.length === 1 ? `新しい特典が届きました：${fresh[0].titleJa}` : `新しい特典が${fresh.length}件届きました`, { icon: '🎁', duration: 6000, id: 'new-offers' });
    }
    localStorage.setItem(key, JSON.stringify(offers.map(offer => offer.id)));
  } catch {
    // Private mode: no "new" notice, the offers still show.
  }
}

export default function Account() {
  const { customer, loyalty, refresh, signOut } = useCustomer();
  const [params, setParams] = useSearchParams();
  const rawTab = params.get('tab');
  const tab: TabKey =
    rawTab === 'points' || rawTab === 'offers' || rawTab === 'benefits'
      ? 'benefits'
      : TABS.some(t => t.key === rawTab)
        ? (rawTab as TabKey)
        : 'home';

  const [subFilter, setSubFilter] = useState<BenefitsSection>(() => {
    if (rawTab === 'points') return 'points';
    if (rawTab === 'offers') return 'offers';
    const s = params.get('section');
    if (s === 'points' || s === 'stamps' || s === 'offers') return s;
    return 'all';
  });

  useEffect(() => {
    if (rawTab === 'points') setSubFilter('points');
    else if (rawTab === 'offers') setSubFilter('offers');
    else {
      const s = params.get('section');
      if (s === 'points' || s === 'stamps' || s === 'offers') setSubFilter(s);
    }
  }, [rawTab, params]);

  const [orders, setOrders] = useState<MemberOrder[] | null>(null);
  const [points, setPoints] = useState<{ balance: number; history: PointEntry[] } | null>(null);
  const [offers, setOffers] = useState<MemberOffer[]>([]);
  const [stampCard, setStampCard] = useState<StampCardData | null>(null);
  const lastStatuses = useRef(new Map<string, string>());

  const load = useCallback(async () => {
    let expired = false;
    const get = (path: string) =>
      apiFetch(path).then(res => {
        if (res.status === 401) expired = true;
        return res.ok ? res.json() : Promise.reject(new Error(`${path} ${res.status}`));
      });
    const [ordersData, pointsData, offersData, stampsData] = await Promise.allSettled([
      get('/api/v1/customers/me/orders'),
      get('/api/v1/customers/me/points'),
      get('/api/v1/customers/me/offers'),
      get('/api/v1/customers/me/stamps'),
    ]);
    // The session ended (logged out in another tab, or expired): re-check once, which sends the member to the login page.
    if (expired) {
      refresh();
      return;
    }
    if (ordersData.status === 'fulfilled') {
      // An order that just turned ready while this page is open: say so, with a chime.
      for (const order of ordersData.value as MemberOrder[]) {
        const before = lastStatuses.current.get(order.token);
        if (before && before !== 'READY' && order.status === 'READY') {
          readyChime();
          toast.success(
            order.fulfillment === 'DELIVERY'
              ? `ご注文 ${formatOrderNumber(order.number)} の配達に出発しました！`
              : order.fulfillment === 'DINE_IN'
                ? 'お料理ができました！まもなくお席へお持ちします。'
                : `ご注文 ${formatOrderNumber(order.number)} の準備ができました！店頭でお受け取りください。`,
            { duration: 10000, id: `ready-${order.token}` },
          );
        }
        lastStatuses.current.set(order.token, order.status);
      }
      setOrders(ordersData.value);
    }
    if (pointsData.status === 'fulfilled') setPoints(pointsData.value);
    if (offersData.status === 'fulfilled') setOffers(offersData.value);
    if (stampsData.status === 'fulfilled') setStampCard(stampsData.value);
  }, [refresh]);

  const handleCardUpdate = useCallback((newCard: StampCardData) => {
    setStampCard(newCard);
    load();
  }, [load]);

  const handleGameRewardClaimed = useCallback(() => {
    load();
    refresh();
  }, [load, refresh]);

  const memberId = customer?.id;
  useEffect(() => {
    if (memberId && offers.length) announceNewOffers(offers, memberId);
  }, [offers, memberId]);

  const signedIn = Boolean(customer);
  useEffect(() => {
    if (!signedIn) return;
    load();
    const intervalId = setInterval(() => {
      load();
      refresh();
    }, POLL_MS);
    return () => clearInterval(intervalId);
  }, [signedIn, load, refresh]);

  if (customer === undefined) return <div className="acc" style={{ display: 'grid', placeItems: 'center' }} aria-busy="true">読み込み中…</div>;
  if (customer === null) return <Navigate to="/account/login?next=/account" replace />;

  const balance = points?.balance ?? customer.points;
  const allOrders = orders ?? [];
  const activeOrders = allOrders.filter(order => isActiveOrder(order.status));
  const pastOrders = allOrders.filter(order => !isActiveOrder(order.status));
  const completed = allOrders.filter(order => order.status === 'COMPLETED');
  const totalSaved = completed.reduce((sum, order) => sum + (order.offerDiscount || 0) + (order.rewardDiscount || 0) + (order.pointsDiscount || 0), 0);
  const usableOffers = offers.filter(offer => !offer.used);
  const showStamps = Boolean(stampCard?.enabled);
  const rewardCount = usableOffers.length + (stampCard?.rewards.length ?? 0);
  const current = TABS.find(t => t.key === tab)!;
  const goTo = (key: TabKey, section: BenefitsSection = 'all') => {
    const nextParams: Record<string, string> = {};
    if (key !== 'home') nextParams.tab = key;
    if (key === 'benefits' && section !== 'all') nextParams.section = section;
    setParams(nextParams);
    if (key === 'benefits') setSubFilter(section);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const selectFilter = (section: BenefitsSection) => {
    setSubFilter(section);
    const nextParams: Record<string, string> = { tab: 'benefits' };
    if (section !== 'all') nextParams.section = section;
    setParams(nextParams, { replace: true });
  };

  const badgeFor = (key: TabKey) => (key === 'benefits' ? rewardCount : key === 'orders' ? activeOrders.length : 0);

  const navButtons = TABS.map(t => {
    const Icon = t.icon;
    const badge = badgeFor(t.key);
    return (
      <button key={t.key} type="button" aria-current={tab === t.key ? 'page' : undefined} onClick={() => goTo(t.key)}>
        <Icon size={20} strokeWidth={tab === t.key ? 2.4 : 2} aria-hidden="true" />
        {t.label}
        {badge > 0 && <span className="acc-badge" aria-label={`${badge}件`}>{badge}</span>}
      </button>
    );
  });

  return (
    <div className="acc">
      <title>マイページ | Adarsha (アダルサ)</title>
      <meta name="robots" content="noindex" />

      <aside className="acc-sidebar">
        <Link to="/" className="acc-brand">
          <img src="/adarsha-log.webp" alt="" width={36} height={36} style={{ borderRadius: '50%', objectFit: 'contain' }} />
          <span>アダルサ<small>MEMBERS</small></span>
        </Link>
        <nav className="acc-nav" aria-label="マイページ">{navButtons}</nav>
        <div className="acc-sidebar-foot">
          <Link to="/menu/takeout" className="acc-btn"><ShoppingBag size={18} aria-hidden="true" />注文する</Link>
          <Link to="/" className="acc-btn acc-btn-ghost"><ArrowLeft size={18} aria-hidden="true" />サイトに戻る</Link>
          <button type="button" onClick={signOut} className="acc-link" style={{ color: 'var(--acc-muted)', justifyContent: 'center', padding: '6px' }}>
            <LogOut size={16} aria-hidden="true" />ログアウト
          </button>
        </div>
      </aside>

      <div className="acc-main">
        <header className="acc-topbar">
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', minWidth: 0 }}>
            <Link to="/" className="acc-mobile-brand" aria-label="アダルサ ホームへ"><img src="/adarsha-log.webp" alt="" width={32} height={32} style={{ borderRadius: '50%', objectFit: 'contain' }} /></Link>
            <div style={{ minWidth: 0 }}>
              <h1>{tab === 'home' ? `${greeting()}、${customer.name}さん` : current.title}</h1>
              <p>{tab === 'home' ? '今日は何をお召し上がりになりますか？' : `${customer.name}さんの${current.title}`}</p>
            </div>
          </div>
          <div className="acc-topbar-actions">
            <Link to="/menu/takeout" className="acc-btn acc-hide-mobile"><ShoppingBag size={18} aria-hidden="true" />注文する</Link>
            <button type="button" className="acc-avatar" onClick={() => goTo('settings')} aria-label="アカウント設定">{customer.name.charAt(0)}</button>
          </div>
        </header>

        <main className="acc-content">
          {tab === 'home' && (
            <>
              <section className="acc-hero" aria-label="ポイント残高">
                <div>
                  <div className="acc-hero-label">Adarsha Points</div>
                  <div className="acc-hero-points">{balance.toLocaleString('ja-JP')}<span>pt</span></div>
                  <div className="acc-hero-sub">
                    {yen(balance * (loyalty?.pointValueYen ?? 1))}分としてご利用いただけます
                    {loyalty?.enabled && ` ・ ¥100ごとに${loyalty.pointsPer100Yen}pt貯まります`}
                  </div>
                </div>
                <div className="acc-hero-actions">
                  <Link to="/menu/takeout" className="acc-btn"><ShoppingBag size={18} aria-hidden="true" />テイクアウトを注文</Link>
                  <button type="button" onClick={() => goTo('benefits', 'points')} className="acc-link" style={{ color: '#fff', fontSize: '0.84rem', opacity: 0.95 }}>
                    ポイント履歴を見る<ChevronRight size={14} aria-hidden="true" />
                  </button>
                </div>
              </section>

              <DailyGameBanner onRewardClaimed={handleGameRewardClaimed} />

              {showStamps && stampCard && <StampCard card={stampCard} memberName={customer.name} onCardUpdate={handleCardUpdate} />}

              <section className="acc-stats" aria-label="ご利用状況">
                <Stat icon={Receipt} value={String(completed.length)} label="ご注文回数" onClick={() => goTo('orders')} />
                <Stat icon={Wallet} value={yen(totalSaved)} label="割引合計" />
                <Stat icon={Ticket} value={String(rewardCount)} label="使える特典" onClick={() => goTo('benefits', 'offers')} />
              </section>

              {activeOrders.length > 0 && (
                <section aria-labelledby="active-heading">
                  <div className="acc-section-head"><h2 id="active-heading">進行中のご注文</h2></div>
                  <div style={{ marginBottom: '12px' }}><ReadyAlertButton target={{ member: true }} compact /></div>
                  <div className="acc-grid-2">{activeOrders.map(order => <ActiveOrder key={order.token} order={order} />)}</div>
                </section>
              )}

              <section aria-labelledby="offers-heading">
                <div className="acc-section-head">
                  <h2 id="offers-heading"><Sparkles size={18} aria-hidden="true" style={{ verticalAlign: '-3px', color: 'var(--gold)' }} /> あなたへの特典</h2>
                  {usableOffers.length > 2 && <button type="button" className="acc-link" onClick={() => goTo('benefits', 'offers')}>すべて見る<ChevronRight size={16} aria-hidden="true" /></button>}
                </div>
                <OffersList offers={offers} limit={2} />
              </section>

              <section aria-labelledby="recent-heading">
                <div className="acc-section-head">
                  <h2 id="recent-heading">最近のご注文</h2>
                  {pastOrders.length > 0 && <button type="button" className="acc-link" onClick={() => goTo('orders')}>注文履歴<ChevronRight size={16} aria-hidden="true" /></button>}
                </div>
                {orders === null ? (
                  <div className="acc-card acc-empty" aria-busy="true">読み込み中…</div>
                ) : pastOrders.length === 0 ? (
                  <EmptyOrders />
                ) : (
                  <div className="acc-card" style={{ padding: '4px 16px' }}>
                    {pastOrders.slice(0, 3).map((order, index) => (
                      <button
                        key={order.token}
                        type="button"
                        onClick={() => goTo('orders')}
                        className="acc-order-row"
                        style={{ borderTop: index ? '1px solid var(--acc-border)' : 'none' }}
                      >
                        <span className="acc-stat-icon" style={{ width: 40, height: 40 }}><Receipt size={18} aria-hidden="true" /></span>
                        <span style={{ flex: 1, minWidth: 0 }}>
                          <span style={{ display: 'block', fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {order.items.map(line => line.nameJa || line.nameEn).join('、')}
                          </span>
                          <span style={{ display: 'block', color: 'var(--acc-muted)', fontSize: '0.8rem' }}>
                            {fulfillmentLabel(order.fulfillment)} ・ {formatDateTime(order.pickupAt)} ・ {statusLabel(order.status, order.fulfillment)}
                          </span>
                        </span>
                        <span style={{ fontWeight: 700, whiteSpace: 'nowrap' }}>{yen(amountDue(order).amount)}</span>
                        <ChevronRight size={18} aria-hidden="true" style={{ color: 'var(--acc-muted)', flexShrink: 0 }} />
                      </button>
                    ))}
                  </div>
                )}
              </section>
            </>
          )}

          {tab === 'orders' && (
            orders === null ? (
              <div className="acc-card acc-empty" aria-busy="true">読み込み中…</div>
            ) : orders.length === 0 ? (
              <EmptyOrders />
            ) : (
              <div style={{ display: 'grid', gap: '14px' }}>{orders.map(order => <OrderCard key={order.token} order={order} />)}</div>
            )
          )}

          {tab === 'benefits' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '28px' }}>
              <DailyGameBanner onRewardClaimed={handleGameRewardClaimed} compact />

              {/* Summary Cards */}
              <div className="benefits-summary-bar">
                <button
                  type="button"
                  className={`benefits-summary-item ${subFilter === 'points' ? 'is-active' : ''}`}
                  onClick={() => selectFilter(subFilter === 'points' ? 'all' : 'points')}
                >
                  <div className="benefits-summary-label">
                    <Coins size={16} style={{ color: 'var(--gold)' }} aria-hidden="true" /> アダルサポイント
                  </div>
                  <div className="benefits-summary-value">
                    {balance.toLocaleString('ja-JP')}<span style={{ fontSize: '0.85rem', marginLeft: '3px' }}>pt</span>
                  </div>
                  <div className="benefits-summary-sub">
                    {yen(balance * (loyalty?.pointValueYen ?? 1))}分として利用可能
                  </div>
                </button>

                {showStamps && stampCard && (
                  <button
                    type="button"
                    className={`benefits-summary-item ${subFilter === 'stamps' ? 'is-active' : ''}`}
                    onClick={() => selectFilter(subFilter === 'stamps' ? 'all' : 'stamps')}
                  >
                    <div className="benefits-summary-label">
                      <Sparkles size={16} style={{ color: 'var(--acc-accent)' }} aria-hidden="true" /> スタンプカード
                    </div>
                    <div className="benefits-summary-value">
                      {stampCard.stamps} <span style={{ fontSize: '0.9rem', color: 'var(--acc-muted)' }}>/ {stampCard.perCard}個</span>
                    </div>
                    <div className="benefits-summary-sub">
                      {(() => {
                        const nextMilestone = stampCard.milestones.find(m => m.at > stampCard.stamps);
                        return nextMilestone
                          ? `あと${nextMilestone.at - stampCard.stamps}個で「${nextMilestone.titleJa}」`
                          : stampCard.rewards.length > 0
                            ? `${stampCard.rewards.length}件のスタンプ特典を獲得済み`
                            : 'スタンプを集めて特典獲得';
                      })()}
                    </div>
                  </button>
                )}

                <button
                  type="button"
                  className={`benefits-summary-item ${subFilter === 'offers' ? 'is-active' : ''}`}
                  onClick={() => selectFilter(subFilter === 'offers' ? 'all' : 'offers')}
                >
                  <div className="benefits-summary-label">
                    <Ticket size={16} style={{ color: 'var(--spice)' }} aria-hidden="true" /> 特別オファー
                  </div>
                  <div className="benefits-summary-value">
                    {usableOffers.length}<span style={{ fontSize: '0.85rem', marginLeft: '3px' }}>件</span>
                  </div>
                  <div className="benefits-summary-sub">
                    {usableOffers.length > 0 ? '今すぐオンライン注文で使えます' : '新しい特典をお楽しみに'}
                  </div>
                </button>
              </div>

              {/* Filter Pills */}
              <div className="benefits-pill-nav" role="tablist" aria-label="表示フィルター">
                <button
                  type="button"
                  role="tab"
                  aria-selected={subFilter === 'all'}
                  className={`benefits-pill ${subFilter === 'all' ? 'is-active' : ''}`}
                  onClick={() => selectFilter('all')}
                >
                  すべて
                </button>
                <button
                  type="button"
                  role="tab"
                  aria-selected={subFilter === 'points'}
                  className={`benefits-pill ${subFilter === 'points' ? 'is-active' : ''}`}
                  onClick={() => selectFilter('points')}
                >
                  <Coins size={15} aria-hidden="true" /> ポイント
                </button>
                {showStamps && (
                  <button
                    type="button"
                    role="tab"
                    aria-selected={subFilter === 'stamps'}
                    className={`benefits-pill ${subFilter === 'stamps' ? 'is-active' : ''}`}
                    onClick={() => selectFilter('stamps')}
                  >
                    <Sparkles size={15} aria-hidden="true" /> スタンプカード
                  </button>
                )}
                <button
                  type="button"
                  role="tab"
                  aria-selected={subFilter === 'offers'}
                  className={`benefits-pill ${subFilter === 'offers' ? 'is-active' : ''}`}
                  onClick={() => selectFilter('offers')}
                >
                  <Ticket size={15} aria-hidden="true" /> 特別オファー
                  {usableOffers.length > 0 && <span className="benefits-pill-badge">{usableOffers.length}</span>}
                </button>
              </div>

              {/* 1. Points section */}
              {(subFilter === 'all' || subFilter === 'points') && (
                <section aria-labelledby="benefits-points-heading">
                  {subFilter === 'all' && (
                    <div className="acc-section-head">
                      <h2 id="benefits-points-heading" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <Coins size={18} style={{ color: 'var(--gold)' }} aria-hidden="true" /> アダルサポイント
                      </h2>
                    </div>
                  )}
                  <PointsPanel balance={balance} history={points?.history ?? []} loyalty={loyalty} />
                </section>
              )}

              {/* 2. Stamp Card & Rewards section */}
              {showStamps && stampCard && (subFilter === 'all' || subFilter === 'stamps') && (
                <section aria-labelledby="benefits-stamps-heading" style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                  {subFilter === 'all' && (
                    <div className="acc-section-head">
                      <h2 id="benefits-stamps-heading" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <Sparkles size={18} style={{ color: 'var(--acc-accent)' }} aria-hidden="true" /> スタンプカード
                      </h2>
                    </div>
                  )}
                  <StampCard card={stampCard} memberName={customer.name} onCardUpdate={handleCardUpdate} />
                  <StampRewards card={stampCard} />
                </section>
              )}

              {/* 3. Special Offers section */}
              {(subFilter === 'all' || subFilter === 'offers') && (
                <section aria-labelledby="benefits-offers-heading">
                  <div className="acc-section-head">
                    <h2 id="benefits-offers-heading" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <Ticket size={18} style={{ color: 'var(--spice)' }} aria-hidden="true" /> 特別オファー・クーポン
                    </h2>
                    {usableOffers.length > 0 && (
                      <span style={{ fontSize: '0.85rem', color: 'var(--acc-muted)', fontWeight: 600 }}>
                        {usableOffers.length}件利用可能
                      </span>
                    )}
                  </div>
                  <OffersList offers={offers} />
                </section>
              )}
            </div>
          )}
          {tab === 'settings' && <ProfilePanel customer={customer} />}
        </main>
      </div>

      <nav className="acc-tabbar" aria-label="マイページ">{navButtons}</nav>
    </div>
  );
}

function Stat({ icon: Icon, value, label, onClick }: { icon: LucideIcon; value: string; label: string; onClick?: () => void }) {
  const body = (
    <>
      <span className="acc-stat-icon"><Icon size={20} aria-hidden="true" /></span>
      <span>
        <span className="acc-stat-value" style={{ display: 'block' }}>{value}</span>
        <span className="acc-stat-label">{label}</span>
      </span>
    </>
  );
  return onClick ? (
    <button type="button" onClick={onClick} className="acc-card acc-stat" style={{ font: 'inherit', color: 'inherit', textAlign: 'left', cursor: 'pointer' }}>{body}</button>
  ) : (
    <div className="acc-card acc-stat">{body}</div>
  );
}

function ActiveOrder({ order }: { order: MemberOrder }) {
  const step = TRACKER_STEPS.indexOf(order.status);
  return (
    <Link to={`/order/${order.token}`} className="acc-card acc-tracker" style={{ color: 'inherit', textDecoration: 'none' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '12px' }}>
        <div>
          <div style={{ color: 'var(--acc-muted)', fontSize: '0.8rem' }}>受付番号</div>
          <div style={{ fontFamily: 'var(--font-display)', fontSize: '1.8rem', fontWeight: 700, color: 'var(--acc-accent)', lineHeight: 1 }}>{formatOrderNumber(order.number)}</div>
        </div>
        <div style={{ textAlign: 'right' }}>
          <div style={{ fontWeight: 700 }}>{order.fulfillment === 'DELIVERY' ? '🛵 ' : ''}{statusLabel(order.status, order.fulfillment)}</div>
          <div style={{ color: 'var(--acc-muted)', fontSize: '0.8rem' }}>{timeWord(order.fulfillment)} {formatDateTime(order.pickupAt)}</div>
        </div>
      </div>
      <div className="acc-tracker-steps">
        {TRACKER_STEPS.map((status, index) => (
          <div key={status} className={`acc-tracker-step${index <= step ? ' is-done' : ''}`}>{statusLabel(status, order.fulfillment)}</div>
        ))}
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.88rem' }}>
        <span style={{ color: 'var(--acc-muted)' }}>{order.items.reduce((sum, line) => sum + line.quantity, 0)}点 ・ {yen(amountDue(order).amount)}</span>
        <span className="acc-link">詳しく見る<ChevronRight size={16} aria-hidden="true" /></span>
      </div>
    </Link>
  );
}

function EmptyOrders() {
  return (
    <div className="acc-card acc-empty">
      <ShoppingBag size={36} aria-hidden="true" style={{ color: 'var(--acc-accent)' }} />
      <div>まだご注文はありません。<br />最初のご注文でポイントを貯めましょう。</div>
      <Link to="/menu/takeout" className="acc-btn">テイクアウトメニューを見る</Link>
    </div>
  );
}
