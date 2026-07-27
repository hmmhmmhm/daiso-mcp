/**
 * 차단 응답용 Zyte JSON 폴백 테스트
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fetchJsonWithZyteFallback } from '../../src/utils/zyteJsonFallback.js';

const mockFetch = vi.fn();

function encodeJson(value: unknown): string {
  return Buffer.from(JSON.stringify(value), 'utf8').toString('base64');
}

function zyteResponse(value: unknown, statusCode = 200): Response {
  return new Response(
    JSON.stringify({
      statusCode,
      httpResponseBody: encodeJson(value),
    }),
    {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    },
  );
}

beforeEach(() => {
  mockFetch.mockReset();
  vi.stubGlobal('fetch', mockFetch);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('fetchJsonWithZyteFallback', () => {
  it('원본 요청이 성공하면 Zyte를 호출하지 않는다', async () => {
    mockFetch.mockResolvedValueOnce(
      new Response(JSON.stringify({ success: true }), {
        headers: { 'Content-Type': 'application/json' },
      }),
    );

    await expect(
      fetchJsonWithZyteFallback('https://example.com/api', {
        method: 'GET',
        zyteApiKey: 'test-key',
      }),
    ).resolves.toEqual({ success: true });

    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it.each([400, 403, 429])('원본 %s 응답이면 Zyte로 재시도한다', async (status) => {
    mockFetch
      .mockResolvedValueOnce(new Response('blocked', { status }))
      .mockResolvedValueOnce(zyteResponse({ success: true }));

    await expect(
      fetchJsonWithZyteFallback('https://example.com/api', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: '{"query":"coffee"}',
        zyteApiKey: 'test-key',
        zyteTags: { service: 'test' },
      }),
    ).resolves.toEqual({ success: true });

    expect(mockFetch).toHaveBeenCalledTimes(2);
  });

  it('Zyte 요청에 원본 메서드, 헤더, 본문, 태그를 보존한다', async () => {
    mockFetch
      .mockResolvedValueOnce(new Response('blocked', { status: 403 }))
      .mockResolvedValueOnce(zyteResponse({ ok: true }));

    await fetchJsonWithZyteFallback('https://example.com/api', {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
      },
      body: '{"query":"커피"}',
      zyteApiKey: 'test-key',
      zyteTags: { service: 'seveneleven' },
    });

    const zyteInit = mockFetch.mock.calls[1][1] as RequestInit;
    const zytePayload = JSON.parse(String(zyteInit.body)) as Record<string, unknown>;
    expect(zytePayload).toMatchObject({
      url: 'https://example.com/api',
      httpRequestMethod: 'POST',
      httpRequestText: '{"query":"커피"}',
      httpResponseBody: true,
      tags: { service: 'seveneleven' },
    });
    expect(zytePayload.customHttpRequestHeaders).toEqual(
      expect.arrayContaining([
        { name: 'accept', value: 'application/json' },
        { name: 'content-type', value: 'application/json' },
      ]),
    );
  });

  it('원본 500 응답은 Zyte로 재시도하지 않는다', async () => {
    mockFetch.mockResolvedValueOnce(new Response('origin error', { status: 500 }));

    await expect(
      fetchJsonWithZyteFallback('https://example.com/api', {
        zyteApiKey: 'test-key',
      }),
    ).rejects.toThrow('API 요청 실패: 500');

    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it('Zyte 대상 응답이 성공이 아니면 상태 코드를 포함해 실패한다', async () => {
    mockFetch
      .mockResolvedValueOnce(new Response('blocked', { status: 403 }))
      .mockResolvedValueOnce(zyteResponse({ error: 'still blocked' }, 403));

    await expect(
      fetchJsonWithZyteFallback('https://example.com/api', {
        zyteApiKey: 'test-key',
      }),
    ).rejects.toThrow('Zyte 대상 응답 실패: 403');
  });

  it('Zyte 응답 본문이 없으면 실패한다', async () => {
    mockFetch
      .mockResolvedValueOnce(new Response('blocked', { status: 403 }))
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ statusCode: 200 }), {
          headers: { 'Content-Type': 'application/json' },
        }),
      );

    await expect(
      fetchJsonWithZyteFallback('https://example.com/api', {
        zyteApiKey: 'test-key',
      }),
    ).rejects.toThrow('Zyte HTTP 응답 본문이 비어 있습니다.');
  });

  it('Zyte 응답 본문이 JSON이 아니면 실패한다', async () => {
    mockFetch
      .mockResolvedValueOnce(new Response('blocked', { status: 403 }))
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            statusCode: 200,
            httpResponseBody: Buffer.from('not-json', 'utf8').toString('base64'),
          }),
          { headers: { 'Content-Type': 'application/json' } },
        ),
      );

    await expect(
      fetchJsonWithZyteFallback('https://example.com/api', {
        zyteApiKey: 'test-key',
      }),
    ).rejects.toThrow();
  });

  it('Zyte 계정 오류를 호출자에게 전달한다', async () => {
    mockFetch
      .mockResolvedValueOnce(new Response('blocked', { status: 403 }))
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            status: 403,
            detail: 'Your account has been suspended.',
          }),
          {
            status: 403,
            headers: { 'Content-Type': 'application/json' },
          },
        ),
      );

    await expect(
      fetchJsonWithZyteFallback('https://example.com/api', {
        zyteApiKey: 'test-key',
      }),
    ).rejects.toThrow('Zyte API 호출 실패: 403 Your account has been suspended.');
  });
});
