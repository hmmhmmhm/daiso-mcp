/**
 * CGV API 엔드포인트 중앙 관리
 */

export const CGV_API = {
  BASE_URL: 'https://api.cgv.co.kr',
  OIDC_BASE_URL: 'https://oidc.cgv.co.kr',
  COMPANY_CODE: 'A420',
  SIGNING_SECRET: 'ydqXY0ocnFLmJGHr_zNzFcpjwAsXq_8JcBNURAkRscg',
  THEATER_LIST_PATH: '/cnm/atkt/searchRegnList',
  MOVIE_LIST_PATH: '/cnm/atkt/searchOnlyCgvMovList',
  TIMETABLE_BY_SITE_PATH: '/cnm/atkt/searchMovScnInfo',
  TIMETABLE_PATH: '/cnm/atkt/searchSchByMov',
  TIMETABLE_SITE_SCOPE_CODE: '08',
  TIMETABLE_SCOPE_CODE: '01',
} as const;
