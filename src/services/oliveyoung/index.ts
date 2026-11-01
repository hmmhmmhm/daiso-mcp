/**
 * 올리브영 서비스 프로바이더
 */

import type { ServiceProvider } from '../../core/interfaces.js';
import type { ServiceMetadata, ToolRegistration } from '../../core/types.js';
import { createFindNearbyStoresTool } from './tools/findNearbyStores.js';
import { createCheckInventoryTool } from './tools/checkInventory.js';
import { createSearchProductsTool } from './tools/searchProducts.js';
import { createGetTodayDealsTool } from './tools/getTodayDeals.js';

const OLIVEYOUNG_METADATA: ServiceMetadata = {
  id: 'oliveyoung',
  name: '올리브영',
  version: '1.0.0',
  description:
    '올리브영 상품 검색, 주변 매장 탐색, 재고 파악 및 오특(오늘의 특가) 조회 서비스 (무료 직접 요청 및 브라우저 릴레이)',
};

interface OliveyoungServiceOptions {
  zyteApiKey?: string;
  relayUrl?: string;
  relayToken?: string;
  accessClientId?: string;
  accessClientSecret?: string;
}

class OliveyoungService implements ServiceProvider {
  readonly metadata = OLIVEYOUNG_METADATA;

  constructor(private readonly options: OliveyoungServiceOptions = {}) {}

  getTools(): ToolRegistration[] {
    return [
      createSearchProductsTool(this.options.zyteApiKey, this.options),
      createFindNearbyStoresTool(this.options.zyteApiKey, this.options),
      createCheckInventoryTool(this.options.zyteApiKey, this.options),
      createGetTodayDealsTool(this.options),
    ];
  }
}

export function createOliveyoungService(options: OliveyoungServiceOptions = {}): ServiceProvider {
  return new OliveyoungService(options);
}

export * from './types.js';
