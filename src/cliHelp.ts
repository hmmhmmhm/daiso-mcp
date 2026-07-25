/**
 * CLI 도움말 출력
 */
import {
  COMMAND_DETAIL,
  COMMAND_LIST,
  COMMAND_SUMMARY,
  type CommandName,
} from './cliHelpDefinitions.js';

export { COMMAND_LIST, type CommandName } from './cliHelpDefinitions.js';

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
  writeOut('  npx daiso places 강남역 --category cafe --limit 5');
  writeOut('  npx daiso cu-inventory 과자 --storeKeyword 강남');
  writeOut('  npx daiso cgv-theaters 강남 --limit 5');
  writeOut('  npx daiso cgv-timetable --playDate 20260307 --theaterCode 0056');
  writeOut('  npx daiso lottecinema-theaters --keyword "안산 중앙역" --limit 5');
  writeOut('  npx daiso lottemart-stores 잠실 --area 서울 --limit 10');
  writeOut('  npx daiso lottemart-products 콜라 --storeName 강변점 --area 서울');
  writeOut('  npx daiso emart24-products 두바이 --pageSize 20');
  writeOut('  npx daiso gs25-products 오감자');
  writeOut('  npx daiso gs25-inventory 오감자 --storeKeyword 강남');
  writeOut('  npx daiso seveneleven-products 삼각김밥 --size 20');
  writeOut('  npx daiso seveneleven-stores 안산 중앙역 --limit 10');
  writeOut('  npx daiso seveneleven-inventory 핫식스 --storeKeyword "안산 중앙역"');
  writeOut('  npx daiso seveneleven-popwords --label home');
  writeOut('  npx daiso seveneleven-catalog --limit 10');
  writeOut('');
  writeOut('정보가 부족할 때:');
  writeOut('  제품명을 먼저 검색해 productId를 확인: npx daiso products 수납박스');
  writeOut('  productId로 재고 확인: npx daiso inventory <productId> --keyword 강남역');
  writeOut('  매장을 먼저 검색해 storeName 또는 storeCode를 확인: npx daiso stores 강남역');
  writeOut('  롯데마트 매장 확인: npx daiso lottemart-stores 잠실 --area 서울');
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
    writeErr(`사용 가능한 명령어: ${COMMAND_LIST.join(', ')}`);
    return 1;
  }

  const detail = COMMAND_DETAIL[command as CommandName];
  for (const line of detail) {
    writeOut(line);
  }

  return 0;
}
