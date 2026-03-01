const CORE_AUTH_BASE_URL = "https://prod.trackmania.core.nadeo.online";
const LIVE_API_BASE_URL = "https://live-services.trackmania.nadeo.live/api/token";

function clampInt(value, { min = 0, max = Number.MAX_SAFE_INTEGER, fallback = min } = {}) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(min, Math.min(max, Math.floor(parsed)));
}

function decodeJwtPayload(token) {
  const raw = String(token || "").trim();
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

function sanitizeBaseUrl(value, fallback) {
  const text = String(value || "").trim() || String(fallback || "").trim();
  return text.replace(/\/+$/, "");
}

function chunk(values, size) {
  const out = [];
  for (let i = 0; i < values.length; i += size) {
    out.push(values.slice(i, i + size));
  }
  return out;
}

class NadeoLiveClient {
  constructor({
    authMode = "basic",
    dediLogin = "",
    dediPassword = "",
    accessToken = "",
    refreshToken = "",
    userAgent = "altered project by ar, contact @ar___ on discord",
    requestTimeoutMs = 12000,
    minRequestGapMs = 550,
    coreAuthBaseUrl = CORE_AUTH_BASE_URL,
    liveApiBaseUrl = LIVE_API_BASE_URL,
    logger = console,
  } = {}) {
    this.authMode = String(authMode || "basic").trim().toLowerCase();
    this.dediLogin = String(dediLogin || "").trim();
    this.dediPassword = String(dediPassword || "").trim();
    this.userAgent = String(userAgent || "").trim() || "xjk-altered-monitor/1.0 (+https://xjk.yt)";
    this.requestTimeoutMs = Math.max(1000, Number(requestTimeoutMs) || 12000);
    this.minRequestGapMs = Math.max(0, Number(minRequestGapMs) || 0);
    this.coreAuthBaseUrl = sanitizeBaseUrl(coreAuthBaseUrl, CORE_AUTH_BASE_URL);
    this.liveApiBaseUrl = sanitizeBaseUrl(liveApiBaseUrl, LIVE_API_BASE_URL);
    this.logger = logger;
    this.nextRequestAtMs = 0;

    this.accessToken = String(accessToken || "").trim();
    this.refreshToken = String(refreshToken || "").trim();
    this.accessTokenExpiryMs = tokenExpiryMs(this.accessToken);
    this.pendingTokenPromise = null;
  }

  getStatus() {
    return {
      authMode: this.authMode,
      configured: this.isConfigured(),
      hasAccessToken: Boolean(this.accessToken),
      hasRefreshToken: Boolean(this.refreshToken),
      accessTokenExpiresAt: this.accessTokenExpiryMs
        ? new Date(this.accessTokenExpiryMs).toISOString()
        : null,
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
    if (!this.accessToken) return false;
    if (!this.accessTokenExpiryMs) return true;
    return this.accessTokenExpiryMs - Date.now() > minLifetimeSeconds * 1000;
  }

  async requestJson(url, options = {}) {
    if (this.minRequestGapMs > 0) {
      const now = Date.now();
      const waitMs = Math.max(0, this.nextRequestAtMs - now);
      if (waitMs > 0) {
        await new Promise((resolve) => setTimeout(resolve, waitMs));
      }
      this.nextRequestAtMs = Date.now() + this.minRequestGapMs;
    }
    const response = await fetch(url, {
      ...options,
      signal: AbortSignal.timeout(this.requestTimeoutMs),
    });
    const responseText = await response.text();
    let payload = null;
    if (responseText) {
      try {
        payload = JSON.parse(responseText);
      } catch {
        payload = null;
      }
    }
    if (!response.ok) {
      const details =
        payload?.message ||
        payload?.error ||
        payload?.detail ||
        String(responseText || "").trim() ||
        `HTTP ${response.status}`;
      const method = String(options?.method || "GET").toUpperCase();
      const error = new Error(
        `Request failed (${response.status}) for ${method} ${url}: ${details}`
      );
      error.statusCode = response.status;
      error.payload = payload;
      error.responseText = responseText;
      error.requestUrl = url;
      error.requestMethod = method;
      throw error;
    }
    return payload;
  }

  async requestBasicAudienceToken(audience = "NadeoLiveServices") {
    if (!this.dediLogin || !this.dediPassword) {
      throw new Error("Dedicated login/password missing for basic Nadeo auth.");
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
    const nextAccessToken = String(payload?.accessToken || "").trim();
    const nextRefreshToken = String(payload?.refreshToken || "").trim();
    if (!nextAccessToken) {
      throw new Error("Nadeo basic authentication response did not include accessToken.");
    }
    this.accessToken = nextAccessToken;
    this.refreshToken = nextRefreshToken || this.refreshToken;
    this.accessTokenExpiryMs = tokenExpiryMs(this.accessToken);
    return this.accessToken;
  }

  async requestUbisoftAudienceToken({
    ubisoftAccessToken,
    audience = "NadeoLiveServices",
  } = {}) {
    const token = String(ubisoftAccessToken || "").trim();
    if (!token) {
      throw new Error("Ubisoft access token is required to request Nadeo audience token.");
    }

    const payload = await this.requestJson(
      `${this.coreAuthBaseUrl}/v2/authentication/token/ubiservices`,
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `ubi_v1 t=${token}`,
          "user-agent": this.userAgent,
        },
        body: JSON.stringify({ audience }),
      }
    );

    const nextAccessToken = String(payload?.accessToken || "").trim();
    if (!nextAccessToken) {
      throw new Error("Nadeo Ubisoft-auth response did not include accessToken.");
    }
    return payload;
  }

  async createUserScopedClient({
    ubisoftAccessToken,
    audience = "NadeoLiveServices",
  } = {}) {
    const payload = await this.requestUbisoftAudienceToken({
      ubisoftAccessToken,
      audience,
    });

    return new NadeoLiveClient({
      authMode: "token",
      accessToken: String(payload?.accessToken || "").trim(),
      refreshToken: String(payload?.refreshToken || "").trim(),
      userAgent: this.userAgent,
      requestTimeoutMs: this.requestTimeoutMs,
      minRequestGapMs: this.minRequestGapMs,
      coreAuthBaseUrl: this.coreAuthBaseUrl,
      liveApiBaseUrl: this.liveApiBaseUrl,
      logger: this.logger,
    });
  }

  async refreshAccessToken() {
    if (!this.refreshToken) return "";
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
    const nextAccessToken = String(payload?.accessToken || "").trim();
    const nextRefreshToken = String(payload?.refreshToken || "").trim();
    if (!nextAccessToken) {
      throw new Error("Nadeo refresh response did not include accessToken.");
    }
    this.accessToken = nextAccessToken;
    this.refreshToken = nextRefreshToken || this.refreshToken;
    this.accessTokenExpiryMs = tokenExpiryMs(this.accessToken);
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
        return this.requestBasicAudienceToken("NadeoLiveServices");
      }

      if (this.authMode === "token") {
        throw new Error(
          "No valid Nadeo access token available. Provide ALTERED_LIVE_ACCESS_TOKEN and/or ALTERED_LIVE_REFRESH_TOKEN."
        );
      }

      if (this.accessToken) return this.accessToken;
      throw new Error(`Unsupported or unconfigured Nadeo auth mode: ${this.authMode}`);
    })();

    try {
      return await this.pendingTokenPromise;
    } finally {
      this.pendingTokenPromise = null;
    }
  }

  async liveGet(pathname, query = null, { retryOnUnauthorized = true } = {}) {
    const token = await this.ensureAccessToken();
    const url = new URL(`${this.liveApiBaseUrl}/${String(pathname || "").replace(/^\/+/, "")}`);
    if (query && typeof query === "object") {
      for (const [key, value] of Object.entries(query)) {
        if (value === undefined || value === null || value === "") continue;
        url.searchParams.set(key, String(value));
      }
    }

    try {
      return await this.requestJson(url.toString(), {
        method: "GET",
        headers: {
          authorization: `nadeo_v1 t=${token}`,
          "user-agent": this.userAgent,
        },
      });
    } catch (error) {
      if (retryOnUnauthorized && Number(error?.statusCode || 0) === 401) {
        this.logger.warn("[altered-live] access token unauthorized, forcing token refresh.");
        await this.ensureAccessToken({ forceRefresh: true });
        return this.liveGet(pathname, query, { retryOnUnauthorized: false });
      }
      throw error;
    }
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
    const safeBucketType = String(bucketType || "map").trim().toLowerCase() || "map";
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

  async getMapsByUidList(mapUids = [], { onChunk } = {}) {
    const normalized = [...new Set(mapUids.map((value) => String(value || "").trim()).filter(Boolean))];
    if (!normalized.length) return [];
    const results = [];
    const chunks = chunk(normalized, 100);
    for (let index = 0; index < chunks.length; index += 1) {
      const part = chunks[index];
      const payload = await this.liveGet("map/get-multiple", {
        mapUidList: part.join(","),
      });
      if (Array.isArray(payload?.mapList)) {
        results.push(...payload.mapList);
      }
      if (typeof onChunk === "function") {
        onChunk({
          index: index + 1,
          total: chunks.length,
          chunkSize: part.length,
          requestedCount: normalized.length,
          firstUid: part[0] || "",
          lastUid: part[part.length - 1] || "",
          loadedCount: results.length,
        });
      }
    }
    return results;
  }
}

export { NadeoLiveClient };
