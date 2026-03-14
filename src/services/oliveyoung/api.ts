/**
 * 올리브영 API 엔드포인트 중앙 관리
 */

export const OLIVEYOUNG_API = {
  BASE_URL: 'https://www.oliveyoung.co.kr',
  STORE_FINDER_PATH: '/oystore/api/storeFinder/find-store',
  PRODUCT_SEARCH_PATH: '/oystore/api/stock/product-search-v3',
  STOCK_GOODS_INFO_PATH: '/oystore/api/stock/stock-goods-info-v3',
  STOCK_STORES_PATH: '/oystore/api/stock/stock-stores',
} as const;
