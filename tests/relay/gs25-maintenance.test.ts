import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, expect, it, vi } from 'vitest';
import { createGs25SessionTransport } from '../../scripts/relay/gs25-session.js';
const dirs: string[] = [];
const time = 1800000000000;
const jwt = (ms: number) =>
  `e30.${Buffer.from(JSON.stringify({ exp: ms / 1000 })).toString('base64url')}.fixture`;
async function file(access = time + 3600000, refresh = time + 86400000) {
  const dir = await mkdtemp(join(tmpdir(), 'gs-maintenance-'));
  dirs.push(dir);
  const path = join(dir, 'auth.json');
  await writeFile(
    path,
    JSON.stringify({ accessToken: jwt(access), refreshToken: jwt(refresh), deviceId: 'fixture' }),
    { mode: 0o600 },
  );
  return path;
}
afterEach(async () => {
  await Promise.all(dirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});
it('재고 요청 없이 인증을 준비하고 토큰 대신 안전한 기한만 노출한다', async () => {
  const fetcher = vi.fn<typeof fetch>();
  const send = createGs25SessionTransport(await file(), { fetcher, now: () => time });
  expect(send.status()).toMatchObject({ state: 'unloaded', loginRequired: false });
  await send.prepare();
  expect(fetcher).not.toHaveBeenCalled();
  expect(send.status()).toEqual({
    state: 'ready',
    loginRequired: false,
    accessExpiresAt: time + 3600000,
    refreshExpiresAt: time + 86400000,
    retryAt: 0,
  });
  expect(JSON.stringify(send.status())).not.toContain('fixture');
});
it('5분 내 만료는 공유 준비로 한 번만 갱신하고 재고를 호출하지 않는다', async () => {
  let finish!: (r: Response) => void;
  const fetcher = vi.fn<typeof fetch>(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  );
  const send = createGs25SessionTransport(await file(time + 120000), { fetcher, now: () => time });
  const one = send.prepare();
  const two = send.prepare();
  await vi.waitFor(() => expect(fetcher).toHaveBeenCalledTimes(1));
  expect(send.status().state).toBe('refreshing');
  finish(
    Response.json({
      resultCode: '0000',
      data: { access: jwt(time + 7200000), refresh: jwt(time + 86400000) },
    }),
  );
  await Promise.all([one, two]);
  expect(send.status().state).toBe('ready');
  expect(String(fetcher.mock.calls[0]![0])).toContain('tokenReissue');
});
it('일시 갱신 실패는 대기를 공유하고 만료와 로그인 필요를 구분한다', async () => {
  let clock = time;
  const fetcher = vi.fn<typeof fetch>(async () => new Response(null, { status: 500 }));
  const send = createGs25SessionTransport(await file(time - 1), { fetcher, now: () => clock });
  await expect(send.prepare()).rejects.toMatchObject({ status: 502 });
  expect(send.status()).toMatchObject({
    state: 'retry_wait',
    loginRequired: false,
    retryAt: time + 60000,
  });
  await expect(send.prepare()).rejects.toMatchObject({ status: 502 });
  expect(fetcher).toHaveBeenCalledTimes(1);
  clock += 60001;
  await expect(send.prepare()).rejects.toMatchObject({ status: 502 });
  expect(fetcher).toHaveBeenCalledTimes(2);
});
it('실제 인증 거절과 손상 파일은 로그인 필요로 표시한다', async () => {
  const send = createGs25SessionTransport(await file(time - 1), {
    fetcher: async () => new Response(null, { status: 401 }),
    now: () => time,
  });
  await expect(send.prepare()).rejects.toMatchObject({ status: 403 });
  expect(send.status()).toMatchObject({ state: 'login_required', loginRequired: true });
  const broken = createGs25SessionTransport('/nonexistent/auth.json', { now: () => time });
  await expect(broken.prepare()).rejects.toMatchObject({ status: 403 });
  expect(broken.status().loginRequired).toBe(true);
});
it('자동 준비 실패의 갱신 대기를 실제 재고 요청도 우회하지 않는다', async () => {
  const fetcher = vi.fn<typeof fetch>(async () => new Response(null, { status: 500 }));
  const send = createGs25SessionTransport(await file(time - 1), { fetcher, now: () => time });
  await expect(send.prepare()).rejects.toMatchObject({ status: 502 });
  await expect(
    send(new URL('https://b2c-bff.woodongs.com/api/bff/v2/store/stock'), {}),
  ).rejects.toMatchObject({ status: 502 });
  expect(fetcher).toHaveBeenCalledTimes(1);
});
