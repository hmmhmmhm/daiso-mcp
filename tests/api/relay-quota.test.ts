import { Hono } from 'hono';
import { expect, it, vi, afterEach } from 'vitest';
import { diagnosticsMiddleware } from '../../src/middleware/diagnostics.js';
import { serviceErrorResponse } from '../../src/api/response.js';
import type { AppBindings } from '../../src/api/response.js';
import { ServiceError } from '../../src/core/errors.js';
import { requestOliveyoung } from '../../src/services/oliveyoung/transport.js';
import { relayConsumer, withDiagnostics } from '../../src/utils/diagnostics.js';
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });
it('공개 REST 응답에 재시도 시간과 원인을 유지하고 위조 consumer 헤더는 무시한다', async () => {
  vi.spyOn(console, 'error').mockImplementation(() => undefined);
  const fetch = vi.fn().mockResolvedValue(new Response('', { status: 429, headers: { 'retry-after': '12', 'x-relay-quota-reason': 'consumer' } }));
  vi.stubGlobal('fetch', fetch);
  const app = new Hono<{ Bindings: AppBindings }>();
  app.use('*', diagnosticsMiddleware);
  app.get('/', async c => {
    try { await requestOliveyoung('/p', {}, { relayUrl: 'https://rest-quota.example', relayToken: 'test' }); }
    catch (error) { return serviceErrorResponse(c, error as ServiceError, 'test'); }
    return c.text('unexpected');
  });
  const response = await app.request('https://example.com/', { headers: { 'CF-Connecting-IP': '192.0.2.10', 'x-relay-consumer': 'spoofed' } });
  expect(response.status).toBe(429);
  expect(response.headers.get('retry-after')).toBe('12');
  expect(await response.json()).toMatchObject({ diagnostics: { quotaReason: 'consumer', retryAfter: 12, upstreamStatus: 429 } });
  const headers = fetch.mock.calls[0][1].headers;
  expect(headers['x-relay-consumer']).toBe(await withDiagnostics(() => relayConsumer('test'), '192.0.2.10'));
  expect(JSON.stringify(response.headers)).not.toContain('192.0.2.10');
});
