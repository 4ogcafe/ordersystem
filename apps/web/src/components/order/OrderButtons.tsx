import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'react-hot-toast';
import { Clock, ShoppingCart, X, Zap } from 'lucide-react';
import { DEFAULT_CARD_MAX_QUANTITY, MAX_QUANTITY, useCart, type CartLine, type CartLineOption } from '../../lib/cart-context';
import QuantitySelector from './QuantitySelector';
import { yen } from '../../lib/format';
import { useBodyScrollLock } from '../../lib/useBodyScrollLock';

export interface OrderTimeRestriction {
  allowed: boolean;
  badgeText: string;
  reason: string;
}

export interface OptionChoice {
  id: string;
  nameJa: string;
  nameEn: string;
  priceAdjust: number;
}

export interface OptionGroup {
  id: string;
  nameJa: string;
  nameEn: string;
  type: 'RADIO' | 'CHECKBOX';
  required: boolean;
  options: OptionChoice[];
  sortOrder?: number;
}

export interface OrderableItem {
  id: string;
  name: string;
  priceValue: number;
  img: string;
  soldOut: boolean;
  categoryId?: string;
  optionGroups?: OptionGroup[];
}

/** Checkout reads this from the navigation state to order one item without touching the cart. */
export interface BuyNowState {
  buyNow: CartLine;
}

export default function OrderButtons({ item, size = 'card', onAfterAdd, timeRestriction }: {
  item: OrderableItem;
  size?: 'card' | 'popup';
  onAfterAdd?: (item: OrderableItem) => void;
  timeRestriction?: OrderTimeRestriction;
}) {
  const cart = useCart();
  const navigate = useNavigate();
  const [draftQuantity, setDraftQuantity] = useState(1);
  const [customizing, setCustomizing] = useState(false);

  const hasGroups = (item.optionGroups?.length ?? 0) > 0;
  const inCart = hasGroups ? undefined : cart.lines.find(line => line.id === item.id);
  const quantity = inCart?.quantity ?? draftQuantity;
  const buttonClass = `order-btn${size === 'popup' ? ' order-btn-lg' : ''}`;
  const isTimeBlocked = Boolean(timeRestriction && !timeRestriction.allowed);

  if (item.soldOut) {
    return <div className={`order-actions order-sold-out${size === 'popup' ? ' is-popup' : ''}`}>売り切れ / Sold out</div>;
  }

  const notifyOutsideTime = () => {
    toast.error(timeRestriction?.reason || 'ただいま注文受付時間外です。受付時間内にご注文ください。', {
      id: 'order-time-restriction-toast',
      duration: 4800,
      icon: '⏰',
    });
  };

  const changeQuantity = (value: number) => {
    if (isTimeBlocked) {
      notifyOutsideTime();
      return;
    }
    if (inCart) cart.setQuantity(inCart.cartKey, value);
    else setDraftQuantity(value);
  };

  const openCustomize = () => {
    if (isTimeBlocked) {
      notifyOutsideTime();
      return;
    }
    setCustomizing(true);
  };

  const addToCart = () => {
    if (isTimeBlocked) {
      notifyOutsideTime();
      return;
    }
    if (hasGroups) {
      openCustomize();
      return;
    }
    const line = { id: item.id, name: item.name, price: item.priceValue, img: item.img };
    const added = inCart ? 1 : draftQuantity;
    cart.add(line, added);
    setDraftQuantity(1);
    toast.success(`${item.name}をカートに追加しました（カート内 ${Math.min((inCart?.quantity ?? 0) + added, MAX_QUANTITY)}点）`);
    onAfterAdd?.(item);
  };

  const orderNow = () => {
    if (isTimeBlocked) {
      notifyOutsideTime();
      return;
    }
    if (hasGroups) {
      openCustomize();
      return;
    }
    const line = { id: item.id, name: item.name, price: item.priceValue, img: item.img };
    const state: BuyNowState = { buyNow: { ...line, cartKey: item.id, quantity } };
    navigate('/order', { state });
  };

  const onCustomized = (options: CartLineOption[], qty: number, mode: 'cart' | 'order') => {
    setCustomizing(false);
    const priceAdj = options.reduce((s, o) => s + o.priceAdjust, 0);
    const line = { id: item.id, name: item.name, price: item.priceValue + priceAdj, img: item.img, options };
    const cartKey = item.id + (options.length
      ? '|' + [...options].sort((a, b) => a.groupId.localeCompare(b.groupId)).map(o => `${o.groupId}:${o.optionId}`).join(',')
      : '');
    if (mode === 'order') {
      const state: BuyNowState = { buyNow: { ...line, cartKey, quantity: qty } };
      navigate('/order', { state });
      return;
    }
    cart.add(line, qty);
    toast.success(`${item.name}をカートに追加しました`);
    onAfterAdd?.(item);
  };

  return (
    <>
      <div className={`order-actions${size === 'popup' ? ' is-popup' : ''}`} onClick={e => e.stopPropagation()}>
        {!hasGroups && (
          <div className="order-qty">
            <span>数量</span>
            <QuantitySelector value={quantity} max={DEFAULT_CARD_MAX_QUANTITY} onChange={changeQuantity} label={item.name} size={size === 'popup' ? 'md' : 'sm'} />
          </div>
        )}
        <div className="order-buttons">
          <button
            type="button"
            onClick={addToCart}
            disabled={!hasGroups && inCart?.quantity === MAX_QUANTITY}
            aria-label={inCart ? `${item.name}をもう1点カートに追加` : `${item.name}をカートに追加`}
            className={`${buttonClass} order-btn-outline`}
            style={isTimeBlocked ? { opacity: 0.72 } : undefined}
          >
            {isTimeBlocked ? <Clock size={16} aria-hidden="true" className="order-btn-icon" /> : <ShoppingCart size={17} aria-hidden="true" className="order-btn-icon" />}
            {isTimeBlocked ? '時間外（確認）' : hasGroups ? '選択して追加' : 'カートに追加'}
          </button>
          <button
            type="button"
            onClick={orderNow}
            aria-label={`Order Place: ${item.name}`}
            className={`${buttonClass} order-btn-solid`}
            style={isTimeBlocked ? { opacity: 0.78, backgroundColor: '#6b7280', borderColor: '#6b7280' } : undefined}
          >
            {isTimeBlocked ? <Clock size={16} aria-hidden="true" className="order-btn-icon" /> : <Zap size={17} aria-hidden="true" className="order-btn-icon" fill="currentColor" />}
            {isTimeBlocked ? '受付時間を見る' : 'Order Place'}
          </button>
        </div>
      </div>

      {customizing && (
        <CustomizeModal
          item={item}
          onConfirm={onCustomized}
          onClose={() => setCustomizing(false)}
        />
      )}
    </>
  );
}

export function CustomizeModal({ item, onConfirm, onClose }: {
  item: OrderableItem;
  onConfirm: (options: CartLineOption[], qty: number, mode: 'cart' | 'order') => void;
  onClose: () => void;
}) {
  useBodyScrollLock(true);
  const groups = [...(item.optionGroups ?? [])].sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0));
  // No auto-select — customer must pick every required group before Order / Order Place.
  const [selections, setSelections] = useState<Record<string, string[]>>(() =>
    Object.fromEntries(groups.map(g => [g.id, [] as string[]]))
  );
  const [qty, setQty] = useState(1);

  const toggle = (groupId: string, type: 'RADIO' | 'CHECKBOX', optionId: string) => {
    setSelections(prev => {
      if (type === 'RADIO') return { ...prev, [groupId]: [optionId] };
      const cur = prev[groupId] ?? [];
      return { ...prev, [groupId]: cur.includes(optionId) ? cur.filter(id => id !== optionId) : [...cur, optionId] };
    });
  };

  const requiredGroups = groups.filter(g => g.required);
  const missingRequired = requiredGroups.filter(g => (selections[g.id] ?? []).length === 0);
  const complete = missingRequired.length === 0;
  const pickedRequired = requiredGroups.length - missingRequired.length;

  const buildOptions = (): CartLineOption[] =>
    groups.flatMap(g =>
      (selections[g.id] ?? []).map(optId => {
        const opt = g.options.find(o => o.id === optId)!;
        return { groupId: g.id, groupName: g.nameJa, optionId: opt.id, optionName: opt.nameJa, priceAdjust: opt.priceAdjust };
      })
    );

  const priceAdj = buildOptions().reduce((s, o) => s + o.priceAdjust, 0);

  const tryConfirm = (mode: 'cart' | 'order') => {
    if (!complete) {
      toast.error(`「${missingRequired[0].nameJa}」を選んでください`, { id: 'missing-required', duration: 2500 });
      return;
    }
    onConfirm(buildOptions(), qty, mode);
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 1000,
        display: 'flex',
        alignItems: 'flex-end',
        justifyContent: 'center',
        background: 'rgba(0,0,0,0.45)',
        overscrollBehavior: 'none',
        touchAction: 'none',
      }}
      onClick={onClose}
    >
      <div
        style={{
          background: '#fff',
          borderRadius: '20px 20px 0 0',
          width: '100%',
          maxWidth: '540px',
          maxHeight: '90dvh',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
          touchAction: 'pan-y',
          overscrollBehavior: 'contain',
        }}
        onClick={e => e.stopPropagation()}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '18px 20px 12px', borderBottom: '1px solid #f0ebe3' }}>
          <div>
            <div style={{ fontWeight: 800, fontSize: '1.05rem', color: 'var(--dark-bark)' }}>{item.name}</div>
            <div style={{ fontSize: '0.82rem', color: 'var(--text-muted)', marginTop: '2px' }}>
              セット内容をお選びください
              {requiredGroups.length > 0 && (
                <span style={{ marginLeft: 8, fontWeight: 600, color: complete ? '#15803d' : '#b45309' }}>
                  （必須 {pickedRequired}/{requiredGroups.length}）
                </span>
              )}
            </div>
          </div>
          <button type="button" onClick={onClose} aria-label="閉じる" style={{ background: '#f5f5f3', border: 'none', borderRadius: '50%', width: 32, height: 32, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}>
            <X size={16} />
          </button>
        </div>

        <div style={{ overflowY: 'auto', flex: 1, padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: '20px' }}>
          {groups.map(group => {
            const groupMissing = group.required && (selections[group.id] ?? []).length === 0;
            return (
              <div key={group.id} style={groupMissing ? { outline: '1.5px solid #fecaca', borderRadius: 12, padding: 10, margin: '-10px', background: '#fffafa' } : undefined}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '10px' }}>
                  <span style={{ fontWeight: 700, fontSize: '0.92rem', color: 'var(--dark-bark)' }}>{group.nameJa}</span>
                  {group.nameEn && group.nameEn !== group.nameJa && (
                    <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>/ {group.nameEn}</span>
                  )}
                  {group.required && <span style={{ fontSize: '0.7rem', background: '#fef2f2', color: '#dc2626', border: '1px solid #fca5a5', borderRadius: '4px', padding: '1px 6px', fontWeight: 600 }}>必須</span>}
                  {!group.required && <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>任意</span>}
                  {group.type === 'CHECKBOX' && <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>（複数選択可）</span>}
                </div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                  {group.options.map(opt => {
                    const selected = (selections[group.id] ?? []).includes(opt.id);
                    return (
                      <button
                        key={opt.id}
                        type="button"
                        onClick={() => toggle(group.id, group.type, opt.id)}
                        style={{
                          padding: '8px 14px',
                          borderRadius: '9999px',
                          border: `1.5px solid ${selected ? 'var(--spice, #c0392b)' : '#e4ddd4'}`,
                          background: selected ? 'var(--spice, #c0392b)' : '#fff',
                          color: selected ? '#fff' : 'var(--dark-bark)',
                          fontWeight: selected ? 700 : 500,
                          fontSize: '0.85rem',
                          cursor: 'pointer',
                          transition: 'all 0.15s',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '4px',
                        }}
                      >
                        {opt.nameJa}
                        {opt.priceAdjust !== 0 && (
                          <span style={{ fontSize: '0.75rem', opacity: 0.85 }}>
                            {opt.priceAdjust > 0 ? '+' : ''}{yen(opt.priceAdjust)}
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })}

          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', paddingTop: '4px' }}>
            <span style={{ fontWeight: 700, fontSize: '0.92rem', color: 'var(--dark-bark)' }}>数量</span>
            <QuantitySelector value={qty} max={DEFAULT_CARD_MAX_QUANTITY} onChange={setQty} label={item.name} size="md" />
          </div>
        </div>

        <div style={{ padding: '14px 20px calc(14px + env(safe-area-inset-bottom))', borderTop: '1px solid #f0ebe3', display: 'flex', flexDirection: 'column', gap: 10 }}>
          {!complete && (
            <div style={{ fontSize: '0.8rem', color: '#b45309', fontWeight: 600 }}>
              必須項目をすべて選ぶと注文できます（残り: {missingRequired.map(g => g.nameJa).join('、')}）
            </div>
          )}
          <div className="customize-modal-footer-row">
            <div>
              <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>合計 ({qty}点)</div>
              <div style={{ fontWeight: 800, fontSize: '1.2rem', color: 'var(--spice, #c0392b)' }}>
                {yen((item.priceValue + priceAdj) * qty)}
              </div>
            </div>
            <div className="customize-modal-actions">
              <button
                type="button"
                disabled={!complete}
                onClick={() => tryConfirm('cart')}
                style={{
                  padding: '12px 14px',
                  borderRadius: '12px',
                  border: `1.5px solid ${complete ? 'var(--spice, #c0392b)' : '#d1d5db'}`,
                  background: '#fff',
                  color: complete ? 'var(--spice, #c0392b)' : '#9ca3af',
                  fontWeight: 700,
                  fontSize: '0.88rem',
                  cursor: complete ? 'pointer' : 'not-allowed',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  opacity: complete ? 1 : 0.65,
                }}
              >
                <ShoppingCart size={15} />
                Order
              </button>
              <button
                type="button"
                disabled={!complete}
                onClick={() => tryConfirm('order')}
                style={{
                  padding: '12px 16px',
                  borderRadius: '12px',
                  border: 'none',
                  background: complete ? 'var(--spice, #c0392b)' : '#d1d5db',
                  color: '#fff',
                  fontWeight: 700,
                  fontSize: '0.88rem',
                  cursor: complete ? 'pointer' : 'not-allowed',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                }}
              >
                <Zap size={15} fill="currentColor" />
                Order Place
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
