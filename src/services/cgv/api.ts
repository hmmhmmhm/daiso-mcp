/**
 * CGV API 엔드포인트 중앙 관리
 */

export const CGV_API = {
  BASE_URL: 'https://m.cgv.co.kr',
  THEATER_LIST_PATH: '/WebAPP/ReservationV5/Reservation.aspx/GetTheaterList',
  MOVIE_LIST_PATH: '/WebAPP/ReservationV5/Reservation.aspx/GetMovieList',
  TIMETABLE_PATH: '/WebAPP/ReservationV5/Reservation.aspx/GetTimeTableList',
} as const;
