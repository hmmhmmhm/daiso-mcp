import { mkdtempSync, writeFileSync, mkdirSync, rmSync, readFileSync, existsSync, copyFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { afterEach, describe, it, expect } from 'vitest';
const dirs: string[] = [];
const workflow = readFileSync('.github/workflows/health-checks.yml', 'utf8');
const script = workflow
  .split('        run: |\n')[1]
  .split('\n      - name:')[0]
  .split('\n')
  .map((l) => (l.startsWith('          ') ? l.slice(10) : l))
  .join('\n');
const payload = JSON.stringify({
  status: 'ok',
  cached: false,
  checks: [{ id: 'test.products', status: 'ok', message: '1 item' }],
});
function execute(curl: string, stale = false, retryPayload?: string) {
  const dir = mkdtempSync(join(tmpdir(), 'health-runner-'));
  dirs.push(dir);
  mkdirSync(join(dir, 'bin'));
  mkdirSync(join(dir, 'scripts/ops'), { recursive: true });
  copyFileSync('scripts/ops/health-check-retry.ts', join(dir, 'scripts/ops/health-check-retry.ts'));
  writeFileSync(join(dir, 'bin/curl'), '#!/bin/bash\n' + curl, { mode: 0o700 });
  writeFileSync(join(dir, 'bin/sleep'), '#!/bin/bash\nexit 0\n', { mode: 0o700 });
  if (retryPayload) {
    writeFileSync(join(dir, 'retry-response.json'), retryPayload);
    writeFileSync(join(dir, 'retry-fetch.mjs'), `import fs from 'node:fs';
      const timer = globalThis.setTimeout;
      globalThis.setTimeout = (fn, ms, ...args) => timer(fn, ms === 2000 ? 0 : ms, ...args);
      globalThis.fetch = async (url) => { fs.appendFileSync('retry-calls.txt', String(url) + '\\n'); return Response.json(JSON.parse(fs.readFileSync('retry-response.json', 'utf8'))); };`);
  }
  if (stale) writeFileSync(join(dir, 'health-checks.json'), payload);
  const result = spawnSync('/bin/bash', ['-e', '-c', script], {
    cwd: dir,
    encoding: 'utf8',
    env: {
      ...process.env,
      ...(retryPayload ? { NODE_OPTIONS: '--import=' + join(dir, 'retry-fetch.mjs') } : {}),
      PATH: join(dir, 'bin') + ':' + process.env.PATH,
      HEALTH_CHECK_SECRET: 'test-only',
      HEALTH_CHECK_URL: 'https://test.invalid',
      GITHUB_EVENT_NAME: 'schedule',
      HEALTH_CHECK_SCHEDULE: 'quick',
      GITHUB_STEP_SUMMARY: join(dir, 'summary'),
      GITHUB_SERVER_URL: 'https://github.com',
      GITHUB_REPOSITORY: 'owner/repo',
      GITHUB_RUN_ID: '1',
    },
    timeout: 5000,
  });
  return { dir, result };
}
afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});
describe('실제 Health workflow shell', () => {
  it('선택 검사가 skipped인 정상 결과를 허용한다', () => {
    const body = JSON.stringify({
      status: 'ok',
      checks: [{ id: 'optional', status: 'skipped', message: 'empty' }],
    });
    const { result } = execute(`printf '%s' '${body}' > health-checks.json`);
    expect(result.status, result.stderr).toBe(0);
  });
  it('curl실패시 예전 성공파일을 재사용하지 않는다', () => {
    const { result } = execute('exit 7', true);
    expect(result.status).not.toBe(0);
  });
  it.each([
    '{}',
    'null',
    'broken',
    JSON.stringify({ status: 'ok', checks: [] }),
    JSON.stringify({ status: 'ok', checks: [{ id: 'x', status: 'fail', message: 'failed' }] }),
    JSON.stringify({
      status: 'ok',
      checks: [
        { id: 'x', status: 'ok', message: 'ok' },
        { id: 'x', status: 'ok', message: 'ok' },
      ],
    }),
  ])('잘못된 응답을 실패로 처리한다: %s', (body) => {
    const { dir, result } = execute(`printf '%s' '${body}' > health-checks.json`);
    expect(result.status).not.toBe(0);
    expect(readFileSync(join(dir, 'health-check-summary.txt'), 'utf8')).toContain('invalid');
  });
  it('fresh 실패 원본을 보존하고 전체 검사를 즉시 반복하지 않는다', () => {
    const { dir, result } = execute(
      `printf '%s\\n' "$@" >> calls.txt\nif ! [[ "$*" == *fresh=true* && "$*" == *"x-health-check-force-fresh: true"* ]]; then exit 22; fi\nif [ ! -e first ]; then touch first; printf '%s' '${payload.replace('"status":"ok"', '"status":"fail"').replace('"status":"ok"', '"status":"fail"')}' > health-checks.json; else printf '%s' '${payload}' > health-checks.json; fi`,
    );
    expect(result.status, result.stderr + result.stdout).toBe(1);
    expect(readFileSync(join(dir, 'health-checks-attempt-1.json'), 'utf8')).toContain('fail');
    expect(existsSync(join(dir, 'health-checks-attempt-2.json'))).toBe(false);
    expect(readFileSync(join(dir, 'calls.txt'), 'utf8')).not.toContain('cacheBust=true');
  });
});

it.each([false, true])('워크플로가 최초 실패를 보존하고 정확한 분당 재검사 결과를 집계한다: unrelatedFail=%s', unrelatedFail => {
  const limited = { id: 'cu.stores', status: 'fail', message: 'minute limited', httpStatus: 429, upstreamStatus: 429, errorCode: 'CONVENIENCE_RELAY_FAILED', quotaReason: 'minute', retryAfter: 1 };
  const original = JSON.stringify({ status: 'fail', checks: [limited, { id: 'other', status: unrelatedFail ? 'fail' : 'ok', message: 'original result' }] });
  const retry = JSON.stringify({ status: 'ok', cached: false, checks: [{ id: 'cu.stores', status: 'ok', message: 'verified' }] });
  const { dir, result } = execute(`printf '%s' '${original}' > health-checks.json`, false, retry);
  expect(result.status, result.stderr).toBe(unrelatedFail ? 1 : 0);
  expect(JSON.parse(readFileSync(join(dir, 'health-checks-attempt-1.json'), 'utf8')).checks[0].status).toBe('fail');
  expect(readFileSync(join(dir, 'health-check-summary-first.txt'), 'utf8')).toContain('minute limited');
  expect(readFileSync(join(dir, 'health-check-summary.txt'), 'utf8')).toContain('retryCount=1');
  expect(readFileSync(join(dir, 'health-check-summary.txt'), 'utf8')).toContain('firstFailedIds=cu.stores');
  expect(existsSync(join(dir, 'health-checks-recheck-cu.stores.json'))).toBe(true);
  expect(readFileSync(join(dir, 'retry-calls.txt'), 'utf8')).toContain('check=cu.stores');
  expect(JSON.parse(readFileSync(join(dir, 'health-checks.json'), 'utf8')).checks[1].message).toBe('original result');
});

it('선택적 인기 검색어의 공식 200 빈 응답은 최초 제한 기록을 남기고 통과한다', () => {
  const original = JSON.stringify({ status: 'fail', checks: [{ id: 'seveneleven.popwords', status: 'fail', message: 'minute limited', httpStatus: 429, upstreamStatus: 429, errorCode: 'CONVENIENCE_RELAY_FAILED', quotaReason: 'minute', retryAfter: 1 }] });
  const retry = JSON.stringify({ status: 'ok', cached: false, checks: [{ id: 'seveneleven.popwords', status: 'skipped', message: 'optional data unavailable', httpStatus: 200 }] });
  const { dir, result } = execute(`printf '%s' '${original}' > health-checks.json`, false, retry);
  expect(result.status, result.stderr).toBe(0);
  expect(readFileSync(join(dir, 'health-checks-attempt-1.json'), 'utf8')).toContain('minute limited');
  expect(readFileSync(join(dir, 'health-check-summary.txt'), 'utf8')).toContain('firstFailedIds=seveneleven.popwords');
  expect(JSON.parse(readFileSync(join(dir, 'health-checks.json'), 'utf8')).checks[0].status).toBe('skipped');
});
