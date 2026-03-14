/**
 * 세븐일레븐 재고 조회 클라이언트
 *
 * 상품 검색 + 매장 검색 + 재고 API를 조합하여 재고 정보를 제공합니다.
 * 재고 API가 암호화로 차단된 경우에도 상품/매장 정보를 graceful하게 반환합니다.
 */
/* c8 ignore start */

import { fetchJson, HttpError } from '../../utils/http.js';
import { SEVENELEVEN_API } from './api.js';
import {
  fetchSevenElevenStockProductMeta,
  fetchSevenElevenStoresByKeyword,
  searchSevenElevenProducts,
} from './client.js';
import type {
  SevenElevenApiEnvelope,
  SevenElevenStockError,
  SevenElevenStockProductMeta,
  SevenElevenStockResult,
  SevenElevenStockStore,
  SevenElevenStore,
} from './types.js';

interface RequestOptions {
  timeout?: number;
}

interface CheckInventoryParams {
  productKeyword: string;
  storeKeyword: string;
  storeLimit?: number;
}

interface StockApiData {
  smCd?: string;
  storeList?: unknown[];
}

interface StockApiAttemptResult {
  stores: SevenElevenStockStore[] | null;
  error: SevenElevenStockError | null;
}

interface RealStockRequestPayload {
  smCd: string;
  stokMngCd: string;
  stokMngQty: number;
  stockApplicationRate: string;
  storeList: string[];
}

interface StockApiStoreRaw {
  storeCd?: string;
  stock?: string | number;
  stokMngQty?: string | number;
  [key: string]: unknown;
}

const SEVENELEVEN_DEFAULT_HEADERS = {
  Accept: 'application/json, text/plain, */*',
  'Content-Type': 'application/json',
  'User-Agent': 'Mozilla/5.0 (Linux; Android 15)',
} as const;

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

function toStringValue(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

function toBooleanYn(value: unknown): boolean {
  const normalized = toStringValue(value).trim().toUpperCase();
  return normalized === 'Y' || normalized === 'TRUE' || normalized === '1';
}

function normalizeStockStore(raw: StockApiStoreRaw): SevenElevenStockStore {
  return {
    storeCode: toStringValue(raw.storeCd),
    storeName: '',
    address: '',
    latitude: 0,
    longitude: 0,
    stockQuantity: toNumber(raw.stock),
    isSoldOut: toNumber(raw.stock) <= 0,
    distanceM: null,
  };
}

function tryParseJsonObject(text: string): Record<string, unknown> | null {
  if (text.trim().length === 0) {
    return null;
  }

  try {
    const parsed = JSON.parse(text) as unknown;
    return typeof parsed === 'object' && parsed !== null ? (parsed as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

function toNullableNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === 'string' && value.trim().length > 0) {
    const parsed = Number.parseFloat(value);
    return Number.isFinite(parsed) ? parsed : null;
  }

  return null;
}

function normalizeEnvelopeError(
  response: SevenElevenApiEnvelope<unknown>,
): SevenElevenStockError | null {
  const hasErrorFlag = response.success === false;
  const hasErrorCode =
    typeof response.code === 'number' && (response.code < 200 || response.code >= 300);
  const hasErrorMessage = typeof response.message === 'string' && response.message.trim().length > 0;

  if (response.success === true && !hasErrorCode) {
    return null;
  }

  if (!hasErrorFlag && !hasErrorCode && !hasErrorMessage) {
    return null;
  }

  return {
    cause: 'api',
    httpStatus: null,
    code: toNullableNumber(response.code),
    message: typeof response.message === 'string' ? response.message : '재고 API가 오류를 반환했습니다.',
    raw: JSON.stringify(response),
  };
}

function normalizeStockError(error: unknown): SevenElevenStockError {
  if (error instanceof HttpError) {
    const parsedBody = tryParseJsonObject(error.bodyText);
    return {
      cause: 'api',
      httpStatus: error.status,
      code: toNullableNumber(parsedBody?.code),
      message:
        typeof parsedBody?.message === 'string' && parsedBody.message.trim().length > 0
          ? parsedBody.message
          : error.message,
      raw: error.bodyText.trim().length > 0 ? error.bodyText : null,
    };
  }

  if (error instanceof Error) {
    return {
      cause: 'network',
      httpStatus: null,
      code: null,
      message: error.message,
      raw: null,
    };
  }

  return {
    cause: 'unknown',
    httpStatus: null,
    code: null,
    message: '알 수 없는 재고 API 오류',
    raw: null,
  };
}

function haversineDistanceM(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371000;
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function attachDistanceToStockStores(
  stores: SevenElevenStockStore[],
  refLat: number,
  refLon: number,
): SevenElevenStockStore[] {
  return stores.map((store) => {
    if (store.latitude === 0 && store.longitude === 0) {
      return store;
    }

    return {
      ...store,
      distanceM: Math.round(haversineDistanceM(refLat, refLon, store.latitude, store.longitude)),
    };
  });
}

function normalizeStoreKeyword(keyword: string): string {
  return keyword
    .trim()
    .replace(/\s+/g, '')
    .replace(/(역|지점|점)$/g, '')
    .toLowerCase();
}

function tokenizeStoreKeyword(keyword: string): string[] {
  return keyword
    .trim()
    .split(/\s+/)
    .map((token) => normalizeStoreKeyword(token))
    .filter((token) => token.length > 0);
}

function filterStoresByKeyword<T extends { storeName: string; address: string }>(
  stores: T[],
  keyword: string,
): T[] {
  if (!keyword || keyword.trim().length === 0) {
    return stores;
  }

  const normalized = normalizeStoreKeyword(keyword);
  const exactMatched = stores.filter((store) => {
    const nameNorm = store.storeName.replace(/\s+/g, '').toLowerCase();
    const addrNorm = store.address.replace(/\s+/g, '').toLowerCase();
    return nameNorm.includes(normalized) || addrNorm.includes(normalized);
  });

  if (exactMatched.length > 0) {
    return exactMatched;
  }

  const tokens = tokenizeStoreKeyword(keyword).filter((token) => token.length >= 2);
  if (tokens.length === 0) {
    return stores;
  }

  const tokenMatched = stores.filter((store) => {
    const combined = `${store.storeName} ${store.address}`.replace(/\s+/g, '').toLowerCase();
    return tokens.every((token) => combined.includes(token));
  });

  return tokenMatched.length > 0 ? tokenMatched : stores;
}

async function tryStockApi(
  stockProduct: SevenElevenStockProductMeta,
  stores: SevenElevenStore[],
  options: RequestOptions = {},
): Promise<StockApiAttemptResult> {
  const { timeout = 15000 } = options;
  const url = `${SEVENELEVEN_API.BASE_URL}${SEVENELEVEN_API.REAL_STOCK_MULTI_PATH}/01/stocks`;
  const payload: RealStockRequestPayload = {
    smCd: stockProduct.smCode,
    stokMngCd: stockProduct.stockManagementCode,
    stokMngQty: stockProduct.stockManagementQuantity,
    stockApplicationRate: stockProduct.stockApplicationRate,
    storeList: stores.map((store) => store.storeCode).filter((storeCode) => storeCode.length > 0),
  };

  if (payload.smCd.length === 0 || payload.stokMngCd.length === 0 || payload.storeList.length === 0) {
    return { stores: null, error: null };
  }

  try {
    const response = await fetchJson<SevenElevenApiEnvelope<StockApiData>>(url, {
      method: 'POST',
      timeout,
      headers: SEVENELEVEN_DEFAULT_HEADERS,
      body: JSON.stringify(payload),
    });

    const responseError = normalizeEnvelopeError(response);
    if (responseError) {
      return { stores: null, error: responseError };
    }

    const data = response.data || {};
    const rawStores = Array.isArray(data.storeList) ? data.storeList : [];

    return {
      stores: rawStores
        .map((item) => normalizeStockStore(item as StockApiStoreRaw))
        .filter((store) => store.storeCode.length > 0),
      error: null,
    };
  } catch (error) {
    return {
      stores: null,
      error: normalizeStockError(error),
    };
  }
}

export async function checkSevenElevenInventory(
  params: CheckInventoryParams,
  options: RequestOptions = {},
): Promise<SevenElevenStockResult> {
  const { productKeyword, storeKeyword, storeLimit = 20 } = params;

  // 1) 상품 검색
  const productResult = await searchSevenElevenProducts({ query: productKeyword }, options);
  const firstProduct = productResult.products.find((p) => p.itemCode.length > 0) || productResult.products[0] || null;

  // 2) 매장 검색
  const storeResult = await fetchSevenElevenStoresByKeyword({ keyword: storeKeyword, limit: 100 }, options);
  const matchedStores = filterStoresByKeyword(storeResult.stores, storeKeyword);

  // 3) 재고 API 시도 (실패 시 graceful fallback)
  let stockStores: SevenElevenStockStore[] | null = null;
  let stockError: SevenElevenStockError | null = null;
  if (firstProduct && firstProduct.itemCode.length > 0) {
    try {
      const stockProduct = await fetchSevenElevenStockProductMeta(firstProduct.itemCode, options);
      if (stockProduct) {
        const stockAttempt = await tryStockApi(stockProduct, matchedStores, options);
        stockStores = stockAttempt.stores;
        stockError = stockAttempt.error;
      }
    } catch (error) {
      stockError = normalizeStockError(error);
    }
  }

  // 4) 결과 조합
  let resultStores: SevenElevenStockStore[];
  let stockAvailable: boolean;

  if (stockStores !== null && stockStores.length > 0) {
    stockAvailable = true;
    const stockMap = new Map(stockStores.map((store) => [store.storeCode, store]));
    resultStores = matchedStores.map((store) => {
      const stockStore = stockMap.get(store.storeCode);
      return {
        storeCode: store.storeCode,
        storeName: store.storeName,
        address: store.address,
        latitude: store.latitude,
        longitude: store.longitude,
        stockQuantity: stockStore?.stockQuantity ?? -1,
        isSoldOut: stockStore ? stockStore.isSoldOut : false,
        distanceM: null,
      };
    });
  } else {
    stockAvailable = false;
    resultStores = matchedStores.map((store) => ({
      storeCode: store.storeCode,
      storeName: store.storeName,
      address: store.address,
      latitude: store.latitude,
      longitude: store.longitude,
      stockQuantity: -1,
      isSoldOut: false,
      distanceM: null,
    }));
  }

  // 거리 계산: 첫 번째 매장 좌표를 기준으로 정렬
  const refStore = matchedStores.find((s) => s.latitude !== 0 && s.longitude !== 0);
  if (refStore) {
    resultStores = attachDistanceToStockStores(resultStores, refStore.latitude, refStore.longitude);
    resultStores.sort((a, b) => {
      if (a.distanceM === null && b.distanceM === null) return 0;
      if (a.distanceM === null) return 1;
      if (b.distanceM === null) return -1;
      return a.distanceM - b.distanceM;
    });
  }

  const limited = resultStores.slice(0, storeLimit);
  const inStockCount = stockAvailable ? limited.filter((s) => s.stockQuantity > 0).length : 0;

  return {
    productKeyword,
    product: firstProduct
      ? {
          itemCode: firstProduct.itemCode,
          itemName: firstProduct.itemName,
          salePrice: firstProduct.salePrice,
          imageUrl: firstProduct.imageUrl,
        }
      : null,
    stockAvailable,
    stockError,
    totalStoreCount: resultStores.length,
    inStockStoreCount: inStockCount,
    stores: limited,
  };
}
/* c8 ignore stop */
