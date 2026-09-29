import { mkdtempSync, writeFileSync, mkdirSync, rmSync, readFileSync } from 'node:fs';
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
function execute(curl: string, stale = false) {
  const dir = mkdtempSync(join(tmpdir(), 'health-runner-'));
  dirs.push(dir);
  mkdirSync(join(dir, 'bin'));
  writeFileSync(join(dir, 'bin/curl'), '#!/bin/bash\n' + curl, { mode: 0o700 });
  writeFileSync(join(dir, 'bin/sleep'), '#!/bin/bash\nexit 0\n', { mode: 0o700 });
  if (stale) writeFileSync(join(dir, 'health-checks.json'), payload);
  const result = spawnSync('/bin/bash', ['-e', '-c', script], {
    cwd: dir,
    encoding: 'utf8',
    env: {
      ...process.env,
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
  it('매 요청을 fresh로 검사하고 재시도 원본을 보존한다', () => {
    const { dir, result } = execute(
      `printf '%s\\n' "$@" >> calls.txt\nif ! [[ "$*" == *fresh=true* && "$*" == *"x-health-check-force-fresh: true"* ]]; then exit 22; fi\nif [ ! -e first ]; then touch first; printf '%s' '${payload.replace('"status":"ok"', '"status":"fail"').replace('"status":"ok"', '"status":"fail"')}' > health-checks.json; else printf '%s' '${payload}' > health-checks.json; fi`,
    );
    expect(result.status, result.stderr + result.stdout).toBe(0);
    expect(readFileSync(join(dir, 'health-checks-attempt-1.json'), 'utf8')).toContain('fail');
    expect(readFileSync(join(dir, 'health-checks-attempt-2.json'), 'utf8')).toContain('ok');
    expect(readFileSync(join(dir, 'calls.txt'), 'utf8')).toContain('cacheBust=true');
  });
});
