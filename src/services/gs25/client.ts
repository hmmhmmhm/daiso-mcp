/**
 * GS25 API 클라이언트
 */
/* c8 ignore start */

import { fetchJson } from '../../utils/http.js';
import { GS25_API } from './api.js';
import { normalizeStore, toNumber } from './storeUtils.js';
import type {
  Gs25Store,
  Gs25StoreStockResponse,
} from './types.js';

export {
  attachDistanceToGs25Stores,
  calculateDistanceM,
  extractGs25ProductCandidates,
  filterGs25StoresByKeyword,
  selectGs25StoresForKeyword,
  sortGs25Stores,
} from './storeUtils.js';

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
const GS25_DEFAULT_FETCH_OPTIONS = {
  retries: 1,
  retryDelayMs: 250,
} as const;

const GS25_STORES_CACHE_TTL_MS = 60 * 5 * 1000;
const gs25StoresCache = new Map<string, CacheEntry>();

function buildCacheKey(
  params: Required<Pick<FetchGs25StoresParams, 'serviceCode' | 'keyword' | 'storeCode'>> &
    Pick<FetchGs25StoresParams, 'latitude' | 'longitude' | 'itemCode'>,
): string {
  return [
    params.serviceCode,
    params.itemCode?.trim() || params.keyword,
    params.storeCode,
    typeof params.latitude === 'number' ? params.latitude : '',
    typeof params.longitude === 'number' ? params.longitude : '',
  ].join(':');
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
    ...GS25_DEFAULT_FETCH_OPTIONS,
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
    itemCode: itemCode.trim(),
    latitude,
    longitude,
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
  // 반경 조건 (미터 단위, 1km로 설정하여 인근 매장 포함)
  if (typeof latitude === 'number' && typeof longitude === 'number') {
    endpoint.searchParams.set('radiusCondition', '1000');
    // 앱에서 사용하는 추가 플래그
    endpoint.searchParams.set('pickupStoreYn', 'N');
    endpoint.searchParams.set('isSuperDlvyStoreSelected', 'N');
    endpoint.searchParams.set('isGs25DlvyStoreSelected', 'N');
  }

  const body = await fetchJson<Gs25StoreStockResponse>(endpoint.toString(), {
    ...GS25_DEFAULT_FETCH_OPTIONS,
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
    ...GS25_DEFAULT_FETCH_OPTIONS,
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
    ...GS25_DEFAULT_FETCH_OPTIONS,
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
