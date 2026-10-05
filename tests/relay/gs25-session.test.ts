import { chmod, mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createGs25SessionTransport } from '../../scripts/relay/gs25-session.js';
import * as fs from 'node:fs/promises';

vi.mock('node:fs/promises', async () => {
  const actual = await vi.importActual<typeof import('node:fs/promises')>('node:fs/promises');
  return { ...actual, writeFile: vi.fn(actual.writeFile), rename: vi.fn(actual.rename) };
});

const now = 1800000000000;
const jwt = (exp: number) => `e30.${Buffer.from(JSON.stringify({ exp })).toString('base64url')}.fixture`;
const valid = jwt(now / 1000 + 3600);
const renewed = jwt(now / 1000 + 7200);
const refresh = jwt(now / 1000 + 9000);
const url = new URL('https://b2c-bff.woodongs.com/api/bff/v2/store/stock?itemCode=1');
const dirs: string[] = [];
async function session(accessToken = valid) {
  const dir = await mkdtemp(join(tmpdir(), 'gs25-session-'));
  dirs.push(dir);
  const file = join(dir, 'auth.json');
  await writeFile(file, JSON.stringify({ accessToken, refreshToken: refresh, deviceId: 'device' }), { mode: 0o600 });
  return file;
}
afterEach(async () => { vi.restoreAllMocks(); await Promise.all(dirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true }))); });
const reply = () => Response.json({ stores: [{ storeCode: 's', realStockQuantity: '16' }] });
const fresh = () => Response.json({ resultCode: '0000', data: { access: renewed, refresh } });

describe('GS 정상 로그인 세션 전송', () => {
  it('고정 재고 API에만 정상 Bearer·appinfo를 붙이고 키를 보내지 않는다', async () => {
    const fetcher = vi.fn<typeof fetch>(async () => reply());
    const send = createGs25SessionTransport(await session(), { fetcher, now: () => now });
    const response = await send(url, { headers: { 'Api-Key': 'legacy' } });
    expect(response.status).toBe(200);
    const headers = new Headers(fetcher.mock.calls[0]![1]?.headers);
    expect(headers.get('Authorization')).toBe(`Bearer ${valid}`);
    expect(headers.get('appinfo_device_id')).toBe('device');
    expect(headers.get('Api-Key')).toBeNull();
    await expect(send(new URL('https://other.invalid/'), {})).rejects.toMatchObject({ status: 400 });
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
  it('만료 임박 토큰을 한 번 갱신하고 새 토큰을0600 파일에 저장한다', async () => {
    const file = await session(jwt(now / 1000 + 20));
    const fetcher = vi.fn<typeof fetch>().mockImplementation(async (input) => String(input).includes('tokenReissue') ? fresh() : reply());
    const send = createGs25SessionTransport(file, { fetcher, now: () => now });
    await Promise.all([send(url, {}), send(url, {})]);
    expect(fetcher.mock.calls.filter(([input]) => String(input).includes('tokenReissue'))).toHaveLength(1);
    const [input, init] = fetcher.mock.calls[0]!;
    expect(String(input)).toBe('https://b2c-bff.woodongs.com/api/bff/v4/auth/tokenReissue');
    expect(init?.method).toBe('POST');
    expect(new Headers(init?.headers).get('Refresh')).toBe(refresh);
    expect(JSON.parse(await readFile(file, 'utf8')).accessToken).toBe(renewed);
    expect((await stat(file)).mode & 0o777).toBe(0o600);
  });
  it('원본401은 한 번만 갱신하며 두 번째 거절은 실패로 전달한다', async () => {
    const fetcher = vi.fn<typeof fetch>().mockImplementation(async (input) => String(input).includes('tokenReissue') ? fresh() : new Response(null, { status: 401 }));
    const send = createGs25SessionTransport(await session(), { fetcher, now: () => now });
    expect((await send(url, {})).status).toBe(401);
    expect(fetcher).toHaveBeenCalledTimes(3);
  });
  it('갱신401 또는 잘못된 성공 JSON을 재고0으로 반환하지 않는다', async () => {
    for (const response of [new Response(null, { status: 401 }), Response.json({ resultCode: '0000', data: { access: 'bad', refresh } })]) {
      const fetcher = vi.fn(async () => response);
      const send = createGs25SessionTransport(await session(jwt(now / 1000 - 1)), { fetcher, now: () => now });
      await expect(send(url, {})).rejects.toMatchObject({ status: response.status === 401 ? 403 : 502 });
      expect(fetcher).toHaveBeenCalledTimes(1);
    }
  });
  it('한 caller 취소가 다른 caller의 공유 갱신을 끊지 않는다', async () => {
    let complete!: (response: Response) => void;
    const fetcher = vi.fn<typeof fetch>().mockImplementation(async (input) => String(input).includes('tokenReissue') ? new Promise<Response>((resolve) => { complete = resolve; }) : reply());
    const send = createGs25SessionTransport(await session(jwt(now / 1000 - 1)), { fetcher, now: () => now });
    const controller = new AbortController();
    const first = send(url, { signal: controller.signal });
    const observed = expect(first).rejects.toMatchObject({ status: 499 });
    const second = send(url, {});
    await vi.waitFor(() => expect(fetcher).toHaveBeenCalledTimes(1));
    controller.abort();
    await observed;
    complete(fresh());
    expect((await second).status).toBe(200);
  });
  it('갱신이 취소 신호를 무시해도 자체 기한 안에 실패한다', async () => {
    const send = createGs25SessionTransport(await session(jwt(now / 1000 - 1)), { fetcher: async () => new Promise<Response>(() => {}), now: () => now, refreshTimeoutMs: 10 });
    await expect(send(url, {})).rejects.toMatchObject({ status: 504 });
  });
  it('공개 권한 파일이나 잘못된 세션은 원본 호출 전에 거절한다', async () => {
    const file = await session();
    await writeFile(file, '{}');
    const fetcher = vi.fn(async () => reply());
    const send = createGs25SessionTransport(file, { fetcher, now: () => now });
    await expect(send(url, {})).rejects.toMatchObject({ status: 403 });
    expect(fetcher).not.toHaveBeenCalled();
    const publicFile = await session();
    await chmod(publicFile, 0o644);
    await expect(createGs25SessionTransport(publicFile, { fetcher })(url, {})).rejects.toMatchObject({ status: 403 });
  });
  it('이미 취소된 요청은 갱신과 재고 호출을 시작하지 않는다', async () => {
    const fetcher = vi.fn<typeof fetch>(async () => fresh());
    const send = createGs25SessionTransport(await session(jwt(now / 1000 - 1)), { fetcher, now: () => now });
    await expect(send(url, { signal: AbortSignal.abort() })).rejects.toMatchObject({ status: 499 });
    expect(fetcher).not.toHaveBeenCalled();
  });
  it('토큰 저장이 지연돼도 갱신 기한 뒤 성공하거나 후속 caller를 묶지 않는다', async () => {
    const file = await session(jwt(now / 1000 - 1));
    let finish!: () => void;
    vi.mocked(fs.writeFile).mockImplementationOnce(async () => new Promise<void>((resolve) => { finish = resolve; }));
    const fetcher = vi.fn<typeof fetch>(async () => fresh());
    const send = createGs25SessionTransport(file, { fetcher, now: () => now, refreshTimeoutMs: 15 });
    await expect(send(url, {})).rejects.toMatchObject({ status: 504 });
    await expect(send(url, {})).rejects.toMatchObject({ status: 403 });
    finish();
    await Promise.resolve();
    expect(JSON.parse(await readFile(file, 'utf8')).accessToken).not.toBe(renewed);
    expect(fs.rename).not.toHaveBeenCalled();
  });
  it.each([null, { accessToken: 'bad' }, { accessToken: jwt(0), refreshToken: refresh, deviceId: 'device' },
    { accessToken: valid, refreshToken: refresh, deviceId: '\r\n' }])('손상된 로컬 세션을 거절한다 %j', async (value) => {
    const file = await session();
    await writeFile(file, JSON.stringify(value));
    await expect(createGs25SessionTransport(file)(url, {})).rejects.toMatchObject({ status: 403 });
  });
  it('기본 fetch와 시계를 사용해 갱신 없이 조회한다', async () => {
    const fetcher = vi.fn<typeof fetch>(async () => reply());
    vi.stubGlobal('fetch', fetcher);
    try { expect((await createGs25SessionTransport(await session())(url, {})).status).toBe(200); }
    finally { vi.unstubAllGlobals(); }
  });
  it('만료된 refresh는 서버 호출 없이 재로그인 오류로 전달한다', async () => {
    const file = await session(jwt(now / 1000 - 1));
    await writeFile(file, JSON.stringify({ accessToken: valid, refreshToken: jwt(now / 1000 - 1), deviceId: 'device' }));
    const fetcher = vi.fn<typeof fetch>(async () => new Response(null, { status: 401 }));
    const send = createGs25SessionTransport(file, { fetcher, now: () => now });
    await expect(send(url, {})).rejects.toMatchObject({ status: 403 });
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
  it.each([403, 500])('갱신 HTTP%d은 성공으로 위장하지 않는다', async (status) => {
    const send = createGs25SessionTransport(await session(jwt(now / 1000 - 1)), {
      fetcher: async () => new Response('failure', { status }), now: () => now,
    });
    await expect(send(url, {})).rejects.toMatchObject({ status: status === 403 ? 403 : 502 });
  });
  it.each([{ resultCode: 'bad' }, { resultCode: '0000' }, { resultCode: '0000', data: {} },
    { resultCode: '0000', data: { access: renewed } },
    { resultCode: '0000', data: { access: jwt(now / 1000 + 5), refresh } },
    { resultCode: '0000', data: { access: renewed, refresh: jwt(now / 1000 - 5) } }])('잘못된 갱신 envelope·기한은 실패한다 %j', async (value) => {
    const send = createGs25SessionTransport(await session(jwt(now / 1000 - 1)), { fetcher: async () => Response.json(value), now: () => now });
    await expect(send(url, {})).rejects.toMatchObject({ status: 502 });
  });
  it('갱신 네트워크 오류를 비밀 없는 오류로 반환한다', async () => {
    const send = createGs25SessionTransport(await session(jwt(now / 1000 - 1)), { fetcher: async () => { throw new Error('private value'); }, now: () => now });
    await expect(send(url, {})).rejects.toMatchObject({ status: 502, message: 'Relay failure' });
  });
  it('갱신 저장 실패 뒤에는 재인증할 때까지 원본을 호출하지 않는다', async () => {
    const file = await session(jwt(now / 1000 - 1));
    vi.mocked(fs.rename).mockRejectedValueOnce(new Error('disk failure'));
    const fetcher = vi.fn<typeof fetch>(async () => fresh());
    const send = createGs25SessionTransport(file, { fetcher, now: () => now });
    await expect(send(url, {})).rejects.toMatchObject({ status: 502 });
    await expect(send(url, {})).rejects.toMatchObject({ status: 403 });
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
  it('서로 다른 동시 조회의401은 토큰을 한 번만 회전한다', async () => {
    const fetcher = vi.fn<typeof fetch>().mockImplementation(async (input, init) => {
      if (String(input).includes('tokenReissue')) return fresh();
      if (new Headers(init?.headers).get('Authorization') === `Bearer ${valid}`) return new Response(null, { status: 401 });
      return reply();
    });
    const send = createGs25SessionTransport(await session(), { fetcher, now: () => now });
    const result = await Promise.all([send(url, {}), send(url, {})]);
    expect(result.map((r) => r.status)).toEqual([200, 200]);
    expect(fetcher.mock.calls.filter(([input]) => String(input).includes('tokenReissue'))).toHaveLength(1);
  });
  it('인증실패 응답의 body 취소 실패도 인증 오류를 바꾸지 않는다', async () => {
    const denied = () => {
      const response = new Response('denied', { status: 401 });
      vi.spyOn(response.body!, 'cancel').mockRejectedValueOnce(new Error('already consumed'));
      return response;
    };
    const send = createGs25SessionTransport(await session(), { fetcher: async () => denied(), now: () => now });
    await expect(send(url, {})).rejects.toMatchObject({ status: 403 });
    await new Promise<void>((resolve) => setImmediate(resolve));
  });
  it('rename 완료가 기한보다 늦으면 메모리 세션을 갱신하지 않는다', async () => {
    const file = await session(jwt(now / 1000 - 1));
    let complete!: () => void;
    vi.mocked(fs.rename).mockImplementationOnce(async () => new Promise<void>((resolve) => { complete = resolve; }));
    const send = createGs25SessionTransport(file, { fetcher: async () => fresh(), now: () => now, refreshTimeoutMs: 15 });
    await expect(send(url, {})).rejects.toMatchObject({ status: 504 });
    complete();
    await new Promise<void>((resolve) => setImmediate(resolve));
    await expect(send(url, {})).rejects.toMatchObject({ status: 403 });
  });
});
