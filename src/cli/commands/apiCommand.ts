/**
 * API 기반 CLI 명령 공통 실행기
 */

import { printCommandHelp, type CommandName } from '../../cliHelp.js';
import { applyOptionsToQuery, parseCliArgs, toQueryOptions, toUrl } from '../args.js';
import { validateCommandOptions, type CliOptionCommand } from '../commandOptions.js';
import { requestAndPrintResponse } from '../http.js';
import type { CliDeps } from '../types.js';

export interface ParsedApiCommand {
  positionals: string[];
  options: Record<string, string>;
}

interface RunApiCommandParams {
  command: CliOptionCommand & CommandName;
  options: string[];
  deps: CliDeps;
  path: string;
  label?: string;
  configure?: (parsed: ParsedApiCommand) => string | null;
}

export async function runApiCommand(params: RunApiCommandParams): Promise<number> {
  const parsed = parseCliArgs(params.options);
  if (parsed.options.help === 'true') {
    return printCommandHelp(params.command, params.deps.writeOut, params.deps.writeErr);
  }

  const errorMessage = params.configure?.(parsed) ?? null;
  if (errorMessage) {
    params.deps.writeErr(errorMessage);
    return 1;
  }

  if (validateCommandOptions(params.command, parsed.options, params.deps.writeErr)) {
    return 1;
  }

  const targetUrl = toUrl(params.path);
  applyOptionsToQuery(targetUrl, toQueryOptions(parsed.options));
  return await requestAndPrintResponse(
    params.deps.fetchImpl,
    params.deps.writeOut,
    params.deps.writeErr,
    targetUrl,
    params.label ?? params.command,
    parsed.options.json === 'true',
  );
}
