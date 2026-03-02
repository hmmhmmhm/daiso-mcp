# CU 편의점 네트워크 분석 결과 (실측 기반)

작성일: 2026-03-02 (KST)
실측 도구: Playwright MCP
대상:
- `https://cu.bgfretail.com/store/list.do?category=store`
- `https://www.pocketcu.co.kr/` (리다이렉트 확인)

## 결론 요약

- 주변 매장 조회: `가능` (웹 API 실측 성공)
- 재고 조회: `웹 기준 미확인` (포켓CU 앱 전용으로 추정, 앱 트래픽 실측 필요)
- 구현 판정:
  - `cu_find_nearby_stores`는 즉시 구현 가능
  - `cu_check_inventory`는 앱 API 실측 전까지 보류

## 1) 매장 조회 API 실측 결과

`store/list.do` 페이지의 인라인 스크립트와 실제 UI 조작으로 아래 API 3종을 확인했습니다.

### A. 시/도 -> 구/군 조회

- Endpoint: `POST /store/GugunList.do`
- 호출 근거:
  - 페이지 스크립트의 `searchGugunList()`에서 AJAX 호출
  - `url: "/store/GugunList.do"`, `type:"post"`
- UI 실측:
  - `#sido`를 `서울특별시`로 변경 후 `#Gugun` 옵션이 동적으로 채워짐
  - 상위 옵션 예시: `강남구`, `강동구`, `강북구`, `강서구` ...

### B. 구/군 -> 동 조회

- Endpoint: `POST /store/DongList.do`
- 호출 근거:
  - 페이지 스크립트의 `selectedGugun()`에서 AJAX 호출
  - `url: "/store/DongList.do"`, `type:"post"`
- UI 실측:
  - `#Gugun`을 `강남구`로 변경 후 `#Dong` 옵션이 동적으로 채워짐
  - 상위 옵션 예시: `개포2동`, `개포4동`, `개포동`, `논현1동`, `논현2동` ...

### C. 매장 목록 조회

- Endpoint: `POST /store/list_Ajax.do`
- 호출 근거:
  - 페이지 스크립트의 `searchList(pageNo)`에서 AJAX 호출
  - `url: "/store/list_Ajax.do"`, `type:"post"`, `data: $('#listForm').serialize()`
- UI 실측:
  - `#jumpoName`에 `강남` 입력 후 검색 클릭
  - `#dataTable`에 매장 목록 렌더링 확인
- 응답(HTML)에서 확인한 필드 예시:
  - 매장명: `강남CC점`, `강남거평점`, `강남남명학사점`
  - 연락처: `070-7604-3123` 등
  - 주소: `서울특별시 강남구 ...`
  - 내부 코드: `searchLatLng('주소', '51006')` 형태의 점포 코드 포함

## 2) 실측 증거

브라우저 리소스 타이밍에서 아래 요청 URL을 확인했습니다.

- `https://cu.bgfretail.com/store/list_Ajax.do`
- `https://cu.bgfretail.com/store/GugunList.do`
- `https://cu.bgfretail.com/store/DongList.do`

추가로, `list_Ajax.do` 결과가 실제 DOM `#dataTable`에 반영되어 검색 결과 테이블이 생성되는 것을 확인했습니다.

## 3) 요청 파라미터 구조 (실측 기반)

`listForm` 직렬화 기준 주요 필드는 다음과 같습니다.

- `pageIndex`
- `jumpoName` (매장명 검색어)
- `jumpoSido`, `jumpoGugun`, `jumpodong` (지역 검색)
- 서비스 필터: `jumpoHour`, `jumpoDelivery`, `jumpoBakery`, `jumpoFry`, `jumpoCafe`, `jumpoLotto`, `jumpoToto`, `jumpoCash`, `jumpoMultiDevice`, `jumpoPosCash`, `jumpoBattery`

## 4) 재고 조회 실측 결과

### 웹 채널 관찰

- `https://www.pocketcu.co.kr/` 접속 시 `https://cu.bgfretail.com/membership/app_info.do?...`로 리다이렉트됨
- 해당 페이지는 포켓CU 기능 소개/앱 다운로드 안내 페이지이며, 재고 조회용 API 호출은 관측되지 않음
- 현재 웹 채널 실측 범위에서는 `상품 재고 수량 API`를 확인하지 못함

### 판정

- 재고 조회 기능은 포켓CU 앱 채널(인증/디바이스 컨텍스트) 기반일 가능성이 높음
- `cu_check_inventory` 구현을 위해서는 앱 트래픽 실측이 필요함

## 5) 구현 권장안

### 즉시 구현 가능

- `cu_find_nearby_stores`
  - 데이터 소스: `/store/list_Ajax.do` + `/store/GugunList.do` + `/store/DongList.do`
  - 응답 파싱: HTML 테이블 파싱 + 점포 코드/주소/연락처 추출

### 실측 후 구현

- `cu_check_inventory`
  - 선행 조건: 포켓CU 앱 재고 조회 API 실측(엔드포인트, 인증, 요청 스키마)

## 6) 다음 실측 작업

1. Android/iOS 포켓CU 앱에서 재고조회 시나리오 네트워크 캡처
2. 재고 API 엔드포인트 및 필수 인증 헤더/토큰 확인
3. 비로그인/로그인 상태 재현성 비교
4. Cloudflare Worker에서 재현 가능성 판정(A/B/C)
