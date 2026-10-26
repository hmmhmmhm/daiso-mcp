import { readFileSync } from 'node:fs';
import { Hono } from 'hono';
import { expect, it, vi } from 'vitest';
import { apiResultHtml } from '../../src/pages/apiResult.js';
import { buildDiscoveryAssets } from '../../src/pages/discovery.js';
import { buildAgentStartText } from '../../src/pages/agentStart.js';
import { generatePromptText } from '../../src/pages/prompt.js';

it('모든 진입 안내는 MCP 다음 실제 브라우저를 선택하고 웹 읽기의 오래된 결과를 구분한다', () => {
  const assets = buildDiscoveryAssets({ services: [], tools: [] });
  const docs = [
    'README.md',
    'docs/ai-instruction.md',
    'docs/client-guide.md',
    'docs/service-reference.md',
    'docs/web-discovery.md',
    'skills/daiso-cli/SKILL.md',
  ].map((p) => readFileSync(p, 'utf8'));
  for (const text of [
    ...docs,
    assets['discovery.html'],
    assets['llms.txt'],
    buildAgentStartText('https://example.com'),
    generatePromptText('https://example.com'),
  ]) {
    expect(text).toContain('브라우저');
    expect(text).toContain('Crawled');
    expect(text).toContain('현재 재고');
  }
});

it('HTML의 응답 생성 시각을 표시하면서 원본 갱신 시각이나 JSON 계약으로 혼동하지 않는다', async () => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-10-26T09:20:00.000Z'));
  try {
    const app = new Hono();
    app.use('/api/*', apiResultHtml);
    const payload = { success: true, data: { quantity: 2 } };
    app.get('/api/test', (c) => c.json(payload));
    const response = await app.request('/api/test?format=html');
    expect(response.headers.get('Cache-Control')).toBe('no-store');
    const html = await response.text();
    expect(html).toContain('<time datetime="2026-10-26T09:20:00.000Z">');
    expect(html).toContain('응답 생성 시각');
    expect(html).toContain('원본 재고 갱신 시각');
    expect(await (await app.request('/api/test')).json()).toEqual(payload);
  } finally {
    vi.useRealTimers();
  }
});
