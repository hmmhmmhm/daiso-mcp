/**
 * 다이소 클라이언트 테스트
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createDaisoAuthContext,
  daisoFetch,
  fetchDaisoHtml,
  fetchDaisoJson,
  fetchDaisoJsonWithAuth,
} from '../../../src/services/daiso/client.js';

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

describe('createDaisoAuthContext', () => {
  it('auth/request 응답으로 인증 컨텍스트를 만든다', async () => {
    mockFetch.mockResolvedValue(
      new Response('sample-token', {
        headers: {
          'X-DM-UID': 'dm-uid-123',
        },
      }),
    );

    const context = await createDaisoAuthContext();

    expect(context.dmUid).toBe('dm-uid-123');
    expect(context.cookie).toBe('DM_UID=dm-uid-123');
    expect(context.authorization).toMatch(/^Bearer /);
  });

  it('X-DM-UID 헤더가 없으면 에러를 던진다', async () => {
    mockFetch.mockResolvedValue(new Response('sample-token'));

    await expect(createDaisoAuthContext()).rejects.toThrow('X-DM-UID');
  });
});

describe('fetchDaisoJsonWithAuth', () => {
  it('인증 헤더를 포함해 요청한다', async () => {
    mockFetch
      .mockResolvedValueOnce(
        new Response('sample-token', {
          headers: { 'X-DM-UID': 'dm-uid-123' },
        }),
      )
      .mockResolvedValueOnce(new Response(JSON.stringify({ ok: true })));

    const result = await fetchDaisoJsonWithAuth<{ ok: boolean }>('https://example.com/api', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ hello: 'world' }),
    });

    expect(result.ok).toBe(true);
    expect(mockFetch).toHaveBeenNthCalledWith(
      2,
      'https://example.com/api',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          Authorization: expect.stringMatching(/^Bearer /),
          'X-DM-UID': 'dm-uid-123',
          Cookie: 'DM_UID=dm-uid-123',
        }),
      }),
    );
  });
});
