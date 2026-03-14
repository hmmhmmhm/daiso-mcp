import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  __testOnlyClearLotteMartSessionCache,
  fetchLotteMartHtml,
  getCachedLotteMartSessionCookie,
  getFreshLotteMartSessionCookie,
} from '../../../src/services/lottemart/session.js';

const mockFetch = vi.fn();

beforeEach(() => {
  mockFetch.mockReset();
  __testOnlyClearLotteMartSessionCache();
  vi.stubGlobal('fetch', mockFetch);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('lottemart session helpers', () => {
  it('세션 쿠키를 캐시하고 재사용한다', async () => {
    mockFetch.mockResolvedValue(new Response('', { headers: { 'set-cookie': 'ASPSESSIONID=A; path=/' } }));

    const first = await getCachedLotteMartSessionCookie(1000);
    const second = await getCachedLotteMartSessionCookie(1000);

    expect(first).toBe('ASPSESSIONID=A');
    expect(second).toBe('ASPSESSIONID=A');
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it('강제 새로고침이면 새 세션을 다시 받는다', async () => {
    mockFetch
      .mockResolvedValueOnce(new Response('', { headers: { 'set-cookie': 'ASPSESSIONID=A; path=/' } }))
      .mockResolvedValueOnce(new Response('', { headers: { 'set-cookie': 'ASPSESSIONID=B; path=/' } }));

    const first = await getCachedLotteMartSessionCookie(1000);
    const second = await getCachedLotteMartSessionCookie(1000, true);

    expect(first).toBe('ASPSESSIONID=A');
    expect(second).toBe('ASPSESSIONID=B');
    expect(mockFetch).toHaveBeenCalledTimes(2);
  });

  it('세션 쿠키가 없으면 빈 문자열을 반환한다', async () => {
    mockFetch.mockResolvedValue({
      headers: {
        get: () => null,
      },
    } as Response);

    await expect(getFreshLotteMartSessionCookie(1000)).resolves.toBe('');
  });

  it('getSetCookie 응답도 세션 쿠키로 인식한다', async () => {
    const response = new Response('');
    const headers = response.headers as Headers & { getSetCookie?: () => string[] };
    headers.getSetCookie = () => ['ASPSESSIONID=C; path=/', 'other=value; path=/'];
    mockFetch.mockResolvedValue(response);

    await expect(getFreshLotteMartSessionCookie(1000)).resolves.toBe('ASPSESSIONID=C');
  });

  it('getSetCookie가 없으면 set-cookie 헤더를 사용한다', async () => {
    mockFetch.mockResolvedValue({
      headers: {
        get: () => 'ASPSESSIONID=D; path=/',
      },
    } as Response);

    await expect(getFreshLotteMartSessionCookie(1000)).resolves.toBe('ASPSESSIONID=D');
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

    expect(mockFetch).toHaveBeenCalledWith(
      'https://company.lottemart.com/mobiledowa/test',
      expect.objectContaining({
        method: 'POST',
        headers: expect.any(Headers),
      }),
    );

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
});
