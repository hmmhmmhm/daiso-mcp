/** 원본 행의 식별자와 수치 형식을 검사해 누락값을 실제 0으로 해석하지 않습니다. */
import * as z from 'zod';
const id = z.string().min(1);
const count = z.number().int().min(0);
export const numeric = z.union([z.number().min(0), z.string().regex(/^\d+(\.\d+)?$/)]);
const stock = z.union([z.number().int().min(-1), z.string().regex(/^(?:-1|\d+)$/)]).nullable();
const yesNo = z.enum(['Y', 'N']);
const reviewNumber = z.union([numeric, z.literal('')]);
export const oyStoreRow = z
  .object({
    storeCode: id,
    storeName: id,
    address: z.string().optional(),
    latitude: z.number().min(-90).max(90).optional(),
    longitude: z.number().min(-180).max(180).optional(),
    distance: z.number().min(0).optional(),
    pickupYn: z.boolean().optional(),
    openYn: z.boolean().optional(),
    salesStoreYn: z.boolean().optional(),
    remainQuantity: count.nullable().optional(),
    o2oRemainQuantity: count.nullable().optional(),
  })
  .passthrough();
export const oyStockRow = oyStoreRow.extend({ salesStoreYn: z.boolean() });
export const oyProductRow = z
  .object({
    goodsNumber: id,
    goodsName: id,
    priceToPay: z.number().min(0),
    originalPrice: z.number().min(0),
    discountRate: z.number().min(0).max(100),
    o2oStockFlag: z.boolean(),
    o2oRemainQuantity: count,
    imagePath: z.string().nullable().optional(),
  })
  .passthrough();
export const cuStockRow = z
  .object({
    fields: z
      .object({
        item_cd: id,
        item_nm: id,
        hyun_maega: numeric,
        on_item_no: z.string().optional(),
        pickup_yn: yesNo.optional(),
        deliv_yn: yesNo.optional(),
        reserv_yn: yesNo.optional(),
      })
      .passthrough(),
  })
  .passthrough();
export const cuStoreRow = z
  .object({
    storeCd: id,
    storeNm: id,
    latVal: numeric.optional(),
    longVal: numeric.optional(),
    distance: numeric.optional(),
    stock: stock.optional(),
    deliveryYn: yesNo.optional(),
    deliveryPickYn: yesNo.optional(),
    jumpoPickYn: yesNo.optional(),
    reserveYn: yesNo.optional(),
  })
  .passthrough();
const sevenProduct = z
  .object({
    itemCd: id,
    itemOnm: id,
    onlinePrice: numeric.optional(),
    onlineCost: numeric.optional(),
    avgEvalScore: reviewNumber.optional(),
    productReviewCnt: reviewNumber.optional(),
  })
  .passthrough();
export const sevenProductRow = z.union([
  z.object({ field: sevenProduct }).passthrough(),
  sevenProduct,
]);
const sevenStore = z.union([
  z.object({ storeCode: id, storeName: id }).passthrough(),
  z.object({ storeCd: id, storeNm: id }).passthrough(),
  z.object({ strCd: id, strNm: id }).passthrough(),
  z.object({ storCd: id, storNm: id }).passthrough(),
  z.object({ shopCd: id, shopNm: id }).passthrough(),
]);
export const sevenStoreRow = z.union([z.object({ field: sevenStore }).passthrough(), sevenStore]);
export const gsProductRow = z
  .object({
    field: z
      .object({
        itemCode: id,
        itemName: id,
        shortItemName: z.string().optional(),
        starPoint: reviewNumber.optional(),
        stockCheckYn: yesNo.optional(),
      })
      .passthrough(),
  })
  .passthrough();
export const dtMovieRow = z
  .object({ MovieCd: id, MovieNm: id, RunningTime: numeric.optional() })
  .passthrough();
export const dtDateRow = z
  .object({
    PlaySDT: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    HiddenYn: yesNo.optional(),
    RestYn: yesNo.optional(),
  })
  .passthrough();
export const dtTimetableRow = dtMovieRow.extend({
  CinemaCd: id,
  ScreenCd: id,
  PlaySDT: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
  ShowSeq: z.union([id, count]).optional(),
  StartTime: z
    .string()
    .regex(/^\d{2}:?\d{2}$/)
    .optional(),
  EndTime: z
    .string()
    .regex(/^\d{2}:?\d{2}$/)
    .optional(),
  TotalSeatCnt: stock.optional(),
  RemainSeatCnt: stock.optional(),
});
