/**
 * HTTP 요청 유틸리티
 *
 * 다이소 API 호출 시 필요한 공통 헤더를 포함한 fetch 래퍼
 */

const DEFAULT_HEADERS = {
  'User-Agent':
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  Accept: 'application/json, text/html, */*',
  'Accept-Language': 'ko-KR,ko;q=0.9,en-US;q=0.8,en;q=0.7',
};

export interface FetchOptions extends RequestInit {
  timeout?: number;
}

// 공통 fetch 함수
export async function daisoFetch(url: string, options: FetchOptions = {}): Promise<Response> {
  const { timeout = 10000, headers = {}, ...restOptions } = options;

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeout);

  try {
    const response = await fetch(url, {
      ...restOptions,
      headers: {
        ...DEFAULT_HEADERS,
        ...headers,
      },
      signal: controller.signal,
    });

    return response;
  } finally {
    clearTimeout(timeoutId);
  }
}

// JSON 응답을 위한 fetch
export async function fetchJson<T>(url: string, options: FetchOptions = {}): Promise<T> {
  const response = await daisoFetch(url, options);

  if (!response.ok) {
    throw new Error(`API 요청 실패: ${response.status} ${response.statusText}`);
  }

  return response.json() as Promise<T>;
}

// HTML 응답을 위한 fetch
export async function fetchHtml(url: string, options: FetchOptions = {}): Promise<string> {
  const response = await daisoFetch(url, options);

  if (!response.ok) {
    throw new Error(`API 요청 실패: ${response.status} ${response.statusText}`);
  }

  return response.text();
}
