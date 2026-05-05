/**
 * CLI 기본 의존성 생성
 */

import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import { runInteractiveCli } from '../cliInteractive.js';
import type { CliDeps } from './types.js';

function loadVersion(): string {
  const cliPath = fileURLToPath(import.meta.url);
  const packagePath = path.resolve(path.dirname(cliPath), '../../package.json');

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

export function createDefaultDeps(): CliDeps {
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
