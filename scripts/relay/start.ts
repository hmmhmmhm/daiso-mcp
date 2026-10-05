import { createRelayLogger } from './logging.js';
import { observeRelay } from './observed.js';
/** 실행 시에만 로컬 브라우저 릴레이를 시작합니다. */
import { createServer } from 'node:http';
import { Readable } from 'node:stream';
import { pathToFileURL } from 'node:url';
import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { createTransportLifecycle } from './transport-lifecycle.js';
import { createFileQuota } from './quota.js';
import { createOliveyoungRelay } from './oliveyoung.js';

let logger: ReturnType<typeof createRelayLogger> | undefined;
async function main() {
  const token = process.env.OY_RELAY_TOKEN;
  if (!token?.trim()) throw new Error('OY_RELAY_TOKEN이 필요합니다.');
  const port = Number(process.env.OY_RELAY_PORT || 4319);
  if (!Number.isInteger(port) || port < 1024 || port > 65535)
    throw new Error('OY_RELAY_PORT 값이 잘못되었습니다.');
  const stateDir = process.env.OY_RELAY_STATE_DIR;
  if (!stateDir) throw new Error('OY_RELAY_STATE_DIR이 필요합니다.');
  await mkdir(stateDir, { recursive: true, mode: 0o700 });
  logger = createRelayLogger(join(stateDir, 'logs'), { service: 'oliveyoung' });
  const log = logger;
  log.append({ stage: 'process', outcome: 'starting' });
  const takeQuota = await createFileQuota(join(stateDir, 'quota.json'));
  log.append({ stage: 'quota', outcome: 'snapshot', ...takeQuota.status() });
  const heartbeat = setInterval(
    () => log.append({ stage: 'process', outcome: 'heartbeat', ...takeQuota.status() }),
    60000,
  );
  heartbeat.unref();
  const lifecycle = await createTransportLifecycle(
    process.env.OY_RELAY_TRANSPORT,
    stateDir,
    (outcome) =>
      log.append({
        stage: 'lifecycle',
        operation: process.env.OY_RELAY_TRANSPORT || 'browser',
        outcome,
      }),
  );
  try {
    await lifecycle.start();
    const handler = observeRelay(
      createOliveyoungRelay(token, lifecycle.run, {
        takeQuota,
        status: () => ({ ...lifecycle.status(), logging: log.status() }),
        onEvent: log.append,
      }),
      log.append,
    );
    const server = createServer(async (req, res) => {
      try {
        const controller = new AbortController();
        res.once('close', () => controller.abort());
        const request = new Request(`http://127.0.0.1:${port}${req.url}`, {
          signal: controller.signal,
          method: req.method,
          headers: req.headers as Record<string, string>,
          body: req.method === 'GET' || req.method === 'HEAD' ? undefined : Readable.toWeb(req),
          duplex: 'half',
        } as RequestInit & { duplex: 'half' });
        const response = await handler(request);
        res.writeHead(response.status, {
          ...Object.fromEntries(response.headers),
          'Content-Type': 'application/json',
          'Cache-Control': 'no-store',
        });
        res.end(await response.text());
      } catch {
        log.append({ stage: 'server', outcome: 'error', status: 500 });
        res.writeHead(500);
        res.end('{"error":"Relay failure"}');
      }
    });
    server.requestTimeout = 10000;
    server.headersTimeout = 10000;
    await new Promise<void>((resolve, reject) => {
      server.once('error', reject);
      server.listen(port, '127.0.0.1', resolve);
    });
    console.log(`Oliveyoung relay ready on 127.0.0.1:${port}`);
    let stopping = false;
    const close = () => {
      if (stopping) return;
      stopping = true;
      clearInterval(heartbeat);
      log.append({ stage: 'process', outcome: 'stopping' });
      server.close();
      server.closeAllConnections();
      void lifecycle
        .close()
        .then(() => log.flush())
        .then(() => process.exit(0))
        .catch(() => process.exit(1));
    };
    process.once('SIGTERM', close);
    process.once('SIGINT', close);
  } catch (error) {
    await lifecycle.close();
    throw error;
  }
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch(async () => {
    logger?.append({ stage: 'process', outcome: 'startup-failed' });
    await logger?.flush();
    console.error('올리브영 릴레이 시작 실패: 토큰, 포트 및 전송 환경을 확인하세요.');
    process.exitCode = 1;
  });
}
