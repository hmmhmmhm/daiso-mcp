/**
 * CLI 인자 파싱 및 URL 조작 유틸리티
 */

import { DEFAULT_BASE_URL } from './constants.js';

export function parseCliArgs(args: string[]): { positionals: string[]; options: Record<string, string> } {
  const positionals: string[] = [];
  const options: Record<string, string> = {};

  for (let index = 0; index < args.length; index += 1) {
    const token = args[index];
    if (!token.startsWith('--')) {
      positionals.push(token);
      continue;
    }

    const withoutPrefix = token.slice(2);
    const equalIndex = withoutPrefix.indexOf('=');

    if (equalIndex >= 0) {
      const key = withoutPrefix.slice(0, equalIndex);
      const value = withoutPrefix.slice(equalIndex + 1);
      options[key] = value;
      continue;
    }

    const key = withoutPrefix;
    const nextValue = args[index + 1];
    if (!nextValue || nextValue.startsWith('--')) {
      options[key] = 'true';
      continue;
    }

    options[key] = nextValue;
    index += 1;
  }

  return { positionals, options };
}

export function toUrl(pathOrUrl: string): URL {
  if (pathOrUrl.startsWith('http://') || pathOrUrl.startsWith('https://')) {
    return new URL(pathOrUrl);
  }

  const normalizedPath = pathOrUrl.startsWith('/') ? pathOrUrl : `/${pathOrUrl}`;
  return new URL(normalizedPath, DEFAULT_BASE_URL);
}

export function applyOptionsToQuery(url: URL, options: Record<string, string>): void {
  for (const [key, value] of Object.entries(options)) {
    url.searchParams.set(key, value);
  }
}

export function toQueryOptions(options: Record<string, string>): Record<string, string> {
  const queryOptions: Record<string, string> = {};
  for (const [key, value] of Object.entries(options)) {
    if (key === 'help' || key === 'json') {
      continue;
    }
    queryOptions[key] = value;
  }
  return queryOptions;
}

export function findUnknownOption(
  options: Record<string, string>,
  allowedOptions: readonly string[],
): string | null {
  const allowed = new Set(allowedOptions);
  for (const key of Object.keys(options)) {
    if (!allowed.has(key)) {
      return key;
    }
  }

  return null;
}

export function writeUnknownOptionError(
  options: Record<string, string>,
  allowedOptions: readonly string[],
  writeErr: (message: string) => void,
  hint?: string,
): boolean {
  const unknownOption = findUnknownOption(options, allowedOptions);
  if (!unknownOption) {
    return false;
  }

  writeErr(`알 수 없는 옵션: --${unknownOption}`);
  if (hint) {
    writeErr(hint);
  }
  writeErr('도움말: daiso help');
  return true;
}
