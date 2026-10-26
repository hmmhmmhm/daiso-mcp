/** 세븐일레븐 공개 웹 세션을 HTTP 조회에 재사용하며 실패 복구를 한 번으로 제한합니다. */
import { SEVENELEVEN_API } from '../../src/services/seveneleven/api.js';
import { RelayError, type HttpRelayOptions } from './http-relay.js';
export interface SevenPublicSession {
  cookie: string;
  userAgent: string;
  expiresAt: number;
}
const origin = SEVENELEVEN_API.BASE_URL;
const paths = new Set([
  ...Object.values(SEVENELEVEN_API).filter((path) => path.startsWith('/api/')),
  `${SEVENELEVEN_API.REAL_STOCK_MULTI_PATH}/01/stocks`,
]);
export function createSevenSessionTransport(options: {
  fetcher?: typeof fetch;
  prepare: () => Promise<SevenPublicSession>;
  takeQuota: HttpRelayOptions['takeQuota'];
  onEvent?: (reason: string) => void;
}) {
  const fetcher = options.fetcher ?? fetch;
  let session: SevenPublicSession | undefined;
  let pending: Promise<void> | undefined;
  let nextPrepareAt = 0;
  const emit = (reason: string) => {
    try {
      options.onEvent?.(reason);
    } catch {
      /* 관측 실패는 세션을 폐기하지 않습니다. */
    }
  };
  const prepare = () => {
    if (pending) return pending;
    nextPrepareAt = Date.now() + 60000;
    pending = (async () => {
      try {
        const value = await options.prepare();
        if (
          !value.cookie ||
          value.cookie.length > 16384 ||
          /[\r\n\0]/.test(value.cookie) ||
          !value.userAgent ||
          value.userAgent.length > 512 ||
          /[\r\n\0]/.test(value.userAgent) ||
          !Number.isFinite(value.expiresAt) ||
          value.expiresAt <= Date.now()
        )
          throw new Error('Invalid public session');
        session = { ...value, expiresAt: Math.min(value.expiresAt, Date.now() + 30 * 60000) };
        emit('session-ready');
      } catch {
        session = undefined;
        emit('session-unavailable');
      }
    })().finally(() => {
      pending = undefined;
    });
    return pending;
  };
  const run: typeof fetch = async (input, init) => {
    // 내부 HTTP 중계는 URL만 전달합니다. 재사용 불가능한 Request 스트림은 수정하지 않습니다.
    if (input instanceof Request) return fetcher(input, init);
    const url = new URL(input);
    if (url.origin !== origin || !paths.has(url.pathname)) return fetcher(input, init);
    init?.signal?.throwIfAborted();
    if (session && session.expiresAt <= Date.now()) session = undefined;
    const withSession = () => {
      const headers = new Headers(init?.headers);
      if (session) {
        headers.set('Cookie', session.cookie);
        headers.set('User-Agent', session.userAgent);
      }
      return { ...init, headers };
    };
    const response = await fetcher(input, withSession());
    if (response.status !== 403) return response;
    if (!pending && Date.now() < nextPrepareAt) return response;
    await response.body?.cancel();
    await prepare();
    init?.signal?.throwIfAborted();
    if (!session) return response;
    if (!(await options.takeQuota())) {
      const quota = options.takeQuota.status?.();
      throw new RelayError(
        429,
        undefined,
        quota?.blockedBy === 'minute' || quota?.blockedBy === 'daily'
          ? { quotaReason: quota.blockedBy, retryAfter: quota.retryAfter }
          : undefined,
      );
    }
    // 준비가 성공해도 원본 API 재시도는 정확히 한 번만 수행합니다.
    return fetcher(input, withSession());
  };
  return {
    fetch: run,
    status: () => ({
      state: pending
        ? 'preparing'
        : session && session.expiresAt > Date.now()
          ? 'ready'
          : Date.now() < nextPrepareAt
            ? 'retry_wait'
            : 'idle',
      expiresAt: session?.expiresAt ?? 0,
      retryAt: nextPrepareAt,
    }),
  };
}
