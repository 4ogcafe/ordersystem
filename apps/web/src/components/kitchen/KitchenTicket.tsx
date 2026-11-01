import { Check, Printer, RotateCcw, X } from 'lucide-react';
import { formatOrderNumber } from '../../lib/format';
import { resolveOrderStore } from '../../lib/stores';
import { alertText } from '../admin/dietary';
import { clockTime, countdown, dueDay, isDelivery, minutesBetween, nextAction, typeLabel, urgency, type KitchenOrder, type KitchenStatus } from './kitchen';

/** One order on the kitchen display: what to cook, by when, and the next step. */
export default function KitchenTicket({ order, now, busy, onMove, onToggleLine, onPrint }: {
  order: KitchenOrder;
  now: number;
  busy: boolean;
  onMove: (order: KitchenOrder, status: KitchenStatus) => void;
  onToggleLine: (order: KitchenOrder, index: number, done: boolean) => void;
  onPrint: (order: KitchenOrder) => void;
}) {
  const level = order.status === 'READY' ? 'ok' : urgency(order, now);
  const next = nextAction(order);
  const delivery = isDelivery(order);
  const dineIn = order.fulfillment === 'DINE_IN';
  const tableMatch = order.note?.match(/\[テーブル[:\s]*([^\]]+)\]/);
  const tableNumber = tableMatch ? tableMatch[1] : (order as any).tableNumber || null;
  const canTick = order.status === 'CONFIRMED';
  const doneCount = order.items.filter(line => line.doneAt).length;
  const day = dueDay(order.pickupAt, now);
  // How long it has been in this column.
  const since = order.status === 'NEW' ? order.createdAt : order.status === 'CONFIRMED' ? order.confirmedAt : order.readyAt;
  const waited = since ? minutesBetween(since, now) : null;
  const isNewArrival = order.status === 'NEW' && minutesBetween(order.createdAt, now) < 1;
  const resolvedBranch = resolveOrderStore(order);

  return (
    <article className={`kt kt-${level}${isNewArrival ? ' kt-fresh' : ''}`} aria-label={`Order ${formatOrderNumber(order.number)}`}>
      <header className="kt-head">
        <div>
          <div className="kt-number">#{formatOrderNumber(order.number)}</div>
          <span className={`kt-type${delivery ? ' is-delivery' : dineIn ? ' is-dinein' : ''}`}>{typeLabel(order)}</span>
          {tableNumber && (
            <span
              style={{
                display: 'inline-block',
                marginLeft: '6px',
                padding: '2px 8px',
                borderRadius: '999px',
                backgroundColor: '#065f46',
                color: '#6ee7b7',
                fontSize: '0.74rem',
                fontWeight: 800,
              }}
            >
              🪑 席: {tableNumber}
            </span>
          )}
          {resolvedBranch && (
            <span
              style={{
                display: 'inline-block',
                marginLeft: '6px',
                padding: '2px 7px',
                borderRadius: '999px',
                backgroundColor: 'rgba(200, 80, 26, 0.16)',
                color: '#f97316',
                fontSize: '0.72rem',
                fontWeight: 800,
              }}
            >
              🏪 {resolvedBranch.name}
            </span>
          )}
          {order.customerId && <span className="kt-member">Member</span>}
        </div>
        <div className="kt-due">
          <div className="kt-due-time">{day && <small>{day} </small>}{clockTime(order.pickupAt)}</div>
          <div className="kt-due-left">{order.status === 'READY' ? `waiting ${waited ?? 0} min` : countdown(order, now)}</div>
        </div>
      </header>

      <div className="kt-meta">
        <span>{order.customerName}</span>
        {waited !== null && order.status !== 'READY' && <span>{order.status === 'NEW' ? `placed ${waited} min ago` : `cooking ${waited} min`}</span>}
      </div>

      {order.dietaryAlert && <div className="kt-alert" role="note">⚠ {alertText(order.dietaryAlert)}</div>}

      <ul className="kt-lines">
        {order.items.map((line, index) => {
          const done = Boolean(line.doneAt);
          const content = (
            <>
              <span className="kt-qty">{line.quantity}×</span>
              <span className="kt-name">
                {line.nameEn}
                {line.nameJa && line.nameJa !== line.nameEn && <small>{line.nameJa}</small>}
                {line.options && line.options.length > 0 && (
                  <span className="kt-line-opts">{line.options.map(o => o.nameJa).join(' · ')}</span>
                )}
              </span>
              {canTick && <span className="kt-check" aria-hidden="true">{done && <Check size={16} strokeWidth={3} />}</span>}
            </>
          );
          return (
            <li key={`${line.itemId}-${index}`} className={done ? 'is-done' : undefined}>
              {canTick ? (
                <button type="button" aria-pressed={done} disabled={busy} onClick={() => onToggleLine(order, index, !done)}>{content}</button>
              ) : (
                <div>{content}</div>
              )}
            </li>
          );
        })}
      </ul>
      {canTick && order.items.length > 1 && <div className="kt-progress">{doneCount}/{order.items.length} dishes done</div>}

      {order.reward?.kind === 'PERK' && <div className="kt-perk">🎁 {order.reward.titleJa}</div>}
      {order.note && <div className="kt-note">📝 {order.note}</div>}
      {delivery && order.deliveryAddress && order.status === 'READY' && (
        <div className="kt-address">📍 {order.deliveryAddress.city}{order.deliveryAddress.line1} {order.deliveryAddress.building} · {order.phone}</div>
      )}

      <footer className="kt-actions">
        {next && (
          <button type="button" className={`kt-btn kt-btn-${order.status.toLowerCase()}`} disabled={busy} onClick={() => onMove(order, next.status)}>
            {next.label}
          </button>
        )}
        {order.status === 'READY' && (
          <button type="button" className="kt-icon-btn" disabled={busy} onClick={() => onMove(order, 'CONFIRMED')} title="Back to cooking" aria-label="Back to cooking">
            <RotateCcw size={18} />
          </button>
        )}
        <button type="button" className="kt-icon-btn" onClick={() => onPrint(order)} title="Print ticket" aria-label="Print ticket"><Printer size={18} /></button>
        <button type="button" className="kt-icon-btn kt-icon-danger" disabled={busy} onClick={() => onMove(order, 'CANCELLED')} title="Cancel order" aria-label="Cancel order"><X size={18} /></button>
      </footer>
    </article>
  );
}
