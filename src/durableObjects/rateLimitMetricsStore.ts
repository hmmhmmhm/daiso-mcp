/**
 * 차단된 일일 호출 제한 이벤트를 정확히 집계하는 SQLite 저장소
 */

export const RATE_LIMIT_METRICS_RETENTION_DAYS = 30;
export const RATE_LIMIT_METRICS_LEDGER_NAME = '__blocked-ledger-v1__';
export const RATE_LIMIT_SERVICES = ['oliveyoung', 'cgv', 'cu', 'gs25', 'lottemart'] as const;

export type RateLimitService = (typeof RATE_LIMIT_SERVICES)[number];

export interface BlockedRateLimitEvent {
  eventId: string;
  occurredAt: number;
  day: string;
  service: RateLimitService;
  identityId: string;
}

interface RateLimitAggregate {
  blockedRequests: number;
  uniqueIdentities: number;
}

export type RateLimitStats = {
  totals: RateLimitAggregate;
  daily: Array<RateLimitAggregate & { day: string }>;
  services: Array<RateLimitAggregate & { day: string; service: RateLimitService }>;
};

type AggregateRow = {
  blocked_requests: number;
  unique_identities: number;
};

type DailyRow = AggregateRow & {
  day: string;
};

type ServiceRow = DailyRow & {
  service: string;
};

const KST_OFFSET_MS = 9 * 60 * 60 * 1000;
const ALARM_DELAY_MS = 5 * 60 * 1000;
const OPPORTUNISTIC_CLEANUP_LIMIT = 1000;

function toKstDay(nowMs: number): string {
  return new Date(nowMs + KST_OFFSET_MS).toISOString().slice(0, 10);
}

function retentionCutoffDay(nowMs: number): string {
  const shifted = new Date(nowMs + KST_OFFSET_MS);
  return new Date(
    Date.UTC(
      shifted.getUTCFullYear(),
      shifted.getUTCMonth(),
      shifted.getUTCDate() - (RATE_LIMIT_METRICS_RETENTION_DAYS - 1),
    ),
  )
    .toISOString()
    .slice(0, 10);
}

function nextAlarmTime(nowMs: number): number {
  const shifted = new Date(nowMs + KST_OFFSET_MS);
  return (
    Date.UTC(shifted.getUTCFullYear(), shifted.getUTCMonth(), shifted.getUTCDate() + 1) -
    KST_OFFSET_MS +
    ALARM_DELAY_MS
  );
}

function isRateLimitService(service: string): service is RateLimitService {
  return (RATE_LIMIT_SERVICES as readonly string[]).includes(service);
}

function toAggregate(row: AggregateRow): RateLimitAggregate {
  return {
    blockedRequests: row.blocked_requests,
    uniqueIdentities: row.unique_identities,
  };
}

export class RateLimitMetricsStore {
  private readonly sql: SqlStorage;

  constructor(private readonly state: DurableObjectState) {
    this.sql = state.storage.sql;
    this.initializeSchema();
  }

  async record(event: BlockedRateLimitEvent): Promise<void> {
    if (event.day !== toKstDay(event.occurredAt)) {
      throw new TypeError('이벤트 날짜가 KST 발생 날짜와 일치하지 않습니다.');
    }

    this.sql.exec(
      `INSERT OR IGNORE INTO blocked_events
        (event_id, occurred_at, day, service, identity_id)
       VALUES (?, ?, ?, ?, ?)`,
      event.eventId,
      event.occurredAt,
      event.day,
      event.service,
      event.identityId,
    );
    this.cleanupExpiredBatch(Date.now());
    await this.ensureAlarm();
  }

  async query(input: {
    from: string;
    to: string;
    service?: RateLimitService;
  }): Promise<RateLimitStats> {
    if (input.service !== undefined && !isRateLimitService(input.service)) {
      throw new TypeError('지원하지 않는 서비스입니다.');
    }

    this.cleanupExpiredBatch(Date.now());
    const serviceClause = input.service === undefined ? '' : ' AND service = ?';
    const bindings =
      input.service === undefined ? [input.from, input.to] : [input.from, input.to, input.service];
    const whereClause = `day >= ? AND day <= ?${serviceClause}`;

    const totals = this.sql
      .exec<AggregateRow>(
        `SELECT COUNT(*) AS blocked_requests,
                COUNT(DISTINCT identity_id) AS unique_identities
         FROM blocked_events
         WHERE ${whereClause}`,
        ...bindings,
      )
      .one();
    const daily = this.sql
      .exec<DailyRow>(
        `SELECT day,
                COUNT(*) AS blocked_requests,
                COUNT(DISTINCT identity_id) AS unique_identities
         FROM blocked_events
         WHERE ${whereClause}
         GROUP BY day
         ORDER BY day ASC`,
        ...bindings,
      )
      .toArray();
    const services = this.sql
      .exec<ServiceRow>(
        `SELECT day,
                service,
                COUNT(*) AS blocked_requests,
                COUNT(DISTINCT identity_id) AS unique_identities
         FROM blocked_events
         WHERE ${whereClause}
         GROUP BY day, service
         ORDER BY day ASC, service ASC`,
        ...bindings,
      )
      .toArray();

    return {
      totals: toAggregate(totals),
      daily: daily.map((row) => ({ day: row.day, ...toAggregate(row) })),
      services: services.map((row) => ({
        day: row.day,
        service: row.service as RateLimitService,
        ...toAggregate(row),
      })),
    };
  }

  async cleanup(nowMs = Date.now()): Promise<void> {
    this.sql.exec('DELETE FROM blocked_events WHERE day < ?', retentionCutoffDay(nowMs));
  }

  async ensureAlarm(nowMs = Date.now()): Promise<void> {
    if ((await this.state.storage.getAlarm()) !== null) {
      return;
    }
    await this.state.storage.setAlarm(nextAlarmTime(nowMs));
  }

  private initializeSchema(): void {
    this.sql.exec(`CREATE TABLE IF NOT EXISTS blocked_events (
      event_id TEXT PRIMARY KEY,
      occurred_at INTEGER NOT NULL,
      day TEXT NOT NULL,
      service TEXT NOT NULL,
      identity_id TEXT NOT NULL
    )`);
    this.sql.exec(
      'CREATE INDEX IF NOT EXISTS idx_blocked_events_day_service ON blocked_events(day, service)',
    );
    this.sql.exec(
      'CREATE INDEX IF NOT EXISTS idx_blocked_events_day_identity ON blocked_events(day, identity_id)',
    );
    this.sql.exec(
      'CREATE INDEX IF NOT EXISTS idx_blocked_events_day_service_identity ON blocked_events(day, service, identity_id)',
    );
  }

  private cleanupExpiredBatch(nowMs: number): void {
    this.sql.exec(
      `DELETE FROM blocked_events
       WHERE event_id IN (
         SELECT event_id
         FROM blocked_events
         WHERE day < ?
         ORDER BY day ASC, event_id ASC
         LIMIT ?
       )`,
      retentionCutoffDay(nowMs),
      OPPORTUNISTIC_CLEANUP_LIMIT,
    );
  }
}
