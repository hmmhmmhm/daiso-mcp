/** 로컬 요청의 상태만 기록하며 인증정보나 payload를 보존하지 않습니다. */
import { randomUUID } from 'node:crypto';
export interface RequestEvent {
  requestId: string;
  operation: string;
  stage: string;
  outcome: string;
  status: number;
  durationMs: number;
  cache?: string;
  quotaReason?: string;
}
export function observeRelay(
  handler: (request: Request) => Promise<Response>,
  emit: (event: RequestEvent) => void | Promise<void>,
) {
  return async (request: Request): Promise<Response> => {
    const supplied = request.headers.get('x-request-id');
    const requestId = supplied && /^[A-Za-z0-9_-]{1,64}$/.test(supplied) ? supplied : randomUUID();
    const headers = new Headers(request.headers);
    headers.set('x-request-id', requestId);
    const forwarded = new Request(request, { headers });
    const path = new URL(request.url).pathname;
    const match =
      /^\/v1\/(?:oliveyoung|dtryx)\/(find-store|product-search-v3|stock-goods-info-v3|stock-stores|movies|play-dates|timetable)$/.exec(
        path,
      );
    const operation = match ? match[1] : 'other';
    const start = Date.now();
    let response: Response | undefined;
    try {
      response = await handler(forwarded);
      response.headers.set('x-request-id', requestId);
      return response;
    } finally {
      if (!response?.ok || !['/health', '/v1/dtryx/health'].includes(path)) {
        try {
          void Promise.resolve(
            emit({
              requestId,
              operation,
              stage: 'request',
              outcome: response?.ok ? 'ok' : 'error',
              status: response?.status ?? 500,
              durationMs: Date.now() - start,
              cache: response?.headers.get('x-relay-cache') ?? undefined,
              quotaReason: response?.headers.get('x-relay-quota-reason') ?? undefined,
            }),
          ).catch(() => undefined);
        } catch {
          /* 기록 실패는 서비스 응답에 영향을 주지 않습니다. */
        }
      }
    }
  };
}
