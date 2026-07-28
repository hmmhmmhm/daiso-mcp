/**
 * CGV 전송 계층 테스트
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CgvUpstreamUnavailableError } from '../../../src/services/cgv/errors.js';
import { requestCgv } from '../../../src/services/cgv/transport.js';

const mockFetch = vi.fn();

beforeEach(() => {
  mockFetch.mockReset();
  vi.stubGlobal('fetch', mockFetch);
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('requestCgv', () => {
  it('정상 응답을 JSON으로 파싱한다', async () => {
    mockFetch.mockResolvedValueOnce(
      new Response(JSON.stringify({ statusCode: 0, data: [] }), { status: 200 }),
    );

    const result = await requestCgv<{ statusCode: number; data: unknown[] }>(
      '/cnm/atkt/searchRegnList',
      new URLSearchParams({ coCd: 'A420' }),
      1000,
    );

    expect(result.statusCode).toBe(0);
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it('200이어도 JSON 파싱 불가면 에러를 던진다', async () => {
    mockFetch.mockResolvedValueOnce(new Response('<html>bad</html>', { status: 200 }));

    await expect(
      requestCgv('/cnm/atkt/searchRegnList', new URLSearchParams({ coCd: 'A420' }), 1000),
    ).rejects.toThrow('bad');
  });

  it('빈 본문 파싱 실패 시 기본 에러 메시지를 던진다', async () => {
    mockFetch.mockResolvedValueOnce(new Response('', { status: 200 }));

    await expect(
      requestCgv('/cnm/atkt/searchRegnList', new URLSearchParams({ coCd: 'A420' }), 1000),
    ).rejects.toThrow('CGV API 응답 파싱 실패');
  });

  it('403 + zyteApiKey면 Zyte fallback을 사용한다', async () => {
    const body = Buffer.from(
      JSON.stringify({ statusCode: 0, data: [{ siteNo: '0056' }] }),
      'utf8',
    ).toString('base64');

    mockFetch
      .mockResolvedValueOnce(new Response('forbidden', { status: 403 }))
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            statusCode: 200,
            httpResponseBody: body,
          }),
          { status: 200 },
        ),
      );

    const result = await requestCgv<{ statusCode: number; data: Array<{ siteNo: string }> }>(
      '/cnm/atkt/searchRegnList',
      new URLSearchParams({ coCd: 'A420' }),
      1000,
      'test-key',
    );

    expect(result.data[0].siteNo).toBe('0056');
    expect(String(mockFetch.mock.calls[1][0])).toContain('https://api.zyte.com/v1/extract');
  });

  it('직접 요청이 403이고 Zyte 키가 없으면 명시적인 upstream unavailable 오류를 던진다', async () => {
    mockFetch.mockResolvedValueOnce(new Response('forbidden', { status: 403 }));

    await expect(
      requestCgv('/cnm/atkt/searchRegnList', new URLSearchParams({ coCd: 'A420' }), 1000),
    ).rejects.toBeInstanceOf(CgvUpstreamUnavailableError);
  });

  it('Zyte 계정이 중지된 경우 원문 대신 명시적인 upstream unavailable 오류를 던진다', async () => {
    mockFetch
      .mockResolvedValueOnce(new Response('forbidden', { status: 403 }))
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            title: 'Forbidden',
            detail: 'account suspended',
          }),
          { status: 403 },
        ),
      );

    await expect(
      requestCgv(
        '/cnm/atkt/searchRegnList',
        new URLSearchParams({ coCd: 'A420' }),
        1000,
        'test-key',
      ),
    ).rejects.toMatchObject({
      name: 'CgvUpstreamUnavailableError',
      message: expect.not.stringContaining('account suspended'),
    });
  });

  it('AbortError는 시간 초과 에러로 변환한다', async () => {
    mockFetch.mockRejectedValueOnce(new DOMException('aborted', 'AbortError'));

    await expect(
      requestCgv('/cnm/atkt/searchRegnList', new URLSearchParams({ coCd: 'A420' }), 1000),
    ).rejects.toThrow('CGV API 요청 시간 초과');
  });

  it('일반 HTTP 에러는 상태코드 메시지를 던진다', async () => {
    mockFetch.mockResolvedValueOnce(new Response('server error', { status: 500 }));

    await expect(
      requestCgv('/cnm/atkt/searchRegnList', new URLSearchParams({ coCd: 'A420' }), 1000),
    ).rejects.toThrow('CGV API 호출 실패: 500');
  });

  it('Buffer가 없고 btoa가 있으면 btoa 경로를 사용한다', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      text: vi.fn().mockResolvedValue(JSON.stringify({ statusCode: 0, data: [] })),
    } as unknown as Response);
    const btoaMock = vi.fn().mockReturnValue('encoded');

    vi.stubGlobal('Buffer', undefined);
    vi.stubGlobal('btoa', btoaMock);

    await requestCgv('/cnm/atkt/searchRegnList', new URLSearchParams({ coCd: 'A420' }), 1000);

    expect(btoaMock).toHaveBeenCalled();
  });

  it('Base64 인코딩 수단이 없으면 에러를 던진다', async () => {
    vi.stubGlobal('Buffer', undefined);
    vi.stubGlobal('btoa', undefined);

    await expect(
      requestCgv('/cnm/atkt/searchRegnList', new URLSearchParams({ coCd: 'A420' }), 1000),
    ).rejects.toThrow('Base64 인코딩을 지원하지 않는 런타임입니다.');
  });
});
