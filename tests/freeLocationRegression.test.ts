import { afterEach, expect, it, vi } from 'vitest';
import { geocodeCuAddress } from '../src/services/cu/client.js';
import { resolveMegaboxLocation } from '../src/services/megabox/location.js';
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});
it('CU 주소 해석은 무료 키로 주소 검색한다', async () => {
  vi.stubEnv('KAKAO_REST_API_KEY', 'free');
  vi.stubGlobal(
    'fetch',
    vi
      .fn()
      .mockResolvedValue(
        new Response(
          JSON.stringify({
            documents: [{ address_name: '부산 동구 중앙대로 206', x: '129.041', y: '35.115' }],
          }),
        ),
      ),
  );
  expect(await geocodeCuAddress('부산 동구 중앙대로 206')).toMatchObject({ latitude: 35.115 });
});
it('메가박스 부산역 위치 실패는 서울로 성공하지 않는다', async () => {
  await expect(resolveMegaboxLocation({ keyword: '부산역' })).rejects.toThrow('위치');
});
it('메가박스는 한국 범위 밖 좌표를 가까운 극장 검색에 사용하지 않는다', async () => {
  await expect(resolveMegaboxLocation({ latitude: 0, longitude: 0 })).rejects.toThrow(
    '유효한 위도',
  );
});
it('롯데시네마 위치 실패를 거리 없는 성공으로 반환하지 않는다', async () => {
  const { resolveLotteCinemaLocation } = await import('../src/services/lottecinema/location.js');
  await expect(resolveLotteCinemaLocation({ keyword: '부산역' })).rejects.toThrow(
    '위치를 좌표로 변환하지 못했습니다',
  );
});
it('롯데시네마 MCP 위치 입력에 서울 좌표 기본값을 넣지 않는다', async () => {
 const { createFindNearbyTheatersTool } = await import('../src/services/lottecinema/tools/findNearbyTheaters.js');
 const schema = createFindNearbyTheatersTool().metadata.inputSchema;
 expect(schema.latitude.parse(undefined)).toBeUndefined();
 expect(schema.longitude.parse(undefined)).toBeUndefined();
});
