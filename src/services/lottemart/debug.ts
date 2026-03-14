/**
 * 롯데마트 업스트림 단독 진단
 */

import { LOTTEMART_API } from './api.js';
import { DEFAULT_LOTTEMART_TIMEOUT_MS } from './config.js';
import { probeLotteMartRequest } from './session.js';
import { normalizeArea } from './storeSearch.js';

export type LotteMartDebugTarget = 'market-options' | 'stores' | 'products' | 'product-page';

export interface LotteMartDebugParams {
  target: LotteMartDebugTarget;
  area?: string;
  type?: '1' | '2';
  storeCode?: string;
  keyword?: string;
  page?: number;
  timeout?: number;
  zyteApiKey?: string;
}

interface BuiltDebugRequest {
  target: LotteMartDebugTarget;
  method: 'GET' | 'POST';
  url: string;
  bodyText: string | null;
}

function resolveArea(area?: string): string {
  const normalized = normalizeArea(area || '경기');
  return normalized || '경기';
}

export function buildLotteMartDebugRequest(params: LotteMartDebugParams): BuiltDebugRequest {
  const target = params.target;
  const area = resolveArea(params.area);

  switch (target) {
    case 'market-options': {
      const endpoint = new URL(LOTTEMART_API.MARKET_OPTIONS_PATH, LOTTEMART_API.BASE_URL);
      endpoint.searchParams.set('p_area', area);
      endpoint.searchParams.set('p_type', params.type || '1');
      if ((params.storeCode || '').trim().length > 0) {
        endpoint.searchParams.set('p_werks', params.storeCode!.trim());
      }
      return {
        target,
        method: 'GET',
        url: endpoint.toString(),
        bodyText: null,
      };
    }
    case 'stores':
      return {
        target,
        method: 'POST',
        url: new URL(LOTTEMART_API.STORE_SEARCH_PATH, LOTTEMART_API.BASE_URL).toString(),
        bodyText: new URLSearchParams({
          m_area: area,
          ...(params.storeCode ? { m_market: params.storeCode.trim() } : {}),
          ...(params.keyword ? { m_schWord: params.keyword.trim() } : {}),
        }).toString(),
      };
    case 'products':
      return {
        target,
        method: 'POST',
        url: new URL(LOTTEMART_API.PRODUCT_SEARCH_PATH, LOTTEMART_API.BASE_URL).toString(),
        bodyText: new URLSearchParams({
          p_area: area,
          p_market: (params.storeCode || '2415').trim(),
          p_schWord: (params.keyword || '핫식스').trim(),
        }).toString(),
      };
    case 'product-page': {
      const endpoint = new URL(LOTTEMART_API.PRODUCT_PAGE_PATH, LOTTEMART_API.BASE_URL);
      endpoint.searchParams.set('p_market', (params.storeCode || '2415').trim());
      endpoint.searchParams.set('p_schWord', (params.keyword || '핫식스').trim());
      endpoint.searchParams.set('page', String(Math.max(params.page || 2, 1)));
      return {
        target,
        method: 'GET',
        url: endpoint.toString(),
        bodyText: null,
      };
    }
  }
}

export async function probeLotteMartUpstream(params: LotteMartDebugParams) {
  const request = buildLotteMartDebugRequest(params);
  const timeout = params.timeout || DEFAULT_LOTTEMART_TIMEOUT_MS;
  const init: RequestInit = {
    method: request.method,
    headers:
      request.method === 'POST'
        ? {
            'Content-Type': 'application/x-www-form-urlencoded',
          }
        : {
            Accept: 'text/html, */*; q=0.01',
            'X-Requested-With': 'XMLHttpRequest',
          },
    body: request.bodyText || undefined,
  };

  return {
    request: {
      target: request.target,
      method: request.method,
      url: request.url,
      bodyText: request.bodyText,
      timeout,
      hasZyteApiKey: Boolean(params.zyteApiKey),
    },
    attempts: await probeLotteMartRequest(
      request.url,
      init,
      timeout,
      '',
      params.zyteApiKey,
    ),
  };
}
