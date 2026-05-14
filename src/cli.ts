#!/usr/bin/env node

/**
 * daiso CLI 엔트리
 *
 * npx daiso 명령으로 원격 MCP 서버 정보를 확인하고 상태를 점검합니다.
 */

import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { printHelp, printCommandHelp } from './cliHelp.js';
import { createDefaultDeps } from './cli/deps.js';
import type { CliDeps } from './cli/types.js';
import { DEFAULT_BASE_URL, DEFAULT_MCP_URL } from './cli/constants.js';
import {
  handleGet,
  handleProducts,
  handleProduct,
  handleStores,
  handleInventory,
  handleDisplayLocation,
} from './cli/commands/daiso.js';
import {
  handleCuStores,
  handleCuInventory,
  handleEmart24Stores,
  handleEmart24Products,
  handleEmart24Inventory,
  handleLotteMartStores,
  handleLotteMartProducts,
  handleGs25Stores,
  handleGs25Products,
  handleGs25Inventory,
  handleSevenElevenProducts,
  handleSevenElevenStores,
  handleSevenElevenPopwords,
  handleSevenElevenCatalog,
  handleLottecinemaTheaters,
  handleLottecinemaMovies,
  handleLottecinemaSeats,
} from './cli/commands/convenience.js';

export type { CliDeps } from './cli/types.js';
export type { InteractiveCliDeps } from './cliInteractive.js';

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

  if (command === 'get') return await handleGet(options, resolvedDeps);
  if (command === 'products') return await handleProducts(options, resolvedDeps);
  if (command === 'product') return await handleProduct(options, resolvedDeps);
  if (command === 'stores') return await handleStores(options, resolvedDeps);
  if (command === 'inventory') return await handleInventory(options, resolvedDeps);
  if (command === 'display-location') return await handleDisplayLocation(options, resolvedDeps);
  if (command === 'cu-stores') return await handleCuStores(options, resolvedDeps);
  if (command === 'cu-inventory') return await handleCuInventory(options, resolvedDeps);
  if (command === 'lottecinema-theaters') return await handleLottecinemaTheaters(options, resolvedDeps);
  if (command === 'lottecinema-movies') return await handleLottecinemaMovies(options, resolvedDeps);
  if (command === 'lottecinema-seats') return await handleLottecinemaSeats(options, resolvedDeps);
  if (command === 'emart24-stores') return await handleEmart24Stores(options, resolvedDeps);
  if (command === 'emart24-products') return await handleEmart24Products(options, resolvedDeps);
  if (command === 'emart24-inventory') return await handleEmart24Inventory(options, resolvedDeps);
  if (command === 'lottemart-stores') return await handleLotteMartStores(options, resolvedDeps);
  if (command === 'lottemart-products') return await handleLotteMartProducts(options, resolvedDeps);
  if (command === 'gs25-stores') return await handleGs25Stores(options, resolvedDeps);
  if (command === 'gs25-products') return await handleGs25Products(options, resolvedDeps);
  if (command === 'gs25-inventory') return await handleGs25Inventory(options, resolvedDeps);
  if (command === 'seveneleven-products') return await handleSevenElevenProducts(options, resolvedDeps);
  if (command === 'seveneleven-stores') return await handleSevenElevenStores(options, resolvedDeps);
  if (command === 'seveneleven-popwords') return await handleSevenElevenPopwords(options, resolvedDeps);
  if (command === 'seveneleven-catalog') return await handleSevenElevenCatalog(options, resolvedDeps);

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
