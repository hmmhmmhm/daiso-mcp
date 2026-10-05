/** 독립 감시 프로세스의 마커·실행·회수를 연결합니다. */
import { open, unlink, mkdir, rm, realpath } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import type { EventEmitter } from 'node:events';
import { bounded } from './lifecycle.js';
import { createGuardController } from './guard-controller.js';
import { closeOwnedGroup, processSnapshot } from './ownership.js';
interface OwnedServer {
  process(): { pid?: number };
  wsEndpoint(): string;
  close(): Promise<void>;
  kill(): Promise<void>;
}
interface Channel extends Pick<EventEmitter, 'once' | 'on' | 'off'> {
  connected: boolean;
  send(message: unknown): void;
  exit(code: number): void;
}
export async function runGuard(
  markerPath: string,
  launch: (crashDir: string) => Promise<OwnedServer>,
  channel: Channel,
  pid: number,
  snapshot = processSnapshot,
) {
  const marker = await open(markerPath, 'wx', 0o600);
  const crashPath = `${markerPath}.${randomUUID()}.crashpad`;
  await mkdir(crashPath, { mode: 0o700 });
  const crashDir = await realpath(crashPath);
  await marker.writeFile(JSON.stringify({ guardPid: pid, state: 'launching', crashDir }));
  await marker.sync();
  let cleanupDeadline = 0;
  const guard = createGuardController(
    async () => {
      const server = await launch(crashDir);
      try {
        const root = (await snapshot()).find((row) => row.pid === server.process().pid);
        if (!root || root.pid !== root.pgid) throw new Error('Browser ownership unavailable');
        root.crashDir = crashDir;
        await marker.truncate(0);
        await marker.write(JSON.stringify({ guardPid: pid, browser: root }), 0);
        await marker.sync();
        return {
          root,
          endpoint: server.wsEndpoint(),
          close: () =>
            closeOwnedGroup(
              root,
              () => server.close(),
              snapshot,
              process.kill,
              cleanupDeadline - 500,
            ),
        };
      } catch (error) {
        await server.kill();
        throw error;
      }
    },
    async () => {
      await marker.close();
      await rm(crashDir, { recursive: true, force: true });
      await unlink(markerPath);
    },
  );
  let stopping = false;
  const stop = () => {
    if (stopping) return;
    stopping = true;
    cleanupDeadline ||= Date.now() + 8000;
    void bounded(guard.stop(), Math.max(0, cleanupDeadline - Date.now()))
      .then(() => {
        if (channel.connected) channel.send({ type: 'closed' });
        disposeListeners();
        channel.exit(0);
      })
      .catch(() => {
        disposeListeners();
        channel.exit(1);
      });
  };
  channel.once('disconnect', stop);
  channel.once('SIGTERM', stop);
  channel.once('SIGINT', stop);
  const onMessage = (message: unknown) => {
    if (message === 'close') stop();
    else if (
      message &&
      typeof message === 'object' &&
      'type' in message &&
      message.type === 'close' &&
      'deadline' in message &&
      typeof message.deadline === 'number' &&
      Number.isFinite(message.deadline)
    ) {
      if (!stopping) cleanupDeadline = message.deadline;
      stop();
    }
  };
  channel.on('message', onMessage);
  const disposeListeners = () => {
    for (const event of ['disconnect', 'SIGTERM', 'SIGINT']) channel.off(event, stop);
    channel.off('message', onMessage);
  };
  try {
    const ready = await guard.start();
    if (!channel.connected || stopping) {
      stop();
      return;
    }
    channel.send({ type: 'ready', endpoint: ready.endpoint, root: ready.root });
  } catch {
    // 강제 실패에는 마커를 남겨 불확실한 상태에서 후속 실행을 차단합니다.
    await marker.close();
    disposeListeners();
    channel.exit(1);
  }
}
