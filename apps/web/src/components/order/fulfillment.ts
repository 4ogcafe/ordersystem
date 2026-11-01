// Shared shapes and wording for pickup vs delivery orders.

export type Fulfillment = 'PICKUP' | 'DELIVERY' | 'DINE_IN';

export interface DeliveryAddress {
  postalCode: string;
  prefecture: string;
  city: string;
  line1: string;
  building: string;
}

export interface DeliveryOptions {
  enabled: boolean;
  fee: number;
  freeOver: number;
  minOrder: number;
  areas: string[];
  note: string;
}

export const EMPTY_ADDRESS: DeliveryAddress = { postalCode: '', prefecture: '', city: '', line1: '', building: '' };

/** "受け取り" for pickup, "お届け" for delivery: the word used in labels and messages. */
export const timeWord = (fulfillment: Fulfillment) => (fulfillment === 'DELIVERY' ? 'お届け' : fulfillment === 'DINE_IN' ? 'ご提供' : '受け取り');

/** "お持ち帰り", "デリバリー" or "店内飲食". */
export const fulfillmentLabel = (fulfillment: Fulfillment | undefined) => (fulfillment === 'DELIVERY' ? 'デリバリー' : fulfillment === 'DINE_IN' ? '店内飲食' : 'お持ち帰り');

export const formatAddress = (address: DeliveryAddress) =>
  [address.postalCode && `〒${address.postalCode}`, address.prefecture, address.city, address.line1, address.building].filter(Boolean).join(' ');

/** The status names customers see; the last two steps read differently for delivery. */
export function statusLabel(status: string, fulfillment: Fulfillment): string {
  const delivery = fulfillment === 'DELIVERY';
  const dineIn = fulfillment === 'DINE_IN';
  switch (status) {
    case 'NEW': return '受付済み';
    case 'CONFIRMED': return '調理中';
    case 'READY': return delivery ? '配達中' : dineIn ? 'まもなくお持ちします' : '準備完了';
    case 'COMPLETED': return delivery ? 'お届け済み' : dineIn ? 'ご提供済み' : 'お渡し済み';
    case 'CANCELLED': return 'キャンセル';
    default: return status;
  }
}

export type AddressErrors = Partial<Record<keyof DeliveryAddress, string>>;

export function validateAddress(address: DeliveryAddress): AddressErrors {
  const errors: AddressErrors = {};
  if (!/^\d{3}-?\d{4}$/.test(address.postalCode.trim())) errors.postalCode = '郵便番号を7桁で入力してください（例: 360-0023）。';
  if (!address.prefecture) errors.prefecture = '都道府県を選択してください。';
  if (!address.city.trim()) errors.city = '市区町村を入力してください。';
  if (!address.line1.trim()) errors.line1 = '番地を入力してください。';
  return errors;
}
