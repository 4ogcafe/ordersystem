import type { DietaryAlert } from '../admin/dietary';
import type { OrderStoreSnapshot } from '../../lib/stores';

// Shapes and pure helpers for the kitchen display (/kitchen).

export type KitchenStatus = 'NEW' | 'CONFIRMED' | 'READY' | 'COMPLETED' | 'CANCELLED';
export type ActiveStatus = 'NEW' | 'CONFIRMED' | 'READY';

export interface KitchenLineOption {
  groupNameJa: string;
  nameJa: string;
}

export interface KitchenLine {
  itemId: string;
  nameEn: string;
  nameJa: string | null;
  quantity: number;
  options?: KitchenLineOption[];
  doneAt?: string | null;
  store?: OrderStoreSnapshot | null;
}

export interface KitchenOrder {
  id: string;
  number: number;
  status: KitchenStatus;
  fulfillment?: 'PICKUP' | 'DELIVERY' | 'DINE_IN';
  customerName: string;
  phone: string;
  note: string | null;
  pickupAt: string;
  createdAt: string;
  confirmedAt?: string | null;
  readyAt?: string | null;
  completedAt?: string | null;
  cancelledAt?: string | null;
  updatedAt: string;
  store?: OrderStoreSnapshot | null;
  storeId?: string | null;
  storeName?: string | null;
  storeAddress?: string | null;
  storePhone?: string | null;
  items: KitchenLine[];
  customerId?: string | null;
  reward?: { titleJa: string; kind: 'AMOUNT_OFF' | 'PERK' } | null;
  deliveryAddress?: { postalCode: string; prefecture: string; city: string; line1: string; building?: string } | null;
  grandTotal?: number;
  total: number;
  dietaryAlert?: DietaryAlert | null;
}

export interface KitchenBoard {
  serverTime: string;
  pausedUntil: string | null;
  ordering: { pickup: { enabled: boolean }; delivery: { enabled: boolean } };
  active: KitchenOrder[];
  done: KitchenOrder[];
  stats: { ordersToday: number; completedToday: number; cancelledToday: number; itemsToday: number; avgPrepMinutes: number | null };
}

export const TIMEZONE = 'Asia/Tokyo';

export const COLUMNS: { status: ActiveStatus; title: string; sub: string }[] = [
  { status: 'NEW', title: '新規', sub: 'New' },
  { status: 'CONFIRMED', title: '調理中', sub: 'Cooking' },
  { status: 'READY', title: '完成', sub: 'Ready' },
];

/** Minutes a ready-to-collect order is "soon" before it turns amber. */
export const SOON_MINUTES = 15;

export const isDelivery = (order: KitchenOrder) => order.fulfillment === 'DELIVERY';
export const isDineIn = (order: KitchenOrder) => order.fulfillment === 'DINE_IN';

/** "🛵 Delivery", "🍽️ Dine-in (店内)" or "🛍 Pickup". */
export const typeLabel = (order: KitchenOrder) =>
  order.fulfillment === 'DELIVERY'
    ? '🛵 Delivery'
    : order.fulfillment === 'DINE_IN'
      ? '🍽️ Dine-in (店内)'
      : '🛍 Pickup';

export const clockTime = (iso: string | Date) =>
  new Date(iso).toLocaleTimeString('ja-JP', { timeZone: TIMEZONE, hour: '2-digit', minute: '2-digit' });

/** "today" or "10/14 (水)" for orders due on another day. */
export function dueDay(iso: string, now: number): string | null {
  const key = (time: number | string) => new Date(time).toLocaleDateString('ja-JP', { timeZone: TIMEZONE });
  if (key(iso) === key(now)) return null;
  return new Date(iso).toLocaleDateString('ja-JP', { timeZone: TIMEZONE, month: 'numeric', day: 'numeric', weekday: 'short' });
}

// Never negative: the screen's clock can be a few seconds behind the server's.
export const minutesBetween = (from: string | number, to: number) => Math.max(0, Math.floor((to - new Date(from).getTime()) / 60_000));

export type Urgency = 'late' | 'soon' | 'ok';

/** How close the order is to its pickup / delivery time. Finished orders are never urgent. */
export function urgency(order: KitchenOrder, now: number): Urgency {
  const left = (new Date(order.pickupAt).getTime() - now) / 60_000;
  if (left < 0) return 'late';
  if (left <= SOON_MINUTES) return 'soon';
  return 'ok';
}

/** "in 12 min", "5 min late", or "in 2 h 10 min". */
export function countdown(order: KitchenOrder, now: number): string {
  const minutes = Math.round((new Date(order.pickupAt).getTime() - now) / 60_000);
  if (minutes < 0) return `${-minutes} min late`;
  if (minutes === 0) return 'due now';
  if (minutes < 60) return `in ${minutes} min`;
  return `in ${Math.floor(minutes / 60)} h ${minutes % 60} min`;
}

/** The one forward step for each column, worded for pickup, delivery, or dine-in table ordering. */
export function nextAction(order: KitchenOrder): { status: KitchenStatus; label: string } | null {
  if (order.status === 'NEW') return { status: 'CONFIRMED', label: 'Start cooking' };
  if (order.status === 'CONFIRMED') {
    if (order.fulfillment === 'DELIVERY') return { status: 'READY', label: 'Ready for rider' };
    if (order.fulfillment === 'DINE_IN') return { status: 'READY', label: 'Serve to table' };
    return { status: 'READY', label: 'Ready' };
  }
  if (order.status === 'READY') {
    if (order.fulfillment === 'DELIVERY') return { status: 'COMPLETED', label: 'Delivered' };
    if (order.fulfillment === 'DINE_IN') return { status: 'COMPLETED', label: 'Paid / Done' };
    return { status: 'COMPLETED', label: 'Picked up' };
  }
  return null;
}

/** Dishes still to make across the orders in the kitchen ("all day"), most first. */
export function allDayCounts(orders: KitchenOrder[]) {
  const counts = new Map<string, { nameEn: string; nameJa: string | null; quantity: number; orders: number }>();
  for (const order of orders) {
    if (order.status !== 'NEW' && order.status !== 'CONFIRMED') continue;
    for (const line of order.items) {
      if (line.doneAt) continue;
      const entry = counts.get(line.itemId) ?? { nameEn: line.nameEn, nameJa: line.nameJa, quantity: 0, orders: 0 };
      entry.quantity += line.quantity;
      entry.orders += 1;
      counts.set(line.itemId, entry);
    }
  }
  return [...counts.values()].sort((a, b) => b.quantity - a.quantity);
}

import {
  generateKitchenTicketHtml,
  printKitchenTicket,
  printTestTicket as printReceiptTestTicket,
} from '../../lib/receipt';

/** A kitchen ticket for an 80 mm receipt printer (or any printer). */
export function ticketHtml(order: KitchenOrder | any, allergyLine: string | null = null): string {
  return generateKitchenTicketHtml(order, allergyLine);
}

/** Prints one ticket without opening a new tab whenever possible. */
export function printTicket(order: KitchenOrder | any, allergyLine: string | null = null, settings?: any): boolean {
  return printKitchenTicket(order, allergyLine, settings);
}

/** Prints a test ticket formatted for MUNBYN / Epson TM-m30 80mm printers */
export function printTestTicket(): boolean {
  return printReceiptTestTicket();
}
