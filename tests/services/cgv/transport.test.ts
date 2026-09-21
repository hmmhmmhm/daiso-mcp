/**
 * CGV 전송 계층 테스트
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { toStandardErrorDiagnostics } from '../../../src/core/errors.js';
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
  it('CGV가 허용하는 브라우저 User-Agent로 직접 요청한다', async () => {
    mockFetch.mockImplementationOnce((_url: string, init: RequestInit) => {
      const userAgent = new Headers(init.headers).get('User-Agent');
      if (userAgent !== 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36') {
        return Promise.resolve(new Response('blocked', { status: 403 }));
      }
      return Promise.resolve(Response.json({ statusCode: 0, data: [{ regnGrpCd: '01' }] }));
    });

    await expect(
      requestCgv('/cnm/atkt/searchRegnList', new URLSearchParams({ coCd: 'A420' }), 1000),
    ).resolves.toEqual({ statusCode: 0, data: [{ regnGrpCd: '01' }] });
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

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

  it.each([401, 403])('키가 있어도 %i이면 유료 호출 없이 원본 상태를 알린다', async (status) => {
    mockFetch.mockResolvedValueOnce(new Response('blocked', { status }));
    await expect(
      requestCgv(
        '/cnm/atkt/searchRegnList',
        new URLSearchParams({ coCd: 'A420' }),
        1000,
        'test-key',
      ),
    ).rejects.toMatchObject({
      name: 'CgvUpstreamUnavailableError',
      upstreamStatus: status,
      message: expect.stringContaining(`HTTP ${status}`),
    });
    expect(mockFetch).toHaveBeenCalledTimes(1);
    expect(mockFetch.mock.calls.some(([url]) => new URL(String(url)).hostname === 'api.zyte.com')).toBe(false);
  });

  it('직접 요청이 403이고 Zyte 키가 없으면 명시적인 upstream unavailable 오류를 던진다', async () => {
    mockFetch.mockResolvedValueOnce(new Response('forbidden', { status: 403 }));

    await expect(
      requestCgv('/cnm/atkt/searchRegnList', new URLSearchParams({ coCd: 'A420' }), 1000),
    ).rejects.toBeInstanceOf(CgvUpstreamUnavailableError);
  });

  it('직접 요청이 401이어도 명시적인 upstream unavailable 오류를 던진다', async () => {
    mockFetch.mockResolvedValueOnce(new Response('unauthorized', { status: 401 }));

    await expect(
      requestCgv('/cnm/atkt/searchRegnList', new URLSearchParams({ coCd: 'A420' }), 1000),
    ).rejects.toBeInstanceOf(CgvUpstreamUnavailableError);
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

it('CGV 인증 차단은 비용 정책 안내와 함께 재시도 불가로 진단한다', async () => {
  mockFetch.mockResolvedValueOnce(new Response('blocked', { status: 403 }));
  const error = await requestCgv('/test', new URLSearchParams(), 1000, 'test-key').catch(
    (error: Error) => error,
  );
  expect(error).toBeInstanceOf(CgvUpstreamUnavailableError);
  expect(
    toStandardErrorDiagnostics('CGV_UPSTREAM_UNAVAILABLE', (error as Error).message, {
      status: 503,
    }),
  ).toMatchObject({ retryable: false, hint: expect.stringContaining('비용 정책') });
});

it('원본 상태가 없는 CGV 오류의 기존 메시지를 유지한다', () => {
  const error = new CgvUpstreamUnavailableError();
  expect(error.message).toBe('CGV 원본 서비스에 연결할 수 없습니다. Zyte 유료 호출은 비용 정책에 따라 비활성화되어 있습니다.');
});
