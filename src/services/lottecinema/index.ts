/**
 * 롯데시네마 서비스 프로바이더
 */

import type { ServiceProvider } from '../../core/interfaces.js';
import type { ServiceMetadata, ToolRegistration } from '../../core/types.js';
import { createFindNearbyTheatersTool } from './tools/findNearbyTheaters.js';
import { createGetRemainingSeatsTool } from './tools/getRemainingSeats.js';
import { createListNowShowingTool } from './tools/listNowShowing.js';

const LOTTECINEMA_METADATA: ServiceMetadata = {
  id: 'lottecinema',
  name: '롯데시네마',
  version: '1.0.0',
  description: '롯데시네마 주변 지점 탐색, 영화 목록 조회, 잔여 좌석 조회 서비스',
};

class LotteCinemaService implements ServiceProvider {
  readonly metadata = LOTTECINEMA_METADATA;

  getTools(): ToolRegistration[] {
    return [
      createFindNearbyTheatersTool(),
      createListNowShowingTool(),
      createGetRemainingSeatsTool(),
    ];
  }
}

export function createLotteCinemaService(): ServiceProvider {
  return new LotteCinemaService();
}

export * from './types.js';
