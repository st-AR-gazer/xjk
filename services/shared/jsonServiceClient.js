import { normalizeBaseUrl } from "./valueUtils.js";

function normalizeRelativePath(_baseUrl, path) {
  return String(path || "").replace(/^\/+/, "");
}

function normalizeVersionedApiPath(baseUrl, path, version = "v1") {
  const safePath = normalizeRelativePath(baseUrl, path);
  if (!safePath) return "";
  const versionPattern = new RegExp(`^${version}(?:/|$)`, "i");
  if (new RegExp(`/${version}$`, "i").test(String(baseUrl || ""))) {
    return safePath.replace(versionPattern, "");
  }
  return versionPattern.test(safePath) ? safePath : `${version}/${safePath}`;
}

class JsonServiceClient {
  constructor({
    baseUrl = "",
    timeoutMs = 15000,
    logger = console,
    logLabel = "json-service-client",
    notConfiguredMessage = "Service base URL is not configured.",
    requestFailedMessage = "Service request failed.",
    pathNormalizer = normalizeRelativePath,
  } = {}) {
    this.baseUrl = normalizeBaseUrl(baseUrl);
    this.timeoutMs = Math.max(1000, Number(timeoutMs) || 15000);
    this.logger = logger;
    this.logLabel = String(logLabel || "json-service-client");
    this.notConfiguredMessage = String(notConfiguredMessage || "Service base URL is not configured.");
    this.requestFailedMessage = String(requestFailedMessage || "Service request failed.");
    this.pathNormalizer = pathNormalizer;
  }

  isConfigured() {
    return Boolean(this.baseUrl);
  }

  buildHeaders({ body } = {}) {
    return body === undefined ? {} : { "content-type": "application/json" };
  }

  buildUrl(path) {
    return `${this.baseUrl}/${this.pathNormalizer(this.baseUrl, path)}`;
  }

  async request(path, { method = "GET", body } = {}) {
    if (!this.isConfigured()) return { ok: false, status: 0, error: this.notConfiguredMessage };

    const url = this.buildUrl(path);
    try {
      const response = await fetch(url, {
        method,
        headers: this.buildHeaders({ body }),
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
      return { ok: true, status: response.status, data: payload };
    } catch (error) {
      const message = error?.message || this.requestFailedMessage;
      this.logger.warn(`[${this.logLabel}] ${method} ${url} failed: ${message}`);
      return { ok: false, status: 0, error: message };
    }
  }
}

export { JsonServiceClient, normalizeRelativePath, normalizeVersionedApiPath };
