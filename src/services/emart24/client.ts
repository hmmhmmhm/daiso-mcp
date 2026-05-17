/**
 * 이마트24 API 클라이언트
 */

import { fetchJson } from '../../utils/http.js';
import { EMART24_API } from './api.js';
import type {
  Emart24Product,
  Emart24ProductSearchResponse,
  Emart24StockByStoreResponse,
  Emart24Store,
  Emart24StoreDetailResponse,
  Emart24WebStoreResponse,
} from './types.js';

interface RequestOptions {
  timeout?: number;
}

interface FetchEmart24StoresParams {
  keyword?: string;
  area1?: string;
  area2?: string;
  page?: number;
  service24h?: boolean;
}

interface SearchEmart24ProductsParams {
  keyword: string;
  page?: number;
  pageSize?: number;
  sortType?: 'SALE' | 'LATEST' | 'PRICE_ASC' | 'PRICE_DESC';
  saleProductYn?: 'Y' | 'N';
}

interface SearchEmart24StockByStoresParams {
  pluCd: string;
  bizNos: string[];
}

const EMART24_JSON_HEADERS = {
  Accept: 'application/json, text/javascript, */*; q=0.01',
  'X-Requested-With': 'XMLHttpRequest',
} as const;

const EMART24_FORM_HEADERS = {
  'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
  Accept: 'application/json, text/javascript, */*; q=0.01',
  'X-Requested-With': 'XMLHttpRequest',
} as const;
const EMART24_DEFAULT_FETCH_OPTIONS = {
  retries: 1,
  retryDelayMs: 250,
} as const;

function buildKeywordVariants(keyword: string): string[] {
  const trimmed = keyword.trim();
  if (trimmed.length === 0) {
    return [''];
  }

  const tokens = trimmed.split(/\s+/).filter((token) => token.length > 0);
  const variants = [
    trimmed,
    trimmed.replace(/\s+/g, ''),
    ...tokens,
    ...tokens.map((token) => token.replace(/역$/, '')),
  ].filter((value) => value.length > 0);

  return [...new Set(variants)];
}

function toNumber(value: unknown): number {
  if (typeof value === 'number') {
    return value;
  }

  if (typeof value === 'string') {
    const parsed = Number.parseFloat(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }

  return 0;
}

function toBooleanFlag(value: unknown): boolean {
  if (typeof value === 'boolean') {
    return value;
  }

  const normalized = String(value || '').trim().toUpperCase();
  return normalized === '1' || normalized === 'Y' || normalized === 'TRUE';
}

function toStore(item: NonNullable<Emart24WebStoreResponse['data']>[number]): Emart24Store {
  return {
    storeCode: item.CODE || '',
    storeName: item.TITLE || '',
    address: item.ADDRESS || '',
    addressDetail: item.ADDRESS_DE || '',
    phone: item.PHONE || '',
    latitude: toNumber(item.LATITUDE),
    longitude: toNumber(item.LONGITUDE),
    openTime: item.START_HHMM || '',
    closeTime: item.END_HHMM || '',
    openDate: item.OPEN_DATE || '',
    endDate: item.END_DATE || '',
    service24h: toBooleanFlag(item.SVR_24),
    distanceM: null,
  };
}

function toProduct(item: NonNullable<Emart24ProductSearchResponse['productList']>[number]): Emart24Product {
  return {
    pluCd: item.pluCd || '',
    goodsName: item.goodsNm || '',
    originPrice: toNumber(item.originPrice),
    viewPrice: toNumber(item.viewPrice),
    category: item.categoryNm || '',
    kind: item.kindNm || '',
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

export async function fetchEmart24Stores(
  params: FetchEmart24StoresParams = {},
  options: RequestOptions = {},
): Promise<{ totalCount: number; stores: Emart24Store[]; appliedKeyword: string }> {
  const { timeout = 15000 } = options;
  const { keyword = '', area1 = '', area2 = '', page = 1, service24h = false } = params;
  const keywordVariants = buildKeywordVariants(keyword);
  let lastError: number | undefined;

  for (let index = 0; index < keywordVariants.length; index += 1) {
    const searchKeyword = keywordVariants[index];
    const endpoint = new URL(EMART24_API.STORE_PATH, EMART24_API.WEB_BASE_URL);
    endpoint.searchParams.set('page', String(page));
    if (searchKeyword.length > 0) {
      endpoint.searchParams.set('search', searchKeyword);
    }
    if (area1.trim().length > 0) {
      endpoint.searchParams.set('AREA1', area1.trim());
    }
    if (area2.trim().length > 0) {
      endpoint.searchParams.set('AREA2', area2.trim());
    }
    if (service24h) {
      endpoint.searchParams.set('SVR_24', '1');
    }

    const body = await fetchJson<Emart24WebStoreResponse>(endpoint.toString(), {
      ...EMART24_DEFAULT_FETCH_OPTIONS,
      method: 'GET',
      timeout,
      headers: EMART24_JSON_HEADERS,
    });

    if (body.error === 0 || body.error === undefined) {
      const stores = (body.data || []).map(toStore).filter((store) => store.storeCode.length > 0);
      return {
        totalCount: toNumber(body.count),
        stores,
        appliedKeyword: searchKeyword,
      };
    }

    lastError = body.error;
    const hasMoreVariants = index < keywordVariants.length - 1;
    if (body.error !== 1 || !hasMoreVariants) {
      break;
    }
  }

  throw new Error(`이마트24 매장 조회 실패: error=${lastError}`);
}

export async function searchEmart24Products(
  params: SearchEmart24ProductsParams,
  options: RequestOptions = {},
): Promise<{ totalCount: number; products: Emart24Product[] }> {
  const {
    keyword,
    page = 1,
    pageSize = 10,
    sortType = 'SALE',
    saleProductYn = 'N',
  } = params;
  const { timeout = 15000 } = options;

  const form = new URLSearchParams();
  form.set('currentPage', String(page));
  form.set('pageCnt', String(pageSize));
  form.set('sortType', sortType);
  form.set('saleProductYn', saleProductYn);
  form.set('searchWord', keyword.trim());

  const body = await fetchJson<Emart24ProductSearchResponse>(
    `${EMART24_API.EVERSE_BASE_URL}${EMART24_API.PRODUCT_SEARCH_PATH}`,
    {
      ...EMART24_DEFAULT_FETCH_OPTIONS,
      method: 'POST',
      retryUnsafeMethods: true,
      timeout,
      headers: EMART24_FORM_HEADERS,
      body: form.toString(),
    },
  );

  const products = (body.productList || []).map(toProduct).filter((item) => item.pluCd.length > 0);

  return {
    totalCount: toNumber(body.totalCnt),
    products,
  };
}

export async function searchEmart24StockByStores(
  params: SearchEmart24StockByStoresParams,
  options: RequestOptions = {},
): Promise<Emart24StockByStoreResponse> {
  const { timeout = 15000 } = options;
  const { pluCd, bizNos } = params;

  const filteredBizNos = bizNos.map((value) => value.trim()).filter((value) => value.length > 0);
  if (filteredBizNos.length === 0) {
    return {
      storeGoodsInfo: {
        pluCd,
      },
      storeGoodsQty: [],
    };
  }

  const endpoint = new URL(EMART24_API.STOCK_SEARCH_STORE_PATH, EMART24_API.EVERSE_BASE_URL);
  endpoint.searchParams.set('searchPluCode', pluCd);
  endpoint.searchParams.set('bizNoArr', filteredBizNos.join(','));

  return fetchJson<Emart24StockByStoreResponse>(endpoint.toString(), {
    ...EMART24_DEFAULT_FETCH_OPTIONS,
    method: 'GET',
    timeout,
    headers: EMART24_JSON_HEADERS,
  });
}

export async function fetchEmart24StoreDetail(
  bizNo: string,
  options: RequestOptions = {},
): Promise<Emart24StoreDetailResponse> {
  const { timeout = 15000 } = options;

  return fetchJson<Emart24StoreDetailResponse>(
    `${EMART24_API.EVERSE_BASE_URL}${EMART24_API.STORE_DETAIL_PATH_PREFIX}${encodeURIComponent(bizNo)}`,
    {
      ...EMART24_DEFAULT_FETCH_OPTIONS,
      method: 'GET',
      timeout,
      headers: EMART24_JSON_HEADERS,
    },
  );
}
