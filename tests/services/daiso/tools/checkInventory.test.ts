/**
 * 재고 확인 도구 테스트
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  fetchOnlineStock,
  fetchStoreInventory,
  createCheckInventoryTool,
} from '../../../../src/services/daiso/tools/checkInventory.js';

const mockFetch = vi.fn();

beforeEach(() => {
  mockFetch.mockReset();
  vi.stubGlobal('fetch', mockFetch);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('fetchOnlineStock', () => {
  it('온라인 재고 수량을 반환한다', async () => {
    mockFetch.mockResolvedValue(
      new Response(JSON.stringify({ success: true, data: { pdNo: '12345', stck: 50 } }))
    );

    const stock = await fetchOnlineStock('12345');

    expect(stock).toBe(50);
  });

  it('실패 시 0을 반환한다', async () => {
    mockFetch.mockResolvedValue(
      new Response(JSON.stringify({ success: false }))
    );

    const stock = await fetchOnlineStock('12345');

    expect(stock).toBe(0);
  });

  it('data가 없으면 0을 반환한다', async () => {
    mockFetch.mockResolvedValue(
      new Response(JSON.stringify({ success: true }))
    );

    const stock = await fetchOnlineStock('12345');

    expect(stock).toBe(0);
  });

  it('POST 요청을 보낸다', async () => {
    mockFetch.mockResolvedValue(
      new Response(JSON.stringify({ success: true, data: { stck: 10 } }))
    );

    await fetchOnlineStock('12345');

    expect(mockFetch).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ pdNo: '12345' }),
      })
    );
  });
});

describe('fetchStoreInventory', () => {
  it('매장별 재고 정보를 반환한다', async () => {
    const mockResponse = {
      success: true,
      data: {
        msStrVOList: [
          {
            strCd: 'STR001',
            strNm: '테스트점',
            strAddr: '서울시 테스트구',
            strTno: '02-1234-5678',
            opngTime: '0900',
            clsngTime: '2200',
            strLttd: 37.5665,
            strLitd: 126.978,
            km: '1.5km',
            qty: '10',
            parkYn: 'Y',
            usimYn: 'N',
            pkupYn: 'Y',
            taxfYn: 'N',
            elvtYn: 'Y',
            entrRampYn: 'N',
            nocashYn: 'Y',
          },
        ],
        intStrCont: 1,
      },
    };

    mockFetch.mockResolvedValue(new Response(JSON.stringify(mockResponse)));

    const result = await fetchStoreInventory('12345', 37.5, 127.0);

    expect(result.totalCount).toBe(1);
    expect(result.stores).toHaveLength(1);
    expect(result.stores[0]).toEqual({
      storeCode: 'STR001',
      storeName: '테스트점',
      address: '서울시 테스트구',
      phone: '02-1234-5678',
      openTime: '0900',
      closeTime: '2200',
      lat: 37.5665,
      lng: 126.978,
      distance: '1.5km',
      quantity: 10,
      options: {
        parking: true,
        simCard: false,
        pickup: true,
        taxFree: false,
        elevator: true,
        ramp: false,
        cashless: true,
      },
    });
  });

  it('실패 시 빈 배열을 반환한다', async () => {
    mockFetch.mockResolvedValue(
      new Response(JSON.stringify({ success: false }))
    );

    const result = await fetchStoreInventory('12345', 37.5, 127.0);

    expect(result.stores).toEqual([]);
    expect(result.totalCount).toBe(0);
  });

  it('msStrVOList가 없으면 빈 배열을 반환한다', async () => {
    mockFetch.mockResolvedValue(
      new Response(JSON.stringify({ success: true, data: {} }))
    );

    const result = await fetchStoreInventory('12345', 37.5, 127.0);

    expect(result.stores).toEqual([]);
  });

  it('올바른 요청 본문을 전송한다', async () => {
    mockFetch.mockResolvedValue(
      new Response(JSON.stringify({ success: false }))
    );

    await fetchStoreInventory('12345', 37.5, 127.0, 2, 50, '강남');

    const requestBody = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(requestBody).toEqual({
      keyword: '강남',
      pdNo: '12345',
      curLttd: 37.5,
      curLitd: 127.0,
      geolocationAgrYn: 'Y',
      pkupYn: '',
      intCd: '',
      pageSize: 50,
      currentPage: 2,
    });
  });

  it('qty가 숫자가 아니면 0으로 처리한다', async () => {
    mockFetch.mockResolvedValue(
      new Response(JSON.stringify({
        success: true,
        data: {
          msStrVOList: [{ strCd: '1', strNm: 'T', strAddr: '', strTno: '', opngTime: '', clsngTime: '', strLttd: 0, strLitd: 0, km: '', qty: 'invalid' }],
          intStrCont: 1,
        },
      }))
    );

    const result = await fetchStoreInventory('12345', 37.5, 127.0);

    expect(result.stores[0].quantity).toBe(0);
  });

  it('intStrCont가 없으면 stores 길이를 사용한다', async () => {
    mockFetch.mockResolvedValue(
      new Response(JSON.stringify({
        success: true,
        data: {
          msStrVOList: [
            { strCd: '1', strNm: '매장1', strAddr: '', strTno: '', opngTime: '', clsngTime: '', strLttd: 0, strLitd: 0, km: '', qty: '1' },
            { strCd: '2', strNm: '매장2', strAddr: '', strTno: '', opngTime: '', clsngTime: '', strLttd: 0, strLitd: 0, km: '', qty: '2' },
          ],
        },
      }))
    );

    const result = await fetchStoreInventory('12345', 37.5, 127.0);

    expect(result.totalCount).toBe(2);
  });
});

describe('createCheckInventoryTool', () => {
  it('올바른 도구 정의를 반환한다', () => {
    const tool = createCheckInventoryTool();

    expect(tool.name).toBe('daiso_check_inventory');
    expect(tool.metadata.title).toBe('재고 확인');
  });

  it('productId가 없으면 에러를 던진다', async () => {
    const tool = createCheckInventoryTool();

    await expect(tool.handler({ productId: '' })).rejects.toThrow('상품 ID(productId)를 입력해주세요.');
    await expect(tool.handler({ productId: '  ' })).rejects.toThrow('상품 ID(productId)를 입력해주세요.');
  });

  it('온라인 재고와 매장 재고를 함께 반환한다', async () => {
    // 온라인 재고 응답
    mockFetch.mockResolvedValueOnce(
      new Response(JSON.stringify({ success: true, data: { stck: 100 } }))
    );
    // 매장 재고 응답
    mockFetch.mockResolvedValueOnce(
      new Response(JSON.stringify({
        success: true,
        data: {
          msStrVOList: [
            { strCd: '1', strNm: '매장A', strAddr: '', strTno: '', opngTime: '', clsngTime: '', strLttd: 0, strLitd: 0, km: '', qty: '5' },
            { strCd: '2', strNm: '매장B', strAddr: '', strTno: '', opngTime: '', clsngTime: '', strLttd: 0, strLitd: 0, km: '', qty: '0' },
          ],
          intStrCont: 10,
        },
      }))
    );

    const tool = createCheckInventoryTool();
    const result = await tool.handler({ productId: '12345' });

    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.onlineStock).toBe(100);
    expect(parsed.storeInventory.inStockCount).toBe(1);
    expect(parsed.storeInventory.outOfStockCount).toBe(1);
    expect(parsed.storeInventory.totalStores).toBe(10);
  });

  it('기본 위치 값을 사용한다', async () => {
    // 온라인 재고 응답
    mockFetch.mockResolvedValueOnce(
      new Response(JSON.stringify({ success: false }))
    );
    // 매장 재고 응답
    mockFetch.mockResolvedValueOnce(
      new Response(JSON.stringify({ success: false }))
    );

    const tool = createCheckInventoryTool();
    const result = await tool.handler({ productId: '12345' });

    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.location.latitude).toBe(37.5665);
    expect(parsed.location.longitude).toBe(126.978);
  });

  it('커스텀 위치를 사용할 수 있다', async () => {
    // 온라인 재고 응답
    mockFetch.mockResolvedValueOnce(
      new Response(JSON.stringify({ success: false }))
    );
    // 매장 재고 응답
    mockFetch.mockResolvedValueOnce(
      new Response(JSON.stringify({ success: false }))
    );

    const tool = createCheckInventoryTool();
    const result = await tool.handler({
      productId: '12345',
      latitude: 35.1796,
      longitude: 129.0756,
    });

    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.location.latitude).toBe(35.1796);
    expect(parsed.location.longitude).toBe(129.0756);
  });
});
