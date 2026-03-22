function trimTrailingSlash(value) {
  return String(value || "")
    .trim()
    .replace(/\/+$/, "");
}

function normalizeApiPath(baseUrl, path) {
  const safePath = String(path || "").replace(/^\/+/, "");
  if (!safePath) return "";
  if (/\/v1$/i.test(String(baseUrl || ""))) {
    return safePath.replace(/^v1\/+/i, "");
  }
  if (/^v1(\/|$)/i.test(safePath)) {
    return safePath;
  }
  return `v1/${safePath}`;
}

class TrackerClubClient {
  constructor({ baseUrl = "", timeoutMs = 15000, logger = console } = {}) {
    this.baseUrl = trimTrailingSlash(baseUrl);
    this.timeoutMs = Math.max(1000, Number(timeoutMs) || 15000);
    this.logger = logger;
  }

  isConfigured() {
    return Boolean(this.baseUrl);
  }

  async request(path, { method = "GET", body } = {}) {
    if (!this.isConfigured()) {
      return {
        ok: false,
        status: 0,
        error: "Tracker club base URL is not configured.",
      };
    }

    const safePath = normalizeApiPath(this.baseUrl, path);
    const url = `${this.baseUrl}/${safePath}`;
    try {
      const response = await fetch(url, {
        method,
        headers: body === undefined ? {} : { "content-type": "application/json" },
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
      const message = error?.message || "Tracker club request failed.";
      this.logger.warn(`[altered-club-client] ${method} ${url} failed: ${message}`);
      return {
        ok: false,
        status: 0,
        error: message,
      };
    }
  }

  async getStatus() {
    return this.request("status");
  }

  async ingestSnapshot(snapshot = {}) {
    return this.request("snapshot/ingest", {
      method: "POST",
      body: snapshot,
    });
  }
}

export { TrackerClubClient };
