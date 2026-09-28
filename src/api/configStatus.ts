import { isValidOliveyoungRelayUrl } from '../services/oliveyoung/transport.js';
import type { AppBindings } from './response.js';

interface ConfigStatusItem {
  configured: boolean;
  usedBy: string[];
}

export interface ConfigStatus {
  oliveyoungRelay: ConfigStatusItem & {
    urlConfigured: boolean;
    urlValid: boolean;
    tokenConfigured: boolean;
    accessClientIdConfigured: boolean;
    accessClientSecretConfigured: boolean;
    accessConfigured: boolean;
    accessPairValid: boolean;
  };
  googleMapsApiKey: ConfigStatusItem;
  zyteApiKey: ConfigStatusItem & { enabled: false };
  naverLocalSearch: ConfigStatusItem;
  opinetApiKey: ConfigStatusItem;
  supabaseFeedback: ConfigStatusItem;
  healthCheckSecret: ConfigStatusItem;
}

function isConfigured(value: string | undefined): boolean {
  return typeof value === 'string' && value.trim().length > 0;
}

export function buildConfigStatus(bindings?: AppBindings): ConfigStatus {
  const urlValid = isValidOliveyoungRelayUrl(bindings?.OY_RELAY_URL);
  const tokenConfigured = isConfigured(bindings?.OY_RELAY_TOKEN);
  const accessClientIdConfigured = isConfigured(bindings?.OY_ACCESS_CLIENT_ID);
  const accessClientSecretConfigured = isConfigured(bindings?.OY_ACCESS_CLIENT_SECRET);
  const accessConfigured = accessClientIdConfigured && accessClientSecretConfigured;
  const accessPairValid =
    (bindings?.OY_ACCESS_CLIENT_ID === undefined &&
      bindings?.OY_ACCESS_CLIENT_SECRET === undefined) ||
    accessConfigured;

  return {
    oliveyoungRelay: {
      configured: urlValid && tokenConfigured && accessPairValid,
      urlConfigured: isConfigured(bindings?.OY_RELAY_URL),
      urlValid,
      tokenConfigured,
      accessClientIdConfigured,
      accessClientSecretConfigured,
      accessConfigured,
      accessPairValid,
      usedBy: ['oliveyoung'],
    },
    googleMapsApiKey: {
      configured: isConfigured(bindings?.GOOGLE_MAPS_API_KEY),
      usedBy: ['gs25', 'cu', 'lottemart', 'megabox', 'lottecinema', 'cgv'],
    },
    zyteApiKey: {
      configured: isConfigured(bindings?.ZYTE_API_KEY),
      enabled: false,
      usedBy: [],
    },
    naverLocalSearch: {
      configured:
        isConfigured(bindings?.NAVER_CLIENT_ID) && isConfigured(bindings?.NAVER_CLIENT_SECRET),
      usedBy: ['places'],
    },
    opinetApiKey: {
      configured: isConfigured(bindings?.OPINET_API_KEY),
      usedBy: ['opinet'],
    },
    supabaseFeedback: {
      configured:
        isConfigured(bindings?.SUPABASE_URL) && isConfigured(bindings?.SUPABASE_SERVICE_ROLE_KEY),
      usedBy: ['feedback'],
    },
    healthCheckSecret: {
      configured: isConfigured(bindings?.HEALTH_CHECK_SECRET),
      usedBy: ['health-checks'],
    },
  };
}
