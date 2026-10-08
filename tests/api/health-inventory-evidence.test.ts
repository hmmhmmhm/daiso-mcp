import { describe, expect, it, vi } from 'vitest';
import { HEALTH_CHECKS } from '../../src/api/healthCheckDefinitions.js';
import { runHealthChecks } from '../../src/api/healthChecks.js';
import { healthFailureDiagnostics, hasCheckedStoreStock } from '../../src/api/healthCheckEvidence.js';

describe('실제 재고 헬스체크', () => {
  it('할당량 이외 진단과 잘못된 재시도 시간을 구분한다', () => {
    expect(healthFailureDiagnostics({})).toEqual({});
    expect(healthFailureDiagnostics({ diagnostics: {} })).toEqual({});
    expect(healthFailureDiagnostics({ error: { code: 'UPSTREAM_FAILED' }, diagnostics: { upstreamStatus: 403, quotaReason: 'vendor', retryAfter: 1 } })).toEqual({ errorCode: 'UPSTREAM_FAILED', upstreamStatus: 403 });
    for (const reason of ['minute', 'daily', 'consumer', 'consumer-busy']) {
      expect(healthFailureDiagnostics({ diagnostics: { quotaReason: reason, retryAfter: 1 } })).toEqual({ quotaReason: reason, retryAfter: 1 });
      for (const retryAfter of [undefined, '1', 0, -1, 0.5, 86401]) {
        expect(healthFailureDiagnostics({ diagnostics: { quotaReason: reason, retryAfter } })).toEqual({ quotaReason: reason });
      }
    }
  });
  it('0개는 확인된 품절이고 미확인 수량은 확인 실패다', () => {
    expect(hasCheckedStoreStock('daiso.products', null)).toBe(true);
    for (const value of [null, 'bad', {}, { nearbyStores: {} }, { nearbyStores: { stores: [] } }]) expect(hasCheckedStoreStock('cu.inventory', value)).toBe(false);
    for (const stock of [undefined, '0', -1, NaN, Infinity]) expect(hasCheckedStoreStock('cu.inventory', { nearbyStores: { stores: [{ stock }] } })).toBe(false);
    expect(hasCheckedStoreStock('cu.inventory', { nearbyStores: { stores: [{ stock: 0 }] } })).toBe(true);
    for (const id of ['gs25.inventory', 'seveneleven.inventory']) {
      for (const data of [{}, { inventory: {} }]) expect(hasCheckedStoreStock(id, data)).toBe(false);
      expect(hasCheckedStoreStock(id, { inventory: { stores: [{ realStockQuantity: 0, stockQuantity: 0 }] } })).toBe(true);
      expect(hasCheckedStoreStock(id, { inventory: { stores: [{ realStockQuantity: -1, stockQuantity: -1 }] } })).toBe(false);
    }
    expect(hasCheckedStoreStock('oliveyoung.inventory', { inventory: { stockCheckedCount: 1 } })).toBe(false);
    for (const product of [{ stockStatus: 'out_of_stock' }, { stockSource: 'nearby_store' }, { stockSource: 'nearby_store', storeInventory: {} }, { stockSource: 'nearby_store', storeInventory: { stores: [] } }, { stockSource: 'nearby_store', storeInventory: { stores: [{ stockStatus: 'unknown' }] } }]) expect(hasCheckedStoreStock('oliveyoung.inventory', { inventory: { stockCheckedCount: 1, products: [product] } })).toBe(false);
    expect(hasCheckedStoreStock('oliveyoung.inventory', { inventory: { stockCheckedCount: 1, products: [{ stockStatus: 'unknown' }] } })).toBe(false);
    for (const data of [{}, { inventory: {} }, { inventory: { stockCheckedCount: 0 } }]) expect(hasCheckedStoreStock('oliveyoung.inventory', data)).toBe(false);
    expect(hasCheckedStoreStock('oliveyoung.inventory', { inventory: { stockCheckedCount: 1, products: [{ stockSource: 'nearby_store', storeInventory: { stores: [{ stockStatus: 'in_stock' }] } }] } })).toBe(true);
  });
  it('편의점과 올리브영은 한 매장 실제 재고를 요청한다', () => {
    for (const id of ['cu.inventory', 'gs25.inventory', 'seveneleven.inventory', 'oliveyoung.inventory']) {
      const url = new URL(HEALTH_CHECKS.find(check => check.id === id)!.path, 'https://test.invalid');
      expect(url.searchParams.get('storeLimit')).toBe('1');
      if (id === 'cu.inventory') expect(url.searchParams.get('storeCheck')).toBe('true');
      if (id === 'oliveyoung.inventory') expect(url.searchParams.get('stockCheckLimit')).toBe('1');
    }
  });
  it.each(['cu.inventory', 'oliveyoung.inventory', 'gs25.inventory', 'seveneleven.inventory'])('상품만 받은 %s 응답은 정상 재고로 표시하지 않는다', async check => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response(JSON.stringify({ success: true, data: {
      inventory: { items: [{ itemCode: 'C1' }], products: [{ goodsNumber: 'A1' }], stores: [{ storeCode: 'S1' }] }, stores: [{ storeCode: 'S1' }],
    }, meta: { total: 1 } })));
    const result = await runHealthChecks({ baseUrl: 'https://test.invalid', check, mode: 'deep', fresh: true, fetchImpl });
    expect(result.checks[0]).toMatchObject({ status: 'fail', message: 'store stock was not verified' });
  });
  it('자체 할당량 사유와 재시도 시간을 결과에 보존한다', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response(JSON.stringify({ success: false,
      error: { code: 'GS25_RELAY_QUOTA_EXCEEDED', message: 'quota exceeded' },
      diagnostics: { quotaReason: 'minute', retryAfter: 37, upstreamStatus: 429 },
    }), { status: 429 }));
    const result = await runHealthChecks({ baseUrl: 'https://test.invalid', check: 'gs25.inventory', mode: 'deep', fresh: true, fetchImpl });
    expect(result.checks[0]).toMatchObject({ status: 'fail', errorCode: 'GS25_RELAY_QUOTA_EXCEEDED', quotaReason: 'minute', retryAfter: 37, upstreamStatus: 429 });
  });
});
