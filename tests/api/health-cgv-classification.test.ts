import { describe, it, expect, vi } from 'vitest';
import { runHealthChecks } from '../../src/api/healthChecks.js';
import { ServiceError, toServiceErrorDiagnostics } from '../../src/core/errors.js';
import { CgvUpstreamUnavailableError } from '../../src/services/cgv/errors.js';
const blocked = (status = 403, code = 'CGV_UPSTREAM_UNAVAILABLE') =>
  Response.json(
    {
      success: false,
      error: { code, message: 'CGV unavailable' },
      diagnostics: { upstreamStatus: status },
    },
    { status: 503 },
  );
describe('CGV 원본 차단만 구분', () => {
  it('HTTP200이더라도 JSON 파싱 실패는 fail로 처리한다', async () => {
    const result = await runHealthChecks({
      baseUrl: 'https://test',
      service: 'cgv',
      fresh: true,
      fetchImpl: vi.fn(async () => new Response('not json')),
    });
    expect(result.status).toBe('fail');
    expect(result.checks[0].message).toContain('invalid JSON');
  });
  it('CGV 오류가 원본상태를 구조화 진단으로 보존한다', () => {
    const error = new CgvUpstreamUnavailableError(403);
    expect(error).toBeInstanceOf(ServiceError);
    expect(toServiceErrorDiagnostics(error as ServiceError, 'theaters')).toMatchObject({
      code: 'CGV_UPSTREAM_UNAVAILABLE',
      upstreamStatus: 403,
    });
  });
  it('확인된403은degraded지만401/다른코드/시간초과는fail이다', async () => {
    for (const [upstream, code, expected] of [
      [403, 'CGV_UPSTREAM_UNAVAILABLE', 'degraded'],
      [401, 'CGV_UPSTREAM_UNAVAILABLE', 'fail'],
      [403, 'OTHER', 'fail'],
    ] as const) {
      const r = await runHealthChecks({
        baseUrl: 'https://test',
        service: 'cgv',
        fresh: true,
        fetchImpl: vi.fn(async () => blocked(upstream, code)),
      });
      expect(r.status).toBe(expected);
    }
    const result = await runHealthChecks({
      baseUrl: 'https://test',
      service: 'cgv',
      fresh: true,
      fetchImpl: vi.fn(async () => {
        throw Error('timeout');
      }),
    });
    expect(result.status).toBe('fail');
  });
  it('CLI 계약 검사도 CGV에만 동일한403정책을 적용한다', async () => {
    const fetchImpl = vi.fn(async (input: RequestInfo | URL) => {
      const path = new URL(String(input)).pathname;
      if (path.startsWith('/api/cgv/')) return blocked();
      return Response.json(path === '/health' ? { status: 'ok' } : { success: true, data: {} });
    });
    const result = await runHealthChecks({
      baseUrl: 'https://test',
      check: 'cli.contract',
      mode: 'full',
      fresh: true,
      fetchImpl,
    });
    expect(result.status).toBe('degraded');
    fetchImpl.mockImplementation(async () => blocked());
    const unrelated = await runHealthChecks({
      baseUrl: 'https://test',
      service: 'oliveyoung',
      fresh: true,
      fetchImpl,
    });
    expect(unrelated.status).toBe('fail');
  });
});
