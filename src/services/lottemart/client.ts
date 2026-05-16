/**
 * 롯데마트 모바일 도와센터 클라이언트
 */

import { LOTTEMART_API, type LotteMartAreaCode } from './api.js';
import { DEFAULT_LOTTEMART_TIMEOUT_MS } from './config.js';
import type { FetchLotteMartStoresParams, RequestOptions, SearchLotteMartProductsParams } from './clientTypes.js';
import { __testOnlyClearLotteMartGeocodeCache, geocodeLotteMartAddress } from './geocode.js';
import {
  __testOnlyClearLotteMartSessionCache,
  fetchLotteMartHtml,
  fetchLotteMartPageWithSession,
  getCachedLotteMartSessionCookie,
} from './session.js';
import {
  attachDistance,
  fetchAllStoresForAreaList,
  fetchKeywordMatchedStores,
  getTargetAreas,
  normalizeArea,
  toDisplayArea,
} from './storeSearch.js';
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
import { createZettaFallbackStore, fetchZettaLotteMartProductsWithPrimaryError } from './zetta.js';
import type { LotteMartMarketOption, LotteMartProduct, LotteMartStore } from './types.js';

const STORE_CACHE_TTL_MS = 30 * 60 * 1000;
const LOTTEMART_PRODUCT_LEGACY_TIMEOUT_MS = 7000;
const storeCache = new Map<string, { expiresAt: number; stores: LotteMartStore[] }>();

async function getLotteMartSessionCookie(options: RequestOptions): Promise<string> {
  if (options.sessionCookie) {
    return options.sessionCookie;
  }

  return getCachedLotteMartSessionCookie(options.timeout || DEFAULT_LOTTEMART_TIMEOUT_MS);
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

  const html = await fetchLotteMartHtml(
    endpoint.toString(),
    {
      method: 'GET',
      headers: {
        Accept: 'text/html, */*; q=0.01',
        'X-Requested-With': 'XMLHttpRequest',
      },
    },
    options.timeout || DEFAULT_LOTTEMART_TIMEOUT_MS,
    await getLotteMartSessionCookie(options),
    options.zyteApiKey,
  );

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

  const html = await fetchLotteMartPageWithSession(
    LOTTEMART_API.STORE_SEARCH_PATH,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: body.toString(),
    },
    options.timeout || DEFAULT_LOTTEMART_TIMEOUT_MS,
    await getLotteMartSessionCookie(options),
    options.zyteApiKey,
  );

  const stores = parseStores(toDisplayArea(normalizedArea), html);
  storeCache.set(cacheKey, {
    expiresAt: Date.now() + STORE_CACHE_TTL_MS,
    stores,
  });

  return stores;
}

async function fetchLotteMartStoresByAreaKeyword(
  area: string,
  keyword: string,
  options: RequestOptions & { timeout: number },
): Promise<LotteMartStore[]> {
  const normalizedArea = normalizeArea(area) as LotteMartAreaCode;
  const normalizedKeyword = keyword.trim();
  const cacheKey = `${normalizedArea}:${normalizedKeyword}`;
  const cached = storeCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.stores;
  }

  const body = new URLSearchParams();
  body.set('m_area', normalizedArea);
  body.set('m_schWord', normalizedKeyword);

  const html = await fetchLotteMartPageWithSession(
    LOTTEMART_API.STORE_SEARCH_PATH,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: body.toString(),
    },
    options.timeout,
    await getLotteMartSessionCookie(options),
    options.zyteApiKey,
  );

  const stores = parseStores(toDisplayArea(normalizedArea), html);
  storeCache.set(cacheKey, {
    expiresAt: Date.now() + STORE_CACHE_TTL_MS,
    stores,
  });

  return stores;
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
  const { timeout = DEFAULT_LOTTEMART_TIMEOUT_MS, googleMapsApiKey } = options;
  if (area && !normalizeArea(area)) {
    throw new Error(`지원하지 않는 지역입니다: ${area}`);
  }

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

  const sessionCookie = await getLotteMartSessionCookie({ timeout });

  const targetAreas = getTargetAreas(area);
  const hasKeyword = keyword.trim().length > 0;
  const fetchAreaStores = (currentArea: string) =>
    hasKeyword
      ? fetchLotteMartStoresByAreaKeyword(currentArea, keyword, {
          timeout,
          sessionCookie,
          zyteApiKey: options.zyteApiKey,
        })
      : fetchLotteMartStoresByArea(currentArea, { timeout, sessionCookie, zyteApiKey: options.zyteApiKey });

  const keywordMatchedStores = hasKeyword
    ? await fetchKeywordMatchedStores(targetAreas, keyword, brandVariant, limit, fetchAreaStores)
    : [];
  const useKeywordMatchedStores = keywordMatchedStores.length > 0 || hasKeyword;
  const stores = useKeywordMatchedStores
    ? keywordMatchedStores
    : await fetchAllStoresForAreaList(targetAreas, fetchAreaStores);

  const filtered = attachDistance(
    useKeywordMatchedStores
      ? stores
      : stores
          .filter((store) => matchesKeyword(store, keyword))
          .filter((store) => matchesBrandVariant(store, brandVariant)),
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

  const timeout = options.timeout || DEFAULT_LOTTEMART_TIMEOUT_MS;
  const sessionCookie = await getLotteMartSessionCookie({ timeout: LOTTEMART_PRODUCT_LEGACY_TIMEOUT_MS });

  let resolvedStore: LotteMartMarketOption | null;
  try {
    resolvedStore = await resolveLotteMartStore(params.area, params.storeCode, params.storeName, {
      timeout: LOTTEMART_PRODUCT_LEGACY_TIMEOUT_MS,
      sessionCookie,
      zyteApiKey: options.zyteApiKey,
    });
  } catch (error) {
    const fallbackStore = createZettaFallbackStore(params);
    return fetchZettaLotteMartProductsWithPrimaryError(
      fallbackStore,
      normalizedKeyword,
      params.pageLimit || 3,
      timeout,
      error,
    );
  }
  if (!resolvedStore) {
    throw new Error('검색할 롯데마트 매장을 찾지 못했습니다. area와 storeCode/storeName을 확인해주세요.');
  }

  const initialBody = new URLSearchParams();
  initialBody.set('p_area', normalizeArea(resolvedStore.area) as LotteMartAreaCode);
  initialBody.set('p_market', resolvedStore.storeCode);
  initialBody.set('p_schWord', normalizedKeyword);

  let initialHtml: string;
  try {
    initialHtml = await fetchLotteMartPageWithSession(
      LOTTEMART_API.PRODUCT_SEARCH_PATH,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: initialBody.toString(),
      },
      LOTTEMART_PRODUCT_LEGACY_TIMEOUT_MS,
      sessionCookie,
      options.zyteApiKey,
    );
  } catch (error) {
    return fetchZettaLotteMartProductsWithPrimaryError(
      resolvedStore,
      normalizedKeyword,
      params.pageLimit || 3,
      timeout,
      error,
    );
  }
  const pagedSessionCookie = await getCachedLotteMartSessionCookie(LOTTEMART_PRODUCT_LEGACY_TIMEOUT_MS);

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

      return fetchLotteMartHtml(
        endpoint.toString(),
        {
          method: 'GET',
          headers: {
            Accept: 'text/html, */*; q=0.01',
            'X-Requested-With': 'XMLHttpRequest',
          },
        },
        LOTTEMART_PRODUCT_LEGACY_TIMEOUT_MS,
        pagedSessionCookie,
        options.zyteApiKey,
      );
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

export { calculateDistanceM, geocodeLotteMartAddress };

export function __testOnlyClearLotteMartCaches(): void {
  storeCache.clear();
  __testOnlyClearLotteMartGeocodeCache();
  __testOnlyClearLotteMartSessionCache();
}
