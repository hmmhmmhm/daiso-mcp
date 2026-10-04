import { afterEach, expect, it, vi } from 'vitest';
import { fetchCgvNearbyTheaters } from '../src/services/cgv/location.js';
vi.mock('../src/services/cgv/client.js', () => ({
  fetchCgvTheaters: vi
    .fn()
    .mockResolvedValue([
      ...Array.from({ length: 12 }, (_, i) => ({
        theaterCode: String(i),
        theaterName: `서울${i}`,
        regionCode: '01',
      })),
      { theaterCode: 'busan', theaterName: '서면', regionCode: '05' },
    ]),
}));
afterEach(() => vi.unstubAllGlobals());
it('부산 좌표는 전국 첫 12개 대신 주변 CGV 장소를 공식 목록과 연결한다', async () => {
  const mockFetch = vi
    .fn()
    .mockResolvedValue(
      new Response(
        JSON.stringify({
          documents: [
            { place_name: 'CGV 서면', address_name: '부산 부산진구', x: '129.06', y: '35.15' },
          ],
        }),
      ),
    );
  vi.stubGlobal('fetch', mockFetch);
  const result = await fetchCgvNearbyTheaters(
    { latitude: 35.115, longitude: 129.041, playDate: '20261005' },
    { kakaoRestApiKey: 'free' },
  );
  expect(result.theaters).toHaveLength(1);
  expect(result.theaters[0]).toMatchObject({ theaterCode: 'busan', latitude: 35.15 });
  expect(result.theaters[0].distanceKm).toBeGreaterThan(0);
  expect(mockFetch).toHaveBeenCalledTimes(1);
});
it('키워드 좌표 해석 실패를 null거리의 근처 극장 성공으로 반환하지 않는다', async () => {
  vi.stubGlobal('fetch', vi.fn());
  await expect(fetchCgvNearbyTheaters({ keyword: '부산역', playDate: '20261005' })).rejects.toThrow(
    '위치를 좌표로 변환하지 못했습니다',
  );
});
it('잘못된 장소 이름을 건너뛰고 공식 극장과 연결한다', async () => {
 vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({ documents: [{ place_name: 123, x: '129', y: '35' }, { place_name: 'CGV 서면', x: '129.06', y: '35.15' }] }))));
 expect((await fetchCgvNearbyTheaters({ latitude: 35.115, longitude: 129.041, playDate: '20261005' }, { kakaoRestApiKey: 'free' })).theaters).toHaveLength(1);
});
it('입력이 없으면 근처 극장을 만들지 않고 좌표가 잘못되면 거부한다', async () => {
 expect((await fetchCgvNearbyTheaters({ playDate: '20261005' })).theaters).toEqual([]);
 await expect(fetchCgvNearbyTheaters({ latitude: 0, longitude: 0, playDate: '20261005' })).rejects.toThrow('유효한 위도');
});
it('공식 이름과 일치하지 않는 장소나 잘못된 좌표는 결과에서 제외한다', async () => {
 vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({ documents: [{ place_name: 'CGV 가짜', x: '129', y: '35' }, { place_name: 'CGV 서면', x: '0', y: '0' }, { x: '129', y: '35' }] }))));
 expect((await fetchCgvNearbyTheaters({ latitude: 35.115, longitude: 129.041, playDate: '20261005' }, { kakaoRestApiKey: 'free' })).theaters).toEqual([]);
});
it('같은 거리의 극장은 이름순으로 안정적으로 정렬한다', async () => {
 vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({ documents: [{ place_name: 'CGV 서울1', x: '129.06', y: '35.15' }, { place_name: 'CGV 서면', x: '129.06', y: '35.15' }, { place_name: 'CGV 서울2', x: '129.08', y: '35.17' }] }))));
 const result = await fetchCgvNearbyTheaters({ latitude: 35.115, longitude: 129.041, playDate: '20261005' }, { kakaoRestApiKey: 'free' });
 expect(result.theaters.map((theater) => theater.theaterName)).toEqual(['서면', '서울1', '서울2']);
});
it.each(['searchMovies', 'getTimetable'])('위치가 해석돼도 주변 공식 극장이 없으면 %s 결과는 비운다', async (toolName) => {
 const tool = toolName === 'searchMovies'
 ? (await import('../src/services/cgv/tools/searchMovies.js')).createSearchMoviesTool()
 : (await import('../src/services/cgv/tools/getTimetable.js')).createGetTimetableTool();
 const result = await tool.handler({ latitude: 35.115, longitude: 129.041, playDate: '20261005' });
 expect(JSON.parse(result.content[0].text).resolvedTheater).toBeNull();
});
