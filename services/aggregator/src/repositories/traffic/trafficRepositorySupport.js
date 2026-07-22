class TrafficRepositorySupport {
  constructor(db) {
    this.db = db;
    this.trafficQueryCache = new Map();
    this.trafficCacheVersion = 0;
    this.trafficBackfillStateCache = {
      expiresAtMs: 0,
      complete: false,
      sampleCount: 0,
      eventCount: 0,
    };
  }

  bumpTrafficCacheVersion() {
    this.trafficCacheVersion += 1;
    this.trafficQueryCache.clear();
    this.trafficBackfillStateCache.expiresAtMs = 0;
    return this.trafficCacheVersion;
  }

  withTrafficCache(cacheKey, compute, { ttlMs = 15000 } = {}) {
    const safeKey = String(cacheKey || "").trim();
    if (!safeKey || typeof compute !== "function") {
      return typeof compute === "function" ? compute() : null;
    }
    const nowMs = Date.now();
    const existing = this.trafficQueryCache.get(safeKey);
    if (existing && existing.version === this.trafficCacheVersion && existing.expiresAtMs > nowMs) {
      return existing.value;
    }
    const value = compute();
    this.trafficQueryCache.set(safeKey, {
      version: this.trafficCacheVersion,
      expiresAtMs: nowMs + Math.max(1000, Number(ttlMs) || 15000),
      value,
    });
    return value;
  }

  getTrafficBackfillState({ ttlMs = 10000 } = {}) {
    const nowMs = Date.now();
    if (this.trafficBackfillStateCache.expiresAtMs > nowMs) {
      return { ...this.trafficBackfillStateCache };
    }

    let eventCount = 0;
    let sampleCount = 0;
    try {
      eventCount = Number(
        this.db.prepare("SELECT COUNT(*) AS count FROM aggregator_events WHERE event_type = 'traffic.http'").get()
          ?.count || 0
      );
      sampleCount = Number(this.db.prepare("SELECT COUNT(*) AS count FROM traffic_http_samples").get()?.count || 0);
    } catch {
      eventCount = 0;
      sampleCount = 0;
    }

    const complete = eventCount === 0 || sampleCount >= eventCount;
    this.trafficBackfillStateCache = {
      expiresAtMs: nowMs + Math.max(1000, Number(ttlMs) || 10000),
      complete,
      sampleCount,
      eventCount,
    };
    return { ...this.trafficBackfillStateCache };
  }
}

export { TrafficRepositorySupport };
