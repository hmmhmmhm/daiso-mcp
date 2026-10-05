import { describe, expect, it } from 'vitest';
import { runCli } from '../../src/cli.js';
import { renderApiEnvelope } from '../../src/cliRenderer.js';

describe('CLI 미확인과 지원 종료 표시', () => {
  it('지원 종료 응답에 폐기된 명령을 안내하지 않는다', async () => {
    const errors: string[] = [];
    const exit = await runCli(['get', '/api/lottemart/products', '--keyword', '콜라'], {
      fetchImpl: async () => Response.json({ success: false, error: { code: 'SERVICE_RETIRED', message: '롯데마트 서비스 지원이 종료되었습니다.' } }, { status: 410 }),
      writeOut: () => {}, writeErr: message => errors.push(message),
      getVersion: () => '1.2.9', nowIso: () => '', isInteractiveTerminal: () => false,
    });
    expect(exit).toBe(1);
    expect(errors.join('\n')).toContain('지원이 종료');
    expect(errors.join('\n')).not.toContain('lottemart-products');
    expect(errors.join('\n')).not.toContain('매장 정보가 필요');
  });
  it.each(['inventory', 'gs25-inventory', 'cu-inventory'])('%s 미확인 수량은 0과 구분해 표시한다', (command) => {
    const stores = [{ storeName: '매장', quantity: null, stock: null, realStockQuantity: null }];
    const text = renderApiEnvelope(command, new URL('https://mcp.aka.page/api/test'), {
      success: true, data: { onlineStock: null, storeInventory: { stores }, inventory: { stores }, nearbyStores: { stores } },
    });
    expect(text).toContain('확인 불가');
    expect(text).not.toContain('수량 0');
  });
  it('실제 0개와 양수 재고는 그대로 표시한다', () => {
    const text = renderApiEnvelope('gs25-inventory', new URL('https://mcp.aka.page/api/test'), { success: true, data: { inventory: { stores: [{ storeName: '품절', realStockQuantity: 0 }, { storeName: '재고', realStockQuantity: 2 }] } } });
    expect(text).toContain('수량 0');
    expect(text).toContain('수량 2');
  });
});
