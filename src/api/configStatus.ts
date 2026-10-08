import { cgvTransportFromBindings } from '../services/cgv/relayTransport.js';
import { isValidDtryxRelayUrl } from '../services/dtryx/transport.js';
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
  dtryxRelay: ConfigStatus['oliveyoungRelay'];
  cgvRelay: ConfigStatus['oliveyoungRelay'];
  convenienceRelay: ConfigStatus['oliveyoungRelay'];
  googleMapsApiKey: ConfigStatusItem & { enabled: false };
  kakaoRestApiKey: ConfigStatusItem;
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

  const dtryxId = isConfigured(bindings?.DTRYX_ACCESS_CLIENT_ID);
  const dtryxSecret = isConfigured(bindings?.DTRYX_ACCESS_CLIENT_SECRET);
  const dtryx = {
    urlValid: isValidDtryxRelayUrl(bindings?.DTRYX_RELAY_URL),
    tokenConfigured: isConfigured(bindings?.DTRYX_RELAY_TOKEN),
    accessClientIdConfigured: dtryxId,
    accessClientSecretConfigured: dtryxSecret,
    accessConfigured: dtryxId && dtryxSecret,
    accessPairValid:
      (bindings?.DTRYX_ACCESS_CLIENT_ID === undefined &&
        bindings?.DTRYX_ACCESS_CLIENT_SECRET === undefined) ||
      (dtryxId && dtryxSecret),
  };

  const convenienceId = isConfigured(bindings?.CONVENIENCE_ACCESS_CLIENT_ID);
  const convenienceSecret = isConfigured(bindings?.CONVENIENCE_ACCESS_CLIENT_SECRET);
  const convenienceUrl = isValidDtryxRelayUrl(bindings?.CONVENIENCE_RELAY_URL);
  const convenienceToken = isConfigured(bindings?.CONVENIENCE_RELAY_TOKEN);
  const conveniencePair = (bindings?.CONVENIENCE_ACCESS_CLIENT_ID === undefined && bindings?.CONVENIENCE_ACCESS_CLIENT_SECRET === undefined) || (convenienceId && convenienceSecret);
  const cgv = cgvTransportFromBindings(bindings);
  const cgvUrl = isValidDtryxRelayUrl(cgv.cgvRelayUrl);
  const cgvToken = isConfigured(cgv.cgvRelayToken);
  const cgvId = isConfigured(cgv.cgvAccessClientId);
  const cgvSecret = isConfigured(cgv.cgvAccessClientSecret);
  const cgvPair = (cgv.cgvAccessClientId === undefined && cgv.cgvAccessClientSecret === undefined) || (cgvId && cgvSecret);
  return {
    cgvRelay: {
      configured: cgvUrl && cgvToken && cgvPair,
      urlConfigured: isConfigured(cgv.cgvRelayUrl), urlValid: cgvUrl,
      tokenConfigured: cgvToken, accessClientIdConfigured: cgvId,
      accessClientSecretConfigured: cgvSecret, accessConfigured: cgvId && cgvSecret,
      accessPairValid: cgvPair, usedBy: ['cgv'],
    },
    convenienceRelay: {
      configured: convenienceUrl && convenienceToken && conveniencePair,
      urlConfigured: isConfigured(bindings?.CONVENIENCE_RELAY_URL), urlValid: convenienceUrl,
      tokenConfigured: convenienceToken, accessClientIdConfigured: convenienceId, accessClientSecretConfigured: convenienceSecret,
      accessConfigured: convenienceId && convenienceSecret, accessPairValid: conveniencePair,
      usedBy: ['cu', 'seveneleven', 'gs25'],
    },
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
    dtryxRelay: {
      configured: dtryx.urlValid && dtryx.tokenConfigured && dtryx.accessPairValid,
      urlConfigured: isConfigured(bindings?.DTRYX_RELAY_URL),
      urlValid: dtryx.urlValid,
      tokenConfigured: dtryx.tokenConfigured,
      accessClientIdConfigured: dtryx.accessClientIdConfigured,
      accessClientSecretConfigured: dtryx.accessClientSecretConfigured,
      accessConfigured: dtryx.accessConfigured,
      accessPairValid: dtryx.accessPairValid,
      usedBy: ['dtryx'],
    },
    googleMapsApiKey: {
      configured: isConfigured(bindings?.GOOGLE_MAPS_API_KEY),
      enabled: false,
      usedBy: [],
    },
    kakaoRestApiKey: {
      configured: isConfigured(bindings?.KAKAO_REST_API_KEY),
      usedBy: ['gs25', 'cu', 'opinet', 'megabox', 'lottecinema', 'cgv'],
    },
    zyteApiKey: {
      configured: isConfigured(bindings?.ZYTE_API_KEY),
      enabled: false,
      usedBy: [],
    },
    naverLocalSearch: {
      configured:
        isConfigured(bindings?.NAVER_CLIENT_ID) && isConfigured(bindings?.NAVER_CLIENT_SECRET),
      usedBy: ['places', 'gs25', 'cu', 'opinet', 'megabox', 'lottecinema', 'cgv'],
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
