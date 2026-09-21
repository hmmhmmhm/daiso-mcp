import { afterEach, expect, it, vi } from 'vitest';
import { fetchOliveyoungStores } from '../../../src/services/oliveyoung/client.js';
const params = { latitude: 37.5, longitude: 127, pageIdx: 1, searchWords: '' };
afterEach(() => vi.unstubAllGlobals());
it('Workers에서 지원하는 수동 리다이렉트 모드로 직접 요청한다', async () => {
  const fetch = vi.fn(async (_url: string, options: RequestInit) => {
    if (options.redirect === 'error') throw new TypeError('Invalid redirect value');
    return Response.json({ status: 'SUCCESS', data: {} });
  });
  vi.stubGlobal('fetch', fetch);
  const { requestOliveyoung } = await import('../../../src/services/oliveyoung/transport.js');
  await expect(requestOliveyoung('/p', {})).resolves.toMatchObject({ status: 'SUCCESS' });
  expect(fetch.mock.calls[0][1].redirect).toBe('manual');
});
it.each([301, 302, 303, 307, 308])('직접 요청의 HTTP %i는 SUCCESS 본문이어도 거절한다', async (status) => {
  const fetch = vi.fn().mockResolvedValue(Response.json({ status: 'SUCCESS' }, { status }));
  vi.stubGlobal('fetch', fetch);
  const { requestOliveyoung } = await import('../../../src/services/oliveyoung/transport.js');
  await expect(requestOliveyoung('/p', {})).rejects.toThrow('직접 요청 실패');
  expect(fetch).toHaveBeenCalledTimes(1);
});
it('키 없이 공식 API JSON을 직접 읽고 Zyte를 호출하지 않는다', async () => {
  const fetch = vi
    .fn()
    .mockResolvedValue(Response.json({ status: 'SUCCESS', data: { totalCount: 7 } }));
  vi.stubGlobal('fetch', fetch);
  expect((await fetchOliveyoungStores(params)).totalCount).toBe(7);
  expect(fetch.mock.calls[0][0]).toBe(
    'https://www.oliveyoung.co.kr/oystore/api/storeFinder/find-store',
  );
  expect(fetch.mock.calls[0][1].headers).toMatchObject({
    'User-Agent': expect.stringContaining('Mozilla/5.0'),
    Origin: 'https://www.oliveyoung.co.kr',
    Referer: 'https://www.oliveyoung.co.kr/',
    'Accept-Language': 'ko-KR,ko;q=0.9',
  });
});
it('신뢰한 옵션의 릴레이를 우선 사용하고 토큰을 전달한다', async () => {
  const fetch = vi
    .fn()
    .mockResolvedValue(Response.json({ status: 'SUCCESS', data: { totalCount: 8 } }));
  vi.stubGlobal('fetch', fetch);
  expect(
    (await fetchOliveyoungStores(params, { relayUrl: 'https://relay.example', relayToken: 'test' }))
      .totalCount,
  ).toBe(8);
  expect(fetch).toHaveBeenCalledWith(
    'https://relay.example/v1/oliveyoung/find-store',
    expect.objectContaining({
      redirect: 'manual',
      headers: expect.objectContaining({ Authorization: 'Bearer test' }),
    }),
  );
  for (const name of ['User-Agent', 'Origin', 'Referer', 'Accept-Language']) {
    expect(fetch.mock.calls[0][1].headers).not.toHaveProperty(name);
  }
});
it('HTTP201의 SUCCESS 본문도 정상 응답으로 처리하지 않는다', async () => {
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue(Response.json({ status: 'SUCCESS' }, { status: 201 })),
  );
  const { requestOliveyoung } = await import('../../../src/services/oliveyoung/transport.js');
  await expect(requestOliveyoung('/oystore/api/stock/product-search-v3', {})).rejects.toThrow(
    '직접 요청 실패',
  );
});
it('릴레이 토큰과 주소 설정 오류는 네트워크 호출 전에 거절한다', async () => {
  const fetch = vi.fn();
  vi.stubGlobal('fetch', fetch);
  const { requestOliveyoung } = await import('../../../src/services/oliveyoung/transport.js');
  for (const relayUrl of [
    'bad url',
    'http://remote.example',
    'https://user:pass@relay.example',
    'https://relay.example?token=x',
    'https://relay.example#x',
    'ftp://localhost',
  ]) {
    await expect(requestOliveyoung('/p', {}, { relayUrl, relayToken: 'test' })).rejects.toThrow(
      '릴레이 URL',
    );
  }
  await expect(requestOliveyoung('/p', {}, { relayUrl: 'https://relay.example' })).rejects.toThrow(
    'OY_RELAY_TOKEN',
  );
  expect(fetch).not.toHaveBeenCalled();
});
it('로컬 릴레이 요청의 실패는 비밀 없이 전달하고 재시도하지 않는다', async () => {
  const fetch = vi.fn().mockResolvedValue(new Response('secret', { status: 502 }));
  vi.stubGlobal('fetch', fetch);
  const { requestOliveyoung } = await import('../../../src/services/oliveyoung/transport.js');
  await expect(
    requestOliveyoung('/p', {}, { relayUrl: 'http://127.0.0.1:4319/', relayToken: 'secret' }),
  ).rejects.toThrow('올리브영 브라우저 릴레이 요청 실패');
  expect(fetch).toHaveBeenCalledTimes(1);
});
it('도구의 사용자 입력으로 신뢰한 릴레이 설정을 덮어쓸 수 없다', async () => {
  const fetch = vi
    .fn()
    .mockImplementation(async () => Response.json({ status: 'SUCCESS', data: {} }));
  vi.stubGlobal('fetch', fetch);
  const { createSearchProductsTool } =
    await import('../../../src/services/oliveyoung/tools/searchProducts.js');
  const tool = createSearchProductsTool(undefined, {
    relayUrl: 'https://trusted.example',
    relayToken: 'trusted',
  });
  await tool.handler({ keyword: '팩', relayUrl: 'https://evil.example', relayToken: 'evil' });
  expect(fetch).toHaveBeenCalledWith(
    'https://trusted.example/v1/oliveyoung/product-search-v3',
    expect.objectContaining({
      headers: expect.objectContaining({ Authorization: 'Bearer trusted' }),
    }),
  );
});
it('Access 서비스 자격증명을 중계에만 전달한다', async () => {
  const fetch = vi
    .fn()
    .mockImplementation(async () => Response.json({ status: 'SUCCESS', data: {} }));
  vi.stubGlobal('fetch', fetch);
  const { requestOliveyoung } = await import('../../../src/services/oliveyoung/transport.js');
  const options = {
    relayUrl: 'https://trusted.example',
    relayToken: 'relay',
    accessClientId: 'id',
    accessClientSecret: 'secret',
  };
  await requestOliveyoung('/p', {}, options);
  expect(fetch.mock.calls[0][1].headers).toMatchObject({
    'CF-Access-Client-Id': 'id',
    'CF-Access-Client-Secret': 'secret',
  });
  await requestOliveyoung('/p', {}, { accessClientId: 'id', accessClientSecret: 'secret' });
  expect(fetch.mock.calls[1][1].headers).not.toHaveProperty('CF-Access-Client-Secret');
  for (const partial of [
    { accessClientId: 'id' },
    { accessClientSecret: 'secret' },
    { accessClientId: ' ', accessClientSecret: 'secret' },
  ]) {
    await expect(
      requestOliveyoung(
        '/p',
        {},
        { ...options, accessClientId: undefined, accessClientSecret: undefined, ...partial },
      ),
    ).rejects.toThrow('Access');
  }
  expect(fetch).toHaveBeenCalledTimes(2);
});
