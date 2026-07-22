class BoundedTtlCache {
  constructor({ ttlMs = 0, maxEntries = 256, now = () => Date.now() } = {}) {
    this.ttlMs = Math.max(0, Math.floor(Number(ttlMs) || 0));
    this.maxEntries = Math.max(1, Math.floor(Number(maxEntries) || 256));
    this.now = now;
    this.entries = new Map();
  }

  get size() {
    return this.entries.size;
  }

  get(key) {
    if (this.ttlMs <= 0) return undefined;
    const entry = this.entries.get(key);
    if (!entry) return undefined;
    if (this.now() >= entry.expiresAt) {
      this.entries.delete(key);
      return undefined;
    }

    this.entries.delete(key);
    this.entries.set(key, entry);
    return entry.value;
  }

  set(key, value) {
    if (this.ttlMs <= 0) return false;
    this.entries.delete(key);
    while (this.entries.size >= this.maxEntries) {
      const oldestKey = this.entries.keys().next().value;
      this.entries.delete(oldestKey);
    }
    this.entries.set(key, { value, expiresAt: this.now() + this.ttlMs });
    return true;
  }

  clear() {
    this.entries.clear();
  }
}

export { BoundedTtlCache };
