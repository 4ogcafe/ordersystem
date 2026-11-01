import { useEffect, useRef, useState, type KeyboardEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { MapPin, ShoppingBag, Store, Trash2, X } from 'lucide-react';
import { getPublic } from '../../lib/api';
import { MAX_QUANTITY, useCart } from '../../lib/cart-context';
import { yen } from '../../lib/format';
import { consumptionTax, taxRateOf } from '../../lib/price';
import { DEFAULT_STORE_LOCATIONS, fetchStores, getSavedOrderStoreId, saveOrderStoreId, type StoreLocation } from '../../lib/stores';
import { formatKm } from '../../lib/geo';
import { useNearestStore } from '../../lib/useNearestStore';
import QuantitySelector from './QuantitySelector';
import StoreLocator from './StoreLocator';

const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]), select, textarea, [tabindex]:not([tabindex="-1"])';

/** Slide-in cart. Traps focus while open, closes with Esc or the backdrop, and returns focus to where it was. */
export default function CartDrawer() {
  const cart = useCart();
  const navigate = useNavigate();
  const panel = useRef<HTMLDivElement>(null);
  const [taxRate, setTaxRate] = useState(taxRateOf(null));
  const [stores, setStores] = useState<StoreLocation[]>(DEFAULT_STORE_LOCATIONS);
  const [selectedStoreId, setSelectedStoreId] = useState<string>(() => getSavedOrderStoreId(DEFAULT_STORE_LOCATIONS));
  const [geoConfig, setGeoConfig] = useState({ enabled: true, maxKm: 10 });

  useEffect(() => {
    getPublic<any>('/api/v1/settings')
      .then(settings => {
        setTaxRate(taxRateOf(settings));
        if (settings) {
          setGeoConfig({
            enabled: settings.geolocationEnabled !== false,
            maxKm: typeof settings.geolocationMaxDistanceKm === 'number' ? settings.geolocationMaxDistanceKm : 10,
          });
        }
      })
      .catch(() => undefined);
    fetchStores().then(list => {
      if (list) {
        setStores(list);
        setSelectedStoreId(getSavedOrderStoreId(list));
      }
    });
  }, []);

  // Same nearest-store logic as the order page. Distances are shared between the two through
  // sessionStorage, so if the order page already located the visitor the list is sorted here too.
  const nearest = useNearestStore({
    stores,
    maxKm: geoConfig.maxKm,
    onSelect: store => {
      setSelectedStoreId(store.id);
      saveOrderStoreId(store.id, 'auto'); // fires adarsha:store-changed for the rest of the app
    },
  });

  useEffect(() => {
    const onStoreChanged = (e: Event) => {
      const detailId = (e as CustomEvent<{ storeId?: string }>).detail?.storeId;
      if (detailId) setSelectedStoreId(detailId);
    };
    window.addEventListener('adarsha:store-changed', onStoreChanged);
    return () => window.removeEventListener('adarsha:store-changed', onStoreChanged);
  }, []);

  useEffect(() => {
    if (!cart.isOpen) return;
    setSelectedStoreId(getSavedOrderStoreId(stores));
    const previous = document.activeElement as HTMLElement | null;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    panel.current?.querySelector<HTMLElement>(FOCUSABLE)?.focus();
    return () => {
      document.body.style.overflow = overflow;
      previous?.focus();
    };
  }, [cart.isOpen]);

  if (!cart.isOpen) return null;

  const selectedStore = stores.find(s => s.id === selectedStoreId) ?? stores[0] ?? DEFAULT_STORE_LOCATIONS[0];

  const onKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'Escape') {
      // Stop here so a menu popup underneath doesn't close too.
      e.stopPropagation();
      cart.closeCart();
      return;
    }
    if (e.key !== 'Tab' || !panel.current) return;
    const items = [...panel.current.querySelectorAll<HTMLElement>(FOCUSABLE)];
    if (items.length === 0) return;
    const first = items[0];
    const last = items[items.length - 1];
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  };

  const tax = consumptionTax(cart.total, taxRate);

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 2000 }} onKeyDown={onKeyDown}>
      <div onClick={cart.closeCart} style={{ position: 'absolute', inset: 0, backgroundColor: 'rgba(0,0,0,0.45)' }} aria-hidden="true" />
      <div
        ref={panel}
        role="dialog"
        aria-modal="true"
        aria-labelledby="cart-drawer-title"
        style={{ position: 'absolute', top: 0, right: 0, height: '100%', width: 'min(420px, 100%)', backgroundColor: 'white', display: 'flex', flexDirection: 'column', boxShadow: '-12px 0 32px rgba(0,0,0,0.15)' }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '18px 20px', borderBottom: '1px solid #f0ebe3' }}>
          <h2 id="cart-drawer-title" style={{ margin: 0, fontSize: '1.2rem', color: 'var(--dark-bark)' }}>カート{cart.count > 0 && `（${cart.count}点）`}</h2>
          <button type="button" onClick={cart.closeCart} aria-label="カートを閉じる" style={iconButton}><X size={22} aria-hidden="true" /></button>
        </div>

        {/* Dynamic Multi-Branch Selector inside Cart Drawer */}
        <div style={{ padding: '12px 20px', backgroundColor: '#fffaf4', borderBottom: '1px solid #f0ebe3' }}>
          <label htmlFor="cart-store-select" style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.78rem', fontWeight: 700, color: 'var(--spice)', marginBottom: '6px' }}>
            <Store size={14} /> ご注文・お受け取り店舗（全{stores.length}店舗）
          </label>
          <select
            id="cart-store-select"
            value={selectedStore.id}
            onChange={e => {
              setSelectedStoreId(e.target.value);
              saveOrderStoreId(e.target.value, 'manual');
            }}
            style={{
              width: '100%',
              padding: '8px 10px',
              borderRadius: '8px',
              border: '1px solid rgba(200,80,26,0.35)',
              backgroundColor: '#fff',
              fontSize: '0.88rem',
              fontWeight: 700,
              color: 'var(--dark-bark)',
              cursor: 'pointer',
            }}
          >
            {/* Nearest first (with distance) after a location lookup; normal order otherwise. */}
            {nearest.ranked.map(({ store: st, distanceKm }) => (
              <option key={st.id} value={st.id}>
                No.{st.number} Adarsha {st.name}
                {distanceKm !== null ? `（${formatKm(distanceKm)}）` : `（${st.hours}）`}
              </option>
            ))}
          </select>
          {geoConfig.enabled && (
            <div style={{ marginTop: '8px' }}>
              <StoreLocator
                compact
                idPrefix="cart-store-locator"
                busy={nearest.busy}
                message={nearest.message}
                tone={nearest.tone}
                onLocate={nearest.locate}
                onSearch={nearest.locateByAddress}
              />
            </div>
          )}
          <div style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '0.74rem', color: '#6b7280', marginTop: '5px' }}>
            <MapPin size={12} style={{ color: 'var(--spice)', flexShrink: 0 }} />
            <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{selectedStore.address}</span>
          </div>
        </div>

        {cart.lines.length === 0 ? (
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '16px', padding: '24px', textAlign: 'center', color: 'var(--text-muted)' }}>
            <ShoppingBag size={40} aria-hidden="true" style={{ color: 'var(--spice)' }} />
            <p style={{ margin: 0 }}>カートは空です</p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', width: '100%', maxWidth: '240px' }}>
              <Link to={`/order?store=${selectedStore.id}`} onClick={cart.closeCart} className="btn-warm" style={{ textDecoration: 'none', borderRadius: '10px' }}>
                {selectedStore.name}で注文・メニュー選択
              </Link>
              <Link to="/menu/takeout" onClick={cart.closeCart} style={{ fontSize: '0.85rem', color: 'var(--spice)', fontWeight: 600, textDecoration: 'none' }}>
                メニュー一覧を見る
              </Link>
            </div>
          </div>
        ) : (
          <>
            <ul style={{ listStyle: 'none', margin: 0, padding: '0 20px', overflowY: 'auto', flex: 1 }}>
              {cart.lines.map(line => (
                <li key={line.cartKey} style={{ display: 'flex', gap: '12px', padding: '16px 0', borderBottom: '1px solid #f0ebe3' }}>
                  <img
                    src={line.img || '/bg-hero-img.webp'}
                    alt=""
                    width={64}
                    height={64}
                    onError={(e) => {
                      const target = e.currentTarget;
                      if (!target.src.endsWith('/bg-hero-img.webp')) {
                        target.src = '/bg-hero-img.webp';
                      }
                    }}
                    style={{ borderRadius: '10px', objectFit: 'cover', flexShrink: 0 }}
                  />
                  <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: '8px' }}>
                      <div style={{ minWidth: 0 }}>
                        <div style={{ fontWeight: 'bold', color: 'var(--dark-bark)' }}>{line.name}</div>
                        <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>{yen(line.price)} / 点</div>
                        {line.options && line.options.length > 0 && (
                          <ul style={{ listStyle: 'none', margin: '4px 0 0', padding: 0, display: 'flex', flexDirection: 'column', gap: '2px' }}>
                            {line.options.map(o => (
                              <li key={o.optionId} style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                                {o.groupName}: {o.optionName}{o.priceAdjust !== 0 ? ` (${o.priceAdjust > 0 ? '+' : ''}${yen(o.priceAdjust)})` : ''}
                              </li>
                            ))}
                          </ul>
                        )}
                      </div>
                      <button type="button" onClick={() => cart.remove(line.cartKey)} aria-label={`${line.name}を削除`} style={iconButton}><Trash2 size={18} aria-hidden="true" /></button>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <QuantitySelector value={line.quantity} max={MAX_QUANTITY} onChange={value => cart.setQuantity(line.cartKey, value)} label={line.name} size="sm" />
                      <strong>{yen(line.price * line.quantity)}</strong>
                    </div>
                  </div>
                </li>
              ))}
            </ul>

            <div style={{ padding: '16px 20px calc(16px + env(safe-area-inset-bottom))', borderTop: '1px solid #f0ebe3', display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <Row label="ご注文店舗" value={`Adarsha ${selectedStore.name}`} />
              <Row label="小計" value={yen(cart.total)} />
              <Row label={`消費税 (${taxRate}%)`} value={yen(tax)} />
              <Row label="合計 (税込)" value={yen(cart.total + tax)} strong />
              <p style={{ margin: 0, fontSize: '0.75rem', color: 'var(--text-muted)' }}>特典・ポイントのご利用と最終金額は、注文手続きの画面で確定します。</p>
              <button
                type="button"
                className="btn-warm"
                onClick={() => {
                  cart.closeCart();
                  navigate(`/order?store=${selectedStore.id}`);
                }}
                style={{ borderRadius: '10px', padding: '14px', marginTop: '4px' }}
              >
                {selectedStore.name}で注文手続きへ進む
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function Row({ label, value, strong = false }: { label: string; value: string; strong?: boolean }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: strong ? 'bold' : 'normal', fontSize: strong ? '1.1rem' : '0.92rem', color: strong ? 'var(--spice)' : 'var(--dark-bark)' }}>
      <span>{label}</span><span>{value}</span>
    </div>
  );
}

const iconButton = { background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', padding: '4px', display: 'grid', placeItems: 'center' };
