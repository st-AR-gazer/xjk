import { Worker, isMainThread, clampInt, toText } from "../serviceSupport.js";

class DetachedJobService {
  constructor({
    liveMonitor,
    logger,
    getAlterationsSync,
    getMapCopy,
    runLiveMonitorCycle,
    runLiveDiscoveryCycle,
    updateLiveProgress,
  }) {
    this.liveMonitor = liveMonitor;
    this.logger = logger;
    this.getAlterationsSync = getAlterationsSync;
    this.getMapCopy = getMapCopy;
    this.runLiveMonitorCycle = runLiveMonitorCycle;
    this.runLiveDiscoveryCycle = runLiveDiscoveryCycle;
    this.updateLiveProgress = updateLiveProgress;
  }

  get alterationsSync() {
    return this.getAlterationsSync();
  }

  get mapCopy() {
    return this.getMapCopy();
  }

  getDetachedJobBlocker() {
    if (this.mapCopy.running) return { skipped: true, reason: "map-local-copy-backfill running" };
    if (this.liveMonitor.running || this.liveMonitor.discoveryRunning) {
      return { skipped: true, reason: "monitor already running" };
    }
    if (this.alterationsSync.running) return { skipped: true, reason: "alterations-sync running" };
    return null;
  }

  forwardWorkerProgress(message, { reason, startedAt, runId } = {}) {
    const workerProgress =
      message?.progress && typeof message.progress === "object"
        ? message.progress
        : message?.liveStatus?.monitor?.progress && typeof message.liveStatus.monitor.progress === "object"
          ? message.liveStatus.monitor.progress
          : null;
    if (!workerProgress) return false;
    const forwardedProgress = { ...workerProgress };
    delete forwardedProgress.runId;
    delete forwardedProgress.reason;
    this.updateLiveProgress({
      ...(runId === undefined ? {} : { runId }),
      reason,
      startedAt: forwardedProgress.startedAt || startedAt,
      ...forwardedProgress,
    });
    return true;
  }

  _runLiveJobInWorker({
    job = "",
    reason = "job-worker",
    authContext = null,
    timeoutMs = null,
    onProgress = null,
  } = {}) {
    const safeJob = toText(job).toLowerCase();
    const safeReason = toText(reason) || "job-worker";
    const safeTimeoutMs = clampInt(timeoutMs, {
      min: 10000,
      max: 6 * 60 * 60 * 1000,
      fallback: 45 * 60 * 1000,
    });
    const workerUrl = new URL("../../../workers/liveMonitorWorker.js", import.meta.url);

    return new Promise((resolve) => {
      let worker = null;
      try {
        worker = new Worker(workerUrl, {
          type: "module",
          workerData: {
            job: safeJob,
            reason: safeReason,
            authContext,
          },
        });
      } catch (error) {
        resolve({
          ok: false,
          job: safeJob,
          reason: safeReason,
          error: error?.message || String(error || "Failed to start live job worker."),
        });
        return;
      }

      let settled = false;
      let timer = null;
      const finish = (payload) => {
        if (settled) return;
        settled = true;
        if (timer) {
          clearTimeout(timer);
          timer = null;
        }
        try {
          worker.terminate();
        } catch {}
        resolve(payload);
      };

      const armTimer = () => {
        if (timer) clearTimeout(timer);
        timer = setTimeout(() => {
          finish({
            ok: false,
            job: safeJob,
            reason: safeReason,
            error: `Live job worker stopped reporting progress for ${safeTimeoutMs}ms.`,
          });
        }, safeTimeoutMs);
        timer.unref?.();
      };
      armTimer();

      worker.on("message", (message) => {
        if (!message || typeof message !== "object") return;
        if (message.type === "progress") {
          armTimer();
          try {
            if (typeof onProgress === "function") onProgress(message);
          } catch (error) {
            this.logger?.warn?.(`[altered-live] failed to relay worker progress: ${error?.message || error}`);
          }
          return;
        }
        if (message.type !== "complete") return;
        finish(message);
      });

      worker.on("error", (error) => {
        finish({
          ok: false,
          job: safeJob,
          reason: safeReason,
          error: error?.message || String(error || "Live job worker crashed."),
        });
      });

      worker.on("exit", (code) => {
        if (settled) return;
        finish({
          ok: false,
          job: safeJob,
          reason: safeReason,
          error: `Live job worker exited (${Number(code || 0)}).`,
        });
      });
    });
  }

  async runLiveMonitorCycleDetached({ reason = "manual", authContext = null } = {}) {
    if (!isMainThread) {
      return this.runLiveMonitorCycle({ reason, authContext });
    }
    const blocker = this.getDetachedJobBlocker();
    if (blocker) return blocker;

    const startedAt = new Date().toISOString();
    const startedMs = Date.now();
    this.liveMonitor.runCounter += 1;
    const runId = this.liveMonitor.runCounter;
    this.liveMonitor.running = true;
    this.liveMonitor.lastStartedAt = startedAt;
    this.liveMonitor.lastDurationMs = null;
    this.liveMonitor.lastError = null;
    this.updateLiveProgress({
      runId,
      reason,
      status: "running",
      phase: "job-worker",
      percent: 0,
      startedAt,
      finishedAt: null,
      message: "Starting live club sync (worker).",
      counters: {},
      replaceCounters: true,
    });

    try {
      const jobResult = await this._runLiveJobInWorker({
        job: "monitor",
        reason,
        authContext,
        timeoutMs: Number(process.env.ALTERED_LIVE_JOB_WORKER_TIMEOUT_MS || 45 * 60 * 1000),
        onProgress: (message) => this.forwardWorkerProgress(message, { runId, reason, startedAt }),
      });

      const finishedAt = jobResult.finishedAt || new Date().toISOString();
      const durationMs = Math.max(0, Number(jobResult.durationMs || 0) || Date.now() - startedMs);

      if (!jobResult.ok) {
        const message = toText(jobResult.error) || "Live monitor worker failed.";
        this.liveMonitor.lastError = message;
        this.liveMonitor.lastFinishedAt = finishedAt;
        this.liveMonitor.lastDurationMs = durationMs;
        this.updateLiveProgress({
          runId,
          reason,
          status: "error",
          phase: "failed",
          percent: this.liveMonitor.progress?.percent || 0,
          finishedAt,
          durationMs,
          message,
        });
        return { error: message };
      }

      const liveStatus = jobResult.liveStatus?.monitor || null;
      if (liveStatus?.lastSummary !== undefined) this.liveMonitor.lastSummary = liveStatus.lastSummary;
      if (liveStatus?.lastError !== undefined) this.liveMonitor.lastError = liveStatus.lastError;
      if (liveStatus?.lastFinishedAt) this.liveMonitor.lastFinishedAt = liveStatus.lastFinishedAt;
      else this.liveMonitor.lastFinishedAt = finishedAt;
      if (liveStatus?.lastDurationMs !== undefined) this.liveMonitor.lastDurationMs = liveStatus.lastDurationMs;
      else this.liveMonitor.lastDurationMs = durationMs;

      const result = jobResult.result;
      if (result?.error) {
        const message = toText(result.error) || "Live monitor cycle failed.";
        this.liveMonitor.lastError = message;
        this.updateLiveProgress({
          runId,
          reason,
          status: "error",
          phase: "failed",
          percent: this.liveMonitor.progress?.percent || 0,
          finishedAt: this.liveMonitor.lastFinishedAt,
          durationMs: this.liveMonitor.lastDurationMs,
          message,
        });
        return result;
      }

      this.updateLiveProgress({
        runId,
        reason,
        status: "ok",
        phase: "complete",
        percent: 100,
        finishedAt: this.liveMonitor.lastFinishedAt || finishedAt,
        durationMs: this.liveMonitor.lastDurationMs || durationMs,
        message: this.liveMonitor.progress?.message || "Live monitor sync complete.",
        counters: this.liveMonitor.progress?.counters || {},
      });
      return result;
    } finally {
      this.liveMonitor.running = false;
    }
  }

  async runLiveDiscoveryCycleDetached({ reason = "hourly-discovery", authContext = null } = {}) {
    if (!isMainThread) {
      return this.runLiveDiscoveryCycle({ reason, authContext });
    }
    const blocker = this.getDetachedJobBlocker();
    if (blocker) return blocker;

    const startedAt = new Date().toISOString();
    const startedMs = Date.now();
    this.liveMonitor.discoveryRunning = true;
    this.liveMonitor.lastDiscoveryStartedAt = startedAt;
    this.liveMonitor.lastDiscoveryDurationMs = null;
    this.liveMonitor.lastDiscoveryError = null;
    this.updateLiveProgress({
      reason,
      status: "running",
      phase: "job-worker-discovery",
      percent: 0,
      startedAt,
      finishedAt: null,
      message: "Starting hourly discovery cycle (worker).",
      counters: {},
      replaceCounters: true,
    });

    try {
      const jobResult = await this._runLiveJobInWorker({
        job: "discovery",
        reason,
        authContext,
        timeoutMs: Number(process.env.ALTERED_LIVE_JOB_WORKER_TIMEOUT_MS || 45 * 60 * 1000),
        onProgress: (message) => this.forwardWorkerProgress(message, { reason, startedAt }),
      });

      const finishedAt = jobResult.finishedAt || new Date().toISOString();
      const durationMs = Math.max(0, Number(jobResult.durationMs || 0) || Date.now() - startedMs);

      if (!jobResult.ok) {
        const message = toText(jobResult.error) || "Live discovery worker failed.";
        this.liveMonitor.lastDiscoveryError = message;
        this.liveMonitor.lastDiscoveryFinishedAt = finishedAt;
        this.liveMonitor.lastDiscoveryDurationMs = durationMs;
        this.updateLiveProgress({
          reason,
          status: "error",
          phase: "discovery-failed",
          percent: this.liveMonitor.progress?.percent || 0,
          finishedAt,
          durationMs,
          message,
        });
        return { error: message };
      }

      const liveStatus = jobResult.liveStatus?.monitor || null;
      if (liveStatus?.lastDiscoverySummary !== undefined) {
        this.liveMonitor.lastDiscoverySummary = liveStatus.lastDiscoverySummary;
      }
      if (liveStatus?.lastDiscoveryError !== undefined) {
        this.liveMonitor.lastDiscoveryError = liveStatus.lastDiscoveryError;
      }
      if (liveStatus?.lastDiscoveryFinishedAt) {
        this.liveMonitor.lastDiscoveryFinishedAt = liveStatus.lastDiscoveryFinishedAt;
      } else {
        this.liveMonitor.lastDiscoveryFinishedAt = finishedAt;
      }
      if (liveStatus?.lastDiscoveryDurationMs !== undefined) {
        this.liveMonitor.lastDiscoveryDurationMs = liveStatus.lastDiscoveryDurationMs;
      } else {
        this.liveMonitor.lastDiscoveryDurationMs = durationMs;
      }

      const result = jobResult.result;
      if (result?.error) {
        const message = toText(result.error) || "Live discovery cycle failed.";
        this.liveMonitor.lastDiscoveryError = message;
        this.updateLiveProgress({
          reason,
          status: "error",
          phase: "discovery-failed",
          percent: this.liveMonitor.progress?.percent || 0,
          finishedAt: this.liveMonitor.lastDiscoveryFinishedAt,
          durationMs: this.liveMonitor.lastDiscoveryDurationMs,
          message,
        });
        return result;
      }

      this.updateLiveProgress({
        reason,
        status: "ok",
        phase: "discovery-complete",
        percent: 100,
        finishedAt: this.liveMonitor.lastDiscoveryFinishedAt || finishedAt,
        durationMs: this.liveMonitor.lastDiscoveryDurationMs || durationMs,
        message: this.liveMonitor.progress?.message || "Hourly discovery complete.",
        counters: this.liveMonitor.progress?.counters || {},
      });

      return result;
    } finally {
      this.liveMonitor.discoveryRunning = false;
    }
  }
}

export { DetachedJobService };
