/**
 * GS25 API 엔드포인트 중앙 관리
 */

export const GS25_API = {
  BFF_BASE_URL: 'https://b2c-bff.woodongs.com',
  STORE_STOCK_PATH: '/api/bff/v2/store/stock',
  APIGW_BASE_URL: 'https://b2c-apigw.woodongs.com',
  TOTAL_SEARCH_PATH: '/search/v3/totalSearch',
} as const;
