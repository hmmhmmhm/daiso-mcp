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
  });

  it('external smoke workflow는 수동 및 야간 실행으로 CLI smoke를 수행한다', () => {
    const workflow = readText('.github/workflows/external-smoke.yml');

    expect(workflow).toContain('workflow_dispatch:');
    expect(workflow).toContain("cron: '40 15 * * *'");
    expect(workflow).toContain("node-version: '20'");
    expect(workflow).toContain('npm run cli:smoke');
    expect(workflow).toContain('npm run mcp:smoke');
    expect(workflow).toContain('Notify smoke failure');
    expect(workflow).toContain('MOSHI_WEBHOOK_TOKEN');
    expect(workflow).toContain('if: failure()');
  });

  it('health check workflow는 서비스별 실패 요약을 Moshi로 알린다', () => {
    const workflow = readText('.github/workflows/health-checks.yml');

    expect(workflow).toContain('workflow_dispatch:');
    expect(workflow).toContain("cron: '10 */3 * * *'");
    expect(workflow).toContain('HEALTH_CHECK_SECRET');
    expect(workflow).toContain('MOSHI_WEBHOOK_TOKEN');
    expect(workflow).toContain('/api/health/checks?mode=quick&fresh=true&includeSamples=true');
    expect(workflow).toContain('failedChecks');
    expect(workflow).toContain('degradedChecks');
    expect(workflow).toContain('Health Checks Failed');
  });

  it('스크립트 분류 문서는 운영/리서치 스크립트 경계를 설명한다', () => {
    const readme = readText('scripts/README.md');

    expect(readme).toContain('운영 스크립트');
    expect(readme).toContain('리서치 스크립트');
    expect(readme).toContain('mcp-smoke.ts');
    expect(readme).toContain('gs25-');
    expect(readme).toContain('frida/');
  });
});
