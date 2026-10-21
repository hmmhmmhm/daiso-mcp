import { describe, expect, it, vi } from 'vitest';
import * as z from 'zod';
import { COMPACT_CATALOG, PUBLIC_TOOL_NAMES } from '../../../src/core/compact/catalog.js';
import { createCompactTools, assertCompactCoverage } from '../../../src/core/compact/tools.js';

function fixtures() {
  return [
    ...new Set(COMPACT_CATALOG.flatMap((group) => group.routes.map((route) => route.legacy))),
  ].map((name) => ({
    name,
    metadata: {
      title: name,
      description: name,
      inputSchema: { keyword: z.string().optional(), limit: z.number().default(5) },
    },
    handler: vi.fn(async (args: unknown) => ({
      content: [{ type: 'text' as const, text: JSON.stringify({ name, args }) }],
    })),
  }));
}
describe('공개 MCP 10개 계약', () => {
  it('기존44개 작업 전체를 중복 없이 매핑한다', () => {
    const tools = fixtures();
    expect(tools).toHaveLength(44);
    expect(PUBLIC_TOOL_NAMES).toHaveLength(10);
    expect(createCompactTools(tools).map((t) => t.name)).toEqual([...PUBLIC_TOOL_NAMES]);
    expect(() =>
      assertCompactCoverage([...tools, { ...tools[0], name: 'new_unmapped_tool' }]),
    ).toThrow('매핑');
    expect(() => assertCompactCoverage(tools.slice(1))).toThrow('매핑');
  });
  it('모든 서비스/작업은 기존 핸들러에 원래 인수와 기본값으로 전달한다', async () => {
    const legacy = fixtures();
    const compact = createCompactTools(legacy);
    for (const group of COMPACT_CATALOG) {
      const tool = compact.find((t) => t.name === group.name)!;
      for (const route of group.routes) {
        const control = {
          ...(route.service ? { service: route.service } : {}),
          ...(route.operation ? { operation: route.operation } : {}),
        };
        const args =
          group.name === 'submit_request'
            ? { requestType: 'developer', request: { keyword: '테스트' } }
            : { ...control, keyword: '테스트' };
        const out = await tool.handler(args);
        expect(out.content[0].text).toBe(
          JSON.stringify({ name: route.legacy, args: { keyword: '테스트', limit: 5 } }),
        );
      }
    }
  });
  it('잘못된 조합과 인수,알 수 없는 요청 유형은 외부 호출 없이 실패한다', async () => {
    const legacy = fixtures();
    const tools = createCompactTools(legacy);
    const invoke = (name: string, args: unknown) =>
      tools.find((t) => t.name === name)!.handler(args);
    await expect(invoke('search_products', { service: 'unknown' })).rejects.toThrow();
    await expect(invoke('get_showtimes', { service: 'cgv', operation: 'seats' })).rejects.toThrow();
    await expect(invoke('search_products', { service: 'daiso', typo: true })).rejects.toThrow();
    await expect(invoke('search_products', { service: 'daiso', limit: 'five' })).rejects.toThrow();
    await expect(
      invoke('submit_request', { requestType: 'payment', request: {} }),
    ).rejects.toThrow();
    await expect(invoke('submit_request', { request: { typo: 1 } })).rejects.toThrow();
    expect(
      legacy.every((t) => (t.handler as ReturnType<typeof vi.fn>).mock.calls.length === 0),
    ).toBe(true);
  });
  it('실패/미확인 재고 응답을 그대로 반환하고 요청 제출은 기존 저장 동작만 쓴다', async () => {
    const legacy = fixtures();
    const target = legacy.find((t) => t.name === 'cu_check_inventory')!;
    target.handler = vi.fn(async () => ({
      isError: true,
      content: [{ type: 'text', text: 'unknown' }],
    }));
    const tools = createCompactTools(legacy);
    expect(
      await tools.find((t) => t.name === 'check_inventory')!.handler({ service: 'cu' }),
    ).toEqual({ isError: true, content: [{ type: 'text', text: 'unknown' }] });
    await tools.find((t) => t.name === 'submit_request')!.handler({ request: {} });
    expect(legacy.find((t) => t.name === 'submit_developer_request')!.handler).toHaveBeenCalledWith(
      { limit: 5 },
    );
  });
});
