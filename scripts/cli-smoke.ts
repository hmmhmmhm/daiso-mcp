/**
 * 배포 전 로컬 CLI smoke 테스트
 */

import { spawn } from 'node:child_process';
import path from 'node:path';

type RunCommand = (command: string, args: string[]) => Promise<number>;
type WriteFn = (message: string) => void;

interface CliSmokeDeps {
  runCommand?: RunCommand;
  writeOut?: WriteFn;
  writeErr?: WriteFn;
  command?: string;
  cliPath?: string;
}

const DEFAULT_CLI_PATH = path.resolve('dist/bin.js');

const CLI_SMOKE_COMMANDS = [
  ['health'],
  ['products', '수납박스', '--pageSize', '1', '--json'],
  ['stores', '강남역', '--pageSize', '1', '--json'],
  ['gs25-products', '콜라', '--limit', '1', '--json'],
  ['gs25-stores', '강남', '--limit', '1', '--json'],
  ['seveneleven-products', '커피', '--size', '1', '--json'],
  ['emart24-products', '커피', '--pageSize', '1', '--json'],
  ['lottemart-products', '콜라', '--storeCode', '2301', '--area', '서울', '--pageLimit', '1', '--json'],
  ['get', '/api/oliveyoung/products', '--keyword', '선크림', '--size', '1', '--json'],
  ['get', '/api/megabox/theaters', '--keyword', '강남', '--limit', '1', '--json'],
  ['lottecinema-theaters', '잠실', '--limit', '1', '--json'],
  ['get', '/api/cgv/theaters', '--keyword', '강남', '--limit', '1', '--json'],
];

async function execCommand(command: string, args: string[]): Promise<number> {
  return await new Promise<number>((resolve, reject) => {
    const child = spawn(command, args, {
      stdio: 'inherit',
      shell: false,
    });

    child.on('error', reject);
    child.on('close', (code) => {
      resolve(code ?? 1);
    });
  });
}

export async function runCliSmoke(deps: CliSmokeDeps = {}): Promise<number> {
  const runCommand = deps.runCommand || execCommand;
  const writeOut = deps.writeOut || ((message: string) => process.stdout.write(`${message}\n`));
  const writeErr = deps.writeErr || ((message: string) => process.stderr.write(`${message}\n`));
  const command = deps.command || process.execPath;
  const cliPath = deps.cliPath || DEFAULT_CLI_PATH;

  for (const args of CLI_SMOKE_COMMANDS) {
    const fullArgs = [cliPath, ...args];
    writeOut(`CLI smoke 실행: ${command} ${fullArgs.join(' ')}`);
    const exitCode = await runCommand(command, fullArgs);
    if (exitCode !== 0) {
      writeErr(`CLI smoke 실패: ${args.join(' ')} exited with ${exitCode}`);
      return exitCode;
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
