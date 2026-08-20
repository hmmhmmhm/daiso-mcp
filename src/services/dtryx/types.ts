/**
 * 디트릭스 서비스 전용 타입 정의
 */

/** 디트릭스에 등록된 극장 */
export interface DtryxCinema {
  brandCode: string;
  cinemaCode: string;
  cinemaName: string;
  /** 광역 지역명 (예: 서울, 경기, 부산) */
  region: string;
  /** 도로명 주소 */
  address: string;
}

/** 상영 가능 날짜 */
export interface DtryxPlayDate {
  playDate: string;
  hidden: boolean;
  rest: boolean;
}

/** 상영 회차 */
export interface DtryxShowtime {
  scheduleId: string;
  brandCode: string;
  cinemaCode: string;
  cinemaName: string;
  screenCode: string;
  screenName: string;
  movieCode: string;
  movieName: string;
  playDate: string;
  startTime: string;
  endTime: string;
  runningMinutes: number;
  rating: string;
  totalSeats: number;
  remainingSeats: number;
  bookedSeats: number;
  planStatus: string;
}

/** 상영작 */
export interface DtryxMovie {
  movieCode: string;
  movieName: string;
  rating?: string;
  runningMinutes?: number;
}

interface DtryxEnvelope<TRecord> {
  RetCode?: string | number;
  RetMsg?: string;
  RecordCount?: number;
  Recordset?: TRecord[];
}

export interface DtryxTimetableItem {
  CinemaCd?: string;
  CinemaNm?: string;
  ScreenCd?: string;
  ScreenNm?: string;
  PlaySDT?: string;
  ShowSeq?: string | number;
  PlanStatus?: string;
  StartTime?: string;
  EndTime?: string;
  MovieCd?: string;
  MovieNm?: string;
  RunningTime?: string | number;
  RatingNm?: string;
  TotalSeatCnt?: string | number;
  RemainSeatCnt?: string | number;
}

export interface DtryxPlayDateItem {
  PlaySDT?: string;
  HiddenYn?: string;
  RestYn?: string;
}

export interface DtryxMovieItem {
  MovieCd?: string;
  MovieNm?: string;
  RatingNm?: string;
  RunningTime?: string | number;
}

export type DtryxTimetableResponse = DtryxEnvelope<DtryxTimetableItem>;
export type DtryxPlayDateResponse = DtryxEnvelope<DtryxPlayDateItem>;
export type DtryxMovieResponse = DtryxEnvelope<DtryxMovieItem>;
