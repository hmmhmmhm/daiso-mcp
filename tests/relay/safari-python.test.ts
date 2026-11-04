/** Python 소유 창 회귀도 기본 CI 검사에 포함합니다. */
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { expect, it } from 'vitest';
it('실제 브라우저 없이 Python 잠금·회수 회귀를 실행한다', () => {
  const output = execFileSync(
    'python3',
    [fileURLToPath(new URL('./test_oliveyoung_safari.py', import.meta.url))],
    { encoding: 'utf8', timeout: 15000, stdio: ['ignore', 'pipe', 'pipe'] },
  );
  expect(output).toBe('');
});
