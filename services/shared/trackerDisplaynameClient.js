import { normalizePossibleAccountId as defaultAccountIdNormalizer } from "./displayNameResolution.js";
import { JsonServiceClient, normalizeVersionedApiPath } from "./jsonServiceClient.js";

class TrackerDisplaynameClient extends JsonServiceClient {
  constructor({
    baseUrl = "",
    timeoutMs = 15000,
    logger = console,
    accountIdNormalizer = defaultAccountIdNormalizer,
    logLabel = "shared-tracker-displayname-client",
    defaultResolveReason = "shared-priority",
  } = {}) {
    super({
      baseUrl,
      timeoutMs,
      logger,
      logLabel,
      notConfiguredMessage: "Tracker displayname base URL is not configured.",
      requestFailedMessage: "Tracker displayname request failed.",
      pathNormalizer: normalizeVersionedApiPath,
    });
    this.accountIdNormalizer = accountIdNormalizer;
    this.defaultResolveReason = String(defaultResolveReason || "shared-priority");
  }

  normalizeAccountIds(values = []) {
    return [...new Set((Array.isArray(values) ? values : []).map(this.accountIdNormalizer).filter(Boolean))];
  }

  async getStatus() {
    return this.request("status");
  }

  async updateConfig(payload = {}) {
    return this.request("config", {
      method: "POST",
      body: payload,
    });
  }

  async enqueueAccountIds(accountIds = [], { front = false } = {}) {
    return this.request("accounts/enqueue", {
      method: "POST",
      body: {
        accountIds: this.normalizeAccountIds(accountIds),
        front: Boolean(front),
      },
    });
  }

  async resolveAccountIds(accountIds = [], { front = true, reason = this.defaultResolveReason } = {}) {
    return this.request("display-names/resolve", {
      method: "POST",
      body: {
        accountIds: this.normalizeAccountIds(accountIds),
        front: Boolean(front),
        reason,
      },
    });
  }

  async runSync({ accountIds = [], forceCandidates = false, prioritizeAccountIds = true } = {}) {
    return this.request("sync/run-now", {
      method: "POST",
      body: {
        accountIds: this.normalizeAccountIds(accountIds),
        forceCandidates: Boolean(forceCandidates),
        prioritizeAccountIds: Boolean(prioritizeAccountIds),
      },
    });
  }
}

export { TrackerDisplaynameClient };
