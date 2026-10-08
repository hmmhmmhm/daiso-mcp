/** 고정 CGV 공개 조회만 허용하는 무료 HTTP 중계입니다. */
import { CGV_API } from '../../src/services/cgv/api.js';
import { createCgvHeaders } from '../../src/services/cgv/transport.js';
import { isCgvResponse } from '../../src/services/cgv/relayTransport.js';
import {
  createHttpRelay,
  RelayError,
  abortable,
  readJson,
  type HttpRelayOptions,
} from './http-relay.js';
const paths = {
  theaters: CGV_API.THEATER_LIST_PATH,
  movies: CGV_API.MOVIE_LIST_PATH,
  timetable: CGV_API.TIMETABLE_BY_SITE_PATH,
  'timetable-movie': CGV_API.TIMETABLE_PATH,
};
type Operation = keyof typeof paths;
function validate(value: unknown, operation: string): Record<string, string> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new RelayError(400);
  const p = value as Record<string, unknown>;
  const keys =
    operation === 'theaters'
      ? []
      : operation === 'timetable-movie'
        ? ['theaterCode', 'playDate', 'movieCode']
        : ['theaterCode', 'playDate'];
  if (Object.keys(p).length !== keys.length || !Object.keys(p).every((key) => keys.includes(key)))
    throw new RelayError(400);
  if (operation !== 'theaters') {
    if (
      typeof p.theaterCode !== 'string' ||
      !/^\d{4}$/.test(p.theaterCode) ||
      typeof p.playDate !== 'string' ||
      !/^\d{8}$/.test(p.playDate)
    )
      throw new RelayError(400);
    const date = `${p.playDate.slice(0, 4)}-${p.playDate.slice(4, 6)}-${p.playDate.slice(6, 8)}`;
    const time = Date.parse(`${date}T00:00:00Z`);
    if (!Number.isFinite(time) || new Date(time).toISOString().slice(0, 10) !== date)
      throw new RelayError(400);
  }
  if (
    operation === 'timetable-movie' &&
    (typeof p.movieCode !== 'string' || !/^\d{1,16}$/.test(p.movieCode))
  )
    throw new RelayError(400);
  return p as Record<string, string>;
}
export function createCgvRelay(
  token: string,
  options: Pick<HttpRelayOptions, 'takeQuota' | 'fetcher' | 'onEvent'>,
) {
  return createHttpRelay(token, {
    ...options,
    prefix: '/v1/cgv/',
    operations: Object.keys(paths),
    validate,
    async upstream(operation, value, signal, fetcher) {
      const params = value as Record<string, string>;
      const path = paths[operation as Operation];
      const url = new URL(path, CGV_API.BASE_URL);
      url.searchParams.set('coCd', CGV_API.COMPANY_CODE);
      if (operation !== 'theaters') {
        url.searchParams.set('siteNo', params.theaterCode);
        url.searchParams.set('scnYmd', params.playDate);
      }
      if (operation === 'timetable')
        url.searchParams.set('rtctlScopCd', CGV_API.TIMETABLE_SITE_SCOPE_CODE);
      if (operation === 'timetable-movie') {
        url.searchParams.set('movNo', params.movieCode);
        url.searchParams.set('rtctlScopCd', CGV_API.TIMETABLE_SCOPE_CODE);
      }
      const response = await abortable(
        fetcher(url, {
          method: 'GET',
          redirect: 'manual',
          headers: await createCgvHeaders(path),
          signal,
        }),
        signal,
      );
      if (response.status !== 200) {
        void response.body?.cancel().catch(() => undefined);
        throw new RelayError(502);
      }
      const data = await readJson(response.body, 2 * 1024 * 1024, signal, 502);
      if (!isCgvResponse(data)) throw new RelayError(502);
      return data;
    },
  });
}
