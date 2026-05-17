/**
 * CLI 명령별 허용 옵션 정의
 */

import { writeUnknownOptionError } from './args.js';

export const COMMAND_OPTION_ALLOWLISTS = {
  version: [],
  url: [],
  health: [],
  claude: ['exec'],
  products: ['help', 'json', 'page', 'pageSize'],
  product: ['help', 'json'],
  stores: ['help', 'json', 'keyword', 'sido', 'gugun', 'dong', 'limit'],
  inventory: ['help', 'json', 'keyword', 'lat', 'lng', 'page', 'pageSize'],
  'display-location': ['help', 'json'],
  'cu-stores': ['help', 'json', 'keyword', 'lat', 'lng', 'limit'],
  'cu-inventory': ['help', 'json', 'storeKeyword', 'lat', 'lng', 'size', 'offset', 'searchSort', 'storeLimit'],
  'lottecinema-theaters': ['help', 'json', 'keyword', 'lat', 'lng', 'playDate', 'limit'],
  'lottecinema-movies': ['help', 'json', 'keyword', 'playDate', 'theaterId', 'movieId', 'lat', 'lng'],
  'lottecinema-seats': ['help', 'json', 'keyword', 'playDate', 'theaterId', 'movieId', 'lat', 'lng', 'limit'],
  'emart24-stores': ['help', 'json', 'keyword', 'area1', 'area2', 'lat', 'lng', 'service24h', 'limit'],
  'emart24-products': ['help', 'json', 'page', 'pageSize'],
  'emart24-inventory': ['help', 'json', 'bizNoArr', 'storeKeyword', 'area1', 'area2', 'lat', 'lng', 'storeLimit'],
  'lottemart-stores': ['help', 'json', 'keyword', 'area', 'brandVariant', 'lat', 'lng', 'limit'],
  'lottemart-products': ['help', 'json', 'storeCode', 'storeName', 'area', 'brandVariant', 'pageLimit'],
  'gs25-stores': ['help', 'json', 'keyword', 'lat', 'lng', 'serviceCode', 'limit'],
  'gs25-products': ['help', 'json', 'serviceCode', 'limit'],
  'gs25-inventory': ['help', 'json', 'storeKeyword', 'lat', 'lng', 'serviceCode', 'storeLimit'],
  'seveneleven-products': ['help', 'json', 'page', 'size', 'sort'],
  'seveneleven-stores': ['help', 'json', 'limit'],
  'seveneleven-popwords': ['help', 'json', 'label'],
  'seveneleven-catalog': ['help', 'json', 'includeIssues', 'includeExhibition', 'limit'],
} as const satisfies Record<string, readonly string[]>;

const COMMAND_OPTION_HINTS: Record<string, string> = {
  inventory: '매장명은 --keyword로 전달하세요. 예: daiso inventory 1034604 --keyword 강남역',
};

export type CliOptionCommand = keyof typeof COMMAND_OPTION_ALLOWLISTS;

export function validateCommandOptions(
  command: CliOptionCommand,
  options: Record<string, string>,
  writeErr: (message: string) => void,
): boolean {
  return writeUnknownOptionError(
    options,
    COMMAND_OPTION_ALLOWLISTS[command],
    writeErr,
    COMMAND_OPTION_HINTS[command],
  );
}
