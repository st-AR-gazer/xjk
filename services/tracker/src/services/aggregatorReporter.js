function normalizeBaseUrl(value) {
  const raw = String(value || "").trim();
  if (!raw) return "";
  return raw.endsWith("/") ? raw.slice(0, -1) : raw;
}

function normalizeDirection(value) {
  const raw = String(value || "").trim().toLowerCase();
  return raw === "incoming" ? "incoming" : "outgoing";
}

function normalizeMethod(value) {
  const raw = String(value || "").trim().toUpperCase();
  return (raw || "GET").slice(0, 12);
}

function normalizePath(value, fallback = "/") {
  const raw = String(value || "").trim();
  if (!raw) return fallback;
  if (raw.startsWith("/")) return raw.slice(0, 300);
  return `/${raw}`.slice(0, 300);
}

function normalizeHost(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .slice(0, 160);
}

function normalizeStatusCode(value) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return 0;
  return Math.max(0, Math.min(999, Math.floor(parsed)));
}

function normalizeBytes(value) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) return 0;
  return Math.floor(parsed);
}

function normalizeDuration(value) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) return 0;
  return Math.min(3_600_000, Math.round(parsed));
}

function parseUrlParts(value) {
  const raw = String(value || "").trim();
  if (!raw) return { host: "", path: "" };
  try {
    const parsed = new URL(raw);
    return {
      host: normalizeHost(parsed.host || parsed.hostname || ""),
      path: normalizePath(`${parsed.pathname || "/"}${parsed.search || ""}`),
    };
  } catch {
    return { host: "", path: "" };
  }
}

class AggregatorReporter {
  constructor({
    enabled = false,
    baseUrl = "",
    token = "",
    projectKey = "tracker-default",
    projectName = "Tracker Instance",
    sourceLabel = "tracker",
    serviceName = "tracker",
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
    this.serviceName = String(serviceName || "tracker").trim() || "tracker";
    this.instanceId = String(instanceId || "tracker-instance").trim() || "tracker-instance";
    this.instanceName = String(instanceName || "Tracker Instance").trim() || "Tracker Instance";
    this.timeoutMs = Math.max(1000, Number(timeoutMs) || 5000);
    this.logger = logger;
    this.baseHost = parseUrlParts(this.baseUrl).host;
    this.trafficQueue = [];
    this.trafficFlushTimer = null;
    this.trafficMaxBatchSize = 80;
    this.trafficMaxQueue = 1000;
    this.trafficFlushIntervalMs = 1000;
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

  scheduleTrafficFlush() {
    if (this.trafficFlushTimer || !this.trafficQueue.length) return;
    this.trafficFlushTimer = setTimeout(() => {
      this.trafficFlushTimer = null;
      this.flushTrafficQueue().catch((error) => {
        this.logger.warn(`[tracker-aggregator] traffic flush failed: ${error?.message || error}`);
      });
    }, this.trafficFlushIntervalMs);
    if (typeof this.trafficFlushTimer?.unref === "function") {
      this.trafficFlushTimer.unref();
    }
  }

  async flushTrafficQueue() {
    if (!this.isReady || !this.trafficQueue.length) {
      return { skipped: true, reason: "disabled-or-empty" };
    }
    const batch = this.trafficQueue.splice(0, this.trafficMaxBatchSize);
    const result = await this.postIngest("traffic/batch", {
      projectKey: this.projectKey,
      projectName: this.projectName,
      sourceLabel: this.sourceLabel,
      service: this.serviceName,
      samples: batch,
    });
    if (!result?.ok) {
      this.trafficQueue = [...batch, ...this.trafficQueue].slice(0, this.trafficMaxQueue);
    }
    if (this.trafficQueue.length) {
      this.scheduleTrafficFlush();
    }
    return result;
  }

  reportTraffic(sample = {}) {
    if (!this.isReady) return { skipped: true, reason: "disabled-or-missing-url" };
    const direction = normalizeDirection(sample.direction);
    const method = normalizeMethod(sample.method);
    const route = normalizePath(sample.route || sample.path || "/");
    const urlParts = parseUrlParts(sample.url || sample.targetUrl || sample.target || "");
    const targetHost = normalizeHost(sample.targetHost || urlParts.host || "");
    const targetPath = normalizePath(sample.targetPath || urlParts.path || route);
    const statusCode = normalizeStatusCode(sample.statusCode || sample.status);
    const durationMs = normalizeDuration(sample.durationMs || sample.duration);
    const bytesIn = normalizeBytes(sample.bytesIn || sample.requestBytes);
    const bytesOut = normalizeBytes(sample.bytesOut || sample.responseBytes);
    const service = String(sample.service || this.serviceName || "tracker").trim() || "tracker";
    const component = String(sample.component || "http").trim() || "http";
    const occurredDate = new Date(sample.occurredAt || Date.now());
    const occurredAt = Number.isNaN(occurredDate.getTime())
      ? new Date().toISOString()
      : occurredDate.toISOString();

    if (
      direction === "outgoing" &&
      targetHost &&
      this.baseHost &&
      targetHost === this.baseHost &&
      targetPath.startsWith("/api/v1/ingest/traffic")
    ) {
      return { skipped: true, reason: "traffic-loop-guard" };
    }

    this.trafficQueue.push({
      direction,
      service,
      component,
      method,
      route,
      targetHost,
      targetPath,
      statusCode,
      durationMs,
      bytesIn,
      bytesOut,
      occurredAt,
    });

    if (this.trafficQueue.length > this.trafficMaxQueue) {
      this.trafficQueue.splice(0, this.trafficQueue.length - this.trafficMaxQueue);
    }

    if (this.trafficQueue.length >= this.trafficMaxBatchSize) {
      this.flushTrafficQueue().catch((error) => {
        this.logger.warn(`[tracker-aggregator] traffic flush failed: ${error?.message || error}`);
      });
    } else {
      this.scheduleTrafficFlush();
    }

    return { queued: true, queueSize: this.trafficQueue.length };
  }
}

export { AggregatorReporter };
