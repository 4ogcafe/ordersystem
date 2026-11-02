import { useEffect, useMemo, useState } from 'react';
import { toast } from 'react-hot-toast';
import {
  Search, Plus, ShoppingCart, History,
  ChefHat, X, ChevronDown, Bell, Heart,
  Receipt, RotateCcw, User, LogIn, LogOut,
  CheckCircle2, Sparkles, ShoppingBag, UtensilsCrossed, Phone
} from 'lucide-react';
import type { Fulfillment } from './fulfillment';
import { apiFetch, assetUrl, errorMessage, getPublic } from '../../lib/api';
import { yen } from '../../lib/format';
import { type StoreLocation } from '../../lib/stores';
import { useCustomer } from '../../lib/customer-context';
import { readyChime } from '../../lib/push';
import '../../pages/dining-order.css';

export interface QuickMenuItem {
  id: string;
  categoryId: string;
  nameEn: string;
  nameJa?: string | null;
  descriptionEn?: string | null;
  descriptionJa?: string | null;
  price: number;
  imageUrl?: string | null;
  spiceLevel?: number;
  isVegetarian?: boolean;
  isVegan?: boolean;
  isHalal?: boolean;
  isRecommended?: boolean;
  isSoldOut?: boolean;
  isOrderable?: boolean;
  menuTypes?: string[];
  category?: { id: string; nameEn: string; nameJa?: string | null };
}

export interface QuickCategory {
  id: string;
  nameEn: string;
  nameJa?: string | null;
}

export interface TrayItem {
  id: string;
  itemId: string;
  nameJa: string;
  nameEn: string;
  price: number;
  quantity: number;
  spiceLevel?: number;
  selectedOption?: string;
  optionPrice?: number;
  note?: string;
  imageUrl?: string | null;
}

export interface TableSessionOrder {
  token: string;
  number: number;
  status: 'NEW' | 'CONFIRMED' | 'READY' | 'COMPLETED' | 'CANCELLED';
  createdAt: string;
  items: {
    itemId?: string;
    nameJa?: string | null;
    nameEn: string;
    quantity: number;
    unitPrice: number;
    lineTotal: number;
    options?: any;
  }[];
  subtotal: number;
  tax: number;
  grandTotal: number;
}

interface DineInOrderExperienceProps {
  initialTableNumber: string;
  selectedStore: StoreLocation;
  stores?: StoreLocation[];
  fulfillment?: Fulfillment;
  onSwitchToTakeout?: () => void;
  onSwitchToDineIn?: () => void;
  onOpenChoiceModal?: () => void;
}

export interface CustomOptionItem {
  id: string;
  nameJa: string;
  nameEn: string;
  price: number;
}

const SPICE_LABELS: Record<number, { ja: string; en: string }> = {
  0: { ja: '甘口 (Mild)', en: 'Mild' },
  1: { ja: '普通 (Medium)', en: 'Medium' },
  2: { ja: '中辛 (Hot)', en: 'Hot' },
  3: { ja: '辛口 (Very Hot)', en: 'Very Hot' },
  4: { ja: '激辛 (Super Hot)', en: 'Super Hot' },
};

const SPICE_OPTIONS = [
  { level: 0, nameJa: '甘口', nameEn: 'Mild' },
  { level: 1, nameJa: '普通', nameEn: 'Medium' },
  { level: 2, nameJa: '中辛', nameEn: 'Hot' },
  { level: 3, nameJa: '辛口', nameEn: 'Very Hot' },
  { level: 4, nameJa: '激辛', nameEn: 'Super Hot' },
];

const NAAN_OPTIONS: CustomOptionItem[] = [
  { id: 'plain_naan', nameJa: 'プレーンナン', nameEn: 'Plain Naan', price: 0 },
  { id: 'rice', nameJa: 'ライス', nameEn: 'Rice', price: 0 },
  { id: 'cheese_naan', nameJa: 'チーズナン', nameEn: 'Cheese Naan', price: 439 },
  { id: 'honey_cheese_naan', nameJa: 'はちみつチーズナン', nameEn: 'Honey Cheese Naan', price: 499 },
  { id: 'garlic_cheese_naan', nameJa: 'ガーリックチーズナン', nameEn: 'Garlic Cheese Naan', price: 549 },
  { id: 'coconut_naan', nameJa: 'ココナッツ・ナン', nameEn: 'Coconut Naan', price: 329 },
  { id: 'choco_naan', nameJa: 'チョコレート・ナン', nameEn: 'Chocolate Naan', price: 399 },
  { id: 'choco_coconut_naan', nameJa: 'チョコ&ココナッツナン', nameEn: 'Choco & Coconut Naan', price: 399 },
  { id: 'sesame_coconut_naan', nameJa: 'ゴマ&ココナッツナン', nameEn: 'Sesame & Coconut Naan', price: 399 },
];

const CURRY_CHOICE_OPTIONS: CustomOptionItem[] = [
  { id: 'spinach', nameJa: 'ほうれん草カレー', nameEn: 'Spinach Curry', price: 0 },
  { id: 'butter_chicken', nameJa: 'バターチキンカレー', nameEn: 'Butter Chicken Curry', price: 150 },
  { id: 'dal', nameJa: '豆カレー', nameEn: 'Dal Curry', price: 0 },
  { id: 'chicken', nameJa: 'チキンカレー', nameEn: 'Chicken Curry', price: 0 },
  { id: 'seafood', nameJa: 'シーフードカレー', nameEn: 'Seafood Curry', price: 0 },
  { id: 'vegetable', nameJa: '野菜カレー', nameEn: 'Vegetable Curry', price: 0 },
  { id: 'keema', nameJa: 'キーマカレー', nameEn: 'Keema Curry', price: 0 },
  { id: 'mutton', nameJa: 'マトンカレー', nameEn: 'Mutton Curry', price: 0 },
];

const DRINK_OPTIONS: CustomOptionItem[] = [
  { id: 'none', nameJa: 'なし', nameEn: 'None', price: 0 },
  { id: 'lassi', nameJa: 'ラッシー', nameEn: 'Lassi', price: 109 },
  { id: 'mango_lassi', nameJa: 'マンゴーラッシー', nameEn: 'Mango Lassi', price: 109 },
  { id: 'oolong', nameJa: 'ウーロン茶', nameEn: 'Oolong Tea', price: 109 },
  { id: 'jasmine', nameJa: 'ジャスミン茶', nameEn: 'Jasmine Tea', price: 109 },
  { id: 'iced_coffee', nameJa: 'アイスコーヒー', nameEn: 'Iced Coffee', price: 109 },
  { id: 'hot_coffee', nameJa: 'ホットコーヒー', nameEn: 'Hot Coffee', price: 109 },
];

export default function DineInOrderExperience({
  initialTableNumber,
  selectedStore,
  fulfillment = 'DINE_IN',
  onSwitchToTakeout,
  onSwitchToDineIn,
  onOpenChoiceModal,
}: DineInOrderExperienceProps) {
  const { customer, signIn, signOut } = useCustomer();
  const isTakeout = fulfillment === 'PICKUP' || fulfillment === 'DELIVERY';

  // Settings & state - Japanese is default
  const [tableNumber, setTableNumber] = useState<string>(() => initialTableNumber || '1');
  const [takeoutCustomerName, setTakeoutCustomerName] = useState<string>(() => customer?.name || '');
  const [takeoutCustomerPhone, setTakeoutCustomerPhone] = useState<string>(() => customer?.phone || '');
  const [lang, setLang] = useState<'ja' | 'en'>(() => {
    try {
      const saved = localStorage.getItem('adarsha_dine_lang');
      if (saved === 'en' || saved === 'ja') return saved;
    } catch {}
    return 'ja';
  });

  const toggleLang = () => {
    setLang(cur => {
      const next = cur === 'ja' ? 'en' : 'ja';
      try {
        localStorage.setItem('adarsha_dine_lang', next);
      } catch {}
      return next;
    });
  };

  // Menu data
  const [menuItems, setMenuItems] = useState<QuickMenuItem[]>([]);
  const [categories, setCategories] = useState<QuickCategory[]>([]);
  const [selectedCategoryId, setSelectedCategoryId] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [showCategoryDropdown, setShowCategoryDropdown] = useState<boolean>(false);
  const [failedImages, setFailedImages] = useState<Set<string>>(new Set());

  // Favorites
  const [favorites, setFavorites] = useState<Set<string>>(() => {
    try {
      const saved = localStorage.getItem('adarsha_favorites');
      return saved ? new Set(JSON.parse(saved)) : new Set();
    } catch {
      return new Set();
    }
  });

  // Current order tray
  const [tray, setTray] = useState<TrayItem[]>(() => {
    try {
      const saved = sessionStorage.getItem(`adarsha_tray_${tableNumber}`);
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });

  // Placed orders for this table during this sitting
  const [tableOrders, setTableOrders] = useState<TableSessionOrder[]>([]);
  const [tableSubtotal, setTableSubtotal] = useState<number>(0);
  const [tableTax, setTableTax] = useState<number>(0);
  const [tableGrandTotal, setTableGrandTotal] = useState<number>(0);

  // Modals
  const [showCartModal, setShowCartModal] = useState<boolean>(false);
  const [showHistoryModal, setShowHistoryModal] = useState<boolean>(false);
  const [showCallStaffModal, setShowCallStaffModal] = useState<boolean>(false);
  const [showCheckoutModal, setShowCheckoutModal] = useState<boolean>(false);
  const [showTableEditModal, setShowTableEditModal] = useState<boolean>(false);
  const [showAuthModal, setShowAuthModal] = useState<boolean>(false);
  const [newTableInput, setNewTableInput] = useState<string>(tableNumber);

  // Auth modal states (Optional Login & Registration)
  const [authMode, setAuthMode] = useState<'login' | 'register'>('login');
  const [authEmail, setAuthEmail] = useState<string>('');
  const [authPassword, setAuthPassword] = useState<string>('');
  const [authName, setAuthName] = useState<string>('');
  const [authPhone, setAuthPhone] = useState<string>('');
  const [authSubmitting, setAuthSubmitting] = useState<boolean>(false);
  const [authError, setAuthError] = useState<string>('');

  // Item customization modal
  const [customizingItem, setCustomizingItem] = useState<QuickMenuItem | null>(null);
  const [custImgError, setCustImgError] = useState<boolean>(false);
  const [customSpice, setCustomSpice] = useState<number>(1);
  const [customBread, setCustomBread] = useState<string>('plain_naan');
  const [customCurry, setCustomCurry] = useState<string>('dal');
  const [customDrink, setCustomDrink] = useState<string>('none');
  const [customNote, setCustomNote] = useState<string>('');
  const [customQty, setCustomQty] = useState<number>(1);

  // Request status
  const [submittingOrder, setSubmittingOrder] = useState<boolean>(false);
  const [callingStaff, setCallingStaff] = useState<boolean>(false);
  const [requestingBill, setRequestingBill] = useState<boolean>(false);
  const [isTablePaid, setIsTablePaid] = useState<boolean>(false);

  const handleAuthSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthError('');
    setAuthSubmitting(true);
    try {
      const isRegister = authMode === 'register';
      const body = isRegister
        ? { name: authName.trim(), email: authEmail.trim(), phone: authPhone.trim(), password: authPassword }
        : { email: authEmail.trim(), password: authPassword };

      const res = await apiFetch(`/api/v1/customers/${isRegister ? 'register' : 'login'}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        setAuthError(await errorMessage(res, isRegister ? (lang === 'ja' ? '登録できませんでした。入力内容をご確認ください。' : 'Registration failed.') : (lang === 'ja' ? 'ログインできませんでした。メールアドレスとパスワードをご確認ください。' : 'Login failed.')));
        return;
      }

      const data = await res.json();
      if (data.token) {
        localStorage.setItem('kalpana_customer_token', data.token);
      }
      if (data.customer) {
        signIn(data.customer);
      }
      setShowAuthModal(false);
      setAuthPassword('');
      toast.success(
        isRegister
          ? (lang === 'ja' ? `会員登録が完了しました！ようこそ、${data.customer?.name || ''}様` : `Registered successfully! Welcome, ${data.customer?.name || ''}`)
          : (lang === 'ja' ? `ログインしました（${data.customer?.name || ''}様）` : `Logged in as ${data.customer?.name || ''}`)
      );
    } catch {
      setAuthError(lang === 'ja' ? '通信エラーが発生しました。もう一度お試しください。' : 'Connection error. Please try again.');
    } finally {
      setAuthSubmitting(false);
    }
  };

  const handleSignOut = async () => {
    if (window.confirm(lang === 'ja' ? 'ログアウトしますか？' : 'Do you want to log out?')) {
      await signOut();
      setShowAuthModal(false);
      toast.success(lang === 'ja' ? 'ログアウトしました' : 'Logged out');
    }
  };

  // Prevent background scrolling when any popup/modal is open
  const isAnyModalOpen = Boolean(
    customizingItem ||
    showCartModal ||
    showHistoryModal ||
    showCallStaffModal ||
    showCheckoutModal ||
    showTableEditModal ||
    showAuthModal
  );

  useEffect(() => {
    if (isAnyModalOpen) {
      const originalOverflow = document.body.style.overflow;
      document.body.style.overflow = 'hidden';
      document.documentElement.style.overflow = 'hidden';
      document.body.classList.add('dio-modal-open');
      document.documentElement.classList.add('dio-modal-open');

      return () => {
        document.body.style.overflow = originalOverflow;
        document.documentElement.style.overflow = '';
        document.body.classList.remove('dio-modal-open');
        document.documentElement.classList.remove('dio-modal-open');
      };
    }
  }, [isAnyModalOpen]);

  // Session tokens tracker
  const getSessionTokens = (): string[] => {
    try {
      const raw = sessionStorage.getItem(`adarsha_session_tokens_${tableNumber}`);
      return raw ? JSON.parse(raw) : [];
    } catch {
      return [];
    }
  };

  const addSessionToken = (token: string) => {
    try {
      const current = getSessionTokens();
      if (!current.includes(token)) {
        current.push(token);
        sessionStorage.setItem(`adarsha_session_tokens_${tableNumber}`, JSON.stringify(current));
      }
    } catch {}
  };

  // Sync tray to sessionStorage
  useEffect(() => {
    try {
      sessionStorage.setItem(`adarsha_tray_${tableNumber}`, JSON.stringify(tray));
    } catch {}
  }, [tray, tableNumber]);

  // Load menu items & categories (dynamically for Dine-In vs Takeout)
  useEffect(() => {
    const fQuery = isTakeout ? 'TAKEOUT' : 'DINE_IN';
    getPublic<QuickMenuItem[]>(`/api/v1/menu/items?fulfillment=${fQuery}`)
      .then(items => {
        if (Array.isArray(items)) {
          setMenuItems(items.filter(it => it.isOrderable !== false && !it.isSoldOut));
        }
      })
      .catch(() => {});

    getPublic<QuickCategory[]>(`/api/v1/menu/categories?fulfillment=${fQuery}`)
      .then(cats => {
        if (Array.isArray(cats)) setCategories(cats);
      })
      .catch(() => {});
  }, [isTakeout]);

  // Poll / fetch active table orders
  const loadTableOrders = async () => {
    if (!tableNumber) return;
    try {
      const tokens = getSessionTokens().join(',');
      const res = await apiFetch(`/api/v1/orders/table?table=${encodeURIComponent(tableNumber)}&tokens=${encodeURIComponent(tokens)}`);
      if (res.ok) {
        const data = await res.json();
        setTableOrders(data.orders || []);
        setTableSubtotal(data.totalSubtotal || 0);
        setTableTax(data.totalTax || 0);
        setTableGrandTotal(data.grandTotal || 0);

        if (data.allCompleted && tokens) {
          setIsTablePaid(true);
        } else if (data.orders && data.orders.length > 0 && data.orders.every((o: any) => o.status === 'COMPLETED')) {
          setIsTablePaid(true);
        } else {
          setIsTablePaid(false);
        }
      }
    } catch {}
  };

  // Reset table sitting / clear session so next customers start fresh
  const handleResetTableSession = async () => {
    try {
      await apiFetch('/api/v1/tables/reset', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tableNumber: tableNumber.trim(),
          storeId: selectedStore.id,
        }),
      });
    } catch {}
    try {
      sessionStorage.removeItem(`adarsha_session_tokens_${tableNumber}`);
      sessionStorage.removeItem(`adarsha_tray_${tableNumber}`);
    } catch {}
    setTableOrders([]);
    setTableSubtotal(0);
    setTableTax(0);
    setTableGrandTotal(0);
    setIsTablePaid(false);
    toast.success(lang === 'ja' ? 'テーブルをリセットしました。新しいご注文を開始できます。' : 'Table session reset. Ready for new orders!', { icon: '✨' });
  };

  useEffect(() => {
    loadTableOrders();
    const interval = setInterval(loadTableOrders, 12_000);
    return () => clearInterval(interval);
  }, [tableNumber]);

  // Toggle favorite
  const toggleFavorite = (itemId: string, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    setFavorites(prev => {
      const next = new Set(prev);
      if (next.has(itemId)) {
        next.delete(itemId);
      } else {
        next.add(itemId);
      }
      try {
        localStorage.setItem('adarsha_favorites', JSON.stringify(Array.from(next)));
      } catch {}
      return next;
    });
  };

  // Visible categories according to mode (Dine-In vs Takeout)
  const visibleCategories = useMemo(() => {
    return categories.filter(cat => {
      const id = (cat.id || '').toLowerCase();
      const en = (cat.nameEn || '').toLowerCase();
      const ja = cat.nameJa || '';

      if (id === 'cat_grand' || id === 'cat_lunch') return false;

      if (isTakeout) {
        // In Takeout mode: hide Lunch Set and Dinner Set categories
        if (
          id.includes('lunch_set') ||
          id.includes('dinner_set') ||
          en.includes('lunch set') ||
          en.includes('dinner set') ||
          ja.includes('ランチセット') ||
          ja.includes('ディナーセット')
        ) {
          return false;
        }
      } else {
        // In Dine-In mode: hide Takeout categories
        if (
          id === 'cat_takeout' ||
          id.includes('takeout') ||
          en.includes('takeout') ||
          ja.includes('テイクアウト') ||
          ja.includes('お持ち帰り')
        ) {
          return false;
        }
      }
      return true;
    });
  }, [categories, isTakeout]);

  // Filtered menu items for Dine-In vs Takeout
  const filteredItems = useMemo(() => {
    return menuItems.filter(item => {
      const catId = (item.categoryId || item.category?.id || '').toLowerCase();
      const catNameEn = (item.category?.nameEn || '').toLowerCase();
      const catNameJa = item.category?.nameJa || '';
      const nameEn = (item.nameEn || '').toLowerCase();
      const nameJa = item.nameJa || '';
      const types = Array.isArray(item.menuTypes) ? item.menuTypes : [];

      if (isTakeout) {
        // Takeout mode: DO NOT SHOW Lunch Sets and Dinner Sets
        const isLunchSet =
          catId.includes('lunch_set') ||
          catNameEn.includes('lunch set') ||
          catNameJa.includes('ランチセット') ||
          nameEn.includes('lunch set') ||
          nameJa.includes('ランチセット');
        const isDinnerSet =
          catId.includes('dinner_set') ||
          catNameEn.includes('dinner set') ||
          catNameJa.includes('ディナーセット') ||
          nameEn.includes('dinner set') ||
          nameJa.includes('ディナーセット');
        if (isLunchSet || isDinnerSet) return false;

        // In Takeout mode: item must be allowed for takeout if menuTypes specified
        if (types.length > 0 && !types.includes('TAKEOUT')) {
          return false;
        }
      } else {
        // Dine-In mode: DO NOT SHOW Takeout-only items
        if (
          catId === 'cat_takeout' ||
          catId.includes('takeout') ||
          catNameEn.includes('takeout') ||
          catNameJa.includes('テイクアウト') ||
          catNameJa.includes('お持ち帰り')
        ) {
          return false;
        }
        if (
          nameJa.includes('テイクアウト専用') ||
          nameJa.includes('お持ち帰り専用') ||
          nameEn.includes('takeout only')
        ) {
          return false;
        }
        if (types.length > 0 && types.includes('TAKEOUT') && !types.includes('GRAND') && !types.includes('LUNCH')) {
          return false;
        }
      }

      if (selectedCategoryId !== 'all') {
        const itemCatId = item.categoryId || item.category?.id;
        if (itemCatId !== selectedCategoryId) return false;
      }
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const jaMatch = (item.nameJa || '').toLowerCase().includes(q);
        const enMatch = (item.nameEn || '').toLowerCase().includes(q);
        const descMatch = (item.descriptionJa || '').toLowerCase().includes(q) || (item.descriptionEn || '').toLowerCase().includes(q);
        if (!jaMatch && !enMatch && !descMatch) return false;
      }
      return true;
    });
  }, [menuItems, selectedCategoryId, searchQuery, isTakeout]);

  // Active category display title
  const activeCategoryTitle = useMemo(() => {
    if (selectedCategoryId === 'all') {
      return lang === 'ja' ? '店内メニュー' : 'Dine-In Menu';
    }
    const cat = categories.find(c => c.id === selectedCategoryId);
    if (!cat) return lang === 'ja' ? 'おすすめ料理' : 'Featured Dishes';
    return lang === 'ja' ? (cat.nameJa || cat.nameEn) : cat.nameEn;
  }, [selectedCategoryId, categories, lang]);

  // Add item to tray
  const addToTray = (newItem: TrayItem) => {
    setTray(prev => {
      const idx = prev.findIndex(
        it =>
          it.itemId === newItem.itemId &&
          it.spiceLevel === newItem.spiceLevel &&
          it.selectedOption === newItem.selectedOption &&
          (it.note || '') === (newItem.note || '')
      );
      if (idx >= 0) {
        const copy = [...prev];
        copy[idx].quantity += newItem.quantity;
        return copy;
      }
      return [...prev, newItem];
    });
  };

  const handleItemCardClick = (item: QuickMenuItem) => {
    setCustImgError(false);
    setCustomizingItem(item);
    setCustomSpice(item.spiceLevel !== undefined ? item.spiceLevel : 1);
    setCustomBread('plain_naan');
    setCustomCurry('dal');
    setCustomDrink('none');
    setCustomNote('');
    setCustomQty(1);
  };

  const updateTrayQty = (trayId: string, delta: number) => {
    setTray(prev => {
      return prev
        .map(it => {
          if (it.id === trayId) {
            const nextQty = it.quantity + delta;
            return nextQty > 0 ? { ...it, quantity: nextQty } : null;
          }
          return it;
        })
        .filter(Boolean) as TrayItem[];
    });
  };

  // Tray totals
  const traySubtotal = useMemo(() => {
    return tray.reduce((sum, it) => sum + (it.price + (it.optionPrice || 0)) * it.quantity, 0);
  }, [tray]);

  const taxRate = isTakeout ? 0.08 : 0.10;
  const trayTax = Math.floor(traySubtotal * taxRate);
  const trayGrandTotal = traySubtotal + trayTax;
  const trayCount = useMemo(() => tray.reduce((sum, it) => sum + it.quantity, 0), [tray]);

  // Send Order to Kitchen or Takeout Counter
  const handleSendOrder = async () => {
    if (tray.length === 0 || submittingOrder) return;
    setSubmittingOrder(true);

    try {
      const itemsPayload = tray.map(it => ({
        itemId: it.itemId,
        quantity: it.quantity,
        optionAdjust: it.optionPrice || 0,
        options: [
          it.spiceLevel !== undefined ? { name: 'Spice', choice: SPICE_LABELS[it.spiceLevel]?.en || 'Medium' } : null,
          it.selectedOption ? { name: 'Option', choice: it.selectedOption } : null,
          it.note ? { name: 'Note', choice: it.note } : null,
        ].filter(Boolean),
      }));

      const finalFulfillment = isTakeout ? 'PICKUP' : 'DINE_IN';
      const orderName = isTakeout
        ? (takeoutCustomerName.trim() || customer?.name || (tableNumber ? `お席${tableNumber}様 (持帰)` : 'テイクアウトお客様'))
        : (customer?.name ? customer.name : `Table ${tableNumber.trim()}`);
      const orderPhone = customer?.phone || (isTakeout ? takeoutCustomerPhone.trim() : '') || '00-0000-0000';
      const orderNote = isTakeout
        ? (tableNumber ? `[テイクアウト: 席${tableNumber}] モバイル持帰注文` : 'モバイルテイクアウト注文')
        : `[テーブル: ${tableNumber.trim()}] QR Order`;

      const res = await apiFetch('/api/v1/orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fulfillment: finalFulfillment,
          tableNumber: isTakeout ? '' : tableNumber.trim(),
          name: orderName,
          phone: orderPhone,
          email: customer?.email || '',
          note: orderNote,
          storeId: selectedStore.id,
          storeName: selectedStore.name,
          items: itemsPayload,
        }),
      });

      if (res.ok) {
        const data = await res.json();
        readyChime();
        toast.success(
          lang === 'en'
            ? (isTakeout ? 'Takeout order received! We are preparing it for pickup.' : 'Order sent to the kitchen!')
            : (isTakeout ? 'テイクアウトのご注文を受け付けました！出来上がり次第お渡しします。' : '厨房へ注文を送信しました！'),
          { duration: 4000, icon: isTakeout ? '🛍️' : '👨‍🍳' }
        );
        if (data.token) {
          addSessionToken(data.token);
        }
        setTray([]);
        setShowCartModal(false);
        setShowHistoryModal(true);
        await loadTableOrders();
      } else {
        toast.error(await errorMessage(res, 'Failed to send order. Please notify staff.'));
      }
    } catch {
      toast.error('Network error. Please try again.');
    } finally {
      setSubmittingOrder(false);
    }
  };

  // Call Staff
  const handleCallStaff = async (reason: 'WATER' | 'BILL' | 'CALL' | 'EXTRA') => {
    if (callingStaff) return;
    setCallingStaff(true);
    try {
      const res = await apiFetch('/api/v1/tables/call-staff', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tableNumber: tableNumber.trim(),
          storeId: selectedStore.id,
          reason,
        }),
      });
      if (res.ok) {
        toast.success(lang === 'en' ? 'Staff has been notified!' : 'スタッフへ通知しました。まもなくお伺いします！', { icon: '🔔' });
        setShowCallStaffModal(false);
      } else {
        toast.error('Could not notify staff.');
      }
    } catch {
      toast.error('Network error.');
    } finally {
      setCallingStaff(false);
    }
  };

  // Request Bill
  const handleRequestBill = async (paymentMethod: 'REGISTER' | 'ONLINE') => {
    if (requestingBill) return;
    setRequestingBill(true);
    try {
      const res = await apiFetch('/api/v1/tables/request-bill', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tableNumber: tableNumber.trim(),
          paymentMethod,
        }),
      });
      if (res.ok) {
        toast.success(lang === 'en' ? 'Bill requested! Please proceed to the cashier.' : 'お会計を受付いたしました。レジカウンターへお越しください。', { duration: 5000, icon: '🧾' });
        setShowCheckoutModal(false);
      } else {
        toast.error('Could not request bill.');
      }
    } catch {
      toast.error('Network error.');
    } finally {
      setRequestingBill(false);
    }
  };

  const branchDisplayName = useMemo(() => {
    if (lang === 'en') {
      if (selectedStore.id.includes('higashikoganei') || selectedStore.name.includes('東小金井')) return 'Higashikoganei';
      if (selectedStore.id.includes('musashisakai') || selectedStore.name.includes('武蔵境')) return 'Musashisakai';
      return selectedStore.name.replace(/アダルサ\s*/, '') || 'Higashikoganei';
    }
    return selectedStore.name.replace(/アダルサ\s*/, '') || selectedStore.name;
  }, [selectedStore, lang]);

  return (
    <div className="dio-wrapper notranslate" translate="no">
      {/* ── TOP HEADER (Logo, Brand & Branch, Flag Pill) ── */}
      <header className="dio-header">
        <div className="dio-header-inner">
          <div className="dio-header-left">
            <div className="dio-header-logo-wrap">
              <img src="/adarsha-log.webp" alt="Adarsha" className="dio-header-logo" />
            </div>

            <div className="dio-header-brand-wrap">
              <div className="dio-header-title-lines">
                <span className="dio-header-brand">{lang === 'ja' ? 'アダルサ' : 'Adarsha'}</span>
                <span className="dio-header-branch">{branchDisplayName}</span>
              </div>
              <div className="dio-header-pills-row">
                {isTakeout ? (
                  <>
                    <button
                      type="button"
                      className="dio-table-pill"
                      style={{
                        background: '#fff7ed',
                        borderColor: '#fed7aa',
                        color: '#c2410c',
                      }}
                      onClick={() => {
                        if (onOpenChoiceModal) onOpenChoiceModal();
                      }}
                      title={lang === 'ja' ? 'お持ち帰り（店頭受取）' : 'Takeout / To Go'}
                    >
                      <span>{lang === 'ja' ? '🛍️ お持帰り' : '🛍️ Takeout'}</span>
                      <ChevronDown size={11} />
                    </button>

                    {(onOpenChoiceModal || onSwitchToDineIn) && (
                      <button
                        type="button"
                        className="dio-switch-pill"
                        onClick={() => {
                          if (onSwitchToDineIn) onSwitchToDineIn();
                          else if (onOpenChoiceModal) onOpenChoiceModal();
                        }}
                        title={lang === 'ja' ? '店内飲食（お席でご注文）に切り替え' : 'Switch to Dine-In'}
                      >
                        <UtensilsCrossed size={11} />
                        <span>{lang === 'ja' ? (tableNumber ? `席${tableNumber}へ` : '店内切替') : 'Dine-In'}</span>
                      </button>
                    )}
                  </>
                ) : (
                  <>
                    <button
                      type="button"
                      className="dio-table-pill"
                      onClick={() => {
                        if (onOpenChoiceModal) onOpenChoiceModal();
                        else {
                          setNewTableInput(tableNumber);
                          setShowTableEditModal(true);
                        }
                      }}
                      title={lang === 'ja' ? 'お席番号・注文方法の変更' : 'Change table / order type'}
                    >
                      <span>{lang === 'ja' ? `お席 ${tableNumber}` : `Table ${tableNumber}`}</span>
                      <ChevronDown size={11} />
                    </button>

                    {(onOpenChoiceModal || onSwitchToTakeout) && (
                      <button
                        type="button"
                        className="dio-switch-pill"
                        onClick={() => {
                          if (onOpenChoiceModal) onOpenChoiceModal();
                          else if (onSwitchToTakeout) onSwitchToTakeout();
                        }}
                        title={lang === 'ja' ? 'テイクアウト（お持ち帰り）に切り替え' : 'Switch to Takeout'}
                      >
                        <ShoppingBag size={11} />
                        <span>{lang === 'ja' ? '持帰切替' : 'To Go'}</span>
                      </button>
                    )}
                  </>
                )}
              </div>
            </div>
          </div>

          <div className="dio-header-right">
            <button
              type="button"
              className={`dio-user-pill ${customer ? 'is-logged-in' : ''}`}
              onClick={() => setShowAuthModal(true)}
              title={customer ? (lang === 'ja' ? `${customer.name}様 会員情報` : `${customer.name} Member Info`) : (lang === 'ja' ? '会員ログイン・新規登録（任意）' : 'Member Login (Optional)')}
            >
              <User size={14} />
              <span>{customer ? (customer.name.length > 5 ? customer.name.slice(0, 5) + '…' : customer.name) : (lang === 'ja' ? 'ログイン' : 'Login')}</span>
              {customer && customer.points > 0 && (
                <span className="dio-user-pill-pts">{customer.points}pt</span>
              )}
            </button>

            <button
              type="button"
              className="dio-flag-pill"
              onClick={toggleLang}
              title={lang === 'ja' ? 'Switch to English' : '日本語に切り替え'}
            >
              <span>{lang === 'ja' ? '🇯🇵 日本語' : '🇬🇧 EN'}</span>
              <ChevronDown size={13} color="#4b5563" />
            </button>
          </div>
        </div>
      </header>

      {/* ── HORIZONTAL CATEGORY SCROLLING BAR ── */}
      <div className="dio-categories-bar">
        {isTakeout ? (
          (onOpenChoiceModal || onSwitchToDineIn) && (
            <button
              type="button"
              className="dio-cat-chip dio-cat-chip-switch"
              onClick={() => {
                if (onSwitchToDineIn) onSwitchToDineIn();
                else if (onOpenChoiceModal) onOpenChoiceModal();
              }}
              title={lang === 'ja' ? '店内飲食（お席でご注文）に切り替え' : 'Switch to Dine-In'}
            >
              <UtensilsCrossed size={13} />
              <span>{lang === 'ja' ? (tableNumber ? `席${tableNumber}で食事` : '店内へ切替') : 'Dine-In'}</span>
            </button>
          )
        ) : (
          (onOpenChoiceModal || onSwitchToTakeout) && (
            <button
              type="button"
              className="dio-cat-chip dio-cat-chip-switch"
              onClick={() => {
                if (onOpenChoiceModal) onOpenChoiceModal();
                else if (onSwitchToTakeout) onSwitchToTakeout();
              }}
              title={lang === 'ja' ? 'テイクアウト（お持ち帰り）に切り替え' : 'Switch to Takeout'}
            >
              <ShoppingBag size={13} />
              <span>{lang === 'ja' ? '持帰へ切替' : 'To Go'}</span>
            </button>
          )
        )}
        <button
          type="button"
          className={`dio-cat-chip ${selectedCategoryId === 'all' ? 'is-active' : ''}`}
          onClick={() => setSelectedCategoryId('all')}
        >
          {lang === 'ja' ? '全メニュー' : 'All Dishes'}
        </button>
        {visibleCategories.map(cat => (
          <button
            key={cat.id}
            type="button"
            className={`dio-cat-chip ${selectedCategoryId === cat.id ? 'is-active' : ''}`}
            onClick={() => setSelectedCategoryId(cat.id)}
          >
            {lang === 'ja' ? (cat.nameJa || cat.nameEn) : cat.nameEn}
          </button>
        ))}
      </div>

      {/* ── SEARCH & MENU PICKER ROW ── */}
      <div className="dio-search-row">
        <div className="dio-search-box">
          <Search size={18} color="#9ca3af" />
          <input
            type="text"
            className="dio-search-input"
            placeholder={lang === 'ja' ? 'メニュー・料理名を検索...' : 'Search menu items...'}
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
          />
          {searchQuery && (
            <button
              type="button"
              style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 2 }}
              onClick={() => setSearchQuery('')}
            >
              <X size={16} color="#9ca3af" />
            </button>
          )}
        </div>

        <div style={{ position: 'relative' }}>
          <button
            type="button"
            className="dio-menu-picker-btn"
            onClick={() => setShowCategoryDropdown(v => !v)}
          >
            <span style={{ fontSize: '1.1rem' }}>≡</span>
            <span>{activeCategoryTitle.length > 8 ? `${activeCategoryTitle.substring(0, 7)}...` : activeCategoryTitle}</span>
            <ChevronDown size={14} color="#6b7280" />
          </button>

          {showCategoryDropdown && (
            <div
              style={{
                position: 'absolute',
                top: '100%',
                right: 0,
                marginTop: 6,
                background: '#fff',
                border: '1px solid #e5e7eb',
                borderRadius: 12,
                boxShadow: '0 8px 24px rgba(0,0,0,0.12)',
                zIndex: 60,
                minWidth: 180,
                padding: '6px 0',
              }}
            >
              <button
                type="button"
                style={{
                  width: '100%',
                  textAlign: 'left',
                  padding: '10px 16px',
                  background: selectedCategoryId === 'all' ? '#fff7ed' : 'none',
                  border: 'none',
                  fontWeight: selectedCategoryId === 'all' ? 800 : 600,
                  color: selectedCategoryId === 'all' ? 'var(--dio-primary)' : '#374151',
                  cursor: 'pointer',
                  fontSize: '0.88rem',
                }}
                onClick={() => {
                  setSelectedCategoryId('all');
                  setShowCategoryDropdown(false);
                }}
              >
                {lang === 'ja' ? '全メニュー' : 'All Dishes'}
              </button>
              {visibleCategories.map(cat => (
                <button
                  key={cat.id}
                  type="button"
                  style={{
                    width: '100%',
                    textAlign: 'left',
                    padding: '10px 16px',
                    background: selectedCategoryId === cat.id ? '#fff7ed' : 'none',
                    border: 'none',
                    fontWeight: selectedCategoryId === cat.id ? 800 : 600,
                    color: selectedCategoryId === cat.id ? 'var(--dio-primary)' : '#374151',
                    cursor: 'pointer',
                    fontSize: '0.88rem',
                  }}
                  onClick={() => {
                    setSelectedCategoryId(cat.id);
                    setShowCategoryDropdown(false);
                  }}
                >
                  {lang === 'en' ? cat.nameEn : (cat.nameJa || cat.nameEn)}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* ── SECTION HEADER (Indian Dinner) ── */}
      <div className="dio-section-header-wrap">
        <h2 className="dio-section-title">{activeCategoryTitle}</h2>
        <div className="dio-section-divider" />
      </div>

      {/* ── HORIZONTAL MENU ITEM CARDS (Exact match to screenshot) ── */}
      <div className="dio-menu-list">
        {filteredItems.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '40px 16px', color: 'var(--dio-gray)' }}>
            <p style={{ fontSize: '1rem', fontWeight: 700 }}>
              {lang === 'en' ? 'No dishes found' : '該当する料理が見つかりませんでした'}
            </p>
          </div>
        ) : (
          filteredItems.map(item => {
            const isFaved = favorites.has(item.id);
            const inTrayCount = tray
              .filter(t => t.itemId === item.id)
              .reduce((sum, t) => sum + t.quantity, 0);

            return (
              <div
                key={item.id}
                className="dio-item-card"
                onClick={() => handleItemCardClick(item)}
              >
                {/* Food Photo Left */}
                <div className="dio-item-thumb-wrap">
                  {item.imageUrl && !failedImages.has(item.id) ? (
                    <img
                      src={assetUrl(item.imageUrl)}
                      alt=""
                      className="dio-item-thumb"
                      loading="lazy"
                      onError={() => {
                        setFailedImages(prev => {
                          const next = new Set(prev);
                          next.add(item.id);
                          return next;
                        });
                      }}
                    />
                  ) : (
                    <div className="dio-item-thumb-fallback">
                      <ChefHat size={30} color="#d97706" />
                    </div>
                  )}

                  <button
                    type="button"
                    className="dio-item-fav-heart"
                    onClick={e => toggleFavorite(item.id, e)}
                    title="Bookmark"
                  >
                    <Heart size={14} fill={isFaved ? '#ef4444' : 'none'} color={isFaved ? '#ef4444' : '#9ca3af'} />
                  </button>
                </div>

                {/* Content Center */}
                <div className="dio-item-content">
                  <h3 className="dio-item-title">
                    {lang === 'ja' ? (item.nameJa || item.nameEn) : item.nameEn}
                  </h3>
                  <p className="dio-item-desc">
                    {lang === 'ja'
                      ? (item.descriptionJa || item.descriptionEn || '本格スパイスで仕上げた当店自慢の一品。')
                      : (item.descriptionEn || item.descriptionJa || 'Authentic dish freshly prepared with spices.')}
                  </p>
                  <div className="dio-item-price">
                    {yen(item.price)}
                  </div>
                </div>

                {/* Action Button Right (Red Circular Plus) */}
                <div className="dio-item-action" onClick={e => e.stopPropagation()}>
                  {inTrayCount > 0 ? (
                    <div className="dio-in-tray-control">
                      <button
                        type="button"
                        className="dio-in-tray-btn"
                        onClick={() => {
                          const target = tray.find(t => t.itemId === item.id);
                          if (target) updateTrayQty(target.id, -1);
                        }}
                      >
                        -
                      </button>
                      <span className="dio-in-tray-num">{inTrayCount}</span>
                      <button
                        type="button"
                        className="dio-in-tray-btn"
                        onClick={() => handleItemCardClick(item)}
                      >
                        +
                      </button>
                    </div>
                  ) : (
                    <button
                      type="button"
                      className="dio-plus-btn"
                      onClick={() => handleItemCardClick(item)}
                      title="Add to order"
                    >
                      +
                    </button>
                  )}
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* ── STICKY FLOATING BOTTOM CART BAR (Exact screenshot design) ── */}
      <footer className="dio-bottom-bar">
        <div className="dio-bottom-bar-inner">
          {/* Left: Orders & Bill */}
          <button
            type="button"
            className="dio-bottom-nav-item"
            onClick={() => {
              loadTableOrders();
              setShowHistoryModal(true);
            }}
          >
            <History size={20} />
            <span>{lang === 'en' ? 'Orders' : '注文履歴'}</span>
          </button>

          {/* Center: Prominent Red Circular Cart Button */}
          <button
            type="button"
            className="dio-center-cart-btn"
            onClick={() => setShowCartModal(true)}
          >
            <div className="dio-center-cart-circle">
              <ShoppingCart size={24} />
              {trayCount > 0 && (
                <span className="dio-center-cart-badge">{trayCount}</span>
              )}
            </div>
            <span className="dio-center-cart-label">{lang === 'en' ? 'Cart' : 'カート'}</span>
          </button>

          {/* Right: Staff Call (Dine-In) or Store Call (Takeout) */}
          {isTakeout ? (
            <button
              type="button"
              className="dio-bottom-nav-item"
              onClick={() => {
                if (selectedStore.phone) {
                  window.location.href = `tel:${selectedStore.phone}`;
                } else {
                  toast(lang === 'ja' ? `${selectedStore.name}: 営業中` : `${selectedStore.name}: Open`, { icon: '📍' });
                }
              }}
              title={lang === 'ja' ? '店舗へお電話' : 'Call store'}
            >
              <Phone size={20} />
              <span>{lang === 'en' ? 'Call Store' : '店舗連絡'}</span>
            </button>
          ) : (
            <button
              type="button"
              className="dio-bottom-nav-item"
              onClick={() => setShowCallStaffModal(true)}
            >
              <Bell size={20} />
              <span>{lang === 'en' ? 'Call Staff' : '店員呼出'}</span>
            </button>
          )}
        </div>
      </footer>

      {/* ── MODAL: CART TRAY (Send Order to Kitchen or Takeout Counter) ── */}
      {showCartModal && (
        <div
          className="dio-modal-overlay"
          onClick={() => setShowCartModal(false)}
          onTouchMove={e => { if (e.target === e.currentTarget) e.preventDefault(); }}
        >
          <div
            className="dio-modal-sheet"
            onClick={e => e.stopPropagation()}
            onTouchMove={e => e.stopPropagation()}
          >
            <div className="dio-modal-header">
              <h3 className="dio-modal-title">
                🛒 {lang === 'ja' ? '今回のご注文' : 'Your Order'} ({trayCount})
              </h3>
              <button type="button" className="dio-modal-close" onClick={() => setShowCartModal(false)}>
                <X size={18} />
              </button>
            </div>

            <div className="dio-modal-body">
              {tray.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '40px 16px', color: 'var(--dio-gray)' }}>
                  <ShoppingCart size={48} color="#d1d5db" style={{ margin: '0 auto 12px' }} />
                  <p style={{ fontSize: '1.05rem', fontWeight: 800 }}>
                    {lang === 'ja' ? '注文トレイは空です' : 'Your tray is empty'}
                  </p>
                  <p style={{ fontSize: '0.82rem' }}>
                    {lang === 'ja' ? 'メニューからお好きな料理をお選びください' : 'Select dishes from the menu to add them here'}
                  </p>
                </div>
              ) : (
                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', paddingBottom: 10, borderBottom: '1px solid #e5e7eb', marginBottom: 12 }}>
                    <span style={{ fontSize: '0.85rem', fontWeight: 700 }}>
                      {isTakeout
                        ? (lang === 'ja' ? '🛍️ テイクアウト（店頭受取）' : '🛍️ Takeout / To Go')
                        : (lang === 'ja' ? `お席 ${tableNumber}` : `Table ${tableNumber}`)}
                    </span>
                    <button
                      type="button"
                      style={{ background: 'none', border: 'none', color: '#dc2626', fontSize: '0.8rem', cursor: 'pointer', fontWeight: 600 }}
                      onClick={() => {
                        if (window.confirm(lang === 'ja' ? 'トレイを空にしますか？' : 'Clear all items in tray?')) setTray([]);
                      }}
                    >
                      {lang === 'ja' ? 'トレイを空にする' : 'Clear Tray'}
                    </button>
                  </div>

                  {isTakeout && (
                    <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 12, padding: '12px 14px', marginBottom: 14 }}>
                      <div style={{ fontSize: '0.82rem', fontWeight: 800, color: '#0f172a', marginBottom: 8, display: 'flex', alignItems: 'center', gap: 6 }}>
                        <ShoppingBag size={14} color="#ea580c" />
                        <span>{lang === 'ja' ? 'お受取情報（店頭レジ受取）' : 'Pickup Info'}</span>
                      </div>
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                        <input
                          type="text"
                          placeholder={lang === 'ja' ? 'お名前 (呼出用)' : 'Your Name'}
                          value={takeoutCustomerName}
                          onChange={e => setTakeoutCustomerName(e.target.value)}
                          style={{ padding: '8px 10px', borderRadius: 8, border: '1px solid #cbd5e1', fontSize: '0.82rem', width: '100%', boxSizing: 'border-box' }}
                        />
                        <input
                          type="tel"
                          placeholder={lang === 'ja' ? 'お電話番号 (任意)' : 'Phone Number'}
                          value={takeoutCustomerPhone}
                          onChange={e => setTakeoutCustomerPhone(e.target.value)}
                          style={{ padding: '8px 10px', borderRadius: 8, border: '1px solid #cbd5e1', fontSize: '0.82rem', width: '100%', boxSizing: 'border-box' }}
                        />
                      </div>
                      <div style={{ fontSize: '0.74rem', color: '#64748b', marginTop: 6 }}>
                        {lang === 'ja' ? '受取目安: ご注文後 約15〜20分で店頭レジにてお渡し' : 'Estimated pickup: 15-20 min after ordering'}
                      </div>
                    </div>
                  )}

                  {tray.map(item => (
                    <div key={item.id} className="dio-tray-item">
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontWeight: 800, fontSize: '0.98rem' }}>
                          {lang === 'ja' ? item.nameJa : item.nameEn}
                        </div>
                        <div style={{ fontSize: '0.78rem', color: 'var(--dio-gray)' }}>
                          {item.spiceLevel !== undefined && (
                            <span style={{ marginRight: 6 }}>🌶️ {lang === 'ja' ? SPICE_LABELS[item.spiceLevel]?.ja : SPICE_LABELS[item.spiceLevel]?.en}</span>
                          )}
                          {item.selectedOption && <span>· {item.selectedOption}</span>}
                          {item.note && <span style={{ color: 'var(--dio-primary)', marginLeft: 4 }}>({item.note})</span>}
                        </div>
                      </div>

                      <div className="dio-in-tray-control">
                        <button type="button" className="dio-in-tray-btn" onClick={() => updateTrayQty(item.id, -1)}>
                          -
                        </button>
                        <span className="dio-in-tray-num">{item.quantity}</span>
                        <button type="button" className="dio-in-tray-btn" onClick={() => updateTrayQty(item.id, 1)}>
                          +
                        </button>
                      </div>

                      <div style={{ fontWeight: 800, fontSize: '0.98rem', color: 'var(--dio-primary)', marginLeft: 12, minWidth: 64, textAlign: 'right' }}>
                        {yen((item.price + (item.optionPrice || 0)) * item.quantity)}
                      </div>
                    </div>
                  ))}

                  <div style={{ background: '#f9fafb', borderRadius: 14, padding: '14px 16px', marginTop: 16, border: '1px solid #e5e7eb' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.88rem', color: 'var(--dio-gray)', marginBottom: 6 }}>
                      <span>{lang === 'ja' ? '小計' : 'Subtotal'}</span>
                      <span>{yen(traySubtotal)}</span>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.88rem', color: 'var(--dio-gray)', marginBottom: 6 }}>
                      <span>{lang === 'ja' ? `消費税 (${isTakeout ? '8% 軽減税率' : '10%'})` : `Tax (${isTakeout ? '8%' : '10%'})`}</span>
                      <span>{yen(trayTax)}</span>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '1.2rem', fontWeight: 900, borderTop: '1.5px solid #e5e7eb', paddingTop: 8, marginTop: 8 }}>
                      <span>{lang === 'ja' ? 'ご注文合計 (税込)' : 'Total Due'}</span>
                      <span style={{ color: 'var(--dio-primary)' }}>{yen(trayGrandTotal)}</span>
                    </div>
                  </div>

                  {/* Optional member loyalty banner */}
                  {customer ? (
                    <div style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 12, padding: '10px 14px', marginTop: 14, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.82rem', fontWeight: 700, color: '#166534' }}>
                        <CheckCircle2 size={16} color="#16a34a" />
                        <span>{lang === 'ja' ? `${customer.name} 様として注文` : `Ordering as ${customer.name}`}</span>
                      </div>
                      <span style={{ fontSize: '0.78rem', fontWeight: 800, color: 'var(--dio-primary)', background: '#fff', padding: '2px 8px', borderRadius: 9999, border: '1px solid #fed7aa' }}>
                        +{Math.floor(trayGrandTotal / 100)}pt 獲得予定
                      </span>
                    </div>
                  ) : (
                    <div style={{ background: '#fffbeb', border: '1px solid #fef3c7', borderRadius: 12, padding: '12px 14px', marginTop: 14 }}>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.84rem', fontWeight: 800, color: '#92400e' }}>
                          <Sparkles size={15} color="#d97706" />
                          <span>{lang === 'ja' ? '会員ログインでポイント獲得（任意）' : 'Member Login for Points (Optional)'}</span>
                        </div>
                        <span style={{ fontSize: '0.7rem', color: '#78350f', background: '#fef3c7', padding: '1px 6px', borderRadius: 4, fontWeight: 700 }}>
                          {lang === 'ja' ? '任意' : 'Optional'}
                        </span>
                      </div>
                      <p style={{ margin: '0 0 8px', fontSize: '0.76rem', color: '#78350f', lineHeight: 1.4 }}>
                        {lang === 'ja'
                          ? 'ログインすると今回のご注文でポイントが貯まります。登録なしでもそのままご注文いただけます。'
                          : 'Log in to earn points on this order. You can also proceed directly without logging in.'}
                      </p>
                      <button
                        type="button"
                        onClick={() => setShowAuthModal(true)}
                        style={{
                          width: '100%',
                          padding: '7px 12px',
                          background: '#ffffff',
                          border: '1.5px solid #d97706',
                          borderRadius: 8,
                          color: '#92400e',
                          fontSize: '0.82rem',
                          fontWeight: 800,
                          cursor: 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          gap: 6,
                        }}
                      >
                        <LogIn size={14} />
                        <span>{lang === 'ja' ? 'ログイン / 新規登録する' : 'Sign In / Register'}</span>
                      </button>
                    </div>
                  )}

                  <button
                    type="button"
                    className="dio-send-order-btn"
                    disabled={submittingOrder}
                    onClick={handleSendOrder}
                    style={isTakeout ? { background: '#ea580c' } : undefined}
                  >
                    {isTakeout ? <ShoppingBag size={20} /> : <ChefHat size={20} />}
                    <span>
                      {submittingOrder
                        ? (lang === 'ja' ? (isTakeout ? '注文送信中…' : '厨房へ送信中…') : 'Submitting…')
                        : (lang === 'ja' ? (isTakeout ? 'テイクアウト注文を確定する' : '厨房へ注文を送信する') : (isTakeout ? 'Confirm Takeout Order' : 'Send Order to Kitchen'))}
                    </span>
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── MODAL: TABLE ORDERS & BILL (History & More Order) ── */}
      {showHistoryModal && (
        <div
          className="dio-modal-overlay"
          onClick={() => setShowHistoryModal(false)}
          onTouchMove={e => { if (e.target === e.currentTarget) e.preventDefault(); }}
        >
          <div
            className="dio-modal-sheet"
            onClick={e => e.stopPropagation()}
            onTouchMove={e => e.stopPropagation()}
          >
            <div className="dio-modal-header">
              <h3 className="dio-modal-title">
                📜 {lang === 'ja' ? '注文履歴とお会計' : 'Orders & Table Bill'}
              </h3>
              <button type="button" className="dio-modal-close" onClick={() => setShowHistoryModal(false)}>
                <X size={18} />
              </button>
            </div>

            <div className="dio-modal-body">
              {/* Payment Completed Banner & Table Reset */}
              {isTablePaid && (
                <div style={{ background: '#ecfdf5', border: '1px solid #10b981', color: '#065f46', borderRadius: 16, padding: '16px 20px', marginBottom: 16, textAlign: 'center' }}>
                  <div style={{ fontSize: '1.15rem', fontWeight: 800, marginBottom: 4 }}>
                    ✅ {lang === 'ja' ? 'お会計が完了いたしました' : 'Payment Completed'}
                  </div>
                  <p style={{ fontSize: '0.85rem', margin: '0 0 12px', opacity: 0.9 }}>
                    {lang === 'ja' ? 'ご利用誠にありがとうございました。またのお越しを心よりお待ちしております。' : 'Thank you for dining with us!'}
                  </p>
                  <button
                    type="button"
                    onClick={handleResetTableSession}
                    style={{ background: '#10b981', color: '#fff', border: 'none', borderRadius: 9999, padding: '10px 18px', fontWeight: 800, fontSize: '0.9rem', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 6 }}
                  >
                    <RotateCcw size={15} />
                    <span>{lang === 'ja' ? '新しいお客様・新規注文を開始（卓リセット）' : 'Start New Table Sitting'}</span>
                  </button>
                </div>
              )}

              {/* Running bill card */}
              <div style={{ background: '#111827', color: '#fff', borderRadius: 16, padding: '16px 20px', marginBottom: 16 }}>
                <div style={{ fontSize: '0.85rem', color: '#9ca3af', display: 'flex', justifyContent: 'space-between' }}>
                  <span>{lang === 'ja' ? `お席 ${tableNumber} · お会計合計` : `Table ${tableNumber} · Total Bill`}</span>
                  <span>{lang === 'ja' ? `ご注文: ${tableOrders.length}回` : `${tableOrders.length} rounds ordered`}</span>
                </div>
                <div style={{ fontSize: '2rem', fontWeight: 900, color: '#fbbf24', margin: '6px 0' }}>
                  {yen(tableGrandTotal)}
                </div>
                <div style={{ display: 'flex', gap: 16, fontSize: '0.82rem', color: '#9ca3af', marginBottom: 14 }}>
                  <span>{lang === 'ja' ? '小計' : 'Subtotal'}: {yen(tableSubtotal)}</span>
                  <span>{lang === 'ja' ? '消費税 (10%)' : 'Tax (10%)'}: {yen(tableTax)}</span>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                  <button
                    type="button"
                    style={{ background: 'var(--dio-primary)', color: '#fff', border: 'none', borderRadius: 9999, padding: '10px 14px', fontWeight: 800, fontSize: '0.88rem', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}
                    onClick={() => setShowHistoryModal(false)}
                  >
                    <Plus size={16} />
                    <span>{lang === 'ja' ? '追加注文' : 'Order More'}</span>
                  </button>

                  <button
                    type="button"
                    style={{ background: '#fff', color: '#111827', border: 'none', borderRadius: 9999, padding: '10px 14px', fontWeight: 800, fontSize: '0.88rem', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}
                    onClick={() => {
                      setShowHistoryModal(false);
                      setShowCheckoutModal(true);
                    }}
                  >
                    <Receipt size={16} />
                    <span>{lang === 'ja' ? 'お会計' : 'Pay Bill'}</span>
                  </button>
                </div>
              </div>

              {/* Order history items */}
              {tableOrders.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '30px 16px', color: 'var(--dio-gray)' }}>
                  <p>{lang === 'ja' ? 'このテーブルの注文はまだありません' : 'No orders placed yet for this table'}</p>
                </div>
              ) : (
                tableOrders.map((ord, idx) => (
                  <div
                    key={ord.token || idx}
                    style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 14, padding: 14, marginBottom: 10 }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid #f3f4f6', paddingBottom: 8, marginBottom: 8 }}>
                      <span style={{ fontWeight: 800, fontSize: '0.95rem' }}>
                        {lang === 'ja' ? `第${tableOrders.length - idx}回 注文` : `Round ${tableOrders.length - idx}`}
                      </span>
                      <span
                        style={{
                          fontSize: '0.75rem',
                          fontWeight: 800,
                          padding: '3px 8px',
                          borderRadius: 9999,
                          background: ord.status === 'COMPLETED' ? '#ecfdf5' : '#fff7ed',
                          color: ord.status === 'COMPLETED' ? '#059669' : '#c2410c',
                        }}
                      >
                        {ord.status === 'COMPLETED'
                          ? (lang === 'ja' ? '配膳済' : 'Served')
                          : (lang === 'ja' ? '厨房で調理中' : 'Cooking in Kitchen')}
                      </span>
                    </div>

                    {ord.items.map((it, itemIdx) => (
                      <div key={itemIdx} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.88rem', padding: '3px 0' }}>
                        <span>{lang === 'en' ? it.nameEn : (it.nameJa || it.nameEn)} × {it.quantity}</span>
                        <span style={{ fontWeight: 700 }}>{yen(it.lineTotal)}</span>
                      </div>
                    ))}
                  </div>
                ))
              )}

              <div style={{ textAlign: 'center', marginTop: 16 }}>
                <button
                  type="button"
                  onClick={handleResetTableSession}
                  style={{ background: 'none', border: 'none', color: '#9ca3af', fontSize: '0.78rem', textDecoration: 'underline', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 4 }}
                >
                  <RotateCcw size={12} />
                  <span>{lang === 'ja' ? 'テーブルを空席リセット（次のお客様へ）' : 'Reset Table Session'}</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── MODAL: CALL WAITER / STAFF ── */}
      {showCallStaffModal && (
        <div
          className="dio-modal-overlay"
          onClick={() => setShowCallStaffModal(false)}
          onTouchMove={e => { if (e.target === e.currentTarget) e.preventDefault(); }}
        >
          <div
            className="dio-modal-sheet"
            onClick={e => e.stopPropagation()}
            onTouchMove={e => e.stopPropagation()}
          >
            <div className="dio-modal-header">
              <h3 className="dio-modal-title">🔔 {lang === 'en' ? 'Call Staff' : '店員・スタッフ呼出'}</h3>
              <button type="button" className="dio-modal-close" onClick={() => setShowCallStaffModal(false)}>
                <X size={18} />
              </button>
            </div>

            <div className="dio-modal-body">
              <p style={{ fontSize: '0.85rem', color: 'var(--dio-gray)', margin: '0 0 16px' }}>
                {lang === 'en' ? 'Select an option to notify the staff:' : 'ご用の内容をお選びください:'}
              </p>

              <div className="dio-call-card" onClick={() => handleCallStaff('WATER')}>
                <div className="dio-call-card-icon">💧</div>
                <div>
                  <div style={{ fontWeight: 800, fontSize: '0.95rem' }}>{lang === 'en' ? 'Water Refill' : 'お冷のおかわり'}</div>
                  <div style={{ fontSize: '0.75rem', color: 'var(--dio-gray)' }}>{lang === 'en' ? 'We will bring a pitcher of water' : 'お水・ピッチャーをお持ちします'}</div>
                </div>
              </div>

              <div className="dio-call-card" onClick={() => handleCallStaff('EXTRA')}>
                <div className="dio-call-card-icon">🥢</div>
                <div>
                  <div style={{ fontWeight: 800, fontSize: '0.95rem' }}>{lang === 'en' ? 'Plates / Cutlery' : '取り皿・おしぼり・スプーン'}</div>
                  <div style={{ fontSize: '0.75rem', color: 'var(--dio-gray)' }}>{lang === 'en' ? 'Extra plates, spoons or wet wipes' : '予備のお皿やカトラリーをお持ちします'}</div>
                </div>
              </div>

              <div className="dio-call-card" onClick={() => handleCallStaff('BILL')}>
                <div className="dio-call-card-icon">🧾</div>
                <div>
                  <div style={{ fontWeight: 800, fontSize: '0.95rem' }}>{lang === 'en' ? 'Bill / Check Please' : 'お会計をお願いします'}</div>
                  <div style={{ fontSize: '0.75rem', color: 'var(--dio-gray)' }}>{lang === 'en' ? 'Ready to checkout at the register' : '伝票を準備しレジでご案内します'}</div>
                </div>
              </div>

              <div className="dio-call-card" onClick={() => handleCallStaff('CALL')}>
                <div className="dio-call-card-icon">🔔</div>
                <div>
                  <div style={{ fontWeight: 800, fontSize: '0.95rem' }}>{lang === 'en' ? 'General Assistance' : '店員をお呼び出し'}</div>
                  <div style={{ fontSize: '0.75rem', color: 'var(--dio-gray)' }}>{lang === 'en' ? 'Need help with menu or table' : 'ご注文や料理のご相談など'}</div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── MODAL: CHECKOUT / BILL ── */}
      {showCheckoutModal && (
        <div
          className="dio-modal-overlay"
          onClick={() => setShowCheckoutModal(false)}
          onTouchMove={e => { if (e.target === e.currentTarget) e.preventDefault(); }}
        >
          <div
            className="dio-modal-sheet"
            onClick={e => e.stopPropagation()}
            onTouchMove={e => e.stopPropagation()}
          >
            <div className="dio-modal-header">
              <h3 className="dio-modal-title">🧾 {lang === 'en' ? 'Table Checkout' : 'お会計手続き'}</h3>
              <button type="button" className="dio-modal-close" onClick={() => setShowCheckoutModal(false)}>
                <X size={18} />
              </button>
            </div>

            <div className="dio-modal-body">
              <div style={{ textAlign: 'center', padding: '16px 0', borderBottom: '1px solid #e5e7eb', marginBottom: 16 }}>
                <span style={{ fontSize: '0.85rem', color: 'var(--dio-gray)' }}>
                  {lang === 'ja' ? `お席 ${tableNumber} · お会計合計` : `Table ${tableNumber} · Total Bill`}
                </span>
                <div style={{ fontSize: '2.2rem', fontWeight: 900, color: 'var(--dio-primary)', margin: '4px 0' }}>
                  {yen(tableGrandTotal)}
                </div>
                <span style={{ fontSize: '0.75rem', color: 'var(--dio-gray)' }}>
                  {lang === 'ja' ? '消費税10%込' : 'Includes 10% tax'}
                </span>
              </div>

              <div
                className="dio-call-card"
                onClick={() => handleRequestBill('REGISTER')}
                style={{ border: '2px solid var(--dio-primary)', background: '#fff7ed' }}
              >
                <div className="dio-call-card-icon" style={{ background: '#ffedd5', color: 'var(--dio-primary)' }}>
                  🏪
                </div>
                <div>
                  <div style={{ fontWeight: 800, fontSize: '0.95rem' }}>{lang === 'en' ? 'Pay at Register' : 'レジカウンターでお支払い'}</div>
                  <div style={{ fontSize: '0.75rem', color: 'var(--dio-gray)' }}>{lang === 'en' ? 'Cash, PayPay, Credit Card, IC card' : '現金、PayPay、クレジットカード、交通系IC'}</div>
                </div>
              </div>

              <div className="dio-call-card" onClick={() => handleRequestBill('ONLINE')}>
                <div className="dio-call-card-icon">💳</div>
                <div>
                  <div style={{ fontWeight: 800, fontSize: '0.95rem' }}>{lang === 'en' ? 'Online Card Pay (Square)' : 'オンライン即時決済'}</div>
                  <div style={{ fontSize: '0.75rem', color: 'var(--dio-gray)' }}>{lang === 'en' ? 'Pay directly from your phone' : 'スマートフォンから直接お支払い'}</div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── MODAL: DISH CUSTOMIZATION SHEET (Matches shop.sakuracto.com design & screenshots) ── */}
      {customizingItem && (() => {
        const isCurry = (customizingItem.nameJa || '').includes('カレー') || (customizingItem.nameEn || '').toLowerCase().includes('curry');
        const isSet = (customizingItem.nameJa || '').includes('セット') || (customizingItem.nameEn || '').toLowerCase().includes('set');

        const selectedBreadObj = NAAN_OPTIONS.find(b => b.id === customBread);
        const selectedCurryObj = CURRY_CHOICE_OPTIONS.find(c => c.id === customCurry);
        const selectedDrinkObj = DRINK_OPTIONS.find(d => d.id === customDrink);

        const breadAddPrice = (isCurry || isSet) && selectedBreadObj ? selectedBreadObj.price : 0;
        const curryAddPrice = isSet && selectedCurryObj ? selectedCurryObj.price : 0;
        const drinkAddPrice = (isCurry || isSet) && selectedDrinkObj ? selectedDrinkObj.price : 0;

        const basePrice = customizingItem.price || 0;
        const unitCustomPrice = basePrice + breadAddPrice + curryAddPrice + drinkAddPrice;
        const totalCustomPrice = unitCustomPrice * customQty;

        const handleConfirmCustomization = () => {
          const optionParts: string[] = [];
          let totalAddPrice = 0;

          if (isCurry || isSet) {
            const spiceObj = SPICE_OPTIONS.find(s => s.level === customSpice);
            if (spiceObj) {
              optionParts.push(lang === 'ja' ? `辛さ: ${spiceObj.nameJa}` : `Spice: ${spiceObj.nameEn}`);
            }

            if (selectedBreadObj) {
              optionParts.push(
                `${lang === 'ja' ? selectedBreadObj.nameJa : selectedBreadObj.nameEn}${
                  selectedBreadObj.price > 0 ? ` (+¥${selectedBreadObj.price})` : ''
                }`
              );
              totalAddPrice += selectedBreadObj.price;
            }

            if (isSet && selectedCurryObj) {
              optionParts.push(
                `${lang === 'ja' ? selectedCurryObj.nameJa : selectedCurryObj.nameEn}${
                  selectedCurryObj.price > 0 ? ` (+¥${selectedCurryObj.price})` : ''
                }`
              );
              totalAddPrice += selectedCurryObj.price;
            }

            if (selectedDrinkObj && selectedDrinkObj.id !== 'none') {
              optionParts.push(
                `${lang === 'ja' ? selectedDrinkObj.nameJa : selectedDrinkObj.nameEn}${
                  selectedDrinkObj.price > 0 ? ` (+¥${selectedDrinkObj.price})` : ''
                }`
              );
              totalAddPrice += selectedDrinkObj.price;
            }
          }

          addToTray({
            id: `${customizingItem.id}_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
            itemId: customizingItem.id,
            nameJa: customizingItem.nameJa || customizingItem.nameEn,
            nameEn: customizingItem.nameEn,
            price: customizingItem.price,
            quantity: customQty,
            spiceLevel: isCurry || isSet ? customSpice : undefined,
            selectedOption: optionParts.length > 0 ? optionParts.join(' / ') : undefined,
            optionPrice: totalAddPrice,
            note: customNote.trim() || undefined,
            imageUrl: customizingItem.imageUrl,
          });

          toast.success(
            lang === 'ja'
              ? `「${customizingItem.nameJa || customizingItem.nameEn}」をトレイに追加しました`
              : `${customizingItem.nameEn} added to tray!`
          );

          setCustomizingItem(null);
        };

        const itemImage = customizingItem.imageUrl
          ? (customizingItem.imageUrl.startsWith('http') || customizingItem.imageUrl.startsWith('/')
              ? customizingItem.imageUrl
              : assetUrl(customizingItem.imageUrl))
          : null;

        const categoryBadge = lang === 'ja'
          ? (customizingItem.category?.nameJa || customizingItem.category?.nameEn || 'ディナーメニュー')
          : (customizingItem.category?.nameEn || 'Dinner Menu');

        return (
          <div
            className="dio-modal-overlay"
            onClick={() => setCustomizingItem(null)}
            onTouchMove={e => { if (e.target === e.currentTarget) e.preventDefault(); }}
          >
            <div
              className="dio-cust-sheet"
              onClick={e => e.stopPropagation()}
              onTouchMove={e => e.stopPropagation()}
            >
              {/* 1. Fixed Header with Dish Title & Circular Close Button (ALWAYS PINNED) */}
              <div className="dio-cust-header">
                <h3 className="dio-cust-header-title">
                  {lang === 'ja' ? (customizingItem.nameJa || customizingItem.nameEn) : customizingItem.nameEn}
                </h3>
                <button
                  type="button"
                  className="dio-cust-close-btn"
                  onClick={() => setCustomizingItem(null)}
                  aria-label="Close"
                  title={lang === 'ja' ? '閉じる' : 'Close'}
                >
                  <X size={18} />
                </button>
              </div>

              {/* 2. Fixed Tab Row (ALWAYS PINNED) */}
              <div className="dio-cust-tab-row">
                <span className="dio-cust-tab-item">{lang === 'ja' ? '追加' : 'Options'}</span>
              </div>

              {/* 3. Scrollable Content Area (Contains Hero and all Option Cards) */}
              <div className="dio-cust-scrollable">
                {/* Hero photo & Dish Information */}
                <div className="dio-cust-hero">
                  {itemImage && !custImgError && (
                    <div className="dio-cust-hero-img-wrap">
                      <img
                        src={itemImage}
                        alt={customizingItem.nameJa || customizingItem.nameEn}
                        className="dio-cust-hero-img"
                        onError={() => setCustImgError(true)}
                      />
                    </div>
                  )}

                  <div className="dio-cust-hero-info">
                    <div className="dio-cust-hero-top">
                      <h2 className="dio-cust-hero-title">
                        {lang === 'ja' ? (customizingItem.nameJa || customizingItem.nameEn) : customizingItem.nameEn}
                      </h2>
                      <span className="dio-cust-hero-price">
                        ¥ {customizingItem.price.toLocaleString()}
                      </span>
                    </div>

                    <div className="dio-cust-badge">
                      {categoryBadge}
                    </div>

                    {(customizingItem.descriptionJa || customizingItem.descriptionEn) && (
                      <p className="dio-cust-hero-desc">
                        {lang === 'ja'
                          ? (customizingItem.descriptionJa || customizingItem.descriptionEn)
                          : (customizingItem.descriptionEn || customizingItem.descriptionJa)}
                      </p>
                    )}
                  </div>
                </div>

                {/* Options Cards Body */}
                <div className="dio-cust-body">
                {/* Card 1: 辛さ (Spice Level) - for curry and set */}
                {(isCurry || isSet) && (
                  <div className="dio-opt-card">
                    <div className="dio-opt-card-head">
                      <h4 className="dio-opt-card-title">{lang === 'ja' ? '辛さ' : 'Spice Level'}</h4>
                      <div className="dio-opt-card-sub">
                        <span className="dio-opt-card-num">{lang === 'ja' ? '選択 1' : 'Select 1'}</span>
                        <span className="dio-badge-required">{lang === 'ja' ? '必須' : 'Required'}</span>
                      </div>
                    </div>
                    <div>
                      {SPICE_OPTIONS.map(opt => {
                        const isSelected = customSpice === opt.level;
                        return (
                          <div
                            key={opt.level}
                            className={`dio-opt-row ${isSelected ? 'is-selected' : ''}`}
                            onClick={() => setCustomSpice(opt.level)}
                          >
                            <span className="dio-opt-row-label">
                              {lang === 'ja' ? opt.nameJa : opt.nameEn}
                            </span>
                            <div className="dio-opt-radio is-circle">
                              {isSelected && <div className="dio-opt-radio-dot" />}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* Card 2: ナン変更 (Naan Options) - for curry and set */}
                {(isCurry || isSet) && (
                  <div className="dio-opt-card">
                    <div className="dio-opt-card-head">
                      <h4 className="dio-opt-card-title">{lang === 'ja' ? 'ナン変更' : 'Naan & Rice Options'}</h4>
                      <div className="dio-opt-card-sub">
                        <span className="dio-opt-card-num">{lang === 'ja' ? '選択 1' : 'Select 1'}</span>
                        <span className="dio-badge-optional">{lang === 'ja' ? '選択' : 'Optional'}</span>
                      </div>
                    </div>
                    <div>
                      {NAAN_OPTIONS.map(opt => {
                        const isSelected = customBread === opt.id;
                        const label = `${lang === 'ja' ? opt.nameJa : opt.nameEn}${opt.price > 0 ? ` [+¥${opt.price}]` : ''}`;
                        return (
                          <div
                            key={opt.id}
                            className={`dio-opt-row ${isSelected ? 'is-selected' : ''}`}
                            onClick={() => setCustomBread(opt.id)}
                          >
                            <span className="dio-opt-row-label">{label}</span>
                            <div className="dio-opt-radio">
                              {isSelected && <div className="dio-opt-radio-dot" />}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* Card 3: カレー選択 (Curry Choice) - for sets */}
                {isSet && (
                  <div className="dio-opt-card">
                    <div className="dio-opt-card-head">
                      <h4 className="dio-opt-card-title">{lang === 'ja' ? 'カレー選択' : 'Curry Choice'}</h4>
                      <div className="dio-opt-card-sub">
                        <span className="dio-opt-card-num">{lang === 'ja' ? '選択 1' : 'Select 1'}</span>
                        <span className="dio-badge-required">{lang === 'ja' ? '必須' : 'Required'}</span>
                      </div>
                    </div>
                    <div>
                      {CURRY_CHOICE_OPTIONS.map(opt => {
                        const isSelected = customCurry === opt.id;
                        const label = `${lang === 'ja' ? opt.nameJa : opt.nameEn}${opt.price > 0 ? ` [+¥${opt.price}]` : ''}`;
                        return (
                          <div
                            key={opt.id}
                            className={`dio-opt-row ${isSelected ? 'is-selected' : ''}`}
                            onClick={() => setCustomCurry(opt.id)}
                          >
                            <span className="dio-opt-row-label">{label}</span>
                            <div className="dio-opt-radio">
                              {isSelected && <div className="dio-opt-radio-dot" />}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* Card 4: ドリンク (Drink Choice) */}
                {(isCurry || isSet) && (
                  <div className="dio-opt-card">
                    <div className="dio-opt-card-head">
                      <h4 className="dio-opt-card-title">{lang === 'ja' ? 'ドリンク' : 'Drink Choice'}</h4>
                      <div className="dio-opt-card-sub">
                        <span className="dio-opt-card-num">{lang === 'ja' ? '選択 1' : 'Select 1'}</span>
                        <span className="dio-badge-optional">{lang === 'ja' ? '選択' : 'Optional'}</span>
                      </div>
                    </div>
                    <div>
                      {DRINK_OPTIONS.map(opt => {
                        const isSelected = customDrink === opt.id;
                        const label = `${lang === 'ja' ? opt.nameJa : opt.nameEn}${opt.price > 0 ? ` [+¥${opt.price}]` : ''}`;
                        return (
                          <div
                            key={opt.id}
                            className={`dio-opt-row ${isSelected ? 'is-selected' : ''}`}
                            onClick={() => setCustomDrink(opt.id)}
                          >
                            <span className="dio-opt-row-label">{label}</span>
                            <div className="dio-opt-radio">
                              {isSelected && <div className="dio-opt-radio-dot" />}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* Card 5: 特別なご要望 (Special Requests) */}
                <div className="dio-opt-card">
                  <div className="dio-opt-card-head">
                    <h4 className="dio-opt-card-title">{lang === 'ja' ? '特別なご要望' : 'Special Requests'}</h4>
                    <div className="dio-opt-card-sub">
                      <span className="dio-opt-card-num">{lang === 'ja' ? 'アレルギー・備考' : 'Allergies & Requests'}</span>
                      <span className="dio-badge-optional">{lang === 'ja' ? '任意' : 'Optional'}</span>
                    </div>
                  </div>
                  <div style={{ padding: '12px 16px' }}>
                    <input
                      type="text"
                      placeholder={lang === 'ja' ? '例: パクチー抜き、氷少なめ、辛さ控えめなど' : 'e.g. less ice, no cilantro, allergy notes...'}
                      value={customNote}
                      onChange={e => setCustomNote(e.target.value)}
                      style={{
                        width: '100%',
                        padding: '11px 14px',
                        border: '1.5px solid #e5e7eb',
                        borderRadius: 12,
                        fontSize: '0.9rem',
                        outline: 'none',
                        boxSizing: 'border-box',
                      }}
                    />
                  </div>
                </div>

                {/* Card 6: 数量 (Quantity Card matching screenshot 3) */}
                <div className="dio-qty-card">
                  <span className="dio-qty-label">{lang === 'ja' ? '数量' : 'Quantity'}</span>
                  <div className="dio-qty-control">
                    <button
                      type="button"
                      className="dio-qty-btn-minus"
                      onClick={() => setCustomQty(q => Math.max(1, q - 1))}
                      aria-label="Decrease quantity"
                    >
                      -
                    </button>
                    <span className="dio-qty-number">{customQty}</span>
                    <button
                      type="button"
                      className="dio-qty-btn-plus"
                      onClick={() => setCustomQty(q => q + 1)}
                      aria-label="Increase quantity"
                    >
                      +
                    </button>
                  </div>
                </div>
              </div>
              {/* end .dio-cust-scrollable */}
            </div>

              {/* 4. Fixed Bottom Red Button matching screenshot */}
              <div className="dio-cust-bottom-bar">
                <button
                  type="button"
                  className="dio-cust-add-btn"
                  onClick={handleConfirmCustomization}
                >
                  <span>
                    {lang === 'ja'
                      ? `カートに追加(¥${totalCustomPrice.toLocaleString()} )`
                      : `Add to Cart (¥${totalCustomPrice.toLocaleString()} )`}
                  </span>
                </button>
              </div>
            </div>
          </div>
        );
      })()}

      {/* ── MODAL: TABLE NUMBER EDIT ── */}
      {showTableEditModal && (
        <div
          className="dio-modal-overlay"
          onClick={() => setShowTableEditModal(false)}
          onTouchMove={e => { if (e.target === e.currentTarget) e.preventDefault(); }}
        >
          <div
            className="dio-modal-sheet"
            onClick={e => e.stopPropagation()}
            onTouchMove={e => e.stopPropagation()}
          >
            <div className="dio-modal-header">
              <h3 className="dio-modal-title">🪑 {lang === 'ja' ? 'テーブル番号の変更' : 'Change Table'}</h3>
              <button type="button" className="dio-modal-close" onClick={() => setShowTableEditModal(false)}>
                <X size={18} />
              </button>
            </div>

            <div className="dio-modal-body">
              <p style={{ fontSize: '0.85rem', color: 'var(--dio-gray)', margin: '0 0 12px' }}>
                {lang === 'ja' ? 'お席のステッカーに記載された番号をご入力ください:' : 'Enter the number on your table sticker:'}
              </p>

              <input
                type="text"
                style={{
                  width: '100%',
                  border: '1.5px solid #e5e7eb',
                  borderRadius: 12,
                  padding: '12px 14px',
                  fontSize: '1.1rem',
                  fontWeight: 800,
                  marginBottom: 16,
                  outline: 'none',
                }}
                value={newTableInput}
                onChange={e => setNewTableInput(e.target.value)}
              />

              <button
                type="button"
                className="dio-send-order-btn"
                onClick={() => {
                  if (!newTableInput.trim()) return;
                  setTableNumber(newTableInput.trim());
                  setShowTableEditModal(false);
                  toast.success(lang === 'ja' ? `お席番号を ${newTableInput.trim()} に変更しました` : `Table updated to ${newTableInput.trim()}`);
                }}
              >
                {lang === 'ja' ? 'テーブル番号を保存' : 'Save Table Number'}
              </button>

              {(onOpenChoiceModal || onSwitchToTakeout) && (
                <button
                  type="button"
                  style={{
                    width: '100%',
                    marginTop: 10,
                    padding: '11px 14px',
                    borderRadius: 12,
                    border: '1.5px solid #cbd5e1',
                    background: '#f8fafc',
                    color: '#0f172a',
                    fontWeight: 800,
                    fontSize: '0.86rem',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: 8,
                  }}
                  onClick={() => {
                    setShowTableEditModal(false);
                    if (onOpenChoiceModal) onOpenChoiceModal();
                    else if (onSwitchToTakeout) onSwitchToTakeout();
                  }}
                >
                  <ShoppingBag size={16} />
                  <span>{lang === 'en' ? 'Switch to Takeout (To Go)' : 'テイクアウト（お持ち帰り）に切り替え'}</span>
                </button>
              )}
            </div>
          </div>
        </div>
      )}
      {/* ── MODAL: OPTIONAL CUSTOMER AUTH / PROFILE ── */}
      {showAuthModal && (
        <div
          className="dio-modal-overlay"
          onClick={() => setShowAuthModal(false)}
          onTouchMove={e => { if (e.target === e.currentTarget) e.preventDefault(); }}
        >
          <div
            className="dio-modal-sheet"
            onClick={e => e.stopPropagation()}
            onTouchMove={e => e.stopPropagation()}
            style={{ maxWidth: 440 }}
          >
            <div className="dio-modal-header">
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <div style={{ width: 34, height: 34, borderRadius: '50%', background: customer ? '#f0fdf4' : '#fff7ed', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  {customer ? <CheckCircle2 size={18} color="#16a34a" /> : <User size={18} color="var(--dio-primary)" />}
                </div>
                <div>
                  <h3 className="dio-modal-title" style={{ margin: 0, fontSize: '1.05rem' }}>
                    {customer
                      ? (lang === 'ja' ? '会員ステータス' : 'Member Profile')
                      : (lang === 'ja' ? '会員ログイン・新規登録' : 'Member Login / Sign Up')}
                  </h3>
                  {!customer && (
                    <span style={{ fontSize: '0.72rem', color: '#6b7280' }}>
                      {lang === 'ja' ? '任意（ログインなしでも注文可能）' : 'Optional · Order as guest anytime'}
                    </span>
                  )}
                </div>
              </div>
              <button type="button" className="dio-modal-close" onClick={() => setShowAuthModal(false)}>
                <X size={18} />
              </button>
            </div>

            <div className="dio-modal-body">
              {customer ? (
                // ── LOGGED IN PROFILE VIEW ──
                <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                  <div style={{ background: '#f9fafb', borderRadius: 14, padding: '16px', border: '1px solid #e5e7eb' }}>
                    <div style={{ fontSize: '0.78rem', color: '#6b7280', marginBottom: 2 }}>
                      {lang === 'ja' ? 'ログイン中のお客様' : 'Logged in as'}
                    </div>
                    <div style={{ fontSize: '1.15rem', fontWeight: 800, color: 'var(--dio-dark)' }}>
                      {customer.name} <span style={{ fontSize: '0.85rem', fontWeight: 600 }}>様</span>
                    </div>
                    <div style={{ fontSize: '0.82rem', color: '#4b5563', marginTop: 2 }}>
                      {customer.email}
                    </div>
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                    <div style={{ background: '#fffbeb', border: '1px solid #fef3c7', borderRadius: 12, padding: '12px' }}>
                      <div style={{ fontSize: '0.74rem', color: '#92400e', fontWeight: 700 }}>
                        {lang === 'ja' ? '保有ポイント' : 'Points Balance'}
                      </div>
                      <div style={{ fontSize: '1.4rem', fontWeight: 900, color: 'var(--dio-primary)', marginTop: 4 }}>
                        {(customer.points || 0).toLocaleString()} <span style={{ fontSize: '0.75rem', fontWeight: 700 }}>pt</span>
                      </div>
                    </div>
                    <div style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 12, padding: '12px' }}>
                      <div style={{ fontSize: '0.74rem', color: '#166534', fontWeight: 700 }}>
                        {lang === 'ja' ? '会員コード' : 'Member Code'}
                      </div>
                      <div style={{ fontSize: '1.05rem', fontWeight: 800, color: '#15803d', marginTop: 6, letterSpacing: '0.05em' }}>
                        {customer.memberCode || '—'}
                      </div>
                    </div>
                  </div>

                  <p style={{ margin: '4px 0 0', fontSize: '0.78rem', color: '#6b7280', lineHeight: 1.5 }}>
                    {lang === 'ja'
                      ? 'ご注文が完了すると、自動的にお客様のアカウントへポイントが加算されます。'
                      : 'Points will automatically be credited to your account once your meal is finalized.'}
                  </p>

                  <button
                    type="button"
                    className="dio-send-order-btn"
                    style={{ marginTop: 4 }}
                    onClick={() => setShowAuthModal(false)}
                  >
                    <span>{lang === 'ja' ? 'メニューに戻って注文する' : 'Back to Menu & Order'}</span>
                  </button>

                  <button
                    type="button"
                    onClick={handleSignOut}
                    style={{
                      background: 'none',
                      border: '1px solid #fecaca',
                      borderRadius: 10,
                      color: '#dc2626',
                      padding: '10px 14px',
                      fontSize: '0.84rem',
                      fontWeight: 700,
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: 6,
                    }}
                  >
                    <LogOut size={15} />
                    <span>{lang === 'ja' ? 'ログアウト' : 'Sign Out'}</span>
                  </button>
                </div>
              ) : (
                // ── NOT LOGGED IN: TABS (LOGIN / REGISTER) ──
                <div>
                  <div style={{ background: '#fff7ed', borderRadius: 10, padding: '10px 12px', border: '1px solid #ffedd5', marginBottom: 14 }}>
                    <div style={{ fontSize: '0.78rem', color: '#9a3412', lineHeight: 1.45 }}>
                      🎁 {lang === 'ja' ? '会員登録すると¥100ごとにポイント進呈！登録なしでもそのままご注文いただけます。' : 'Earn points on every ¥100 spent! Guest orders are also welcome.'}
                    </div>
                  </div>

                  {/* Mode tabs */}
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', background: '#f3f4f6', borderRadius: 10, padding: 3, marginBottom: 14 }}>
                    <button
                      type="button"
                      style={{
                        padding: '8px 12px',
                        border: 'none',
                        borderRadius: 8,
                        fontSize: '0.85rem',
                        fontWeight: 700,
                        cursor: 'pointer',
                        background: authMode === 'login' ? '#ffffff' : 'transparent',
                        color: authMode === 'login' ? 'var(--dio-primary)' : '#6b7280',
                        boxShadow: authMode === 'login' ? '0 1px 3px rgba(0,0,0,0.08)' : 'none',
                        transition: 'all 0.15s',
                      }}
                      onClick={() => { setAuthMode('login'); setAuthError(''); }}
                    >
                      {lang === 'ja' ? 'ログイン' : 'Log In'}
                    </button>
                    <button
                      type="button"
                      style={{
                        padding: '8px 12px',
                        border: 'none',
                        borderRadius: 8,
                        fontSize: '0.85rem',
                        fontWeight: 700,
                        cursor: 'pointer',
                        background: authMode === 'register' ? '#ffffff' : 'transparent',
                        color: authMode === 'register' ? 'var(--dio-primary)' : '#6b7280',
                        boxShadow: authMode === 'register' ? '0 1px 3px rgba(0,0,0,0.08)' : 'none',
                        transition: 'all 0.15s',
                      }}
                      onClick={() => { setAuthMode('register'); setAuthError(''); }}
                    >
                      {lang === 'ja' ? '新規登録（無料）' : 'Register (Free)'}
                    </button>
                  </div>

                  {authError && (
                    <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 8, padding: '8px 12px', marginBottom: 12, color: '#b91c1c', fontSize: '0.8rem' }}>
                      {authError}
                    </div>
                  )}

                  <form onSubmit={handleAuthSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 11 }}>
                    {authMode === 'register' && (
                      <div>
                        <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 700, color: '#374151', marginBottom: 4 }}>
                          {lang === 'ja' ? 'お名前' : 'Full Name'} <span style={{ color: '#dc2626' }}>*</span>
                        </label>
                        <input
                          type="text"
                          required
                          value={authName}
                          onChange={e => setAuthName(e.target.value)}
                          placeholder={lang === 'ja' ? '例: 山田 太郎' : 'e.g. John Doe'}
                          style={{
                            width: '100%',
                            padding: '10px 12px',
                            border: '1.5px solid #d1d5db',
                            borderRadius: 8,
                            fontSize: '0.9rem',
                            boxSizing: 'border-box',
                            outline: 'none',
                          }}
                        />
                      </div>
                    )}

                    <div>
                      <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 700, color: '#374151', marginBottom: 4 }}>
                        {lang === 'ja' ? 'メールアドレス' : 'Email Address'} <span style={{ color: '#dc2626' }}>*</span>
                      </label>
                      <input
                        type="email"
                        required
                        value={authEmail}
                        onChange={e => setAuthEmail(e.target.value)}
                        placeholder="you@example.com"
                        style={{
                          width: '100%',
                          padding: '10px 12px',
                          border: '1.5px solid #d1d5db',
                          borderRadius: 8,
                          fontSize: '0.9rem',
                          boxSizing: 'border-box',
                          outline: 'none',
                        }}
                      />
                    </div>

                    {authMode === 'register' && (
                      <div>
                        <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 700, color: '#374151', marginBottom: 4 }}>
                          {lang === 'ja' ? 'お電話番号（任意）' : 'Phone (Optional)'}
                        </label>
                        <input
                          type="tel"
                          value={authPhone}
                          onChange={e => setAuthPhone(e.target.value)}
                          placeholder="090-1234-5678"
                          style={{
                            width: '100%',
                            padding: '10px 12px',
                            border: '1.5px solid #d1d5db',
                            borderRadius: 8,
                            fontSize: '0.9rem',
                            boxSizing: 'border-box',
                            outline: 'none',
                          }}
                        />
                      </div>
                    )}

                    <div>
                      <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 700, color: '#374151', marginBottom: 4 }}>
                        {lang === 'ja' ? 'パスワード' : 'Password'} <span style={{ color: '#dc2626' }}>*</span>
                        {authMode === 'register' && <span style={{ fontSize: '0.72rem', color: '#6b7280', fontWeight: 500, marginLeft: 4 }}>{lang === 'ja' ? '（6文字以上）' : '(min 6 chars)'}</span>}
                      </label>
                      <input
                        type="password"
                        required
                        minLength={authMode === 'register' ? 6 : 1}
                        value={authPassword}
                        onChange={e => setAuthPassword(e.target.value)}
                        placeholder="••••••••"
                        style={{
                          width: '100%',
                          padding: '10px 12px',
                          border: '1.5px solid #d1d5db',
                          borderRadius: 8,
                          fontSize: '0.9rem',
                          boxSizing: 'border-box',
                          outline: 'none',
                        }}
                      />
                    </div>

                    <button
                      type="submit"
                      disabled={authSubmitting}
                      className="dio-send-order-btn"
                      style={{ marginTop: 8 }}
                    >
                      {authSubmitting
                        ? (lang === 'ja' ? '処理中…' : 'Processing…')
                        : authMode === 'register'
                          ? (lang === 'ja' ? '無料で会員登録する' : 'Sign Up (Free)')
                          : (lang === 'ja' ? 'ログインする' : 'Log In')}
                    </button>
                  </form>

                  <div style={{ textAlign: 'center', marginTop: 14 }}>
                    <button
                      type="button"
                      onClick={() => setShowAuthModal(false)}
                      style={{
                        background: 'none',
                        border: 'none',
                        color: '#6b7280',
                        fontSize: '0.8rem',
                        cursor: 'pointer',
                        textDecoration: 'underline',
                      }}
                    >
                      {lang === 'ja' ? '✕ 登録せずにゲストとして注文を続ける' : '✕ Continue ordering without login'}
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
