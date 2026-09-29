/** 고정 공개 API만 허용하는 디트릭스 전용 중계입니다. */
import { randomUUID, timingSafeEqual } from 'node:crypto';
import { DTRYX_API } from '../../src/services/dtryx/api.js';

type Route = 'timetable' | 'play-dates' | 'movies';
interface Params {
  brandCode: string;
  cinemaCode: string;
  playDate?: string;
}
interface Options {
  takeQuota: () => Promise<boolean>;
  fetcher?: typeof fetch;
  onEvent?: (event: {
    stage: string;
    operation: string;
    requestId: string;
    outcome: string;
    status: number;
    durationMs: number;
  }) => void | Promise<void>;
}
class RelayError extends Error {
  constructor(readonly status: number) {
    super('Relay failure');
  }
}
const reply = (status: number, body: unknown) =>
  Response.json(body, {
    status,
    headers: { 'Cache-Control': 'no-store' },
  });

/** 취소 신호를 무시하는 외부 처리도 기한 안에 반환합니다. */
function abortable<T>(task: Promise<T>, signal: AbortSignal): Promise<T> {
  return new Promise((resolve, reject) => {
    const abort = () => reject(new RelayError(499));
    task.then(resolve, reject).finally(() => signal.removeEventListener('abort', abort));
    if (signal.aborted) {
      reject(new RelayError(499));
      return;
    }
    signal.addEventListener('abort', abort, { once: true });
  });
}

async function readJson(
  body: ReadableStream<Uint8Array> | null,
  limit: number,
  signal: AbortSignal,
  status: number,
): Promise<unknown> {
  if (!body) throw new RelayError(status);
  const reader = body.getReader();
  const chunks: Uint8Array[] = [];
  let bytes = 0;
  try {
    while (true) {
      const { value, done } = await abortable(reader.read(), signal);
      if (done) break;
      bytes += value.byteLength;
      if (bytes > limit) throw new RelayError(status === 400 ? 413 : status);
      chunks.push(value);
    }
    return JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } catch (error) {
    if (error instanceof RelayError) throw error;
    throw new RelayError(status);
  } finally {
    void reader.cancel().catch(() => undefined);
  }
}

function validate(value: unknown, route: Route): Params {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new RelayError(400);
  const p = value as Record<string, unknown>;
  const keys =
    route === 'timetable' ? ['brandCode', 'cinemaCode', 'playDate'] : ['brandCode', 'cinemaCode'];
  if (
    Object.keys(p).length !== keys.length ||
    !Object.keys(p).every((key) => keys.includes(key)) ||
    typeof p.brandCode !== 'string' ||
    !/^[a-z][a-z0-9_-]{0,31}$/.test(p.brandCode) ||
    typeof p.cinemaCode !== 'string' ||
    !/^\d{6}$/.test(p.cinemaCode)
  )
    throw new RelayError(400);
  if (route === 'timetable') {
    if (typeof p.playDate !== 'string' || !/^\d{8}$/.test(p.playDate)) throw new RelayError(400);
    const dashed = `${p.playDate.slice(0, 4)}-${p.playDate.slice(4, 6)}-${p.playDate.slice(6, 8)}`;
    const time = Date.parse(`${dashed}T00:00:00Z`);
    if (!Number.isFinite(time) || new Date(time).toISOString().slice(0, 10) !== dashed)
      throw new RelayError(400);
  }
  return p as unknown as Params;
}

async function upstream(route: Route, p: Params, signal: AbortSignal, fetcher: typeof fetch) {
  const key =
    route === 'timetable' ? 'TIMETABLE_LIST' : route === 'movies' ? 'MOVIE_NOW' : 'PLAY_DATE_LIST';
  const url = new URL(
    `${DTRYX_API.THIRDPARTY_PATH}/${DTRYX_API.ENDPOINTS[key]}`,
    DTRYX_API.BASE_URL,
  );
  url.search = new URLSearchParams({
    ChannelCd: DTRYX_API.CHANNEL_CODE,
    EngVerYn: 'N',
    WorkGuID: DTRYX_API.WORK_GUIDS[key],
    BrandCd: p.brandCode,
    CinemaCd: p.cinemaCode,
  }).toString();
  if (route === 'timetable') {
    const date = p.playDate as string;
    url.searchParams.set('PlaySDT', `${date.slice(0, 4)}-${date.slice(4, 6)}-${date.slice(6, 8)}`);
  }
  url.searchParams.set(
    route === 'play-dates' ? 'MovieCd' : 'ImgSize',
    route === 'play-dates' ? '' : 'small',
  );
  const response = await abortable(
    fetcher(url, {
      method: 'GET',
      redirect: 'manual',
      signal,
      headers: { Accept: 'application/json' },
    }),
    signal,
  );
  if (response.status !== 200) {
    void response.body?.cancel().catch(() => undefined);
    throw new RelayError(502);
  }
  const data = await readJson(response.body, 2 * 1024 * 1024, signal, 502);
  if (
    !data ||
    typeof data !== 'object' ||
    Array.isArray(data) ||
    !('RetCode' in data) ||
    data.RetCode !== 'success' ||
    !('Recordset' in data) ||
    !Array.isArray(data.Recordset) ||
    !data.Recordset.every(
      (item) => item !== null && typeof item === 'object' && !Array.isArray(item),
    )
  ) {
    throw new RelayError(502);
  }
  return data;
}

export function createDtryxRelay(token: string, options: Options) {
  if (!token.trim()) throw new Error('DTRYX_RELAY_TOKEN is required');
  const secret = Buffer.from(`Bearer ${token}`);
  const fetcher = options.fetcher ?? fetch;
  let outstanding = 0;
  let active = 0;
  const queue: Array<() => void> = [];
  function acquire(signal: AbortSignal): Promise<void> {
    if (signal.aborted) return Promise.reject(new RelayError(499));
    if (active < 4) {
      active++;
      return Promise.resolve();
    }
    return new Promise((resolve, reject) => {
      const start = () => {
        signal.removeEventListener('abort', abort);
        active++;
        resolve();
      };
      const abort = () => {
        queue.splice(queue.indexOf(start), 1);
        reject(new RelayError(499));
      };
      signal.addEventListener('abort', abort, { once: true });
      queue.push(start);
    });
  }
  return async (request: Request): Promise<Response> => {
    const authorization = Buffer.from(request.headers.get('authorization') ?? '');
    if (authorization.length !== secret.length || !timingSafeEqual(authorization, secret))
      return reply(401, { error: 'Unauthorized' });
    const url = new URL(request.url);
    if (url.pathname === '/v1/dtryx/health' && request.method === 'GET' && !url.search)
      return reply(200, { status: 'ok', active, outstanding, queued: queue.length });
    const name = url.pathname.slice('/v1/dtryx/'.length);
    if (
      !url.pathname.startsWith('/v1/dtryx/') ||
      !['timetable', 'play-dates', 'movies'].includes(name) ||
      url.search
    )
      return reply(404, { error: 'Not found' });
    if (request.method !== 'POST') return reply(405, { error: 'Method not allowed' });
    if (outstanding >= 32) return reply(503, { error: 'Relay busy' });
    outstanding++;
    const deadline = performance.now() + 15000;
    const controller = new AbortController();
    const abort = () => controller.abort();
    request.signal.addEventListener('abort', abort, { once: true });
    if (request.signal.aborted) abort();
    let expired = false;
    const timer = setTimeout(() => {
      expired = true;
      abort();
    }, 15000);
    let acquired = false;
    let stage = 'body';
    let resultStatus = 200;
    const suppliedId = request.headers.get('x-request-id');
    const requestId =
      suppliedId && /^[A-Za-z0-9_-]{1,64}$/.test(suppliedId) ? suppliedId : randomUUID();
    try {
      const p = validate(
        await readJson(request.body, 16384, controller.signal, 400),
        name as Route,
      );
      stage = 'queue';
      await acquire(controller.signal);
      acquired = true;
      if (performance.now() >= deadline) {
        expired = true;
        abort();
      }
      controller.signal.throwIfAborted();
      stage = 'quota';
      if (
        !(await abortable(
          options.takeQuota().catch(() => {
            throw new RelayError(503);
          }),
          controller.signal,
        ))
      )
        throw new RelayError(429);
      controller.signal.throwIfAborted();
      stage = 'upstream';
      return reply(200, await upstream(name as Route, p, controller.signal, fetcher));
    } catch (error) {
      const status = expired
        ? 504
        : controller.signal.aborted
          ? 499
          : error instanceof RelayError
            ? error.status
            : 502;
      resultStatus = status;
      return reply(status, { error: 'Relay request failed' });
    } finally {
      try {
        void Promise.resolve(
          options.onEvent?.({
            stage,
            operation: name,
            requestId,
            outcome: resultStatus === 200 ? 'ok' : 'error',
            status: resultStatus,
            durationMs: performance.now() - deadline + 15000,
          }),
        ).catch(() => undefined);
      } catch {
        /* 관측 실패는 요청에 영향을 주지 않습니다. */
      }
      clearTimeout(timer);
      request.signal.removeEventListener('abort', abort);
      controller.abort();
      outstanding--;
      if (acquired) {
        active--;
        queue.shift()?.();
      }
    }
  };
}
