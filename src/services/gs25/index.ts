/**
 * GS25 서비스 프로바이더
 */

import type { ServiceProvider } from '../../core/interfaces.js';
import type { ServiceMetadata, ToolRegistration } from '../../core/types.js';
import { createFindNearbyStoresTool } from './tools/findNearbyStores.js';
import { createSearchProductsTool } from './tools/searchProducts.js';
import { createCheckInventoryTool } from './tools/checkInventory.js';

const GS25_METADATA: ServiceMetadata = {
  id: 'gs25',
  name: 'GS25',
  version: '1.0.0',
  description: 'GS25 매장 탐색, 상품 키워드 검색, 재고 조회 서비스',
};

interface Gs25ServiceOptions {
  googleMapsApiKey?: string;
  zyteApiKey?: string;
}

class Gs25Service implements ServiceProvider {
  readonly metadata = GS25_METADATA;

  constructor(private readonly options: Gs25ServiceOptions = {}) {}

  getTools(): ToolRegistration[] {
    return [
      createFindNearbyStoresTool(this.options.googleMapsApiKey, this.options.zyteApiKey),
      createSearchProductsTool(this.options.zyteApiKey),
      createCheckInventoryTool(this.options.googleMapsApiKey, this.options.zyteApiKey),
    ];
  }
}

export function createGs25Service(options: Gs25ServiceOptions = {}): ServiceProvider {
  return new Gs25Service(options);
}

export * from './types.js';
