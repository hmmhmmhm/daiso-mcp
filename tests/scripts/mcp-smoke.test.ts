/**
 * MCP smoke 스크립트 테스트
 */
import { describe, expect, it, vi } from 'vitest';
import { MCP_SMOKE_SCENARIOS, MCP_SMOKE_TOOL_NAMES, runMcpSmoke } from '../../scripts/mcp-smoke.js';

describe('runMcpSmoke', () => {
  it('상품명 기반 재고 도구를 필수 smoke 대상으로 포함한다', () => {
    expect(MCP_SMOKE_TOOL_NAMES).toContain('daiso_find_inventory_by_name');
    expect(MCP_SMOKE_TOOL_NAMES).toContain('gs25_search_products');
    expect(MCP_SMOKE_TOOL_NAMES).toContain('seveneleven_search_products');
    expect(MCP_SMOKE_TOOL_NAMES).toContain('emart24_search_products');
  });

  it('대표 호출 시나리오는 다이소/편의점 도구를 모두 포함한다', () => {
    expect(MCP_SMOKE_SCENARIOS.map((scenario) => scenario.toolName)).toEqual([
      'daiso_find_inventory_by_name',
      'gs25_search_products',
      'seveneleven_search_products',
      'emart24_search_products',
    ]);
  });

  it('MCP 클라이언트로 도구 목록과 대표 도구 호출을 검증한다', async () => {
    const close = vi.fn();
    const listTools = vi.fn().mockResolvedValue({
      tools: MCP_SMOKE_TOOL_NAMES.map((name) => ({ name })),
    });
    const callTool = vi.fn().mockImplementation(({ name }: { name: string }) => {
      const payloads: Record<string, unknown> = {
        daiso_find_inventory_by_name: {
          query: '수납박스',
          summary: { headline: '수납박스 재고 조회 결과' },
          selectedProduct: { id: '1049516' },
        },
        gs25_search_products: { keyword: '콜라', products: [{}] },
        seveneleven_search_products: { query: '커피', products: [{}] },
        emart24_search_products: { keyword: '커피', products: [{}] },
      };

      return Promise.resolve({
        content: [{ type: 'text', text: JSON.stringify(payloads[name]) }],
      });
    });

    const exitCode = await runMcpSmoke({
      createClient: async () => ({ listTools, callTool, close }),
      writeOut: () => undefined,
      writeErr: () => undefined,
    });

    expect(exitCode).toBe(0);
    expect(listTools).toHaveBeenCalledOnce();
    expect(callTool).toHaveBeenCalledTimes(MCP_SMOKE_SCENARIOS.length);
    expect(callTool).toHaveBeenCalledWith({
      name: 'gs25_search_products',
      arguments: expect.objectContaining({ keyword: '콜라' }),
    });
    expect(close).toHaveBeenCalledOnce();
  });

  it('대표 도구 검증 실패 시 도구명, 요청 args, 응답 일부를 출력한다', async () => {
    const errors: string[] = [];
    const close = vi.fn();
    const listTools = vi.fn().mockResolvedValue({
      tools: MCP_SMOKE_TOOL_NAMES.map((name) => ({ name })),
    });
    const callTool = vi.fn().mockResolvedValue({
      content: [{ type: 'text', text: JSON.stringify({ summary: {} }) }],
    });

    const exitCode = await runMcpSmoke({
      createClient: async () => ({ listTools, callTool, close }),
      writeOut: () => undefined,
      writeErr: (message) => {
        errors.push(message);
      },
    });

    expect(exitCode).toBe(1);
    expect(errors.join('\n')).toContain('tool=daiso_find_inventory_by_name');
    expect(errors.join('\n')).toContain('"query":"수납박스"');
    expect(errors.join('\n')).toContain('responseExcerpt=');
    expect(close).toHaveBeenCalledOnce();
  });
});
