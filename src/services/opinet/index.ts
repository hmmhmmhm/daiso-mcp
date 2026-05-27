import type { ServiceProvider } from '../../core/interfaces.js';
import type { ServiceMetadata, ToolRegistration } from '../../core/types.js';
import {
  createOpinetAveragePricesTool,
  createOpinetLowestStationsTool,
  createOpinetStationDetailTool,
  createOpinetStationsAroundTool,
} from './tools.js';

const OPINET_METADATA: ServiceMetadata = {
  id: 'opinet',
  name: '오피넷',
  version: '1.0.0',
  description: '한국석유공사 오피넷 기반 전국 평균 유가, 최저가 주유소, 반경 내 주유소 조회 서비스',
};

interface OpinetServiceOptions {
  apiKey?: string;
  googleMapsApiKey?: string;
}

class OpinetService implements ServiceProvider {
  readonly metadata = OPINET_METADATA;

  constructor(private readonly options: OpinetServiceOptions = {}) {}

  getTools(): ToolRegistration[] {
    return [
      createOpinetAveragePricesTool(this.options.apiKey),
      createOpinetLowestStationsTool(this.options.apiKey),
      createOpinetStationsAroundTool(this.options.apiKey, this.options.googleMapsApiKey),
      createOpinetStationDetailTool(this.options.apiKey),
    ];
  }
}

export function createOpinetService(options: OpinetServiceOptions = {}): ServiceProvider {
  return new OpinetService(options);
}

export * from './types.js';
