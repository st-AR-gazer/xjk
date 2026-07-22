import { DB_FILE, isMainThread, toText, Worker } from "../serviceSupport.js";

function createAlterationsSyncState() {
  return {
    running: false,
    queued: false,
    runCounter: 0,
    currentReason: null,
    lastStartedAt: null,
    lastFinishedAt: null,
    lastDurationMs: null,
    lastError: null,
    lastSummary: null,
    worker: null,
    promise: null,
  };
}

class AlterationSyncService {
  constructor({ repository, alterationsSync, getLiveMonitoringService }) {
    this.repository = repository;
    this.alterationsSync = alterationsSync;
    this.getLiveMonitoringService = getLiveMonitoringService;
  }

  get liveMonitor() {
    return this.getLiveMonitoringService().liveMonitor;
  }

  syncAlterations() {
    return this.repository.catalog.syncAllCampaignAlterations({ cleanupUnused: true });
  }

  getAlterationsSyncStatus() {
    return {
      running: Boolean(this.alterationsSync.running),
      queued: Boolean(this.alterationsSync.queued),
      runCounter: Number(this.alterationsSync.runCounter || 0),
      currentReason: this.alterationsSync.currentReason || null,
      lastStartedAt: this.alterationsSync.lastStartedAt,
      lastFinishedAt: this.alterationsSync.lastFinishedAt,
      lastDurationMs: this.alterationsSync.lastDurationMs,
      lastError: this.alterationsSync.lastError,
      lastSummary: this.alterationsSync.lastSummary,
    };
  }

  queueAlterationsSync({ reason = "auto", wait = false } = {}) {
    const safeReason = toText(reason) || "auto";

    if (!isMainThread) {
      try {
        const startedAt = new Date().toISOString();
        const startedMs = Date.now();
        this.alterationsSync.running = true;
        this.alterationsSync.queued = false;
        this.alterationsSync.runCounter += 1;
        this.alterationsSync.currentReason = safeReason;
        this.alterationsSync.lastStartedAt = startedAt;
        this.alterationsSync.lastError = null;
        const summary = this.syncAlterations();
        const finishedAt = new Date().toISOString();
        const durationMs = Math.max(0, Date.now() - startedMs);
        this.alterationsSync.lastFinishedAt = finishedAt;
        this.alterationsSync.lastDurationMs = durationMs;
        this.alterationsSync.lastSummary = summary;
        return wait
          ? Promise.resolve({ ok: true, summary, status: this.getAlterationsSyncStatus() })
          : { ok: true, summary, status: this.getAlterationsSyncStatus() };
      } catch (error) {
        const finishedAt = new Date().toISOString();
        this.alterationsSync.lastFinishedAt = finishedAt;
        this.alterationsSync.lastError = error?.message || String(error || "Alterations sync failed.");
        return wait
          ? Promise.resolve({
              ok: false,
              error: this.alterationsSync.lastError,
              status: this.getAlterationsSyncStatus(),
            })
          : { ok: false, error: this.alterationsSync.lastError, status: this.getAlterationsSyncStatus() };
      } finally {
        this.alterationsSync.running = false;
      }
    }

    if (this.alterationsSync.running) {
      this.alterationsSync.queued = true;
      const status = this.getAlterationsSyncStatus();
      return wait
        ? this.alterationsSync.promise || Promise.resolve({ ok: true, started: false, status })
        : { ok: true, started: false, status };
    }

    if (this.liveMonitor?.running || this.liveMonitor?.discoveryRunning) {
      this.alterationsSync.queued = true;
      const status = this.getAlterationsSyncStatus();
      return wait
        ? Promise.resolve({ ok: true, started: false, deferred: true, status })
        : { ok: true, started: false, deferred: true, status };
    }

    this.alterationsSync.running = true;
    this.alterationsSync.queued = false;
    this.alterationsSync.runCounter += 1;
    this.alterationsSync.currentReason = safeReason;
    const startedAt = new Date().toISOString();
    const startedMs = Date.now();
    this.alterationsSync.lastStartedAt = startedAt;
    this.alterationsSync.lastFinishedAt = null;
    this.alterationsSync.lastDurationMs = null;
    this.alterationsSync.lastError = null;

    let worker = null;
    let runPromise = null;
    try {
      const workerUrl = new URL("../../../workers/alterationsSyncWorker.js", import.meta.url);
      worker = new Worker(workerUrl, {
        type: "module",
        workerData: { dbFile: DB_FILE },
      });
      this.alterationsSync.worker = worker;

      let resolved = false;
      runPromise = new Promise((resolve) => {
        const finalize = (result) => {
          if (resolved) return;
          resolved = true;
          this.alterationsSync.worker = null;
          this.alterationsSync.promise = null;
          this.alterationsSync.running = false;
          const status = this.getAlterationsSyncStatus();
          resolve({ ...result, status });

          if (this.alterationsSync.queued) {
            this.alterationsSync.queued = false;
            this.queueAlterationsSync({ reason: "queued" });
          }
        };

        worker.on("message", (message) => {
          if (!message || typeof message !== "object" || message.type !== "complete") return;
          const finishedAt = message.finishedAt || new Date().toISOString();
          const durationMs = Math.max(0, Number(message.durationMs || 0) || Math.max(0, Date.now() - startedMs));
          this.alterationsSync.lastFinishedAt = finishedAt;
          this.alterationsSync.lastDurationMs = durationMs;
          if (message.ok) {
            this.alterationsSync.lastSummary = message.summary || null;
            this.alterationsSync.lastError = null;
            finalize({ ok: true, summary: message.summary || null });
          } else {
            const errorMessage = toText(message.error) || "Alterations sync failed.";
            this.alterationsSync.lastError = errorMessage;
            finalize({ ok: false, error: errorMessage });
          }
        });

        worker.on("error", (error) => {
          this.alterationsSync.lastFinishedAt = new Date().toISOString();
          this.alterationsSync.lastDurationMs = Math.max(0, Date.now() - startedMs);
          const errorMessage = error?.message || String(error || "Alterations sync worker crashed.");
          this.alterationsSync.lastError = errorMessage;
          finalize({ ok: false, error: errorMessage });
        });

        worker.on("exit", (code) => {
          if (resolved) return;
          this.alterationsSync.lastFinishedAt = new Date().toISOString();
          this.alterationsSync.lastDurationMs = Math.max(0, Date.now() - startedMs);
          const errorMessage = `Alterations sync worker exited (${Number(code || 0)}).`;
          this.alterationsSync.lastError = errorMessage;
          finalize({ ok: false, error: errorMessage });
        });
      });
    } catch (error) {
      this.alterationsSync.lastFinishedAt = new Date().toISOString();
      this.alterationsSync.lastDurationMs = Math.max(0, Date.now() - startedMs);
      const errorMessage = error?.message || String(error || "Failed to start alterations sync worker.");
      this.alterationsSync.lastError = errorMessage;
      this.alterationsSync.worker = null;
      this.alterationsSync.promise = null;
      this.alterationsSync.running = false;
      const status = this.getAlterationsSyncStatus();
      return wait
        ? Promise.resolve({ ok: false, error: errorMessage, status })
        : { ok: false, error: errorMessage, status };
    }

    this.alterationsSync.promise = runPromise;
    return wait ? runPromise : { ok: true, started: true, status: this.getAlterationsSyncStatus() };
  }
}

export { AlterationSyncService, createAlterationsSyncState };
