import { describe, it, expect, vi, afterEach } from 'vitest';
import {
  withDiagnostics,
  diagnosticEvent,
  diagnosticHeaders,
  diagnosticOperation,
} from '../../src/utils/diagnostics.js';
describe('요청 진단 컨텍스트', () => {
  afterEach(() => vi.restoreAllMocks());
  it('동시 요청 ID를 격리하고 민감값과 임의 필드를 제외한다', async () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});
    const ids = await Promise.all(
      [1, 2].map(async (n) =>
        withDiagnostics(async () => {
          const first = diagnosticHeaders()['x-request-id'];
          await Promise.resolve();
          diagnosticEvent({
            stage: 'http',
            outcome: 'error',
            operation: 'products',
            status: 503,
            secret: 'password',
          } as never);
          expect(diagnosticHeaders()['x-request-id']).toBe(first);
          return first + n;
        }),
      ),
    );
    expect(ids[0]).not.toBe(ids[1]);
    expect(log).toHaveBeenCalledTimes(2);
    expect(JSON.stringify(log.mock.calls)).not.toContain('password');
    expect(diagnosticHeaders()).toEqual({});
  });
  it('컨텍스트 밖에서는 기록하지 않고 성공은 샘플링한다', async () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});
    diagnosticEvent({ stage: 'http', outcome: 'error' });
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
    await withDiagnostics(async () => diagnosticEvent({ stage: 'http', outcome: 'ok' }));
    expect(log).not.toHaveBeenCalled();
    vi.spyOn(Math, 'random').mockReturnValue(0);
    await withDiagnostics(async () =>
      diagnosticEvent({ stage: 'http', outcome: 'ok', durationMs: 12 }),
    );
    expect(log).toHaveBeenCalledTimes(1);
  });
  it('정해진 API 경로만 식별하고 query와 임의 경로를 기록하지 않는다', () => {
    expect(diagnosticOperation('https://x/api/oliveyoung/products?keyword=secret')).toBe(
      'oliveyoung.products',
    );
    expect(diagnosticOperation('https://x/mcp')).toBe('mcp');
    expect(diagnosticOperation('https://x/secret')).toBe('other');
  });
});
it('내부 API 재호출은 바깥 요청 ID를 유지한다', async () => {
  await withDiagnostics(async () => {
    const parent = diagnosticHeaders()['x-request-id'];
    await withDiagnostics(async () => {
      expect(diagnosticHeaders()['x-request-id']).toBe(parent);
    });
  });
});
