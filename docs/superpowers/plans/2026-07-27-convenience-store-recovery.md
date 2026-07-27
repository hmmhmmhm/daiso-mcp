# Convenience Store Recovery Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restore SevenEleven through a direct-first Zyte fallback, keep CU inventory connected with an explicit degraded response when all known routes are blocked, and cover every convenience-store surface with sequential health checks.

**Architecture:** Add one shared JSON transport that retries only origin `400`, `403`, and `429` responses through Zyte while preserving method, headers, body, and service tags. Inject the Worker Zyte binding into CU and SevenEleven REST handlers and MCP tool factories. CU converts the currently verified origin/Zyte stock block into typed unavailable data; SevenEleven uses the verified Zyte POST path for normal results.

**Tech Stack:** TypeScript, Hono, Cloudflare Workers, MCP SDK, Vitest, Zyte Extract API, GitHub Actions

---

## File Map

- Create `src/utils/zyteJsonFallback.ts`: direct-first JSON transport and Zyte response validation.
- Create `tests/utils/zyteJsonFallback.test.ts`: transport fallback decision and error coverage.
- Modify `src/services/cu/client.ts`: use the transport for JSON calls and expose typed stock availability.
- Modify `src/services/cu/index.ts`: accept Worker bindings and inject them into MCP tools.
- Modify `src/services/cu/tools/findNearbyStores.ts`: inject Zyte key.
- Modify `src/services/cu/tools/checkInventory.ts`: inject Zyte/Maps keys and return unavailable stock without throwing.
- Modify `src/api/handlers.ts`: pass the Zyte key to CU stock and return availability metadata.
- Modify `src/services/seveneleven/client.ts`: use the shared transport and carry `zyteApiKey`.
- Modify `src/services/seveneleven/productKeyword.ts`: carry `zyteApiKey` through keyword variants.
- Modify `src/services/seveneleven/inventory.ts`: use the shared transport for real stock.
- Modify `src/services/seveneleven/index.ts` and `src/services/seveneleven/tools/*.ts`: inject Zyte key into all MCP tools.
- Modify `src/api/sevenelevenHandlers.ts`: pass the Worker key into all REST calls.
- Modify `src/index.ts`: create CU and SevenEleven services with request bindings.
- Modify focused CU, SevenEleven, handler, service, app, health, and smoke tests.
- Modify `src/api/healthCheckDefinitions.ts` and `scripts/ops/cli-smoke.ts`: add missing convenience-store checks.

### Task 1: Direct-first Zyte JSON transport

**Files:**
- Create: `src/utils/zyteJsonFallback.ts`
- Create: `tests/utils/zyteJsonFallback.test.ts`

- [ ] **Step 1: Write failing transport tests**

Cover direct success, non-block errors, each blocked status, preserved POST body/headers, Zyte target status errors, empty bodies, invalid JSON, and Zyte account errors:

```ts
it.each([400, 403, 429])('origin %s uses Zyte once', async (status) => {
  mockFetch
    .mockResolvedValueOnce(new Response('blocked', { status }))
    .mockResolvedValueOnce(zyteJsonResponse({ success: true }));

  await expect(
    fetchJsonWithZyteFallback('https://example.com/api', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{"query":"coffee"}',
      zyteApiKey: 'test-key',
      zyteTags: { service: 'test' },
    }),
  ).resolves.toEqual({ success: true });

  expect(mockFetch).toHaveBeenCalledTimes(2);
});
```

- [ ] **Step 2: Run the test and confirm RED**

Run:

```bash
npx vitest run tests/utils/zyteJsonFallback.test.ts --maxWorkers=1 --no-file-parallelism
```

Expected: FAIL because `src/utils/zyteJsonFallback.ts` does not exist.

- [ ] **Step 3: Implement the minimal transport**

Use `HttpError`, `fetchJson`, `requestByZyte`, and `decodeZyteHttpBody`. Only fallback on the blocked status allowlist:

```ts
const ZYTE_FALLBACK_STATUSES = new Set([400, 403, 429]);

export interface ZyteJsonFallbackOptions extends FetchOptions {
  zyteApiKey?: string;
  zyteTags?: Record<string, string | null>;
}

export async function fetchJsonWithZyteFallback<T>(
  url: string,
  options: ZyteJsonFallbackOptions = {},
): Promise<T> {
  const { zyteApiKey, zyteTags, ...directOptions } = options;
  try {
    return await fetchJson<T>(url, directOptions);
  } catch (error) {
    if (!(error instanceof HttpError) || !ZYTE_FALLBACK_STATUSES.has(error.status)) {
      throw error;
    }
  }

  const method = normalizeSupportedMethod(directOptions.method);
  const result = await requestByZyte({
    apiKey: zyteApiKey,
    url,
    method,
    timeout: directOptions.timeout,
    headers: toZyteHeaders(directOptions.headers),
    bodyText: typeof directOptions.body === 'string' ? directOptions.body : undefined,
    tags: zyteTags,
  });
  assertSuccessfulTarget(result);
  return decodeZyteHttpBody<T>(result);
}
```

- [ ] **Step 4: Run the test and confirm GREEN**

Run the Task 1 command again. Expected: all transport tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/utils/zyteJsonFallback.ts tests/utils/zyteJsonFallback.test.ts
git commit -m "feat: 차단 응답용 Zyte JSON 폴백 추가"
```

### Task 2: CU REST and MCP degraded stock recovery

**Files:**
- Modify: `src/services/cu/client.ts`
- Modify: `src/services/cu/index.ts`
- Modify: `src/services/cu/tools/findNearbyStores.ts`
- Modify: `src/services/cu/tools/checkInventory.ts`
- Modify: `src/api/handlers.ts`
- Modify: `src/index.ts`
- Test: `tests/services/cu/client.test.ts`
- Test: `tests/services/cu/index.test.ts`
- Test: `tests/services/cu/tools/checkInventory.test.ts`
- Test: `tests/services/cu/tools/findNearbyStores.test.ts`
- Test: `tests/api/cu-handlers.test.ts`
- Test: `tests/app/app-api-cu.test.ts`

- [ ] **Step 1: Write failing CU tests**

Assert that stock origin `403` invokes Zyte, successful Zyte JSON is normalized, a Zyte `520 Website Ban` becomes unavailable data, and the Worker key reaches REST and MCP paths:

```ts
expect(result).toEqual({
  available: false,
  unavailableReason: expect.stringContaining('Website Ban'),
  totalCount: 0,
  spellModifyYn: 'N',
  items: [],
});
```

Also assert direct `200` makes no Zyte call and unrelated `500` still throws.

- [ ] **Step 2: Run focused CU tests and confirm RED**

```bash
npx vitest run tests/services/cu/client.test.ts tests/services/cu/index.test.ts tests/services/cu/tools/checkInventory.test.ts tests/services/cu/tools/findNearbyStores.test.ts tests/api/cu-handlers.test.ts tests/app/app-api-cu.test.ts --maxWorkers=1 --no-file-parallelism
```

Expected: failures for missing availability data and missing key injection.

- [ ] **Step 3: Implement CU transport and typed unavailable result**

Change `requestCuJson` to accept `RequestOptions`, use the shared transport, and tag requests:

```ts
return fetchJsonWithZyteFallback<T>(`${CU_API.BASE_URL}${path}`, {
  method: 'POST',
  timeout: options.timeout,
  headers: CU_DEFAULT_HEADERS,
  body: JSON.stringify(body),
  zyteApiKey: options.apiKey,
  zyteTags: { service: 'cu' },
});
```

Extend stock results with:

```ts
interface CuStockResult {
  available: boolean;
  unavailableReason: string | null;
  totalCount: number;
  spellModifyYn: string;
  items: CuStockItem[];
}
```

Keep the optional stock-display warmup direct-only because its failure is ignored and a paid fallback cannot share session state with the main request.

Only convert verified block signatures (`HttpError` 400/403/429 or Zyte 520 Website Ban) to `available: false`; preserve all other errors.

- [ ] **Step 4: Inject CU bindings into REST and MCP**

Use service options instead of `process.env`:

```ts
export interface CuServiceOptions {
  zyteApiKey?: string;
  googleMapsApiKey?: string;
}

export function createCuService(options: CuServiceOptions = {}): ServiceProvider {
  return new CuService(options);
}
```

Pass `c.env.ZYTE_API_KEY` to `fetchCuStock`. Return `inventory.available` and `inventory.unavailableReason` in both REST and MCP data.

- [ ] **Step 5: Run focused CU tests and confirm GREEN**

Run the Task 2 command again. Expected: all focused CU tests pass.

- [ ] **Step 6: Check touched source sizes**

```bash
npm run check:source-lines
```

Expected: every source file remains at or below 450 lines.

- [ ] **Step 7: Commit**

```bash
git add src/services/cu src/api/handlers.ts src/index.ts tests/services/cu tests/api/cu-handlers.test.ts tests/app/app-api-cu.test.ts
git commit -m "fix: CU 재고 차단 시 연결 유지"
```

### Task 3: SevenEleven client fallback

**Files:**
- Modify: `src/services/seveneleven/client.ts`
- Modify: `src/services/seveneleven/productKeyword.ts`
- Test: `tests/services/seveneleven/client.test.ts`
- Test: `tests/services/seveneleven/productKeyword.test.ts`

- [ ] **Step 1: Write failing client tests**

For product, store, popword, product-meta, and catalog transports, return origin `403` then a Zyte `200` Base64 response. Assert normalized results and the second request body contains the original URL, POST body, and `tags.service === "seveneleven"`.

- [ ] **Step 2: Run focused client tests and confirm RED**

```bash
npx vitest run tests/services/seveneleven/client.test.ts tests/services/seveneleven/productKeyword.test.ts --maxWorkers=1 --no-file-parallelism
```

Expected: origin `403` errors because no fallback exists.

- [ ] **Step 3: Implement client fallback and option propagation**

Export and reuse:

```ts
export interface SevenElevenRequestOptions {
  timeout?: number;
  zyteApiKey?: string;
}
```

Replace direct JSON calls with:

```ts
return fetchJsonWithZyteFallback<SevenElevenApiEnvelope<T>>(url, {
  ...SEVENELEVEN_DEFAULT_FETCH_OPTIONS,
  method,
  retryUnsafeMethods: method === 'POST',
  timeout,
  headers: SEVENELEVEN_DEFAULT_HEADERS,
  body: method === 'POST' ? JSON.stringify(body || {}) : undefined,
  zyteApiKey,
  zyteTags: { service: 'seveneleven' },
});
```

Carry `zyteApiKey` through keyword variant searches and catalog requests.

- [ ] **Step 4: Run focused client tests and confirm GREEN**

Run the Task 3 command again. Expected: all focused SevenEleven client tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/services/seveneleven/client.ts src/services/seveneleven/productKeyword.ts tests/services/seveneleven/client.test.ts tests/services/seveneleven/productKeyword.test.ts
git commit -m "fix: 세븐일레븐 조회에 Zyte 폴백 적용"
```

### Task 4: SevenEleven inventory, REST, and MCP binding injection

**Files:**
- Modify: `src/services/seveneleven/inventory.ts`
- Modify: `src/services/seveneleven/index.ts`
- Modify: `src/services/seveneleven/tools/checkInventory.ts`
- Modify: `src/services/seveneleven/tools/getCatalogSnapshot.ts`
- Modify: `src/services/seveneleven/tools/getSearchPopwords.ts`
- Modify: `src/services/seveneleven/tools/searchProducts.ts`
- Modify: `src/services/seveneleven/tools/searchStores.ts`
- Modify: `src/api/sevenelevenHandlers.ts`
- Modify: `src/index.ts`
- Test: `tests/services/seveneleven/index.test.ts`
- Test: `tests/services/seveneleven/tools/*.test.ts`
- Test: `tests/api/seveneleven-handlers.test.ts`
- Test: `tests/app/app-api-seveneleven.test.ts`

- [ ] **Step 1: Write failing binding and inventory tests**

Assert a configured key is included in real-stock Zyte fallback and every REST/MCP entry point:

```ts
const service = createSevenElevenService({ zyteApiKey: 'worker-key' });
await service.getTools().find((tool) => tool.name === 'seveneleven_search_products')!.handler({
  query: '커피',
});
expect(readZyteRequest(mockFetch)).toMatchObject({
  tags: { service: 'seveneleven' },
});
```

- [ ] **Step 2: Run focused tests and confirm RED**

```bash
npx vitest run tests/services/seveneleven/index.test.ts tests/services/seveneleven/tools tests/api/seveneleven-handlers.test.ts tests/app/app-api-seveneleven.test.ts --maxWorkers=1 --no-file-parallelism
```

Expected: configured key is not propagated.

- [ ] **Step 3: Implement inventory fallback**

Replace `tryStockApi` direct transport with `fetchJsonWithZyteFallback`, passing `options.zyteApiKey` and the service tag. Preserve the existing graceful stock-error behavior for encrypted real-stock failures.

- [ ] **Step 4: Inject key through REST and MCP**

Add `SevenElevenServiceOptions`, capture it in the provider, and pass the key to every tool factory without exposing it in tool schemas:

```ts
export function createSevenElevenService(
  options: SevenElevenServiceOptions = {},
): ServiceProvider {
  return new SevenElevenService(options);
}
```

Update `src/index.ts` factories:

```ts
() => createSevenElevenService({ zyteApiKey: bindings?.ZYTE_API_KEY }),
() => createCuService({
  zyteApiKey: bindings?.ZYTE_API_KEY,
  googleMapsApiKey: bindings?.GOOGLE_MAPS_API_KEY,
}),
```

- [ ] **Step 5: Run focused tests and confirm GREEN**

Run the Task 4 command again. Expected: all SevenEleven REST, MCP, and inventory tests pass.

- [ ] **Step 6: Commit**

```bash
git add src/services/seveneleven src/api/sevenelevenHandlers.ts src/index.ts tests/services/seveneleven tests/api/seveneleven-handlers.test.ts tests/app/app-api-seveneleven.test.ts
git commit -m "fix: 세븐일레븐 Worker 키 전달 복구"
```

### Task 5: Complete convenience-store health coverage

**Files:**
- Modify: `src/api/healthCheckDefinitions.ts`
- Modify: `scripts/ops/cli-smoke.ts`
- Test: `tests/api/health-checks.test.ts`
- Test: `tests/app/app-health-checks.test.ts`
- Test: `tests/scripts/cli-smoke.test.ts`

- [ ] **Step 1: Write failing health-definition tests**

Require these check IDs:

```ts
expect(ids).toEqual(expect.arrayContaining([
  'cu.stores',
  'cu.inventory',
  'gs25.stores',
  'gs25.products',
  'gs25.inventory',
  'seveneleven.stores',
  'seveneleven.products',
  'seveneleven.inventory',
  'seveneleven.popwords',
  'emart24.stores',
  'emart24.products',
  'emart24.inventory',
]));
```

Require a CU CLI smoke command and sequential health execution.

- [ ] **Step 2: Run focused health tests and confirm RED**

```bash
npx vitest run tests/api/health-checks.test.ts tests/app/app-health-checks.test.ts tests/scripts/cli-smoke.test.ts --maxWorkers=1 --no-file-parallelism
```

Expected: missing store/popword definitions and CU CLI smoke scenario.

- [ ] **Step 3: Add missing definitions and smoke command**

Use `limit=1`/`size=1`, stable Korean keywords, existing collection keys, and upstream degraded patterns. Add:

```ts
{
  id: 'seveneleven.stores',
  service: 'seveneleven',
  target: 'stores',
  mode: 'quick',
  path: '/api/seveneleven/stores?keyword=%EA%B0%95%EB%82%A8&limit=1',
  collectionKey: 'stores',
  requiredFields: ['storeCode', 'storeName', 'name'],
  degradedFailurePatterns: SEVENELEVEN_UPSTREAM_403_PATTERNS,
}
```

Add equivalent Emart24 store and SevenEleven popword checks. Add `cu-stores 강남 --limit 1 --json` to CLI smoke.

- [ ] **Step 4: Run focused health tests and confirm GREEN**

Run the Task 5 command again. Expected: all focused health/smoke tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/api/healthCheckDefinitions.ts scripts/ops/cli-smoke.ts tests/api/health-checks.test.ts tests/app/app-health-checks.test.ts tests/scripts/cli-smoke.test.ts
git commit -m "test: 편의점 전체 운영 점검 범위 확장"
```

### Task 6: Sequential repository verification

**Files:**
- Verify only

- [ ] **Step 1: Run format check**

```bash
npm run format:check
```

- [ ] **Step 2: Run ESLint**

```bash
npm run lint
```

- [ ] **Step 3: Run Biome**

```bash
npm run lint:biome
```

- [ ] **Step 4: Run typecheck**

```bash
npm run typecheck
```

- [ ] **Step 5: Run source line limit**

```bash
npm run check:source-lines
```

- [ ] **Step 6: Run all tests sequentially**

```bash
npx vitest run --maxWorkers=1 --no-file-parallelism
```

- [ ] **Step 7: Run coverage sequentially**

```bash
npx vitest run --coverage --maxWorkers=1 --no-file-parallelism
```

- [ ] **Step 8: Build**

```bash
npm run build
```

- [ ] **Step 9: Inspect the final diff**

```bash
git diff --check
git status --short
git diff origin/main...HEAD
```

Expected: no whitespace errors, no accidental secret material, and only scoped recovery changes.

### Task 7: PR, CI/CD, and production verification

**Files:**
- No source changes expected

- [ ] **Step 1: Push and open PR**

```bash
git push -u origin fix/convenience-store-recovery
gh pr create --repo hmmhmmhm/daiso-mcp --base main --head fix/convenience-store-recovery
```

- [ ] **Step 2: Wait for every required CI job**

```bash
gh pr checks --repo hmmhmmhm/daiso-mcp --watch
```

Expected: all required jobs pass.

- [ ] **Step 3: Merge and wait for deploy**

```bash
gh pr merge --repo hmmhmmhm/daiso-mcp --squash --delete-branch
```

Watch the deploy workflow until it completes successfully.

- [ ] **Step 4: Run production checks one at a time**

Run CU store, CU inventory, GS25 product/store/inventory, SevenEleven product/store/inventory/popword, and Emart24 product/store/inventory sequentially. Expected:

- CU store: success
- CU inventory: success envelope with either live items or `available: false`
- GS25: success
- SevenEleven: success through direct or Zyte
- Emart24: success

- [ ] **Step 5: Dispatch full health workflow**

```bash
gh workflow run health-checks.yml --repo hmmhmmhm/daiso-mcp --ref main
```

Expected: convenience checks are `ok`, except CU inventory may be `degraded` with an explicit upstream-unavailable reason; no convenience check is `fail`.
