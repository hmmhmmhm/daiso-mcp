import type { ConvenienceTransportOptions } from '../../utils/convenienceTransport.js';
/**
 * 세븐일레븐 서비스 프로바이더
 */

import type { ServiceProvider } from '../../core/interfaces.js';
import type { ServiceMetadata, ToolRegistration } from '../../core/types.js';
import { createSearchProductsTool } from './tools/searchProducts.js';
import { createSearchStoresTool } from './tools/searchStores.js';
import { createCheckInventoryTool } from './tools/checkInventory.js';
import { createGetSearchPopwordsTool } from './tools/getSearchPopwords.js';
import { createGetCatalogSnapshotTool } from './tools/getCatalogSnapshot.js';

const SEVENELEVEN_METADATA: ServiceMetadata = {
  id: 'seveneleven',
  name: '세븐일레븐',
  version: '1.0.0',
  description: '세븐일레븐 공개 상품/검색/카탈로그 조회 서비스',
};

export interface SevenElevenServiceOptions extends ConvenienceTransportOptions {
  zyteApiKey?: string;
}

class SevenElevenService implements ServiceProvider {
  readonly metadata = SEVENELEVEN_METADATA;

  constructor(private readonly options: SevenElevenServiceOptions = {}) {}

  getTools(): ToolRegistration[] {
    return [
      createSearchProductsTool(this.options.zyteApiKey, this.options),
      createSearchStoresTool(this.options.zyteApiKey, this.options),
      createCheckInventoryTool(this.options.zyteApiKey, this.options),
      createGetSearchPopwordsTool(this.options.zyteApiKey, this.options),
      createGetCatalogSnapshotTool(this.options.zyteApiKey, this.options),
    ];
  }
}

export function createSevenElevenService(options: SevenElevenServiceOptions = {}): ServiceProvider {
  return new SevenElevenService(options);
}

export * from './types.js';
