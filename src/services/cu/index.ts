/**
 * CU 서비스 프로바이더
 */

import type { ServiceProvider } from '../../core/interfaces.js';
import type { ServiceMetadata, ToolRegistration } from '../../core/types.js';
import { createFindNearbyStoresTool } from './tools/findNearbyStores.js';
import { createCheckInventoryTool } from './tools/checkInventory.js';

const CU_METADATA: ServiceMetadata = {
  id: 'cu',
  name: 'CU 편의점',
  version: '1.0.0',
  description: 'CU 매장 탐색 및 상품 재고 조회 서비스',
};

export interface CuServiceOptions {
  zyteApiKey?: string;
  googleMapsApiKey?: string;
}

class CuService implements ServiceProvider {
  readonly metadata = CU_METADATA;

  constructor(private readonly options: CuServiceOptions = {}) {}

  getTools(): ToolRegistration[] {
    return [
      createFindNearbyStoresTool(this.options.zyteApiKey),
      createCheckInventoryTool({
        zyteApiKey: this.options.zyteApiKey,
        googleMapsApiKey: this.options.googleMapsApiKey,
      }),
    ];
  }
}

export function createCuService(options: CuServiceOptions = {}): ServiceProvider {
  return new CuService(options);
}

export * from './types.js';
