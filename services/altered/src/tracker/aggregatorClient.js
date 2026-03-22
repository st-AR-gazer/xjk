function trimTrailingSlash(value) {
  return String(value || "")
    .trim()
    .replace(/\/+$/, "");
}

function normalizeAccountId(value) {
  const accountId = String(value || "").trim().toLowerCase();
  if (!accountId) return "";
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(accountId)) {
    return accountId;
  }
  return "";
}

class AggregatorClient {
  constructor({ baseUrl = "", token = "", timeoutMs = 15000, logger = console } = {}) {
    this.baseUrl = trimTrailingSlash(baseUrl);
    this.token = String(token || "").trim();
    this.timeoutMs = Math.max(1000, Number(timeoutMs) || 15000);
    this.logger = logger;
  }

  isConfigured() {
    return Boolean(this.baseUrl);
  }

  buildHeaders({ hasBody = false } = {}) {
    const headers = {};
    if (hasBody) headers["content-type"] = "application/json";
    if (this.token) {
      headers.authorization = `Bearer ${this.token}`;
      headers["x-ingest-token"] = this.token;
    }
    return headers;
  }

  async request(path, { method = "GET", body } = {}) {
    if (!this.isConfigured()) {
      return {
        ok: false,
        status: 0,
        error: "Aggregator base URL is not configured.",
      };
    }
    const safePath = String(path || "").replace(/^\/+/, "");
    const url = `${this.baseUrl}/${safePath}`;
    try {
      const response = await fetch(url, {
        method,
        headers: this.buildHeaders({ hasBody: body !== undefined }),
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: AbortSignal.timeout(this.timeoutMs),
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok) {
        return {
          ok: false,
          status: response.status,
          error: payload?.error || payload?.message || `Request failed (${response.status}).`,
        };
      }
      return {
        ok: true,
        status: response.status,
        data: payload,
      };
    } catch (error) {
      const message = error?.message || "Aggregator request failed.";
      this.logger.warn(`[altered-aggregator-client] ${method} ${url} failed: ${message}`);
      return {
        ok: false,
        status: 0,
        error: message,
      };
    }
  }

  async getDisplayNames(accountIds = []) {
    const normalized = [...new Set((Array.isArray(accountIds) ? accountIds : []).map(normalizeAccountId).filter(Boolean))];
    if (!normalized.length) {
      return {
        ok: true,
        data: {
          names: [],
          count: 0,
        },
      };
    }
    const query = normalized.map((accountId) => `accountId[]=${encodeURIComponent(accountId)}`).join("&");
    return this.request(`display-names?${query}`);
  }

  async ingestDisplayNames(
    namesByAccountId = {},
    {
      source = "altered-mapper-sync",
      projectKey = "altered-mapper-displayname",
      projectName = "Altered Mapper Displayname",
      observedAt = new Date().toISOString(),
    } = {}
  ) {
    const map = namesByAccountId && typeof namesByAccountId === "object" ? namesByAccountId : {};
    const payloadMap = {};
    for (const [rawAccountId, rawDisplayName] of Object.entries(map)) {
      const accountId = normalizeAccountId(rawAccountId);
      const displayName = String(rawDisplayName || "").trim();
      if (!accountId || !displayName) continue;
      if (normalizeAccountId(displayName) === accountId) continue;
      payloadMap[accountId] = displayName;
    }

    if (!Object.keys(payloadMap).length) {
      return {
        ok: true,
        status: 200,
        data: {
          ok: true,
          ingest: {
            accepted: 0,
            inserted: 0,
            updated: 0,
            unchanged: 0,
            skipped: true,
          },
        },
      };
    }

    return this.request("ingest/display-names", {
      method: "POST",
      body: {
        projectKey: String(projectKey || "").trim() || "altered-mapper-displayname",
        projectName: String(projectName || "").trim() || "Altered Mapper Displayname",
        sourceLabel: String(source || "").trim() || "altered-mapper-sync",
        observedAt,
        namesByAccountId: payloadMap,
      },
    });
  }
}

export { AggregatorClient };
