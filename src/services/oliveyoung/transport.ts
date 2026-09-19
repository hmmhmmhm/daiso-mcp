/** 올리브영 무료 직접 요청 및 운영자가 설정한 브라우저 릴레이 전송. */
import { fetchJson } from '../../utils/http.js';
import { OLIVEYOUNG_API } from './api.js';
import type { OliveyoungApiResponse } from './types.js';

export interface OliveyoungRequestOptions {
  /** 기존 호출부와의 호환용이며 유료 요청에는 사용하지 않습니다. */
  apiKey?: string;
  timeout?: number;
  relayUrl?: string;
  relayToken?: string;
  accessClientId?: string;
  accessClientSecret?: string;
}

/** 설정 진단과 실제 요청에 같은 릴레이 URL 규칙을 적용합니다. */
export function isValidOliveyoungRelayUrl(value: string | undefined): boolean {
  if (!value?.trim()) return false;
  let relay: URL;
  try {
    relay = new URL(value);
  } catch {
    return false;
  }
  return !(
    relay.username ||
    relay.password ||
    relay.search ||
    relay.hash ||
    (relay.protocol !== 'https:' &&
      !(relay.protocol === 'http:' && ['127.0.0.1', 'localhost'].includes(relay.hostname)))
  );
}

export async function requestOliveyoung(
  path: string,
  body: Record<string, unknown>,
  options: OliveyoungRequestOptions = {},
): Promise<OliveyoungApiResponse> {
  const { timeout = 15000, relayUrl, relayToken } = options;
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    Accept: 'application/json',
    'X-Requested-With': 'XMLHttpRequest',
  };
  let url = `${OLIVEYOUNG_API.BASE_URL}${path}`;
  if (relayUrl) {
    if (!isValidOliveyoungRelayUrl(relayUrl)) {
      throw new Error('올리브영 릴레이 URL은 HTTPS 또는 로컬 HTTP 주소여야 합니다.');
    }
    if (!relayToken?.trim()) throw new Error('OY_RELAY_TOKEN이 필요합니다.');
    url = `${relayUrl.replace(/\/$/, '')}/v1/oliveyoung/${path.split('/').pop()}`;
    headers.Authorization = `Bearer ${relayToken}`;
    const { accessClientId, accessClientSecret } = options;
    if (accessClientId !== undefined || accessClientSecret !== undefined) {
      if (!accessClientId?.trim() || !accessClientSecret?.trim()) {
        throw new Error('올리브영 Access 서비스 토큰 설정이 필요합니다.');
      }
      headers['CF-Access-Client-Id'] = accessClientId;
      headers['CF-Access-Client-Secret'] = accessClientSecret;
    }
  }
  let result: OliveyoungApiResponse;
  try {
    result = await fetchJson<OliveyoungApiResponse>(url, {
      method: 'POST',
      redirect: 'error',
      headers,
      body: JSON.stringify(body),
      timeout,
      retries: 0,
      expectedStatus: 200,
    });
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      throw new Error('올리브영 API 요청 시간 초과');
    }
    if (relayUrl) throw new Error('올리브영 브라우저 릴레이 요청 실패');
    throw new Error(
      '올리브영 직접 요청 실패. 운영자는 OY_RELAY_URL과 OY_RELAY_TOKEN으로 브라우저 릴레이를 설정해주세요.',
      { cause: error },
    );
  }
  if (result?.status !== 'SUCCESS') {
    throw new Error(`올리브영 API 상태 오류: ${result?.status || 'UNKNOWN'}`);
  }
  return result;
}
