import { afterEach, describe, expect, it, vi } from 'vitest';
import { GeocodeGateway } from '../../src/durableObjects/geocodeGateway.js';
import { geocodeScope, type GeocodeRequest } from '../../src/utils/geocodeProvider.js';
import type { AppBindings } from '../../src/api/response.js';
const env: AppBindings = { KAKAO_REST_API_KEY: 'test-key', NAVER_CLIENT_ID: 'test-id', NAVER_CLIENT_SECRET: 'test-secret' };
function storageFixture() {
  const values = new Map<string, number>();
  const storage = {
    get: vi.fn(async (key: string) => values.get(key)),
    put: vi.fn(async (key: string, value: number) => { values.set(key, value); }),
  };
  return { storage, values, state: { storage } as unknown as DurableObjectState };
}
async function payload(provider: GeocodeRequest['provider'] = 'kakao-address'): Promise<GeocodeRequest> {
  return {
    provider, timeoutMs: 100, scope: await geocodeScope(provider === 'naver-local' ? ['test-id', 'test-secret'] : ['test-key']),
    params: provider === 'kakao-address' ? { query: '서울 중구 세종대로 110' } : provider === 'kakao-keyword' ? { query: 'CGV', size: '15' } : { query: '서울역', display: '5', start: '1', sort: 'random' },
  };
}
function lookup(gateway: GeocodeGateway, body: unknown): Promise<Response> {
  return gateway.fetch(new Request('https://geocode.internal/lookup', { method: 'POST', body: JSON.stringify(body) }));
}
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); vi.useRealTimers(); });

describe('GeocodeGateway', () => {
  it.each(['kakao-address', 'kakao-keyword', 'naver-local'] as const)('%s의 구성 인증으로 고정 공급자에 요청한다', async (provider) => {
    const fixture = storageFixture();
    const fetcher = vi.fn(async () => Response.json({ documents: [] }));
    vi.stubGlobal('fetch', fetcher);
    const result = await lookup(new GeocodeGateway(fixture.state, env), await payload(provider));
    expect(result.status).toBe(200);
    expect(await result.json()).toEqual({ status: 200, body: { documents: [] } });
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(fixture.storage.put).not.toHaveBeenCalled();
    const options = (fetcher.mock.calls[0] as unknown as [string, RequestInit])[1];
    expect(options).toMatchObject({ method: 'GET', redirect: 'manual' });
    expect(options.headers).toEqual(provider === 'naver-local' ? { 'X-Naver-Client-Id': 'test-id', 'X-Naver-Client-Secret': 'test-secret' } : { Authorization: 'KakaoAK test-key' });
  });

  it('원본 JSON 타입을 응답 packet에 보존한다', async () => {
    vi.stubGlobal('fetch', async () => Response.json(null, { status: 400 }));
    const fixture = storageFixture();
    expect(await (await lookup(new GeocodeGateway(fixture.state, env), await payload())).json()).toEqual({ status: 400, body: null });
  });

  it('다른 method와 경로는 외부 요청 없이 404를 반환한다', async () => {
    const fetcher = vi.fn();
    vi.stubGlobal('fetch', fetcher);
    const gateway = new GeocodeGateway(storageFixture().state, env);
    expect((await gateway.fetch(new Request('https://geocode.internal/lookup'))).status).toBe(404);
    expect((await gateway.fetch(new Request('https://geocode.internal/other', { method: 'POST' }))).status).toBe(404);
    expect(fetcher).not.toHaveBeenCalled();
  });

  it('본문 크기와 JSON 구문과 스키마를 검증한다', async () => {
    const fixture = storageFixture();
    const gateway = new GeocodeGateway(fixture.state, env);
    const fetcher = vi.fn();
    vi.stubGlobal('fetch', fetcher);
    for (const body of ['x', 'x'.repeat(4097), 'null', '[]', JSON.stringify({ ...await payload(), unexpected: 'field' })]) {
      const result = await gateway.fetch(new Request('https://geocode.internal/lookup', { method: 'POST', body }));
      expect(result.status).toBe(400);
    }
    const stream = new ReadableStream({ start(controller) { controller.error(new Error('private body')); } });
    const broken = new Request('https://geocode.internal/lookup', { method: 'POST', body: stream, duplex: 'half' } as RequestInit);
    expect((await gateway.fetch(broken)).status).toBe(400);
    expect(fetcher).not.toHaveBeenCalled();
    expect(fixture.storage.get).not.toHaveBeenCalled();
  });

  it('scope mismatch와 누락 인증을 외부 호출 없이 거부한다', async () => {
    const fixture = storageFixture();
    const fetcher = vi.fn();
    vi.stubGlobal('fetch', fetcher);
    expect((await lookup(new GeocodeGateway(fixture.state, env), { ...await payload(), scope: 'a'.repeat(64) })).status).toBe(403);
    expect((await lookup(new GeocodeGateway(fixture.state, {}), await payload())).status).toBe(403);
    expect(fetcher).not.toHaveBeenCalled();
    expect(fixture.storage.get).not.toHaveBeenCalled();
  });

  it.each(['get', 'put'] as const)('SQLite %s 실패는 외부 fallback 없이 503 고정 진단을 반환한다', async (operation) => {
    const fixture = storageFixture();
    fixture.storage[operation].mockImplementation(async () => { throw new Error('private storage error'); });
    const fetcher = vi.fn(async () => Response.json({ code: -10 }, { status: 400 }));
    vi.stubGlobal('fetch', fetcher);
    const result = await lookup(new GeocodeGateway(fixture.state, env), await payload());
    expect(result.status).toBe(503);
    expect(await result.json()).toEqual({ code: 'GEOCODE_GATEWAY_UNAVAILABLE' });
    expect(fetcher).toHaveBeenCalledTimes(operation === 'get' ? 0 : 1);
  });

  it('재생성한 DO가 저장된 quota를 유지하고 만료 후 실제 요청으로 재개한다', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(1000);
    const fixture = storageFixture();
    const fetcher = vi.fn(async () => Response.json({ code: -10 }, { status: 400 }));
    vi.stubGlobal('fetch', fetcher);
    const request = await payload();
    const first = await lookup(new GeocodeGateway(fixture.state, env), request);
    expect(await first.json()).toEqual({ status: 400, body: { code: -10 } });
    expect([...fixture.values]).toEqual([[`quota:${request.scope}:kakao-address`, 1801000]]);
    const second = await lookup(new GeocodeGateway(fixture.state, env), request);
    expect(await second.json()).toEqual({ status: 429, body: { code: 'GEOCODE_QUOTA_BLOCKED' } });
    expect(fetcher).toHaveBeenCalledTimes(1);
    vi.setSystemTime(1801000);
    await lookup(new GeocodeGateway(fixture.state, env), request);
    expect(fetcher).toHaveBeenCalledTimes(2);
    for (const [key, value] of fixture.values) {
      expect(key).toMatch(/^quota:[a-f0-9]{64}:kakao-address$/u);
      expect(typeof value).toBe('number');
      expect(key).not.toContain(request.params.query);
      expect(key).not.toContain('test-key');
    }
  });

  it('네이버 quota와 카카오 endpoint 상태를 격리한다', async () => {
    const fixture = storageFixture();
    const fetcher = vi.fn(async () => Response.json({}, { status: 429 }));
    vi.stubGlobal('fetch', fetcher);
    const gateway = new GeocodeGateway(fixture.state, env);
    await lookup(gateway, await payload('naver-local'));
    await lookup(gateway, await payload('kakao-address'));
    await lookup(gateway, await payload('kakao-keyword'));
    expect(fetcher).toHaveBeenCalledTimes(3);
    expect(fixture.values.size).toBe(3);
  });

  it('비동기 전송 실패·기한·응답 크기 실패를 같은 안전한 오류로 반환한다', async () => {
    const fixture = storageFixture();
    const gateway = new GeocodeGateway(fixture.state, env);
    const request = await payload();
    vi.stubGlobal('fetch', async () => { throw new Error('private transport'); });
    expect((await lookup(gateway, request)).status).toBe(503);
    vi.stubGlobal('fetch', async () => new Response('x'.repeat(524289)));
    expect((await lookup(gateway, request)).status).toBe(503);
    vi.useFakeTimers();
    const hanging = vi.fn(() => new Promise<Response>(() => {}));
    vi.stubGlobal('fetch', hanging);
    const timeout = lookup(gateway, request);
    await vi.waitFor(() => expect(hanging).toHaveBeenCalledTimes(1));
    await vi.advanceTimersByTimeAsync(100);
    expect((await timeout).status).toBe(503);
    expect(fixture.storage.put).not.toHaveBeenCalled();
  });

  it('서로 다른 param 순서의 진행 중 요청을 병합하고 응답 완료 후 다시 호출한다', async () => {
    let resolve!: (response: Response) => void;
    const fetcher = vi.fn(() => new Promise<Response>((done) => { resolve = done; }));
    vi.stubGlobal('fetch', fetcher);
    const gateway = new GeocodeGateway(storageFixture().state, env);
    const request = await payload('kakao-keyword');
    const one = lookup(gateway, request);
    const two = lookup(gateway, { ...request, params: { size: '15', query: request.params.query } });
    await vi.waitFor(() => expect(fetcher).toHaveBeenCalledTimes(1));
    resolve(Response.json({ documents: [] }));
    expect(await (await one).json()).toEqual(await (await two).json());
    fetcher.mockImplementation(async () => Response.json({ documents: [] }));
    await lookup(gateway, request);
    expect(fetcher).toHaveBeenCalledTimes(2);
  });
});
