import { waitForGlobalNadeoSlot } from "../../../shared/nadeoGlobalThrottle.js";
import { sanitizeResolvedDisplayName } from "../../../shared/displayNameResolution.js";

function clampInt(value, { min = 0, max = Number.MAX_SAFE_INTEGER, fallback = min } = {}) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(min, Math.min(max, Math.floor(parsed)));
}

function chunk(values, size) {
  const list = Array.isArray(values) ? values : [];
  const safeSize = Math.max(1, Number(size) || 1);
  const out = [];
  for (let index = 0; index < list.length; index += safeSize) {
    out.push(list.slice(index, index + safeSize));
  }
  return out;
}

function normalizeBaseUrl(value, fallback = "") {
  const text = String(value || "").trim() || String(fallback || "").trim();
  return text.replace(/\/+$/, "");
}

function normalizeAccountId(value) {
  const accountId = String(value || "").trim().toLowerCase();
  if (!accountId) return "";
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(accountId)) {
    return accountId;
  }
  return "";
}

class TrackmaniaOAuthClient {
  constructor({
    enabled = true,
    clientId = "",
    clientSecret = "",
    tokenUrl = "https://api.trackmania.com/api/access_token",
    apiBaseUrl = "https://api.trackmania.com",
    scope = "clubs",
    userAgent = "altered project by ar, contact @ar___ on discord",
    requestTimeoutMs = 15000,
    minRequestGapMs = 5000,
    globalThrottleFile = "",
    globalMinRequestGapMs = 0,
    onHttpEvent = null,
    logger = console,
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
    this.globalThrottleFile = String(
      globalThrottleFile || process.env.NADEO_GLOBAL_THROTTLE_FILE || ""
    ).trim();
    this.globalMinRequestGapMs = Math.max(
      0,
      Number(globalMinRequestGapMs || process.env.NADEO_GLOBAL_MIN_REQUEST_GAP_MS || 0) || 0
    );
    this.onHttpEvent = typeof onHttpEvent === "function" ? onHttpEvent : null;
    this.logger = logger;

    this.accessToken = "";
    this.expiresAtMs = 0;
    this.pendingTokenPromise = null;
    this.nextRequestAtMs = 0;
  }

  emitHttpEvent(sample = {}) {
    if (typeof this.onHttpEvent !== "function") return;
    try {
      this.onHttpEvent(sample);
    } catch {
      // Ignore telemetry callback failures.
    }
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
    if (!this.accessToken) return false;
    return this.expiresAtMs - Date.now() > minLifetimeSeconds * 1000;
  }

  async requestJson(url, options = {}) {
    const startedAt = Date.now();
    const method = String(options?.method || "GET").toUpperCase();
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
    const requestBody =
      options?.body === null || options?.body === undefined
        ? ""
        : typeof options.body === "string"
          ? options.body
          : options.body instanceof URLSearchParams
            ? options.body.toString()
            : "";
    const requestBytes = requestBody ? Buffer.byteLength(requestBody, "utf8") : 0;

    if (this.minRequestGapMs > 0) {
      const waitMs = Math.max(0, this.nextRequestAtMs - Date.now());
      if (waitMs > 0) {
        await new Promise((resolve) => setTimeout(resolve, waitMs));
      }
      this.nextRequestAtMs = Date.now() + this.minRequestGapMs;
    }
    const sharedGapMs = Math.max(this.minRequestGapMs, this.globalMinRequestGapMs);
    if (sharedGapMs > 0) {
      await waitForGlobalNadeoSlot({
        stateFile: this.globalThrottleFile,
        minGapMs: sharedGapMs,
        label: "tracker-displayname-oauth",
      });
    }

    let response;
    try {
      response = await fetch(url, {
        ...options,
        signal: AbortSignal.timeout(this.requestTimeoutMs),
      });
    } catch (error) {
      this.emitHttpEvent({
        direction: "outgoing",
        component: "trackmania-oauth",
        service: "tracker-displayname",
        method,
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

    const responseText = await response.text();
    const responseBytes = responseText ? Buffer.byteLength(responseText, "utf8") : 0;
    let payload = null;
    if (responseText) {
      try {
        payload = JSON.parse(responseText);
      } catch {
        payload = null;
      }
    }

    this.emitHttpEvent({
      direction: "outgoing",
      component: "trackmania-oauth",
      service: "tracker-displayname",
      method,
      route: targetPath,
      targetHost,
      targetPath,
      statusCode: Number(response.status || 0),
      durationMs: Date.now() - startedAt,
      bytesIn: requestBytes,
      bytesOut: responseBytes,
    });

    if (!response.ok) {
      const details =
        payload?.message ||
        payload?.error ||
        payload?.detail ||
        String(responseText || "").trim() ||
        `HTTP ${response.status}`;
      const method = String(options?.method || "GET").toUpperCase();
      const error = new Error(
        `Trackmania OAuth request failed (${response.status}) for ${method} ${url}: ${details}`
      );
      error.statusCode = response.status;
      error.payload = payload;
      error.responseText = responseText;
      throw error;
    }
    return payload;
  }

  async requestClientCredentialsToken() {
    if (!this.isConfigured()) {
      throw new Error("Trackmania OAuth client is not configured.");
    }

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
    const expiresIn = clampInt(payload?.expires_in, { min: 60, max: 86400, fallback: 3600 });
    if (!accessToken) {
      throw new Error("Trackmania OAuth token response missing access_token.");
    }

    this.accessToken = accessToken;
    this.expiresAtMs = Date.now() + expiresIn * 1000;
    return this.accessToken;
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
    const out = new Map();

    if (payload && typeof payload === "object" && !Array.isArray(payload)) {
      for (const [rawAccountId, rawDisplayName] of Object.entries(payload)) {
        const accountId = normalizeAccountId(rawAccountId);
        const displayName = sanitizeResolvedDisplayName(rawDisplayName, { accountId });
        if (!accountId || !displayName) continue;
        out.set(accountId, displayName);
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
      const accountId = normalizeAccountId(
        row?.accountId ?? row?.account_id ?? row?.id ?? row?.account
      );
      const displayName = sanitizeResolvedDisplayName(
        row?.displayName ?? row?.display_name ?? row?.name ?? row?.value ?? "",
        { accountId }
      );
      if (!accountId || !displayName) continue;
      out.set(accountId, displayName);
    }

    return out;
  }

  async getDisplayNames(accountIds = [], { onChunk } = {}) {
    if (!this.isConfigured()) {
      return { ok: false, error: "Trackmania OAuth client is not configured.", namesByAccountId: {} };
    }

    const uniqueIds = [...new Set((Array.isArray(accountIds) ? accountIds : []).map(normalizeAccountId).filter(Boolean))];
    if (!uniqueIds.length) {
      return { ok: true, namesByAccountId: {}, requested: 0, resolved: 0 };
    }

    const namesByAccountId = {};
    const chunks = chunk(uniqueIds, 50);
    for (let index = 0; index < chunks.length; index += 1) {
      const part = chunks[index];
      const token = await this.ensureAccessToken();
      const url = new URL(`${this.apiBaseUrl}/api/display-names`);
      for (const accountId of part) {
        url.searchParams.append("accountId[]", accountId);
      }

      let payload;
      try {
        payload = await this.requestJson(url.toString(), {
          method: "GET",
          headers: {
            authorization: `Bearer ${token}`,
            "user-agent": this.userAgent,
          },
        });
      } catch (error) {
        if (Number(error?.statusCode || 0) === 401) {
          await this.ensureAccessToken({ forceRefresh: true });
          payload = await this.requestJson(url.toString(), {
            method: "GET",
            headers: {
              authorization: `Bearer ${this.accessToken}`,
              "user-agent": this.userAgent,
            },
          });
        } else {
          throw error;
        }
      }

      const parsed = this.parseDisplayNamePayload(payload);
      for (const [accountId, displayName] of parsed.entries()) {
        namesByAccountId[accountId] = displayName;
      }

      if (typeof onChunk === "function") {
        onChunk({
          index: index + 1,
          total: chunks.length,
          chunkSize: part.length,
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
