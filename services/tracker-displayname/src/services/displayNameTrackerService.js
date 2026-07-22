import { resolveKnownDisplayName } from "../../../shared/displayNameResolution.js";
import { TrackerServiceRuntime } from "../../../shared/trackerServiceRuntime.js";
import { delay, normalizeAccountId } from "../../../shared/valueUtils.js";

function uniqueAccountIds(values = []) {
  return [...new Set((Array.isArray(values) ? values : []).map(normalizeAccountId).filter(Boolean))];
}

function mergeKnownDisplayNames(accountIds = [], namesByAccountId = {}) {
  const merged = {
    ...(namesByAccountId && typeof namesByAccountId === "object" ? namesByAccountId : {}),
  };
  for (const accountId of uniqueAccountIds(accountIds)) {
    if (merged[accountId]) continue;
    const knownDisplayName = resolveKnownDisplayName(accountId);
    if (knownDisplayName) {
      merged[accountId] = knownDisplayName;
    }
  }
  return merged;
}

function normalizeInstanceId(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 120);
}

class DisplayNameTrackerService extends TrackerServiceRuntime {
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
    super({
      enabled,
      aggregatorBaseUrl,
      aggregatorToken,
      projectKey: projectKey || "tracker-displayname",
      projectName,
      sourceLabel: sourceLabel || "tracker-displayname",
      requestTimeoutMs,
      logger,
      logPrefix: "tracker-displayname",
      logTrafficErrors: true,
      exposeHttpStatus: true,
    });

    this.oauthClient = oauthClient;
    this.instanceId = normalizeInstanceId(instanceId || `${this.projectKey}-service`) || "tracker-displayname-service";
    this.instanceName = String(instanceName || "Displayname Tracker Service").trim();

    this.schedulerEnabled = Boolean(schedulerEnabled);
    this.maintenanceIntervalSeconds = Math.max(3, Number(maintenanceIntervalSeconds) || 60);
    this.staleAfterSeconds = Math.max(0, Number(staleAfterSeconds) || 86400);
    this.batchSize = Math.max(1, Math.min(50, Number(batchSize) || 50));
    this.maxAccountsPerCycle = Math.max(1, Number(maxAccountsPerCycle) || 200);
    this.minRequestGapMs = Math.max(0, Number(minRequestGapMs) || 5000);
    this.trafficServiceName = String(this.instanceId || this.projectKey || "tracker-displayname").trim();

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
      this.setEnabled(enabled);
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

  createSyncSummary({ reason, requested, resolved, ingest = {}, details = {} }) {
    return {
      reason,
      requested,
      resolved,
      accepted: Number(ingest.accepted || 0),
      inserted: Number(ingest.inserted || 0),
      updated: Number(ingest.updated || 0),
      unchanged: Number(ingest.unchanged || 0),
      queueRemaining: this.pendingAccountIds.size,
      finishedAt: new Date().toISOString(),
      ...details,
    };
  }

  async recordSyncSuccess(summary, { warning = "" } = {}) {
    this.lastSummary = summary;
    this.lastFinishedAt = summary.finishedAt;
    this.lastError = warning || null;
    await this.sendInstanceState({
      register: false,
      status: warning ? "degraded" : "online",
    });
    return summary;
  }

  async recordSyncFailure(error, fallbackMessage) {
    const message = error?.message || fallbackMessage;
    this.lastError = message;
    this.lastFinishedAt = new Date().toISOString();
    this.lastSummary = {
      error: message,
      queueRemaining: this.pendingAccountIds.size,
      finishedAt: this.lastFinishedAt,
    };
    await this.sendInstanceState({ register: false, status: "error" });
    return message;
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
    if (!this.aggregatorBaseUrl) {
      return {
        accepted: 0,
        inserted: 0,
        updated: 0,
        unchanged: 0,
        skipped: true,
        error: "Aggregator base URL is not configured.",
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

  async resolveAccountIds(accountIds = [], { reason = "priority-api", front = true } = {}) {
    if (!this.enabled) {
      return { error: "Displayname tracker is disabled.", namesByAccountId: {} };
    }
    if (!this.oauthClient?.isConfigured?.()) {
      return {
        error: "Trackmania OAuth credentials are not configured for displayname tracker.",
        namesByAccountId: {},
      };
    }

    const normalized = uniqueAccountIds(accountIds);
    if (!normalized.length) {
      return {
        ok: true,
        requested: 0,
        resolved: 0,
        namesByAccountId: {},
        missingAccountIds: [],
        queueRemaining: this.pendingAccountIds.size,
      };
    }

    this.enqueueAccountIds(normalized, { front });

    try {
      const knownNamesByAccountId = mergeKnownDisplayNames(normalized, {});
      const fetchAccountIds = normalized.filter((accountId) => !knownNamesByAccountId[accountId]);
      let result = {
        ok: true,
        requested: 0,
        resolved: 0,
        namesByAccountId: {},
      };
      let fetchError = "";
      if (fetchAccountIds.length) {
        result = await this.oauthClient.getDisplayNames(fetchAccountIds);
      }
      if (!result?.ok) {
        fetchError = result?.error || "Displayname fetch failed.";
      }
      if (fetchError && !Object.keys(knownNamesByAccountId).length) {
        return {
          error: fetchError,
          namesByAccountId: {},
          missingAccountIds: normalized,
          queueRemaining: this.pendingAccountIds.size,
        };
      }

      const namesByAccountId = mergeKnownDisplayNames(normalized, {
        ...knownNamesByAccountId,
        ...(result?.namesByAccountId || {}),
      });
      let ingest = {
        accepted: 0,
        inserted: 0,
        updated: 0,
        unchanged: 0,
      };
      let ingestError = "";
      try {
        ingest = await this.ingestDisplayNames(namesByAccountId, {
          source: `${this.sourceLabel}:${reason}`,
        });
        if (ingest?.error) ingestError = ingest.error;
      } catch (error) {
        ingestError = error?.message || "Display-name aggregator ingest failed.";
        this.logger.warn(`[tracker-displayname] priority ingest failed: ${ingestError}`);
      }

      const resolvedAccountIds = uniqueAccountIds(Object.keys(namesByAccountId));
      for (const accountId of resolvedAccountIds) {
        this.pendingAccountIds.delete(accountId);
      }
      const missingAccountIds = normalized.filter((accountId) => !namesByAccountId[accountId]);

      const summary = this.createSyncSummary({
        reason,
        requested: normalized.length,
        resolved: resolvedAccountIds.length,
        ingest,
      });
      await this.recordSyncSuccess(summary, { warning: ingestError || fetchError });

      return {
        ok: true,
        ...summary,
        namesByAccountId,
        missingAccountIds,
        ...(fetchError ? { fetchError } : {}),
        ...(ingestError ? { ingestError } : {}),
      };
    } catch (error) {
      const message = await this.recordSyncFailure(error, "Displayname priority resolution failed.");
      return {
        error: message,
        namesByAccountId: {},
        missingAccountIds: normalized,
        queueRemaining: this.pendingAccountIds.size,
      };
    }
  }

  async runSync({ accountIds = [], reason = "manual", forceCandidates = false, prioritizeAccountIds = true } = {}) {
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

      const namesByAccountId = mergeKnownDisplayNames(cycleIds, result.namesByAccountId);
      const resolvedAccountIds = uniqueAccountIds(Object.keys(namesByAccountId));
      const ingest = await this.ingestDisplayNames(namesByAccountId, {
        source: `${this.sourceLabel}:${reason}`,
      });

      for (const accountId of cycleIds) {
        this.pendingAccountIds.delete(accountId);
      }

      const summary = this.createSyncSummary({
        reason,
        requested: Number(result.requested || cycleIds.length),
        resolved: resolvedAccountIds.length,
        ingest,
        details: {
          namesByAccountId,
          missingAccountIds: cycleIds.filter((accountId) => !namesByAccountId[accountId]),
        },
      });
      return this.recordSyncSuccess(summary);
    } catch (error) {
      const message = await this.recordSyncFailure(error, "Displayname sync failed.");
      return { error: message };
    } finally {
      this.running = false;
    }
  }

  scheduleNextTick() {
    if (!this.schedulerEnabled || !this.enabled) return;
    this.scheduleRecurringTask({
      delayMs: this.maintenanceIntervalSeconds * 1000,
      task: () => this.runSync({ reason: "scheduled", forceCandidates: true }),
      onError: (error) => {
        this.logger.warn(`[tracker-displayname] scheduled sync failed: ${error?.message || error}`);
      },
      onSettled: () => this.scheduleNextTick(),
    });
  }

  startScheduler() {
    if (!this.enabled || !this.schedulerEnabled) return;
    this.scheduleNextTick();
  }

  stopScheduler() {
    this.stopRecurringTask();
  }

  async warmup() {
    if (!this.enabled || !this.schedulerEnabled) return;
    await delay(this.minRequestGapMs);
    await this.sendInstanceState({ register: true, status: "online" });
    this.startScheduler();
  }
}

export { DisplayNameTrackerService, normalizeAccountId, uniqueAccountIds };
