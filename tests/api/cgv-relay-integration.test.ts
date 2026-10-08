/** CGV REST·MCP가 같은 중계 설정과 공개 오류를 사용합니다. */
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { afterEach, expect, it, vi } from 'vitest';
import app from '../../src/index.js';
import { buildConfigStatus } from '../../src/api/configStatus.js';
const env = { CGV_RELAY_URL: 'https://relay.example', CGV_RELAY_TOKEN: 'test-token', CGV_ACCESS_CLIENT_ID: 'test-id', CGV_ACCESS_CLIENT_SECRET: 'test-secret' };
afterEach(() => vi.unstubAllGlobals());
function mockRelay(status = 200) {
  const mock = vi.fn().mockImplementation((url: string) => Promise.resolve(
    new URL(String(url)).origin === 'https://api.cgv.co.kr'
      ? new Response('blocked', { status: 403 })
      : status === 200 ? Response.json({ statusCode: 0, data: [] }) : new Response('test-secret', { status, headers: { 'x-relay-quota-reason': 'minute', 'Retry-After': '30' } }),
  ));
  vi.stubGlobal('fetch', mock);
  return mock;
}
it.each(['theaters', 'movies?theaterCode=0056', 'timetable?theaterCode=0056'])('REST %s가 직접 차단 후 중계를 사용한다', async path => {
  const mock = mockRelay();
  const response = await app.request(`/api/cgv/${path}`, undefined, env);
  expect(response.status).toBe(200);
  expect(mock.mock.calls.some(call => new URL(String(call[0])).origin === 'https://relay.example' && new URL(String(call[0])).pathname.startsWith('/v1/cgv/'))).toBe(true);
});
it.each(['theaters?lat=37.5&lng=127', 'movies?lat=37.5&lng=127', 'timetable?lat=37.5&lng=127'])('REST 위치 경로 %s도 중계를 사용한다', async path => {
  const mock = mockRelay();
  expect((await app.request(`/api/cgv/${path}`, undefined, env)).status).toBe(200);
  expect(mock.mock.calls.some(call => call[0] === 'https://relay.example/v1/cgv/theaters')).toBe(true);
});
it.each(['theaters', 'movies?theaterCode=0056', 'timetable?theaterCode=0056'])('REST %s는 중계 오류 상태와 진단을 보존한다', async path => {
  mockRelay(429);
  const response = await app.request(`/api/cgv/${path}`, undefined, env);
  expect(response.status).toBe(429);
  expect(response.headers.get('Retry-After')).toBe('30');
  const payload = await response.json();
  expect(payload.diagnostics).toMatchObject({ code: 'CGV_RELAY_FAILED', status: 429, retryable: true, service: 'cgv', quotaReason: 'minute', retryAfter: 30 });
  expect(JSON.stringify(payload)).not.toContain('test-secret');
});
it('MCP가 CGV 서비스에 중계 바인딩을 전달한다', async () => {
  const mock = mockRelay();
  const client = new Client({ name: 'test', version: '1' });
  await client.connect(new StreamableHTTPClientTransport(new URL('https://local.test/mcp'), { fetch: async (url, init) => app.request(new Request(url, init), undefined, env) }));
  try {
    for (const name of ['cgv_find_theaters', 'cgv_search_movies', 'cgv_get_timetable']) {
      const result = await client.callTool({ name, arguments: { theaterCode: '0056' } });
      expect(result.isError).not.toBe(true);
    }
    expect(mock.mock.calls.filter(call => new URL(String(call[0])).origin === 'https://relay.example' && new URL(String(call[0])).pathname.startsWith('/v1/cgv/'))).toHaveLength(4);
  } finally { await client.close(); }
});
it('설정 진단은 유효성과 Access 완전성만 공개한다', () => {
  expect(buildConfigStatus(env).cgvRelay).toMatchObject({ configured: true, accessConfigured: true, usedBy: ['cgv'] });
  expect(buildConfigStatus().cgvRelay).toMatchObject({ configured: false, accessPairValid: true });
  expect(buildConfigStatus({ ...env, CGV_ACCESS_CLIENT_SECRET: '' }).cgvRelay).toMatchObject({ configured: false, accessPairValid: false });
  expect(JSON.stringify(buildConfigStatus(env))).not.toContain('test-secret');
});

it('CGV 미설정 시 디트릭스 중계 설정을 진단하고 요청에 사용한다', async () => {
  const fallback = { DTRYX_RELAY_URL: env.CGV_RELAY_URL, DTRYX_RELAY_TOKEN: env.CGV_RELAY_TOKEN };
  const mock = mockRelay();
  expect(buildConfigStatus(fallback).cgvRelay).toMatchObject({ configured: true, accessPairValid: true });
  expect((await app.request('/api/cgv/theaters', undefined, fallback)).status).toBe(200);
  expect(mock.mock.calls.some(call => call[0] === 'https://relay.example/v1/cgv/theaters')).toBe(true);
  expect(buildConfigStatus({ ...fallback, CGV_ACCESS_CLIENT_ID: 'partial' }).cgvRelay).toMatchObject({ configured: false, accessPairValid: false });
});
