export function createPublicResponseCache({ ttlMs, now = Date.now } = {}) {
  const entries = new Map();
  const safeTtlMs = Math.max(0, Number(ttlMs) || 0);

  function get(cacheKey) {
    if (!safeTtlMs) return { found: false, value: null };
    const entry = entries.get(cacheKey);
    if (!entry) return { found: false, value: null };
    if (now() >= entry.expiresAt) {
      entries.delete(cacheKey);
      return { found: false, value: null };
    }
    return { found: true, value: entry.value };
  }

  return {
    clear() {
      entries.clear();
    },
    async withValue(cacheKey, producer) {
      const cached = get(cacheKey);
      if (cached.found) {
        return { payload: cached.value, cacheStatus: "hit" };
      }

      const payload = await producer();
      if (safeTtlMs) {
        entries.set(cacheKey, { value: payload, expiresAt: now() + safeTtlMs });
      }
      return { payload, cacheStatus: "miss" };
    },
  };
}
