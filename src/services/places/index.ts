/**
 * 장소 검색 서비스 프로바이더
 */
import type { ServiceProvider } from '../../core/interfaces.js';
import type { ServiceMetadata, ToolRegistration } from '../../core/types.js';
import { createSearchNearbyPlacesTool } from './tools/searchNearby.js';

const PLACES_METADATA: ServiceMetadata = {
  id: 'places',
  name: '장소 검색',
  version: '1.0.0',
  description: '네이버 지역 검색 기반 음식점, 카페, 주변 장소 탐색 서비스',
};

interface PlacesServiceOptions {
  naverClientId?: string;
  naverClientSecret?: string;
}

class PlacesService implements ServiceProvider {
  readonly metadata = PLACES_METADATA;

  constructor(private readonly options: PlacesServiceOptions = {}) {}

  getTools(): ToolRegistration[] {
    return [
      createSearchNearbyPlacesTool(this.options.naverClientId, this.options.naverClientSecret),
    ];
  }
}

export function createPlacesService(options: PlacesServiceOptions = {}): ServiceProvider {
  return new PlacesService(options);
}

export * from './types.js';
