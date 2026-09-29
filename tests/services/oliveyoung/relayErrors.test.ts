import { afterEach, expect, it, vi } from 'vitest';
import { requestOliveyoung } from '../../../src/services/oliveyoung/transport.js';

const options = { relayUrl: 'https://private-relay.example', relayToken: 'private-token' };
afterEach(() => vi.unstubAllGlobals());

it.each([
  [429, 429, true], [502, 502, true], [503, 503, true],
  [401, 502, false], [403, 502, false], [302, 502, false], [201, 502, false],
  [408, 502, true], [500, 502, true],
])('릴레이 HTTP %i의 상태와 재시도 가능 여부를 비밀 없이 보존한다', async (upstreamStatus, status, retryable) => {
  const fetch = vi.fn().mockResolvedValue(new Response('private-token private-relay.example', {
    status: upstreamStatus,
    statusText: 'private-token',
  }));
  vi.stubGlobal('fetch', fetch);
  const error = await requestOliveyoung('/p', {}, options).catch((caught: unknown) => caught);
  expect(error).toMatchObject({ code: 'OLIVEYOUNG_RELAY_HTTP_ERROR', status, upstreamStatus, retryable });
  expect(String(error)).toContain(`HTTP ${upstreamStatus}`);
  expect(String(error)).not.toContain('private-');
  expect(JSON.stringify(error)).not.toContain('private-');
  expect(error).not.toHaveProperty('cause');
  expect(fetch).toHaveBeenCalledTimes(1);
  expect(fetch.mock.calls[0][1].redirect).toBe('manual');
});

it.each([
  [new DOMException('private-token', 'AbortError'), 'TIMEOUT', 504, true],
  [new DOMException('private-token', 'TimeoutError'), 'TIMEOUT', 504, true],
  [new TypeError('private-relay.example private-token'), 'NETWORK_ERROR', 502, true],
  ['private-token', 'NETWORK_ERROR', 502, true],
])('릴레이 요청 실패를 안전한 원인으로 구분한다: %s', async (failure, suffix, status, retryable) => {
  const fetch = vi.fn().mockRejectedValue(failure);
  vi.stubGlobal('fetch', fetch);
  const error = await requestOliveyoung('/p', {}, options).catch((caught: unknown) => caught);
  expect(error).toMatchObject({ code: `OLIVEYOUNG_RELAY_${suffix}`, status, retryable });
  expect(JSON.stringify(error)).not.toContain('private-');
  expect(String(error)).not.toContain('private-');
  expect(error).not.toHaveProperty('cause');
  expect(fetch).toHaveBeenCalledTimes(1);
});

it.each(['<html>private-token</html>', '{private-token'])('릴레이의 잘못된 응답 원문을 노출하지 않는다', async (body) => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(body)));
  const error = await requestOliveyoung('/p', {}, options).catch((caught: unknown) => caught);
  expect(error).toMatchObject({ code: 'OLIVEYOUNG_RELAY_INVALID_RESPONSE', status: 502, retryable: false });
  expect(String(error)).not.toContain('private-token');
  expect(error).not.toHaveProperty('cause');
});

it.each([null, {}, { status: 'private-token' }])('릴레이 실패 봉투의 상태 원문도 노출하지 않는다', async (response) => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json(response)));
  const error = await requestOliveyoung('/p', {}, options).catch((caught: unknown) => caught);
  expect(error).toMatchObject({ code: 'OLIVEYOUNG_RELAY_INVALID_RESPONSE', status: 502, retryable: false });
  expect(String(error)).not.toContain('private-token');
});

it('릴레이 응답 본문을 읽는 중 실제 제한 시간이 지나도 시간 초과 원인을 유지한다', async () => {
  vi.useFakeTimers();
  vi.stubGlobal('fetch', vi.fn(async (_url: string, request: RequestInit) => ({
    text: () => new Promise((_resolve, reject) => request.signal!.addEventListener('abort', () => reject(new DOMException('private-token', 'AbortError')))),
  })));
  try {
    const request = requestOliveyoung('/p', {}, { ...options, timeout: 10 });
    const assertion = expect(request).rejects.toMatchObject({ code: 'OLIVEYOUNG_RELAY_TIMEOUT', status: 504, retryable: true });
    await vi.waitFor(() => expect(fetch).toHaveBeenCalled());
    await vi.advanceTimersByTimeAsync(10);
    await assertion;
  } finally {
    vi.useRealTimers();
  }
});
