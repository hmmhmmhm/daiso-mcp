import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { COMPACT_CATALOG } from '../../src/core/compact/catalog.js';
import { buildAgentStartText } from '../../src/pages/agentStart.js';
import { buildDiscoveryAssets } from '../../src/pages/discovery.js';
import { generatePromptText } from '../../src/pages/prompt.js';

const read = (path: string) => readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8');

describe('무설치 경로 선택 회귀', () => {
  it('셸이 있어도 연결된 MCP 다음에는 HTML GET을 선택한다', () => {
    const assets = buildDiscoveryAssets({ services: [], tools: [] });
    for (const text of [buildAgentStartText('https://example.com'), assets['discovery.html'], read('README.md'), read('docs/ai-instruction.md'), read('skills/daiso-cli/SKILL.md')]) {
      const mcp = text.indexOf('1. 연결된 MCP 도구');
      const web = text.indexOf('2. 웹 읽기');
      const shell = text.indexOf('3. 위 두 수단이 없을 때만');
      expect(mcp).toBeGreaterThanOrEqual(0);
      expect(web).toBeGreaterThan(mcp);
      expect(shell).toBeGreaterThan(web);
      expect(text).toContain('셸이 있어도');
      expect(text).toContain('DNS');
      expect(text).toContain('실행하지 않은');
    }
  });

  it('실행 안내는 deprecated MCP 이름을 새 호출로 권하지 않는다', () => {
    for (const text of [buildAgentStartText('https://example.com'), generatePromptText('https://example.com'), read('docs/ai-instruction.md'), read('skills/daiso-cli/SKILL.md')]) {
      for (const group of COMPACT_CATALOG) {
        for (const route of group.routes) {
          if (route.legacy !== group.name) expect(text).not.toContain(route.legacy);
        }
      }
    }
    expect(read('docs/client-guide.md')).not.toContain('daiso_search_products');
    expect(read('docs/service-reference.md')).toContain('deprecated 별칭');
  });

  it('모든 진입 안내에서 해당 응답의 이미지와 실제 실행 근거만 사용한다', () => {
    const assets = buildDiscoveryAssets({ services: [], tools: [] });
    for (const text of [assets['discovery.html'], buildAgentStartText('https://example.com'), generatePromptText('https://example.com'), read('README.md'), read('docs/ai-instruction.md'), read('skills/daiso-cli/SKILL.md'), read('docs/gpts-maintenance.md')]) {
      expect(text).toContain('imageUrl');
      expect(text).toContain('웹 검색 이미지');
      expect(text).toContain('대체하지');
    }
  });
});
