/** 인증 릴레이의 제한 헤더만 허용하는 유한한 재시도 계약. */
export interface RelayQuota {
  quotaReason: 'minute' | 'daily' | 'consumer' | 'consumer-busy';
  retryAfter: number;
}
export function parseRelayQuota(status: number, headers?: Headers): RelayQuota | undefined {
  if (status !== 429 || !headers) return undefined;
  const reason = headers.get('x-relay-quota-reason');
  const retry = headers.get('retry-after') || '';
  if (reason !== 'minute' && reason !== 'daily' && reason !== 'consumer' && reason !== 'consumer-busy') return undefined;
  if (reason === 'consumer-busy' && retry !== '1') return undefined;
  if (!/^[1-9][0-9]{0,4}$/.test(retry) || Number(retry) > 86400) return undefined;
  return { quotaReason: reason, retryAfter: Number(retry) };
}

/** 만료 후 정리하고 고정 크기에서 새 휴지 기록을 생략합니다. */
export function createRelayCooldown(now = () => Date.now(), maxEntries = 1024) {
  const entries = new Map<string, { quotaReason: RelayQuota['quotaReason']; until: number }>();
  const prune = () => {
    for (const [key, entry] of entries) if (entry.until <= now()) entries.delete(key);
  };
  return {
    get(scope: string, consumer: string): RelayQuota | undefined {
      prune();
      const entry = entries.get(scope) || entries.get(`${scope}:${consumer}`);
      if (!entry) return undefined;
      return { quotaReason: entry.quotaReason, retryAfter: Math.ceil((entry.until - now()) / 1000) };
    },
    set(scope: string, consumer: string, quota: RelayQuota) {
      prune();
      const key = (quota.quotaReason === 'consumer' || quota.quotaReason === 'consumer-busy') ? `${scope}:${consumer}` : scope;
      if (!entries.has(key) && entries.size >= maxEntries) return;
      const until = now() + quota.retryAfter * 1000;
      if ((entries.get(key)?.until || 0) > until) return;
      entries.set(key, { quotaReason: quota.quotaReason, until });
    },
  };
}

/** 자격증명 원문을 저장하지 않는 릴레이/Access 구성별 키. */
export async function relayCredentialScope(values: Array<string | undefined>): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(JSON.stringify(values)));
  return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('');
}
