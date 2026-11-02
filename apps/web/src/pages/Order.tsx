import { useEffect, useMemo, useRef, useState, type ChangeEvent, type CSSProperties, type FormEvent, type ReactNode } from 'react';
import { Link, useLocation, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { toast } from 'react-hot-toast';
import { AlertTriangle, Bell, Check, ChevronDown, ChevronUp, Clock, ExternalLink, MapPin, Moon, Phone, Plus, Search, ShoppingBag, Sparkles, Store, Sun, Trash2 } from 'lucide-react';
import { apiFetch, assetUrl, errorMessage, getPublic } from '../lib/api';
import { MAX_QUANTITY, useCart, type CartLine } from '../lib/cart-context';
import { useCustomer } from '../lib/customer-context';
import { toHalfWidth, yen } from '../lib/format';
import { evaluateOrderTiming } from '../lib/order-timing';
import {
  DEFAULT_STORE_LOCATIONS,
  extractDynamicAreaTabs,
  fetchStores,
  filterStoresByArea,
  getSavedOrderStoreId,
  getStoreSelectionSource,
  isStoreHolidayOnDate,
  saveOrderStoreId,
  toStoreSnapshot,
  type StoreLocation,
} from '../lib/stores';
import { formatKm } from '../lib/geo';
import { useNearestStore } from '../lib/useNearestStore';
import StoreLocator from '../components/order/StoreLocator';
import LoginGate from '../components/order/LoginGate';
import DeliveryAddressFields from '../components/order/DeliveryAddressFields';
import FulfillmentPicker from '../components/order/FulfillmentPicker';
import { EMPTY_ADDRESS, timeWord, validateAddress, type AddressErrors, type DeliveryAddress, type DeliveryOptions, type Fulfillment } from '../components/order/fulfillment';
import MemberSavings from '../components/order/MemberSavings';
import OrderReview from '../components/order/OrderReview';
import PriceSummary from '../components/order/PriceSummary';
import QuantitySelector from '../components/order/QuantitySelector';
import type { BuyNowState } from '../components/order/OrderButtons';
import { useOrderQuote, type Savings } from '../components/order/useOrderQuote';
import DineInOrderExperience from '../components/order/DineInOrderExperience';
import QrFulfillmentChoiceModal from '../components/order/QrFulfillmentChoiceModal';

interface Slot {
  date: string;
  time: string;
  at: string;
}

interface SlotsResponse {
  enabled: boolean;
  /** Set while the kitchen has paused new online orders because it is too busy. */
  pausedUntil?: string | null;
  note: string;
  pickup: { enabled: boolean; note?: string };
  delivery: DeliveryOptions;
  dineIn?: {
    enabled: boolean;
    leadMinutes: number;
    times: string;
    taxRatePercent?: number;
    requireTableNumber?: boolean;
    allowPayAtRegister?: boolean;
    allowOnlinePay?: boolean;
    note?: string;
    tableCount?: number;
    tablePrefix?: string;
    tableNames?: string;
  };
  slots: Slot[];
}

interface QuickMenuItem {
  id: string;
  categoryId: string;
  nameEn: string;
  nameJa?: string | null;
  descJa?: string | null;
  price: number;
  imageUrl?: string | null;
  image?: string | null;
  badge?: string | null;
  isPopular?: boolean;
  isRecommended?: boolean;
  isSoldOut?: boolean;
  isOrderable?: boolean;
  menuTypes?: string[];
}

interface QuickCategory {
  id: string;
  nameEn: string;
  nameJa?: string | null;
}

// How often an open checkout re-checks which options (pickup / delivery) are switched on.
const RECHECK_MS = 60_000;

const NO_SLOTS: SlotsResponse = {
  enabled: false, note: '', slots: [],
  pickup: { enabled: false, note: '' },
  delivery: { enabled: false, fee: 0, freeOver: 0, minOrder: 0, areas: [], note: '' },
  dineIn: { enabled: false, leadMinutes: 0, times: '', note: '' },
};

type Field = 'name' | 'phone' | 'email' | 'pickupAt';

const DEFAULT_TIMEZONE = 'Asia/Tokyo';
const PHONE_PATTERN = /^[\d\s()+-]{8,20}$/;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const dayLabel = (date: string) =>
  new Date(`${date}T00:00:00Z`).toLocaleDateString('ja-JP', { timeZone: 'UTC', month: 'long', day: 'numeric', weekday: 'short' });

const todayKey = (timeZone: string) => new Date().toLocaleDateString('en-CA', { timeZone });

// "Order now" items survive the trip to the login page and back (this tab only).
const BUY_NOW_KEY = 'adarsha_buy_now';

function readStoredBuyNow(): CartLine | null {
  try {
    const raw = sessionStorage.getItem(BUY_NOW_KEY) ?? sessionStorage.getItem('kalpana_buy_now');
    const stored = JSON.parse(raw ?? 'null');
    return stored && typeof stored.id === 'string' && stored.quantity > 0 ? stored : null;
  } catch {
    return null;
  }
}

function storeBuyNow(line: CartLine | null) {
  try {
    if (line) sessionStorage.setItem(BUY_NOW_KEY, JSON.stringify(line));
    else sessionStorage.removeItem(BUY_NOW_KEY);
  } catch {
    // Storage unavailable: the item just won't survive a login redirect.
  }
}

/** Passed to the status page so it can show the "order confirmed" banner once. */
export interface PlacedState {
  justPlaced: true;
}

function validate(form: Record<Field, string>): Partial<Record<Field, string>> {
  const errors: Partial<Record<Field, string>> = {};
  if (!form.name.trim()) errors.name = 'お名前を入力してください。';
  if (!form.phone.trim()) errors.phone = '電話番号を入力してください。';
  else if (!PHONE_PATTERN.test(form.phone.trim())) errors.phone = '電話番号の形式が正しくありません（例: 090-1234-5678）。';
  if (form.email.trim() && !EMAIL_PATTERN.test(form.email.trim())) errors.email = 'メールアドレスの形式が正しくありません。';
  if (!form.pickupAt) errors.pickupAt = '日時を選択してください。';
  return errors;
}

export default function Order() {
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams, setSearchParams] = useSearchParams();
  const cart = useCart();
  const { customer, refresh: refreshCustomer } = useCustomer();

  // "Order now" from a menu card checks out just that item and leaves the cart as it is.
  const [buyNow, setBuyNow] = useState<CartLine | null>(() => (location.state as BuyNowState | null)?.buyNow ?? readStoredBuyNow());
  useEffect(() => storeBuyNow(buyNow), [buyNow]);
  const lines = buyNow ? [buyNow] : cart.lines;
  const items = lines.map(line => ({ itemId: line.id, quantity: line.quantity }));

  // Multi-branch dynamic store state
  const [stores, setStores] = useState<StoreLocation[]>(DEFAULT_STORE_LOCATIONS);
  // True once /api/v1/stores has answered (or failed), so nearest-store detection uses real data.
  const [storesLoaded, setStoresLoaded] = useState(false);
  const queryStoreId = searchParams.get('store') || (location.state as { storeId?: string } | null)?.storeId || '';
  const [selectedStoreId, setSelectedStoreId] = useState<string>(() => queryStoreId || getSavedOrderStoreId(DEFAULT_STORE_LOCATIONS));
  const [storeAreaFilter, setStoreAreaFilter] = useState<string>('all');
  const [storeSearch, setStoreSearch] = useState<string>('');
  const [storePickerExpanded, setStorePickerExpanded] = useState<boolean>(false);

  // Quick menu browser state (allows adding items right inside /order in one place)
  const [menuItems, setMenuItems] = useState<QuickMenuItem[]>([]);
  const [menuCategories, setMenuCategories] = useState<QuickCategory[]>([]);
  const [activeCategoryId, setActiveCategoryId] = useState<string>('all');
  const [menuSearch, setMenuSearch] = useState<string>('');
  const [showQuickMenu, setShowQuickMenu] = useState<boolean>(false);

  const [slotsData, setSlotsData] = useState<SlotsResponse | null>(null);
  const [settings, setSettings] = useState<any>({});
  const [form, setForm] = useState({ name: '', phone: '', email: '', pickupAt: '', note: '', website: '' });
  const [errors, setErrors] = useState<Partial<Record<Field | 'tableNumber', string>>>({});
  const [submitting, setSubmitting] = useState(false);
  // Orders are sent in two steps: fill in the details, then confirm everything on a review screen.
  const [step, setStep] = useState<'details' | 'review'>('details');
  // Set once the order is saved, so the emptied cart isn't shown while the status page loads.
  const [placed, setPlaced] = useState(false);
  const [asGuest, setAsGuest] = useState(false);
  const [savings, setSavings] = useState<Savings>({ offerId: '', offerIds: [], rewardId: '', pointsToUse: 0 });
  const { tableNum } = useParams<{ tableNum?: string }>();
  const queryTable = searchParams.get('table') || tableNum || '';
  const queryFulfillment = searchParams.get('fulfillment') || '';
  const isDineInPath = location.pathname.startsWith('/dine-in') || location.pathname.startsWith('/table');

  const savedSession = useMemo(() => {
    try {
      const raw = sessionStorage.getItem('adarsha_table_session');
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  }, []);

  const effectiveTable = queryTable || savedSession?.table || '';
  const isDineInInit = Boolean(queryTable || isDineInPath || queryFulfillment.toUpperCase() === 'DINE_IN' || savedSession?.fulfillment === 'DINE_IN');
  const initialFulfillment: Fulfillment = isDineInInit ? 'DINE_IN' : 'PICKUP';

  const isQrScan = Boolean(queryTable || isDineInPath || searchParams.has('qr'));

  // QR choice modal: shown on QR scan so customer can choose Dine-In vs Takeout
  const [showQrChoice, setShowQrChoice] = useState<boolean>(() => {
    if (!isQrScan) return false;
    try {
      const explicitChoice = sessionStorage.getItem('adarsha_qr_choice');
      return !explicitChoice;
    } catch {
      return true;
    }
  });

  const [fulfillment, setFulfillment] = useState<Fulfillment>(initialFulfillment);
  const [tableNumber, setTableNumber] = useState<string>(effectiveTable);
  const [address, setAddress] = useState<DeliveryAddress>(EMPTY_ADDRESS);
  const [addressErrors, setAddressErrors] = useState<AddressErrors>({});
  const [saveAddress, setSaveAddress] = useState(false);
  // The latest choice, for the background re-check below.
  const fulfillmentRef = useRef(fulfillment);
  useEffect(() => {
    fulfillmentRef.current = fulfillment;
  }, [fulfillment]);
  const isDelivery = fulfillment === 'DELIVERY';
  const isDineIn = fulfillment === 'DINE_IN';
  const word = timeWord(fulfillment);
  const { quote, problem } = useOrderQuote(items, savings, Boolean(customer), fulfillment);

  const handleSelectDineIn = () => {
    setFulfillment('DINE_IN');
    setShowQrChoice(false);
    try {
      sessionStorage.setItem('adarsha_qr_choice', 'DINE_IN');
      sessionStorage.setItem('adarsha_table_session', JSON.stringify({
        table: effectiveTable || tableNumber || '1',
        storeId: selectedStoreId,
        fulfillment: 'DINE_IN',
      }));
    } catch {}
    setSearchParams(params => {
      params.set('fulfillment', 'DINE_IN');
      if (effectiveTable) params.set('table', effectiveTable);
      return params;
    }, { replace: true });
  };

  const handleSelectTakeout = () => {
    setFulfillment('PICKUP');
    setShowQrChoice(false);
    try {
      sessionStorage.setItem('adarsha_qr_choice', 'PICKUP');
      sessionStorage.setItem('adarsha_table_session', JSON.stringify({
        table: effectiveTable || tableNumber || '1',
        storeId: selectedStoreId,
        fulfillment: 'PICKUP',
      }));
    } catch {}
    setSearchParams(params => {
      params.set('fulfillment', 'PICKUP');
      return params;
    }, { replace: true });
  };

  // Preserve table order session across reloads and menu browsing
  useEffect(() => {
    if (queryTable || queryFulfillment.toUpperCase() === 'DINE_IN' || isDineIn) {
      try {
        sessionStorage.setItem('adarsha_table_session', JSON.stringify({
          table: queryTable || tableNumber,
          storeId: queryStoreId || selectedStoreId,
          fulfillment: 'DINE_IN',
        }));
      } catch {}
    }
  }, [queryTable, queryFulfillment, isDineIn, queryStoreId, selectedStoreId, tableNumber]);

  // Fetch dynamic store locations & menu items
  useEffect(() => {
    fetchStores()
      .then(list => {
        if (list) {
          setStores(list);
          setSelectedStoreId(prev => {
            if (queryStoreId && list.some(s => s.id === queryStoreId)) {
              saveOrderStoreId(queryStoreId);
              return queryStoreId;
            }
            if (list.some(s => s.id === prev)) return prev;
            const saved = getSavedOrderStoreId(list);
            saveOrderStoreId(saved);
            return saved;
          });
        }
      })
      .finally(() => setStoresLoaded(true));

    getPublic<QuickMenuItem[]>('/api/v1/menu/items')
      .then(data => {
        if (Array.isArray(data)) {
          setMenuItems(data.filter(it => it.isOrderable !== false && !it.isSoldOut));
        }
      })
      .catch(() => {});

    getPublic<QuickCategory[]>('/api/v1/menu/categories')
      .then(cats => {
        if (Array.isArray(cats)) setMenuCategories(cats);
      })
      .catch(() => {});
  }, []);

  // Sync if URL ?store= changes or another component dispatches adarsha:store-changed
  useEffect(() => {
    if (queryStoreId && stores.some(s => s.id === queryStoreId) && queryStoreId !== selectedStoreId) {
      setSelectedStoreId(queryStoreId);
      saveOrderStoreId(queryStoreId);
    }
  }, [queryStoreId, stores]);

  useEffect(() => {
    const onStoreChanged = (e: Event) => {
      const detailId = (e as CustomEvent<{ storeId?: string }>).detail?.storeId;
      if (detailId && stores.some(s => s.id === detailId)) {
        setSelectedStoreId(detailId);
      }
    };
    window.addEventListener('adarsha:store-changed', onStoreChanged);
    return () => window.removeEventListener('adarsha:store-changed', onStoreChanged);
  }, [stores]);

  const handleSelectStore = (store: StoreLocation) => {
    setSelectedStoreId(store.id);
    // 'manual': the customer chose this, so nearest-store detection won't override it next visit.
    saveOrderStoreId(store.id, 'manual');
    const nextParams = new URLSearchParams(searchParams);
    nextParams.set('store', store.id);
    setSearchParams(nextParams, { replace: true });
    toast.success(`ご注文店舗を「Adarsha ${store.name}」に設定しました`, { id: 'store-select-toast', duration: 2200 });
  };

  // ── Nearest-store detection ──
  // Respects settings configured in the admin dashboard:
  // settings.geolocationEnabled: completely disables nearest locator if false
  // settings.geolocationAutoSelect: disables automatic GPS location on load if false
  // settings.geolocationMaxDistanceKm: maximum distance threshold in km (default 10)
  const isGeoEnabled = settings.geolocationEnabled !== false;
  const isAutoSelectEnabled = isGeoEnabled && settings.geolocationAutoSelect !== false;
  const maxDistanceKm = typeof settings.geolocationMaxDistanceKm === 'number' ? settings.geolocationMaxDistanceKm : 10;

  const nearest = useNearestStore({
    stores,
    maxKm: maxDistanceKm,
    onSelect: store => {
      setSelectedStoreId(store.id);
      saveOrderStoreId(store.id, 'auto');
    },
  });
  const rankedStores = useMemo(() => (isGeoEnabled ? nearest.ranked.map(r => r.store) : stores), [nearest.ranked, stores, isGeoEnabled]);
  const distanceLabel = (id: string) => {
    if (!isGeoEnabled) return '';
    const km = nearest.distanceById.get(id);
    return km === undefined ? '' : `（${formatKm(km)}）`;
  };

  // On page load: detect automatically unless the customer already picked a store themselves
  // (requirement: never override a manual choice), arrived via a ?store= link, or disabled in dashboard.
  const autoLocateTried = useRef(false);
  const locate = nearest.locate;
  useEffect(() => {
    if (!storesLoaded || autoLocateTried.current) return;
    autoLocateTried.current = true;
    if (!isAutoSelectEnabled || queryStoreId || getStoreSelectionSource() === 'manual') return;
    void locate();
  }, [storesLoaded, queryStoreId, isAutoSelectEnabled, locate]);

  const selectedStore = useMemo(
    () => stores.find(s => s.id === selectedStoreId) ?? stores[0] ?? DEFAULT_STORE_LOCATIONS[0],
    [stores, selectedStoreId]
  );

  const dynamicAreaTabs = useMemo(() => extractDynamicAreaTabs(stores), [stores]);

  const filteredStores = useMemo(() => {
    // rankedStores = nearest-first after a location lookup, otherwise the normal order.
    const byArea = filterStoresByArea(rankedStores, storeAreaFilter);
    const q = storeSearch.trim().toLowerCase();
    if (!q) return byArea;
    return byArea.filter(s =>
      s.name.toLowerCase().includes(q) ||
      s.address.toLowerCase().includes(q) ||
      s.access.toLowerCase().includes(q) ||
      s.badge.toLowerCase().includes(q) ||
      s.phone.toLowerCase().includes(q)
    );
  }, [rankedStores, storeAreaFilter, storeSearch]);

  // Live clock tick for Lunch / Dinner / Takeout order timing status & notifications
  const [nowTick, setNowTick] = useState<number>(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNowTick(Date.now()), 30_000);
    return () => clearInterval(id);
  }, []);

  const timingStatus = useMemo(
    () => evaluateOrderTiming(selectedStore, settings, new Date(nowTick)),
    [selectedStore, settings, nowTick]
  );

  // Members don't retype their details; anything already typed is kept.
  useEffect(() => {
    if (!customer) return;
    setForm(prev => ({ ...prev, name: prev.name || customer.name, phone: prev.phone || customer.phone, email: prev.email || customer.email }));
    // Delivery starts from the address saved in the member's profile.
    setAddress(prev => (prev.postalCode || prev.city ? prev : { ...EMPTY_ADDRESS, ...customer.address }));
  }, [customer]);

  const selectedStoreIdRef = useRef(selectedStoreId);
  useEffect(() => {
    selectedStoreIdRef.current = selectedStoreId;
  }, [selectedStoreId]);

  /** Refreshes the times for pickup, delivery, or dine-in; resolves to the latest list. */
  const loadSlots = (type: Fulfillment = fulfillment, storeId: string = selectedStoreIdRef.current) =>
    apiFetch(`/api/v1/orders/slots?type=${type === 'DELIVERY' ? 'delivery' : type === 'DINE_IN' ? 'dine_in' : 'pickup'}&storeId=${encodeURIComponent(storeId || '')}`)
      .then(res => res.json())
      .then((data: SlotsResponse): Slot[] | Promise<Slot[]> => {
        setSlotsData(data);
        if (type === 'DINE_IN') {
          // Table orders are prepared immediately
          const earliest = data.slots[0]?.at || new Date().toISOString();
          setForm(prev => ({ ...prev, pickupAt: earliest }));
          return data.slots;
        }
        // Start on an option the restaurant actually offers.
        if (type === 'PICKUP' && !data.pickup.enabled && data.delivery.enabled) {
          setFulfillment('DELIVERY');
          return loadSlots('DELIVERY', storeId);
        }
        // Delivery was switched off while this page was open: fall back to pickup.
        if (type === 'DELIVERY' && !data.delivery.enabled && data.pickup.enabled) {
          toast('現在デリバリーは受け付けておりません。お持ち帰りでご注文いただけます。', { icon: 'ℹ️', id: 'delivery-off' });
          setFulfillment('PICKUP');
          setForm(prev => ({ ...prev, pickupAt: '' }));
          return loadSlots('PICKUP', storeId);
        }
        // Pickup only (delivery switched off): no time to choose, the order is for the earliest time.
        if (!data.delivery.enabled) {
          setForm(prev => ({ ...prev, pickupAt: data.slots[0]?.at ?? '' }));
          return data.slots;
        }
        // Keep the chosen time only while it is still offered.
        setForm(prev => (data.slots.some(slot => slot.at === prev.pickupAt) ? prev : { ...prev, pickupAt: '' }));
        return data.slots;
      })
      .catch(() => {
        setSlotsData(NO_SLOTS);
        return [] as Slot[];
      });

  const chooseFulfillment = (type: Fulfillment) => {
    setFulfillment(type);
    setForm(prev => ({ ...prev, pickupAt: '' }));
    setErrors(prev => ({ ...prev, pickupAt: undefined }));
    loadSlots(type, selectedStoreId);
  };

  useEffect(() => {
    loadSlots(fulfillmentRef.current, selectedStoreId);
  }, [selectedStoreId]);

  useEffect(() => {
    getPublic<any>('/api/v1/settings').then(setSettings).catch(console.error);
    // Pickup and delivery can be switched on and off from the admin dashboard at any time, so the
    // options are re-checked while the page is open and whenever the customer comes back to it.
    const recheck = () => {
      if (document.visibilityState === 'visible') loadSlots(fulfillmentRef.current, selectedStoreIdRef.current);
    };
    const intervalId = setInterval(recheck, RECHECK_MS);
    document.addEventListener('visibilitychange', recheck);
    return () => {
      clearInterval(intervalId);
      document.removeEventListener('visibilitychange', recheck);
    };
  }, []);

  // The time is only asked for while delivery is offered; pickup-only and dine-in orders are for the earliest time.
  const askTime = fulfillment !== 'DINE_IN' && Boolean(slotsData?.delivery.enabled);
  const earliestSlot = slotsData?.slots[0];

  const slotsByDay = useMemo(() => {
    const groups = new Map<string, Slot[]>();
    for (const slot of slotsData?.slots ?? []) groups.set(slot.date, [...(groups.get(slot.date) ?? []), slot]);
    return [...groups];
  }, [slotsData]);

  const today = todayKey(settings.timezone || DEFAULT_TIMEZONE);
  const selectedPickupDateStr = useMemo(() => {
    if (form.pickupAt) {
      const slot = slotsData?.slots.find(s => s.at === form.pickupAt);
      if (slot) return slot.date;
      return form.pickupAt.slice(0, 10);
    }
    return earliestSlot?.date || today;
  }, [form.pickupAt, slotsData, earliestSlot, today]);

  const isSelectedDateHoliday = useMemo(
    () => isStoreHolidayOnDate(selectedStore, selectedPickupDateStr),
    [selectedStore, selectedPickupDateStr]
  );

  const filteredQuickMenu = useMemo(() => {
    const q = menuSearch.trim().toLowerCase();
    return menuItems.filter(item => {
      if (activeCategoryId === 'popular' && !item.isPopular && !item.isRecommended) return false;
      if (activeCategoryId !== 'all' && activeCategoryId !== 'popular' && item.categoryId !== activeCategoryId) return false;
      if (!q) return true;
      const ja = (item.nameJa || '').toLowerCase();
      const en = (item.nameEn || '').toLowerCase();
      const desc = (item.descJa || '').toLowerCase();
      return ja.includes(q) || en.includes(q) || desc.includes(q);
    });
  }, [menuItems, activeCategoryId, menuSearch]);

  const handleChange = (e: ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setForm(prev => ({ ...prev, [name]: name === 'phone' ? toHalfWidth(value) : value }));
    if (name in errors) setErrors(prev => ({ ...prev, [name]: undefined }));
  };

  const setLineQuantity = (id: string, quantity: number) => {
    if (buyNow) setBuyNow(quantity > 0 ? { ...buyNow, quantity } : null);
    else cart.setQuantity(id, quantity);
  };

  const handleQuickAddItem = (item: QuickMenuItem) => {
    const displayName = item.nameJa || item.nameEn;
    // Check if this item is strictly a Lunch-only item and we are outside Lunch order hours with enforcement on
    const types = Array.isArray(item.menuTypes) ? item.menuTypes : [];
    const isLunchOnly = types.includes('LUNCH') && !types.includes('GRAND') && !types.includes('TAKEOUT');
    if (!isDineIn && timingStatus.enforceOrderTimeWindow && isLunchOnly && !timingStatus.isLunchOpenNow) {
      toast.error(
        `「${displayName}」はランチ限定メニューです。ランチ注文受付時間（${timingStatus.lunchHoursLabel}）にご注文ください。（現在: ${timingStatus.nowHhmm}）`,
        { id: 'order-time-restriction-toast', duration: 4500, icon: '⏰' }
      );
      return;
    }
    if (!isDineIn && timingStatus.enforceOrderTimeWindow && !timingStatus.isTakeoutOpenNow) {
      toast.error(
        `${timingStatus.notificationTitle}（ランチ ${timingStatus.lunchHoursLabel} ／ ディナー ${timingStatus.dinnerHoursLabel}）`,
        { id: 'order-time-restriction-toast', duration: 4500, icon: '⏰' }
      );
      return;
    }
    if (buyNow) {
      // Move buyNow into cart so user can combine multiple items seamlessly
      cart.add({
        id: buyNow.id,
        name: buyNow.name,
        price: buyNow.price,
        img: buyNow.img,
      });
      cart.setQuantity(buyNow.id, buyNow.quantity);
      setBuyNow(null);
    }
    const existing = cart.lines.find(l => l.id === item.id && !l.options?.length);
    if (existing) {
      const nextQty = Math.min(MAX_QUANTITY, existing.quantity + 1);
      cart.setQuantity(existing.cartKey, nextQty);
    } else {
      cart.add({
        id: item.id,
        name: displayName,
        price: item.price,
        img: assetUrl(item.imageUrl || item.image) || '/bg-hero-img.webp',
      });
    }
    toast.success(`「${displayName}」をカートに追加しました`, { duration: 1800 });
  };

  /** Step 1: check the form, re-check the pickup time against the latest slots, then show the review screen. */
  const handleReview = async (e: FormEvent) => {
    e.preventDefault();
    if (!isDineIn && timingStatus.enforceOrderTimeWindow && !timingStatus.isTakeoutOpenNow) {
      toast.error(
        `${timingStatus.notificationTitle} — 受付時間（ランチ ${timingStatus.lunchHoursLabel} ／ ディナー ${timingStatus.dinnerHoursLabel}）にご注文ください。`,
        { id: 'order-time-restriction-toast', duration: 5000, icon: '⏰' }
      );
      return;
    }
    const found = validate(form);
    setErrors(found);
    const foundAddress = isDelivery ? validateAddress(address) : {};
    setAddressErrors(foundAddress);
    if (isDineIn && slotsData?.dineIn?.requireTableNumber !== false && !tableNumber.trim()) {
      setErrors(prev => ({ ...prev, tableNumber: 'テーブル番号をご入力ください。' }));
      document.getElementById('order-tableNumber')?.focus();
      return;
    }
    const firstError = (Object.keys(found) as Field[])[0];
    const firstAddressError = Object.keys(foundAddress)[0];
    if (firstError || firstAddressError) {
      document.getElementById(firstError ? `order-${firstError}` : `addr-${firstAddressError}`)?.focus();
      return;
    }
    if (quote && quote.minOrderShortfall > 0) {
      toast.error(`デリバリーはあと${yen(quote.minOrderShortfall)}のご注文で承ります。`);
      return;
    }
    const latest = await loadSlots(fulfillment, selectedStoreId);
    if (!askTime) {
      // The earliest time was just refreshed by loadSlots.
      if (!isDineIn && latest.length === 0) {
        toast.error(
          `${timingStatus.notificationTitle}: ${timingStatus.notificationMessage}`,
          { id: 'no-slots-time-toast', duration: 5000, icon: '⏰' }
        );
        return;
      }
    } else if (!latest.some(slot => slot.at === form.pickupAt)) {
      setErrors({ pickupAt: `この${word}時間は締め切られました。別の時間をお選びください。` });
      document.getElementById('order-pickupAt')?.focus();
      return;
    }
    setStep('review');
    window.scrollTo({ top: 0, behavior: 'smooth' });
    requestAnimationFrame(() => document.getElementById('review-heading')?.focus());
  };

  /** Step 2: send the order the customer just reviewed. */
  const placeOrder = async () => {
    if (submitting) return;
    setSubmitting(true);
    try {
      const rawOfferIds = savings.offerIds && savings.offerIds.length > 0
        ? savings.offerIds
        : savings.offerId
          ? [savings.offerId]
          : [];
      const storeSnapshot = toStoreSnapshot(selectedStore);
      const res = await apiFetch('/api/v1/orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...form,
          note: [tableNumber.trim() ? `[テーブル: ${tableNumber.trim()}]` : null, form.note].filter(Boolean).join(' '),
          tableNumber: tableNumber.trim() || undefined,
          items,
          offerIds: rawOfferIds,
          offerId: rawOfferIds[0] || null,
          rewardId: savings.rewardId || null,
          pointsToUse: savings.pointsToUse,
          fulfillment,
          storeId: selectedStore.id,
          storeName: selectedStore.name,
          storeAddress: selectedStore.address,
          storePhone: selectedStore.phone,
          store: storeSnapshot,
          ...(isDelivery ? { deliveryAddress: address } : {}),
        }),
      });
      if (res.ok) {
        const { token } = await res.json();
        setPlaced(true);
        const state: PlacedState = { justPlaced: true };
        navigate(`/order/${token}`, { state });
        if (isDelivery && saveAddress) {
          // Best effort: the order is already placed even if saving the address fails.
          apiFetch('/api/v1/customers/me', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ address }) }).catch(() => undefined);
        }
        // Only what was ordered leaves the cart; an "order now" purchase never touches it.
        if (buyNow) storeBuyNow(null);
        else cart.removeMany(items.map(item => item.itemId));
        refreshCustomer();
        return;
      }
      if (res.status === 401) {
        toast.error('ログインの有効期限が切れました。もう一度ログインしてください。');
        refreshCustomer();
        return;
      }
      if (res.status === 409) {
        // Sold out, slot taken, delivery switched off or points changed: back to the form with fresh data.
        await loadSlots(fulfillmentRef.current);
        setStep('details');
      }
      toast.error(await errorMessage(res, 'ご注文を送信できませんでした。もう一度お試しください。'));
    } catch {
      toast.error('通信エラーが発生しました。入力内容はそのままです。もう一度お試しください。');
    } finally {
      setSubmitting(false);
    }
  };

  const activePhone = selectedStore?.phone || settings.phone;
  const phoneLink = activePhone ? <a href={`tel:${activePhone}`} style={{ color: 'var(--spice)', fontWeight: 'bold' }}>{activePhone}</a> : null;
  const subtotal = lines.reduce((sum, line) => sum + line.price * line.quantity, 0);

  if (isDineIn && !placed) {
    return (
      <>
        <DineInOrderExperience
          initialTableNumber={tableNumber || queryTable || '1'}
          selectedStore={selectedStore}
          stores={stores}
          onSwitchToTakeout={handleSelectTakeout}
          onOpenChoiceModal={() => setShowQrChoice(true)}
        />
        <QrFulfillmentChoiceModal
          open={showQrChoice}
          tableNumber={effectiveTable || tableNumber || '1'}
          store={selectedStore}
          onSelectDineIn={handleSelectDineIn}
          onSelectTakeout={handleSelectTakeout}
          onClose={() => setShowQrChoice(false)}
        />
      </>
    );
  }

  return (
    <main>
      <title>{`ご注文（${selectedStore.name}） | Adarsha (アダルサ)`}</title>
      <meta name="robots" content="noindex" />
      <div className="section" style={{ backgroundColor: 'var(--cream)', paddingTop: '120px', minHeight: '70vh' }}>
        <div style={{ maxWidth: '1140px', margin: '0 auto', padding: '0 16px' }}>
          <div className="centered" style={{ marginBottom: '28px' }}>
            <div className="section-label">MULTI-BRANCH ONLINE ORDER</div>
            <h1 className="section-title">オンライン<em>ご注文</em></h1>
            <div className="divider"></div>
            <p className="section-sub">ご希望の店舗（全{stores.length}店舗対応）とメニューを選んで、1つの画面でスムーズにご注文いただけます</p>
          </div>

          {/* ── QR SWITCHER BANNER (When customer arrived via table QR but is viewing takeout) ── */}
          {effectiveTable && !isDineIn && !placed && (
            <section
              style={{
                ...cardStyle,
                marginBottom: '20px',
                border: '1.5px solid #fed7aa',
                background: 'linear-gradient(135deg, #ffffff 0%, #fff7ed 100%)',
                padding: '16px 20px',
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                  <span style={{ width: '40px', height: '40px', borderRadius: '12px', backgroundColor: '#ea580c', color: '#fff', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, fontSize: '1.2rem' }}>
                    🛍️
                  </span>
                  <div>
                    <div style={{ fontSize: '0.74rem', fontWeight: 800, color: '#c2410c', textTransform: 'uppercase' }}>
                      QR SCANNED · テーブル {effectiveTable}
                    </div>
                    <div style={{ fontSize: '1.05rem', color: '#431407', margin: 0, fontWeight: 800 }}>
                      テイクアウト（お持ち帰り）注文中
                    </div>
                    <div style={{ fontSize: '0.78rem', color: '#7c2d12', marginTop: 2 }}>
                      お席でお食事される場合は「店内飲食」へお切り替えください
                    </div>
                  </div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <button
                    type="button"
                    onClick={handleSelectDineIn}
                    style={{
                      background: '#ea580c',
                      color: '#ffffff',
                      border: 'none',
                      borderRadius: 9999,
                      padding: '8px 16px',
                      fontSize: '0.84rem',
                      fontWeight: 800,
                      cursor: 'pointer',
                      boxShadow: '0 2px 6px rgba(234, 88, 12, 0.2)',
                    }}
                  >
                    🍽️ テーブル {effectiveTable} の店内飲食に切替
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowQrChoice(true)}
                    style={{
                      background: '#ffffff',
                      color: '#64748b',
                      border: '1px solid #cbd5e1',
                      borderRadius: 9999,
                      padding: '8px 12px',
                      fontSize: '0.8rem',
                      fontWeight: 700,
                      cursor: 'pointer',
                    }}
                  >
                    選択
                  </button>
                </div>
              </div>
            </section>
          )}

          {/* ── TABLE ORDER HEADER (When scanning table QR or ordering dine-in) ── */}
          {!placed && isDineIn && (
            <section
              style={{
                ...cardStyle,
                marginBottom: '20px',
                border: '2px solid #ea580c',
                background: 'linear-gradient(135deg, #ffffff 0%, #fff7ed 100%)',
                boxShadow: '0 4px 14px rgba(234, 88, 12, 0.12)',
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                  <span style={{ width: '42px', height: '42px', borderRadius: '12px', background: 'linear-gradient(135deg, #ea580c, #f97316)', color: '#fff', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, fontSize: '1.3rem' }}>
                    🍽️
                  </span>
                  <div>
                    <div style={{ fontSize: '0.74rem', fontWeight: 800, letterSpacing: '0.08em', color: '#ea580c', textTransform: 'uppercase' }}>
                      TABLE ORDER · 店内モバイルオーダー
                    </div>
                    <h1 style={{ fontSize: '1.25rem', color: '#111827', margin: 0, fontWeight: 800 }}>
                      Adarsha {selectedStore.name} · 【{tableNumber ? (tableNumber.includes('席') || tableNumber.includes('テーブル') ? tableNumber : `テーブル ${tableNumber}`) : 'お席から注文'}】
                    </h1>
                  </div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span style={{ padding: '6px 14px', borderRadius: '999px', backgroundColor: '#ffedd5', color: '#9a3412', fontWeight: 700, fontSize: '0.82rem' }}>
                    店内飲食（消費税10%）
                  </span>
                </div>
              </div>
            </section>
          )}

          {!placed && !isDineIn && (
            /* ── MULTI-BRANCH STORE SELECTOR HUB ── */
            <section
              aria-label="ご注文店舗の選択"
              style={{
                ...cardStyle,
                marginBottom: '24px',
                border: '1.5px solid rgba(200, 80, 26, 0.22)',
                background: 'linear-gradient(180deg, #ffffff 0%, #fffaf4 100%)',
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '12px', flexWrap: 'wrap', marginBottom: '16px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <span style={{ width: '36px', height: '36px', borderRadius: '10px', background: 'linear-gradient(135deg, #c8501a, #e8682c)', color: '#fff', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                    <Store size={20} />
                  </span>
                  <div>
                    <div style={{ fontSize: '0.74rem', fontWeight: 700, letterSpacing: '0.08em', color: 'var(--spice)', textTransform: 'uppercase' }}>
                      STEP 1 · SELECT BRANCH
                    </div>
                    <h2 style={{ fontSize: '1.15rem', color: 'var(--dark-bark)', margin: 0 }}>
                      お受け取り・ご注文店舗を選択（全{stores.length}店舗）
                    </h2>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setStorePickerExpanded(prev => !prev)}
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '6px',
                    padding: '8px 14px',
                    borderRadius: '999px',
                    border: '1.5px solid rgba(200,80,26,0.35)',
                    backgroundColor: storePickerExpanded ? 'var(--spice)' : '#fff',
                    color: storePickerExpanded ? '#fff' : 'var(--spice)',
                    fontWeight: 700,
                    fontSize: '0.84rem',
                    cursor: 'pointer',
                    transition: 'all 0.2s',
                  }}
                >
                  {storePickerExpanded ? (
                    <>店舗一覧を閉じる <ChevronUp size={16} /></>
                  ) : (
                    <>店舗を変更・一覧から選ぶ（{stores.length}店舗） <ChevronDown size={16} /></>
                  )}
                </button>
              </div>

              {/* Nearest-store finder: GPS button, postcode/address fallback and status message */}
              {isGeoEnabled && (
                <div style={{ marginBottom: '14px' }}>
                  <StoreLocator
                    idPrefix="order-store-locator"
                    busy={nearest.busy}
                    message={nearest.message}
                    tone={nearest.tone}
                    onLocate={nearest.locate}
                    onSearch={nearest.locateByAddress}
                  />
                </div>
              )}

              {/* Selected Branch Showcase Card */}
              <div
                style={{
                  borderRadius: '14px',
                  border: '1.5px solid rgba(200, 80, 26, 0.32)',
                  backgroundColor: '#fff',
                  padding: '16px 18px',
                  boxShadow: '0 4px 14px rgba(200, 80, 26, 0.06)',
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '12px', flexWrap: 'wrap' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
                    <span style={{ background: 'linear-gradient(135deg, #c8501a, #e8682c)', color: '#fff', fontWeight: 800, fontSize: '0.78rem', padding: '4px 10px', borderRadius: '999px' }}>
                      選択中 · No.{selectedStore.number}
                    </span>
                    <span style={{ fontSize: '1.22rem', fontWeight: 800, color: 'var(--dark-bark)' }}>
                      Adarsha {selectedStore.name}
                    </span>
                    {selectedStore.badge && (
                      <span style={{ fontSize: '0.75rem', fontWeight: 600, color: '#9a3412', backgroundColor: '#ffedd5', padding: '3px 10px', borderRadius: '999px' }}>
                        {selectedStore.badge}
                      </span>
                    )}
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                    {selectedStore.phone && (
                      <a
                        href={`tel:${selectedStore.phone}`}
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '5px',
                          padding: '6px 12px',
                          borderRadius: '999px',
                          backgroundColor: '#fff7ed',
                          border: '1px solid #fed7aa',
                          color: '#c2410c',
                          fontWeight: 700,
                          fontSize: '0.82rem',
                          textDecoration: 'none',
                        }}
                      >
                        <Phone size={14} /> {selectedStore.phone}
                      </a>
                    )}
                    <a
                      href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`Adarsha ${selectedStore.name} ${selectedStore.address}`)}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '5px',
                        padding: '6px 12px',
                        borderRadius: '999px',
                        backgroundColor: '#f8fafc',
                        border: '1px solid #e2e8f0',
                        color: '#334155',
                        fontWeight: 600,
                        fontSize: '0.8rem',
                        textDecoration: 'none',
                      }}
                    >
                      <ExternalLink size={13} /> マップ
                    </a>
                  </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(230px, 1fr))', gap: '8px 16px', marginTop: '12px', fontSize: '0.86rem', color: '#374151' }}>
                  <div style={{ display: 'flex', alignItems: 'flex-start', gap: '6px' }}>
                    <MapPin size={15} style={{ color: 'var(--spice)', flexShrink: 0, marginTop: '3px' }} />
                    <div>
                      <div style={{ fontWeight: 600 }}>{selectedStore.address}</div>
                      {selectedStore.access && <div style={{ fontSize: '0.78rem', color: '#6b7280', marginTop: '2px' }}>🚃 {selectedStore.access}</div>}
                    </div>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'flex-start', gap: '6px' }}>
                    <Clock size={15} style={{ color: 'var(--spice)', flexShrink: 0, marginTop: '3px' }} />
                    <div>
                      <div><strong>営業時間:</strong> {selectedStore.hours}</div>
                      <div style={{ fontSize: '0.78rem', color: '#6b7280', marginTop: '2px' }}><strong>定休日:</strong> {selectedStore.holiday}</div>
                    </div>
                  </div>
                </div>

                {/* ── LUNCH / DINNER / TAKEOUT ORDER TIMING STATUS & NOTIFICATION BANNER ── */}
                <div
                  style={{
                    marginTop: '12px',
                    padding: '12px 14px',
                    borderRadius: '11px',
                    backgroundColor: timingStatus.isTakeoutOpenNow ? '#f0fdf4' : '#fffbeb',
                    border: timingStatus.isTakeoutOpenNow ? '1px solid #bbf7d0' : '1.5px solid #fde68a',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '8px',
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '8px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                      <span
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '5px',
                          padding: '3px 10px',
                          borderRadius: '999px',
                          fontSize: '0.76rem',
                          fontWeight: 800,
                          backgroundColor: timingStatus.isTakeoutOpenNow ? '#16a34a' : '#d97706',
                          color: '#fff',
                        }}
                      >
                        {timingStatus.periodBadgeLabel}
                      </span>
                      <span style={{ fontSize: '0.78rem', fontWeight: 700, color: '#374151' }}>
                        現在時刻: {timingStatus.nowHhmm}
                      </span>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap', fontSize: '0.78rem' }}>
                      <span
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '4px',
                          padding: '3px 9px',
                          borderRadius: '999px',
                          backgroundColor: timingStatus.isLunchOpenNow ? '#dcfce7' : '#fff',
                          border: timingStatus.isLunchOpenNow ? '1px solid #86efac' : '1px solid #e5e7eb',
                          color: timingStatus.isLunchOpenNow ? '#166534' : '#4b5563',
                          fontWeight: 700,
                        }}
                      >
                        <Sun size={13} style={{ color: '#ea580c' }} />
                        ランチ注文受付: {timingStatus.lunchOrderEnabled ? timingStatus.lunchHoursLabel : '休止中'}
                      </span>
                      <span
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '4px',
                          padding: '3px 9px',
                          borderRadius: '999px',
                          backgroundColor: timingStatus.isDinnerOpenNow ? '#dcfce7' : '#fff',
                          border: timingStatus.isDinnerOpenNow ? '1px solid #86efac' : '1px solid #e5e7eb',
                          color: timingStatus.isDinnerOpenNow ? '#166534' : '#4b5563',
                          fontWeight: 700,
                        }}
                      >
                        <Moon size={13} style={{ color: '#4f46e5' }} />
                        ディナー注文受付: {timingStatus.dinnerOrderEnabled ? timingStatus.dinnerHoursLabel : '休止中'}
                      </span>
                    </div>
                  </div>

                  {!timingStatus.isTakeoutOpenNow && (
                    <div
                      role="status"
                      style={{
                        display: 'flex',
                        alignItems: 'flex-start',
                        gap: '8px',
                        paddingTop: '6px',
                        borderTop: '1px dashed rgba(217, 119, 6, 0.35)',
                        color: '#92400e',
                        fontSize: '0.82rem',
                        lineHeight: 1.5,
                      }}
                    >
                      <Bell size={16} style={{ color: '#d97706', flexShrink: 0, marginTop: '2px' }} />
                      <div>
                        <strong style={{ color: '#78350f' }}>⏰ {timingStatus.notificationTitle}：</strong>
                        {timingStatus.notificationMessage}
                        {timingStatus.nextOpenLabel && (
                          <span style={{ display: 'inline-block', marginLeft: '6px', fontWeight: 700, color: '#b45309' }}>
                            （{timingStatus.nextOpenLabel}）
                          </span>
                        )}
                      </div>
                    </div>
                  )}
                </div>

                {isSelectedDateHoliday && (
                  <div
                    role="alert"
                    style={{
                      marginTop: '12px',
                      padding: '10px 14px',
                      borderRadius: '10px',
                      backgroundColor: '#fef2f2',
                      border: '1px solid #fecaca',
                      color: '#991b1b',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '8px',
                      fontSize: '0.85rem',
                      fontWeight: 600,
                    }}
                  >
                    <AlertTriangle size={17} style={{ flexShrink: 0, color: '#dc2626' }} />
                    <span>
                      ご注意：選択中の「{selectedStore.name}」は<strong>{selectedStore.holiday}</strong>が定休日です。別の日時または年中無休の他店舗（駒込店・日暮里店・西葛西店・巣鴨店・下北沢店・横須賀店・千葉中央店など）もあわせてご検討ください。
                    </span>
                  </div>
                )}

                {/* Quick horizontal pill bar for instant 1-click store switching */}
                {!storePickerExpanded && (
                  <div style={{ marginTop: '12px', paddingTop: '10px', borderTop: '1px dashed #e5e7eb', display: 'flex', alignItems: 'center', gap: '6px', overflowX: 'auto', paddingBottom: '2px' }}>
                    <span style={{ fontSize: '0.75rem', color: '#6b7280', fontWeight: 600, flexShrink: 0 }}>クイック切替:</span>
                    {rankedStores.map(st => {
                      const active = st.id === selectedStore.id;
                      return (
                        <button
                          key={st.id}
                          type="button"
                          onClick={() => handleSelectStore(st)}
                          style={{
                            padding: '4px 11px',
                            borderRadius: '999px',
                            border: active ? '1.5px solid var(--spice)' : '1px solid #e5dbcd',
                            backgroundColor: active ? 'var(--spice)' : '#fff',
                            color: active ? '#fff' : 'var(--dark-bark)',
                            fontSize: '0.78rem',
                            fontWeight: active ? 700 : 500,
                            cursor: 'pointer',
                            whiteSpace: 'nowrap',
                            flexShrink: 0,
                          }}
                        >
                          {st.number}. {st.name}{distanceLabel(st.id)}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Expanded Full Multi-Branch Filter & Grid */}
              {storePickerExpanded && (
                <div style={{ marginTop: '16px', paddingTop: '16px', borderTop: '1px solid #eee' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '12px', flexWrap: 'wrap', marginBottom: '12px' }}>
                    <div role="tablist" aria-label="エリアで絞り込み" style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                      {dynamicAreaTabs.map(tab => {
                        const active = storeAreaFilter === tab.id;
                        const count = filterStoresByArea(stores, tab.id).length;
                        return (
                          <button
                            key={tab.id}
                            type="button"
                            role="tab"
                            aria-selected={active}
                            onClick={() => setStoreAreaFilter(tab.id)}
                            style={{
                              padding: '6px 14px',
                              borderRadius: '999px',
                              border: active ? '1.5px solid var(--spice)' : '1px solid #e5dbcd',
                              backgroundColor: active ? 'var(--spice)' : '#fff',
                              color: active ? '#fff' : 'var(--dark-bark)',
                              fontWeight: 700,
                              fontSize: '0.82rem',
                              cursor: 'pointer',
                            }}
                          >
                            {tab.label}（{count}）
                          </button>
                        );
                      })}
                    </div>

                    <div style={{ position: 'relative', minWidth: '240px', flex: '1 1 240px', maxWidth: '340px' }}>
                      <Search size={15} style={{ position: 'absolute', left: '11px', top: '50%', transform: 'translateY(-50%)', color: '#9ca3af' }} />
                      <input
                        type="search"
                        value={storeSearch}
                        onChange={e => setStoreSearch(e.target.value)}
                        placeholder="店舗名・駅名・住所で検索..."
                        style={{
                          width: '100%',
                          padding: '7px 12px 7px 32px',
                          borderRadius: '999px',
                          border: '1px solid #e5dbcd',
                          fontSize: '0.84rem',
                          boxSizing: 'border-box',
                        }}
                      />
                    </div>
                  </div>

                  {filteredStores.length === 0 ? (
                    <p style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '16px 0', margin: 0 }}>
                      該当する店舗が見つかりませんでした。
                    </p>
                  ) : (
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(min(100%, 255px), 1fr))', gap: '10px' }}>
                      {filteredStores.map(st => {
                        const isSelected = st.id === selectedStore.id;
                        return (
                          <button
                            key={st.id}
                            type="button"
                            onClick={() => {
                              handleSelectStore(st);
                              setStorePickerExpanded(false);
                            }}
                            style={{
                              textAlign: 'left',
                              padding: '12px 14px',
                              borderRadius: '12px',
                              border: isSelected ? '2px solid var(--spice)' : '1px solid #e5dbcd',
                              backgroundColor: isSelected ? '#fff7ed' : '#fff',
                              cursor: 'pointer',
                              display: 'flex',
                              flexDirection: 'column',
                              gap: '4px',
                              transition: 'all 0.15s',
                            }}
                          >
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '6px' }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                <span style={{ fontSize: '0.72rem', fontWeight: 700, padding: '2px 7px', borderRadius: '999px', backgroundColor: isSelected ? 'var(--spice)' : '#f3f4f6', color: isSelected ? '#fff' : '#4b5563' }}>
                                  No.{st.number}
                                </span>
                                <strong style={{ fontSize: '0.96rem', color: 'var(--dark-bark)' }}>{st.name}{distanceLabel(st.id)}</strong>
                              </div>
                              {isSelected && (
                                <span style={{ display: 'inline-flex', alignItems: 'center', gap: '3px', fontSize: '0.72rem', fontWeight: 700, color: 'var(--spice)' }}>
                                  <Check size={14} /> 選択中
                                </span>
                              )}
                            </div>
                            <div style={{ fontSize: '0.76rem', color: '#4b5563', lineHeight: 1.35 }}>📍 {st.address}</div>
                            <div style={{ fontSize: '0.72rem', color: '#6b7280' }}>🕒 {st.hours} ／ 休: {st.holiday}</div>
                            {st.phone && <div style={{ fontSize: '0.74rem', color: '#9a3412', fontWeight: 600 }}>📞 {st.phone}</div>}
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}
            </section>
          )}

          {placed ? (
            <div role="status" style={{ ...cardStyle, textAlign: 'center' }}>ご注文を受け付けました。ご注文状況のページを開いています…</div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
              {/* ── IN-PAGE QUICK MENU HUB (When cart is empty OR user clicks "メニューを追加") ── */}
              {(lines.length === 0 || showQuickMenu) && menuItems.length > 0 && (
                <section
                  aria-label="メニューを選んでカートに追加"
                  style={{
                    ...cardStyle,
                    border: '1.5px solid rgba(200,80,26,0.18)',
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '12px', flexWrap: 'wrap', marginBottom: '14px' }}>
                    <div>
                      <div style={{ fontSize: '0.74rem', fontWeight: 700, letterSpacing: '0.08em', color: 'var(--spice)' }}>
                        QUICK MENU BROWSER · {selectedStore.name}
                      </div>
                      <h2 style={{ fontSize: '1.15rem', color: 'var(--dark-bark)', margin: '2px 0 0' }}>
                        {isDineIn
                          ? '🍽️ お料理・お飲み物を選んでカートに追加'
                          : lines.length === 0
                            ? 'カートが空です — この画面からすぐにメニューを追加できます'
                            : 'メニューを追加する'}
                      </h2>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <Link to={isDineIn ? "/menu/grand" : "/menu/takeout"} style={{ fontSize: '0.84rem', color: 'var(--spice)', fontWeight: 700, textDecoration: 'none' }}>
                        フルメニューページを見る →
                      </Link>
                      {lines.length > 0 && (
                        <button
                          type="button"
                          onClick={() => setShowQuickMenu(false)}
                          style={{ padding: '5px 12px', borderRadius: '999px', border: '1px solid #d1d5db', background: '#fff', fontSize: '0.8rem', cursor: 'pointer' }}
                        >
                          閉じる
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Category Tabs + Search */}
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '10px', flexWrap: 'wrap', marginBottom: '14px' }}>
                    <div style={{ display: 'flex', gap: '6px', overflowX: 'auto', paddingBottom: '4px', maxWidth: '100%' }}>
                      <button
                        type="button"
                        onClick={() => setActiveCategoryId('all')}
                        style={categoryPillStyle(activeCategoryId === 'all')}
                      >
                        すべて
                      </button>
                      <button
                        type="button"
                        onClick={() => setActiveCategoryId('popular')}
                        style={categoryPillStyle(activeCategoryId === 'popular')}
                      >
                        <Sparkles size={13} style={{ marginRight: '3px', verticalAlign: '-2px' }} /> 人気・おすすめ
                      </button>
                      {menuCategories.map(cat => (
                        <button
                          key={cat.id}
                          type="button"
                          onClick={() => setActiveCategoryId(cat.id)}
                          style={categoryPillStyle(activeCategoryId === cat.id)}
                        >
                          {cat.nameJa || cat.nameEn}
                        </button>
                      ))}
                    </div>

                    <div style={{ position: 'relative', minWidth: '220px', flex: '1 1 220px', maxWidth: '300px' }}>
                      <Search size={14} style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', color: '#9ca3af' }} />
                      <input
                        type="search"
                        value={menuSearch}
                        onChange={e => setMenuSearch(e.target.value)}
                        placeholder="料理名（バターチキン、ナン等）で検索..."
                        style={{
                          width: '100%',
                          padding: '6px 12px 6px 30px',
                          borderRadius: '999px',
                          border: '1px solid #e5dbcd',
                          fontSize: '0.83rem',
                          boxSizing: 'border-box',
                        }}
                      />
                    </div>
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(min(100%, 240px), 1fr))', gap: '12px', maxHeight: '420px', overflowY: 'auto', paddingRight: '4px' }}>
                    {filteredQuickMenu.slice(0, 24).map(item => {
                      const inCartLine = lines.find(l => l.id === item.id);
                      const displayName = item.nameJa || item.nameEn;
                      return (
                        <div
                          key={item.id}
                          style={{
                            display: 'flex',
                            gap: '10px',
                            alignItems: 'center',
                            padding: '10px 12px',
                            borderRadius: '12px',
                            border: inCartLine ? '1.5px solid var(--spice)' : '1px solid #eee',
                            backgroundColor: inCartLine ? '#fffaf5' : '#fff',
                          }}
                        >
                          <img
                            src={assetUrl(item.imageUrl || item.image) || '/bg-hero-img.webp'}
                            alt={displayName}
                            width={54}
                            height={54}
                            onError={(e) => {
                              const target = e.currentTarget;
                              if (!target.src.endsWith('/bg-hero-img.webp')) {
                                target.src = '/bg-hero-img.webp';
                              }
                            }}
                            style={{ borderRadius: '8px', objectFit: 'cover', flexShrink: 0 }}
                          />
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ fontWeight: 700, fontSize: '0.88rem', color: 'var(--dark-bark)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                              {displayName}
                            </div>
                            <div style={{ fontWeight: 800, fontSize: '0.86rem', color: 'var(--spice)', marginTop: '2px' }}>
                              {yen(item.price)}
                            </div>
                            <div style={{ marginTop: '6px' }}>
                              {inCartLine ? (
                                <QuantitySelector
                                  value={inCartLine.quantity}
                                  max={MAX_QUANTITY}
                                  onChange={val => setLineQuantity(inCartLine.cartKey, val)}
                                  label={displayName}
                                  size="sm"
                                />
                              ) : (
                                <button
                                  type="button"
                                  onClick={() => handleQuickAddItem(item)}
                                  style={{
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    gap: '4px',
                                    padding: '4px 10px',
                                    borderRadius: '999px',
                                    border: 'none',
                                    backgroundColor: 'var(--spice)',
                                    color: '#fff',
                                    fontWeight: 700,
                                    fontSize: '0.76rem',
                                    cursor: 'pointer',
                                  }}
                                >
                                  <Plus size={13} /> カートに追加
                                </button>
                              )}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </section>
              )}

              {lines.length === 0 ? (
                <div style={{ ...cardStyle, textAlign: 'center' }}>
                  <p style={{ marginTop: 0, color: 'var(--text-muted)' }}>
                    {isDineIn
                      ? '上のメニュー一覧からお好みの料理・ドリンクを選んで「カートに追加」を押してください。ご注文完了後、スタッフがお席までお持ちいたします。'
                      : '上のメニュー一覧またはメニューページから商品を追加すると、そのままご注文手続きに進めます。'}
                  </p>
                  <Link to={isDineIn ? "/menu/grand" : "/menu/takeout"} className="btn-warm" style={{ display: 'inline-block', textDecoration: 'none' }}>
                    {isDineIn ? 'グランドメニューを見る' : 'テイクアウトメニューを見る'}
                  </Link>
                </div>
              ) : (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 320px), 1fr))', gap: '24px', alignItems: 'start' }}>
                  <section style={cardStyle} aria-labelledby="cart-heading">
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '8px', flexWrap: 'wrap', marginBottom: '12px' }}>
                      <h2 id="cart-heading" style={{ ...headingStyle, marginBottom: 0 }}>{buyNow ? 'ご注文の商品' : 'カート'}</h2>
                      <span style={{ fontSize: '0.78rem', fontWeight: 700, color: '#9a3412', backgroundColor: '#ffedd5', padding: '4px 10px', borderRadius: '999px', display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                        <ShoppingBag size={13} /> {selectedStore.name}で注文
                      </span>
                    </div>
                    {buyNow && cart.count > 0 && (
                      <p style={{ margin: '0 0 12px', fontSize: '0.85rem', color: 'var(--text-muted)' }}>
                        この商品だけを注文します。カートの{cart.count}点はそのまま残ります。{' '}
                        <button type="button" onClick={() => setBuyNow(null)} style={linkButton}>カートの商品を注文する</button>
                      </p>
                    )}
                    <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
                      {lines.map(line => (
                        <li key={line.cartKey} style={{ display: 'flex', gap: '12px', alignItems: 'center', padding: '12px 0', borderBottom: '1px solid #eee' }}>
                          <img
                            src={line.img || '/bg-hero-img.webp'}
                            alt=""
                            width={56}
                            height={56}
                            onError={(e) => {
                              const target = e.currentTarget;
                              if (!target.src.endsWith('/bg-hero-img.webp')) {
                                target.src = '/bg-hero-img.webp';
                              }
                            }}
                            style={{ borderRadius: '8px', objectFit: 'cover', flexShrink: 0 }}
                          />
                          <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: '6px' }}>
                            <div style={{ fontWeight: 'bold', color: 'var(--dark-bark)' }}>{line.name}</div>
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px', flexWrap: 'wrap' }}>
                              <QuantitySelector value={line.quantity} max={MAX_QUANTITY} onChange={value => setLineQuantity(line.cartKey, value)} label={line.name} size="sm" />
                              <span style={{ fontWeight: 'bold' }}>{yen(line.price * line.quantity)}</span>
                            </div>
                          </div>
                          <button type="button" aria-label={`${line.name}を削除`} onClick={() => setLineQuantity(line.cartKey, 0)} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', padding: '4px' }}>
                            <Trash2 size={18} aria-hidden="true" />
                          </button>
                        </li>
                      ))}
                    </ul>
                    <div style={{ marginTop: '16px' }}>
                      {quote ? (
                        <PriceSummary quote={quote} />
                      ) : (
                        <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 'bold' }}>
                          <span>小計</span><span>{yen(subtotal)}</span>
                        </div>
                      )}
                      {problem && <p role="alert" style={{ color: '#b91c1c', fontSize: '0.9rem', margin: '8px 0 0' }}>{problem}</p>}
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '10px', marginTop: '16px' }}>
                      <button
                        type="button"
                        onClick={() => setShowQuickMenu(prev => !prev)}
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '5px',
                          padding: '7px 14px',
                          borderRadius: '999px',
                          border: '1.5px solid var(--spice)',
                          backgroundColor: showQuickMenu ? 'var(--spice)' : '#fff',
                          color: showQuickMenu ? '#fff' : 'var(--spice)',
                          fontWeight: 700,
                          fontSize: '0.84rem',
                          cursor: 'pointer',
                        }}
                      >
                        <Plus size={15} /> {showQuickMenu ? '追加メニューを閉じる' : 'この画面で他のメニューを追加'}
                      </button>
                      <Link to="/menu/takeout" style={{ color: 'var(--spice)', fontSize: '0.88rem', fontWeight: 600 }}>← メニューページへ</Link>
                    </div>
                  </section>

                  <section style={cardStyle} aria-labelledby={(customer || asGuest) && step === 'details' ? 'details-heading' : undefined}>
                    {customer === undefined ? (
                      <p aria-busy="true">読み込み中…</p>
                    ) : customer === null && !asGuest ? (
                      <LoginGate onGuestCheckout={() => setAsGuest(true)} />
                    ) : step === 'review' ? (
                      <OrderReview
                        lines={lines}
                        details={form}
                        fulfillment={fulfillment}
                        deliveryAddress={isDelivery ? address : null}
                        timeIsEstimate={!isDelivery && !askTime}
                        quote={quote}
                        problem={problem}
                        storeAddress={selectedStore.address || settings.addressJa || settings.addressEn || ''}
                        store={toStoreSnapshot(selectedStore)}
                        submitting={submitting}
                        onBack={() => setStep('details')}
                        onConfirm={placeOrder}
                      />
                    ) : !slotsData ? (
                      <p aria-busy="true">読み込み中…</p>
                    ) : slotsData.pausedUntil ? (
                      <p>
                        ただいま大変混み合っているため、
                        <strong>{new Date(slotsData.pausedUntil).toLocaleTimeString('ja-JP', { timeZone: DEFAULT_TIMEZONE, hour: '2-digit', minute: '2-digit' })}頃</strong>
                        までオンラインでのご注文を一時停止しています。カートの内容は保存されていますので、しばらくしてからもう一度お試しください。
                      </p>
                    ) : !slotsData.enabled ? (
                      <p>現在オンラインでのご注文を受け付けておりません。{phoneLink && <>お電話（{phoneLink}）でご注文ください。</>}</p>
                    ) : (
                      <form onSubmit={handleReview} noValidate style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <h2 id="details-heading" style={{ ...headingStyle, marginBottom: 0 }}>お客様情報</h2>
                          {!customer && asGuest && (
                            <span style={{ fontSize: '0.8rem', color: '#6b7280', backgroundColor: '#f3f4f6', padding: '2px 8px', borderRadius: '4px', fontWeight: 500 }}>
                              ゲスト注文
                            </span>
                          )}
                        </div>
                        <StepIndicator />
                        {(slotsData.pickup.enabled || slotsData.delivery.enabled || slotsData.dineIn?.enabled) && (
                          <FulfillmentPicker
                            value={fulfillment}
                            onChange={chooseFulfillment}
                            pickupEnabled={slotsData.pickup.enabled}
                            delivery={slotsData.delivery}
                            dineIn={slotsData.dineIn}
                          />
                        )}
                        {isDineIn && (
                          <FieldBox id="tableNumber" label="ご利用テーブル番号 / お席" required={slotsData.dineIn?.requireTableNumber !== false} error={errors.tableNumber}>
                            <input
                              id="order-tableNumber"
                              name="tableNumber"
                              maxLength={30}
                              placeholder={slotsData.dineIn?.tablePrefix ? `例: ${slotsData.dineIn.tablePrefix}01` : '例: 01 または テーブルA'}
                              value={tableNumber}
                              onChange={e => {
                                setTableNumber(e.target.value);
                                if (errors.tableNumber) setErrors(prev => ({ ...prev, tableNumber: undefined }));
                              }}
                              style={inputStyle(errors.tableNumber)}
                            />
                            <small style={{ color: '#6b7280', fontSize: '0.78rem', display: 'block', marginTop: '4px' }}>
                              テーブルに置かれた卓上スタンドやプレートの番号をご入力ください。
                            </small>
                          </FieldBox>
                        )}
                        <FieldBox id="name" label="お名前" required error={errors.name}>
                          <input id="order-name" name="name" maxLength={100} autoComplete="name" value={form.name} onChange={handleChange} {...invalidProps('name', errors.name)} style={inputStyle(errors.name)} />
                        </FieldBox>
                        <FieldBox id="phone" label="電話番号" required error={errors.phone}>
                          <input id="order-phone" name="phone" type="tel" inputMode="tel" autoComplete="tel" placeholder="090-1234-5678" value={form.phone} onChange={handleChange} {...invalidProps('phone', errors.phone)} style={inputStyle(errors.phone)} />
                        </FieldBox>
                        <FieldBox id="email" label="メールアドレス（任意）" error={errors.email}>
                          <input id="order-email" name="email" type="email" maxLength={254} autoComplete="email" value={form.email} onChange={handleChange} {...invalidProps('email', errors.email)} style={inputStyle(errors.email)} />
                        </FieldBox>
                        {isDelivery && (
                          <DeliveryAddressFields value={address} onChange={setAddress} errors={addressErrors} saveToProfile={saveAddress} onSaveToProfileChange={setSaveAddress} areas={slotsData.delivery.areas} />
                        )}
                        {!askTime && slotsByDay.length === 0 && (
                          <span style={{ display: 'block', color: 'var(--spice)' }}>
                            本日・明日は{word}可能な時間がありません。{phoneLink && <>お電話（{phoneLink}）でお問い合わせください。</>}
                          </span>
                        )}
                        {askTime && (
                          <FieldBox id="pickupAt" label={`${word}日時`} required error={errors.pickupAt}>
                            {slotsByDay.length === 0 ? (
                              <span style={{ display: 'block', color: 'var(--spice)', fontWeight: 'normal' }}>
                                本日・明日は{word}可能な時間がありません。{phoneLink && <>お電話（{phoneLink}）でお問い合わせください。</>}
                              </span>
                            ) : (
                              <select id="order-pickupAt" name="pickupAt" value={form.pickupAt} onChange={handleChange} {...invalidProps('pickupAt', errors.pickupAt)} style={inputStyle(errors.pickupAt)}>
                                <option value="">選択してください</option>
                                {slotsByDay.map(([date, slots]) => (
                                  <optgroup key={date} label={`${dayLabel(date)}${date === today ? '（本日）' : ''}`}>
                                    {slots.map(slot => (
                                      <option key={slot.at} value={slot.at}>{dayLabel(date)} {slot.time}</option>
                                    ))}
                                  </optgroup>
                                ))}
                              </select>
                            )}
                          </FieldBox>
                        )}
                        <label style={labelStyle}>
                          ご要望（任意）
                          <textarea name="note" maxLength={500} rows={3} placeholder="辛さのご希望など" value={form.note} onChange={handleChange} style={inputStyle()} />
                        </label>
                        {/* Honeypot: hidden from people, filled in by bots. */}
                        <input name="website" tabIndex={-1} autoComplete="off" aria-hidden="true" value={form.website} onChange={handleChange} style={{ position: 'absolute', left: '-9999px' }} />

                        <MemberSavings savings={savings} onChange={setSavings} quote={quote} next="/order" />

                        <div style={{ backgroundColor: 'var(--cream)', borderRadius: '8px', padding: '12px 16px', fontSize: '0.9rem', lineHeight: 1.6 }}>
                          <div style={{ fontWeight: 'bold', color: 'var(--dark-bark)', marginBottom: '4px' }}>
                            📍 ご注文店舗：Adarsha {selectedStore.name}（{selectedStore.address}）
                          </div>
                          {!askTime && earliestSlot && timingStatus.isTakeoutOpenNow && (
                            <div style={{ fontWeight: 'bold', marginBottom: '4px' }}>受け取り目安：{dayLabel(earliestSlot.date)} {earliestSlot.time}頃（ご用意ができ次第）</div>
                          )}
                          {isDelivery ? 'お支払いは商品のお届け時に現金でお願いいたします（税込金額）。' : `お支払いは受け取り時に店頭（${selectedStore.name}）でお願いいたします（税込金額）。`}
                          {(isDelivery ? slotsData.delivery.note : slotsData.pickup.note) && (
                            <div style={{ whiteSpace: 'pre-wrap', marginTop: '6px' }}>{isDelivery ? slotsData.delivery.note : slotsData.pickup.note}</div>
                          )}
                        </div>
                        {timingStatus.enforceOrderTimeWindow && !timingStatus.isTakeoutOpenNow && (
                          <div role="alert" style={{ backgroundColor: '#fef2f2', border: '1px solid #fecaca', color: '#991b1b', borderRadius: '8px', padding: '12px 14px', fontSize: '0.88rem', lineHeight: 1.5 }}>
                            <strong>⏰ {timingStatus.notificationTitle}</strong>
                            <div style={{ marginTop: '4px' }}>
                              ランチ注文受付: <strong>{timingStatus.lunchOrderEnabled ? timingStatus.lunchHoursLabel : '休止中'}</strong> ／ ディナー注文受付: <strong>{timingStatus.dinnerOrderEnabled ? timingStatus.dinnerHoursLabel : '休止中'}</strong>
                            </div>
                          </div>
                        )}
                        {quote && quote.minOrderShortfall > 0 && (
                          <div role="alert" style={{ backgroundColor: '#fff7ed', border: '1px solid #fed7aa', color: '#9a3412', borderRadius: '8px', padding: '10px 14px', fontSize: '0.9rem' }}>
                            デリバリーは{yen(slotsData.delivery.minOrder)}以上のご注文で承ります。あと{yen(quote.minOrderShortfall)}分の商品を追加してください。
                          </div>
                        )}

                        <button
                          type="submit"
                          className="order-btn order-btn-solid order-btn-lg"
                          disabled={(!isDineIn && slotsByDay.length === 0) || !quote || (isDelivery && quote.minOrderShortfall > 0)}
                        >
                          {!isDineIn && timingStatus.enforceOrderTimeWindow && !timingStatus.isTakeoutOpenNow
                            ? `⏰ 注文受付時間外（ランチ ${timingStatus.lunchHoursLabel} ／ ディナー ${timingStatus.dinnerHoursLabel}）`
                            : quote
                              ? `${isDineIn ? 'ご注文内容を確認する' : `${selectedStore.name}での注文内容を確認する`}（${yen(quote.grandTotal)} 税込）`
                              : '料金を計算中…'}
                        </button>
                      </form>
                    )}
                  </section>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
      <QrFulfillmentChoiceModal
        open={showQrChoice}
        tableNumber={effectiveTable || tableNumber || '1'}
        store={selectedStore}
        onSelectDineIn={handleSelectDineIn}
        onSelectTakeout={handleSelectTakeout}
        onClose={() => setShowQrChoice(false)}
      />
    </main>
  );
}

function StepIndicator() {
  return (
    <ol aria-label="ご注文の流れ" style={{ display: 'flex', gap: '8px', listStyle: 'none', padding: 0, margin: 0, fontSize: '0.8rem', color: 'var(--text-muted)' }}>
      <li aria-current="step" style={{ color: 'var(--spice)', fontWeight: 700 }}>① 店舗・情報入力</li>
      <li aria-hidden="true">›</li>
      <li>② 内容確認</li>
      <li aria-hidden="true">›</li>
      <li>③ 注文完了</li>
    </ol>
  );
}

function FieldBox({ id, label, required = false, error, children }: { id: Field | 'tableNumber' | string; label: string; required?: boolean; error?: string; children: ReactNode }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
      <label htmlFor={`order-${id}`} style={{ ...labelStyle, display: 'block' }}>
        {label} {required && <span style={{ color: 'var(--spice)' }}>*</span>}
      </label>
      {children}
      {error && <span id={`order-${id}-error`} role="alert" style={{ color: '#b91c1c', fontSize: '0.85rem' }}>{error}</span>}
    </div>
  );
}

const invalidProps = (id: Field, error?: string) =>
  error ? { 'aria-invalid': true as const, 'aria-describedby': `order-${id}-error` } : {};

const categoryPillStyle = (active: boolean): CSSProperties => ({
  padding: '6px 13px',
  borderRadius: '999px',
  border: active ? '1.5px solid var(--spice)' : '1px solid #e5dbcd',
  backgroundColor: active ? 'var(--spice)' : '#fff',
  color: active ? '#fff' : 'var(--dark-bark)',
  fontWeight: active ? 700 : 600,
  fontSize: '0.8rem',
  cursor: 'pointer',
  whiteSpace: 'nowrap',
  flexShrink: 0,
});

const cardStyle: CSSProperties = { backgroundColor: 'white', borderRadius: '12px', padding: '24px', boxShadow: '0 4px 15px rgba(0,0,0,0.05)' };
const headingStyle: CSSProperties = { fontSize: '1.3rem', color: 'var(--dark-bark)', marginTop: 0, marginBottom: '16px' };
const labelStyle: CSSProperties = { display: 'flex', flexDirection: 'column', gap: '6px', fontWeight: 'bold', color: 'var(--dark-bark)', fontSize: '0.9rem' };
const linkButton: CSSProperties = { background: 'none', border: 'none', padding: 0, color: 'var(--spice)', fontWeight: 'bold', cursor: 'pointer', textDecoration: 'underline', font: 'inherit' };
const inputStyle = (error?: string): CSSProperties => ({
  padding: '12px', border: `1px solid ${error ? '#dc2626' : '#e5dbcd'}`, borderRadius: '8px', fontSize: '1rem', fontWeight: 'normal', fontFamily: 'inherit', width: '100%', boxSizing: 'border-box',
});
