import crypto from "node:crypto";

const DEFAULT_SESSION_TTL_MS = 12 * 60 * 60 * 1000;
const DEFAULT_MAX_SESSIONS = 512;
const DEFAULT_CLEANUP_INTERVAL_MS = 5 * 60 * 1000;

function digestToken(token) {
  return crypto
    .createHash("sha256")
    .update(String(token || ""), "utf8")
    .digest("base64url");
}

class DashSessionStore {
  constructor({
    ttlMs = DEFAULT_SESSION_TTL_MS,
    maxSessions = DEFAULT_MAX_SESSIONS,
    cleanupIntervalMs = DEFAULT_CLEANUP_INTERVAL_MS,
    now = Date.now,
    randomBytes = crypto.randomBytes,
  } = {}) {
    this.ttlMs = Math.max(1, Math.floor(Number(ttlMs) || DEFAULT_SESSION_TTL_MS));
    this.maxSessions = Math.max(1, Math.floor(Number(maxSessions) || DEFAULT_MAX_SESSIONS));
    this.cleanupIntervalMs = Math.max(1, Math.floor(Number(cleanupIntervalMs) || DEFAULT_CLEANUP_INTERVAL_MS));
    this.now = now;
    this.randomBytes = randomBytes;
    this.sessions = new Map();
    this.nextCleanupAt = 0;
  }

  get size() {
    return this.sessions.size;
  }

  issue() {
    const now = this.now();
    this.cleanup(now);
    while (this.sessions.size >= this.maxSessions) {
      const oldestSessionKey = this.sessions.keys().next().value;
      if (!oldestSessionKey) break;
      this.sessions.delete(oldestSessionKey);
    }

    for (let attempt = 0; attempt < 5; attempt += 1) {
      const token = this.randomBytes(32).toString("base64url");
      const tokenDigest = digestToken(token);
      if (this.sessions.has(tokenDigest)) continue;
      this.sessions.set(tokenDigest, {
        createdAt: now,
        expiresAt: now + this.ttlMs,
      });
      return token;
    }

    throw new Error("Unable to generate a unique dashboard session token.");
  }

  rotate(previousToken) {
    this.revoke(previousToken);
    return this.issue();
  }

  validate(token) {
    const normalizedToken = String(token || "").trim();
    if (!normalizedToken) return false;

    const now = this.now();
    if (now >= this.nextCleanupAt) this.cleanup(now);
    const tokenDigest = digestToken(normalizedToken);
    const session = this.sessions.get(tokenDigest);
    if (!session) return false;
    if (session.expiresAt <= now) {
      this.sessions.delete(tokenDigest);
      return false;
    }
    return true;
  }

  revoke(token) {
    const normalizedToken = String(token || "").trim();
    if (!normalizedToken) return false;
    return this.sessions.delete(digestToken(normalizedToken));
  }

  cleanup(now = this.now()) {
    for (const [tokenDigest, session] of this.sessions) {
      if (session.expiresAt <= now) this.sessions.delete(tokenDigest);
    }
    this.nextCleanupAt = now + this.cleanupIntervalMs;
  }
}

export { DashSessionStore, DEFAULT_CLEANUP_INTERVAL_MS, DEFAULT_MAX_SESSIONS, DEFAULT_SESSION_TTL_MS };
