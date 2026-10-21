import { afterEach, expect, it, vi } from 'vitest';
import { requestJapanProductRelay, japanProductTransportFromBindings } from '../../../src/services/daisoJp/productRelay.js';
const raw = { handle: '4550746075917', title: 'ボウル', price: 22000, available: true };
const options = { relayUrl: 'https://relay.example', relayToken: 'test-token' };
afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers(); });
it('명시한 중계에서 같은 상품만 인증된 고정 경로로 읽는다', async () => {
  expect(japanProductTransportFromBindings()).toEqual({});
  expect(japanProductTransportFromBindings({ DAISO_JP_PRODUCT_RELAY_ENABLED: 'true', DTRYX_RELAY_URL: options.relayUrl, DTRYX_RELAY_TOKEN: options.relayToken })).toEqual({ productRelay: { ...options, accessClientId: undefined, accessClientSecret: undefined, bypassCache: false } });
  const fetcher = vi.fn(async () => Response.json(raw)); vi.stubGlobal('fetch', fetcher);
  expect(await requestJapanProductRelay(raw.handle, { ...options, bypassCache: true, accessClientId: 'test-id', accessClientSecret: 'test-secret' })).toMatchObject({ id: raw.handle, onlineAvailable: true, price: 220 });
  const [url, init] = fetcher.mock.calls[0] as unknown as [string, RequestInit];
  expect(url).toBe('https://relay.example/v1/daiso-jp/product');
  expect(init.redirect).toBe('manual');
  expect(init.headers).toMatchObject({ Authorization: 'Bearer test-token', 'x-relay-cache-bypass': 'true', 'CF-Access-Client-Id': 'test-id' });
});
it.each([{}, { relayUrl: options.relayUrl }, { ...options, relayToken: ' ' }, { ...options, accessClientId: ' ', accessClientSecret: 'x' }, { ...options, accessClientId: 'x', accessClientSecret: ' ' }, { relayUrl: 'http://remote.example', relayToken: 'x' }, { ...options, accessClientId: 'x' }, { ...options, accessClientSecret: 'x' }])('불완전한 중계 설정은 원본 요청 전에 거절한다', async (p) => {
  vi.stubGlobal('fetch', vi.fn());
  await expect(requestJapanProductRelay(raw.handle, p)).rejects.toMatchObject({ code: 'DAISO_JP_RELAY_CONFIG_ERROR' });
  expect(fetch).not.toHaveBeenCalled();
});
it.each([302, 401, 429, 503, 504])('중계 HTTP%i를 성공으로 바꾸지 않는다', async (status) => {
  vi.stubGlobal('fetch', vi.fn(async () => new Response('private body', { status })));
  await expect(requestJapanProductRelay(raw.handle, options)).rejects.toMatchObject({ upstreamStatus: status });
});
it('본문 없는 중계 실패도 오류로 유지한다', async () => {
  vi.stubGlobal('fetch', vi.fn(async () => new Response(null, { status: 401 })));
  await expect(requestJapanProductRelay(raw.handle, options)).rejects.toMatchObject({ status: 502 });
});
it('잘못된 JSON·다른 상품·네트워크 실패를 거절한다', async () => {
  for (const response of [new Response('html'), Response.json({ ...raw, handle: '4550746075918' })]) {
    vi.stubGlobal('fetch', vi.fn(async () => response));
    await expect(requestJapanProductRelay(raw.handle, options)).rejects.toMatchObject({ status: 502 });
  }
  vi.stubGlobal('fetch', vi.fn(async () => { throw Error('private'); }));
  await expect(requestJapanProductRelay(raw.handle, options)).rejects.toThrow('일본 다이소');
});
it('응답 본문이 멈춰도 전체 기한을 지킨다', async () => {
  vi.useFakeTimers();
  vi.stubGlobal('fetch', vi.fn(async () => ({ status: 200, json: () => new Promise(() => {}) })));
  const pending = requestJapanProductRelay(raw.handle, options);
  const assertion = expect(pending).rejects.toMatchObject({ status: 504 });
  await vi.advanceTimersByTimeAsync(15000); await assertion;
});

it('실패 응답 회수 오류는 원래 중계 오류를 바꾸지 않는다', async () => {
 vi.stubGlobal('fetch', vi.fn(async () => ({ status: 403, headers: new Headers(), body: { cancel: async () => { throw Error('cancel failed'); } } })));
 await expect(requestJapanProductRelay(raw.handle, options)).rejects.toMatchObject({ upstreamStatus: 403 });
});
