# CGV 네트워크 분석 결과 (실측 업데이트)

작성일: 2026-03-04 (KST)
대상:
- `https://www.cgv.co.kr`
- `https://api.cgv.co.kr`
- `https://oidc.cgv.co.kr`

## 결론 요약

- Playwright(로컬 브라우저) 직접 접속: `실패`
  - 차단 페이지 노출(Cloudflare / 비정상 접속 안내)
- 비브라우저 직접 호출(서버 IP): `실패`
  - `https://api.cgv.co.kr`에서 403 차단
- Zyte 프록시 + 신 API + 서명 헤더: `성공`
  - 극장/영화/시간표 모두 실데이터 수신 확인

## 스크래핑 플레이북 기준 판정

1. Playwright MCP로 브라우저 동작 재현
- 결과: 차단 재현(실패)

2. 브라우저 요청 체인 분석
- 기존 `m.cgv.co.kr/WebAPP/ReservationV5/*` 경로는 현재 실효성 없음
- 신 프론트 번들에서 `api.cgv.co.kr` 티켓 API 확인

3. 비브라우저 재현 시도
- 직접 호출은 403
- Zyte 프록시 경유 시 성공

## 현재 유효 엔드포인트 (티켓)

- `GET /cnm/atkt/searchRegnList`
  - 목적: 지역/극장 목록
  - 필수 쿼리: `coCd=A420`

- `GET /cnm/atkt/searchOnlyCgvMovList`
  - 목적: 특정 극장/날짜 영화 목록
  - 필수 쿼리: `coCd`, `siteNo`, `scnYmd(YYYYMMDD)`

- `GET /cnm/atkt/searchSchByMov`
  - 목적: 특정 극장/날짜/영화 시간표
  - 필수 쿼리: `coCd`, `siteNo`, `scnYmd`, `movNo`, `rtctlScopCd`
  - `rtctlScopCd` 누락 시 에러: `발매통제범위코드는 필수 요청 파라미터`
  - 실측 성공값: `rtctlScopCd=01`

## 필수 요청 헤더

- `Accept: application/json`
- `Accept-Language: ko-KR`
- `X-TIMESTAMP: <epoch-seconds>`
- `X-SIGNATURE: <base64-hmac-sha256>`

서명 규칙:
- 메시지: `{timestamp}|{pathname}|{bodyText}`
- 알고리즘: `HMAC-SHA256`
- 키: 프론트 번들에 하드코딩된 secret 사용

## 실데이터 확인 샘플 (2026-03-04)

- 극장 목록:
  - `siteNo=0056`, `siteNm=강남` 포함
- 영화 목록(강남/20260304):
  - `movNo=30000985`, `movNm=엔하이픈 [워크 더 라인 썸머 에디션] 인 시네마`
- 시간표(강남/20260304/30000985/rtctlScopCd=01):
  - 회차 2건 수신
  - 예: `scnsrtTm=1230`, `scnendTm=1443`, `frSeatCnt=118`

## 정규화 매핑

### 극장 목록

- 입력: `siteNo`, `siteNm`, `regnGrpCd`
- 출력: `theaterCode`, `theaterName`, `regionCode`

### 영화 목록

- 입력: `movNo`, `movNm`, `cratgClsNm`
- 출력: `movieCode`, `movieName`, `rating`

### 시간표

- 입력: `scnYmd`, `scnSseq`, `siteNo`, `siteNm`, `movNo`, `movNm`, `scnsrtTm`, `scnendTm`, `stcnt`, `frSeatCnt`
- 출력: `scheduleId`, `playDate`, `theaterCode`, `theaterName`, `movieCode`, `movieName`, `startTime`, `endTime`, `totalSeats`, `remainingSeats`

## 구현 전략 (우선순위)

1. 브라우저 기반 성공 경로 확보
- Playwright는 차단되므로 Zyte 프록시를 브라우저 대체 경로로 사용

2. 비브라우저 직접 호출 우선
- 직접 호출 시도 후 403이면 fallback

3. 불가피 시 Zyte 프록시 fallback
- 동일 헤더/서명 규칙으로 `api.cgv.co.kr` 호출

## 후속 TODO

- OIDC(`oidc.cgv.co.kr`) 기반 토큰 흐름이 필요한 API 범위 추가 분석
- `rtctlScopCd` 값 체계 및 의미 문서화
- 요일/상영관 유형 필터링 파라미터 정리

## 문제 구간 업데이트 (2026-03-04, KST)

스크래핑 플레이북의 "응답이 비어 있을 때 조건 변경 재검증" 절차에 따라
`/api/cgv/timetable`만 별도 재검증했습니다.

### 재검증 결과

- 정상:
  - `/api/cgv/theaters?playDate=20260304&limit=3` -> 극장 3건
  - `/api/cgv/movies?playDate=20260304&theaterCode=0056` -> 영화 11건
- 문제:
  - `/api/cgv/timetable?playDate=20260304&limit=3` -> `timetable=[]`
  - `/api/cgv/timetable?playDate=20260304&theaterCode=0056&limit=3` -> `timetable=[]`
  - `/api/cgv/timetable?playDate=20260304&theaterCode=0056&movieCode=30001010&limit=5` -> `timetable=[]`
  - `/api/cgv/timetable?playDate=20260305&theaterCode=0056&limit=5` -> `timetable=[]`

### 현재 판정

- `theaters`, `movies`는 실응답 정상
- `timetable`은 성공 응답(`success=true`)이지만 데이터 0건으로 고정되는 현상 존재
- 따라서 현재 시점에서는 "시간표 API 데이터 경로 이상/조건 불일치" 상태로 분류

### 추정 원인 (실측 기반 가설)

- `movieCode` 자동 선택 로직이 실제 상영 스케줄이 없는 코드로 고정될 가능성
- CGV 상영 시간표 조회 조건(`movNo`, `rtctlScopCd`, 날짜/지점 조합) 유효성 변화 가능성
- 데이터 공급 API는 성공하지만, 최종 스케줄 데이터셋이 빈 조건으로 조회되는 가능성

### 다음 조사 포인트

- Zyte 원본 응답에서 `searchSchByMov` 요청/응답 payload를 그대로 로그하여
  빈 배열이 upstream인지, 정규화 단계인지 분리 확인
- `movieCode` 미지정 시 "첫 영화 고정" 대신 상영건 존재하는 영화를 탐색하는 로직 검토

### 원인 확인 및 코드 반영 (2026-03-04, KST)

- 원인 확인:
  - `movieCode` 미지정 시 첫 영화(`30001010`)를 고정 조회
  - 해당 코드의 시간표가 0건이라 `/api/cgv/timetable` 기본 호출이 빈 배열로 귀결
  - 같은 조건에서 `movieCode=30000985` 지정 시 시간표 2건 확인

- 코드 반영:
  - `src/services/cgv/client.ts`의 `fetchCgvTimetable`을 수정해
    `movieCode`가 없을 때 영화 목록을 순차 조회하며 상영건이 있는 영화를 탐색
  - 최초로 시간표가 1건 이상 나오는 영화의 결과를 반환하도록 변경

- 검증:
  - CGV 관련 테스트 재실행 통과
  - `tests/services/cgv/client.test.ts`에 순차 탐색 동작 테스트 추가/갱신

## 브라우저 재검증 업데이트 (2026-03-06, KST)

사용자 제보 기준(웹 브라우저에서는 좌석이 보이는데 API는 비어 있음)으로
Playwright 브라우저에서 CGV 예매 페이지를 직접 재검증했습니다.

### 재현 결과

- 브라우저 예매 UI:
  - 경로: `https://cgv.co.kr/cnm/movieBook`
  - 극장: `안산(0211)`
  - 날짜: `20260306`
  - 회차/잔여좌석이 실제로 노출됨
    - 예: `왕과 사는 남자 22:30-24:37 175/248석`
    - 예: `호퍼스 22:25-24:19 124/132석`

- 우리 API:
  - `GET /api/cgv/timetable?playDate=20260306&theaterCode=0211`
  - 응답: `success=true`, `total=0`, `timetable=[]`

### 브라우저 네트워크 실측

- 브라우저가 실제로 호출한 시간표 API:
  - `GET /cnm/atkt/searchMovScnInfo`
  - 필수 파라미터: `coCd`, `siteNo`, `scnYmd`, `rtctlScopCd`
  - 실측값: `rtctlScopCd=08`
- 해당 응답은 `statusCode=0`이며 `data[]`에 `movNo`, `movNm`, `scnsrtTm`, `scnendTm`, `frSeatCnt`, `stcnt` 포함

### 원인 결론

- 기존 서버 구현은 주로 `searchSchByMov`(영화코드 중심) + `rtctlScopCd=01` 경로를 사용
- 브라우저 실사용 경로는 `searchMovScnInfo` + `rtctlScopCd=08`
- 따라서 극장/일자 조합에 따라 서버 경로에서는 빈 배열, 브라우저 경로에서는 정상 좌석 데이터가 발생

### 반영 방향

- 시간표 1차 조회를 `searchMovScnInfo + rtctlScopCd=08`로 전환
- 비정상 시 기존 `searchSchByMov` 경로를 fallback으로 유지
