/**
 * 올리브영 Zyte 클라이언트
 *
 * Zyte extract API를 통해 올리브영 내부 API를 우회 호출합니다.
 */

import { OLIVEYOUNG_API } from './api.js';
import type {
  OliveyoungApiResponse,
  OliveyoungProduct,
  OliveyoungProductStoreInventory,
  OliveyoungStore,
  OliveyoungStockStore,
} from './types.js';
import { decodeBase64, requestByZyte } from '../../utils/zyte.js';

interface RequestOptions {
  apiKey?: string;
  timeout?: number;
}

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

const OLIVEYOUNG_IMAGE_HOST = 'https://image.oliveyoung.co.kr';
const OLIVEYOUNG_PRODUCT_ID_CACHE_TTL_MS = 10 * 60 * 1000;
const OLIVEYOUNG_PRODUCT_SEARCH_STALE_CACHE_TTL_MS = 30 * 60 * 1000;
const oliveyoungProductIdCache = new Map<string, { expiresAt: number; productId: string }>();
const oliveyoungProductSearchCache = new Map<
  string,
  { expiresAt: number; result: OliveyoungProductSearchResult }
>();
const oliveyoungStoreSearchCache = new Map<string, { expiresAt: number; result: OliveyoungStoreSearchResult }>();
const oliveyoungStockStoresCache = new Map<string, { expiresAt: number; result: OliveyoungProductStoreInventory }>();
const OLIVEYOUNG_IMAGE_PATH_PREFIX = '/uploads/images/goods';

function resolveOliveyoungInStock(o2oStockFlag: boolean, o2oRemainQuantity: number): boolean {
  return o2oStockFlag || o2oRemainQuantity > 0;
}

function resolveOliveyoungImageUrl(imagePath?: string): string | undefined {
  if (!imagePath) {
    return undefined;
  }

  if (/^https?:\/\//i.test(imagePath)) {
    return imagePath;
  }

  if (imagePath.startsWith('//')) {
    return `https:${imagePath}`;
  }

  const normalizedPath = imagePath.startsWith('/') ? imagePath : `/${imagePath}`;

  if (normalizedPath.startsWith(`${OLIVEYOUNG_IMAGE_PATH_PREFIX}/`)) {
    return `${OLIVEYOUNG_IMAGE_HOST}${normalizedPath}`;
  }

  return `${OLIVEYOUNG_IMAGE_HOST}${OLIVEYOUNG_IMAGE_PATH_PREFIX}${normalizedPath}`;
}

function resolveOliveyoungStoreQuantity(remainQuantity: number, o2oRemainQuantity: number): number {
  return Math.max(remainQuantity, o2oRemainQuantity);
}

function resolveOliveyoungStoreStock(rawStore: OliveyoungApiResponse['data'] extends infer T
  ? T extends { storeList?: Array<infer U> }
    ? U
    : never
  : never): OliveyoungStockStore {
  const remainQuantity = rawStore?.remainQuantity || 0;
  const o2oRemainQuantity = rawStore?.o2oRemainQuantity || 0;
  const quantity = resolveOliveyoungStoreQuantity(remainQuantity, o2oRemainQuantity);
  const salesStoreYn = Boolean(rawStore?.salesStoreYn);

  let stockStatus: OliveyoungStockStore['stockStatus'] = 'out_of_stock';
  let stockLabel = '품절';

  if (!salesStoreYn) {
    stockStatus = 'not_sold';
    stockLabel = '미판매';
  } else if (quantity > 0) {
    stockStatus = 'in_stock';
    stockLabel = quantity >= 9 ? '재고 9개 이상' : `재고 ${quantity}개`;
  }

  return {
    storeCode: rawStore?.storeCode || '',
    storeName: rawStore?.storeName || '',
    address: rawStore?.address || '',
    latitude: rawStore?.latitude || 0,
    longitude: rawStore?.longitude || 0,
    distance: rawStore?.distance || 0,
    pickupYn: Boolean(rawStore?.pickupYn),
    salesStoreYn,
    remainQuantity,
    o2oRemainQuantity,
    stockStatus,
    stockLabel,
    openYn: Boolean(rawStore?.openYn),
  };
}

function createOliveyoungProductSearchCacheKey(params: SearchProductsParams): string {
  return JSON.stringify([params.keyword, params.page, params.size, params.sort, params.includeSoldOut]);
}

function createOliveyoungStoreSearchCacheKey(params: FindStoresParams): string {
  return JSON.stringify([params.latitude, params.longitude, params.pageIdx, params.searchWords]);
}

function createOliveyoungStockStoresCacheKey(params: StockStoresParams): string {
  return JSON.stringify([params.productId, params.latitude, params.longitude, params.pageIdx, params.searchWords]);
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

function cloneOliveyoungStockStoresResult(result: OliveyoungProductStoreInventory): OliveyoungProductStoreInventory {
  return {
    totalCount: result.totalCount,
    inStockCount: result.inStockCount,
    outOfStockCount: result.outOfStockCount,
    notSoldCount: result.notSoldCount,
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

async function zyteExtract(
  targetPath: string,
  requestBody: Record<string, unknown>,
  options: RequestOptions = {}
): Promise<OliveyoungApiResponse> {
  const { timeout = 15000, apiKey } = options;

  try {
    const result = await requestByZyte({
      apiKey,
      timeout,
      url: `${OLIVEYOUNG_API.BASE_URL}${targetPath}`,
      method: 'POST',
      headers: [
        { name: 'Content-Type', value: 'application/json' },
        { name: 'Accept', value: 'application/json' },
        { name: 'X-Requested-With', value: 'XMLHttpRequest' },
      ],
      bodyText: JSON.stringify(requestBody),
    });

    if (result.statusCode !== 200 || !result.httpResponseBody) {
      throw new Error(`올리브영 API 응답 실패: ${result.statusCode || 'unknown'}`);
    }

    const decodedBody = decodeBase64(result.httpResponseBody);
    const parsedBody = JSON.parse(decodedBody) as OliveyoungApiResponse;

    if (parsedBody.status !== 'SUCCESS') {
      throw new Error(`올리브영 API 상태 오류: ${parsedBody.status || 'UNKNOWN'}`);
    }

    return parsedBody;
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      throw new Error('올리브영 API 요청 시간 초과');
    }
    throw error;
  }
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
    const body = await zyteExtract(OLIVEYOUNG_API.STORE_FINDER_PATH, payload, options);

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
    const body = await zyteExtract(OLIVEYOUNG_API.PRODUCT_SEARCH_PATH, payload, options);
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
      return staleResult;
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

  const body = await zyteExtract(
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
  const cacheKey = createOliveyoungStockStoresCacheKey(params);

  try {
    const body = await zyteExtract(
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

    const stores = (body.data?.storeList || []).map((store) => resolveOliveyoungStoreStock(store));
    const inStockCount = stores.filter((store) => store.stockStatus === 'in_stock').length;
    const notSoldCount = stores.filter((store) => store.stockStatus === 'not_sold').length;

    const result = {
      totalCount: body.data?.totalCount || 0,
      inStockCount,
      outOfStockCount: stores.length - inStockCount - notSoldCount,
      notSoldCount,
      stores,
    };
    writeStaleResult(oliveyoungStockStoresCache, cacheKey, result, cloneOliveyoungStockStoresResult);
    return result;
  } catch (error) {
    const staleResult = readStaleResult(oliveyoungStockStoresCache, cacheKey, cloneOliveyoungStockStoresResult);
    if (staleResult) {
      return staleResult;
    }
    throw error;
  }
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
  const maxProducts = Math.max(0, Math.min(products.length, params.maxProducts));

  if (maxProducts === 0) {
    return { checkedCount: 0, products };
  }

  const checkedProducts = await Promise.all(
    products.slice(0, maxProducts).map(async (product) => {
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
      const stockStatus: OliveyoungProduct['stockStatus'] = inStock ? 'in_stock' : 'out_of_stock';
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
  );

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
  oliveyoungStockStoresCache.clear();
}
