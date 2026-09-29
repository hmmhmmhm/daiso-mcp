import { diagnosticHeaders } from '../../utils/diagnostics.js';
/** 디트릭스 전용 중계 설정과 인증 전송입니다. */
import { ServiceError } from '../../core/errors.js';
import { createTimeoutController } from '../../utils/http.js';

export interface DtryxTransportOptions {
  relayUrl?: string;
  relayToken?: string;
  accessClientId?: string;
  accessClientSecret?: string;
}

export function isValidDtryxRelayUrl(value: string | undefined): boolean {
  if (!value?.trim()) return false;
  try {
    const url = new URL(value);
    return (
      !url.username &&
      !url.password &&
      !url.search &&
      !url.hash &&
      (url.protocol === 'https:' ||
        (url.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)))
    );
  } catch {
    return false;
  }
}

/** 바인딩은 요청마다 변환하며 프로세스 전역에 저장하지 않습니다. */
export function dtryxTransportFromBindings(bindings?: {
  DTRYX_RELAY_URL?: string;
  DTRYX_RELAY_TOKEN?: string;
  DTRYX_ACCESS_CLIENT_ID?: string;
  DTRYX_ACCESS_CLIENT_SECRET?: string;
}): DtryxTransportOptions {
  return {
    relayUrl: bindings?.DTRYX_RELAY_URL,
    relayToken: bindings?.DTRYX_RELAY_TOKEN,
    accessClientId: bindings?.DTRYX_ACCESS_CLIENT_ID,
    accessClientSecret: bindings?.DTRYX_ACCESS_CLIENT_SECRET,
  };
}

export function hasDtryxRelayOptions(options: DtryxTransportOptions): boolean {
  return Object.values(options).some((value) => value !== undefined);
}

export async function requestDtryxRelay<T>(
  path: 'movies' | 'play-dates' | 'timetable',
  body: { brandCode: string; cinemaCode: string; playDate?: string },
  options: DtryxTransportOptions,
  timeout: number,
): Promise<T> {
  const { relayUrl, relayToken, accessClientId, accessClientSecret } = options;
  const accessPresent = accessClientId !== undefined || accessClientSecret !== undefined;
  if (
    !isValidDtryxRelayUrl(relayUrl) ||
    !relayToken?.trim() ||
    (accessPresent && (!accessClientId?.trim() || !accessClientSecret?.trim()))
  ) {
    throw new ServiceError(
      'DTRYX_RELAY_CONFIG_ERROR',
      '디트릭스 릴레이 URL, 토큰 및 Access 설정을 확인하세요.',
      503,
      false,
    );
  }
  const headers: Record<string, string> = {
    ...diagnosticHeaders(),
    'Content-Type': 'application/json',
    Accept: 'application/json',
    Authorization: `Bearer ${relayToken}`,
  };
  if (accessPresent) {
    headers['CF-Access-Client-Id'] = accessClientId!;
    headers['CF-Access-Client-Secret'] = accessClientSecret!;
  }
  const { controller, timeoutId } = createTimeoutController(timeout);
  try {
    // 리다이렉트를 따라 인증 정보를 다른 호스트에 전달하지 않습니다.
    const response = await fetch(`${relayUrl!.replace(/\/$/, '')}/v1/dtryx/${path}`, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
      redirect: 'manual',
      signal: controller.signal,
    });
    if (response.status !== 200) {
      void response.body?.cancel().catch(() => {});
      const status = response.status;
      const mapped = status === 429 || status === 503 || status === 504 ? status : 502;
      throw new ServiceError(
        'DTRYX_RELAY_FAILED',
        '디트릭스 릴레이 요청에 실패했습니다.',
        mapped,
        status === 429 || status >= 500,
        status,
      );
    }
    const result: unknown = await response.json();
    if (
      typeof result !== 'object' ||
      result === null ||
      !('RetCode' in result) ||
      result.RetCode !== 'success' ||
      !('Recordset' in result) ||
      !Array.isArray(result.Recordset) ||
      !result.Recordset.every(
        (item) => typeof item === 'object' && item !== null && !Array.isArray(item),
      )
    ) {
      throw new Error('응답 형식 오류');
    }
    return result as T;
  } catch (error) {
    if (error instanceof ServiceError) throw error;
    if (controller.signal.aborted) {
      throw new ServiceError(
        'DTRYX_RELAY_TIMEOUT',
        '디트릭스 릴레이 요청 시간이 초과되었습니다.',
        504,
        true,
      );
    }
    throw new ServiceError('DTRYX_RELAY_FAILED', '디트릭스 릴레이 요청에 실패했습니다.', 502, true);
  } finally {
    clearTimeout(timeoutId);
    controller.abort();
  }
}
