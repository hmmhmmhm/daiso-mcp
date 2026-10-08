/** 디트릭스 프로세스에 붙인 CGV 경로가 같은 인증·원장을 사용합니다. */
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Readable } from 'node:stream';
import { fileURLToPath } from 'node:url';
import { afterEach, expect, it, vi } from 'vitest';
const state = vi.hoisted(() => ({ handler: undefined as undefined | ((req: unknown, res: unknown) => Promise<void>), listening: false }));
vi.mock('node:http', () => ({ createServer: (handler: typeof state.handler) => {
  state.handler = handler;
  const server = { once: vi.fn(), listen: (_port: number, _host: string, ready: () => void) => { state.listening = true; ready(); }, setTimeout: vi.fn(), close: vi.fn(), closeAllConnections: vi.fn() };
  return server;
} }));
vi.mock('../../scripts/relay/logging.js', () => ({ createRelayLogger: () => ({ append: vi.fn(), flush: async () => undefined, status: () => ({ queued: 0, written: 0, dropped: 0, errors: 0, lowSpace: false }) }) }));
let directory: string | undefined;
let close: (() => void) | undefined;
afterEach(async () => {
  close?.(); close = undefined;
  vi.restoreAllMocks(); vi.unstubAllGlobals(); vi.unstubAllEnvs();
  if (directory) await rm(directory, { recursive: true, force: true });
});
async function invoke(path: string, body?: object, token = 'test-token') {
  const req = Object.assign(Readable.from(body ? [Buffer.from(JSON.stringify(body))] : []), {
    url: path, method: body ? 'POST' : 'GET', headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
  });
  let status = 0; let text = '';
  await state.handler!(req, { once: vi.fn(), writeHead: (value: number) => { status = value; }, end: (value: string) => { text = value; } });
  return { status, body: JSON.parse(text) };
}
it('CGV와 디트릭스 조회가 같은 쿼터를 소비하고 CGV 건강 상태에 원장을 노출한다', async () => {
  directory = await mkdtemp(join(tmpdir(), 'cgv-start-'));
  vi.stubEnv('DTRYX_RELAY_TOKEN', 'test-token');
  vi.stubEnv('DTRYX_RELAY_STATE_DIR', directory);
  vi.stubEnv('CONVENIENCE_RELAY_TOKEN', undefined);
  vi.stubEnv('CONVENIENCE_RELAY_STATE_DIR', undefined);
  vi.stubGlobal('fetch', vi.fn().mockImplementation((url: URL | string) => Promise.resolve(
    String(url).includes('cgv.co.kr') ? Response.json({ statusCode: 0, data: [] }) : Response.json({ RetCode: 'success', Recordset: [] }),
  )));
  vi.spyOn(console, 'log').mockImplementation(() => undefined);
  vi.spyOn(process, 'once').mockImplementation(((signal: string, listener: () => void) => {
    if (signal === 'SIGTERM') close = listener;
    return process;
  }) as typeof process.once);
  const executable = process.argv[0];
  const entry = vi.spyOn(process, 'argv', 'get').mockReturnValue([executable, fileURLToPath(new URL('../../scripts/relay/dtryx-start.ts', import.meta.url))]);
  await import('../../scripts/relay/dtryx-start.js');
  await vi.waitFor(() => expect(close).toBeDefined());
  entry.mockRestore();
  const before = await invoke('/v1/cgv/health');
  expect(before.status).toBe(200);
  expect(before.body.logging.errors).toBe(0);
  expect((await invoke('/v1/cgv/theaters', {}, 'wrong')).status).toBe(401);
  expect((await invoke('/v1/cgv/theaters', {})).status).toBe(200);
  expect((await invoke('/v1/dtryx/movies', { brandCode: 'dtryx', cinemaCode: '000067' })).status).toBe(200);
  const after = await invoke('/v1/cgv/health');
  expect(after.body.quota.dailyRemaining).toBe(before.body.quota.dailyRemaining - 2);
});
