import { vi } from 'vitest';

type SqlRow = Record<string, SqlStorageValue>;
type NativeSqlValue = string | number | bigint | null | Uint8Array;

interface NativeStatement {
  all(...bindings: NativeSqlValue[]): Record<string, NativeSqlValue>[];
  columns(): Array<{ name: string }>;
  run(...bindings: NativeSqlValue[]): { changes: number | bigint };
}

interface NativeDatabase {
  prepare(query: string): NativeStatement;
}

type NativeDatabaseConstructor = new (path: string) => NativeDatabase;

let NativeDatabaseSync: NativeDatabaseConstructor | undefined;
try {
  const moduleName = 'node:sqlite';
  const sqliteModule = (await import(moduleName)) as unknown as {
    DatabaseSync: NativeDatabaseConstructor;
  };
  NativeDatabaseSync = sqliteModule.DatabaseSync;
} catch {
  NativeDatabaseSync = undefined;
}

export const HAS_NATIVE_SQLITE = NativeDatabaseSync !== undefined;

export interface StoredEvent {
  eventId: string;
  occurredAt: number;
  day: string;
  service: string;
  identityId: string;
}

interface ExecutedSql {
  query: string;
  bindings: SqlStorageValue[];
}

class TestSqlCursor<T extends SqlRow> implements SqlStorageCursor<T> {
  readonly rowsRead: number;
  private index = 0;

  constructor(
    private readonly rows: T[],
    readonly rowsWritten = 0,
    readonly columnNames: string[] = rows[0] ? Object.keys(rows[0]) : [],
  ) {
    this.rowsRead = rows.length;
  }

  next(): { done?: false; value: T } | { done: true; value?: never } {
    const value = this.rows[this.index++];
    return value === undefined ? { done: true } : { done: false, value };
  }

  toArray(): T[] {
    return [...this];
  }

  one(): T {
    const rows = this.toArray();
    if (rows.length !== 1) {
      throw new Error(`한 행이 필요하지만 ${rows.length}개를 받았습니다.`);
    }
    return rows[0];
  }

  *raw<U extends SqlStorageValue[]>(): IterableIterator<U> {
    for (const row of this) {
      yield Object.values(row) as unknown as U;
    }
  }

  *[Symbol.iterator](): IterableIterator<T> {
    let result = this.next();
    while (!result.done) {
      yield result.value;
      result = this.next();
    }
  }
}

interface TestSqlStorage {
  readonly executed: ExecutedSql[];
  exec<T extends SqlRow>(query: string, ...bindings: any[]): SqlStorageCursor<T>;
  readEvents(): StoredEvent[];
  seed(events: StoredEvent[]): void;
}

function normalize(query: string): string {
  return query.replace(/\s+/g, ' ').trim();
}

function toNativeBinding(binding: SqlStorageValue): NativeSqlValue {
  return binding instanceof ArrayBuffer ? new Uint8Array(binding) : binding;
}

class NativeSqlStorage implements TestSqlStorage {
  readonly executed: ExecutedSql[] = [];

  constructor(private readonly database: NativeDatabase) {}

  exec<T extends SqlRow>(query: string, ...bindings: any[]): SqlStorageCursor<T> {
    const sqlBindings = bindings as SqlStorageValue[];
    this.executed.push({ query: normalize(query), bindings: sqlBindings });
    const statement = this.database.prepare(query);
    const columnNames = statement.columns().map(({ name }) => name);
    const nativeBindings = sqlBindings.map(toNativeBinding);

    if (columnNames.length > 0) {
      const rows = statement.all(...nativeBindings) as unknown as T[];
      return new TestSqlCursor(rows, 0, columnNames);
    }

    const result = statement.run(...nativeBindings);
    return new TestSqlCursor<T>([], Number(result.changes), columnNames);
  }

  seed(events: StoredEvent[]): void {
    const statement = this.database.prepare(
      `INSERT INTO blocked_events (event_id, occurred_at, day, service, identity_id)
       VALUES (?, ?, ?, ?, ?)`,
    );
    for (const event of events) {
      statement.run(event.eventId, event.occurredAt, event.day, event.service, event.identityId);
    }
  }

  readEvents(): StoredEvent[] {
    const rows = this.database
      .prepare(
        `SELECT event_id, occurred_at, day, service, identity_id
         FROM blocked_events
         ORDER BY event_id ASC`,
      )
      .all();
    return rows.map((row) => ({
      eventId: String(row.event_id),
      occurredAt: Number(row.occurred_at),
      day: String(row.day),
      service: String(row.service),
      identityId: String(row.identity_id),
    }));
  }
}

const CREATE_TABLE = normalize(`CREATE TABLE IF NOT EXISTS blocked_events (
  event_id TEXT PRIMARY KEY,
  occurred_at INTEGER NOT NULL,
  day TEXT NOT NULL,
  service TEXT NOT NULL,
  identity_id TEXT NOT NULL
)`);
const INDEXES = new Set([
  'CREATE INDEX IF NOT EXISTS idx_blocked_events_day_service ON blocked_events(day, service)',
  'CREATE INDEX IF NOT EXISTS idx_blocked_events_day_identity ON blocked_events(day, identity_id)',
  'CREATE INDEX IF NOT EXISTS idx_blocked_events_day_service_identity ON blocked_events(day, service, identity_id)',
]);
const INSERT = normalize(`INSERT OR IGNORE INTO blocked_events
  (event_id, occurred_at, day, service, identity_id)
 VALUES (?, ?, ?, ?, ?)`);
const DELETE_BATCH = normalize(`DELETE FROM blocked_events
 WHERE event_id IN (
   SELECT event_id
   FROM blocked_events
   WHERE day < ?
   ORDER BY day ASC, event_id ASC
   LIMIT ?
 )`);
const DELETE_ALL = 'DELETE FROM blocked_events WHERE day < ?';
const TOTAL_SELECT = normalize(`SELECT COUNT(*) AS blocked_requests,
  COUNT(DISTINCT identity_id) AS unique_identities
 FROM blocked_events
 WHERE day >= ? AND day <= ? AND day >= ?`);
const DAILY_SELECT = normalize(`SELECT day,
  COUNT(*) AS blocked_requests,
  COUNT(DISTINCT identity_id) AS unique_identities
 FROM blocked_events
 WHERE day >= ? AND day <= ? AND day >= ?
 GROUP BY day
 ORDER BY day ASC`);
const SERVICE_SELECT = normalize(`SELECT day,
  service,
  COUNT(*) AS blocked_requests,
  COUNT(DISTINCT identity_id) AS unique_identities
 FROM blocked_events
 WHERE day >= ? AND day <= ? AND day >= ?
 GROUP BY day, service
 ORDER BY day ASC, service ASC`);

function withServiceFilter(query: string): string {
  return query.includes(' GROUP BY')
    ? query.replace(' GROUP BY', ' AND service = ? GROUP BY')
    : query.replace(
        ' WHERE day >= ? AND day <= ? AND day >= ?',
        ' WHERE day >= ? AND day <= ? AND day >= ? AND service = ?',
      );
}

function assertBindingCount(bindings: SqlStorageValue[], expected: number): void {
  if (bindings.length !== expected) {
    throw new Error(`SQL 바인딩은 ${expected}개가 필요합니다.`);
  }
}

function groupEvents(
  events: StoredEvent[],
  keyOf: (event: StoredEvent) => string,
): StoredEvent[][] {
  const groups = new Map<string, StoredEvent[]>();
  for (const event of events) {
    const key = keyOf(event);
    groups.set(key, [...(groups.get(key) ?? []), event]);
  }
  return [...groups.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([, group]) => group);
}

class MemorySqlStorage implements TestSqlStorage {
  readonly executed: ExecutedSql[] = [];
  private readonly events = new Map<string, StoredEvent>();

  exec<T extends SqlRow>(query: string, ...bindings: any[]): SqlStorageCursor<T> {
    const normalized = normalize(query);
    const sqlBindings = bindings as SqlStorageValue[];
    this.executed.push({ query: normalized, bindings: sqlBindings });

    if (normalized === CREATE_TABLE || INDEXES.has(normalized)) {
      assertBindingCount(sqlBindings, 0);
      return new TestSqlCursor<T>([]);
    }
    if (normalized === INSERT) {
      return this.insert<T>(sqlBindings);
    }
    if (normalized === DELETE_BATCH) {
      return this.deleteBatch<T>(sqlBindings);
    }
    if (normalized === DELETE_ALL) {
      return this.deleteAll<T>(sqlBindings);
    }

    const select = this.select<T>(normalized, sqlBindings);
    if (select) {
      return select;
    }
    throw new Error(`지원하지 않는 SQL: ${normalized}`);
  }

  seed(events: StoredEvent[]): void {
    for (const event of events) {
      if (this.events.has(event.eventId)) {
        throw new Error('UNIQUE constraint failed: blocked_events.event_id');
      }
      this.events.set(event.eventId, { ...event });
    }
  }

  readEvents(): StoredEvent[] {
    return [...this.events.values()]
      .sort((left, right) => left.eventId.localeCompare(right.eventId))
      .map((event) => ({ ...event }));
  }

  private insert<T extends SqlRow>(bindings: SqlStorageValue[]): SqlStorageCursor<T> {
    assertBindingCount(bindings, 5);
    const [eventId, occurredAt, day, service, identityId] = bindings as [
      string,
      number,
      string,
      string,
      string,
    ];
    const existed = this.events.has(eventId);
    if (!existed) {
      this.events.set(eventId, { eventId, occurredAt, day, service, identityId });
    }
    return new TestSqlCursor<T>([], existed ? 0 : 1);
  }

  private deleteBatch<T extends SqlRow>(bindings: SqlStorageValue[]): SqlStorageCursor<T> {
    assertBindingCount(bindings, 2);
    const [cutoff, limit] = bindings as [string, number];
    const expired = [...this.events.values()]
      .filter((event) => event.day < cutoff)
      .sort((left, right) =>
        left.day === right.day
          ? left.eventId.localeCompare(right.eventId)
          : left.day.localeCompare(right.day),
      )
      .slice(0, limit);
    for (const event of expired) {
      this.events.delete(event.eventId);
    }
    return new TestSqlCursor<T>([], expired.length);
  }

  private deleteAll<T extends SqlRow>(bindings: SqlStorageValue[]): SqlStorageCursor<T> {
    assertBindingCount(bindings, 1);
    const [cutoff] = bindings as [string];
    const expired = [...this.events.values()].filter((event) => event.day < cutoff);
    for (const event of expired) {
      this.events.delete(event.eventId);
    }
    return new TestSqlCursor<T>([], expired.length);
  }

  private select<T extends SqlRow>(
    query: string,
    bindings: SqlStorageValue[],
  ): SqlStorageCursor<T> | undefined {
    const unfiltered = [TOTAL_SELECT, DAILY_SELECT, SERVICE_SELECT];
    const filtered = unfiltered.map(withServiceFilter);
    const queryIndex = unfiltered.indexOf(query);
    const filteredIndex = filtered.indexOf(query);
    if (queryIndex === -1 && filteredIndex === -1) {
      return undefined;
    }

    const hasService = filteredIndex !== -1;
    assertBindingCount(bindings, hasService ? 4 : 3);
    const [from, to, cutoff, service] = bindings as [string, string, string, string?];
    const events = [...this.events.values()].filter(
      (event) =>
        event.day >= from &&
        event.day <= to &&
        event.day >= cutoff &&
        (!hasService || event.service === service),
    );
    const selectIndex = hasService ? filteredIndex : queryIndex;
    const rows = this.aggregate(events, selectIndex);
    return new TestSqlCursor(rows as T[]);
  }

  private aggregate(events: StoredEvent[], selectIndex: number): SqlRow[] {
    if (selectIndex === 0) {
      return [
        {
          blocked_requests: events.length,
          unique_identities: new Set(events.map((event) => event.identityId)).size,
        },
      ];
    }

    const groups = groupEvents(
      events,
      selectIndex === 1 ? (event) => event.day : (event) => `${event.day}\0${event.service}`,
    );
    return groups.map((group) => ({
      day: group[0].day,
      ...(selectIndex === 2 ? { service: group[0].service } : {}),
      blocked_requests: group.length,
      unique_identities: new Set(group.map((event) => event.identityId)).size,
    }));
  }
}

export function createRateLimitSqlState(
  options: { alarm?: number | null; setAlarmError?: Error } = {},
) {
  const sql: TestSqlStorage = NativeDatabaseSync
    ? new NativeSqlStorage(new NativeDatabaseSync(':memory:'))
    : new MemorySqlStorage();
  let alarm = options.alarm ?? null;
  const getAlarm = vi.fn(async () => alarm);
  const setAlarm = vi.fn(async (scheduledTime: number | Date) => {
    if (options.setAlarmError) {
      throw options.setAlarmError;
    }
    alarm = scheduledTime instanceof Date ? scheduledTime.getTime() : scheduledTime;
  });
  const state = {
    storage: { sql, getAlarm, setAlarm },
  } as unknown as DurableObjectState;

  return {
    state,
    sql,
    getAlarm,
    setAlarm,
    seed: (events: StoredEvent[]) => sql.seed(events),
    readEvents: () => sql.readEvents(),
    storageKind: HAS_NATIVE_SQLITE ? 'node:sqlite' : 'memory',
  };
}
