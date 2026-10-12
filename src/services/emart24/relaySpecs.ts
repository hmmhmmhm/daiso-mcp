/** 기존 공식 경로·헤더·폼 인코딩을 직접 조회와 HTTP 중계에서 공유합니다. */
import * as z from 'zod';
import { EMART24_API as API } from './api.js';
import type { DirectRouteSpec } from '../../utils/directRouteSpecs.js';
const text = z
  .string()
  .max(200)
  .regex(/^[^\p{Cc}]*$/u);
const code = z.string().min(1).max(64).regex(/^\d+$/);
const page = z.string().regex(/^[1-9]\d{0,3}$/);
const quantity = z.union([
  z.number().int().min(-1).max(Number.MAX_SAFE_INTEGER),
  z.string().regex(/^(?:-1|\d{1,9}|)$/),
  z.null(),
]);
const scalar = z.union([z.number().finite(), z.string()]);
const productRow = z
  .object({
    pluCd: code,
    goodsNm: z.string().min(1),
    originPrice: scalar.optional(),
    viewPrice: scalar.optional(),
  })
  .passthrough();
const storeRow = z.object({ CODE: code, TITLE: z.string().min(1) }).passthrough();
const noError = z
  .object({ error: z.never().optional(), success: z.literal(true).optional() })
  .passthrough();
const storesInput = z
  .object({
    page,
    search: text.optional(),
    AREA1: text.optional(),
    AREA2: text.optional(),
    SVR_24: z.literal('1').optional(),
  })
  .strict();
const productsInput = z
  .object({
    currentPage: page,
    pageCnt: page,
    sortType: z.enum(['SALE', 'LATEST', 'PRICE_ASC', 'PRICE_DESC']),
    saleProductYn: z.enum(['Y', 'N']),
    searchWord: text.min(1),
  })
  .strict();
const stockInput = z
  .object({
    searchPluCode: code,
    bizNoArr: z
      .string()
      .max(1800)
      .regex(/^\d+(,\d+){0,199}$/),
  })
  .strict();
const detailInput = z.object({ bizNo: code }).strict();
export const EMART24_JSON_HEADERS = {
  Accept: 'application/json, text/javascript, */*; q=0.01',
  'X-Requested-With': 'XMLHttpRequest',
} as const;
export const EMART24_FORM_HEADERS = {
  'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
  ...EMART24_JSON_HEADERS,
} as const;
const storesResponse = z.union([
  z
    .object({
      error: z.literal(0).optional(),
      count: scalar,
      data: z.array(storeRow),
      success: z.literal(true).optional(),
    })
    .passthrough(),
  z
    .object({
      error: z.literal(1),
      data: z.array(z.never()).optional(),
      success: z.literal(true).optional(),
    })
    .passthrough(),
]);
function get(path: string, base: string, input: z.ZodType, body: unknown) {
  const parsed = input.parse(body) as Record<string, string>;
  const url = new URL(path, base);
  url.search = new URLSearchParams(parsed).toString();
  return { url, init: { method: 'GET', headers: EMART24_JSON_HEADERS } };
}
export const emart24DirectRouteSpecs = {
  'emart24-stores': {
    input: storesInput,
    probe: () => ({ page: '1', search: '강남' }),
    response: storesResponse,
    build: (body: unknown) => get(API.STORE_PATH, API.WEB_BASE_URL, storesInput, body),
  },
  'emart24-products': {
    input: productsInput,
    probe: () => ({
      currentPage: '1',
      pageCnt: '1',
      sortType: 'SALE',
      saleProductYn: 'N',
      searchWord: '커피',
    }),
    response: noError.and(
      z.object({ totalCnt: scalar, productList: z.array(productRow) }).passthrough(),
    ),
    build(body: unknown) {
      return {
        url: new URL(API.PRODUCT_SEARCH_PATH, API.EVERSE_BASE_URL),
        init: {
          method: 'POST',
          headers: EMART24_FORM_HEADERS,
          body: new URLSearchParams(productsInput.parse(body)).toString(),
        },
      };
    },
  },
  'emart24-stock': {
    input: stockInput,
    probe: () => ({ searchPluCode: '8801115139836', bizNoArr: '00940' }),
    response: noError.and(
      z
        .object({
          storeGoodsInfo: z.object({ pluCd: code }).passthrough(),
          storeGoodsQty: z
            .array(z.object({ BIZNO: code, BIZQTY: quantity.optional() }).passthrough())
            .nullable(),
        })
        .passthrough(),
    ),
    build: (body: unknown) =>
      get(API.STOCK_SEARCH_STORE_PATH, API.EVERSE_BASE_URL, stockInput, body),
  },
  'emart24-store-detail': {
    input: detailInput,
    probe: () => ({ bizNo: '00940' }),
    response: noError.and(
      z.object({ storeInfo: z.object({ storeNm: z.string().min(1) }).passthrough() }).passthrough(),
    ),
    build(body: unknown) {
      const { bizNo } = detailInput.parse(body);
      return {
        url: new URL(
          `${API.STORE_DETAIL_PATH_PREFIX}${encodeURIComponent(bizNo)}`,
          API.EVERSE_BASE_URL,
        ),
        init: { method: 'GET', headers: EMART24_JSON_HEADERS },
      };
    },
  },
} satisfies Record<string, DirectRouteSpec & { input: z.ZodType }>;
export type Emart24Operation = keyof typeof emart24DirectRouteSpecs;
export function isEmart24Operation(operation: string): operation is Emart24Operation {
  return Object.hasOwn(emart24DirectRouteSpecs, operation);
}
