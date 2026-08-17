# 롯데시네마 네트워크 분석 결과 (실측 기반)

작성일: 2026-03-10 (KST)  
실측 도구: Playwright MCP  
대상:

- `https://www.lottecinema.co.kr/NLCHS/Ticketing`
- `https://www.lottecinema.co.kr/LCWS/Ticketing/TicketingData.aspx`
- `https://www.lottecinema.co.kr/LCWS/Common/MainData.aspx`

## 결론 요약

- Playwright 없이 터미널 리플레이: `성공`
  - `curl --form-string 'paramList=...'`만으로 핵심 API 재현 성공
  - 별도 로그인, 쿠키, 서명 헤더 없이 응답 수신 확인
- 근처 영화관 조회: `가능`
  - `GetTicketingPageTOBE` 응답에 극장별 `Latitude`, `Longitude`, `CinemaAddrSummary`가 포함됨
- 상영중 영화/상영 회차 목록 조회: `가능`
  - `GetTicketingPageTOBE`에서 전체 영화/극장 기본 목록 확보
  - `GetPlaySequence`에서 날짜/극장/영화 조합별 회차 실데이터 확보
- 남은 좌석 수 조회: `가능`
  - `GetPlaySequence`의 `TotalSeatCount`, `BookingSeatCount`로 계산 가능
  - 실측 기준 `remainingSeats = BookingSeatCount`
  - `bookedSeats = TotalSeatCount - BookingSeatCount`
- 좌석 맵 상세 조회: `조건부 가능`
  - `GetSeats`로 좌석 맵은 조회되나, `BookingSeats`/`ScreenSeatInfo.BookingCount`와
    `GetPlaySequence.BookingSeatCount`의 의미 차이가 있어
    "잔여 좌석 수 소스"로는 즉시 채택하지 않는 편이 안전함

---

## 1) Playwright 기준 동작 방식 이해

### A. 진입 구조

- 예매 화면은 별도 iframe 없이 `/NLCHS/Ticketing` 단일 페이지에서 동작
- 프론트 번들:
  - `Scripts/Dist/TicketingIndex.bundle.js`
  - `Scripts/common/Common.js`
- 공통 URL 매핑 함수:
  - `GetLcwsUrls('ticket') -> /LCWS/Ticketing/TicketingData.aspx`
  - `GetLcwsUrls('main') -> /LCWS/Common/MainData.aspx`

### B. 공통 요청 규칙

- 대부분 `POST /LCWS/Ticketing/TicketingData.aspx`
- body 형식:
  - `FormData`
  - 키: `paramList`
  - 값: JSON 문자열
- 공통 필드:
  - `MethodName`
  - `channelType: "HO"`
  - `osType: "W"`
  - `osVersion: navigator.userAgent`

### C. 브라우저 클릭 시 실제 호출 순서

1. 예매 페이지 최초 로딩  
   -> `GetTicketingPageTOBE`

2. 극장 선택  
   -> `GetInvisibleMoviePlayInfo`
   -> `GetPlaySequence`
   -> `GetPopupMessageOnLine`

3. 영화 선택 후 재조회  
   -> `GetInvisibleMoviePlayInfo`
   -> `GetPlaySequence`

4. 특정 회차 선택 후 좌석 단계 진입  
   -> `GetSeats`

### D. 브라우저 없는 리플레이 검증 결과

- 검증일: `2026-03-10 (KST)`
- 도구: `curl`
- 전송 형식:
  - `POST https://www.lottecinema.co.kr/LCWS/Ticketing/TicketingData.aspx`
  - `--form-string 'paramList=<JSON>'`
  - User-Agent만 브라우저 계열로 지정

#### 성공 확인 API

- `GetTicketingPageTOBE`
  - 결과: `IsOK=true`, `ResultMessage=SUCCESS`
- `GetPlaySequence`
  - 결과: `IsOK=true`, `ResultMessage=SUCCESS`
  - 조건:
    - `playDate=2026-03-10`
    - `cinemaID=1|0001|1016`
    - `representationMovieCode=23816`
- `GetSeats`
  - 결과: `IsOK=true`, `ResultMessage=SUCCESS`
  - 조건:
    - `cinemaId=1016`
    - `screenId=1201`
    - `playDate=2026-03-10`
    - `playSequence=1`
    - `screenDivisionCode=300`

#### 현재 판정

- 롯데시네마 LCWS는 현재 시점에서 브라우저 세션 의존성이 낮음
- 따라서 서버 구현은 Playwright fallback 없이도
  일반 `fetch` 기반 클라이언트로 바로 진행 가능

---

## 2) 핵심 엔드포인트 실측

### 2.1 `POST /LCWS/Ticketing/TicketingData.aspx` + `MethodName=GetTicketingPageTOBE`

- 목적:
  - 예매 초기 화면 구성 데이터 일괄 조회
  - 날짜 목록, 지역 분류, 극장 목록, 영화 목록 동시 수신
- 요청 예시:

```json
{
  "MethodName": "GetTicketingPageTOBE",
  "channelType": "HO",
  "osType": "W",
  "osVersion": "<user-agent>",
  "memberOnNo": "0"
}
```

- 주요 응답 루트:
  - `MoviePlayDates.Items.Items[]`
  - `CinemaDivison.AreaDivisions.Items[]`
  - `CinemaDivison.SpecialTypeDivisions.Items[]`
  - `Cinemas.Cinemas.Items[]`
  - `Movies.Movies.Items[]`

#### 실측 확인 필드

- 날짜:
  - `PlayDate`, `IsPlayDate`, `DayOfWeekKR`
- 지역:
  - `DivisionCode`, `DetailDivisionCode`, `GroupNameKR`, `CinemaCount`
- 극장:
  - `CinemaID`, `CinemaNameKR`, `Latitude`, `Longitude`, `CinemaAddrSummary`
- 영화:
  - `RepresentationMovieCode`, `MovieNameKR`, `ViewGradeNameKR`, `PlayTime`, `ReleaseDate`

#### 2026-03-10 실측 샘플

- 지역 샘플:
  - `DetailDivisionCode=0001`, `GroupNameKR=서울`, `CinemaCount=23`
- 극장 샘플:
  - `CinemaID=1016`, `CinemaNameKR=월드타워`, `Latitude=37.5132941`, `Longitude=127.104215`
- 영화 샘플:
  - `RepresentationMovieCode=23816`, `MovieNameKR=왕과 사는 남자`
  - `RepresentationMovieCode=23873`, `MovieNameKR=호퍼스`
  - `RepresentationMovieCode=24024`, `MovieNameKR=굿 윌 헌팅`

### 2.2 `POST /LCWS/Ticketing/TicketingData.aspx` + `MethodName=GetPlaySequence`

- 목적:
  - 날짜/극장/영화 조건별 상영 회차 조회
  - 회차별 시작/종료 시각, 상영관, 전체 좌석, 예매 좌석 수 제공
- 가장 중요한 포인트:
  - `cinemaID`는 숫자형 극장 ID 단독이 아니라
    `divisionCode|detailDivisionCode|cinemaID` 복합 문자열이어야 정상 동작
  - 예: `1|0001|1016`

- 요청 예시:

```json
{
  "MethodName": "GetPlaySequence",
  "channelType": "HO",
  "osType": "W",
  "osVersion": "<user-agent>",
  "playDate": "2026-03-10",
  "cinemaID": "1|0001|1016",
  "representationMovieCode": "23816"
}
```

- 응답 루트:
  - `PlaySeqsHeader.Items[]`
  - `PlaySeqs.Items[]`

#### 주요 응답 필드

- 헤더/그룹:
  - `CinemaNameKR`
  - `MovieNameKR`
  - `ScreenDivisionNameKR`
  - `BrandNm_KR`
- 회차:
  - `CinemaID`
  - `RepresentationMovieCode`
  - `MovieCode`
  - `ScreenID`
  - `PlaySequence`
  - `PlayDt`
  - `StartTime`
  - `EndTime`
  - `ScreenNameKR`
  - `TotalSeatCount`
  - `BookingSeatCount`
  - `IsBookingYN`

#### 2026-03-10 실측 샘플

- 조건:
  - `cinemaID=1|0001|1016` (`월드타워`)
  - `representationMovieCode=23816` (`왕과 사는 남자`)
- 결과:
  - `PlaySeqsHeader.Items.length = 12`
  - `PlaySeqs.Items.length = 50`
- 첫 회차:
  - `ScreenID=1201`
  - `PlaySequence=1`
  - `StartTime=10:40`
  - `EndTime=12:47`
  - `ScreenNameKR=1관 샤롯데`
  - `TotalSeatCount=32`
  - `BookingSeatCount=28` (예매 가능/잔여 좌석)
  - `남은 좌석수 = 28`
  - `예매 좌석수 = 4`

#### 잔여 좌석 계산식

```text
remainingSeats = BookingSeatCount
bookedSeats = TotalSeatCount - BookingSeatCount
```

`BookingSeatCount` 필드명은 예매된 수처럼 보이지만, 공식 예매 화면과 `GetSeats` 점유 좌석 수와 대조하면 **예매 가능 좌석 수**다.

#### 실측 회차 예시

- `10:40-12:47`, 총 32석, 잔여 28석, 예매 4석
- `13:20-15:27`, 총 32석, 잔여 27석, 예매 5석
- `16:00-18:07`, 총 32석, 잔여 32석, 예매 0석
- `18:40-20:47`, 총 32석, 잔여 22석, 예매 10석

### 2.3 `POST /LCWS/Ticketing/TicketingData.aspx` + `MethodName=GetInvisibleMoviePlayInfo`

- 목적:
  - 극장/영화 선택 시 화면에 노출 가능한 조합을 보정하는 보조 API
  - 선택 불가 영화/극장 조합을 숨기는 용도로 보임
- 요청 예시:

```json
{
  "MethodName": "GetInvisibleMoviePlayInfo",
  "channelType": "HO",
  "osType": "W",
  "osVersion": "<user-agent>",
  "cinemaList": "1|0001|1016",
  "movieCd": "23816",
  "playDt": "2026-03-10"
}
```

- 판정:
  - 필수 기능 3종(근처 극장, 상영 목록, 잔여 좌석) 구현에는 보조 역할
  - 초기 구현에서는 생략 가능
  - UI와 동일한 필터링 품질이 필요해질 때 후속 반영 권장

### 2.4 `POST /LCWS/Ticketing/TicketingData.aspx` + `MethodName=GetSeats`

- 목적:
  - 특정 회차의 좌석 맵/좌석 상태/요금 정보 조회
- 요청 예시:

```json
{
  "MethodName": "GetSeats",
  "channelType": "HO",
  "osType": "W",
  "osVersion": "<user-agent>",
  "cinemaId": 1016,
  "screenId": 1201,
  "playDate": "2026-03-10",
  "playSequence": 1,
  "screenDivisionCode": 300
}
```

- 응답 루트:
  - `ScreenSeatInfo.Items[]`
  - `Seats.Items[]`
  - `BookingSeats.Items[]`
  - `Fees.Items[]`
  - `PlaySeqsDetails.Items[]`

#### 실측 확인 필드

- 좌석 기본:
  - `SeatNo`, `SeatRow`, `SeatColumn`, `SeatStatusCode`
- 좌석 메타:
  - `SeatXCoordinate`, `SeatYCoordinate`, `SeatXLength`, `SeatYLength`
- 점유 좌석:
  - `BookingSeats.Items[]`
- 화면 요약:
  - `ScreenSeatInfo.Items[0].TotalSeatCount`
  - `ScreenSeatInfo.Items[0].BookingCount`

#### 주의점

- 동일 조건에서:
  - `GetPlaySequence.BookingSeatCount = 28` (잔여/예매 가능)
  - `GetSeats.ScreenSeatInfo.BookingCount = 4` (실제 점유)
- 두 값은 모순이 아니라 의미가 다르다. `32 - 28 = 4`로 맞는다.
- 잔여 좌석 기능은 `GetPlaySequence.BookingSeatCount`를 그대로 쓰면 된다.

### 2.5 `POST /LCWS/Common/MainData.aspx` + `MethodName=GetPopupMessageOnLine`

- 목적:
  - 극장/회차 선택 시 노출할 팝업 메시지 조회
- 예매 핵심 데이터 소스는 아님
- 초기 구현 범위에서는 제외 가능

---

## 3) 구현 가능성 판정

### 즉시 구현 가능

- `lottecinema_find_nearby_theaters`
  - 데이터 소스: `GetTicketingPageTOBE`
  - 사용 필드: `CinemaID`, `CinemaNameKR`, `Latitude`, `Longitude`, `CinemaAddrSummary`

- `lottecinema_list_now_showing`
  - 데이터 소스:
    - 기본 목록: `GetTicketingPageTOBE`
    - 회차 상세: `GetPlaySequence`
  - 사용 필드:
    - 영화: `RepresentationMovieCode`, `MovieNameKR`, `ViewGradeNameKR`, `PlayTime`
    - 회차: `StartTime`, `EndTime`, `ScreenNameKR`

- `lottecinema_get_remaining_seats`
  - 데이터 소스: `GetPlaySequence`
  - 사용 필드:
    - `PlaySequence`, `TotalSeatCount`, `BookingSeatCount`

### 조건부 구현

- `lottecinema_get_seat_map`
  - 데이터 소스: `GetSeats`
  - 좌석 점유 상태 해석 검증이 더 필요함

---

## 4) 정규화 매핑 제안

### 극장 목록

- 입력:
  - `CinemaID`
  - `CinemaNameKR`
  - `DivisionCode`
  - `DetailDivisionCode`
  - `Latitude`
  - `Longitude`
  - `CinemaAddrSummary`
- 출력:
  - `theaterId`
  - `theaterName`
  - `regionCode`
  - `regionDetailCode`
  - `latitude`
  - `longitude`
  - `address`

### 영화 목록

- 입력:
  - `RepresentationMovieCode`
  - `MovieNameKR`
  - `ViewGradeNameKR`
  - `PlayTime`
  - `ReleaseDate`
- 출력:
  - `movieId`
  - `movieName`
  - `rating`
  - `durationMinutes`
  - `releaseDate`

### 상영 회차

- 입력:
  - `CinemaID`
  - `CinemaNameKR`
  - `RepresentationMovieCode`
  - `MovieNameKR`
  - `ScreenID`
  - `ScreenNameKR`
  - `PlaySequence`
  - `PlayDt`
  - `StartTime`
  - `EndTime`
  - `TotalSeatCount`
  - `BookingSeatCount`
- 출력:
  - `scheduleId`
  - `theaterId`
  - `theaterName`
  - `movieId`
  - `movieName`
  - `screenId`
  - `screenName`
  - `playDate`
  - `startTime`
  - `endTime`
  - `totalSeats`
  - `bookedSeats`
  - `remainingSeats`

---

## 5) 권장 코드 구조

기존 `cgv`, `megabox` 서비스와 동일한 패턴으로 구성하는 것이 가장 자연스럽습니다.

```text
src/services/lottecinema/
├── index.ts
├── api.ts
├── client.ts
├── types.ts
└── tools/
    ├── findNearbyTheaters.ts
    ├── listNowShowing.ts
    └── getRemainingSeats.ts
```

### 파일별 역할

- `api.ts`
  - `LOTTECINEMA_API.BASE_URL`
  - `LOTTECINEMA_API.TICKETING_PATH`
  - `LOTTECINEMA_API.MAIN_PATH`
  - 메서드 이름 상수
    - `GET_TICKETING_PAGE`
    - `GET_PLAY_SEQUENCE`
    - `GET_INVISIBLE_MOVIE_PLAY_INFO`
    - `GET_SEATS`

- `client.ts`
  - `fetchLotteCinemaTicketingPage()`
  - `fetchLotteCinemaPlaySequence()`
  - 필요 시 `fetchLotteCinemaSeats()`
  - 공통 body 생성:
    - `channelType: 'HO'`
    - `osType: 'W'`
    - `osVersion`
  - `cinemaID` 복합 문자열 변환 유틸 포함

- `types.ts`
  - LCWS 응답 타입 정의
  - 극장/영화/회차 정규화 타입 정의

- `tools/findNearbyTheaters.ts`
  - `GetTicketingPageTOBE` 응답의 좌표로 거리 계산

- `tools/listNowShowing.ts`
  - 날짜 + 극장 + 영화 조건으로 `GetPlaySequence` 결과 반환

- `tools/getRemainingSeats.ts`
  - `GetPlaySequence`의 회차별 좌석 수를 정규화해 반환

### 추가로 필요한 API 레이어

```text
src/api/
├── lottecinemaHandlers.ts
└── routes/
    └── lottecinemaRoutes.ts
```

### 테스트 권장 구조

```text
tests/
├── api/
│   └── lottecinema-handlers.test.ts
└── services/
    └── lottecinema/
        ├── client.test.ts
        ├── index.test.ts
        └── tools/
            ├── findNearbyTheaters.test.ts
            ├── listNowShowing.test.ts
            └── getRemainingSeats.test.ts
```

---

## 6) 구현 메모

### A. 근처 영화관 도구는 추가 HTML 파싱이 필요 없다

- 메가박스와 달리 롯데시네마는 초기 예매 응답에 이미 좌표가 포함됨
- 따라서 별도 상세 페이지를 추가 호출하지 않아도 됨

### B. `cinemaID` 문자열 생성이 핵심이다

- 내부 정규화에서는 `theaterId=1016`만 유지하더라도
  실제 `GetPlaySequence` 호출 직전에는
  `1|0001|1016` 형태로 복원해야 함
- 이를 위해 초기 극장 목록에서
  `DivisionCode`, `DetailDivisionCode`, `CinemaID`를 함께 캐시해야 함

### C. 잔여 좌석은 `GetPlaySequence`를 기준으로 고정한다

- `GetSeats`는 좌석 맵 단계의 보조 정보로만 사용
- 사용자 요구 기능 기준으로는 `GetPlaySequence`만으로 충분함

---

## 7) 다음 구현 순서 권장

1. `GetTicketingPageTOBE` 기반 클라이언트 구현
2. `GetPlaySequence` 기반 회차/잔여좌석 구현
3. `findNearbyTheaters`, `listNowShowing`, `getRemainingSeats` 도구 추가
4. API 핸들러/라우트 연결
5. `GetSeats`는 후속 단계로 분리
