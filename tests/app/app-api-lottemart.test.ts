/** 롯데마트 종료 경로 테스트 */
import { expect, it } from 'vitest';
import app from '../../src/index.js';
it.each(['stores', 'products', 'debug'])('옛 경로 %s는 지원 종료를 반환한다', async (endpoint) => {
 const response = await app.request(`/api/lottemart/${endpoint}?keyword=콜라&storeCode=123`);
 expect(response.status).toBe(410);
 expect(await response.json()).toMatchObject({ error: { code: 'SERVICE_RETIRED' } });
});
