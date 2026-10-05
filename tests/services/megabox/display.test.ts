/** 메가박스 공식 응답의 표시 문자열 회귀 테스트 */
import { readFileSync } from 'node:fs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  fetchMegaboxBookingList,
  fetchMegaboxTheaterInfo,
} from '../../../src/services/megabox/client.js';
import {
  fetchMegaboxNearbyTheaters,
  resolveMegaboxLocation,
} from '../../../src/services/megabox/location.js';
import { createListNowShowingTool } from '../../../src/services/megabox/tools/listNowShowing.js';
import { createGetRemainingSeatsTool } from '../../../src/services/megabox/tools/getRemainingSeats.js';

const mockFetch = vi.fn();
const fixture = (name: string) =>
  readFileSync(new URL(`../../fixtures/megabox/${name}`, import.meta.url), 'utf8');
beforeEach(() => {
  vi.stubGlobal('fetch', mockFetch);
  mockFetch.mockReset();
});
afterEach(() => vi.unstubAllGlobals());

describe('공식 위치 응답', () => {
  it.each([
    [
      '0079',
      '부산광역시 해운대구 해운대로 813 (좌동, NC백화점 8층) 메가박스 해운대장산지점',
      35.1705551,
      129.177058,
    ],
    [
      '0082',
      '부산광역시 부산진구 중앙대로692번길 16(부전동), 대한프라자 3층',
      35.1542007,
      129.0600191,
    ],
    [
      '0061',
      '부산광역시 금정구 장전로 12번길 55, (장전동) 라퓨타 아일랜드 4층',
      35.2301274,
      129.0880723,
    ],
  ])('%s 지점의 실제 주소와 좌표를 반환한다', async (id, address, latitude, longitude) => {
    mockFetch.mockResolvedValue(new Response(fixture(`theater-${id}-location.html`)));
    expect(await fetchMegaboxTheaterInfo(id as string)).toEqual({
      theaterId: id,
      address,
      latitude,
      longitude,
    });
  });

  it('근처 극장 응답도 표시 이름과 공식 주소를 제공한다', async () => {
    mockFetch.mockResolvedValueOnce(new Response(fixture('booking-theaters.json')));
    for (const id of ['0061', '0082', '0079'])
      mockFetch.mockResolvedValueOnce(new Response(fixture(`theater-${id}-location.html`)));
    const result = await fetchMegaboxNearbyTheaters({
      latitude: 35.1631,
      longitude: 129.1635,
      playDate: '20261006',
    });
    expect(result.theaters.find((v) => v.theaterId === '0079')).toMatchObject({
      theaterName: '해운대(장산)',
      address: '부산광역시 해운대구 해운대로 813 (좌동, NC백화점 8층) 메가박스 해운대장산지점',
    });
    expect(result.theaters.every((v) => v.address.length > 0)).toBe(true);
  });

  it('위치 원문이 없으면 주소를 만들지 않으며 근처 극장에서도 제외한다', async () => {
    mockFetch.mockResolvedValueOnce(new Response('<li><span>교통안내</span> 주소 없음</li>'));
    expect(await fetchMegaboxTheaterInfo('missing')).toEqual({
      theaterId: 'missing',
      address: '',
      latitude: null,
      longitude: null,
    });
    mockFetch
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ areaBrchList: [{ brchNo: 'missing', brchNm: '극장' }] })),
      )
      .mockResolvedValueOnce(new Response('<div>위치 없음</div>'));
    expect((await fetchMegaboxNearbyTheaters({ playDate: '20261006' })).theaters).toEqual([]);
  });

  it('한국 밖 좌표는 조회 전에 거절한다', async () => {
    await expect(resolveMegaboxLocation({ latitude: 1, longitude: 1 })).rejects.toThrow(
      '유효한 위도/경도',
    );
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it.each([createListNowShowingTool, createGetRemainingSeatsTool])(
    '좌표 없는 지점만 있으면 위치 기반 도구가 실패한다',
    async (createTool) => {
      mockFetch
        .mockResolvedValueOnce(
          new Response(JSON.stringify({ areaBrchList: [{ brchNo: 'missing', brchNm: '극장' }] })),
        )
        .mockResolvedValueOnce(new Response('<div>위치 없음</div>'));
      await expect(
        createTool().handler({ playDate: '20261006', latitude: 35.1631, longitude: 129.1635 }),
      ).rejects.toThrow('요청 위치의 메가박스 극장을 찾을 수 없습니다.');
      expect(mockFetch).toHaveBeenCalledTimes(2);
    },
  );

  it.each([
    ['<dt>도로명주소</dt><dd>서울 &amp; 경기</dd><dt>주소</dt><dd>다른 주소</dd>', '서울 & 경기'],
    ['<dt>주소</dt><dd>서울 &#40;중구&#41;</dd>', '서울 (중구)'],
    ['<li><span class="font-gblue">도로명주소 : </span> 부산&nbsp;해운대구</li>', '부산 해운대구'],
  ])('기존 주소 형식과 엔티티를 보존한다', async (html, address) => {
    mockFetch.mockResolvedValue(new Response(html));
    expect((await fetchMegaboxTheaterInfo('legacy')).address).toBe(address);
  });
});

describe('상영 목록 표시 이름', () => {
  it('지원하는 엔티티는 해제하고 알 수 없거나 범위를 벗어난 엔티티는 보존한다', async () => {
    mockFetch.mockResolvedValue(
      new Response(
        JSON.stringify({
          movieList: [
            {
              movieNo: 'M1',
              movieNm: '&lt;영화&gt; &#39;A&#39; &#x1F3AC; &unknown; &constructor; &#99999999;',
            },
          ],
        }),
      ),
    );
    expect((await fetchMegaboxBookingList({ playDate: '20261006' })).movies[0].movieName).toBe(
      "<영화> 'A' 🎬 &unknown; &constructor; &#99999999;",
    );
  });
  it('극장과 영화, 상영시간 이름의 엔티티를 해제한다', async () => {
    const theaterName = '해운대&#40;장산&#41;';
    const movieName = 'A &amp; B &#x28;특별판&#x29; &quot;영화&quot; &apos;2&apos;';
    mockFetch.mockResolvedValue(
      new Response(
        JSON.stringify({
          areaBrchList: [{ brchNo: '0079', brchNm: theaterName }],
          movieList: [{ movieNo: 'M1', movieNm: movieName }],
          movieFormList: [
            {
              playSchdlNo: 'S1',
              movieNo: 'M1',
              brchNo: '0079',
              movieNm: movieName,
              brchNm: theaterName,
            },
          ],
        }),
      ),
    );
    const result = await fetchMegaboxBookingList({ playDate: '20261006' });
    expect(result.theaters[0].theaterName).toBe('해운대(장산)');
    expect(result.movies[0].movieName).toBe('A & B (특별판) "영화" \'2\'');
    expect(result.showtimes[0]).toMatchObject({
      theaterName: '해운대(장산)',
      movieName: result.movies[0].movieName,
    });
  });
});
