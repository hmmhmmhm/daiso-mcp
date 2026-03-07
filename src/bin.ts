#!/usr/bin/env node

/**
 * npm bin 엔트리 포인트
 */

import { runCli } from './cli.js';

runCli(process.argv.slice(2)).then((exitCode) => {
  process.exit(exitCode);
});
