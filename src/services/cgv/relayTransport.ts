/** CGV 무료 중계 설정과 인증 전송입니다. */
import { ServiceError } from '../../core/errors.js';
import { isValidDtryxRelayUrl } from '../dtryx/transport.js';
import { diagnosticHeaders } from '../../utils/diagnostics.js';
import { parseRelayQuota } from '../../utils/relayQuota.js';
import { createTimeoutController } from '../../utils/http.js';
import { CGV_API } from './api.js';
export interface CgvTransportOptions {
  cgvRelayUrl?: string;
  cgvRelayToken?: string;
  cgvAccessClientId?: string;
  cgvAccessClientSecret?: string;
}
export function cgvTransportFromBindings(bindings?: {
  CGV_RELAY_URL?: string;
  CGV_RELAY_TOKEN?: string;
  CGV_ACCESS_CLIENT_ID?: string;
  CGV_ACCESS_CLIENT_SECRET?: string;
  DTRYX_RELAY_URL?: string;
  DTRYX_RELAY_TOKEN?: string;
  DTRYX_ACCESS_CLIENT_ID?: string;
  DTRYX_ACCESS_CLIENT_SECRET?: string;
}): CgvTransportOptions {
  if (
    ![
      bindings?.CGV_RELAY_URL,
      bindings?.CGV_RELAY_TOKEN,
      bindings?.CGV_ACCESS_CLIENT_ID,
      bindings?.CGV_ACCESS_CLIENT_SECRET,
    ].some((value) => value !== undefined)
  ) {
    return {
      cgvRelayUrl: bindings?.DTRYX_RELAY_URL,
      cgvRelayToken: bindings?.DTRYX_RELAY_TOKEN,
      cgvAccessClientId: bindings?.DTRYX_ACCESS_CLIENT_ID,
      cgvAccessClientSecret: bindings?.DTRYX_ACCESS_CLIENT_SECRET,
    };
  }
  return {
    cgvRelayUrl: bindings?.CGV_RELAY_URL,
    cgvRelayToken: bindings?.CGV_RELAY_TOKEN,
    cgvAccessClientId: bindings?.CGV_ACCESS_CLIENT_ID,
    cgvAccessClientSecret: bindings?.CGV_ACCESS_CLIENT_SECRET,
  };
}
export const CGV_RELAY_ROUTES: Record<
  string,
  'theaters' | 'movies' | 'timetable' | 'timetable-movie'
> = {
  [CGV_API.THEATER_LIST_PATH]: 'theaters',
  [CGV_API.MOVIE_LIST_PATH]: 'movies',
  [CGV_API.TIMETABLE_BY_SITE_PATH]: 'timetable',
  [CGV_API.TIMETABLE_PATH]: 'timetable-movie',
} as const;
export function hasCgvRelay(options: CgvTransportOptions): boolean {
  return [
    options.cgvRelayUrl,
    options.cgvRelayToken,
    options.cgvAccessClientId,
    options.cgvAccessClientSecret,
  ].some((value) => value !== undefined);
}
export function isCgvResponse(value: unknown): boolean {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const data = value as Record<string, unknown>;
  return (
    data.statusCode === 0 &&
    Array.isArray(data.data) &&
    data.data.every((row) => !!row && typeof row === 'object' && !Array.isArray(row))
  );
}
export function cgvRelayBody(path: string, params: URLSearchParams): Record<string, string> {
  const route = CGV_RELAY_ROUTES[path];
  const body: Record<string, string> = {};
  if (route !== 'theaters') {
    body.theaterCode = params.get('siteNo') ?? '';
    body.playDate = params.get('scnYmd') ?? '';
  }
  if (route === 'timetable-movie') body.movieCode = params.get('movNo') ?? '';
  return body;
}
export function validateCgvRelay(path: string, options: CgvTransportOptions): void {
  const {
    cgvRelayUrl: url,
    cgvRelayToken: token,
    cgvAccessClientId: id,
    cgvAccessClientSecret: secret,
  } = options;
  const route = CGV_RELAY_ROUTES[path];
  if (
    !route ||
    !isValidDtryxRelayUrl(url) ||
    !token?.trim() ||
    ((id !== undefined || secret !== undefined) && (!id?.trim() || !secret?.trim()))
  ) {
    throw new ServiceError(
      'CGV_RELAY_CONFIG_ERROR',
      'CGV 릴레이 URL, 토큰 및 Access 설정을 확인하세요.',
      503,
      false,
    );
  }
}
export async function requestCgvRelay<T>(
  path: string,
  params: URLSearchParams,
  options: CgvTransportOptions,
  timeout: number,
): Promise<T> {
  const {
    cgvRelayUrl: url,
    cgvRelayToken: token,
    cgvAccessClientId: id,
    cgvAccessClientSecret: secret,
  } = options;
  const route = CGV_RELAY_ROUTES[path];
  validateCgvRelay(path, options);
  const body = cgvRelayBody(path, params);
  const headers: Record<string, string> = {
    ...diagnosticHeaders(),
    Accept: 'application/json',
    'Content-Type': 'application/json',
    Authorization: `Bearer ${token}`,
  };
  if (id && secret) {
    headers['CF-Access-Client-Id'] = id;
    headers['CF-Access-Client-Secret'] = secret;
  }
  const { controller, timeoutId } = createTimeoutController(timeout);
  let rejectAbort!: (error: Error) => void;
  const aborted = new Promise<never>((_, reject) => {
    rejectAbort = reject;
  });
  const onAbort = () =>
    rejectAbort(
      new ServiceError('CGV_RELAY_TIMEOUT', 'CGV 릴레이 요청 시간이 초과되었습니다.', 504, true),
    );
  controller.signal.addEventListener('abort', onAbort, { once: true });
  try {
    const response = await Promise.race([
      fetch(`${url!.replace(/\/$/, '')}/v1/cgv/${route}`, {
        method: 'POST',
        headers,
        body: JSON.stringify(body),
        redirect: 'manual',
        signal: controller.signal,
      }),
      aborted,
    ]);
    if (response.status !== 200) {
      void response.body?.cancel().catch(() => undefined);
      throw new ServiceError(
        'CGV_RELAY_FAILED',
        'CGV 릴레이 요청에 실패했습니다.',
        response.status === 429 || response.status === 503 || response.status === 504
          ? response.status
          : 502,
        response.status === 429 || response.status >= 500,
        response.status,
        parseRelayQuota(response.status, response.headers),
      );
    }
    const result: unknown = await Promise.race([response.json(), aborted]);
    if (!isCgvResponse(result)) throw new Error('Invalid response');
    return result as T;
  } catch (error) {
    if (error instanceof ServiceError) throw error;
    throw new ServiceError('CGV_RELAY_FAILED', 'CGV 릴레이 요청에 실패했습니다.', 502, true);
  } finally {
    clearTimeout(timeoutId);
    controller.signal.removeEventListener('abort', onAbort);
    controller.abort();
  }
}
