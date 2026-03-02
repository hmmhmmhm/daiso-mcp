/**
 * 매장 찾기 도구 테스트
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  fetchStores,
  getDistricts,
  getNeighborhoods,
  createFindStoresTool,
} from '../../../../src/services/daiso/tools/findStores.js';

const mockFetch = vi.fn();

beforeEach(() => {
  mockFetch.mockReset();
  vi.stubGlobal('fetch', mockFetch);
});

afterEach(() => {
  vi.restoreAllMocks();
});

// 테스트용 HTML 생성
function createMockStoreHtml(stores: Array<{
  name: string;
  phone?: string;
  address?: string;
  lat?: string;
  lng?: string;
  start?: string;
  end?: string;
  info?: Record<string, string>;
}>) {
  return stores
    .map((store) => {
      const info = store.info ? JSON.stringify(store.info).replace(/"/g, '&quot;') : '';
      return `
      <div class="bx-store"
           data-start="${store.start || '0900'}"
           data-end="${store.end || '2200'}"
           data-lat="${store.lat || '37.5665'}"
           data-lng="${store.lng || '126.978'}"
           data-info='${info}'>
        <h4 class="place">${store.name}</h4>
        <em class="phone">T.${store.phone || '02-1234-5678'}</em>
        <p class="addr">${store.address || '서울시 강남구'}</p>
      </div>
    `;
    })
    .join('');
}

describe('fetchStores', () => {
  it('HTML에서 매장 정보를 파싱한다', async () => {
    const html = createMockStoreHtml([
      {
        name: '다이소 테스트점',
        phone: '02-9999-8888',
        address: '서울시 테스트구 테스트동',
        lat: '37.1234',
        lng: '127.5678',
        start: '1000',
        end: '2100',
      },
    ]);

    mockFetch.mockResolvedValue(new Response(html));

    const stores = await fetchStores('테스트');

    expect(stores).toHaveLength(1);
    expect(stores[0]).toEqual({
      name: '다이소 테스트점',
      phone: '02-9999-8888',
      address: '서울시 테스트구 테스트동',
      lat: 37.1234,
      lng: 127.5678,
      openTime: '10:00',
      closeTime: '21:00',
      options: expect.any(Object),
    });
  });

  it('여러 매장을 파싱한다', async () => {
    const html = createMockStoreHtml([
      { name: '매장1' },
      { name: '매장2' },
      { name: '매장3' },
    ]);

    mockFetch.mockResolvedValue(new Response(html));

    const stores = await fetchStores('서울');

    expect(stores).toHaveLength(3);
  });

  it('옵션 정보를 파싱한다', async () => {
    const html = createMockStoreHtml([
      {
        name: '옵션 테스트점',
        info: {
          shp_pak: 'Y',
          entrramp: 'Y',
          elvtor: 'N',
          ptcard: 'Y',
          ptstk: 'N',
          nmstk: 'Y',
          usim_yn: 'Y',
          tax_free: 'N',
          'ext.group_yn': 'Y',
          online_yn: 'Y',
        },
      },
    ]);

    mockFetch.mockResolvedValue(new Response(html));

    const stores = await fetchStores('테스트');

    expect(stores[0].options).toEqual({
      parking: true,
      ramp: true,
      elevator: false,
      cashless: true,
      photoSticker: false,
      nameSticker: true,
      simCard: true,
      taxFree: false,
      groupOrder: true,
      pickup: true,
    });
  });

  it('group_yn 대체 키를 처리한다', async () => {
    const html = createMockStoreHtml([
      {
        name: '그룹 테스트점',
        info: { group_yn: 'Y' },
      },
    ]);

    mockFetch.mockResolvedValue(new Response(html));

    const stores = await fetchStores('테스트');

    expect(stores[0].options.groupOrder).toBe(true);
  });

  it('data 속성이 없으면 매장을 건너뛴다', async () => {
    const html = `
      <div class="bx-store">
        <h4 class="place">불완전한 매장</h4>
      </div>
    `;

    mockFetch.mockResolvedValue(new Response(html));

    const stores = await fetchStores('테스트');

    expect(stores).toHaveLength(0);
  });

  it('매장명이 없으면 건너뛴다', async () => {
    const html = `
      <div class="bx-store" data-start="0900" data-end="2200" data-lat="37.5" data-lng="127.0">
        <p class="addr">주소만 있음</p>
      </div>
    `;

    mockFetch.mockResolvedValue(new Response(html));

    const stores = await fetchStores('테스트');

    expect(stores).toHaveLength(0);
  });

  it('전화번호가 없으면 빈 문자열로 설정한다', async () => {
    const html = `
      <div class="bx-store" data-start="0900" data-end="2200" data-lat="37.5" data-lng="127.0" data-info='{}'>
        <h4 class="place">전화없음점</h4>
        <p class="addr">주소</p>
      </div>
    `;

    mockFetch.mockResolvedValue(new Response(html));

    const stores = await fetchStores('테스트');

    expect(stores[0].phone).toBe('');
  });

  it('주소가 없으면 빈 문자열로 설정한다', async () => {
    const html = `
      <div class="bx-store" data-start="0900" data-end="2200" data-lat="37.5" data-lng="127.0" data-info='{}'>
        <h4 class="place">주소없음점</h4>
        <em class="phone">T.02-1234-5678</em>
      </div>
    `;

    mockFetch.mockResolvedValue(new Response(html));

    const stores = await fetchStores('테스트');

    expect(stores[0].address).toBe('');
  });

  it('잘못된 data-info JSON을 처리한다', async () => {
    const html = `
      <div class="bx-store" data-start="0900" data-end="2200" data-lat="37.5" data-lng="127.0" data-info='invalid json'>
        <h4 class="place">잘못된정보점</h4>
        <p class="addr">주소</p>
      </div>
    `;

    mockFetch.mockResolvedValue(new Response(html));

    const stores = await fetchStores('테스트');

    // JSON 파싱 실패해도 매장은 반환됨 (옵션은 기본값)
    expect(stores).toHaveLength(1);
    expect(stores[0].options.parking).toBe(false);
  });

  it('data-info가 없으면 기본 옵션을 사용한다', async () => {
    const html = `
      <div class="bx-store" data-start="0900" data-end="2200" data-lat="37.5" data-lng="127.0">
        <h4 class="place">기본옵션점</h4>
        <p class="addr">주소</p>
      </div>
    `;

    mockFetch.mockResolvedValue(new Response(html));

    const stores = await fetchStores('테스트');

    expect(stores).toHaveLength(1);
    expect(stores[0].options.parking).toBe(false);
    expect(stores[0].options.pickup).toBe(false);
  });

  it('검색 파라미터를 URL에 포함한다', async () => {
    mockFetch.mockResolvedValue(new Response(''));

    await fetchStores('강남', '서울', '강남구', '역삼동');

    const calledUrl = mockFetch.mock.calls[0][0];
    expect(calledUrl).toContain('name_address=');
    expect(calledUrl).toContain('sido=');
    expect(calledUrl).toContain('gugun=');
    expect(calledUrl).toContain('dong=');
  });
});

describe('getDistricts', () => {
  it('시도별 구군 목록을 반환한다', async () => {
    const mockResponse = [{ value: '강남구' }, { value: '마포구' }, { value: '서초구' }];

    mockFetch.mockResolvedValue(new Response(JSON.stringify(mockResponse)));

    const districts = await getDistricts('서울');

    expect(districts).toEqual(['강남구', '마포구', '서초구']);
  });
});

describe('getNeighborhoods', () => {
  it('구군별 동 목록을 반환한다', async () => {
    const mockResponse = [{ value: '역삼동' }, { value: '논현동' }];

    mockFetch.mockResolvedValue(new Response(JSON.stringify(mockResponse)));

    const neighborhoods = await getNeighborhoods('서울', '강남구');

    expect(neighborhoods).toEqual(['역삼동', '논현동']);
  });
});

describe('createFindStoresTool', () => {
  it('올바른 도구 정의를 반환한다', () => {
    const tool = createFindStoresTool();

    expect(tool.name).toBe('daiso_find_stores');
    expect(tool.metadata.title).toBe('매장 검색');
  });

  it('핸들러가 검색 결과를 반환한다', async () => {
    const html = createMockStoreHtml([{ name: '테스트점' }]);
    mockFetch.mockResolvedValue(new Response(html));

    const tool = createFindStoresTool();
    const result = await tool.handler({ keyword: '테스트' });

    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.stores).toHaveLength(1);
  });

  it('keyword도 sido도 없으면 에러를 던진다', async () => {
    const tool = createFindStoresTool();

    await expect(tool.handler({})).rejects.toThrow('검색어(keyword) 또는 지역(sido)을 입력해주세요.');
  });

  it('sido만 있어도 검색할 수 있다', async () => {
    mockFetch.mockResolvedValue(new Response(''));

    const tool = createFindStoresTool();
    const result = await tool.handler({ sido: '서울' });

    expect(result.content[0].type).toBe('text');
  });

  it('limit 파라미터로 결과 수를 제한한다', async () => {
    const html = createMockStoreHtml([
      { name: '매장1' },
      { name: '매장2' },
      { name: '매장3' },
    ]);
    mockFetch.mockResolvedValue(new Response(html));

    const tool = createFindStoresTool();
    const result = await tool.handler({ keyword: '테스트', limit: 2 });

    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.stores).toHaveLength(2);
    expect(parsed.totalCount).toBe(3);
    expect(parsed.count).toBe(2);
  });
});
