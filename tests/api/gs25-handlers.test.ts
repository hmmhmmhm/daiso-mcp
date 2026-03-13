/**
 * GS25 API 핸들러 테스트
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  handleGs25CheckInventory,
  handleGs25FindStores,
  handleGs25SearchProducts,
} from '../../src/api/gs25Handlers.js';

const mockFetch = vi.fn();

beforeEach(() => {
  mockFetch.mockReset();
  vi.stubGlobal('fetch', mockFetch);
});

afterEach(() => {
  vi.restoreAllMocks();
});

function createMockContext(query: Record<string, string> = {}) {
  return {
    env: {},
    req: {
      query: (key: string) => query[key],
      param: () => undefined,
    },
    json: vi.fn().mockImplementation((data, status) => ({
      data,
      status: status || 200,
    })),
  } as unknown as Parameters<typeof handleGs25FindStores>[0];
}

describe('handleGs25FindStores', () => {
  it('매장 검색 결과를 반환한다', async () => {
    mockFetch.mockResolvedValue(
      new Response(
        JSON.stringify({
          stores: [{ storeCode: '1', storeName: '강남역점', storeAddress: '서울 강남구' }],
        }),
      ),
    );

    const ctx = createMockContext({ keyword: '강남' });
    await handleGs25FindStores(ctx);

    expect(ctx.json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: true,
        data: expect.objectContaining({ stores: expect.any(Array) }),
      }),
    );
  });
});

describe('handleGs25SearchProducts', () => {
  it('keyword가 없으면 에러를 반환한다', async () => {
    const ctx = createMockContext({});
    await handleGs25SearchProducts(ctx);

    expect(ctx.json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: false,
        error: { code: 'MISSING_QUERY', message: '검색어(keyword)를 입력해주세요.' },
      }),
      400,
    );
  });

  it('상품 검색 결과를 반환한다', async () => {
    mockFetch.mockResolvedValue(
      new Response(JSON.stringify({ stores: [{ storeCode: '1', searchItemName: '오감자', realStockQuantity: 2 }] })),
    );

    const ctx = createMockContext({ keyword: '오감자' });
    await handleGs25SearchProducts(ctx);

    expect(ctx.json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: true,
      }),
    );
  });
});

describe('handleGs25CheckInventory', () => {
  it('keyword가 없으면 에러를 반환한다', async () => {
    const ctx = createMockContext({});
    await handleGs25CheckInventory(ctx);

    expect(ctx.json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: false,
        error: { code: 'MISSING_QUERY', message: '검색어(keyword)를 입력해주세요.' },
      }),
      400,
    );
  });

  it('재고 검색 결과를 반환한다', async () => {
    mockFetch.mockResolvedValue(
      new Response(
        JSON.stringify({
          stores: [
            {
              storeCode: '1',
              storeName: '강남역점',
              searchItemName: '오감자',
              realStockQuantity: 1,
            },
          ],
        }),
      ),
    );

    const ctx = createMockContext({ keyword: '오감자' });
    await handleGs25CheckInventory(ctx);

    expect(ctx.json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: true,
        data: expect.objectContaining({
          inventory: expect.objectContaining({ inStockStoreCount: 1 }),
        }),
      }),
    );
  });
});
