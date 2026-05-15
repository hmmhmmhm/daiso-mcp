import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  __testOnlyClearLotteMartSessionCache,
  __testOnlyCreateLotteMartSocketResponse,
  fetchLotteMartHtml,
  fetchLotteMartPageWithSession,
  getCachedLotteMartSessionCookie,
  getFreshLotteMartSessionCookie,
  probeLotteMartRequest,
} from '../../../src/services/lottemart/session.js';

const mockFetch = vi.fn();

function createZyteResponse(bodyText: string, status = 200) {
  return new Response(
    JSON.stringify({
      statusCode: 200,
      httpResponseBody: Buffer.from(bodyText, 'utf8').toString('base64'),
    }),
    {
      status,
      headers: {
        'Content-Type': 'application/json',
      },
    },
  );
}

beforeEach(() => {
  mockFetch.mockReset();
  __testOnlyClearLotteMartSessionCache();
  vi.stubGlobal('fetch', mockFetch);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('lottemart session helpers', () => {
  it('캐시된 세션이 없으면 빈 문자열을 반환한다', async () => {
    await expect(getCachedLotteMartSessionCookie(1000)).resolves.toBe('');
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('빈 바디와 세션 쿠키를 받으면 같은 요청을 한 번 더 시도한다', async () => {
    mockFetch
      .mockResolvedValueOnce(new Response('', { headers: { 'set-cookie': 'ASPSESSIONID=A; path=/' } }))
      .mockResolvedValueOnce(new Response('ok'));

    await expect(
      fetchLotteMartHtml(
        'https://company.lottemart.com/mobiledowa/test',
        {
          method: 'POST',
        },
        1000,
        '',
      ),
    ).resolves.toBe('ok');

    expect(mockFetch).toHaveBeenCalledTimes(2);
    const retriedHeaders = mockFetch.mock.calls[1]?.[1]?.headers as Headers;
    expect(retriedHeaders.get('Cookie')).toBe('ASPSESSIONID=A');
    await expect(getCachedLotteMartSessionCookie(1000)).resolves.toBe('ASPSESSIONID=A');
  });

  it('정상 HTML 응답의 세션 쿠키를 캐시에 반영한다', async () => {
    mockFetch.mockResolvedValue(new Response('ok', { headers: { 'set-cookie': 'ASPSESSIONID=B; path=/' } }));

    await expect(
      fetchLotteMartHtml(
        'https://company.lottemart.com/mobiledowa/test',
        {
          method: 'GET',
        },
        1000,
        '',
      ),
    ).resolves.toBe('ok');

    await expect(getCachedLotteMartSessionCookie(1000)).resolves.toBe('ASPSESSIONID=B');
  });

  it('강제 새로고침이면 캐시를 비운다', async () => {
    mockFetch.mockResolvedValue(new Response('ok', { headers: { 'set-cookie': 'ASPSESSIONID=C; path=/' } }));
    await fetchLotteMartHtml('https://company.lottemart.com/mobiledowa/test', { method: 'GET' }, 1000, '');

    await expect(getCachedLotteMartSessionCookie(1000, true)).resolves.toBe('');
  });

  it('getFreshLotteMartSessionCookie는 캐시를 비운 뒤 빈 문자열을 반환한다', async () => {
    mockFetch.mockResolvedValue(new Response('ok', { headers: { 'set-cookie': 'ASPSESSIONID=C; path=/' } }));
    await fetchLotteMartHtml('https://company.lottemart.com/mobiledowa/test', { method: 'GET' }, 1000, '');

    await expect(getFreshLotteMartSessionCookie(1000)).resolves.toBe('');
  });

  it('getSetCookie 응답도 세션 쿠키로 인식한다', async () => {
    const response = new Response('ok');
    const headers = response.headers as Headers & { getSetCookie?: () => string[] };
    headers.getSetCookie = () => ['ASPSESSIONID=D; path=/', 'other=value; path=/'];
    mockFetch.mockResolvedValue(response);

    await fetchLotteMartHtml('https://company.lottemart.com/mobiledowa/test', { method: 'GET' }, 1000, '');

    await expect(getCachedLotteMartSessionCookie(1000)).resolves.toBe('ASPSESSIONID=D');
  });

  it('소켓 raw 응답에 HTTP 헤더 경계가 없으면 fallback 가능하도록 null을 반환한다', async () => {
    expect(__testOnlyCreateLotteMartSocketResponse(new TextEncoder().encode(''))).toBeNull();
    expect(__testOnlyCreateLotteMartSocketResponse(new TextEncoder().encode('not-http'))).toBeNull();
    expect(__testOnlyCreateLotteMartSocketResponse(new TextEncoder().encode('not-http\r\n\r\nbody'))).toBeNull();
  });

  it('소켓 raw HTTP 응답을 Response로 변환한다', async () => {
    const raw = new TextEncoder().encode(
      'HTTP/1.1 200 OK\r\nMalformed-Header\r\nContent-Type: text/html\r\n\r\n<html>ok</html>',
    );

    const response = __testOnlyCreateLotteMartSocketResponse(raw);

    expect(response?.status).toBe(200);
    expect(response?.headers.get('Content-Type')).toBe('text/html');
    await expect(response?.text()).resolves.toBe('<html>ok</html>');
  });

  it('소켓 raw HTTP 응답의 상태 코드가 숫자가 아니면 500으로 변환한다', () => {
    const raw = new TextEncoder().encode('HTTP/1.1 BROKEN\r\nContent-Type: text/html\r\n\r\n');

    const response = __testOnlyCreateLotteMartSocketResponse(raw);

    expect(response?.status).toBe(500);
  });

  it('getSetCookie가 없으면 set-cookie 헤더를 사용한다', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      status: 200,
      statusText: 'OK',
      headers: {
        get: () => 'ASPSESSIONID=E; path=/',
      },
      text: async () => 'ok',
    } as Response);

    await fetchLotteMartHtml('https://company.lottemart.com/mobiledowa/test', { method: 'GET' }, 1000, '');

    await expect(getCachedLotteMartSessionCookie(1000)).resolves.toBe('ASPSESSIONID=E');
  });

  it('set-cookie 헤더도 없으면 세션을 비워둔다', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      status: 200,
      statusText: 'OK',
      headers: {
        get: () => null,
      },
      text: async () => 'ok',
    } as Response);

    await fetchLotteMartHtml('https://company.lottemart.com/mobiledowa/test', { method: 'GET' }, 1000, '');

    await expect(getCachedLotteMartSessionCookie(1000)).resolves.toBe('');
  });

  it('HTML 요청에 세션 쿠키를 붙인다', async () => {
    mockFetch.mockResolvedValue(new Response('ok'));

    await expect(
      fetchLotteMartHtml(
        'https://company.lottemart.com/mobiledowa/test',
        {
          method: 'POST',
          headers: {
            'X-Test': '1',
          },
        },
        1000,
        'ASPSESSIONID=COOKIE',
      ),
    ).resolves.toBe('ok');

    const headers = mockFetch.mock.calls[0]?.[1]?.headers as Headers;
    expect(headers.get('Cookie')).toBe('ASPSESSIONID=COOKIE');
    expect(headers.get('Accept')).toContain('text/html');
    expect(headers.get('X-Test')).toBe('1');
  });

  it('빈 세션 쿠키면 Cookie 헤더를 생략한다', async () => {
    mockFetch.mockResolvedValue(new Response('ok'));

    await fetchLotteMartHtml(
      'https://company.lottemart.com/mobiledowa/test',
      {
        method: 'GET',
      },
      1000,
      '   ',
    );

    const headers = mockFetch.mock.calls[0]?.[1]?.headers as Headers;
    expect(headers.get('Cookie')).toBeNull();
  });

  it('첫 응답이 실패면 HttpError를 던진다', async () => {
    mockFetch.mockResolvedValue(new Response('boom', { status: 500, statusText: 'Server Error' }));

    await expect(
      fetchLotteMartHtml('https://company.lottemart.com/mobiledowa/test', { method: 'GET' }, 1000, ''),
    ).rejects.toThrow('API 요청 실패: 500 Server Error');
  });

  it('재시도 응답이 실패면 HttpError를 던진다', async () => {
    mockFetch
      .mockResolvedValueOnce(new Response('', { headers: { 'set-cookie': 'ASPSESSIONID=E; path=/' } }))
      .mockResolvedValueOnce(new Response('retry boom', { status: 500, statusText: 'Server Error' }));

    await expect(
      fetchLotteMartHtml('https://company.lottemart.com/mobiledowa/test', { method: 'GET' }, 1000, ''),
    ).rejects.toThrow('API 요청 실패: 500 Server Error');
  });

  it('본문 읽기가 실패해도 새 세션 쿠키가 있으면 같은 요청을 다시 시도한다', async () => {
    mockFetch
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        statusText: 'OK',
        headers: {
          get: () => 'ASPSESSIONID=F; path=/',
        },
        text: async () => {
          throw new Error('broken stream');
        },
      } as Response)
      .mockResolvedValueOnce(new Response('retry ok'));

    await expect(
      fetchLotteMartHtml('https://company.lottemart.com/mobiledowa/test', { method: 'GET' }, 1000, ''),
    ).resolves.toBe('retry ok');

    const retriedHeaders = mockFetch.mock.calls[1]?.[1]?.headers as Headers;
    expect(retriedHeaders.get('Cookie')).toBe('ASPSESSIONID=F');
  });

  it('본문 읽기 실패 후 재시도 응답이 실패면 HttpError를 던진다', async () => {
    mockFetch
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        statusText: 'OK',
        headers: {
          get: () => 'ASPSESSIONID=G; path=/',
        },
        text: async () => {
          throw new Error('broken stream');
        },
      } as Response)
      .mockResolvedValueOnce(new Response('retry boom', { status: 500, statusText: 'Server Error' }));

    await expect(
      fetchLotteMartHtml('https://company.lottemart.com/mobiledowa/test', { method: 'GET' }, 1000, ''),
    ).rejects.toThrow('API 요청 실패: 500 Server Error');
  });

  it('본문 읽기 실패 시 재시도 조건이 아니면 원래 에러를 던진다', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      status: 200,
      statusText: 'OK',
      headers: {
        get: () => null,
      },
      text: async () => {
        throw new Error('broken stream');
      },
    } as Response);

    await expect(
      fetchLotteMartHtml('https://company.lottemart.com/mobiledowa/test', { method: 'GET' }, 1000, 'ASPSESSIONID=EXIST'),
    ).rejects.toThrow('broken stream');
  });

  it('direct fetch가 abort되면 Zyte로 재시도한다', async () => {
    mockFetch
      .mockRejectedValueOnce(new Error('The operation was aborted'))
      .mockResolvedValueOnce(createZyteResponse('<option value="2301">강변점</option>'));

    await expect(
      fetchLotteMartHtml(
        'https://company.lottemart.com/mobiledowa/test',
        { method: 'GET' },
        1000,
        '',
        'test-key',
      ),
    ).resolves.toContain('강변점');

    expect(String(mockFetch.mock.calls[1]?.[0])).toBe('https://api.zyte.com/v1/extract');
  });

  it('Zyte 요청에는 URLSearchParams body를 문자열로 전달한다', async () => {
    mockFetch
      .mockRejectedValueOnce(new Error('The operation was aborted'))
      .mockResolvedValueOnce(createZyteResponse('ok'));

    await expect(
      fetchLotteMartHtml(
        'https://company.lottemart.com/mobiledowa/test',
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
          },
          body: new URLSearchParams({ keyword: '핫식스', page: '2' }),
        },
        1000,
        '',
        'test-key',
      ),
    ).resolves.toBe('ok');

    const zyteBody = JSON.parse(String(mockFetch.mock.calls[1]?.[1]?.body)) as {
      httpRequestText?: string;
      customHttpRequestHeaders?: Array<{ name: string; value: string }>;
    };
    expect(zyteBody.httpRequestText).toBe('keyword=%ED%95%AB%EC%8B%9D%EC%8A%A4&page=2');
    expect(zyteBody.customHttpRequestHeaders).toEqual(
      expect.arrayContaining([{ name: 'content-type', value: 'application/x-www-form-urlencoded' }]),
    );
  });

  it('Zyte 요청에는 문자열 body도 그대로 전달한다', async () => {
    mockFetch
      .mockRejectedValueOnce(new Error('The operation was aborted'))
      .mockResolvedValueOnce(createZyteResponse('ok'));

    await expect(
      fetchLotteMartHtml(
        'https://company.lottemart.com/mobiledowa/test',
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
          },
          body: 'keyword=%ED%95%AB%EC%8B%9D%EC%8A%A4&page=1',
        },
        1000,
        '',
        'test-key',
      ),
    ).resolves.toBe('ok');

    const zyteBody = JSON.parse(String(mockFetch.mock.calls[1]?.[1]?.body)) as {
      httpRequestText?: string;
    };
    expect(zyteBody.httpRequestText).toBe('keyword=%ED%95%AB%EC%8B%9D%EC%8A%A4&page=1');
  });

  it('Zyte fallback 시 method가 비어 있으면 GET으로 보낸다', async () => {
    mockFetch
      .mockRejectedValueOnce(new Error('The operation was aborted'))
      .mockResolvedValueOnce(createZyteResponse('ok'));

    await expect(
      fetchLotteMartHtml(
        'https://company.lottemart.com/mobiledowa/test',
        {
          headers: {
            'X-Test': '1',
          },
        },
        1000,
        '',
        'test-key',
      ),
    ).resolves.toBe('ok');

    const zyteBody = JSON.parse(String(mockFetch.mock.calls[1]?.[1]?.body)) as {
      httpRequestMethod?: string;
    };
    expect(zyteBody.httpRequestMethod).toBe('GET');
  });

  it('Zyte 응답 본문이 비어 있으면 에러를 던진다', async () => {
    mockFetch
      .mockRejectedValueOnce(new Error('The operation was aborted'))
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ statusCode: 200 }), {
          headers: {
            'Content-Type': 'application/json',
          },
        }),
      );

    await expect(
      fetchLotteMartHtml(
        'https://company.lottemart.com/mobiledowa/test',
        { method: 'GET' },
        1000,
        '',
        'test-key',
      ),
    ).rejects.toThrow('Zyte HTTP 응답 본문이 비어 있습니다.');
  });

  it('페이지 래퍼는 절대 경로로 조합해 HTML을 가져온다', async () => {
    mockFetch.mockResolvedValue(new Response('page ok'));

    await expect(
      fetchLotteMartPageWithSession('/mobiledowa/search_shop.asp', { method: 'POST' }, 1000, ''),
    ).resolves.toBe('page ok');

    expect(String(mockFetch.mock.calls[0]?.[0])).toBe('https://company.lottemart.com/mobiledowa/search_shop.asp');
  });

  it('probeLotteMartRequest는 direct 결과를 요약한다', async () => {
    mockFetch.mockResolvedValue(new Response('ok body', { status: 200, statusText: 'OK' }));

    await expect(
      probeLotteMartRequest('https://company.lottemart.com/mobiledowa/test', { method: 'GET' }, 1000, ''),
    ).resolves.toEqual([
      expect.objectContaining({
        used: 'direct',
        success: true,
        status: 200,
        statusText: 'OK',
        bodyPreview: 'ok body',
      }),
    ]);
  });

  it('probeLotteMartRequest는 direct 실패와 zyte 실패를 함께 기록한다', async () => {
    mockFetch
      .mockRejectedValueOnce(new Error('The operation was aborted'))
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ title: 'Website Ban', detail: 'ban', status: 520 }), {
          status: 520,
          headers: {
            'Content-Type': 'application/json',
          },
        }),
      );

    const result = await probeLotteMartRequest(
      'https://company.lottemart.com/mobiledowa/test',
      { method: 'GET' },
      1000,
      '',
      'test-key',
    );

    expect(result).toEqual([
      expect.objectContaining({
        used: 'direct',
        success: false,
        error: 'The operation was aborted',
      }),
      expect.objectContaining({
        used: 'zyte',
        success: false,
      }),
    ]);
  });
});
