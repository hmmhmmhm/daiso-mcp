# Cloudflare Worker 호출 제한 식별자 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 교차 존 Cloudflare Worker 요청이 공통 특수 IP 버킷을 공유하지 않고 upstream zone별 일일 3,000회 버킷을 사용하게 한다.

**Architecture:** 일반 요청은 기존 `CF-Connecting-IP` 문자열을 그대로 해시해 당일 카운터를 보존한다. 교차 존 특수 IP와 `CF-Worker`가 함께 있으면 정규화한 `worker-zone:<zone>`을 해시하고, `CF-Worker`가 없으면 기존 특수 IP 버킷으로 제한해 우회를 막는다.

**Tech Stack:** TypeScript, Hono middleware, Cloudflare Durable Objects, Vitest

---

## 파일 구조

- `src/middleware/dailyRateLimit.ts`: 요청 헤더에서 제한 식별자를 결정하고 기존 Durable Object 호출에 전달한다.
- `tests/middleware/dailyRateLimit.test.ts`: 교차 존 Worker 분리, 존 정규화, 일반 IP 보존, 헤더 누락 fallback을 검증한다.
- `docs/superpowers/plans/2026-07-18-cloudflare-worker-rate-limit-identity.md`: 구현 순서와 검증 결과를 기록한다.

### Task 1: 교차 존 Worker 식별자 회귀 테스트와 최소 구현

**Files:**
- Modify: `tests/middleware/dailyRateLimit.test.ts`
- Modify: `src/middleware/dailyRateLimit.ts`

- [x] **Step 1: 교차 존 Worker 버킷 동작을 재현하는 실패 테스트 추가**

`tests/middleware/dailyRateLimit.test.ts`의 `consumeDailyRateLimit` describe에 다음 테스트를 추가한다.

```typescript
it('교차 존 Worker 요청을 upstream zone별 객체로 분리한다', async () => {
  const fixture = createRateLimitEnv();
  const firstZone = new Request('https://example.com/api/cgv/timetable', {
    headers: {
      'CF-Connecting-IP': '2a06:98c0:3600::103',
      'CF-Worker': 'first.example',
    },
  });
  const secondZone = new Request('https://example.com/api/cgv/timetable', {
    headers: {
      'CF-Connecting-IP': '2a06:98c0:3600::103',
      'CF-Worker': 'second.example',
    },
  });

  await consumeDailyRateLimit(firstZone, fixture.env);
  await consumeDailyRateLimit(secondZone, fixture.env);

  expect(fixture.idFromName.mock.calls[0][0]).toBe(
    await hashRateLimitIdentity('worker-zone:first.example'),
  );
  expect(fixture.idFromName.mock.calls[1][0]).toBe(
    await hashRateLimitIdentity('worker-zone:second.example'),
  );
  expect(fixture.idFromName.mock.calls[0][0]).not.toBe(fixture.idFromName.mock.calls[1][0]);
});

it('교차 존 Worker 이름을 공백 제거와 소문자로 정규화한다', async () => {
  const fixture = createRateLimitEnv();
  const request = new Request('https://example.com/api/cgv/timetable', {
    headers: {
      'CF-Connecting-IP': '2a06:98c0:3600::103',
      'CF-Worker': '  Example.COM  ',
    },
  });

  await consumeDailyRateLimit(request, fixture.env);

  expect(fixture.idFromName).toHaveBeenCalledWith(
    await hashRateLimitIdentity('worker-zone:example.com'),
  );
});
```

- [x] **Step 2: 대상 테스트가 기존 공유 IP 해시 때문에 실패하는지 확인**

Run: `npm test -- tests/middleware/dailyRateLimit.test.ts`

Expected: 새 테스트 2개가 `worker-zone:<zone>` 해시 대신 특수 IP 해시를 받아 FAIL한다.

- [x] **Step 3: 일반 IP와 헤더 누락 방어 테스트 추가**

같은 describe에 다음 테스트를 추가한다.

```typescript
it('일반 IP는 CF-Worker 헤더가 있어도 기존 IP 객체를 사용한다', async () => {
  const fixture = createRateLimitEnv();
  const request = new Request('https://example.com/api/cgv/timetable', {
    headers: {
      'CF-Connecting-IP': '203.0.113.10',
      'CF-Worker': 'spoofed.example',
    },
  });

  await consumeDailyRateLimit(request, fixture.env);

  expect(fixture.idFromName).toHaveBeenCalledWith(await hashRateLimitIdentity('203.0.113.10'));
});

it('교차 존 특수 IP에 CF-Worker가 없으면 기존 공유 객체를 사용한다', async () => {
  const fixture = createRateLimitEnv();
  const request = new Request('https://example.com/api/cgv/timetable', {
    headers: { 'CF-Connecting-IP': '2a06:98c0:3600::103' },
  });

  await consumeDailyRateLimit(request, fixture.env);

  expect(fixture.idFromName).toHaveBeenCalledWith(
    await hashRateLimitIdentity('2a06:98c0:3600::103'),
  );
});
```

- [x] **Step 4: 요청 식별자 결정 함수를 최소 구현**

`src/middleware/dailyRateLimit.ts`에 다음 상수와 함수를 추가하고 `consumeDailyRateLimit()`이 반환된 식별자를 해시하게 한다.

```typescript
const CROSS_ZONE_WORKER_CLIENT_IP = '2a06:98c0:3600::103';

function resolveRateLimitIdentity(request: Request): string | null {
  const ip = request.headers.get('CF-Connecting-IP')?.trim();
  if (!ip || ip !== CROSS_ZONE_WORKER_CLIENT_IP) {
    return ip || null;
  }

  const workerZone = request.headers.get('CF-Worker')?.trim().toLowerCase();
  return workerZone ? `worker-zone:${workerZone}` : ip;
}
```

```typescript
const identity = resolveRateLimitIdentity(request);
if (!identity || !env?.DAILY_RATE_LIMITER) {
  return null;
}

const id = env.DAILY_RATE_LIMITER.idFromName(await hashRateLimitIdentity(identity));
```

- [x] **Step 5: 미들웨어 테스트 전체가 통과하는지 확인**

Run: `npm test -- tests/middleware/dailyRateLimit.test.ts`

Expected: `tests/middleware/dailyRateLimit.test.ts`의 모든 테스트가 PASS한다.

- [x] **Step 6: 변경 파일 포맷과 diff를 확인**

Run: `npx prettier src/middleware/dailyRateLimit.ts tests/middleware/dailyRateLimit.test.ts --write && git diff --check`

Expected: Prettier가 두 파일을 포맷하고 `git diff --check`가 출력 없이 종료 코드 0을 반환한다.

### Task 2: 전체 회귀와 배포 전 검증

**Files:**
- Modify: `docs/superpowers/plans/2026-07-18-cloudflare-worker-rate-limit-identity.md`

- [x] **Step 1: 프로젝트 정적 검사와 전체 테스트 실행**

Run: `npm run check`

Expected: Prettier, ESLint, Biome, TypeScript 검사와 전체 Vitest가 모두 PASS한다.

- [x] **Step 2: 100% 커버리지 확인**

Run: `npm run test:coverage`

Expected: Statements, Branches, Functions, Lines가 모두 100%이고 테스트 실패가 없다.

- [x] **Step 3: 배포 빌드 확인**

Run: `npm run build`

Expected: TypeScript 빌드와 OpenAPI 생성이 오류 없이 완료된다.

- [x] **Step 4: 파일 크기와 민감정보 포함 여부 확인**

Run: `find src -name '*.ts' -type f -exec wc -l {} + | awk '$1 > 450 {print}' && git diff --check && git status --short`

Expected: 450줄 초과 TypeScript 파일과 whitespace 오류가 없고, status에는 계획·미들웨어·테스트 파일만 표시된다.

- [x] **Step 5: 구현 결과 자체 리뷰**

Run: `git diff -- src/middleware/dailyRateLimit.ts tests/middleware/dailyRateLimit.test.ts docs/superpowers/plans/2026-07-18-cloudflare-worker-rate-limit-identity.md`

Expected: 일반 IP 식별자는 기존 형식을 유지하고, 교차 존 특수 IP에만 Worker 존 분기가 적용되며, 원본 IP·존을 로그에 남기는 코드가 없다.

- [x] **Step 6: 구현 커밋 생성**

Run:

```bash
git add src/middleware/dailyRateLimit.ts tests/middleware/dailyRateLimit.test.ts docs/superpowers/plans/2026-07-18-cloudflare-worker-rate-limit-identity.md
git commit -m 'fix: Worker 호출 제한 버킷 분리'
```

Expected: 테스트와 구현 및 완료된 계획 체크리스트가 하나의 `fix:` 커밋으로 생성된다.

### Task 3: main 통합, 푸시와 운영 확인

**Files:**
- No file changes expected

- [ ] **Step 1: 원격 main 최신 상태 확인**

Run: `git fetch origin && git log --oneline --left-right HEAD...origin/main`

Expected: 작업 중 들어온 원격 커밋이 있으면 통합 전에 확인하고, 없으면 현재 두 로컬 커밋만 왼쪽에 표시된다.

- [ ] **Step 2: 사용자 승인에 따라 main에 fast-forward 통합**

Run:

```bash
git -C /Users/hm/Documents/personal-agent/workspaces/daiso-mcp merge --ff-only fix/cloudflare-worker-rate-limit-identity
```

Expected: `main`이 설계와 구현 커밋으로 fast-forward된다.

- [ ] **Step 3: 통합된 main에서 핵심 테스트 재검증**

Run: `npm test -- tests/middleware/dailyRateLimit.test.ts`

Expected: 통합된 `main`에서 미들웨어 테스트가 모두 PASS한다.

- [ ] **Step 4: main 푸시**

Run: `git push origin main`

Expected: 원격 `main`이 새 구현 커밋으로 갱신되고 pre-push 검사가 통과한다.

- [ ] **Step 5: CI/CD와 운영 헬스 확인**

Run: `gh run list --limit 10 --json workflowName,status,conclusion,headSha,url`

Expected: 새 HEAD의 CI, Coverage, CodeQL, Cloudflare 배포가 성공하고 `/health`가 200을 반환한다.
