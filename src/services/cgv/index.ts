import type { CgvTransportOptions } from './relayTransport.js';
import type { GeocodeOptions } from '../../utils/geocode.js';
/**
 * CGV 서비스 프로바이더
 */

import type { ServiceProvider } from '../../core/interfaces.js';
import type { ServiceMetadata, ToolRegistration } from '../../core/types.js';
import { createFindTheatersTool } from './tools/findTheaters.js';
import { createSearchMoviesTool } from './tools/searchMovies.js';
import { createGetTimetableTool } from './tools/getTimetable.js';

const CGV_METADATA: ServiceMetadata = {
  id: 'cgv',
  name: 'CGV',
  version: '1.0.0',
  description: 'CGV 극장 검색, 영화 검색, 시간표 조회 서비스',
};

class CgvService implements ServiceProvider {
  constructor(
    private readonly options: GeocodeOptions & CgvTransportOptions & { zyteApiKey?: string } = {},
  ) {}

  readonly metadata = CGV_METADATA;

  getTools(): ToolRegistration[] {
    return [
      createFindTheatersTool(this.options.zyteApiKey, this.options.googleMapsApiKey, this.options),
      createSearchMoviesTool(this.options.zyteApiKey, this.options.googleMapsApiKey, this.options),
      createGetTimetableTool(this.options.zyteApiKey, this.options.googleMapsApiKey, this.options),
    ];
  }
}

export function createCgvService(
  options: GeocodeOptions & CgvTransportOptions & { zyteApiKey?: string } = {},
): ServiceProvider {
  return new CgvService(options);
}

export * from './types.js';
