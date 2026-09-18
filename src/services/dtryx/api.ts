/**
 * 디트릭스(Dtryx) API 엔드포인트 및 상수
 *
 * 디트릭스는 국내 독립·예술영화관 다수가 공용으로 사용하는 예매 플랫폼입니다.
 * 공개 조회 엔드포인트이며 별도 인증 키가 필요하지 않습니다.
 */

export const DTRYX_API = {
  /**
   * 극장 홈페이지에는 비표준 포트(:30443)가 적혀 있지만 표준 포트에서도
   * 같은 응답을 받습니다. Cloudflare Workers 배포 환경에서 비표준 포트로
   * 나가는 호출이 간헐적으로 실패해 표준 포트를 사용합니다.
   */
  BASE_URL: 'https://api.dtryx.com',
  THIRDPARTY_PATH: '/dtryx/cms/thirdparty/movie',
  CHANNEL_CODE: 'homepage',
  ENDPOINTS: {
    TIMETABLE_LIST: 'third-party-type2-timetable-list',
    PLAY_DATE_LIST: 'third-party-type2-timetable-play-date-list',
    MOVIE_NOW: 'third-party-type2-movie-now',
  },
  /**
   * 엔드포인트별 고정 작업 식별자입니다.
   * 각 극장 홈페이지에 공개된 값과 동일합니다.
   */
  WORK_GUIDS: {
    TIMETABLE_LIST: '37E0BA0F-DA5F-4376-9BA4-B5D27286AB87',
    PLAY_DATE_LIST: '324A2914-AB19-42A3-BDFE-58A08B2DC35D',
    MOVIE_NOW: '6D741A36-A973-4BC4-87B4-2475E6654114',
  },
} as const;
