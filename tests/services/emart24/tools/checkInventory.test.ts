/**
 * 이마트24 재고 확인 도구 테스트
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createCheckInventoryTool } from '../../../../src/services/emart24/tools/checkInventory.js';

const mockFetch = vi.fn();

beforeEach(() => {
  mockFetch.mockReset();
  vi.stubGlobal('fetch', mockFetch);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('createCheckInventoryTool', () => {
  it('올바른 도구 정의를 반환한다', () => {
    const tool = createCheckInventoryTool();

    expect(tool.name).toBe('emart24_check_inventory');
    expect(tool.metadata.title).toBe('이마트24 재고 확인');
  });

  it('pluCd로 재고를 조회한다', async () => {
    mockFetch
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            error: 0,
            count: 1,
            data: [{ CODE: '28339', TITLE: '강남스퀘어점', LATITUDE: 37.5, LONGITUDE: 127.0 }],
          }),
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            storeGoodsInfo: { pluCd: '8800244010504', goodsNm: '두바이초콜릿' },
            storeGoodsQty: [{ BIZNO: '28339', BIZQTY: '3' }],
          }),
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            storeInfo: {
              storeNm: '강남스퀘어점',
              tel: '02-000-0000',
              storeAddr: '서울특별시 강남구 강남대로 396',
            },
          }),
        ),
      );

    const tool = createCheckInventoryTool();
    const result = await tool.handler({ pluCd: '8800244010504', storeKeyword: '강남' });

    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.pluCd).toBe('8800244010504');
    expect(parsed.storeFilters.appliedStoreKeyword).toBe('강남');
    expect(parsed.inventory.count).toBe(1);
    expect(parsed.inventory.stores[0].bizNo).toBe('28339');
  });

  it('pluCd와 keyword가 모두 없으면 에러를 던진다', async () => {
    const tool = createCheckInventoryTool();

    await expect(tool.handler({})).rejects.toThrow('pluCd 또는 keyword 중 하나는 반드시 입력해주세요.');
  });

  it('keyword로 첫 상품을 찾아 재고를 조회한다', async () => {
    mockFetch
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            totalCnt: 1,
            productList: [{ pluCd: '8800244010504', goodsNm: '두바이초콜릿' }],
          }),
        ),
      )
      .mockResolvedValueOnce(new Response(JSON.stringify({ error: 0, count: 0, data: [] })));

    const tool = createCheckInventoryTool();
    const result = await tool.handler({ keyword: '두바이' });

    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.pluCd).toBe('8800244010504');
    expect(parsed.inventory.count).toBe(0);
  });

  it('keyword 검색 결과에 PLU 코드가 없으면 에러를 던진다', async () => {
    mockFetch.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          totalCnt: 1,
          productList: [{ pluCd: '   ', goodsNm: '빈코드상품' }],
        }),
      ),
    );

    const tool = createCheckInventoryTool();
    await expect(tool.handler({ keyword: '빈코드' })).rejects.toThrow(
      '상품 검색 결과에서 PLU 코드를 찾을 수 없습니다.',
    );
  });

  it('좌표 없는 매장은 재고 결과에서 distanceM이 null로 유지된다', async () => {
    mockFetch
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            error: 0,
            count: 2,
            data: [
              { CODE: 'A', TITLE: '좌표없음', LATITUDE: 0, LONGITUDE: 0 },
              { CODE: 'B', TITLE: '좌표있음', LATITUDE: 37.5, LONGITUDE: 127.0 },
            ],
          }),
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            storeGoodsInfo: { pluCd: '8800244010504', goodsNm: '두바이초콜릿' },
            storeGoodsQty: [
              { BIZNO: 'A', BIZQTY: '1' },
              { BIZNO: 'B', BIZQTY: '2' },
            ],
          }),
        ),
      )
      .mockResolvedValueOnce(new Response(JSON.stringify({ storeInfo: { storeNm: '좌표없음' } })))
      .mockResolvedValueOnce(new Response(JSON.stringify({ storeInfo: { storeNm: '좌표있음' } })));

    const tool = createCheckInventoryTool();
    const result = await tool.handler({
      pluCd: '8800244010504',
      latitude: 37.5,
      longitude: 127.0,
      storeLimit: 2,
    });

    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.nearbyStores.stores[0].storeCode).toBe('B');
    expect(parsed.nearbyStores.stores[1].storeCode).toBe('A');
    expect(parsed.inventory.stores[0].bizNo).toBe('A');
    expect(parsed.inventory.stores[0].distanceM).toBeNull();
  });

  it('재고 응답에 수량/상품 정보가 없어도 빈 결과를 반환한다', async () => {
    mockFetch
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            error: 0,
            count: 1,
            data: [{ CODE: 'A', TITLE: '테스트점', LATITUDE: 37.5, LONGITUDE: 127.0 }],
          }),
        ),
      )
      .mockResolvedValueOnce(new Response(JSON.stringify({})));

    const tool = createCheckInventoryTool();
    const result = await tool.handler({ pluCd: '8800244010504', latitude: 37.5, longitude: 127.0 });

    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.inventory.goodsInfo).toBeNull();
    expect(parsed.inventory.count).toBe(0);
  });

  it('재고 응답의 BIZNO/BIZQTY 일부 누락도 안전하게 처리한다', async () => {
    mockFetch
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            error: 0,
            count: 1,
            data: [{ CODE: 'A', TITLE: '테스트점', LATITUDE: 37.5, LONGITUDE: 127.0 }],
          }),
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            storeGoodsInfo: { pluCd: '8800244010504', goodsNm: '고양이 츄르' },
            storeGoodsQty: [{ BIZQTY: '' }, { BIZNO: 'A' }],
          }),
        ),
      )
      .mockResolvedValueOnce(new Response(JSON.stringify({ storeInfo: { storeNm: '테스트점' } })));

    const tool = createCheckInventoryTool();
    const result = await tool.handler({ pluCd: '8800244010504', storeKeyword: '테스트' });

    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.inventory.count).toBe(1);
    expect(parsed.inventory.stores[0].bizNo).toBe('A');
    expect(parsed.inventory.stores[0].bizQty).toBe(0);
  });
});
