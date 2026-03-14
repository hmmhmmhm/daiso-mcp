/**
 * GS25 API 클라이언트
 */
/* c8 ignore start */

import { fetchJson } from '../../utils/http.js';
import { GS25_API } from './api.js';
import type {
  Gs25ProductCandidate,
  Gs25Store,
  Gs25StoreProperty,
  Gs25StoreStockResponse,
} from './types.js';

interface RequestOptions {
  timeout?: number;
  googleMapsApiKey?: string;
}

interface FetchGs25StoresParams {
  serviceCode?: string;
  keyword?: string;
  itemCode?: string;
  storeCode?: string;
  realTimeStockYn?: 'Y' | 'N';
  latitude?: number;
  longitude?: number;
  pageNumber?: number;
  pageCount?: number;
  useCache?: boolean;
}

interface Gs25TotalSearchDocument {
  field?: {
    itemCode?: string;
    itemName?: string;
    shortItemName?: string;
    itemImageUrl?: string;
    starPoint?: string;
    stockCheckYn?: string;
  };
}

interface Gs25TotalSearchResponse {
  SearchQueryResult?: {
    keywordInfo?: {
      keyword?: string;
      searchKeyword?: string;
    };
    Collection?: Array<{
      CollectionId?: string;
      Documentset?: {
        totalCount?: number;
        Document?: Gs25TotalSearchDocument[];
      };
    }>;
  };
}

export interface Gs25SearchProduct {
  itemCode: string;
  itemName: string;
  shortItemName: string;
  imageUrl: string;
  rating: number;
  stockCheckEnabled: boolean;
}

interface GoogleGeocodeResponse {
  status?: string;
  results?: Array<{
    geometry?: {
      location?: {
        lat?: number;
        lng?: number;
      };
    };
  }>;
}

interface CacheEntry {
  expiresAt: number;
  stores: Gs25Store[];
}

const GS25_DEFAULT_HEADERS = {
  Accept: 'application/json, text/plain, */*',
} as const;

const GS25_STORES_CACHE_TTL_MS = 60 * 5 * 1000;
const gs25StoresCache = new Map<string, CacheEntry>();

function toNumber(value: unknown): number {
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

function normalizeStore(raw: NonNullable<Gs25StoreStockResponse['stores']>[number]): Gs25Store {
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

function buildCacheKey(params: Required<Pick<FetchGs25StoresParams, 'serviceCode' | 'keyword' | 'storeCode'>>): string {
  return `${params.serviceCode}:${params.keyword}:${params.storeCode}`;
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

  return stores.filter((store) => {
    const target = `${store.storeName} ${store.address} ${store.propertyNames.join(' ')}`.toLowerCase();
    if (target.includes(normalized)) {
      return true;
    }

    if (noSpaceKeyword.length > 0 && target.replace(/\s+/g, '').includes(noSpaceKeyword)) {
      return true;
    }

    if (keywordTokens.length > 1) {
      return keywordTokens.every((token) => target.includes(token));
    }

    return false;
  });
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

export async function geocodeGs25Address(address: string, options: RequestOptions = {}) {
  const keyword = address.trim();
  if (keyword.length === 0) {
    return null;
  }

  const { timeout = 15000, googleMapsApiKey } = options;
  const apiKey = (googleMapsApiKey || '').trim();
  if (apiKey.length === 0) {
    return null;
  }

  const endpoint = new URL('https://maps.googleapis.com/maps/api/geocode/json');
  endpoint.searchParams.set('address', keyword);
  endpoint.searchParams.set('key', apiKey);

  const body = await fetchJson<GoogleGeocodeResponse>(endpoint.toString(), {
    method: 'GET',
    timeout,
    headers: {
      Accept: 'application/json',
    },
  });

  if (body.status !== 'OK') {
    return null;
  }

  const location = body.results?.[0]?.geometry?.location;
  if (!location) {
    return null;
  }

  const latitude = toNumber(location.lat);
  const longitude = toNumber(location.lng);
  if (latitude === 0 || longitude === 0) {
    return null;
  }

  return { latitude, longitude };
}

export async function fetchGs25Stores(
  params: FetchGs25StoresParams = {},
  options: RequestOptions = {},
): Promise<{ totalCount: number; stores: Gs25Store[]; cacheHit: boolean }> {
  const {
    serviceCode = '01',
    keyword = '',
    itemCode = '',
    storeCode = '',
    realTimeStockYn = 'Y',
    latitude,
    longitude,
    pageNumber = 0,
    pageCount = 20000,
    useCache = true,
  } = params;
  const { timeout = 20000 } = options;

  const cacheKey = buildCacheKey({
    serviceCode,
    keyword: itemCode.trim() || keyword.trim(),
    storeCode: storeCode.trim(),
  });

  if (useCache) {
    const cached = gs25StoresCache.get(cacheKey);
    if (cached && cached.expiresAt > Date.now()) {
      return {
        totalCount: cached.stores.length,
        stores: cached.stores,
        cacheHit: true,
      };
    }
  }

  const endpoint = new URL(GS25_API.STORE_STOCK_PATH, GS25_API.BFF_BASE_URL);
  endpoint.searchParams.set('serviceCode', serviceCode);
  endpoint.searchParams.set('pageNumber', String(pageNumber));
  endpoint.searchParams.set('pageCount', String(pageCount));
  endpoint.searchParams.set('realTimeStockYn', realTimeStockYn);

  // itemCode가 있으면 itemCode 사용, 없으면 keyword 사용
  // 주의: itemCode 사용 시 좌표도 필수
  if (itemCode.trim().length > 0) {
    endpoint.searchParams.set('itemCode', itemCode.trim());
  } else if (keyword.trim().length > 0) {
    endpoint.searchParams.set('keyword', keyword.trim());
  }
  if (storeCode.trim().length > 0) {
    endpoint.searchParams.set('storeCode', storeCode.trim());
  }
  // 좌표 파라미터: 앱은 myPosition + centerPosition 모두 필요
  if (typeof latitude === 'number' && Number.isFinite(latitude)) {
    endpoint.searchParams.set('myPositionYCoordination', String(latitude));
    endpoint.searchParams.set('centerPositionYCoordination', String(latitude));
  }
  if (typeof longitude === 'number' && Number.isFinite(longitude)) {
    endpoint.searchParams.set('myPositionXCoordination', String(longitude));
    endpoint.searchParams.set('centerPositionXCoordination', String(longitude));
  }
  // 반경 조건 (미터 단위, 기본값 500)
  if (typeof latitude === 'number' && typeof longitude === 'number') {
    endpoint.searchParams.set('radiusCondition', '500');
    // 앱에서 사용하는 추가 플래그
    endpoint.searchParams.set('pickupStoreYn', 'N');
    endpoint.searchParams.set('isSuperDlvyStoreSelected', 'N');
    endpoint.searchParams.set('isGs25DlvyStoreSelected', 'N');
  }

  const body = await fetchJson<Gs25StoreStockResponse>(endpoint.toString(), {
    method: 'GET',
    timeout,
    headers: GS25_DEFAULT_HEADERS,
  });

  const stores = (body.stores || []).map(normalizeStore).filter((store) => store.storeCode.length > 0);

  if (useCache) {
    gs25StoresCache.set(cacheKey, {
      stores,
      expiresAt: Date.now() + GS25_STORES_CACHE_TTL_MS,
    });
  }

  return {
    totalCount: stores.length,
    stores,
    cacheHit: false,
  };
}

export async function fetchGs25NormalizedKeyword(
  keyword: string,
  options: RequestOptions = {},
): Promise<{ keyword: string; searchKeyword: string } | null> {
  const query = keyword.trim();
  if (query.length === 0) {
    return null;
  }

  const { timeout = 20000 } = options;
  const endpoint = new URL(GS25_API.TOTAL_SEARCH_PATH, GS25_API.APIGW_BASE_URL);

  const body = await fetchJson<Gs25TotalSearchResponse>(endpoint.toString(), {
    method: 'POST',
    timeout,
    headers: {
      Accept: 'application/json, text/plain, */*',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ query }),
  });

  const normalizedKeyword = body.SearchQueryResult?.keywordInfo?.keyword?.trim() || '';
  const normalizedSearchKeyword = body.SearchQueryResult?.keywordInfo?.searchKeyword?.trim() || '';
  if (normalizedKeyword.length === 0 && normalizedSearchKeyword.length === 0) {
    return null;
  }

  return {
    keyword: normalizedKeyword,
    searchKeyword: normalizedSearchKeyword,
  };
}

/**
 * 키워드로 상품을 검색하여 itemCode 목록을 반환합니다.
 * 재고 조회 API는 itemCode가 필요하므로 이 함수로 먼저 변환해야 합니다.
 */
export async function fetchGs25SearchProducts(
  keyword: string,
  options: RequestOptions = {},
): Promise<Gs25SearchProduct[]> {
  const query = keyword.trim();
  if (query.length === 0) {
    return [];
  }

  const { timeout = 20000 } = options;
  const endpoint = new URL(GS25_API.TOTAL_SEARCH_PATH, GS25_API.APIGW_BASE_URL);

  const body = await fetchJson<Gs25TotalSearchResponse>(endpoint.toString(), {
    method: 'POST',
    timeout,
    headers: {
      Accept: 'application/json, text/plain, */*',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ query }),
  });

  const products: Gs25SearchProduct[] = [];
  const collections = body.SearchQueryResult?.Collection || [];

  for (const collection of collections) {
    const documents = collection.Documentset?.Document || [];
    for (const doc of documents) {
      const field = doc.field;
      if (!field?.itemCode) continue;

      products.push({
        itemCode: field.itemCode,
        itemName: field.itemName || '',
        shortItemName: field.shortItemName || '',
        imageUrl: field.itemImageUrl || '',
        rating: toNumber(field.starPoint),
        stockCheckEnabled: field.stockCheckYn === 'Y',
      });
    }
  }

  return products;
}

export function clearGs25StoresCache(): void {
  gs25StoresCache.clear();
}
/* c8 ignore stop */
