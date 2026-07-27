# CU App User-Agent Recovery Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** PocketCU 공식 앱 User-Agent 표식을 사용해 CU 재고 직접 조회를 복구하고 불필요한 Zyte 폴백을 중단한다.

**Architecture:** 기존 `requestCuJson`의 direct-first 구조와 degraded 오류 계약은 유지한다. CU JSON 요청 공통 헤더에만 공식 앱 표식이 포함된 Android WebView User-Agent를 추가해 CU upstream 식별 조건을 충족한다.

**Tech Stack:** TypeScript, Vitest, Hono, Cloudflare Workers, GitHub Actions

---

### Task 1: CU 공식 앱 User-Agent 회귀 테스트

**Files:**

- Modify: `tests/services/cu/client.test.ts`

- [ ] **Step 1: 실패하는 테스트 작성**

`primeCuStockDisplay` describe에 다음 테스트를 추가한다.

```ts
it('공식 앱 식별자가 포함된 User-Agent를 전송한다', async () => {
  mockFetch.mockResolvedValue(new Response(JSON.stringify({ areaList: [] })));

  await primeCuStockDisplay();

  const options = mockFetch.mock.calls[0][1] as RequestInit;
  expect(new Headers(options.headers).get('user-agent')).toMatch(/;BGFCU$/);
});
```

- [ ] **Step 2: 단일 테스트 파일로 RED 확인**

Run:

```bash
npx vitest run tests/services/cu/client.test.ts --maxWorkers=1 --no-file-parallelism
```

Expected: 새 테스트가 현재 User-Agent 부재로 실패한다.

### Task 2: 최소 구현과 순차 검증

**Files:**

- Modify: `src/services/cu/client.ts`
- Test: `tests/services/cu/client.test.ts`

- [ ] **Step 1: CU 공통 헤더에 앱 User-Agent 추가**

`CU_DEFAULT_HEADERS`에 다음 값을 추가한다.

```ts
'User-Agent':
  'Mozilla/5.0 (Linux; Android 12) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/138.0.0.0 Mobile Safari/537.36;BGFCU',
```

- [ ] **Step 2: 단일 테스트 파일로 GREEN 확인**

Run:

```bash
npx vitest run tests/services/cu/client.test.ts --maxWorkers=1 --no-file-parallelism
```

Expected: PASS.

- [ ] **Step 3: 품질 검사를 한 번에 하나씩 실행**

Run in order:

```bash
npm run format:check
npm run lint
npm run lint:biome
npm run typecheck
npm run check:source-lines
npm test -- --maxWorkers=1 --no-file-parallelism
npm run build
```

Expected: 모든 명령이 종료 코드 0이고 경고·실패가 없다.

- [ ] **Step 4: 구현 커밋**

```bash
git add src/services/cu/client.ts tests/services/cu/client.test.ts docs/superpowers/plans/2026-07-28-cu-app-user-agent-recovery.md
git commit -m "fix: CU 공식 앱 요청으로 재고 조회 복구"
```

### Task 3: 배포와 운영 확인

**Files:**

- No source file changes

- [ ] **Step 1: 현재 브랜치를 push**

```bash
git push origin main
```

- [ ] **Step 2: GitHub Actions를 순차 확인**

`gh run list`와 `gh run watch`로 push가 시작한 CI 및 Cloudflare 배포가 성공할 때까지 확인한다.

- [ ] **Step 3: 운영 CU 재고 확인**

Run:

```bash
curl -fsS 'https://mcp.aka.page/api/cu/inventory?keyword=%EC%82%BC%EA%B0%81%EA%B9%80%EB%B0%A5&storeCheck=false&size=3'
```

Expected: HTTP 200이며 `inventory.available=true`, `inventory.totalCount>0`, 상품 배열이 비어 있지 않다.

- [ ] **Step 4: 운영 헬스체크 확인**

운영 헬스체크에서 `cu.inventory` 상태가 `ok`이고 CU 재고 관련 degraded/failure가 없는지 확인한다.
