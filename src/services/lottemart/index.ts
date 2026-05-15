/**
 * 롯데마트 서비스 프로바이더
 */

import type { ServiceProvider } from '../../core/interfaces.js';
import type { ServiceMetadata, ToolRegistration } from '../../core/types.js';
import { createFindNearbyStoresTool } from './tools/findNearbyStores.js';
import { createSearchProductsTool } from './tools/searchProducts.js';

const LOTTEMART_METADATA: ServiceMetadata = {
  id: 'lottemart',
  name: '롯데마트',
  version: '1.0.0',
  description: '롯데마트 계열 매장 탐색 및 매장별 상품 검색 서비스',
};

class LotteMartService implements ServiceProvider {
  readonly metadata = LOTTEMART_METADATA;

  constructor(
    private readonly googleMapsApiKey?: string,
    private readonly zyteApiKey?: string,
  ) {}

  getTools(): ToolRegistration[] {
    return [
      createFindNearbyStoresTool(this.googleMapsApiKey, this.zyteApiKey),
      createSearchProductsTool(this.zyteApiKey),
    ];
  }
}

export function createLotteMartService(
  options: { googleMapsApiKey?: string; zyteApiKey?: string } = {},
): ServiceProvider {
  return new LotteMartService(options.googleMapsApiKey, options.zyteApiKey);
}

export * from './types.js';
