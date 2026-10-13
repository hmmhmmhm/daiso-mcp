import { expect, it, vi } from 'vitest';
import { withExternalRouting } from '../../src/utils/externalRouting.js';
import { createGeocodeFetch } from '../../src/utils/geocodeFetch.js';
it('Worker REST/MCP 요청 context의 지오코딩 바인딩을 연결한다', async () => {
  const rpc = vi.fn(async () => Response.json({ status: 200, body: { documents: [] } }));
  const namespace = {
    idFromName: vi.fn(),
    get: () => ({ fetch: rpc }),
  } as unknown as DurableObjectNamespace;
  const result = await withExternalRouting(
    { GEOCODE_GATEWAY: namespace, KAKAO_REST_API_KEY: 'key' },
    { waitUntil: vi.fn() } as unknown as ExecutionContext,
    () =>
      createGeocodeFetch(vi.fn())(
        'https://dapi.kakao.com/v2/local/search/address.json?query=부산%20중앙대로%20206',
        { headers: { Authorization: 'KakaoAK key' } },
      ),
  );
  expect(result.status).toBe(200);
  expect(rpc).toHaveBeenCalledTimes(1);
});
it('상태 바인딩 없는 기존 Worker 실행도 유지한다', () => {
  expect(withExternalRouting({}, undefined as unknown as ExecutionContext, () => 'ok')).toBe('ok');
});
