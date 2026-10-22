import { readFileSync } from 'node:fs';
import { expect, it } from 'vitest';
import { buildAgentStartText } from '../../src/pages/agentStart.js';
import { buildDiscoveryAssets } from '../../src/pages/discovery.js';
import { generatePromptText } from '../../src/pages/prompt.js';
it('모든 진입 문서의 웹 조회 링크는 browse이며 포맷 선택을 요구하지 않는다', () => {
  const assets = buildDiscoveryAssets({ services: [], tools: [] });
  const docs = [
    'README.md',
    'docs/service-reference.md',
    'docs/client-guide.md',
    'docs/web-discovery.md',
    'docs/ai-instruction.md',
    'skills/daiso-cli/SKILL.md',
  ].map((p) => readFileSync(new URL('../../' + p, import.meta.url), 'utf8'));
  for (const text of [
    ...docs,
    assets['discovery.html'],
    assets['llms.txt'],
    generatePromptText('https://mcp.aka.page'),
  ]) {
    expect(text).toContain('/browse/');
    const queryLinks =
      text.match(
        /(?:https?:\/\/[^\s)"<>]+)?\/api\/[^\s)"<>]*[?&](?:format=html|[^\s)"<>]*&format=html)[^\s)"<>]*/g,
      ) ?? [];
    expect(queryLinks).toEqual([]);
  }
  expect(buildAgentStartText('https://mcp.aka.page')).toContain('쿼리 문자열은 필요 없습니다');
});
it('전체 서비스 상세 안내의 모든 웹 실행 URL이 쿼리 없는 경로다', () => {
  const prompt = generatePromptText('https://guide.example');
  const urls = prompt.match(/https:\/\/guide\.example\/browse\/[^\s]+/g)!;
  expect(urls.length).toBeGreaterThan(30);
  for (const url of urls) expect(url).not.toContain('?');
});
it('완전한 웹 예시 URL은 공백 없이 열리고 등록된 조회로 해석된다', async () => {
  const { browseApiUrl } = await import('../../src/pages/browsePaths.js');
  const lines = generatePromptText('https://guide.example').split('\n');
  for (const line of lines) {
    const url = line.match(/https:\/\/guide\.example\/browse\/.*$/)?.[0];
    if (!url) continue;
    expect(url).not.toMatch(/\s/);
    expect(browseApiUrl(new URL(url))).not.toBeNull();
  }
});
