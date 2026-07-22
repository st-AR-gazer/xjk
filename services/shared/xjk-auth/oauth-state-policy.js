import crypto from "node:crypto";

import { buildCookie, requestIsSecure } from "./url-cookie-request.js";

const OVERFLOW_RATE_LIMIT_KEY = "__overflow__";

function positiveInteger(value, fallback, { min = 1, max = Number.MAX_SAFE_INTEGER } = {}) {
  const parsed = Math.floor(Number(value));
  return Number.isFinite(parsed) ? Math.min(max, Math.max(min, parsed)) : fallback;
}

function nonceDigest(value) {
  return crypto
    .createHash("sha256")
    .update(String(value || ""), "utf8")
    .digest();
}

function nonceMatches(expectedDigest, candidate) {
  if (!candidate || !Buffer.isBuffer(expectedDigest)) return false;
  const actualDigest = nonceDigest(candidate);
  return expectedDigest.length === actualDigest.length && crypto.timingSafeEqual(expectedDigest, actualDigest);
}

function callbackCookiePath(callbackPath) {
  const pathname = String(callbackPath || "/")
    .split(/[?#]/, 1)[0]
    .trim();
  if (!pathname.startsWith("/") || pathname === "/") return "/";
  const lastSlash = pathname.lastIndexOf("/");
  return lastSlash > 0 ? pathname.slice(0, lastSlash) : "/";
}

export function oauthLoginClientKey(req) {
  const forwarded = String(req?.headers?.["x-forwarded-for"] || "")
    .split(",", 1)[0]
    .trim();
  return String(forwarded || req?.socket?.remoteAddress || "unknown")
    .trim()
    .slice(0, 200);
}

export function buildOauthNonceCookie(
  req,
  { cookieName = "xjk_oauth_nonce", nonce = "", maxAgeSeconds = 0, callbackPath = "/auth/ubisoft/callback" } = {}
) {
  return buildCookie({
    name: cookieName,
    value: nonce,
    maxAgeSeconds,
    secure: requestIsSecure(req),
    path: callbackCookiePath(callbackPath),
    sameSite: "Lax",
    httpOnly: true,
  });
}

export class BrowserBoundOauthStateStore {
  constructor({
    ttlMs = 10 * 60 * 1000,
    maxStates = 1024,
    loginRateLimitMax = 20,
    loginRateLimitWindowMs = 60 * 1000,
    maxRateLimitKeys = 4096,
    now = Date.now,
    randomBytes = crypto.randomBytes,
  } = {}) {
    this.ttlMs = positiveInteger(ttlMs, 10 * 60 * 1000, { min: 1000, max: 60 * 60 * 1000 });
    this.maxStates = positiveInteger(maxStates, 1024, { max: 100_000 });
    this.loginRateLimitMax = positiveInteger(loginRateLimitMax, 20, { max: 10_000 });
    this.loginRateLimitWindowMs = positiveInteger(loginRateLimitWindowMs, 60 * 1000, {
      min: 1000,
      max: 60 * 60 * 1000,
    });
    this.maxRateLimitKeys = positiveInteger(maxRateLimitKeys, 4096, { max: 100_000 });
    this.now = typeof now === "function" ? now : Date.now;
    this.randomBytes = typeof randomBytes === "function" ? randomBytes : crypto.randomBytes;
    this.states = new Map();
    this.loginBuckets = new Map();
  }

  get size() {
    return this.states.size;
  }

  cleanup(nowMs = this.now()) {
    for (const [state, record] of this.states) {
      if (Number(record.expiresAt || 0) <= nowMs) this.states.delete(state);
    }
    for (const [key, bucket] of this.loginBuckets) {
      if (Number(bucket.resetAt || 0) <= nowMs) this.loginBuckets.delete(key);
    }
  }

  claimLoginAttempt(clientKey, nowMs) {
    let key =
      String(clientKey || "unknown")
        .trim()
        .slice(0, 200) || "unknown";
    if (!this.loginBuckets.has(key) && this.loginBuckets.size >= this.maxRateLimitKeys) {
      key = OVERFLOW_RATE_LIMIT_KEY;
      if (!this.loginBuckets.has(key)) {
        const oldestKey = this.loginBuckets.keys().next().value;
        if (oldestKey !== undefined) this.loginBuckets.delete(oldestKey);
      }
    }

    const current = this.loginBuckets.get(key);
    const bucket =
      current && Number(current.resetAt || 0) > nowMs
        ? current
        : { count: 0, resetAt: nowMs + this.loginRateLimitWindowMs };
    if (bucket.count >= this.loginRateLimitMax) {
      return {
        allowed: false,
        retryAfterSeconds: Math.max(1, Math.ceil((bucket.resetAt - nowMs) / 1000)),
      };
    }
    bucket.count += 1;
    this.loginBuckets.set(key, bucket);
    return { allowed: true, retryAfterSeconds: 0 };
  }

  issue({ clientKey = "unknown", record = {} } = {}) {
    const nowMs = this.now();
    this.cleanup(nowMs);
    const rateLimit = this.claimLoginAttempt(clientKey, nowMs);
    if (!rateLimit.allowed) return { ok: false, reason: "rate_limited", ...rateLimit };
    if (this.states.size >= this.maxStates) return { ok: false, reason: "capacity", retryAfterSeconds: 1 };

    let state = "";
    do {
      state = this.randomBytes(24).toString("base64url");
    } while (this.states.has(state));
    const browserNonce = this.randomBytes(32).toString("base64url");
    const expiresAt = nowMs + this.ttlMs;
    this.states.set(state, {
      ...(record && typeof record === "object" ? record : {}),
      browserNonceDigest: nonceDigest(browserNonce),
      createdAt: nowMs,
      expiresAt,
    });
    return { ok: true, state, browserNonce, expiresAt };
  }

  consume(state, browserNonce) {
    const nowMs = this.now();
    this.cleanup(nowMs);
    const key = String(state || "").trim();
    const stored = key ? this.states.get(key) : null;
    if (!stored || !nonceMatches(stored.browserNonceDigest, browserNonce)) return null;
    this.states.delete(key);
    const record = { ...stored };
    delete record.browserNonceDigest;
    return record;
  }
}
