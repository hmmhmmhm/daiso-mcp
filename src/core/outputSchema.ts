/**
 * MCP 도구 outputSchema 생성
 */

import * as z from 'zod';
import type { ToolOutputSchema } from './types.js';

const DEFAULT_OUTPUT_SCHEMA = z.object({}).loose().describe('도구 실행 결과(JSON 객체)');

function createFallbackOutputSchema(toolName: string): ToolOutputSchema {
  if (toolName.includes('compare')) {
    return {
      keyword: z.string().optional(),
      services: z.array(z.string()).optional(),
      serviceCount: z.number().optional(),
      resultCount: z.number().optional(),
      bestPrice: z.unknown().optional(),
      results: z.array(z.unknown()).optional(),
      errors: z.array(z.unknown()).optional(),
      note: z.string().optional(),
    };
  }

  if (
    toolName.includes('search_products') ||
    toolName.includes('searchProducts') ||
    toolName.endsWith('_products')
  ) {
    return {
      keyword: z.string().optional(),
      query: z.string().optional(),
      page: z.number().optional(),
      pageSize: z.number().optional(),
      totalCount: z.number().optional(),
      count: z.number().optional(),
      products: z.array(z.unknown()).optional(),
      note: z.string().optional(),
    };
  }

  if (
    toolName.includes('find_stores') ||
    toolName.includes('nearby_stores') ||
    toolName.includes('search_stores')
  ) {
    return {
      keyword: z.string().optional(),
      searchParams: z.unknown().optional(),
      location: z.unknown().optional(),
      totalCount: z.number().optional(),
      filteredCount: z.number().optional(),
      count: z.number().optional(),
      stores: z.array(z.unknown()).optional(),
    };
  }

  if (toolName.includes('places')) {
    return {
      provider: z.string().optional(),
      searchMode: z.string().optional(),
      query: z.string().optional(),
      category: z.string().optional(),
      location: z.string().optional(),
      totalCount: z.number().optional(),
      count: z.number().optional(),
      places: z.array(z.unknown()).optional(),
    };
  }

  if (toolName.includes('inventory')) {
    return {
      productId: z.string().optional(),
      keyword: z.string().optional(),
      itemCode: z.string().nullable().optional(),
      location: z.unknown().optional(),
      product: z.unknown().optional(),
      onlineStock: z.number().optional(),
      inventory: z.unknown().optional(),
      storeInventory: z.unknown().optional(),
    };
  }

  if (toolName.includes('display_location')) {
    return {
      productId: z.string().optional(),
      storeCode: z.string().optional(),
      displayLocation: z.unknown().optional(),
      locations: z.array(z.unknown()).optional(),
    };
  }

  if (toolName.includes('price_info')) {
    return {
      productId: z.string().optional(),
      productName: z.string().optional(),
      product: z.unknown().optional(),
      price: z.number().optional(),
    };
  }

  if (toolName.includes('theater')) {
    return {
      keyword: z.string().optional(),
      location: z.unknown().optional(),
      count: z.number().optional(),
      theaters: z.array(z.unknown()).optional(),
    };
  }

  if (toolName.includes('movie') || toolName.includes('now_showing')) {
    return {
      keyword: z.string().optional(),
      playDate: z.string().optional(),
      theaterCode: z.string().optional(),
      count: z.number().optional(),
      movies: z.array(z.unknown()).optional(),
    };
  }

  if (toolName.includes('timetable') || toolName.includes('remaining_seats')) {
    return {
      playDate: z.string().optional(),
      theaterCode: z.string().optional(),
      movieCode: z.string().optional(),
      count: z.number().optional(),
      showtimes: z.array(z.unknown()).optional(),
      seats: z.array(z.unknown()).optional(),
    };
  }

  if (toolName.includes('popwords')) {
    return {
      label: z.string().optional(),
      keywords: z.array(z.string()).optional(),
      count: z.number().optional(),
    };
  }

  if (toolName.includes('catalog')) {
    return {
      pages: z.array(z.unknown()).optional(),
      issues: z.array(z.unknown()).optional(),
      exhibitions: z.array(z.unknown()).optional(),
      count: z.number().optional(),
    };
  }

  return {};
}

export function createToolOutputSchema(toolName: string, outputSchema?: ToolOutputSchema) {
  const schema = outputSchema || createFallbackOutputSchema(toolName);
  if (Object.keys(schema).length === 0) {
    return DEFAULT_OUTPUT_SCHEMA;
  }

  return z
    .object({
      ...schema,
      standard: z.unknown().optional().describe('서비스 공통 상품/매장/영화관 정규화 결과'),
    })
    .loose();
}
