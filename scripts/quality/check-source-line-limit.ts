/**
 * TypeScript 소스 파일 줄 수 제한 검사
 */

import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

export const MAX_SOURCE_FILE_LINES = 450;

export interface SourceLineViolation {
  path: string;
  lines: number;
}

interface SourceLineScan {
  fileCount: number;
  violations: SourceLineViolation[];
}

export function countSourceLines(source: string): number {
  if (source.length === 0) {
    return 0;
  }

  const newlineCount = source.match(/\n/g)?.length ?? 0;
  return newlineCount + (source.endsWith('\n') ? 0 : 1);
}

async function listTypeScriptFiles(directory: string): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true });
  entries.sort((left, right) => left.name.localeCompare(right.name));

  const files: string[] = [];
  for (const entry of entries) {
    const entryPath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await listTypeScriptFiles(entryPath)));
    } else if (entry.isFile() && entry.name.endsWith('.ts')) {
      files.push(entryPath);
    }
  }

  return files;
}

async function scanSourceLineLimit(sourceRoot: string, maxLines: number): Promise<SourceLineScan> {
  const files = await listTypeScriptFiles(sourceRoot);
  const violations: SourceLineViolation[] = [];

  for (const file of files) {
    const lines = countSourceLines(await readFile(file, 'utf8'));
    if (lines > maxLines) {
      violations.push({
        path: path.relative(sourceRoot, file).split(path.sep).join('/'),
        lines,
      });
    }
  }

  return { fileCount: files.length, violations };
}

export async function findSourceLineViolations(
  sourceRoot = path.resolve('src'),
  maxLines = MAX_SOURCE_FILE_LINES,
): Promise<SourceLineViolation[]> {
  return (await scanSourceLineLimit(sourceRoot, maxLines)).violations;
}

async function main(): Promise<void> {
  const sourceRoot = path.resolve('src');
  const { fileCount, violations } = await scanSourceLineLimit(
    sourceRoot,
    MAX_SOURCE_FILE_LINES,
  );

  if (violations.length === 0) {
    console.log(
      `Source file line limit passed: ${fileCount} file(s), maximum ${MAX_SOURCE_FILE_LINES} lines`,
    );
    return;
  }

  console.error(`Source files exceeding ${MAX_SOURCE_FILE_LINES} lines:`);
  for (const violation of violations) {
    console.error(`- ${violation.path}: ${violation.lines} lines`);
  }
  process.exitCode = 1;
}

const entryPath = process.argv[1];
if (entryPath && import.meta.url === pathToFileURL(entryPath).href) {
  main().catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  });
}
