/**
 * 다이소 API 엔드포인트 중앙 관리
 *
 * 모든 API URL을 한 곳에서 관리하여 유지보수성을 높입니다.
 */

/**
 * 다이소몰 API (daisomall.co.kr)
 * 상품 검색, 재고 조회 등
 */
export const DAISOMALL_API = {
  /** 상품 검색 API */
  SEARCH_PRODUCTS: 'https://prdm.daisomall.co.kr/ssn/search/FindStoreGoods',

  /** 온라인 재고 조회 API */
  ONLINE_STOCK: 'https://mapi.daisomall.co.kr/ms/msg/selOnlStck',

  /** 구 재고 조회 API (현재 403 Unauthorized 발생) */
  STORE_INVENTORY: 'https://mapi.daisomall.co.kr/ms/msg/newIntSelStr',

  /** 현재 사용 중인 인증 토큰 요청 API */
  AUTH_REQUEST: 'https://fapi.daisomall.co.kr/auth/request',

  /** 현재 사용 중인 위치 기반 매장 조회 API */
  STORE_SEARCH_V2: 'https://fapi.daisomall.co.kr/ms/msg/selStr',

  /** 현재 사용 중인 매장별 재고 조회 API */
  STORE_INVENTORY_V2: 'https://fapi.daisomall.co.kr/pd/pdh/selStrPkupStck',

  /** 매장 내 상품 진열 위치 조회 API */
  DISPLAY_LOCATION: 'https://fapi.daisomall.co.kr/pdo/selIntPdStDispInfo',

  /** 이미지 CDN 베이스 URL */
  IMAGE_BASE_URL: 'https://cdn.daisomall.co.kr',
} as const;

/**
 * 다이소 공식 사이트 API (daiso.co.kr)
 * 매장 검색 등
 */
export const DAISO_WEB_API = {
  /** 매장 검색 API */
  SHOP_SEARCH: 'https://www.daiso.co.kr/cs/ajax/shop_search',

  /** 시도별 구군 목록 조회 */
  SIDO_SEARCH: 'https://www.daiso.co.kr/cs/ajax/sido_search',

  /** 구군별 동 목록 조회 */
  GUGUN_SEARCH: 'https://www.daiso.co.kr/cs/ajax/gugun_search',
} as const;

/**
 * 이미지 URL 생성 헬퍼
 * @param path 이미지 경로 (API 응답에서 받은 상대 경로)
 * @returns 전체 이미지 URL 또는 undefined
 */
export function getImageUrl(path?: string): string | undefined {
  if (!path) return undefined;

  if (path.startsWith('http://') || path.startsWith('https://')) {
    try {
      const url = new URL(path);
      if (url.hostname === 'img.daisomall.co.kr') {
        url.hostname = 'cdn.daisomall.co.kr';
      }
      return url.toString();
    } catch {
      return path;
    }
  }

  return `${DAISOMALL_API.IMAGE_BASE_URL}${path}`;
}

/**
 * 영업 시간 포맷팅 헬퍼
 * 4자리 숫자(예: 0900)를 시간 형식(예: 09:00)으로 변환
 * @param time 4자리 시간 문자열
 * @returns 포맷팅된 시간 문자열
 */
export function formatTime(time: string): string {
  if (time.length === 4) {
    return `${time.slice(0, 2)}:${time.slice(2)}`;
  }
  return time;
}
