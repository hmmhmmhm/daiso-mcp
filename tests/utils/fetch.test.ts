/**
 * Fetch 유틸리티 테스트
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { daisoFetch, fetchJson, fetchHtml } from '../../src/utils/fetch.js';

// 글로벌 fetch 모킹
const mockFetch = vi.fn();

beforeEach(() => {
  mockFetch.mockReset();
  vi.stubGlobal('fetch', mockFetch);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('daisoFetch', () => {
  it('기본 옵션으로 요청을 보낸다', async () => {
    mockFetch.mockResolvedValue(new Response('OK'));

    await daisoFetch('https://example.com/api');

    expect(mockFetch).toHaveBeenCalledWith(
      'https://example.com/api',
      expect.objectContaining({})
    );
  });

  it('커스텀 헤더를 전달할 수 있다', async () => {
    mockFetch.mockResolvedValue(new Response('OK'));

    await daisoFetch('https://example.com/api', {
      headers: { 'X-Custom': 'value' },
    });

    expect(mockFetch).toHaveBeenCalledWith(
      'https://example.com/api',
      expect.objectContaining({
        headers: { 'X-Custom': 'value' },
      })
    );
  });

  it('응답을 반환한다', async () => {
    const mockResponse = new Response('test body');
    mockFetch.mockResolvedValue(mockResponse);

    const response = await daisoFetch('https://example.com/api');

    expect(response).toBe(mockResponse);
  });

  it('타임아웃 시 요청을 중단한다', async () => {
    // 느린 응답 시뮬레이션
    mockFetch.mockImplementation(() => {
      return new Promise((_, reject) => {
        const error = new Error('aborted');
        error.name = 'AbortError';
        setTimeout(() => reject(error), 50);
      });
    });

    await expect(daisoFetch('https://example.com/api', { timeout: 10 })).rejects.toThrow();
  });

  it('추가 옵션을 전달할 수 있다', async () => {
    mockFetch.mockResolvedValue(new Response('OK'));

    await daisoFetch('https://example.com/api', {
      method: 'POST',
      body: JSON.stringify({ key: 'value' }),
    });

    expect(mockFetch).toHaveBeenCalledWith(
      'https://example.com/api',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ key: 'value' }),
      })
    );
  });

  it('일시적인 5xx 응답은 지정 횟수만큼 재시도한다', async () => {
    mockFetch
      .mockResolvedValueOnce(new Response('origin timeout', { status: 522, statusText: 'Origin Timeout' }))
      .mockResolvedValueOnce(new Response('OK'));

    const response = await daisoFetch('https://example.com/api', { retries: 1, retryDelayMs: 0 });

    expect(await response.text()).toBe('OK');
    expect(mockFetch).toHaveBeenCalledTimes(2);
  });

  it('재시도 지연 시간이 있으면 다음 시도 전에 기다린다', async () => {
    mockFetch
      .mockResolvedValueOnce(new Response('try later', { status: 503, statusText: 'Service Unavailable' }))
      .mockResolvedValueOnce(new Response('OK'));

    const response = await daisoFetch('https://example.com/api', { retries: 1, retryDelayMs: 1 });

    expect(await response.text()).toBe('OK');
    expect(mockFetch).toHaveBeenCalledTimes(2);
  });

  it('타임아웃 같은 네트워크 오류도 재시도 후 마지막 오류를 던진다', async () => {
    const abortError = new Error('aborted');
    abortError.name = 'AbortError';
    mockFetch.mockRejectedValue(abortError);

    await expect(
      daisoFetch('https://example.com/api', { timeout: 10, retries: 2, retryDelayMs: 0 }),
    ).rejects.toThrow('aborted');
    expect(mockFetch).toHaveBeenCalledTimes(3);
  });
});

describe('fetchJson', () => {
  it('JSON 응답을 파싱하여 반환한다', async () => {
    const mockData = { name: 'test', value: 123 };
    mockFetch.mockResolvedValue(new Response(JSON.stringify(mockData)));

    const result = await fetchJson<typeof mockData>('https://example.com/api');

    expect(result).toEqual(mockData);
  });

  it('응답이 성공하지 않으면 에러를 던진다', async () => {
    mockFetch.mockResolvedValue(new Response('Not Found', { status: 404, statusText: 'Not Found' }));

    await expect(fetchJson('https://example.com/api')).rejects.toThrow(
      'API 요청 실패: 404 Not Found - Not Found',
    );
  });

  it('500 에러도 처리한다', async () => {
    mockFetch.mockResolvedValue(new Response('Server Error', { status: 500, statusText: 'Internal Server Error' }));

    await expect(fetchJson('https://example.com/api')).rejects.toThrow(
      'API 요청 실패: 500 Internal Server Error - Server Error',
    );
  });
});

describe('fetchHtml', () => {
  it('HTML 응답을 문자열로 반환한다', async () => {
    const htmlContent = '<html><body>Hello</body></html>';
    mockFetch.mockResolvedValue(new Response(htmlContent));

    const result = await fetchHtml('https://example.com/page');

    expect(result).toBe(htmlContent);
  });

  it('응답이 성공하지 않으면 에러를 던진다', async () => {
    mockFetch.mockResolvedValue(new Response('Forbidden', { status: 403, statusText: 'Forbidden' }));

    await expect(fetchHtml('https://example.com/page')).rejects.toThrow(
      'API 요청 실패: 403 Forbidden - Forbidden',
    );
  });
});
