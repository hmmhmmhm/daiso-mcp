/**
 * 저장소 운영 설정 회귀 테스트
 */

import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

function readText(path: string): string {
  return readFileSync(path, 'utf8');
}

describe('repository maintenance configuration', () => {
  it('Node 엔진 범위는 현재 LTS 이상을 허용한다', () => {
    const pkg = JSON.parse(readText('package.json')) as { engines?: { node?: string } };

    expect(pkg.engines?.node).toBe('>=20');
  });

  it('npm audit 경고가 난 ws 전이 의존성은 안전 버전으로 고정한다', () => {
    const pkg = JSON.parse(readText('package.json')) as { overrides?: Record<string, string> };

    expect(pkg.overrides?.ws).toBe('8.20.1');
  });

  it('release 문서는 git 기록을 npm publish보다 먼저 남기도록 안내한다', () => {
    const agents = readText('AGENTS.md');

    expect(agents).toContain('릴리스 절차');
    expect(agents).toContain('npm version');
    expect(agents).toContain('git push origin main --follow-tags');
    expect(agents.indexOf('git push origin main --follow-tags')).toBeLessThan(agents.indexOf('npm publish'));
  });

  it('운영 메모는 repo 내부 문서에 포함된다', () => {
    const agents = readText('AGENTS.md');

    expect(agents).toContain('운영 메모');
    expect(agents).toContain('open PR');
    expect(agents).toContain('450줄');
    expect(agents).toContain('npm `daiso`');
    expect(agents).toContain('수정 전 커밋의 과거 실패');
  });

  it('external smoke workflow는 수동 및 야간 실행으로 CLI smoke를 수행한다', () => {
    const workflow = readText('.github/workflows/external-smoke.yml');

    expect(workflow).toContain('workflow_dispatch:');
    expect(workflow).toContain("cron: '40 15 * * *'");
    expect(workflow).toContain('group: external-smoke-${{ github.ref }}-${{ matrix.suite }}-${{ matrix.service }}');
    expect(workflow).toContain('fail-fast: false');
    expect(workflow).toContain('max-parallel: 4');
    expect(workflow).toContain('service: daiso');
    expect(workflow).toContain('service: oliveyoung');
    expect(workflow).toContain('service: opinet');
    expect(workflow).toContain('suite: mcp');
    expect(workflow).toContain("node-version: '24'");
    expect(workflow).toContain('npm run cli:smoke -- --service "${SMOKE_SERVICE}"');
    expect(workflow).toContain('npm run mcp:smoke -- --service "${SMOKE_SERVICE}"');
    expect(workflow).toContain('CLI smoke failed; retrying after 15 seconds');
    expect(workflow).toContain('MCP smoke failed; retrying after 15 seconds');
    expect(workflow).toContain('external-smoke-summary.txt');
    expect(workflow).toContain('failure=');
    expect(workflow).toContain('SUMMARY="$(cat external-smoke-summary.txt');
    expect(workflow).toContain('Notify smoke failure');
    expect(workflow).toContain('MOSHI_WEBHOOK_TOKEN');
    expect(workflow).toContain('if: failure()');
  });

  it('deploy workflow는 배포 때마다 Worker secret을 다시 쓰지 않는다', () => {
    const workflow = readText('.github/workflows/deploy.yml');

    expect(workflow).not.toContain('wrangler secret put');
    expect(workflow).toContain('npx wrangler deploy');
  });

  it('worker secret sync workflow는 수동 실행으로만 configured secret을 동기화한다', () => {
    const workflow = readText('.github/workflows/sync-worker-secrets.yml');

    expect(workflow).toContain('workflow_dispatch:');
    expect(workflow).toContain('put_secret_if_set');
    expect(workflow).toContain('ZYTE_API_KEY');
    expect(workflow).toContain('GOOGLE_MAPS_API_KEY');
    expect(workflow).toContain('NAVER_CLIENT_ID');
    expect(workflow).toContain('NAVER_CLIENT_SECRET');
    expect(workflow).toContain('OPINET_API_KEY');
    expect(workflow).toContain('HEALTH_CHECK_SECRET');
    expect(workflow).toContain('SUPABASE_URL');
    expect(workflow).toContain('SUPABASE_SERVICE_ROLE_KEY');
  });

  it('workers chart workflow는 최신 main 기준으로 자동 커밋을 푸시한다', () => {
    const workflow = readText('.github/workflows/workers-invocations-chart.yml');

    expect(workflow).toContain('workflow_dispatch:');
    expect(workflow).toContain("cron: '20 15 * * *'");
    expect(workflow).toContain('group: workers-invocations-chart-${{ github.ref }}');
    expect(workflow).toContain('git pull --ff-only origin main');
    expect(workflow).toContain('npm run update:workers-chart');
    expect(workflow).toContain('WORKERS_CHART_CONCURRENCY');
    expect(workflow).toContain('CLOUDFLARE_EMAIL');
    expect(workflow).toContain('CLOUDFLARE_GLOBAL_API_KEY');
    expect(workflow).toContain('CLOUDFLARE_ZONE_ID');
    expect(workflow).toContain('WORKERS_CHART_ROOT_REDIRECT_START');
    expect(workflow).toContain('git add README.md assets/analytics/workers-invocations.json assets/analytics/workers-invocations.png');
    expect(workflow).toContain('git pull --rebase --autostash origin main');
    expect(workflow).toContain('git push origin HEAD:main');
  });

  it('health check workflow는 서비스별 실패 요약을 Moshi로 알린다', () => {
    const workflow = readText('.github/workflows/health-checks.yml');

    expect(workflow).toContain('workflow_dispatch:');
    expect(workflow).toContain("cron: '10 0,3,6,9,12,18,21 * * *'");
    expect(workflow).toContain("cron: '10 15 * * *'");
    expect(workflow).toContain('group: health-checks-${{ github.ref }}');
    expect(workflow).toContain('HEALTH_CHECK_SECRET');
    expect(workflow).toContain('HEALTH_CHECK_SCHEDULE');
    expect(workflow).toContain('MOSHI_WEBHOOK_TOKEN');
    expect(workflow).toContain(
      '/api/health/checks?mode=full&fresh=true&includeSamples=true&timeoutMs=20000&slowThresholdMs=9000',
    );
    expect(workflow).toContain('/api/health/checks?mode=quick&timeoutMs=5000&slowThresholdMs=3000');
    expect(workflow).toContain('HEALTH_CHECK_FORCE_FRESH="true"');
    expect(workflow).toContain('HEALTH_CHECK_FORCE_FRESH="false"');
    expect(workflow).toContain('x-health-check-force-fresh: ${HEALTH_CHECK_FORCE_FRESH}');
    expect(workflow).toContain('failedChecks');
    expect(workflow).toContain('degradedChecks');
    expect(workflow).toContain('GITHUB_SERVER_URL');
    expect(workflow).toContain('GITHUB_RUN_ID');
    expect(workflow).toContain('failed=');
    expect(workflow).toContain('degraded=');
    expect(workflow).toContain('run=');
    expect(workflow).toContain('Health check failed on attempt 1; retrying once');
    expect(workflow).toContain('console.log(summary)');
    expect(workflow).toContain("payload.status === 'fail'");
    expect(workflow).toContain('Health Checks Failed');
  });

  it('차트 자동 커밋은 불필요한 push workflow를 다시 실행하지 않는다', () => {
    const ci = readText('.github/workflows/ci.yml');
    const coverage = readText('.github/workflows/coverage.yml');
    const deploy = readText('.github/workflows/deploy.yml');
    const codeql = readText('.github/workflows/codeql.yml');

    for (const workflow of [ci, coverage, deploy, codeql]) {
      expect(workflow).toContain('paths-ignore:');
      expect(workflow).toContain("'README.md'");
      expect(workflow).toContain("'assets/analytics/**'");
    }
  });

  it('운영 스크립트는 ops 디렉터리로 분리되어 있다', () => {
    const pkg = JSON.parse(readText('package.json')) as { scripts: Record<string, string> };
    const readme = readText('scripts/README.md');
    const opsReadme = readText('scripts/ops/README.md');
    const researchReadme = readText('scripts/research/README.md');

    expect(pkg.scripts['mcp:smoke']).toContain('scripts/ops/mcp-smoke.ts');
    expect(pkg.scripts['cli:smoke']).toContain('scripts/ops/cli-smoke.ts');
    expect(pkg.scripts['build:openapi']).toContain('scripts/ops/generate-openapi.ts');
    expect(readme).toContain('scripts/ops');
    expect(readme).toContain('scripts/research');
    expect(opsReadme).toContain('mcp-smoke.ts');
    expect(researchReadme).toContain('gs25');
  });

  it('스크립트 분류 문서는 운영/리서치 스크립트 경계를 설명한다', () => {
    const readme = readText('scripts/README.md');

    expect(readme).toContain('운영 스크립트');
    expect(readme).toContain('리서치 스크립트');
    expect(readme).toContain('ops/mcp-smoke.ts');
    expect(readme).toContain('gs25-');
    expect(readme).toContain('frida/');
  });

  it('README는 MCP standard 모델 사용법을 설명한다', () => {
    const readme = readText('README.md');

    expect(readme).toContain('standard.products');
    expect(readme).toContain('standard.stores');
    expect(readme).toContain('standard.theaters');
  });

  it('README는 프로젝트를 MCP 및 Skill로 설명한다', () => {
    const readme = readText('README.md');

    expect(readme).toContain('Daiso MCP 및 Skill');
    expect(readme).toContain('skills/daiso-cli/SKILL.md');
    expect(readme).toContain('npx daiso');
  });

  it('daiso CLI 스킬은 에이전트가 CLI와 MCP를 함께 사용할 수 있게 안내한다', () => {
    const skill = readText('skills/daiso-cli/SKILL.md');
    const commandMap = readText('skills/daiso-cli/references/cli-command-map.md');

    expect(skill).toContain('name: daiso-cli');
    expect(skill).toContain('description:');
    expect(skill).toContain('version: 1.0.6');
    expect(skill).toContain('metadata:');
    expect(skill).toContain('openclaw:');
    expect(skill).toContain('requires:');
    expect(skill).toContain('bins:');
    expect(skill).toContain('- npx');
    expect(skill).toContain('install:');
    expect(skill).toContain('package: daiso');
    expect(skill).toContain('homepage: https://github.com/hmmhmmhm/daiso-mcp');
    expect(skill).toContain('npx daiso');
    expect(skill).toContain('--json');
    expect(skill).toContain('https://mcp.aka.page');
    expect(skill).toContain('CLI를 우선 사용');
    expect(skill).toContain('다이소');
    expect(skill).toContain('편의점');
    expect(skill).toContain('올리브영');
    expect(skill).toContain('references/cli-command-map.md');
    expect(skill).toContain('Multi-step Korean request patterns');
    expect(skill).toContain('위치가 없으면');
    expect(skill).toContain('today in KST');
    expect(skill).toContain('npx 또는 Node.js를 사용할 수 없으면');
    expect(commandMap).toContain('gs25-products');
    expect(commandMap).toContain('seveneleven-products');
    expect(commandMap).toContain('cgv-movies');
    expect(commandMap).toContain('<YYYYMMDD>');
    expect(commandMap).toContain('quoted Korean strings');
    expect(commandMap).toContain('theaterId');
    expect(commandMap).toContain('movieId');
    expect(commandMap).not.toContain('/api/megabox/seats --theaterCode');
    expect(commandMap).not.toContain('/api/lottecinema/seats --theaterCode');
  });
});
