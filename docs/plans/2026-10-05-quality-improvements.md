# 전체 조회 품질 개선 구현 계획

> 작업 에이전트는 superpowers:subagent-driven-development와 TDD를 적용합니다. 사용자 승인 범위는 2026-10-05 전체 감사 결과의 모든 개선 항목입니다.

**목표:** 실제 0개와 확인 불가를 구분하고, 요청한 상품·지역·영화 범위를 유지하며, 모든 REST/MCP/CLI 경로가 동일한 계약을 제공합니다.

**설계:** 정상 응답 필드와 명령은 유지합니다. 누락된 수량에는 null 및 확인 상태를 사용하거나 구조가 깨진 upstream 응답에는 명시적인 오류를 반환합니다. 외부 실패를 빈 검색·품절로 변환하지 않습니다. 기존 서비스별 모듈을 수정하고 공통 코드에는 필요한 검증과 오류 전달만 둡니다.

**기술:** TypeScript, Zod, Hono, MCP SDK, Vitest, Playwright 중계.

## 재고 서비스

대상: `src/services/{daiso,cu,gs25,emart24,seveneleven}`, 관련 `tests/services`와 `tests/api`.

- [x] 감사 F1–F5, L3·L5의 fixture를 회귀 테스트로 옮겨 실패를 확인합니다. `success:false`는 0으로 변환되지 않아야 합니다. `콜라제로`, `콜라` 후보에서 정확한 `콜라`를 선택해야 합니다. 부산 요청에 서울 매장을 반환하면 안 됩니다. 수량 필드가 없는 매장은 품절로 확정하면 안 됩니다. 페이지 2의 이미 페이지 처리된 상품은 다시 자르면 안 됩니다. 요청 pageSize를 지켜야 합니다.
- [x] 각 최소 수정 후 해당 서비스 테스트를 실행합니다. API와 도구의 nullable 수량 타입·집계·렌더링을 확인합니다. 메타데이터와 재고 결과를 분리하며 실제 0은 그대로 유지합니다.
- [x] CU REST 후보 선택은 공통 선택 함수를 통해 MCP와 같게 만듭니다. 공통 REST `handlers.ts` 수정은 root에게 전달합니다.

## 영화관과 생활 정보

대상: `src/services/{cgv,megabox,lottecinema,dtryx,places,opinet}`, 관련 API와 테스트, 필요 시 `src/utils/format.ts`.

- [x] F6–F10, L6의 실패 테스트를 먼저 실행합니다. `frSeatCnt:0, frtmpSeatCnt:17`은 0이어야 합니다. 잔여 수량 누락은 0·예약100으로 확정하면 안 됩니다. 극장 해석 실패 뒤 무제한 조회를 하면 안 됩니다. 잘못된 영화는 다른 영화로 완화하지 않습니다. HTML·잘못된 envelope는 정상 빈 결과가 아닙니다.
- [x] YYYYMMDD의 실제 달력 날짜, 양수 한도와 유효 좌표를 REST/MCP 모두 검증합니다. 정상 기존 요청과 0좌석은 유지합니다.
- [x] 해당 서비스와 API 테스트 및 타입 검사를 실행합니다. 공통 숫자 변환의 기존 소비자를 모두 확인합니다.

## 올리브영과 중계 복구

대상: `scripts/relay/{ownership,lifecycle,guard-runtime,supervisor}`, `src/services/oliveyoung`, 관련 테스트.

- [x] F11–F14와 정리 시간·캐시 위험을 실패 테스트로 재현합니다. 이미 소유 프로세스가 없는 close rejection은 복구 가능해야 합니다. 소유권을 확인하지 못하면 기존 안전한 차단을 유지합니다.
- [x] cleanup 전체 시간이 guard/supervisor/lifecycle 예산 안에 들어오도록 단일 deadline을 지킵니다. 가짜 시계로 최악 경로를 검증합니다.
- [x] 빈 `SUCCESS data:{}`를 확인 완료 품절로 집계하지 않습니다. 모든 매장이 미판매면 `not_sold`입니다. 지역 집계는 `nearby_store`에서 확인한 결과만 셉니다.
- [x] 검색 캐시에 저장된 과거 지역 재고를 실패 시 현재 재고로 재사용하지 않습니다. 필요하면 관측 시간과 stale 상태를 명시하되 검색 기능의 정상 캐시는 유지합니다.
- [x] API 공통 `handlers.ts` 변경은 root에게 전달합니다. 실제 운영 브라우저·quota 원장을 변경하지 않습니다.

## 공통 계약과 통합

대상: `src/core/outputSchema.ts`, `src/services/compare`, registry, 비교 REST, `src/utils/convenienceTransport.ts`, 서비스 REST 오류 처리, `src/cli/http.ts`, `package.json`.

- [x] `createToolOutputSchema('megabox_find_nearby_theaters').safeParse({keyword:null,theaters:[]})`와 카탈로그 `{pages:{totalCount:0,items:[]}}`가 성공하는 테스트를 먼저 실패시킵니다. 실제 스키마를 좁게 맞춥니다.
- [x] 비교 GS25/Seven 요청이 정상 개별 조회와 같은 중계 설정을 받도록 옵션을 factory→도구/REST→client에 전달합니다. 비교 per-service 결과 한도를 지킵니다.
- [x] 가짜 relay HTTP429 및 `Retry-After:30`, `x-relay-quota-reason:minute`를 주입한 실제 REST handler가 429 및 재시도 정보를 반환하는 테스트를 만듭니다. ServiceError의 status와 quota 정보를 끝까지 보존합니다.
- [x] CLI `SERVICE_RETIRED`에 폐기된 롯데마트 명령을 안내하지 않는 테스트를 실행하고 수정합니다.
- [x] `workers-mcp`가 코드·문서·배포에서 사용되지 않는지 조사하고 미사용이면 제거합니다. production audit를 다시 실행합니다.

## 통합 검증과 전달

- [x] 영역별 수정은 독립 리뷰로 요구사항 충족과 코드 품질을 확인합니다. 450줄 규칙을 지킵니다.
- [x] `npm run check`, `npm run test:coverage`, `npm run build`, `npm audit --omit=dev`, Worker dry run을 실행합니다. 100% coverage를 유지합니다.
- [x] 감사의 각 ID를 수정·회귀 테스트·남은 제한과 연결하는 변경 기록을 저장합니다. OpenAPI를 재생성합니다.
- [ ] 변경을 커밋하고 PR을 만들며 첨부합니다. 기존 사용자 승인 범위와 저장소 규칙에 따라 통합을 진행하고, 운영 검증에서는 남은 quota를 확인해 기존 제한을 유지합니다.
