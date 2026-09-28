import { clearSevenElevenReadCache } from '../../../src/services/seveneleven/readCache.js';
/**
 * 세븐일레븐 서비스 테스트
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createSevenElevenService } from '../../../src/services/seveneleven/index.js';

const mockFetch = vi.fn();

beforeEach(() => {
  clearSevenElevenReadCache();
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

  it('서비스에 키가 있어도 MCP 상품 조회는 유료 호출 없이 차단된다', async () => {
    mockFetch.mockResolvedValueOnce(new Response('blocked', { status: 403 }));
    const tool = createSevenElevenService({ zyteApiKey: 'worker-key' })
      .getTools()
      .find((item) => item.name === 'seveneleven_search_products');
    const result = await tool?.handler({ query: '커피', size: 1 });
    expect(result?.structuredContent).toMatchObject({
      count: 0,
      status: 'degraded',
      message: expect.stringContaining('API 요청 실패: 403'),
    });
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });
});
