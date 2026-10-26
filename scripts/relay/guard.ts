/** 브라우저 전용 감시 프로세스 진입점. */
import { pathToFileURL } from 'node:url';
import { chromium } from 'playwright';
import { browserEnvironment } from './browser-environment.js';
import { runGuard } from './guard-runtime.js';
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  void runGuard(
    process.argv[2],
    (crashDir) =>
      chromium.launchServer({
        headless: process.argv[3] === 'headless',
        chromiumSandbox: true,
        env: browserEnvironment(process.env, crashDir),
        host: '127.0.0.1',
        executablePath:
          process.argv[3] === 'headless' ? process.argv[4] : process.env.OY_BROWSER_EXECUTABLE,
        handleSIGINT: false,
        handleSIGTERM: false,
        handleSIGHUP: false,
        timeout: 30000,
      }),
    {
      once: process.once.bind(process),
      on: process.on.bind(process),
      off: process.off.bind(process),
      get connected() {
        return process.connected;
      },
      send: (message) => process.send!(message),
      exit: (code) => process.exit(code),
    },
    process.pid,
  ).catch(() => process.exit(1));
}
