/**
 * 디트릭스 API 상수 테스트
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DTRYX_API } from '../../../src/services/dtryx/api.js';
import {
  fetchDtryxNowShowing,
  fetchDtryxPlayDates,
  fetchDtryxTimetable,
} from '../../../src/services/dtryx/client.js';

describe('디트릭스 API 상수', () => {
  it('표준 포트를 사용한다', () => {
    const url = new URL(DTRYX_API.BASE_URL);

    expect(url.protocol).toBe('https:');
    expect(url.port).toBe('');
  });

  it('비표준 포트를 포함하지 않는다', () => {
    // Cloudflare Workers 배포 환경에서 비표준 포트로 나가는 호출이
    // 간헐적으로 실패해 표준 포트를 유지해야 합니다.
    expect(DTRYX_API.BASE_URL).not.toMatch(/:\d+$/);
  });
});

describe('디트릭스 요청 URL', () => {
  const mockFetch = vi.fn();

  beforeEach(() => {
    mockFetch.mockReset();
    mockFetch.mockResolvedValue(
      new Response(JSON.stringify({ RetCode: 'success', Recordset: [] }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    );
    vi.stubGlobal('fetch', mockFetch);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  const request = { brandCode: 'indieart', cinemaCode: '000067' };

  it('상영시간표 요청이 표준 포트로 나간다', async () => {
    await fetchDtryxTimetable({ ...request, playDate: '20260918' });

    expect(new URL(String(mockFetch.mock.calls[0]?.[0])).port).toBe('');
  });

  it('상영 날짜 요청이 표준 포트로 나간다', async () => {
    await fetchDtryxPlayDates(request);

    expect(new URL(String(mockFetch.mock.calls[0]?.[0])).port).toBe('');
  });

  it('상영작 요청이 표준 포트로 나간다', async () => {
    await fetchDtryxNowShowing(request);

    expect(new URL(String(mockFetch.mock.calls[0]?.[0])).port).toBe('');
  });
});
