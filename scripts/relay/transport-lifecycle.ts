/** HTTP 경로에서는 Playwright 모듈 자체를 불러오지 않습니다. */
import { join } from 'node:path';
export async function createTransportLifecycle(
  mode: string | undefined,
  stateDir: string,
  onEvent?: (reason: string) => void | Promise<void>,
) {
  if (mode === 'http') {
    const { createHttpLifecycle } = await import('./http-lifecycle.js');
    return createHttpLifecycle();
  }
  if (mode !== undefined && mode !== 'browser')
    throw new Error('OY_RELAY_TRANSPORT 값이 잘못되었습니다.');
  const { createBrowserLifecycle } = await import('./lifecycle.js');
  const { launchGuardedBrowser } = await import('./supervisor.js');
  return createBrowserLifecycle(
    () => launchGuardedBrowser(join(stateDir, 'browser-owner.json')),
    onEvent,
  );
}
