import { useEffect, useMemo, useState } from 'react';
import { toast } from 'react-hot-toast';
import {
  UtensilsCrossed, Search, Heart, Plus, Bell, ShoppingBag,
  History, CheckCircle2, ChevronRight, Sparkles, ChefHat,
  Flame, X, Globe, Receipt
} from 'lucide-react';
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
  stores: StoreLocation[];
  onSwitchToTakeout?: () => void;
}

const SPICE_LABELS: Record<number, { ja: string; en: string; flames: number }> = {
  0: { ja: '甘口 (Mild)', en: 'Mild', flames: 0 },
  1: { ja: '普通 (Medium)', en: 'Medium', flames: 1 },
  2: { ja: '中辛 (Hot)', en: 'Hot', flames: 2 },
  3: { ja: '辛口 (Very Hot)', en: 'Very Hot', flames: 3 },
  4: { ja: '激辛 (Super Hot)', en: 'Super Hot', flames: 4 },
};

const BREAD_OPTIONS = [
  { id: 'plain_naan', nameJa: 'プレーンナン (セット込)', nameEn: 'Plain Naan', price: 0 },
  { id: 'rice', nameJa: 'ライス (セット込)', nameEn: 'Rice', price: 0 },
  { id: 'cheese_naan', nameJa: 'チーズナンに変更 (+¥250)', nameEn: 'Cheese Naan (+¥250)', price: 250 },
  { id: 'garlic_naan', nameJa: 'ガーリックナンに変更 (+¥200)', nameEn: 'Garlic Naan (+¥200)', price: 200 },
];

export default function DineInOrderExperience({
  initialTableNumber,
  selectedStore,
  stores: _stores,
  onSwitchToTakeout,
}: DineInOrderExperienceProps) {
  const { customer } = useCustomer();

  // State
  const [tableNumber, setTableNumber] = useState<string>(() => initialTableNumber || '1');
  const [lang, setLang] = useState<'ja' | 'en'>('ja');
  const [activeTab, setActiveTab] = useState<'menu' | 'tray' | 'history' | 'favorites'>('menu');

  // Menu data
  const [menuItems, setMenuItems] = useState<QuickMenuItem[]>([]);
  const [categories, setCategories] = useState<QuickCategory[]>([]);
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [filterVegOnly, setFilterVegOnly] = useState<boolean>(false);
  const [filterSpicyOnly, setFilterSpicyOnly] = useState<boolean>(false);
  const [filterRecommended, setFilterRecommended] = useState<boolean>(false);

  // Favorites (localStorage + reactive)
  const [favorites, setFavorites] = useState<Set<string>>(() => {
    try {
      const saved = localStorage.getItem('adarsha_favorites');
      return saved ? new Set(JSON.parse(saved)) : new Set();
    } catch {
      return new Set();
    }
  });

  // Current order tray (items waiting to be sent to kitchen)
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
  const [customizingItem, setCustomizingItem] = useState<QuickMenuItem | null>(null);
  const [customSpice, setCustomSpice] = useState<number>(1);
  const [customOption, setCustomOption] = useState<string>('plain_naan');
  const [customNote, setCustomNote] = useState<string>('');
  const [customQty, setCustomQty] = useState<number>(1);

  const [showCallStaffModal, setShowCallStaffModal] = useState<boolean>(false);
  const [callingStaff, setCallingStaff] = useState<boolean>(false);
  const [showCheckoutModal, setShowCheckoutModal] = useState<boolean>(false);
  const [requestingBill, setRequestingBill] = useState<boolean>(false);
  const [showTableEditModal, setShowTableEditModal] = useState<boolean>(false);
  const [newTableInput, setNewTableInput] = useState<string>(tableNumber);

  const [submittingOrder, setSubmittingOrder] = useState<boolean>(false);

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

  // Load menu items & categories
  useEffect(() => {
    getPublic<QuickMenuItem[]>('/api/v1/menu/items')
      .then(items => {
        if (Array.isArray(items)) {
          setMenuItems(items.filter(it => it.isOrderable !== false && !it.isSoldOut));
        }
      })
      .catch(() => {});

    getPublic<QuickCategory[]>('/api/v1/menu/categories')
      .then(cats => {
        if (Array.isArray(cats)) setCategories(cats);
      })
      .catch(() => {});
  }, []);

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
      }
    } catch {}
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
        toast('お気に入りから削除しました', { icon: '💔' });
      } else {
        next.add(itemId);
        toast('お気に入りに追加しました！', { icon: '❤️' });
      }
      try {
        localStorage.setItem('adarsha_favorites', JSON.stringify(Array.from(next)));
      } catch {}
      return next;
    });
  };

  // Filtered menu items
  const filteredItems = useMemo(() => {
    return menuItems.filter(item => {
      if (selectedCategory !== 'all') {
        const itemCatId = item.categoryId || item.category?.id;
        if (itemCatId !== selectedCategory) return false;
      }
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const jaMatch = (item.nameJa || '').toLowerCase().includes(q);
        const enMatch = (item.nameEn || '').toLowerCase().includes(q);
        const descMatch = (item.descriptionJa || '').toLowerCase().includes(q);
        if (!jaMatch && !enMatch && !descMatch) return false;
      }
      if (filterVegOnly && !item.isVegetarian) return false;
      if (filterSpicyOnly && (item.spiceLevel ?? 0) === 0) return false;
      if (filterRecommended && !item.isRecommended) return false;
      if (activeTab === 'favorites' && !favorites.has(item.id)) return false;
      return true;
    });
  }, [menuItems, selectedCategory, searchQuery, filterVegOnly, filterSpicyOnly, filterRecommended, activeTab, favorites]);

  // Add item directly or trigger customization modal
  const handleQuickAdd = (item: QuickMenuItem, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    // If it's a curry or set, open the customization sheet for spice & naan selection
    const isCurry = (item.nameJa || '').includes('カレー') || (item.nameEn || '').toLowerCase().includes('curry');
    const isSet = (item.nameJa || '').includes('セット') || (item.nameEn || '').toLowerCase().includes('set');

    if (isCurry || isSet) {
      setCustomizingItem(item);
      setCustomSpice(item.spiceLevel || 1);
      setCustomOption(isSet ? 'plain_naan' : '');
      setCustomNote('');
      setCustomQty(1);
    } else {
      // Add directly
      addToTray({
        id: `${item.id}_${Date.now()}`,
        itemId: item.id,
        nameJa: item.nameJa || item.nameEn,
        nameEn: item.nameEn,
        price: item.price,
        quantity: 1,
        imageUrl: item.imageUrl,
      });
      toast.success(`${item.nameJa || item.nameEn} を追加しました`);
    }
  };

  const addToTray = (newItem: TrayItem) => {
    setTray(prev => {
      // Check if identical item (same itemId, spiceLevel, selectedOption, note) exists
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

  const trayTax = Math.floor(traySubtotal * 0.1); // 10% dine-in tax
  const trayGrandTotal = traySubtotal + trayTax;
  const trayCount = useMemo(() => tray.reduce((sum, it) => sum + it.quantity, 0), [tray]);

  // Send Order to Kitchen
  const handleSendOrder = async () => {
    if (tray.length === 0 || submittingOrder) return;
    setSubmittingOrder(true);

    try {
      const itemsPayload = tray.map(it => ({
        itemId: it.itemId,
        quantity: it.quantity,
        optionAdjust: it.optionPrice || 0,
        options: [
          it.spiceLevel !== undefined ? { name: '辛さ', choice: SPICE_LABELS[it.spiceLevel]?.ja || '普通' } : null,
          it.selectedOption ? { name: '選択', choice: it.selectedOption } : null,
          it.note ? { name: '備考', choice: it.note } : null,
        ].filter(Boolean),
      }));

      const res = await apiFetch('/api/v1/orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fulfillment: 'DINE_IN',
          tableNumber: tableNumber.trim(),
          name: customer?.name ? customer.name : `テーブル ${tableNumber.trim()}`,
          phone: customer?.phone || '00-0000-0000',
          email: customer?.email || '',
          note: `[テーブル: ${tableNumber.trim()}] 店内QR注文`,
          storeId: selectedStore.id,
          storeName: selectedStore.name,
          items: itemsPayload,
        }),
      });

      if (res.ok) {
        const data = await res.json();
        readyChime();
        toast.success('厨房へ注文を送信しました！調理を開始します。', { duration: 4000 });
        if (data.token) {
          addSessionToken(data.token);
        }
        setTray([]);
        setActiveTab('history');
        await loadTableOrders();
      } else {
        toast.error(await errorMessage(res, '注文を送信できませんでした。スタッフにお声がけください。'));
      }
    } catch {
      toast.error('通信エラーが発生しました。もう一度お試しください。');
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
        toast.success('スタッフへ通知しました。まもなくお伺いします！', { icon: '🔔' });
        setShowCallStaffModal(false);
      } else {
        toast.error('スタッフへの通知に失敗しました。直接お声がけください。');
      }
    } catch {
      toast.error('通信エラーが発生しました');
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
        toast.success('お会計を受付いたしました。伝票をお持ちになりレジカウンターへお越しください。', { duration: 5000, icon: '🧾' });
        setShowCheckoutModal(false);
      } else {
        toast.error('受付に失敗しました。');
      }
    } catch {
      toast.error('通信エラーが発生しました');
    } finally {
      setRequestingBill(false);
    }
  };

  return (
    <div className="dio-wrapper">
      {/* ── TOP STICKY HEADER ── */}
      <header className="dio-header">
        <div className="dio-header-inner">
          <div
            className="dio-table-badge is-clickable"
            onClick={() => {
              setNewTableInput(tableNumber);
              setShowTableEditModal(true);
            }}
            title="テーブル番号を変更"
          >
            <span>🪑 {tableNumber ? (tableNumber.includes('席') || tableNumber.includes('テーブル') ? tableNumber : `テーブル ${tableNumber}`) : '未指定'}</span>
          </div>

          <div className="dio-store-info">
            <span className="dio-store-name">アダルサ {selectedStore.name}</span>
            <span className="dio-store-sub">
              <span style={{ color: '#10b981', fontWeight: 800 }}>●</span>
              {lang === 'ja' ? '店内テーブルオーダー中' : 'Dine-in Order Active'}
            </span>
          </div>

          <div className="dio-header-actions">
            <button
              type="button"
              className="dio-btn-call-staff"
              onClick={() => setShowCallStaffModal(true)}
            >
              <Bell size={14} />
              <span>{lang === 'ja' ? '店員呼出' : 'Staff'}</span>
            </button>

            <button
              type="button"
              className="dio-btn-lang"
              onClick={() => setLang(l => (l === 'ja' ? 'en' : 'ja'))}
            >
              <Globe size={13} />
              <span>{lang === 'ja' ? 'EN' : 'JP'}</span>
            </button>
          </div>
        </div>

        {/* Member Strip (Optional login for points & stamp rewards) */}
        <div className="dio-member-strip">
          <div className="dio-member-strip-text">
            <Sparkles size={14} color="#d97706" />
            {customer ? (
              <span>
                {customer.name} 様 · 保有ポイント: <strong>{customer.points ?? 0} pt</strong>
              </span>
            ) : (
              <span>会員登録・ログインでお食事ごとにポイントが貯まります！</span>
            )}
          </div>
          {!customer && (
            <a href="/account/login" className="dio-member-strip-btn">
              ログイン
            </a>
          )}
        </div>
      </header>

      {/* ── NAVIGATION TABS ── */}
      <nav className="dio-nav-tabs">
        <div className="dio-nav-tabs-inner">
          <button
            type="button"
            className={`dio-nav-tab ${activeTab === 'menu' ? 'is-active' : ''}`}
            onClick={() => setActiveTab('menu')}
          >
            <UtensilsCrossed size={18} />
            <span>{lang === 'ja' ? 'メニュー' : 'Menu'}</span>
          </button>

          <button
            type="button"
            className={`dio-nav-tab ${activeTab === 'tray' ? 'is-active' : ''}`}
            onClick={() => setActiveTab('tray')}
          >
            <ShoppingBag size={18} />
            <span>{lang === 'ja' ? '今回のご注文' : 'Current Order'}</span>
            {trayCount > 0 && <span className="dio-nav-badge">{trayCount}</span>}
          </button>

          <button
            type="button"
            className={`dio-nav-tab ${activeTab === 'history' ? 'is-active' : ''}`}
            onClick={() => {
              setActiveTab('history');
              loadTableOrders();
            }}
          >
            <History size={18} />
            <span>{lang === 'ja' ? '注文履歴' : 'Orders & Bill'}</span>
            {tableOrders.length > 0 && (
              <span className="dio-nav-badge" style={{ background: '#059669' }}>
                {tableOrders.length}
              </span>
            )}
          </button>

          <button
            type="button"
            className={`dio-nav-tab ${activeTab === 'favorites' ? 'is-active' : ''}`}
            onClick={() => setActiveTab('favorites')}
          >
            <Heart size={18} />
            <span>{lang === 'ja' ? 'お気に入り' : 'Favorites'}</span>
            {favorites.size > 0 && (
              <span className="dio-nav-badge" style={{ background: '#dc2626' }}>
                {favorites.size}
              </span>
            )}
          </button>
        </div>
      </nav>

      {/* ── VIEW 1 & 4: MENU / FAVORITES ── */}
      {(activeTab === 'menu' || activeTab === 'favorites') && (
        <main>
          {/* Search Bar */}
          <div className="dio-search-wrap">
            <div className="dio-search-bar">
              <Search size={16} color="#9ca3af" />
              <input
                type="text"
                className="dio-search-input"
                placeholder={lang === 'ja' ? '料理名やキーワードで検索 (ナン、チキン、ラッシー...)' : 'Search dishes...'}
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
          </div>

          {/* Category Chips Bar (when in menu tab) */}
          {activeTab === 'menu' && (
            <div className="dio-categories-bar">
              <button
                type="button"
                className={`dio-cat-chip ${selectedCategory === 'all' ? 'is-active' : ''}`}
                onClick={() => setSelectedCategory('all')}
              >
                🌟 {lang === 'ja' ? 'すべて' : 'All'}
              </button>
              {categories.map(cat => (
                <button
                  key={cat.id}
                  type="button"
                  className={`dio-cat-chip ${selectedCategory === cat.id ? 'is-active' : ''}`}
                  onClick={() => setSelectedCategory(cat.id)}
                >
                  {cat.nameJa || cat.nameEn}
                </button>
              ))}
            </div>
          )}

          {/* Quick Filter Pills */}
          <div className="dio-quick-filters">
            <button
              type="button"
              className={`dio-filter-pill ${filterRecommended ? 'is-active' : ''}`}
              onClick={() => setFilterRecommended(v => !v)}
            >
              👑 {lang === 'ja' ? 'おすすめ' : 'Recommended'}
            </button>
            <button
              type="button"
              className={`dio-filter-pill ${filterSpicyOnly ? 'is-active' : ''}`}
              onClick={() => setFilterSpicyOnly(v => !v)}
            >
              🌶️ {lang === 'ja' ? 'スパイシー' : 'Spicy'}
            </button>
            <button
              type="button"
              className={`dio-filter-pill ${filterVegOnly ? 'is-active' : ''}`}
              onClick={() => setFilterVegOnly(v => !v)}
            >
              🌱 {lang === 'ja' ? 'ベジタリアン' : 'Veg'}
            </button>
          </div>

          {/* Food Grid */}
          <div className="dio-content-area">
            <div className="dio-section-title">
              <span>
                {activeTab === 'favorites'
                  ? `❤️ ${lang === 'ja' ? 'お気に入り料理' : 'Favorite Items'} (${filteredItems.length})`
                  : `${lang === 'ja' ? '料理一覧' : 'Menu Items'} (${filteredItems.length})`}
              </span>
              {onSwitchToTakeout && (
                <button
                  type="button"
                  onClick={onSwitchToTakeout}
                  style={{
                    fontSize: '0.75rem',
                    color: 'var(--dio-gray)',
                    background: 'none',
                    border: 'none',
                    cursor: 'pointer',
                    textDecoration: 'underline',
                  }}
                >
                  お持ち帰りに切り替え
                </button>
              )}
            </div>

            {filteredItems.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '48px 16px', color: 'var(--dio-gray)' }}>
                <p style={{ fontSize: '1.1rem', fontWeight: 700, margin: '0 0 6px' }}>
                  {activeTab === 'favorites'
                    ? 'お気に入りに登録された料理はありません'
                    : '該当する料理が見つかりませんでした'}
                </p>
                <p style={{ fontSize: '0.84rem' }}>
                  {activeTab === 'favorites'
                    ? 'メニューから❤️アイコンをタップしてお気に入りに追加できます'
                    : '検索キーワードやカテゴリを変更してお試しください'}
                </p>
              </div>
            ) : (
              <div className="dio-item-grid">
                {filteredItems.map(item => {
                  const isFaved = favorites.has(item.id);
                  const inTrayCount = tray
                    .filter(t => t.itemId === item.id)
                    .reduce((sum, t) => sum + t.quantity, 0);

                  return (
                    <div
                      key={item.id}
                      className="dio-card"
                      onClick={() => handleQuickAdd(item)}
                    >
                      <div className="dio-card-image-wrap">
                        {item.imageUrl ? (
                          <img
                            src={assetUrl(item.imageUrl)}
                            alt={item.nameJa || item.nameEn}
                            className="dio-card-image"
                            loading="lazy"
                          />
                        ) : (
                          <div style={{ width: '100%', height: '100%', display: 'grid', placeItems: 'center', background: '#fef3c7' }}>
                            <ChefHat size={36} color="#d97706" />
                          </div>
                        )}

                        <button
                          type="button"
                          className={`dio-fav-btn ${isFaved ? 'is-faved' : ''}`}
                          onClick={e => toggleFavorite(item.id, e)}
                          title="お気に入りに追加"
                        >
                          <Heart size={16} fill={isFaved ? '#ef4444' : 'none'} color={isFaved ? '#ef4444' : '#6b7280'} />
                        </button>

                        {(item.spiceLevel ?? 0) > 0 && (
                          <div className="dio-spice-badge">
                            <Flame size={12} color="#f97316" />
                            <span>Lv.{item.spiceLevel}</span>
                          </div>
                        )}
                      </div>

                      <div className="dio-card-body">
                        <h4 className="dio-card-title">{lang === 'ja' ? item.nameJa || item.nameEn : item.nameEn}</h4>
                        <p className="dio-card-sub">{lang === 'ja' ? item.nameEn : item.nameJa}</p>

                        <div className="dio-card-price-row">
                          <div className="dio-card-price">
                            {yen(item.price)}
                            <span className="dio-card-tax"> (税込)</span>
                          </div>

                          {inTrayCount > 0 ? (
                            <div className="dio-qty-pill" onClick={e => e.stopPropagation()}>
                              <button
                                type="button"
                                className="dio-qty-btn"
                                onClick={() => {
                                  const target = tray.find(t => t.itemId === item.id);
                                  if (target) updateTrayQty(target.id, -1);
                                }}
                              >
                                -
                              </button>
                              <span className="dio-qty-num">{inTrayCount}</span>
                              <button
                                type="button"
                                className="dio-qty-btn"
                                onClick={() => handleQuickAdd(item)}
                              >
                                +
                              </button>
                            </div>
                          ) : (
                            <button
                              type="button"
                              className="dio-add-btn"
                              onClick={e => handleQuickAdd(item, e)}
                            >
                              <Plus size={14} />
                              <span>追加</span>
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </main>
      )}

      {/* ── VIEW 2: CURRENT ORDER (TRAY) ── */}
      {activeTab === 'tray' && (
        <main className="dio-content-area">
          <div className="dio-section-title">
            <span>🛒 今回のご注文 (送信待ち: {trayCount}点)</span>
            <button
              type="button"
              onClick={() => setActiveTab('menu')}
              style={{ fontSize: '0.85rem', color: 'var(--dio-primary)', background: 'none', border: 'none', cursor: 'pointer', fontWeight: 700 }}
            >
              ＋ 料理を追加する
            </button>
          </div>

          {tray.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '60px 16px', background: '#fff', borderRadius: 16, border: '1px solid var(--dio-border)' }}>
              <ShoppingBag size={48} color="#d1d5db" style={{ margin: '0 auto 12px' }} />
              <p style={{ fontSize: '1.1rem', fontWeight: 800, margin: '0 0 6px' }}>ご注文トレイは空です</p>
              <p style={{ fontSize: '0.85rem', color: 'var(--dio-gray)', margin: '0 0 20px' }}>メニューからお好きな料理をお選びください</p>
              <button
                type="button"
                className="dio-bottom-btn"
                style={{ margin: '0 auto' }}
                onClick={() => setActiveTab('menu')}
              >
                メニューを見る
              </button>
            </div>
          ) : (
            <div className="dio-tray-container">
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingBottom: 10, borderBottom: '1px solid var(--dio-border)' }}>
                <span style={{ fontSize: '0.85rem', fontWeight: 700, color: 'var(--dio-gray)' }}>お席: テーブル {tableNumber} 番席</span>
                <button
                  type="button"
                  style={{ background: 'none', border: 'none', color: '#dc2626', fontSize: '0.78rem', cursor: 'pointer', fontWeight: 600 }}
                  onClick={() => {
                    if (window.confirm('トレイ内の商品をすべて削除しますか？')) setTray([]);
                  }}
                >
                  トレイを空にする
                </button>
              </div>

              {tray.map(item => (
                <div key={item.id} className="dio-tray-item">
                  <div className="dio-tray-info">
                    <div className="dio-tray-title">{item.nameJa}</div>
                    <div className="dio-tray-desc">
                      {item.spiceLevel !== undefined && (
                        <span style={{ marginRight: 6 }}>🌶️ {SPICE_LABELS[item.spiceLevel]?.ja}</span>
                      )}
                      {item.selectedOption && <span style={{ marginRight: 6 }}>· {item.selectedOption}</span>}
                      {item.note && <span style={{ color: 'var(--dio-primary)' }}>({item.note})</span>}
                    </div>
                  </div>

                  <div className="dio-qty-pill">
                    <button type="button" className="dio-qty-btn" onClick={() => updateTrayQty(item.id, -1)}>
                      -
                    </button>
                    <span className="dio-qty-num">{item.quantity}</span>
                    <button type="button" className="dio-qty-btn" onClick={() => updateTrayQty(item.id, 1)}>
                      +
                    </button>
                  </div>

                  <div className="dio-tray-price">
                    {yen((item.price + (item.optionPrice || 0)) * item.quantity)}
                  </div>
                </div>
              ))}

              <div className="dio-tray-total-box">
                <div className="dio-tray-row">
                  <span>料理小計</span>
                  <span>{yen(traySubtotal)}</span>
                </div>
                <div className="dio-tray-row">
                  <span>消費税 (店内10%)</span>
                  <span>{yen(trayTax)}</span>
                </div>
                <div className="dio-tray-row is-total">
                  <span>今回の送信合計</span>
                  <span style={{ color: 'var(--dio-primary)' }}>{yen(trayGrandTotal)}</span>
                </div>
              </div>

              <button
                type="button"
                className="dio-send-order-btn"
                disabled={submittingOrder}
                onClick={handleSendOrder}
              >
                <ChefHat size={20} />
                <span>{submittingOrder ? '厨房へ送信中…' : '厨房へ注文を送信する'}</span>
              </button>
              <p style={{ textAlign: 'center', fontSize: '0.75rem', color: 'var(--dio-gray)', marginTop: 8 }}>
                ※送信すると厨房で即座に調理が開始されます。お会計は食後にまとめて行います。
              </p>
            </div>
          )}
        </main>
      )}

      {/* ── VIEW 3: ORDER HISTORY & TABLE BILL (OLD ORDERS & MORE ORDER) ── */}
      {activeTab === 'history' && (
        <main className="dio-content-area">
          {/* Running Bill Box */}
          <div className="dio-running-bill-box">
            <div className="dio-bill-label">
              <span>🪑 テーブル {tableNumber} 番席 · 累計お会計金額</span>
              <span>注文済: {tableOrders.length} 回</span>
            </div>
            <div className="dio-bill-amount">{yen(tableGrandTotal)}</div>
            <div style={{ display: 'flex', gap: 16, fontSize: '0.82rem', color: '#9ca3af', marginBottom: 12 }}>
              <span>小計: {yen(tableSubtotal)}</span>
              <span>消費税(10%): {yen(tableTax)}</span>
            </div>

            <div className="dio-bill-actions">
              <button
                type="button"
                className="dio-btn-order-more"
                onClick={() => setActiveTab('menu')}
              >
                <Plus size={16} />
                <span>追加注文する</span>
              </button>

              <button
                type="button"
                className="dio-btn-checkout"
                onClick={() => setShowCheckoutModal(true)}
              >
                <Receipt size={16} />
                <span>お会計へ進む</span>
              </button>
            </div>
          </div>

          <div className="dio-section-title">
            <span>📜 お席のご注文履歴・配膳状況</span>
            <button
              type="button"
              onClick={loadTableOrders}
              style={{ fontSize: '0.78rem', color: 'var(--dio-primary)', background: 'none', border: 'none', cursor: 'pointer', fontWeight: 600 }}
            >
              🔄 最新状況に更新
            </button>
          </div>

          {tableOrders.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '48px 16px', background: '#fff', borderRadius: 16, border: '1px solid var(--dio-border)' }}>
              <History size={40} color="#d1d5db" style={{ margin: '0 auto 10px' }} />
              <p style={{ fontSize: '1rem', fontWeight: 700, margin: '0 0 6px' }}>まだ送信された注文はありません</p>
              <p style={{ fontSize: '0.82rem', color: 'var(--dio-gray)', margin: '0 0 16px' }}>
                メニューから料理を選んで「厨房へ送信」するとここに表示されます
              </p>
              <button
                type="button"
                className="dio-bottom-btn"
                style={{ margin: '0 auto' }}
                onClick={() => setActiveTab('menu')}
              >
                メニューを見る
              </button>
            </div>
          ) : (
            tableOrders.map((ord, idx) => {
              const statusClass =
                ord.status === 'COMPLETED'
                  ? 'status-completed'
                  : ord.status === 'READY'
                  ? 'status-ready'
                  : 'status-cooking';

              const statusText =
                ord.status === 'COMPLETED'
                  ? '配膳済み (お届け完了)'
                  : ord.status === 'READY'
                  ? 'まもなく配膳 (お届け準備中)'
                  : '調理中 (Cooking)';

              const timeStr = new Date(ord.createdAt).toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' });

              return (
                <div key={ord.token || idx} className="dio-history-card">
                  <div className="dio-history-header">
                    <div className="dio-round-title">
                      <span>第{tableOrders.length - idx}回 注文</span>
                      <span style={{ fontSize: '0.78rem', fontWeight: 500, color: 'var(--dio-gray)' }}>({timeStr})</span>
                    </div>

                    <div className={`dio-status-badge ${statusClass}`}>
                      {ord.status === 'COMPLETED' ? <CheckCircle2 size={13} /> : <ChefHat size={13} />}
                      <span>{statusText}</span>
                    </div>
                  </div>

                  {ord.items.map((it, itemIdx) => (
                    <div
                      key={itemIdx}
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        padding: '6px 0',
                        fontSize: '0.88rem',
                        borderBottom: itemIdx < ord.items.length - 1 ? '1px dashed #f3f4f6' : 'none',
                      }}
                    >
                      <div>
                        <span style={{ fontWeight: 700, color: 'var(--dio-dark)' }}>{it.nameJa || it.nameEn}</span>
                        <span style={{ color: 'var(--dio-gray)', marginLeft: 8 }}>× {it.quantity}</span>
                      </div>
                      <span style={{ fontWeight: 800, color: 'var(--dio-dark)' }}>{yen(it.lineTotal)}</span>
                    </div>
                  ))}

                  <div
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      marginTop: 8,
                      paddingTop: 8,
                      borderTop: '1px solid var(--dio-border)',
                      fontSize: '0.85rem',
                      fontWeight: 800,
                    }}
                  >
                    <span style={{ color: 'var(--dio-gray)' }}>この回の合計 (税込)</span>
                    <span style={{ color: 'var(--dio-primary)' }}>{yen(ord.grandTotal)}</span>
                  </div>
                </div>
              );
            })
          )}
        </main>
      )}

      {/* ── STICKY BOTTOM FLOATING BAR (when on menu or favorites and tray has items) ── */}
      {(activeTab === 'menu' || activeTab === 'favorites') && trayCount > 0 && (
        <aside className="dio-bottom-bar">
          <div className="dio-bottom-bar-inner">
            <div className="dio-bottom-summary">
              <span className="dio-bottom-count">{trayCount}品 を選択中</span>
              <span className="dio-bottom-total">{yen(trayGrandTotal)} <span style={{ fontSize: '0.75rem', fontWeight: 'normal', color: 'var(--dio-gray)' }}>(税込)</span></span>
            </div>

            <button
              type="button"
              className="dio-bottom-btn"
              onClick={() => setActiveTab('tray')}
            >
              <span>注文トレイを確認</span>
              <ChevronRight size={18} />
            </button>
          </div>
        </aside>
      )}

      {/* ── MODAL 1: ITEM CUSTOMIZATION SHEET (Spice, Naan/Rice, Notes) ── */}
      {customizingItem && (
        <div className="dio-modal-overlay" onClick={() => setCustomizingItem(null)}>
          <div className="dio-modal-sheet" onClick={e => e.stopPropagation()}>
            <div className="dio-modal-header">
              <h3 className="dio-modal-title">{customizingItem.nameJa || customizingItem.nameEn}</h3>
              <button type="button" className="dio-modal-close" onClick={() => setCustomizingItem(null)}>
                <X size={18} />
              </button>
            </div>

            <div className="dio-modal-body">
              {/* Spice Selection */}
              <div className="dio-option-group">
                <label className="dio-option-label">
                  <Flame size={16} color="#ea580c" />
                  <span>辛さを選択してください</span>
                </label>
                <div className="dio-option-grid">
                  {[0, 1, 2, 3, 4].map(lvl => (
                    <button
                      key={lvl}
                      type="button"
                      className={`dio-option-chip ${customSpice === lvl ? 'is-selected' : ''}`}
                      onClick={() => setCustomSpice(lvl)}
                    >
                      {SPICE_LABELS[lvl]?.ja}
                    </button>
                  ))}
                </div>
              </div>

              {/* Set Menu Bread/Rice choice */}
              {(customizingItem.nameJa || '').includes('セット') && (
                <div className="dio-option-group">
                  <label className="dio-option-label">
                    <UtensilsCrossed size={16} color="#ea580c" />
                    <span>ナンまたはライスを選択</span>
                  </label>
                  <div className="dio-option-grid" style={{ gridTemplateColumns: '1fr' }}>
                    {BREAD_OPTIONS.map(opt => (
                      <button
                        key={opt.id}
                        type="button"
                        className={`dio-option-chip ${customOption === opt.id ? 'is-selected' : ''}`}
                        onClick={() => setCustomOption(opt.id)}
                        style={{ textAlign: 'left', padding: '10px 14px' }}
                      >
                        {opt.nameJa}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Chef Note */}
              <div className="dio-option-group">
                <label className="dio-option-label">
                  <span>ご要望・備考 (任意)</span>
                </label>
                <input
                  type="text"
                  placeholder="例: パクチー抜き、氷少なめなど"
                  value={customNote}
                  onChange={e => setCustomNote(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '10px 14px',
                    border: '1.5px solid var(--dio-border)',
                    borderRadius: 12,
                    fontSize: '0.9rem',
                    outline: 'none',
                  }}
                />
              </div>

              {/* Quantity */}
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', margin: '20px 0 10px' }}>
                <span style={{ fontSize: '0.92rem', fontWeight: 800 }}>注文数量</span>
                <div className="dio-qty-pill">
                  <button type="button" className="dio-qty-btn" onClick={() => setCustomQty(q => Math.max(1, q - 1))}>
                    -
                  </button>
                  <span className="dio-qty-num">{customQty}</span>
                  <button type="button" className="dio-qty-btn" onClick={() => setCustomQty(q => q + 1)}>
                    +
                  </button>
                </div>
              </div>

              {/* Confirm Add */}
              <button
                type="button"
                className="dio-send-order-btn"
                style={{ marginTop: 12 }}
                onClick={() => {
                  const selectedBread = BREAD_OPTIONS.find(b => b.id === customOption);
                  const optionPrice = selectedBread?.price || 0;
                  addToTray({
                    id: `${customizingItem.id}_${Date.now()}`,
                    itemId: customizingItem.id,
                    nameJa: customizingItem.nameJa || customizingItem.nameEn,
                    nameEn: customizingItem.nameEn,
                    price: customizingItem.price,
                    quantity: customQty,
                    spiceLevel: customSpice,
                    selectedOption: selectedBread?.nameJa,
                    optionPrice,
                    note: customNote.trim() || undefined,
                    imageUrl: customizingItem.imageUrl,
                  });
                  toast.success(`${customizingItem.nameJa || customizingItem.nameEn} を追加しました`);
                  setCustomizingItem(null);
                }}
              >
                <span>注文トレイに追加 (計 {yen((customizingItem.price + (BREAD_OPTIONS.find(b => b.id === customOption)?.price || 0)) * customQty)})</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── MODAL 2: CALL STAFF MODAL ── */}
      {showCallStaffModal && (
        <div className="dio-modal-overlay" onClick={() => setShowCallStaffModal(false)}>
          <div className="dio-modal-sheet" onClick={e => e.stopPropagation()}>
            <div className="dio-modal-header">
              <h3 className="dio-modal-title">🔔 店員・スタッフをお呼び出し</h3>
              <button type="button" className="dio-modal-close" onClick={() => setShowCallStaffModal(false)}>
                <X size={18} />
              </button>
            </div>

            <div className="dio-modal-body">
              <p style={{ fontSize: '0.85rem', color: 'var(--dio-gray)', margin: '0 0 16px' }}>
                ご用の内容をお選びください。スタッフがすぐにお席へ伺います。
              </p>

              <div className="dio-call-card" onClick={() => handleCallStaff('WATER')}>
                <div className="dio-call-card-icon">💧</div>
                <div>
                  <div className="dio-call-card-text">お冷のおかわり</div>
                  <div className="dio-call-card-sub">お水・ピッチャーをお持ちします</div>
                </div>
              </div>

              <div className="dio-call-card" onClick={() => handleCallStaff('EXTRA')}>
                <div className="dio-call-card-icon">🥢</div>
                <div>
                  <div className="dio-call-card-text">取り皿・おしぼり・スプーン</div>
                  <div className="dio-call-card-sub">予備のカトラリーやお皿をお持ちします</div>
                </div>
              </div>

              <div className="dio-call-card" onClick={() => handleCallStaff('BILL')}>
                <div className="dio-call-card-icon">🧾</div>
                <div>
                  <div className="dio-call-card-text">お会計をお願いします</div>
                  <div className="dio-call-card-sub">伝票を準備し、レジにてご案内いたします</div>
                </div>
              </div>

              <div className="dio-call-card" onClick={() => handleCallStaff('CALL')}>
                <div className="dio-call-card-icon">🔔</div>
                <div>
                  <div className="dio-call-card-text">店員をお呼び出し</div>
                  <div className="dio-call-card-sub">ご注文や料理に関するご相談など</div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── MODAL 3: CHECKOUT / BILL MODAL ── */}
      {showCheckoutModal && (
        <div className="dio-modal-overlay" onClick={() => setShowCheckoutModal(false)}>
          <div className="dio-modal-sheet" onClick={e => e.stopPropagation()}>
            <div className="dio-modal-header">
              <h3 className="dio-modal-title">🧾 お会計手続き</h3>
              <button type="button" className="dio-modal-close" onClick={() => setShowCheckoutModal(false)}>
                <X size={18} />
              </button>
            </div>

            <div className="dio-modal-body">
              <div style={{ textAlign: 'center', padding: '16px 0', borderBottom: '1px solid var(--dio-border)', marginBottom: 16 }}>
                <span style={{ fontSize: '0.85rem', color: 'var(--dio-gray)' }}>テーブル {tableNumber} 番席 · 合計ご請求額</span>
                <div style={{ fontSize: '2.2rem', fontWeight: 900, color: 'var(--dio-primary)', margin: '4px 0' }}>
                  {yen(tableGrandTotal)}
                </div>
                <span style={{ fontSize: '0.75rem', color: 'var(--dio-gray)' }}>消費税10%込 · 注文数: {tableOrders.length}回</span>
              </div>

              <p style={{ fontSize: '0.88rem', fontWeight: 700, margin: '0 0 10px' }}>お支払い方法をお選びください：</p>

              <div
                className="dio-call-card"
                onClick={() => handleRequestBill('REGISTER')}
                style={{ border: '2px solid var(--dio-primary)', background: 'var(--dio-primary-light)' }}
              >
                <div className="dio-call-card-icon" style={{ background: '#ffedd5', color: 'var(--dio-primary)' }}>
                  🏪
                </div>
                <div>
                  <div className="dio-call-card-text">レジカウンターでお支払い</div>
                  <div className="dio-call-card-sub">現金、PayPay、クレジットカード、交通系ICをご利用いただけます</div>
                </div>
              </div>

              <div className="dio-call-card" onClick={() => handleRequestBill('ONLINE')}>
                <div className="dio-call-card-icon">💳</div>
                <div>
                  <div className="dio-call-card-text">オンライン決済 (カード / Square)</div>
                  <div className="dio-call-card-sub">スマートフォンからそのままお席で決済を完了します</div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── MODAL 4: EDIT TABLE NUMBER ── */}
      {showTableEditModal && (
        <div className="dio-modal-overlay" onClick={() => setShowTableEditModal(false)}>
          <div className="dio-modal-sheet" onClick={e => e.stopPropagation()}>
            <div className="dio-modal-header">
              <h3 className="dio-modal-title">🪑 テーブル番号の変更</h3>
              <button type="button" className="dio-modal-close" onClick={() => setShowTableEditModal(false)}>
                <X size={18} />
              </button>
            </div>

            <div className="dio-modal-body">
              <p style={{ fontSize: '0.85rem', color: 'var(--dio-gray)', margin: '0 0 12px' }}>
                お座りのテーブルに貼られている番号をご入力ください。
              </p>

              <input
                type="text"
                className="dio-search-input"
                style={{
                  width: '100%',
                  border: '1.5px solid var(--dio-border)',
                  borderRadius: 12,
                  padding: '12px 14px',
                  fontSize: '1.1rem',
                  fontWeight: 800,
                  marginBottom: 16,
                }}
                placeholder="例: 1 または カウンター2"
                value={newTableInput}
                onChange={e => setNewTableInput(e.target.value)}
              />

              <button
                type="button"
                className="dio-send-order-btn"
                onClick={() => {
                  if (!newTableInput.trim()) {
                    toast.error('テーブル番号を入力してください');
                    return;
                  }
                  setTableNumber(newTableInput.trim());
                  setShowTableEditModal(false);
                  toast.success(`テーブルを「${newTableInput.trim()}」に変更しました`);
                }}
              >
                テーブル番号を保存
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
