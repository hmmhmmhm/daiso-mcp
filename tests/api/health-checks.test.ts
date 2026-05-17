/**
 * 상세 헬스 체크 실행기 테스트
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { __testOnlyClearHealthCheckCache, runHealthChecks } from '../../src/api/healthChecks.js';

beforeEach(() => {
  __testOnlyClearHealthCheckCache();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

describe('runHealthChecks', () => {
  it('선택된 체크가 없으면 skipped 상태를 반환한다', async () => {
    const fetchImpl = vi.fn();

    const result = await runHealthChecks({
      baseUrl: 'https://example.com',
      mode: 'deep',
      check: 'missing.check',
      fetchImpl,
      now: () => 1000,
    });

    expect(result.status).toBe('skipped');
    expect(result.checks).toEqual([]);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('deep 모드에서 CLI 계약 체크를 실행한다', async () => {
    const fetchImpl = vi.fn((input: RequestInfo | URL) =>
      Promise.resolve(
        String(input).includes('/health')
          ? jsonResponse({ status: 'ok' })
          : jsonResponse({ success: true, data: { ok: true }, meta: { total: 1 } }),
      ),
    );

    const result = await runHealthChecks({
      baseUrl: 'https://example.com',
      check: 'cli.contract',
      mode: 'deep',
      fetchImpl,
      now: () => 1000,
      fresh: true,
    });

    expect(result.status).toBe('ok');
    expect(result.checks[0]).toEqual(
      expect.objectContaining({
        id: 'cli.contract',
        service: 'cli',
        target: 'api-contract',
        status: 'ok',
      }),
    );
    expect(fetchImpl).toHaveBeenCalledWith(
      expect.stringMatching(/^https:\/\/example\.com\/health\?timeoutMs=3000$/),
      expect.any(Object),
    );
    expect(fetchImpl).toHaveBeenCalledWith(
      expect.stringContaining('/api/daiso/products?q='),
      expect.any(Object),
    );
    expect(fetchImpl).toHaveBeenCalledWith(
      expect.stringContaining('/api/lottemart/products?'),
      expect.any(Object),
    );
  });

  it('CLI 계약 체크는 API envelope가 아니면 fail을 반환한다', async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({ status: 'ok' }))
      .mockResolvedValueOnce(jsonResponse({ success: false, error: { message: 'bad envelope' } }));

    const result = await runHealthChecks({
      baseUrl: 'https://example.com',
      check: 'cli.contract',
      mode: 'deep',
      fetchImpl,
      now: () => 1000,
      fresh: true,
    });

    expect(result.status).toBe('fail');
    expect(result.checks[0]).toEqual(
      expect.objectContaining({
        id: 'cli.contract',
        status: 'fail',
        message: 'bad envelope',
      }),
    );
  });

  it('CLI 계약 체크는 객체가 아닌 응답과 fetch 예외를 fail로 처리한다', async () => {
    const nonObjectResult = await runHealthChecks({
      baseUrl: 'https://example.com',
      check: 'cli.contract',
      mode: 'deep',
      fetchImpl: vi.fn().mockResolvedValueOnce(jsonResponse('not-an-object')),
      now: () => 1000,
      fresh: true,
    });
    const errorResult = await runHealthChecks({
      baseUrl: 'https://example.com',
      check: 'cli.contract',
      mode: 'deep',
      fetchImpl: vi.fn().mockRejectedValueOnce(new Error('cli network down')),
      now: () => 1000,
      fresh: true,
    });
    const stringErrorResult = await runHealthChecks({
      baseUrl: 'https://example.com',
      check: 'cli.contract',
      mode: 'deep',
      fetchImpl: vi.fn().mockRejectedValueOnce('cli network down'),
      now: () => 1000,
      fresh: true,
    });

    expect(nonObjectResult.checks[0]).toEqual(
      expect.objectContaining({
        status: 'fail',
        message: '/health CLI 계약 응답이 올바르지 않습니다.',
      }),
    );
    expect(errorResult.checks[0].message).toBe('cli network down');
    expect(stringErrorResult.checks[0].message).toBe('알 수 없는 오류가 발생했습니다.');
  });

  it('CLI 계약 체크는 JSON이 아닌 응답을 fail로 처리한다', async () => {
    const result = await runHealthChecks({
      baseUrl: 'https://example.com',
      check: 'cli.contract',
      mode: 'deep',
      fetchImpl: vi.fn().mockResolvedValueOnce(new Response('not-json', { status: 200 })),
      now: () => 1000,
      fresh: true,
    });

    expect(result.checks[0]).toEqual(
      expect.objectContaining({
        status: 'fail',
        message: '/health CLI 계약 응답이 올바르지 않습니다.',
      }),
    );
  });

  it('fetchImpl이 없으면 전역 fetch를 globalThis 컨텍스트로 호출한다', async () => {
    const globalFetch = vi.fn(function (this: unknown) {
      if (this !== globalThis) {
        throw new Error('invalid fetch this');
      }
      return Promise.resolve(jsonResponse({ success: true, data: { products: [{ name: '상품' }] } }));
    });
    vi.stubGlobal('fetch', globalFetch);

    const result = await runHealthChecks({
      baseUrl: 'https://example.com',
      check: 'daiso.products',
      now: () => 1000,
      fresh: true,
    });

    expect(result.status).toBe('ok');
    expect(globalFetch).toHaveBeenCalledTimes(1);
  });

  it('빈 결과는 degraded 상태로 집계한다', async () => {
    const fetchImpl = vi.fn().mockResolvedValueOnce(jsonResponse({ success: true, data: { products: [] } }));

    const result = await runHealthChecks({
      baseUrl: 'https://example.com',
      check: 'daiso.products',
      fetchImpl,
      now: () => 1000,
      fresh: true,
    });

    expect(result.status).toBe('degraded');
    expect(result.checks[0]).toEqual(
      expect.objectContaining({
        status: 'degraded',
        message: '0 item(s) returned',
      }),
    );
  });

  it('카운트를 알 수 없는 성공 응답은 ok로 처리한다', async () => {
    const fetchImpl = vi.fn().mockResolvedValueOnce(jsonResponse({ success: true, data: { pong: true } }));

    const result = await runHealthChecks({
      baseUrl: 'https://example.com',
      check: 'daiso.products',
      fetchImpl,
      now: () => 1000,
      fresh: true,
    });

    expect(result.status).toBe('ok');
    expect(result.checks[0].message).toBe('response ok');
  });

  it('data.count 값을 결과 개수로 사용한다', async () => {
    const fetchImpl = vi.fn().mockResolvedValueOnce(jsonResponse({ success: true, data: { count: 2 } }));

    const result = await runHealthChecks({
      baseUrl: 'https://example.com',
      check: 'daiso.products',
      fetchImpl,
      now: () => 1000,
      fresh: true,
    });

    expect(result.checks[0].message).toBe('2 item(s) returned');
  });

  it('대표 필드가 숫자로 내려와도 shape를 통과한다', async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({ success: true, data: { products: [{ id: 123 }] } }));

    const result = await runHealthChecks({
      baseUrl: 'https://example.com',
      check: 'daiso.products',
      fetchImpl,
      now: () => 1000,
      fresh: true,
    });

    expect(result.status).toBe('ok');
    expect(result.checks[0].message).toBe('1 item(s) returned');
  });

  it('대표 컬렉션 필드가 바뀌면 degraded 메시지를 반환한다', async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({ success: true, data: { products: [{ unexpected: 'value' }] } }));

    const result = await runHealthChecks({
      baseUrl: 'https://example.com',
      check: 'daiso.products',
      fetchImpl,
      now: () => 1000,
      fresh: true,
    });

    expect(result.status).toBe('degraded');
    expect(result.checks[0].message).toContain('response missing required fields');
  });

  it('JSON이 아닌 실패 응답은 HTTP 상태 메시지를 반환한다', async () => {
    const fetchImpl = vi.fn().mockResolvedValueOnce(new Response('not-json', { status: 502 }));

    const result = await runHealthChecks({
      baseUrl: 'https://example.com',
      check: 'daiso.products',
      fetchImpl,
      now: () => 1000,
      fresh: true,
    });

    expect(result.status).toBe('fail');
    expect(result.checks[0]).toEqual(
      expect.objectContaining({
        httpStatus: 502,
        message: 'HTTP 502',
      }),
    );
  });

  it('fetch 예외와 문자열 예외를 fail로 처리한다', async () => {
    const errorFetch = vi.fn().mockRejectedValueOnce(new Error('network down'));
    const stringFetch = vi.fn().mockRejectedValueOnce('network down');

    const errorResult = await runHealthChecks({
      baseUrl: 'https://example.com',
      check: 'daiso.products',
      fetchImpl: errorFetch,
      now: () => 1000,
      fresh: true,
    });
    const stringResult = await runHealthChecks({
      baseUrl: 'https://example.com',
      check: 'daiso.products',
      fetchImpl: stringFetch,
      now: () => 1000,
      fresh: true,
      includeSamples: true,
    });

    expect(errorResult.checks[0].message).toBe('network down');
    expect(stringResult.checks[0].message).toBe('알 수 없는 오류가 발생했습니다.');
  });

  it('timeoutMs를 기본값과 최대값으로 보정한다', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse({ success: true, data: { products: [{ name: '상품' }] } }));

    await runHealthChecks({
      baseUrl: 'https://example.com',
      check: 'daiso.products',
      timeoutMs: Number.NaN,
      fetchImpl,
      now: () => 1000,
      fresh: true,
    });
    await runHealthChecks({
      baseUrl: 'https://example.com',
      check: 'daiso.products',
      timeoutMs: 50000,
      fetchImpl,
      now: () => 2000,
      fresh: true,
    });

    expect(String(fetchImpl.mock.calls[0][0])).toContain('timeoutMs=3000');
    expect(String(fetchImpl.mock.calls[1][0])).toContain('timeoutMs=10000');
  });

  it('timeoutMs가 1보다 작으면 기본값으로 보정한다', async () => {
    const fetchImpl = vi.fn().mockResolvedValueOnce(jsonResponse({ success: true, data: { products: [{ name: '상품' }] } }));

    await runHealthChecks({
      baseUrl: 'https://example.com',
      check: 'daiso.products',
      timeoutMs: -1,
      fetchImpl,
      now: () => 1000,
      fresh: true,
    });

    expect(String(fetchImpl.mock.calls[0][0])).toContain('timeoutMs=3000');
  });

  it('샘플 요청에서 data가 객체가 아니면 sample을 생략한다', async () => {
    const fetchImpl = vi.fn().mockResolvedValueOnce(jsonResponse({ success: true, data: null }));

    const result = await runHealthChecks({
      baseUrl: 'https://example.com',
      check: 'daiso.products',
      fetchImpl,
      now: () => 1000,
      fresh: true,
      includeSamples: true,
    });

    expect(result.checks[0].sample).toBeUndefined();
  });

  it('샘플 후보 배열에 이름 필드가 없으면 sample을 생략한다', async () => {
    const fetchImpl = vi.fn().mockResolvedValueOnce(
      jsonResponse({
        success: true,
        data: {
          products: [{ code: 'NO_NAME' }],
        },
      }),
    );

    const result = await runHealthChecks({
      baseUrl: 'https://example.com',
      check: 'daiso.products',
      fetchImpl,
      now: () => 1000,
      fresh: true,
      includeSamples: true,
    });

    expect(result.checks[0].sample).toBeUndefined();
  });

  it('샘플 이름 후보를 순서대로 찾는다', async () => {
    const fetchImpl = vi.fn().mockResolvedValueOnce(
      jsonResponse({
        success: true,
        data: {
          stores: [null, { storeName: '강남점' }],
          theaters: [{ theaterName: '극장A' }],
        },
      }),
    );

    const result = await runHealthChecks({
      baseUrl: 'https://example.com',
      check: 'cu.stores',
      fetchImpl,
      now: () => 1000,
      fresh: true,
      includeSamples: true,
    });

    expect(result.checks[0].sample).toEqual({ first: '극장A' });
  });
});
