import { normalizePossibleAccountId as defaultAccountIdNormalizer } from "./displayNameResolution.js";
import { JsonServiceClient } from "./jsonServiceClient.js";

class AggregatorClient extends JsonServiceClient {
  constructor({
    baseUrl = "",
    token = "",
    timeoutMs = 15000,
    logger = console,
    accountIdNormalizer = defaultAccountIdNormalizer,
    logLabel = "shared-aggregator-client",
    defaultIngestSource = "xjk-shared-displayname",
    defaultProjectKey = "xjk-shared-displayname",
    defaultProjectName = "XJK Shared Displayname",
  } = {}) {
    super({
      baseUrl,
      timeoutMs,
      logger,
      logLabel,
      notConfiguredMessage: "Aggregator base URL is not configured.",
      requestFailedMessage: "Aggregator request failed.",
    });
    this.token = String(token || "").trim();
    this.accountIdNormalizer = accountIdNormalizer;
    this.defaultIngestSource = String(defaultIngestSource || "xjk-shared-displayname");
    this.defaultProjectKey = String(defaultProjectKey || "xjk-shared-displayname");
    this.defaultProjectName = String(defaultProjectName || "XJK Shared Displayname");
  }

  normalizeAccountIds(values = []) {
    return [...new Set((Array.isArray(values) ? values : []).map(this.accountIdNormalizer).filter(Boolean))];
  }

  buildHeaders({ hasBody = false, body } = {}) {
    const headers = {};
    if (hasBody || body !== undefined) headers["content-type"] = "application/json";
    if (this.token) {
      headers.authorization = `Bearer ${this.token}`;
      headers["x-ingest-token"] = this.token;
    }
    return headers;
  }

  async getDisplayNames(accountIds = []) {
    const normalized = this.normalizeAccountIds(accountIds);
    if (!normalized.length) {
      return {
        ok: true,
        status: 200,
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
      source = this.defaultIngestSource,
      projectKey = this.defaultProjectKey,
      projectName = this.defaultProjectName,
      observedAt = new Date().toISOString(),
    } = {}
  ) {
    const map = namesByAccountId && typeof namesByAccountId === "object" ? namesByAccountId : {};
    const payloadMap = {};
    for (const [rawAccountId, rawDisplayName] of Object.entries(map)) {
      const accountId = this.accountIdNormalizer(rawAccountId);
      const displayName = String(rawDisplayName || "").trim();
      if (!accountId || !displayName) continue;
      if (this.accountIdNormalizer(displayName) === accountId) continue;
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
        projectKey: String(projectKey || "").trim() || this.defaultProjectKey,
        projectName: String(projectName || "").trim() || this.defaultProjectName,
        sourceLabel: String(source || "").trim() || this.defaultIngestSource,
        observedAt,
        namesByAccountId: payloadMap,
      },
    });
  }
}

export { AggregatorClient };
