import { SevenElevenSearchPagination } from './searchPagination.js';
import { hasConvenienceRelay, requestConvenienceRelay, type ConvenienceTransportOptions } from '../../utils/convenienceTransport.js';
/**
 * 세븐일레븐 API 클라이언트
 */
/* c8 ignore start */

import { requestSevenElevenJson, SEVENELEVEN_DEFAULT_HEADERS, SEVENELEVEN_DEFAULT_FETCH_OPTIONS, type SevenElevenRequestOptions } from './transport.js';
export type { SevenElevenRequestOptions } from './transport.js';
import { fetchJsonWithZyteFallback } from '../../utils/zyteJsonFallback.js';
import { SEVENELEVEN_API } from './api.js';
import type {
  SevenElevenApiEnvelope,
  SevenElevenCatalogSnapshot,
  SevenElevenProduct,
  SevenElevenRawProduct,
  SevenElevenSearchResult,
  SevenElevenStockProductMeta,
  SevenElevenStore,
  SevenElevenStoreSearchResult,
} from './types.js';

interface SearchProductsParams {
  query: string;
  page?: number;
  size?: number;
  sort?: string;
}

interface SearchStoresParams {
  keyword: string;
  limit?: number;
}

interface SearchQueryCollection {
  CollectionId?: string;
  Documentset?: {
    totalCount?: number;
    Document?: unknown[];
  };
}

interface SearchGoodsData {
  SearchQueryResult?: {
    query?: string;
    Collection?: SearchQueryCollection[];
  };
  content?: unknown[];
}

interface StockProductData {
  prdNo?: string;
  itemCd?: string;
  itemOnm?: string;
  smCd?: string;
  stokMngCd?: string;
  stokMngQty?: number | string;
  stockApplicationRate?: string | number;
}

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

function normalizeStoreKeyword(keyword: string): string {
  return keyword
    .trim()
    .replace(/\s+/g, '')
    .replace(/(역|지점|점)$/g, '');
}

function toBooleanYn(value: unknown): boolean {
  const normalized = toStringValue(value).trim().toUpperCase();
  return normalized === 'Y' || normalized === 'TRUE' || normalized === '1';
}

function toRawProduct(input: unknown): SevenElevenRawProduct {
  if (!input || typeof input !== 'object') {
    return {};
  }

  const record = input as Record<string, unknown>;
  if (record.field && typeof record.field === 'object') {
    return record.field as SevenElevenRawProduct;
  }

  return record as SevenElevenRawProduct;
}

function normalizeProduct(raw: SevenElevenRawProduct): SevenElevenProduct {
  return {
    productNo: toStringValue(raw.prdNo),
    itemCode: toStringValue(raw.itemCd),
    itemName: toStringValue(raw.itemOnm),
    salePrice: toNumber(raw.onlinePrice),
    originalPrice: toNumber(raw.onlineCost),
    imageUrl: toStringValue(raw.repImgUrl),
    eventName: toStringValue(raw.eventGbnNm),
    itemType: toStringValue(raw.itemGbnNm),
    makerName: toStringValue(raw.makerNm),
    reviewScore: raw.avgEvalScore === undefined ? null : toNumber(raw.avgEvalScore),
    reviewCount: toNumber(raw.productReviewCnt),
  };
}

function normalizeProducts(items: unknown[]): SevenElevenProduct[] {
  return items
    .map(toRawProduct)
    .map(normalizeProduct)
    .filter((item) => item.itemCode.length > 0 || item.itemName.length > 0);
}

function normalizeStore(raw: Record<string, unknown>): SevenElevenStore {
  const address1 = toStringValue(raw.addr1);
  const address2 = toStringValue(raw.addr2);
  const mergedAddress = `${address1} ${address2}`.trim();

  return {
    storeCode: toStringValue(raw.storeCode || raw.storeCd || raw.strCd || raw.storCd || raw.shopCd),
    storeName: toStringValue(raw.storeName || raw.storeNm || raw.strNm || raw.storNm || raw.shopNm),
    address:
      toStringValue(raw.address || raw.addr || raw.roadAddr || raw.shopAddr) || mergedAddress,
    latitude: toNumber(raw.latitude || raw.storeLat || raw.lat || raw.yPos || raw.y || raw.yCoord),
    longitude: toNumber(
      raw.longitude || raw.storeLon || raw.lng || raw.xPos || raw.x || raw.xCoord,
    ),
    pickupEnabled: toBooleanYn(raw.pickupEnabled || raw.pickupYn),
    deliveryEnabled: toBooleanYn(raw.deliveryEnabled || raw.deliveryYn || raw.dlvyYn),
    closeYn: toStringValue(raw.closeYn || raw.storeCloseYn || raw.closeYN || raw.clsYn),
  };
}

function normalizeStockProductMeta(raw: StockProductData): SevenElevenStockProductMeta {
  return {
    productNo: toStringValue(raw.prdNo),
    itemCode: toStringValue(raw.itemCd),
    itemName: toStringValue(raw.itemOnm),
    smCode: toStringValue(raw.smCd),
    stockManagementCode: toStringValue(raw.stokMngCd),
    stockManagementQuantity: toNumber(raw.stokMngQty),
    stockApplicationRate: toStringValue(raw.stockApplicationRate),
  };
}

function normalizeStores(items: unknown[]): SevenElevenStore[] {
  return items
    .map((item) => {
      if (!item || typeof item !== 'object') {
        return {} as Record<string, unknown>;
      }
      const record = item as Record<string, unknown>;
      if (record.field && typeof record.field === 'object') {
        return record.field as Record<string, unknown>;
      }
      return record;
    })
    .map(normalizeStore)
    .filter((store) => store.storeCode.length > 0 || store.storeName.length > 0);
}

/** 전체 검색 결과를 가져와 컬렉션 간 중복을 제거합니다. */
export async function fetchSevenElevenProductSearchResults(
  query: string,
  options: SevenElevenRequestOptions = {},
  budget = { remaining: 10 },
): Promise<SevenElevenSearchResult> {
  const pagination = new SevenElevenSearchPagination();
  let data: SearchGoodsData = {};
  let complete = false;
  // 원본 페이지를 최대 5회 수집하고 불완전한 결과는 명시적으로 거절합니다.
  for (let startCount = 0; startCount < 5; startCount += 1) {
    if (budget.remaining <= 0) throw new Error('세븐일레븐 전체 상품 검색 결과가 잘렸습니다: 최대 10회 검색 제한');
    budget.remaining -= 1;
    const response = await requestSevenElevenJson<SearchGoodsData>(
      SEVENELEVEN_API.SEARCH_GOODS_PATH, 'POST',
      { collection: 'goods', query, sort: 'quantity/desc,itemOnm/asc', startCount, listCount: 100 },
      options,
    );
    data = response.data || {};
    const collections = data.SearchQueryResult?.Collection;
    if (!Array.isArray(collections)) {
      if (startCount === 0 && Array.isArray(data.content)) {
        if (data.content.length > 500) throw new Error('세븐일레븐 전체 상품 검색 결과가 잘렸습니다: 최대 500개 제한');
        complete = true;
        break;
      }
      throw new Error('세븐일레븐 전체 상품 검색 결과가 잘렸습니다');
    }
    complete = pagination.append(collections);
    if (complete) break;
  }
  if (!complete) throw new Error('세븐일레븐 전체 상품 검색 결과가 잘렸습니다: 최대 5페이지 제한');
  const rows = normalizeProducts(
    pagination.documents.length ? pagination.documents : Array.isArray(data.content) ? data.content : [],
  );
  const uniqueProducts = new Map<string, SevenElevenProduct>();
  for (const product of rows) {
    const key = product.itemCode || product.productNo || product.itemName;
    // 뒤쪽 교환권 행이 먼저 확인한 매장 상품 정보를 덮어쓰지 않습니다.
    if (!uniqueProducts.has(key)) uniqueProducts.set(key, product);
  }
  const products = [...uniqueProducts.values()];
  return {
    query: data.SearchQueryResult?.query || query,
    totalCount: products.length,
    products,
    collectionIds: [...pagination.collectionIds],
  };
}

export async function searchSevenElevenProducts(
  params: SearchProductsParams,
  options: SevenElevenRequestOptions = {},
): Promise<SevenElevenSearchResult> {
  const { query, page = 1, size = 20 } = params;
  const result = await fetchSevenElevenProductSearchResults(query, options);
  const pageSize = Math.max(Math.trunc(size), 1);
  const offset = Math.max(Math.trunc(page) - 1, 0) * pageSize;
  return { ...result, products: result.products.slice(offset, offset + pageSize) };
}

export async function fetchSevenElevenStoresByKeyword(
  params: SearchStoresParams,
  options: SevenElevenRequestOptions = {},
): Promise<SevenElevenStoreSearchResult> {
  const { keyword, limit = 20 } = params;
  const query = normalizeStoreKeyword(keyword) || keyword.trim();
  const safeLimit = Number.isFinite(limit) ? Math.trunc(limit) : 20;
  const listCount = Math.max(1, Math.min(safeLimit, 9999));

  const response = await requestSevenElevenJson<SearchGoodsData>(
    SEVENELEVEN_API.SEARCH_STORE_PATH,
    'POST',
    {
      collection: 'store',
      query,
      sort: 'Date/desc',
      listCount,
    },
    options,
  );

  const data = response.data || {};
  const queryResult = data.SearchQueryResult;
  const collections = queryResult?.Collection || [];

  let totalCount = 0;
  const allDocuments: unknown[] = [];
  for (const collection of collections) {
    totalCount += toNumber(collection.Documentset?.totalCount);
    allDocuments.push(...(collection.Documentset?.Document || []));
  }

  const stores = normalizeStores(allDocuments);

  return {
    query: queryResult?.query || query,
    totalCount,
    stores,
  };
}

export async function fetchSevenElevenSearchPopwords(
  label = 'home',
  options: SevenElevenRequestOptions = {},
): Promise<string[]> {
  const encodedLabel = encodeURIComponent(label);
  const response = await requestSevenElevenJson<unknown>(
    `${SEVENELEVEN_API.SEARCH_POPWORD_PATH}?label=${encodedLabel}`,
    'POST',
    {},
    options,
  );

  const { data } = response;
  if (Array.isArray(data)) {
    return data.map((item) => toStringValue(item)).filter((item) => item.length > 0);
  }

  if (!data || typeof data !== 'object') {
    return [];
  }

  const record = data as Record<string, unknown>;
  const candidates = [record.keywords, record.popwords, record.wordList, record.list];

  for (const candidate of candidates) {
    if (!Array.isArray(candidate)) {
      continue;
    }

    const values = candidate
      .map((item) => {
        if (typeof item === 'string') {
          return item;
        }

        if (item && typeof item === 'object') {
          const value = item as Record<string, unknown>;
          return toStringValue(value.keyword || value.word || value.text || value.name);
        }

        return '';
      })
      .filter((item) => item.length > 0);

    if (values.length > 0) {
      return values;
    }
  }

  return [];
}

export async function fetchSevenElevenStockProductMeta(
  itemCode: string,
  options: SevenElevenRequestOptions = {},
): Promise<SevenElevenStockProductMeta | null> {
  const { timeout = 15000 } = options;
  const encodedItemCode = encodeURIComponent(itemCode.trim());
  const url = `${SEVENELEVEN_API.BASE_URL}${SEVENELEVEN_API.PRODUCT_SEARCH_STOCK_PATH}?itemCd=${encodedItemCode}`;

  const response = hasConvenienceRelay(options)
    ? await requestConvenienceRelay<StockProductData>('seven-stock-meta', { itemCd: itemCode.trim() }, options, timeout)
    : await fetchJsonWithZyteFallback<StockProductData>(url, {
    ...SEVENELEVEN_DEFAULT_FETCH_OPTIONS,
    method: 'GET',
    timeout,
    headers: {
      Accept: SEVENELEVEN_DEFAULT_HEADERS.Accept,
      'User-Agent': SEVENELEVEN_DEFAULT_HEADERS['User-Agent'],
    },
    zyteApiKey: options.zyteApiKey,
    zyteTags: { service: 'seveneleven' },
  });

  const productMeta = normalizeStockProductMeta(response);
  if (productMeta.itemCode.length === 0 || productMeta.smCode.length === 0) {
    return null;
  }

  return productMeta;
}

function normalizeExhibitions(items: unknown[]): SevenElevenCatalogSnapshot['exhibitions'] {
  return items
    .map((item) => {
      const value = (item || {}) as Record<string, unknown>;
      const productList = Array.isArray(value.exhibitionProductList) ? value.exhibitionProductList : [];

      return {
        exhibitionIdx: toNumber(value.exhibitionIdx),
        exhibitionName: toStringValue(value.exhibitionName),
        startDate: toStringValue(value.exhibitionStartDate),
        endDate: toStringValue(value.exhibitionEndDate),
        productCount: productList.length,
      };
    })
    .filter((item) => item.exhibitionIdx > 0 || item.exhibitionName.length > 0);
}

function extractContentArray(data: unknown): unknown[] {
  if (Array.isArray(data)) {
    return data;
  }

  if (!data || typeof data !== 'object') {
    return [];
  }

  const record = data as Record<string, unknown>;
  if (Array.isArray(record.content)) {
    return record.content;
  }

  if (Array.isArray(record.list)) {
    return record.list;
  }

  return [];
}

export async function fetchSevenElevenCatalogSnapshot(
  options: ConvenienceTransportOptions & {
    includeIssues?: boolean;
    includeExhibition?: boolean;
    timeout?: number;
    zyteApiKey?: string;
  } = {},
): Promise<SevenElevenCatalogSnapshot> {
  const { includeIssues = true, includeExhibition = true, timeout = 15000, zyteApiKey } = options;

  const tasks: Array<Promise<SevenElevenApiEnvelope<unknown>>> = [
    requestSevenElevenJson<unknown>(SEVENELEVEN_API.PRODUCT_PAGES_PATH, 'GET', null, { ...options, timeout, zyteApiKey }),
    includeIssues
      ? requestSevenElevenJson<unknown>(SEVENELEVEN_API.PRODUCT_ISSUES_PATH, 'GET', null, {
          ...options,
          timeout,
          zyteApiKey,
        })
      : Promise.resolve({ data: { content: [] } }),
    includeExhibition
      ? requestSevenElevenJson<unknown>(SEVENELEVEN_API.EXHIBITION_MAIN_PATH, 'GET', null, {
          ...options,
          timeout,
          zyteApiKey,
        })
      : Promise.resolve({ data: [] }),
  ];

  if (hasConvenienceRelay(options)) {
    const [pages, issues, exhibitions] = await Promise.all(tasks);
    return { pages: normalizeProducts(extractContentArray(pages.data)), issues: normalizeProducts(extractContentArray(issues.data)), exhibitions: normalizeExhibitions(extractContentArray(exhibitions.data)) };
  }
  const [pagesResult, issuesResult, exhibitionsResult] = await Promise.allSettled(tasks);

  const pagesData = pagesResult.status === 'fulfilled' ? pagesResult.value.data : [];
  const issuesData = issuesResult.status === 'fulfilled' ? issuesResult.value.data : [];
  const exhibitionData = exhibitionsResult.status === 'fulfilled' ? exhibitionsResult.value.data : [];

  return {
    pages: normalizeProducts(extractContentArray(pagesData)),
    issues: normalizeProducts(extractContentArray(issuesData)),
    exhibitions: normalizeExhibitions(extractContentArray(exhibitionData)),
  };
}
/* c8 ignore stop */
