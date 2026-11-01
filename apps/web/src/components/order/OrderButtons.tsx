import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'react-hot-toast';
import { Clock, ShoppingCart, X, Zap } from 'lucide-react';
import { DEFAULT_CARD_MAX_QUANTITY, MAX_QUANTITY, useCart, type CartLine, type CartLineOption } from '../../lib/cart-context';
import QuantitySelector from './QuantitySelector';
import { yen } from '../../lib/format';

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
  const [buyNowPending, setBuyNowPending] = useState(false);

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

  const addToCart = () => {
    if (isTimeBlocked) {
      notifyOutsideTime();
      return;
    }
    if (hasGroups) { setCustomizing(true); setBuyNowPending(false); return; }
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
    if (hasGroups) { setCustomizing(true); setBuyNowPending(true); return; }
    const line = { id: item.id, name: item.name, price: item.priceValue, img: item.img };
    const state: BuyNowState = { buyNow: { ...line, cartKey: item.id, quantity } };
    navigate('/order', { state });
  };

  const onCustomized = (options: CartLineOption[], qty: number) => {
    setCustomizing(false);
    const priceAdj = options.reduce((s, o) => s + o.priceAdjust, 0);
    const line = { id: item.id, name: item.name, price: item.priceValue + priceAdj, img: item.img, options };
    if (buyNowPending) {
      const cartKey = item.id + (options.length ? '|' + [...options].sort((a, b) => a.groupId.localeCompare(b.groupId)).map(o => `${o.groupId}:${o.optionId}`).join(',') : '');
      const state: BuyNowState = { buyNow: { ...line, cartKey, quantity: qty } };
      navigate('/order', { state });
    } else {
      cart.add(line, qty);
      toast.success(`${item.name}をカートに追加しました`);
      onAfterAdd?.(item);
    }
    setBuyNowPending(false);
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
            {isTimeBlocked ? '時間外（確認）' : hasGroups ? 'カスタマイズして追加' : 'カートに追加'}
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
          onClose={() => { setCustomizing(false); setBuyNowPending(false); }}
        />
      )}
    </>
  );
}

function CustomizeModal({ item, onConfirm, onClose }: {
  item: OrderableItem;
  onConfirm: (options: CartLineOption[], qty: number) => void;
  onClose: () => void;
}) {
  const groups = item.optionGroups ?? [];
  const [selections, setSelections] = useState<Record<string, string[]>>(() =>
    Object.fromEntries(groups.map(g => [g.id, g.type === 'RADIO' && g.options.length > 0 ? [g.options[0].id] : []]))
  );
  const [qty, setQty] = useState(1);

  const toggle = (groupId: string, type: 'RADIO' | 'CHECKBOX', optionId: string) => {
    setSelections(prev => {
      if (type === 'RADIO') return { ...prev, [groupId]: [optionId] };
      const cur = prev[groupId] ?? [];
      return { ...prev, [groupId]: cur.includes(optionId) ? cur.filter(id => id !== optionId) : [...cur, optionId] };
    });
  };

  const missingRequired = groups.filter(g => g.required && (selections[g.id] ?? []).length === 0);

  const buildOptions = (): CartLineOption[] =>
    groups.flatMap(g =>
      (selections[g.id] ?? []).map(optId => {
        const opt = g.options.find(o => o.id === optId)!;
        return { groupId: g.id, groupName: g.nameJa, optionId: opt.id, optionName: opt.nameJa, priceAdjust: opt.priceAdjust };
      })
    );

  const priceAdj = buildOptions().reduce((s, o) => s + o.priceAdjust, 0);

  return (
    <div
      style={{ position: 'fixed', inset: 0, zIndex: 1000, display: 'flex', alignItems: 'flex-end', justifyContent: 'center', background: 'rgba(0,0,0,0.45)' }}
      onClick={onClose}
    >
      <div
        style={{ background: '#fff', borderRadius: '20px 20px 0 0', width: '100%', maxWidth: '540px', maxHeight: '90dvh', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '18px 20px 12px', borderBottom: '1px solid #f0ebe3' }}>
          <div>
            <div style={{ fontWeight: 800, fontSize: '1.05rem', color: 'var(--dark-bark)' }}>{item.name}</div>
            <div style={{ fontSize: '0.82rem', color: 'var(--text-muted)', marginTop: '2px' }}>セット内容をお選びください</div>
          </div>
          <button onClick={onClose} style={{ background: '#f5f5f3', border: 'none', borderRadius: '50%', width: 32, height: 32, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}>
            <X size={16} />
          </button>
        </div>

        {/* Groups */}
        <div style={{ overflowY: 'auto', flex: 1, padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: '20px' }}>
          {groups.map(group => (
            <div key={group.id}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '10px' }}>
                <span style={{ fontWeight: 700, fontSize: '0.92rem', color: 'var(--dark-bark)' }}>{group.nameJa}</span>
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
          ))}

          {/* Quantity */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', paddingTop: '4px' }}>
            <span style={{ fontWeight: 700, fontSize: '0.92rem', color: 'var(--dark-bark)' }}>数量</span>
            <QuantitySelector value={qty} max={DEFAULT_CARD_MAX_QUANTITY} onChange={setQty} label={item.name} size="md" />
          </div>
        </div>

        {/* Footer */}
        <div style={{ padding: '14px 20px calc(14px + env(safe-area-inset-bottom))', borderTop: '1px solid #f0ebe3', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px' }}>
          <div>
            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>合計 (1点)</div>
            <div style={{ fontWeight: 800, fontSize: '1.2rem', color: 'var(--spice, #c0392b)' }}>
              {yen(item.priceValue + priceAdj)}
            </div>
          </div>
          <button
            type="button"
            onClick={() => {
              if (missingRequired.length > 0) {
                toast.error(`「${missingRequired[0].nameJa}」を選んでください`, { id: 'missing-required', duration: 2500 });
                return;
              }
              onConfirm(buildOptions(), qty);
            }}
            style={{
              flex: 1,
              maxWidth: '220px',
              padding: '13px 20px',
              borderRadius: '12px',
              border: 'none',
              background: missingRequired.length > 0 ? '#d1d5db' : 'var(--spice, #c0392b)',
              color: '#fff',
              fontWeight: 700,
              fontSize: '0.95rem',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '6px',
            }}
          >
            <ShoppingCart size={16} />
            カートに追加
          </button>
        </div>
      </div>
    </div>
  );
}
