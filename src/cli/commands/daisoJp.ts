/** 일본 다이소 CLI 명령. */
import type { CliDeps } from '../types.js';
import { parseCliArgs } from '../args.js';
import { runApiCommand } from './apiCommand.js';

export async function handleJapanSearch(
  command: 'jp-products' | 'jp-stores',
  options: string[],
  deps: CliDeps,
): Promise<number> {
  const products = command === 'jp-products';
  return runApiCommand({
    command,
    options,
    deps,
    path: products ? '/api/daiso-jp/products' : '/api/daiso-jp/stores',
    configure: (parsed) => {
      if (!parsed.positionals[0]) return `${command} 명령에 일본어 검색어를 입력하세요.`;
      parsed.options[products ? 'q' : 'keyword'] = parsed.positionals[0];
      return null;
    },
  });
}

export async function handleJapanProduct(options: string[], deps: CliDeps): Promise<number> {
  // 공통 실행기는 경로 생성 이후 입력을 검증하므로 상품 ID만 먼저 읽습니다.
  const id = parseCliArgs(options).positionals[0];
  return runApiCommand({
    command: 'jp-product',
    options,
    deps,
    path: `/api/daiso-jp/products/${encodeURIComponent(id ?? '')}`,
    configure: () => {
      return /^\d{13}$/.test(id ?? '')
        ? null
        : 'jp-product 명령에 일본 다이소의 13자리 상품 ID를 입력하세요.';
    },
  });
}
