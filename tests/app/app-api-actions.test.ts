/**
 * 앱 통합 테스트 - 공통 액션 facade
 */

import { describe, expect, it, vi } from 'vitest';
import app from '../../src/index.js';
import * as actionsProxy from '../../src/api/actionsProxy.js';
import { setupFetchMock } from './testHelpers.js';

const mockFetch = vi.fn();
setupFetchMock(mockFetch);

describe('GET /api/actions/query', () => {
  it('일반 검색 액션을 기존 GET API로 위임한다', async () => {
    mockFetch.mockResolvedValue(
      new Response(
        JSON.stringify({
          resultSet: {
            result: [{ totalSize: 1, resultDocuments: [{ PD_NO: '1', PDNM: 'Test', PD_PRC: '1000' }] }],
          },
        }),
      ),
    );

    const res = await app.request('/api/actions/query?action=daisoSearchProducts&q=test');

    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.success).toBe(true);
    expect(data.data.products[0].id).toBe('1');
  });

  it('path 파라미터 액션을 기존 상세 API로 위임한다', async () => {
    mockFetch.mockResolvedValue(
      new Response(
        JSON.stringify({
          resultSet: {
            result: [
              {
                totalSize: 1,
                resultDocuments: [{ PD_NO: '12345', PDNM: 'Test', PD_PRC: '1000' }],
              },
            ],
          },
        }),
      ),
    );

    const res = await app.request('/api/actions/query?action=daisoGetProduct&productId=12345');

    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.success).toBe(true);
    expect(data.data.id).toBe('12345');
  });

  it('GS25 2단계 재고 조회를 action facade로 위임한다', async () => {
    mockFetch
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            SearchQueryResult: {
              Collection: [
                {
                  Documentset: {
                    Document: [
                      { field: { itemCode: '8801056038861', itemName: '핫식스250ML', stockCheckYn: 'Y' } },
                    ],
                  },
                },
              ],
            },
          }),
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            stores: [
              {
                storeCode: 'A1',
                storeName: 'GS25 안산중앙점',
                storeAddress: '경기 안산시 단원구 중앙대로 907',
              },
            ],
          }),
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            status: 'OK',
            results: [{ geometry: { location: { lat: 37.3187, lng: 126.8389 } } }],
          }),
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            stores: [
              {
                storeCode: 'A1',
                storeName: 'GS25 안산중앙점',
                searchItemName: '핫식스250ML',
                realStockQuantity: 6,
              },
            ],
          }),
        ),
      );

    const searchRes = await app.request('/api/actions/query?action=gs25SearchProducts&keyword=%ED%95%AB%EC%8B%9D%EC%8A%A4');
    expect(searchRes.status).toBe(200);

    const searchData = await searchRes.json();
    expect(searchData.data.products[0].itemCode).toBe('8801056038861');

    const inventoryRes = await app.request(
      '/api/actions/query?action=gs25CheckInventory&itemCode=8801056038861&storeKeyword=%EC%95%88%EC%82%B0%20%EC%A4%91%EC%95%99%EC%97%AD&storeLimit=10',
      undefined,
      { GOOGLE_MAPS_API_KEY: 'test-google-key' },
    );
    expect(inventoryRes.status).toBe(200);

    const inventoryData = await inventoryRes.json();
    expect(inventoryData.success).toBe(true);
    expect(inventoryData.data.itemCodeUsed).toBe(true);
    expect(inventoryData.data.inventory.inStockStoreCount).toBe(1);
    expect(inventoryData.data.inventory.stores[0].storeName).toBe('GS25 안산중앙점');
  });

  it('잘못된 action이면 에러를 반환한다', async () => {
    const res = await app.request('/api/actions/query?action=unknownAction');

    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.success).toBe(false);
    expect(data.error.code).toBe('INVALID_ACTION_QUERY');
  });

  it('알 수 없는 예외는 기본 메시지로 감싼다', async () => {
    vi.spyOn(actionsProxy, 'buildActionQueryTargetUrl').mockImplementationOnce(() => {
      throw undefined;
    });

    const res = await app.request('/api/actions/query?action=daisoSearchProducts&q=test');

    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.success).toBe(false);
    expect(data.error.message).toBe('알 수 없는 오류가 발생했습니다.');
  });
});
