/**
 * 올리브영 Zyte 클라이언트
 *
 * Zyte extract API를 통해 올리브영 내부 API를 우회 호출합니다.
 */

import { OLIVEYOUNG_API, ZYTE_API_URL } from './api.js';
import type {
  OliveyoungApiResponse,
  OliveyoungProduct,
  OliveyoungStore,
  ZyteExtractResponse,
} from './types.js';

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

function resolveApiKey(apiKey?: string): string {
  if (apiKey && apiKey.trim().length > 0) {
    return apiKey;
  }

  if (typeof process !== 'undefined' && process.env?.ZYTE_API_KEY) {
    return process.env.ZYTE_API_KEY;
  }

  throw new Error('ZYTE_API_KEY가 설정되지 않았습니다. .env 또는 Cloudflare Worker Secret을 확인해주세요.');
}

function encodeBasicAuth(apiKey: string): string {
  if (typeof btoa === 'function') {
    return btoa(`${apiKey}:`);
  }

  if (typeof Buffer !== 'undefined') {
    return Buffer.from(`${apiKey}:`).toString('base64');
  }

  throw new Error('Basic 인증 인코딩을 지원하지 않는 런타임입니다.');
}

function decodeBase64(value: string): string {
  if (typeof atob === 'function') {
    const binary = atob(value);
    const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
    return new TextDecoder().decode(bytes);
  }

  if (typeof Buffer !== 'undefined') {
    return Buffer.from(value, 'base64').toString('utf8');
  }

  throw new Error('Base64 디코딩을 지원하지 않는 런타임입니다.');
}

async function zyteExtract(
  targetPath: string,
  requestBody: Record<string, unknown>,
  options: RequestOptions = {}
): Promise<OliveyoungApiResponse> {
  const { timeout = 15000 } = options;
  const apiKey = resolveApiKey(options.apiKey);
  const auth = encodeBasicAuth(apiKey);

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeout);

  try {
    const response = await fetch(ZYTE_API_URL, {
      method: 'POST',
      headers: {
        Authorization: `Basic ${auth}`,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify({
        url: `${OLIVEYOUNG_API.BASE_URL}${targetPath}`,
        httpRequestMethod: 'POST',
        customHttpRequestHeaders: [
          { name: 'Content-Type', value: 'application/json' },
          { name: 'Accept', value: 'application/json' },
          { name: 'X-Requested-With', value: 'XMLHttpRequest' },
        ],
        httpRequestText: JSON.stringify(requestBody),
        httpResponseBody: true,
      }),
      signal: controller.signal,
    });

    const result = (await response.json()) as ZyteExtractResponse;

    if (!response.ok) {
      throw new Error(`Zyte API 호출 실패: ${response.status} ${result.detail || result.title || ''}`.trim());
    }

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
  } finally {
    clearTimeout(timeoutId);
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
