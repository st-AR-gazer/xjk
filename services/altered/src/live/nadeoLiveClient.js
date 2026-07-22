import {
  addNadeoQuery,
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
  requireNadeoTokenPair,
  NadeoAccessTokenManager,
} from "../../../shared/nadeoClientRuntime.js";
import { chunkArray, clampInt } from "../../../shared/valueUtils.js";

class NadeoLiveClient {
  constructor({
    defaultAudience = NADEO_LIVE_SERVICES_AUDIENCE,
    authMode = "basic",
    dediLogin = "",
    dediPassword = "",
    accessToken = "",
    refreshToken = "",
    userAgent = "altered.xjk.yt/1.0 (+https://xjk.yt/)",
    requestTimeoutMs = 12000,
    minRequestGapMs = 5000,
    globalThrottleFile = "",
    globalMinRequestGapMs = 0,
    coreAuthBaseUrl = NADEO_CORE_BASE_URL,
    liveApiBaseUrl = NADEO_LIVE_TOKEN_BASE_URL,
    logger = console,
  } = {}) {
    this.defaultAudience =
      String(defaultAudience || NADEO_LIVE_SERVICES_AUDIENCE).trim() || NADEO_LIVE_SERVICES_AUDIENCE;
    this.authMode = String(authMode || "basic")
      .trim()
      .toLowerCase();
    this.dediLogin = String(dediLogin || "").trim();
    this.dediPassword = String(dediPassword || "").trim();
    this.userAgent = String(userAgent || "").trim() || "xjk-altered-monitor/1.0 (+https://xjk.yt)";
    Object.assign(
      this,
      normalizeNadeoRequestPolicy({
        requestTimeoutMs,
        defaultRequestTimeoutMs: 12000,
        minRequestGapMs,
        globalThrottleFile: globalThrottleFile || process.env.NADEO_GLOBAL_THROTTLE_FILE,
        globalMinRequestGapMs: globalMinRequestGapMs || process.env.NADEO_GLOBAL_MIN_REQUEST_GAP_MS,
      })
    );
    this.coreAuthBaseUrl = normalizeBaseUrl(coreAuthBaseUrl, NADEO_CORE_BASE_URL);
    this.liveApiBaseUrl = normalizeBaseUrl(liveApiBaseUrl, NADEO_LIVE_TOKEN_BASE_URL);
    this.logger = logger;
    this.requestRuntime = new NadeoRequestRuntime({
      requestTimeoutMs: this.requestTimeoutMs,
      minRequestGapMs: this.minRequestGapMs,
      globalThrottleFile: this.globalThrottleFile,
      globalMinRequestGapMs: this.globalMinRequestGapMs,
      defaultThrottleLabel: "altered-live",
    });

    this.accessToken = String(accessToken || "").trim();
    this.refreshToken = String(refreshToken || "").trim();
    this.accessTokenExpiryMs = jwtExpiryMs(this.accessToken);
    this.tokenRequests = new NadeoTokenRequestCoordinator();
    this.accessTokens = new NadeoAccessTokenManager(this);
  }

  getStatus() {
    return {
      authMode: this.authMode,
      configured: this.isConfigured(),
      hasAccessToken: Boolean(this.accessToken),
      hasRefreshToken: Boolean(this.refreshToken),
      accessTokenExpiresAt: this.accessTokenExpiryMs ? new Date(this.accessTokenExpiryMs).toISOString() : null,
      liveApiBaseUrl: this.liveApiBaseUrl,
    };
  }

  isConfigured() {
    if (this.accessToken || this.refreshToken) return true;
    if (this.authMode === "token") return false;
    if (this.authMode === "basic") {
      return Boolean(this.dediLogin && this.dediPassword);
    }
    return false;
  }

  isAccessTokenValid({ minLifetimeSeconds = 45 } = {}) {
    return isTokenFresh(this.accessToken, this.accessTokenExpiryMs, { minLifetimeSeconds });
  }

  async requestJson(url, options = {}) {
    return this.requestRuntime.requestJson(url, {
      ...options,
      formatError: ({ status, method, requestUrl, details }) =>
        `Request failed (${status}) for ${method} ${requestUrl}: ${details}`,
    });
  }

  async requestBasicAudienceToken(audience = this.defaultAudience) {
    if (!this.dediLogin || !this.dediPassword) {
      throw new Error("Dedicated login/password missing for basic Nadeo auth.");
    }
    return this.accessTokens.requestBasic(audience, {
      missingAccessTokenMessage: "Nadeo basic authentication response did not include accessToken.",
    });
  }

  async requestUbisoftAudienceToken({ ubisoftAccessToken, audience = this.defaultAudience } = {}) {
    const token = String(ubisoftAccessToken || "").trim();
    if (!token) {
      throw new Error("Ubisoft access token is required to request Nadeo audience token.");
    }

    const payload = await this.requestJson(`${this.coreAuthBaseUrl}/v2/authentication/token/ubiservices`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `ubi_v1 t=${token}`,
        "user-agent": this.userAgent,
      },
      body: JSON.stringify({ audience }),
    });

    requireNadeoTokenPair(payload, "Nadeo Ubisoft-auth response did not include accessToken.");
    return payload;
  }

  async createUserScopedClient({ ubisoftAccessToken, audience = this.defaultAudience } = {}) {
    const payload = await this.requestUbisoftAudienceToken({
      ubisoftAccessToken,
      audience,
    });

    return this.#createChildClient({
      audience,
      authMode: "token",
      accessToken: String(payload?.accessToken || "").trim(),
      refreshToken: String(payload?.refreshToken || "").trim(),
    });
  }

  createSiblingClient({ audience = this.defaultAudience } = {}) {
    const safeAudience = String(audience || this.defaultAudience).trim() || this.defaultAudience;
    const sameAudience = safeAudience === this.defaultAudience;
    return this.#createChildClient({
      audience: safeAudience,
      authMode: this.authMode,
      dediLogin: this.dediLogin,
      dediPassword: this.dediPassword,
      accessToken: sameAudience ? this.accessToken : "",
      refreshToken: sameAudience ? this.refreshToken : "",
    });
  }

  #createChildClient({ audience, authMode, dediLogin = "", dediPassword = "", accessToken = "", refreshToken = "" }) {
    return new NadeoLiveClient({
      defaultAudience: audience,
      authMode,
      dediLogin,
      dediPassword,
      accessToken,
      refreshToken,
      userAgent: this.userAgent,
      requestTimeoutMs: this.requestTimeoutMs,
      minRequestGapMs: this.minRequestGapMs,
      globalThrottleFile: this.globalThrottleFile,
      globalMinRequestGapMs: this.globalMinRequestGapMs,
      coreAuthBaseUrl: this.coreAuthBaseUrl,
      liveApiBaseUrl: this.liveApiBaseUrl,
      logger: this.logger,
    });
  }

  async refreshAccessToken() {
    if (!this.refreshToken) return "";
    return this.accessTokens.requestRefresh({
      missingAccessTokenMessage: "Nadeo refresh response did not include accessToken.",
    });
  }

  async ensureAccessToken({ forceRefresh = false } = {}) {
    if (!forceRefresh && this.isAccessTokenValid()) {
      return this.accessToken;
    }

    return this.tokenRequests.run(this.defaultAudience, async () => {
      if (this.refreshToken) {
        try {
          return await this.refreshAccessToken();
        } catch (error) {
          this.logger.warn(
            `[altered-live] refresh token failed, falling back to full auth: ${error?.message || error}`
          );
        }
      }

      if (this.isAccessTokenValid()) {
        return this.accessToken;
      }

      if (this.authMode === "basic") {
        return this.requestBasicAudienceToken(this.defaultAudience);
      }

      if (this.authMode === "token") {
        throw new Error(
          "No valid Nadeo access token available. Provide ALTERED_LIVE_ACCESS_TOKEN and/or ALTERED_LIVE_REFRESH_TOKEN."
        );
      }

      if (this.accessToken) return this.accessToken;
      throw new Error(`Unsupported or unconfigured Nadeo auth mode: ${this.authMode}`);
    });
  }

  async liveGet(pathname, query = null, { retryOnUnauthorized = true } = {}) {
    const url = addNadeoQuery(new URL(`${this.liveApiBaseUrl}/${String(pathname || "").replace(/^\/+/, "")}`), query);
    return this.requestAuthenticatedJson(url, { retryOnUnauthorized });
  }

  async liveGetFromServiceRoot(pathname, query = null, { retryOnUnauthorized = true } = {}) {
    const baseUrl = new URL(this.liveApiBaseUrl);
    const url = addNadeoQuery(new URL(`/api/${String(pathname || "").replace(/^\/+/, "")}`, baseUrl.origin), query);
    return this.requestAuthenticatedJson(url, { retryOnUnauthorized });
  }

  async coreGet(pathname, query = null, { retryOnUnauthorized = true } = {}) {
    const url = addNadeoQuery(new URL(`/${String(pathname || "").replace(/^\/+/, "")}`, this.coreAuthBaseUrl), query);
    return this.requestAuthenticatedJson(url, {
      retryOnUnauthorized,
      unauthorizedMessage: "[altered-live] core access token unauthorized, forcing token refresh.",
    });
  }

  async requestAuthenticatedJson(
    url,
    {
      retryOnUnauthorized = true,
      unauthorizedMessage = "[altered-live] access token unauthorized, forcing token refresh.",
    } = {}
  ) {
    return requestNadeoJsonWithToken({
      requestJson: (requestUrl, options) => this.requestJson(requestUrl, options),
      ensureAccessToken: (options) => this.ensureAccessToken(options),
      url,
      userAgent: this.userAgent,
      retryOnUnauthorized,
      onUnauthorized: () => this.logger.warn(unauthorizedMessage),
    });
  }

  async getClubById(clubId) {
    const safeClubId = clampInt(clubId, { min: 1, max: 2147483647, fallback: 0 });
    if (!safeClubId) throw new Error("clubId must be a positive integer.");
    return this.liveGet(`club/${safeClubId}`);
  }

  async getClubActivities(clubId, { length = 250, offset = 0, activeOnly = true } = {}) {
    const safeClubId = clampInt(clubId, { min: 1, max: 2147483647, fallback: 0 });
    if (!safeClubId) throw new Error("clubId must be a positive integer.");
    return this.liveGet(`club/${safeClubId}/activity`, {
      length: clampInt(length, { min: 1, max: 250, fallback: 250 }),
      offset: clampInt(offset, { min: 0, max: 100000, fallback: 0 }),
      active: activeOnly ? "true" : "false",
    });
  }

  async getClubCampaignById(clubId, campaignId) {
    const safeClubId = clampInt(clubId, { min: 1, max: 2147483647, fallback: 0 });
    const safeCampaignId = clampInt(campaignId, { min: 1, max: 2147483647, fallback: 0 });
    if (!safeClubId || !safeCampaignId) {
      throw new Error("clubId and campaignId must be positive integers.");
    }
    return this.liveGet(`club/${safeClubId}/campaign/${safeCampaignId}`);
  }

  async getClubMembers(clubId, { length = 250, offset = 0 } = {}) {
    const safeClubId = clampInt(clubId, { min: 1, max: 2147483647, fallback: 0 });
    if (!safeClubId) throw new Error("clubId must be a positive integer.");
    return this.liveGet(`club/${safeClubId}/member`, {
      length: clampInt(length, { min: 1, max: 250, fallback: 250 }),
      offset: clampInt(offset, { min: 0, max: 100000, fallback: 0 }),
    });
  }

  async getClubBuckets({ bucketType = "map", clubId = null, length = 250, offset = 0 } = {}) {
    const safeBucketType =
      String(bucketType || "map")
        .trim()
        .toLowerCase() || "map";
    const safeClubId = clampInt(clubId, { min: 1, max: 2147483647, fallback: 0 });
    const query = {
      length: clampInt(length, { min: 1, max: 250, fallback: 250 }),
      offset: clampInt(offset, { min: 0, max: 100000, fallback: 0 }),
    };
    if (safeClubId) {
      query.clubId = safeClubId;
      query.clubID = safeClubId;
    }
    return this.liveGet(`club/bucket/${safeBucketType}/all`, query);
  }

  async getClubBucketById(clubId, bucketId) {
    const safeClubId = clampInt(clubId, { min: 1, max: 2147483647, fallback: 0 });
    const safeBucketId = clampInt(bucketId, { min: 1, max: 2147483647, fallback: 0 });
    if (!safeClubId || !safeBucketId) {
      throw new Error("clubId and bucketId must be positive integers.");
    }
    return this.liveGet(`club/${safeClubId}/bucket/${safeBucketId}`);
  }

  async getWeeklyShortsCampaigns({ length = 10, offset = 0 } = {}) {
    return this.liveGetFromServiceRoot("campaign/weekly-shorts", {
      length: clampInt(length, { min: 1, max: 100, fallback: 10 }),
      offset: clampInt(offset, { min: 0, max: 1000, fallback: 0 }),
    });
  }

  async getOfficialSeasonalCampaignsV2({ length = 50, offset = 0 } = {}) {
    return this.liveGetFromServiceRoot("campaign/official", {
      length: clampInt(length, { min: 1, max: 100, fallback: 50 }),
      offset: clampInt(offset, { min: 0, max: 2000, fallback: 0 }),
    });
  }

  async getTotdMonths({ length = 12, offset = 0, royal = false } = {}) {
    return this.liveGetFromServiceRoot("token/campaign/month", {
      length: clampInt(length, { min: 1, max: 100, fallback: 12 }),
      offset: clampInt(offset, { min: 0, max: 5000, fallback: 0 }),
      royal: royal ? "true" : "false",
    });
  }

  async getWeeklyGrandsCampaigns({ length = 10, offset = 0 } = {}) {
    return this.liveGetFromServiceRoot("campaign/weekly-grands", {
      length: clampInt(length, { min: 1, max: 100, fallback: 10 }),
      offset: clampInt(offset, { min: 0, max: 5000, fallback: 0 }),
    });
  }

  async #fetchMapsByUidChunks(mapUids, { loadChunk, readMaps, onChunk, describeCurrentMaps = false } = {}) {
    const normalized = [...new Set(mapUids.map((value) => String(value || "").trim()).filter(Boolean))];
    if (!normalized.length) return [];
    const results = [];
    const chunks = chunkArray(normalized, 100);
    for (let index = 0; index < chunks.length; index += 1) {
      const part = chunks[index];
      const payload = await loadChunk(part);
      const maps = readMaps(payload);
      results.push(...maps);
      if (typeof onChunk === "function") {
        const currentMaps = describeCurrentMaps
          ? maps
              .slice(0, 6)
              .map((map) => {
                const mapUid = String(map?.uid || map?.mapUid || map?.map_uid || "").trim();
                const mapName = String(map?.name || map?.title || map?.mapName || mapUid || "").trim();
                if (!mapUid && !mapName) return null;
                return {
                  mapUid: mapUid || null,
                  mapName: mapName || mapUid || "Unknown map",
                };
              })
              .filter(Boolean)
          : [];
        const firstMap = currentMaps[0] || null;
        const progress = {
          index: index + 1,
          total: chunks.length,
          chunkSize: part.length,
          requestedCount: normalized.length,
          firstUid: part[0] || "",
          lastUid: part[part.length - 1] || "",
          loadedCount: results.length,
        };
        if (describeCurrentMaps) {
          progress.currentMapUid = firstMap?.mapUid || null;
          progress.currentMapName = firstMap?.mapName || "";
          progress.currentMaps = currentMaps;
        }
        onChunk(progress);
      }
    }
    return results;
  }

  async getMapsByUidList(mapUids = [], { onChunk } = {}) {
    return this.#fetchMapsByUidChunks(mapUids, {
      loadChunk: (part) =>
        this.liveGet("map/get-multiple", {
          mapUidList: part.join(","),
        }),
      readMaps: (payload) => (Array.isArray(payload?.mapList) ? payload.mapList : []),
      onChunk,
      describeCurrentMaps: true,
    });
  }

  async getCoreMapsByUidList(mapUids = [], { onChunk } = {}) {
    return this.#fetchMapsByUidChunks(mapUids, {
      loadChunk: (part) =>
        this.coreGet("maps/by-uid/", {
          mapUidList: part.join(","),
        }),
      readMaps: (payload) => (Array.isArray(payload) ? payload : []),
      onChunk,
    });
  }
}

export { NadeoLiveClient };
