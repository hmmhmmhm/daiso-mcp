/**
 * 메가박스 서비스 전용 타입 정의
 */

export interface MegaboxTheater {
  theaterId: string;
  theaterName: string;
}

export interface MegaboxMovie {
  movieId: string;
  movieName: string;
  movieStatus?: string;
}

export interface MegaboxShowtime {
  scheduleId: string;
  movieId: string;
  movieName: string;
  theaterId: string;
  theaterName: string;
  playDate: string;
  startTime: string;
  endTime: string;
  totalSeats: number | null;
  remainingSeats: number | null;
}

export interface MegaboxTheaterInfo {
  theaterId: string;
  address: string;
  latitude: number | null;
  longitude: number | null;
}

interface MegaboxAreaBrchItem {
  brchNo?: string;
  brchNm?: string;
}

interface MegaboxMovieItem {
  movieNo?: string;
  movieNm?: string;
  movieStatCdNm?: string;
}

interface MegaboxMovieFormItem {
  playSchdlNo?: string;
  movieNo?: string;
  movieNm?: string;
  brchNo?: string;
  brchNm?: string;
  playDe?: string;
  playStartTime?: string;
  playEndTime?: string;
  restSeatCnt?: number | string;
  totSeatCnt?: number | string;
}

export interface MegaboxBookingListResponse {
  areaBrchList?: MegaboxAreaBrchItem[];
  movieList?: MegaboxMovieItem[];
  movieFormList?: MegaboxMovieFormItem[];
}
