function parseTargetParts(value = "") {
  const raw = String(value || "").trim();
  if (!raw) return { host: "", path: "/" };
  try {
    const parsed = new URL(raw);
    return {
      host: String(parsed.host || "").toLowerCase(),
      path: `${parsed.pathname || "/"}${parsed.search || ""}`,
    };
  } catch {
    return { host: "", path: "/" };
  }
}

function createTrafficSample(sample, serviceName) {
  const direction =
    String(sample.direction || "outgoing")
      .trim()
      .toLowerCase() === "incoming"
      ? "incoming"
      : "outgoing";
  const routeRaw = String(sample.route || sample.path || "/").trim();
  const route = routeRaw.startsWith("/") ? routeRaw : `/${routeRaw}`;
  const targetPathRaw = String(sample.targetPath || route || "/").trim();

  return {
    direction,
    service: serviceName,
    component: String(sample.component || "http").trim() || "http",
    method:
      String(sample.method || "GET")
        .trim()
        .toUpperCase() || "GET",
    route,
    targetHost: String(sample.targetHost || "")
      .trim()
      .toLowerCase(),
    targetPath: targetPathRaw.startsWith("/") ? targetPathRaw : `/${targetPathRaw}`,
    statusCode: Math.max(0, Math.min(999, Number(sample.statusCode || 0) || 0)),
    durationMs: Math.max(0, Math.min(3_600_000, Number(sample.durationMs || 0) || 0)),
    bytesIn: Math.max(0, Number(sample.bytesIn || 0) || 0),
    bytesOut: Math.max(0, Number(sample.bytesOut || 0) || 0),
    occurredAt: sample.occurredAt || new Date().toISOString(),
  };
}

class TrackerServiceRuntime {
  constructor({
    enabled = true,
    aggregatorBaseUrl,
    aggregatorToken,
    projectKey,
    projectName,
    sourceLabel,
    trafficServiceName,
    requestTimeoutMs = 15000,
    logger = console,
    logPrefix = "tracker-service",
    logTrafficErrors = false,
    exposeHttpStatus = false,
  } = {}) {
    this.enabled = Boolean(enabled);
    this.aggregatorBaseUrl = String(aggregatorBaseUrl || "").replace(/\/+$/, "");
    this.aggregatorToken = String(aggregatorToken || "").trim();
    this.projectKey = String(projectKey || "tracker-service").trim();
    this.projectName = String(projectName || this.projectKey).trim();
    this.sourceLabel = String(sourceLabel || this.projectKey).trim();
    this.trafficServiceName = String(trafficServiceName || this.projectKey).trim();
    this.requestTimeoutMs = Math.max(1000, Number(requestTimeoutMs) || 15000);
    this.logger = logger;
    this.logPrefix = String(logPrefix || "tracker-service").trim() || "tracker-service";
    this.logTrafficErrors = Boolean(logTrafficErrors);
    this.exposeHttpStatus = Boolean(exposeHttpStatus);
  }

  setEnabled(enabled) {
    if (enabled !== undefined) this.enabled = Boolean(enabled);
    return this.enabled;
  }

  parseTargetParts(value = "") {
    return parseTargetParts(value);
  }

  async sendTrafficSample(sample = {}) {
    if (!this.aggregatorBaseUrl) return;
    const normalized = createTrafficSample(sample, this.trafficServiceName);
    if (
      normalized.direction === "outgoing" &&
      normalized.targetPath.toLowerCase().startsWith("/api/v1/ingest/traffic")
    ) {
      return;
    }

    const headers = this.createAggregatorHeaders();
    await fetch(`${this.aggregatorBaseUrl}/ingest/traffic`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        projectKey: this.projectKey,
        projectName: this.projectName,
        sourceLabel: this.sourceLabel,
        service: this.trafficServiceName,
        sample: normalized,
      }),
      signal: AbortSignal.timeout(Math.min(this.requestTimeoutMs, 5000)),
    });
  }

  reportTraffic(sample = {}) {
    this.sendTrafficSample(sample).catch((error) => {
      if (this.logTrafficErrors) {
        this.logger.warn(`[${this.logPrefix}] traffic report failed: ${error?.message || error}`);
      }
    });
  }

  createAggregatorHeaders() {
    const headers = {
      "content-type": "application/json",
    };
    if (this.aggregatorToken) {
      headers.authorization = `Bearer ${this.aggregatorToken}`;
      headers["x-ingest-token"] = this.aggregatorToken;
    }
    return headers;
  }

  async requestJson(url, { method = "GET", body } = {}) {
    const startedAt = Date.now();
    const safeMethod = String(method || "GET").toUpperCase();
    const target = this.parseTargetParts(url);
    const requestBodyText = body ? JSON.stringify(body) : "";
    const requestBytes = requestBodyText ? Buffer.byteLength(requestBodyText, "utf8") : 0;

    let response;
    try {
      response = await fetch(url, {
        method,
        headers: this.createAggregatorHeaders(),
        body: requestBodyText || undefined,
        signal: AbortSignal.timeout(this.requestTimeoutMs),
      });
    } catch (error) {
      this.reportRequestTraffic({
        startedAt,
        method: safeMethod,
        target,
        statusCode: 0,
        requestBytes,
        responseBytes: 0,
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

    this.reportRequestTraffic({
      startedAt,
      method: safeMethod,
      target,
      statusCode: Number(response.status || 0),
      requestBytes,
      responseBytes,
    });

    if (!response.ok) {
      const details = payload?.error || payload?.message || responseText.trim() || `HTTP ${response.status}`;
      const error = new Error(`Request failed (${response.status}) for ${method} ${url}: ${details}`);
      if (this.exposeHttpStatus) error.statusCode = response.status;
      throw error;
    }
    return payload;
  }

  reportRequestTraffic({ startedAt, method, target, statusCode, requestBytes, responseBytes }) {
    this.reportTraffic({
      direction: "outgoing",
      component: "aggregator-client",
      method,
      route: target.path,
      targetHost: target.host,
      targetPath: target.path,
      statusCode,
      durationMs: Date.now() - startedAt,
      bytesIn: requestBytes,
      bytesOut: responseBytes,
    });
  }

  scheduleRecurringTask({ delayMs, task, onError, onSettled } = {}) {
    this.stopRecurringTask();
    this.timer = setTimeout(
      async () => {
        try {
          await task?.();
        } catch (error) {
          onError?.(error);
        } finally {
          onSettled?.();
        }
      },
      Math.max(0, Number(delayMs) || 0)
    );
    return this.timer;
  }

  stopRecurringTask() {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
  }
}

export { TrackerServiceRuntime, createTrafficSample, parseTargetParts };
