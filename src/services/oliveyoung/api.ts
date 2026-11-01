/**
 * 올리브영 API 엔드포인트 중앙 관리
 */

export const OLIVEYOUNG_API = {
  BASE_URL: 'https://www.oliveyoung.co.kr',
  STORE_FINDER_PATH: '/oystore/api/storeFinder/find-store',
  PRODUCT_SEARCH_PATH: '/oystore/api/stock/product-search-v3',
  STOCK_GOODS_INFO_PATH: '/oystore/api/stock/stock-goods-info-v3',
  STOCK_STORES_PATH: '/oystore/api/stock/stock-stores',
  // 오특(오늘의 특가)은 JSON API 없이 HTML 페이지와 목록 조각으로만 제공됩니다.
  TODAY_DEALS_PAGE_PATH: '/store/main/getHotdealList.do',
  TODAY_DEALS_LIST_PATH: '/store/main/getHotdealPagingListAjax.do',
} as const;
