/**
 * 롯데마트 모바일 도와센터 클라이언트
 */

import { fetchJson, fetchText } from '../../utils/http.js';
import { LOTTEMART_AREAS, LOTTEMART_API, type LotteMartAreaCode } from './api.js';
import {
  calculateDistanceM,
  dedupeProducts,
  matchesBrandVariant,
  matchesKeyword,
  parseMarketOptions,
  parseProductSummary,
  parseProducts,
  parseStores,
  sortStores,
} from './parser.js';
import type { LotteMartMarketOption, LotteMartProduct, LotteMartStore } from './types.js';

interface RequestOptions {
  timeout?: number;
  googleMapsApiKey?: string;
}

interface FetchLotteMartStoresParams {
  area?: string;
  keyword?: string;
  brandVariant?: string;
  latitude?: number;
  longitude?: number;
  limit?: number;
}

interface SearchLotteMartProductsParams {
  area?: string;
  storeCode?: string;
  storeName?: string;
  keyword: string;
  pageLimit?: number;
}

interface GoogleGeocodeResponse {
  status: string;
  results?: Array<{
    geometry?: {
      location?: {
        lat?: number;
        lng?: number;
      };
    };
  }>;
}

const STORE_CACHE_TTL_MS = 30 * 60 * 1000;
const GEOCODE_CACHE_TTL_MS = 24 * 60 * 60 * 1000;
const storeCache = new Map<string, { expiresAt: number; stores: LotteMartStore[] }>();
const geocodeCache = new Map<string, { expiresAt: number; value: { latitude: number; longitude: number } | null }>();

function normalizeArea(area?: string): LotteMartAreaCode | undefined {
  const trimmed = (area || '').trim();
  if (trimmed.length === 0) {
    return undefined;
  }

  if (trimmed === '제주') {
    return '기타';
  }

  return LOTTEMART_AREAS.find((value) => value === trimmed);
}

function toDisplayArea(area: LotteMartAreaCode | string): string {
  return area === '기타' ? '제주' : area;
}

function fetchLotteMartPage(path: string, init: RequestInit, timeout: number): Promise<string> {
  return fetchText(`${LOTTEMART_API.BASE_URL}${path}`, {
    ...init,
    timeout,
    headers: {
      Accept: 'text/html, */*; q=0.01',
      ...init.headers,
    },
  });
}

export async function fetchLotteMartMarketOptions(
  area: string,
  type: '1' | '2',
  options: RequestOptions = {},
): Promise<LotteMartMarketOption[]> {
  const normalizedArea = normalizeArea(area);
  if (!normalizedArea) {
    throw new Error(`지원하지 않는 지역입니다: ${area}`);
  }

  const endpoint = new URL(LOTTEMART_API.MARKET_OPTIONS_PATH, LOTTEMART_API.BASE_URL);
  endpoint.searchParams.set('p_area', normalizedArea);
  endpoint.searchParams.set('p_type', type);

  const html = await fetchText(endpoint.toString(), {
    method: 'GET',
    timeout: options.timeout || 15000,
    headers: {
      Accept: 'text/html, */*; q=0.01',
      'X-Requested-With': 'XMLHttpRequest',
    },
  });

  return parseMarketOptions(toDisplayArea(normalizedArea), html);
}

export async function fetchLotteMartStoresByArea(
  area: string,
  options: RequestOptions = {},
): Promise<LotteMartStore[]> {
  const normalizedArea = normalizeArea(area);
  if (!normalizedArea) {
    throw new Error(`지원하지 않는 지역입니다: ${area}`);
  }

  const cacheKey = normalizedArea;
  const cached = storeCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.stores;
  }

  const body = new URLSearchParams();
  body.set('m_area', normalizedArea);

  const html = await fetchLotteMartPage(
    LOTTEMART_API.STORE_SEARCH_PATH,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: body.toString(),
    },
    options.timeout || 15000,
  );

  const stores = parseStores(toDisplayArea(normalizedArea), html);
  storeCache.set(cacheKey, {
    expiresAt: Date.now() + STORE_CACHE_TTL_MS,
    stores,
  });

  return stores;
}

export async function geocodeLotteMartAddress(address: string, options: RequestOptions = {}) {
  const keyword = address.trim();
  if (keyword.length === 0) {
    return null;
  }

  const cached = geocodeCache.get(keyword);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.value;
  }

  const apiKey = (options.googleMapsApiKey || '').trim();
  if (apiKey.length === 0) {
    return null;
  }

  const endpoint = new URL('https://maps.googleapis.com/maps/api/geocode/json');
  endpoint.searchParams.set('address', keyword);
  endpoint.searchParams.set('key', apiKey);

  const body = await fetchJson<GoogleGeocodeResponse>(endpoint.toString(), {
    method: 'GET',
    timeout: options.timeout || 15000,
    headers: {
      Accept: 'application/json',
    },
  });

  if (body.status !== 'OK') {
    geocodeCache.set(keyword, {
      expiresAt: Date.now() + GEOCODE_CACHE_TTL_MS,
      value: null,
    });
    return null;
  }

  const latitude = body.results?.[0]?.geometry?.location?.lat;
  const longitude = body.results?.[0]?.geometry?.location?.lng;
  const value =
    typeof latitude === 'number' && typeof longitude === 'number' ? { latitude, longitude } : null;

  geocodeCache.set(keyword, {
    expiresAt: Date.now() + GEOCODE_CACHE_TTL_MS,
    value,
  });

  return value;
}

function getTargetAreas(area?: string): string[] {
  return area ? [area] : [...LOTTEMART_AREAS];
}

function attachDistance(
  stores: LotteMartStore[],
  latitude: number | undefined,
  longitude: number | undefined,
): LotteMartStore[] {
  return stores.map((store) => {
    if (typeof latitude !== 'number' || typeof longitude !== 'number') {
      return store;
    }

    if (store.latitude === 0 || store.longitude === 0) {
      return store;
    }

    return {
      ...store,
      distanceM: calculateDistanceM(latitude, longitude, store.latitude, store.longitude),
    };
  });
}

export async function fetchLotteMartStores(
  params: FetchLotteMartStoresParams = {},
  options: RequestOptions = {},
): Promise<{
  stores: LotteMartStore[];
  location: { latitude: number; longitude: number } | null;
  geocodeUsed: boolean;
}> {
  const { area, keyword = '', brandVariant = '', latitude, longitude, limit = 20 } = params;
  const { timeout = 15000, googleMapsApiKey } = options;

  let resolvedLatitude = latitude;
  let resolvedLongitude = longitude;
  let geocodeUsed = false;

  if (
    (typeof resolvedLatitude !== 'number' || typeof resolvedLongitude !== 'number') &&
    keyword.trim().length > 0
  ) {
    const geocoded = await geocodeLotteMartAddress(keyword, { timeout, googleMapsApiKey });
    if (geocoded) {
      resolvedLatitude = geocoded.latitude;
      resolvedLongitude = geocoded.longitude;
      geocodeUsed = true;
    }
  }

  const stores = (await Promise.all(getTargetAreas(area).map((value) => fetchLotteMartStoresByArea(value, { timeout })))).flat();
  const filtered = attachDistance(
    stores.filter((store) => matchesKeyword(store, keyword)).filter((store) => matchesBrandVariant(store, brandVariant)),
    resolvedLatitude,
    resolvedLongitude,
  );

  const enriched = await Promise.all(
    filtered.map(async (store) => {
      if (
        typeof resolvedLatitude !== 'number' ||
        typeof resolvedLongitude !== 'number' ||
        store.latitude !== 0 ||
        store.longitude !== 0
      ) {
        return store;
      }

      const geocoded = await geocodeLotteMartAddress(store.address, { timeout, googleMapsApiKey });
      if (!geocoded) {
        return store;
      }

      return {
        ...store,
        latitude: geocoded.latitude,
        longitude: geocoded.longitude,
        distanceM: calculateDistanceM(resolvedLatitude, resolvedLongitude, geocoded.latitude, geocoded.longitude),
      };
    }),
  );

  return {
    stores: sortStores(enriched).slice(0, limit),
    location:
      typeof resolvedLatitude === 'number' && typeof resolvedLongitude === 'number'
        ? { latitude: resolvedLatitude, longitude: resolvedLongitude }
        : null,
    geocodeUsed,
  };
}

export async function resolveLotteMartStore(
  area: string | undefined,
  storeCode: string | undefined,
  storeName: string | undefined,
  options: RequestOptions = {},
): Promise<LotteMartMarketOption | null> {
  const normalizedStoreCode = (storeCode || '').trim();
  if (normalizedStoreCode.length > 0) {
    for (const currentArea of getTargetAreas(area)) {
      const matched = (await fetchLotteMartMarketOptions(currentArea, '1', options)).find(
        (item) => item.storeCode === normalizedStoreCode,
      );
      if (matched) {
        return matched;
      }
    }

    return null;
  }

  const normalizedStoreName = (storeName || '').trim().toLowerCase();
  if (normalizedStoreName.length === 0) {
    return null;
  }

  const allOptions = (
    await Promise.all(getTargetAreas(area).map((currentArea) => fetchLotteMartMarketOptions(currentArea, '1', options)))
  ).flat();

  return (
    allOptions.find((item) => item.storeName.toLowerCase() === normalizedStoreName) ||
    allOptions.find((item) => item.storeName.toLowerCase().includes(normalizedStoreName)) ||
    null
  );
}

export async function searchLotteMartProducts(
  params: SearchLotteMartProductsParams,
  options: RequestOptions = {},
): Promise<{
  area: string;
  storeCode: string;
  storeName: string;
  totalCount: number;
  totalPages: number;
  products: LotteMartProduct[];
}> {
  const normalizedKeyword = params.keyword.trim();
  if (normalizedKeyword.length === 0) {
    throw new Error('상품 검색어(keyword)를 입력해주세요.');
  }

  const resolvedStore = await resolveLotteMartStore(params.area, params.storeCode, params.storeName, {
    timeout: options.timeout || 15000,
  });
  if (!resolvedStore) {
    throw new Error('검색할 롯데마트 매장을 찾지 못했습니다. area와 storeCode/storeName을 확인해주세요.');
  }

  const initialBody = new URLSearchParams();
  initialBody.set('p_area', normalizeArea(resolvedStore.area) || '서울');
  initialBody.set('p_market', resolvedStore.storeCode);
  initialBody.set('p_schWord', normalizedKeyword);

  const initialHtml = await fetchLotteMartPage(
    LOTTEMART_API.PRODUCT_SEARCH_PATH,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: initialBody.toString(),
    },
    options.timeout || 15000,
  );

  const summary = parseProductSummary(initialHtml);
  const firstPageProducts = parseProducts(
    resolvedStore.area,
    resolvedStore.storeCode,
    resolvedStore.storeName,
    normalizedKeyword,
    initialHtml,
  );

  const maxPage = Math.min(Math.max(params.pageLimit || 3, 1), Math.max(summary.totalPages, 1));
  const pageHtmlList = await Promise.all(
    Array.from({ length: Math.max(maxPage - 1, 0) }, (_, index) => index + 2).map((page) => {
      const endpoint = new URL(LOTTEMART_API.PRODUCT_PAGE_PATH, LOTTEMART_API.BASE_URL);
      endpoint.searchParams.set('p_market', resolvedStore.storeCode);
      endpoint.searchParams.set('p_schWord', normalizedKeyword);
      endpoint.searchParams.set('page', String(page));

      return fetchText(endpoint.toString(), {
        method: 'GET',
        timeout: options.timeout || 15000,
        headers: {
          Accept: 'text/html, */*; q=0.01',
          'X-Requested-With': 'XMLHttpRequest',
        },
      });
    }),
  );

  const pagedProducts = pageHtmlList.flatMap((html) =>
    parseProducts(resolvedStore.area, resolvedStore.storeCode, resolvedStore.storeName, normalizedKeyword, html),
  );

  return {
    area: resolvedStore.area,
    storeCode: resolvedStore.storeCode,
    storeName: resolvedStore.storeName,
    totalCount: summary.totalCount,
    totalPages: summary.totalPages,
    products: dedupeProducts([...firstPageProducts, ...pagedProducts]),
  };
}

export { calculateDistanceM };

export function __testOnlyClearLotteMartCaches(): void {
  storeCache.clear();
  geocodeCache.clear();
}
