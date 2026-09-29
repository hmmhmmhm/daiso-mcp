import { mkdtemp, readdir, readFile, rm, stat, writeFile, utimes } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, expect, it, vi } from 'vitest';
import { createRelayLogger } from '../../scripts/relay/logging.js';
const dirs: string[] = [];
async function directory() {
  const dir = await mkdtemp(join(tmpdir(), 'relay-log-'));
  dirs.push(dir);
  return dir;
}
afterEach(async () => {
  await Promise.all(dirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});
const event = {
  stage: 'cache',
  operation: 'product-search-v3',
  outcome: 'hit',
  requestId: 'safe_1',
  parentRequestId: 'parent_1',
  status: 200,
  durationMs: 4,
  cache: 'hit',
  quotaReason: 'minute',
};
const space = async () => ({ bavail: 3 * 1024 ** 3, bsize: 1 });
it('허용 필드만 안전한 권한의 JSONL로 기록한다', async () => {
  const dir = await directory();
  const logger = createRelayLogger(dir, { service: 'oliveyoung', statfs: space });
  logger.append({ ...event, token: 'secret', body: { query: 'secret' }, url: 'secret' });
  logger.append({
    stage: 'https://secret',
    durationMs: -1,
    status: NaN,
    requestId: 'bad.id',
    time: 'spoof',
  });
  await logger.flush();
  const [name] = await readdir(dir);
  const lines = (await readFile(join(dir, name), 'utf8'))
    .trim()
    .split('\n')
    .map((line) => JSON.parse(line));
  expect(lines[0]).toMatchObject(event);
  expect(Object.keys(lines[1])).toEqual(['time', 'service']);
  expect(await readFile(join(dir, name), 'utf8')).not.toContain('secret');
  expect((await stat(dir)).mode & 0o777).toBe(0o700);
  expect((await stat(join(dir, name))).mode & 0o777).toBe(0o600);
  expect(logger.status()).toMatchObject({
    written: 2,
    queued: 0,
    errors: 0,
    dropped: 0,
    lowSpace: false,
  });
});
it('공간 부족과 쓰기 오류는 요청을 막지 않고 다음 기록에서 복구한다', async () => {
  const dir = await directory();
  const statfs = vi
    .fn()
    .mockResolvedValueOnce({ bavail: 0, bsize: 1 })
    .mockRejectedValueOnce(new Error('ENOSPC'))
    .mockImplementation(space);
  const logger = createRelayLogger(dir, { service: 'dtryx', statfs });
  logger.append(event);
  await logger.flush();
  expect(logger.status()).toMatchObject({ lowSpace: true, dropped: 1 });
  logger.append(event);
  await logger.flush();
  expect(logger.status().errors).toBe(1);
  logger.append(event);
  await logger.flush();
  expect(logger.status()).toMatchObject({ lowSpace: false, written: 1 });
});
it('자체 파일만 회전 및 만료 정리하고 재시작 후 총 용량을 지킨다', async () => {
  const dir = await directory();
  const now = Date.now();
  const old = join(dir, 'oliveyoung-1000-old.jsonl');
  await writeFile(old, 'old');
  await utimes(old, 0, 0);
  await writeFile(join(dir, 'dtryx-1000-other.jsonl'), 'keep');
  await writeFile(join(dir, 'unrelated'), 'keep');
  const options = {
    service: 'oliveyoung' as const,
    now: () => now,
    statfs: space,
    maxFileBytes: 300,
    maxTotalBytes: 600,
  };
  const logger = createRelayLogger(dir, options);
  for (let i = 0; i < 8; i++) logger.append(event);
  await logger.flush();
  const next = createRelayLogger(dir, options);
  next.append(event);
  await next.flush();
  const names = await readdir(dir);
  expect(names).not.toContain('oliveyoung-1000-old.jsonl');
  expect(names).toContain('unrelated');
  expect(names).toContain('dtryx-1000-other.jsonl');
  const sizes = await Promise.all(
    names
      .filter((name) => name.startsWith('oliveyoung-'))
      .map(async (name) => (await stat(join(dir, name))).size),
  );
  expect(sizes.every((size) => size <= 300)).toBe(true);
  expect(sizes.reduce((sum, size) => sum + size, 0)).toBeLessThanOrEqual(600);
});
it('대기열과 이벤트 크기를 제한한다', async () => {
  const dir = await directory();
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  const logger = createRelayLogger(dir, {
    service: 'oliveyoung',
    statfs: async () => {
      await gate;
      return space();
    },
  });
  for (let i = 0; i < 260; i++) logger.append(event);
  expect(logger.status()).toMatchObject({ queued: 256, dropped: 4 });
  release();
  await logger.flush();
  expect(logger.status()).toMatchObject({ queued: 0, written: 256 });
});
it('직렬화·쓰기 실패 및 작은 파일 상한을 안전하게 처리한다', async () => {
  const dir = await directory();
  const write = vi.fn().mockRejectedValueOnce(new Error('ENOSPC')).mockResolvedValue(undefined);
  const logger = createRelayLogger(dir, {
    service: 'oliveyoung',
    statfs: space,
    appendFile: write,
  });
  logger.append(
    Object.defineProperty({}, 'stage', {
      get() {
        throw new Error('secret');
      },
    }),
  );
  logger.append(event);
  await logger.flush();
  logger.append(event);
  await logger.flush();
  expect(logger.status()).toMatchObject({ errors: 2, dropped: 2, written: 1 });
  const tiny = createRelayLogger(dir, { service: 'oliveyoung', statfs: space, maxFileBytes: 1 });
  tiny.append(event);
  await tiny.flush();
  expect(tiny.status().dropped).toBe(1);
  const total = createRelayLogger(dir, { service: 'oliveyoung', statfs: space, maxTotalBytes: 1 });
  total.append(event);
  await total.flush();
  expect(total.status().dropped).toBe(1);
});
it('기본 파일시스템 공간 검사를 지원한다', async () => {
  const logger = createRelayLogger(await directory(), { service: 'dtryx' });
  logger.append(event);
  await logger.flush();
  expect(logger.status().written + logger.status().dropped).toBe(1);
});
it('생성 시간이 같은 파일은 이름 순서로 정리한다', async () => {
  const dir = await directory();
  const now = Date.now();
  for (const name of [`oliveyoung-${now}-b.jsonl`, `oliveyoung-${now}-a.jsonl`]) {
    await writeFile(join(dir, name), 'x'.repeat(250));
    await utimes(join(dir, name), now / 1000, now / 1000);
  }
  const logger = createRelayLogger(dir, {
    service: 'oliveyoung',
    now: () => now,
    statfs: space,
    maxTotalBytes: 500,
  });
  logger.append(event);
  await logger.flush();
  expect(await readdir(dir)).not.toContain(`oliveyoung-${now}-a.jsonl`);
});
it('공간이 부족해도 자체 만료 파일을 먼저 정리한다', async () => {
  const dir = await directory();
  const name = 'oliveyoung-1000-expired.jsonl';
  await writeFile(join(dir, name), 'x');
  await utimes(join(dir, name), 0, 0);
  const logger = createRelayLogger(dir, {
    service: 'oliveyoung',
    statfs: async () => ({ bavail: 0, bsize: 1 }),
  });
  logger.append(event);
  await logger.flush();
  expect(await readdir(dir)).not.toContain(name);
  expect(logger.status().lowSpace).toBe(true);
});
it('자주 갱신된 파일도 생성 후 7일이 되면 삭제한다', async () => {
  const dir = await directory();
  let now = Date.now();
  const logger = createRelayLogger(dir, { service: 'oliveyoung', statfs: space, now: () => now });
  logger.append(event);
  await logger.flush();
  const [original] = await readdir(dir);
  now += 6 * 86400000;
  logger.append(event);
  await logger.flush();
  expect(await readdir(dir)).toEqual([original]);
  await utimes(join(dir, original), now / 1000, now / 1000);
  now += 86400000;
  logger.append(event);
  await logger.flush();
  const names = await readdir(dir);
  expect(names).not.toContain(original);
  expect(names).toHaveLength(1);
});
it('예산 잔여량은 유한한 비음수 숫자만 기록한다', async () => {
  const dir = await directory();
  const logger = createRelayLogger(dir, { service: 'oliveyoung', statfs: space });
  logger.append({ dailyRemaining: 3000, minuteRemaining: 0, token: 'secret' });
  logger.append({ dailyRemaining: -1, minuteRemaining: Infinity });
  logger.append({ dailyRemaining: 'secret', minuteRemaining: NaN });
  await logger.flush();
  const [name] = await readdir(dir);
  const lines = (await readFile(join(dir, name), 'utf8'))
    .trim()
    .split('\n')
    .map((line) => JSON.parse(line));
  expect(lines[0]).toMatchObject({ dailyRemaining: 3000, minuteRemaining: 0 });
  for (const line of lines.slice(1)) expect(Object.keys(line)).toEqual(['time', 'service']);
  expect(JSON.stringify(lines)).not.toContain('secret');
});
it('기록 이후에도 최소 2GiB의 여유 공간을 보존한다', async () => {
  const dir = await directory();
  const logger = createRelayLogger(dir, {
    service: 'oliveyoung',
    statfs: async () => ({ bavail: 2 * 1024 ** 3, bsize: 1 }),
  });
  logger.append(event);
  await logger.flush();
  expect(logger.status()).toMatchObject({ lowSpace: true, written: 0, dropped: 1 });
  expect(await readdir(dir)).toEqual([]);
});
