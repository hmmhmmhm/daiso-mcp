import { expect, it } from 'vitest';
import { buildConfigStatus } from '../src/api/configStatus.js';
it('무료 지도 공급자의 구성을 알리고 유료 공급자는 비활성으로 표시한다', () => {
  const status = buildConfigStatus({ KAKAO_REST_API_KEY: 'test', GOOGLE_MAPS_API_KEY: 'disabled' });
  expect(status).toMatchObject({
    kakaoRestApiKey: { configured: true },
    googleMapsApiKey: { enabled: false, usedBy: [] },
  });
});
