# Zyte 연동 API 일일 호출 제한 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Zyte 연동 공개 GET API를 IP별 KST 하루 3,000회로 제한하되 헬스 체크와 MCP 스트림·세션 통신은 제한하지 않는다.

**Architecture:** SHA-256으로 익명화한 IP마다 SQLite-backed Durable Object를 하나씩 사용해 날짜와 횟수를 직렬화한다. Hono 미들웨어가 보호 경로의 GET 요청을 cache 처리 전에 검사하고, 허용된 최종 응답에 제한 헤더를 붙인다. 헬스 체크 secret이 유효한 내부 요청은 우회하며 Zyte 호출에는 서비스 태그를 추가한다.

**Tech Stack:** TypeScript, Hono, Cloudflare Workers, Durable Objects, Vitest, Wrangler

---

## 파일 구조

- Create: `src/durableObjects/dailyRateLimiter.ts` — KST 날짜별 카운터와 Durable Object fetch handler
- Create: `src/middleware/dailyRateLimit.ts` — 보호 경로 판별, IP 해시, binding 호출, 429와 응답 헤더
- Create: `tests/durableObjects/dailyRateLimiter.test.ts` — 3,000회 경계와 날짜 초기화 단위 테스트
- Create: `tests/middleware/dailyRateLimit.test.ts` — 경로·메서드·IP·fail-open 미들웨어 테스트
- Create: `tests/app/app-daily-rate-limit.test.ts` — Hono 라우팅, cache hit, 제외 경로 통합 테스트
- Modify: `src/api/response.ts` — Durable Object binding 타입과 429 응답 타입
- Modify: `src/index.ts` — rate limit 미들웨어 등록과 Durable Object class export
- Modify: `src/api/routes/healthRoutes.ts` — 신뢰 가능한 내부 health fetch에 우회 secret 전달
- Modify: `src/utils/zyte.ts` — Zyte tags 옵션과 요청 payload
- Modify: `src/services/{oliveyoung,cgv,cu,gs25,lottemart}/...` — `service` 태그 전달
- Modify: `tests/utils/zyte.test.ts` — 태그 payload 회귀 테스트
- Modify: `tests/app/app-health-checks.test.ts` — 내부 health 우회 헤더 테스트
- Modify: `wrangler.toml` — Durable Object binding과 SQLite migration
- Modify: `PROJECT.md` — 조사 결과, 구현, 검증 기록

### Task 1: Durable Object 일일 카운터

**Files:**
- Create: `tests/durableObjects/dailyRateLimiter.test.ts`
- Create: `src/durableObjects/dailyRateLimiter.ts`

- [x] **Step 1: 3,000회 경계와 KST 날짜 초기화 실패 테스트 작성**

```ts
const state = createState({ day: '2026-07-17', count: 2999 });
const limiter = new DailyRateLimiter(state as DurableObjectState);

const allowed = await limiter.consume(Date.parse('2026-07-17T14:59:59Z'));
const denied = await limiter.consume(Date.parse('2026-07-17T14:59:59Z'));
expect(allowed).toMatchObject({ allowed: true, count: 3000, remaining: 0 });
expect(denied).toMatchObject({ allowed: false, count: 3000, remaining: 0 });

const reset = await limiter.consume(Date.parse('2026-07-17T15:00:00Z'));
expect(reset).toMatchObject({ allowed: true, count: 1, remaining: 2999, day: '2026-07-18' });
```

- [x] **Step 2: 실패 확인**

Run: `npx vitest run tests/durableObjects/dailyRateLimiter.test.ts`

Expected: FAIL because `DailyRateLimiter` does not exist.

- [x] **Step 3: 최소 카운터 구현**

```ts
export const DAILY_RATE_LIMIT = 3000;
const KST_OFFSET_MS = 9 * 60 * 60 * 1000;

export function toKstDay(nowMs: number): string {
  return new Date(nowMs + KST_OFFSET_MS).toISOString().slice(0, 10);
}

export function nextKstMidnightEpochSeconds(nowMs: number): number {
  const shifted = new Date(nowMs + KST_OFFSET_MS);
  return Math.floor(
    (Date.UTC(shifted.getUTCFullYear(), shifted.getUTCMonth(), shifted.getUTCDate() + 1) - KST_OFFSET_MS) / 1000,
  );
}

export class DailyRateLimiter {
  constructor(private readonly state: DurableObjectState) {}

  async consume(nowMs = Date.now()): Promise<DailyRateLimitResult> {
    const day = toKstDay(nowMs);
    const stored = await this.state.storage.get<StoredCounter>('counter');
    const count = stored?.day === day ? stored.count : 0;
    const allowed = count < DAILY_RATE_LIMIT;
    const nextCount = allowed ? count + 1 : count;
    if (allowed) await this.state.storage.put('counter', { day, count: nextCount });
    return {
      allowed,
      count: nextCount,
      remaining: Math.max(0, DAILY_RATE_LIMIT - nextCount),
      resetAt: nextKstMidnightEpochSeconds(nowMs),
      day,
    };
  }

  async fetch(): Promise<Response> {
    return Response.json(await this.consume());
  }
}
```

- [x] **Step 4: 단위 테스트 통과 확인**

Run: `npx vitest run tests/durableObjects/dailyRateLimiter.test.ts`

Expected: PASS.

### Task 2: 보호 경로 미들웨어

**Files:**
- Create: `tests/middleware/dailyRateLimit.test.ts`
- Create: `src/middleware/dailyRateLimit.ts`
- Modify: `src/api/response.ts`
- Modify: `src/index.ts`

- [x] **Step 1: 보호·제외 경로와 fail-open 실패 테스트 작성**

```ts
expect(isDailyRateLimitedRequest(new Request('https://example.com/api/cgv/timetable'))).toBe(true);
expect(isDailyRateLimitedRequest(new Request('https://example.com/api/health/checks'))).toBe(false);
expect(isDailyRateLimitedRequest(new Request('https://example.com/mcp'))).toBe(false);
expect(isDailyRateLimitedRequest(new Request('https://example.com/api/cgv/timetable', { method: 'PUT' }))).toBe(false);

const request = new Request('https://example.com/api/oliveyoung/products', {
  headers: { 'CF-Connecting-IP': '203.0.113.10' },
});
const result = await consumeDailyRateLimit(request, env);
expect(result?.remaining).toBe(2999);
expect(env.DAILY_RATE_LIMITER.idFromName).not.toHaveBeenCalledWith('203.0.113.10');
```

- [x] **Step 2: 실패 확인**

Run: `npx vitest run tests/middleware/dailyRateLimit.test.ts`

Expected: FAIL because the middleware module does not exist.

- [x] **Step 3: 경로 판별, IP 해시와 binding 호출 구현**

```ts
const PROTECTED_PREFIXES = [
  '/api/oliveyoung/',
  '/api/cgv/',
  '/api/cu/',
  '/api/gs25/',
  '/api/lottemart/',
];

export function isDailyRateLimitedRequest(request: Request): boolean {
  if (request.method !== 'GET') return false;
  const pathname = new URL(request.url).pathname;
  return PROTECTED_PREFIXES.some((prefix) => pathname.startsWith(prefix));
}

export async function hashRateLimitIdentity(ip: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(ip));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

export async function consumeDailyRateLimit(request: Request, env: AppBindings) {
  if (!isDailyRateLimitedRequest(request) || isHealthCheckBypass(request, env)) return null;
  const ip = request.headers.get('CF-Connecting-IP')?.trim();
  if (!ip || !env.DAILY_RATE_LIMITER) return null;
  try {
    const id = env.DAILY_RATE_LIMITER.idFromName(await hashRateLimitIdentity(ip));
    const response = await env.DAILY_RATE_LIMITER.get(id).fetch('https://daily-rate-limit/consume', { method: 'POST' });
    if (!response.ok) return null;
    return (await response.json()) as DailyRateLimitResult;
  } catch (error) {
    console.error('일일 호출 제한 확인 실패', error instanceof Error ? error.message : String(error));
    return null;
  }
}
```

- [x] **Step 4: Hono 미들웨어와 429 구현**

```ts
export function createDailyRateLimitMiddleware(): MiddlewareHandler<{ Bindings: AppBindings }> {
  return async (c, next) => {
    const result = await consumeDailyRateLimit(c.req.raw, c.env);
    if (!result) return next();
    if (!result.allowed) {
      const response = errorResponse(c, 'DAILY_RATE_LIMIT_EXCEEDED', '이 IP의 일일 호출 한도 3,000회를 초과했습니다.', 429);
      setRateLimitHeaders(response.headers, result);
      response.headers.set('Retry-After', String(Math.max(1, result.resetAt - Math.floor(Date.now() / 1000))));
      return response;
    }
    await next();
    setRateLimitHeaders(c.res.headers, result);
  };
}
```

Register `app.use('/api/*', createDailyRateLimitMiddleware())` after CORS and before route registration. Export `DailyRateLimiter` from `src/index.ts`. Extend `AppBindings` with `DAILY_RATE_LIMITER?: DurableObjectNamespace` and allow status 429 in `errorResponse`.

- [x] **Step 5: 미들웨어 테스트 통과 확인**

Run: `npx vitest run tests/middleware/dailyRateLimit.test.ts`

Expected: PASS.

### Task 3: 통합 동작과 헬스 체크 우회

**Files:**
- Create: `tests/app/app-daily-rate-limit.test.ts`
- Modify: `src/api/routes/healthRoutes.ts`
- Modify: `tests/app/app-health-checks.test.ts`

- [x] **Step 1: cache hit, 429, 제외 경로 실패 테스트 작성**

```ts
const env = createRateLimitEnv([{ allowed: true, count: 1, remaining: 2999, resetAt }, { allowed: false, count: 3000, remaining: 0, resetAt }]);
const headers = { 'CF-Connecting-IP': '203.0.113.10' };

const allowed = await app.request('/api/oliveyoung/products', { headers }, env);
expect(allowed.headers.get('X-RateLimit-Remaining')).toBe('2999');

const denied = await app.request('/api/cgv/timetable', { headers }, env);
expect(denied.status).toBe(429);
expect((await denied.json()).error.code).toBe('DAILY_RATE_LIMIT_EXCEEDED');

await app.request('/api/health/checks', { headers: { ...headers, Authorization: 'Bearer secret' } }, { ...env, HEALTH_CHECK_SECRET: 'secret' });
await app.request('/mcp', { method: 'GET', headers }, env);
expect(env.DAILY_RATE_LIMITER.idFromName).toHaveBeenCalledTimes(2);
```

Set `globalThis.caches.default.match` to return a cached response and verify `idFromName` is still called before the cached response is served.

- [x] **Step 2: 실패 확인**

Run: `npx vitest run tests/app/app-daily-rate-limit.test.ts tests/app/app-health-checks.test.ts`

Expected: FAIL because integration wiring and health bypass propagation are incomplete.

- [x] **Step 3: 신뢰 가능한 헬스 체크 fetch에 우회 secret 전달**

```ts
function isTrustedHealthTarget(target: string, requestUrl: string, configuredBaseUrl?: string): boolean {
  const allowedOrigins = new Set([new URL(requestUrl).origin]);
  if (configuredBaseUrl) allowedOrigins.add(new URL(configuredBaseUrl).origin);
  return allowedOrigins.has(new URL(target).origin);
}

const fetchImpl = async (input: RequestInfo | URL, init?: RequestInit) => {
  const headers = new Headers(init?.headers);
  if (isTrustedHealthTarget(String(input), c.req.url, c.env.HEALTH_CHECK_BASE_URL)) {
    headers.set('x-health-check-key', secret);
  }
  const requestInit = { ...init, headers };
  return transport !== 'network'
    ? app.fetch(new Request(input, requestInit), c.env)
    : globalThis.fetch(input, requestInit);
};
```

Pass this `fetchImpl` to `runHealthChecks` for both internal and network transport. Add tests proving the configured Worker origin receives the header while an arbitrary `baseUrl` does not.

- [x] **Step 4: 통합 테스트 통과 확인**

Run: `npx vitest run tests/app/app-daily-rate-limit.test.ts tests/app/app-health-checks.test.ts`

Expected: PASS.

### Task 4: Zyte 서비스 태그

**Files:**
- Modify: `tests/utils/zyte.test.ts`
- Modify: `src/utils/zyte.ts`
- Modify: `src/services/oliveyoung/client.ts`
- Modify: `src/services/cgv/transport.ts`
- Modify: `src/services/cu/client.ts`
- Modify: `src/services/gs25/client.ts`
- Modify: `src/services/gs25/productSearch.ts`
- Modify: `src/services/lottemart/session.ts`

- [x] **Step 1: 태그 payload 실패 테스트 작성**

```ts
await requestByZyte({ apiKey: 'key', url: 'https://example.com', tags: { service: 'cgv' } });
const init = mockFetch.mock.calls[0][1] as RequestInit;
expect(JSON.parse(String(init.body))).toMatchObject({ tags: { service: 'cgv' } });
```

- [x] **Step 2: 실패 확인**

Run: `npx vitest run tests/utils/zyte.test.ts`

Expected: FAIL because `tags` is not in the request body.

- [x] **Step 3: 태그 옵션과 서비스 태그 구현**

Add `tags?: Record<string, string | null>` to `ZyteExtractOptions`, include `tags` in the JSON body only when supplied, and pass one of `oliveyoung`, `cgv`, `cu`, `gs25`, `lottemart` from every `requestByZyte` call site.

```ts
body: JSON.stringify({
  url,
  httpRequestMethod: method,
  customHttpRequestHeaders: headers,
  httpRequestText: bodyText,
  httpResponseBody: true,
  ...(tags ? { tags } : {}),
}),
```

- [x] **Step 4: Zyte와 서비스 테스트 통과 확인**

Run: `npx vitest run tests/utils/zyte.test.ts tests/services/oliveyoung/client.test.ts tests/services/cgv/transport.test.ts tests/services/cu/client.test.ts tests/services/gs25/client.test.ts tests/services/lottemart/session.test.ts`

Expected: PASS.

### Task 5: Wrangler Durable Object 설정

**Files:**
- Modify: `wrangler.toml`

- [x] **Step 1: binding과 SQLite migration 추가**

```toml
[[durable_objects.bindings]]
name = "DAILY_RATE_LIMITER"
class_name = "DailyRateLimiter"

[[migrations]]
tag = "v1"
new_sqlite_classes = ["DailyRateLimiter"]
```

- [x] **Step 2: Cloudflare 타입과 빌드 확인**

Run: `npm run typecheck && npm run build`

Expected: both commands exit 0 and generated OpenAPI files remain unchanged unless generation is deterministic and current sources require an update.

### Task 6: 전체 검증, 프로젝트 기록과 배포

**Files:**
- Modify: `/Users/hm/Documents/personal-agent/projects/daiso-mcp/PROJECT.md`

- [x] **Step 1: 전체 정적 검사와 테스트**

Run: `npm run check`

Expected: format, ESLint, Biome, typecheck and all Vitest tests pass.

- [x] **Step 2: 100% coverage 확인**

Run: `npm run test:coverage`

Expected: Statements, Branches, Functions and Lines are all 100%.

- [x] **Step 3: 배포 전 diff와 비밀정보 확인**

Run: `git diff --check && git status --short && git diff --stat && git diff -- wrangler.toml src tests`

Expected: only planned files changed; no API key, IP or secret value is present.

- [ ] **Step 4: PROJECT.md 사실과 액션 로그 갱신**

Record the July traffic root cause, protected paths, 3,000/day KST policy, health/MCP exclusions, verification commands and commit reference without recording raw IP addresses.

- [ ] **Step 5: 구현 커밋과 push**

```bash
git add src tests wrangler.toml docs/superpowers/plans/2026-07-17-zyte-daily-rate-limit.md
git commit -m "fix: Zyte 연동 API 일일 호출 제한 추가"
git push origin main
```

Expected: push succeeds and GitHub Actions starts for the new main commit.

- [ ] **Step 6: CI/CD와 운영 확인**

Run: `gh run list --branch main --limit 10` and inspect the runs for the pushed SHA with `gh run watch <run-id> --exit-status`.

After deployment, send one normal request to a protected API with a valid query and verify HTTP 200 plus `X-RateLimit-Limit: 3000`. Verify `/health` and `/api/health/checks` still respond without rate limit headers. Do not generate enough requests to approach the production quota.
