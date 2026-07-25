# Routine Health Hardening Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 정기 점검에서 확인된 개발 의존성 취약점, 450줄 임계 파일, 반복 알림,
External Smoke 러너 낭비를 공개 동작 변경 없이 정비한다.

**Architecture:** 데이터 정의와 전송 계층을 기존 대형 파일에서 분리하고, 독립적인
줄 수 검사기를 npm과 CI에 연결한다. External Smoke는 단일 러너에서 서비스별 명령을
순차 실행해 결과를 모으며, 예약된 일일 점검만 Moshi로 한 번 알린다.

**Tech Stack:** TypeScript 6, Vitest, ESLint, Biome, GitHub Actions, Cloudflare
Workers, npm

---

### Task 1: 450줄 제한 자동 검사

**Files:**

- Create: `scripts/quality/check-source-line-limit.ts`
- Create: `tests/scripts/source-line-limit.test.ts`
- Modify: `tests/scripts/repository-config.test.ts`
- Modify: `package.json`
- Modify: `.github/workflows/ci.yml`
- Modify: `AGENTS.md`
- Modify: `CONTRIBUTING.md`

- [ ] **Step 1: 경계값과 재귀 탐색 실패 테스트 작성**

`tests/scripts/source-line-limit.test.ts`에 임시 디렉터리를 만들고 다음 동작을 검증한다.

```typescript
expect(countSourceLines(`${'line\n'.repeat(450)}`)).toBe(450);
expect(countSourceLines(`${'line\n'.repeat(451)}`)).toBe(451);
await expect(findSourceLineViolations(sourceRoot, 450)).resolves.toEqual([
  { path: 'nested/too-long.ts', lines: 451 },
]);
```

`tests/scripts/repository-config.test.ts`에는 `check:source-lines`, 통합 `check`, CI 단계,
AGENTS와 CONTRIBUTING의 CI 강제 문구를 기대하는 테스트를 추가한다.

- [ ] **Step 2: 새 테스트가 올바른 이유로 실패하는지 확인**

Run:

```bash
npx vitest run tests/scripts/source-line-limit.test.ts tests/scripts/repository-config.test.ts --maxWorkers=1 --no-file-parallelism
```

Expected: `scripts/quality/check-source-line-limit.ts`가 없어 import 또는 설정 기대값이
실패한다.

- [ ] **Step 3: 최소 줄 수 검사기 구현**

검사기는 다음 API와 CLI 동작을 제공한다.

```typescript
export const MAX_SOURCE_FILE_LINES = 450;

export interface SourceLineViolation {
  path: string;
  lines: number;
}

export function countSourceLines(source: string): number;

export async function findSourceLineViolations(
  sourceRoot?: string,
  maxLines?: number,
): Promise<SourceLineViolation[]>;
```

`findSourceLineViolations`는 디렉터리를 이름순으로 재귀 탐색하고 `.ts` 파일만 읽는다.
CLI 실행 시 위반이 없으면 검사 파일 수와 제한을 출력하고 0으로 종료한다. 위반이
있으면 `path: lines lines`를 출력하고 `process.exitCode = 1`로 설정한다. `src`를
읽지 못한 오류는 잡아 성공으로 바꾸지 않는다.

`package.json`은 다음처럼 연결한다.

```json
"check:source-lines": "npx tsx scripts/quality/check-source-line-limit.ts",
"check": "npm run format:check && npm run lint && npm run lint:biome && npm run typecheck && npm run check:source-lines && npm test"
```

CI의 Type check 다음에 `npm run check:source-lines` 단계를 추가하고 두 문서에는
450줄 제한이 CI에서 강제된다고 명시한다.

- [ ] **Step 4: 대상 테스트와 실제 저장소 검사 통과 확인**

Run:

```bash
npx vitest run tests/scripts/source-line-limit.test.ts tests/scripts/repository-config.test.ts --maxWorkers=1 --no-file-parallelism
npm run check:source-lines
```

Expected: 두 명령 모두 PASS, 현재 `src/**/*.ts` 위반 0개.

- [ ] **Step 5: 커밋**

```bash
git add scripts/quality/check-source-line-limit.ts tests/scripts/source-line-limit.test.ts tests/scripts/repository-config.test.ts package.json .github/workflows/ci.yml AGENTS.md CONTRIBUTING.md
git commit -m "ci: 소스 파일 450줄 제한 자동 검사"
```

### Task 2: OpenAPI와 CLI 도움말 책임 분리

**Files:**

- Create: `src/pages/openapiSpecActionParameters.ts`
- Modify: `src/pages/openapiSpecActions.ts`
- Create: `src/cliHelpDefinitions.ts`
- Modify: `src/cliHelp.ts`
- Modify: `tests/pages/openapi.test.ts`
- Modify: `tests/app/cli.test.ts`

- [ ] **Step 1: 새 모듈 계약을 사용하는 실패 테스트 작성**

OpenAPI 테스트는 새 모듈에서 파라미터를 import해 `action`이 필수이며 enum이
`ACTION_QUERY_ACTIONS`와 일치하는지 확인한다. CLI 테스트는 새 정의 모듈에서
`COMMAND_LIST`, `COMMAND_SUMMARY`, `COMMAND_DETAIL`을 import해 모든 명령에 요약과
상세 도움말이 존재하는지 확인한다.

```typescript
expect(ACTION_QUERY_PARAMETERS.find((item) => item.name === 'action')).toMatchObject({
  required: true,
});
for (const command of COMMAND_LIST) {
  expect(COMMAND_SUMMARY[command]).toBeTruthy();
  expect(COMMAND_DETAIL[command].length).toBeGreaterThan(0);
}
```

- [ ] **Step 2: 새 모듈이 없어 실패하는지 확인**

Run:

```bash
npx vitest run tests/pages/openapi.test.ts tests/app/cli.test.ts --maxWorkers=1 --no-file-parallelism
```

Expected: 두 새 모듈을 찾지 못해 FAIL.

- [ ] **Step 3: OpenAPI 파라미터 정의 이동**

`ACTION_QUERY_PARAMETERS` 전체를 `openapiSpecActionParameters.ts`로 옮기고 export한다.
`openapiSpecActions.ts`는 이를 import해 기존 스펙 객체에 그대로 사용한다. 값, 순서,
설명, schema는 변경하지 않는다.

- [ ] **Step 4: CLI 정의 이동과 기존 export 보존**

`CommandName`, `COMMAND_LIST`, `COMMAND_SUMMARY`, `COMMAND_DETAIL`을
`cliHelpDefinitions.ts`로 옮긴다. `cliHelp.ts`는 출력 함수만 유지하고 다음처럼 기존
export를 보존한다.

```typescript
import {
  COMMAND_DETAIL,
  COMMAND_LIST,
  COMMAND_SUMMARY,
  type CommandName,
} from './cliHelpDefinitions.js';

export { COMMAND_LIST } from './cliHelpDefinitions.js';
export type { CommandName } from './cliHelpDefinitions.js';
```

- [ ] **Step 5: 관련 테스트와 줄 수 검사 통과 확인**

Run:

```bash
npx vitest run tests/pages/openapi.test.ts tests/pages/openapi-entry.test.ts tests/app/cli.test.ts --maxWorkers=1 --no-file-parallelism
npm run check:source-lines
```

Expected: PASS, 분리된 모든 파일이 450줄 이하.

- [ ] **Step 6: 커밋**

```bash
git add src/pages/openapiSpecActionParameters.ts src/pages/openapiSpecActions.ts src/cliHelpDefinitions.ts src/cliHelp.ts tests/pages/openapi.test.ts tests/app/cli.test.ts
git commit -m "refactor: OpenAPI와 CLI 도움말 정의 분리"
```

### Task 3: 롯데마트 소켓 전송 계층 분리

**Files:**

- Create: `src/services/lottemart/socketTransport.ts`
- Modify: `src/services/lottemart/session.ts`
- Modify: `tests/services/lottemart/session.test.ts`

- [ ] **Step 1: 소켓 테스트 import를 새 모듈로 변경**

다음 세 symbol을 새 모듈에서 import하도록 테스트를 먼저 바꾼다.

```typescript
import {
  __testOnlyCreateLotteMartSocketResponse,
  __testOnlyFetchLotteMartSocketResponse,
  withLotteMartSessionCookie,
} from '../../../src/services/lottemart/socketTransport.js';
```

기존 raw HTTP 파싱, write/close/read timeout, 헤더와 body 직렬화 검증은 유지한다.

- [ ] **Step 2: 새 모듈 부재로 실패하는지 확인**

Run:

```bash
npx vitest run tests/services/lottemart/session.test.ts --maxWorkers=1 --no-file-parallelism
```

Expected: `socketTransport.js` 모듈을 찾지 못해 FAIL.

- [ ] **Step 3: 전송 계층 이동**

다음 책임을 `socketTransport.ts`로 옮긴다.

- `LotteMartSocketConnect`
- `withSocketTimeout`
- `__testOnlyCreateLotteMartSocketResponse`
- `__testOnlyFetchLotteMartSocketResponse`
- `fetchLotteMartSocketResponse`
- `withLotteMartSessionCookie`
- socket 요청 body 문자열 변환

Cloudflare socket dynamic import의 coverage ignore 경계는 유지한다. `session.ts`는
`fetchLotteMartSocketResponse`와 `withLotteMartSessionCookie`를 import하고, 기존
소비자를 위해 `withLotteMartSessionCookie`를 다시 export한다.

- [ ] **Step 4: 롯데마트 회귀 테스트와 줄 수 검사 통과 확인**

Run:

```bash
npx vitest run tests/services/lottemart/session.test.ts tests/services/lottemart/debug.test.ts tests/services/lottemart/client.test.ts tests/services/lottemart/client.edge.test.ts --maxWorkers=1 --no-file-parallelism
npm run check:source-lines
```

Expected: PASS, `session.ts`와 새 전송 모듈 모두 450줄 이하.

- [ ] **Step 5: 커밋**

```bash
git add src/services/lottemart/socketTransport.ts src/services/lottemart/session.ts tests/services/lottemart/session.test.ts
git commit -m "refactor: 롯데마트 소켓 전송 계층 분리"
```

### Task 4: 의존성 취약점과 호환 업데이트

**Files:**

- Modify: `package.json`
- Modify: `package-lock.json`
- Modify: `tests/scripts/repository-config.test.ts`

- [ ] **Step 1: 보안 버전 회귀 테스트 추가**

repository config 테스트에서 lockfile의 `node_modules/brace-expansion.version`이
5.0.8 이상인지 확인한다.

```typescript
const version = lock.packages['node_modules/brace-expansion'].version;
const [major, minor, patch] = version.split('.').map(Number);
expect([major, minor]).toEqual([5, 0]);
expect(patch).toBeGreaterThanOrEqual(8);
```

- [ ] **Step 2: 현재 lockfile에서 실패하는지 확인**

Run:

```bash
npx vitest run tests/scripts/repository-config.test.ts --maxWorkers=1 --no-file-parallelism
```

Expected: 현재 5.0.7 때문에 FAIL.

- [ ] **Step 3: 호환 의존성 갱신**

Run:

```bash
npm install hono@4.12.32
npm install --save-dev @cloudflare/workers-types@5.20260724.1 eslint@10.8.0 playwright@1.62.0 wrangler@4.114.0
npm update brace-expansion
```

TypeScript는 6.0.3을 유지한다. 명령이 만든 package와 lockfile 변경 외 수동 lockfile
편집은 하지 않는다.

- [ ] **Step 4: 보안과 호환성 확인**

Run:

```bash
npx vitest run tests/scripts/repository-config.test.ts --maxWorkers=1 --no-file-parallelism
npm audit
npm audit --omit=dev
npm run typecheck
```

Expected: 테스트 PASS, audit 두 종류 모두 취약점 0개, typecheck PASS.

- [ ] **Step 5: 커밋**

```bash
git add package.json package-lock.json tests/scripts/repository-config.test.ts
git commit -m "fix: 개발 의존성 취약점과 호환 버전 갱신"
```

### Task 5: 순차 External Smoke와 일일 단일 알림

**Files:**

- Modify: `.github/workflows/external-smoke.yml`
- Modify: `.github/workflows/health-checks.yml`
- Modify: `tests/scripts/repository-config.test.ts`

- [ ] **Step 1: 원하는 workflow 계약의 실패 테스트 작성**

repository config 테스트가 다음을 요구하도록 바꾼다.

```typescript
expect(smoke).not.toContain('matrix:');
expect(smoke).not.toContain('max-parallel:');
expect(smoke).toContain('run_smoke_with_retry');
expect(smoke).toContain('CLI_SMOKE_SERVICES=');
expect(smoke).toContain('MCP_SMOKE_SERVICES=');
expect(smoke).toContain('external-smoke-summary.txt');
expect(smoke).toContain("github.event_name == 'schedule'");
expect(health).toContain("github.event.schedule == '10 15 * * *'");
```

서비스 이름 전체와 한 번의 `npm run build`, Moshi token 누락 처리도 기대한다.

- [ ] **Step 2: 기존 매트릭스 workflow에서 실패하는지 확인**

Run:

```bash
npx vitest run tests/scripts/repository-config.test.ts --maxWorkers=1 --no-file-parallelism
```

Expected: matrix와 `max-parallel: 4` 때문에 FAIL.

- [ ] **Step 3: External Smoke를 단일 순차 작업으로 변경**

workflow는 checkout, Node 24, `npm ci`, `npm run build`를 한 번씩 수행한다.
`run_smoke_with_retry`는 suite와 service를 받아 기존 smoke 스크립트를 실행하고
15초 후 한 번 재시도한다. CLI 서비스 10개와 MCP 서비스 5개를 각각 `for` 루프로
순차 실행한다.

각 최종 실패는 `suite.service`와 출력의 마지막 부분을 summary 파일에 추가한다.
모든 서비스를 실행한 뒤 실패 수가 1 이상이면 종료 코드 1을 반환한다. job에는
`timeout-minutes: 60`을 둔다.

알림 step은 다음 조건으로 예약 실행에서 한 번만 동작한다.

```yaml
if: failure() && github.event_name == 'schedule'
```

- [ ] **Step 4: Health 알림을 full 예약 실패로 제한**

Health 검사와 재시도는 바꾸지 않고 알림 step 조건만 다음처럼 제한한다.

```yaml
if: failure() && github.event_name == 'schedule' && github.event.schedule == '10 15 * * *'
```

Moshi `curl`에는 `--fail-with-body --silent --show-error`를 사용해 알림 전송 오류가
로그에 드러나게 한다.

- [ ] **Step 5: workflow 회귀 테스트와 format 확인**

Run:

```bash
npx vitest run tests/scripts/repository-config.test.ts --maxWorkers=1 --no-file-parallelism
npm run format:check
```

Expected: PASS.

- [ ] **Step 6: 커밋**

```bash
git add .github/workflows/external-smoke.yml .github/workflows/health-checks.yml tests/scripts/repository-config.test.ts
git commit -m "ci: 외부 점검 순차 실행과 일일 단일 알림"
```

### Task 6: 전체 검증, PR, 배포

**Files:**

- Verify all changed files
- External configuration: GitHub Actions secret `MOSHI_WEBHOOK_TOKEN`

- [ ] **Step 1: 정적 검사 순차 실행**

Run each command separately:

```bash
npm run format:check
npm run lint
npm run lint:biome
npm run typecheck
npm run check:source-lines
```

Expected: 모두 PASS, compiler warning과 lint warning 0개.

- [ ] **Step 2: 전체 테스트와 100% coverage 순차 실행**

Run:

```bash
npx vitest run --maxWorkers=1 --no-file-parallelism
npx vitest run --coverage --maxWorkers=1 --no-file-parallelism
```

Expected: 전체 테스트 PASS, Statements/Branches/Functions/Lines 100%.

- [ ] **Step 3: 빌드와 배포 dry-run, audit 실행**

Run each command separately:

```bash
npm run build
npx wrangler deploy --dry-run
npm audit
npm audit --omit=dev
```

Expected: 모두 PASS, 취약점 0개.

- [ ] **Step 4: diff와 파일 길이 검토**

Run:

```bash
git diff main...HEAD --check
rg --files src -g '*.ts' | xargs wc -l | sort -nr | head -n 20
git status --short
```

Expected: whitespace 오류 없음, 450줄 초과 없음, 의도하지 않은 파일 없음.

- [ ] **Step 5: 브랜치 push와 PR 생성**

```bash
git push -u origin chore/routine-health-hardening
gh pr create \
  --base main \
  --head chore/routine-health-hardening \
  --title "chore: 정기 점검 후속 품질과 운영 정비" \
  --body "## 요약
- 450줄 제한 자동 검사와 임계 파일 분리
- 의존성 보안 업데이트
- External Smoke 순차 실행과 일일 단일 알림

## 검증
- 단일 워커 전체 테스트와 100% coverage
- lint, typecheck, build, deploy dry-run
- npm audit 취약점 0개"
```

PR 본문에는 변경 요약, 순차 테스트 결과, audit 결과, TypeScript 7 보류 이유를
기록한다. CI, Coverage, CodeQL, Deploy required check를 확인한다.

- [ ] **Step 6: Moshi secret 등록과 main 병합**

PR 검증이 통과한 뒤 token 값을 출력하지 않는 입력 방식으로
`MOSHI_WEBHOOK_TOKEN` Actions secret을 등록한다. PR을 squash merge하고 최신 main을
pull한다.

- [ ] **Step 7: 배포와 운영 확인**

Deploy workflow 완료를 확인하고 production `/health`가 200인지, Worker 최신 버전이
100% 트래픽을 받는지 확인한다. External Smoke와 Health workflow를 수동 실행해
workflow 문법과 순차 실행을 검증하되 수동 실행은 Moshi 푸시를 보내지 않는지 로그로
확인한다.
