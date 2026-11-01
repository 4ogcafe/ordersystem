import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'react-hot-toast';
import { Bell, BellOff, ChefHat, ClipboardList, History, LogOut, Maximize, Minimize, PauseCircle, PlayCircle, Printer, Sliders, WifiOff, X } from 'lucide-react';
import { apiFetch, errorMessage, getPublic } from '../lib/api';
import { formatOrderNumber } from '../lib/format';
import { DEFAULT_STORE_LOCATIONS, resolveOrderStore, type StoreLocation } from '../lib/stores';
import { alertText } from '../components/admin/dietary';
import KitchenTicket from '../components/kitchen/KitchenTicket';
import KitchenPrinterModal from '../components/kitchen/KitchenPrinterModal';
import { getStorePrinterConfig, saveStorePrinterConfig } from '../components/admin/PrinterSettings';
import {
  COLUMNS,
  TIMEZONE,
  allDayCounts,
  clockTime,
  isDelivery,
  printTicket,
  type ActiveStatus,
  type KitchenBoard,
  type KitchenOrder,
  type KitchenStatus,
} from '../components/kitchen/kitchen';
import './kitchen.css';

const POLL_MS = 5_000;
const TICK_MS = 15_000;
// While any order is waiting in "New", the screen keeps ringing until it is started or cancelled.
const RING_EVERY_MS = 3_000;
// "Picked up" is final (points and stamps are given), so it waits a moment for an undo.
const COMPLETE_UNDO_MS = 5_000;
const PAUSE_OPTIONS = [15, 30, 60];
const SETTINGS_KEY = 'adarsha_kitchen';

// Kitchen messages appear at the bottom, so they never cover the top bar or the column headers.
const AT_BOTTOM = { position: 'bottom-center' as const };
const notify = {
  success: (message: string, options: Parameters<typeof toast.success>[1] = {}) => toast.success(message, { ...AT_BOTTOM, ...options }),
  error: (message: string) => toast.error(message, AT_BOTTOM),
};

type Filter = 'ALL' | 'PICKUP' | 'DELIVERY' | 'DINE_IN';

interface Prefs {
  sound: boolean;
  filter: Filter;
  storeFilter: string;
  autoPrint: boolean;
}

function loadPrefs(): Prefs {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY) ?? localStorage.getItem('kalpana_kitchen');
    const saved = JSON.parse(raw ?? '{}');
    return {
      sound: saved.sound !== false,
      filter: ['ALL', 'PICKUP', 'DELIVERY', 'DINE_IN'].includes(saved.filter) ? saved.filter : 'ALL',
      storeFilter: typeof saved.storeFilter === 'string' && saved.storeFilter ? saved.storeFilter : 'ALL',
      autoPrint: saved.autoPrint !== false,
    };
  } catch {
    return { sound: true, filter: 'ALL', storeFilter: 'ALL', autoPrint: true };
  }
}

export default function Kitchen() {
  const navigate = useNavigate();
  const [user, setUser] = useState<{ name: string; role: string } | null>(null);
  const [board, setBoard] = useState<KitchenBoard | null>(null);
  const [stores, setStores] = useState<StoreLocation[]>(DEFAULT_STORE_LOCATIONS);
  const [offline, setOffline] = useState(false);
  const [clockOffset, setClockOffset] = useState(0);
  const [now, setNow] = useState(() => Date.now());
  const [prefs, setPrefs] = useState<Prefs>(loadPrefs);
  const [started, setStarted] = useState(false);
  const [busy, setBusy] = useState<Set<string>>(new Set());
  const [panel, setPanel] = useState<'allday' | 'done' | null>(null);
  const [mobileColumn, setMobileColumn] = useState<ActiveStatus>('NEW');
  const [confirmCancel, setConfirmCancel] = useState<KitchenOrder | null>(null);
  const [pauseMenu, setPauseMenu] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);
  const [printerModalOpen, setPrinterModalOpen] = useState(false);
  // Orders "picked up" but still inside the undo window: hidden here, sent when the timer ends.
  const [pendingComplete, setPendingComplete] = useState<Map<string, ReturnType<typeof setTimeout>>>(new Map());

  const audioRef = useRef<AudioContext | null>(null);
  const knownNew = useRef<Set<string> | null>(null);
  const soundRef = useRef(prefs.sound);
  const autoPrintRef = useRef(prefs.autoPrint);
  const storesRef = useRef(stores);
  const storeFilterRef = useRef(prefs.storeFilter);
  useEffect(() => {
    soundRef.current = prefs.sound;
    autoPrintRef.current = prefs.autoPrint;
    storeFilterRef.current = prefs.storeFilter;
    try {
      localStorage.setItem(SETTINGS_KEY, JSON.stringify(prefs));
    } catch {
      // Private mode: preferences just aren't remembered.
    }
  }, [prefs]);

  useEffect(() => {
    storesRef.current = stores;
  }, [stores]);

  const chime = useCallback((times = 2) => {
    const audio = audioRef.current;
    if (!audio || !soundRef.current) return;
    for (let i = 0; i < times; i += 1) {
      const start = audio.currentTime + i * 0.35;
      const tone = audio.createOscillator();
      const gain = audio.createGain();
      tone.frequency.value = i % 2 ? 660 : 880;
      gain.gain.setValueAtTime(0.0001, start);
      gain.gain.exponentialRampToValueAtTime(0.4, start + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.3);
      tone.connect(gain).connect(audio.destination);
      tone.start(start);
      tone.stop(start + 0.32);
    }
  }, []);

  const load = useCallback(async () => {
    try {
      const res = await apiFetch('/api/v1/orders/kitchen');
      if (res.status === 401 || res.status === 403) {
        navigate('/login', { replace: true });
        return;
      }
      if (!res.ok) throw new Error(String(res.status));
      const data: KitchenBoard = await res.json();
      setBoard(data);
      setOffline(false);
      setClockOffset(new Date(data.serverTime).getTime() - Date.now());

      // New orders since the last check: ring, announce and auto-print if enabled for this store.
      const newIds = new Set(data.active.filter(order => order.status === 'NEW').map(order => order.id));
      if (knownNew.current) {
        const arrived = data.active.filter(order => order.status === 'NEW' && !knownNew.current!.has(order.id));
        if (arrived.length > 0) {
          const activeFilter = storeFilterRef.current || 'ALL';
          for (const order of arrived) {
            const orderBranch = resolveOrderStore(order, storesRef.current);
            const matchesStore = activeFilter === 'ALL' || orderBranch?.id === activeFilter;

            if (matchesStore) {
              setMobileColumn('NEW');
              const branchName = orderBranch ? `【${orderBranch.name}】` : '';
              notify.success(`🔔 新規注文受付 ${branchName}#${formatOrderNumber(order.number)} · ${isDelivery(order) ? 'デリバリー' : 'テイクアウト'} ${clockTime(order.pickupAt)}`, { duration: 9000, id: `new-${order.id}` });
              if (autoPrintRef.current) {
                const storeConfig = getStorePrinterConfig(orderBranch?.id);
                printTicket(order, order.dietaryAlert ? alertText(order.dietaryAlert) : null, storeConfig);
              }
            }
          }
        }
      }
      knownNew.current = newIds;
    } catch {
      setOffline(true);
    }
  }, [chime, navigate]);

  // Who is signed in; kitchen, staff and admins may use this screen.
  useEffect(() => {
    apiFetch('/api/v1/auth/me')
      .then(res => (res.ok ? res.json() : Promise.reject(new Error('Not logged in'))))
      .then(data => setUser(data.user))
      .catch(() => navigate('/login', { replace: true }));
    getPublic<{ stores?: StoreLocation[] }>('/api/v1/stores')
      .then(res => {
        if (Array.isArray(res?.stores) && res.stores.length > 0) setStores(res.stores);
      })
      .catch(() => {});
    getPublic<any>('/api/v1/settings')
      .then(res => {
        if (res?.printerConfigs && typeof res.printerConfigs === 'object') {
          for (const [sId, sCfg] of Object.entries(res.printerConfigs)) {
            saveStorePrinterConfig(sCfg as any, sId);
          }
        }
      })
      .catch(() => {});
  }, [navigate]);

  useEffect(() => {
    if (!user) return;
    load();
    const poll = setInterval(load, POLL_MS);
    const tick = setInterval(() => setNow(Date.now()), TICK_MS);
    const onVisible = () => document.visibilityState === 'visible' && load();
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      clearInterval(poll);
      clearInterval(tick);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [user, load]);

  const serverNow = now + clockOffset;

  const allNewOrders = useMemo(
    () => (board?.active ?? []).filter(order => order.status === 'NEW'),
    [board?.active],
  );

  // Orders waiting in "New" matching the selected store filter (or all stores), so it rings for this store's orders.
  const waitingOrdersThisStore = useMemo(() => {
    return allNewOrders.filter(order => {
      if (!prefs.storeFilter || prefs.storeFilter === 'ALL') return true;
      const resolved = resolveOrderStore(order, stores);
      return resolved?.id === prefs.storeFilter;
    });
  }, [allNewOrders, prefs.storeFilter, stores]);

  const waitingOrdersOtherStores = useMemo(() => {
    if (!prefs.storeFilter || prefs.storeFilter === 'ALL') return [];
    return allNewOrders.filter(order => {
      const resolved = resolveOrderStore(order, stores);
      return resolved?.id !== prefs.storeFilter;
    });
  }, [allNewOrders, prefs.storeFilter, stores]);

  const waitingCount = waitingOrdersThisStore.length;
  const ringing = started && waitingCount > 0;
  useEffect(() => {
    if (!ringing) return;
    chime(4);
    const intervalId = setInterval(() => chime(4), RING_EVERY_MS);
    return () => clearInterval(intervalId);
  }, [ringing, chime]);

  // Keep the screen awake while the kitchen display is open.
  useEffect(() => {
    if (!started) return;
    type Lock = { release: () => Promise<void> };
    let lock: Lock | null = null;
    const request = () =>
      (navigator as unknown as { wakeLock?: { request: (type: 'screen') => Promise<Lock> } }).wakeLock
        ?.request('screen')
        .then(value => { lock = value; })
        .catch(() => undefined);
    request();
    const onVisible = () => document.visibilityState === 'visible' && request();
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      document.removeEventListener('visibilitychange', onVisible);
      lock?.release().catch(() => undefined);
    };
  }, [started]);

  useEffect(() => {
    const onChange = () => setFullscreen(Boolean(document.fullscreenElement));
    document.addEventListener('fullscreenchange', onChange);
    return () => document.removeEventListener('fullscreenchange', onChange);
  }, []);

  const start = () => {
    try {
      audioRef.current ??= new AudioContext();
      audioRef.current.resume();
    } catch {
      // No sound on this device; the screen still works.
    }
    setStarted(true);
    chime(1);
  };

  const toggleFullscreen = () => {
    if (document.fullscreenElement) document.exitFullscreen().catch(() => undefined);
    else document.documentElement.requestFullscreen?.().catch(() => notify.error('Full screen is not available on this device.'));
  };

  const setBusyFor = (id: string, on: boolean) =>
    setBusy(prev => {
      const next = new Set(prev);
      if (on) next.add(id);
      else next.delete(id);
      return next;
    });

  /** Moves an order to a new status, showing the change straight away. */
  const sendStatus = async (order: KitchenOrder, status: KitchenStatus) => {
    setBusyFor(order.id, true);
    const at = new Date(serverNow).toISOString();
    setBoard(prev => {
      if (!prev) return prev;
      // Finished orders leave the columns and go to the top of "Done" straight away.
      if (status === 'COMPLETED' || status === 'CANCELLED') {
        const finished = { ...order, status, updatedAt: at, ...(status === 'COMPLETED' ? { completedAt: at } : { cancelledAt: at }) };
        return { ...prev, active: prev.active.filter(o => o.id !== order.id), done: [finished, ...prev.done.filter(o => o.id !== order.id)] };
      }
      const moved = (o: KitchenOrder) => ({ ...o, status, ...(status === 'CONFIRMED' && !o.confirmedAt ? { confirmedAt: at } : {}), ...(status === 'READY' ? { readyAt: at } : status === 'CONFIRMED' ? { readyAt: null } : {}) });
      return { ...prev, active: prev.active.map(o => (o.id === order.id ? moved(o) : o)) };
    });
    try {
      const res = await apiFetch(`/api/v1/orders/${order.id}/status`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status }) });
      if (!res.ok) notify.error(await errorMessage(res, 'Could not update the order.'));
    } catch {
      notify.error('Network error — the order was not updated.');
    } finally {
      setBusyFor(order.id, false);
      load();
    }
  };

  const completeWithUndo = (order: KitchenOrder) => {
    const timer = setTimeout(() => {
      setPendingComplete(prev => {
        const next = new Map(prev);
        next.delete(order.id);
        return next;
      });
      sendStatus(order, 'COMPLETED');
    }, COMPLETE_UNDO_MS);
    setPendingComplete(prev => new Map(prev).set(order.id, timer));
    toast(
      t => (
        <span style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          #{formatOrderNumber(order.number)} {isDelivery(order) ? 'delivered' : 'picked up'}
          <button
            type="button"
            className="kd-undo"
            onClick={() => {
              clearTimeout(timer);
              setPendingComplete(prev => {
                const next = new Map(prev);
                next.delete(order.id);
                return next;
              });
              toast.dismiss(t.id);
            }}
          >
            Undo
          </button>
        </span>
      ),
      { ...AT_BOTTOM, duration: COMPLETE_UNDO_MS, id: `done-${order.id}` },
    );
  };

  const move = (order: KitchenOrder, status: KitchenStatus) => {
    if (status === 'CANCELLED') {
      setConfirmCancel(order);
      return;
    }

    // Auto-advance mobileColumn to follow the order so staff immediately sees the ticket in its next state
    if (status === 'CONFIRMED' || status === 'READY') {
      setMobileColumn(status as ActiveStatus);
      // If current filter would hide this order, reset to ALL so it stays visible and actionable
      if (prefs.filter !== 'ALL' && (order.fulfillment ?? 'PICKUP') !== prefs.filter) {
        setPrefs(p => ({ ...p, filter: 'ALL' }));
      }
    }

    if (status === 'COMPLETED') completeWithUndo(order);
    else sendStatus(order, status);
  };

  // Leaving the page sends any "picked up" still waiting for its undo window.
  const pendingRef = useRef(pendingComplete);
  useEffect(() => {
    pendingRef.current = pendingComplete;
  }, [pendingComplete]);
  useEffect(
    () => () => {
      for (const [id, timer] of pendingRef.current) {
        clearTimeout(timer);
        apiFetch(`/api/v1/orders/${id}/status`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status: 'COMPLETED' }), keepalive: true }).catch(() => undefined);
      }
    },
    [],
  );

  const toggleLine = async (order: KitchenOrder, index: number, done: boolean) => {
    setBoard(prev => prev && { ...prev, active: prev.active.map(o => (o.id === order.id ? { ...o, items: o.items.map((line, i) => (i === index ? { ...line, doneAt: done ? new Date().toISOString() : null } : line)) } : o)) });
    try {
      const res = await apiFetch(`/api/v1/orders/${order.id}/items/${index}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ done }) });
      if (!res.ok) {
        notify.error(await errorMessage(res, 'Could not update the dish.'));
        load();
      }
    } catch {
      notify.error('Network error.');
      load();
    }
  };

  const print = (order: KitchenOrder) => {
    const orderBranch = resolveOrderStore(order, stores);
    const storeConfig = getStorePrinterConfig(orderBranch?.id);
    if (!printTicket(order, order.dietaryAlert ? alertText(order.dietaryAlert) : null, storeConfig)) {
      notify.error('Allow pop-ups for this site to print tickets.');
    }
  };

  const pause = async (minutes: number) => {
    setPauseMenu(false);
    try {
      const res = await apiFetch('/api/v1/orders/kitchen/pause', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ minutes }) });
      if (!res.ok) throw new Error(await errorMessage(res, 'Could not change online ordering.'));
      notify.success(minutes ? `New online orders paused for ${minutes} min.` : 'Online orders are open again.');
      load();
    } catch (err) {
      notify.error(err instanceof Error ? err.message : 'Network error.');
    }
  };

  const logout = async () => {
    await apiFetch('/api/v1/auth/logout', { method: 'POST' }).catch(() => undefined);
    navigate('/login');
  };

  const visible = useMemo(
    () =>
      (board?.active ?? [])
        .filter(order => !pendingComplete.has(order.id))
        .filter(order => {
          if (!prefs.storeFilter || prefs.storeFilter === 'ALL') return true;
          const resolved = resolveOrderStore(order, stores);
          return resolved?.id === prefs.storeFilter;
        })
        // Active preparation orders (NEW or CONFIRMED) are always visible to the kitchen so staff can process them,
        // even if filtered by Pickup or Delivery.
        .filter(order => prefs.filter === 'ALL' || order.status === 'NEW' || order.status === 'CONFIRMED' || (order.fulfillment ?? 'PICKUP') === prefs.filter)
        .sort((a, b) => new Date(a.pickupAt).getTime() - new Date(b.pickupAt).getTime() || a.number - b.number),
    [board, pendingComplete, prefs.filter, prefs.storeFilter, stores],
  );
  const byColumn = (status: ActiveStatus) => visible.filter(order => order.status === status);
  const allDay = useMemo(() => allDayCounts(visible), [visible]);
  const lateCount = visible.filter(order => order.status !== 'READY' && new Date(order.pickupAt).getTime() < serverNow).length;

  if (!user || !board) {
    return (
      <div className="kd kd-center" aria-busy="true">
        <title>Kitchen | Adarsha</title>
        {offline ? <><WifiOff size={40} /><p>Can't reach the server. Retrying…</p></> : <p>Loading kitchen…</p>}
      </div>
    );
  }

  return (
    <div className="kd">
      <title>{`${byColumn('NEW').length ? `(${byColumn('NEW').length}) ` : ''}Kitchen | Adarsha`}</title>
      <meta name="robots" content="noindex, nofollow" />

      {!started && (
        <div className="kd-start" role="dialog" aria-modal="true" aria-labelledby="kd-start-title">
          <div className="kd-start-card">
            <ChefHat size={48} aria-hidden="true" />
            <h1 id="kd-start-title">Kitchen display</h1>
            <p>Tap start so the screen can ring for new orders and stay awake during service.</p>
            <button type="button" className="kt-btn kt-btn-new" onClick={start} autoFocus>Start kitchen screen</button>
            <button type="button" className="kd-link" onClick={() => { start(); toggleFullscreen(); }}>Start in full screen</button>
          </div>
        </div>
      )}

      <header className="kd-bar">
        <div className="kd-brand">
          <ChefHat size={26} aria-hidden="true" />
          <div>
            <strong>Adarsha Kitchen</strong>
            <span className="kd-clock">{new Date(serverNow).toLocaleString('ja-JP', { timeZone: TIMEZONE, month: 'numeric', day: 'numeric', weekday: 'short', hour: '2-digit', minute: '2-digit' })}</span>
          </div>
        </div>

        <dl className="kd-stats">
          <div><dt>Open</dt><dd>{visible.length}</dd></div>
          <div className={lateCount ? 'is-late' : undefined}><dt>Late</dt><dd>{lateCount}</dd></div>
          <div><dt>Today</dt><dd>{board.stats.ordersToday}</dd></div>
          <div><dt>Avg prep</dt><dd>{board.stats.avgPrepMinutes ?? '–'}<small> min</small></dd></div>
        </dl>

        <div className="kd-filter" role="group" aria-label="Show orders">
          {(['ALL', 'PICKUP', 'DELIVERY', 'DINE_IN'] as Filter[]).map(value => {
            const count = (board?.active ?? []).filter(o => {
              if (pendingComplete.has(o.id)) return false;
              if (prefs.storeFilter && prefs.storeFilter !== 'ALL') {
                const resolved = resolveOrderStore(o, stores);
                if (resolved?.id !== prefs.storeFilter) return false;
              }
              if (value === 'ALL') return true;
              return (o.fulfillment ?? 'PICKUP') === value;
            }).length;

            const label =
              value === 'ALL'
                ? 'All'
                : value === 'PICKUP'
                  ? '🛍 Pickup'
                  : value === 'DELIVERY'
                    ? '🛵 Delivery'
                    : '🍽️ Dine-in';

            return (
              <button
                key={value}
                type="button"
                aria-pressed={prefs.filter === value}
                onClick={() => setPrefs(p => ({ ...p, filter: value }))}
              >
                {label}
                {count > 0 && (
                  <span
                    style={{
                      marginLeft: '5px',
                      fontSize: '0.72rem',
                      fontWeight: 800,
                      padding: '2px 6px',
                      borderRadius: '999px',
                      backgroundColor: prefs.filter === value ? '#4b5563' : 'rgba(255,255,255,0.15)',
                      color: '#fff',
                    }}
                  >
                    {count}
                  </span>
                )}
              </button>
            );
          })}
          <select
            aria-label="Filter by branch"
            value={prefs.storeFilter || 'ALL'}
            onChange={e => setPrefs(p => ({ ...p, storeFilter: e.target.value }))}
            style={{
              backgroundColor: '#1f2937',
              color: '#f9fafb',
              border: '1px solid #374151',
              borderRadius: '8px',
              padding: '6px 10px',
              fontSize: '0.82rem',
              fontWeight: 700,
              cursor: 'pointer',
              marginLeft: '4px',
            }}
          >
            <option value="ALL">🏪 全店舗 ({stores.length})</option>
            {stores.map(st => (
              <option key={st.id} value={st.id}>
                No.{st.number} {st.name}
              </option>
            ))}
          </select>
        </div>

        <div className="kd-tools">
          <button type="button" className="kd-tool" aria-pressed={panel === 'allday'} onClick={() => setPanel(p => (p === 'allday' ? null : 'allday'))}><ClipboardList size={20} /><span>All day</span></button>
          <button type="button" className="kd-tool" aria-pressed={panel === 'done'} onClick={() => setPanel(p => (p === 'done' ? null : 'done'))}><History size={20} /><span>Done ({board.done.length})</span></button>
          <div className="kd-pause">
            <button type="button" className={`kd-tool${board.pausedUntil ? ' is-warn' : ''}`} aria-expanded={pauseMenu} onClick={() => (board.pausedUntil ? pause(0) : setPauseMenu(open => !open))}>
              {board.pausedUntil ? <PlayCircle size={20} /> : <PauseCircle size={20} />}
              <span>{board.pausedUntil ? 'Resume orders' : 'Busy'}</span>
            </button>
            {pauseMenu && (
              <div className="kd-menu" role="menu">
                <p>Stop new online orders for:</p>
                {PAUSE_OPTIONS.map(minutes => (
                  <button key={minutes} type="button" role="menuitem" onClick={() => pause(minutes)}>{minutes} min</button>
                ))}
              </div>
            )}
          </div>
          <button
            type="button"
            className={`kd-tool${prefs.autoPrint ? ' is-active' : ''}`}
            aria-pressed={prefs.autoPrint}
            onClick={() => {
              setPrefs(p => {
                const next = !p.autoPrint;
                notify.success(next ? '自動印刷: オン (新規注文時に自動で印刷)' : '自動印刷: オフ (手動で印刷)');
                return { ...p, autoPrint: next };
              });
            }}
            aria-label={prefs.autoPrint ? '自動印刷: オン' : '自動印刷: オフ'}
            title={prefs.autoPrint ? '自動印刷: オン (新規注文時に自動で印刷)' : '自動印刷: オフ (手動で印刷)'}
          >
            <Printer size={20} />
            <span style={{ fontSize: '0.75rem', fontWeight: 700 }}>{prefs.autoPrint ? '印刷ON' : '印刷OFF'}</span>
          </button>
          <button
            type="button"
            className="kd-tool"
            onClick={() => setPrinterModalOpen(true)}
            aria-label="プリンター設定"
            title="プリンター設定・店舗選択"
          >
            <Sliders size={20} />
            <span style={{ fontSize: '0.75rem', fontWeight: 700 }}>設定</span>
          </button>
          <button type="button" className="kd-tool" aria-pressed={prefs.sound} onClick={() => { setPrefs(p => ({ ...p, sound: !p.sound })); if (!prefs.sound) setTimeout(() => chime(1), 0); }} aria-label={prefs.sound ? 'Sound on' : 'Sound off'} title={prefs.sound ? 'Sound on' : 'Sound off'}>
            {prefs.sound ? <Bell size={20} /> : <BellOff size={20} />}
          </button>
          <button type="button" className="kd-tool kd-hide-sm" onClick={toggleFullscreen} aria-label={fullscreen ? 'Exit full screen' : 'Full screen'} title="Full screen">
            {fullscreen ? <Minimize size={20} /> : <Maximize size={20} />}
          </button>
          <button type="button" className="kd-tool" onClick={logout} aria-label={`Log out ${user.name}`} title={`Log out ${user.name}`}><LogOut size={20} /></button>
        </div>
      </header>

      {waitingOrdersThisStore.length > 0 && (
        <div
          className={`kd-banner kd-ringing${prefs.sound ? '' : ' is-muted'}`}
          role="alert"
          style={{ padding: '12px 16px', display: 'flex', flexDirection: 'column', gap: '8px' }}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '10px', flexWrap: 'wrap', width: '100%' }}>
            <div style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', fontSize: '1rem', fontWeight: 700 }}>
              {prefs.sound ? <Bell size={20} /> : <BellOff size={20} />}
              <span>
                🔔 新規注文受付：{waitingOrdersThisStore.length}件の未確認注文があります
              </span>
              {!prefs.sound && <span style={{ fontSize: '0.85rem', fontWeight: 500, color: '#fca5a5' }}>（消音中）</span>}
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
              {prefs.filter !== 'ALL' && (
                <button
                  type="button"
                  onClick={() => {
                    setPrefs(p => ({ ...p, filter: 'ALL' }));
                    setMobileColumn('NEW');
                  }}
                  style={{
                    padding: '4px 12px',
                    borderRadius: '999px',
                    border: 'none',
                    backgroundColor: '#1f2937',
                    color: '#fff',
                    fontWeight: 700,
                    fontSize: '0.78rem',
                    cursor: 'pointer',
                  }}
                >
                  すべての注文（All）を表示
                </button>
              )}
            </div>
          </div>

          {/* Quick-action list of new orders so staff can accept them immediately from anywhere */}
          <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', width: '100%', marginTop: '4px' }}>
            {waitingOrdersThisStore.map(order => {
              const orderBranch = resolveOrderStore(order, stores);
              const isDeliv = order.fulfillment === 'DELIVERY';
              const isTable = order.fulfillment === 'DINE_IN';
              return (
                <div
                  key={order.id}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: '12px',
                    backgroundColor: '#111827',
                    color: '#f9fafb',
                    padding: '8px 14px',
                    borderRadius: '8px',
                    flex: '1 1 min(100%, 360px)',
                    boxShadow: '0 2px 8px rgba(0,0,0,0.25)',
                    border: '1px solid #374151',
                  }}
                >
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
                      <strong style={{ fontSize: '1.05rem', color: '#fbbf24' }}>#{formatOrderNumber(order.number)}</strong>
                      {orderBranch && (
                        <span style={{ fontSize: '0.72rem', backgroundColor: '#374151', padding: '1px 6px', borderRadius: '4px' }}>
                          🏪 {orderBranch.name}
                        </span>
                      )}
                      <span style={{ fontSize: '0.72rem', backgroundColor: isDeliv ? '#1e3a8a' : isTable ? '#064e3b' : '#374151', color: '#fff', padding: '1px 6px', borderRadius: '4px', fontWeight: 700 }}>
                        {isDeliv ? '🛵 デリバリー' : isTable ? '🍽️ 店内テーブル' : '🛍 テイクアウト'}
                      </span>
                    </div>
                    <div style={{ fontSize: '0.82rem', color: '#d1d5db', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {order.customerName} · {clockTime(order.pickupAt)} ({order.items.length}点)
                    </div>
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <button
                      type="button"
                      disabled={busy.has(order.id)}
                      onClick={() => move(order, 'CONFIRMED')}
                      style={{
                        padding: '6px 14px',
                        backgroundColor: '#059669',
                        color: '#fff',
                        fontWeight: 800,
                        fontSize: '0.82rem',
                        borderRadius: '6px',
                        border: 'none',
                        cursor: 'pointer',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      🍳 調理開始
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setMobileColumn('NEW');
                        if (prefs.filter !== 'ALL') setPrefs(p => ({ ...p, filter: 'ALL' }));
                      }}
                      title="この注文の伝票を確認"
                      style={{
                        padding: '6px 10px',
                        backgroundColor: '#374151',
                        color: '#f3f4f6',
                        fontWeight: 600,
                        fontSize: '0.78rem',
                        borderRadius: '6px',
                        border: 'none',
                        cursor: 'pointer',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      表示
                    </button>
                    <button
                      type="button"
                      disabled={busy.has(order.id)}
                      onClick={() => move(order, 'CANCELLED')}
                      title="注文をキャンセル"
                      style={{
                        padding: '6px 8px',
                        backgroundColor: 'transparent',
                        color: '#ef4444',
                        fontWeight: 600,
                        fontSize: '0.78rem',
                        borderRadius: '6px',
                        border: '1px solid #ef4444',
                        cursor: 'pointer',
                      }}
                    >
                      ✕
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {waitingOrdersOtherStores.length > 0 && (
        <div
          role="alert"
          style={{
            backgroundColor: '#78350f',
            color: '#fef3c7',
            padding: '10px 16px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: '12px',
            fontSize: '0.88rem',
            fontWeight: 700,
            flexWrap: 'wrap',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Bell size={18} />
            <span>
              ⚠️ 他店舗に {waitingOrdersOtherStores.length}件 の新着注文が届いています（現在の画面は特定店舗に絞り込まれています）
            </span>
          </div>
          <button
            type="button"
            onClick={() => {
              setPrefs(p => ({ ...p, storeFilter: 'ALL', filter: 'ALL' }));
              setMobileColumn('NEW');
            }}
            style={{
              padding: '4px 14px',
              backgroundColor: '#fbbf24',
              color: '#1e293b',
              fontWeight: 800,
              fontSize: '0.82rem',
              borderRadius: '999px',
              border: 'none',
              cursor: 'pointer',
            }}
          >
            🏪 全店舗を表示して確認・受付
          </button>
        </div>
      )}
      {offline && <div className="kd-banner is-error" role="alert"><WifiOff size={18} /> Connection lost — showing the last update. Retrying every few seconds…</div>}
      {board.pausedUntil && (
        <div className="kd-banner is-warn" role="status">
          <PauseCircle size={18} /> New online orders are paused until {clockTime(board.pausedUntil)}.
          <button type="button" className="kd-link" onClick={() => pause(0)}>Resume now</button>
        </div>
      )}
      {!board.ordering.pickup.enabled && !board.ordering.delivery.enabled && !board.pausedUntil && (
        <div className="kd-banner" role="status">Online ordering is switched off in the admin (Orders → Online ordering).</div>
      )}

      <nav className="kd-tabs" aria-label="Columns">
        {COLUMNS.map(column => (
          <button key={column.status} type="button" aria-pressed={mobileColumn === column.status} onClick={() => setMobileColumn(column.status)}>
            {column.sub} <span className="kd-count">{byColumn(column.status).length}</span>
          </button>
        ))}
      </nav>

      <div className={`kd-body${panel ? ' has-panel' : ''}`}>
        <main className="kd-columns">
          {COLUMNS.map(column => {
            const orders = byColumn(column.status);
            return (
              <section key={column.status} className={`kd-col kd-col-${column.status.toLowerCase()}${mobileColumn === column.status ? ' is-current' : ''}`} aria-labelledby={`col-${column.status}`}>
                <h2 id={`col-${column.status}`}>
                  <span>{column.title} <small>{column.sub}</small></span>
                  <span className="kd-count">{orders.length}</span>
                </h2>
                <div className="kd-col-list">
                  {orders.length === 0 ? (
                    <p className="kd-empty">{column.status === 'NEW' ? 'No new orders. They appear here with a sound.' : column.status === 'CONFIRMED' ? 'Nothing cooking.' : 'Nothing waiting for pickup.'}</p>
                  ) : (
                    orders.map(order => (
                      <KitchenTicket key={order.id} order={order} now={serverNow} busy={busy.has(order.id)} onMove={move} onToggleLine={toggleLine} onPrint={print} />
                    ))
                  )}
                </div>
              </section>
            );
          })}
        </main>

        {panel && (
          <aside className="kd-panel" aria-label={panel === 'allday' ? 'All day' : 'Done today'}>
            <div className="kd-panel-head">
              <h2>{panel === 'allday' ? 'All day — still to cook' : 'Done today'}</h2>
              <button type="button" className="kd-tool" onClick={() => setPanel(null)} aria-label="Close"><X size={20} /></button>
            </div>
            {panel === 'allday' ? (
              allDay.length === 0 ? (
                <p className="kd-empty">Nothing to cook right now.</p>
              ) : (
                <ul className="kd-allday">
                  {allDay.map(entry => (
                    <li key={entry.nameEn}>
                      <span className="kt-qty">{entry.quantity}</span>
                      <span className="kt-name">{entry.nameEn}{entry.nameJa && entry.nameJa !== entry.nameEn && <small>{entry.nameJa}</small>}</span>
                      <span className="kd-muted">{entry.orders} order{entry.orders === 1 ? '' : 's'}</span>
                    </li>
                  ))}
                </ul>
              )
            ) : board.done.length === 0 ? (
              <p className="kd-empty">No finished orders yet today.</p>
            ) : (
              <ul className="kd-done">
                {board.done.map(order => (
                  <li key={order.id} className={order.status === 'CANCELLED' ? 'is-cancelled' : undefined}>
                    <div>
                      <strong>#{formatOrderNumber(order.number)}</strong> {order.customerName}
                      <span className="kd-muted"> · {order.status === 'CANCELLED' ? 'Cancelled' : isDelivery(order) ? 'Delivered' : 'Picked up'} {clockTime(order.completedAt ?? order.cancelledAt ?? order.updatedAt)}</span>
                      <div className="kd-muted">{order.items.map(line => `${line.quantity}× ${line.nameEn}`).join(', ')}</div>
                    </div>
                    <button type="button" className="kd-tool" onClick={() => print(order)} aria-label={`Print order ${order.number}`}><Printer size={18} /></button>
                  </li>
                ))}
              </ul>
            )}
          </aside>
        )}
      </div>

      {confirmCancel && (
        <div className="kd-start" role="alertdialog" aria-modal="true" aria-labelledby="kd-cancel-title">
          <div className="kd-start-card">
            <h2 id="kd-cancel-title">Cancel order #{formatOrderNumber(confirmCancel.number)}?</h2>
            <p>{confirmCancel.customerName} · <a href={`tel:${confirmCancel.phone}`}>{confirmCancel.phone}</a><br />Call the customer to let them know. This can't be undone.</p>
            <div style={{ display: 'flex', gap: '12px', justifyContent: 'center', flexWrap: 'wrap' }}>
              <button type="button" className="kt-btn kt-btn-cancel" onClick={() => { const order = confirmCancel; setConfirmCancel(null); sendStatus(order, 'CANCELLED'); }}>Yes, cancel order</button>
              <button type="button" className="kt-btn kt-btn-ghost" onClick={() => setConfirmCancel(null)} autoFocus>Keep order</button>
            </div>
          </div>
        </div>
      )}

      <KitchenPrinterModal
        isOpen={printerModalOpen}
        onClose={() => setPrinterModalOpen(false)}
        stores={stores}
        currentStoreId={prefs.storeFilter || 'ALL'}
        onSelectStore={storeId => setPrefs(p => ({ ...p, storeFilter: storeId }))}
        autoPrint={prefs.autoPrint}
        onToggleAutoPrint={enabled => setPrefs(p => ({ ...p, autoPrint: enabled }))}
        sound={prefs.sound}
        onToggleSound={enabled => setPrefs(p => ({ ...p, sound: enabled }))}
      />
    </div>
  );
}
