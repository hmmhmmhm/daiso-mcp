import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  RATE_LIMIT_METRICS_LEDGER_NAME,
  RATE_LIMIT_METRICS_RETENTION_DAYS,
  RATE_LIMIT_SERVICES,
  RateLimitMetricsStore,
  type BlockedRateLimitEvent,
  type RateLimitService,
} from '../../src/durableObjects/rateLimitMetricsStore.js';

type SqlRow = Record<string, SqlStorageValue>;

class FakeSqlCursor<T extends SqlRow> implements SqlStorageCursor<T> {
  readonly columnNames: string[];
  readonly rowsRead: number;
  private index = 0;

  constructor(
    private readonly rows: T[],
    readonly rowsWritten = 0,
  ) {
    this.columnNames = rows[0] ? Object.keys(rows[0]) : [];
    this.rowsRead = rows.length;
  }

  next(): { done?: false; value: T } | { done: true; value?: never } {
    const value = this.rows[this.index++];
    return value === undefined ? { done: true } : { done: false, value };
  }

  toArray(): T[] {
    return [...this.rows];
  }

  one(): T {
    if (this.rows.length !== 1) {
      throw new Error(`한 행이 필요하지만 ${this.rows.length}개를 받았습니다.`);
    }
    return this.rows[0];
  }

  raw<U extends SqlStorageValue[]>(): IterableIterator<U> {
    return this.rows.map((row) => Object.values(row) as unknown as U)[Symbol.iterator]();
  }

  [Symbol.iterator](): IterableIterator<T> {
    return this.rows[Symbol.iterator]();
  }
}

interface StoredEvent {
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

class FakeSqlStorage {
  readonly events = new Map<string, StoredEvent>();
  readonly executed: ExecutedSql[] = [];

  constructor(events: StoredEvent[] = []) {
    for (const event of events) {
      this.events.set(event.eventId, event);
    }
  }

  exec<T extends SqlRow>(query: string, ...bindings: any[]): SqlStorageCursor<T> {
    const normalized = query.replace(/\s+/g, ' ').trim();
    this.executed.push({ query: normalized, bindings });

    if (normalized.startsWith('INSERT OR IGNORE')) {
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
      return new FakeSqlCursor<T>([], existed ? 0 : 1);
    }

    if (normalized.startsWith('DELETE FROM blocked_events WHERE event_id IN')) {
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
      return new FakeSqlCursor<T>([], expired.length);
    }

    if (normalized.startsWith('DELETE FROM blocked_events WHERE day < ?')) {
      const [cutoff] = bindings as [string];
      const expired = [...this.events.values()].filter((event) => event.day < cutoff);
      for (const event of expired) {
        this.events.delete(event.eventId);
      }
      return new FakeSqlCursor<T>([], expired.length);
    }

    if (normalized.startsWith('SELECT')) {
      return new FakeSqlCursor<T>(this.select(normalized, bindings) as T[]);
    }

    return new FakeSqlCursor<T>([]);
  }

  private select(query: string, bindings: SqlStorageValue[]): SqlRow[] {
    const [from, to, selectedService] = bindings as [string, string, string?];
    const events = [...this.events.values()].filter(
      (event) =>
        event.day >= from &&
        event.day <= to &&
        (!query.includes('AND service = ?') || event.service === selectedService),
    );

    if (query.includes('GROUP BY day, service')) {
      return this.group(events, (event) => `${event.day}\0${event.service}`).map((group) => ({
        day: group[0].day,
        service: group[0].service,
        blocked_requests: group.length,
        unique_identities: new Set(group.map((event) => event.identityId)).size,
      }));
    }

    if (query.includes('GROUP BY day')) {
      return this.group(events, (event) => event.day).map((group) => ({
        day: group[0].day,
        blocked_requests: group.length,
        unique_identities: new Set(group.map((event) => event.identityId)).size,
      }));
    }

    return [
      {
        blocked_requests: events.length,
        unique_identities: new Set(events.map((event) => event.identityId)).size,
      },
    ];
  }

  private group(events: StoredEvent[], keyOf: (event: StoredEvent) => string): StoredEvent[][] {
    const groups = new Map<string, StoredEvent[]>();
    for (const event of events) {
      const key = keyOf(event);
      groups.set(key, [...(groups.get(key) ?? []), event]);
    }
    return [...groups.entries()]
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([, group]) => group);
  }
}

function createState(options: { events?: StoredEvent[]; alarm?: number | null } = {}) {
  const sql = new FakeSqlStorage(options.events);
  const getAlarm = vi.fn(async () => options.alarm ?? null);
  const setAlarm = vi.fn(async (_scheduledTime: number | Date) => undefined);
  const state = {
    storage: { sql, getAlarm, setAlarm },
  } as unknown as DurableObjectState;
  return { state, sql, getAlarm, setAlarm };
}

function event(
  eventId: string,
  day: string,
  service: RateLimitService,
  identityId: string,
): BlockedRateLimitEvent {
  return {
    eventId,
    occurredAt: Date.parse(`${day}T03:00:00+09:00`),
    day,
    service,
    identityId,
  };
}

describe('RateLimitMetricsStore', () => {
  beforeEach(() => {
    vi.spyOn(Date, 'now').mockReturnValue(Date.parse('2026-07-22T03:00:00+09:00'));
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('공개 상수와 SQLite 테이블 및 집계 인덱스를 초기화한다', () => {
    const fixture = createState();

    new RateLimitMetricsStore(fixture.state);

    expect(RATE_LIMIT_METRICS_RETENTION_DAYS).toBe(30);
    expect(RATE_LIMIT_METRICS_LEDGER_NAME).toBe('__blocked-ledger-v1__');
    expect(RATE_LIMIT_SERVICES).toEqual(['oliveyoung', 'cgv', 'cu', 'gs25', 'lottemart']);
    expect(fixture.sql.executed.map(({ query }) => query)).toEqual([
      expect.stringContaining('CREATE TABLE IF NOT EXISTS blocked_events'),
      expect.stringContaining('ON blocked_events(day, service)'),
      expect.stringContaining('ON blocked_events(day, identity_id)'),
      expect.stringContaining('ON blocked_events(day, service, identity_id)'),
    ]);
  });

  it('전체 이벤트 필드를 INSERT OR IGNORE로 저장하고 event_id 중복은 한 번만 센다', async () => {
    const fixture = createState({ alarm: Date.parse('2026-07-22T15:05:00Z') });
    const store = new RateLimitMetricsStore(fixture.state);
    const blockedEvent = event('event-1', '2026-07-22', 'cgv', 'opaque-id-1');

    await store.record(blockedEvent);
    await store.record(blockedEvent);

    const insert = fixture.sql.executed.find(({ query }) => query.startsWith('INSERT OR IGNORE'));
    expect(insert).toEqual({
      query: expect.stringContaining('blocked_events'),
      bindings: ['event-1', blockedEvent.occurredAt, '2026-07-22', 'cgv', 'opaque-id-1'],
    });
    await expect(store.query({ from: '2026-07-22', to: '2026-07-22' })).resolves.toMatchObject({
      totals: { blockedRequests: 1, uniqueIdentities: 1 },
    });
    expect(fixture.getAlarm).toHaveBeenCalledTimes(2);
    expect(fixture.setAlarm).not.toHaveBeenCalled();
  });

  it('KST 발생 날짜와 일치하지 않는 이벤트는 저장하지 않는다', async () => {
    const fixture = createState();
    const store = new RateLimitMetricsStore(fixture.state);
    const mismatched = event('event-1', '2026-07-22', 'cgv', 'opaque-id-1');
    mismatched.occurredAt = Date.parse('2026-07-21T14:59:59Z');

    await expect(store.record(mismatched)).rejects.toThrow('KST 발생 날짜');
    expect(fixture.sql.events).toHaveLength(0);
  });

  it('반복 호출 주체와 서비스별 호출 주체를 정확하고 결정적인 순서로 집계한다', async () => {
    const fixture = createState({ alarm: 1 });
    const store = new RateLimitMetricsStore(fixture.state);
    const events = [
      event('event-5', '2026-07-22', 'gs25', 'shared-id'),
      event('event-3', '2026-07-20', 'oliveyoung', 'olive-id'),
      event('event-2', '2026-07-22', 'cgv', 'shared-id'),
      event('event-4', '2026-07-21', 'cu', 'cu-id'),
      event('event-1', '2026-07-22', 'cgv', 'shared-id'),
    ];
    for (const blockedEvent of events) {
      await store.record(blockedEvent);
    }

    const stats = await store.query({ from: '2026-07-20', to: '2026-07-22' });

    expect(stats).toEqual({
      totals: { blockedRequests: 5, uniqueIdentities: 3 },
      daily: [
        { day: '2026-07-20', blockedRequests: 1, uniqueIdentities: 1 },
        { day: '2026-07-21', blockedRequests: 1, uniqueIdentities: 1 },
        { day: '2026-07-22', blockedRequests: 3, uniqueIdentities: 1 },
      ],
      services: [
        {
          day: '2026-07-20',
          service: 'oliveyoung',
          blockedRequests: 1,
          uniqueIdentities: 1,
        },
        { day: '2026-07-21', service: 'cu', blockedRequests: 1, uniqueIdentities: 1 },
        { day: '2026-07-22', service: 'cgv', blockedRequests: 2, uniqueIdentities: 1 },
        { day: '2026-07-22', service: 'gs25', blockedRequests: 1, uniqueIdentities: 1 },
      ],
    });
    expect(JSON.stringify(stats)).not.toContain('shared-id');
    expect(JSON.stringify(stats)).not.toContain('olive-id');
    expect(JSON.stringify(stats)).not.toContain('cu-id');
  });

  it('서비스 필터를 합계와 모든 행에 적용하고 빈 기간은 0 집계를 반환한다', async () => {
    const fixture = createState({ alarm: 1 });
    const store = new RateLimitMetricsStore(fixture.state);
    await store.record(event('event-1', '2026-07-22', 'cgv', 'shared-id'));
    await store.record(event('event-2', '2026-07-22', 'gs25', 'shared-id'));

    await expect(
      store.query({ from: '2026-07-22', to: '2026-07-22', service: 'cgv' }),
    ).resolves.toEqual({
      totals: { blockedRequests: 1, uniqueIdentities: 1 },
      daily: [{ day: '2026-07-22', blockedRequests: 1, uniqueIdentities: 1 }],
      services: [{ day: '2026-07-22', service: 'cgv', blockedRequests: 1, uniqueIdentities: 1 }],
    });
    await expect(store.query({ from: '2026-07-01', to: '2026-07-01' })).resolves.toEqual({
      totals: { blockedRequests: 0, uniqueIdentities: 0 },
      daily: [],
      services: [],
    });
  });

  it('허용 목록에 없는 서비스 필터는 SQL 실행 전에 거부한다', async () => {
    const fixture = createState();
    const store = new RateLimitMetricsStore(fixture.state);
    const beforeQuery = fixture.sql.executed.length;

    await expect(
      store.query({
        from: '2026-07-22',
        to: '2026-07-22',
        service: 'daiso' as RateLimitService,
      }),
    ).rejects.toThrow('지원하지 않는 서비스');
    expect(fixture.sql.executed).toHaveLength(beforeQuery);
  });

  it('KST 현재 날짜를 포함한 정확히 30개 날짜를 보존한다', async () => {
    const first = createState({
      events: [
        event('expired-before-midnight', '2026-06-22', 'cgv', 'old'),
        event('boundary-before-midnight', '2026-06-23', 'cgv', 'keep'),
      ],
    });
    const firstStore = new RateLimitMetricsStore(first.state);

    await firstStore.cleanup(Date.parse('2026-07-22T14:59:59.999Z'));

    expect([...first.sql.events.keys()]).toEqual(['boundary-before-midnight']);

    const second = createState({
      events: [
        event('expired-after-midnight', '2026-06-23', 'cgv', 'old'),
        event('boundary-after-midnight', '2026-06-24', 'cgv', 'keep'),
      ],
    });
    const secondStore = new RateLimitMetricsStore(second.state);

    await secondStore.cleanup(Date.parse('2026-07-22T15:00:00.000Z'));

    expect([...second.sql.events.keys()]).toEqual(['boundary-after-midnight']);
  });

  it('기록 시 오래된 행 정리를 한 번에 제한한다', async () => {
    const oldEvents = Array.from({ length: 1_001 }, (_, index) =>
      event(`old-${index.toString().padStart(4, '0')}`, '2026-01-01', 'cgv', `id-${index}`),
    );
    const fixture = createState({ events: oldEvents, alarm: 1 });
    const store = new RateLimitMetricsStore(fixture.state);

    await store.record(event('current', '2026-07-22', 'cgv', 'current-id'));

    expect([...fixture.sql.events.values()].filter(({ day }) => day === '2026-01-01')).toHaveLength(
      1,
    );
    expect(fixture.sql.events.has('current')).toBe(true);
  });

  it('기존 alarm은 유지하고 없을 때만 다음 KST 자정 5분 후를 예약한다', async () => {
    const existing = createState({ alarm: Date.parse('2026-07-23T15:05:00Z') });
    const existingStore = new RateLimitMetricsStore(existing.state);
    await existingStore.ensureAlarm(Date.parse('2026-07-22T14:59:59Z'));
    expect(existing.setAlarm).not.toHaveBeenCalled();

    const missing = createState();
    const missingStore = new RateLimitMetricsStore(missing.state);
    await missingStore.ensureAlarm(Date.parse('2026-07-22T15:00:00Z'));
    expect(missing.setAlarm).toHaveBeenCalledOnce();
    expect(missing.setAlarm).toHaveBeenCalledWith(Date.parse('2026-07-23T15:05:00Z'));
  });
});
