/**
 * 배포 전 로컬 CLI smoke 테스트
 */

import { spawn } from 'node:child_process';
import path from 'node:path';

interface CommandResult {
  exitCode: number;
  stdout: string;
  stderr: string;
}

type RunCommand = (command: string, args: string[]) => Promise<CommandResult>;
type WriteFn = (message: string) => void;
type Validator = (stdout: string, stderr: string) => string | null;

interface CliSmokeDeps {
  runCommand?: RunCommand;
  writeOut?: WriteFn;
  writeErr?: WriteFn;
  command?: string;
  cliPath?: string;
}

const DEFAULT_CLI_PATH = path.resolve('dist/bin.js');

interface CliSmokeCommand {
  scenario: string;
  args: string[];
  expectedExitCode?: number;
  validate: Validator;
}

function parseJson(stdout: string): unknown {
  return JSON.parse(stdout.trim());
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function validateHealth(stdout: string): string | null {
  const payload = parseJson(stdout);
  if (!isRecord(payload) || payload.status !== 'ok') {
    return 'health 응답 status가 ok가 아닙니다';
  }

  return null;
}

function validateApiEnvelope(
  stdout: string,
  check?: (data: Record<string, unknown>) => string | null,
): string | null {
  const payload = parseJson(stdout);
  if (!isRecord(payload) || payload.success !== true || !isRecord(payload.data)) {
    return 'API 응답이 success=true envelope가 아닙니다';
  }

  return typeof check === 'function' ? check(payload.data) : null;
}

function expectDataField(key: string, expected: string): (data: Record<string, unknown>) => string | null {
  return (data) => {
    if (data[key] !== expected) {
      return `data.${key}가 ${expected}가 아닙니다`;
    }

    return null;
  };
}

function validateStderrContains(expected: string): Validator {
  return (_stdout, stderr) => (stderr.includes(expected) ? null : `stderr에 "${expected}"가 없습니다`);
}

export const CLI_SMOKE_COMMANDS: CliSmokeCommand[] = [
  { scenario: 'health', args: ['health'], validate: validateHealth },
  {
    scenario: '상품명만 아는 사용자',
    args: ['products', '수납박스', '--pageSize', '1', '--json'],
    validate: validateApiEnvelope,
  },
  { scenario: '기본 위치 검색', args: ['stores', '강남역', '--limit', '1', '--json'], validate: validateApiEnvelope },
  {
    scenario: '위치를 대강 말하는 사용자',
    args: ['stores', '안산 중앙역', '--limit', '1', '--json'],
    validate: validateApiEnvelope,
  },
  {
    scenario: '잘못된 옵션을 입력한 사용자',
    args: ['inventory', '1034604', '--store', '강남역점'],
    expectedExitCode: 1,
    validate: validateStderrContains('알 수 없는 옵션: --store'),
  },
  {
    scenario: 'GS25 상품명 검색',
    args: ['gs25-products', '콜라', '--limit', '1', '--json'],
    validate: (stdout) => validateApiEnvelope(stdout, expectDataField('keyword', '콜라')),
  },
  {
    scenario: 'GS25 위치 검색',
    args: ['gs25-stores', '강남', '--limit', '1', '--json'],
    validate: (stdout) => validateApiEnvelope(stdout, expectDataField('keyword', '강남')),
  },
  {
    scenario: '세븐일레븐 상품명 검색',
    args: ['seveneleven-products', '커피', '--size', '1', '--json'],
    validate: (stdout) => validateApiEnvelope(stdout, expectDataField('query', '커피')),
  },
  {
    scenario: '이마트24 상품명 검색',
    args: ['emart24-products', '커피', '--pageSize', '1', '--json'],
    validate: (stdout) => validateApiEnvelope(stdout, expectDataField('keyword', '커피')),
  },
  {
    scenario: '롯데마트 매장 포함 상품 검색',
    args: ['lottemart-products', '콜라', '--storeCode', '2301', '--area', '서울', '--pageLimit', '1', '--json'],
    validate: (stdout) => validateApiEnvelope(stdout, expectDataField('keyword', '콜라')),
  },
  {
    scenario: '올리브영 get 상품 검색',
    args: ['get', '/api/oliveyoung/products', '--keyword', '선크림', '--size', '1', '--json'],
    validate: (stdout) => validateApiEnvelope(stdout, expectDataField('keyword', '선크림')),
  },
  {
    scenario: '메가박스 get 위치 검색',
    args: ['get', '/api/megabox/theaters', '--keyword', '강남', '--limit', '1', '--json'],
    validate: (stdout) => validateApiEnvelope(stdout, expectDataField('keyword', '강남')),
  },
  {
    scenario: '롯데시네마 위치 검색',
    args: ['lottecinema-theaters', '잠실', '--limit', '1', '--json'],
    validate: (stdout) => validateApiEnvelope(stdout, expectDataField('keyword', '잠실')),
  },
  {
    scenario: 'CGV get 위치 검색',
    args: ['get', '/api/cgv/theaters', '--keyword', '강남', '--limit', '1', '--json'],
    validate: (stdout) => validateApiEnvelope(stdout, expectDataField('keyword', '강남')),
  },
];

async function execCommand(command: string, args: string[]): Promise<CommandResult> {
  return await new Promise<CommandResult>((resolve, reject) => {
    const child = spawn(command, args, {
      stdio: ['ignore', 'pipe', 'pipe'],
      shell: false,
    });
    let stdout = '';
    let stderr = '';

    child.stdout?.setEncoding('utf8');
    child.stderr?.setEncoding('utf8');
    child.stdout?.on('data', (chunk) => {
      stdout += chunk;
    });
    child.stderr?.on('data', (chunk) => {
      stderr += chunk;
    });

    child.on('error', reject);
    child.on('close', (code) => {
      resolve({ exitCode: code ?? 1, stdout, stderr });
    });
  });
}

export async function runCliSmoke(deps: CliSmokeDeps = {}): Promise<number> {
  const runCommand = deps.runCommand || execCommand;
  const writeOut = deps.writeOut || ((message: string) => process.stdout.write(`${message}\n`));
  const writeErr = deps.writeErr || ((message: string) => process.stderr.write(`${message}\n`));
  const command = deps.command || process.execPath;
  const cliPath = deps.cliPath || DEFAULT_CLI_PATH;

  for (const { args, expectedExitCode = 0, validate } of CLI_SMOKE_COMMANDS) {
    const fullArgs = [cliPath, ...args];
    writeOut(`CLI smoke 실행: ${command} ${fullArgs.join(' ')}`);
    const result = await runCommand(command, fullArgs);
    if (result.exitCode !== expectedExitCode) {
      writeErr(`CLI smoke 실패: ${args.join(' ')} exited with ${result.exitCode}`);
      if (result.stdout) {
        writeErr(result.stdout.trim());
      }
      if (result.stderr) {
        writeErr(result.stderr.trim());
      }
      return result.exitCode;
    }

    try {
      const validationError = validate(result.stdout, result.stderr);
      if (validationError) {
        writeErr(`CLI smoke 검증 실패: ${args.join(' ')} - ${validationError}`);
        writeErr(result.stdout.trim());
        return 1;
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : '알 수 없는 오류';
      writeErr(`CLI smoke 검증 실패: ${args.join(' ')} - ${message}`);
      writeErr(result.stdout.trim());
      return 1;
    }
  }

  writeOut(`${CLI_SMOKE_COMMANDS.length} CLI smoke command(s) passed`);
  return 0;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  runCliSmoke().then((exitCode) => {
    process.exit(exitCode);
  });
}
