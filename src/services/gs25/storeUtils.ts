/**
 * GS25 매장 정규화와 정렬 유틸리티
 */

import type {
  Gs25ProductCandidate,
  Gs25Store,
  Gs25StoreProperty,
  Gs25StoreStockResponse,
} from './types.js';

export function toNumber(value: unknown): number {
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : 0;
  }

  if (typeof value === 'string') {
    const parsed = Number.parseFloat(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }

  return 0;
}

function toInteger(value: unknown): number {
  if (typeof value === 'number') {
    return Number.isFinite(value) ? Math.trunc(value) : 0;
  }

  if (typeof value === 'string') {
    const parsed = Number.parseInt(value, 10);
    return Number.isFinite(parsed) ? parsed : 0;
  }

  return 0;
}

function toBooleanYn(value: unknown): boolean {
  const normalized = String(value || '').trim().toUpperCase();
  return normalized === 'Y' || normalized === 'TRUE' || normalized === '1';
}

function normalizeProperty(raw: {
  storePropertyCode?: string;
  storePropertyName?: string;
  storePropertyType?: string;
  storePropertyImage?: string;
}): Gs25StoreProperty {
  return {
    code: raw.storePropertyCode || '',
    name: raw.storePropertyName || '',
    type: raw.storePropertyType || '',
    imageUrl: raw.storePropertyImage || '',
  };
}

export function normalizeStore(raw: NonNullable<Gs25StoreStockResponse['stores']>[number]): Gs25Store {
  const properties = (raw.propertyList || []).map(normalizeProperty).filter((item) => item.name.length > 0);

  return {
    storeCode: raw.storeCode || '',
    storeName: raw.storeName || '',
    address: raw.storeAddress || '',
    phone: raw.storeTelephoneNumber || '',
    longitude: toNumber(raw.storeXCoordination),
    latitude: toNumber(raw.storeYCoordination),
    serviceCode: raw.serviceCode || '',
    realStockQuantity: toInteger(raw.realStockQuantity),
    pickupStockQuantity: toInteger(raw.pickupStkQty),
    deliveryStockQuantity: toInteger(raw.dlvyStkQty),
    isSoldOut: toBooleanYn(raw.isSoldOutYn),
    searchItemName: String(raw.searchItemName || '').trim(),
    searchItemSellPrice:
      raw.searchItemSellPrice === null || raw.searchItemSellPrice === undefined
        ? null
        : toInteger(raw.searchItemSellPrice),
    propertyNames: properties.map((item) => item.name),
    properties,
    distanceM: null,
  };
}

export function calculateDistanceM(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) * Math.sin(dLng / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return Math.round(6371000 * c);
}

export function filterGs25StoresByKeyword(stores: Gs25Store[], keyword: string): Gs25Store[] {
  const trimmed = keyword.trim();
  if (trimmed.length === 0) {
    return stores;
  }

  const normalized = trimmed.toLowerCase();
  const noSpaceKeyword = normalized.replace(/\s+/g, '');
  const keywordTokens = normalized.split(/\s+/).filter((token) => token.length > 0);
  const normalizedVariants = new Set([normalized, noSpaceKeyword]);

  for (const suffix of ['역', '점']) {
    for (const variant of [...normalizedVariants]) {
      if (variant.endsWith(suffix) && variant.length > suffix.length) {
        normalizedVariants.add(variant.slice(0, -suffix.length));
      }
    }
  }

  return stores.filter((store) => {
    const target = `${store.storeName} ${store.address} ${store.propertyNames.join(' ')}`.toLowerCase();
    const targetNoSpace = target.replace(/\s+/g, '');
    if (target.includes(normalized)) {
      return true;
    }

    for (const variant of normalizedVariants) {
      if (variant.length > 0 && targetNoSpace.includes(variant.replace(/\s+/g, ''))) {
        return true;
      }
    }

    if (keywordTokens.length > 1) {
      return keywordTokens.every((token) => target.includes(token));
    }

    return false;
  });
}

export function selectGs25StoresForKeyword(
  stores: Gs25Store[],
  keyword: string,
  options: { relaxWhenEmpty?: boolean } = {},
): { stores: Gs25Store[]; filterRelaxed: boolean } {
  const filtered = filterGs25StoresByKeyword(stores, keyword);
  if (filtered.length > 0 || !options.relaxWhenEmpty || keyword.trim().length === 0 || stores.length === 0) {
    return { stores: filtered, filterRelaxed: false };
  }

  return { stores, filterRelaxed: true };
}

export function attachDistanceToGs25Stores(
  stores: Gs25Store[],
  latitude?: number,
  longitude?: number,
): Gs25Store[] {
  if (typeof latitude !== 'number' || typeof longitude !== 'number') {
    return stores;
  }

  return stores.map((store) => {
    if (store.latitude === 0 || store.longitude === 0) {
      return store;
    }

    return {
      ...store,
      distanceM: calculateDistanceM(latitude, longitude, store.latitude, store.longitude),
    };
  });
}

export function sortGs25Stores(stores: Gs25Store[]): Gs25Store[] {
  return [...stores].sort((a, b) => {
    const distanceA = a.distanceM ?? Number.MAX_SAFE_INTEGER;
    const distanceB = b.distanceM ?? Number.MAX_SAFE_INTEGER;
    if (distanceA !== distanceB) {
      return distanceA - distanceB;
    }

    if (b.realStockQuantity !== a.realStockQuantity) {
      return b.realStockQuantity - a.realStockQuantity;
    }

    return a.storeName.localeCompare(b.storeName, 'ko');
  });
}

export function extractGs25ProductCandidates(stores: Gs25Store[]): Gs25ProductCandidate[] {
  const map = new Map<string, Gs25ProductCandidate>();

  for (const store of stores) {
    const name = store.searchItemName.trim();
    if (name.length === 0) {
      continue;
    }

    const key = `${name}::${store.searchItemSellPrice ?? 'null'}`;
    const prev = map.get(key);
    const inStock = store.realStockQuantity > 0 ? 1 : 0;

    if (!prev) {
      map.set(key, {
        name,
        sellPrice: store.searchItemSellPrice,
        matchedStoreCount: 1,
        inStockStoreCount: inStock,
        totalStockQuantity: Math.max(store.realStockQuantity, 0),
      });
      continue;
    }

    prev.matchedStoreCount += 1;
    prev.inStockStoreCount += inStock;
    prev.totalStockQuantity += Math.max(store.realStockQuantity, 0);
  }

  return [...map.values()].sort((a, b) => {
    if (b.inStockStoreCount !== a.inStockStoreCount) {
      return b.inStockStoreCount - a.inStockStoreCount;
    }

    if (b.totalStockQuantity !== a.totalStockQuantity) {
      return b.totalStockQuantity - a.totalStockQuantity;
    }

    return a.name.localeCompare(b.name, 'ko');
  });
}
