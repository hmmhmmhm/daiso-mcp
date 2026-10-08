/** 민감한 입력을 제외하고 디스크·메모리 상한을 지키는 로컬 JSONL 로그. */
import { appendFile, chmod, mkdir, readdir, stat, statfs, unlink } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { join } from 'node:path';

interface LoggerOptions {
  service: 'oliveyoung' | 'dtryx' | 'convenience';
  now?: () => number;
  statfs?: (path: string) => Promise<{ bavail: number; bsize: number }>;
  appendFile?: typeof appendFile;
  maxFileBytes?: number;
  maxTotalBytes?: number;
}
export function createRelayLogger(directory: string, options: LoggerOptions) {
  const now = options.now ?? Date.now;
  const available = options.statfs ?? statfs;
  const write = options.appendFile ?? appendFile;
  const maxFileBytes = Math.min(options.maxFileBytes ?? 4 * 1024 ** 2, 4 * 1024 ** 2);
  const maxTotalBytes = Math.min(options.maxTotalBytes ?? 64 * 1024 ** 2, 64 * 1024 ** 2);
  const ownFile = new RegExp(`^${options.service}-[0-9]+-[A-Za-z0-9-]+\\.jsonl$`);
  const queue: string[] = [];
  let running: Promise<void> | undefined;
  let queued = 0;
  let written = 0;
  let dropped = 0;
  let errors = 0;
  let lowSpace = false;
  let active: string | undefined;
  let initialized = false;

  async function persist(line: string, count: number) {
    if (!initialized) {
      await mkdir(directory, { recursive: true, mode: 0o700 });
      await chmod(directory, 0o700);
      initialized = true;
    }
    const files: { name: string; bytes: number; created: number }[] = [];
    for (const item of await readdir(directory, { withFileTypes: true })) {
      if (!item.isFile() || !ownFile.test(item.name)) continue;
      const info = await stat(join(directory, item.name));
      const created = Number(item.name.split('-')[1]);
      if (created <= now() - 7 * 86400000) {
        await unlink(join(directory, item.name));
      } else {
        files.push({ name: item.name, bytes: info.size, created });
      }
    }
    files.sort((a, b) => a.created - b.created || a.name.localeCompare(b.name));
    const bytes = Buffer.byteLength(line);
    if (bytes > maxFileBytes || bytes > maxTotalBytes) {
      dropped += count;
      return;
    }
    let total = files.reduce((sum, file) => sum + file.bytes, 0);
    while (total + bytes > maxTotalBytes) {
      const oldest = files.shift()!;
      await unlink(join(directory, oldest.name));
      total -= oldest.bytes;
    }
    const disk = await available(directory);
    lowSpace = disk.bavail * disk.bsize - bytes < 2 * 1024 ** 3;
    if (lowSpace) {
      dropped += count;
      return;
    }
    const current = files.find((file) => file.name === active);
    if (!current || current.bytes + bytes > maxFileBytes) {
      active = `${options.service}-${now()}-${randomUUID()}.jsonl`;
    }
    await write(join(directory, active!), line, { mode: 0o600 });
    written += count;
  }
  async function drain() {
    while (queue.length) {
      const batch = [queue.shift()!];
      let bytes = Buffer.byteLength(batch[0]);
      // 이벤트 64개씩 묶되 파일·전체 상한보다 큰 묶음은 만들지 않습니다.
      while (queue.length && batch.length < 64) {
        const nextBytes = Buffer.byteLength(queue[0]);
        if (bytes + nextBytes > Math.min(maxFileBytes, maxTotalBytes)) break;
        batch.push(queue.shift()!);
        bytes += nextBytes;
      }
      try {
        await persist(batch.join(''), batch.length);
      } catch {
        errors++;
        dropped += batch.length;
      } finally {
        queued -= batch.length;
      }
    }
    running = undefined;
  }
  return {
    append(event: object): void {
      try {
        const safe: Record<string, unknown> = {
          time: new Date(now()).toISOString(),
          service: options.service,
        };
        for (const field of [
          'requestId',
          'parentRequestId',
          'operation',
          'stage',
          'outcome',
          'cache',
          'quotaReason',
        ]) {
          const value = (event as Record<string, unknown>)[field];
          if (typeof value === 'string' && /^[A-Za-z0-9_-]{1,64}$/.test(value)) safe[field] = value;
        }
        for (const field of ['status', 'durationMs', 'dailyRemaining', 'minuteRemaining']) {
          const value = (event as Record<string, unknown>)[field];
          if (typeof value === 'number' && Number.isFinite(value) && value >= 0)
            safe[field] = value;
        }
        const line = `${JSON.stringify(safe)}\n`;
        // 허용 필드 7개×64자와 숫자 4개로 각 이벤트는 2KiB 미만입니다.
        if (queued >= 256) {
          dropped++;
          return;
        }
        queue.push(line);
        queued++;
        running ??= drain();
      } catch {
        errors++;
        dropped++;
      }
    },
    async flush(): Promise<void> {
      await running;
    },
    status() {
      return { queued, written, dropped, errors, lowSpace };
    },
  };
}
