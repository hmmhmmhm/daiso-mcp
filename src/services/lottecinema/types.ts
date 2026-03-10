/**
 * 롯데시네마 서비스 전용 타입 정의
 */

export interface LotteCinemaTheater {
  theaterId: string;
  theaterName: string;
  regionCode: string;
  regionDetailCode: string;
  latitude: number | null;
  longitude: number | null;
  address: string;
}

export interface LotteCinemaMovie {
  movieId: string;
  movieName: string;
  rating?: string;
  durationMinutes?: number;
  releaseDate?: string;
}

export interface LotteCinemaShowtime {
  scheduleId: string;
  theaterId: string;
  theaterName: string;
  movieId: string;
  movieName: string;
  screenId: string;
  screenName: string;
  playDate: string;
  startTime: string;
  endTime: string;
  totalSeats: number;
  bookedSeats: number;
  remainingSeats: number;
}

interface LotteCinemaTicketingTheaterItem {
  CinemaID?: string | number;
  CinemaNameKR?: string;
  DivisionCode?: string | number;
  DetailDivisionCode?: string | number;
  Latitude?: string | number | null;
  Longitude?: string | number | null;
  CinemaAddrSummary?: string;
}

interface LotteCinemaTicketingMovieItem {
  RepresentationMovieCode?: string | number;
  MovieNameKR?: string;
  ViewGradeNameKR?: string | null;
  PlayTime?: string | number | null;
  ReleaseDate?: string | null;
}

interface LotteCinemaPlaySequenceItem {
  CinemaID?: string | number;
  CinemaNameKR?: string;
  RepresentationMovieCode?: string | number;
  MovieNameKR?: string;
  ScreenID?: string | number;
  ScreenNameKR?: string;
  PlaySequence?: string | number;
  PlayDt?: string;
  StartTime?: string;
  EndTime?: string;
  TotalSeatCount?: string | number;
  BookingSeatCount?: string | number;
}

export interface LotteCinemaTicketingPageResponse {
  IsOK?: boolean;
  ResultMessage?: string;
  Cinemas?: {
    Cinemas?: {
      Items?: LotteCinemaTicketingTheaterItem[];
    };
  };
  Movies?: {
    Movies?: {
      Items?: LotteCinemaTicketingMovieItem[];
    };
  };
}

export interface LotteCinemaPlaySequenceResponse {
  IsOK?: boolean;
  ResultMessage?: string;
  PlaySeqs?: {
    Items?: LotteCinemaPlaySequenceItem[];
  };
}
