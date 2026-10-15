/**
 * 이마트24 API 엔드포인트 중앙 관리
 */

export const EMART24_API = {
  WEB_BASE_URL: 'https://emart24.co.kr',
  EVERSE_BASE_URL: 'https://everse.emart24.co.kr',
  STORE_PATH: '/api1/store',
  PRODUCT_SEARCH_PATH: '/stock/stock/search',
  STOCK_SEARCH_STORE_PATH: '/api/stock/v3/stock-search/store',
  STORE_DETAIL_PATH_PREFIX: '/api/stock/stock/store/',
} as const;
