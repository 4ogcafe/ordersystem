import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { CartContext, MAX_QUANTITY, type CartLine, type CartValue } from './cart-context';

const STORAGE_KEY = 'adarsha_cart';

function cartKeyFor(id: string, options?: CartLine['options']): string {
  if (!options?.length) return id;
  const sorted = [...options].sort((a, b) => a.groupId.localeCompare(b.groupId));
  return id + '|' + sorted.map(o => `${o.groupId}:${o.optionId}`).join(',');
}

function loadLines(): CartLine[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY) ?? localStorage.getItem('kalpana_cart');
    const stored = JSON.parse(raw ?? '[]');
    if (!Array.isArray(stored)) return [];
    return stored.filter((line) => typeof line?.id === 'string' && line.quantity > 0).map(line => ({
      ...line,
      cartKey: line.cartKey ?? line.id,
    }));
  } catch {
    return [];
  }
}

export function CartProvider({ children }: { children: ReactNode }) {
  const [lines, setLines] = useState<CartLine[]>(loadLines);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(lines));
    } catch {
      // ignore: see loadLines
    }
  }, [lines]);

  const [isOpen, setIsOpen] = useState(false);

  const add = useCallback((line: Omit<CartLine, 'quantity' | 'cartKey'>, quantity = 1) => {
    const cartKey = cartKeyFor(line.id, line.options);
    setLines((prev) => {
      const existing = prev.find((c) => c.cartKey === cartKey);
      if (!existing) return [...prev, { ...line, cartKey, quantity: Math.min(quantity, MAX_QUANTITY) }];
      return prev.map((c) =>
        c.cartKey === cartKey ? { ...c, quantity: Math.min(c.quantity + quantity, MAX_QUANTITY) } : c,
      );
    });
  }, []);

  const setQuantity = useCallback((cartKey: string, quantity: number) => {
    setLines((prev) =>
      quantity <= 0
        ? prev.filter((line) => line.cartKey !== cartKey)
        : prev.map((line) => (line.cartKey === cartKey ? { ...line, quantity: Math.min(quantity, MAX_QUANTITY) } : line)),
    );
  }, []);

  const remove = useCallback((cartKey: string) => setLines((prev) => prev.filter((line) => line.cartKey !== cartKey)), []);
  const clear = useCallback(() => setLines([]), []);
  const removeMany = useCallback((itemIds: string[]) => setLines((prev) => prev.filter((line) => !itemIds.includes(line.id))), []);
  const openCart = useCallback(() => setIsOpen(true), []);
  const closeCart = useCallback(() => setIsOpen(false), []);

  const value = useMemo<CartValue>(
    () => ({
      lines,
      count: lines.reduce((sum, line) => sum + line.quantity, 0),
      total: lines.reduce((sum, line) => sum + line.price * line.quantity, 0),
      add,
      setQuantity,
      remove,
      clear,
      removeMany,
      isOpen,
      openCart,
      closeCart,
    }),
    [lines, add, setQuantity, remove, clear, removeMany, isOpen, openCart, closeCart],
  );

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}
