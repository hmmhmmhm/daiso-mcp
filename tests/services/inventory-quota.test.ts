import { afterEach, expect, it, vi } from 'vitest';
import * as cu from '../../src/services/cu/client.js';
import * as seven from '../../src/services/seveneleven/productKeyword.js';
import { ServiceError } from '../../src/core/errors.js';
import { createCheckInventoryTool } from '../../src/services/cu/tools/checkInventory.js';
import { createSearchProductsTool } from '../../src/services/seveneleven/tools/searchProducts.js';
afterEach(() => vi.restoreAllMocks());
it('CU store quota propagates to MCP diagnostics', async () => {
  const error = new ServiceError('UPSTREAM_RATE_LIMITED', 'quota', 429, true);
  vi.spyOn(cu, 'fetchCuStock').mockResolvedValue({ available:true, unavailableReason:null, totalCount:0, items:[], spellModifyYn:'' });
  vi.spyOn(cu, 'fetchCuStores').mockRejectedValue(error);
  await expect(createCheckInventoryTool().handler({keyword:'콜라',latitude:37,longitude:127})).rejects.toBe(error);
});
it('Seven search quota does not become a degraded empty search', async () => {
  const error = new ServiceError('UPSTREAM_RATE_LIMITED', 'quota', 429, true);
  vi.spyOn(seven, 'searchSevenElevenProductsWithVariants').mockRejectedValue(error);
  await expect(createSearchProductsTool().handler({query:'콜라'})).rejects.toBe(error);
});
