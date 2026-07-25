import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  countSourceLines,
  findSourceLineViolations,
} from '../../scripts/quality/check-source-line-limit.js';

const temporaryRoots: string[] = [];

afterEach(async () => {
  await Promise.all(
    temporaryRoots.splice(0).map((temporaryRoot) => rm(temporaryRoot, { force: true, recursive: true })),
  );
});

describe('source line limit', () => {
  it('마지막 줄바꿈 유무와 빈 파일을 일관되게 계산한다', () => {
    expect(countSourceLines('')).toBe(0);
    expect(countSourceLines('first')).toBe(1);
    expect(countSourceLines('first\nsecond')).toBe(2);
    expect(countSourceLines('first\nsecond\n')).toBe(2);
  });

  it('450줄은 허용하고 중첩된 451줄 TypeScript 파일만 보고한다', async () => {
    const sourceRoot = await mkdtemp(path.join(tmpdir(), 'daiso-source-lines-'));
    temporaryRoots.push(sourceRoot);
    await mkdir(path.join(sourceRoot, 'nested'));
    await writeFile(path.join(sourceRoot, 'allowed.ts'), 'line\n'.repeat(450));
    await writeFile(path.join(sourceRoot, 'nested', 'too-long.ts'), 'line\n'.repeat(451));
    await writeFile(path.join(sourceRoot, 'nested', 'ignored.js'), 'line\n'.repeat(500));

    await expect(findSourceLineViolations(sourceRoot, 450)).resolves.toEqual([
      {
        path: 'nested/too-long.ts',
        lines: 451,
      },
    ]);
  });
});
