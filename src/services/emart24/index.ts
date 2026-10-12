import type { ConvenienceTransportOptions } from '../../utils/convenienceTransport.js';
/**
 * 이마트24 서비스 프로바이더
 */

import type { ServiceProvider } from '../../core/interfaces.js';
import type { ServiceMetadata, ToolRegistration } from '../../core/types.js';
import { createFindNearbyStoresTool } from './tools/findNearbyStores.js';
import { createSearchProductsTool } from './tools/searchProducts.js';
import { createCheckInventoryTool } from './tools/checkInventory.js';

const EMART24_METADATA: ServiceMetadata = {
  id: 'emart24',
  name: '이마트24',
  version: '1.0.0',
  description: '이마트24 매장 탐색, 상품 검색, 매장별 재고 조회 서비스',
};

class Emart24Service implements ServiceProvider {
  readonly metadata = EMART24_METADATA;
  constructor(private readonly options: ConvenienceTransportOptions = {}) {}

  getTools(): ToolRegistration[] {
    return [
      createFindNearbyStoresTool(this.options),
      createSearchProductsTool(this.options),
      createCheckInventoryTool(this.options),
    ];
  }
}

export function createEmart24Service(options: ConvenienceTransportOptions = {}): ServiceProvider {
  return new Emart24Service(options);
}

export * from './types.js';
