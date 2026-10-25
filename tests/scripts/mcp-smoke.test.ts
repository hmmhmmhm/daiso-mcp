import { inventoryPayloads } from './mcp-smoke-fixtures.js';
import { COMPACT_CATALOG, PUBLIC_TOOL_NAMES } from '../../src/core/compact/catalog.js';
/**
 * MCP smoke 스크립트 테스트
 */
import { describe, expect, it, vi } from 'vitest';
import {
  MCP_SMOKE_SCENARIOS,
  MCP_SMOKE_TOOL_NAMES,
  runMcpSmoke,
} from '../../scripts/ops/mcp-smoke.js';

describe('runMcpSmoke', () => {
  it('상품명 기반 재고 도구를 필수 smoke 대상으로 포함한다', () => {
    expect(MCP_SMOKE_TOOL_NAMES).toContain('daiso_find_inventory_by_name');
    expect(MCP_SMOKE_TOOL_NAMES).toContain('gs25_search_products');
    expect(MCP_SMOKE_TOOL_NAMES).toContain('seveneleven_search_products');
    expect(MCP_SMOKE_TOOL_NAMES).toContain('emart24_search_products');
    expect(MCP_SMOKE_TOOL_NAMES).toContain('opinet_get_average_prices');
  });

  it('대표 호출 시나리오는 다이소/편의점 도구를 모두 포함한다', () => {
    expect(MCP_SMOKE_SCENARIOS.map((scenario) => scenario.toolName)).toEqual([
      'daiso_find_inventory_by_name',
      'daiso_jp_search_products',
      'daiso_jp_get_product',
      'daiso_jp_find_stores',
      'gs25_search_products',
      'seveneleven_search_products',
      'seveneleven_get_search_popwords',
      'seveneleven_get_catalog_snapshot',
      'emart24_search_products',
      'opinet_get_average_prices',
      ...Object.keys(inventoryPayloads),
      'megabox_find_nearby_theaters',
      'lottecinema_find_nearby_theaters',
      'cgv_find_theaters',
      'dtryx_list_now_showing',
    ]);
  });

  it('서비스별 matrix 실행을 위해 각 대표 호출에 service를 지정한다', () => {
    expect(MCP_SMOKE_SCENARIOS.map((scenario) => scenario.service)).toEqual([
      'daiso',
      'daiso_jp',
      'daiso_jp',
      'daiso_jp',
      'gs25',
      'seveneleven',
      'seveneleven',
      'seveneleven',
      'emart24',
      'opinet',
      'gs25',
      'seveneleven',
      'emart24',
      'cu',
      'oliveyoung',
      'megabox',
      'lottecinema',
      'cgv',
      'dtryx',
    ]);
  });

  it('MCP 클라이언트로 도구 목록과 대표 도구 호출을 검증한다', async () => {
    const close = vi.fn();
    const listTools = vi.fn().mockResolvedValue({
      tools: PUBLIC_TOOL_NAMES.map((name) => ({ name })),
    });
    const callTool = vi
      .fn()
      .mockImplementation(
        ({
          name,
          arguments: args,
        }: {
          name: string;
          arguments: { service?: string; operation?: string };
        }) => {
          const key = COMPACT_CATALOG.find((g) => g.name === name)!.routes.find(
            (r) => r.service === args.service && r.operation === args.operation,
          )!.legacy;
          const payloads: Record<string, unknown> = {
            daiso_find_inventory_by_name: {
              query: '수납박스',
              summary: { headline: '수납박스 재고 조회 결과' },
              selectedProduct: { id: '1049516', name: '수납박스' },
              storeInventory: {
                inStockCount: 0,
                outOfStockCount: 1,
                unknownStockCount: 0,
                stores: [{ storeCode: '1', storeName: '강남역점', quantity: 0 }],
              },
            },
            daiso_jp_search_products: {
              country: 'JP',
              products: [{ id: '4550746075917', name: 'ボウル', currency: 'JPY' }],
            },
            daiso_jp_get_product: {
              country: 'JP',
              id: '4550746075917',
              name: 'ボウル',
              currency: 'JPY',
              onlineAvailable: true,
              storeInventorySupported: false,
            },
            daiso_jp_find_stores: {
              country: 'JP',
              stores: [{ id: '0001', name: '渋谷店', brand: 'DAISO' }],
            },
            ...inventoryPayloads,
            megabox_find_nearby_theaters: { theaters: [{ theaterId: '1', theaterName: '강남' }] },
            lottecinema_find_nearby_theaters: {
              theaters: [{ theaterId: '1', theaterName: '잠실' }],
            },
            cgv_find_theaters: { theaters: [{ theaterCode: '1', theaterName: '강남' }] },
            dtryx_list_now_showing: { movies: [{ movieCode: '1', movieName: '영화' }] },
            gs25_search_products: { keyword: '콜라', products: [{ itemCode: 'p1' }] },
            seveneleven_get_search_popwords: { available: false, count: 0, keywords: [] },
            seveneleven_get_catalog_snapshot: {
              pages: { totalCount: 1, items: [{ itemCode: '1', itemName: '상품' }] },
              issues: { totalCount: 0, items: [] },
              exhibitions: { totalCount: 0, items: [] },
            },
            seveneleven_search_products: { query: '커피', products: [{}] },
            emart24_search_products: { keyword: '커피', products: [{ pluCd: 'p1' }] },
            opinet_get_average_prices: { provider: 'opinet', prices: [] },
          };

          return Promise.resolve({
            content: [{ type: 'text', text: JSON.stringify(payloads[key]) }],
          });
        },
      );

    const exitCode = await runMcpSmoke({
      createClient: async () => ({ listTools, callTool, close }),
      writeOut: () => undefined,
      writeErr: () => undefined,
    });

    expect(exitCode).toBe(0);
    expect(listTools).toHaveBeenCalledOnce();
    expect(callTool).toHaveBeenCalledTimes(MCP_SMOKE_SCENARIOS.length);
    expect(callTool).toHaveBeenCalledWith({
      name: 'search_products',
      arguments: expect.objectContaining({ service: 'gs25', keyword: '콜라' }),
    });
    for (const [service, field] of [
      ['gs25', 'itemCode'],
      ['emart24', 'pluCd'],
    ]) {
      expect(callTool).toHaveBeenCalledWith({
        name: 'check_inventory',
        arguments: expect.objectContaining({
          service,
          [field]: 'p1',
          storeLimit: service === 'emart24' ? 10 : 1,
        }),
      });
    }
    expect(callTool.mock.calls.every(([call]) => PUBLIC_TOOL_NAMES.includes(call.name))).toBe(true);
    expect(close).toHaveBeenCalledOnce();
  });

  it('service가 지정되면 해당 서비스 도구만 호출한다', async () => {
    const close = vi.fn();
    const listTools = vi.fn().mockResolvedValue({
      tools: PUBLIC_TOOL_NAMES.map((name) => ({ name })),
    });
    const callTool = vi
      .fn()
      .mockResolvedValueOnce({
        content: [
          {
            type: 'text',
            text: JSON.stringify({ keyword: '콜라', products: [{ itemCode: 'p1' }] }),
          },
        ],
      })
      .mockResolvedValueOnce({
        content: [{ type: 'text', text: JSON.stringify(inventoryPayloads.gs25_check_inventory) }],
      });

    const exitCode = await runMcpSmoke({
      service: 'gs25',
      createClient: async () => ({ listTools, callTool, close }),
      writeOut: () => undefined,
      writeErr: () => undefined,
    });

    expect(exitCode).toBe(0);
    expect(callTool).toHaveBeenCalledTimes(2);
    expect(callTool).toHaveBeenCalledWith({
      name: 'search_products',
      arguments: expect.objectContaining({ service: 'gs25', keyword: '콜라' }),
    });
    expect(close).toHaveBeenCalledOnce();
  });

  it('대표 도구 검증 실패 시 도구명, 요청 args, 응답 일부를 출력한다', async () => {
    const errors: string[] = [];
    const close = vi.fn();
    const listTools = vi.fn().mockResolvedValue({
      tools: PUBLIC_TOOL_NAMES.map((name) => ({ name })),
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
    expect(errors.join('\n')).toContain('scenario=daiso_find_inventory_by_name');
    expect(errors.join('\n')).toContain('"query":"수납박스"');
    expect(errors.join('\n')).toContain('responseExcerpt=');
    expect(close).toHaveBeenCalledOnce();
  });
});

describe('MCP 도구 오류 응답', () => {
  it.each([
    ['Zyte API 호출 실패: 403 Your account has been suspended.'],
    [JSON.stringify({ keyword: '콜라', error: 'configuration missing' })],
    [''],
    [undefined],
  ])('isError 응답은 원문을 보존하고 실패한다: %s', async (text) => {
    const errors: string[] = [];
    const close = vi.fn();
    const exitCode = await runMcpSmoke({
      service: 'gs25',
      createClient: async () => ({
        listTools: async () => ({ tools: PUBLIC_TOOL_NAMES.map((name) => ({ name })) }),
        callTool: async () => ({
          isError: true,
          content: text === undefined ? [] : [{ type: 'text', text }],
        }),
        close,
      }),
      writeOut: () => undefined,
      writeErr: (message) => errors.push(message),
    });
    expect(exitCode).toBe(1);
    expect(errors[0]).toContain(
      `GS25 상품 검색 - ${text || 'MCP 도구 호출이 오류를 반환했습니다'}`,
    );
    expect(close).toHaveBeenCalledOnce();
  });

  it.each(['not json', '[]', ''])('성공 응답도 JSON 객체 검증을 유지한다: %s', async (text) => {
    const exitCode = await runMcpSmoke({
      service: 'gs25',
      createClient: async () => ({
        listTools: async () => ({ tools: PUBLIC_TOOL_NAMES.map((name) => ({ name })) }),
        callTool: async () => ({ isError: false, content: [{ type: 'text', text }] }),
        close: async () => undefined,
      }),
      writeOut: () => undefined,
      writeErr: () => undefined,
    });
    expect(exitCode).toBe(1);
  });
});

describe('공개 도구 개수 회귀 방지', () => {
  it.each(
    [
      [...PUBLIC_TOOL_NAMES, 'eleventh_tool'],
      [...PUBLIC_TOOL_NAMES.slice(1), 'legacy_name'],
      [...PUBLIC_TOOL_NAMES.slice(1), PUBLIC_TOOL_NAMES[1]],
    ].map((names) => [names]),
  )('11번째/미등록/중복 도구 목록을 호출 전에 거절한다', async (names) => {
    const callTool = vi.fn();
    const close = vi.fn();
    const code = await runMcpSmoke({
      service: 'gs25',
      createClient: async () => ({
        listTools: async () => ({ tools: names.map((name) => ({ name })) }),
        callTool,
        close,
      }),
      writeOut: () => undefined,
      writeErr: () => undefined,
    });
    expect(code).toBe(1);
    expect(callTool).not.toHaveBeenCalled();
    expect(close).toHaveBeenCalledOnce();
  });
});
