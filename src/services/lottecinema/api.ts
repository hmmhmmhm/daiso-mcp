/**
 * 롯데시네마 API 엔드포인트 및 메서드 상수
 */

export const LOTTECINEMA_API = {
  BASE_URL: 'https://www.lottecinema.co.kr',
  TICKETING_PATH: '/LCWS/Ticketing/TicketingData.aspx',
  MAIN_PATH: '/LCWS/Common/MainData.aspx',
  METHODS: {
    GET_TICKETING_PAGE: 'GetTicketingPageTOBE',
    GET_PLAY_SEQUENCE: 'GetPlaySequence',
  },
} as const;
