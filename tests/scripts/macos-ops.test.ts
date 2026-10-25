import { execFileSync } from 'node:child_process';
import { expect, it } from 'vitest';

it.skipIf(process.platform === 'win32')('Mac 운영 도구는 개인 파일과 안전한 상태만 관리한다', () => {
  const output = execFileSync(
    process.platform === 'darwin' ? '/usr/bin/python3' : 'python3',
    ['tests/scripts/fixtures/macos_ops_tests.py'],
    { encoding: 'utf8' },
  );
  expect(output).toBe('');
});
