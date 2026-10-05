import { createRelayLogger } from './logging.js';
import { observeRelay } from './observed.js';
/** 브라우저 없이 별도 프로세스로 디트릭스 중계를 실행합니다. */
import { createServer } from 'node:http';
import { Readable } from 'node:stream';
import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createFileQuota } from './quota.js';
import { createConvenienceRelay } from './convenience.js';
import { createDtryxRelay } from './dtryx.js';

let logger: ReturnType<typeof createRelayLogger> | undefined;
async function main() {
  const token = process.env.DTRYX_RELAY_TOKEN;
  const stateDir = process.env.DTRYX_RELAY_STATE_DIR;
  const port = Number(process.env.DTRYX_RELAY_PORT || 4320);
  if (!token?.trim() || !stateDir || !Number.isInteger(port) || port < 1024 || port > 65535) {
    throw new Error('Invalid relay configuration');
  }
  await mkdir(stateDir, { recursive: true, mode: 0o700 });
  logger = createRelayLogger(join(stateDir, 'logs'), { service: 'dtryx' });
  const log = logger;
  log.append({ stage: 'process', outcome: 'starting' });
  const takeQuota = await createFileQuota(join(stateDir, 'quota.json'));
  log.append({ stage: 'quota', outcome: 'snapshot', ...takeQuota.status() });
  const heartbeat = setInterval(
    () => log.append({ stage: 'process', outcome: 'heartbeat', ...takeQuota.status() }),
    60000,
  );
  heartbeat.unref();
  let convenience: ((request: Request) => Promise<Response>) | undefined;
  let convenienceLog: ReturnType<typeof createRelayLogger> | undefined;
  if (process.env.CONVENIENCE_RELAY_TOKEN !== undefined || process.env.CONVENIENCE_RELAY_STATE_DIR !== undefined) {
    const convenienceToken = process.env.CONVENIENCE_RELAY_TOKEN;
    const convenienceDir = process.env.CONVENIENCE_RELAY_STATE_DIR;
    if (!convenienceToken?.trim() || !convenienceDir || convenienceDir === stateDir) throw Error('Invalid convenience configuration');
    await mkdir(convenienceDir, { recursive: true, mode: 0o700 });
    convenienceLog = createRelayLogger(join(convenienceDir, 'logs'), { service: 'convenience' });
    const quota = await createFileQuota(join(convenienceDir, 'quota.json'));
    const convenienceHandler = createConvenienceRelay(convenienceToken, { takeQuota: quota, onEvent: convenienceLog.append, gs25ApiKey: process.env.GS25_API_KEY });
    convenience = observeRelay(async (request) => {
      const response = await convenienceHandler(request);
      if (response.ok && new URL(request.url).pathname === '/v1/convenience/health') return Response.json({ ...(await response.json()), quota: quota.status(), logging: convenienceLog!.status() });
      return response;
    }, convenienceLog.append);
  }
  const relay = createDtryxRelay(token, { takeQuota, onEvent: log.append });
  const dtryxHandler = observeRelay(async (request) => {
    const response = await relay(request);
    if (response.ok && new URL(request.url).pathname === '/v1/dtryx/health') {
      return Response.json({
        ...(await response.json()),
        quota: takeQuota.status(),
        logging: log.status(),
      });
    }
    return response;
  }, log.append);
  const handler = (request: Request) => new URL(request.url).pathname.startsWith('/v1/convenience/')
    ? convenience ? convenience(request) : Promise.resolve(Response.json({ error: 'Not found' }, { status: 404 }))
    : dtryxHandler(request);
  const server = createServer(async (req, res) => {
    const controller = new AbortController();
    res.once('close', () => controller.abort());
    try {
      const response = await handler(
        new Request(`http://127.0.0.1:${port}${req.url}`, {
          method: req.method,
          headers: req.headers as Record<string, string>,
          signal: controller.signal,
          body: req.method === 'GET' || req.method === 'HEAD' ? undefined : Readable.toWeb(req),
          duplex: 'half',
        } as RequestInit & { duplex: 'half' }),
      );
      res.writeHead(response.status, {
        ...Object.fromEntries(response.headers),
        'Content-Type': 'application/json',
        'Cache-Control': 'no-store',
        Connection: 'close',
      });
      res.end(await response.text());
    } catch {
      log.append({ stage: 'server', outcome: 'error', status: 500 });
      res.writeHead(500, { Connection: 'close' });
      res.end('{"error":"Relay failure"}');
    }
  });
  server.requestTimeout = 15000;
  server.headersTimeout = 10000;
  server.setTimeout(15000, (socket) => socket.destroy());
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, '127.0.0.1', resolve);
  });
  console.log(`Dtryx relay ready on 127.0.0.1:${port}`);
  const close = () => {
    clearInterval(heartbeat);
    log.append({ stage: 'process', outcome: 'stopping' });
    void log.flush();
    void convenienceLog?.flush();
    server.close();
    server.closeAllConnections();
  };
  process.once('SIGTERM', close);
  process.once('SIGINT', close);
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch(async () => {
    logger?.append({ stage: 'process', outcome: 'startup-failed' });
    await logger?.flush();
    console.error('디트릭스 릴레이 시작 실패: 토큰, 포트 및 상태 경로를 확인하세요.');
    process.exitCode = 1;
  });
}
