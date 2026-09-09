import { execFileSync } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';
import { formatKstDate, parseKstDateText } from '../../scripts/ops/workers-chart-helpers.ts';

const temporaryRoots: string[] = [];
afterEach(async () => {
  await Promise.all(temporaryRoots.map((root) => fs.rm(root, { recursive: true, force: true })));
  temporaryRoots.length = 0;
});
async function fixture() {
  const root = await fs.mkdtemp(path.join(process.cwd(), '.chart-test-'));
  temporaryRoots.push(root);
  await fs.mkdir(path.join(root, 'scripts/ops'), { recursive: true });
  await fs.mkdir(path.join(root, 'assets/analytics'), { recursive: true });
  for (const name of [
    'workers-chart-data.ts',
    'workers-chart-helpers.ts',
    'update-workers-invocations-chart.ts',
  ]) {
    await fs.copyFile(path.join('scripts/ops', name), path.join(root, 'scripts/ops', name));
  }
  await fs.writeFile(path.join(root, 'README.md'), '# Test\n');
  const date = formatKstDate(
    new Date(parseKstDateText(formatKstDate(new Date())).getTime() - 86400000),
  );
  const payload = {
    accountId: 'account',
    scriptName: 'daiso-mcp',
    metric: 'workersInvocationsAdaptive.requests + httpRequestsAdaptiveGroups.count',
    aggregation: 'script-level plus redirected root GET',
    includedTraffic: 'complete test traffic',
    timezone: 'Asia/Seoul',
    coverageVersion: 1,
    rootRedirect: {
      zoneId: 'zone',
      host: 'mcp.aka.page',
      path: '/',
      start: '2026-05-27T07:24:50.000Z',
      rootRequestsRetentionDays: 1,
    },
    updatedAt: new Date().toISOString(),
    startDate: date,
    endDate: date,
    points: [{ date, requests: 1234 }],
  };
  const dataPath = path.join(root, 'assets/analytics/workers-invocations.json');
  await fs.writeFile(dataPath, JSON.stringify(payload));
  await fs.writeFile(
    path.join(root, 'no-network.mjs'),
    'globalThis.fetch = () => { throw new Error("Unexpected network request"); };',
  );
  return { root, payload, dataPath };
}
function run(root: string, overrides: Record<string, string>) {
  const env = { ...process.env };
  for (const key of Object.keys(env))
    if (
      key.startsWith('CLOUDFLARE_') ||
      key.startsWith('WORKERS_CHART_') ||
      key === 'CF_WORKER_SCRIPT_NAME'
    )
      delete env[key];
  execFileSync(
    process.execPath,
    [
      '--import',
      pathToFileURL(path.join(root, 'no-network.mjs')).href,
      path.join(root, 'scripts/ops/update-workers-invocations-chart.ts'),
    ],
    { env: { ...env, ...overrides }, stdio: 'pipe' },
  );
}
describe('workers chart entrypoint', () => {
  it('불완전한 기록이면 오류로 종료하고 기존 산출물을 보존한다', async () => {
    const { root, payload, dataPath } = await fixture();
    const incomplete = {
      ...payload,
      coverageVersion: undefined,
      updatedAt: '2026-05-01T00:00:00Z',
    };
    const original = JSON.stringify(incomplete);
    await fs.writeFile(dataPath, original);
    expect(() =>
      run(root, {
        CLOUDFLARE_ACCOUNT_ID: 'account',
        CLOUDFLARE_API_TOKEN: 'token',
        CLOUDFLARE_ZONE_ID: 'zone',
        WORKERS_CHART_DAYS: '1',
        WORKERS_CHART_ROOT_REQUESTS_RETENTION_DAYS: '1',
        WORKERS_CHART_ROOT_REDIRECT_START: payload.rootRedirect.start,
      }),
    ).toThrow('Incomplete daily traffic');
    expect(await fs.readFile(dataPath, 'utf8')).toBe(original);
    expect(await fs.readFile(path.join(root, 'README.md'), 'utf8')).toBe('# Test\n');
  });
  it('실시간 실행에서 저장된 완전한 날짜를 읽고 보존한다', async () => {
    const { root, payload, dataPath } = await fixture();
    run(root, {
      CLOUDFLARE_ACCOUNT_ID: 'account',
      CLOUDFLARE_API_TOKEN: 'token',
      CLOUDFLARE_ZONE_ID: 'zone',
      WORKERS_CHART_DAYS: '1',
      WORKERS_CHART_ROOT_REQUESTS_RETENTION_DAYS: '1',
      WORKERS_CHART_ROOT_REDIRECT_START: payload.rootRedirect.start,
    });
    const output = JSON.parse(await fs.readFile(dataPath, 'utf8'));
    expect(output.points).toEqual(payload.points);
    expect(output.coverageVersion).toBe(1);
    expect(output.accountId).toBe('account');
  });
  it('오프라인 렌더링은 인증 없이 원본 출처와 완전성 정보를 유지한다', async () => {
    const { root, payload, dataPath } = await fixture();
    run(root, { WORKERS_CHART_INPUT_JSON: dataPath });
    const output = JSON.parse(await fs.readFile(dataPath, 'utf8'));
    expect(output).toMatchObject(payload);
    expect(
      (await fs.stat(path.join(root, 'assets/analytics/workers-invocations.png'))).size,
    ).toBeGreaterThan(0);
  });
  it('CRLF 문서에서도 기존 차트 위치와 앞뒤 내용을 보존한다', async () => {
    const { root, dataPath } = await fixture();
    await fs.writeFile(
      path.join(root, 'README.md'),
      '# Header\r\n\r\n<!-- WORKERS_INVOCATIONS_CHART:START -->\r\nold\r\n<!-- WORKERS_INVOCATIONS_CHART:END -->\r\n\r\n## Footer\r\n',
    );
    run(root, { WORKERS_CHART_INPUT_JSON: dataPath });
    const readme = await fs.readFile(path.join(root, 'README.md'), 'utf8');
    expect(readme.startsWith('# Header\n\n')).toBe(true);
    expect(readme.endsWith('\n\n## Footer\n')).toBe(true);
    expect(readme).toContain('Worker 실행 + 루트 GET 리디렉션 요청');
  });
});
