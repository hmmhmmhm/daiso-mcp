#!/usr/bin/env node

/**
 * daiso CLI 엔트리
 *
 * npx daiso 명령으로 원격 MCP 서버 정보를 확인하고 상태를 점검합니다.
 */

import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import { printCommandHelp, printHelp } from './cliHelp.js';
import { runInteractiveCli, type InteractiveCliDeps } from './cliInteractive.js';
import { renderApiEnvelope } from './cliRenderer.js';
import { buildDaisoStoreKeywordVariants } from './utils/daisoKeyword.js';

const DEFAULT_BASE_URL = 'https://mcp.aka.page';
const DEFAULT_MCP_URL = `${DEFAULT_BASE_URL}/mcp`;

type FetchLike = typeof fetch;

type WriteFn = (message: string) => void;

interface CliDeps {
  fetchImpl: FetchLike;
  writeOut: WriteFn;
  writeErr: WriteFn;
  getVersion: () => string;
  nowIso: () => string;
  runCommand: (command: string, args: string[]) => Promise<number>;
  isInteractiveTerminal: () => boolean;
  runInteractive: (deps: InteractiveCliDeps) => Promise<number>;
}

function loadVersion(): string {
  const cliPath = fileURLToPath(import.meta.url);
  const packagePath = path.resolve(path.dirname(cliPath), '../package.json');

  if (!existsSync(packagePath)) {
    return '0.0.0';
  }

  const raw = readFileSync(packagePath, 'utf8');
  const parsed = JSON.parse(raw) as { version?: string };
  return parsed.version ?? '0.0.0';
}

async function execCommand(command: string, args: string[]): Promise<number> {
  return await new Promise<number>((resolve, reject) => {
    const child = spawn(command, args, {
      stdio: 'inherit',
      shell: false,
    });

    child.on('error', (error) => {
      reject(error);
    });

    child.on('close', (code) => {
      resolve(code ?? 1);
    });
  });
}

function createDefaultDeps(): CliDeps {
  return {
    fetchImpl: fetch,
    writeOut: (message: string) => {
      process.stdout.write(`${message}\n`);
    },
    writeErr: (message: string) => {
      process.stderr.write(`${message}\n`);
    },
    getVersion: loadVersion,
    nowIso: () => new Date().toISOString(),
    runCommand: execCommand,
    isInteractiveTerminal: () => Boolean(process.stdin.isTTY && process.stdout.isTTY),
    runInteractive: runInteractiveCli,
  };
}

function parseCliArgs(args: string[]): { positionals: string[]; options: Record<string, string> } {
  const positionals: string[] = [];
  const options: Record<string, string> = {};

  for (let index = 0; index < args.length; index += 1) {
    const token = args[index];
    if (!token.startsWith('--')) {
      positionals.push(token);
      continue;
    }

    const withoutPrefix = token.slice(2);
    const equalIndex = withoutPrefix.indexOf('=');

    if (equalIndex >= 0) {
      const key = withoutPrefix.slice(0, equalIndex);
      const value = withoutPrefix.slice(equalIndex + 1);
      options[key] = value;
      continue;
    }

    const key = withoutPrefix;
    const nextValue = args[index + 1];
    if (!nextValue || nextValue.startsWith('--')) {
      options[key] = 'true';
      continue;
    }

    options[key] = nextValue;
    index += 1;
  }

  return { positionals, options };
}

function toUrl(pathOrUrl: string): URL {
  if (pathOrUrl.startsWith('http://') || pathOrUrl.startsWith('https://')) {
    return new URL(pathOrUrl);
  }

  const normalizedPath = pathOrUrl.startsWith('/') ? pathOrUrl : `/${pathOrUrl}`;
  return new URL(normalizedPath, DEFAULT_BASE_URL);
}

function applyOptionsToQuery(url: URL, options: Record<string, string>): void {
  for (const [key, value] of Object.entries(options)) {
    url.searchParams.set(key, value);
  }
}

function toQueryOptions(options: Record<string, string>): Record<string, string> {
  const queryOptions: Record<string, string> = {};
  for (const [key, value] of Object.entries(options)) {
    if (key === 'help' || key === 'json') {
      continue;
    }
    queryOptions[key] = value;
  }
  return queryOptions;
}

function toStoreCount(payload: unknown): number {
  if (typeof payload !== 'object' || payload === null) {
    return 0;
  }
  const record = payload as { success?: unknown; data?: unknown };
  if (record.success !== true || typeof record.data !== 'object' || record.data === null) {
    return 0;
  }
  const stores = (record.data as { stores?: unknown }).stores;
  return Array.isArray(stores) ? stores.length : 0;
}

async function requestAndPrintResponse(
  fetchImpl: FetchLike,
  writeOut: WriteFn,
  writeErr: WriteFn,
  url: URL,
  command: string,
  asJson: boolean,
): Promise<number> {
  try {
    const response = await fetchImpl(url.toString());

    if (!response.ok) {
      const bodyText = await response.text();
      writeErr(`요청 실패: HTTP ${response.status}`);
      if (bodyText) {
        writeErr(bodyText);
      }
      return 1;
    }

    const payload = (await response.json()) as unknown;
    if (asJson) {
      writeOut(JSON.stringify(payload, null, 2));
    } else {
      writeOut(renderApiEnvelope(command, url, payload));
    }
    return 0;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    writeErr(`요청 중 오류 발생: ${message}`);
    return 1;
  }
}

async function requestAndPrintStoresWithKeywordFallback(
  fetchImpl: FetchLike,
  writeOut: WriteFn,
  writeErr: WriteFn,
  options: Record<string, string>,
  asJson: boolean,
): Promise<number> {
  const originalKeyword = options.keyword;
  if (!originalKeyword) {
    const url = toUrl('/api/daiso/stores');
    applyOptionsToQuery(url, options);
    return await requestAndPrintResponse(fetchImpl, writeOut, writeErr, url, 'stores', asJson);
  }

  const keywords = buildDaisoStoreKeywordVariants(originalKeyword);
  const candidates = keywords.length > 0 ? keywords : [originalKeyword];

  try {
    let lastUrl = toUrl('/api/daiso/stores');
    let lastPayload: unknown = null;

    for (const keyword of candidates) {
      const targetUrl = toUrl('/api/daiso/stores');
      applyOptionsToQuery(targetUrl, { ...options, keyword });
      lastUrl = targetUrl;

      const response = await fetchImpl(targetUrl.toString());
      if (!response.ok) {
        const bodyText = await response.text();
        writeErr(`요청 실패: HTTP ${response.status}`);
        if (bodyText) {
          writeErr(bodyText);
        }
        return 1;
      }

      const payload = (await response.json()) as unknown;
      lastPayload = payload;

      if (toStoreCount(payload) > 0) {
        if (keyword !== originalKeyword) {
          writeOut(`입력 키워드 "${originalKeyword}" 대신 "${keyword}"로 매장을 찾았습니다.`);
        }
        if (asJson) {
          writeOut(JSON.stringify(payload, null, 2));
        } else {
          writeOut(renderApiEnvelope('stores', targetUrl, payload));
        }
        return 0;
      }
    }

    if (asJson) {
      writeOut(JSON.stringify(lastPayload, null, 2));
    } else {
      writeOut(renderApiEnvelope('stores', lastUrl, lastPayload));
    }
    writeOut('힌트: "안산 중앙역" 대신 "안산중앙" 또는 "고잔"으로 검색해보세요.');
    return 0;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    writeErr(`요청 중 오류 발생: ${message}`);
    return 1;
  }
}

export async function runCli(argv: string[], deps?: Partial<CliDeps>): Promise<number> {
  const resolvedDeps = {
    ...createDefaultDeps(),
    ...deps,
  } satisfies CliDeps;

  const nonInteractive = argv.includes('--non-interactive');
  const normalizedArgv = argv.filter((arg) => arg !== '--non-interactive');
  const [command, ...options] = normalizedArgv;

  if (!command) {
    if (!nonInteractive && resolvedDeps.isInteractiveTerminal()) {
      return await resolvedDeps.runInteractive({
        fetchImpl: resolvedDeps.fetchImpl,
        writeOut: resolvedDeps.writeOut,
        writeErr: resolvedDeps.writeErr,
      });
    }

    printHelp(resolvedDeps.writeOut);
    return 0;
  }

  if (command === 'help' || command === '--help' || command === '-h') {
    const maybeCommand = options[0];
    if (maybeCommand) {
      return printCommandHelp(maybeCommand, resolvedDeps.writeOut, resolvedDeps.writeErr);
    }

    printHelp(resolvedDeps.writeOut);
    return 0;
  }

  if (command === 'version' || command === '--version' || command === '-v') {
    resolvedDeps.writeOut(resolvedDeps.getVersion());
    return 0;
  }

  if (command === 'url') {
    resolvedDeps.writeOut(DEFAULT_MCP_URL);
    return 0;
  }

  if (command === 'health') {
    try {
      const response = await resolvedDeps.fetchImpl(`${DEFAULT_BASE_URL}/health`);
      if (!response.ok) {
        resolvedDeps.writeErr(`서버 상태 확인 실패: HTTP ${response.status}`);
        return 1;
      }

      const payload = (await response.json()) as { status?: string };
      resolvedDeps.writeOut(
        JSON.stringify(
          {
            status: payload.status ?? 'unknown',
            endpoint: DEFAULT_MCP_URL,
            checkedAt: resolvedDeps.nowIso(),
          },
          null,
          2,
        ),
      );
      return 0;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      resolvedDeps.writeErr(`서버 상태 확인 중 오류 발생: ${message}`);
      return 1;
    }
  }

  if (command === 'claude') {
    const cliArgs = ['mcp', 'add', 'daiso', DEFAULT_BASE_URL, '--transport', 'sse'];

    if (options.includes('--exec')) {
      try {
        return await resolvedDeps.runCommand('claude', cliArgs);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        resolvedDeps.writeErr(`Claude CLI 실행 실패: ${message}`);
        return 1;
      }
    }

    resolvedDeps.writeOut(`claude ${cliArgs.join(' ')}`);
    return 0;
  }

  if (command === 'get') {
    const parsed = parseCliArgs(options);
    if (parsed.options.help === 'true') {
      return printCommandHelp('get', resolvedDeps.writeOut, resolvedDeps.writeErr);
    }

    const targetPath = parsed.positionals[0];

    if (!targetPath) {
      resolvedDeps.writeErr('get 명령은 경로가 필요합니다. 예: daiso get /api/daiso/products --q 수납박스');
      return 1;
    }

    const targetUrl = toUrl(targetPath);
    applyOptionsToQuery(targetUrl, toQueryOptions(parsed.options));
    return await requestAndPrintResponse(
      resolvedDeps.fetchImpl,
      resolvedDeps.writeOut,
      resolvedDeps.writeErr,
      targetUrl,
      command,
      parsed.options.json === 'true',
    );
  }

  if (command === 'products') {
    const parsed = parseCliArgs(options);
    if (parsed.options.help === 'true') {
      return printCommandHelp('products', resolvedDeps.writeOut, resolvedDeps.writeErr);
    }

    const query = parsed.positionals[0];

    if (!query) {
      resolvedDeps.writeErr('products 명령은 검색어가 필요합니다. 예: daiso products 수납박스');
      return 1;
    }

    const targetUrl = toUrl('/api/daiso/products');
    targetUrl.searchParams.set('q', query);
    applyOptionsToQuery(targetUrl, toQueryOptions(parsed.options));

    return await requestAndPrintResponse(
      resolvedDeps.fetchImpl,
      resolvedDeps.writeOut,
      resolvedDeps.writeErr,
      targetUrl,
      command,
      parsed.options.json === 'true',
    );
  }

  if (command === 'product') {
    const parsed = parseCliArgs(options);
    if (parsed.options.help === 'true') {
      return printCommandHelp('product', resolvedDeps.writeOut, resolvedDeps.writeErr);
    }

    const productId = parsed.positionals[0];

    if (!productId) {
      resolvedDeps.writeErr('product 명령은 제품 ID가 필요합니다. 예: daiso product 1034604');
      return 1;
    }

    const targetUrl = toUrl(`/api/daiso/products/${productId}`);
    applyOptionsToQuery(targetUrl, toQueryOptions(parsed.options));

    return await requestAndPrintResponse(
      resolvedDeps.fetchImpl,
      resolvedDeps.writeOut,
      resolvedDeps.writeErr,
      targetUrl,
      command,
      parsed.options.json === 'true',
    );
  }

  if (command === 'stores') {
    const parsed = parseCliArgs(options);
    if (parsed.options.help === 'true') {
      return printCommandHelp('stores', resolvedDeps.writeOut, resolvedDeps.writeErr);
    }

    const keyword = parsed.positionals[0];

    if (keyword) {
      parsed.options.keyword = keyword;
    }

    if (!parsed.options.keyword && !parsed.options.sido) {
      resolvedDeps.writeErr(
        'stores 명령은 keyword 또는 --sido가 필요합니다. 예: daiso stores 강남역 / daiso stores --sido 서울',
      );
      return 1;
    }

    return await requestAndPrintStoresWithKeywordFallback(
      resolvedDeps.fetchImpl,
      resolvedDeps.writeOut,
      resolvedDeps.writeErr,
      toQueryOptions(parsed.options),
      parsed.options.json === 'true',
    );
  }

  if (command === 'inventory') {
    const parsed = parseCliArgs(options);
    if (parsed.options.help === 'true') {
      return printCommandHelp('inventory', resolvedDeps.writeOut, resolvedDeps.writeErr);
    }

    const productId = parsed.positionals[0];

    if (!productId) {
      resolvedDeps.writeErr(
        'inventory 명령은 제품 ID가 필요합니다. 예: daiso inventory 1034604 --keyword 강남역',
      );
      return 1;
    }

    const targetUrl = toUrl('/api/daiso/inventory');
    targetUrl.searchParams.set('productId', productId);
    applyOptionsToQuery(targetUrl, toQueryOptions(parsed.options));

    return await requestAndPrintResponse(
      resolvedDeps.fetchImpl,
      resolvedDeps.writeOut,
      resolvedDeps.writeErr,
      targetUrl,
      command,
      parsed.options.json === 'true',
    );
  }

  if (command === 'display-location') {
    const parsed = parseCliArgs(options);
    if (parsed.options.help === 'true') {
      return printCommandHelp('display-location', resolvedDeps.writeOut, resolvedDeps.writeErr);
    }

    const productId = parsed.positionals[0];
    const storeCode = parsed.positionals[1];

    if (!productId || !storeCode) {
      resolvedDeps.writeErr(
        'display-location 명령은 productId와 storeCode가 필요합니다. 예: daiso display-location 1034604 04515',
      );
      return 1;
    }

    const targetUrl = toUrl('/api/daiso/display-location');
    targetUrl.searchParams.set('productId', productId);
    targetUrl.searchParams.set('storeCode', storeCode);
    applyOptionsToQuery(targetUrl, toQueryOptions(parsed.options));

    return await requestAndPrintResponse(
      resolvedDeps.fetchImpl,
      resolvedDeps.writeOut,
      resolvedDeps.writeErr,
      targetUrl,
      command,
      parsed.options.json === 'true',
    );
  }

  if (command === 'cu-stores') {
    const parsed = parseCliArgs(options);
    if (parsed.options.help === 'true') {
      return printCommandHelp('cu-stores', resolvedDeps.writeOut, resolvedDeps.writeErr);
    }

    const keyword = parsed.positionals[0];
    if (keyword) {
      parsed.options.keyword = keyword;
    }

    const targetUrl = toUrl('/api/cu/stores');
    applyOptionsToQuery(targetUrl, toQueryOptions(parsed.options));

    return await requestAndPrintResponse(
      resolvedDeps.fetchImpl,
      resolvedDeps.writeOut,
      resolvedDeps.writeErr,
      targetUrl,
      command,
      parsed.options.json === 'true',
    );
  }

  if (command === 'cu-inventory') {
    const parsed = parseCliArgs(options);
    if (parsed.options.help === 'true') {
      return printCommandHelp('cu-inventory', resolvedDeps.writeOut, resolvedDeps.writeErr);
    }

    const keyword = parsed.positionals[0];
    if (!keyword) {
      resolvedDeps.writeErr('cu-inventory 명령은 검색어가 필요합니다. 예: daiso cu-inventory 과자');
      return 1;
    }

    const targetUrl = toUrl('/api/cu/inventory');
    targetUrl.searchParams.set('keyword', keyword);
    applyOptionsToQuery(targetUrl, toQueryOptions(parsed.options));

    return await requestAndPrintResponse(
      resolvedDeps.fetchImpl,
      resolvedDeps.writeOut,
      resolvedDeps.writeErr,
      targetUrl,
      command,
      parsed.options.json === 'true',
    );
  }

  if (command === 'lottecinema-theaters') {
    const parsed = parseCliArgs(options);
    if (parsed.options.help === 'true') {
      return printCommandHelp('lottecinema-theaters', resolvedDeps.writeOut, resolvedDeps.writeErr);
    }

    const targetUrl = toUrl('/api/lottecinema/theaters');
    applyOptionsToQuery(targetUrl, toQueryOptions(parsed.options));

    return await requestAndPrintResponse(
      resolvedDeps.fetchImpl,
      resolvedDeps.writeOut,
      resolvedDeps.writeErr,
      targetUrl,
      command,
      parsed.options.json === 'true',
    );
  }

  if (command === 'lottecinema-movies') {
    const parsed = parseCliArgs(options);
    if (parsed.options.help === 'true') {
      return printCommandHelp('lottecinema-movies', resolvedDeps.writeOut, resolvedDeps.writeErr);
    }

    const targetUrl = toUrl('/api/lottecinema/movies');
    applyOptionsToQuery(targetUrl, toQueryOptions(parsed.options));

    return await requestAndPrintResponse(
      resolvedDeps.fetchImpl,
      resolvedDeps.writeOut,
      resolvedDeps.writeErr,
      targetUrl,
      command,
      parsed.options.json === 'true',
    );
  }

  if (command === 'lottecinema-seats') {
    const parsed = parseCliArgs(options);
    if (parsed.options.help === 'true') {
      return printCommandHelp('lottecinema-seats', resolvedDeps.writeOut, resolvedDeps.writeErr);
    }

    const targetUrl = toUrl('/api/lottecinema/seats');
    applyOptionsToQuery(targetUrl, toQueryOptions(parsed.options));

    return await requestAndPrintResponse(
      resolvedDeps.fetchImpl,
      resolvedDeps.writeOut,
      resolvedDeps.writeErr,
      targetUrl,
      command,
      parsed.options.json === 'true',
    );
  }

  if (command === 'emart24-stores') {
    const parsed = parseCliArgs(options);
    if (parsed.options.help === 'true') {
      return printCommandHelp('emart24-stores', resolvedDeps.writeOut, resolvedDeps.writeErr);
    }

    const keyword = parsed.positionals[0];
    if (keyword) {
      parsed.options.keyword = keyword;
    }

    const targetUrl = toUrl('/api/emart24/stores');
    applyOptionsToQuery(targetUrl, toQueryOptions(parsed.options));

    return await requestAndPrintResponse(
      resolvedDeps.fetchImpl,
      resolvedDeps.writeOut,
      resolvedDeps.writeErr,
      targetUrl,
      command,
      parsed.options.json === 'true',
    );
  }

  if (command === 'emart24-products') {
    const parsed = parseCliArgs(options);
    if (parsed.options.help === 'true') {
      return printCommandHelp('emart24-products', resolvedDeps.writeOut, resolvedDeps.writeErr);
    }

    const keyword = parsed.positionals[0];
    if (!keyword) {
      resolvedDeps.writeErr('emart24-products 명령은 검색어가 필요합니다. 예: daiso emart24-products 두바이');
      return 1;
    }

    const targetUrl = toUrl('/api/emart24/products');
    targetUrl.searchParams.set('keyword', keyword);
    applyOptionsToQuery(targetUrl, toQueryOptions(parsed.options));

    return await requestAndPrintResponse(
      resolvedDeps.fetchImpl,
      resolvedDeps.writeOut,
      resolvedDeps.writeErr,
      targetUrl,
      command,
      parsed.options.json === 'true',
    );
  }

  if (command === 'emart24-inventory') {
    const parsed = parseCliArgs(options);
    if (parsed.options.help === 'true') {
      return printCommandHelp('emart24-inventory', resolvedDeps.writeOut, resolvedDeps.writeErr);
    }

    const pluCd = parsed.positionals[0];
    const bizNoArr = parsed.options.bizNoArr;
    if (!pluCd || !bizNoArr) {
      resolvedDeps.writeErr(
        'emart24-inventory 명령은 pluCd와 --bizNoArr가 필요합니다. 예: daiso emart24-inventory 8800244010504 --bizNoArr 28339,05015',
      );
      return 1;
    }

    const targetUrl = toUrl('/api/emart24/inventory');
    targetUrl.searchParams.set('pluCd', pluCd);
    applyOptionsToQuery(targetUrl, toQueryOptions(parsed.options));

    return await requestAndPrintResponse(
      resolvedDeps.fetchImpl,
      resolvedDeps.writeOut,
      resolvedDeps.writeErr,
      targetUrl,
      command,
      parsed.options.json === 'true',
    );
  }

  if (command === 'gs25-stores') {
    const parsed = parseCliArgs(options);
    if (parsed.options.help === 'true') {
      return printCommandHelp('gs25-stores', resolvedDeps.writeOut, resolvedDeps.writeErr);
    }

    const keyword = parsed.positionals[0];
    if (keyword) {
      parsed.options.keyword = keyword;
    }

    const targetUrl = toUrl('/api/gs25/stores');
    applyOptionsToQuery(targetUrl, toQueryOptions(parsed.options));

    return await requestAndPrintResponse(
      resolvedDeps.fetchImpl,
      resolvedDeps.writeOut,
      resolvedDeps.writeErr,
      targetUrl,
      command,
      parsed.options.json === 'true',
    );
  }

  if (command === 'gs25-products') {
    const parsed = parseCliArgs(options);
    if (parsed.options.help === 'true') {
      return printCommandHelp('gs25-products', resolvedDeps.writeOut, resolvedDeps.writeErr);
    }

    const keyword = parsed.positionals[0];
    if (!keyword) {
      resolvedDeps.writeErr('gs25-products 명령은 검색어가 필요합니다. 예: daiso gs25-products 오감자');
      return 1;
    }

    const targetUrl = toUrl('/api/gs25/products');
    targetUrl.searchParams.set('keyword', keyword);
    applyOptionsToQuery(targetUrl, toQueryOptions(parsed.options));

    return await requestAndPrintResponse(
      resolvedDeps.fetchImpl,
      resolvedDeps.writeOut,
      resolvedDeps.writeErr,
      targetUrl,
      command,
      parsed.options.json === 'true',
    );
  }

  if (command === 'gs25-inventory') {
    const parsed = parseCliArgs(options);
    if (parsed.options.help === 'true') {
      return printCommandHelp('gs25-inventory', resolvedDeps.writeOut, resolvedDeps.writeErr);
    }

    const keyword = parsed.positionals[0];
    if (!keyword) {
      resolvedDeps.writeErr('gs25-inventory 명령은 검색어가 필요합니다. 예: daiso gs25-inventory 오감자');
      return 1;
    }

    const targetUrl = toUrl('/api/gs25/inventory');
    targetUrl.searchParams.set('keyword', keyword);
    applyOptionsToQuery(targetUrl, toQueryOptions(parsed.options));

    return await requestAndPrintResponse(
      resolvedDeps.fetchImpl,
      resolvedDeps.writeOut,
      resolvedDeps.writeErr,
      targetUrl,
      command,
      parsed.options.json === 'true',
    );
  }

  if (command === 'seveneleven-products') {
    const parsed = parseCliArgs(options);
    if (parsed.options.help === 'true') {
      return printCommandHelp('seveneleven-products', resolvedDeps.writeOut, resolvedDeps.writeErr);
    }

    const query = parsed.positionals[0];
    if (!query) {
      resolvedDeps.writeErr(
        'seveneleven-products 명령은 검색어가 필요합니다. 예: daiso seveneleven-products 삼각김밥',
      );
      return 1;
    }

    const targetUrl = toUrl('/api/seveneleven/products');
    targetUrl.searchParams.set('query', query);
    applyOptionsToQuery(targetUrl, toQueryOptions(parsed.options));

    return await requestAndPrintResponse(
      resolvedDeps.fetchImpl,
      resolvedDeps.writeOut,
      resolvedDeps.writeErr,
      targetUrl,
      command,
      parsed.options.json === 'true',
    );
  }

  if (command === 'seveneleven-popwords') {
    const parsed = parseCliArgs(options);
    if (parsed.options.help === 'true') {
      return printCommandHelp('seveneleven-popwords', resolvedDeps.writeOut, resolvedDeps.writeErr);
    }

    const targetUrl = toUrl('/api/seveneleven/popwords');
    applyOptionsToQuery(targetUrl, toQueryOptions(parsed.options));

    return await requestAndPrintResponse(
      resolvedDeps.fetchImpl,
      resolvedDeps.writeOut,
      resolvedDeps.writeErr,
      targetUrl,
      command,
      parsed.options.json === 'true',
    );
  }

  if (command === 'seveneleven-catalog') {
    const parsed = parseCliArgs(options);
    if (parsed.options.help === 'true') {
      return printCommandHelp('seveneleven-catalog', resolvedDeps.writeOut, resolvedDeps.writeErr);
    }

    const targetUrl = toUrl('/api/seveneleven/catalog');
    applyOptionsToQuery(targetUrl, toQueryOptions(parsed.options));

    return await requestAndPrintResponse(
      resolvedDeps.fetchImpl,
      resolvedDeps.writeOut,
      resolvedDeps.writeErr,
      targetUrl,
      command,
      parsed.options.json === 'true',
    );
  }

  resolvedDeps.writeErr(`알 수 없는 명령어: ${command}`);
  resolvedDeps.writeErr('도움말: daiso help');
  return 1;
}

export function isDirectExecution(
  entryPath: string | undefined = process.argv[1],
  moduleUrl: string = import.meta.url,
): boolean {
  if (!entryPath) {
    return false;
  }

  return path.resolve(entryPath) === fileURLToPath(moduleUrl);
}

/* c8 ignore start */
if (isDirectExecution()) {
  runCli(process.argv.slice(2)).then((exitCode) => {
    process.exit(exitCode);
  });
}
/* c8 ignore stop */
