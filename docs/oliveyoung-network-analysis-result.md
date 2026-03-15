# 올리브영 네트워크 분석 결과 및 구현 판정

작성일: 2026-03-02 (KST)

## 결론 요약

- 재고 관련 요청 리플레이 성공: `성공`
  - `POST /oystore/api/stock/product-search-v3`
- 매장 검색 요청 리플레이 성공: `성공`
  - `POST /oystore/api/storeFinder/find-store`
- 쿠키/세션 의존성: `낮음` (현재 실측 기준)
- 분류: `A 유형`에 가까움
  - 쿠키 불필요 + JSON Body 기반 직접 호출 가능

## 엔드포인트 판정

1. `POST /oystore/api/storeFinder/find-store`

- 목적: 매장 검색(위치/키워드)
- 필수 Body 필드(실측 기준):
  - `lat`, `lon`, `pageIdx`, `searchWords`, `pogKeys`, `serviceKeys`, `mapLat`, `mapLon`
- 실패 패턴:
  - 필드 축약 시 `400 Bad Request`
  - `GET` 시 `405 Method Not Allowed`

2. `POST /oystore/api/stock/product-search-v3`

- 목적: 매장 맥락 상품/재고 리스트
- 필수 Body 필드(실측 기준):
  - `includeSoldOut`, `keyword`, `page`, `sort`, `size`
- 실패 패턴:
  - Body 단순화(`keyword`만 전송) 시 `500 Internal Server Error`
  - `GET` 시 `405 Method Not Allowed`

## 안정성/리스크

- API 응답 성공률 자체는 높음(실측 3회 이상 연속 성공)
- 다만 `product-search-v3`는 특정 시점에 질의어와 결과 불일치가 관찰됨
  - 예: `샴푸` 요청 직후 `립밤` 결과 재노출
  - 가설: 프론트 상태/응답 경합/캐시 관여
- 권장 방어:
  - 응답 검증(`keyword` 포함도, 상위 상품명 토큰 점검)
  - 필요 시 재시도 1회

## MCP 도구 스키마 초안

### 1) `oliveyoung_find_stores`

입력:

```json
{
  "searchWords": "명동",
  "pageIdx": 1,
  "lat": 37.56409158001314,
  "lon": 126.98517710459745,
  "pogKeys": "",
  "serviceKeys": "",
  "mapLat": 37.56409158001314,
  "mapLon": 126.98517710459745
}
```

출력:

```json
{
  "status": "SUCCESS",
  "totalCount": 9,
  "stores": [
    {
      "storeCode": "D176",
      "storeName": "올리브영 명동 타운",
      "address": "서울특별시 중구 명동길 53 1~2층",
      "latitude": 37.56409158001314,
      "longitude": 126.98517710459745,
      "pickupYn": false,
      "o2oRemainQuantity": 0
    }
  ]
}
```

### 2) `oliveyoung_search_stock_products`

입력:

```json
{
  "keyword": "선크림",
  "page": 1,
  "size": 20,
  "sort": "01",
  "includeSoldOut": false
}
```

출력:

```json
{
  "status": "SUCCESS",
  "totalCount": 429,
  "nextPage": true,
  "products": [
    {
      "goodsNumber": "A000000200614",
      "goodsName": "[7일특가/3월 올영픽] 달바 퍼플 톤업 선크림 듀오 기획 (50ml+50ml)",
      "priceToPay": 32130,
      "originalPrice": 51000,
      "discountRate": 37,
      "o2oStockFlag": true,
      "o2oRemainQuantity": 0
    }
  ]
}
```

## 추가 메모

- Cloudflare 챌린지로 인해 초기 접속 실패 가능
- 실측 시 UA/브라우저 세션 상태 영향 있음
- 세션 테스트 스크립트는 `--mode=browser`에서 실측 성공 확인
  - 예: `npx tsx docs/oliveyoung-replay-session-test.ts --mode=browser --loop=1 --headless=false`
- 서버 구현 시 공식 API 정책/약관 준수 필요

## Zyte API 검증 (추가)

검증일: 2026-03-03 (KST)

- 검증 스크립트: `docs/oliveyoung-zyte-replay-test.ts`
- 인증: `.env`의 `ZYTE_API_KEY` 사용 (저장소에는 `.env.example`만 커밋)
- 실행:
  - `npx tsx docs/oliveyoung-zyte-replay-test.ts --loop=3 --keyword=선크림 --store=명동`
- 결과:
  - 홈페이지 렌더(`browserHtml`) 기준 Cloudflare 챌린지 미검출
  - `POST /oystore/api/storeFinder/find-store`: `3/3` 성공
  - `POST /oystore/api/stock/product-search-v3`: `3/3` 성공

### 구현 판정 업데이트

- **판정: 가능**
- 근거:
  - Zyte `extract` API에서 커스텀 HTTP 요청(`httpRequestMethod`, `httpRequestText`, `customHttpRequestHeaders`)으로
    올리브영 API 2종을 안정적으로 호출 성공
  - 응답은 `statusCode=200`, 본문 `status=SUCCESS`, `totalCount` 정상 확인

## Zyte 전송량/비용 실측 (추가)

측정일: 2026-03-03 (KST)
측정 스크립트: `docs/oliveyoung-zyte-bandwidth-test.ts`
실행: `npx tsx docs/oliveyoung-zyte-bandwidth-test.ts --loop=10 --keyword=선크림 --store=명동`

### 실측 평균 (10회)

- `find-store` 1회 왕복: `10,350 bytes` (약 `10.11 KB`)
- `product-search-v3` 1회 왕복: `18,314 bytes` (약 `17.88 KB`)
- 단일 API 호출 평균: `14,332 bytes` (약 `13.99 KB`)
- 수집 1건(`find-store + product-search-v3`) 왕복: `28,664 bytes` (약 `27.99 KB`)

### 수집량 기준 트래픽 (캐시 미적용)

- 1천건: 약 `27.34 MB` (요청 `2,000`)
- 1만건: 약 `273.36 MB` (요청 `20,000`)
- 10만건: 약 `2.67 GB` (요청 `200,000`)

### 비용 계산 기준

- Zyte 과금은 바이트가 아니라 **성공 요청 수 기준**
- 단가 범위(HTTP PAYG, 티어별): `$0.00013 ~ $0.00127 / 요청`
- 수집 1건이 API 2콜이면: `총요청수 = 수집건수 x 2`

## 캐싱 설계 시 비용 절감 추정

가정:

- `find-store`와 `product-search-v3` 모두 동일 적중률 `h`
- 유효 요청 수: `총요청수 = 수집건수 x 2 x (1 - h)`

### 1천건 기준

- 캐시 없음(`h=0%`): `2,000` 요청, `$0.26 ~ $2.54`
- `h=50%`: `1,000` 요청, `$0.13 ~ $1.27`
- `h=80%`: `400` 요청, `$0.05 ~ $0.51`
- `h=90%`: `200` 요청, `$0.03 ~ $0.25`
- `h=95%`: `100` 요청, `$0.01 ~ $0.13`

### 1만건 기준

- 캐시 없음(`h=0%`): `20,000` 요청, `$2.60 ~ $25.40`
- `h=50%`: `10,000` 요청, `$1.30 ~ $12.70`
- `h=80%`: `4,000` 요청, `$0.52 ~ $5.08`
- `h=90%`: `2,000` 요청, `$0.26 ~ $2.54`
- `h=95%`: `1,000` 요청, `$0.13 ~ $1.27`

### 10만건 기준

- 캐시 없음(`h=0%`): `200,000` 요청, `$26.00 ~ $254.00`
- `h=50%`: `100,000` 요청, `$13.00 ~ $127.00`
- `h=80%`: `40,000` 요청, `$5.20 ~ $50.80`
- `h=90%`: `20,000` 요청, `$2.60 ~ $25.40`
- `h=95%`: `10,000` 요청, `$1.30 ~ $12.70`

## 초기 캐시 아키텍처 권장안

### 1) 매장 검색 캐시 (`find-store`)

- 캐시 키: `region-grid(위경도 반올림)+searchWords+pageIdx`
- TTL: `24h` (매장 정보 변동이 상대적으로 낮음)
- 기대 효과: 동일 지역 반복 조회에서 높은 적중률

### 2) 상품 검색 캐시 (`product-search-v3`)

- 캐시 키: `keyword+page+size+sort+includeSoldOut`
- TTL: `10~30분` (재고/노출 변동 고려)
- 기대 효과: 인기 키워드 반복 조회에서 비용 대폭 절감

### 3) 캐시 정책

- stale-while-revalidate 적용: 응답 지연 없이 백그라운드 갱신
- 빈 결과도 짧은 TTL(예: 3분)로 캐시하여 중복 조회 방지
- 에러 응답(4xx/5xx)은 캐시하지 않음

### 4) 현실적인 목표치

- 초기에 `h=60~80%`만 달성해도 비용은 약 `40~80%` 절감
- 키워드 편중이 큰 트래픽이면 `h=90%`도 가능

## 재고 라이브성 우선 캐시 정책 (설계안)

목표:

- 비용 절감은 유지하되, 재고 정확도를 우선 보장
- 재고 관련 오판(있다고 보여주나 실제 없음) 최소화

### 분리 캐시 전략

- `store metadata` (매장명/주소/좌표 등): TTL `24h`
- `product metadata` (상품명/가격/이미지 등): TTL `10~30분`
- `inventory fields` (`o2oStockFlag`, `o2oRemainQuantity`): TTL `30~90초`

핵심:

- 동일 API 응답이라도 저장 시 **메타 데이터와 재고 필드를 분리 캐시**
- 응답 조합 시 `meta cache + inventory cache`를 합성

### 재고 TTL 가변 규칙

- `remain <= 3`: TTL `20~30초`
- `4 <= remain <= 20`: TTL `45~60초`
- `remain > 20`: TTL `60~120초`
- `o2oStockFlag=false`: TTL `20~45초` (품절 변동 감지 위해 짧게)

### 조회/갱신 정책

- 기본: `cache-first` + 짧은 `stale-while-revalidate`
- 재고 stale 허용 상한: `15~30초`
- stale 상한 초과 시: 원본 API 강제 조회
- 4xx/5xx 응답: 캐시 저장 금지
- 빈 결과(검색 0건): negative cache TTL `2~3분`

### 사용자/클라이언트 투명성

응답 필드에 아래 메타를 포함:

- `fetchedAt`: 원본 조회 시각(ISO)
- `cacheAgeSec`: 캐시 경과 시간
- `inventoryFreshSec`: 재고 필드 신선도(초)
- `dataSource`: `origin|cache|cache_swr`

### 강제 신선 조회 경로

- 결제/픽업 직전에는 `forceRefresh=true` 옵션으로 원본 재조회
- 해당 경로는 캐시 우회 후 최신 재고를 반환

### 모니터링 지표 (SLO)

- `inventory_mismatch_rate` (표시 재고 vs 후속 검증 불일치율)
- `inventory_cache_hit_rate`
- `inventory_p95_age_sec`
- `force_refresh_ratio`

권장 초기 목표:

- `inventory_mismatch_rate < 1%`
- `inventory_p95_age_sec < 60`

### 구현 스케치

- 캐시 키 예시:
  - 메타: `oy:stock:meta:{keyword}:{page}:{size}:{sort}:{includeSoldOut}`
  - 재고: `oy:stock:inv:{keyword}:{page}:{size}:{sort}:{includeSoldOut}`
- 처리 순서:
  1. 메타/재고 캐시 조회
  2. 재고 캐시가 stale 상한 이내면 즉시 응답
  3. stale 상한 초과면 원본 조회 후 재고 캐시 갱신
  4. 메타는 긴 TTL로 별도 갱신
