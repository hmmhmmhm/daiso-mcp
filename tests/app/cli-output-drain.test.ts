import { execFile } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { expect, it } from 'vitest';

it('CLI는 큰 JSON 파이프 출력을 완전히 전달하고 반환된 종료 코드를 보존한다', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'daiso-cli-output-'));
  try {
    await writeFile(join(directory, 'package.json'), '{"type":"module"}');
    await writeFile(join(directory, 'bin.js'), await readFile(new URL('../../src/bin.ts', import.meta.url), 'utf8'));
    await writeFile(join(directory, 'cli.js'), `export async function runCli(args) {
      console.log(JSON.stringify({ data: 'x'.repeat(256 * 1024) }));
      return args.includes('--fail') ? 7 : 0;
    }`);
    const run = promisify(execFile);
    const result = await run(process.execPath, [join(directory, 'bin.js')], { maxBuffer: 1024 * 1024 });
    expect(JSON.parse(result.stdout).data).toHaveLength(256 * 1024);
    try {
      await run(process.execPath, [join(directory, 'bin.js'), '--fail'], { maxBuffer: 1024 * 1024 });
      throw new Error('Expected nonzero CLI exit');
    } catch (error) {
      expect(error).toMatchObject({ code: 7 });
      expect(JSON.parse((error as { stdout: string }).stdout).data).toHaveLength(256 * 1024);
    }
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

it('npm 및 직접 실행 CLI는 실제 응답의 큰 JSON을 파이프에서 보존한다', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'daiso-cli-response-'));
  try {
    const preload = join(directory, 'fetch.mjs');
    await writeFile(preload, `globalThis.fetch = async () => Response.json({success:true,data:{value:'x'.repeat(256 * 1024)}});`);
    for (const entry of ['bin.ts', 'cli.ts']) {
      const { stdout } = await promisify(execFile)(process.execPath, [
        '--import', 'tsx', '--import', preload,
        new URL('../../src/' + entry, import.meta.url).pathname,
        'get', '/api/opinet/average', '--json',
      ], { maxBuffer: 1024 * 1024 });
      expect(JSON.parse(stdout).data.value).toHaveLength(256 * 1024);
    }
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
