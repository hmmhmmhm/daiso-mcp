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

const OLIVEYOUNG_IMAGE_BASE_URL = 'https://image.oliveyoung.co.kr';

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
  return `${OLIVEYOUNG_IMAGE_BASE_URL}${normalizedPath}`;
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
): Promise<{ totalCount: number; stores: OliveyoungStore[] }> {
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

  return {
    totalCount: body.data?.totalCount || 0,
    stores,
  };
}

export async function fetchOliveyoungProducts(
  params: SearchProductsParams,
  options: RequestOptions = {}
): Promise<{ totalCount: number; nextPage: boolean; products: OliveyoungProduct[] }> {
  const payload = {
    includeSoldOut: params.includeSoldOut,
    keyword: params.keyword,
    page: params.page,
    sort: params.sort,
    size: params.size,
  };

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

  return {
    totalCount: body.data?.totalCount || 0,
    nextPage: Boolean(body.data?.nextPage),
    products,
  };
}

async function fetchOliveyoungProductId(
  goodsNumber: string,
  options: RequestOptions = {}
): Promise<string> {
  const body = await zyteExtract(
    OLIVEYOUNG_API.STOCK_GOODS_INFO_PATH,
    { goodsNo: goodsNumber },
    options
  );

  return body.data?.goodsInfo?.masterGoodsNumber || '';
}

async function fetchOliveyoungStockStores(
  params: StockStoresParams,
  options: RequestOptions = {}
): Promise<OliveyoungProductStoreInventory> {
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

  return {
    totalCount: body.data?.totalCount || 0,
    inStockCount,
    outOfStockCount: stores.length - inStockCount - notSoldCount,
    notSoldCount,
    stores,
  };
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

  const enrichedProducts: OliveyoungProduct[] = [];
  let checkedCount = 0;

  for (const [index, product] of products.entries()) {
    if (index >= maxProducts) {
      enrichedProducts.push(product);
      continue;
    }

    const productId = await fetchOliveyoungProductId(product.goodsNumber, options);

    if (!productId) {
      enrichedProducts.push(product);
      continue;
    }

    const storeInventory = await fetchOliveyoungStockStores(
      {
        productId,
        latitude: params.latitude,
        longitude: params.longitude,
        pageIdx: 1,
        searchWords: params.storeKeyword,
      },
      options
    );

    checkedCount += 1;
    const inStock = storeInventory.inStockCount > 0;
    const stockStatus: OliveyoungProduct['stockStatus'] = inStock ? 'in_stock' : 'out_of_stock';
    const stockSource: OliveyoungProduct['stockSource'] = 'nearby_store';

    enrichedProducts.push({
      ...product,
      inStock,
      stockStatus,
      stockSource,
      storeInventory,
    });
  }

  return {
    checkedCount,
    products: sortOliveyoungProducts(enrichedProducts),
  };
}
