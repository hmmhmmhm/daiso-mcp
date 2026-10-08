/** CGV 직접 경로와 주기 검사의 고정 요청 규격입니다. */
import * as z from 'zod';
import { CGV_API } from './api.js';
import { createCgvHeaders } from './transport.js';
import { isCgvResponse } from './relayTransport.js';
import { toYyyymmdd } from '../../utils/format.js';
import type { DirectRouteSpec } from '../../utils/directRouteSpecs.js';
const day = z
  .string()
  .regex(/^\d{8}$/)
  .refine((value) => {
    const date = `${value.slice(0, 4)}-${value.slice(4, 6)}-${value.slice(6, 8)}`;
    const time = Date.parse(`${date}T00:00:00Z`);
    return Number.isFinite(time) && new Date(time).toISOString().slice(0, 10) === date;
  });
const schemas = {
  theaters: z.object({}).strict(),
  movies: z.object({ theaterCode: z.string().regex(/^\d{4}$/), playDate: day }).strict(),
  timetable: z.object({ theaterCode: z.string().regex(/^\d{4}$/), playDate: day }).strict(),
  'timetable-movie': z
    .object({
      theaterCode: z.string().regex(/^\d{4}$/),
      playDate: day,
      movieCode: z.string().regex(/^\d{1,16}$/),
    })
    .strict(),
};
const paths = {
  theaters: CGV_API.THEATER_LIST_PATH,
  movies: CGV_API.MOVIE_LIST_PATH,
  timetable: CGV_API.TIMETABLE_BY_SITE_PATH,
  'timetable-movie': CGV_API.TIMETABLE_PATH,
};
export const cgvDirectRouteSpecs: Record<string, DirectRouteSpec> = Object.fromEntries(
  Object.entries(paths).map(([operation, path]) => [
    `cgv-${operation}`,
    {
      response: z.custom(isCgvResponse),
      probe: () =>
        operation === 'theaters'
          ? {}
          : {
              theaterCode: '0056',
              playDate: toYyyymmdd(),
              ...(operation === 'timetable-movie' ? { movieCode: '20000000' } : {}),
            },
      async build(input: unknown) {
        const body = schemas[operation as keyof typeof schemas].parse(input) as Record<
          string,
          string
        >;
        const url = new URL(path, CGV_API.BASE_URL);
        url.searchParams.set('coCd', CGV_API.COMPANY_CODE);
        if (operation !== 'theaters') {
          url.searchParams.set('siteNo', body.theaterCode);
          url.searchParams.set('scnYmd', body.playDate);
        }
        if (operation === 'timetable')
          url.searchParams.set('rtctlScopCd', CGV_API.TIMETABLE_SITE_SCOPE_CODE);
        if (operation === 'timetable-movie') {
          url.searchParams.set('movNo', body.movieCode);
          url.searchParams.set('rtctlScopCd', CGV_API.TIMETABLE_SCOPE_CODE);
        }
        return { url, init: { method: 'GET', headers: await createCgvHeaders(path) } };
      },
    },
  ]),
);
