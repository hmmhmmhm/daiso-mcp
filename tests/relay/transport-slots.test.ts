import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ launch: vi.fn(), create: vi.fn() }));
vi.mock('../../scripts/relay/lifecycle.js', () => ({ createBrowserLifecycle: mocks.create }));
vi.mock('../../scripts/relay/supervisor.js', () => ({ launchGuardedBrowser: mocks.launch }));
import { createTransportLifecycle } from '../../scripts/relay/transport-lifecycle.js';
const dirs: string[] = [];
afterEach(async () => {
  vi.clearAllMocks();
  for (const dir of dirs.splice(0)) await rm(dir, { recursive: true, force: true });
});
async function fixture() {
  const dir = await mkdtemp(join(tmpdir(), 'oy-slots-'));
  dirs.push(dir);
  await createTransportLifecycle('browser', dir);
  const launch = mocks.create.mock.calls.at(-1)![0] as () => Promise<{ close(): Promise<void> }>;
  const close = vi.fn().mockResolvedValue(undefined);
  mocks.launch.mockImplementation(async () => ({ close }));
  return { dir, launch, close };
}
it('두 고정 마커를 번갈아 사용하고 회수 확인 전 세 번째 실행을 거절한다', async () => {
  const f = await fixture();
  const a = await f.launch(),
    b = await f.launch();
  expect(mocks.launch.mock.calls.map((x) => x[0])).toEqual([
    join(f.dir, 'browser-owner.json'),
    join(f.dir, 'browser-owner-replacement.json'),
  ]);
  await expect(f.launch()).rejects.toThrow('slots');
  await a.close();
  await f.launch();
  expect(mocks.launch.mock.calls[2][0]).toBe(join(f.dir, 'browser-owner.json'));
  await b.close();
});
it('어느 마커에든 이전 소유권이 남으면 빈 슬롯을 선택하지 않는다', async () => {
  const f = await fixture();
  await writeFile(join(f.dir, 'browser-owner-replacement.json'), '{}');
  await expect(f.launch()).rejects.toThrow('ownership');
  expect(mocks.launch).not.toHaveBeenCalled();
});
it('회수 불확실성과 실행 실패는 이후 모든 실행을 차단한다', async () => {
  const f = await fixture();
  const a = await f.launch();
  f.close.mockRejectedValue(new Error('uncertain'));
  await expect(a.close()).rejects.toThrow('uncertain');
  await expect(f.launch()).rejects.toThrow('uncertain');
  const g = await fixture();
  mocks.launch.mockRejectedValue(new Error('launch uncertain'));
  await expect(g.launch()).rejects.toThrow('launch uncertain');
  await expect(g.launch()).rejects.toThrow('launch uncertain');
});
it('마커 디렉터리 검사 오류는 부재로 해석하지 않는다', async () => {
  const f = await fixture();
  const file = join(f.dir, 'file');
  await writeFile(file, 'x');
  await createTransportLifecycle('browser', file);
  const launch = mocks.create.mock.calls.at(-1)![0] as () => Promise<unknown>;
  await expect(launch()).rejects.toThrow();
  expect(mocks.launch).not.toHaveBeenCalled();
});
it('다른 슬롯 검사 대기 중 회수 실패가 확인되면 실행하지 않는다', async () => {
  const f = await fixture();
  const a = await f.launch();
  f.close.mockRejectedValue(new Error('uncertain'));
  const closing = a.close();
  const denied = f.launch();
  await expect(closing).rejects.toThrow('uncertain');
  await expect(denied).rejects.toThrow('uncertain');
  expect(mocks.launch).toHaveBeenCalledTimes(1);
});
