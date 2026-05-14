/**
 * CLI 공통 타입 정의
 */

import type { InteractiveCliDeps } from '../cliInteractive.js';

export type FetchLike = typeof fetch;

export type WriteFn = (message: string) => void;

export interface CliDeps {
  fetchImpl: FetchLike;
  writeOut: WriteFn;
  writeErr: WriteFn;
  getVersion: () => string;
  nowIso: () => string;
  runCommand: (command: string, args: string[]) => Promise<number>;
  isInteractiveTerminal: () => boolean;
  runInteractive: (deps: InteractiveCliDeps) => Promise<number>;
}
