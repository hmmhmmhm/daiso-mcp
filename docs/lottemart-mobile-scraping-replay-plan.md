# 롯데마트 모바일 도와센터 스크래핑 리플레이 계획

작성일: 2026-03-14 (KST)
대상: `https://company.lottemart.com/mobiledowa/#`

## 1. 결론

롯데마트 모바일 도와센터는 앱 암호화나 난독화된 내부 API가 아니라,
`ASP + jQuery AJAX + HTML 응답` 구조로 동작합니다.

현재 확인 기준으로:

- 인증 토큰 없이 `curl` 재현 가능
- 지역별 매장 목록 조회 가능
- 지역 전체 매장 상세 조회 가능
- 매장별 상품 검색 및 추가 페이지 조회 가능
- 좌표는 직접 내려주지 않아 `nearby` 기능은 주소 지오코딩 보완이 필요

즉, 이 프로젝트 기준 판정은 **구현 가능(A)** 입니다.

## 2. 플레이북 기준 실측 요약

`docs/scraping-playbook.md` 원칙대로 먼저 모바일 페이지를 열어 실제 UI 흐름을 확인했습니다.

- 메인 페이지에서 확인된 핵심 플로우
  - 지역 선택 시 `search_market_list.asp`
  - 매장 정보 제출 시 `search_shop.asp`
  - 상품 검색 제출 시 `search_product.asp`
  - 상품 더보기 클릭 시 `search_product_list.asp`

- 브라우저 실측으로 확인한 사실
  - `#m_area` 변경 시 매장 `<option>` HTML이 동적으로 채워짐
  - `search_shop.asp`는 `m_market` 없이도 지역 전체 매장 상세를 반환
  - `search_product.asp`는 첫 페이지 HTML과 `totalPage`를 함께 반환
  - 추가 페이지는 HTML fragment를 append 하는 방식

## 3. 현재 확인된 엔드포인트

베이스 URL:

- `https://company.lottemart.com`

### A. 지역별 매장 코드 목록

- `GET /mobiledowa/inc/asp/search_market_list.asp`
- 파라미터:
  - `p_area`: 지역명
  - `p_type`: `1` 상품 검색용, `2` 매장 정보용
  - `p_werks`: 선택 매장 코드(선택)

예시:

```bash
curl -sS --get 'https://company.lottemart.com/mobiledowa/inc/asp/search_market_list.asp' \
  --data-urlencode 'p_area=서울' \
  --data-urlencode 'p_type=2'
```

응답 형태:

```html
<option value="">매장선택</option>
<option value="2301">강변점</option>
<option value="2335">금천점</option>
...
```

### B. 지역별 매장 상세 목록

- `POST /mobiledowa/market/search_shop.asp`
- 파라미터:
  - `m_area`: 지역명
  - `m_market`: 매장 코드(선택)
  - `m_schWord`: 입점업체 검색어(선택)

예시:

```bash
curl -sS 'https://company.lottemart.com/mobiledowa/market/search_shop.asp' \
  -H 'content-type: application/x-www-form-urlencoded' \
  --data 'm_area=서울'
```

현재 확인된 필드:

- 매장명
- 영업시간
- 휴점일
- 주소
- 상담전화
- 주차정보
- `detail_shop.asp?werks=...` 링크

중요:

- `m_market` 없이도 해당 지역의 전체 매장 상세가 내려옵니다.
- 따라서 1차 수집은 `지역 -> 지역 전체 HTML` 순회만으로 충분합니다.

### C. 매장별 상품 검색

- `POST /mobiledowa/product/search_product.asp`
- 파라미터:
  - `p_area`: 지역명
  - `p_market`: 매장 코드
  - `p_schWord`: 상품 검색어

예시:

```bash
curl -sS 'https://company.lottemart.com/mobiledowa/product/search_product.asp' \
  -H 'content-type: application/x-www-form-urlencoded' \
  --data 'p_area=서울&p_market=2301&p_schWord=콜라'
```

현재 확인된 필드:

- 총 검색 건수
- `totalPage` 자바스크립트 변수
- 상품명
- 규격
- 제조사
- 가격
- 재고

주의:

- 응답 상단에 `"<-schWord<br>"` 같은 디버그성 문자열이 섞여 있을 수 있어
  파싱 시 본문 시작 전 잡음을 제거하는 방어 코드가 필요합니다.

### D. 상품 추가 페이지 조회

- `GET /mobiledowa/inc/asp/search_product_list.asp`
- 파라미터:
  - `p_market`: 매장 코드
  - `p_schWord`: 상품 검색어
  - `page`: 페이지 번호

예시:

```bash
curl -sS --get 'https://company.lottemart.com/mobiledowa/inc/asp/search_product_list.asp' \
  --data-urlencode 'p_market=2301' \
  --data-urlencode 'p_schWord=콜라' \
  --data-urlencode 'page=2'
```

응답은 `<li>...</li>` 조각 HTML입니다.

## 4. 매장 범위 확인 결과

메인 페이지 지역 선택지는 총 16개입니다.

- 서울
- 경기
- 인천
- 강원
- 충북
- 충남
- 대전
- 경북
- 경남
- 대구
- 부산
- 울산
- 전북
- 전남
- 광주
- 기타(`제주`)

`search_market_list.asp?p_type=2` 기준 실측 개수:

- 서울 `24`
- 경기 `38`
- 인천 `12`
- 강원 `4`
- 충북 `7`
- 충남 `6`
- 대전 `4`
- 경북 `4`
- 경남 `13`
- 대구 `3`
- 부산 `11`
- 울산 `3`
- 전북 `8`
- 전남 `7`
- 광주 `6`
- 기타 `2`

합계는 현재 실측 기준 `152`개입니다.

주의:

- 롯데마트 외에도 `토이저러스`, `맥스`, `보틀벙커`, `Mealguru`, `그랑그로서리`가 함께 노출됩니다.
- 서비스 스키마에서 `storeType` 또는 `brandVariant`를 분리해두는 편이 안전합니다.

## 5. 주변 매장 기능 설계

### 현재 제약

`search_shop.asp`와 `detail_shop.asp`에는 좌표(`lat/lng`)가 직접 포함되지 않았습니다.

즉, 이 프로젝트의 `findNearbyStores` 스타일 기능을 만들려면 아래 두 단계가 필요합니다.

1. 롯데마트 HTML에서 주소를 수집
2. 주소를 좌표로 변환 후 캐시

### 권장 구현 방식

기존 `GS25`, `CU`와 유사하게 지오코딩 보완 방식을 사용합니다.

- 1차 데이터 원본:
  - `search_shop.asp`에서 수집한 주소
- 2차 좌표 보완:
  - `googleMapsApiKey`가 있을 때만 Google Geocoding API 사용
- 캐시:
  - `주소 -> 좌표` 결과를 메모리 캐시 또는 서비스별 캐시에 저장

### 도구 설계 제안

- `lottemart_find_nearby_stores`
  - 입력:
    - `latitude`
    - `longitude`
    - `keyword` 선택
    - `area` 선택
    - `limit`
    - `googleMapsApiKey` 선택
  - 동작:
    - 지역별 매장 목록 수집
    - 주소 지오코딩
    - 거리 계산
    - 가까운 순 정렬

- `lottemart_search_products`
  - 입력:
    - `query`
    - `storeCode` 또는 `storeName`
    - `area`
    - `pageLimit`
  - 동작:
    - 초기 `search_product.asp` 호출
    - `totalPage` 파싱
    - 필요 시 `search_product_list.asp` 추가 호출

## 6. 프로젝트 반영 계획

### 1단계. 문서화 및 캡처 고정

- `docs/lottemart-mobile-scraping-replay-plan.md` 유지
- 필요 시 다음 보조 문서 추가
  - `docs/lottemart-network-analysis-result.md`
  - `captures/lottemart-YYYYMMDD/`

### 2단계. 서비스 뼈대 추가

예상 구조:

```text
src/services/lottemart/
├── index.ts
├── client.ts
├── types.ts
├── api.ts
└── tools/
    ├── findNearbyStores.ts
    └── searchProducts.ts
```

### 3단계. `client.ts` 역할

- 지역 목록 상수 관리
- `fetchLotteMartMarketOptions(area, type)`
- `fetchLotteMartStoreDetails(area, storeCode?)`
- `fetchLotteMartProducts(area, storeCode, query)`
- `fetchLotteMartProductPage(storeCode, query, page)`
- HTML 파서 유틸리티 제공
- 주소 지오코딩 보조 함수 제공

### 4단계. HTML 파싱 방식

현재 응답이 JSON이 아니므로 파싱 전략을 명확히 고정해야 합니다.

- 옵션 목록:
  - `<option value="...">이름</option>` 정규식 파싱 가능
- 매장 상세:
  - `<li>` 블록 단위 분리 후 라벨 기반 파싱
- 상품 목록:
  - `.prod-name`, 규격, 제조사, 가격, 재고를 블록 기반 추출

권장:

- 파서는 느슨한 CSS 선택자보다 라벨 문자열 기반 보완 로직을 같이 둡니다.
- 마크업 변경 시 깨지기 쉬운 단일 정규식 하나에 의존하지 않습니다.

### 5단계. 캐시 전략

- 매장 목록은 지역별 캐시
- 매장 상세는 지역별 캐시
- 주소 지오코딩은 주소 단위 캐시
- 상품 검색은 짧은 TTL 캐시

이유:

- 매장 정보는 변동이 적음
- 상품 재고/가격은 변동 가능성이 높음

## 7. 테스트 계획

테스트는 기존 서비스와 같은 수준으로 분리합니다.

- `tests/services/lottemart/client.test.ts`
  - 옵션 목록 파싱
  - 매장 상세 파싱
  - 상품 검색 파싱
  - `totalPage` 추출
  - 디버그 문자열 혼입 대응
  - 지오코딩 fallback

- `tests/services/lottemart/tools/findNearbyStores.test.ts`
  - 거리순 정렬
  - 좌표 없음 처리
  - 브랜드 변형 포함 여부

- `tests/services/lottemart/tools/searchProducts.test.ts`
  - 단일 페이지 검색
  - 다중 페이지 병합
  - 매장 미선택 에러 처리

- API 핸들러를 붙일 경우:
  - `tests/api/lottemart-handlers.test.ts`
  - `tests/app/app-api-lottemart.test.ts`

## 8. 리스크와 대응

### 리스크 1. 좌표 부재

가장 큰 제약입니다.

대응:

- 주소 지오코딩을 옵션 기능으로 추가
- API 키가 없을 때는 거리 계산 없이 목록 조회만 허용

### 리스크 2. HTML 구조 변경

JSON API보다 마크업 변경에 취약합니다.

대응:

- 파서를 라벨 기반으로 작성
- 테스트 fixture를 충분히 확보

### 리스크 3. 브랜드 혼합

`토이저러스`, `맥스` 등이 함께 내려오므로
사용자가 기대하는 “롯데마트만” 결과와 다를 수 있습니다.

대응:

- `brandVariant` 필드 추가
- 기본값은 전체 노출, 필요 시 필터 옵션 제공

## 9. 최종 판정

현재 기준으로 롯데마트 모바일 도와센터는
이 프로젝트에 다음 순서로 편입하는 것이 가장 효율적입니다.

1. `lottemart_find_nearby_stores` 먼저 구현
2. 주소 지오코딩 캐시로 좌표 보완
3. 이후 `lottemart_search_products` 추가
4. 필요 시 입점업체/층별안내(`detail_shop.asp`, `search_store_list.asp`) 확장

즉시 구현 우선순위는 아래와 같습니다.

- 1순위: 지역별 매장 수집
- 2순위: 주소 지오코딩 기반 nearby
- 3순위: 상품 검색 HTML 파싱
- 4순위: 층별안내/입점업체 확장
