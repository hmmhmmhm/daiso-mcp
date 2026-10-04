import { afterEach, expect, it, vi } from 'vitest';
import { __testOnlyClearOpinetGeocodeCache, resolveOpinetLocation, wgs84ToKatec } from '../../../src/services/opinet/location.js';
afterEach(() => { __testOnlyClearOpinetGeocodeCache(); vi.unstubAllEnvs(); vi.unstubAllGlobals(); });
it('WGS84를 KATEC으로 변환한다', () => {
 expect(wgs84ToKatec(37.4979, 127.0276)).toEqual({ x: 314213.309, y: 544413.58 });
 expect(() => wgs84ToKatec(NaN, 127)).toThrow('위도/경도');
});
it('KATEC와 위경도 입력은 지오코더를 호출하지 않는다', async () => {
 const fetchImpl = vi.fn();
 expect(await resolveOpinetLocation({ x: 1, y: 2, location: '직접' }, { fetchImpl })).toMatchObject({ katec: { x: 1, y: 2 }, inputType: 'katec', location: '직접' });
 expect(await resolveOpinetLocation({ latitude: 37.4979, longitude: 127.0276 }, { fetchImpl })).toMatchObject({ inputType: 'coordinates', geocodeUsed: false });
 expect(fetchImpl).not.toHaveBeenCalled();
});
it('무료 장소 검색 결과를 변환한다', async () => {
 const fetchImpl = vi.fn().mockResolvedValue(new Response(JSON.stringify({ documents: [{ place_name: '강남역', address_name: '서울 강남구', y: '37.4979', x: '127.0276' }] })));
 expect(await resolveOpinetLocation({ location: '강남역' }, { kakaoRestApiKey: 'free', fetchImpl })).toMatchObject({ inputType: 'location', formattedAddress: '서울 강남구', geocodeUsed: true });
 expect(fetchImpl.mock.calls[0][0]).toContain('dapi.kakao.com');
});
it('키가 없거나 검색 결과가 무관하면 명확한 위치 오류를 낸다', async () => {
 await expect(resolveOpinetLocation({ location: '부산역' })).rejects.toThrow('위치를 좌표로 변환하지 못했습니다');
 await expect(resolveOpinetLocation({})).rejects.toThrow('location 중 하나');
});
it('한국 범위 밖 좌표는 조회 좌표로 사용하지 않는다', async () => {
 await expect(resolveOpinetLocation({ latitude: 0, longitude: 0 })).rejects.toThrow('유효한 위도');
});
