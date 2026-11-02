import { readFileSync } from 'node:fs';
import { expect, it } from 'vitest';
import { buildDiscoveryAssets } from '../../src/pages/discovery.js';
import { WEB_READ_RULE } from '../../src/pages/agentStart.js';

it('공식 첫 화면은 연결 설정과 복구 규칙보다 웹 실행 입구를 먼저 제공한다', () => {
  const html = buildDiscoveryAssets({ services: [], tools: [] })['discovery.html'];
  const section = html.match(/<section id="web-start">([\s\S]*?)<\/section>/)?.[0];
  expect(section).toBeDefined();
  expect(section).toContain('href="/browse/quick"');
  expect(html.indexOf(section!)).toBeLessThan(html.indexOf(WEB_READ_RULE));
  expect(html.indexOf(section!)).toBeLessThan(html.indexOf('Streamable HTTP'));
});

it('접힌 AI 안내 밖의 첫 시작 선택지는 웹 조회이며 기존 이미지와 안내는 보존한다', () => {
  const readme = readFileSync('README.md', 'utf8');
  expect(readme).toMatch(/^<details>\n<summary>AI 에이전트 사용 안내<\/summary>/);
  const visible = readme.slice(readme.indexOf('</details>') + '</details>'.length);
  const first = [...visible.matchAll(/\*\*\[([^\]]+)\]\(([^)]+)\)/g)][0];
  expect(first?.[1]).toBe('ChatGPT에서 바로 조회');
  expect(first?.[2]).toBe('https://mcp.aka.page/browse/quick');
  expect(visible).toContain('assets/daiso-mcp-services.png');
  expect(visible).toContain('#원격-mcp로-바로-시작하기');
});
