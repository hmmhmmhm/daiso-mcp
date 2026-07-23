# MCP Error Contract and Date-Stable Tests Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox syntax (`- [ ]`) for tracking.

**Goal:** MCP 오류 응답이 성공 출력 스키마 검증에 걸리지 않게 하고, 429 원장 테스트가 실행 날짜와 무관하게 안정적으로 통과하게 한다.

**Architecture:** `ServiceRegistry`의 성공·오류 반환 경로를 분리해 성공 결과에만 `structuredContent`를 생성한다. 오류는 MCP 표준 `isError`와 text content만 보존한다. 날짜 의존 테스트는 운영 코드를 바꾸지 않고 테스트별 `Date.now()`를 이벤트의 KST 날짜로 고정한다.

**Tech Stack:** TypeScript 6, Vitest 4, MCP TypeScript SDK 1.29, Cloudflare Workers, GitHub Actions

---

## Task 1: 429 원장 테스트의 현재 시각 고정

**Files:**

- Modify: `tests/durableObjects/dailyRateLimiter.test.ts:123`
- Modify: `tests/durableObjects/dailyRateLimiter.test.ts:264`
- Modify: `tests/durableObjects/dailyRateLimiter.test.ts:359`

- [ ] **Step 1: 날짜 의존 실패 기준선을 확인한다**

Run:

```bash
npx vitest run tests/durableObjects/dailyRateLimiter.test.ts -t "POST /blocked-events는 완전한 이벤트 저장이 끝난 뒤 빈 204를 반환한다|GET /stats는 생략된 서비스 필터를 저장소에 전달하지 않는다|통계 조회 실패를 0 집계로 바꾸지 않는다"
```

Expected: 세 테스트가 현재 KST 날짜와 `2026-07-22`의 불일치 때문에 409 또는 예상과 다른 오류로 실패한다.

- [ ] **Step 2: 각 테스트에서 현재 시각을 이벤트 날짜로 고정한다**

각 테스트의 준비 구문 첫 줄에 아래 코드를 추가한다.

```typescript
vi.spyOn(Date, 'now').mockReturnValue(VALID_EVENT.occurredAt);
```

전역 fake timer나 공통 `beforeEach`는 사용하지 않는다. 파일의 `afterEach`에 있는 `vi.restoreAllMocks()`가 테스트별 mock을 정리한다.

- [ ] **Step 3: 대상 테스트와 전체 파일을 검증한다**

Run:

```bash
npx vitest run tests/durableObjects/dailyRateLimiter.test.ts
```

Expected: 파일의 모든 테스트가 통과한다.

- [ ] **Step 4: 테스트 안정화 변경을 커밋한다**

```bash
git add tests/durableObjects/dailyRateLimiter.test.ts
git commit -m "test: 429 원장 테스트의 KST 기준 시각 고정"
```

## Task 2: MCP 오류 계약 회귀 테스트를 RED로 추가

**Files:**

- Modify: `tests/core/registry.test.ts:487`
- Create: `tests/core/registry-mcp-error-contract.test.ts`

- [ ] **Step 1: 기존 단위 테스트의 오류 계약 기대값을 바꾼다**

처리된 오류, `Error` 예외, 문자열 예외 테스트가 다음을 검증하도록 바꾼다.

```typescript
expect(result).toMatchObject({
  isError: true,
  content: [{ type: 'text', text: 'upstream failed' }],
});
expect(result).not.toHaveProperty('structuredContent');
```

처리된 오류에는 text `handled`, 문자열 예외에는 text `알 수 없는 오류가 발생했습니다.`를 각각 기대한다.

- [ ] **Step 2: 실제 MCP SDK 클라이언트 회귀 테스트를 작성한다**

`tests/core/registry-mcp-error-contract.test.ts`에 `McpServer`, `Client`, `InMemoryTransport`를 사용한 통합 테스트를 만든다.

```typescript
const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
const server = new McpServer({ name: 'registry-contract-server', version: '1.0.0' });
const client = new Client({ name: 'registry-contract-client', version: '1.0.0' });

registry.applyToServer(server);
await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);

const result = await client.callTool({
  name: 'contract_error_tool',
  arguments: {},
});

expect(result).toMatchObject({
  isError: true,
  content: [{ type: 'text', text: 'upstream failed' }],
});
expect(result).not.toHaveProperty('structuredContent');
```

등록 도구에는 성공용 `outputSchema: { value: z.string() }`를 지정하고 핸들러는 `isError: true`와 오류 text를 반환한다. `afterEach` 또는 `finally`에서 client와 server를 닫아 리소스를 정리한다.

같은 파일에 정상 도구가 아래 계약을 유지하는 테스트도 둔다.

```typescript
expect(result).toMatchObject({
  content: [{ type: 'text', text: '{"value":"ok"}' }],
  structuredContent: { value: 'ok' },
});
expect(result).not.toHaveProperty('isError');
```

- [ ] **Step 3: 구현 전 RED를 확인한다**

Run:

```bash
npx vitest run tests/core/registry.test.ts tests/core/registry-mcp-error-contract.test.ts
```

Expected: 오류 결과에 현재 `structuredContent`가 포함되거나 실제 SDK 클라이언트가 `-32602`를 던져 새 테스트가 실패한다. 기존 성공 계약 테스트는 통과한다.

## Task 3: 오류 결과에서 성공용 structuredContent 생략

**Files:**

- Modify: `src/core/registry.ts:8`
- Modify: `src/core/registry.ts:225`

- [ ] **Step 1: 예외 반환 경로를 최소 오류 응답으로 바꾼다**

`toStandardErrorDiagnostics` import를 제거하고 catch 반환값을 아래처럼 바꾼다.

```typescript
return {
  isError: true,
  content: [{ type: 'text' as const, text: message }],
};
```

- [ ] **Step 2: 처리된 오류와 성공 결과를 분기한다**

먼저 content를 MCP 형식으로 변환한 다음 오류면 즉시 반환한다.

```typescript
const content = result.content.map((item) => ({
  type: item.type as 'text',
  text: item.text,
}));

if (result.isError) {
  return {
    isError: true,
    content,
  };
}

return {
  content,
  structuredContent: buildStructuredContent(result),
};
```

성공 결과의 `buildStructuredContent`, 표준 컬렉션 정규화, output schema 생성은 수정하지 않는다.

- [ ] **Step 3: MCP 단위·통합 테스트를 GREEN으로 만든다**

Run:

```bash
npx vitest run tests/core/registry.test.ts tests/core/registry-mcp-error-contract.test.ts
```

Expected: 두 파일의 모든 테스트가 통과하며 실제 SDK 클라이언트가 오류를 `-32602` 없이 받는다.

- [ ] **Step 4: MCP 계약 변경을 커밋한다**

```bash
git add src/core/registry.ts tests/core/registry.test.ts tests/core/registry-mcp-error-contract.test.ts
git commit -m "fix: MCP 오류에서 성공용 구조화 응답 생략"
```

## Task 4: 전체 품질 검증

**Files:**

- Verify: `src/core/registry.ts`
- Verify: `tests/core/registry.test.ts`
- Verify: `tests/core/registry-mcp-error-contract.test.ts`
- Verify: `tests/durableObjects/dailyRateLimiter.test.ts`

- [ ] **Step 1: 정적 검사와 전체 테스트를 실행한다**

```bash
npm run check
```

Expected: format, ESLint, Biome, TypeScript, Vitest가 모두 통과한다. 전체 병렬 부하에서 기존 HTTP MCP 테스트가 timeout을 내면 해당 파일을 단독 재실행해 실제 회귀인지 구분하고, 필요하면 전체 테스트를 낮은 worker 수로 다시 실행한다.

- [ ] **Step 2: 커버리지와 배포 빌드를 검증한다**

```bash
npm run test:coverage
npm run build
npx wrangler deploy --dry-run
```

Expected: 커버리지 기준, TypeScript/OpenAPI 빌드, Worker 번들 dry-run이 모두 통과한다.

- [ ] **Step 3: 의존성·변경 품질을 확인한다**

```bash
npm audit --audit-level=low
npm audit --omit=dev --audit-level=low
wc -l src/core/registry.ts tests/core/registry.test.ts tests/core/registry-mcp-error-contract.test.ts tests/durableObjects/dailyRateLimiter.test.ts
git diff --check origin/main...HEAD
git status --short
```

Expected: 감사 취약점 0개, 변경 파일 whitespace 오류 없음, 의도하지 않은 파일 없음. 신규 파일과 운영 TypeScript 파일은 프로젝트의 450줄 제한 이내다.

## Task 5: PR, 배포, 운영 검증

**Files:**

- Update after deployment: `/Users/hm/Documents/personal-agent/projects/daiso-mcp/PROJECT.md`

- [ ] **Step 1: 브랜치를 push하고 PR을 만든다**

```bash
git push -u origin fix/mcp-error-and-date-tests
gh pr create --base main --head fix/mcp-error-and-date-tests \
  --title "fix: MCP 오류 계약과 날짜 안정 테스트" \
  --body-file /tmp/daiso-mcp-pr-body.md
```

PR 본문에는 문제, 변경, TDD 증거, 전체 검증, Zyte 설정을 바꾸지 않았음을 적는다.

- [ ] **Step 2: CI, Coverage, CodeQL을 확인하고 병합한다**

```bash
gh pr checks --watch
gh pr merge --merge
```

Expected: 모든 필수 검사가 성공하고 merge commit이 `main`에 생성된다.

- [ ] **Step 3: 배포 워크플로와 Cloudflare 버전을 확인한다**

```bash
gh run list --branch main --limit 10
deploy_run_id=$(gh run list --branch main --workflow "Deploy to Cloudflare Workers" \
  --limit 1 --json databaseId --jq '.[0].databaseId')
gh run watch "$deploy_run_id"
npx wrangler versions list
```

Expected: 병합 커밋의 배포 워크플로가 성공하고 새 Worker 버전이 활성화된다.

- [ ] **Step 4: 운영 환경에서 계약을 검증한다**

```bash
curl -fsS https://mcp.aka.page/health
curl -fsS https://daiso-mcp.hmmhmmhm.workers.dev/health
```

실제 SDK 클라이언트로 `https://mcp.aka.page/mcp`에 연결해 다음을 확인한다.

- Daiso 정상 도구는 성공 결과와 `structuredContent`를 반환한다.
- Zyte가 정지된 GS25 오류 도구는 `-32602`를 던지지 않는다.
- GS25 결과는 `isError: true`, text content, `structuredContent` 부재다.
- 429 내부 통계 엔드포인트의 무인증 요청은 401이며 인증 요청은 정상 집계를 반환한다.

- [ ] **Step 5: 프로젝트 메모리와 로컬 체크아웃을 정리한다**

`PROJECT.md`에 PR, merge commit, 배포 run/version, 전체 테스트, 운영 오류 계약 확인 결과를 기록한다. 기본 checkout을 최신 `main`으로 맞추고 작업 worktree와 로컬 기능 브랜치를 안전하게 제거한다.
