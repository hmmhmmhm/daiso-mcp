/**
 * 진열 위치 조회 도구 테스트
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  fetchDisplayLocation,
  createGetDisplayLocationTool,
} from '../../../../src/services/daiso/tools/getDisplayLocation.js';

const mockFetch = vi.fn();

beforeEach(() => {
  mockFetch.mockReset();
  vi.stubGlobal('fetch', mockFetch);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('fetchDisplayLocation', () => {
  it('정상 응답에서 hasLocation:true 반환 및 locations 배열에 데이터 포함', async () => {
    const mockResponse = {
      success: true,
      data: [
        {
          zoneNo: '60',
          stairNo: '2',
          storeErp: '04515',
        },
      ],
    };

    mockFetch.mockResolvedValue(new Response(JSON.stringify(mockResponse)));

    const result = await fetchDisplayLocation('12345', '04515');

    expect(result.hasLocation).toBe(true);
    expect(result.locations).toHaveLength(1);
    expect(result.locations[0]).toEqual({
      zoneNo: '60',
      stairNo: '2',
      storeErp: '04515',
    });
  });

  it('success가 false인 경우 hasLocation:false 및 빈 locations 배열 반환', async () => {
    const mockResponse = {
      success: false,
      message: '조회 실패',
    };

    mockFetch.mockResolvedValue(new Response(JSON.stringify(mockResponse)));

    const result = await fetchDisplayLocation('12345', '04515');

    expect(result.hasLocation).toBe(false);
    expect(result.locations).toEqual([]);
    expect(result.message).toBe('조회 실패');
  });

  it('data가 빈 배열인 경우 hasLocation:false 및 빈 locations 배열 반환', async () => {
    const mockResponse = {
      success: true,
      data: [],
    };

    mockFetch.mockResolvedValue(new Response(JSON.stringify(mockResponse)));

    const result = await fetchDisplayLocation('12345', '04515');

    expect(result.hasLocation).toBe(false);
    expect(result.locations).toEqual([]);
  });

  it('fetch 요청 body에 {pdNo, strCd} JSON이 포함되어야 함', async () => {
    mockFetch.mockResolvedValue(new Response(JSON.stringify({ success: true, data: [] })));

    await fetchDisplayLocation('12345', '04515');

    expect(mockFetch).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ pdNo: '12345', strCd: '04515' }),
      }),
    );
  });

  it('응답의 storeErp가 없으면 storeCode 값으로 대체되어야 함', async () => {
    const mockResponse = {
      success: true,
      data: [
        {
          zoneNo: '60',
          stairNo: '2',
        },
      ],
    };

    mockFetch.mockResolvedValue(new Response(JSON.stringify(mockResponse)));

    const result = await fetchDisplayLocation('12345', '04515');

    expect(result.locations[0].storeErp).toBe('04515');
  });

  it('data 배열에 2개 이상의 위치가 있으면 모두 locations에 반환', async () => {
    const mockResponse = {
      success: true,
      data: [
        {
          zoneNo: '60',
          stairNo: '2',
          storeErp: '04515',
        },
        {
          zoneNo: '30',
          stairNo: '1',
          storeErp: '04515',
        },
        {
          zoneNo: '45',
          stairNo: '3',
          storeErp: '04515',
        },
      ],
    };

    mockFetch.mockResolvedValue(new Response(JSON.stringify(mockResponse)));

    const result = await fetchDisplayLocation('12345', '04515');

    expect(result.locations).toHaveLength(3);
    expect(result.locations[0].zoneNo).toBe('60');
    expect(result.locations[1].zoneNo).toBe('30');
    expect(result.locations[2].zoneNo).toBe('45');
  });

  it('success:false 응답에서 message가 없으면 null을 반환', async () => {
    mockFetch.mockResolvedValue(new Response(JSON.stringify({ success: false })));

    const result = await fetchDisplayLocation('12345', '04515');

    expect(result.hasLocation).toBe(false);
    expect(result.message).toBeNull();
  });

  it('data 항목에 zoneNo가 없으면 빈 문자열로 처리', async () => {
    mockFetch.mockResolvedValue(
      new Response(
        JSON.stringify({
          success: true,
          data: [{ stairNo: '2', storeErp: '04515' }],
        }),
      ),
    );

    const result = await fetchDisplayLocation('12345', '04515');

    expect(result.locations[0].zoneNo).toBe('');
  });

  it('data 항목에 stairNo가 없으면 빈 문자열로 처리', async () => {
    mockFetch.mockResolvedValue(
      new Response(
        JSON.stringify({
          success: true,
          data: [{ zoneNo: '60', storeErp: '04515' }],
        }),
      ),
    );

    const result = await fetchDisplayLocation('12345', '04515');

    expect(result.locations[0].stairNo).toBe('');
  });

  it('data가 배열이 아닌 경우 빈 locations 배열 반환', async () => {
    mockFetch.mockResolvedValue(
      new Response(
        JSON.stringify({
          success: true,
          data: null,
        }),
      ),
    );

    const result = await fetchDisplayLocation('12345', '04515');

    expect(result.hasLocation).toBe(false);
    expect(result.locations).toEqual([]);
  });
});

describe('createGetDisplayLocationTool', () => {
  it('올바른 name, metadata, handler를 포함한 도구 정의를 반환', () => {
    const tool = createGetDisplayLocationTool();

    expect(tool.name).toBe('daiso_get_display_location');
    expect(tool.metadata.title).toBe('진열 위치 조회');
    expect(tool.metadata.description).toContain('진열 위치');
    expect(typeof tool.handler).toBe('function');
  });

  it('productId가 빈 문자열이면 에러를 throw', async () => {
    mockFetch.mockResolvedValue(new Response(JSON.stringify({ success: true, data: [] })));

    const tool = createGetDisplayLocationTool();

    await expect(tool.handler({ productId: '', storeCode: '04515' })).rejects.toThrow(
      '상품 ID(productId)를 입력해주세요.',
    );
  });

  it('storeCode가 빈 문자열이면 에러를 throw', async () => {
    mockFetch.mockResolvedValue(new Response(JSON.stringify({ success: true, data: [] })));

    const tool = createGetDisplayLocationTool();

    await expect(tool.handler({ productId: '12345', storeCode: '' })).rejects.toThrow(
      '매장 코드(storeCode)를 입력해주세요.',
    );
  });

  it('진열 위치가 있을 때 locations에 층/구역 정보가 포함되어야 함', async () => {
    mockFetch.mockResolvedValue(
      new Response(
        JSON.stringify({
          success: true,
          data: [
            {
              zoneNo: '60',
              stairNo: '2',
              storeErp: '04515',
            },
          ],
        }),
      ),
    );

    const tool = createGetDisplayLocationTool();
    const result = await tool.handler({ productId: '12345', storeCode: '04515' });

    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.hasLocation).toBe(true);
    expect(parsed.locations[0].stairNo).toBe('2');
    expect(parsed.locations[0].zoneNo).toBe('60');
  });

  it('진열 위치가 없을 때 hasLocation이 false', async () => {
    mockFetch.mockResolvedValue(
      new Response(
        JSON.stringify({
          success: true,
          data: [],
        }),
      ),
    );

    const tool = createGetDisplayLocationTool();
    const result = await tool.handler({ productId: '12345', storeCode: '04515' });

    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.hasLocation).toBe(false);
    expect(parsed.locations).toHaveLength(0);
  });

  it('stairNo가 없는 진열 위치에서 zoneNo만 포함', async () => {
    mockFetch.mockResolvedValue(
      new Response(
        JSON.stringify({
          success: true,
          data: [{ zoneNo: '60', storeErp: '04515' }],
        }),
      ),
    );

    const tool = createGetDisplayLocationTool();
    const result = await tool.handler({ productId: '12345', storeCode: '04515' });

    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.locations[0].zoneNo).toBe('60');
    expect(parsed.locations[0].stairNo).toBe('');
  });

  it('zoneNo가 null인 경우 빈 문자열로 변환', async () => {
    mockFetch.mockResolvedValue(
      new Response(
        JSON.stringify({
          success: true,
          data: [{ stairNo: '2', zoneNo: null, storeErp: '04515' }],
        }),
      ),
    );

    const tool = createGetDisplayLocationTool();
    const result = await tool.handler({ productId: '12345', storeCode: '04515' });

    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.locations[0].stairNo).toBe('2');
    expect(parsed.locations[0].zoneNo).toBe('');
  });
});
