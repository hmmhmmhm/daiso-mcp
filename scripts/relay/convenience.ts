import { CU_DEFAULT_HEADERS } from '../../src/services/cu/client.js';
import { GS25_DEFAULT_HEADERS } from '../../src/services/gs25/client.js';
import { GS25_TOTAL_SEARCH_HEADERS } from '../../src/services/gs25/productSearch.js';
/** 편의점 공식 API의 고정 작업만 중계합니다. */
import * as z from 'zod';
import { CU_API } from '../../src/services/cu/api.js';
import { SEVENELEVEN_API } from '../../src/services/seveneleven/api.js';
import { GS25_API } from '../../src/services/gs25/api.js';
import type { Gs25SessionTransport } from './gs25-session.js';
import {
  createHttpRelay,
  RelayError,
  abortable,
  readJson,
  type HttpRelayOptions,
} from './http-relay.js';
const text = z
  .string()
  .max(200)
  .regex(/^[^\p{Cc}]*$/u);
const code = z
  .string()
  .max(64)
  .regex(/^[A-Za-z0-9_-]*$/);
const count = z.number().int().min(0).max(9999);
const quantity = z.union([z.number().int().min(-1), z.string().regex(/^(?:-1|\d{1,9})$/)]);
const successSchema = z
  .object({ success: z.literal(true).optional(), error: z.never().optional() })
  .passthrough();
const rows = z.array(z.object({}).passthrough());
const envelope = z
  .object({ data: z.unknown(), success: z.boolean().optional(), code: z.number().optional() })
  .passthrough()
  .refine(
    (v) =>
      Object.hasOwn(v, 'data') &&
      v.success !== false &&
      (v.code === undefined || (v.code >= 200 && v.code < 300)),
  );
const schemas = {
  'cu-prime': z.object({}).strict(),
  'cu-stock': z
    .object({
      searchWord: text.min(1),
      prevSearchWord: z.literal(''),
      spellModifyUseYn: z.literal('Y'),
      offset: count,
      limit: count.min(1),
      searchSort: code.min(1),
    })
    .strict(),
  'cu-store': z
    .object({
      latVal: z.string().regex(/^-?\d+(\.\d+)?$/),
      longVal: z.string().regex(/^-?\d+(\.\d+)?$/),
      baseLatVal: z.string().regex(/^-?\d+(\.\d+)?$/),
      baseLongVal: z.string().regex(/^-?\d+(\.\d+)?$/),
      tabId: z.literal('2'),
      filterSvcList: z.array(z.never()).length(0),
      filterAdtList: z.array(z.never()).length(0),
      stockCdcYn: z.literal('N'),
      searchStock: z.literal(false),
      pickupType: z.literal('change'),
      getRoute: z.literal('IOS'),
      areaTplNo: z.literal('0'),
      childMealPickUpYn: z.literal('N'),
      isCurrentSearch: z.literal('N'),
      pageType: text,
      searchWord: text,
      isRecommend: z.enum(['', 'Y', 'N']),
      recommendId: code,
      jipCd: code,
      itemCd: code,
      item_cd: code,
      onItemNo: code,
    })
    .strict()
    .refine(
      (v) =>
        [v.latVal, v.baseLatVal].every((n) => Math.abs(Number(n)) <= 90) &&
        [v.longVal, v.baseLongVal].every((n) => Math.abs(Number(n)) <= 180),
    ),
  'seven-goods': z.object({ query: text.min(1), pageNo: count, pageSize: count.min(1) }).strict(),
  'seven-store': z
    .object({
      collection: z.literal('store'),
      query: text.min(1),
      sort: z.literal('Date/desc'),
      listCount: count.min(1),
    })
    .strict(),
  'seven-popwords': z.object({ label: code.min(1) }).strict(),
  'seven-stock-meta': z.object({ itemCd: code.min(1) }).strict(),
  'seven-stock': z
    .object({
      smCd: code.min(1),
      stokMngCd: code.min(1),
      stokMngQty: count,
      stockApplicationRate: z
        .string()
        .max(32)
        .regex(/^\d*(\.\d+)?$/),
      storeList: z.array(code.min(1)).min(1).max(200),
    })
    .strict(),
  'seven-pages': z.object({}).strict(),
  'seven-issues': z.object({}).strict(),
  'seven-exhibitions': z.object({}).strict(),
  'gs25-products': z.object({ query: text.min(1) }).strict(),
  'gs25-stock': z
    .object({
      serviceCode: z.enum(['01', '02']),
      realTimeStockYn: z.enum(['Y', 'N']),
      itemCode: code.min(1).optional(),
      keyword: text.min(1).optional(),
      storeCode: code.min(1).optional(),
      pageNumber: z
        .string()
        .regex(/^\d{1,4}$/)
        .optional(),
      pageCount: z
        .string()
        .regex(/^\d{1,4}$/)
        .optional(),
      myPositionYCoordination: z
        .string()
        .regex(/^-?\d+(\.\d+)?$/)
        .optional(),
      centerPositionYCoordination: z
        .string()
        .regex(/^-?\d+(\.\d+)?$/)
        .optional(),
      myPositionXCoordination: z
        .string()
        .regex(/^-?\d+(\.\d+)?$/)
        .optional(),
      centerPositionXCoordination: z
        .string()
        .regex(/^-?\d+(\.\d+)?$/)
        .optional(),
      radiusCondition: z.literal('1000').optional(),
      pickupStoreYn: z.literal('N').optional(),
      isSuperDlvyStoreSelected: z.literal('N').optional(),
      isGs25DlvyStoreSelected: z.literal('N').optional(),
      apiKey: z
        .string()
        .min(1)
        .max(512)
        .regex(/^[^\p{Cc}]*$/u)
        .optional(),
    })
    .strict()
    .refine(
      (v) =>
        [v.myPositionYCoordination, v.centerPositionYCoordination].every(
          (n) => n === undefined || Math.abs(Number(n)) <= 90,
        ) &&
        [v.myPositionXCoordination, v.centerPositionXCoordination].every(
          (n) => n === undefined || Math.abs(Number(n)) <= 180,
        ),
    ),
};
type Operation = keyof typeof schemas;
const paths: Record<Operation, [string, string, 'GET' | 'POST', z.ZodType]> = {
  'cu-prime': [
    CU_API.BASE_URL,
    CU_API.STOCK_DISPLAY_PATH,
    'POST',
    z
      .object({})
      .passthrough()
      .refine((v) => v.resp_cd === undefined || v.resp_cd === '0000'),
  ],
  'cu-stock': [
    CU_API.BASE_URL,
    CU_API.STOCK_MAIN_PATH,
    'POST',
    z
      .object({
        data: z
          .object({
            stockResult: z.object({ result: z.object({ rows }).passthrough() }).passthrough(),
          })
          .passthrough(),
      })
      .passthrough()
      .refine((v) => v.resp_cd === undefined || v.resp_cd === '0000'),
  ],
  'cu-store': [
    CU_API.BASE_URL,
    CU_API.STORE_PATH,
    'POST',
    z
      .object({ storeList: rows })
      .passthrough()
      .refine((v) => v.resp_cd === undefined || v.resp_cd === '0000'),
  ],
  'seven-goods': [SEVENELEVEN_API.BASE_URL, SEVENELEVEN_API.SEARCH_GOODS_PATH, 'POST', envelope],
  'seven-store': [SEVENELEVEN_API.BASE_URL, SEVENELEVEN_API.SEARCH_STORE_PATH, 'POST', envelope],
  'seven-popwords': [
    SEVENELEVEN_API.BASE_URL,
    SEVENELEVEN_API.SEARCH_POPWORD_PATH,
    'POST',
    envelope,
  ],
  'seven-stock-meta': [
    SEVENELEVEN_API.BASE_URL,
    SEVENELEVEN_API.PRODUCT_SEARCH_STOCK_PATH,
    'GET',
    z.object({ itemCd: code.min(1), smCd: code.min(1) }).passthrough(),
  ],
  'seven-stock': [
    SEVENELEVEN_API.BASE_URL,
    `${SEVENELEVEN_API.REAL_STOCK_MULTI_PATH}/01/stocks`,
    'POST',
    envelope.and(
      z.object({
        data: z
          .object({
            storeList: z.array(z.object({ storeCd: code.min(1), stock: quantity }).passthrough()),
          })
          .passthrough(),
      }),
    ),
  ],
  'seven-pages': [SEVENELEVEN_API.BASE_URL, SEVENELEVEN_API.PRODUCT_PAGES_PATH, 'GET', envelope],
  'seven-issues': [SEVENELEVEN_API.BASE_URL, SEVENELEVEN_API.PRODUCT_ISSUES_PATH, 'GET', envelope],
  'seven-exhibitions': [
    SEVENELEVEN_API.BASE_URL,
    SEVENELEVEN_API.EXHIBITION_MAIN_PATH,
    'GET',
    envelope,
  ],
  'gs25-products': [
    GS25_API.APIGW_BASE_URL,
    GS25_API.TOTAL_SEARCH_PATH,
    'POST',
    z.object({ SearchQueryResult: z.object({}).passthrough() }).passthrough(),
  ],
  'gs25-stock': [
    GS25_API.BFF_BASE_URL,
    GS25_API.STORE_STOCK_PATH,
    'GET',
    z.object({ stores: rows }).passthrough(),
  ],
};
export function createConvenienceRelay(
  token: string,
  options: Pick<HttpRelayOptions, 'takeQuota' | 'fetcher' | 'onEvent'> & { gs25ApiKey?: string; gs25Session?: Gs25SessionTransport },
) {
  return createHttpRelay(token, {
    ...options,
    cacheTtl: (operation) =>
      ['cu-store', 'seven-stock', 'gs25-stock'].includes(operation) ? 30000 : 300000,
    prefix: '/v1/convenience/',
    operations: Object.keys(paths),
    validate(value, operation) {
      const parsed = schemas[operation as Operation].safeParse(value);
      if (!parsed.success) throw new RelayError(400);
      return parsed.data;
    },
    async upstream(operation, params, signal, fetcher) {
      const [base, path, method, schema] = paths[operation as Operation];
      const url = new URL(path, base);
      const body = { ...(params as Record<string, unknown>) };
      const headers: Record<string, string> = {
        Accept: 'application/json',
        'Content-Type': 'application/json',
        'User-Agent': 'Mozilla/5.0 (Linux; Android 15)',
      };
      if (operation.startsWith('cu-')) Object.assign(headers, CU_DEFAULT_HEADERS);
      if (operation.startsWith('gs25-')) {
        Object.assign(
          headers,
          operation === 'gs25-products' ? GS25_TOTAL_SEARCH_HEADERS : GS25_DEFAULT_HEADERS,
        );
      }
      if (operation === 'gs25-stock') {
        const key = options.gs25ApiKey?.trim() || body.apiKey;
        if (!options.gs25Session && !key) throw new RelayError(403);
        if (!options.gs25Session) headers['Api-Key'] = String(key);
        delete body.apiKey;
      }
      if (method === 'GET' || operation === 'seven-popwords')
        url.search = new URLSearchParams(body as Record<string, string>).toString();
      const response = await abortable(
        (operation === 'gs25-stock' && options.gs25Session ? options.gs25Session : fetcher)(url, {
          method,
          headers,
          redirect: 'manual',
          signal,
          body:
            method === 'POST'
              ? JSON.stringify(operation === 'seven-popwords' ? {} : body)
              : undefined,
        }),
        signal,
      );
      if (response.status !== 200) {
        void response.body?.cancel().catch(() => undefined);
        throw new RelayError(
          operation === 'gs25-stock' && [401, 403].includes(response.status)
            ? response.status
            : 502,
        );
      }
      const data = await readJson(response.body, 2 * 1024 * 1024, signal, 502);
      if (
        operation === 'cu-store' &&
        body.itemCd &&
        !z
          .object({ storeList: z.array(z.object({ stock: quantity }).passthrough()) })
          .safeParse(data).success
      )
        throw new RelayError(502);
      if (
        operation === 'gs25-stock' &&
        (body.itemCode || body.keyword) &&
        !z
          .object({ stores: z.array(z.object({ realStockQuantity: quantity }).passthrough()) })
          .safeParse(data).success
      )
        throw new RelayError(502);
      if (!successSchema.and(schema).safeParse(data).success) throw new RelayError(502);
      return data;
    },
  });
}
