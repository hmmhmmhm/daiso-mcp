import { describe, expect, it, vi } from 'vitest';
import {
  hasConvenienceRelay,
  requestConvenienceRelay,
  convenienceTransportFromBindings,
} from '../../src/utils/convenienceTransport.js';
const options = { convenienceRelayUrl: 'https://relay.example', convenienceRelayToken: 'token' };
describe('편의점 Worker 전송', () => {
  it('설정 없는 기존 경로와 부분 설정을 구분한다', async () => {
    expect(hasConvenienceRelay({})).toBe(false);
    expect(hasConvenienceRelay({ convenienceRelayToken: '' })).toBe(true);
    await expect(
      requestConvenienceRelay('cu-prime', {}, { convenienceRelayToken: 'token' }),
    ).rejects.toThrow('설정');
  });
  it('Access와 Bearer 인증을 고정 경로에만 전송한다', async () => {
    const fetcher = vi.fn(async () => Response.json({ data: [] }));
    vi.stubGlobal('fetch', fetcher);
    try {
      const binding = convenienceTransportFromBindings({
        CONVENIENCE_RELAY_URL: options.convenienceRelayUrl,
        CONVENIENCE_RELAY_TOKEN: 'token',
        CONVENIENCE_ACCESS_CLIENT_ID: 'id',
        CONVENIENCE_ACCESS_CLIENT_SECRET: 'secret',
      });
      expect(await requestConvenienceRelay('seven-pages', {}, binding)).toEqual({ data: [] });
      expect(fetcher.mock.calls[0]).toEqual([
        'https://relay.example/v1/convenience/seven-pages',
        expect.objectContaining({
          redirect: 'manual',
          headers: expect.objectContaining({
            Authorization: 'Bearer token',
            'CF-Access-Client-Id': 'id',
          }),
        }),
      ]);
    } finally {
      vi.unstubAllGlobals();
    }
  });
});
it.each([
  undefined,
  {
    convenienceRelayUrl: 'https://relay.example',
    convenienceRelayToken: 'token',
    convenienceAccessClientId: '',
  },
  {
    convenienceRelayUrl: 'https://relay.example',
    convenienceRelayToken: ' ',
    convenienceAccessClientId: 'id',
    convenienceAccessClientSecret: 'secret',
  },
  {
    convenienceRelayUrl: 'https://relay.example',
    convenienceRelayToken: 'token',
    convenienceAccessClientSecret: 'secret',
  },
  {
    convenienceRelayUrl: 'https://relay.example',
    convenienceRelayToken: 'token',
    convenienceAccessClientId: 'id',
    convenienceAccessClientSecret: '',
  },
])('부분 설정과 빈 설정을 거절한다 %j', async (input) => {
  const binding = convenienceTransportFromBindings();
  expect(hasConvenienceRelay(binding)).toBe(false);
  await expect(requestConvenienceRelay('cu-prime', {}, input || {})).rejects.toThrow('설정');
});
it.each([429, 503, 504, 302, 401, 500])(
  'HTTP %i를 안전한 서비스 오류로 전달한다',
  async (status) => {
    vi.stubGlobal('fetch', async () => new Response('secret', { status }));
    try {
      await expect(requestConvenienceRelay('cu-prime', {}, options)).rejects.toMatchObject({
        status: [429, 503, 504].includes(status) ? status : 502,
        upstreamStatus: status,
      });
    } finally {
      vi.unstubAllGlobals();
    }
  },
);
it.each([null, 1, [], { success: false }, { error: 'secret' }, { resp_cd: '3000' }, '<html>'])(
  '실패 JSON과 HTML을 거절한다 %j',
  async (data) => {
    vi.stubGlobal('fetch', async () =>
      typeof data === 'string' ? new Response(data) : Response.json(data),
    );
    try {
      await expect(requestConvenienceRelay('cu-prime', {}, options)).rejects.toThrow('실패');
    } finally {
      vi.unstubAllGlobals();
    }
  },
);
it('연결 실패와 취소를 안전하게 처리한다', async () => {
  vi.stubGlobal('fetch', async () => {
    throw Error('secret');
  });
  await expect(requestConvenienceRelay('cu-prime', {}, options)).rejects.toThrow('실패');
  vi.stubGlobal('fetch', async (_url: string, init: RequestInit) => {
    await new Promise<void>((resolve) => init.signal!.addEventListener('abort', () => resolve()));
    throw Error('secret');
  });
  await expect(requestConvenienceRelay('cu-prime', {}, options, 1)).rejects.toThrow('초과');
  vi.unstubAllGlobals();
});
it('정상 코드와 빈 Access 없이 성공을 전달하고 취소 실패를 무시한다', async () => {
  vi.stubGlobal('fetch', async () => Response.json({ resp_cd: '0000' }));
  expect(await requestConvenienceRelay('cu-prime', {}, options)).toEqual({ resp_cd: '0000' });
  vi.stubGlobal(
    'fetch',
    async () =>
      new Response(new ReadableStream({ cancel: () => Promise.reject(Error('cancel')) }), {
        status: 302,
      }),
  );
  await expect(requestConvenienceRelay('cu-prime', {}, options)).rejects.toThrow('실패');
  vi.unstubAllGlobals();
});
import { buildConfigStatus } from '../../src/api/configStatus.js';
import { fetchGs25StoreStockResponse } from '../../src/services/gs25/storeStockTransport.js';
it('편의점 상태는 비밀 없이 부분 Access 설정을 구분한다', () => {
  expect(buildConfigStatus().convenienceRelay.configured).toBe(false);
  const complete = {
    CONVENIENCE_RELAY_URL: 'https://relay.example',
    CONVENIENCE_RELAY_TOKEN: 'token',
    CONVENIENCE_ACCESS_CLIENT_ID: 'id',
    CONVENIENCE_ACCESS_CLIENT_SECRET: 'secret',
  };
  expect(buildConfigStatus(complete).convenienceRelay.configured).toBe(true);
  expect(
    buildConfigStatus({ ...complete, CONVENIENCE_ACCESS_CLIENT_SECRET: '' }).convenienceRelay
      .configured,
  ).toBe(false);
  expect(
    buildConfigStatus({
      CONVENIENCE_RELAY_URL: 'https://relay.example',
      CONVENIENCE_RELAY_TOKEN: 'token',
    }).convenienceRelay.configured,
  ).toBe(true);
});
it.each([401, 403, 503])('GS25 재고 인증과 중계 혼잡 %i를 구분한다', async (status) => {
  vi.stubGlobal('fetch', async () => new Response('secret', { status }));
  try {
    const pending = fetchGs25StoreStockResponse(
      'https://b2c-bff.woodongs.com/api/bff/v2/store/stock?serviceCode=01&realTimeStockYn=Y',
      options,
      {},
    );
    if (status === 503)
      await expect(pending).rejects.toMatchObject({ code: 'CONVENIENCE_RELAY_FAILED' });
    else await expect(pending).rejects.toThrow('GS25_API_KEY');
  } finally {
    vi.unstubAllGlobals();
  }
});
it('GS25 Worker 키는 고정 작업 본문에만 전달한다', async () => {
  const fetcher = vi.fn(async () => Response.json({ stores: [] }));
  vi.stubGlobal('fetch', fetcher);
  try {
    expect(
      await fetchGs25StoreStockResponse(
        'https://b2c-bff.woodongs.com/api/bff/v2/store/stock?serviceCode=01',
        { ...options, apiKey: ' key ' },
        {},
      ),
    ).toEqual({ stores: [] });
    expect(
      JSON.parse((fetcher.mock.calls[0] as unknown as [string, RequestInit])[1].body as string),
    ).toEqual({ serviceCode: '01', apiKey: 'key' });
  } finally {
    vi.unstubAllGlobals();
  }
});
import { requestSevenElevenJson } from '../../src/services/seveneleven/transport.js';
import { SEVENELEVEN_API } from '../../src/services/seveneleven/api.js';
it('세븐일레븐 GET·인기어·빈 POST도 고정 작업에 대응한다', async () => {
  vi.stubGlobal('fetch', async () => Response.json({ data: [] }));
  try {
    expect(
      await requestSevenElevenJson(
        `${SEVENELEVEN_API.SEARCH_POPWORD_PATH}?label=home`,
        'POST',
        {},
        options,
      ),
    ).toEqual({ data: [] });
    expect(
      await requestSevenElevenJson(SEVENELEVEN_API.PRODUCT_PAGES_PATH, 'GET', null, options),
    ).toEqual({ data: [] });
    expect(await requestSevenElevenJson(SEVENELEVEN_API.SEARCH_GOODS_PATH, 'POST', null)).toEqual({
      data: [],
    });
  } finally {
    vi.unstubAllGlobals();
  }
});
