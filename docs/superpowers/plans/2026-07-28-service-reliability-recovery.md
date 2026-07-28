# Service Reliability Recovery Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 운영에서 확인된 다섯 장애와 CGV 이슈 #156을 정직한 오류 계약과 실제 복구 경로로 개선한다.

**Architecture:** 공용 날짜와 헬스체크 shape를 중앙에서 교정하고, 서비스별 전송 계층은 성공 가능한 경로를 우선 사용한다. 외부 인증·결제·차단으로 복구할 수 없는 경우 빈 성공 대신 서비스별 503 응답을 반환한다.

**Tech Stack:** TypeScript 6, Hono, Cloudflare Workers, Vitest, Wrangler

---

### Task 1: 한국 날짜 고정

**Files:**
- Modify: `src/utils/format.ts`
- Create: `tests/utils/format.test.ts`

- [ ] `2026-07-27T15:30:00Z`가 `20260728`이 되는 실패 테스트를 추가한다.
- [ ] `npx vitest run tests/utils/format.test.ts --maxWorkers=1 --no-file-parallelism`로 기존 로컬 날짜 구현의 실패를 확인한다.
- [ ] `Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit', day: '2-digit' })`의 `formatToParts`로 `YYYYMMDD`를 만든다.
- [ ] 같은 단일 테스트를 다시 실행해 통과를 확인한다.

### Task 2: 헬스체크 shape와 빈 결과 판정

**Files:**
- Modify: `src/api/healthCheckTypes.ts`
- Modify: `src/api/healthCheckShape.ts`
- Modify: `src/api/healthCheckDefinitions.ts`
- Modify: `src/api/healthChecks.ts`
- Modify: `tests/api/health-checks.test.ts`

- [ ] `inventoryStores`, 이마트24 top-level stores, count 미확인, 선택적 빈 결과의 기대 판정을 테스트한다.
- [ ] `npx vitest run tests/api/health-checks.test.ts --maxWorkers=1 --no-file-parallelism`로 실패를 확인한다.
- [ ] `collectionKey: 'inventoryStores'`와 `allowEmpty?: boolean`을 추가한다.
- [ ] `inventory.stores`를 count·sample·shape에 포함하고 빈 필수 컬렉션을 shape 실패로 처리한다.
- [ ] `count === null`은 degraded, `allowEmpty && count === 0`은 skipped로 판정한다.
- [ ] 서비스 정의의 실제 컬렉션과 대표 필드를 교정하고 단일 테스트를 통과시킨다.

### Task 3: GS25 인증 Secret과 unavailable 계약

**Files:**
- Modify: `src/api/response.ts`
- Modify: `src/index.ts`
- Modify: `src/services/gs25/index.ts`
- Modify: `src/services/gs25/client.ts`
- Modify: `src/services/gs25/tools/checkInventory.ts`
- Modify: `src/api/gs25Handlers.ts`
- Modify: `.github/workflows/sync-worker-secrets.yml`
- Modify: `tests/services/gs25/client.test.ts`
- Modify: `tests/api/gs25-handlers.test.ts`

- [ ] `Api-Key` 헤더 주입과 401 인증 실패의 503 변환 테스트를 추가한다.
- [ ] GS25 클라이언트 테스트와 핸들러 테스트를 각각 단독 실행해 실패를 확인한다.
- [ ] `GS25_API_KEY`를 AppBindings와 서비스 옵션으로 전달하고 stock 요청 헤더에만 추가한다.
- [ ] 401/403 인증 실패를 `Gs25UpstreamUnavailableError`로 정규화하고 핸들러에서 `GS25_UPSTREAM_UNAVAILABLE` 503을 반환한다.
- [ ] MCP 도구와 Worker Secret 동기화 경로를 연결하고 두 단일 테스트를 통과시킨다.

### Task 4: 롯데마트 전송 복구

**Files:**
- Modify: `src/services/lottemart/api.ts`
- Modify: `src/services/lottemart/config.ts`
- Modify: `src/services/lottemart/session.ts`
- Modify: `tests/services/lottemart/session.test.ts`
- Modify: `tests/services/lottemart/debug.test.ts`

- [ ] 표준 fetch 우선, HTTP origin, 제한된 fallback 순서를 검증하는 실패 테스트를 추가한다.
- [ ] 두 테스트 파일을 각각 단독 실행해 실패를 확인한다.
- [ ] 공식 HTTP base URL을 사용하고 표준 fetch 성공 시 소켓과 Zyte를 호출하지 않도록 한다.
- [ ] 표준 fetch 실패 시에만 남은 시간 예산으로 소켓과 Zyte를 순차 실행한다.
- [ ] 두 단일 테스트를 통과시키고 운영 debug 요청이 제한시간 안에 매장을 반환하는지 확인한다.

### Task 5: 세븐일레븐 선택적 인기 검색어

**Files:**
- Modify: `src/api/healthCheckDefinitions.ts`
- Modify: `tests/api/health-checks.test.ts`
- Modify: `tests/app/app-api-seveneleven.test.ts`

- [ ] 원본 빈 객체가 `available:false` 응답과 skipped 헬스 상태로 유지되는 테스트를 추가한다.
- [ ] 각 테스트 파일을 단독 실행해 실패를 확인한다.
- [ ] popwords 정의에 `allowEmpty: true`를 적용하고 정상 데이터가 있을 때는 기존 ok 판정을 유지한다.
- [ ] 두 단일 테스트를 통과시킨다.

### Task 6: CGV 이슈 #156 graceful 처리

**Files:**
- Create: `src/services/cgv/errors.ts`
- Modify: `src/services/cgv/transport.ts`
- Modify: `src/api/cgvHandlers.ts`
- Modify: `tests/services/cgv/transport.test.ts`
- Modify: `tests/api/cgv-handlers.test.ts`

- [ ] 직접 403 뒤 Zyte 403이 발생하면 typed unavailable 오류가 되는 테스트를 추가한다.
- [ ] API가 `CGV_UPSTREAM_UNAVAILABLE` 503을 반환하는 테스트를 추가한다.
- [ ] 두 테스트를 각각 단독 실행해 실패를 확인한다.
- [ ] `CgvUpstreamUnavailableError`와 판별 함수를 추가하고 결제 상세를 일반 안내로 정규화한다.
- [ ] 세 CGV 핸들러가 typed 오류에만 503을 반환하도록 최소 수정한다.
- [ ] 두 단일 테스트를 통과시킨다.

### Task 7: 전체 검증과 배포

**Files:**
- Verify all changed files

- [ ] `npm run format:check`, `npm run lint`, `npm run lint:biome`, `npm run typecheck`, `npm run check:source-lines`를 차례로 실행한다.
- [ ] `npx vitest run --maxWorkers=1 --no-file-parallelism`로 전체 테스트를 단일 워커로 실행한다.
- [ ] `npx vitest run --coverage --maxWorkers=1 --no-file-parallelism`로 100% 커버리지를 확인한다.
- [ ] `npm run build`와 `npm audit`를 순차 실행한다.
- [ ] 변경사항을 자체 리뷰하고 커밋한 뒤 브랜치를 push하여 PR을 만든다.
- [ ] PR CI를 확인하고 `main`에 병합한 뒤 Deploy 완료를 확인한다.
- [ ] 운영 API에서 다이소·편의점·마트·영화관·오피넷·장소·비교 기능을 순차 재검증한다.
- [ ] CGV 이슈 #156에 수정·배포·운영 확인 결과를 답변하고 필요하면 종료한다.
