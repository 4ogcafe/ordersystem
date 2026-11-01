import { X, ShoppingCart, CheckCircle2 } from 'lucide-react';
import { toast } from 'react-hot-toast';
import { useCart } from '../../lib/cart-context';
import { yen } from '../../lib/format';

export interface PanelItem {
  id: string;
  name: string;
  priceValue: number;
  img: string;
  soldOut: boolean;
  recommended: boolean;
  categoryId: string;
}

interface Props {
  trigger: PanelItem;
  allItems: PanelItem[];
  onClose: () => void;
  onOpenCart: () => void;
}

export default function RelatedItemsPanel({ trigger, allItems, onClose, onOpenCart }: Props) {
  const cart = useCart();

  const related = allItems
    .filter(i => i.categoryId === trigger.categoryId && i.id !== trigger.id && !i.soldOut)
    .slice(0, 6);

  const relatedIds = new Set([trigger.id, ...related.map(i => i.id)]);
  const recommended = allItems
    .filter(i => i.recommended && !relatedIds.has(i.id) && !i.soldOut)
    .slice(0, 6);

  if (related.length === 0 && recommended.length === 0) return null;

  const addItem = (item: PanelItem) => {
    cart.add({ id: item.id, name: item.name, price: item.priceValue, img: item.img }, 1);
    toast.success(`${item.name}をカートに追加しました`);
  };

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 1500, display: 'flex', flexDirection: 'column', justifyContent: 'flex-end' }}>
      <div onClick={onClose} style={{ position: 'absolute', inset: 0, backgroundColor: 'rgba(0,0,0,0.45)' }} aria-hidden="true" />

      <div
        role="dialog"
        aria-modal="true"
        aria-label="関連メニュー"
        style={{ position: 'relative', backgroundColor: 'white', borderRadius: '20px 20px 0 0', maxHeight: '75vh', overflowY: 'auto', paddingBottom: 'env(safe-area-inset-bottom)' }}
      >
        {/* Sticky header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '18px 20px 14px', borderBottom: '1px solid #f0ebe3', position: 'sticky', top: 0, backgroundColor: 'white', zIndex: 1 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <CheckCircle2 size={20} style={{ color: 'var(--spice)', flexShrink: 0 }} aria-hidden="true" />
            <div>
              <p style={{ margin: 0, fontSize: '0.78rem', color: 'var(--spice)', fontWeight: 'bold' }}>カートに追加しました</p>
              <p style={{ margin: '2px 0 0', fontSize: '0.9rem', color: 'var(--dark-bark)', fontWeight: 'bold', lineHeight: 1.2 }}>{trigger.name}</p>
            </div>
          </div>
          <button type="button" onClick={onClose} aria-label="閉じる" style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', padding: '4px', display: 'grid', placeItems: 'center' }}>
            <X size={22} />
          </button>
        </div>

        {related.length > 0 && (
          <section style={{ padding: '18px 20px 0' }}>
            <h3 style={{ margin: '0 0 12px', fontSize: '0.92rem', color: 'var(--dark-bark)', fontWeight: 'bold' }}>同じカテゴリーのメニュー</h3>
            <div style={{ display: 'flex', gap: '12px', overflowX: 'auto', paddingBottom: '4px', scrollSnapType: 'x mandatory' }}>
              {related.map(item => (
                <ItemCard key={item.id} item={item} onAdd={() => addItem(item)} />
              ))}
            </div>
          </section>
        )}

        {recommended.length > 0 && (
          <section style={{ padding: '18px 20px 0' }}>
            <h3 style={{ margin: '0 0 12px', fontSize: '0.92rem', color: 'var(--dark-bark)', fontWeight: 'bold' }}>
              <span style={{ color: 'var(--gold)' }}>★</span> おすすめメニュー
            </h3>
            <div style={{ display: 'flex', gap: '12px', overflowX: 'auto', paddingBottom: '4px', scrollSnapType: 'x mandatory' }}>
              {recommended.map(item => (
                <ItemCard key={item.id} item={item} onAdd={() => addItem(item)} />
              ))}
            </div>
          </section>
        )}

        <div style={{ padding: '20px', display: 'flex', gap: '12px' }}>
          <button
            type="button"
            onClick={onClose}
            style={{ flex: 1, padding: '13px', borderRadius: '10px', border: '1.5px solid var(--spice)', background: 'none', color: 'var(--spice)', fontWeight: 'bold', cursor: 'pointer', fontSize: '0.92rem' }}
          >
            メニューに戻る
          </button>
          <button
            type="button"
            onClick={() => { onClose(); onOpenCart(); }}
            className="btn-warm"
            style={{ flex: 1, borderRadius: '10px', padding: '13px', fontSize: '0.92rem' }}
          >
            カートを見る ({cart.count}点)
          </button>
        </div>
      </div>
    </div>
  );
}

function ItemCard({ item, onAdd }: { item: PanelItem; onAdd: () => void }) {
  const cart = useCart();
  const inCart = cart.lines.find(l => l.id === item.id);

  return (
    <div style={{ minWidth: '140px', maxWidth: '140px', borderRadius: '12px', border: '1px solid #e5dbcd', overflow: 'hidden', flexShrink: 0, scrollSnapAlign: 'start', display: 'flex', flexDirection: 'column', backgroundColor: 'white' }}>
      <img
        src={item.img || '/bg-hero-img.webp'}
        alt={item.name}
        loading="lazy"
        onError={(e) => {
          const target = e.currentTarget;
          if (!target.src.endsWith('/bg-hero-img.webp')) {
            target.src = '/bg-hero-img.webp';
          }
        }}
        style={{ width: '100%', height: '90px', objectFit: 'cover' }}
      />
      <div style={{ padding: '8px', flex: 1, display: 'flex', flexDirection: 'column', gap: '6px' }}>
        <div style={{ fontSize: '0.78rem', fontWeight: 'bold', color: 'var(--dark-bark)', lineHeight: 1.3, flex: 1 }}>{item.name}</div>
        <div style={{ fontSize: '0.78rem', color: 'var(--spice)', fontWeight: 'bold' }}>{yen(item.priceValue)}<small style={{ fontWeight: 'normal', color: 'var(--text-muted)', marginLeft: '2px' }}>税込</small></div>
        {inCart ? (
          <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', textAlign: 'center', padding: '5px 0', borderRadius: '6px', border: '1px solid #e5dbcd' }}>
            カート内 {inCart.quantity}点
          </div>
        ) : (
          <button
            type="button"
            onClick={onAdd}
            style={{ width: '100%', padding: '6px 4px', borderRadius: '6px', border: 'none', backgroundColor: 'var(--spice)', color: 'white', fontSize: '0.75rem', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '4px', fontWeight: 'bold' }}
          >
            <ShoppingCart size={12} aria-hidden="true" />
            追加
          </button>
        )}
      </div>
    </div>
  );
}
