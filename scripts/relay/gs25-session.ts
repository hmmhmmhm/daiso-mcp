/** GS 정상 로그인 토큰을 로컬에만 보관하고 고정 재고 API에 사용합니다. */
import { randomUUID } from 'node:crypto';
import { readFile, rename, stat, unlink, writeFile } from 'node:fs/promises';
import { GS25_API } from '../../src/services/gs25/api.js';
import { abortable, readJson, RelayError } from './http-relay.js';

interface Session { accessToken: string; refreshToken: string; deviceId: string }
export type Gs25SessionTransport = (url: URL, init: RequestInit) => Promise<Response>;

function expiration(token: unknown): number {
  if (typeof token !== 'string' || !/^[\w-]+\.[\w-]+\.[\w-]+$/.test(token)) throw new RelayError(403);
  try {
    const payload = JSON.parse(Buffer.from(token.split('.')[1]!, 'base64url').toString('utf8'));
    if (!Number.isFinite(payload.exp) || payload.exp <= 0) throw Error();
    return payload.exp * 1000;
  } catch { throw new RelayError(403); }
}

function parseSession(value: unknown): Session {
  if (!value || typeof value !== 'object') throw new RelayError(403);
  const session = value as Session;
  expiration(session.accessToken);
  expiration(session.refreshToken);
  if (typeof session.deviceId !== 'string' || !/^[\w-]{1,100}$/.test(session.deviceId)) throw new RelayError(403);
  return { accessToken: session.accessToken, refreshToken: session.refreshToken, deviceId: session.deviceId };
}

function appHeaders(session: Session): Headers {
  return new Headers({
    Accept: 'application/json', 'Content-Type': 'application/json',
    'User-Agent': 'woodongs-app/5.3.61 (Android; 14; sdk_gphone64_arm64)',
    request_id: randomUUID(), appinfo_device_id: session.deviceId,
    appinfo_model_name: 'sdk_gphone64_arm64', appinfo_os_version: '14',
    appinfo_app_version: '5.3.61', appinfo_app_build_number: '2132', appinfo_os_type: 'android',
  });
}

export function createGs25SessionTransport(
  file: string,
  options: { fetcher?: typeof fetch; now?: () => number; refreshTimeoutMs?: number } = {},
): Gs25SessionTransport {
  const fetcher = options.fetcher ?? fetch;
  const now = options.now ?? Date.now;
  let loading: Promise<Session> | undefined;
  let current: Session | undefined;
  let refreshing: Promise<Session> | undefined;
  let revoked = false;

  async function load(): Promise<Session> {
    if (revoked) throw new RelayError(403);
    if (current) return current;
    loading ??= (async () => {
      try {
        const info = await stat(file);
        if (!info.isFile() || info.size > 16384 || (info.mode & 0o077) !== 0 || info.uid !== process.getuid!()) throw Error();
        current = parseSession(JSON.parse(await readFile(file, 'utf8')));
        return current;
      } catch { throw new RelayError(403); }
    })();
    return loading;
  }

  async function renew(session: Session): Promise<Session> {
    if (expiration(session.refreshToken) <= now()) { revoked = true; throw new RelayError(403); }
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), options.refreshTimeoutMs ?? 10000);
    const temporary = `${file}.${randomUUID()}.tmp`;
    try {
      const headers = appHeaders(session);
      headers.set('Refresh', session.refreshToken);
      const response = await abortable(fetcher(new URL('/api/bff/v4/auth/tokenReissue', GS25_API.BFF_BASE_URL), {
        method: 'POST', headers, redirect: 'manual', signal: controller.signal,
      }), controller.signal);
      if (!response.ok) {
        void response.body?.cancel().catch(() => undefined);
        if ([401, 403].includes(response.status)) { revoked = true; throw new RelayError(403); }
        throw new RelayError(502);
      }
      const value = await readJson(response.body, 131072, controller.signal, 502) as { resultCode?: string; data?: { access?: string; refresh?: string } };
      if (value.resultCode !== '0000' || !value.data?.access || !value.data.refresh) throw new RelayError(502);
      let next: Session;
      try {
        next = parseSession({ accessToken: value.data.access.replace(/^Bearer /, ''), refreshToken: value.data.refresh.replace(/^Bearer /, ''), deviceId: session.deviceId });
        if (expiration(next.accessToken) <= now() + 60000 || expiration(next.refreshToken) <= now()) throw Error();
      } catch { throw new RelayError(502); }
      // 회전된 refresh 토큰은 파일 저장이 성공한 뒤 사용합니다.
      try {
        await abortable((async () => {
          await writeFile(temporary, JSON.stringify(next), { mode: 0o600, flag: 'wx', signal: controller.signal });
          if (controller.signal.aborted) throw new RelayError(504);
          await rename(temporary, file);
          if (controller.signal.aborted) throw new RelayError(504);
        })(), controller.signal);
      } catch { revoked = true; throw new RelayError(502); }
      current = next;
      return next;
    } catch (error) {
      if (controller.signal.aborted) throw new RelayError(504);
      if (error instanceof RelayError) throw error;
      throw new RelayError(502);
    } finally {
      clearTimeout(timer);
      void unlink(temporary).catch(() => undefined);
    }
  }

  async function ready(forceFor?: string): Promise<Session> {
    const session = await load();
    if ((!forceFor && expiration(session.accessToken) > now() + 60000) || (forceFor && session.accessToken !== forceFor)) return session;
    if (!refreshing) refreshing = renew(session).finally(() => { refreshing = undefined; });
    return refreshing;
  }

  return async (url, init) => {
    if (url.origin !== GS25_API.BFF_BASE_URL || url.pathname !== GS25_API.STORE_STOCK_PATH || url.username || url.password) throw new RelayError(400);
    const signal = init.signal ?? new AbortController().signal;
    if (signal.aborted) throw new RelayError(499);
    const request = async (session: Session) => {
      const headers = new Headers(init.headers);
      headers.delete('Api-Key');
      appHeaders(session).forEach((value, key) => headers.set(key, value));
      headers.set('Authorization', `Bearer ${session.accessToken}`);
      return abortable(fetcher(url, { ...init, method: 'GET', body: undefined, headers, redirect: 'manual', signal }), signal);
    };
    const session = await abortable(ready(), signal);
    const response = await request(session);
    if (![401, 403].includes(response.status)) return response;
    void response.body?.cancel().catch(() => undefined);
    const next = await abortable(ready(session.accessToken), signal);
    const retry = await request(next);
    if ([401, 403].includes(retry.status)) revoked = true;
    return retry;
  };
}
