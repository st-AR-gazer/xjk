import fs from "node:fs";
import { ensureParentDirectorySync } from "../../shared/fsUtils.js";
import {
  isTokenFresh,
  jwtExpiryMs,
  NADEO_CORE_BASE_URL,
  NADEO_LIVE_SERVICES_AUDIENCE as AUDIENCE_LIVE,
  NADEO_LIVE_TOKEN_BASE_URL,
  NADEO_SERVICES_AUDIENCE as AUDIENCE_CORE,
  NadeoHttpError,
  NadeoRequestRuntime,
  NadeoTokenRequestCoordinator,
  normalizeBaseUrl,
  normalizeNadeoRequestPolicy,
  requestNadeoBasicToken,
} from "../../shared/nadeoClientRuntime.js";
import { toTextOrFallback as asText } from "../../shared/valueUtils.js";

class NadeoClient {
  constructor(config = {}) {
    this.authMode = asText(config.authMode, "basic").toLowerCase();
    this.dediLogin = asText(config.dediLogin);
    this.dediPassword = asText(config.dediPassword);
    this.servicesToken = asText(config.servicesToken);
    this.liveServicesToken = asText(config.liveServicesToken);
    this.tokenCacheFile = asText(config.tokenCacheFile);
    Object.assign(
      this,
      normalizeNadeoRequestPolicy({
        requestTimeoutMs: config.requestTimeoutMs,
        defaultRequestTimeoutMs: 15000,
        minRequestGapMs: Number(config.minRequestGapMs) || 1000,
        globalThrottleFile: config.globalThrottleFile,
        globalMinRequestGapMs: config.globalMinRequestGapMs,
      })
    );
    this.userAgent = asText(config.userAgent, "cotd.xjk.yt public service");
    this.coreBaseUrl = normalizeBaseUrl(config.coreBaseUrl, NADEO_CORE_BASE_URL);
    this.liveBaseUrl = normalizeBaseUrl(config.liveBaseUrl, NADEO_LIVE_TOKEN_BASE_URL);
    this.requestRuntime = new NadeoRequestRuntime({
      fetchImpl: config.fetchImpl,
      requestTimeoutMs: this.requestTimeoutMs,
      minRequestGapMs: this.minRequestGapMs,
      globalThrottleFile: this.globalThrottleFile,
      globalMinRequestGapMs: this.globalMinRequestGapMs,
      defaultThrottleLabel: "cotd-nadeo",
    });
    this.tokenRequests = new NadeoTokenRequestCoordinator();
    this.tokenCache = new Map();
    this.loadTokenCache();
  }

  isConfigured() {
    return this.canUseAudience(AUDIENCE_CORE) && this.canUseAudience(AUDIENCE_LIVE);
  }

  canUseAudience(audience) {
    if (this.getDirectToken(audience)) return true;
    return Boolean(this.dediLogin && this.dediPassword);
  }

  getDirectToken(audience) {
    if (audience === AUDIENCE_CORE) return this.servicesToken;
    if (audience === AUDIENCE_LIVE) return this.liveServicesToken;
    return "";
  }

  status() {
    return {
      configured: this.isConfigured(),
      authMode: this.authMode,
      servicesConfigured: this.canUseAudience(AUDIENCE_CORE),
      liveServicesConfigured: this.canUseAudience(AUDIENCE_LIVE),
      userAgent: this.userAgent,
      tokenCacheFileConfigured: Boolean(this.tokenCacheFile),
      requestTimeoutMs: this.requestTimeoutMs,
      minRequestGapMs: this.minRequestGapMs,
      globalThrottleConfigured: Boolean(this.globalThrottleFile && this.globalMinRequestGapMs > 0),
    };
  }

  loadTokenCache() {
    if (!this.tokenCacheFile || !fs.existsSync(this.tokenCacheFile)) return;
    try {
      const payload = JSON.parse(fs.readFileSync(this.tokenCacheFile, "utf8"));
      const tokens = payload?.tokens || {};
      for (const audience of [AUDIENCE_CORE, AUDIENCE_LIVE]) {
        const accessToken = asText(tokens?.[audience]?.accessToken);
        if (accessToken) {
          this.tokenCache.set(audience, {
            accessToken,
            expiresAt: Number(tokens[audience].expiresAt || jwtExpiryMs(accessToken) || 0),
          });
        }
      }
    } catch {
      // Token cache is an optimization; invalid cache should not block startup.
    }
  }

  saveTokenCache() {
    if (!this.tokenCacheFile) return;
    const tokens = {};
    for (const [audience, value] of this.tokenCache.entries()) {
      tokens[audience] = value;
    }
    ensureParentDirectorySync(this.tokenCacheFile);
    fs.writeFileSync(
      this.tokenCacheFile,
      `${JSON.stringify({ tokens, savedAt: new Date().toISOString() }, null, 2)}\n`,
      "utf8"
    );
  }

  isTokenFresh(token, expiresAt = 0, { minLifetimeSeconds = 45 } = {}) {
    return isTokenFresh(token, expiresAt, { minLifetimeSeconds });
  }

  async waitForRateSlot(label = "cotd-nadeo") {
    return this.requestRuntime.waitForRateSlot(label);
  }

  async requestBasicAudienceToken(audience) {
    if (!this.dediLogin || !this.dediPassword) {
      throw new Error(`COTD_NADEO_DEDI_LOGIN/COTD_NADEO_DEDI_PASSWORD are required for ${audience}.`);
    }

    const { accessToken, expiresAt } = await requestNadeoBasicToken({
      requestJson: (url, options) => this.requestJsonRaw(url, options),
      coreBaseUrl: this.coreBaseUrl,
      login: this.dediLogin,
      password: this.dediPassword,
      audience,
      userAgent: this.userAgent,
      throttleLabel: `cotd-auth-${audience}`,
      missingAccessTokenMessage: `Nadeo ${audience} basic auth did not return accessToken.`,
    });
    const entry = {
      accessToken,
      expiresAt,
    };
    this.tokenCache.set(audience, entry);
    this.saveTokenCache();
    return accessToken;
  }

  async ensureAudienceToken(audience) {
    const directToken = this.getDirectToken(audience);
    if (this.isTokenFresh(directToken)) return directToken;

    const cached = this.tokenCache.get(audience);
    if (cached && this.isTokenFresh(cached.accessToken, cached.expiresAt)) {
      return cached.accessToken;
    }

    if (!this.dediLogin || !this.dediPassword) {
      throw new Error(`Nadeo ${audience} token is not configured.`);
    }

    return this.tokenRequests.run(audience, () => this.requestBasicAudienceToken(audience));
  }

  async requestJsonRaw(url, { method = "GET", headers = {}, body, throttleLabel = "cotd-nadeo" } = {}) {
    return this.requestRuntime.requestJson(url, {
      method,
      headers,
      body,
      throttleLabel,
      formatError: ({ status, details }) => `Nadeo request failed with HTTP ${status}: ${details}`,
    });
  }

  async requestJson(url, { audience, throttleLabel = "cotd-nadeo" } = {}) {
    const token = await this.ensureAudienceToken(audience);
    return this.requestJsonRaw(url, {
      headers: {
        authorization: `nadeo_v1 t=${token}`,
        "user-agent": this.userAgent,
      },
      throttleLabel,
    });
  }

  async requestBinary(url, { audience, throttleLabel = "cotd-nadeo-file" } = {}) {
    const token = await this.ensureAudienceToken(audience);
    return this.requestRuntime.requestBinary(url, {
      headers: {
        authorization: `nadeo_v1 t=${token}`,
        "user-agent": this.userAgent,
      },
      throttleLabel,
    });
  }

  async fetchTotdMonths({ length = 1, offset = 0, royal = false } = {}) {
    const url = new URL(`${this.liveBaseUrl}/campaign/month`);
    url.searchParams.set("length", String(Math.max(1, Math.min(36, Number(length) || 1))));
    url.searchParams.set("offset", String(Math.max(0, Number(offset) || 0)));
    url.searchParams.set("royal", royal ? "true" : "false");
    return this.requestJson(url.toString(), {
      audience: AUDIENCE_LIVE,
      throttleLabel: "cotd-live-totd-month",
    });
  }

  async fetchMapInfosByUids(mapUids = []) {
    const uids = [...new Set(mapUids.map(asText).filter(Boolean))];
    const out = [];
    for (let index = 0; index < uids.length; index += 200) {
      const batch = uids.slice(index, index + 200);
      const url = new URL(`${this.coreBaseUrl}/maps/by-uid/`);
      url.searchParams.set("mapUidList", batch.join(","));
      const payload = await this.requestJson(url.toString(), {
        audience: AUDIENCE_CORE,
        throttleLabel: "cotd-core-map-info",
      });
      if (Array.isArray(payload)) {
        out.push(...payload);
      }
    }
    return out;
  }

  async downloadMapFile(fileUrl) {
    return this.requestBinary(fileUrl, {
      audience: AUDIENCE_CORE,
      throttleLabel: "cotd-core-map-file",
    });
  }
}

function createNadeoClient(config) {
  return new NadeoClient(config);
}

export { AUDIENCE_CORE, AUDIENCE_LIVE, NadeoClient, NadeoHttpError, createNadeoClient };
