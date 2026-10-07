import { expect, it, vi } from 'vitest';
import app from '../src/index.js';
it('롯데마트 경로는 업스트림 호출 없이 종료를 알린다', async () => {
  const fetchMock = vi.fn();
  vi.stubGlobal('fetch', fetchMock);
  try {
    for (const endpoint of ['stores', 'products', 'debug']) {
      const response = await app.request(`/api/lottemart/${endpoint}`);
      expect(response.status).toBe(410);
      expect(await response.json()).toMatchObject({
        success: false,
        error: { code: 'SERVICE_RETIRED' },
      });
    }
    expect(fetchMock).not.toHaveBeenCalled();
  } finally {
    vi.unstubAllGlobals();
  }
});
it('롯데마트는 지원 서비스와 MCP 도구에 없다', async () => {
  const body = await (await app.request('/root.json')).json();
  expect(body.tools.some((name: string) => name.startsWith('lottemart_'))).toBe(false);
});
it.each(['lottemartFindStores', 'lottemartSearchProducts'])('기존 action %s도 업스트림 없이 종료를 알린다', async (action) => {
 const fetchMock = vi.fn(); vi.stubGlobal('fetch', fetchMock);
 try {
 const response = await app.request(`/api/actions/query?action=${action}`);
 expect(response.status).toBe(410);
 expect(await response.json()).toMatchObject({ error: { code: 'SERVICE_RETIRED' } });
 expect(fetchMock).not.toHaveBeenCalled();
 } finally { vi.unstubAllGlobals(); }
});
it('action이 없는 요청은 지원 종료 응답과 구분한다', async () => {
 const response = await app.request('/api/actions/query');
 expect(response.status).toBe(400);
 expect(await response.json()).toMatchObject({ error: { code: 'INVALID_ACTION_QUERY' } });
});
