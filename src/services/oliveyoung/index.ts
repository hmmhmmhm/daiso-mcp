/**
 * 올리브영 서비스 프로바이더
 */

import type { ServiceProvider } from '../../core/interfaces.js';
import type { ServiceMetadata, ToolRegistration } from '../../core/types.js';
import { createFindNearbyStoresTool } from './tools/findNearbyStores.js';
import { createCheckInventoryTool } from './tools/checkInventory.js';
import { createSearchProductsTool } from './tools/searchProducts.js';

const OLIVEYOUNG_METADATA: ServiceMetadata = {
  id: 'oliveyoung',
  name: '올리브영',
  version: '1.0.0',
  description: '올리브영 상품 검색, 주변 매장 탐색 및 재고 파악 서비스 (Zyte API 기반)',
};

interface OliveyoungServiceOptions {
  zyteApiKey?: string;
}

class OliveyoungService implements ServiceProvider {
  readonly metadata = OLIVEYOUNG_METADATA;

  constructor(private readonly options: OliveyoungServiceOptions = {}) {}

  getTools(): ToolRegistration[] {
    return [
      createSearchProductsTool(this.options.zyteApiKey),
      createFindNearbyStoresTool(this.options.zyteApiKey),
      createCheckInventoryTool(this.options.zyteApiKey),
    ];
  }
}

export function createOliveyoungService(options: OliveyoungServiceOptions = {}): ServiceProvider {
  return new OliveyoungService(options);
}

export * from './types.js';
