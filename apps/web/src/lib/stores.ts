import { getPublic } from './api';

export interface StoreLocation {
  id: string;
  number: string;
  name: string;
  area: string;
  badge: string;
  address: string;
  access: string;
  hours: string;
  holiday: string;
  phone: string;
  rating: number;
  reviewCount: number;
  mapEmbedUrl: string;
  /** WGS84 coordinates for the nearest-store feature (null/absent when unknown). */
  latitude?: number | null;
  longitude?: number | null;
}

export const DEFAULT_STORE_LOCATIONS: StoreLocation[] = [
  {
    id: 'musashisakai',
    number: '01',
    name: 'アダルサ 武蔵境店',
    area: '武蔵境・東京都武蔵野市',
    badge: '🍛 インド料理',
    address: '〒180-0022 東京都武蔵野市境2-14-10 クレール武蔵野1F',
    access: '武蔵境駅 nonowa口から徒歩1分',
    hours: 'ランチ 11:00–16:30 / ディナー 16:30–23:00',
    holiday: '年中無休',
    phone: '0422-36-2210',
    rating: 4.4,
    reviewCount: 325,
    mapEmbedUrl: 'https://maps.google.com/maps?q=%E6%9D%B1%E4%BA%AC%E9%83%BD%E6%AD%A6%E8%94%B5%E9%87%8E%E5%B8%82%E5%A2%832-14-10%20%E3%82%AF%E3%83%AC%E3%83%BC%E3%83%AB%E6%AD%A6%E8%94%B5%E9%87%8E&t=&z=16&ie=UTF8&iwloc=&output=embed',
  },
  {
    id: 'higashikoganei',
    number: '02',
    name: 'アダルサ 東小金井店',
    area: '東小金井・東京都小金井市',
    badge: '🍛 インド料理',
    address: '〒184-0011 東京都小金井市東町4-42-17 第2昭栄ビル1F',
    access: 'JR東小金井駅 南口から徒歩2分',
    hours: 'ランチ 11:00–16:30 / ディナー 16:30–23:00',
    holiday: '年中無休',
    phone: '042-383-7722',
    rating: 4.3,
    reviewCount: 280,
    mapEmbedUrl: 'https://maps.google.com/maps?q=%E6%9D%B1%E4%BA%AC%E9%83%BD%E5%B0%8F%E9%87%91%E4%BA%95%E5%B8%82%E6%9D%B1%E7%94%BA4-42-17&t=&z=16&ie=UTF8&iwloc=&output=embed',
  },
  {
    id: 'musashikoganei',
    number: '03',
    name: 'アダルサ 武蔵小金井店',
    area: '武蔵小金井・東京都小金井市',
    badge: '🍛 インド料理',
    address: '〒184-0004 東京都小金井市本町1-9-5 矢野ビル1F',
    access: 'JR中央線 武蔵小金井駅 南口から徒歩3分',
    hours: 'ランチ 11:00–16:30 / ディナー 16:30–23:00',
    holiday: '年中無休',
    phone: '042-385-8822',
    rating: 4.5,
    reviewCount: 410,
    mapEmbedUrl: 'https://maps.google.com/maps?q=%E6%9D%B1%E4%BA%AC%E9%83%BD%E5%B0%8F%E9%87%91%E4%BA%95%E5%B8%82%E6%9C%AC%E7%94%BA1-9-5&t=&z=16&ie=UTF8&iwloc=&output=embed',
  },
  {
    id: 'kokubunji',
    number: '04',
    name: 'アダルサ 国分寺店',
    area: '国分寺・東京都国分寺市',
    badge: '🍛 インド料理',
    address: '〒185-0012 東京都国分寺市本町3-11-15 石川ビル1F',
    access: '国分寺駅 北口から徒歩3分',
    hours: 'ランチ 11:00–16:30 / ディナー 16:30–23:00',
    holiday: '年中無休',
    phone: '042-327-0205',
    rating: 4.4,
    reviewCount: 340,
    mapEmbedUrl: 'https://maps.google.com/maps?q=%E6%9D%B1%E4%BA%AC%E9%83%BD%E5%9B%BD%E5%88%86%E5%AF%BA%E5%B8%82%E6%9C%AC%E7%94%BA3-11-15&t=&z=16&ie=UTF8&iwloc=&output=embed',
  },
  {
    id: 'chiba',
    number: '05',
    name: 'アダルサ 千葉店',
    area: '千葉・千葉県千葉市中央区',
    badge: '🍛 インド料理',
    address: '〒260-0013 千葉県千葉市中央区中央3-4-10 丸栄ビル1F',
    access: '葭川公園駅 徒歩3分 / JR千葉駅 徒歩10分',
    hours: 'ランチ 11:00–16:30 / ディナー 16:30–23:00',
    holiday: '年中無休',
    phone: '043-224-8820',
    rating: 4.3,
    reviewCount: 215,
    mapEmbedUrl: 'https://maps.google.com/maps?q=%E5%8D%83%E8%91%89%E7%9C%8C%E5%8D%83%E8%91%89%E5%B8%82%E4%B8%AD%E5%A4%AE%E5%8C%BA%E4%B8%AD%E5%A4%AE3-4-10&t=&z=16&ie=UTF8&iwloc=&output=embed',
  },
  {
    id: 'shinmaruko',
    number: '06',
    name: 'アダルサ 新丸子店',
    area: '新丸子・神奈川県川崎市中原区',
    badge: '🍛 インド料理',
    address: '〒211-0005 神奈川県川崎市中原区新丸子町738 小泉ビル1F',
    access: '東急東横線 新丸子駅 西口から徒歩1分 / 武蔵小杉駅 徒歩7分',
    hours: 'ランチ 11:00–16:30 / ディナー 16:30–23:00',
    holiday: '年中無休',
    phone: '044-733-8822',
    rating: 4.4,
    reviewCount: 295,
    mapEmbedUrl: 'https://maps.google.com/maps?q=%E7%A5%9E%E5%A5%88%E5%B7%9D%E7%9C%8C%E5%B7%9D%E5%B4%8E%E5%B8%82%E4%B8%AD%E5%8E%9F%E5%8C%BA%E6%96%B0%E4%B8%88%E5%AD%90%E7%94%BA738&t=&z=16&ie=UTF8&iwloc=&output=embed',
  },
  {
    id: 'aroy',
    number: '07',
    name: 'タイ料理 アロイ',
    area: '武蔵小金井・東京都小金井市',
    badge: '🇹🇭 本格タイ料理',
    address: '〒184-0004 東京都小金井市本町2-6-10 シティライブ武蔵小金井1F',
    access: '武蔵小金井駅 北口から徒歩3分',
    hours: 'ランチ 11:30–15:00 / ディナー 17:00–23:00',
    holiday: '月曜日定休（祝日の場合は翌平日）',
    phone: '042-384-9988',
    rating: 4.5,
    reviewCount: 190,
    mapEmbedUrl: 'https://maps.google.com/maps?q=%E6%9D%B1%E4%BA%AC%E9%83%BD%E5%B0%8F%E9%87%91%E4%BA%95%E5%B8%82%E6%9C%AC%E7%94%BA2-6-10&t=&z=16&ie=UTF8&iwloc=&output=embed',
  },
  {
    id: 'musashikoganei-2',
    number: '08',
    name: 'アダルサ 武蔵小金井 第2店',
    area: '武蔵小金井・東京都小金井市',
    badge: '🍛 インド・アジアン料理',
    address: '〒184-0004 東京都小金井市本町5-19-7',
    access: '武蔵小金井駅 北口から徒歩4分',
    hours: 'ランチ 11:00–16:30 / ディナー 16:30–23:00',
    holiday: '年中無休',
    phone: '042-388-1122',
    rating: 4.3,
    reviewCount: 175,
    mapEmbedUrl: 'https://maps.google.com/maps?q=%E6%9D%B1%E4%BA%AC%E9%83%BD%E5%B0%8F%E9%87%91%E4%BA%95%E5%B8%82%E6%9C%AC%E7%94%BA5-19-7&t=&z=16&ie=UTF8&iwloc=&output=embed',
  },
  {
    id: 'takatsu',
    number: '09',
    name: 'ハーブ＆スパイス アダルサ 高津店',
    area: '高津・神奈川県川崎市高津区',
    badge: '🌿 ハーブ＆スパイス料理',
    address: '〒213-0001 神奈川県川崎市高津区溝口3-1-3',
    access: '東急田園都市線 高津駅 徒歩2分 / 溝の口駅 徒歩8分',
    hours: 'ランチ 11:00–16:00 / ディナー 17:00–23:00',
    holiday: '年中無休',
    phone: '044-811-9290',
    rating: 4.4,
    reviewCount: 220,
    mapEmbedUrl: 'https://maps.google.com/maps?q=%E7%A5%9E%E5%A5%88%E5%B7%9D%E7%9C%8C%E5%B7%9D%E5%B4%8E%E5%B8%82%E9%AB%98%E6%B4%A5%E5%8C%BA%E6%BA%9D%E5%8F%A33-1-3&t=&z=16&ie=UTF8&iwloc=&output=embed',
  },
  {
    id: 'hachioji',
    number: '10',
    name: 'アダルサ 八王子店',
    area: '八王子・東京都八王子市',
    badge: '🍛 インド料理',
    address: '〒192-0081 東京都八王子市中町3-2',
    access: 'JR八王子駅 北口から徒歩4分 / 京王八王子駅から徒歩7分',
    hours: 'ランチ 11:00–16:30 / ディナー 16:30–23:00',
    holiday: '年中無休',
    phone: '042-646-7780',
    rating: 4.3,
    reviewCount: 310,
    mapEmbedUrl: 'https://maps.google.com/maps?q=%E6%9D%B1%E4%BA%AC%E9%83%BD%E5%85%AB%E7%8E%8B%E5%AD%90%E5%B8%82%E4%B8%AD%E7%94%BA3-2&t=&z=16&ie=UTF8&iwloc=&output=embed',
  },
];

export interface OrderStoreSnapshot {
  id: string;
  number: string;
  name: string;
  area?: string;
  badge?: string;
  address: string;
  access?: string;
  hours?: string;
  holiday?: string;
  phone: string;
}

export const ORDER_STORE_STORAGE_KEY = 'adarsha_selected_store_id';
/**
 * How the saved store was chosen. 'manual' means the customer picked it themselves, so the
 * nearest-store feature must not override it automatically on their next visit.
 */
export const ORDER_STORE_SOURCE_KEY = 'adarsha_selected_store_source';
export type StoreSelectionSource = 'manual' | 'auto';

export function getSavedOrderStoreId(stores: StoreLocation[] = DEFAULT_STORE_LOCATIONS): string {
  try {
    const saved = localStorage.getItem(ORDER_STORE_STORAGE_KEY);
    if (saved && stores.some(s => s.id === saved)) {
      return saved;
    }
  } catch {
    // Ignore storage errors
  }
  return stores[0]?.id || DEFAULT_STORE_LOCATIONS[0].id;
}

/** Whether the saved store came from a manual pick or from nearest-store detection (null = never chosen). */
export function getStoreSelectionSource(): StoreSelectionSource | null {
  try {
    const source = localStorage.getItem(ORDER_STORE_SOURCE_KEY);
    return source === 'manual' || source === 'auto' ? source : null;
  } catch {
    return null;
  }
}

/**
 * Persists the chosen store and broadcasts `adarsha:store-changed`, which is what the cart,
 * order page and menu listen to (the React equivalent of firing a `change` event on a <select>).
 *
 * Pass `source` only for deliberate choices: 'manual' when the customer picked a store,
 * 'auto' when the nearest-store feature picked it. Housekeeping saves (e.g. persisting a
 * fallback default) leave the source untouched.
 */
export function saveOrderStoreId(storeId: string, source?: StoreSelectionSource): void {
  try {
    localStorage.setItem(ORDER_STORE_STORAGE_KEY, storeId);
    if (source) localStorage.setItem(ORDER_STORE_SOURCE_KEY, source);
  } catch {
    // Ignore storage errors (private mode, quota): the in-page selection still works.
  }
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('adarsha:store-changed', { detail: { storeId, source } }));
  }
}

/**
 * Loads the branch list. `GET /api/v1/stores` returns a plain array; an `{ stores: [...] }`
 * wrapper is accepted too. Resolves to null when the API is unreachable or returns nothing,
 * so callers can keep DEFAULT_STORE_LOCATIONS.
 */
export async function fetchStores(): Promise<StoreLocation[] | null> {
  try {
    const res = await getPublic<StoreLocation[] | { stores?: StoreLocation[] }>('/api/v1/stores');
    const list = Array.isArray(res) ? res : res?.stores;
    return Array.isArray(list) && list.length > 0 ? list : null;
  } catch {
    return null;
  }
}

export function extractDynamicAreaTabs(stores: StoreLocation[]): { id: string; label: string }[] {
  const set = new Set<string>();
  stores.forEach(s => {
    const match = (s.address || '').match(/(東京都|神奈川県|千葉県|埼玉県|茨城県|群馬県|栃木県|大阪府|[^\s]+[都道府県])/);
    if (match) {
      set.add(match[1]);
    } else if (s.area) {
      const parts = s.area.split(/[・\s]/);
      const pref = parts.find(p => /[都道府県]/.test(p));
      if (pref) set.add(pref);
      else set.add('その他');
    }
  });
  const areas = Array.from(set);
  return [
    { id: 'all', label: `すべて (${stores.length})` },
    ...areas.map(a => ({
      id: a,
      label: `${a.replace(/[都府県]/, '')} (${stores.filter(s => (s.address || '').includes(a) || (s.area || '').includes(a)).length})`,
    })),
  ];
}

export function filterStoresByArea(stores: StoreLocation[], selectedArea: string, searchQuery = ''): StoreLocation[] {
  const q = searchQuery.trim().toLowerCase();
  return stores.filter(s => {
    const matchesArea = selectedArea === 'all' || (s.address || '').includes(selectedArea) || (s.area || '').includes(selectedArea);
    if (!matchesArea) return false;
    if (!q) return true;
    return (
      (s.name || '').toLowerCase().includes(q) ||
      (s.area || '').toLowerCase().includes(q) ||
      (s.address || '').toLowerCase().includes(q) ||
      (s.access || '').toLowerCase().includes(q) ||
      (s.badge || '').toLowerCase().includes(q) ||
      (s.phone || '').toLowerCase().includes(q)
    );
  });
}

export function isStoreHolidayOnDate(store: StoreLocation | OrderStoreSnapshot | null | undefined, dateOrIso: string | null | undefined): boolean {
  if (!store?.holiday || store.holiday.includes('年中無休')) return false;
  try {
    const d = dateOrIso ? new Date(dateOrIso.length === 10 ? `${dateOrIso}T12:00:00` : dateOrIso) : new Date();
    if (Number.isNaN(d.getTime())) return false;
    const dayNames = ['日曜日', '月曜日', '火曜日', '水曜日', '木曜日', '金曜日', '土曜日'];
    const targetDay = dayNames[d.getDay()];
    return store.holiday.includes(targetDay) || store.holiday.includes(targetDay.replace('曜日', '曜'));
  } catch {
    return false;
  }
}

export function toStoreSnapshot(store: StoreLocation): OrderStoreSnapshot {
  return {
    id: store.id,
    number: store.number,
    name: store.name,
    area: store.area,
    badge: store.badge,
    address: store.address,
    access: store.access,
    hours: store.hours,
    holiday: store.holiday,
    phone: store.phone,
  };
}

export function resolveOrderStore(order: any, stores: StoreLocation[] = DEFAULT_STORE_LOCATIONS): OrderStoreSnapshot | null {
  if (!order) return null;

  // 1. Direct top-level `order.store` object
  if (order.store && typeof order.store === 'object' && order.store.name) {
    const matched = order.store.id ? stores.find(s => s.id === order.store.id) : undefined;
    return {
      id: order.store.id || matched?.id || 'branch',
      number: order.store.number || matched?.number || '01',
      name: order.store.name,
      area: order.store.area || matched?.area,
      badge: order.store.badge || matched?.badge,
      address: order.store.address || matched?.address || '',
      access: order.store.access || matched?.access,
      hours: order.store.hours || matched?.hours,
      holiday: order.store.holiday || matched?.holiday,
      phone: order.store.phone || matched?.phone || '',
    };
  }

  // 2. Embedded in `order.items[0].store`
  const itemStore = Array.isArray(order.items) && order.items[0]?.store;
  if (itemStore && typeof itemStore === 'object' && itemStore.name) {
    const matched = itemStore.id ? stores.find(s => s.id === itemStore.id) : undefined;
    return {
      id: itemStore.id || matched?.id || 'branch',
      number: itemStore.number || matched?.number || '01',
      name: itemStore.name,
      area: itemStore.area || matched?.area,
      badge: itemStore.badge || matched?.badge,
      address: itemStore.address || matched?.address || '',
      access: itemStore.access || matched?.access,
      hours: itemStore.hours || matched?.hours,
      holiday: itemStore.holiday || matched?.holiday,
      phone: itemStore.phone || matched?.phone || '',
    };
  }

  // 3. Direct `storeId` / `storeName` fields
  if (order.storeId || order.storeName) {
    const matched = stores.find(s => s.id === order.storeId || s.name === order.storeName);
    if (matched) return toStoreSnapshot(matched);
    if (order.storeName) {
      return {
        id: order.storeId || 'branch',
        number: order.storeNumber || '01',
        name: order.storeName,
        address: order.storeAddress || '',
        phone: order.storePhone || '',
      };
    }
  }

  // 4. Parse from `note` if formatted like 【店舗: ...】 or 【受取店舗: ...】
  if (typeof order.note === 'string') {
    const m = order.note.match(/【(?:ご注文|お受け取り|受取)?店舗:\s*([^】]+)】/);
    if (m) {
      const raw = m[1].trim();
      const matched = stores.find(s => raw.includes(s.name) || raw.includes(s.id));
      if (matched) return toStoreSnapshot(matched);
      return {
        id: 'branch',
        number: '01',
        name: raw,
        address: '',
        phone: '',
      };
    }
  }

  return null;
}

