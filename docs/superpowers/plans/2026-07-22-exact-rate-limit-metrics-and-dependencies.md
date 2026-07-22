# Exact Rate Limit Metrics and Dependencies Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Record every Worker-generated daily-limit 429 in an exact private ledger, expose authenticated aggregate statistics, clear compatible Dependabot and npm audit findings, and deploy the verified release.

**Architecture:** Keep the existing per-identity quota Durable Objects and reserve one object in the same namespace as the blocked-event ledger. A denied request writes synchronously to the ledger before the middleware emits 429; ledger failure fails open. A dedicated authenticated route queries aggregate-only 30-day statistics, while dependency changes are isolated in later commits and verified against the complete test suite.

**Tech Stack:** TypeScript, Hono, Cloudflare Workers and SQLite Durable Objects, Vitest with V8 coverage, npm, GitHub Actions, Wrangler.

---

### Task 1: Extract shared operational authentication

**Files:**

- Create: `src/api/operationalAuth.ts`
- Modify: `src/api/routes/healthRoutes.ts`
- Test: `tests/app/app-health-checks.test.ts`

- [ ] **Step 1: Write the failing authentication unit tests**

Create `tests/api/operationalAuth.test.ts` with direct coverage for Bearer priority, `x-health-check-key` fallback, missing secret, valid secret, and invalid secret:

```ts
expect(readOperationalToken(new Headers({ Authorization: 'Bearer test-secret' }))).toBe(
  'test-secret',
);
expect(readOperationalToken(new Headers({ 'x-health-check-key': 'test-secret' }))).toBe(
  'test-secret',
);
expect(authorizeOperationalRequest(new Headers(), undefined)).toBe('not-configured');
expect(
  authorizeOperationalRequest(new Headers({ Authorization: 'Bearer test-secret' }), 'test-secret'),
).toBe('authorized');
expect(authorizeOperationalRequest(new Headers(), 'test-secret')).toBe('unauthorized');
```

- [ ] **Step 2: Verify the tests fail because the module is absent**

Run: `npx vitest run tests/api/operationalAuth.test.ts`

Expected: FAIL with an unresolved `src/api/operationalAuth.js` import.

- [ ] **Step 3: Implement the shared helper and adopt it in health routes**

Export these interfaces from `src/api/operationalAuth.ts`:

```ts
export type OperationalAuthorization = 'authorized' | 'unauthorized' | 'not-configured';

export function readOperationalToken(headers: Headers): string {
  const authorization = headers.get('Authorization') || '';
  if (authorization.toLowerCase().startsWith('bearer ')) {
    return authorization.slice('bearer '.length).trim();
  }
  return (headers.get('x-health-check-key') || '').trim();
}

export function authorizeOperationalRequest(
  headers: Headers,
  configuredSecret: string | undefined,
): OperationalAuthorization {
  const secret = configuredSecret?.trim();
  if (!secret) return 'not-configured';
  return readOperationalToken(headers) === secret ? 'authorized' : 'unauthorized';
}
```

Replace the private token reader in `healthRoutes.ts` with this helper while preserving the existing 503 and 401 error codes and messages.

- [ ] **Step 4: Run unit and health regressions**

Run: `npx vitest run tests/api/operationalAuth.test.ts tests/app/app-health-checks.test.ts`

Expected: both files PASS.

- [ ] **Step 5: Commit**

```bash
git add src/api/operationalAuth.ts src/api/routes/healthRoutes.ts tests/api/operationalAuth.test.ts tests/app/app-health-checks.test.ts
git commit -m "refactor: 운영 API 인증 로직 공통화"
```

### Task 2: Build the exact blocked-event ledger

**Files:**

- Create: `src/durableObjects/rateLimitMetricsStore.ts`
- Create: `tests/durableObjects/rateLimitMetricsStore.test.ts`

- [ ] **Step 1: Write failing store tests around an in-memory SQL fixture**

Cover schema initialization, idempotent `event_id`, repeated identities, per-service grouping, KST date validation, 30-day cleanup, alarm scheduling, and aggregate-only output. Use this public shape:

```ts
const store = new RateLimitMetricsStore(state);
await store.record({
  eventId: 'event-1',
  occurredAt: Date.parse('2026-07-22T00:00:00Z'),
  day: '2026-07-22',
  service: 'cgv',
  identityId: 'opaque-id-1',
});
const stats = await store.query({ from: '2026-07-22', to: '2026-07-22' });
expect(stats.totals).toEqual({ blockedRequests: 1, uniqueIdentities: 1 });
expect(JSON.stringify(stats)).not.toContain('opaque-id-1');
```

Record `event-1` twice and assert `blockedRequests` remains `1`. Record the same identity for `cgv` and `gs25` and assert the global unique count remains `1` while both service rows report one unique identity.

- [ ] **Step 2: Verify the tests fail because the store is absent**

Run: `npx vitest run tests/durableObjects/rateLimitMetricsStore.test.ts`

Expected: FAIL with an unresolved store import.

- [ ] **Step 3: Implement the SQLite store**

Implement these exported types and methods:

```ts
export const RATE_LIMIT_METRICS_RETENTION_DAYS = 30;
export const RATE_LIMIT_METRICS_LEDGER_NAME = '__blocked-ledger-v1__';
export const RATE_LIMIT_SERVICES = ['oliveyoung', 'cgv', 'cu', 'gs25', 'lottemart'] as const;
export type RateLimitService = (typeof RATE_LIMIT_SERVICES)[number];

export interface BlockedRateLimitEvent {
  eventId: string;
  occurredAt: number;
  day: string;
  service: RateLimitService;
  identityId: string;
}

export class RateLimitMetricsStore {
  constructor(private readonly state: DurableObjectState) {}
  record(event: BlockedRateLimitEvent): Promise<void>;
  query(input: { from: string; to: string; service?: RateLimitService }): Promise<RateLimitStats>;
  cleanup(nowMs?: number): Promise<void>;
  ensureAlarm(nowMs?: number): Promise<void>;
}
```

Create `blocked_events`, three indexes, `INSERT OR IGNORE`, `COUNT(*)`, and `COUNT(DISTINCT identity_id)` queries. Query daily/service rows in deterministic day and service order. Delete rows with `day` older than the KST retention cutoff. Schedule the next alarm for the next KST midnight plus five minutes only when no alarm is already present.

- [ ] **Step 4: Run store tests and coverage for the new module**

Run: `npx vitest run tests/durableObjects/rateLimitMetricsStore.test.ts --coverage`

Expected: PASS and the new module has 100% statements, branches, functions, and lines.

- [ ] **Step 5: Commit**

```bash
git add src/durableObjects/rateLimitMetricsStore.ts tests/durableObjects/rateLimitMetricsStore.test.ts
git commit -m "feat: 정확한 429 원장 저장소 추가"
```

### Task 3: Route quota and ledger operations through the existing Durable Object

**Files:**

- Modify: `src/durableObjects/dailyRateLimiter.ts`
- Modify: `tests/durableObjects/dailyRateLimiter.test.ts`

- [ ] **Step 1: Write failing route and alarm tests**

Assert `POST /consume` returns a quota result, `POST /blocked-events` validates and records a complete event, `GET /stats` passes parsed filters to the store, unsupported method/path returns 404, malformed event returns 400, and `alarm()` invokes cleanup then schedules the next alarm.

```ts
const response = await limiter.fetch(
  new Request('https://daily-rate-limit/blocked-events', {
    method: 'POST',
    body: JSON.stringify(validEvent),
  }),
);
expect(response.status).toBe(204);
```

- [ ] **Step 2: Run the DO tests and verify route assertions fail**

Run: `npx vitest run tests/durableObjects/dailyRateLimiter.test.ts`

Expected: FAIL because `fetch` ignores request routing and no `alarm` method exists.

- [ ] **Step 3: Implement request routing and alarm delegation**

Change `fetch` to accept `Request`, route only the three known operation paths, validate service/date/event fields before storage, and return JSON 400 or 404 responses without throwing. Instantiate `RateLimitMetricsStore` only for ledger/stats operations. Add:

```ts
async alarm(): Promise<void> {
  const store = new RateLimitMetricsStore(this.state);
  await store.cleanup();
  await store.ensureAlarm();
}
```

- [ ] **Step 4: Run DO tests**

Run: `npx vitest run tests/durableObjects/dailyRateLimiter.test.ts tests/durableObjects/rateLimitMetricsStore.test.ts`

Expected: both files PASS.

- [ ] **Step 5: Commit**

```bash
git add src/durableObjects/dailyRateLimiter.ts tests/durableObjects/dailyRateLimiter.test.ts
git commit -m "feat: 호출 제한 객체에 429 원장 라우팅 추가"
```

### Task 4: Gate every application 429 on a committed ledger event

**Files:**

- Modify: `src/middleware/dailyRateLimit.ts`
- Modify: `tests/middleware/dailyRateLimit.test.ts`
- Modify: `tests/app/app-daily-rate-limit.test.ts`

- [ ] **Step 1: Write failing middleware and integration tests**

Update the Durable Object fixture so `idFromName` returns an ID with stable `toString()`. Assert an allowed request calls only `/consume`; a denied request calls `/consume` and then the reserved ledger `/blocked-events`; the ledger body has a UUID, KST day, service, timestamp, and opaque ID but contains neither `203.0.113.10` nor its SHA-256 value. Assert ledger 503/throw results in the downstream handler response rather than 429.

```ts
expect(calls.map((call) => new URL(call.request.url).pathname)).toEqual([
  '/consume',
  '/blocked-events',
]);
expect(response.status).toBe(429);
expect(recordedBody.service).toBe('cgv');
```

- [ ] **Step 2: Verify the new tests fail against the current middleware**

Run: `npx vitest run tests/middleware/dailyRateLimit.test.ts tests/app/app-daily-rate-limit.test.ts`

Expected: FAIL because no ledger call is made and ledger failure cannot fail open.

- [ ] **Step 3: Implement service-aware consumption and synchronous recording**

Replace prefix-only matching with descriptors that map prefixes to `RateLimitService`. Return an internal decision containing the quota result, service, and the resolved Durable Object ID. On denial, build a UUID event and synchronously call `idFromName(RATE_LIMIT_METRICS_LEDGER_NAME)` at `/blocked-events`. Only return the 429 when that response is 204. Log a non-sensitive error and call `next()` on any ledger failure.

- [ ] **Step 4: Run middleware and app rate-limit tests**

Run: `npx vitest run tests/middleware/dailyRateLimit.test.ts tests/app/app-daily-rate-limit.test.ts`

Expected: both files PASS, including the exact 1:1 and fail-open assertions.

- [ ] **Step 5: Commit**

```bash
git add src/middleware/dailyRateLimit.ts tests/middleware/dailyRateLimit.test.ts tests/app/app-daily-rate-limit.test.ts
git commit -m "feat: 429 응답을 정확한 원장 기록과 연결"
```

### Task 5: Expose authenticated aggregate rate-limit statistics

**Files:**

- Create: `src/api/routes/rateLimitStatsRoutes.ts`
- Create: `tests/app/app-rate-limit-stats.test.ts`
- Modify: `src/index.ts`
- Modify: `src/api/response.ts` only if a shared response type requires it

- [ ] **Step 1: Write failing API tests**

Test missing `HEALTH_CHECK_SECRET` gives 503, invalid credentials give 401, invalid dates/service or a range over 30 days give 400, a valid request fetches the reserved object `/stats`, and a backend error gives 503. Assert the successful body contains totals and rows but no `identityId` or raw IP.

```ts
const response = await app.request(
  '/api/rate-limit/stats?from=2026-07-20&to=2026-07-22&service=cgv',
  { headers: { Authorization: 'Bearer test-secret' } },
  env,
);
expect(response.status).toBe(200);
expect(await response.json()).toMatchObject({ success: true, data: expectedStats });
```

- [ ] **Step 2: Verify the route tests fail with 404**

Run: `npx vitest run tests/app/app-rate-limit-stats.test.ts`

Expected: FAIL because the route is not registered.

- [ ] **Step 3: Implement validation, authentication, and aggregate proxying**

Register `GET /api/rate-limit/stats`. Reuse `authorizeOperationalRequest`, default to the last seven KST days, enforce `from <= to` and a 30-day inclusive maximum, validate service against `RATE_LIMIT_SERVICES`, query the reserved object, and return `successResponse`. Map configuration/authentication/validation/backend failures to stable 503/401/400/503 codes.

Register the route next to health routes in `src/index.ts`. If `src/index.ts` would exceed 450 lines, move root-info endpoint metadata to `src/api/rootInfo.ts` before adding the new registration.

- [ ] **Step 4: Run stats, health, and rate-limit integration tests**

Run: `npx vitest run tests/app/app-rate-limit-stats.test.ts tests/app/app-health-checks.test.ts tests/app/app-daily-rate-limit.test.ts`

Expected: all files PASS.

- [ ] **Step 5: Commit**

```bash
git add src/api/routes/rateLimitStatsRoutes.ts tests/app/app-rate-limit-stats.test.ts src/index.ts src/api/response.ts src/api/rootInfo.ts
git commit -m "feat: 인증된 429 통계 API 추가"
```

Only add paths that exist to the commit.

### Task 6: Document the operational metric contract

**Files:**

- Modify: `README.md`
- Modify: `docs/service-reference.md` if it contains the operational endpoint catalog

- [ ] **Step 1: Add documentation assertions**

Extend the existing README/repository configuration test to require `/api/rate-limit/stats`, `HEALTH_CHECK_SECRET`, 30-day retention, the Worker-generated 429 exactness boundary, and the statement that collection begins at deployment.

- [ ] **Step 2: Run the documentation test and verify it fails**

Run: `npx vitest run tests/scripts/repository-config.test.ts`

Expected: FAIL because the endpoint contract is not documented.

- [ ] **Step 3: Add the authenticated endpoint documentation**

Document Bearer and `x-health-check-key` examples, query parameters, aggregate-only response fields, 30-day retention, fail-open behavior, and non-retroactive collection. Preserve the existing GitHub Important callout for the daily 3,000-search policy.

- [ ] **Step 4: Run the documentation test and formatting check**

Run: `npx vitest run tests/scripts/repository-config.test.ts`

Run: `npx prettier README.md docs/service-reference.md --check`

Expected: tests and formatting PASS.

- [ ] **Step 5: Commit**

```bash
git add README.md docs/service-reference.md tests/scripts/repository-config.test.ts
git commit -m "docs: 정확한 429 통계 조회 방법 추가"
```

Only add `docs/service-reference.md` if it changed.

### Task 7: Resolve compatible Dependabot and npm audit findings

**Files:**

- Modify: `package.json`
- Modify: `package-lock.json`
- Modify: `biome.jsonc`
- Modify: `.github/workflows/ci.yml`
- Modify: `.github/workflows/coverage.yml`
- Modify: `.github/workflows/deploy.yml`
- Modify: `.github/workflows/external-smoke.yml`
- Modify: `.github/workflows/npm-publish.yml`
- Modify: `.github/workflows/sync-worker-secrets.yml`
- Modify: `.github/workflows/workers-invocations-chart.yml`
- Modify: `tests/scripts/repository-config.test.ts`

- [ ] **Step 1: Capture the authoritative current update and audit set**

Run: `npm outdated --json`

Run: `npm audit --json`

Run: `gh pr list --state open --author app/dependabot --json number,title,headRefName,statusCheckRollup`

Expected: eight compatible updates, TypeScript 7 blocked by the `typescript-eslint` peer range, and the currently reported direct/transitive audit paths.

- [ ] **Step 2: Update compatible package families and security paths**

Use exact compatible latest versions returned by the registry for Hono, `typescript-eslint`, Workers types, `tsx`, Biome, Wrangler, and Prettier while preserving TypeScript 6.0.3. Update the Biome schema URL to the installed CLI version. Upgrade direct parents where possible; use narrow overrides only for unresolved safe transitive fixes such as `brace-expansion` and `body-parser`.

Regenerate with: `npm install`

Expected: `npm ls` exits 0 without invalid peer dependencies.

- [ ] **Step 3: Update GitHub Actions setup-node references**

Replace all seven `actions/setup-node@v6` references with `actions/setup-node@v7`. Extend `tests/scripts/repository-config.test.ts` to assert there are no v6 references and each expected workflow contains v7.

- [ ] **Step 4: Verify the integrated dependency graph and security state**

Run: `npm ci`

Run: `npm ls`

Run: `npm audit`

Run: `npm run check`

Run: `npm run test:coverage`

Run: `npm run build`

Expected: install and dependency tree succeed; audit has zero actionable vulnerabilities; 100% coverage; check and build PASS. If a current upstream package has no compatible security release, preserve the supported graph and document the exact advisory, dependency path, and upstream version evidence before proceeding.

- [ ] **Step 5: Commit package and workflow changes separately**

```bash
git add package.json package-lock.json biome.jsonc
git commit -m "chore: 의존성과 보안 패키지 업데이트"

git add .github/workflows tests/scripts/repository-config.test.ts
git commit -m "ci: setup-node v7으로 업데이트"
```

### Task 8: Review, integrate, deploy, and close superseded Dependabot PRs

**Files:**

- Modify: `projects/daiso-mcp/PROJECT.md` in the parent workspace after repository integration

- [ ] **Step 1: Run final verification from a clean install**

Run: `git diff origin/main...HEAD --check`

Run: `npm ci`

Run: `npm run check`

Run: `npm run test:coverage`

Run: `npm run build`

Run: `npm audit`

Run: `find src tests scripts -name '*.ts' -print0 | xargs -0 wc -l | sort -nr | head -20`

Expected: all commands PASS, coverage is 100%, audit is clear or has an explicitly evidenced upstream-only exception, and modified code files stay at or below 450 lines.

- [ ] **Step 2: Perform correctness and simplification reviews**

Inspect the full branch diff for exactness, privacy, authentication, fail-open behavior, retention, dependency compatibility, dead abstractions, and unrelated changes. Fix every confirmed finding and rerun the affected tests plus final verification.

- [ ] **Step 3: Rebase or merge the latest origin/main safely**

Run: `git fetch origin`

Run: `git log --oneline --left-right HEAD...origin/main`

Integrate upstream without discarding automatic chart updates, resolve only branch-owned conflicts, and rerun the complete verification suite.

- [ ] **Step 4: Push and merge to main**

Push the feature branch, create or update a PR with the exact metric contract and dependency disposition, wait for required checks, then merge using the repository's accepted method. Do not force-push main.

- [ ] **Step 5: Close unsupported or superseded Dependabot PRs**

Confirm compatible PRs auto-close after main contains their versions. Close TypeScript 7 PR #138 with the `typescript-eslint <6.1.0` peer-dependency evidence. Close any remaining superseded Dependabot PR with a comment pointing to the integrated commit and successful checks.

- [ ] **Step 6: Verify deployment and the authenticated production API**

Wait for the deploy workflow to finish successfully. Confirm the active Cloudflare Worker version matches the merged commit. Query `/health`, then query `/api/rate-limit/stats` with the configured health secret. Expect HTTP 200 and aggregate zero/nonzero data, never raw identities. Confirm an unauthenticated query returns 401.

- [ ] **Step 7: Update project memory and send completion notification**

Record the implementation commits, test evidence, dependency dispositions, deployed Worker version, stats endpoint behavior, and Zyte non-action in `projects/daiso-mcp/PROJECT.md`. Send the configured Moshi completion webhook only after deployment evidence is complete.
