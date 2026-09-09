/**
 * 디트릭스(Dtryx) 서비스 프로바이더
 *
 * 국내 독립·예술영화관 다수가 공용으로 사용하는 예매 플랫폼을 조회합니다.
 */

import type { ServiceProvider } from '../../core/interfaces.js';
import type { ServiceMetadata, ToolRegistration } from '../../core/types.js';
import { createGetRemainingSeatsTool } from './tools/getRemainingSeats.js';
import { createListCinemasTool } from './tools/listCinemas.js';
import { createListNowShowingTool } from './tools/listNowShowing.js';

const DTRYX_METADATA: ServiceMetadata = {
  id: 'dtryx',
  name: '디트릭스',
  version: '1.0.0',
  description:
    '디트릭스 예매 플랫폼 기반 독립·예술영화관 목록, 상영작, 상영시간표·잔여 좌석 조회 서비스',
};

class DtryxService implements ServiceProvider {
  readonly metadata = DTRYX_METADATA;

  getTools(): ToolRegistration[] {
    return [createListCinemasTool(), createListNowShowingTool(), createGetRemainingSeatsTool()];
  }
}

export function createDtryxService(): ServiceProvider {
  return new DtryxService();
}

export * from './types.js';
