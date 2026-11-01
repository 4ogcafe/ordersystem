import { useCallback, useEffect, useMemo, useState, type CSSProperties } from 'react';
import type { TabIntent } from './TopBar';
import { toast } from 'react-hot-toast';
import { apiFetch, errorMessage, getPublic } from '../../lib/api';
import { amountDue, formatOrderNumber, yen } from '../../lib/format';
import { Printer, ReceiptText, Store } from 'lucide-react';
import { DEFAULT_STORE_LOCATIONS, resolveOrderStore, type OrderStoreSnapshot, type StoreLocation } from '../../lib/stores';
import DeliverySettings from './DeliverySettings';
import OrderingSwitches from './OrderingSwitches';
import PickupSettings from './PickupSettings';
import TableOrderingSettings from './TableOrderingSettings';
import { alertText, type DietaryAlert } from './dietary';
import { printTicket } from '../kitchen/kitchen';
import { printCustomerReceipt } from '../../lib/receipt';
import { getStorePrinterConfig } from './PrinterSettings';

type Status = 'NEW' | 'CONFIRMED' | 'READY' | 'COMPLETED' | 'CANCELLED';

interface AdminOrder {
  id: string;
  number: number;
  status: Status;
  customerName: string;
  phone: string;
  email: string | null;
  note: string | null;
  pickupAt: string;
  store?: OrderStoreSnapshot | null;
  storeId?: string | null;
  storeName?: string | null;
  storeAddress?: string | null;
  storePhone?: string | null;
  items: { itemId: string; nameEn: string; nameJa: string | null; quantity: number; lineTotal: number; store?: OrderStoreSnapshot | null }[];
  total: number;
  taxRate?: number | null;
  tax?: number;
  grandTotal?: number;
  createdAt: string;
  customerId?: string | null;
  subtotal?: number;
  offer?: { titleJa: string; discount: number } | null;
  reward?: { titleJa: string; kind: 'AMOUNT_OFF' | 'PERK'; discount: number } | null;
  stampAwarded?: boolean;
  pointsUsed?: number;
  pointsDiscount?: number;
  pointsEarned?: number;
  dietaryAlert?: DietaryAlert | null;
  fulfillment?: 'PICKUP' | 'DELIVERY' | 'DINE_IN';
  deliveryFee?: number;
  deliveryAddress?: { postalCode: string; prefecture: string; city: string; line1: string; building?: string } | null;
}

const POLL_MS = 15_000;
const TIMEZONE = 'Asia/Tokyo';

const STATUS_STYLE: Record<Status, { label: string; color: string; background: string }> = {
  NEW: { label: 'New', color: '#b45309', background: '#fef3c7' },
  CONFIRMED: { label: 'Preparing', color: '#1d4ed8', background: '#dbeafe' },
  READY: { label: 'Ready', color: '#047857', background: '#d1fae5' },
  COMPLETED: { label: 'Picked up', color: '#4b5563', background: '#f3f4f6' },
  CANCELLED: { label: 'Cancelled', color: '#b91c1c', background: '#fee2e2' },
};

/** The one forward step staff take next for each active status; delivery and dine-in word the steps appropriately. */
const NEXT_ACTION: Record<'PICKUP' | 'DELIVERY' | 'DINE_IN', Partial<Record<Status, { status: Status; label: string }>>> = {
  PICKUP: {
    NEW: { status: 'CONFIRMED', label: 'Accept order (調理開始)' },
    CONFIRMED: { status: 'READY', label: 'Mark ready (お渡し準備完了)' },
    READY: { status: 'COMPLETED', label: 'Picked up (お渡し完了)' },
  },
  DELIVERY: {
    NEW: { status: 'CONFIRMED', label: 'Accept order (調理開始)' },
    CONFIRMED: { status: 'READY', label: 'Out for delivery (配達出発)' },
    READY: { status: 'COMPLETED', label: 'Delivered (配達完了)' },
  },
  DINE_IN: {
    NEW: { status: 'CONFIRMED', label: 'Accept order (調理開始)' },
    CONFIRMED: { status: 'READY', label: 'Serve to table (配膳完了)' },
    READY: { status: 'COMPLETED', label: 'Paid / Done (会計・退店完了)' },
  },
};

const statusText = (status: Status, fulfillment?: string) => {
  if (fulfillment === 'DELIVERY' && status === 'READY') return 'Out for delivery (配達中)';
  if (fulfillment === 'DELIVERY' && status === 'COMPLETED') return 'Delivered (配達完了)';
  if (fulfillment === 'DINE_IN' && status === 'CONFIRMED') return 'Cooking (調理中)';
  if (fulfillment === 'DINE_IN' && status === 'READY') return 'Served (配膳完了)';
  if (fulfillment === 'DINE_IN' && status === 'COMPLETED') return 'Completed (完了)';
  return STATUS_STYLE[status]?.label ?? status;
};

const pickupLabel = (iso: string) =>
  new Date(iso).toLocaleString('ja-JP', { timeZone: TIMEZONE, month: 'numeric', day: 'numeric', weekday: 'short', hour: '2-digit', minute: '2-digit' });

export default function OrdersTab({ isAdmin, intent: _intent }: { isAdmin: boolean; intent?: TabIntent | null }) {
  const [scope, setScope] = useState<'active' | 'history'>('active');
  const [storeFilter, setStoreFilter] = useState<string>('ALL');
  const [stores, setStores] = useState<StoreLocation[]>(DEFAULT_STORE_LOCATIONS);
  // Bumped when hours are saved below, so the on/off switches re-read them.
  const [settingsVersion, setSettingsVersion] = useState(0);
  const [orders, setOrders] = useState<AdminOrder[] | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  useEffect(() => {
    getPublic<{ stores?: StoreLocation[] }>('/api/v1/stores')
      .then(res => {
        if (Array.isArray(res?.stores) && res.stores.length > 0) setStores(res.stores);
      })
      .catch(() => {});
  }, []);

  const load = useCallback(() => {
    apiFetch(`/api/v1/orders?scope=${scope}`)
      .then(res => (res.ok ? res.json() : Promise.reject(new Error(`Orders failed with ${res.status}`))))
      .then((data: AdminOrder[]) => setOrders(data))
      .catch(console.error);
  }, [scope]);

  useEffect(() => {
    load();
    const intervalId = setInterval(load, POLL_MS);
    return () => clearInterval(intervalId);
  }, [load]);

  const changeStatus = async (order: AdminOrder, status: Status) => {
    if (status === 'CANCELLED' && !window.confirm(`Cancel order ${formatOrderNumber(order.number)} for ${order.customerName}? Call the customer to let them know.`)) return;
    setBusyId(order.id);
    try {
      const res = await apiFetch(`/api/v1/orders/${order.id}/status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status }),
      });
      if (!res.ok) toast.error(await errorMessage(res, 'Could not update the order.'));
      else {
        const { stamp } = await res.json();
        if (stamp?.status === 'AWARDED') {
          toast.success(`Stamp ${stamp.position}/${stamp.perCard} given to ${order.customerName}.`);
          for (const reward of stamp.rewards) toast.success(`🎁 ${order.customerName} earned: ${reward.titleJa}`, { duration: 6000 });
        }
      }
      load();
    } catch {
      toast.error('Network error while updating the order.');
    } finally {
      setBusyId(null);
    }
  };

  const filteredOrders = useMemo(() => {
    if (!orders) return null;
    if (storeFilter === 'ALL') return orders;
    return orders.filter(order => {
      const resolved = resolveOrderStore(order, stores);
      return resolved?.id === storeFilter;
    });
  }, [orders, storeFilter, stores]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
      {isAdmin && <OrderingSwitches key={settingsVersion} />}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', gap: '8px' }}>
          {(['active', 'history'] as const).map(value => (
            <button key={value} type="button" onClick={() => { setOrders(null); setScope(value); }} style={{ ...pillStyle, backgroundColor: scope === value ? '#000' : '#fff', color: scope === value ? '#fff' : '#374151' }}>
              {value === 'active' ? 'Active orders' : 'History'}
            </button>
          ))}
        </div>

        {/* Dynamic Multi-Branch Filter */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', fontSize: '0.84rem', fontWeight: 700, color: '#374151' }}>
            <Store size={15} /> 店舗フィルター:
          </span>
          <select
            value={storeFilter}
            onChange={e => setStoreFilter(e.target.value)}
            style={{
              padding: '7px 12px',
              borderRadius: '9999px',
              border: '1px solid #d1d5db',
              backgroundColor: '#fff',
              fontWeight: 600,
              fontSize: '0.86rem',
              cursor: 'pointer',
            }}
          >
            <option value="ALL">すべての店舗（全{stores.length}店舗）</option>
            {stores.map(st => (
              <option key={st.id} value={st.id}>
                No.{st.number} Adarsha {st.name}
              </option>
            ))}
          </select>
        </div>
      </div>

      {!filteredOrders ? (
        <div style={{ padding: '40px', textAlign: 'center' }}>Loading orders…</div>
      ) : filteredOrders.length === 0 ? (
        <div style={{ ...panelStyle, textAlign: 'center', color: '#6b7280' }}>
          {scope === 'active' ? 'No open pickup orders for the selected branch. New orders appear here automatically.' : 'No completed or cancelled orders yet.'}
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(min(100%, 320px), 1fr))', gap: '1rem' }}>
          {filteredOrders.map(order => {
            const badge = STATUS_STYLE[order.status] ?? STATUS_STYLE.NEW;
            const isDelivery = order.fulfillment === 'DELIVERY';
            const isDineIn = order.fulfillment === 'DINE_IN';
            const type = (order.fulfillment ?? 'PICKUP') as 'PICKUP' | 'DELIVERY' | 'DINE_IN';
            const next = NEXT_ACTION[type]?.[order.status];
            const address = order.deliveryAddress;
            const addressText = address ? [`〒${address.postalCode}`, address.prefecture, address.city, address.line1, address.building].filter(Boolean).join(' ') : '';
            const resolvedBranch = resolveOrderStore(order, stores);
            return (
              <article key={order.id} style={{ ...panelStyle, borderLeft: `4px solid ${badge.color}` }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '8px' }}>
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                      <div style={{ fontSize: '1.5rem', fontWeight: 700 }}>No. {formatOrderNumber(order.number)}</div>
                      {resolvedBranch && (
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', padding: '3px 9px', borderRadius: '9999px', backgroundColor: '#ffedd5', color: '#9a3412', fontSize: '0.76rem', fontWeight: 700 }}>
                          🏪 No.{resolvedBranch.number} {resolvedBranch.name}
                        </span>
                      )}
                    </div>
                    <div style={{ fontWeight: 600, color: '#111827' }}>
                      <span className={`fulfill-badge${isDelivery ? ' is-delivery' : ''}`}>
                        {isDelivery ? '🛵 Delivery' : isDineIn ? '🍽️ Dine-in (店内)' : '🛍 Pickup'}
                      </span> {pickupLabel(order.pickupAt)}
                    </div>
                    {isDineIn && (
                      <div style={{ marginTop: '4px', fontSize: '0.85rem', fontWeight: 700, color: '#047857' }}>
                        🪑 テーブル: {order.note?.match(/\[テーブル[:\s]*([^\]]+)\]/)?.[1] || (order as any).tableNumber || '指定なし'}
                      </div>
                    )}
                  </div>
                  <span style={{ padding: '4px 10px', borderRadius: '9999px', fontSize: '0.8rem', fontWeight: 600, color: badge.color, backgroundColor: badge.background }}>{statusText(order.status, type)}</span>
                </div>

                <div style={{ marginTop: '12px', fontSize: '0.9rem', color: '#374151' }}>
                  <div>
                    {order.customerName}
                    {order.customerId && <span style={{ marginLeft: '8px', padding: '2px 8px', borderRadius: '9999px', backgroundColor: '#ede9fe', color: '#6d28d9', fontSize: '0.75rem', fontWeight: 600 }}>Member</span>}
                  </div>
                  {order.phone && <a href={`tel:${order.phone}`} style={{ color: '#1d4ed8' }}>{order.phone}</a>}
                  {order.email && <div style={{ color: '#6b7280' }}>{order.email}</div>}
                  {address && (
                    <div style={{ marginTop: '8px', padding: '8px 10px', borderRadius: '8px', backgroundColor: '#eff6ff', color: '#1e3a8a' }}>
                      📍 {addressText}{' '}
                      <a href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(addressText)}`} target="_blank" rel="noopener noreferrer" style={{ color: '#1d4ed8', fontWeight: 600, whiteSpace: 'nowrap' }}>Open map ↗</a>
                    </div>
                  )}
                </div>

                <ul style={{ listStyle: 'none', padding: 0, margin: '12px 0', borderTop: '1px solid #e5e7eb' }}>
                  {order.items.map(line => (
                    <li key={line.itemId} style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderBottom: '1px solid #f3f4f6', fontSize: '0.9rem' }}>
                      <span><strong>{line.quantity} ×</strong> {line.nameJa || line.nameEn}</span>
                      <span>{yen(line.lineTotal)}</span>
                    </li>
                  ))}
                </ul>
                {order.offer && order.offer.discount > 0 && (
                  <div style={discountStyle}><span>Offer: {order.offer.titleJa}</span><span>−{yen(order.offer.discount)}</span></div>
                )}
                {order.reward && (
                  <div style={order.reward.kind === 'PERK' ? perkStyle : discountStyle}>
                    <span>🎁 Stamp reward: {order.reward.titleJa}</span>
                    <span>{order.reward.discount > 0 ? `−${yen(order.reward.discount)}` : 'Give with order'}</span>
                  </div>
                )}
                {(order.pointsDiscount ?? 0) > 0 && (
                  <div style={discountStyle}><span>Points used ({order.pointsUsed}pt)</span><span>−{yen(order.pointsDiscount ?? 0)}</span></div>
                )}
                {(order.deliveryFee ?? 0) > 0 && (
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.9rem', marginBottom: '4px' }}><span>Delivery fee (incl. tax)</span><span>{yen(order.deliveryFee ?? 0)}</span></div>
                )}
                <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 700 }}>
                  <span>To collect ({amountDue(order).taxIncluded ? `incl. ${order.taxRate}% tax ${yen(order.tax ?? 0)}` : 'excl. tax'})</span>
                  <span>{yen(amountDue(order).amount)}</span>
                </div>
                {order.stampAwarded && <div style={{ marginTop: '6px', fontSize: '0.8rem', color: '#b3261e', fontWeight: 600 }}>Stamp given</div>}

                {order.dietaryAlert && (
                  <div role="note" style={{ marginTop: '12px', padding: '8px 12px', backgroundColor: '#fef2f2', border: '1px solid #fecaca', borderRadius: '8px', fontSize: '0.88rem', color: '#b91c1c', fontWeight: 600 }}>
                    ⚠ {alertText(order.dietaryAlert)}
                  </div>
                )}
                {order.note && (
                  <div style={{ marginTop: '12px', padding: '8px 12px', backgroundColor: '#fffbeb', borderRadius: '8px', fontSize: '0.9rem', whiteSpace: 'pre-wrap' }}>
                    📝 {order.note}
                  </div>
                )}

                <div style={{ display: 'flex', gap: '8px', marginTop: '16px', flexWrap: 'wrap' }}>
                  {next && (
                    <button type="button" disabled={busyId === order.id} onClick={() => changeStatus(order, next.status)} style={{ ...actionStyle, flex: 1, backgroundColor: '#000', color: '#fff', border: 'none' }}>
                      {next.label}
                    </button>
                  )}
                  {order.status === 'READY' && (
                    <button
                      type="button"
                      disabled={busyId === order.id}
                      onClick={() => changeStatus(order, 'CONFIRMED')}
                      title="調理中に戻す"
                      style={{ ...actionStyle, backgroundColor: '#fef3c7', color: '#92400e', border: '1px solid #fde68a' }}
                    >
                      調理中に戻す
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => {
                      const branch = resolveOrderStore(order, stores);
                      const storeCfg = getStorePrinterConfig(branch?.id);
                      printCustomerReceipt(order as any, storeCfg);
                      toast.success(`領収書 No. ${formatOrderNumber(order.number)} を印刷しました`);
                    }}
                    title="領収書・お控えを印刷"
                    style={{ ...actionStyle, backgroundColor: '#eff6ff', color: '#1d4ed8', border: '1px solid #bfdbfe', display: 'inline-flex', alignItems: 'center', gap: '5px' }}
                  >
                    <ReceiptText size={16} />
                    <span>領収書</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      const branch = resolveOrderStore(order, stores);
                      const storeCfg = getStorePrinterConfig(branch?.id);
                      printTicket(order, order.dietaryAlert ? alertText(order.dietaryAlert) : null, storeCfg);
                      toast.success(`調理伝票 No. ${formatOrderNumber(order.number)} を印刷しました`);
                    }}
                    title="調理伝票を印刷"
                    style={{ ...actionStyle, backgroundColor: '#f9fafb', color: '#111827', border: '1px solid #d1d5db', display: 'inline-flex', alignItems: 'center', gap: '5px' }}
                  >
                    <Printer size={16} />
                    <span>調理伝票</span>
                  </button>
                  {order.status !== 'COMPLETED' && order.status !== 'CANCELLED' && (
                    <button type="button" disabled={busyId === order.id} onClick={() => changeStatus(order, 'CANCELLED')} style={{ ...actionStyle, backgroundColor: '#fff', color: '#b91c1c', border: '1px solid #fca5a5' }}>
                      Cancel
                    </button>
                  )}
                </div>
              </article>
            );
          })}
        </div>
      )}

      {isAdmin && <PickupSettings onSaved={() => setSettingsVersion(v => v + 1)} />}
      {isAdmin && <DeliverySettings onSaved={() => setSettingsVersion(v => v + 1)} />}
      {isAdmin && <TableOrderingSettings onSaved={() => setSettingsVersion(v => v + 1)} />}
    </div>
  );
}

const panelStyle: CSSProperties = { backgroundColor: '#fff', borderRadius: '12px', boxShadow: '0 1px 3px rgba(0,0,0,0.05)', border: '1px solid #e5e7eb', padding: '1.25rem' };
const pillStyle: CSSProperties = { padding: '0.5rem 1rem', borderRadius: '9999px', border: '1px solid #e5e7eb', fontWeight: 500, cursor: 'pointer' };
const actionStyle: CSSProperties = { padding: '0.65rem 1rem', borderRadius: '8px', fontWeight: 600, cursor: 'pointer' };
const discountStyle: CSSProperties = { display: 'flex', justifyContent: 'space-between', color: '#047857', fontSize: '0.9rem', marginBottom: '4px' };
const perkStyle: CSSProperties = { display: 'flex', justifyContent: 'space-between', gap: '8px', color: '#92400e', backgroundColor: '#fef3c7', padding: '6px 8px', borderRadius: '6px', fontSize: '0.9rem', fontWeight: 600, marginBottom: '4px' };
