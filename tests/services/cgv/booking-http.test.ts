/** 공식 웹 시간표 경로를 서버·직접 점검·중계에 동일하게 적용합니다. */
import { afterEach, expect, it, vi } from 'vitest';
import { requestCgv } from '../../../src/services/cgv/transport.js';
import { requestDirectRoute } from '../../../src/utils/directRoutes.js';
import { createCgvRelay } from '../../../scripts/relay/cgv.js';
const path = '/cnm/atkt/searchMovScnInfo';
const body = { theaterCode: '0056', playDate: '20261020' };
const params = new URLSearchParams({ coCd: 'A420', siteNo: body.theaterCode, scnYmd: body.playDate, rtctlScopCd: '08' });
const payload = { statusCode: 0, data: [{ siteNo: '0056', scnYmd: '20261020', atktPsblQty: 12 }] };
afterEach(() => vi.unstubAllGlobals());
it.each(['client', 'direct', 'relay'])('공식 웹과 같은 고정 시간표 URL·헤더로 조회한다: %s', async (mode) => {
  const fetcher = vi.fn(async (input: URL | RequestInfo, init?: RequestInit) => {
    const url = new URL(String(input));
    const headers = new Headers(init?.headers);
    if (url.origin !== 'https://cgv.co.kr' || url.pathname !== '/api/v1/booking/searchMovScnInfo' ||
      headers.get('Origin') !== 'https://cgv.co.kr' ||
      headers.get('Referer') !== 'https://cgv.co.kr/cnm/movieBook/cinema' ||
      headers.get('Sec-Fetch-Site') !== 'same-origin') return new Response('blocked', { status: 403 });
    expect(Object.fromEntries(url.searchParams)).toEqual(Object.fromEntries(params));
    return Response.json(payload);
  });
  vi.stubGlobal('fetch', fetcher);
  if (mode === 'client') expect(await requestCgv(path, params, 1000)).toEqual(payload);
  else if (mode === 'direct') expect(await requestDirectRoute('cgv-timetable', body, 1000)).toEqual(payload);
  else {
    const relay = createCgvRelay('test-token', { takeQuota: async () => true, fetcher });
    const response = await relay(new Request('http://localhost/v1/cgv/timetable', {
      method: 'POST', headers: { Authorization: 'Bearer test-token', 'Content-Type': 'application/json' }, body: JSON.stringify(body),
    }));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual(payload);
  }
  expect(fetcher).toHaveBeenCalledTimes(1);
});
