import { mkdtemp, readFile, rm, writeFile, symlink, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, expect, it } from 'vitest';
import { CONVENIENCE_QUOTA_LIMITS, createFileQuota, assertSeparateQuotaDirectories } from '../../scripts/relay/quota.js';
const dirs: string[] = [];
async function file() {
  const dir = await mkdtemp(join(tmpdir(), 'oy-quota-'));
  dirs.push(dir);
  return join(dir, 'quota.json');
}
afterEach(async () => {
  await Promise.all(dirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});
it('동시 요청과 재시작에도 분당 300회 상한을 유지한다', async () => {
  const path = await file();
  let now = Date.UTC(2026, 8, 15);
  await writeFile(path, JSON.stringify({ day: Math.floor(now / 86400000), minute: Math.floor(now / 60000), dayCount: 295, minuteCount: 295 }));
  const take = await createFileQuota(path, () => now);
  expect(
    (await Promise.all(Array.from({ length: 10 }, () => take()))).filter(Boolean),
  ).toHaveLength(5);
  expect(await (await createFileQuota(path, () => now))()).toBe(false);
  now += 60000;
  expect(await take()).toBe(true);
  expect(JSON.parse(await readFile(path, 'utf8')).dayCount).toBe(301);
});
it('하루 300000회 이후 차단하고 다음 UTC 날짜에 재개한다', async () => {
  const path = await file();
  let now = Date.UTC(2026, 8, 15);
  await writeFile(
    path,
    JSON.stringify({
      day: Math.floor(now / 86400000),
      minute: Math.floor(now / 60000),
      dayCount: 299999,
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
    dailyRemaining: 300000,
    minuteRemaining: 300,
    blockedBy: null,
    retryAfter: 0,
  });
  await expect(readFile(path)).rejects.toThrow();
  await Promise.all(Array.from({ length: 300 }, () => take()));
  expect(take.status()).toMatchObject({
    dailyRemaining: 299700,
    minuteRemaining: 0,
    blockedBy: 'minute',
    retryAfter: 59,
  });
  now += 60000;
  expect(take.status().minuteRemaining).toBe(300);
  now += 86400000;
  expect(take.status().dailyRemaining).toBe(300000);
});
it('일일 상한과 시계 역행에도 정확한 상태를 제공한다', async () => {
  const path = await file();
  const now = Date.UTC(2026, 8, 15);
  await writeFile(
    path,
    JSON.stringify({
      day: Math.floor(now / 86400000),
      minute: Math.floor(now / 60000),
      dayCount: 300000,
      minuteCount: 300,
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

it('원장 디렉터리의 슬래시·점·심볼릭 링크 별칭을 같은 저장소로 거절한다', async () => {
  const quotaPath = await file();
  const directory = join(quotaPath, '..');
  const link = join(directory, 'alias');
  await symlink(directory, link);
  for (const alias of [directory, directory + '/', directory + '/.', link]) {
    await expect(assertSeparateQuotaDirectories(directory, alias)).rejects.toThrow('separate');
  }
  const other = join(directory, 'other');
  await mkdir(other);
  await expect(assertSeparateQuotaDirectories(directory, other)).resolves.toBeUndefined();
});

const convenienceLimits = CONVENIENCE_QUOTA_LIMITS;
it('편의점 동시 요청과 재시작에도 분당 690회만 허용한다', async () => {
  const path = await file();
  let now = Date.UTC(2026, 9, 5) + 1000;
  await writeFile(path, JSON.stringify({ day: Math.floor(now / 86400000), minute: Math.floor(now / 60000), dayCount: 685, minuteCount: 685 }));
  const take = await createFileQuota(path, () => now, convenienceLimits);
  const results = await Promise.all(Array.from({ length: 10 }, () => take()));
  expect(results.filter(Boolean)).toHaveLength(5);
  expect(take.status()).toMatchObject({ dailyRemaining: 9999310, minuteRemaining: 0, blockedBy: 'minute', retryAfter: 59 });
  const restarted = await createFileQuota(path, () => now, convenienceLimits);
  expect(await restarted()).toBe(false);
  now += 60000;
  expect(await restarted()).toBe(true);
  expect(JSON.parse(await readFile(path, 'utf8')).dayCount).toBe(691);
});

it('편의점 한도를 늘려도 기존 3000회 사용 기록을 초기화하지 않는다', async () => {
  const path = await file();
  const now = Date.UTC(2026, 9, 5);
  await writeFile(path, JSON.stringify({ day: Math.floor(now / 86400000), minute: Math.floor(now / 60000), dayCount: 3000, minuteCount: 0 }));
  const take = await createFileQuota(path, () => now, convenienceLimits);
  expect(take.status()).toMatchObject({ dailyRemaining: 9997000, minuteRemaining: 690, blockedBy: null });
  expect(await take()).toBe(true);
  expect(JSON.parse(await readFile(path, 'utf8')).dayCount).toBe(3001);
  expect(await (await createFileQuota(path, () => now, convenienceLimits))()).toBe(true);
  expect(JSON.parse(await readFile(path, 'utf8')).dayCount).toBe(3002);
});

it('편의점 일일 1000만 회를 넘기지 않고 다음 UTC 날짜에 재개한다', async () => {
  const path = await file();
  let now = Date.UTC(2026, 9, 5);
  await writeFile(path, JSON.stringify({ day: Math.floor(now / 86400000), minute: Math.floor(now / 60000), dayCount: 9999999, minuteCount: 0 }));
  const take = await createFileQuota(path, () => now, convenienceLimits);
  expect(await take()).toBe(true);
  expect(take.status().dailyRemaining).toBe(0);
  now += 60000;
  expect(await take()).toBe(false);
  expect(JSON.parse(await readFile(path, 'utf8')).dayCount).toBe(10000000);
  now += 86400000;
  expect(await take()).toBe(true);
  expect(take.status().dailyRemaining).toBe(9999999);
});

it('기본 프로필 한도 증액도 기존 일일·분당 원장을 그대로 이어 쓴다', async () => {
  const path = await file();
  const now = Date.UTC(2026, 9, 8);
  await writeFile(path, JSON.stringify({ day: Math.floor(now / 86400000), minute: Math.floor(now / 60000), dayCount: 3000, minuteCount: 30 }));
  const take = await createFileQuota(path, () => now);
  expect(take.status()).toMatchObject({ dailyRemaining: 297000, minuteRemaining: 270, blockedBy: null });
  expect(await take()).toBe(true);
  expect(JSON.parse(await readFile(path, 'utf8'))).toMatchObject({ dayCount: 3001, minuteCount: 31 });
  const restarted = await createFileQuota(path, () => now);
  expect(restarted.status()).toMatchObject({ dailyRemaining: 296999, minuteRemaining: 269 });
});
it('편의점 증액도 기존 분당 사용량을 보존한다', async () => {
  const path = await file();
  const now = Date.UTC(2026, 9, 8);
  await writeFile(path, JSON.stringify({ day: Math.floor(now / 86400000), minute: Math.floor(now / 60000), dayCount: 100000, minuteCount: 69 }));
  const take = await createFileQuota(path, () => now, convenienceLimits);
  expect(take.status()).toMatchObject({ dailyRemaining: 9900000, minuteRemaining: 621, blockedBy: null });
  expect(await take()).toBe(true);
  expect(JSON.parse(await readFile(path, 'utf8'))).toMatchObject({ dayCount: 100001, minuteCount: 70 });
  expect((await createFileQuota(path, () => now, convenienceLimits)).status()).toMatchObject({ dailyRemaining: 9899999, minuteRemaining: 620 });
});
