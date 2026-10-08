/** 만료된 예산만 정리하는 소비자별 본문·대기 슬롯 및 신규 작업 상한. */
export function createConsumerQuota(now = Date.now, maxEntries = 1024) {
  const entries = new Map<string, { minute: number; count: number; active: number; reserved: number }>();
  return {
    retryAfter: () => Math.max(1, Math.ceil((60000 - now() % 60000) / 1000)),
    enter(identity: string) {
      const minute = Math.floor(now() / 60000);
      for (const [key, value] of entries) {
        if (value.active === 0 && value.minute < minute) entries.delete(key);
      }
      let entry = entries.get(identity);
      if (!entry) {
        if (entries.size >= maxEntries) return null;
        entry = { minute, count: 0, active: 0, reserved: 0 };
        entries.set(identity, entry);
      }
      if (entry.active >= 2) return null;
      entry.active++;
      const resetMinute = () => {
        const currentMinute = Math.floor(now() / 60000);
        if (entry.minute < currentMinute) {
          entry.minute = currentMinute;
          entry.count = 0;
        }
      };
      return {
        reserve() {
          resetMinute();
          if (entry.count + entry.reserved >= 240) return null;
          entry.reserved++;
          let reserved = true;
          return {
            commit() {
              resetMinute();
              entry.count++;
              entry.reserved--;
              reserved = false;
            },
            release() {
              if (reserved) entry.reserved--;
            },
          };
        },
        release() { entry.active--; },
      };
    },
  };
}
