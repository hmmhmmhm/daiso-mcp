/**
 * 메가박스 클라이언트 테스트
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  fetchMegaboxBookingList,
  fetchMegaboxTheaterInfo,
  toYyyymmdd,
} from '../../../src/services/megabox/client.js';

const mockFetch = vi.fn();

beforeEach(() => {
  mockFetch.mockReset();
  vi.stubGlobal('fetch', mockFetch);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('fetchMegaboxBookingList', () => {
  it('상영 목록을 정규화한다', async () => {
    mockFetch.mockResolvedValue(
      new Response(
        JSON.stringify({
          areaBrchList: [{ brchNo: '1372', brchNm: '강남' }],
          movieList: [{ movieNo: 'M1', movieNm: '영화A', movieStatCdNm: '상영중' }],
          movieFormList: [
            {
              playSchdlNo: 'S1',
              movieNo: 'M1',
              movieNm: '영화A',
              brchNo: '1372',
              brchNm: '강남',
              playDe: '20260304',
              playStartTime: '0930',
              playEndTime: '1120',
              restSeatCnt: '12',
              totSeatCnt: '100',
            },
          ],
        }),
      ),
    );

    const result = await fetchMegaboxBookingList({
      playDate: '20260304',
      theaterId: '1372',
      movieId: 'M1',
    });

    expect(result.theaters[0]).toEqual({ theaterId: '1372', theaterName: '강남' });
    expect(result.movies[0].movieStatus).toBe('상영중');
    expect(result.showtimes[0].startTime).toBe('09:30');
    expect(result.showtimes[0].totalSeats).toBe(100);
    expect(result.showtimes[0].remainingSeats).toBe(12);
  });

  it('비정상 응답값을 기본값으로 처리한다', async () => {
    mockFetch.mockResolvedValue(
      new Response(
        JSON.stringify({
          movieFormList: [
            {
              playSchdlNo: 'S2',
              movieNo: 'M2',
              brchNo: '1372',
              playStartTime: '9',
              playEndTime: '10',
              restSeatCnt: 'abc',
            },
          ],
        }),
      ),
    );

    const result = await fetchMegaboxBookingList({ playDate: '20260304' });

    expect(result.showtimes[0].startTime).toBe('9');
    expect(result.showtimes[0].endTime).toBe('10');
    expect(result.showtimes[0].totalSeats).toBeNull();
    expect(result.showtimes[0].remainingSeats).toBeNull();
  });

  it('시간 포맷 분기(콜론 포함/기타)를 처리한다', async () => {
    mockFetch.mockResolvedValue(
      new Response(
        JSON.stringify({
          movieFormList: [
            {
              playSchdlNo: 'S3',
              movieNo: 'M3',
              brchNo: '1372',
              playStartTime: '09:30',
              playEndTime: '123',
            },
          ],
        }),
      ),
    );

    const result = await fetchMegaboxBookingList({ playDate: '20260304' });
    expect(result.showtimes[0].startTime).toBe('09:30');
    expect(result.showtimes[0].endTime).toBe('123');
  });

  it('시간 값이 없으면 빈 문자열을 반환한다', async () => {
    mockFetch.mockResolvedValue(
      new Response(
        JSON.stringify({
          movieFormList: [
            {
              playSchdlNo: 'S4',
              movieNo: 'M4',
              brchNo: '1372',
            },
          ],
        }),
      ),
    );

    const result = await fetchMegaboxBookingList({ playDate: '20260304' });
    expect(result.showtimes[0].startTime).toBe('');
    expect(result.showtimes[0].endTime).toBe('');
  });

  it('HTTP 에러를 처리한다', async () => {
    mockFetch.mockResolvedValue(new Response('fail', { status: 500 }));

    await expect(fetchMegaboxBookingList({ playDate: '20260304' })).rejects.toThrow(
      '메가박스 상영 목록 조회 실패: 500',
    );
  });

  it('AbortError를 시간 초과 에러로 변환한다', async () => {
    mockFetch.mockRejectedValue(new DOMException('aborted', 'AbortError'));

    await expect(fetchMegaboxBookingList({ playDate: '20260304' })).rejects.toThrow(
      '메가박스 상영 목록 조회 시간 초과',
    );
  });

  it('타임아웃 콜백이 실행되면 abort를 호출한다', async () => {
    vi.spyOn(globalThis, 'setTimeout').mockImplementation(((callback: TimerHandler) => {
      if (typeof callback === 'function') {
        callback();
      }
      return 1 as unknown as ReturnType<typeof setTimeout>;
    }) as typeof setTimeout);
    mockFetch.mockRejectedValue(new DOMException('aborted', 'AbortError'));

    await expect(fetchMegaboxBookingList({ playDate: '20260304' })).rejects.toThrow(
      '메가박스 상영 목록 조회 시간 초과',
    );
  });
});

describe('fetchMegaboxTheaterInfo', () => {
  it('도로명주소와 좌표를 파싱한다', async () => {
    mockFetch.mockResolvedValue(
      new Response(
        '<dt>도로명주소</dt><dd>서울 강남구 강남대로</dd><a href="?lng=127.01&lat=37.50">지도</a>',
      ),
    );

    const result = await fetchMegaboxTheaterInfo('1372');

    expect(result.address).toBe('서울 강남구 강남대로');
    expect(result.latitude).toBe(37.5);
    expect(result.longitude).toBe(127.01);
  });

  it('일반 주소와 mapLat/mapLng 파싱을 지원한다', async () => {
    mockFetch.mockResolvedValue(
      new Response(
        "<dt>주소</dt><dd>서울시 중구</dd><script>mapLat:'37.56';mapLng:'126.97';</script>",
      ),
    );

    const result = await fetchMegaboxTheaterInfo('1000');

    expect(result.address).toBe('서울시 중구');
    expect(result.latitude).toBe(37.56);
    expect(result.longitude).toBe(126.97);
  });

  it('좌표/주소가 없으면 null/빈 문자열을 반환한다', async () => {
    mockFetch.mockResolvedValue(new Response('<div>no address</div>'));

    const result = await fetchMegaboxTheaterInfo('1001');

    expect(result.address).toBe('');
    expect(result.latitude).toBeNull();
    expect(result.longitude).toBeNull();
  });

  it('HTTP 에러를 처리한다', async () => {
    mockFetch.mockResolvedValue(new Response('fail', { status: 404 }));

    await expect(fetchMegaboxTheaterInfo('1372')).rejects.toThrow(
      '메가박스 지점 정보 조회 실패: 404',
    );
  });

  it('AbortError를 시간 초과 에러로 변환한다', async () => {
    mockFetch.mockRejectedValue(new DOMException('aborted', 'AbortError'));

    await expect(fetchMegaboxTheaterInfo('1372')).rejects.toThrow(
      '메가박스 지점 정보 조회 시간 초과',
    );
  });
});

describe('toYyyymmdd', () => {
  it('Date를 YYYYMMDD로 변환한다', () => {
    const value = toYyyymmdd(new Date('2026-03-04T00:00:00.000Z'));
    expect(value).toBe('20260304');
  });
});
