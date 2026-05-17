/**
 * MCP smoke 스크립트 테스트
 */
import { describe, expect, it, vi } from 'vitest';
import { MCP_SMOKE_TOOL_NAMES, runMcpSmoke } from '../../scripts/mcp-smoke.js';

describe('runMcpSmoke', () => {
  it('상품명 기반 재고 도구를 필수 smoke 대상으로 포함한다', () => {
    expect(MCP_SMOKE_TOOL_NAMES).toContain('daiso_find_inventory_by_name');
  });

  it('MCP 클라이언트로 도구 목록과 대표 도구 호출을 검증한다', async () => {
    const close = vi.fn();
    const listTools = vi.fn().mockResolvedValue({
      tools: MCP_SMOKE_TOOL_NAMES.map((name) => ({ name })),
    });
    const callTool = vi.fn().mockResolvedValue({
      content: [
        {
          type: 'text',
          text: JSON.stringify({
            query: '수납박스',
            summary: { headline: '수납박스 재고 조회 결과' },
            selectedProduct: { id: '1049516' },
          }),
        },
      ],
    });

    const exitCode = await runMcpSmoke({
      createClient: async () => ({ listTools, callTool, close }),
      writeOut: () => undefined,
      writeErr: () => undefined,
    });

    expect(exitCode).toBe(0);
    expect(listTools).toHaveBeenCalledOnce();
    expect(callTool).toHaveBeenCalledWith({
      name: 'daiso_find_inventory_by_name',
      arguments: expect.objectContaining({ query: '수납박스' }),
    });
    expect(close).toHaveBeenCalledOnce();
  });
});
