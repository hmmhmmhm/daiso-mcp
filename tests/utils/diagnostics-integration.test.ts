import { Hono } from 'hono';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { diagnosticsMiddleware } from '../../src/middleware/diagnostics.js';
import { withDiagnostics } from '../../src/utils/diagnostics.js';
import { fetchJson } from '../../src/utils/http.js';
import { requestOliveyoung } from '../../src/services/oliveyoung/transport.js';
describe('진단 경계 통합', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });
  it('REST 실패 응답 ID와 로그를 연결하고 입력 헤더와 query를 기록하지 않는다', async () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});
    const app = new Hono();
    app.use('*', diagnosticsMiddleware);
    app.get('/api/oliveyoung/products', (c) => c.json({ error: true }, 503));
    const r = await app.request('/api/oliveyoung/products?keyword=private', {
      headers: { 'x-request-id': 'private' },
    });
    const event = JSON.parse(log.mock.calls[0][0] as string);
    expect(event.requestId).toBe(r.headers.get('x-request-id'));
    expect(event.operation).toBe('oliveyoung.products');
    expect(JSON.stringify(log.mock.calls)).not.toContain('private');
  });
  it('HTTP 실패의 상태와 네트워크 실패를 본문 없이 기록한다', async () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValueOnce(new Response('private', { status: 429 }))
        .mockRejectedValueOnce(new Error('private')),
    );
    await withDiagnostics(async () => {
      await expect(fetchJson('https://x/?secret=private')).rejects.toThrow();
      await expect(fetchJson('https://x')).rejects.toThrow();
    });
    const rows = log.mock.calls.map((c) => JSON.parse(c[0] as string));
    expect(rows.some((r) => r.stage === 'http' && r.status === 429)).toBe(true);
    expect(
      rows.some((r) => r.stage === 'http' && r.outcome === 'error' && r.status === undefined),
    ).toBe(true);
    expect(JSON.stringify(rows)).not.toContain('private');
  });
  it('릴레이에 요청 ID를 전달한다', async () => {
    const fetch = vi.fn().mockResolvedValue(Response.json({ status: 'SUCCESS' }));
    vi.stubGlobal('fetch', fetch);
    await withDiagnostics(() =>
      requestOliveyoung(
        '/stock/product-search-v3',
        {},
        { relayUrl: 'https://relay.test', relayToken: 'test' },
      ),
    );
    expect(fetch.mock.calls[0][1].headers['x-request-id']).toMatch(/^[a-f0-9-]{36}$/);
  });
});
