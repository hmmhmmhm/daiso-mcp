import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { afterEach, expect, it, vi } from 'vitest';
import app from '../../src/index.js';
import { buildConfigStatus } from '../../src/api/configStatus.js';
const env = {
  DTRYX_RELAY_URL: 'https://relay.example',
  DTRYX_RELAY_TOKEN: 'test-token',
  DTRYX_ACCESS_CLIENT_ID: 'test-id',
  DTRYX_ACCESS_CLIENT_SECRET: 'test-secret',
};
afterEach(() => vi.unstubAllGlobals());
it('REST가 영화, 날짜, 좌석 요청에 바인딩을 전달한다', async () => {
  const fetchMock = vi
    .fn()
    .mockImplementation(() =>
      Promise.resolve(Response.json({ RetCode: 'success', Recordset: [] })),
    );
  vi.stubGlobal('fetch', fetchMock);
  for (const path of [
    'movies?cinemaCode=000067&includePlayDates=true',
    'seats?cinemaCode=000067&playDate=20260928',
  ]) {
    expect((await app.request('/api/dtryx/' + path, undefined, env)).status).toBe(200);
  }
  expect(fetchMock.mock.calls.map((c) => c[0])).toEqual([
    'https://relay.example/v1/dtryx/movies',
    'https://relay.example/v1/dtryx/play-dates',
    'https://relay.example/v1/dtryx/timetable',
  ]);
});
it('REST 중계 상태를 보존하고 비밀을 노출하지 않는다', async () => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('test-secret', { status: 429 })));
  const response = await app.request('/api/dtryx/movies?cinemaCode=000067', undefined, env);
  expect(response.status).toBe(429);
  expect(await response.text()).not.toContain('test-secret');
});
it('실제 MCP 호출이 세 경로에 중계를 사용한다', async () => {
  const fetchMock = vi
    .fn()
    .mockImplementation(() =>
      Promise.resolve(Response.json({ RetCode: 'success', Recordset: [] })),
    );
  vi.stubGlobal('fetch', fetchMock);
  const client = new Client({ name: 'test', version: '1' });
  await client.connect(
    new StreamableHTTPClientTransport(new URL('https://local.test/mcp'), {
      fetch: async (url, init) => app.request(new Request(url, init), undefined, env),
    }),
  );
  try {
    await client.callTool({
      name: 'dtryx_list_now_showing',
      arguments: { cinemaCode: '000067', includePlayDates: true },
    });
    await client.callTool({
      name: 'dtryx_get_remaining_seats',
      arguments: { cinemaCode: '000067' },
    });
    expect(fetchMock.mock.calls.map((c) => c[0])).toEqual([
      'https://relay.example/v1/dtryx/movies',
      'https://relay.example/v1/dtryx/play-dates',
      'https://relay.example/v1/dtryx/timetable',
    ]);
    fetchMock.mockResolvedValue(new Response('test-secret', { status: 503 }));
    const failure = await client.callTool({
      name: 'dtryx_list_now_showing',
      arguments: { cinemaCode: '000067' },
    });
    expect(failure.isError).toBe(true);
    expect(JSON.stringify(failure)).toContain('503');
    expect(JSON.stringify(failure)).not.toContain('test-secret');
  } finally {
    await client.close();
  }
});
it('설정 진단은 값 없이 유효성만 반환한다', () => {
  expect(buildConfigStatus(env).dtryxRelay).toMatchObject({
    configured: true,
    accessPairValid: true,
  });
  expect(buildConfigStatus().dtryxRelay).toMatchObject({
    configured: false,
    accessPairValid: true,
  });
  expect(buildConfigStatus({ ...env, DTRYX_ACCESS_CLIENT_SECRET: '' }).dtryxRelay).toMatchObject({
    configured: false,
    accessPairValid: false,
  });
  expect(JSON.stringify(buildConfigStatus(env))).not.toContain('test-secret');
});

it('Access 설정은 양쪽이 함께 있어야 한다', () => {
  expect(
    buildConfigStatus({ ...env, DTRYX_ACCESS_CLIENT_ID: undefined }).dtryxRelay.accessPairValid,
  ).toBe(false);
  expect(buildConfigStatus({ DTRYX_RELAY_URL: env.DTRYX_RELAY_URL }).dtryxRelay.configured).toBe(
    false,
  );
});
