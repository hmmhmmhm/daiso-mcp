# OpenAPI Actions Facade

## 배경

OpenAI 챗봇 빌더의 OpenAPI import 화면에서 등록 가능한 action 수 제한에 걸리기 시작했습니다.
이 프로젝트는 서비스별 GET API를 계속 추가하면서 개별 path 수가 늘어났고, 기본 OpenAPI 스펙만으로는
ChatGPT Actions 등록이 더 이상 안정적으로 되지 않는 상태가 됐습니다.

## 결정

- 기존 런타임 GET API는 그대로 유지합니다.
- OpenAI 전용 기본 스펙은 `GET /api/actions/query` 단일 facade 엔드포인트만 노출합니다.
- `action` 쿼리 파라미터로 기존 `/api/{service}/...` GET API를 안전하게 위임합니다.
- 전체 개별 엔드포인트 스펙은 `/openapi-full.json`, `/openapi-full.yaml`로 별도 제공합니다.

## 이유

- OpenAI Actions import 시 path/operation 수 증가를 막을 수 있습니다.
- 새 서비스가 추가돼도 기본 OpenAPI path 수는 늘지 않습니다.
- 기존 CLI, 프롬프트, 직접 GET 호출, 외부 연동 호환성을 깨지 않습니다.
- 실제 비즈니스 로직은 기존 핸들러/라우트 재사용이므로 유지보수 리스크가 낮습니다.

## 운영 원칙

- OpenAI 챗봇 등록용: `/openapi.json`, `/openapi.yaml`
- 전체 문서/직접 연동용: `/openapi-full.json`, `/openapi-full.yaml`
- 새 GET API를 추가할 때는 개별 라우트만 만들지 말고 `src/api/actionsProxy.ts`의 action 매핑도 같이 갱신합니다.

## 비고

이 구조는 "서비스 추가 시 OpenAPI path 수가 계속 증가하는 문제"를 해결하기 위한 설계입니다.
완전히 새로운 capability가 추가되더라도 기본 facade path는 그대로 유지하고 `action` 목록만 확장하면 됩니다.

## 2026-10-21 스키마 갱신

기본 스키마1.1.0은 operationId `queryAction` 하나를 유지하고 일본 다이소 3개, 오피넷 4개의 기존 GET 작업을 action enum에 연결합니다. 공개 MCP 도구10개 계약이나 기존 REST/CLI 이름은 바꾸지 않습니다.

- 일본: daisoJpSearchProducts(q), daisoJpGetProduct(productId), daisoJpFindStores(keyword). 상품 코드는 검색 결과의 실제13자리 값을 사용합니다. 온라인 구매 가능과 매장 재고를 구분합니다.
- 오피넷: opinetGetAveragePrices, opinetGetLowestPriceStations, opinetSearchStationsAround, opinetGetStationDetail. fuelCode/count/radiusMeters/x/y/stationId와 기존 location/lat/lng/areaCode를 사용합니다.
- GPT 편집기는 URL을 다시 불러와야 등록 스키마가 갱신됩니다. 서버 배포만으로 기존 GPT 저장 설정이 변경됐다고 보고하지 않습니다.

[GPT 설정·검증 지침](gpts-maintenance.md), [OpenAI 공식 Actions 시작 가이드](https://developers.openai.com/api/docs/actions/getting-started)를 참고하세요.
