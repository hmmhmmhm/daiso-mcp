# CGV 네트워크 분석 결과 (1차 구현용)

작성일: 2026-03-04 (KST)
대상: `https://m.cgv.co.kr`

## 목적

플러그인 아키텍처에 CGV 서비스를 1차 추가하기 위한 최소 엔드포인트를 정리합니다.

## 1차 구현 기준 엔드포인트

- `POST /WebAPP/ReservationV5/Reservation.aspx/GetTheaterList`
  - 사용 목적: 상영 가능 극장 목록 조회
  - 입력 필드(예시): `PlayYMD`, `AreaCd`

- `POST /WebAPP/ReservationV5/Reservation.aspx/GetMovieList`
  - 사용 목적: 날짜/극장 기준 영화 목록 조회
  - 입력 필드(예시): `PlayYMD`, `TheaterCd`

- `POST /WebAPP/ReservationV5/Reservation.aspx/GetTimeTableList`
  - 사용 목적: 날짜/극장/영화 기준 상영 시간표 조회
  - 입력 필드(예시): `PlayYMD`, `TheaterCd`, `MovieCd`

## 응답 정규화 규칙

### 극장 목록

- 입력 필드: `TheaterCd`, `TheaterName`, `AreaCd`
- 정규화: `theaterCode`, `theaterName`, `regionCode`

### 영화 목록

- 입력 필드: `MovieCd`, `MovieName`, `Grade`
- 정규화: `movieCode`, `movieName`, `rating`

### 시간표

- 입력 필드:
  - `ScheduleNo`, `MovieCd`, `MovieName`
  - `TheaterCd`, `TheaterName`
  - `PlayYmd`, `StartTime`, `EndTime`
  - `TotalSeat`, `RemainSeat`
- 정규화:
  - `scheduleId`, `movieCode`, `movieName`
  - `theaterCode`, `theaterName`
  - `playDate`, `startTime`, `endTime`
  - `totalSeats`, `remainingSeats`

## 도구 매핑

- `cgv_find_theaters`: 극장 목록 조회
- `cgv_search_movies`: 영화 목록 조회
- `cgv_get_timetable`: 시간표/잔여좌석 조회

## 1차 구현 범위

- MCP 도구 3종 등록
- GET API 3종 제공 (`/api/cgv/theaters`, `/api/cgv/movies`, `/api/cgv/timetable`)
- OpenAPI/프롬프트 문서 반영
- 단위 테스트 및 통합 테스트 추가

## 후속 개선 항목

- 지역 코드 매핑 테이블 고도화
- 상영 포맷(2D/IMAX/4DX) 상세 필드 정규화
- 실좌석 선택 단계 API 분석 및 좌석맵 제공
