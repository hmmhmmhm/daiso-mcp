/**
 * 다이소 서비스 프로바이더
 *
 * 다이소 관련 모든 MCP 도구를 제공하는 서비스입니다.
 */

import type { ServiceProvider } from '../../core/interfaces.js';
import type { ServiceMetadata, ToolRegistration } from '../../core/types.js';
import { createSearchProductsTool } from './tools/searchProducts.js';
import { createFindStoresTool } from './tools/findStores.js';
import { createCheckInventoryTool } from './tools/checkInventory.js';
import { createGetPriceInfoTool } from './tools/getPriceInfo.js';
import { createGetDisplayLocationTool } from './tools/getDisplayLocation.js';

/**
 * 다이소 서비스 메타데이터
 */
const DAISO_METADATA: ServiceMetadata = {
  id: 'daiso',
  name: '다이소',
  version: '1.0.0',
  description: '다이소 제품 검색, 매장 검색, 재고 확인, 가격 조회 서비스',
};

/**
 * 다이소 서비스 프로바이더 클래스
 */
class DaisoService implements ServiceProvider {
  readonly metadata = DAISO_METADATA;

  getTools(): ToolRegistration[] {
    return [
      createSearchProductsTool(),
      createFindStoresTool(),
      createCheckInventoryTool(),
      createGetPriceInfoTool(),
      createGetDisplayLocationTool(),
    ];
  }
}

/**
 * 다이소 서비스 팩토리 함수
 * ServiceRegistry에 등록할 때 사용합니다.
 */
export function createDaisoService(): ServiceProvider {
  return new DaisoService();
}

// 타입 및 유틸리티 재내보내기 (필요 시 사용)
export * from './types.js';
export { getImageUrl, formatTime } from './api.js';
