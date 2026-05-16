/**
 * 편의점 및 기타 서비스 CLI 명령 핸들러
 * (CU, 이마트24, 롯데마트, GS25, 세븐일레븐, 롯데시네마)
 */

import { printCommandHelp } from '../../cliHelp.js';
import type { CliDeps } from '../types.js';
import { parseCliArgs, toUrl, applyOptionsToQuery, toQueryOptions } from '../args.js';
import { requestAndPrintResponse } from '../http.js';

export async function handleCuStores(options: string[], deps: CliDeps): Promise<number> {
  const parsed = parseCliArgs(options);
  if (parsed.options.help === 'true') {
    return printCommandHelp('cu-stores', deps.writeOut, deps.writeErr);
  }

  const keyword = parsed.positionals[0];
  if (keyword) {
    parsed.options.keyword = keyword;
  }

  const targetUrl = toUrl('/api/cu/stores');
  applyOptionsToQuery(targetUrl, toQueryOptions(parsed.options));
  return await requestAndPrintResponse(
    deps.fetchImpl, deps.writeOut, deps.writeErr,
    targetUrl, 'cu-stores', parsed.options.json === 'true',
  );
}

export async function handleCuInventory(options: string[], deps: CliDeps): Promise<number> {
  const parsed = parseCliArgs(options);
  if (parsed.options.help === 'true') {
    return printCommandHelp('cu-inventory', deps.writeOut, deps.writeErr);
  }

  const keyword = parsed.positionals[0];
  if (!keyword) {
    deps.writeErr('cu-inventory 명령은 검색어가 필요합니다. 예: daiso cu-inventory 과자');
    return 1;
  }

  const targetUrl = toUrl('/api/cu/inventory');
  targetUrl.searchParams.set('keyword', keyword);
  applyOptionsToQuery(targetUrl, toQueryOptions(parsed.options));
  return await requestAndPrintResponse(
    deps.fetchImpl, deps.writeOut, deps.writeErr,
    targetUrl, 'cu-inventory', parsed.options.json === 'true',
  );
}

export async function handleEmart24Stores(options: string[], deps: CliDeps): Promise<number> {
  const parsed = parseCliArgs(options);
  if (parsed.options.help === 'true') {
    return printCommandHelp('emart24-stores', deps.writeOut, deps.writeErr);
  }

  const keyword = parsed.positionals[0];
  if (keyword) {
    parsed.options.keyword = keyword;
  }

  const targetUrl = toUrl('/api/emart24/stores');
  applyOptionsToQuery(targetUrl, toQueryOptions(parsed.options));
  return await requestAndPrintResponse(
    deps.fetchImpl, deps.writeOut, deps.writeErr,
    targetUrl, 'emart24-stores', parsed.options.json === 'true',
  );
}

export async function handleEmart24Products(options: string[], deps: CliDeps): Promise<number> {
  const parsed = parseCliArgs(options);
  if (parsed.options.help === 'true') {
    return printCommandHelp('emart24-products', deps.writeOut, deps.writeErr);
  }

  const keyword = parsed.positionals[0];
  if (!keyword) {
    deps.writeErr('emart24-products 명령은 검색어가 필요합니다. 예: daiso emart24-products 두바이');
    return 1;
  }

  const targetUrl = toUrl('/api/emart24/products');
  targetUrl.searchParams.set('keyword', keyword);
  applyOptionsToQuery(targetUrl, toQueryOptions(parsed.options));
  return await requestAndPrintResponse(
    deps.fetchImpl, deps.writeOut, deps.writeErr,
    targetUrl, 'emart24-products', parsed.options.json === 'true',
  );
}

export async function handleEmart24Inventory(options: string[], deps: CliDeps): Promise<number> {
  const parsed = parseCliArgs(options);
  if (parsed.options.help === 'true') {
    return printCommandHelp('emart24-inventory', deps.writeOut, deps.writeErr);
  }

  const pluCd = parsed.positionals[0];
  const bizNoArr = parsed.options.bizNoArr;
  if (!pluCd || !bizNoArr) {
    deps.writeErr(
      'emart24-inventory 명령은 pluCd와 --bizNoArr가 필요합니다. 예: daiso emart24-inventory 8800244010504 --bizNoArr 28339,05015',
    );
    return 1;
  }

  const targetUrl = toUrl('/api/emart24/inventory');
  targetUrl.searchParams.set('pluCd', pluCd);
  applyOptionsToQuery(targetUrl, toQueryOptions(parsed.options));
  return await requestAndPrintResponse(
    deps.fetchImpl, deps.writeOut, deps.writeErr,
    targetUrl, 'emart24-inventory', parsed.options.json === 'true',
  );
}

export async function handleLotteMartStores(options: string[], deps: CliDeps): Promise<number> {
  const parsed = parseCliArgs(options);
  if (parsed.options.help === 'true') {
    return printCommandHelp('lottemart-stores', deps.writeOut, deps.writeErr);
  }

  const keyword = parsed.positionals[0];
  if (keyword) {
    parsed.options.keyword = keyword;
  }

  const targetUrl = toUrl('/api/lottemart/stores');
  applyOptionsToQuery(targetUrl, toQueryOptions(parsed.options));
  return await requestAndPrintResponse(
    deps.fetchImpl, deps.writeOut, deps.writeErr,
    targetUrl, 'lottemart-stores', parsed.options.json === 'true',
  );
}

export async function handleLotteMartProducts(options: string[], deps: CliDeps): Promise<number> {
  const parsed = parseCliArgs(options);
  if (parsed.options.help === 'true') {
    return printCommandHelp('lottemart-products', deps.writeOut, deps.writeErr);
  }

  const keyword = parsed.positionals[0];
  if (!keyword) {
    deps.writeErr('lottemart-products 명령은 검색어가 필요합니다. 예: daiso lottemart-products 콜라 --storeName 강변점');
    return 1;
  }

  if (!parsed.options.storeCode && !parsed.options.storeName) {
    deps.writeErr('lottemart-products 명령은 --storeCode 또는 --storeName이 필요합니다. 예: daiso lottemart-products 콜라 --storeName 강변점');
    return 1;
  }

  const targetUrl = toUrl('/api/lottemart/products');
  targetUrl.searchParams.set('keyword', keyword);
  applyOptionsToQuery(targetUrl, toQueryOptions(parsed.options));
  return await requestAndPrintResponse(
    deps.fetchImpl, deps.writeOut, deps.writeErr,
    targetUrl, 'lottemart-products', parsed.options.json === 'true',
  );
}

export async function handleGs25Stores(options: string[], deps: CliDeps): Promise<number> {
  const parsed = parseCliArgs(options);
  if (parsed.options.help === 'true') {
    return printCommandHelp('gs25-stores', deps.writeOut, deps.writeErr);
  }

  const keyword = parsed.positionals[0];
  if (keyword) {
    parsed.options.keyword = keyword;
  }

  const targetUrl = toUrl('/api/gs25/stores');
  applyOptionsToQuery(targetUrl, toQueryOptions(parsed.options));
  return await requestAndPrintResponse(
    deps.fetchImpl, deps.writeOut, deps.writeErr,
    targetUrl, 'gs25-stores', parsed.options.json === 'true',
  );
}

export async function handleGs25Products(options: string[], deps: CliDeps): Promise<number> {
  const parsed = parseCliArgs(options);
  if (parsed.options.help === 'true') {
    return printCommandHelp('gs25-products', deps.writeOut, deps.writeErr);
  }

  const keyword = parsed.positionals[0];
  if (!keyword) {
    deps.writeErr('gs25-products 명령은 검색어가 필요합니다. 예: daiso gs25-products 오감자');
    return 1;
  }

  const targetUrl = toUrl('/api/gs25/products');
  targetUrl.searchParams.set('keyword', keyword);
  applyOptionsToQuery(targetUrl, toQueryOptions(parsed.options));
  return await requestAndPrintResponse(
    deps.fetchImpl, deps.writeOut, deps.writeErr,
    targetUrl, 'gs25-products', parsed.options.json === 'true',
  );
}

export async function handleGs25Inventory(options: string[], deps: CliDeps): Promise<number> {
  const parsed = parseCliArgs(options);
  if (parsed.options.help === 'true') {
    return printCommandHelp('gs25-inventory', deps.writeOut, deps.writeErr);
  }

  const keyword = parsed.positionals[0];
  if (!keyword) {
    deps.writeErr('gs25-inventory 명령은 검색어가 필요합니다. 예: daiso gs25-inventory 오감자');
    return 1;
  }

  const targetUrl = toUrl('/api/gs25/inventory');
  targetUrl.searchParams.set('keyword', keyword);
  applyOptionsToQuery(targetUrl, toQueryOptions(parsed.options));
  return await requestAndPrintResponse(
    deps.fetchImpl, deps.writeOut, deps.writeErr,
    targetUrl, 'gs25-inventory', parsed.options.json === 'true',
  );
}

export async function handleSevenElevenProducts(options: string[], deps: CliDeps): Promise<number> {
  const parsed = parseCliArgs(options);
  if (parsed.options.help === 'true') {
    return printCommandHelp('seveneleven-products', deps.writeOut, deps.writeErr);
  }

  const query = parsed.positionals[0];
  if (!query) {
    deps.writeErr(
      'seveneleven-products 명령은 검색어가 필요합니다. 예: daiso seveneleven-products 삼각김밥',
    );
    return 1;
  }

  const targetUrl = toUrl('/api/seveneleven/products');
  targetUrl.searchParams.set('query', query);
  applyOptionsToQuery(targetUrl, toQueryOptions(parsed.options));
  return await requestAndPrintResponse(
    deps.fetchImpl, deps.writeOut, deps.writeErr,
    targetUrl, 'seveneleven-products', parsed.options.json === 'true',
  );
}

export async function handleSevenElevenStores(options: string[], deps: CliDeps): Promise<number> {
  const parsed = parseCliArgs(options);
  if (parsed.options.help === 'true') {
    return printCommandHelp('seveneleven-stores', deps.writeOut, deps.writeErr);
  }

  const keyword = parsed.positionals[0];
  if (!keyword) {
    deps.writeErr(
      'seveneleven-stores 명령은 검색어가 필요합니다. 예: daiso seveneleven-stores 안산 중앙역',
    );
    return 1;
  }

  const targetUrl = toUrl('/api/seveneleven/stores');
  targetUrl.searchParams.set('keyword', keyword);
  applyOptionsToQuery(targetUrl, toQueryOptions(parsed.options));
  return await requestAndPrintResponse(
    deps.fetchImpl, deps.writeOut, deps.writeErr,
    targetUrl, 'seveneleven-stores', parsed.options.json === 'true',
  );
}

export async function handleSevenElevenPopwords(options: string[], deps: CliDeps): Promise<number> {
  const parsed = parseCliArgs(options);
  if (parsed.options.help === 'true') {
    return printCommandHelp('seveneleven-popwords', deps.writeOut, deps.writeErr);
  }

  const targetUrl = toUrl('/api/seveneleven/popwords');
  applyOptionsToQuery(targetUrl, toQueryOptions(parsed.options));
  return await requestAndPrintResponse(
    deps.fetchImpl, deps.writeOut, deps.writeErr,
    targetUrl, 'seveneleven-popwords', parsed.options.json === 'true',
  );
}

export async function handleSevenElevenCatalog(options: string[], deps: CliDeps): Promise<number> {
  const parsed = parseCliArgs(options);
  if (parsed.options.help === 'true') {
    return printCommandHelp('seveneleven-catalog', deps.writeOut, deps.writeErr);
  }

  const targetUrl = toUrl('/api/seveneleven/catalog');
  applyOptionsToQuery(targetUrl, toQueryOptions(parsed.options));
  return await requestAndPrintResponse(
    deps.fetchImpl, deps.writeOut, deps.writeErr,
    targetUrl, 'seveneleven-catalog', parsed.options.json === 'true',
  );
}

export async function handleLottecinemaTheaters(options: string[], deps: CliDeps): Promise<number> {
  const parsed = parseCliArgs(options);
  if (parsed.options.help === 'true') {
    return printCommandHelp('lottecinema-theaters', deps.writeOut, deps.writeErr);
  }

  const keyword = parsed.positionals[0];
  if (keyword) {
    parsed.options.keyword = keyword;
  }

  const targetUrl = toUrl('/api/lottecinema/theaters');
  applyOptionsToQuery(targetUrl, toQueryOptions(parsed.options));
  return await requestAndPrintResponse(
    deps.fetchImpl, deps.writeOut, deps.writeErr,
    targetUrl, 'lottecinema-theaters', parsed.options.json === 'true',
  );
}

export async function handleLottecinemaMovies(options: string[], deps: CliDeps): Promise<number> {
  const parsed = parseCliArgs(options);
  if (parsed.options.help === 'true') {
    return printCommandHelp('lottecinema-movies', deps.writeOut, deps.writeErr);
  }

  const keyword = parsed.positionals[0];
  if (keyword) {
    parsed.options.keyword = keyword;
  }

  const targetUrl = toUrl('/api/lottecinema/movies');
  applyOptionsToQuery(targetUrl, toQueryOptions(parsed.options));
  return await requestAndPrintResponse(
    deps.fetchImpl, deps.writeOut, deps.writeErr,
    targetUrl, 'lottecinema-movies', parsed.options.json === 'true',
  );
}

export async function handleLottecinemaSeats(options: string[], deps: CliDeps): Promise<number> {
  const parsed = parseCliArgs(options);
  if (parsed.options.help === 'true') {
    return printCommandHelp('lottecinema-seats', deps.writeOut, deps.writeErr);
  }

  const keyword = parsed.positionals[0];
  if (keyword) {
    parsed.options.keyword = keyword;
  }

  const targetUrl = toUrl('/api/lottecinema/seats');
  applyOptionsToQuery(targetUrl, toQueryOptions(parsed.options));
  return await requestAndPrintResponse(
    deps.fetchImpl, deps.writeOut, deps.writeErr,
    targetUrl, 'lottecinema-seats', parsed.options.json === 'true',
  );
}
