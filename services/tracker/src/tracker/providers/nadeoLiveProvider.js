import fs from "fs";
import { waitForGlobalNadeoSlot } from "../../../../shared/nadeoGlobalThrottle.js";

const CORE_AUTH_BASE_URL = "https://prod.trackmania.core.nadeo.online";
const LIVE_API_BASE_URL = "https://live-services.trackmania.nadeo.live/api/token";

function toText(value, fallback = "") {
  const text = String(value ?? "").trim();
  return text || String(fallback || "").trim();
}

function clampInt(value, { min = 0, max = Number.MAX_SAFE_INTEGER, fallback = min } = {}) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(min, Math.min(max, Math.floor(parsed)));
}

function sanitizeBaseUrl(value, fallback) {
  const base = toText(value, fallback);
  return base.replace(/\/+$/, "");
}

function decodeJwtPayload(token) {
  const raw = toText(token);
  if (!raw) return null;
  const parts = raw.split(".");
  if (parts.length < 2) return null;
  try {
    const normalized = parts[1].replace(/-/g, "+").replace(/_/g, "/");
    const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "=");
    return JSON.parse(Buffer.from(padded, "base64").toString("utf8"));
  } catch {
    return null;
  }
}

function tokenExpiryMs(token) {
  const payload = decodeJwtPayload(token);
  const exp = Number(payload?.exp || 0);
  if (!Number.isFinite(exp) || exp <= 0) return 0;
  return exp * 1000;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, Math.max(0, Number(ms) || 0)));
}

function pickTopEntry(payload) {
  if (!payload || typeof payload !== "object") return null;
  const tops = Array.isArray(payload.tops) ? payload.tops : [];
  for (const zone of tops) {
    const entries = Array.isArray(zone?.top) ? zone.top : [];
    if (entries.length > 0) {
      return entries[0];
    }
  }
  return null;
}

function pickTopEntries(payload, { maxEntries = 100 } = {}) {
  if (!payload || typeof payload !== "object") return [];
  const out = [];
  const safeMax = Math.max(1, Math.min(Number(maxEntries) || 100, 1000));
  const tops = Array.isArray(payload.tops) ? payload.tops : [];
  for (const zone of tops) {
    const zoneId = toText(zone?.zoneId || zone?.zone_id || "world", "world");
    const zoneName = toText(zone?.zoneName || zone?.zone_name || zone?.name || "World", "World");
    const entries = Array.isArray(zone?.top) ? zone.top : [];
    for (let i = 0; i < entries.length; i += 1) {
      if (out.length >= safeMax) return out;
      const entry = entries[i] || {};
      const score = clampInt(entry?.score, { min: -1, max: 2147483647, fallback: -1 });
      const ts = Number(entry?.timestamp || 0);
      const recordedAt =
        Number.isFinite(ts) && ts > 0 ? new Date(ts * 1000).toISOString() : new Date().toISOString();
      const ranking = clampInt(entry?.position ?? entry?.rank ?? i + 1, {
        min: 1,
        max: 100000,
        fallback: i + 1,
      });
      out.push({
        accountId: toText(entry?.accountId),
        displayName: toText(entry?.displayName || entry?.name || entry?.accountId || "Unknown"),
        score,
        ranking,
        recordedAt,
        zoneId,
        zoneName,
      });
    }
  }
  return out;
}

class NadeoLiveTrackerProvider {
  constructor({
    authMode = "basic",
    dediLogin = "",
    dediPassword = "",
    accessToken = "",
    refreshToken = "",
    tokenCacheFile = "",
    userAgent = "altered project by ar, contact @ar___ on discord",
    requestTimeoutMs = 10000,
    minRequestGapMs = 5000,
    globalThrottleFile = "",
    globalMinRequestGapMs = 0,
    groupUid = "Personal_Best",
    onlyWorld = true,
    onHttpEvent = null,
    coreAuthBaseUrl = CORE_AUTH_BASE_URL,
    liveApiBaseUrl = LIVE_API_BASE_URL,
    logger = console,
  } = {}) {
    this.name = "nadeo-live";
    this.authMode = toText(authMode, "basic").toLowerCase();
    this.dediLogin = toText(dediLogin);
    this.dediPassword = toText(dediPassword);
    this.accessToken = toText(accessToken);
    this.refreshToken = toText(refreshToken);
    this.tokenCacheFile = toText(tokenCacheFile);
    this.userAgent = toText(userAgent, "xjk-tracker/1.0 (+https://xjk.yt)");
    this.requestTimeoutMs = Math.max(1000, Number(requestTimeoutMs) || 10000);
    this.minRequestGapMs = Math.max(0, Number(minRequestGapMs) || 0);
    this.globalThrottleFile = String(
      globalThrottleFile || process.env.NADEO_GLOBAL_THROTTLE_FILE || ""
    ).trim();
    this.globalMinRequestGapMs = Math.max(
      0,
      Number(globalMinRequestGapMs || process.env.NADEO_GLOBAL_MIN_REQUEST_GAP_MS || 0) || 0
    );
    this.groupUid = toText(groupUid, "Personal_Best");
    this.onlyWorld = Boolean(onlyWorld);
    this.onHttpEvent = typeof onHttpEvent === "function" ? onHttpEvent : null;
    this.coreAuthBaseUrl = sanitizeBaseUrl(coreAuthBaseUrl, CORE_AUTH_BASE_URL);
    this.liveApiBaseUrl = sanitizeBaseUrl(liveApiBaseUrl, LIVE_API_BASE_URL);
    this.logger = logger;

    this.nextRequestAtMs = 0;
    this.pendingTokenPromise = null;
    this.accessTokenExpiryMs = tokenExpiryMs(this.accessToken);

    this.loadTokenCache();
  }

  emitHttpEvent(sample = {}) {
    if (typeof this.onHttpEvent !== "function") return;
    try {
      this.onHttpEvent(sample);
    } catch {
      // Ignore telemetry callback failures.
    }
  }

  get isReady() {
    return this.isConfigured();
  }

  isConfigured() {
    if (this.accessToken || this.refreshToken) return true;
    if (this.authMode === "basic") {
      return Boolean(this.dediLogin && this.dediPassword);
    }
    if (this.authMode === "token") {
      return false;
    }
    return false;
  }

  isAccessTokenValid({ minLifetimeSeconds = 45 } = {}) {
    if (!this.accessToken) return false;
    if (!this.accessTokenExpiryMs) return true;
    return this.accessTokenExpiryMs - Date.now() > minLifetimeSeconds * 1000;
  }

  loadTokenCache() {
    if (!this.tokenCacheFile) return;
    if (!fs.existsSync(this.tokenCacheFile)) return;
    try {
      const payload = JSON.parse(fs.readFileSync(this.tokenCacheFile, "utf8"));
      const cachedAccess = toText(payload?.accessToken);
      const cachedRefresh = toText(payload?.refreshToken);
      if (!this.accessToken && cachedAccess) {
        this.accessToken = cachedAccess;
      }
      if (!this.refreshToken && cachedRefresh) {
        this.refreshToken = cachedRefresh;
      }
      this.accessTokenExpiryMs = tokenExpiryMs(this.accessToken);
    } catch (error) {
      this.logger.warn(
        `[tracker-nadeo-live] failed reading token cache ${this.tokenCacheFile}: ${error?.message || error}`
      );
    }
  }

  saveTokenCache() {
    if (!this.tokenCacheFile) return;
    try {
      const payload = {
        accessToken: this.accessToken || "",
        refreshToken: this.refreshToken || "",
        savedAt: new Date().toISOString(),
      };
      fs.writeFileSync(this.tokenCacheFile, JSON.stringify(payload, null, 2), "utf8");
    } catch (error) {
      this.logger.warn(
        `[tracker-nadeo-live] failed writing token cache ${this.tokenCacheFile}: ${error?.message || error}`
      );
    }
  }

  async waitForRateSlot() {
    if (this.minRequestGapMs > 0) {
      const now = Date.now();
      const waitMs = Math.max(0, this.nextRequestAtMs - now);
      if (waitMs > 0) {
        await sleep(waitMs);
      }
      this.nextRequestAtMs = Date.now() + this.minRequestGapMs;
    }

    const sharedGapMs = Math.max(this.minRequestGapMs, this.globalMinRequestGapMs);
    if (sharedGapMs > 0) {
      await waitForGlobalNadeoSlot({
        stateFile: this.globalThrottleFile,
        minGapMs: sharedGapMs,
        label: String(process.env.TRACKER_INSTANCE_ID || "tracker-nadeo-live"),
      });
    }
  }

  async requestJson(url, { method = "GET", headers = {}, body } = {}) {
    const startedAt = Date.now();
    const safeMethod = String(method || "GET").toUpperCase();
    let targetHost = "";
    let targetPath = "/";
    try {
      const parsed = new URL(String(url || ""));
      targetHost = String(parsed.host || "").toLowerCase();
      targetPath = `${parsed.pathname || "/"}${parsed.search || ""}`;
    } catch {
      targetHost = "";
      targetPath = "/";
    }
    const requestBodyText =
      body === null || body === undefined
        ? ""
        : typeof body === "string"
          ? body
          : body instanceof URLSearchParams
            ? body.toString()
            : "";
    const requestBytes = requestBodyText ? Buffer.byteLength(requestBodyText, "utf8") : 0;

    await this.waitForRateSlot();

    let response;
    try {
      response = await fetch(url, {
        method,
        headers,
        body,
        signal: AbortSignal.timeout(this.requestTimeoutMs),
      });
    } catch (error) {
      this.emitHttpEvent({
        direction: "outgoing",
        component: "nadeo-live",
        service: "tracker",
        method: safeMethod,
        route: targetPath,
        targetHost,
        targetPath,
        statusCode: 0,
        durationMs: Date.now() - startedAt,
        bytesIn: requestBytes,
        bytesOut: 0,
      });
      throw error;
    }

    const raw = await response.text();
    const responseBytes = raw ? Buffer.byteLength(raw, "utf8") : 0;
    let payload = null;
    if (raw) {
      try {
        payload = JSON.parse(raw);
      } catch {
        payload = null;
      }
    }

    if (!response.ok) {
      this.emitHttpEvent({
        direction: "outgoing",
        component: "nadeo-live",
        service: "tracker",
        method: safeMethod,
        route: targetPath,
        targetHost,
        targetPath,
        statusCode: Number(response.status || 0),
        durationMs: Date.now() - startedAt,
        bytesIn: requestBytes,
        bytesOut: responseBytes,
      });
      const details =
        payload?.message ||
        payload?.error ||
        payload?.detail ||
        raw ||
        `HTTP ${response.status}`;
      const error = new Error(
        `Request failed (${response.status}) for ${String(method || "GET").toUpperCase()} ${url}: ${details}`
      );
      error.statusCode = response.status;
      error.payload = payload;
      throw error;
    }

    this.emitHttpEvent({
      direction: "outgoing",
      component: "nadeo-live",
      service: "tracker",
      method: safeMethod,
      route: targetPath,
      targetHost,
      targetPath,
      statusCode: Number(response.status || 0),
      durationMs: Date.now() - startedAt,
      bytesIn: requestBytes,
      bytesOut: responseBytes,
    });

    return payload;
  }

  async requestBasicAudienceToken(audience = "NadeoLiveServices") {
    if (!this.dediLogin || !this.dediPassword) {
      throw new Error("TRACKER_NADEO_DEDI_LOGIN/TRACKER_NADEO_DEDI_PASSWORD are required.");
    }

    const credentials = Buffer.from(`${this.dediLogin}:${this.dediPassword}`).toString("base64");
    const payload = await this.requestJson(`${this.coreAuthBaseUrl}/v2/authentication/token/basic`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Basic ${credentials}`,
        "user-agent": this.userAgent,
      },
      body: JSON.stringify({ audience }),
    });

    const accessToken = toText(payload?.accessToken);
    const refreshToken = toText(payload?.refreshToken);
    if (!accessToken) {
      throw new Error("Nadeo auth response missing accessToken.");
    }
    this.accessToken = accessToken;
    if (refreshToken) this.refreshToken = refreshToken;
    this.accessTokenExpiryMs = tokenExpiryMs(this.accessToken);
    this.saveTokenCache();
    return this.accessToken;
  }

  async refreshAccessToken() {
    if (!this.refreshToken) {
      throw new Error("No refresh token available.");
    }
    const payload = await this.requestJson(
      `${this.coreAuthBaseUrl}/v2/authentication/token/refresh`,
      {
        method: "POST",
        headers: {
          authorization: `nadeo_v1 t=${this.refreshToken}`,
          "user-agent": this.userAgent,
        },
      }
    );

    const accessToken = toText(payload?.accessToken);
    const refreshToken = toText(payload?.refreshToken);
    if (!accessToken) {
      throw new Error("Nadeo refresh response missing accessToken.");
    }
    this.accessToken = accessToken;
    if (refreshToken) this.refreshToken = refreshToken;
    this.accessTokenExpiryMs = tokenExpiryMs(this.accessToken);
    this.saveTokenCache();
    return this.accessToken;
  }

  async ensureAccessToken({ forceRefresh = false } = {}) {
    if (!forceRefresh && this.isAccessTokenValid()) {
      return this.accessToken;
    }

    if (this.pendingTokenPromise) {
      return this.pendingTokenPromise;
    }

    this.pendingTokenPromise = (async () => {
      if (!this.isConfigured()) {
        throw new Error(
          "Nadeo live tracker provider is not configured. Set TRACKER_NADEO_DEDI_LOGIN/TRACKER_NADEO_DEDI_PASSWORD or access/refresh tokens."
        );
      }

      if (this.refreshToken) {
        try {
          return await this.refreshAccessToken();
        } catch (error) {
          this.logger.warn(
            `[tracker-nadeo-live] refresh failed, falling back to basic auth: ${error?.message || error}`
          );
        }
      }

      if (this.authMode === "basic") {
        return this.requestBasicAudienceToken("NadeoLiveServices");
      }

      if (this.accessToken) {
        return this.accessToken;
      }

      throw new Error(
        "TRACKER_NADEO_AUTH_MODE=token requires TRACKER_NADEO_LIVE_ACCESS_TOKEN and/or TRACKER_NADEO_LIVE_REFRESH_TOKEN."
      );
    })();

    try {
      return await this.pendingTokenPromise;
    } finally {
      this.pendingTokenPromise = null;
    }
  }

  async fetchTopRecord(mapUid, { retryOnUnauthorized = true } = {}) {
    const entries = await this.fetchTopRecords(mapUid, {
      length: 1,
      retryOnUnauthorized,
    });
    const top = entries[0];
    if (!top) return null;
    return {
      accountId: top.accountId,
      displayName: top.displayName,
      wrMs: Number(top.score || 0),
      recordedAt: top.recordedAt,
      zoneId: top.zoneId,
      zoneName: top.zoneName,
      ranking: Number(top.ranking || 1),
    };
  }

  async fetchTopRecords(mapUid, { length = 100, retryOnUnauthorized = true } = {}) {
    const token = await this.ensureAccessToken();
    const safeMapUid = encodeURIComponent(toText(mapUid));
    const safeGroupUid = encodeURIComponent(this.groupUid);
    const safeLength = Math.max(1, Math.min(Number(length) || 100, 1000));
    const url =
      `${this.liveApiBaseUrl}/leaderboard/group/${safeGroupUid}/map/${safeMapUid}/top` +
      `?onlyWorld=${this.onlyWorld ? "true" : "false"}&length=${safeLength}&offset=0`;

    try {
      const payload = await this.requestJson(url, {
        method: "GET",
        headers: {
          authorization: `nadeo_v1 t=${token}`,
          "user-agent": this.userAgent,
        },
      });
      return pickTopEntries(payload, { maxEntries: safeLength });
    } catch (error) {
      if (retryOnUnauthorized && Number(error?.statusCode || 0) === 401) {
        await this.ensureAccessToken({ forceRefresh: true });
        return this.fetchTopRecords(mapUid, { length, retryOnUnauthorized: false });
      }
      throw error;
    }
  }

  async checkMap(map) {
    const uid = toText(map?.uid || map?.mapUid || map?.map_uid);
    if (!uid) {
      return {
        changed: false,
        source: this.name,
        note: "missing-map-uid",
      };
    }
    if (!this.isConfigured()) {
      return {
        changed: false,
        source: this.name,
        note: "auth-unconfigured",
      };
    }

    const top = await this.fetchTopRecord(uid);
    if (!top) {
      return {
        changed: false,
        source: this.name,
        note: "no-record",
      };
    }
    if (!Number.isFinite(top.wrMs) || top.wrMs <= 0) {
      return {
        changed: false,
        source: this.name,
        note: top.wrMs === -1 ? "secret-score-hidden" : "invalid-score",
      };
    }

    const previousWrMs = clampInt(map?.wrMs, { min: 0, max: 2147483647, fallback: 0 });
    const improved = previousWrMs <= 0 || top.wrMs < previousWrMs;

    return {
      changed: improved,
      source: this.name,
      note: improved ? "wr-improved" : "wr-unchanged",
      wrMs: top.wrMs,
      accountId: top.accountId,
      displayName: top.displayName,
      recordedAt: top.recordedAt,
    };
  }

  async checkMapLeaderboard(map, { length = 100 } = {}) {
    const uid = toText(map?.uid || map?.mapUid || map?.map_uid);
    if (!uid) {
      return {
        source: this.name,
        note: "missing-map-uid",
        entries: [],
      };
    }
    if (!this.isConfigured()) {
      return {
        source: this.name,
        note: "auth-unconfigured",
        entries: [],
      };
    }

    const entries = await this.fetchTopRecords(uid, { length });
    if (!entries.length) {
      return {
        source: this.name,
        note: "no-records",
        entries: [],
      };
    }

    return {
      source: this.name,
      note: "leaderboard-updated",
      entries: entries
        .filter((entry) => Number.isFinite(entry.score) && entry.score > 0)
        .map((entry) => ({
          accountId: entry.accountId,
          displayName: entry.displayName,
          score: Number(entry.score || 0),
          ranking: Number(entry.ranking || 0),
          recordedAt: entry.recordedAt,
          zoneId: entry.zoneId,
          zoneName: entry.zoneName,
        })),
    };
  }
}

export { NadeoLiveTrackerProvider };
