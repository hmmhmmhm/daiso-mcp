/**
 * 올리브영 무료 API 클라이언트
 *
 * 공식 API 또는 운영자가 설정한 브라우저 릴레이를 호출합니다.
 */

import { OLIVEYOUNG_API } from './api.js';
import type {
  OliveyoungProduct,
  OliveyoungProductStoreInventory,
  OliveyoungStore,
} from './types.js';
import {
  resolveOliveyoungImageUrl,
  resolveOliveyoungInStock,
  resolveOliveyoungStoreStock,
} from './normalize.js';
import { requestOliveyoung, type OliveyoungRequestOptions as RequestOptions } from './transport.js';

interface FindStoresParams {
  latitude: number;
  longitude: number;
  pageIdx: number;
  searchWords: string;
}

interface SearchProductsParams {
  keyword: string;
  page: number;
  size: number;
  sort: string;
  includeSoldOut: boolean;
}

interface StockStoresParams {
  productId: string;
  latitude: number;
  longitude: number;
  pageIdx: number;
  searchWords: string;
}

interface EnrichProductsParams {
  latitude: number;
  longitude: number;
  storeKeyword: string;
  maxProducts: number;
}

type OliveyoungProductSearchResult = { totalCount: number; nextPage: boolean; products: OliveyoungProduct[] };
type OliveyoungStoreSearchResult = { totalCount: number; stores: OliveyoungStore[] };

const OLIVEYOUNG_PRODUCT_ID_CACHE_TTL_MS = 10 * 60 * 1000;
const OLIVEYOUNG_PRODUCT_SEARCH_STALE_CACHE_TTL_MS = 30 * 60 * 1000;
const oliveyoungProductIdCache = new Map<string, { expiresAt: number; productId: string }>();
const oliveyoungProductSearchCache = new Map<
  string,
  { expiresAt: number; result: OliveyoungProductSearchResult }
>();
const oliveyoungStoreSearchCache = new Map<string, { expiresAt: number; result: OliveyoungStoreSearchResult }>();

function createOliveyoungProductSearchCacheKey(params: SearchProductsParams): string {
  return JSON.stringify([params.keyword, params.page, params.size, params.sort, params.includeSoldOut]);
}

function createOliveyoungStoreSearchCacheKey(params: FindStoresParams): string {
  return JSON.stringify([params.latitude, params.longitude, params.pageIdx, params.searchWords]);
}

function cloneOliveyoungProductSearchResult(result: OliveyoungProductSearchResult): OliveyoungProductSearchResult {
  return {
    totalCount: result.totalCount,
    nextPage: result.nextPage,
    products: result.products.map((product) => ({ ...product })),
  };
}

function cloneOliveyoungStoreSearchResult(result: OliveyoungStoreSearchResult): OliveyoungStoreSearchResult {
  return {
    totalCount: result.totalCount,
    stores: result.stores.map((store) => ({ ...store })),
  };
}

function readStaleResult<TResult>(
  cache: Map<string, { expiresAt: number; result: TResult }>,
  cacheKey: string,
  cloneResult: (result: TResult) => TResult
): TResult | null {
  const cached = cache.get(cacheKey);
  if (!cached || cached.expiresAt <= Date.now()) {
    return null;
  }
  return cloneResult(cached.result);
}

function writeStaleResult<TResult>(
  cache: Map<string, { expiresAt: number; result: TResult }>,
  cacheKey: string,
  result: TResult,
  cloneResult: (result: TResult) => TResult
): void {
  cache.set(cacheKey, {
    expiresAt: Date.now() + OLIVEYOUNG_PRODUCT_SEARCH_STALE_CACHE_TTL_MS,
    result: cloneResult(result),
  });
}

export async function fetchOliveyoungStores(
  params: FindStoresParams,
  options: RequestOptions = {}
): Promise<OliveyoungStoreSearchResult> {
  const payload = {
    lat: params.latitude,
    lon: params.longitude,
    pageIdx: params.pageIdx,
    searchWords: params.searchWords,
    pogKeys: '',
    serviceKeys: '',
    mapLat: params.latitude,
    mapLon: params.longitude,
  };
  const cacheKey = createOliveyoungStoreSearchCacheKey(params);

  try {
    const body = await requestOliveyoung(OLIVEYOUNG_API.STORE_FINDER_PATH, payload, options);

    const stores = (body.data?.storeList || []).map((store) => ({
      storeCode: store.storeCode || '',
      storeName: store.storeName || '',
      address: store.address || '',
      latitude: store.latitude || 0,
      longitude: store.longitude || 0,
      pickupYn: Boolean(store.pickupYn),
      o2oRemainQuantity: store.o2oRemainQuantity || 0,
    }));

    const result = {
      totalCount: body.data?.totalCount || 0,
      stores,
    };
    writeStaleResult(oliveyoungStoreSearchCache, cacheKey, result, cloneOliveyoungStoreSearchResult);
    return result;
  } catch (error) {
    const staleResult = readStaleResult(oliveyoungStoreSearchCache, cacheKey, cloneOliveyoungStoreSearchResult);
    if (staleResult) {
      return staleResult;
    }
    throw error;
  }
}

export async function fetchOliveyoungProducts(
  params: SearchProductsParams,
  options: RequestOptions = {}
): Promise<OliveyoungProductSearchResult> {
  const payload = {
    includeSoldOut: params.includeSoldOut,
    keyword: params.keyword,
    page: params.page,
    sort: params.sort,
    size: params.size,
  };
  const cacheKey = createOliveyoungProductSearchCacheKey(params);

  try {
    const body = await requestOliveyoung(OLIVEYOUNG_API.PRODUCT_SEARCH_PATH, payload, options);
    const list = body.data?.serachList || body.data?.searchList || [];

    const products = list.map((product) => {
      const o2oStockFlag = Boolean(product.o2oStockFlag);
      const o2oRemainQuantity = product.o2oRemainQuantity || 0;
      const inStock = resolveOliveyoungInStock(o2oStockFlag, o2oRemainQuantity);
      const stockStatus: OliveyoungProduct['stockStatus'] = inStock ? 'in_stock' : 'out_of_stock';
      const stockSource: OliveyoungProduct['stockSource'] = 'global_search';

      return {
        goodsNumber: product.goodsNumber || '',
        goodsName: product.goodsName || '',
        imageUrl: resolveOliveyoungImageUrl(product.imagePath),
        priceToPay: product.priceToPay || 0,
        originalPrice: product.originalPrice || 0,
        discountRate: product.discountRate || 0,
        o2oStockFlag,
        o2oRemainQuantity,
        inStock,
        stockStatus,
        stockSource,
      };
    });

    const result = {
      totalCount: body.data?.totalCount || 0,
      nextPage: Boolean(body.data?.nextPage),
      products,
    };
    writeStaleResult(oliveyoungProductSearchCache, cacheKey, result, cloneOliveyoungProductSearchResult);
    return result;
  } catch (error) {
    const staleResult = readStaleResult(oliveyoungProductSearchCache, cacheKey, cloneOliveyoungProductSearchResult);
    if (staleResult) {
      return {
        ...staleResult,
        products: staleResult.products.map((product) => ({
          ...product,
          o2oStockFlag: false,
          o2oRemainQuantity: 0,
          inStock: false,
          stockStatus: 'unknown',
          storeInventory: undefined,
        })),
      };
    }
    throw error;
  }
}

async function fetchOliveyoungProductId(
  goodsNumber: string,
  options: RequestOptions = {}
): Promise<string> {
  const normalizedGoodsNumber = goodsNumber.trim();
  if (!normalizedGoodsNumber) {
    return '';
  }

  const cached = oliveyoungProductIdCache.get(normalizedGoodsNumber);
  const now = Date.now();
  if (cached && cached.expiresAt > now) {
    return cached.productId;
  }

  const body = await requestOliveyoung(
    OLIVEYOUNG_API.STOCK_GOODS_INFO_PATH,
    { goodsNo: normalizedGoodsNumber },
    options
  );

  const productId = body.data?.goodsInfo?.masterGoodsNumber || '';
  if (productId) {
    oliveyoungProductIdCache.set(normalizedGoodsNumber, {
      expiresAt: now + OLIVEYOUNG_PRODUCT_ID_CACHE_TTL_MS,
      productId,
    });
  }

  return productId;
}

async function fetchOliveyoungStockStores(
  params: StockStoresParams,
  options: RequestOptions = {}
): Promise<OliveyoungProductStoreInventory> {
  const body = await requestOliveyoung(
    OLIVEYOUNG_API.STOCK_STORES_PATH,
    {
      productId: params.productId,
      lat: params.latitude,
      lon: params.longitude,
      pageIdx: params.pageIdx,
      searchWords: params.searchWords,
      mapLat: params.latitude,
      mapLon: params.longitude,
    },
    options
  );

  if (!Array.isArray(body.data?.storeList)) {
    throw new Error('올리브영 매장 재고 응답에 storeList가 없습니다.');
  }
  const stores = body.data.storeList.map((store) => resolveOliveyoungStoreStock(store));
  const inStockCount = stores.filter((store) => store.stockStatus === 'in_stock').length;
  const notSoldCount = stores.filter((store) => store.stockStatus === 'not_sold').length;

  const result = {
    totalCount: body.data?.totalCount || 0,
    inStockCount,
    outOfStockCount: stores.filter((store) => store.stockStatus === 'out_of_stock').length,
    notSoldCount,
    stores,
  };
  return result;
}

function sortOliveyoungProducts(products: OliveyoungProduct[]): OliveyoungProduct[] {
  const score = (product: OliveyoungProduct) => {
    if (product.stockSource === 'nearby_store') {
      return product.inStock ? 4 : 3;
    }

    return product.inStock ? 2 : 1;
  };

  return [...products].sort((left, right) => score(right) - score(left));
}

export async function enrichOliveyoungProductsWithNearbyStoreInventory(
  products: OliveyoungProduct[],
  params: EnrichProductsParams,
  options: RequestOptions = {}
): Promise<{ checkedCount: number; products: OliveyoungProduct[] }> {
  const requestedLimit = Number.isFinite(params.maxProducts) ? Math.floor(params.maxProducts) : 5;
  const maxProducts = Math.max(0, Math.min(products.length, requestedLimit, 5));

  if (maxProducts === 0) {
    return { checkedCount: 0, products };
  }

  const checkedProducts: Array<{ checked: boolean; product: OliveyoungProduct }> = [];
  // 릴레이 슬롯을 한 요청이 독점하지 않도록 상품 보강을 2개씩 실행합니다.
  for (let start = 0; start < maxProducts; start += 2) {
    checkedProducts.push(
      ...await Promise.all(
        products.slice(start, Math.min(start + 2, maxProducts)).map(async (product) => {
          let productId = '';
          try {
            productId = await fetchOliveyoungProductId(product.goodsNumber, options);
          } catch {
            return { checked: false, product };
          }

          if (!productId) {
            return { checked: false, product };
          }

          let storeInventory: OliveyoungProductStoreInventory;
          try {
            storeInventory = await fetchOliveyoungStockStores(
              {
                productId,
                latitude: params.latitude,
                longitude: params.longitude,
                pageIdx: 1,
                searchWords: params.storeKeyword,
              },
              options
            );
          } catch {
            return { checked: false, product };
          }

          const inStock = storeInventory.inStockCount > 0;
          const stockStatus: OliveyoungProduct['stockStatus'] = inStock
            ? 'in_stock'
            : storeInventory.stores.length > 0 && storeInventory.notSoldCount === storeInventory.stores.length
              ? 'not_sold'
              : storeInventory.stores.some((store) => store.stockStatus === 'unknown')
                ? 'unknown'
                : 'out_of_stock';
          const stockSource: OliveyoungProduct['stockSource'] = 'nearby_store';

          return {
            checked: true,
            product: {
              ...product,
              inStock,
              stockStatus,
              stockSource,
              storeInventory,
            },
          };
        })
      )
    );
  }

  const enrichedProducts = [
    ...checkedProducts.map((result) => result.product),
    ...products.slice(maxProducts),
  ];

  const checkedCount = checkedProducts.filter((result) => result.checked).length;

  return {
    checkedCount,
    products: sortOliveyoungProducts(enrichedProducts),
  };
}

export function __testOnlyClearOliveyoungCaches(): void {
  oliveyoungProductIdCache.clear();
  oliveyoungProductSearchCache.clear();
  oliveyoungStoreSearchCache.clear();
}
