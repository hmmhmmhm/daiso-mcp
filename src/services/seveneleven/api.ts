/**
 * 세븐일레븐 API 엔드포인트
 */

export const SEVENELEVEN_API = {
  BASE_URL: 'https://new.7-elevenapp.co.kr',
  SEARCH_GOODS_PATH: '/api/v1/open/search/goods',
  SEARCH_POPWORD_PATH: '/api/v1/open/search/popword',
  PRODUCT_PAGES_PATH: '/api/v1/product/pages',
  PRODUCT_ISSUES_PATH: '/api/v1/product/issues',
  EXHIBITION_MAIN_PATH: '/api/v1/exhibition/main/list',
} as const;
