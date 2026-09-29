import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, expect, it } from 'vitest';
import { createFileQuota } from '../../scripts/relay/quota.js';
const dirs: string[] = [];
async function file() {
  const dir = await mkdtemp(join(tmpdir(), 'oy-quota-'));
  dirs.push(dir);
  return join(dir, 'quota.json');
}
afterEach(async () => {
  await Promise.all(dirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});
it('동시 요청과 재시작에도 분당 30회 상한을 유지한다', async () => {
  const path = await file();
  let now = Date.UTC(2026, 8, 15);
  const take = await createFileQuota(path, () => now);
  expect(
    (await Promise.all(Array.from({ length: 35 }, () => take()))).filter(Boolean),
  ).toHaveLength(30);
  expect(await (await createFileQuota(path, () => now))()).toBe(false);
  now += 60000;
  expect(await take()).toBe(true);
  expect(JSON.parse(await readFile(path, 'utf8')).dayCount).toBe(31);
});
it('하루 3000회 이후 차단하고 다음 UTC 날짜에 재개한다', async () => {
  const path = await file();
  let now = Date.UTC(2026, 8, 15);
  await writeFile(
    path,
    JSON.stringify({
      day: Math.floor(now / 86400000),
      minute: Math.floor(now / 60000),
      dayCount: 2999,
      minuteCount: 0,
    }),
  );
  const take = await createFileQuota(path, () => now);
  expect(await take()).toBe(true);
  now += 60000;
  expect(await take()).toBe(false);
  now += 86400000;
  expect(await take()).toBe(true);
});
it('손상된 원장이나 저장 실패 시 조회를 허용하지 않는다', async () => {
  const path = await file();
  await writeFile(path, 'invalid');
  await expect(createFileQuota(path)).rejects.toThrow();
  await writeFile(path, '{}');
  await expect(createFileQuota(path)).rejects.toThrow();
  await rm(path);
  const take = await createFileQuota(path);
  await rm(join(path, '..'), { recursive: true });
  await expect(take()).rejects.toThrow();
});
it('시간이 뒤로 가도 예산을 복원하지 않는다', async () => {
  const path = await file();
  let now = Date.UTC(2026, 8, 15);
  const take = await createFileQuota(path, () => now);
  expect(await take()).toBe(true);
  now -= 86400000;
  expect(await take()).toBe(true);
  expect(JSON.parse(await readFile(path, 'utf8')).dayCount).toBe(2);
});
it('상태 조회는 원장을 쓰지 않고 현재 창과 재시도 시간을 계산한다', async () => {
  const path = await file();
  let now = Date.UTC(2026, 8, 15) + 1000;
  const take = await createFileQuota(path, () => now);
  expect(take.status()).toMatchObject({
    dailyRemaining: 3000,
    minuteRemaining: 30,
    blockedBy: null,
    retryAfter: 0,
  });
  await expect(readFile(path)).rejects.toThrow();
  await Promise.all(Array.from({ length: 30 }, () => take()));
  expect(take.status()).toMatchObject({
    dailyRemaining: 2970,
    minuteRemaining: 0,
    blockedBy: 'minute',
    retryAfter: 59,
  });
  now += 60000;
  expect(take.status().minuteRemaining).toBe(30);
  now += 86400000;
  expect(take.status().dailyRemaining).toBe(3000);
});
it('일일 상한과 시계 역행에도 정확한 상태를 제공한다', async () => {
  const path = await file();
  const now = Date.UTC(2026, 8, 15);
  await writeFile(
    path,
    JSON.stringify({
      day: Math.floor(now / 86400000),
      minute: Math.floor(now / 60000),
      dayCount: 3000,
      minuteCount: 30,
    }),
  );
  const take = await createFileQuota(path, () => now - 1000);
  expect(take.status()).toMatchObject({
    dailyRemaining: 0,
    minuteRemaining: 0,
    blockedBy: 'daily',
    retryAfter: 86401,
  });
});
