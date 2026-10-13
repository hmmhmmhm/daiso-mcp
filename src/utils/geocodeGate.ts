/** 응답을 보관하지 않고 진행 중 요청과 공급자 쿼터 상태만 관리합니다. */
export type GeocodeProvider = 'kakao-address' | 'kakao-keyword' | 'naver-local';
export interface GeocodeReply {
  status: number;
  body: unknown;
}
export interface GeocodeQuotaStore {
  get(key: string): Promise<number | undefined>;
  put(key: string, value: number): Promise<void>;
}
interface QuotaState {
  blockedUntil: number;
  write: Promise<void>;
}
interface ScopeState {
  active: number;
  providers: Map<GeocodeProvider, QuotaState>;
}
const storeError = () => new Error('GEOCODE_QUOTA_STORE_UNAVAILABLE');
const capacityError = () => new Error('GEOCODE_GATE_CAPACITY');
function cooldown(provider: GeocodeProvider, reply: GeocodeReply): number {
  if (reply.status === 429) return 60000;
  if (
    provider !== 'naver-local' && reply.status === 400 &&
    reply.body !== null && typeof reply.body === 'object' &&
    (reply.body as { code?: unknown }).code === -10
  ) return 1800000;
  return 0;
}
export class GeocodeGate {
  private readonly pending = new Map<string, Promise<GeocodeReply>>();
  private readonly scopes = new Map<string, ScopeState>();
  constructor(
    private readonly store?: GeocodeQuotaStore,
    private readonly now: () => number = Date.now,
  ) {}

  async run(
    scope: string,
    provider: GeocodeProvider,
    key: string,
    timeoutMs: number,
    work: () => Promise<GeocodeReply>,
  ): Promise<GeocodeReply> {
    const requestKey = JSON.stringify([scope, provider, key, timeoutMs]);
    const existing = this.pending.get(requestKey);
    if (existing) return structuredClone(await existing);
    if (this.pending.size >= 32) throw capacityError();
    this.prune();
    let state = this.scopes.get(scope);
    if (!state) {
      if (this.scopes.size >= 64) throw capacityError();
      state = { active: 0, providers: new Map() };
      this.scopes.set(scope, state);
    }
    let quota = state.providers.get(provider);
    if (!quota) {
      quota = { blockedUntil: 0, write: Promise.resolve() };
      state.providers.set(provider, quota);
    }
    state.active++;
    const task = Promise.resolve().then(() => this.perform(scope, provider, quota, work));
    this.pending.set(requestKey, task);
    try {
      return structuredClone(await task);
    } finally {
      this.pending.delete(requestKey);
      state.active--;
    }
  }

  private prune(): void {
    const at = this.now();
    for (const [scope, state] of this.scopes) {
      if (state.active === 0 && [...state.providers.values()].every((quota) => quota.blockedUntil <= at))
        this.scopes.delete(scope);
    }
  }

  private async perform(
    scope: string,
    provider: GeocodeProvider,
    quota: QuotaState,
    work: () => Promise<GeocodeReply>,
  ): Promise<GeocodeReply> {
    const storageKey = `quota:${scope}:${provider}`;
    if (this.store) {
      try {
        const saved = await this.store.get(storageKey);
        if (saved !== undefined) {
          if (!Number.isSafeInteger(saved) || saved < 0) throw storeError();
          quota.blockedUntil = Math.max(quota.blockedUntil, saved);
        }
      } catch {
        throw storeError();
      }
    }
    if (quota.blockedUntil > this.now())
      return { status: 429, body: { code: 'GEOCODE_QUOTA_BLOCKED' } };
    const reply = await work();
    const duration = cooldown(provider, reply);
    if (duration > 0) {
      const until = this.now() + duration;
      // 저장을 직렬화하고 만료 시에는 쓰지 않아 오래된 해제 요청의 덮어쓰기를 막습니다.
      const update = quota.write.then(async () => {
        const blockedUntil = Math.max(quota.blockedUntil, until);
        quota.blockedUntil = blockedUntil;
        if (this.store) {
          try {
            await this.store.put(storageKey, blockedUntil);
          } catch {
            throw storeError();
          }
        }
      });
      quota.write = update.catch(() => {});
      await update;
    }
    return reply;
  }
}
