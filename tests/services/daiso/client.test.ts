/**
 * 다이소 클라이언트 테스트
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { daisoFetch, fetchDaisoHtml, fetchDaisoJson } from '../../../src/services/daiso/client.js';

const mockFetch = vi.fn();

beforeEach(() => {
  mockFetch.mockReset();
  vi.stubGlobal('fetch', mockFetch);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('daisoFetch', () => {
  it('다이소 기본 헤더를 포함한다', async () => {
    mockFetch.mockResolvedValue(new Response('OK'));

    await daisoFetch('https://example.com/api');

    expect(mockFetch).toHaveBeenCalledWith(
      'https://example.com/api',
      expect.objectContaining({
        headers: expect.objectContaining({
          'User-Agent': expect.any(String),
          Accept: 'application/json, text/html, */*',
          'Accept-Language': 'ko-KR,ko;q=0.9,en-US;q=0.8,en;q=0.7',
        }),
      }),
    );
  });

  it('커스텀 헤더를 병합한다', async () => {
    mockFetch.mockResolvedValue(new Response('OK'));

    await daisoFetch('https://example.com/api', {
      headers: { 'X-Custom': 'value' },
    });

    expect(mockFetch).toHaveBeenCalledWith(
      'https://example.com/api',
      expect.objectContaining({
        headers: expect.objectContaining({
          'X-Custom': 'value',
          Accept: 'application/json, text/html, */*',
        }),
      }),
    );
  });
});

describe('fetchDaisoJson', () => {
  it('JSON 응답을 반환한다', async () => {
    mockFetch.mockResolvedValue(new Response(JSON.stringify({ ok: true })));
    const result = await fetchDaisoJson<{ ok: boolean }>('https://example.com/api');
    expect(result.ok).toBe(true);
  });
});

describe('fetchDaisoHtml', () => {
  it('HTML 응답을 반환한다', async () => {
    mockFetch.mockResolvedValue(new Response('<html></html>'));
    const result = await fetchDaisoHtml('https://example.com/page');
    expect(result).toBe('<html></html>');
  });
});
