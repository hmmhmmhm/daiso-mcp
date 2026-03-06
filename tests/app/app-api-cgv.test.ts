/**
 * 앱 통합 테스트 - CGV API
 */

import { describe, expect, it, vi } from 'vitest';
import app from '../../src/index.js';
import { setupFetchMock } from './testHelpers.js';

const mockFetch = vi.fn();
setupFetchMock(mockFetch);

describe('GET /api/cgv/theaters', () => {
  it('CGV 극장 목록을 반환한다', async () => {
    mockFetch.mockResolvedValue(
      new Response(
        JSON.stringify({
          statusCode: 0,
          statusMessage: '조회 되었습니다.',
          data: [
            {
              regnGrpCd: '01',
              regnGrpNm: '서울',
              siteList: [{ siteNo: '0056', siteNm: '강남' }],
            },
          ],
        }),
      ),
    );

    const res = await app.request('/api/cgv/theaters?playDate=20260304&regionCode=01');
    expect(res.status).toBe(200);

    const data = await res.json();
    expect(data.success).toBe(true);
    expect(data.data.theaters).toHaveLength(1);
  });
});

describe('GET /api/cgv/movies', () => {
  it('CGV 영화 목록을 반환한다', async () => {
    mockFetch.mockResolvedValue(
      new Response(
        JSON.stringify({
          statusCode: 0,
          statusMessage: '조회 되었습니다.',
          data: [{ movNo: '30000985', movNm: '영화A', cratgClsNm: '12세' }],
        }),
      ),
    );

    const res = await app.request('/api/cgv/movies?playDate=20260304&theaterCode=0056');
    expect(res.status).toBe(200);

    const data = await res.json();
    expect(data.success).toBe(true);
    expect(data.data.movies).toHaveLength(1);
  });
});

describe('GET /api/cgv/timetable', () => {
  it('CGV 시간표를 반환한다', async () => {
    mockFetch.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          statusCode: 0,
          statusMessage: '조회 되었습니다.',
          data: [
            {
              siteNo: '0056',
              siteNm: 'CGV강남',
              scnYmd: '20260304',
              scnSseq: '1',
              movNo: 'M1',
              movNm: '영화A',
              scnsrtTm: '0930',
              scnendTm: '1130',
              stcnt: 100,
              frSeatCnt: 30,
            },
          ],
        }),
      ),
    );

    const res = await app.request('/api/cgv/timetable?playDate=20260304&theaterCode=0056');
    expect(res.status).toBe(200);

    const data = await res.json();
    expect(data.success).toBe(true);
    expect(data.data.timetable).toHaveLength(1);
  });
});
