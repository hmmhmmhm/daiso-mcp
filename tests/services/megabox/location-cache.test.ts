import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import {
  __testOnlyClearMegaboxLocationCaches,
  fetchMegaboxNearbyTheaters,
} from '../../../src/services/megabox/location.js';

const params = { latitude: 37.5, longitude: 127, areaCode: '11', playDate: '20261011', limit: 1 };
const fetcher = vi.fn();
beforeEach(() => {
  __testOnlyClearMegaboxLocationCaches();
  fetcher.mockReset().mockImplementation(async (url: string) => {
    if (String(url).includes('selectBokdList'))
      return Response.json({
        areaBrchList: [
          { brchNo: 'one', brchNm: '멀리' },
          { brchNo: 'two', brchNm: '가까이' },
        ],
      });
    return new Response(
      '<a href="?lat=37.5&lng=127.0">지도</a><li><span>도로명주소 : </span>서울 지점</li>',
    );
  });
  vi.stubGlobal('fetch', fetcher);
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

it('지점 좌표와 주소는 재사용하고 상영 목록은 매번 조회한다', async () => {
  const first = await fetchMegaboxNearbyTheaters(params);
  first.theaters[0].address = 'changed';
  const second = await fetchMegaboxNearbyTheaters(params);
  expect(second.theaters[0].address).toBe('서울 지점');
  expect(
    fetcher.mock.calls.filter(([url]) => !String(url).includes('selectBokdList')),
  ).toHaveLength(2);
  expect(fetcher.mock.calls.filter(([url]) => String(url).includes('selectBokdList'))).toHaveLength(
    2,
  );
});

it('운영 fresh 옵션은 정적 지점 캐시를 우회한다', async () => {
  await fetchMegaboxNearbyTheaters(params);
  await fetchMegaboxNearbyTheaters(params, { bypassCache: true });
  expect(fetcher).toHaveBeenCalledTimes(6);
});
