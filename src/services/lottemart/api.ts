/**
 * 롯데마트 모바일 도와센터 엔드포인트
 */

export const LOTTEMART_API = {
  BASE_URL: 'https://company.lottemart.com',
  ORIGIN_HOST: 'company.lottemart.com',
  SOCKET_HOST: '210.93.146.57',
  ORIGIN_REFERER: 'https://company.lottemart.com/mobiledowa/',
  MARKET_OPTIONS_PATH: '/mobiledowa/inc/asp/search_market_list.asp',
  STORE_SEARCH_PATH: '/mobiledowa/market/search_shop.asp',
  PRODUCT_SEARCH_PATH: '/mobiledowa/product/search_product.asp',
  PRODUCT_PAGE_PATH: '/mobiledowa/inc/asp/search_product_list.asp',
} as const;

export const LOTTEMART_AREAS = [
  '서울',
  '경기',
  '인천',
  '강원',
  '충북',
  '충남',
  '대전',
  '경북',
  '경남',
  '대구',
  '부산',
  '울산',
  '전북',
  '전남',
  '광주',
  '기타',
] as const;

export type LotteMartAreaCode = (typeof LOTTEMART_AREAS)[number];
