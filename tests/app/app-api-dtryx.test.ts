/**
 * 앱 통합 테스트 - 디트릭스 API
 */

import { describe, expect, it, vi } from 'vitest';
import app from '../../src/index.js';
import { setupFetchMock } from './testHelpers.js';

const mockFetch = vi.fn();
setupFetchMock(mockFetch);

function timetableResponse() {
  return new Response(
    JSON.stringify({
      Recordset: [
        {
          CinemaCd: '000067',
          CinemaNm: '아트하우스모모',
          ScreenCd: '02',
          ScreenNm: '2관',
          PlaySDT: '2026-08-20',
          ShowSeq: 1,
          StartTime: '13:30',
          EndTime: '15:13',
          MovieCd: '027030',
          MovieNm: '콘크리트 녹색섬',
          TotalSeatCnt: 138,
          RemainSeatCnt: 128,
        },
      ],
    }),
  );
}

describe('GET /api/dtryx/cinemas', () => {
  it('극장 목록을 반환한다', async () => {
    const res = await app.request('/api/dtryx/cinemas');
    expect(res.status).toBe(200);

    const data = await res.json();
    expect(data.success).toBe(true);
    expect(data.data.count).toBeGreaterThan(0);
  });

  it('지역으로 걸러낸다', async () => {
    const res = await app.request('/api/dtryx/cinemas?region=경기');
    const data = await res.json();

    expect(data.data.count).toBe(3);
  });
});

describe('GET /api/dtryx/movies', () => {
  it('상영작을 반환한다', async () => {
    mockFetch.mockResolvedValue(
      new Response(JSON.stringify({ Recordset: [{ MovieCd: '1', MovieNm: '경멸' }] })),
    );

    const res = await app.request('/api/dtryx/movies?cinemaCode=000067');
    expect(res.status).toBe(200);

    const data = await res.json();
    expect(data.data.count).toBe(1);
  });

  it('극장을 찾지 못하면 404 를 반환한다', async () => {
    const res = await app.request('/api/dtryx/movies?keyword=없는극장');

    expect(res.status).toBe(404);
  });
});

describe('GET /api/dtryx/seats', () => {
  it('회차와 좌석을 반환한다', async () => {
    mockFetch.mockResolvedValue(timetableResponse());

    const res = await app.request('/api/dtryx/seats?cinemaCode=000067&playDate=20260820');
    expect(res.status).toBe(200);

    const data = await res.json();
    expect(data.data.count).toBe(1);
    expect(data.data.showtimes[0].bookedSeats).toBe(10);
  });

  it('극장을 찾지 못하면 404 를 반환한다', async () => {
    const res = await app.request('/api/dtryx/seats?cinemaCode=000999');

    expect(res.status).toBe(404);
  });
});
