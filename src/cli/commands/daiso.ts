/**
 * 다이소 관련 CLI 명령 핸들러
 */

import { printCommandHelp } from '../../cliHelp.js';
import type { CliDeps } from '../types.js';
import { findUnknownOption, parseCliArgs, toUrl, applyOptionsToQuery, toQueryOptions } from '../args.js';
import { requestAndPrintResponse, requestAndPrintStoresWithKeywordFallback } from '../http.js';

export async function handleGet(options: string[], deps: CliDeps): Promise<number> {
  const parsed = parseCliArgs(options);
  if (parsed.options.help === 'true') {
    return printCommandHelp('get', deps.writeOut, deps.writeErr);
  }

  const targetPath = parsed.positionals[0];
  if (!targetPath) {
    deps.writeErr('get 명령은 경로가 필요합니다. 예: daiso get /api/daiso/products --q 수납박스');
    return 1;
  }

  const targetUrl = toUrl(targetPath);
  applyOptionsToQuery(targetUrl, toQueryOptions(parsed.options));
  return await requestAndPrintResponse(
    deps.fetchImpl,
    deps.writeOut,
    deps.writeErr,
    targetUrl,
    'get',
    parsed.options.json === 'true',
  );
}

export async function handleProducts(options: string[], deps: CliDeps): Promise<number> {
  const parsed = parseCliArgs(options);
  if (parsed.options.help === 'true') {
    return printCommandHelp('products', deps.writeOut, deps.writeErr);
  }

  const query = parsed.positionals[0];
  if (!query) {
    deps.writeErr('products 명령은 검색어가 필요합니다. 예: daiso products 수납박스');
    return 1;
  }

  const targetUrl = toUrl('/api/daiso/products');
  targetUrl.searchParams.set('q', query);
  applyOptionsToQuery(targetUrl, toQueryOptions(parsed.options));
  return await requestAndPrintResponse(
    deps.fetchImpl,
    deps.writeOut,
    deps.writeErr,
    targetUrl,
    'products',
    parsed.options.json === 'true',
  );
}

export async function handleProduct(options: string[], deps: CliDeps): Promise<number> {
  const parsed = parseCliArgs(options);
  if (parsed.options.help === 'true') {
    return printCommandHelp('product', deps.writeOut, deps.writeErr);
  }

  const productId = parsed.positionals[0];
  if (!productId) {
    deps.writeErr('product 명령은 제품 ID가 필요합니다. 예: daiso product 1034604');
    return 1;
  }

  const targetUrl = toUrl(`/api/daiso/products/${productId}`);
  applyOptionsToQuery(targetUrl, toQueryOptions(parsed.options));
  return await requestAndPrintResponse(
    deps.fetchImpl,
    deps.writeOut,
    deps.writeErr,
    targetUrl,
    'product',
    parsed.options.json === 'true',
  );
}

export async function handleStores(options: string[], deps: CliDeps): Promise<number> {
  const parsed = parseCliArgs(options);
  if (parsed.options.help === 'true') {
    return printCommandHelp('stores', deps.writeOut, deps.writeErr);
  }

  const keyword = parsed.positionals[0];
  if (keyword) {
    parsed.options.keyword = keyword;
  }

  if (!parsed.options.keyword && !parsed.options.sido) {
    deps.writeErr(
      'stores 명령은 keyword 또는 --sido가 필요합니다. 예: daiso stores 강남역 / daiso stores --sido 서울',
    );
    return 1;
  }

  return await requestAndPrintStoresWithKeywordFallback(
    deps.fetchImpl,
    deps.writeOut,
    deps.writeErr,
    toQueryOptions(parsed.options),
    parsed.options.json === 'true',
  );
}

export async function handleInventory(options: string[], deps: CliDeps): Promise<number> {
  const parsed = parseCliArgs(options);
  if (parsed.options.help === 'true') {
    return printCommandHelp('inventory', deps.writeOut, deps.writeErr);
  }

  const unknownOption = findUnknownOption(parsed.options, [
    'help',
    'json',
    'keyword',
    'lat',
    'lng',
    'page',
    'pageSize',
  ]);
  if (unknownOption) {
    deps.writeErr(`알 수 없는 옵션: --${unknownOption}`);
    deps.writeErr('매장명은 --keyword로 전달하세요. 예: daiso inventory 1034604 --keyword 강남역');
    return 1;
  }

  const productId = parsed.positionals[0];
  if (!productId) {
    deps.writeErr(
      'inventory 명령은 제품 ID가 필요합니다. 제품명만 알면 먼저 daiso products 수납박스 명령으로 productId를 확인하세요. 예: daiso inventory 1034604 --keyword 강남역',
    );
    return 1;
  }

  const targetUrl = toUrl('/api/daiso/inventory');
  targetUrl.searchParams.set('productId', productId);
  applyOptionsToQuery(targetUrl, toQueryOptions(parsed.options));
  return await requestAndPrintResponse(
    deps.fetchImpl,
    deps.writeOut,
    deps.writeErr,
    targetUrl,
    'inventory',
    parsed.options.json === 'true',
  );
}

export async function handleDisplayLocation(options: string[], deps: CliDeps): Promise<number> {
  const parsed = parseCliArgs(options);
  if (parsed.options.help === 'true') {
    return printCommandHelp('display-location', deps.writeOut, deps.writeErr);
  }

  const productId = parsed.positionals[0];
  const storeCode = parsed.positionals[1];

  if (!productId || !storeCode) {
    deps.writeErr(
      'display-location 명령은 productId와 storeCode가 필요합니다. storeCode를 모르면 먼저 daiso inventory 1034604 --keyword 매장명 결과의 storeInventory.stores[].storeCode를 확인하세요. 예: daiso display-location 1034604 04515',
    );
    return 1;
  }

  const targetUrl = toUrl('/api/daiso/display-location');
  targetUrl.searchParams.set('productId', productId);
  targetUrl.searchParams.set('storeCode', storeCode);
  applyOptionsToQuery(targetUrl, toQueryOptions(parsed.options));
  return await requestAndPrintResponse(
    deps.fetchImpl,
    deps.writeOut,
    deps.writeErr,
    targetUrl,
    'display-location',
    parsed.options.json === 'true',
  );
}
