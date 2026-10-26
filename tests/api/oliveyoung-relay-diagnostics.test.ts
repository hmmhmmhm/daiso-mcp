import { Hono } from 'hono';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { handleOliveyoungSearchProducts, handleOliveyoungFindStores, handleOliveyoungCheckInventory } from '../../src/api/handlers.js';
import { __testOnlyClearOliveyoungCaches } from '../../src/services/oliveyoung/client.js';
import type { AppBindings } from '../../src/api/response.js';
const app = new Hono<{ Bindings: AppBindings }>();
app.get('/products', handleOliveyoungSearchProducts);
app.get('/stores', handleOliveyoungFindStores);
app.get('/inventory', handleOliveyoungCheckInventory);
beforeEach(() => __testOnlyClearOliveyoungCaches());
afterEach(() => vi.unstubAllGlobals());
it.each([
  ['/products', 429, 429, true], ['/stores', 502, 502, true], ['/inventory', 503, 503, true],
  ['/products', 403, 502, false],
])('%s preserves relay HTTP %i diagnostics', async (path, upstreamStatus, status, retryable) => {
  vi.stubGlobal('fetch', vi.fn().mockImplementation(async () => new Response('private-token', { status: upstreamStatus })));
  const response = await app.request(`${path}?keyword=팩`, {}, { OY_RELAY_URL: 'https://private-relay.example', OY_RELAY_TOKEN: 'private-token' });
  expect(response.status).toBe(status);
  const payload = await response.json();
  expect(payload).toMatchObject({ success: false, error: { code: 'OLIVEYOUNG_RELAY_HTTP_ERROR' }, diagnostics: { code: 'OLIVEYOUNG_RELAY_HTTP_ERROR', status, upstreamStatus, retryable, service: 'oliveyoung' } });
  expect(JSON.stringify(payload)).not.toContain('private-');
});
it.each([
  [new DOMException('private-token', 'AbortError'), 'TIMEOUT', 504, true],
  [new TypeError('private-token'), 'NETWORK_ERROR', 502, true],
  [new SyntaxError('private-token'), 'INVALID_RESPONSE', 502, false],
])('API에도 릴레이 비HTTP 실패 원인을 유지한다', async (failure, suffix, status, retryable) => {
  vi.stubGlobal('fetch', vi.fn().mockRejectedValue(failure));
  const response = await app.request('/products?keyword=팩', {}, { OY_RELAY_URL: 'https://private-relay.example', OY_RELAY_TOKEN: 'private-token' });
  expect(response.status).toBe(status);
  const payload = await response.json();
  expect(payload).toMatchObject({ diagnostics: { code: `OLIVEYOUNG_RELAY_${suffix}`, status, retryable } });
  expect(payload.diagnostics).not.toHaveProperty('upstreamStatus');
  expect(JSON.stringify(payload)).not.toContain('private-');
});
it('명시한 원본 429의 중립 대기를 자체 한도와 구분한다', async () => {
  vi.stubGlobal('fetch', vi.fn(async () => Response.json({ code: 'OLIVEYOUNG_UPSTREAM_RATE_LIMITED', upstreamStatus: 429, retryAfter: 12, error: 'private-token' }, { status: 429 })));
  const response = await app.request('/products?keyword=팩', {}, { OY_RELAY_URL: 'https://private-relay.example', OY_RELAY_TOKEN: 'private-token' });
  expect(response.status).toBe(429);
  const result = await response.json();
  expect(result.diagnostics).toMatchObject({ code: 'OLIVEYOUNG_UPSTREAM_RATE_LIMITED', upstreamStatus: 429, retryAfter: 12 });
  expect(result.diagnostics).not.toHaveProperty('quotaReason');
  expect(JSON.stringify(result)).not.toContain('private');
});
