import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  RATE_LIMIT_METRICS_LEDGER_NAME,
  RATE_LIMIT_METRICS_RETENTION_DAYS,
  RATE_LIMIT_SERVICES,
  RateLimitMetricsStore,
  type BlockedRateLimitEvent,
  type RateLimitService,
} from '../../src/durableObjects/rateLimitMetricsStore.js';
import {
  HAS_NATIVE_SQLITE,
  createRateLimitSqlState as createState,
} from '../helpers/rateLimitSqlStorage.js';

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
    expect(fixture.storageKind).toBe(HAS_NATIVE_SQLITE ? 'node:sqlite' : 'memory');
    expect(fixture.sql.executed.map(({ query }) => query)).toEqual([
      expect.stringContaining('CREATE TABLE IF NOT EXISTS blocked_events'),
      expect.stringContaining('ON blocked_events(day, service)'),
      expect.stringContaining('ON blocked_events(day, identity_id)'),
      expect.stringContaining('ON blocked_events(day, service, identity_id)'),
    ]);
    expect(() => fixture.sql.exec('MALFORMED SQL')).toThrow();
  });

  it('기존 alarm을 재설정하지 않고 이벤트를 저장하며 event_id 중복은 한 번만 센다', async () => {
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

  it('alarm 예약 실패 시 cleanup과 INSERT 전에 거부하고 민감값을 기록하지 않는다', async () => {
    const fixture = createState({ setAlarmError: new Error('alarm unavailable') });
    const store = new RateLimitMetricsStore(fixture.state);
    const blockedEvent = event('event-1', '2026-07-22', 'cgv', 'opaque-id-1');
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const statementsBeforeRecord = fixture.sql.executed.length;

    await expect(store.record(blockedEvent)).rejects.toThrow('alarm unavailable');

    expect(fixture.sql.executed).toHaveLength(statementsBeforeRecord);
    expect(fixture.readEvents()).toHaveLength(0);
    await expect(store.query({ from: '2026-07-22', to: '2026-07-22' })).resolves.toMatchObject({
      totals: { blockedRequests: 0, uniqueIdentities: 0 },
    });
    expect(consoleError).not.toHaveBeenCalled();
  });

  it('KST 발생 날짜와 일치하지 않는 이벤트는 저장하지 않는다', async () => {
    const fixture = createState();
    const store = new RateLimitMetricsStore(fixture.state);
    const mismatched = event('event-1', '2026-07-22', 'cgv', 'opaque-id-1');
    mismatched.occurredAt = Date.parse('2026-07-21T14:59:59Z');

    await expect(store.record(mismatched)).rejects.toThrow('KST 발생 날짜');
    expect(fixture.readEvents()).toHaveLength(0);
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

  it('정리 backlog가 있어도 현재 KST 보관 기간보다 오래된 행은 집계하지 않는다', async () => {
    const expired = Array.from({ length: 2_001 }, (_, index) =>
      event(`expired-${index}`, '2026-01-01', 'cgv', `expired-id-${index}`),
    );
    const fixture = createState({ alarm: 1 });
    const store = new RateLimitMetricsStore(fixture.state);
    fixture.seed([...expired, event('current', '2026-07-22', 'cgv', 'current-id')]);

    await expect(store.query({ from: '2026-01-01', to: '2026-07-22' })).resolves.toEqual({
      totals: { blockedRequests: 1, uniqueIdentities: 1 },
      daily: [{ day: '2026-07-22', blockedRequests: 1, uniqueIdentities: 1 }],
      services: [{ day: '2026-07-22', service: 'cgv', blockedRequests: 1, uniqueIdentities: 1 }],
    });
    await expect(store.query({ from: '2026-01-01', to: '2026-01-31' })).resolves.toEqual({
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
    const first = createState();
    const firstStore = new RateLimitMetricsStore(first.state);
    first.seed([
      event('expired-before-midnight', '2026-06-22', 'cgv', 'old'),
      event('boundary-before-midnight', '2026-06-23', 'cgv', 'keep'),
    ]);

    await firstStore.cleanup(Date.parse('2026-07-22T14:59:59.999Z'));

    expect(first.readEvents().map(({ eventId }) => eventId)).toEqual(['boundary-before-midnight']);

    const second = createState();
    const secondStore = new RateLimitMetricsStore(second.state);
    second.seed([
      event('expired-after-midnight', '2026-06-23', 'cgv', 'old'),
      event('boundary-after-midnight', '2026-06-24', 'cgv', 'keep'),
    ]);

    await secondStore.cleanup(Date.parse('2026-07-22T15:00:00.000Z'));

    expect(second.readEvents().map(({ eventId }) => eventId)).toEqual(['boundary-after-midnight']);
  });

  it('기록 시 오래된 행 정리를 한 번에 제한한다', async () => {
    const oldEvents = Array.from({ length: 101 }, (_, index) =>
      event(`old-${index.toString().padStart(4, '0')}`, '2026-01-01', 'cgv', `id-${index}`),
    );
    const fixture = createState({ alarm: 1 });
    const store = new RateLimitMetricsStore(fixture.state);
    fixture.seed(oldEvents);

    await store.record(event('current', '2026-07-22', 'cgv', 'current-id'));

    expect(fixture.readEvents().filter(({ day }) => day === '2026-01-01')).toHaveLength(1);
    expect(fixture.readEvents().some(({ eventId }) => eventId === 'current')).toBe(true);
  });

  it('기존 alarm은 유지하고 없을 때만 다음 KST 자정 5분 후를 예약한다', async () => {
    const existing = createState({ alarm: Date.parse('2026-07-23T15:05:00Z') });
    const existingStore = new RateLimitMetricsStore(existing.state);
    await existingStore.ensureAlarm(Date.parse('2026-07-22T14:59:59Z'));
    expect(existing.setAlarm).not.toHaveBeenCalled();

    const missing = createState();
    const missingStore = new RateLimitMetricsStore(missing.state);
    await missingStore.ensureAlarm(Date.parse('2026-07-22T15:00:00Z'));
    await missingStore.ensureAlarm(Date.parse('2026-07-22T15:01:00Z'));
    expect(missing.setAlarm).toHaveBeenCalledOnce();
    expect(missing.setAlarm).toHaveBeenCalledWith(Date.parse('2026-07-23T15:05:00Z'));
  });
});
