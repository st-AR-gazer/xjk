import fs from "node:fs";
import {
  isTokenFresh,
  jwtExpiryMs,
  NADEO_CORE_BASE_URL,
  NADEO_LIVE_SERVICES_AUDIENCE,
  NADEO_LIVE_TOKEN_BASE_URL,
  NadeoRequestRuntime,
  NadeoTokenRequestCoordinator,
  normalizeBaseUrl,
  normalizeNadeoRequestPolicy,
  requestNadeoJsonWithToken,
  NadeoAccessTokenManager,
} from "../../../../shared/nadeoClientRuntime.js";
import { clampInt, toTextOrFallback as toText } from "../../../../shared/valueUtils.js";

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
      const recordedAt = Number.isFinite(ts) && ts > 0 ? new Date(ts * 1000).toISOString() : new Date().toISOString();
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
    userAgent = "trackers.xjk.yt/1.0 (+https://xjk.yt/)",
    requestTimeoutMs = 10000,
    minRequestGapMs = 5000,
    globalThrottleFile = "",
    globalMinRequestGapMs = 0,
    groupUid = "Personal_Best",
    onlyWorld = true,
    onHttpEvent = null,
    coreAuthBaseUrl = NADEO_CORE_BASE_URL,
    liveApiBaseUrl = NADEO_LIVE_TOKEN_BASE_URL,
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
    Object.assign(
      this,
      normalizeNadeoRequestPolicy({
        requestTimeoutMs,
        defaultRequestTimeoutMs: 10000,
        minRequestGapMs,
        globalThrottleFile: globalThrottleFile || process.env.NADEO_GLOBAL_THROTTLE_FILE,
        globalMinRequestGapMs: globalMinRequestGapMs || process.env.NADEO_GLOBAL_MIN_REQUEST_GAP_MS,
      })
    );
    this.groupUid = toText(groupUid, "Personal_Best");
    this.onlyWorld = Boolean(onlyWorld);
    this.emitHttpEvent = createSafeEventSink(onHttpEvent);
    this.coreAuthBaseUrl = normalizeBaseUrl(coreAuthBaseUrl, NADEO_CORE_BASE_URL);
    this.liveApiBaseUrl = normalizeBaseUrl(liveApiBaseUrl, NADEO_LIVE_TOKEN_BASE_URL);
    this.logger = logger;

    this.tokenRequests = new NadeoTokenRequestCoordinator();
    this.accessTokenExpiryMs = jwtExpiryMs(this.accessToken);
    this.requestRuntime = new NadeoRequestRuntime({
      requestTimeoutMs: this.requestTimeoutMs,
      minRequestGapMs: this.minRequestGapMs,
      globalThrottleFile: this.globalThrottleFile,
      globalMinRequestGapMs: this.globalMinRequestGapMs,
      defaultThrottleLabel: "tracker-nadeo-live",
      telemetryComponent: "nadeo-live",
      telemetryService: "tracker",
      onHttpEvent: this.emitHttpEvent,
    });
    this.accessTokens = new NadeoAccessTokenManager(this, {
      onTokenUpdated: () => this.saveTokenCache(),
    });

    this.loadTokenCache();
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
    return isTokenFresh(this.accessToken, this.accessTokenExpiryMs, { minLifetimeSeconds });
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
      this.accessTokenExpiryMs = jwtExpiryMs(this.accessToken);
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
    return this.requestRuntime.waitForRateSlot(String(process.env.TRACKER_INSTANCE_ID || "tracker-nadeo-live"));
  }

  async requestJson(url, { method = "GET", headers = {}, body } = {}) {
    return this.requestRuntime.requestJson(url, {
      method,
      headers,
      body,
      throttleLabel: String(process.env.TRACKER_INSTANCE_ID || "tracker-nadeo-live"),
      formatError: ({ status, method: requestMethod, requestUrl, details }) =>
        `Request failed (${status}) for ${requestMethod} ${requestUrl}: ${details}`,
    });
  }

  async requestBasicAudienceToken(audience = NADEO_LIVE_SERVICES_AUDIENCE) {
    if (!this.dediLogin || !this.dediPassword) {
      throw new Error("TRACKER_NADEO_DEDI_LOGIN/TRACKER_NADEO_DEDI_PASSWORD are required.");
    }

    return this.accessTokens.requestBasic(audience, {
      missingAccessTokenMessage: "Nadeo auth response missing accessToken.",
    });
  }

  async refreshAccessToken() {
    if (!this.refreshToken) {
      throw new Error("No refresh token available.");
    }
    return this.accessTokens.requestRefresh({
      missingAccessTokenMessage: "Nadeo refresh response missing accessToken.",
    });
  }

  async ensureAccessToken({ forceRefresh = false } = {}) {
    if (!forceRefresh && this.isAccessTokenValid()) {
      return this.accessToken;
    }

    return this.tokenRequests.run(NADEO_LIVE_SERVICES_AUDIENCE, async () => {
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
        return this.requestBasicAudienceToken(NADEO_LIVE_SERVICES_AUDIENCE);
      }

      if (this.accessToken) {
        return this.accessToken;
      }

      throw new Error(
        "TRACKER_NADEO_AUTH_MODE=token requires TRACKER_NADEO_LIVE_ACCESS_TOKEN and/or TRACKER_NADEO_LIVE_REFRESH_TOKEN."
      );
    });
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
    const safeMapUid = encodeURIComponent(toText(mapUid));
    const safeGroupUid = encodeURIComponent(this.groupUid);
    const safeLength = Math.max(1, Math.min(Number(length) || 100, 1000));
    const url =
      `${this.liveApiBaseUrl}/leaderboard/group/${safeGroupUid}/map/${safeMapUid}/top` +
      `?onlyWorld=${this.onlyWorld ? "true" : "false"}&length=${safeLength}&offset=0`;

    const payload = await requestNadeoJsonWithToken({
      requestJson: (requestUrl, options) => this.requestJson(requestUrl, options),
      ensureAccessToken: (options) => this.ensureAccessToken(options),
      url,
      userAgent: this.userAgent,
      retryOnUnauthorized,
    });
    return pickTopEntries(payload, { maxEntries: safeLength });
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
import { createSafeEventSink } from "../../telemetry/safeEventSink.js";
