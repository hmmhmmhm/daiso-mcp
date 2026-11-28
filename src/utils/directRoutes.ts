/** 공식 API 직접 조회는 본문 읽기까지 같은 짧은 제한을 적용합니다. */
import { HttpError } from './http.js';
import { directRouteSpecs } from './directRouteSpecs.js';
import { type CuRedirectLocationClass, type RouteKey, type RouteCheck } from './routeHealth.js';

export class DirectRouteError extends Error {
  constructor(readonly reason: string) {
    super(reason);
  }
}
const MAX_BYTES = 2 * 1024 * 1024;
const MAX_CU_REDIRECT_LOCATION_LENGTH = 2048;

function hasControlCharacter(value: string): boolean {
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    if (code <= 0x1f || (code >= 0x7f && code <= 0x9f)) return true;
  }
  return false;
}

function classifyCuRedirectLocation(
  location: string | null,
  requestUrl: URL,
): CuRedirectLocationClass {
  if (location === null) return 'missing';
  const trimmed = location.trim();
  if (
    trimmed.length === 0 ||
    location.length > MAX_CU_REDIRECT_LOCATION_LENGTH ||
    location.includes('\\') ||
    location.includes(',') ||
    hasControlCharacter(location)
  )
    return 'invalid-or-unsafe';

  try {
    const scheme = /^[a-z][a-z\d+.-]*:/iu.exec(trimmed);
    if (scheme) {
      const authorityPart = trimmed.slice(scheme[0].length);
      if (!authorityPart.startsWith('//') || authorityPart[2] === '/') return 'invalid-or-unsafe';
    } else if (trimmed.startsWith('//') && trimmed[2] === '/') {
      return 'invalid-or-unsafe';
    }
    const authority = trimmed.match(/^(?:[a-z][a-z\d+.-]*:)?\/\/([^/?#]*)/iu)?.[1];
    const target = new URL(trimmed, requestUrl);
    if (
      authority?.includes('@') ||
      target.username !== '' ||
      target.password !== '' ||
      target.protocol !== 'https:'
    )
      return 'invalid-or-unsafe';
    return target.origin === requestUrl.origin ? 'same-origin' : 'other-origin';
  } catch {
    return 'invalid-or-unsafe';
  }
}

/** 중단을 무시하는 fetch나 스트림도 전체 제한 시간을 넘기지 못합니다. */
export async function boundedRouteJson(
  url: URL,
  init: RequestInit,
  timeoutMs: number,
  callerSignal?: AbortSignal,
  onCuRedirectClass?: (locationClass: CuRedirectLocationClass) => void,
): Promise<unknown> {
  const controller = new AbortController();
  let rejectAbort!: (reason: unknown) => void;
  const aborted = new Promise<never>((_, reject) => {
    rejectAbort = reject;
  });
  const stop = (reason: string) => {
    rejectAbort(
      reason === 'cancelled'
        ? new DOMException('cancelled', 'AbortError')
        : new DirectRouteError(reason),
    );
    controller.abort();
  };
  const onAbort = () => stop('cancelled');
  const timer = setTimeout(() => stop('timeout'), Math.max(1, Math.min(3000, timeoutMs)));
  callerSignal?.addEventListener('abort', onAbort, { once: true });
  if (callerSignal?.aborted) onAbort();
  let reader: ReadableStreamDefaultReader<Uint8Array> | undefined;
  try {
    if (controller.signal.aborted) return await aborted;
    const options: RequestInit & { credentials: string } = {
      ...init,
      redirect: 'manual',
      credentials: 'omit',
      signal: controller.signal,
    };
    const response = await Promise.race([fetch(url, options), aborted]);
    if (response.status === 302 && onCuRedirectClass) {
      try {
        onCuRedirectClass(classifyCuRedirectLocation(response.headers.get('location'), url));
      } catch {
        // Diagnostic observer failures do not change the HTTP request result.
      }
    }
    if (response.status !== 200) {
      void response.body?.cancel().catch(() => undefined);
      throw new HttpError(response.status, '', '');
    }
    reader = response.body?.getReader();
    if (!reader) throw new DirectRouteError('invalid-response');
    const decoder = new TextDecoder();
    let text = '';
    let bytes = 0;
    while (true) {
      const chunk = await Promise.race([reader.read(), aborted]);
      if (chunk.done) break;
      bytes += chunk.value.byteLength;
      if (bytes > MAX_BYTES) throw new DirectRouteError('response-too-large');
      text += decoder.decode(chunk.value, { stream: true });
    }
    text += decoder.decode();
    try {
      return JSON.parse(text);
    } catch {
      throw new DirectRouteError('invalid-response');
    }
  } catch (error) {
    if (
      error instanceof DirectRouteError ||
      error instanceof HttpError ||
      (error instanceof Error && error.name === 'AbortError')
    )
      throw error;
    throw new DirectRouteError('network-error');
  } finally {
    clearTimeout(timer);
    callerSignal?.removeEventListener('abort', onAbort);
    controller.abort();
    void reader?.cancel().catch(() => undefined);
  }
}

async function requestDirectRouteInternal<T>(
  key: RouteKey,
  body: unknown,
  timeoutMs: number,
  signal?: AbortSignal,
  onCuRedirectClass?: (locationClass: CuRedirectLocationClass) => void,
): Promise<T> {
  if (key === 'gs25-stock') throw new DirectRouteError('pinned-relay');
  const spec = directRouteSpecs[key];
  const request = await spec.build(body);
  const result = await boundedRouteJson(
    request.url,
    request.init,
    timeoutMs,
    signal,
    onCuRedirectClass,
  );
  if (!spec.response.safeParse(result).success) throw new DirectRouteError('invalid-response');
  return result as T;
}

export async function requestDirectRoute<T>(
  key: RouteKey,
  body: unknown,
  timeoutMs: number,
  signal?: AbortSignal,
): Promise<T> {
  return requestDirectRouteInternal(key, body, timeoutMs, signal);
}

export async function checkDirectRoute(key: RouteKey, timeoutMs = 3000): Promise<RouteCheck> {
  const checkedAt = Date.now();
  let cuRedirectLocation: CuRedirectLocationClass | undefined;
  const isCuRoute = key === 'cu-prime' || key === 'cu-stock' || key === 'cu-store';
  const captureCuRedirect = isCuRoute
    ? (locationClass: CuRedirectLocationClass) => {
        cuRedirectLocation = locationClass;
      }
    : undefined;
  try {
    const body = directRouteSpecs[key].probe() as Record<string, unknown>;
    const remaining = Math.min(3000, timeoutMs) - (Date.now() - checkedAt);
    if (remaining <= 0) throw new DirectRouteError('timeout');
    await requestDirectRouteInternal(key, body, remaining, undefined, captureCuRedirect);
    return { key, direct: true, checkedAt };
  } catch (error) {
    const result: RouteCheck = {
      key,
      direct: false,
      checkedAt,
      reason:
        error instanceof DirectRouteError
          ? error.reason
          : error instanceof HttpError
            ? Number.isInteger(error.status) && error.status >= 100 && error.status <= 599
              ? `http-${error.status}`
              : 'http-error'
            : 'invalid-input',
    };
    return isCuRoute && error instanceof HttpError && error.status === 302 && cuRedirectLocation
      ? { ...result, cuRedirectLocation }
      : result;
  }
}
