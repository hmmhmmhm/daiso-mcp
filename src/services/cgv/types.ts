/**
 * CGV 서비스 전용 타입 정의
 */

export interface CgvTheater {
  theaterCode: string;
  theaterName: string;
  regionCode?: string;
  latitude?: number | null;
  longitude?: number | null;
  distanceKm?: number | null;
  address?: string | null;
}

export interface CgvMovie {
  movieCode: string;
  movieName: string;
  rating?: string;
}

export interface CgvTimetable {
  scheduleId: string;
  movieCode: string;
  movieName: string;
  theaterCode: string;
  theaterName: string;
  playDate: string;
  startTime: string;
  endTime: string;
  totalSeats: number;
  remainingSeats: number;
}

interface CgvTheaterItem {
  siteNo?: string;
  siteNm?: string;
  coCd?: string;
  bzplcOperStusNm?: string;
}

interface CgvMovieItem {
  movNo?: string;
  movNm?: string;
  cratgClsNm?: string | null;
}

interface CgvTimetableItem {
  siteNo?: string;
  siteNm?: string;
  scnYmd?: string;
  scnSseq?: string;
  movNo?: string;
  movNm?: string;
  prodNm?: string;
  scnsrtTm?: string;
  scnendTm?: string;
  stcnt?: number | string;
  frSeatCnt?: number | string;
  frtmpSeatCnt?: number | string;
}

export interface CgvTheaterListResponse {
  statusCode?: number;
  statusMessage?: string;
  data?: Array<{
    regnGrpCd?: string;
    regnGrpNm?: string;
    siteList?: CgvTheaterItem[];
  }>;
}

export interface CgvMovieListResponse {
  statusCode?: number;
  statusMessage?: string;
  data?: CgvMovieItem[];
}

export interface CgvTimetableResponse {
  statusCode?: number;
  statusMessage?: string;
  data?: CgvTimetableItem[];
}
