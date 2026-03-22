class ClubTrackerService {
  constructor({
    enabled = true,
    aggregatorBaseUrl,
    aggregatorToken,
    projectKey,
    projectName,
    sourceLabel,
    requestTimeoutMs = 15000,
  } = {}) {
    this.enabled = Boolean(enabled);
    this.aggregatorBaseUrl = String(aggregatorBaseUrl || "").replace(/\/+$/, "");
    this.aggregatorToken = String(aggregatorToken || "").trim();
    this.projectKey = String(projectKey || "tracker-club").trim();
    this.projectName = String(projectName || this.projectKey).trim();
    this.sourceLabel = String(sourceLabel || "tracker-club").trim();
    this.requestTimeoutMs = Math.max(1000, Number(requestTimeoutMs) || 15000);
    this.trafficServiceName = String(this.projectKey || "tracker-club").trim();

    this.lastIngestAt = null;
    this.lastError = null;
    this.lastSummary = null;
  }

  getStatus() {
    return {
      enabled: this.enabled,
      projectKey: this.projectKey,
      projectName: this.projectName,
      sourceLabel: this.sourceLabel,
      aggregatorBaseUrl: this.aggregatorBaseUrl,
      hasAggregatorToken: Boolean(this.aggregatorToken),
      lastIngestAt: this.lastIngestAt,
      lastError: this.lastError,
      lastSummary: this.lastSummary,
    };
  }

  setConfig({ enabled } = {}) {
    if (enabled !== undefined) this.enabled = Boolean(enabled);
    return this.getStatus();
  }

  parseTargetParts(value = "") {
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

  async sendTrafficSample(sample = {}) {
    if (!this.aggregatorBaseUrl) return;

    const direction =
      String(sample.direction || "outgoing").trim().toLowerCase() === "incoming"
        ? "incoming"
        : "outgoing";
    const routeRaw = String(sample.route || sample.path || "/").trim();
    const route = routeRaw.startsWith("/") ? routeRaw : `/${routeRaw}`;
    const targetHost = String(sample.targetHost || "").trim().toLowerCase();
    const targetPathRaw = String(sample.targetPath || route || "/").trim();
    const targetPath = targetPathRaw.startsWith("/") ? targetPathRaw : `/${targetPathRaw}`;

    if (
      direction === "outgoing" &&
      targetPath.toLowerCase().startsWith("/api/v1/ingest/traffic")
    ) {
      return;
    }

    const headers = {
      "content-type": "application/json",
    };
    if (this.aggregatorToken) {
      headers.authorization = `Bearer ${this.aggregatorToken}`;
      headers["x-ingest-token"] = this.aggregatorToken;
    }

    await fetch(`${this.aggregatorBaseUrl}/ingest/traffic`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        projectKey: this.projectKey,
        projectName: this.projectName,
        sourceLabel: this.sourceLabel,
        service: this.trafficServiceName,
        sample: {
          direction,
          service: this.trafficServiceName,
          component: String(sample.component || "http").trim() || "http",
          method: String(sample.method || "GET").trim().toUpperCase() || "GET",
          route,
          targetHost,
          targetPath,
          statusCode: Math.max(0, Math.min(999, Number(sample.statusCode || 0) || 0)),
          durationMs: Math.max(0, Math.min(3_600_000, Number(sample.durationMs || 0) || 0)),
          bytesIn: Math.max(0, Number(sample.bytesIn || 0) || 0),
          bytesOut: Math.max(0, Number(sample.bytesOut || 0) || 0),
          occurredAt: sample.occurredAt || new Date().toISOString(),
        },
      }),
      signal: AbortSignal.timeout(Math.min(this.requestTimeoutMs, 5000)),
    });
  }

  reportTraffic(sample = {}) {
    this.sendTrafficSample(sample).catch(() => {});
  }

  async requestJson(url, { method = "GET", body } = {}) {
    const startedAt = Date.now();
    const safeMethod = String(method || "GET").toUpperCase();
    const target = this.parseTargetParts(url);
    const requestBodyText = body ? JSON.stringify(body) : "";
    const requestBytes = requestBodyText ? Buffer.byteLength(requestBodyText, "utf8") : 0;

    const headers = {
      "content-type": "application/json",
    };
    if (this.aggregatorToken) {
      headers.authorization = `Bearer ${this.aggregatorToken}`;
      headers["x-ingest-token"] = this.aggregatorToken;
    }

    let response;
    try {
      response = await fetch(url, {
        method,
        headers,
        body: body ? JSON.stringify(body) : undefined,
        signal: AbortSignal.timeout(this.requestTimeoutMs),
      });
    } catch (error) {
      this.reportTraffic({
        direction: "outgoing",
        component: "aggregator-client",
        method: safeMethod,
        route: target.path,
        targetHost: target.host,
        targetPath: target.path,
        statusCode: 0,
        durationMs: Date.now() - startedAt,
        bytesIn: requestBytes,
        bytesOut: 0,
      });
      throw error;
    }

    const text = await response.text();
    const responseBytes = text ? Buffer.byteLength(text, "utf8") : 0;
    let payload = null;
    if (text) {
      try {
        payload = JSON.parse(text);
      } catch {
        payload = null;
      }
    }

    this.reportTraffic({
      direction: "outgoing",
      component: "aggregator-client",
      method: safeMethod,
      route: target.path,
      targetHost: target.host,
      targetPath: target.path,
      statusCode: Number(response.status || 0),
      durationMs: Date.now() - startedAt,
      bytesIn: requestBytes,
      bytesOut: responseBytes,
    });

    if (!response.ok) {
      const details =
        payload?.error ||
        payload?.message ||
        String(text || "").trim() ||
        `HTTP ${response.status}`;
      throw new Error(`Request failed (${response.status}) for ${method} ${url}: ${details}`);
    }

    return payload;
  }

  async ingestSnapshot(snapshot = {}) {
    if (!this.enabled) return { error: "Club tracker is disabled." };

    const club = snapshot?.club || {};
    const clubId = Number(club?.id || club?.clubId || snapshot?.clubId || 0);
    if (!Number.isFinite(clubId) || clubId <= 0) {
      return { error: "club.id/clubId is required for club snapshot ingest." };
    }

    try {
      const payload = await this.requestJson(`${this.aggregatorBaseUrl}/ingest/club-snapshot`, {
        method: "POST",
        body: {
          projectKey: this.projectKey,
          projectName: this.projectName,
          sourceLabel: this.sourceLabel,
          observedAt: new Date().toISOString(),
          ...snapshot,
        },
      });

      this.lastIngestAt = new Date().toISOString();
      this.lastError = null;
      this.lastSummary = payload?.ingest || null;

      return payload?.ingest || {};
    } catch (error) {
      const message = error?.message || "Club snapshot ingest failed.";
      this.lastError = message;
      return { error: message };
    }
  }
}

export { ClubTrackerService };
