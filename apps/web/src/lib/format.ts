export const yen = (amount: number) => `¥${amount.toLocaleString('ja-JP')}`;

/** Daily pickup order numbers are shown zero-padded, e.g. 007, so staff and customers read them the same way. */
export const formatOrderNumber = (number: number) => String(number).padStart(3, '0');

export const ORDER_STATUS_JA: Record<string, string> = {
  NEW: '受付済み',
  CONFIRMED: '調理中',
  READY: '準備完了',
  COMPLETED: 'お渡し済み',
  CANCELLED: 'キャンセル',
};

export const isActiveOrder = (status: string) => status === 'NEW' || status === 'CONFIRMED' || status === 'READY';

export const offerLabel = (offer: { discountType: string; discountValue: number }) =>
  offer.discountType === 'PERCENT' ? `${offer.discountValue}%OFF` : `${yen(offer.discountValue)}引き`;

const TIMEZONE = 'Asia/Tokyo';

export const formatDateTime = (iso: string) =>
  new Date(iso).toLocaleString('ja-JP', { timeZone: TIMEZONE, month: 'long', day: 'numeric', weekday: 'short', hour: '2-digit', minute: '2-digit' });

export const formatDate = (iso: string) =>
  new Date(iso).toLocaleDateString('ja-JP', { timeZone: TIMEZONE, year: 'numeric', month: 'long', day: 'numeric' });

/** Japanese keyboards often type full-width digits and dashes (０９０－１２３４); phone fields want ASCII. */
export const toHalfWidth = (value: string) =>
  value.replace(/[０-９]/g, (digit) => String.fromCharCode(digit.charCodeAt(0) - 0xfee0)).replace(/[－ー―‐]/g, '-');

/** What the customer pays at pickup. Orders saved before tax was recorded only have the tax-excluded total. */
export const amountDue = (order: { total: number; grandTotal?: number | null; taxRate?: number | null }) =>
  typeof order.taxRate === 'number' && typeof order.grandTotal === 'number'
    ? { amount: order.grandTotal, taxIncluded: true }
    : { amount: order.total, taxIncluded: false };

/** "K7MP2QXA" → "K7MP-2QXA", easier to read out at the counter. */
export const formatMemberCode = (code: string) => `${code.slice(0, 4)}-${code.slice(4)}`;
