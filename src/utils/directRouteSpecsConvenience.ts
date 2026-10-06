/** 편의점 고정 경로와 요청·응답 구조를 검증합니다. */
import * as z from 'zod';
import {
  cuStockRow,
  cuStoreRow,
  sevenProductRow,
  sevenStoreRow,
  gsProductRow,
} from './directRouteSpecsRows.js';
import { CU_API } from '../services/cu/api.js';
import { GS25_API } from '../services/gs25/api.js';
import { SEVENELEVEN_API } from '../services/seveneleven/api.js';
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
export const successSchema = z
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
export const convenienceInputs = {
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
  'seven-goods': z.union([
    z
      .object({
        collection: z.literal('goods'),
        query: text.min(1),
        sort: z.literal('quantity/desc,itemOnm/asc'),
        startCount: count,
        listCount: count.min(1),
      })
      .strict(),
    z.object({ query: text.min(1), pageNo: count, pageSize: count.min(1) }).strict(),
  ]),
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
  'gs25-stock': z.object({}).strict(),
};
type Operation = keyof typeof convenienceInputs;
const searchData = (row: z.ZodType) =>
  z.union([
    z
      .object({
        SearchQueryResult: z
          .object({
            Collection: z.array(
              z
                .object({ Documentset: z.object({ Document: z.array(row) }).passthrough() })
                .passthrough(),
            ),
          })
          .passthrough(),
      })
      .passthrough(),
    z.object({ content: z.array(row) }).passthrough(),
  ]);
const catalogData = (row: z.ZodType) =>
  z.union([
    z.array(row),
    z.object({ content: z.array(row) }).passthrough(),
    z.object({ list: z.array(row) }).passthrough(),
  ]);
const popwordData = z.union([
  z.array(z.union([z.string(), z.object({}).passthrough()])),
  z.object({ keywords: z.array(z.unknown()) }).passthrough(),
  z.object({ popwords: z.array(z.unknown()) }).passthrough(),
  z.object({ wordList: z.array(z.unknown()) }).passthrough(),
  z.object({ list: z.array(z.unknown()) }).passthrough(),
]);
const withData = (schema: z.ZodType) => envelope.and(z.object({ data: schema }));
export const conveniencePaths: Record<Operation, [string, string, 'GET' | 'POST', z.ZodType]> = {
  'cu-prime': [
    CU_API.BASE_URL,
    CU_API.STOCK_DISPLAY_PATH,
    'POST',
    z
      .object({
        resp_cd: z.literal('0000').optional(),
        areaCateList: z.array(
          z.object({ menuCd: z.string().min(1), menuNm: z.string().min(1) }).passthrough(),
        ),
      })
      .passthrough(),
  ],
  'cu-stock': [
    CU_API.BASE_URL,
    CU_API.STOCK_MAIN_PATH,
    'POST',
    z
      .object({
        data: z
          .object({
            stockResult: z
              .object({ result: z.object({ rows: z.array(cuStockRow) }).passthrough() })
              .passthrough(),
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
      .object({ storeList: z.array(cuStoreRow) })
      .passthrough()
      .refine((v) => v.resp_cd === undefined || v.resp_cd === '0000'),
  ],
  'seven-goods': [
    SEVENELEVEN_API.BASE_URL,
    SEVENELEVEN_API.SEARCH_GOODS_PATH,
    'POST',
    withData(searchData(sevenProductRow)),
  ],
  'seven-store': [
    SEVENELEVEN_API.BASE_URL,
    SEVENELEVEN_API.SEARCH_STORE_PATH,
    'POST',
    withData(searchData(sevenStoreRow)),
  ],
  'seven-popwords': [
    SEVENELEVEN_API.BASE_URL,
    SEVENELEVEN_API.SEARCH_POPWORD_PATH,
    'POST',
    z.union([
      withData(popwordData),
      z
        .object({ success: z.literal(true), code: z.literal(200), data: z.object({}).strict() })
        .passthrough(),
    ]),
  ],
  'seven-stock-meta': [
    SEVENELEVEN_API.BASE_URL,
    SEVENELEVEN_API.PRODUCT_SEARCH_STOCK_PATH,
    'GET',
    z
      .object({
        itemCd: code.min(1),
        smCd: code.min(1),
        stokMngCd: code.min(1),
        stokMngQty: quantity,
        stockApplicationRate: z.union([z.string(), z.number()]),
      })
      .passthrough(),
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
  'seven-pages': [
    SEVENELEVEN_API.BASE_URL,
    SEVENELEVEN_API.PRODUCT_PAGES_PATH,
    'GET',
    withData(catalogData(sevenProductRow)),
  ],
  'seven-issues': [
    SEVENELEVEN_API.BASE_URL,
    SEVENELEVEN_API.PRODUCT_ISSUES_PATH,
    'GET',
    withData(catalogData(sevenProductRow)),
  ],
  'seven-exhibitions': [
    SEVENELEVEN_API.BASE_URL,
    SEVENELEVEN_API.EXHIBITION_MAIN_PATH,
    'GET',
    withData(catalogData(z.object({}).passthrough())),
  ],
  'gs25-products': [
    GS25_API.APIGW_BASE_URL,
    GS25_API.TOTAL_SEARCH_PATH,
    'POST',
    z
      .object({
        SearchQueryResult: z
          .object({
            Collection: z.array(
              z
                .object({
                  Documentset: z.object({ Document: z.array(gsProductRow) }).passthrough(),
                })
                .passthrough(),
            ),
          })
          .passthrough(),
      })
      .passthrough(),
  ],
  'gs25-stock': [
    GS25_API.BFF_BASE_URL,
    GS25_API.STORE_STOCK_PATH,
    'GET',
    z.object({ stores: rows }).passthrough(),
  ],
};
