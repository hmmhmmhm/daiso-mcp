import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  configuredGeocodeCredentials, geocodeCredentials, geocodeHeaders, geocodeProvider,
  geocodeScope, geocodeUrl, invalidGeocode, requestGeocodeProvider,
  validGeocodeCredentials, validGeocodeRequest, waitGeocode, type GeocodeRequest,
} from '../../src/utils/geocodeProvider.js';
const scope = 'a'.repeat(64);
const row = (provider: GeocodeRequest['provider'] = 'kakao-address'): GeocodeRequest => ({
  provider, scope, timeoutMs: 100,
  params: provider === 'kakao-address' ? { query: '서울 중구 세종대로 110' }
    : provider === 'kakao-keyword' ? { query: 'CGV', size: '15' }
      : { query: '서울역', display: '5', start: '1', sort: 'random' },
});
afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); });

describe('지오코딩 공급자 입력', () => {
  it.each([
    ['kakao-address', 'https://dapi.kakao.com/v2/local/search/address.json'],
    ['kakao-keyword', 'https://dapi.kakao.com/v2/local/search/keyword.json'],
    ['naver-local', 'https://openapi.naver.com/v1/search/local.json'],
  ] as const)('공급자 %s의 origin과 경로를 고정한다', (provider, endpoint) => {
    expect(geocodeProvider(new URL(`${endpoint}?query=x`))).toBe(provider);
    const url = new URL(geocodeUrl(row(provider)));
    expect(url.origin + url.pathname).toBe(endpoint);
    expect(url.searchParams.get('query')).toBe(row(provider).params.query);
    expect(validGeocodeRequest(row(provider))).toBe(true);
  });
  it.each(['http://dapi.kakao.com/v2/local/search/address.json', 'https://evil.test/v2/local/search/address.json', 'https://dapi.kakao.com/v2/local/search/address.json/'])('다른 URL을 지오코딩 공급자로 취급하지 않는다', (url) => {
    expect(geocodeProvider(new URL(url))).toBeUndefined();
  });
  it('자격증명 해시는 순서와 원본 경계를 보존하며 비밀을 노출하지 않는다', async () => {
    const one = await geocodeScope(['ab', 'c']);
    expect(one).toMatch(/^[a-f0-9]{64}$/u);
    expect(await geocodeScope(['ab', 'c'])).toBe(one);
    expect(await geocodeScope(['a', 'bc'])).not.toBe(one);
    expect(await geocodeScope(['c', 'ab'])).not.toBe(one);
  });
  it('공급자별 인증 헤더를 읽고 구성하며 환경값 공백을 제거한다', () => {
    const naver = new Headers({ 'X-Naver-Client-Id': 'id', 'X-Naver-Client-Secret': 'secret' });
    expect(geocodeCredentials('naver-local', naver)).toEqual(['id', 'secret']);
    expect(geocodeCredentials('naver-local', new Headers())).toEqual(['', '']);
    expect(geocodeHeaders('naver-local', ['id', 'secret'])).toEqual({ 'X-Naver-Client-Id': 'id', 'X-Naver-Client-Secret': 'secret' });
    expect(geocodeCredentials('kakao-address', new Headers({ Authorization: 'KakaoAK key' }))).toEqual(['key']);
    expect(geocodeCredentials('kakao-keyword', new Headers())).toEqual(['']);
    expect(geocodeHeaders('kakao-keyword', ['key'])).toEqual({ Authorization: 'KakaoAK key' });
    expect(configuredGeocodeCredentials('naver-local', { NAVER_CLIENT_ID: ' id ', NAVER_CLIENT_SECRET: ' secret ' })).toEqual(['id', 'secret']);
    expect(configuredGeocodeCredentials('naver-local', {})).toEqual(['', '']);
    expect(configuredGeocodeCredentials('kakao-address', { KAKAO_REST_API_KEY: ' key ' })).toEqual(['key']);
    expect(configuredGeocodeCredentials('kakao-address', {})).toEqual(['']);
    expect(validGeocodeCredentials(['id', 'secret'])).toBe(true);
    expect(validGeocodeCredentials(['x'.repeat(512)])).toBe(true);
    expect(validGeocodeCredentials([''])).toBe(false);
    expect(validGeocodeCredentials(['x'.repeat(513)])).toBe(false);
    expect(validGeocodeCredentials(['a\nb'])).toBe(false);
    expect(invalidGeocode().message).toBe('GEOCODE_INVALID_REQUEST');
  });

  const invalidRows: [string, unknown][] = [
    ['null', null], ['primitive', 1], ['array', []],
    ['extra field', { ...row(), url: 'https://evil.test' }],
    ['missing provider', { ...row(), provider: undefined }],
    ['unknown provider', { ...row(), provider: 'constructor' }],
    ['scope type', { ...row(), scope: 1 }], ['scope length', { ...row(), scope: 'a' }],
    ['scope nonhex', { ...row(), scope: 'z'.repeat(64) }],
    ['timeout fraction', { ...row(), timeoutMs: 1.1 }],
    ['timeout zero', { ...row(), timeoutMs: 0 }], ['timeout huge', { ...row(), timeoutMs: 20001 }],
    ['missing params', { ...row(), params: null }], ['params primitive', { ...row(), params: 'query' }],
    ['params array', { ...row(), params: [] }],
    ['extra param', { ...row(), params: { query: 'x', url: 'https://evil.test' } }],
    ['query number', { ...row(), params: { query: 1 } }],
    ['query missing', { ...row(), params: {} }], ['query blank', { ...row(), params: { query: '  ' } }],
    ['query long', { ...row(), params: { query: 'x'.repeat(301) } }],
    ['query control', { ...row(), params: { query: '서울\n역' } }],
    ['keyword size', { ...row('kakao-keyword'), params: { query: 'x', size: '16' } }],
    ...[
      { x: '127', y: '37' }, { x: '127', radius: '20000', sort: 'distance' },
      { y: '37', radius: '20000', sort: 'distance' },
      { x: 'NaN', y: '37', radius: '20000', sort: 'distance' },
      { x: '127', y: 'NaN', radius: '20000', sort: 'distance' },
      { x: '123', y: '37', radius: '20000', sort: 'distance' },
      { x: '133', y: '37', radius: '20000', sort: 'distance' },
      { x: '127', y: '32', radius: '20000', sort: 'distance' },
      { x: '127', y: '40', radius: '20000', sort: 'distance' },
      { x: '127', y: '37', radius: '1', sort: 'distance' },
      { x: '127', y: '37', radius: '20000', sort: 'accuracy' },
      { radius: '20000' }, { sort: 'distance' },
    ].map((params, index): [string, unknown] => [`keyword coordinate case ${index}`, { ...row('kakao-keyword'), params: { query: 'x', size: '15', ...params } }]),
    ...[
      { display: '6', start: '1', sort: 'random' },
      { start: '1', sort: 'random' }, { display: '5', start: '2', sort: 'random' },
      { display: '5', start: '1', sort: 'distance' },
    ].map((params, index): [string, unknown] => [`naver parameter case ${index}`, { ...row('naver-local'), params: { query: 'x', ...params } }]),
  ];
  it.each(invalidRows)('거부한 입력은 외부 요청을 만들지 않는다: %s', (_name, value) => {
    expect(validGeocodeRequest(value)).toBe(false);
  });
  it('한국 좌표 경계와 최대 시간·검색어 길이를 허용한다', () => {
    expect(validGeocodeRequest({ ...row(), timeoutMs: 20000, params: { query: 'x'.repeat(300) } })).toBe(true);
    for (const [x, y] of [['124', '33'], ['132', '39'], ['127.1', '37.1']])
      expect(validGeocodeRequest({ ...row('kakao-keyword'), params: { query: 'CGV', size: '15', x, y, radius: '20000', sort: 'distance' } })).toBe(true);
    expect(validGeocodeRequest({ ...row('naver-local'), params: { query: 'x', display: '1', start: '1', sort: 'comment' } })).toBe(true);
  });
});

describe('공급자 응답과 요청 기한', () => {
  it.each(['kakao-address', 'kakao-keyword', 'naver-local'] as const)('%s는 GET과 수동 redirect만 사용한다', async (provider) => {
    const fetcher = vi.fn(async () => Response.json({ documents: [] }));
    await expect(requestGeocodeProvider(row(provider), ['key', 'secret'], fetcher)).resolves.toEqual({ status: 200, body: { documents: [] } });
    expect(fetcher.mock.calls[0]).toEqual([geocodeUrl(row(provider)), expect.objectContaining({ method: 'GET', redirect: 'manual', signal: expect.any(AbortSignal), headers: geocodeHeaders(provider, ['key', 'secret']) })]);
  });
  it.each([null, 1, 'text', [], true, { code: -10 }])('JSON 원본 타입을 그대로 반환한다: %j', async (body) => {
    const result = await requestGeocodeProvider(row(), ['key'], async () => Response.json(body, { status: 400 }));
    expect(result).toEqual({ status: 400, body });
  });
  it.each([new Response('not json'), new Response(null)])('JSON이 아닌 응답은 고정 502 진단으로 바꾼다', async (response) => {
    expect(await requestGeocodeProvider(row(), ['key'], async () => response)).toEqual({ status: 502, body: { code: 'GEOCODE_INVALID_RESPONSE' } });
  });
  it('512 KiB 경계는 읽고 초과하면 reader를 취소한다', async () => {
    const exact = '"' + 'x'.repeat(524286) + '"';
    expect((await requestGeocodeProvider(row(), ['key'], async () => new Response(exact))).body).toHaveLength(524286);
    const cancel = vi.fn();
    const stream = new ReadableStream<Uint8Array>({ start(controller) { controller.enqueue(new Uint8Array(524289)); }, cancel });
    await expect(requestGeocodeProvider(row(), ['key'], async () => new Response(stream))).rejects.toThrow('GEOCODE_RESPONSE_TOO_LARGE');
    expect(cancel).toHaveBeenCalledTimes(1);
  });
  it('body 읽기가 멈춰도 기한 후 취소한다', async () => {
    vi.useFakeTimers();
    const cancel = vi.fn();
    const stream = new ReadableStream<Uint8Array>({ cancel });
    const task = requestGeocodeProvider(row(), ['key'], async () => new Response(stream));
    const check = expect(task).rejects.toThrow('GEOCODE_TIMEOUT');
    await vi.advanceTimersByTimeAsync(100);
    await check;
    expect(cancel).toHaveBeenCalledTimes(1);
  });
  it('fetch가 abort를 무시하고 늦게 반환해도 body를 취소한다', async () => {
    vi.useFakeTimers();
    let resolve!: (response: Response) => void;
    const cancel = vi.fn();
    const response = new Response(new ReadableStream({ cancel }));
    const fetcher = vi.fn(() => new Promise<Response>((done) => { resolve = done; }));
    const task = requestGeocodeProvider(row(), ['key'], fetcher);
    const check = expect(task).rejects.toThrow('GEOCODE_TIMEOUT');
    await vi.advanceTimersByTimeAsync(100);
    await check;
    expect((fetcher.mock.calls[0] as unknown as [string, RequestInit])[1].signal?.aborted).toBe(true);
    resolve(response);
    await vi.advanceTimersByTimeAsync(0);
    expect(cancel).toHaveBeenCalledTimes(1);
  });
  it('호출자 취소와 선행 취소를 처리하고 성공하면 listener를 정리한다', async () => {
    const controller = new AbortController();
    const remove = vi.spyOn(controller.signal, 'removeEventListener');
    expect(await waitGeocode(Promise.resolve('ok'), 100, controller.signal)).toBe('ok');
    expect(remove).toHaveBeenCalled();
    const abort = vi.fn();
    const task = waitGeocode(new Promise(() => {}), 100, controller.signal, abort);
    controller.abort();
    await expect(task).rejects.toThrow('GEOCODE_CANCELLED');
    expect(abort).toHaveBeenCalledTimes(1);
    await expect(waitGeocode(new Promise(() => {}), 100, controller.signal)).rejects.toThrow('GEOCODE_CANCELLED');
  });
  it('전송 오류 원본은 상위 gateway가 처리하도록 전파한다', async () => {
    await expect(requestGeocodeProvider(row(), ['key'], async () => { throw new Error('transport'); })).rejects.toThrow('transport');
  });
  it('기한 만료 중 stream 취소가 실패해도 고정 timeout을 유지한다', async () => {
    vi.useFakeTimers();
    const stream = new ReadableStream<Uint8Array>({ cancel() { throw new Error('private cancel error'); } });
    const task = requestGeocodeProvider(row(), ['key'], async () => new Response(stream));
    const check = expect(task).rejects.toThrow('GEOCODE_TIMEOUT');
    await vi.advanceTimersByTimeAsync(100);
    await check;
  });

});
