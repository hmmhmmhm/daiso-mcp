import { afterEach, expect, it, vi } from 'vitest';
import {
  fetchDtryxNowShowing,
  fetchDtryxPlayDates,
  fetchDtryxTimetable,
} from '../../../src/services/dtryx/client.js';
const params = { brandCode: 'indieart', cinemaCode: '000067' };
const options = {
  relayUrl: 'https://relay.example',
  relayToken: 'test-token',
  accessClientId: 'test-id',
  accessClientSecret: 'test-secret',
};
afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});
it('세 경로를 고정 POST와 요청별 인증으로 중계한다', async () => {
  const fetchMock = vi
    .fn()
    .mockImplementation(() =>
      Promise.resolve(Response.json({ RetCode: 'success', Recordset: [] })),
    );
  vi.stubGlobal('fetch', fetchMock);
  await fetchDtryxNowShowing(params, options);
  await fetchDtryxPlayDates(params, options);
  await fetchDtryxTimetable({ ...params, playDate: '2026-09-28' }, options);
  expect(fetchMock.mock.calls.map((c) => c[0])).toEqual([
    'https://relay.example/v1/dtryx/movies',
    'https://relay.example/v1/dtryx/play-dates',
    'https://relay.example/v1/dtryx/timetable',
  ]);
  expect(fetchMock.mock.calls[2][1]).toMatchObject({
    method: 'POST',
    redirect: 'manual',
    body: JSON.stringify({ ...params, playDate: '20260928' }),
    headers: {
      Authorization: 'Bearer test-token',
      'CF-Access-Client-Id': 'test-id',
      'CF-Access-Client-Secret': 'test-secret',
    },
  });
});
it.each([429, 502, 503, 504, 302, 401, 500])(
  '중계 오류 %s를 안전하게 전달하고 재시도하지 않는다',
  async (status) => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(new Response('test-secret private upstream', { status }));
    vi.stubGlobal('fetch', fetchMock);
    await expect(fetchDtryxNowShowing(params, options)).rejects.toMatchObject({
      status: [429, 502, 503, 504].includes(status) ? status : 502,
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  },
);
it.each([
  'http://remote.example',
  'https://user:pass@relay.example',
  'https://relay.example?secret=a',
  'https://relay.example/#x',
  '',
  'bad',
])('잘못된 URL %s 설정에서 직접 호출하지 않는다', async (relayUrl) => {
  const fetchMock = vi.fn();
  vi.stubGlobal('fetch', fetchMock);
  await expect(fetchDtryxNowShowing(params, { ...options, relayUrl })).rejects.toMatchObject({
    code: 'DTRYX_RELAY_CONFIG_ERROR',
    retryable: false,
  });
  expect(fetchMock).not.toHaveBeenCalled();
});
it.each([
  { relayToken: '' },
  { accessClientId: '' },
  { accessClientSecret: undefined },
  { relayUrl: undefined },
])('불완전한 중계 설정을 거부한다 %j', async (overrides) => {
  vi.stubGlobal('fetch', vi.fn());
  await expect(fetchDtryxNowShowing(params, { ...options, ...overrides })).rejects.toMatchObject({
    code: 'DTRYX_RELAY_CONFIG_ERROR',
  });
});
it.each([
  'private invalid json',
  '{"RetCode":"fail","Recordset":[]}',
  '{"RetCode":"success","Recordset":[null]}',
])('잘못된 본문을 노출하지 않는다 %s', async (body) => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(body)));
  await expect(fetchDtryxNowShowing(params, options)).rejects.toMatchObject({
    code: 'DTRYX_RELAY_FAILED',
    status: 502,
  });
});
it('네트워크 오류 원문을 노출하지 않는다', async () => {
  vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('test-secret')));
  await expect(fetchDtryxNowShowing(params, options)).rejects.toMatchObject({
    message: '디트릭스 릴레이 요청에 실패했습니다.',
    status: 502,
  });
});
it('본문 읽기에도 제한 시간을 적용한다', async () => {
  vi.useFakeTimers();
  vi.stubGlobal(
    'fetch',
    vi.fn().mockImplementation((_url, init) =>
      Promise.resolve({
        status: 200,
        json: () =>
          new Promise((_resolve, reject) =>
            init.signal.addEventListener('abort', () =>
              reject(new DOMException('aborted', 'AbortError')),
            ),
          ),
      }),
    ),
  );
  const result = expect(
    fetchDtryxNowShowing({ ...params, timeout: 10 }, options),
  ).rejects.toMatchObject({ status: 504 });
  await vi.advanceTimersByTimeAsync(10);
  await result;
});
it('로컬 중계는 Access 없이 사용할 수 있다', async () => {
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue(Response.json({ RetCode: 'success', Recordset: [] })),
  );
  await expect(
    fetchDtryxNowShowing(params, { relayUrl: 'http://127.0.0.1:4320/', relayToken: 'test' }),
  ).resolves.toEqual([]);
});
it.each([
  'null',
  '{}',
  '{"RetCode":"success"}',
  '{"RetCode":"success","Recordset":{}}',
  '{"RetCode":"success","Recordset":[[]]}',
])('다양한 잘못된 응답 계약을 거부한다 %s', async (body) => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(body)));
  await expect(fetchDtryxNowShowing(params, options)).rejects.toMatchObject({ status: 502 });
});
it('실패 응답 본문을 취소하되 취소 완료를 기다리지 않는다', async () => {
  const cancel = vi.fn().mockImplementation(() => new Promise(() => {}));
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ status: 302, body: { cancel } }));
  await expect(fetchDtryxNowShowing(params, options)).rejects.toMatchObject({ status: 502 });
  expect(cancel).toHaveBeenCalledOnce();
});
it('실패 응답 본문 취소 오류를 흡수한다', async () => {
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue({
      status: 302,
      body: { cancel: () => Promise.reject(new Error('private')) },
    }),
  );
  await expect(fetchDtryxNowShowing(params, options)).rejects.toMatchObject({ status: 502 });
});
it('본문 없는 실패 응답을 처리한다', async () => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(null, { status: 503 })));
  await expect(fetchDtryxNowShowing(params, options)).rejects.toMatchObject({ status: 503 });
});
it('실패 응답 이후 연결도 중단한다', async () => {
  const fetchMock = vi
    .fn()
    .mockResolvedValue({ status: 302, body: { cancel: () => new Promise(() => {}) } });
  vi.stubGlobal('fetch', fetchMock);
  await expect(fetchDtryxNowShowing(params, options)).rejects.toMatchObject({ status: 502 });
  expect(fetchMock.mock.calls[0][1].signal.aborted).toBe(true);
});
