import { sanitizeResolvedDisplayName } from "./displayNameResolution.js";
import { ThrottledHttpClientRuntime } from "./httpClientRuntime.js";
import { chunkArray, clampInt, normalizeAccountId, normalizeBaseUrl } from "./valueUtils.js";

class TrackmaniaOAuthClient {
  constructor({
    enabled = true,
    clientId = "",
    clientSecret = "",
    tokenUrl = "https://api.trackmania.com/api/access_token",
    apiBaseUrl = "https://api.trackmania.com",
    scope = "clubs",
    userAgent = "xjk-trackmania-oauth/1.0 (+https://xjk.yt/)",
    requestTimeoutMs = 15000,
    minRequestGapMs = 5000,
    globalThrottleFile = "",
    globalMinRequestGapMs = 0,
    throttleLabel = "xjk-trackmania-oauth",
    telemetryComponent = "trackmania-oauth",
    telemetryService = "",
    onHttpEvent = null,
    logger = console,
    fetchImpl = fetch,
  } = {}) {
    this.enabled = Boolean(enabled);
    this.clientId = String(clientId || "").trim();
    this.clientSecret = String(clientSecret || "").trim();
    this.tokenUrl = normalizeBaseUrl(tokenUrl);
    this.apiBaseUrl = normalizeBaseUrl(apiBaseUrl, "https://api.trackmania.com");
    this.scope = String(scope || "").trim();
    this.userAgent = String(userAgent || "").trim() || "xjk-altered-monitor/1.0 (+https://xjk.yt)";
    this.requestTimeoutMs = Math.max(1000, Number(requestTimeoutMs) || 15000);
    this.minRequestGapMs = Math.max(0, Number(minRequestGapMs) || 0);
    this.globalThrottleFile = String(globalThrottleFile || process.env.NADEO_GLOBAL_THROTTLE_FILE || "").trim();
    this.globalMinRequestGapMs = Math.max(
      0,
      Number(globalMinRequestGapMs || process.env.NADEO_GLOBAL_MIN_REQUEST_GAP_MS || 0) || 0
    );
    this.throttleLabel = String(throttleLabel || "xjk-trackmania-oauth");
    this.telemetryComponent = String(telemetryComponent || "trackmania-oauth");
    this.telemetryService = String(telemetryService || "");
    this.onHttpEvent = typeof onHttpEvent === "function" ? onHttpEvent : null;
    this.logger = logger;
    this.requestRuntime = new ThrottledHttpClientRuntime({
      fetchImpl,
      requestTimeoutMs: this.requestTimeoutMs,
      minRequestGapMs: this.minRequestGapMs,
      globalThrottleFile: this.globalThrottleFile,
      globalMinRequestGapMs: this.globalMinRequestGapMs,
      defaultThrottleLabel: this.throttleLabel,
      telemetryComponent: this.telemetryComponent,
      telemetryService: this.telemetryService,
      onHttpEvent: (sample) => this.emitHttpEvent(sample),
    });

    this.accessToken = "";
    this.expiresAtMs = 0;
    this.pendingTokenPromise = null;
  }

  emitHttpEvent(sample = {}) {
    if (!this.onHttpEvent) return;
    try {
      this.onHttpEvent(sample);
    } catch {}
  }

  setEnabled(enabled = true) {
    this.enabled = Boolean(enabled);
    return this.getStatus();
  }

  isConfigured() {
    return this.enabled && Boolean(this.clientId && this.clientSecret && this.tokenUrl && this.apiBaseUrl);
  }

  getStatus() {
    return {
      enabled: this.enabled,
      configured: this.isConfigured(),
      hasClientId: Boolean(this.clientId),
      hasClientSecret: Boolean(this.clientSecret),
      tokenUrl: this.tokenUrl,
      apiBaseUrl: this.apiBaseUrl,
      scope: this.scope,
      hasAccessToken: Boolean(this.accessToken),
      accessTokenExpiresAt: this.expiresAtMs ? new Date(this.expiresAtMs).toISOString() : null,
    };
  }

  isAccessTokenValid({ minLifetimeSeconds = 30 } = {}) {
    return Boolean(this.accessToken) && this.expiresAtMs - Date.now() > minLifetimeSeconds * 1000;
  }

  buildHttpEvent({ method, targetHost, targetPath, statusCode, startedAt, requestBytes, responseBytes }) {
    return this.requestRuntime.buildHttpEvent(
      {
        method,
        targetHost,
        targetPath,
        requestBytes,
      },
      {
        statusCode,
        startedAt,
        responseBytes,
      }
    );
  }

  async waitForRequestSlot() {
    return this.requestRuntime.waitForRateSlot(this.throttleLabel);
  }

  async requestJson(url, options = {}) {
    return this.requestRuntime.requestJson(url, {
      ...options,
      throttleLabel: this.throttleLabel,
      formatError: ({ status, method, requestUrl, details }) =>
        `Trackmania OAuth request failed (${status}) for ${method} ${requestUrl}: ${details}`,
    });
  }

  async requestClientCredentialsToken() {
    if (!this.isConfigured()) throw new Error("Trackmania OAuth client is not configured.");

    const form = new URLSearchParams();
    form.set("grant_type", "client_credentials");
    if (this.scope) form.set("scope", this.scope);
    form.set("client_id", this.clientId);
    form.set("client_secret", this.clientSecret);

    const basicAuth = Buffer.from(`${this.clientId}:${this.clientSecret}`).toString("base64");
    const payload = await this.requestJson(this.tokenUrl, {
      method: "POST",
      headers: {
        "content-type": "application/x-www-form-urlencoded",
        authorization: `Basic ${basicAuth}`,
        "user-agent": this.userAgent,
      },
      body: form.toString(),
    });

    const accessToken = String(payload?.access_token || "").trim();
    if (!accessToken) throw new Error("Trackmania OAuth token response missing access_token.");
    const expiresIn = clampInt(payload?.expires_in, { min: 60, max: 86400, fallback: 3600 });
    this.accessToken = accessToken;
    this.expiresAtMs = Date.now() + expiresIn * 1000;
    return accessToken;
  }

  async ensureAccessToken({ forceRefresh = false } = {}) {
    if (!forceRefresh && this.isAccessTokenValid()) return this.accessToken;
    if (this.pendingTokenPromise) return this.pendingTokenPromise;

    this.pendingTokenPromise = this.requestClientCredentialsToken();
    try {
      return await this.pendingTokenPromise;
    } finally {
      this.pendingTokenPromise = null;
    }
  }

  parseDisplayNamePayload(payload) {
    const names = new Map();
    if (payload && typeof payload === "object" && !Array.isArray(payload)) {
      for (const [rawAccountId, rawDisplayName] of Object.entries(payload)) {
        const accountId = normalizeAccountId(rawAccountId);
        const displayName = sanitizeResolvedDisplayName(rawDisplayName, { accountId });
        if (accountId && displayName) names.set(accountId, displayName);
      }
    }

    const rows = Array.isArray(payload)
      ? payload
      : Array.isArray(payload?.displayNames)
        ? payload.displayNames
        : Array.isArray(payload?.items)
          ? payload.items
          : [];
    for (const row of rows) {
      const accountId = normalizeAccountId(row?.accountId ?? row?.account_id ?? row?.id ?? row?.account);
      const displayName = sanitizeResolvedDisplayName(
        row?.displayName ?? row?.display_name ?? row?.name ?? row?.value ?? "",
        { accountId }
      );
      if (accountId && displayName) names.set(accountId, displayName);
    }
    return names;
  }

  async getDisplayNames(accountIds = [], { onChunk } = {}) {
    if (!this.isConfigured()) {
      return { ok: false, error: "Trackmania OAuth client is not configured.", namesByAccountId: {} };
    }

    const uniqueIds = [
      ...new Set((Array.isArray(accountIds) ? accountIds : []).map(normalizeAccountId).filter(Boolean)),
    ];
    if (!uniqueIds.length) return { ok: true, namesByAccountId: {}, requested: 0, resolved: 0 };

    const namesByAccountId = {};
    const batches = chunkArray(uniqueIds, 50);
    for (let index = 0; index < batches.length; index += 1) {
      const batch = batches[index];
      const token = await this.ensureAccessToken();
      const url = new URL(`${this.apiBaseUrl}/api/display-names`);
      for (const accountId of batch) url.searchParams.append("accountId[]", accountId);

      let payload;
      try {
        payload = await this.requestJson(url.toString(), {
          method: "GET",
          headers: { authorization: `Bearer ${token}`, "user-agent": this.userAgent },
        });
      } catch (error) {
        if (Number(error?.statusCode || 0) !== 401) throw error;
        await this.ensureAccessToken({ forceRefresh: true });
        payload = await this.requestJson(url.toString(), {
          method: "GET",
          headers: { authorization: `Bearer ${this.accessToken}`, "user-agent": this.userAgent },
        });
      }

      for (const [accountId, displayName] of this.parseDisplayNamePayload(payload)) {
        namesByAccountId[accountId] = displayName;
      }
      if (typeof onChunk === "function") {
        onChunk({
          index: index + 1,
          total: batches.length,
          chunkSize: batch.length,
          requested: uniqueIds.length,
          resolved: Object.keys(namesByAccountId).length,
        });
      }
    }

    return {
      ok: true,
      namesByAccountId,
      requested: uniqueIds.length,
      resolved: Object.keys(namesByAccountId).length,
    };
  }
}

export { TrackmaniaOAuthClient, normalizeAccountId };
