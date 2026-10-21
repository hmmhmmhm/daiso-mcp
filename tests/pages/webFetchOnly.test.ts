import { readFileSync } from 'node:fs';
import { expect, it } from 'vitest';
import { buildDiscoveryAssets } from '../../src/pages/discovery.js';
import { generatePromptText } from '../../src/pages/prompt.js';

it('에이전트 진입 문서에 셸 호출 예제 없이 WebFetch HTML 조회를 안내한다', () => {
  const assets=buildDiscoveryAssets({services:[],tools:[]});
  const docs=['README.md','docs/service-reference.md','docs/client-guide.md','docs/web-discovery.md','docs/ai-instruction.md','skills/daiso-cli/SKILL.md'].map(p=>readFileSync(new URL('../../'+p,import.meta.url),'utf8'));
  for(const text of [...docs,assets['discovery.html'],assets['llms.txt'],generatePromptText('https://example.com')]) {
    expect(text).not.toMatch(/\bcurl\b|--data(?:-binary)?|외부 통신 가능한 셸|셸 전용/);
    expect(text).toContain('WebFetch');
    expect(text).toContain('format=html');
  }
  expect(docs[1].indexOf('WebFetch')).toBeLessThan(docs[1].indexOf('### MCP 표준 응답 모델'));
});
