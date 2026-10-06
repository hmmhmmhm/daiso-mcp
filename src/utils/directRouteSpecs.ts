/** 직접 조회와 주기 검사에서 같은 고정 경로·검증기를 사용합니다. */
import * as z from 'zod';
import type { RouteKey } from './routeHealth.js';
import { OLIVEYOUNG_API as OY } from '../services/oliveyoung/api.js';
import { DTRYX_API as DT } from '../services/dtryx/api.js';
import {
  convenienceInputs,
  conveniencePaths,
  successSchema,
} from './directRouteSpecsConvenience.js';

export interface DirectRouteSpec {
  build(body: unknown): { url: URL; init: RequestInit };
  response: z.ZodType;
  probe: () => unknown;
}
const obj = z.object({}).passthrough();
import {
  oyStoreRow,
  oyStockRow,
  oyProductRow,
  dtMovieRow,
  dtDateRow,
  dtTimetableRow,
} from './directRouteSpecsRows.js';
const jsonHeaders = { Accept: 'application/json', 'Content-Type': 'application/json' };
const oyHeaders = {
  ...jsonHeaders,
  'X-Requested-With': 'XMLHttpRequest',
  'User-Agent':
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/153.0.0.0 Safari/537.36',
  Origin: OY.BASE_URL,
  Referer: `${OY.BASE_URL}/`,
  'Accept-Language': 'ko-KR,ko;q=0.9',
};
const coordinates = {
  lat: 37.5635,
  lon: 126.9839,
  mapLat: 37.5635,
  mapLon: 126.9839,
  pageIdx: 1,
  searchWords: 'DF23',
};
const oyPayloads = {
  'oy-find-store': { ...coordinates, pogKeys: '', serviceKeys: '' },
  'oy-product-search': { keyword: '립밤', page: 1, size: 10, sort: '01', includeSoldOut: true },
  'oy-goods-info': { goodsNo: 'A000000165760' },
  'oy-stock-stores': { ...coordinates, productId: '8800362322138' },
};
const oySchemas = {
  'oy-find-store': z.object({ storeList: z.array(oyStoreRow) }).passthrough(),
  'oy-product-search': z.union([
    z.object({ searchList: z.array(oyProductRow) }).passthrough(),
    z.object({ serachList: z.array(oyProductRow) }).passthrough(),
  ]),
  'oy-goods-info': z
    .object({ goodsInfo: z.object({ masterGoodsNumber: z.string().min(1) }).passthrough() })
    .passthrough(),
  'oy-stock-stores': z.object({ storeList: z.array(oyStockRow) }).passthrough(),
};
const oyPaths = [
  OY.STORE_FINDER_PATH,
  OY.PRODUCT_SEARCH_PATH,
  OY.STOCK_GOODS_INFO_PATH,
  OY.STOCK_STORES_PATH,
];
const convenienceFixtures: Record<string, unknown> = {
  'cu-prime': {},
  'cu-stock': {
    searchWord: '레쓰비',
    prevSearchWord: '',
    spellModifyUseYn: 'Y',
    offset: 0,
    limit: 10,
    searchSort: 'recom',
  },
  'cu-store': {
    latVal: '37.5635',
    longVal: '126.9839',
    baseLatVal: '37.5635',
    baseLongVal: '126.9839',
    tabId: '2',
    filterSvcList: [],
    filterAdtList: [],
    stockCdcYn: 'N',
    searchStock: false,
    pickupType: 'change',
    getRoute: 'IOS',
    areaTplNo: '0',
    childMealPickUpYn: 'N',
    isCurrentSearch: 'N',
    pageType: 'search_improve',
    searchWord: '강남',
    isRecommend: '',
    recommendId: '',
    jipCd: '',
    itemCd: '',
    item_cd: '',
    onItemNo: '',
  },
  'seven-goods': {
    collection: 'goods',
    query: '코카콜라',
    sort: 'quantity/desc,itemOnm/asc',
    startCount: 0,
    listCount: 10,
  },
  'seven-store': { collection: 'store', query: '강남', sort: 'Date/desc', listCount: 10 },
  'seven-popwords': { label: 'home' },
  'seven-stock-meta': { itemCd: '8801056018979' },
  'seven-stock': {
    smCd: '161260',
    stokMngCd: '161260',
    stokMngQty: 1,
    stockApplicationRate: '100',
    storeList: ['64676'],
  },
  'gs25-products': { query: '코카콜라' },
};
// 클라이언트 모듈을 가져오면 전송 모듈과 순환하므로 고정 공개 헤더만 둡니다.
const cuHeaders = {
  ...jsonHeaders,
  Accept: 'application/json, text/javascript, */*; q=0.01',
  'X-Requested-With': 'XMLHttpRequest',
  'User-Agent':
    'Mozilla/5.0 (Linux; Android 12) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/138.0.0.0 Mobile Safari/537.36;BGFCU',
};
const gsHeaders = {
  ...jsonHeaders,
  Accept: 'application/json, text/plain, */*',
  'Accept-Language': 'ko-KR,ko;q=0.9,en-US;q=0.8,en;q=0.7',
  'User-Agent':
    'Mozilla/5.0 (Linux; Android 15; SM-S928N) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/124.0 Mobile Safari/537.36',
  Origin: 'https://woodongs.com',
  Referer: 'https://woodongs.com/',
};
const sevenHeaders = {
  ...jsonHeaders,
  Accept: 'application/json, text/plain, */*',
  'User-Agent': 'Mozilla/5.0 (Linux; Android 15)',
};
const specs: Partial<Record<RouteKey, DirectRouteSpec>> = {};
Object.entries(oyPayloads).forEach(([key, fixture], i) => {
  specs[key as RouteKey] = {
    probe: () => fixture,
    response: z
      .object({ status: z.literal('SUCCESS'), data: oySchemas[key as keyof typeof oySchemas] })
      .passthrough(),
    build(body) {
      return {
        url: new URL(oyPaths[i], OY.BASE_URL),
        init: { method: 'POST', headers: oyHeaders, body: JSON.stringify(obj.parse(body)) },
      };
    },
  };
});
Object.entries(conveniencePaths).forEach(([key, [base, path, method, schema]]) => {
  specs[key as RouteKey] = {
    probe: () => convenienceFixtures[key] || {},
    response: successSchema.and(schema),
    build(input) {
      const body = convenienceInputs[key as keyof typeof convenienceInputs].parse(input);
      const url = new URL(path, base);
      if (method === 'GET' || key === 'seven-popwords')
        url.search = new URLSearchParams(body as Record<string, string>).toString();
      return {
        url,
        init: {
          method,
          headers: key.startsWith('cu-')
            ? cuHeaders
            : key === 'gs25-products'
              ? gsHeaders
              : sevenHeaders,
          body:
            method === 'POST' ? JSON.stringify(key === 'seven-popwords' ? {} : body) : undefined,
        },
      };
    },
  };
});
const dtryxInputs = z
  .object({
    brandCode: z.string().regex(/^[a-z][a-z0-9_-]{0,31}$/),
    cinemaCode: z.string().regex(/^\d{6}$/),
    playDate: z
      .string()
      .regex(/^\d{8}$/)
      .optional(),
  })
  .strict();
const dtOperations = {
  'dtryx-movies': 'MOVIE_NOW',
  'dtryx-play-dates': 'PLAY_DATE_LIST',
  'dtryx-timetable': 'TIMETABLE_LIST',
} as const;
Object.entries(dtOperations).forEach(([key, operation]) => {
  specs[key as RouteKey] = {
    probe: () => ({
      brandCode: 'indieart',
      cinemaCode: '000067',
      ...(operation === 'TIMETABLE_LIST'
        ? { playDate: new Date().toISOString().slice(0, 10).replaceAll('-', '') }
        : {}),
    }),
    response: z
      .object({
        RetCode: z.literal('success'),
        Recordset: z.array(
          operation === 'MOVIE_NOW'
            ? dtMovieRow
            : operation === 'PLAY_DATE_LIST'
              ? dtDateRow
              : dtTimetableRow,
        ),
      })
      .passthrough(),
    build(input) {
      const body = dtryxInputs.parse(input);
      const url = new URL(`${DT.THIRDPARTY_PATH}/${DT.ENDPOINTS[operation]}`, DT.BASE_URL);
      url.search = new URLSearchParams({
        ChannelCd: DT.CHANNEL_CODE,
        EngVerYn: 'N',
        WorkGuID: DT.WORK_GUIDS[operation],
        BrandCd: body.brandCode,
        CinemaCd: body.cinemaCode,
      }).toString();
      if (operation === 'TIMETABLE_LIST') {
        if (!body.playDate) throw new Error('invalid-input');
        url.searchParams.set(
          'PlaySDT',
          `${body.playDate.slice(0, 4)}-${body.playDate.slice(4, 6)}-${body.playDate.slice(6, 8)}`,
        );
      }
      url.searchParams.set(
        operation === 'PLAY_DATE_LIST' ? 'MovieCd' : 'ImgSize',
        operation === 'PLAY_DATE_LIST' ? '' : 'small',
      );
      return { url, init: { method: 'GET', headers: { Accept: 'application/json' } } };
    },
  };
});
export const directRouteSpecs = specs as Record<RouteKey, DirectRouteSpec>;
