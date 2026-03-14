# 세븐일레븐 MCP 도구 스펙 초안

작성일: 2026-03-14 (KST)
기준 실측: `captures/seveneleven-replay-batch-20260314-r12/summary.tsv`

## 1. 목적

세븐일레븐 앱 실측 결과를 기준으로 MCP 도구를 단계적으로 구현하기 위한
초기 스펙(입력/출력/안정성)을 정의합니다.

도구 접두사 규칙:

- `seveneleven_`

## 2. 구현 우선순위

- A (즉시 구현 가능): 비인증 OPEN 엔드포인트에서 `HTTP 200` 확인
- B (조건부 구현): 응답은 오지만 화면/기준값 확정이 더 필요한 항목
- C (보류): 인증 또는 암호화 페이로드 필요

## 3. 도구 목록

### A-1) `seveneleven_search_products`

설명:

- 키워드로 상품 검색 결과를 조회합니다.
- 대상 API: `POST /api/v1/open/search/goods`

입력 스키마(초안):

```json
{
  "type": "object",
  "properties": {
    "query": { "type": "string", "description": "검색어" },
    "page": { "type": "integer", "minimum": 1, "default": 1 },
    "size": { "type": "integer", "minimum": 1, "maximum": 100, "default": 20 },
    "sort": {
      "type": "string",
      "enum": ["recommend", "recent", "popular"],
      "default": "recommend"
    }
  },
  "required": ["query"],
  "additionalProperties": false
}
```

출력(요약):

- `count`
- `items[]`: `goodsCd`, `goodsNm`, `price`, `eventInfo` 등 가용 필드

안정성:

- 등급 `A`
- 2026-03-14 기준 `HTTP 200` 확인

### A-2) `seveneleven_get_search_popwords`

설명:

- 홈 기준 인기 검색어를 조회합니다.
- 대상 API: `POST /api/v1/open/search/popword?label=home`

입력 스키마(초안):

```json
{
  "type": "object",
  "properties": {
    "label": { "type": "string", "default": "home" }
  },
  "additionalProperties": false
}
```

출력(요약):

- `keywords[]`

안정성:

- 등급 `A`
- 2026-03-14 기준 `HTTP 200` 확인

### A-3) `seveneleven_get_catalog_snapshot`

설명:

- 카탈로그성 공개 메타 정보를 묶어서 조회합니다.
- 대상 API 묶음:
  - `GET /api/v1/product/pages`
  - `GET /api/v1/product/issues`
  - `GET /api/v1/exhibition/main/list`

입력 스키마(초안):

```json
{
  "type": "object",
  "properties": {
    "includeIssues": { "type": "boolean", "default": true },
    "includeExhibition": { "type": "boolean", "default": true }
  },
  "additionalProperties": false
}
```

출력(요약):

- `pages`
- `issues` (옵션)
- `exhibitions` (옵션)

안정성:

- 등급 `A`
- 2026-03-14 기준 `HTTP 200` 확인

### B-1) `seveneleven_list_store_reviews`

설명:

- 공개 리뷰 목록/점수 데이터를 조회합니다.
- 대상 API:
  - `GET /api/v1/store/reviews`
  - `GET /api/v1/store/reviews/score/{id}`

주의:

- 리뷰 스키마가 요청 파라미터에 따라 달라질 수 있어 필드 고정 전 검증 필요

안정성:

- 등급 `B`
- 2026-03-14 기준 `HTTP 200` 확인

### C-1) `seveneleven_check_inventory`

설명:

- 상품 기준 매장 재고 조회
- 대상 API:
  - `POST /api/v1/open/stock/search/stores`
  - `POST /api/v1/stock/search/stores`

제약:

- 2026-03-14 기준 `HTTP 500`, body `code:503` 확인
- 이전 실측에서 `RSA 복호화 실패` 이력 존재
- 앱 내부 암호화/서명 페이로드 규격 미확보

안정성:

- 등급 `C` (보류)

### C-2) `seveneleven_get_user_settings`

설명:

- 사용자 설정/내 정보 기반 데이터
- 대상 API:
  - `GET /api/v1/setting`
  - `GET /api/v1/setting/device`

제약:

- 2026-03-14 기준 `HTTP 401`
- 로그인 토큰/세션 확보 필요

안정성:

- 등급 `C` (보류)

## 4. 구현 원칙

- 민감정보(Authorization/Cookie/기기 식별자) 로그 저장 금지
- 도구 응답은 원문 전체 대신 필요한 필드만 정규화
- 실패 시 원인 코드를 명확히 구분
  - `auth_required`
  - `service_unavailable`
  - `network_error_or_timeout`

## 5. 다음 단계

1. `A` 등급 3개 도구를 `src/services/seveneleven/`에 구현
2. `docs/service-reference.md`에 도구 사용법 반영
3. `C` 등급은 암호화/인증 우회 확보 전까지 명시적으로 `Not Supported` 처리
