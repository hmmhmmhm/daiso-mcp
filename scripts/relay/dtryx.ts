/** 고정 공개 API만 허용하는 디트릭스 전용 중계입니다. */
import { createHttpRelay, RelayError, abortable, readJson, type HttpRelayOptions } from './http-relay.js';
import { DTRYX_API } from '../../src/services/dtryx/api.js';

type Route = 'timetable' | 'play-dates' | 'movies';
interface Params {
  brandCode: string;
  cinemaCode: string;
  playDate?: string;
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

export function createDtryxRelay(token: string, options: Pick<HttpRelayOptions, 'takeQuota' | 'fetcher' | 'onEvent'>) {
  return createHttpRelay(token, {
    ...options,
    prefix: '/v1/dtryx/',
    operations: ['timetable', 'play-dates', 'movies'],
    validate: (value, operation) => validate(value, operation as Route),
    upstream: (operation, params, signal, fetcher) => upstream(operation as Route, params as Params, signal, fetcher),
  });
}
