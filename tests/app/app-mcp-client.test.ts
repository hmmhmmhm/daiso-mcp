/**
 * MCP 클라이언트 관점 통합 테스트
 */
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import app from '../../src/index.js';
import { createMockProductResponse } from '../api/testHelpers.js';

const mockFetch = vi.fn();

function createMockStoreHtml(): string {
  return `
    <div class="bx-store"
         data-start="0900"
         data-end="2200"
         data-lat="37.4979"
         data-lng="127.0276"
         data-info='{}'>
      <h4 class="place">다이소 강남역점</h4>
      <em class="phone">T.02-1234-5678</em>
      <p class="addr">서울 강남구 강남대로</p>
    </div>
  `;
}

beforeEach(() => {
  mockFetch.mockReset();
  vi.stubGlobal('fetch', mockFetch);
});

afterEach(() => {
  vi.restoreAllMocks();
});

async function createLocalMcpClient(): Promise<Client> {
  const client = new Client({ name: 'vitest-mcp-client', version: '1.0.0' });
  const transport = new StreamableHTTPClientTransport(new URL('https://local.test/mcp'), {
    fetch: async (url, init) => {
      const request = new Request(url, init);
      return app.request(request);
    },
  });

  await client.connect(transport);
  return client;
}

describe('MCP client smoke', () => {
  it('SDK 도구 목록의 모든 도구가 outputSchema를 노출한다', async () => {
    const client = await createLocalMcpClient();
    try {
      const tools = await client.listTools();
      const missing = tools.tools.filter((tool) => !tool.outputSchema).map((tool) => tool.name);

      expect(missing).toEqual([]);
    } finally {
      await client.close();
    }
  });

  it('대표 도구의 fallback outputSchema가 실제 결과 필드를 명시한다', async () => {
    const client = await createLocalMcpClient();
    try {
      const tools = await client.listTools();
      const byName = new Map(tools.tools.map((tool) => [tool.name, tool]));

      expect(byName.get('daiso_search_products')?.outputSchema?.properties).toHaveProperty('products');
      expect(byName.get('daiso_find_stores')?.outputSchema?.properties).toHaveProperty('stores');
      expect(byName.get('gs25_check_inventory')?.outputSchema?.properties).toHaveProperty('inventory');
      expect(byName.get('cgv_find_theaters')?.outputSchema?.properties).toHaveProperty('theaters');
      expect(byName.get('megabox_list_now_showing')?.outputSchema?.properties).toHaveProperty('movies');
      expect(byName.get('seveneleven_get_search_popwords')?.outputSchema?.properties).toHaveProperty('keywords');
    } finally {
      await client.close();
    }
  });

  it('SDK 클라이언트가 도구 목록을 조회하고 상품명 기반 다이소 재고 도구를 호출한다', async () => {
    mockFetch
      .mockResolvedValueOnce(
        new Response(JSON.stringify(createMockProductResponse([{ PD_NO: '1049516', PDNM: '수납박스' }], 1))),
      )
      .mockResolvedValueOnce(new Response(createMockStoreHtml()))
      .mockResolvedValueOnce(new Response(JSON.stringify({ success: true, data: { pdNo: '1049516', stck: 4 } })))
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            data: [
              {
                strCd: '11199',
                strNm: '강남역점',
                strAddr: '서울 강남구',
                strTno: '02',
                opngTime: '0900',
                clsngTime: '2200',
                strLttd: 37.5,
                strLitd: 127,
                km: '0.2km',
              },
            ],
          }),
        ),
      )
      .mockResolvedValueOnce(new Response('sample-token', { headers: { 'X-DM-UID': 'dm-uid-123' } }))
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ success: true, data: [{ pdNo: '1049516', strCd: '11199', stck: '2' }] })),
      );

    const client = await createLocalMcpClient();
    try {
      const tools = await client.listTools();
      const daisoTool = tools.tools.find((tool) => tool.name === 'daiso_find_inventory_by_name');
      expect(daisoTool).toBeTruthy();
      expect(daisoTool?.outputSchema?.properties).toHaveProperty('summary');

      const result = await client.callTool({
        name: 'daiso_find_inventory_by_name',
        arguments: { query: '수납박스', storeQuery: '강남역', pageSize: 1, productLimit: 1 },
      });
      const content = 'content' in result ? result.content : [];
      const firstText = content[0]?.type === 'text' ? content[0].text : '';
      const payload = JSON.parse(firstText);

      expect(payload.summary.headline).toContain('수납박스');
      expect(payload.location.source).toBe('storeQuery');
      expect(payload.selectedProduct.id).toBe('1049516');
      expect(payload.storeInventory.stores[0].storeCode).toBe('11199');
    } finally {
      await client.close();
    }
  });
});
