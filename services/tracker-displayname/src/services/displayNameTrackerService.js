function normalizeAccountId(value) {
  const accountId = String(value || "").trim().toLowerCase();
  if (!accountId) return "";
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(accountId)) {
    return accountId;
  }
  return "";
}

function uniqueAccountIds(values = []) {
  return [...new Set((Array.isArray(values) ? values : []).map(normalizeAccountId).filter(Boolean))];
}

function normalizeInstanceId(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 120);
}

function delay(ms) {
  const safe = Math.max(0, Number(ms) || 0);
  if (!safe) return Promise.resolve();
  return new Promise((resolve) => setTimeout(resolve, safe));
}

function parseTargetParts(value) {
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

class DisplayNameTrackerService {
  constructor({
    oauthClient,
    aggregatorBaseUrl,
    aggregatorToken,
    projectKey,
    projectName,
    sourceLabel,
    instanceId,
    instanceName,
    enabled = true,
    schedulerEnabled = true,
    maintenanceIntervalSeconds = 60,
    staleAfterSeconds = 86400,
    batchSize = 50,
    maxAccountsPerCycle = 200,
    requestTimeoutMs = 15000,
    minRequestGapMs = 5000,
    logger = console,
  } = {}) {
    this.oauthClient = oauthClient;
    this.aggregatorBaseUrl = String(aggregatorBaseUrl || "").replace(/\/+$/, "");
    this.aggregatorToken = String(aggregatorToken || "").trim();
    this.projectKey = String(projectKey || "tracker-displayname").trim();
    this.projectName = String(projectName || this.projectKey).trim();
    this.sourceLabel = String(sourceLabel || "tracker-displayname").trim();
    this.instanceId = normalizeInstanceId(instanceId || `${this.projectKey}-service`) || "tracker-displayname-service";
    this.instanceName = String(instanceName || "Displayname Tracker Service").trim();

    this.enabled = Boolean(enabled);
    this.schedulerEnabled = Boolean(schedulerEnabled);
    this.maintenanceIntervalSeconds = Math.max(3, Number(maintenanceIntervalSeconds) || 60);
    this.staleAfterSeconds = Math.max(0, Number(staleAfterSeconds) || 86400);
    this.batchSize = Math.max(1, Math.min(50, Number(batchSize) || 50));
    this.maxAccountsPerCycle = Math.max(1, Number(maxAccountsPerCycle) || 200);
    this.requestTimeoutMs = Math.max(1000, Number(requestTimeoutMs) || 15000);
    this.minRequestGapMs = Math.max(0, Number(minRequestGapMs) || 5000);
    this.trafficServiceName = String(this.instanceId || this.projectKey || "tracker-displayname").trim();

    this.logger = logger;

    if (typeof this.oauthClient?.setEnabled === "function") {
      this.oauthClient.setEnabled(this.enabled);
    }

    this.pendingAccountIds = new Set();
    this.running = false;
    this.timer = null;
    this.lastRunAt = null;
    this.lastFinishedAt = null;
    this.lastError = null;
    this.lastSummary = null;
  }

  async sendTrafficSample(sample = {}) {
    if (!this.aggregatorBaseUrl) return;

    const direction = String(sample.direction || "outgoing").trim().toLowerCase() === "incoming" ? "incoming" : "outgoing";
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
    this.sendTrafficSample(sample).catch((error) => {
      this.logger.warn(`[tracker-displayname] traffic report failed: ${error?.message || error}`);
    });
  }

  async sendInstanceState({ register = false, status = "online" } = {}) {
    if (!this.aggregatorBaseUrl) return;
    const endpoint = register ? "/ingest/instance/register" : "/ingest/instance/heartbeat";
    const body = {
      projectKey: this.projectKey,
      projectName: this.projectName,
      sourceLabel: this.sourceLabel,
      instanceId: this.instanceId,
      instanceName: this.instanceName,
      status,
      meta: {
        queueSize: this.pendingAccountIds.size,
        lastRunAt: this.lastRunAt,
        lastFinishedAt: this.lastFinishedAt,
        lastError: this.lastError || null,
      },
    };
    try {
      await this.requestJson(`${this.aggregatorBaseUrl}${endpoint}`, {
        method: "POST",
        body,
      });
    } catch (error) {
      this.logger.warn(
        `[tracker-displayname] failed to ${register ? "register" : "heartbeat"} instance: ${error?.message || error}`
      );
    }
  }

  setConfig({
    enabled,
    schedulerEnabled,
    maintenanceIntervalSeconds,
    staleAfterSeconds,
    batchSize,
    maxAccountsPerCycle,
    minRequestGapMs,
  } = {}) {
    if (enabled !== undefined) {
      this.enabled = Boolean(enabled);
      if (typeof this.oauthClient?.setEnabled === "function") {
        this.oauthClient.setEnabled(this.enabled);
      }
    }
    if (schedulerEnabled !== undefined) this.schedulerEnabled = Boolean(schedulerEnabled);
    if (maintenanceIntervalSeconds !== undefined) {
      this.maintenanceIntervalSeconds = Math.max(3, Number(maintenanceIntervalSeconds) || 60);
    }
    if (staleAfterSeconds !== undefined) {
      this.staleAfterSeconds = Math.max(0, Number(staleAfterSeconds) || 0);
    }
    if (batchSize !== undefined) {
      this.batchSize = Math.max(1, Math.min(50, Number(batchSize) || this.batchSize));
    }
    if (maxAccountsPerCycle !== undefined) {
      this.maxAccountsPerCycle = Math.max(1, Number(maxAccountsPerCycle) || this.maxAccountsPerCycle);
    }
    if (minRequestGapMs !== undefined) {
      this.minRequestGapMs = Math.max(0, Number(minRequestGapMs) || 0);
    }

    if (this.schedulerEnabled && this.enabled) this.startScheduler();
    else this.stopScheduler();

    return this.getStatus();
  }

  getStatus() {
    return {
      enabled: this.enabled,
      schedulerEnabled: this.schedulerEnabled,
      running: this.running,
      maintenanceIntervalSeconds: this.maintenanceIntervalSeconds,
      staleAfterSeconds: this.staleAfterSeconds,
      batchSize: this.batchSize,
      maxAccountsPerCycle: this.maxAccountsPerCycle,
      minRequestGapMs: this.minRequestGapMs,
      queueSize: this.pendingAccountIds.size,
      oauth: this.oauthClient?.getStatus?.() || null,
      lastRunAt: this.lastRunAt,
      lastFinishedAt: this.lastFinishedAt,
      lastError: this.lastError,
      lastSummary: this.lastSummary,
    };
  }

  enqueueAccountIds(accountIds = [], { front = false } = {}) {
    const normalized = uniqueAccountIds(accountIds);
    if (!normalized.length) {
      return {
        queued: 0,
        queueSize: this.pendingAccountIds.size,
        prioritized: Boolean(front),
      };
    }

    if (front) {
      const reordered = new Set(normalized);
      for (const existingId of this.pendingAccountIds) {
        if (!reordered.has(existingId)) {
          reordered.add(existingId);
        }
      }
      this.pendingAccountIds = reordered;
    } else {
      for (const accountId of normalized) {
        this.pendingAccountIds.add(accountId);
      }
    }
    return {
      queued: normalized.length,
      queueSize: this.pendingAccountIds.size,
      prioritized: Boolean(front),
    };
  }

  async requestJson(url, { method = "GET", body } = {}) {
    const startedAt = Date.now();
    const safeMethod = String(method || "GET").toUpperCase();
    const target = parseTargetParts(url);
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
      const error = new Error(`Request failed (${response.status}) for ${method} ${url}: ${details}`);
      error.statusCode = response.status;
      throw error;
    }
    return payload;
  }

  async fetchCandidateAccountIds(limit = this.maxAccountsPerCycle) {
    const safeLimit = Math.max(1, Number(limit) || this.maxAccountsPerCycle);
    const url =
      `${this.aggregatorBaseUrl}/display-names/candidates` +
      `?stale_after_seconds=${encodeURIComponent(this.staleAfterSeconds)}` +
      `&limit=${encodeURIComponent(safeLimit)}`;
    const payload = await this.requestJson(url, { method: "GET" });
    return uniqueAccountIds(payload?.accountIds || []);
  }

  async ingestDisplayNames(namesByAccountId = {}, { source = "tracker-displayname" } = {}) {
    const entries = Object.entries(namesByAccountId || {})
      .map(([accountId, displayName]) => ({
        accountId: normalizeAccountId(accountId),
        displayName: String(displayName || "").trim(),
      }))
      .filter((row) => row.accountId && row.displayName);
    if (!entries.length) {
      return {
        accepted: 0,
        inserted: 0,
        updated: 0,
        unchanged: 0,
      };
    }

    const payload = await this.requestJson(`${this.aggregatorBaseUrl}/ingest/display-names`, {
      method: "POST",
      body: {
        projectKey: this.projectKey,
        projectName: this.projectName,
        sourceLabel: this.sourceLabel,
        observedAt: new Date().toISOString(),
        names: entries.map((entry) => ({
          accountId: entry.accountId,
          displayName: entry.displayName,
          source,
        })),
      },
    });

    return payload?.ingest || {};
  }

  async runSync({
    accountIds = [],
    reason = "manual",
    forceCandidates = false,
    prioritizeAccountIds = true,
  } = {}) {
    if (!this.enabled) {
      return { error: "Displayname tracker is disabled." };
    }
    if (!this.oauthClient?.isConfigured?.()) {
      return { error: "Trackmania OAuth credentials are not configured for displayname tracker." };
    }
    if (this.running) {
      return { skipped: true, reason: "sync already running" };
    }

    this.running = true;
    this.lastRunAt = new Date().toISOString();
    this.lastError = null;

    try {
      const manualIds = uniqueAccountIds(accountIds);
      const prioritizeManualIds = Boolean(prioritizeAccountIds);
      this.enqueueAccountIds(manualIds, { front: prioritizeManualIds });

      if (forceCandidates || this.pendingAccountIds.size === 0) {
        const candidates = await this.fetchCandidateAccountIds(this.maxAccountsPerCycle);
        this.enqueueAccountIds(candidates, {
          front: !manualIds.length || !prioritizeManualIds,
        });
      }

      const cycleIds = [...this.pendingAccountIds].slice(0, this.maxAccountsPerCycle);
      if (!cycleIds.length) {
      this.lastSummary = {
        reason,
        requested: 0,
        resolved: 0,
        accepted: 0,
          queueRemaining: 0,
          finishedAt: new Date().toISOString(),
        };
      this.lastFinishedAt = this.lastSummary.finishedAt;
      await this.sendInstanceState({ register: false, status: "online" });
      return this.lastSummary;
    }

      const result = await this.oauthClient.getDisplayNames(cycleIds);
      if (!result?.ok) {
        return { error: result?.error || "Displayname fetch failed." };
      }

      const ingest = await this.ingestDisplayNames(result.namesByAccountId, {
        source: `${this.sourceLabel}:${reason}`,
      });

      for (const accountId of cycleIds) {
        this.pendingAccountIds.delete(accountId);
      }

      const summary = {
        reason,
        requested: Number(result.requested || cycleIds.length),
        resolved: Number(result.resolved || 0),
        accepted: Number(ingest.accepted || 0),
        inserted: Number(ingest.inserted || 0),
        updated: Number(ingest.updated || 0),
        unchanged: Number(ingest.unchanged || 0),
        queueRemaining: this.pendingAccountIds.size,
        finishedAt: new Date().toISOString(),
      };
      this.lastSummary = summary;
      this.lastFinishedAt = summary.finishedAt;
      await this.sendInstanceState({ register: false, status: "online" });
      return summary;
    } catch (error) {
      const message = error?.message || "Displayname sync failed.";
      this.lastError = message;
      this.lastFinishedAt = new Date().toISOString();
      this.lastSummary = {
        error: message,
        queueRemaining: this.pendingAccountIds.size,
        finishedAt: this.lastFinishedAt,
      };
      await this.sendInstanceState({ register: false, status: "error" });
      return { error: message };
    } finally {
      this.running = false;
    }
  }

  scheduleNextTick() {
    if (!this.schedulerEnabled || !this.enabled) return;
    if (this.timer) clearTimeout(this.timer);
    this.timer = setTimeout(async () => {
      try {
        await this.runSync({ reason: "scheduled", forceCandidates: true });
      } catch (error) {
        this.logger.warn(`[tracker-displayname] scheduled sync failed: ${error?.message || error}`);
      } finally {
        this.scheduleNextTick();
      }
    }, this.maintenanceIntervalSeconds * 1000);
  }

  startScheduler() {
    if (!this.enabled || !this.schedulerEnabled) return;
    this.scheduleNextTick();
  }

  stopScheduler() {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
  }

  async warmup() {
    if (!this.enabled || !this.schedulerEnabled) return;
    await delay(this.minRequestGapMs);
    await this.sendInstanceState({ register: true, status: "online" });
    this.startScheduler();
  }
}

export { DisplayNameTrackerService, normalizeAccountId, uniqueAccountIds };
