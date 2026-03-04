/**
 * CGV 서비스 전용 타입 정의
 */

export interface CgvTheater {
  theaterCode: string;
  theaterName: string;
  regionCode?: string;
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
  TheaterCd?: string;
  TheaterName?: string;
  AreaCd?: string;
}

interface CgvMovieItem {
  MovieCd?: string;
  MovieName?: string;
  Grade?: string;
}

interface CgvTimetableItem {
  ScheduleNo?: string;
  MovieCd?: string;
  MovieName?: string;
  TheaterCd?: string;
  TheaterName?: string;
  PlayYmd?: string;
  StartTime?: string;
  EndTime?: string;
  TotalSeat?: number | string;
  RemainSeat?: number | string;
}

export interface CgvTheaterListResponse {
  d?: {
    TheaterList?: CgvTheaterItem[];
  };
}

export interface CgvMovieListResponse {
  d?: {
    MovieList?: CgvMovieItem[];
  };
}

export interface CgvTimetableResponse {
  d?: {
    TimeTableList?: CgvTimetableItem[];
  };
}
