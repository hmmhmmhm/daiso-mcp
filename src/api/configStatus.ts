import type { AppBindings } from './response.js';

interface ConfigStatusItem {
  configured: boolean;
  usedBy: string[];
}

export interface ConfigStatus {
  googleMapsApiKey: ConfigStatusItem;
  zyteApiKey: ConfigStatusItem;
  healthCheckSecret: ConfigStatusItem;
}

function isConfigured(value: string | undefined): boolean {
  return typeof value === 'string' && value.trim().length > 0;
}

export function buildConfigStatus(bindings?: AppBindings): ConfigStatus {
  return {
    googleMapsApiKey: {
      configured: isConfigured(bindings?.GOOGLE_MAPS_API_KEY),
      usedBy: ['gs25', 'cu', 'lottemart', 'megabox', 'lottecinema', 'cgv'],
    },
    zyteApiKey: {
      configured: isConfigured(bindings?.ZYTE_API_KEY),
      usedBy: ['oliveyoung', 'lottemart', 'cgv'],
    },
    healthCheckSecret: {
      configured: isConfigured(bindings?.HEALTH_CHECK_SECRET),
      usedBy: ['health-checks'],
    },
  };
}
