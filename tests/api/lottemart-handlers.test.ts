/** 롯데마트 종료 핸들러 테스트 */
import { afterEach, expect, it, vi } from 'vitest';
import { handleLotteMartDebug, handleLotteMartFindStores, handleLotteMartSearchProducts } from '../../src/api/lottemartHandlers.js';
afterEach(() => vi.unstubAllGlobals());
it.each([handleLotteMartDebug, handleLotteMartFindStores, handleLotteMartSearchProducts])('옛 핸들러는 입력과 무관하게 업스트림 없이 410을 반환한다', async (handler) => {
 const fetchMock = vi.fn(); vi.stubGlobal('fetch', fetchMock);
 const json = vi.fn();
 await handler({ json } as unknown as Parameters<typeof handler>[0]);
 expect(json).toHaveBeenCalledWith(expect.objectContaining({ success: false, error: { code: 'SERVICE_RETIRED', message: '롯데마트 서비스 지원이 종료되었습니다.' } }), 410);
 expect(fetchMock).not.toHaveBeenCalled();
});
