/**
 * Resolve which branch an order belongs to (mirrors apps/web resolveOrderStore).
 */

export type StoreRef = { id: string; name: string };

export function resolveOrderStoreId(
  order: {
    storeId?: unknown;
    storeName?: unknown;
    store?: unknown;
    note?: unknown;
    items?: unknown;
  },
  stores: StoreRef[],
): string | null {
  if (!order) return null;

  const byId = (id: string | null | undefined) =>
    id && stores.some(s => s.id === id) ? id : null;

  if (order.store && typeof order.store === 'object') {
    const s = order.store as { id?: string; name?: string };
    const id = byId(s.id);
    if (id) return id;
    if (s.name) {
      const matched = stores.find(st => s.name!.includes(st.name) || st.name.includes(s.name!));
      if (matched) return matched.id;
    }
  }

  if (Array.isArray(order.items) && order.items[0] && typeof order.items[0] === 'object') {
    const itemStore = (order.items[0] as { store?: { id?: string; name?: string } }).store;
    if (itemStore) {
      const id = byId(itemStore.id);
      if (id) return id;
      if (itemStore.name) {
        const matched = stores.find(st => itemStore.name!.includes(st.name) || st.name.includes(itemStore.name!));
        if (matched) return matched.id;
      }
    }
  }

  if (typeof order.storeId === 'string' && order.storeId) {
    const id = byId(order.storeId);
    if (id) return id;
  }

  if (typeof order.storeName === 'string' && order.storeName) {
    const matched = stores.find(st => order.storeName === st.name || st.name.includes(String(order.storeName)) || String(order.storeName).includes(st.name));
    if (matched) return matched.id;
  }

  if (typeof order.note === 'string' && order.note) {
    const m = order.note.match(/【(?:ご注文|お受け取り|受取|ご予約希望|予約)?店舗:\s*([^】]+)】/);
    if (m) {
      const raw = m[1].trim();
      const matched = stores.find(s => raw.includes(s.name) || raw.includes(s.id) || s.name.includes(raw));
      if (matched) return matched.id;
    }
  }

  return null;
}

export function orderMatchesStore(
  order: Parameters<typeof resolveOrderStoreId>[0],
  storeId: string | null | undefined,
  stores: StoreRef[],
): boolean {
  if (!storeId) return true;
  const resolved = resolveOrderStoreId(order, stores);
  // Unassigned orders only show in ALL view
  if (!resolved) return false;
  return resolved === storeId;
}
