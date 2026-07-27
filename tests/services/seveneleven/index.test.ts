/**
 * 세븐일레븐 서비스 테스트
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createSevenElevenService } from '../../../src/services/seveneleven/index.js';

const mockFetch = vi.fn();

beforeEach(() => {
  mockFetch.mockReset();
  vi.stubGlobal('fetch', mockFetch);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('createSevenElevenService', () => {
  it('ServiceProvider 인터페이스를 구현한 객체를 반환한다', () => {
    const service = createSevenElevenService();

    expect(service.metadata).toBeDefined();
    expect(typeof service.getTools).toBe('function');
  });

  it('올바른 메타데이터를 가진다', () => {
    const service = createSevenElevenService();

    expect(service.metadata.id).toBe('seveneleven');
    expect(service.metadata.name).toBe('세븐일레븐');
    expect(service.metadata.version).toBe('1.0.0');
  });

  it('5개의 도구를 반환한다', () => {
    const service = createSevenElevenService();
    const tools = service.getTools();

    expect(tools.map((tool) => tool.name)).toEqual([
      'seveneleven_search_products',
      'seveneleven_search_stores',
      'seveneleven_check_inventory',
      'seveneleven_get_search_popwords',
      'seveneleven_get_catalog_snapshot',
    ]);
  });

  it('서비스 옵션의 Zyte 키를 MCP 도구에 전달한다', async () => {
    const payload = {
      success: true,
      data: {
        SearchQueryResult: {
          query: '커피',
          Collection: [
            {
              CollectionId: 'offline',
              Documentset: {
                totalCount: 1,
                Document: [{ prdNo: '1', itemCd: '8801', itemOnm: '아메리카노' }],
              },
            },
          ],
        },
      },
    };
    mockFetch
      .mockResolvedValueOnce(new Response('blocked', { status: 403 }))
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            statusCode: 200,
            httpResponseBody: Buffer.from(JSON.stringify(payload)).toString('base64'),
          }),
        ),
      );

    const service = createSevenElevenService({ zyteApiKey: 'worker-key' });
    const tool = service.getTools().find((item) => item.name === 'seveneleven_search_products');
    const result = await tool?.handler({ query: '커피', size: 1 });

    expect(result?.structuredContent).toMatchObject({ count: 1 });
    expect(mockFetch).toHaveBeenNthCalledWith(
      2,
      'https://api.zyte.com/v1/extract',
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: `Basic ${Buffer.from('worker-key:').toString('base64')}`,
        }),
      }),
    );
  });
});
