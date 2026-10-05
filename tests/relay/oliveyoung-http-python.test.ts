/** Python 기본 라이브러리 헬퍼의 오프라인 검증도 일반 CI 테스트에 포함합니다. */
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { expect, it } from 'vitest';
it('passes the offline Python HTTP security and response tests', () => {
  const script = fileURLToPath(new URL('./test_oliveyoung_http.py', import.meta.url));
  const result = execFileSync('python3', ['-I', script], {
    encoding: 'utf8',
    timeout: 10000,
    stdio: 'pipe',
  });
  expect(result).toBe('');
});
import { vi } from 'vitest';
vi.mock('../../scripts/relay/lifecycle.js', () => {
  throw new Error('HTTP imported browser lifecycle');
});
vi.mock('../../scripts/relay/supervisor.js', () => {
  throw new Error('HTTP imported Playwright launcher');
});
import { createTransportLifecycle } from '../../scripts/relay/transport-lifecycle.js';
it('starts the real helper and rejects an invalid path without loading browser modules', async () => {
  const lifecycle = await createTransportLifecycle('http', '/unused');
  try {
    await lifecycle.start();
    expect(lifecycle.status()).toMatchObject({ state: 'ready', browserRequired: false });
    await expect(lifecycle.run('https://evil.test', {})).rejects.toThrow(
      /^HTTP relay request failed$/,
    );
  } finally {
    await lifecycle.close();
  }
});
