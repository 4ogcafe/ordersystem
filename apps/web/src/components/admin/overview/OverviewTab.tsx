import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import {
  AlertTriangle,
  ArrowDownRight,
  ArrowUpRight,
  Banknote,
  Bike,
  Building2,
  CalendarDays,
  CheckCircle2,
  ChefHat,
  Clock,
  CreditCard,
  Download,
  Mail,
  MapPin,
  PauseCircle,
  RefreshCw,
  ShoppingBag,
  Table2,
  UtensilsCrossed,
} from 'lucide-react';
import { apiFetch } from '../../../lib/api';
import { formatOrderNumber, yen } from '../../../lib/format';
import { DEFAULT_STORE_LOCATIONS, fetchStores, type StoreLocation } from '../../../lib/stores';
import { SERIES } from './chart-utils';
import { ColumnChart, Heatmap, RampLegend, RankBars, SplitBar } from './charts';
import { toast } from 'react-hot-toast';
import OperationsModeCard from './OperationsModeCard';
import DataBackupPanel from './DataBackupPanel';
import { exportOrdersPdf } from './exportOrdersPdf';
import './overview.css';

const OVERVIEW_STORE_KEY = 'adarsha_overview_store';
const CC_STORE_KEY = 'adarsha_cash_counter_store';

const LIVE_POLL_MS = 30_000;
const ANALYTICS_POLL_MS = 60_000;
const TZ = 'Asia/Tokyo';

type Range = 'today' | 'yesterday' | '7d' | '30d' | '90d' | 'month' | 'custom';
const RANGES: { value: Range; label: string }[] = [
  { value: 'today', label: 'Today' },
  { value: 'yesterday', label: 'Yesterday' },
  { value: '7d', label: '7 days' },
  { value: '30d', label: '30 days' },
  { value: '90d', label: '90 days' },
  { value: 'month', label: 'This month' },
  { value: 'custom', label: 'Custom' },
];
// Monday first, matching how staff plan the week.
const WEEK = [
  { label: 'Mon', index: 1 },
  { label: 'Tue', index: 2 },
  { label: 'Wed', index: 3 },
  { label: 'Thu', index: 4 },
  { label: 'Fri', index: 5 },
  { label: 'Sat', index: 6 },
  { label: 'Sun', index: 0 },
];
const STATUS_LABEL: Record<string, string> = { NEW: 'New', CONFIRMED: 'Cooking', READY: 'Ready', COMPLETED: 'Completed', CANCELLED: 'Cancelled' };
const MESSAGE_LABEL: Record<string, string> = { GENERAL: 'General', RESERVATION: 'Reservation', CATERING: 'Catering', FEEDBACK: 'Feedback' };

interface Headline {
  sales: number;
  orders: number;
  averageOrder: number | null;
  itemsSold: number;
  cancelled: number;
  cancelRate: number | null;
  averagePrepMinutes: number | null;
  onTimeRate: number | null;
  discounts: number;
  deliveryFees: number;
  memberOrders: number;
  memberShare: number | null;
}

interface Analytics {
  period: { range: Range; start: string; end: string; bucket: 'hour' | 'day'; days: string[] };
  headline: Headline;
  previous: Headline;
  change: { sales: number | null; orders: number | null; averageOrder: number | null; newMembers: number | null };
  series: { key: string; sales: number; orders: number; cancelled: number }[];
  busyHours: number[][];
  topItems: { nameEn: string; nameJa: string | null; quantity: number; sales: number; orders: number }[];
  fulfillment: Record<'PICKUP' | 'DELIVERY', { orders: number; sales: number }>;
  promotions: { title: string; uses: number; discount: number }[];
  members: { total: number; new: number; previousNew: number; newsletter: number; buyers: number; returning: number };
  loyalty: { pointsEarned: number; pointsRedeemed: number; pointsOutstanding: number; stampsGiven: number; rewardsEarned: number; rewardsUsed: number };
  messages: Record<string, number>;
  byStore?: { storeId: string; name: string; sales: number; orders: number; averageOrder: number | null }[];
  storeId?: string | null;
}

interface Live {
  serverTime: string;
  storeId?: string | null;
  open: { NEW: number; CONFIRMED: number; READY: number; late: number; nextDue: { number: number; customerName: string; pickupAt: string } | null };
  today: { placed: number; completed: number; cancelled: number; sales: number | null };
  ordering: {
    pausedUntil: string | null;
    pickup: { enabled: boolean };
    delivery: { enabled: boolean };
    dineIn?: { enabled: boolean };
    stampCard: boolean;
    liveOffers: number;
    masterEnabled?: boolean;
    switches?: {
      orderingEnabled: boolean;
      pickupEnabled: boolean;
      deliveryEnabled: boolean;
      dineInEnabled: boolean;
    };
    maintenanceMode?: boolean;
    maintenanceMessageJa?: string;
  };
  register?: { isOpen: boolean; openedAt?: string; openedBy?: string; startingFloat?: number } | null;
  devices?: { active: number; paired: number };
  recentOrders: { id: string; number: number; status: string; fulfillment?: string; customerName: string; member: boolean; amount: number | null; createdAt: string; pickupAt: string; storeId?: string | null }[];
  messages: { unread: number; recent: { id: string; name: string; type: string; isRead: boolean; createdAt: string; date?: string | null; guests?: number | null }[] };
  reservations: { id: string; name: string; date: string; guests: number | null; isRead: boolean; message?: string }[];
  menu: { total: number; soldOut: string[] };
}

interface BranchSnapshot {
  storeId: string;
  name: string;
  area?: string;
  phone?: string;
  open: { NEW: number; CONFIRMED: number; READY: number; late: number; total: number };
  today: { placed: number; completed: number; cancelled: number; sales: number | null };
  register: { isOpen: boolean; openedAt?: string; openedBy?: string };
  devices: { active: number };
}

const time = (iso: string) => new Date(iso).toLocaleTimeString('ja-JP', { timeZone: TZ, hour: '2-digit', minute: '2-digit' });
const dateTime = (iso: string) => new Date(iso).toLocaleString('ja-JP', { timeZone: TZ, month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' });
const dayLabel = (key: string) => {
  const date = new Date(`${key}T00:00:00Z`);
  return `${date.getUTCMonth() + 1}/${date.getUTCDate()}`;
};
const longDay = (key: string) => new Date(`${key}T00:00:00Z`).toLocaleDateString('en-GB', { timeZone: 'UTC', weekday: 'short', day: 'numeric', month: 'short' });
const percent = (value: number | null) => (value === null ? '–' : `${Math.round(value * 100)}%`);
const todayKey = () => new Date().toLocaleDateString('sv-SE', { timeZone: TZ });

/** Live operations for everyone; sales, customers and loyalty analytics for admins. */
export default function OverviewTab({ isAdmin, onNavigate }: { isAdmin: boolean; onNavigate: (tab: string) => void }) {
  const [live, setLive] = useState<Live | null>(null);
  const [analytics, setAnalytics] = useState<Analytics | null>(null);
  const [branches, setBranches] = useState<BranchSnapshot[]>([]);
  const [stores, setStores] = useState<StoreLocation[]>(DEFAULT_STORE_LOCATIONS);
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(false);
  const [storeFilter, setStoreFilter] = useState<string>(() => {
    try {
      return sessionStorage.getItem(OVERVIEW_STORE_KEY) || 'ALL';
    } catch {
      return 'ALL';
    }
  });
  const [range, setRange] = useState<Range>(() => {
    try {
      return (sessionStorage.getItem('adarsha_overview_range') as Range) || '7d';
    } catch {
      return '7d';
    }
  });
  const [custom, setCustom] = useState(() => ({ from: todayKey(), to: todayKey() }));
  const [updatedAt, setUpdatedAt] = useState<Date | null>(null);
  const [exportingPdf, setExportingPdf] = useState(false);

  const storeQ = storeFilter && storeFilter !== 'ALL' ? `&storeId=${encodeURIComponent(storeFilter)}` : '';
  const query = (range === 'custom' ? `range=custom&from=${custom.from}&to=${custom.to}` : `range=${range}`) + storeQ;
  const rangeLabel = RANGES.find(r => r.value === range)?.label ?? range;
  const activeStore = useMemo(
    () => (storeFilter === 'ALL' ? null : stores.find(s => s.id === storeFilter) || null),
    [storeFilter, stores],
  );

  const selectStore = (id: string) => {
    setStoreFilter(id);
    try { sessionStorage.setItem(OVERVIEW_STORE_KEY, id); } catch { /* ignore */ }
  };

  const openCashCounterFor = (storeId: string) => {
    try { localStorage.setItem(CC_STORE_KEY, storeId); } catch { /* ignore */ }
    onNavigate('Cash Counter');
  };

  const handleExportOrdersPdf = async () => {
    setExportingPdf(true);
    try {
      await exportOrdersPdf(query, rangeLabel + (activeStore ? ` · ${activeStore.name}` : ' · All branches'));
      toast.success('印刷ダイアログで「PDFに保存」を選んでください', { duration: 5000 });
    } catch (err: any) {
      toast.error(err?.message || 'PDFの出力に失敗しました');
    } finally {
      setExportingPdf(false);
    }
  };

  const loadLive = useCallback(() => {
    const qs = storeFilter !== 'ALL' ? `?storeId=${encodeURIComponent(storeFilter)}` : '';
    apiFetch(`/api/v1/dashboard/live${qs}`)
      .then(res => (res.ok ? res.json() : Promise.reject(new Error(String(res.status)))))
      .then((data: Live) => {
        setLive(data);
        setUpdatedAt(new Date());
        setFailed(false);
      })
      .catch(() => setFailed(true));
  }, [storeFilter]);

  const loadBranches = useCallback(() => {
    apiFetch('/api/v1/dashboard/branches')
      .then(res => (res.ok ? res.json() : Promise.reject(new Error(String(res.status)))))
      .then((data: { branches?: BranchSnapshot[] }) => {
        setBranches(Array.isArray(data.branches) ? data.branches : []);
      })
      .catch(() => undefined);
  }, []);

  const loadAnalytics = useCallback(() => {
    if (!isAdmin) return;
    setLoading(true);
    apiFetch(`/api/v1/dashboard/analytics?${query}`)
      .then(res => (res.ok ? res.json() : Promise.reject(new Error(String(res.status)))))
      .then((data: Analytics) => {
        setAnalytics(data);
        setFailed(false);
      })
      .catch(() => setFailed(true))
      .finally(() => setLoading(false));
  }, [isAdmin, query]);

  useEffect(() => {
    fetchStores().then(list => {
      if (list?.length) setStores(list);
    }).catch(() => undefined);
  }, []);

  useEffect(() => {
    loadLive();
    loadBranches();
    const intervalId = setInterval(() => {
      loadLive();
      loadBranches();
    }, LIVE_POLL_MS);
    return () => clearInterval(intervalId);
  }, [loadLive, loadBranches]);

  useEffect(() => {
    try {
      sessionStorage.setItem('adarsha_overview_range', range);
    } catch {
      // Not remembered in private mode.
    }
    loadAnalytics();
    const includesToday = range !== 'yesterday' && (range !== 'custom' || custom.to >= todayKey());
    if (!includesToday) return;
    const intervalId = setInterval(loadAnalytics, ANALYTICS_POLL_MS);
    return () => clearInterval(intervalId);
  }, [loadAnalytics, range, custom.to]);

  const refresh = () => {
    loadLive();
    loadBranches();
    loadAnalytics();
  };

  return (
    <div className="ov">
      <div className="ov-filters" role="group" aria-label="Branch">
        <div className="ov-segments ov-branch-segments">
          <button type="button" aria-pressed={storeFilter === 'ALL'} onClick={() => selectStore('ALL')}>
            <Building2 size={14} /> All branches
          </button>
          {stores.map(store => (
            <button
              key={store.id}
              type="button"
              aria-pressed={storeFilter === store.id}
              onClick={() => selectStore(store.id)}
              title={store.name}
            >
              {store.name.replace(/^アダルサ\s*/, '')}
            </button>
          ))}
        </div>
      </div>

      {isAdmin && (
        <div className="ov-filters" role="group" aria-label="Period">
          <div className="ov-segments">
            {RANGES.map(option => (
              <button key={option.value} type="button" aria-pressed={range === option.value} onClick={() => setRange(option.value)}>
                {option.label}
              </button>
            ))}
          </div>
          {range === 'custom' && (
            <div className="ov-dates">
              <label>From <input type="date" value={custom.from} max={custom.to} onChange={e => e.target.value && setCustom(c => ({ ...c, from: e.target.value }))} /></label>
              <label>To <input type="date" value={custom.to} min={custom.from} max={todayKey()} onChange={e => e.target.value && setCustom(c => ({ ...c, to: e.target.value }))} /></label>
            </div>
          )}
          <div className="ov-filter-actions">
            <span className="ov-muted">{updatedAt ? `Updated ${updatedAt.toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}` : ''}</span>
            <button type="button" className="ov-btn" onClick={refresh} aria-label="Refresh"><RefreshCw size={16} className={loading ? 'ov-spin' : undefined} /> Refresh</button>
            <button type="button" className="ov-btn" onClick={handleExportOrdersPdf} disabled={exportingPdf}>
              <Download size={16} /> {exportingPdf ? 'Preparing PDF…' : 'Export orders (PDF)'}
            </button>
          </div>
        </div>
      )}

      {failed && <div className="ov-alert" role="alert"><AlertTriangle size={16} /> Some figures couldn't be loaded. They'll retry automatically, or press Refresh.</div>}

      {storeFilter === 'ALL' && (
        <BranchBoard
          branches={branches}
          isAdmin={isAdmin}
          onSelect={selectStore}
          onCashCounter={openCashCounterFor}
          onNavigate={onNavigate}
        />
      )}

      <LiveSection
        live={live}
        onNavigate={onNavigate}
        isAdmin={isAdmin}
        onRefresh={refresh}
        store={activeStore}
        onCashCounter={activeStore ? () => openCashCounterFor(activeStore.id) : undefined}
      />

      {isAdmin && (
        <DataBackupPanel
          ordersQuery={query}
          analyticsJson={analytics}
          rangeLabel={rangeLabel}
        />
      )}

      {isAdmin && analytics && (
        <div className={loading ? 'ov-refetching' : undefined}>
          <AnalyticsSection data={analytics} onNavigate={onNavigate} storeName={activeStore?.name || null} />
        </div>
      )}
      {isAdmin && !analytics && !failed && <div className="ov-card ov-muted" aria-busy="true">Loading analytics…</div>}
    </div>
  );
}

// ---- Right now -------------------------------------------------------------

function BranchBoard({
  branches,
  isAdmin,
  onSelect,
  onCashCounter,
  onNavigate,
}: {
  branches: BranchSnapshot[];
  isAdmin: boolean;
  onSelect: (storeId: string) => void;
  onCashCounter: (storeId: string) => void;
  onNavigate: (tab: string) => void;
}) {
  if (branches.length === 0) {
    return <div className="ov-card ov-muted" aria-busy="true">Loading branches…</div>;
  }
  return (
    <section aria-labelledby="ov-branches">
      <div className="ov-section-head">
        <h2 id="ov-branches"><Building2 size={18} /> All branches</h2>
        <span className="ov-muted">Separate live figures per store · click a card to focus</span>
      </div>
      <div className="ov-branch-grid">
        {branches.map(b => {
          const short = b.name.replace(/^アダルサ\s*/, '');
          return (
            <div key={b.storeId} className="ov-card ov-branch-card">
              <div className="ov-card-head">
                <h3><MapPin size={15} /> {short}</h3>
                <span className={`ov-reg-pill ${b.register.isOpen ? 'is-open' : 'is-closed'}`}>
                  {b.register.isOpen ? 'レジ開設中' : 'レジ未開設'}
                </span>
              </div>
              {b.area && <div className="ov-muted" style={{ marginBottom: 8 }}>{b.area}</div>}
              <div className="ov-open" style={{ marginBottom: 8 }}>
                <OpenCount label="New" value={b.open.NEW} tone={b.open.NEW ? 'warning' : undefined} />
                <OpenCount label="Cooking" value={b.open.CONFIRMED} />
                <OpenCount label="Ready" value={b.open.READY} />
              </div>
              {b.open.late > 0 && (
                <Status tone="critical" icon={<AlertTriangle size={14} />}>{b.open.late} past due</Status>
              )}
              <dl className="ov-mini" style={{ marginTop: 8 }}>
                <div><dt>Today orders</dt><dd>{b.today.placed}</dd></div>
                <div><dt>Completed</dt><dd>{b.today.completed}</dd></div>
                {isAdmin && <div><dt>Sales</dt><dd>{yen(b.today.sales ?? 0)}</dd></div>}
                <div><dt>Devices</dt><dd>{b.devices.active}</dd></div>
              </dl>
              <div className="ov-branch-actions">
                <button type="button" className="ov-btn ov-btn-sm" onClick={() => onSelect(b.storeId)}>View branch</button>
                <button type="button" className="ov-btn ov-btn-sm" onClick={() => onCashCounter(b.storeId)}>
                  <Banknote size={13} /> Cash counter
                </button>
                <button type="button" className="ov-link" onClick={() => onNavigate('Payment Devices')}>
                  <CreditCard size={13} /> Devices
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}

function LiveSection({
  live,
  isAdmin,
  onNavigate,
  onRefresh,
  store,
  onCashCounter,
}: {
  live: Live | null;
  isAdmin: boolean;
  onNavigate: (tab: string) => void;
  onRefresh: () => void;
  store?: StoreLocation | null;
  onCashCounter?: () => void;
}) {
  if (!live) return <div className="ov-card ov-muted" aria-busy="true">Loading…</div>;
  const openTotal = live.open.NEW + live.open.CONFIRMED + live.open.READY;
  const switches = live.ordering.switches ?? {
    orderingEnabled: live.ordering.masterEnabled !== false,
    pickupEnabled: live.ordering.pickup.enabled,
    deliveryEnabled: live.ordering.delivery.enabled,
    dineInEnabled: Boolean(live.ordering.dineIn?.enabled),
  };
  const anyChannel =
    live.ordering.pickup.enabled || live.ordering.delivery.enabled || Boolean(live.ordering.dineIn?.enabled);
  const orderingOff = switches.orderingEnabled === false || !anyChannel || Boolean(live.ordering.maintenanceMode);
  const scopeLabel = store ? store.name.replace(/^アダルサ\s*/, '') : 'All branches';

  return (
    <section aria-labelledby="ov-live">
      <div className="ov-section-head">
        <h2 id="ov-live"><span className="ov-pulse" aria-hidden="true" /> Right now · {scopeLabel}</h2>
        <span className="ov-muted">Updates every 30 seconds</span>
      </div>

      {!store && (
        <OperationsModeCard
          isAdmin={isAdmin}
          switches={switches}
          pausedUntil={live.ordering.pausedUntil}
          maintenanceMode={Boolean(live.ordering.maintenanceMode)}
          maintenanceMessageJa={live.ordering.maintenanceMessageJa}
          onChanged={onRefresh}
        />
      )}

      {store && (
        <div className="ov-card ov-branch-ops">
          <div className="ov-card-head">
            <h3><MapPin size={16} /> {store.name}</h3>
            <span className="ov-muted">{store.phone}</span>
          </div>
          <div className="ov-branch-ops-grid">
            <div>
              <div className="ov-kpi-label">Cash register</div>
              {live.register?.isOpen ? (
                <Status tone="good" icon={<CheckCircle2 size={14} />}>
                  Open{live.register.openedBy ? ` · ${live.register.openedBy}` : ''}
                </Status>
              ) : (
                <Status tone="warning" icon={<AlertTriangle size={14} />}>Not opened</Status>
              )}
            </div>
            <div>
              <div className="ov-kpi-label">Payment devices</div>
              <div style={{ fontWeight: 700 }}>{live.devices?.active ?? 0} active</div>
            </div>
            <div className="ov-branch-actions">
              {onCashCounter && (
                <button type="button" className="ov-btn ov-btn-sm" onClick={onCashCounter}>
                  <Banknote size={13} /> Cash counter
                </button>
              )}
              <a href="/kitchen" target="_blank" rel="noopener" className="ov-btn ov-btn-sm"><ChefHat size={13} /> Kitchen ↗</a>
              <button type="button" className="ov-btn ov-btn-sm" onClick={() => onNavigate('Payment Devices')}>
                <CreditCard size={13} /> Devices
              </button>
              <button type="button" className="ov-btn ov-btn-sm" onClick={() => onNavigate('Orders')}>Orders</button>
            </div>
          </div>
        </div>
      )}

      <div className="ov-live-grid">
        <div className="ov-card">
          <div className="ov-card-head">
            <h3><ShoppingBag size={16} /> Open orders</h3>
            <button type="button" className="ov-link" onClick={() => onNavigate('Orders')}>Orders →</button>
          </div>
          <div className="ov-open">
            <OpenCount label="New" value={live.open.NEW} tone={live.open.NEW ? 'warning' : undefined} />
            <OpenCount label="Cooking" value={live.open.CONFIRMED} />
            <OpenCount label="Ready" value={live.open.READY} />
          </div>
          {live.open.late > 0 ? (
            <Status tone="critical" icon={<AlertTriangle size={14} />}>{live.open.late} order{live.open.late === 1 ? '' : 's'} past due time</Status>
          ) : openTotal > 0 ? (
            <Status tone="good" icon={<CheckCircle2 size={14} />}>All on time</Status>
          ) : (
            <span className="ov-muted">No open orders</span>
          )}
          {live.open.nextDue && (
            <div className="ov-muted" style={{ marginTop: 6 }}>Next due: #{formatOrderNumber(live.open.nextDue.number)} {live.open.nextDue.customerName} at {time(live.open.nextDue.pickupAt)}</div>
          )}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', marginTop: 8 }}>
            {onCashCounter ? (
              <button type="button" className="ov-link" onClick={onCashCounter}><Banknote size={14} /> Open cash counter (this branch)</button>
            ) : (
              <a href="/cash-counter" target="_blank" rel="noopener" className="ov-link"><Banknote size={14} /> Open cash counter ↗</a>
            )}
            <a href="/kitchen" target="_blank" rel="noopener" className="ov-link"><ChefHat size={14} /> Open kitchen display ↗</a>
          </div>
        </div>

        <div className="ov-card">
          <div className="ov-card-head"><h3><CalendarDays size={16} /> Today so far</h3></div>
          <dl className="ov-mini">
            {isAdmin && <div><dt>Sales</dt><dd>{yen(live.today.sales ?? 0)}</dd></div>}
            <div><dt>Orders placed</dt><dd>{live.today.placed}</dd></div>
            <div><dt>Completed</dt><dd>{live.today.completed}</dd></div>
            <div><dt>Cancelled</dt><dd>{live.today.cancelled}</dd></div>
          </dl>
        </div>

        <div className="ov-card">
          <div className="ov-card-head">
            <h3><Bike size={16} /> Online ordering</h3>
            <button type="button" className="ov-link" onClick={() => onNavigate('Orders')}>Channel settings →</button>
          </div>
          <ul className="ov-checks">
            {live.ordering.maintenanceMode && (
              <li><Status tone="warning" icon={<PauseCircle size={14} />}>Maintenance mode on</Status></li>
            )}
            {live.ordering.pausedUntil && (
              <li><Status tone="warning" icon={<PauseCircle size={14} />}>Paused by kitchen until {time(live.ordering.pausedUntil)}</Status></li>
            )}
            <li><OnOff on={switches.orderingEnabled} label="Master" /></li>
            <li><OnOff on={live.ordering.pickup.enabled} label="Pickup" /></li>
            <li><OnOff on={live.ordering.delivery.enabled} label="Delivery" /></li>
            <li><OnOff on={Boolean(live.ordering.dineIn?.enabled)} label="Dine-in" /></li>
            <li><OnOff on={live.ordering.stampCard} label="Stamp card" /></li>
            <li><span className="ov-muted">{live.ordering.liveOffers} live offer{live.ordering.liveOffers === 1 ? '' : 's'}</span></li>
          </ul>
          {orderingOff && <Status tone="critical" icon={<AlertTriangle size={14} />}>Customers can't order online</Status>}
        </div>

        <div className="ov-card">
          <div className="ov-card-head">
            <h3><UtensilsCrossed size={16} /> Menu</h3>
            <button type="button" className="ov-link" onClick={() => onNavigate('Menu Management')}>Menu →</button>
          </div>
          {live.menu.soldOut.length === 0 ? (
            <Status tone="good" icon={<CheckCircle2 size={14} />}>All {live.menu.total} items available</Status>
          ) : (
            <>
              <Status tone="warning" icon={<AlertTriangle size={14} />}>{live.menu.soldOut.length} sold out</Status>
              <p className="ov-muted ov-wrap" style={{ margin: '6px 0 0' }}>{live.menu.soldOut.join('、')}</p>
            </>
          )}
        </div>
      </div>

      <div className="ov-two">
        <div className="ov-card">
          <div className="ov-card-head">
            <h3>Latest orders</h3>
            <button type="button" className="ov-link" onClick={() => onNavigate('Orders')}>All orders →</button>
          </div>
          {live.recentOrders.length === 0 ? (
            <p className="ov-muted">No orders yet.</p>
          ) : (
            <div className="ov-table-wrap">
              <table className="ov-table">
                <thead><tr><th>No.</th><th>Customer</th><th>Type</th><th>Status</th><th>Due</th>{isAdmin && <th className="num">Amount</th>}</tr></thead>
                <tbody>
                  {live.recentOrders.map(order => (
                    <tr key={order.id}>
                      <td className="num">#{formatOrderNumber(order.number)}</td>
                      <td>{order.customerName}{order.member && <span className="ov-tag">Member</span>}</td>
                      <td>{order.fulfillment === 'DELIVERY' ? 'Delivery' : 'Pickup'}</td>
                      <td><span className={`ov-status ov-status-${order.status.toLowerCase()}`}>{STATUS_LABEL[order.status] ?? order.status}</span></td>
                      <td className="num">{dateTime(order.pickupAt)}</td>
                      {isAdmin && <td className="num">{order.amount === null ? '–' : yen(order.amount)}</td>}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <div className="ov-stack">
          <div className="ov-card">
            <div className="ov-card-head">
              <h3><Mail size={16} /> Messages {live.messages.unread > 0 && <span className="ov-badge">{live.messages.unread} unread</span>}</h3>
              <button type="button" className="ov-link" onClick={() => onNavigate('Contact Messages')}>Inbox →</button>
            </div>
            {live.messages.recent.length === 0 ? (
              <p className="ov-muted">No messages.</p>
            ) : (
              <ul className="ov-list">
                {live.messages.recent.map(message => (
                  <li key={message.id} className={message.isRead ? undefined : 'is-unread'}>
                    <span>{message.name} <span className="ov-muted">· {MESSAGE_LABEL[message.type] ?? message.type}</span></span>
                    <span className="ov-muted num">{dateTime(message.createdAt)}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
          <div className="ov-card">
            <div className="ov-card-head"><h3><Clock size={16} /> Upcoming reservations</h3></div>
            {live.reservations.length === 0 ? (
              <p className="ov-muted">No upcoming reservation requests.</p>
            ) : (
              <ul className="ov-list">
                {live.reservations.map(reservation => {
                  const storeMatch = reservation.message?.match(/【(?:ご予約希望店舗|店舗|予約店舗):\s*([^】\n]+)】/);
                  const storeName = storeMatch ? storeMatch[1].replace('アダルサ ', '') : null;
                  return (
                    <li
                      key={reservation.id}
                      className={reservation.isRead ? undefined : 'is-unread'}
                      onClick={() => onNavigate('Contact Messages')}
                      style={{ cursor: 'pointer' }}
                      title="Click to view reservation in Contact Messages"
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        {storeName && (
                          <span style={{ fontSize: '0.72rem', padding: '1px 6px', borderRadius: '4px', backgroundColor: '#faede2', color: '#b3471c', fontWeight: 700 }}>
                            {storeName}
                          </span>
                        )}
                        <span>{reservation.name}{reservation.guests ? <span className="ov-muted"> · {reservation.guests} guests</span> : null}</span>
                      </div>
                      <span className="num">{dateTime(reservation.date)}</span>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}

function OpenCount({ label, value, tone }: { label: string; value: number; tone?: 'warning' }) {
  return (
    <div className={`ov-open-count${tone ? ` is-${tone}` : ''}`}>
      <span className="ov-open-value">{value}</span>
      <span className="ov-muted">{label}</span>
    </div>
  );
}

function Status({ tone, icon, children }: { tone: 'good' | 'warning' | 'critical'; icon: ReactNode; children: ReactNode }) {
  return <span className={`ov-state ov-state-${tone}`}>{icon}{children}</span>;
}

function OnOff({ on, label }: { on: boolean; label: string }) {
  return <Status tone={on ? 'good' : 'critical'} icon={on ? <CheckCircle2 size={14} /> : <AlertTriangle size={14} />}>{label} {on ? 'on' : 'off'}</Status>;
}

// ---- Analytics -------------------------------------------------------------

function AnalyticsSection({ data, onNavigate, storeName }: { data: Analytics; onNavigate: (tab: string) => void; storeName?: string | null }) {
  const { headline: now, previous } = data;
  const [tables, setTables] = useState<Record<string, boolean>>({});
  const toggle = (key: string) => setTables(prev => ({ ...prev, [key]: !prev[key] }));
  const periodName = RANGES.find(r => r.value === data.period.range)?.label ?? '';
  const rangeText = data.period.days.length === 1 ? longDay(data.period.days[0]) : `${longDay(data.period.days[0])} – ${longDay(data.period.days[data.period.days.length - 1])}`;
  const compareText = data.period.days.length === 1 ? 'vs the day before' : `vs previous ${data.period.days.length} days`;
  const scopeNote = storeName ? ` · ${storeName.replace(/^アダルサ\s*/, '')}` : ' · All branches';

  const columns = useMemo(
    () =>
      data.series.map(point => ({
        key: point.key,
        label: data.period.bucket === 'hour' ? point.key : dayLabel(point.key),
        title: data.period.bucket === 'hour' ? `${point.key}:00–${point.key}:59` : longDay(point.key),
        value: point.sales,
        extra: [`${point.orders} order${point.orders === 1 ? '' : 's'}`, ...(point.cancelled ? [`${point.cancelled} cancelled`] : [])],
      })),
    [data],
  );

  // Only the hours that had orders, widened a little, so the heatmap isn't mostly empty night hours.
  const hours = useMemo(() => {
    const used = data.busyHours.flatMap(row => row.map((count, hour) => (count > 0 ? hour : -1))).filter(hour => hour >= 0);
    const from = used.length ? Math.max(0, Math.min(...used, 11) - 1) : 10;
    const to = used.length ? Math.min(23, Math.max(...used, 21) + 1) : 22;
    return Array.from({ length: to - from + 1 }, (_, i) => from + i);
  }, [data.busyHours]);
  const heatGrid = WEEK.map(day => data.busyHours[day.index]);
  const heatMax = Math.max(0, ...data.busyHours.flat());
  const best = data.series.reduce<(typeof data.series)[number] | null>((top, point) => (!top || point.sales > top.sales ? point : top), null);

  const returningRate = data.members.buyers ? data.members.returning / data.members.buyers : null;

  return (
    <section aria-labelledby="ov-analytics">
      <div className="ov-section-head">
        <h2 id="ov-analytics">{periodName === 'Custom' ? 'Selected period' : periodName}{scopeNote}</h2>
        <span className="ov-muted">{rangeText} · Sales are completed orders, tax and delivery included</span>
      </div>

      {!storeName && data.byStore && data.byStore.length > 0 && (
        <div className="ov-card" style={{ marginBottom: 16 }}>
          <div className="ov-card-head"><h3><Building2 size={16} /> Sales by branch</h3></div>
          <div className="ov-table-wrap">
            <table className="ov-table">
              <thead><tr><th>Branch</th><th className="num">Orders</th><th className="num">Avg</th><th className="num">Sales</th></tr></thead>
              <tbody>
                {[...data.byStore].sort((a, b) => b.sales - a.sales).map(row => (
                  <tr key={row.storeId}>
                    <td>{row.name.replace(/^アダルサ\s*/, '')}</td>
                    <td className="num">{row.orders}</td>
                    <td className="num">{row.averageOrder == null ? '–' : yen(row.averageOrder)}</td>
                    <td className="num">{yen(row.sales)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <div className="ov-card">
        <div className="ov-hero">
          <div>
            <div className="ov-kpi-label">Sales</div>
            <div className="ov-hero-value">{yen(now.sales)}</div>
            <Delta value={data.change.sales} goodWhenUp compareText={compareText} previous={yen(previous.sales)} />
          </div>
          <button type="button" className="ov-btn ov-btn-sm" aria-pressed={tables.sales} onClick={() => toggle('sales')}><Table2 size={14} /> {tables.sales ? 'Chart' : 'Table'}</button>
        </div>
        <div className="ov-muted ov-hero-sub">
          {data.period.bucket === 'hour' ? 'By hour' : 'By day'}
          {best && best.sales > 0 ? ` · best ${data.period.bucket === 'hour' ? `${best.key}:00` : longDay(best.key)} (${yen(best.sales)})` : ' · no completed orders yet'}
        </div>
        {tables.sales ? (
          <DataTable head={[data.period.bucket === 'hour' ? 'Hour' : 'Day', 'Sales', 'Orders', 'Cancelled']} rows={columns.map((c, i) => [c.title, yen(c.value), String(data.series[i].orders), String(data.series[i].cancelled)])} />
        ) : (
          <ColumnChart data={columns} format={yen} ariaLabel={`Sales by ${data.period.bucket}. Total ${yen(now.sales)}.`} />
        )}
      </div>

      <div className="ov-kpis">
        <Kpi label="Orders completed" value={String(now.orders)} delta={data.change.orders} compareText={compareText} previous={String(previous.orders)} />
        <Kpi label="Average order" value={now.averageOrder === null ? '–' : yen(now.averageOrder)} delta={data.change.averageOrder} compareText={compareText} previous={previous.averageOrder === null ? '–' : yen(previous.averageOrder)} />
        <Kpi label="Items sold" value={String(now.itemsSold)} delta={rel(now.itemsSold, previous.itemsSold)} compareText={compareText} previous={String(previous.itemsSold)} />
        <Kpi label="Cancelled" value={percent(now.cancelRate)} note={`${now.cancelled} order${now.cancelled === 1 ? '' : 's'}`} delta={rel(now.cancelRate, previous.cancelRate)} goodWhenUp={false} compareText={compareText} previous={percent(previous.cancelRate)} />
        <Kpi label="Average prep time" value={now.averagePrepMinutes === null ? '–' : `${now.averagePrepMinutes} min`} note="Accepted → ready" delta={rel(now.averagePrepMinutes, previous.averagePrepMinutes)} goodWhenUp={false} compareText={compareText} previous={previous.averagePrepMinutes === null ? '–' : `${previous.averagePrepMinutes} min`} />
        <Kpi label="Ready on time" value={percent(now.onTimeRate)} note="Ready by the pickup / delivery time" delta={rel(now.onTimeRate, previous.onTimeRate)} compareText={compareText} previous={percent(previous.onTimeRate)} />
        <Kpi label="New members" value={String(data.members.new)} delta={data.change.newMembers} compareText={compareText} previous={String(data.members.previousNew)} />
        <Kpi label="Discounts given" value={yen(now.discounts)} note="Offers, stamp rewards, points" delta={rel(now.discounts, previous.discounts)} goodWhenUp={false} neutral compareText={compareText} previous={yen(previous.discounts)} />
      </div>

      <div className="ov-two">
        <div className="ov-card">
          <ChartHead title="Best sellers" sub="Completed orders, by quantity" table={tables.items} onTable={() => toggle('items')} />
          {data.topItems.length === 0 ? (
            <p className="ov-muted">No items sold in this period.</p>
          ) : tables.items ? (
            <DataTable head={['Item', 'Qty', 'Sales (excl. tax)', 'Orders']} rows={data.topItems.map(item => [item.nameJa || item.nameEn, String(item.quantity), yen(item.sales), String(item.orders)])} />
          ) : (
            <RankBars
              format={value => `${value}`}
              rows={data.topItems.map(item => ({ key: item.nameEn, label: item.nameJa || item.nameEn, sub: item.nameJa ? item.nameEn : null, value: item.quantity, extra: yen(item.sales) }))}
            />
          )}
        </div>

        <div className="ov-stack">
          <div className="ov-card">
            <ChartHead title="Sales by channel" sub="Share of sales: pickup and delivery" />
            <SplitBar
              format={yen}
              parts={[
                { label: 'Pickup', value: data.fulfillment.PICKUP.sales, color: SERIES.blue, detail: `${data.fulfillment.PICKUP.orders} orders · ${yen(data.fulfillment.PICKUP.sales)}` },
                { label: 'Delivery', value: data.fulfillment.DELIVERY.sales, color: SERIES.orange, detail: `${data.fulfillment.DELIVERY.orders} orders · ${yen(data.fulfillment.DELIVERY.sales)}` },
              ]}
            />
            {now.deliveryFees > 0 && <p className="ov-muted" style={{ margin: '8px 0 0' }}>Delivery fees collected: {yen(now.deliveryFees)}</p>}
          </div>

          <div className="ov-card">
            <div className="ov-card-head">
              <h3>Customers</h3>
              <button type="button" className="ov-link" onClick={() => onNavigate('Members')}>Members →</button>
            </div>
            <dl className="ov-mini">
              <div><dt>Members (all time)</dt><dd>{data.members.total}</dd></div>
              <div><dt>Orders by members</dt><dd>{percent(now.memberShare)}</dd></div>
              <div><dt>Returning members</dt><dd>{percent(returningRate)}</dd><dd className="ov-muted ov-dd-note">{data.members.returning} of {data.members.buyers} who ordered</dd></div>
              <div><dt>Newsletter opt-ins</dt><dd>{data.members.newsletter}</dd></div>
            </dl>
          </div>
        </div>
      </div>

      <div className="ov-card">
        <ChartHead title="Busiest times" sub="Orders placed by weekday and hour — plan staff and prep around the dark cells" table={tables.heat} onTable={() => toggle('heat')} />
        {tables.heat ? (
          <DataTable head={['Day', ...hours.map(h => `${h}:00`)]} rows={WEEK.map(day => [day.label, ...hours.map(h => String(data.busyHours[day.index][h]))])} />
        ) : (
          <>
            <Heatmap grid={heatGrid} rowLabels={WEEK.map(day => day.label)} hours={hours} ariaLabel="Orders by weekday and hour" />
            <RampLegend max={heatMax} />
          </>
        )}
      </div>

      <div className="ov-two">
        <div className="ov-card">
          <div className="ov-card-head">
            <h3>Offers & discounts</h3>
              <button type="button" className="ov-link" onClick={() => onNavigate('Stamps & Loyalty')}>Manage →</button>
          </div>
          <dl className="ov-mini">
            <div><dt>Discounts given</dt><dd>{yen(now.discounts)}</dd><dd className="ov-muted ov-dd-note">Offers, stamp rewards and points</dd></div>
          </dl>
          {data.promotions.length === 0 ? (
            <p className="ov-muted">No offers or stamp rewards used in this period.</p>
          ) : (
            <DataTable head={['Offer / reward', 'Uses', 'Discount']} rows={data.promotions.map(p => [p.title, String(p.uses), yen(p.discount)])} />
          )}
        </div>

        <div className="ov-card">
          <div className="ov-card-head"><h3>Loyalty</h3></div>
          <dl className="ov-mini ov-mini-3">
            <div><dt>Points earned</dt><dd>{data.loyalty.pointsEarned.toLocaleString('ja-JP')}</dd></div>
            <div><dt>Points used</dt><dd>{data.loyalty.pointsRedeemed.toLocaleString('ja-JP')}</dd></div>
            <div><dt>Points held by members</dt><dd>{data.loyalty.pointsOutstanding.toLocaleString('ja-JP')}</dd></div>
            <div><dt>Stamps given</dt><dd>{data.loyalty.stampsGiven}</dd></div>
            <div><dt>Rewards earned</dt><dd>{data.loyalty.rewardsEarned}</dd></div>
            <div><dt>Rewards used</dt><dd>{data.loyalty.rewardsUsed}</dd></div>
          </dl>
          <div className="ov-card-head" style={{ marginTop: 14 }}><h3>Enquiries</h3></div>
          <dl className="ov-mini ov-mini-3">
            {Object.keys(MESSAGE_LABEL).map(type => (
              <div key={type}><dt>{MESSAGE_LABEL[type]}</dt><dd>{data.messages[type] ?? 0}</dd></div>
            ))}
          </dl>
        </div>
      </div>
    </section>
  );
}

/** Relative change for values the API doesn't pre-compute. */
function rel(current: number | null, previous: number | null) {
  if (current === null || previous === null || previous === 0) return null;
  return (current - previous) / previous;
}

function Kpi({ label, value, note, delta, goodWhenUp = true, neutral = false, compareText, previous }: {
  label: string;
  /** Neither direction is good or bad (e.g. discounts): shown without colour. */
  neutral?: boolean;
  value: string;
  note?: string;
  delta: number | null;
  goodWhenUp?: boolean;
  compareText: string;
  previous: string;
}) {
  return (
    <div className="ov-card ov-kpi">
      <div className="ov-kpi-label">{label}</div>
      <div className="ov-kpi-value">{value}</div>
      {note && <div className="ov-muted ov-kpi-note">{note}</div>}
      <Delta value={delta} goodWhenUp={goodWhenUp} neutral={neutral} compareText={compareText} previous={previous} />
    </div>
  );
}

function Delta({ value, goodWhenUp, neutral = false, compareText, previous }: { value: number | null; goodWhenUp: boolean; neutral?: boolean; compareText: string; previous: string }) {
  // No percentage when the earlier period had nothing to compare with; show its value instead.
  if (value === null || !Number.isFinite(value)) return <div className="ov-delta"><span className="ov-muted">Previous period: {previous}</span></div>;
  const up = value > 0;
  const flat = Math.abs(value) < 0.005;
  const good = flat || neutral ? null : up === goodWhenUp;
  return (
    <div className={`ov-delta${good === null ? '' : good ? ' is-good' : ' is-bad'}`} title={`${compareText}: ${previous}`}>
      {!flat && (up ? <ArrowUpRight size={14} aria-hidden="true" /> : <ArrowDownRight size={14} aria-hidden="true" />)}
      <span>{flat ? '±0%' : `${up ? '+' : '−'}${Math.round(Math.abs(value) * 100)}%`}</span>
      <span className="ov-muted">{compareText}</span>
    </div>
  );
}

function ChartHead({ title, sub, table, onTable }: { title: string; sub?: string; table?: boolean; onTable?: () => void }) {
  return (
    <div className="ov-card-head">
      <div>
        <h3>{title}</h3>
        {sub && <div className="ov-muted ov-sub">{sub}</div>}
      </div>
      {onTable && (
        <button type="button" className="ov-btn ov-btn-sm" aria-pressed={table} onClick={onTable}><Table2 size={14} /> {table ? 'Chart' : 'Table'}</button>
      )}
    </div>
  );
}

function DataTable({ head, rows }: { head: string[]; rows: string[][] }) {
  return (
    <div className="ov-table-wrap">
      <table className="ov-table">
        <thead><tr>{head.map((cell, i) => <th key={cell} className={i ? 'num' : undefined}>{cell}</th>)}</tr></thead>
        <tbody>{rows.map((row, r) => <tr key={r}>{row.map((cell, i) => <td key={i} className={i ? 'num' : undefined}>{cell}</td>)}</tr>)}</tbody>
      </table>
    </div>
  );
}
