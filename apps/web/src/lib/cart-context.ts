import { createContext, useContext } from 'react';

export interface CartLineOption {
  groupId: string;
  groupName: string;
  optionId: string;
  optionName: string;
  priceAdjust: number;
}

export interface CartLine {
  /** Unique key per item × option combination. Equal to `id` when there are no options. */
  cartKey: string;
  id: string;
  name: string;
  price: number;
  img: string;
  quantity: number;
  options?: CartLineOption[];
}

export interface CartValue {
  lines: CartLine[];
  count: number;
  total: number;
  /** Adds `quantity` (default 1). If the same cartKey is already present, quantity is incremented. */
  add: (line: Omit<CartLine, 'quantity' | 'cartKey'>, quantity?: number) => void;
  /** Uses cartKey as the unique identifier. */
  setQuantity: (cartKey: string, quantity: number) => void;
  /** Uses cartKey as the unique identifier. */
  remove: (cartKey: string) => void;
  clear: () => void;
  /** Removes lines whose item `id` is in the list — used to clear items after order placement. */
  removeMany: (itemIds: string[]) => void;
  isOpen: boolean;
  openCart: () => void;
  closeCart: () => void;
}

export const MAX_QUANTITY = 20;
export const DEFAULT_CARD_MAX_QUANTITY = 10;

export const CartContext = createContext<CartValue | null>(null);

export function useCart(): CartValue {
  const cart = useContext(CartContext);
  if (!cart) throw new Error('useCart must be used inside CartProvider');
  return cart;
}
