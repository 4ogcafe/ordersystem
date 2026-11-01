import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { toast } from 'react-hot-toast';
import { assetUrl, getPublic } from '../../lib/api';
import { useCart } from '../../lib/cart-context';
import { fulfillmentLabel, statusLabel, timeWord } from '../order/fulfillment';
import { amountDue, formatDateTime, formatOrderNumber, isActiveOrder, yen } from '../../lib/format';
import { resolveOrderStore, saveOrderStoreId } from '../../lib/stores';
import { cardStyle, mutedStyle } from './styles';
import type { MemberOrder } from './types';

const STATUS_COLORS: Record<string, { color: string; background: string }> = {
  NEW: { color: '#b45309', background: '#fef3c7' },
  CONFIRMED: { color: '#1d4ed8', background: '#dbeafe' },
  READY: { color: '#047857', background: '#d1fae5' },
  COMPLETED: { color: '#4b5563', background: '#f3f4f6' },
  CANCELLED: { color: '#b91c1c', background: '#fee2e2' },
};

interface MenuItem {
  id: string;
  nameEn: string;
  nameJa: string | null;
  price: number;
  imageUrl: string | null;
  isSoldOut?: boolean;
  isActive?: boolean;
}

const FALLBACK_IMAGE = 'https://images.unsplash.com/photo-1589302168068-964664d93dc0?auto=format&fit=crop&w=800&q=80';

export default function OrderCard({ order }: { order: MemberOrder }) {
  const cart = useCart();
  const navigate = useNavigate();
  const [reordering, setReordering] = useState(false);
  const badge = STATUS_COLORS[order.status] ?? STATUS_COLORS.COMPLETED;
  const resolvedBranch = resolveOrderStore(order);

  /** Uses today's menu, so prices are current and sold-out or removed items are skipped. */
  const reorder = async () => {
    setReordering(true);
    try {
      const menu = await getPublic<MenuItem[]>('/api/v1/menu/items');
      const byId = new Map(menu.map(item => [item.id, item]));
      const skipped: string[] = [];
      for (const line of order.items) {
        const item = byId.get(line.itemId);
        if (!item || item.isSoldOut || item.isActive === false) {
          skipped.push(line.nameJa || line.nameEn);
          continue;
        }
        cart.add({ id: item.id, name: item.nameJa || item.nameEn, price: item.price, img: assetUrl(item.imageUrl) || FALLBACK_IMAGE });
        cart.setQuantity(item.id, line.quantity);
      }
      if (skipped.length === order.items.length) {
        toast.error('この注文の商品は現在ご注文いただけません。');
        return;
      }
      if (skipped.length > 0) toast(`現在ご注文いただけない商品を除きました：${skipped.join('、')}`, { icon: 'ℹ️', duration: 6000 });
      if (resolvedBranch?.id) {
        saveOrderStoreId(resolvedBranch.id);
        navigate(`/order?store=${resolvedBranch.id}`);
      } else {
        navigate('/order');
      }
    } catch {
      toast.error('メニューを読み込めませんでした。もう一度お試しください。');
    } finally {
      setReordering(false);
    }
  };

  return (
    <article style={{ ...cardStyle, padding: '20px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '8px', flexWrap: 'wrap' }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
            <span style={{ fontWeight: 'bold', color: 'var(--dark-bark)', fontSize: '1.1rem' }}>受付番号 {formatOrderNumber(order.number)}</span>
            {resolvedBranch && (
              <span style={{ fontSize: '0.76rem', fontWeight: 700, color: '#9a3412', backgroundColor: '#ffedd5', padding: '2px 8px', borderRadius: '999px' }}>
                🏪 Adarsha {resolvedBranch.name}
              </span>
            )}
          </div>
          <div style={mutedStyle}>{fulfillmentLabel(order.fulfillment)} ・ {timeWord(order.fulfillment)} {formatDateTime(order.pickupAt)}</div>
        </div>
        <span style={{ padding: '4px 12px', borderRadius: '9999px', fontSize: '0.8rem', fontWeight: 'bold', color: badge.color, backgroundColor: badge.background }}>
          {statusLabel(order.status, order.fulfillment)}
        </span>
      </div>

      <ul style={{ listStyle: 'none', padding: 0, margin: '12px 0', fontSize: '0.9rem' }}>
        {order.items.map(line => (
          <li key={line.itemId} style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0' }}>
            <span>{line.nameJa || line.nameEn} × {line.quantity}</span>
            <span>{yen(line.lineTotal)}</span>
          </li>
        ))}
      </ul>

      {(order.offerDiscount > 0 || order.pointsDiscount > 0 || order.rewardTitle) && (
        <div style={{ ...mutedStyle, borderTop: '1px dashed #eee', paddingTop: '8px' }}>
          {order.offerDiscount > 0 && <div>特典「{order.offerTitle}」 −{yen(order.offerDiscount)}</div>}
          {order.rewardTitle && <div>スタンプ特典「{order.rewardTitle}」{order.rewardDiscount > 0 ? ` −${yen(order.rewardDiscount)}` : ''}</div>}
          {order.pointsDiscount > 0 && <div>ポイント利用 {order.pointsUsed}pt −{yen(order.pointsDiscount)}</div>}
        </div>
      )}

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '8px', gap: '8px', flexWrap: 'wrap' }}>
        <div>
          <strong style={{ color: 'var(--spice)', fontSize: '1.1rem' }}>{yen(amountDue(order).amount)}</strong> <span style={mutedStyle}>({amountDue(order).taxIncluded ? `税込・消費税${yen(order.tax)}` : '税込'})</span>
          {order.pointsEarned > 0 && <span style={{ marginLeft: '8px', fontSize: '0.8rem', color: '#047857', fontWeight: 'bold' }}>+{order.pointsEarned}pt 獲得</span>}
          {order.stampAwarded && <span style={{ marginLeft: '8px', fontSize: '0.8rem', color: '#b3261e', fontWeight: 'bold' }}>スタンプ +1</span>}
        </div>
        <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
          {isActiveOrder(order.status) && <Link to={`/order/${order.token}`} style={{ color: 'var(--spice)', fontWeight: 'bold', fontSize: '0.9rem' }}>状況を見る →</Link>}
          {!isActiveOrder(order.status) && (
            <button type="button" onClick={reorder} disabled={reordering} className="acc-btn" style={{ padding: '8px 16px' }}>
              {reordering ? '準備中…' : 'もう一度注文'}
            </button>
          )}
        </div>
      </div>
    </article>
  );
}
