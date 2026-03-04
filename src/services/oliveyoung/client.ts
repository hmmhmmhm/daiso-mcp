/**
 * 올리브영 Zyte 클라이언트
 *
 * Zyte extract API를 통해 올리브영 내부 API를 우회 호출합니다.
 */

import { OLIVEYOUNG_API } from './api.js';
import type {
  OliveyoungApiResponse,
  OliveyoungProduct,
  OliveyoungStore,
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

  const products = list.map((product) => ({
    goodsNumber: product.goodsNumber || '',
    goodsName: product.goodsName || '',
    priceToPay: product.priceToPay || 0,
    originalPrice: product.originalPrice || 0,
    discountRate: product.discountRate || 0,
    o2oStockFlag: Boolean(product.o2oStockFlag),
    o2oRemainQuantity: product.o2oRemainQuantity || 0,
  }));

  return {
    totalCount: body.data?.totalCount || 0,
    nextPage: Boolean(body.data?.nextPage),
    products,
  };
}
