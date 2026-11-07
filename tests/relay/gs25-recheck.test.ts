import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, expect, it, vi } from 'vitest';
import { createGs25SessionTransport } from '../../scripts/relay/gs25-session.js';
const dirs: string[] = [];
const start = 1800000000000;
const jwt = (ms: number) => `e30.${Buffer.from(JSON.stringify({ exp: ms / 1000 })).toString('base64url')}.fixture`;
const url = new URL('https://b2c-bff.woodongs.com/api/bff/v2/store/stock?itemCode=1');
afterEach(async () => { for (const dir of dirs.splice(0)) await rm(dir, { recursive: true, force: true }); });
async function setup(result: () => Response = () => Response.json({ stores: [{ storeCode: 's', realStockQuantity: '2' }] })) {
  const dir = await mkdtemp(join(tmpdir(), 'gs-recheck-')); dirs.push(dir);
  const file = join(dir, 'auth.json');
  await writeFile(file, JSON.stringify({ accessToken: jwt(start + 3600000), refreshToken: jwt(start + 9000000), deviceId: 'device' }), { mode: 0o600 });
  let time = start; let stocks = 0;
  const fetcher = vi.fn<typeof fetch>(async (input) => {
    if (String(input).includes('tokenReissue')) return Response.json({ resultCode: '0000', data: { access: jwt(start + 7200000), refresh: jwt(start + 9000000) } });
    stocks++;
    return stocks <= 2 ? new Response(null, { status: 403 }) : result();
  });
  const send = createGs25SessionTransport(file, { fetcher, now: () => time });
  expect((await send(url, {})).status).toBe(403);
  return { send, fetcher, advance: (ms: number) => { time += ms; } };
}
it('유효한 새 토큰의 재고 거절은 60초 후 갱신 없이 한 번만 재확인한다', async () => {
  const x = await setup();
  expect(x.send.status()).toMatchObject({ state: 'retry_wait', loginRequired: false, retryAt: start + 60000 });
  await expect(x.send(url, {})).rejects.toMatchObject({ status: 403 });
  expect(x.fetcher).toHaveBeenCalledTimes(3);
  x.advance(60000);
  expect((await x.send(url, {})).status).toBe(200);
  expect(x.send.status()).toMatchObject({ state: 'ready', loginRequired: false });
  expect(x.fetcher.mock.calls.filter(([u]) => String(u).includes('tokenReissue'))).toHaveLength(1);
});
it('재확인도 거절되면 다시 로그인 전까지 무한 호출하지 않는다', async () => {
  const x = await setup(() => new Response(null, { status: 403 }));x.advance(60000);
  expect((await x.send(url, {})).status).toBe(403);x.advance(60000);
  await expect(x.send(url, {})).rejects.toMatchObject({ status: 403 });
  expect(x.fetcher).toHaveBeenCalledTimes(4);
  expect(x.send.status()).toMatchObject({ state: 'login_required', loginRequired: true });
});
it('동시 caller가 재확인을 중복 실행하지 않는다', async () => {
  const x = await setup();x.advance(60000);
  const results = await Promise.allSettled([x.send(url, {}), x.send(url, {})]);
  expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
  expect(x.fetcher).toHaveBeenCalledTimes(4);
});
it('유효기간이 지나면 옛 access를 재확인하지 않는다', async () => {
  const x = await setup();x.advance(7200001);
  await expect(x.send(url, {})).rejects.toMatchObject({ status: 403 });
  expect(x.fetcher).toHaveBeenCalledTimes(3);
  expect(x.send.status().loginRequired).toBe(true);
});
it.each([() => new Response('<html>challenge</html>'), () => Response.json({ error: 'denied' })])
('HTTP200만으로 인증 복구나 재고0을 만들지 않는다', async (result) => {
  const x = await setup(result);x.advance(60000);
  await expect(x.send(url, {})).rejects.toMatchObject({ status: 502 });
  expect(x.send.status().loginRequired).toBe(true);
});
it('취소된 caller는 재확인 기회를 소비하지 않는다', async () => {
  const x = await setup();x.advance(60000);
  await expect(x.send(url, { signal: AbortSignal.abort() })).rejects.toMatchObject({ status: 499 });
  expect((await x.send(url, {})).status).toBe(200);
});
it('갱신 서버가 거절해도 아직 유효한 access는 한 번 검증할 수 있다', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'gs-recheck-')); dirs.push(dir);
  const file = join(dir, 'auth.json');
  await writeFile(file, JSON.stringify({ accessToken: jwt(start + 3600000), refreshToken: jwt(start + 9000000), deviceId: 'device' }), { mode: 0o600 });
  let time = start;
  const fetcher = vi.fn<typeof fetch>().mockResolvedValueOnce(new Response(null, { status: 403 }))
    .mockResolvedValueOnce(new Response(null, { status: 403 })).mockImplementation(async () => Response.json({ stores: [] }));
  const send = createGs25SessionTransport(file, { fetcher, now: () => time });
  await expect(send(url, {})).rejects.toMatchObject({ status: 403 });
  time += 60000;
  expect((await send(url, {})).status).toBe(200);
  expect(fetcher).toHaveBeenCalledTimes(3);
  expect(send.status().loginRequired).toBe(false);
});
it('이미 진행 중이던 요청의 늦은 거절이 소비한 재확인을 다시 예약하지 않는다', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'gs-recheck-')); dirs.push(dir);
  const file = join(dir, 'auth.json');
  await writeFile(file, JSON.stringify({ accessToken: jwt(start + 3600000), refreshToken: jwt(start + 9000000), deviceId: 'device' }), { mode: 0o600 });
  let time = start; let stocks = 0; let finish!: (r: Response) => void;
  const fetcher = vi.fn<typeof fetch>(async (input) => {
    if (String(input).includes('tokenReissue')) return Response.json({ resultCode: '0000', data: { access: jwt(start + 7200000), refresh: jwt(start + 9000000) } });
    stocks++;
    if (stocks === 4) return new Promise<Response>((resolve) => { finish = resolve; });
    return new Response(null, { status: 403 });
  });
  const send = createGs25SessionTransport(file, { fetcher, now: () => time });
  const first = send(url, {}); const late = send(url, {});
  await vi.waitFor(() => expect(stocks).toBe(4));
  await first; time += 60000;
  expect((await send(url, {})).status).toBe(403);
  finish(new Response(null, { status: 403 })); await late;
  expect(send.status()).toMatchObject({ state: 'login_required', loginRequired: true });
  time += 60000;
  await expect(send(url, {})).rejects.toMatchObject({ status: 403 });
  expect(stocks).toBe(5);
});
