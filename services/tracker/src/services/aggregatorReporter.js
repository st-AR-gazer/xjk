function normalizeBaseUrl(value) {
  const raw = String(value || "").trim();
  if (!raw) return "";
  return raw.endsWith("/") ? raw.slice(0, -1) : raw;
}

class AggregatorReporter {
  constructor({
    enabled = false,
    baseUrl = "",
    token = "",
    projectKey = "tracker-default",
    projectName = "Tracker Instance",
    sourceLabel = "tracker",
    instanceId = "tracker-instance",
    instanceName = "Tracker Instance",
    timeoutMs = 5000,
    logger = console,
  } = {}) {
    this.enabled = Boolean(enabled);
    this.baseUrl = normalizeBaseUrl(baseUrl);
    this.token = String(token || "").trim();
    this.projectKey = String(projectKey || "tracker-default").trim() || "tracker-default";
    this.projectName = String(projectName || "Tracker Instance").trim() || "Tracker Instance";
    this.sourceLabel = String(sourceLabel || "tracker").trim() || "tracker";
    this.instanceId = String(instanceId || "tracker-instance").trim() || "tracker-instance";
    this.instanceName = String(instanceName || "Tracker Instance").trim() || "Tracker Instance";
    this.timeoutMs = Math.max(1000, Number(timeoutMs) || 5000);
    this.logger = logger;
  }

  get isReady() {
    return this.enabled && Boolean(this.baseUrl);
  }

  buildHeaders() {
    const headers = {
      "content-type": "application/json",
    };
    if (this.token) {
      headers["x-ingest-token"] = this.token;
    }
    return headers;
  }

  getInstancePayload() {
    return {
      projectKey: this.projectKey,
      projectName: this.projectName,
      sourceLabel: this.sourceLabel,
      instanceId: this.instanceId,
      instanceName: this.instanceName,
    };
  }

  async postIngest(path, payload) {
    const endpoint = `${this.baseUrl}/ingest/${path.replace(/^\/+/, "")}`;
    try {
      const response = await fetch(endpoint, {
        method: "POST",
        headers: this.buildHeaders(),
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(this.timeoutMs),
      });
      if (!response.ok) {
        const bodyText = await response.text();
        this.logger.warn(
          `[tracker-aggregator] ${path} failed status=${response.status} body=${bodyText.slice(0, 240)}`
        );
        return {
          ok: false,
          status: response.status,
          body: bodyText,
        };
      }
      return {
        ok: true,
        response: await response.json().catch(() => null),
      };
    } catch (error) {
      this.logger.warn(`[tracker-aggregator] ${path} error: ${error?.message || error}`);
      return {
        ok: false,
        error: error?.message || String(error),
      };
    }
  }

  async registerInstance({ status = "online", meta = null } = {}) {
    if (!this.isReady) return { skipped: true, reason: "disabled-or-missing-url" };
    return this.postIngest("instance/register", {
      ...this.getInstancePayload(),
      status,
      meta,
    });
  }

  async heartbeatInstance({ status = "online", meta = null } = {}) {
    if (!this.isReady) return { skipped: true, reason: "disabled-or-missing-url" };
    return this.postIngest("instance/heartbeat", {
      ...this.getInstancePayload(),
      status,
      meta,
    });
  }

  async reportTrackerRun({ run, checks = [] } = {}) {
    if (!this.isReady) return { skipped: true, reason: "disabled-or-missing-url" };
    if (!run || typeof run !== "object") return { skipped: true, reason: "missing-run" };

    const payload = {
      projectKey: this.projectKey,
      projectName: this.projectName,
      sourceLabel: this.sourceLabel,
      run: {
        provider: run.provider || "unknown",
        reason: run.note || "scheduled",
        note: run.note || "",
        startedAt: run.startedAt || new Date().toISOString(),
        finishedAt: run.finishedAt || new Date().toISOString(),
        mapsConsidered: Number(run.mapsConsidered || 0),
        mapsChecked: Number(run.mapsChecked || 0),
        wrChanges: Number(run.wrChanges || 0),
      },
      checks: Array.isArray(checks)
        ? checks.map((item) => ({
            mapUid: String(item.mapUid || item.uid || "").trim(),
            mapName: String(item.mapName || item.name || "").trim() || undefined,
            checkedAt: item.checkedAt || null,
            changed: Boolean(item.changed),
            oldWrTime: Number(item.oldWrTime || 0),
            newWrTime: Number(item.newWrTime || 0),
            oldHolder: String(item.oldHolder || ""),
            newHolder: String(item.newHolder || ""),
            oldHolderAccountId: String(item.oldHolderAccountId || ""),
            newHolderAccountId: String(item.newHolderAccountId || ""),
            accountIds: Array.isArray(item.accountIds)
              ? item.accountIds
                  .map((value) => String(value || "").trim())
                  .filter(Boolean)
              : [],
            source: String(item.source || ""),
            note: String(item.note || ""),
          }))
        : [],
    };

    return this.postIngest("tracker-run", payload);
  }
}

export { AggregatorReporter };
