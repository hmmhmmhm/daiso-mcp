import type { ServiceProvider } from '../../core/interfaces.js';
import type { ServiceMetadata, ToolRegistration } from '../../core/types.js';
import { createCompareProductsTool } from './tools/compareProducts.js';

const COMPARE_METADATA: ServiceMetadata = {
  id: 'compare',
  name: '통합 비교',
  version: '1.0.0',
  description: '새 외부 키 없이 기존 상품 검색을 묶어 가격 후보를 비교하는 서비스',
};

class CompareService implements ServiceProvider {
  readonly metadata = COMPARE_METADATA;

  getTools(): ToolRegistration[] {
    return [createCompareProductsTool()];
  }
}

export function createCompareService(): ServiceProvider {
  return new CompareService();
}

export * from './types.js';
