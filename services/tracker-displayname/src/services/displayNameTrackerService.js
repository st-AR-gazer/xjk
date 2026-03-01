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
    this.maintenanceIntervalSeconds = Math.max(60, Number(maintenanceIntervalSeconds) || 60);
    this.staleAfterSeconds = Math.max(0, Number(staleAfterSeconds) || 86400);
    this.batchSize = Math.max(1, Math.min(50, Number(batchSize) || 50));
    this.maxAccountsPerCycle = Math.max(1, Number(maxAccountsPerCycle) || 200);
    this.requestTimeoutMs = Math.max(1000, Number(requestTimeoutMs) || 15000);
    this.minRequestGapMs = Math.max(0, Number(minRequestGapMs) || 5000);

    this.logger = logger;

    this.pendingAccountIds = new Set();
    this.running = false;
    this.timer = null;
    this.lastRunAt = null;
    this.lastFinishedAt = null;
    this.lastError = null;
    this.lastSummary = null;
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
  } = {}) {
    if (enabled !== undefined) this.enabled = Boolean(enabled);
    if (schedulerEnabled !== undefined) this.schedulerEnabled = Boolean(schedulerEnabled);
    if (maintenanceIntervalSeconds !== undefined) {
      this.maintenanceIntervalSeconds = Math.max(60, Number(maintenanceIntervalSeconds) || 60);
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
      queueSize: this.pendingAccountIds.size,
      oauth: this.oauthClient?.getStatus?.() || null,
      lastRunAt: this.lastRunAt,
      lastFinishedAt: this.lastFinishedAt,
      lastError: this.lastError,
      lastSummary: this.lastSummary,
    };
  }

  enqueueAccountIds(accountIds = []) {
    const normalized = uniqueAccountIds(accountIds);
    for (const accountId of normalized) {
      this.pendingAccountIds.add(accountId);
    }
    return {
      queued: normalized.length,
      queueSize: this.pendingAccountIds.size,
    };
  }

  async requestJson(url, { method = "GET", body } = {}) {
    const headers = {
      "content-type": "application/json",
    };
    if (this.aggregatorToken) {
      headers.authorization = `Bearer ${this.aggregatorToken}`;
      headers["x-ingest-token"] = this.aggregatorToken;
    }
    const response = await fetch(url, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(this.requestTimeoutMs),
    });
    const text = await response.text();
    let payload = null;
    if (text) {
      try {
        payload = JSON.parse(text);
      } catch {
        payload = null;
      }
    }
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

  async runSync({ accountIds = [], reason = "manual", forceCandidates = false } = {}) {
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
      this.enqueueAccountIds(manualIds);

      if (forceCandidates || this.pendingAccountIds.size === 0) {
        const candidates = await this.fetchCandidateAccountIds(this.maxAccountsPerCycle);
        this.enqueueAccountIds(candidates);
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
