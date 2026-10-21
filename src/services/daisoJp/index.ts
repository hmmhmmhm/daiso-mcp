/** 일본 다이소 상품·매장 조회 도구. 매장 재고는 지원하지 않습니다. */
import * as z from 'zod';
import type { ServiceProvider } from '../../core/interfaces.js';
import type { ToolRegistration } from '../../core/types.js';
import type { JapanTransportOptions } from './productRelay.js';
import { searchProducts, getProduct, findStores } from './client.js';

export const jpQuery = z.string().trim().min(1).max(100);
export const jpPage = z.number().int().min(1).max(100).default(1);
export const jpProductId = z.string().regex(/^\d{13}$/);
const schemas = {
  search: z.object({ query: jpQuery, page: jpPage }),
  product: z.object({ id: jpProductId }),
  stores: z.object({ keyword: jpQuery, page: jpPage }),
};

const productOutput = z.object({
  country: z.literal('JP'),
  id: z.string(),
  name: z.string(),
  price: z.number().nullable(),
  currency: z.literal('JPY'),
  url: z.string(),
  imageUrl: z.string().optional(),
  onlineAvailable: z.boolean().nullable().describe('온라인 판매 가능 여부. 매장 재고가 아닙니다.'),
  storeInventorySupported: z.literal(false),
  note: z.string().optional().describe('대체 조회와 확인하지 못한 항목 안내'),
});
const pageOutput = {
  country: z.literal('JP'),
  page: z.number(),
  hasNext: z.boolean(),
  note: z.string(),
};
const storeOutput = z.object({
  id: z.string(),
  name: z.string(),
  address: z.string(),
  hours: z.string(),
  url: z.string(),
  latitude: z.number().nullable(),
  longitude: z.number().nullable(),
  brand: z.string(),
});

export function createDaisoJpService(options: JapanTransportOptions = {}): ServiceProvider {
  const tools: ToolRegistration[] = [
    {
      name: 'daiso_jp_search_products',
      metadata: {
        title: '일본 다이소 상품 검색',
        description:
          '일본어 키워드 또는 JAN 코드로 일본 다이소 온라인몰을 검색합니다. 가격은 엔화(JPY)이며 매장 재고를 뜻하지 않습니다.',
        inputSchema: schemas.search.shape,
        outputSchema: {
          ...pageOutput,
          currency: z.literal('JPY'),
          query: z.string(),
          products: z.array(productOutput),
        },
      },
      handler: async (args) => {
        const { query, page } = schemas.search.parse(args);
        const result = await searchProducts(query, page);
        return {
          content: [{ type: 'text', text: JSON.stringify(result) }],
          structuredContent: { ...result },
        };
      },
    },
    {
      name: 'daiso_jp_get_product',
      metadata: {
        title: '일본 다이소 상품 상세',
        description:
          '일본 다이소 검색 결과의 13자리 상품 ID로 엔화 가격과 온라인 판매 가능 여부를 조회합니다. 상세 원본 차단 시 공식 상품 코드 검색 결과로 대체하며 온라인 판매 가능 여부는 null입니다. 오프라인 매장 재고나 수량은 제공하지 않습니다.',
        inputSchema: schemas.product.shape,
        outputSchema: productOutput.shape,
      },
      handler: async (args) => {
        const { id } = schemas.product.parse(args);
        const product = await getProduct(id, options);
        const result = { ...product };
        return {
          content: [{ type: 'text', text: JSON.stringify(result) }],
          structuredContent: { ...result },
        };
      },
    },
    {
      name: 'daiso_jp_find_stores',
      metadata: {
        title: '일본 다이소 매장 검색',
        description:
          '일본어 지역명·매장명으로 일본 다이소 공식 매장 검색 결과를 조회합니다. 계열 브랜드는 brand로 구분하며 한국 주소검색을 사용하지 않습니다. 매장 재고는 지원하지 않습니다.',
        inputSchema: schemas.stores.shape,
        outputSchema: { ...pageOutput, keyword: z.string(), stores: z.array(storeOutput) },
      },
      handler: async (args) => {
        const { keyword, page } = schemas.stores.parse(args);
        const result = await findStores(keyword, page);
        return {
          content: [{ type: 'text', text: JSON.stringify(result) }],
          structuredContent: { ...result },
        };
      },
    },
  ];
  return {
    metadata: {
      id: 'daiso_jp',
      name: '일본 다이소',
      version: '1.0.0',
      description: '일본 다이소 온라인 상품·엔화 가격·매장 검색. 매장 재고 미지원.',
    },
    getTools: () => tools,
  };
}
