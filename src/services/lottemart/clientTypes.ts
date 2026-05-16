/**
 * 롯데마트 클라이언트 입력 타입
 */

export interface RequestOptions {
  timeout?: number;
  googleMapsApiKey?: string;
  zyteApiKey?: string;
  sessionCookie?: string;
}

export interface FetchLotteMartStoresParams {
  area?: string;
  keyword?: string;
  brandVariant?: string;
  latitude?: number;
  longitude?: number;
  limit?: number;
}

export interface SearchLotteMartProductsParams {
  area?: string;
  storeCode?: string;
  storeName?: string;
  keyword: string;
  pageLimit?: number;
}
