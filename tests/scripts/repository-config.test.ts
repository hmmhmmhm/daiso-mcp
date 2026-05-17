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
  });
});
