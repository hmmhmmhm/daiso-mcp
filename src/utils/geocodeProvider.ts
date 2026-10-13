/** 공급자 URL·입력을 고정하며 API 키와 조회 응답은 저장하지 않습니다. */
import type { AppBindings } from '../api/response.js';
import type { GeocodeProvider, GeocodeReply } from './geocodeGate.js';
export interface GeocodeRequest {
  provider: GeocodeProvider;
  scope: string;
  params: Record<string, string>;
  timeoutMs: number;
}
const endpoints = {
  'kakao-address': 'https://dapi.kakao.com/v2/local/search/address.json',
  'kakao-keyword': 'https://dapi.kakao.com/v2/local/search/keyword.json',
  'naver-local': 'https://openapi.naver.com/v1/search/local.json',
} as const;
export const invalidGeocode = () => new Error('GEOCODE_INVALID_REQUEST');
export function geocodeProvider(url: URL): GeocodeProvider | undefined {
  return (Object.keys(endpoints) as GeocodeProvider[]).find(
    (provider) => url.origin + url.pathname === endpoints[provider],
  );
}
export async function geocodeScope(credentials: string[]): Promise<string> {
  const digest = await crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(JSON.stringify(credentials)),
  );
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}
export function geocodeCredentials(provider: GeocodeProvider, headers: Headers): string[] {
  const authorization = headers.get('Authorization') || '';
  return provider === 'naver-local'
    ? [headers.get('X-Naver-Client-Id') || '', headers.get('X-Naver-Client-Secret') || '']
    : [authorization.startsWith('KakaoAK ') ? authorization.slice(8) : ''];
}
export function geocodeHeaders(
  provider: GeocodeProvider,
  credentials: string[],
): Record<string, string> {
  return provider === 'naver-local'
    ? { 'X-Naver-Client-Id': credentials[0], 'X-Naver-Client-Secret': credentials[1] }
    : { Authorization: `KakaoAK ${credentials[0]}` };
}
export function configuredGeocodeCredentials(
  provider: GeocodeProvider,
  env: Partial<AppBindings>,
): string[] {
  return provider === 'naver-local'
    ? [env.NAVER_CLIENT_ID?.trim() || '', env.NAVER_CLIENT_SECRET?.trim() || '']
    : [env.KAKAO_REST_API_KEY?.trim() || ''];
}
export function validGeocodeCredentials(credentials: string[]): boolean {
  return credentials.every(
    (value) => value.length > 0 && value.length <= 512 && !/[\p{Cc}]/u.test(value),
  );
}
export function validGeocodeRequest(value: unknown): value is GeocodeRequest {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const row = value as GeocodeRequest;
  if (
    Object.keys(row).some((key) => !['provider', 'scope', 'params', 'timeoutMs'].includes(key)) ||
    typeof row.provider !== 'string' ||
    !Object.hasOwn(endpoints, row.provider) ||
    typeof row.scope !== 'string' ||
    row.scope.length !== 64 ||
    !/^[a-f0-9]{64}$/u.test(row.scope) ||
    !Number.isInteger(row.timeoutMs) ||
    row.timeoutMs < 1 ||
    row.timeoutMs > 20000 ||
    !row.params ||
    typeof row.params !== 'object' ||
    Array.isArray(row.params)
  )
    return false;
  const allowed =
    row.provider === 'kakao-address'
      ? ['query']
      : row.provider === 'kakao-keyword'
        ? ['query', 'size', 'x', 'y', 'radius', 'sort']
        : ['query', 'display', 'start', 'sort'];
  const p = row.params;
  if (
    Object.entries(p).some(([key, text]) => !allowed.includes(key) || typeof text !== 'string') ||
    !p.query?.trim() ||
    p.query.length > 300 ||
    /[\p{Cc}]/u.test(p.query)
  )
    return false;
  if (row.provider === 'kakao-keyword') {
    if (p.size !== '15') return false;
    if (p.x !== undefined || p.y !== undefined) {
      if (
        !/^-?\d+(?:\.\d+)?$/u.test(p.x || '') ||
        !/^-?\d+(?:\.\d+)?$/u.test(p.y || '') ||
        Number(p.x) < 124 ||
        Number(p.x) > 132 ||
        Number(p.y) < 33 ||
        Number(p.y) > 39 ||
        p.radius !== '20000' ||
        p.sort !== 'distance'
      )
        return false;
    } else if (p.radius !== undefined || p.sort !== undefined) return false;
  }
  if (
    row.provider === 'naver-local' &&
    (!/^[1-5]$/u.test(p.display || '') ||
      p.start !== '1' ||
      !['random', 'comment'].includes(p.sort))
  )
    return false;
  return true;
}
export function geocodeUrl(row: GeocodeRequest): string {
  const url = new URL(endpoints[row.provider]);
  url.search = new URLSearchParams(row.params).toString();
  return url.toString();
}
export async function waitGeocode<T>(
  work: Promise<T>,
  timeoutMs: number,
  signal?: AbortSignal | null,
  abort?: () => void,
): Promise<T> {
  let timer: ReturnType<typeof setTimeout>;
  let listener: () => void;
  const stop = (reject: (reason: unknown) => void, reason: string) => {
    abort?.();
    reject(new Error(reason));
  };
  try {
    return await Promise.race([
      work,
      new Promise<never>((_, reject) => {
        listener = () => stop(reject, 'GEOCODE_CANCELLED');
        if (signal?.aborted) {
          listener();
          return;
        }
        signal?.addEventListener('abort', listener, { once: true });
        timer = setTimeout(() => stop(reject, 'GEOCODE_TIMEOUT'), timeoutMs);
      }),
    ]);
  } finally {
    clearTimeout(timer!);
    signal?.removeEventListener('abort', listener!);
  }
}
export async function requestGeocodeProvider(
  row: GeocodeRequest,
  credentials: string[],
  fetchImpl: typeof fetch,
): Promise<GeocodeReply> {
  const controller = new AbortController();
  let reader: ReadableStreamDefaultReader<Uint8Array> | undefined;
  const work = (async () => {
    const response = await fetchImpl(geocodeUrl(row), {
      method: 'GET',
      headers: geocodeHeaders(row.provider, credentials),
      redirect: 'manual',
      signal: controller.signal,
    });
    if (controller.signal.aborted) {
      await response.body?.cancel();
      throw new Error('GEOCODE_TIMEOUT');
    }
    reader = response.body?.getReader();
    const chunks: Uint8Array[] = [];
    let bytes = 0;
    while (reader) {
      const chunk = await reader.read();
      if (chunk.done) break;
      bytes += chunk.value.length;
      if (bytes > 524288) {
        await reader.cancel();
        throw new Error('GEOCODE_RESPONSE_TOO_LARGE');
      }
      chunks.push(chunk.value);
    }
    const body = new Uint8Array(bytes);
    let offset = 0;
    for (const chunk of chunks) {
      body.set(chunk, offset);
      offset += chunk.length;
    }
    let parsed: unknown;
    try {
      parsed = JSON.parse(new TextDecoder().decode(body));
    } catch {
      return { status: 502, body: { code: 'GEOCODE_INVALID_RESPONSE' } };
    }
    return { status: response.status, body: parsed };
  })();
  return waitGeocode(work, row.timeoutMs, undefined, () => {
    controller.abort();
    void reader?.cancel().catch(() => {});
  });
}
