/**
 * CLI 도움말 정의
 */

export type CommandName =
  | 'help'
  | 'version'
  | 'url'
  | 'health'
  | 'claude'
  | 'get'
  | 'products'
  | 'product'
  | 'stores'
  | 'inventory'
  | 'display-location'
  | 'cu-stores'
  | 'cu-inventory'
  | 'emart24-stores'
  | 'emart24-products'
  | 'emart24-inventory';

export const COMMAND_LIST: CommandName[] = [
  'help',
  'version',
  'url',
  'health',
  'claude',
  'get',
  'products',
  'product',
  'stores',
  'inventory',
  'display-location',
  'cu-stores',
  'cu-inventory',
  'emart24-stores',
  'emart24-products',
  'emart24-inventory',
];

const COMMAND_SUMMARY: Record<CommandName, string> = {
  help: '도움말 출력',
  version: 'CLI 버전 출력',
  url: 'MCP 엔드포인트 URL 출력',
  health: '원격 서버 상태 확인',
  claude: 'Claude Code MCP 등록 명령 출력/실행',
  get: '임의 API 경로 GET 호출',
  products: '다이소 제품 검색',
  product: '다이소 제품 상세 조회',
  stores: '다이소 매장 검색',
  inventory: '다이소 재고 조회',
  'display-location': '다이소 진열 위치 조회',
  'cu-stores': 'CU 매장 검색',
  'cu-inventory': 'CU 재고 조회',
  'emart24-stores': '이마트24 매장 검색',
  'emart24-products': '이마트24 상품 검색',
  'emart24-inventory': '이마트24 재고 조회',
};

const COMMAND_DETAIL: Record<CommandName, string[]> = {
  help: [
    '명령: help',
    '설명: 전체 도움말 또는 특정 명령 상세 도움말을 출력합니다.',
    '사용법: daiso help [command]',
    '예시: daiso help products',
  ],
  version: [
    '명령: version',
    '설명: 설치된 daiso CLI 버전을 출력합니다.',
    '사용법: daiso version',
  ],
  url: [
    '명령: url',
    '설명: MCP 엔드포인트 URL을 출력합니다.',
    '사용법: daiso url',
    '출력 예시: https://mcp.aka.page/mcp',
  ],
  health: [
    '명령: health',
    '설명: 서버 /health API를 호출해 상태를 확인합니다.',
    '사용법: daiso health',
    '출력: status, endpoint, checkedAt(JSON)',
  ],
  claude: [
    '명령: claude',
    '설명: Claude Code MCP 등록 명령을 출력하거나 실행합니다.',
    '사용법: daiso claude [--exec]',
    '옵션: --exec 실제 claude 명령 실행',
    '예시: daiso claude --exec',
  ],
  get: [
    '명령: get',
    '설명: 임의 API 경로를 GET으로 호출합니다.',
    '사용법: daiso get <path|url> [--queryKey value ...] [--json]',
    '필수: <path|url>',
    '옵션: --json 원본 JSON 출력',
    '예시: daiso get /api/cgv/movies --playDate 20260307 --theaterCode 0056',
  ],
  products: [
    '명령: products',
    '설명: 다이소 제품 검색 API를 호출합니다.',
    '사용법: daiso products <query> [--page N] [--pageSize N] [--json]',
    '필수: <query>',
    '옵션: --page, --pageSize, --json',
    '예시: daiso products 수납박스 --page 1 --pageSize 30',
  ],
  product: [
    '명령: product',
    '설명: 다이소 제품 상세 API를 호출합니다.',
    '사용법: daiso product <productId> [--json]',
    '필수: <productId>',
    '옵션: --json',
    '예시: daiso product 1034604',
  ],
  stores: [
    '명령: stores',
    '설명: 다이소 매장 검색 API를 호출합니다.',
    '사용법: daiso stores [keyword] [--sido 값] [--gugun 값] [--dong 값] [--limit N] [--json]',
    '필수: keyword 또는 --sido',
    '옵션: --keyword, --sido, --gugun, --dong, --limit, --json',
    '예시: daiso stores 강남역',
    '예시: daiso stores --sido 서울 --gugun 강남구',
  ],
  inventory: [
    '명령: inventory',
    '설명: 다이소 재고 API를 호출합니다.',
    '사용법: daiso inventory <productId> [--keyword 값] [--lat 값] [--lng 값] [--page N] [--pageSize N] [--json]',
    '필수: <productId>',
    '옵션: --keyword, --lat, --lng, --page, --pageSize, --json',
    '예시: daiso inventory 1034604 --keyword 강남역',
  ],
  'display-location': [
    '명령: display-location',
    '설명: 다이소 매장 내 상품 진열 위치 API를 호출합니다.',
    '사용법: daiso display-location <productId> <storeCode> [--json]',
    '필수: <productId>, <storeCode>',
    '옵션: --json',
    '예시: daiso display-location 1034604 04515',
  ],
  'cu-stores': [
    '명령: cu-stores',
    '설명: CU 매장 검색 API를 호출합니다.',
    '사용법: daiso cu-stores [keyword] [--lat 값] [--lng 값] [--limit N] [--json]',
    '옵션: --keyword, --lat, --lng, --limit, --json',
    '예시: daiso cu-stores 강남',
    '예시: daiso cu-stores --lat 37.498 --lng 127.027 --limit 10',
  ],
  'cu-inventory': [
    '명령: cu-inventory',
    '설명: CU 재고 검색 API를 호출합니다.',
    '사용법: daiso cu-inventory <keyword> [--storeKeyword 값] [--lat 값] [--lng 값] [--size N] [--offset N] [--json]',
    '필수: <keyword>',
    '옵션: --storeKeyword, --lat, --lng, --size, --offset, --searchSort, --storeLimit, --json',
    '예시: daiso cu-inventory 과자',
    '예시: daiso cu-inventory 컵라면 --storeKeyword 강남 --size 10',
  ],
  'emart24-stores': [
    '명령: emart24-stores',
    '설명: 이마트24 매장 검색 API를 호출합니다.',
    '사용법: daiso emart24-stores [keyword] [--area1 값] [--area2 값] [--lat 값] [--lng 값] [--service24h true|false] [--limit N] [--json]',
    '옵션: --keyword, --area1, --area2, --lat, --lng, --service24h, --limit, --json',
    '예시: daiso emart24-stores 강남',
    '예시: daiso emart24-stores --area1 서울특별시 --area2 강남구 --service24h true',
  ],
  'emart24-products': [
    '명령: emart24-products',
    '설명: 이마트24 상품 검색 API를 호출합니다.',
    '사용법: daiso emart24-products <keyword> [--page N] [--pageSize N] [--sortType 값] [--saleProductYn Y|N] [--json]',
    '필수: <keyword>',
    '옵션: --page, --pageSize, --sortType, --saleProductYn, --json',
    '예시: daiso emart24-products 두바이',
    '예시: daiso emart24-products 도시락 --page 2 --pageSize 20',
  ],
  'emart24-inventory': [
    '명령: emart24-inventory',
    '설명: 이마트24 매장별 재고 API를 호출합니다.',
    '사용법: daiso emart24-inventory <pluCd> --bizNoArr 코드1,코드2 [--json]',
    '필수: <pluCd>, --bizNoArr',
    '옵션: --bizNoArr, --json',
    '예시: daiso emart24-inventory 8800244010504 --bizNoArr 28339,05015,23233',
  ],
};

export function printHelp(writeOut: (message: string) => void): void {
  writeOut('daiso CLI');
  writeOut('');
  writeOut('기본 실행:');
  writeOut('  npx daiso (인터랙티브 모드)');
  writeOut('  npx daiso --non-interactive (도움말 출력)');
  writeOut('');
  writeOut('사용법:');
  writeOut('  daiso <command> [options]');
  writeOut('전역 옵션:');
  writeOut('  --non-interactive  인터랙티브 진입 비활성화');
  writeOut('');
  writeOut('명령어:');
  for (const command of COMMAND_LIST) {
    writeOut(`  ${command.padEnd(20, ' ')}${COMMAND_SUMMARY[command]}`);
  }
  writeOut('');
  writeOut('예시:');
  writeOut('  npx daiso url');
  writeOut('  npx daiso health');
  writeOut('  npx daiso claude');
  writeOut('  npx daiso products 수납박스');
  writeOut('  npx daiso stores 강남역');
  writeOut('  npx daiso inventory 1034604 --keyword 강남역');
  writeOut('  npx daiso display-location 1034604 04515');
  writeOut('  npx daiso cu-stores 강남');
  writeOut('  npx daiso cu-inventory 과자 --storeKeyword 강남');
  writeOut('  npx daiso emart24-stores 강남 --limit 10');
  writeOut('  npx daiso emart24-products 두바이 --pageSize 20');
  writeOut('  npx daiso emart24-inventory 8800244010504 --bizNoArr 28339,05015');
  writeOut('  npx daiso get /api/cgv/movies --playDate 20260307 --theaterCode 0056');
  writeOut('');
  writeOut('상세 도움말:');
  writeOut('  npx daiso help <command>');
}

export function printCommandHelp(
  command: string,
  writeOut: (message: string) => void,
  writeErr: (message: string) => void,
): number {
  if (!Object.hasOwn(COMMAND_DETAIL, command)) {
    writeErr(`도움말을 찾을 수 없는 명령어: ${command}`);
    writeErr(
      '사용 가능한 명령어: help, version, url, health, claude, get, products, product, stores, inventory, display-location, cu-stores, cu-inventory, emart24-stores, emart24-products, emart24-inventory',
    );
    return 1;
  }

  const detail = COMMAND_DETAIL[command as CommandName];
  for (const line of detail) {
    writeOut(line);
  }

  return 0;
}
