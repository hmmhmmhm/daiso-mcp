/**
 * 세븐일레븐 서비스 프로바이더
 */

import type { ServiceProvider } from '../../core/interfaces.js';
import type { ServiceMetadata, ToolRegistration } from '../../core/types.js';
import { createSearchProductsTool } from './tools/searchProducts.js';
import { createGetSearchPopwordsTool } from './tools/getSearchPopwords.js';
import { createGetCatalogSnapshotTool } from './tools/getCatalogSnapshot.js';

const SEVENELEVEN_METADATA: ServiceMetadata = {
  id: 'seveneleven',
  name: '세븐일레븐',
  version: '1.0.0',
  description: '세븐일레븐 공개 상품/검색/카탈로그 조회 서비스',
};

class SevenElevenService implements ServiceProvider {
  readonly metadata = SEVENELEVEN_METADATA;

  getTools(): ToolRegistration[] {
    return [createSearchProductsTool(), createGetSearchPopwordsTool(), createGetCatalogSnapshotTool()];
  }
}

export function createSevenElevenService(): ServiceProvider {
  return new SevenElevenService();
}

export * from './types.js';
