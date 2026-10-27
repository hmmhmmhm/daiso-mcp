/** 가벼운 Python 회귀로 소유 프로세스 회수와 자원 판정을 확인합니다. */
import { execFileSync } from 'node:child_process';
import { expect, it } from 'vitest';

it.skipIf(process.platform === 'win32')(
  '자원 보호는 중복 검사를 거절하고 소유한 자식만 종료한다',
  () => {
    const output = execFileSync(
      process.platform === 'darwin' ? '/usr/bin/python3' : 'python3',
      ['tests/scripts/fixtures/resource_guard_tests.py'],
      { encoding: 'utf8' },
    );
    expect(output).toBe('');
  },
);
