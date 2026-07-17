/**
 * GS25 API 클라이언트
 */
/* c8 ignore start */

import { fetchJson, fetchWithTimeout, HttpError } from '../../utils/http.js';
import { decodeZyteHttpBody, requestByZyte } from '../../utils/zyte.js';
import { GS25_API } from './api.js';
import { normalizeStore, toNumber } from './storeUtils.js';
import type { Gs25Store, Gs25StoreStockResponse } from './types.js';

export {
  fetchGs25NormalizedKeyword,
  fetchGs25SearchProducts,
  type Gs25SearchProduct,
} from './productSearch.js';
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
  zyteApiKey?: string;
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

interface Gs25WebLocationStore {
  shopCode?: string;
  shopName?: string;
  address?: string;
  longs?: string | number;
  lat?: string | number;
  offeringService?: string[];
}

interface Gs25WebLocationResponse {
  results?: Gs25WebLocationStore[];
  pagination?: {
    totalNumberOfResults?: number;
  };
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
  'Accept-Language': 'ko-KR,ko;q=0.9,en-US;q=0.8,en;q=0.7',
  'User-Agent':
    'Mozilla/5.0 (Linux; Android 15; SM-S928N) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/124.0 Mobile Safari/537.36',
  Origin: 'https://woodongs.com',
  Referer: 'https://woodongs.com/',
} as const;
const GS25_DEFAULT_FETCH_OPTIONS = {
  retries: 1,
  retryDelayMs: 250,
} as const;

const GS25_STORES_CACHE_TTL_MS = 60 * 5 * 1000;
const gs25StoresCache = new Map<string, CacheEntry>();

function extractGs25WebCsrfToken(html: string): string | null {
  return (
    html.match(/name="CSRFToken"\s+value="([^"]+)"/)?.[1] ||
    html.match(/ACC\.config\.CSRFToken\s*=\s*"([^"]+)"/)?.[1] ||
    null
  );
}

function extractGs25WebCookieHeader(headers: Headers): string | undefined {
  const setCookie = headers.get('set-cookie') || '';
  const jsessionId = setCookie.match(/JSESSIONID=[^;,\s]+/)?.[0];
  return jsessionId;
}

function parseGs25WebLocationResponse(
  body: string | Gs25WebLocationResponse,
): Gs25WebLocationResponse {
  if (typeof body === 'string') {
    return JSON.parse(body) as Gs25WebLocationResponse;
  }
  return body;
}

function normalizeGs25WebStore(raw: Gs25WebLocationStore): Gs25Store {
  const propertyNames = (raw.offeringService || []).filter((item) => item.trim().length > 0);

  return {
    storeCode: raw.shopCode || '',
    storeName: raw.shopName || '',
    address: raw.address || '',
    phone: '',
    latitude: toNumber(raw.longs),
    longitude: toNumber(raw.lat),
    serviceCode: '01',
    realStockQuantity: 0,
    pickupStockQuantity: 0,
    deliveryStockQuantity: 0,
    isSoldOut: false,
    searchItemName: '',
    searchItemSellPrice: null,
    propertyNames,
    properties: propertyNames.map((name) => ({
      code: name,
      name,
      type: 'service',
      imageUrl: '',
    })),
    distanceM: null,
  };
}

async function fetchGs25StoreStock(
  url: string,
  options: RequestOptions,
): Promise<Gs25StoreStockResponse> {
  try {
    return await fetchJson<Gs25StoreStockResponse>(url, {
      ...GS25_DEFAULT_FETCH_OPTIONS,
      method: 'GET',
      timeout: options.timeout,
      headers: GS25_DEFAULT_HEADERS,
    });
  } catch (error) {
    const zyteApiKey = options.zyteApiKey?.trim();
    if (!(error instanceof HttpError) || error.status !== 403 || !zyteApiKey) {
      throw error;
    }

    const result = await requestByZyte({
      apiKey: zyteApiKey,
      url,
      method: 'GET',
      timeout: options.timeout,
      retries: 1,
      headers: Object.entries(GS25_DEFAULT_HEADERS).map(([name, value]) => ({ name, value })),
      tags: { service: 'gs25' },
    });
    return decodeZyteHttpBody<Gs25StoreStockResponse>(result);
  }
}

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

export async function fetchGs25WebStores(
  keyword: string,
  options: RequestOptions = {},
): Promise<{ totalCount: number; stores: Gs25Store[] }> {
  const query = keyword.trim();
  if (query.length === 0) {
    return { totalCount: 0, stores: [] };
  }

  const { timeout = 20000 } = options;
  const locationsUrl = new URL(GS25_API.WEB_LOCATIONS_PATH, GS25_API.WEB_BASE_URL);
  const locationsResponse = await fetchWithTimeout(locationsUrl.toString(), {
    ...GS25_DEFAULT_FETCH_OPTIONS,
    method: 'GET',
    timeout,
    headers: {
      Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      'Accept-Language': GS25_DEFAULT_HEADERS['Accept-Language'],
      'User-Agent': GS25_DEFAULT_HEADERS['User-Agent'],
    },
  });

  if (!locationsResponse.ok) {
    throw new HttpError(
      locationsResponse.status,
      locationsResponse.statusText,
      await locationsResponse.text(),
    );
  }

  const html = await locationsResponse.text();
  const csrfToken = extractGs25WebCsrfToken(html);
  if (!csrfToken) {
    throw new Error('GS25 웹 매장 검색 CSRF 토큰을 찾을 수 없습니다.');
  }

  const form = new URLSearchParams({
    pageNum: '1',
    pageSize: '50',
    searchShopName: query,
    searchSido: '',
    searchGugun: '',
    searchDong: '',
    searchType: '',
    searchTypeService: '0',
    searchTypeToto: '0',
    searchTypeCafe25: '0',
    searchTypeInstant: '0',
    searchTypeDrug: '0',
    searchTypeSelf25: '0',
    searchTypePost: '0',
    searchTypeATM: '0',
    searchTypeWithdrawal: '0',
    searchTypeTaxrefund: '0',
    searchTypeSmartAtm: '0',
    searchTypeSelfCookingUtensils: '0',
    searchTypeDeliveryService: '0',
    searchTypeParcelService: '0',
    searchTypePotatoes: '0',
    searchTypeCardiacDefi: '0',
    searchTypeFishShapedBun: '0',
    searchTypeWine25: '0',
    searchTypeGoPizza: '0',
    searchTypeSpiritWine: '0',
    searchTypeFreshGanghw: '0',
    searchTypeMusinsa: '0',
    searchTypePosa: '0',
  });
  const locationListUrl = new URL(GS25_API.WEB_LOCATION_LIST_PATH, GS25_API.WEB_BASE_URL);
  locationListUrl.searchParams.set('CSRFToken', csrfToken);
  const cookieHeader = extractGs25WebCookieHeader(locationsResponse.headers);

  const body = parseGs25WebLocationResponse(
    await fetchJson<string | Gs25WebLocationResponse>(locationListUrl.toString(), {
      ...GS25_DEFAULT_FETCH_OPTIONS,
      method: 'POST',
      retryUnsafeMethods: true,
      timeout,
      headers: {
        Accept: 'application/json, text/javascript, */*; q=0.01',
        'Accept-Language': GS25_DEFAULT_HEADERS['Accept-Language'],
        'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
        Referer: locationsUrl.toString(),
        'User-Agent': GS25_DEFAULT_HEADERS['User-Agent'],
        'X-Requested-With': 'XMLHttpRequest',
        ...(cookieHeader ? { Cookie: cookieHeader } : {}),
      },
      body: form.toString(),
    }),
  );
  const stores = (body.results || [])
    .map(normalizeGs25WebStore)
    .filter((store) => store.storeCode.length > 0);

  return {
    totalCount:
      typeof body.pagination?.totalNumberOfResults === 'number'
        ? body.pagination.totalNumberOfResults
        : stores.length,
    stores,
  };
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
    pageNumber,
    pageCount,
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
  endpoint.searchParams.set('realTimeStockYn', realTimeStockYn);
  if (typeof pageNumber === 'number' && Number.isFinite(pageNumber)) {
    endpoint.searchParams.set('pageNumber', String(Math.trunc(pageNumber)));
  }
  if (typeof pageCount === 'number' && Number.isFinite(pageCount)) {
    endpoint.searchParams.set('pageCount', String(Math.trunc(pageCount)));
  }

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

  const body = await fetchGs25StoreStock(endpoint.toString(), {
    timeout,
    zyteApiKey: options.zyteApiKey,
  });

  const stores = (body.stores || [])
    .map(normalizeStore)
    .filter((store) => store.storeCode.length > 0);

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

export function clearGs25StoresCache(): void {
  gs25StoresCache.clear();
}
/* c8 ignore stop */
