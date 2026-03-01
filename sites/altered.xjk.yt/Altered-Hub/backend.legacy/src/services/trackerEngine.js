class TrackerEngine {
  constructor({
    repository,
    provider,
    enabled = true,
    tickSeconds = 20,
    batchSize = 6,
    maxCheckIntervalSeconds = 0,
    logger = console,
  }) {
    this.repository = repository;
    this.provider = provider;
    this.enabled = Boolean(enabled);
    this.tickSeconds = Math.max(3, Number(tickSeconds) || 20);
    this.batchSize = Math.max(1, Number(batchSize) || 6);
    this.maxCheckIntervalSeconds = Math.max(0, Number(maxCheckIntervalSeconds) || 0);
    this.logger = logger;

    this.timer = null;
    this.running = false;
    this.state = {
      enabled: this.enabled,
      provider: this.provider?.name || "unknown",
      tickSeconds: this.tickSeconds,
      batchSize: this.batchSize,
      maxCheckIntervalSeconds: this.maxCheckIntervalSeconds,
      startedAt: null,
      lastStartedAt: null,
      lastFinishedAt: null,
      lastRun: null,
      lastError: null,
      totalRuns: 0,
      totalChecked: 0,
      totalChanges: 0,
      lastIdleLogAt: null,
    };
  }

  start() {
    if (!this.enabled) {
      this.logger.log("[tracker] disabled (TRACKER_ENABLED=0)");
      return;
    }
    if (this.timer) return;

    this.state.startedAt = new Date().toISOString();
    this.logger.log(
      `[tracker] started provider=${this.state.provider} tick=${this.tickSeconds}s batch=${this.batchSize}`
    );

    this.runNow({ reason: "startup" }).catch((error) => {
      this.logger.error(`[tracker] startup run failed: ${error?.message || error}`);
    });

    this.timer = setInterval(() => {
      this.runNow({ reason: "scheduled" }).catch((error) => {
        this.logger.error(`[tracker] scheduled run failed: ${error?.message || error}`);
      });
    }, this.tickSeconds * 1000);
  }

  stop() {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  getStatus() {
    return {
      ...this.state,
      timerActive: Boolean(this.timer),
      running: this.running,
    };
  }

  async runNow({ reason = "manual" } = {}) {
    if (!this.enabled) {
      return {
        skipped: true,
        reason: "disabled",
      };
    }
    if (this.running) {
      return {
        skipped: true,
        reason: "already-running",
      };
    }

    this.running = true;
    try {
      const startedAt = new Date().toISOString();
      this.state.lastStartedAt = startedAt;

      const dueMaps = this.repository.getDueTrackedMaps({
        limit: this.batchSize,
        nowIso: startedAt,
        maxCheckIntervalSeconds: this.maxCheckIntervalSeconds,
      });

      if (!dueMaps.length) {
        const finishedAt = new Date().toISOString();
        this.state.lastFinishedAt = finishedAt;
        this.state.lastRun = {
          runId: null,
          startedAt,
          finishedAt,
          mapsConsidered: 0,
          mapsChecked: 0,
          wrChanges: 0,
          provider: this.provider?.name || "unknown",
          note: `${reason}-idle`,
        };
        const nowMs = Date.now();
        const lastIdleMs = Date.parse(this.state.lastIdleLogAt || "");
        if (!Number.isFinite(lastIdleMs) || nowMs - lastIdleMs >= 60000) {
          this.logger.log(`[tracker] idle reason=${reason} no maps due`);
          this.state.lastIdleLogAt = new Date(nowMs).toISOString();
        }
        return this.state.lastRun;
      }

      let wrChanges = 0;
      const checks = [];

      for (const map of dueMaps) {
        const checkedAt = new Date().toISOString();
        let changed = false;
        let oldWrTime = Number(map.wrMs || 0);
        let oldHolder = String(map.wrHolder || "");
        let newWrTime = oldWrTime;
        let newHolder = oldHolder;
        let source = this.provider?.name || "unknown";
        let note = "checked";

        try {
          const result = (await this.provider.checkMap(map)) || {};
          source = String(result.source || source || "unknown");
          note = String(result.note || note);

          const candidateWr = Number(result.wrMs || 0);
          const candidateHolder = String(result.displayName || "").trim();
          const candidateAccountId =
            String(result.accountId || "").trim() ||
            `acc-${(candidateHolder || "unknown").toLowerCase()}`;

          if (
            result.changed &&
            Number.isFinite(candidateWr) &&
            candidateWr > 0 &&
            (oldWrTime <= 0 || candidateWr < oldWrTime)
          ) {
            const event = this.repository.insertWrEvent({
              mapUid: map.uid,
              accountId: candidateAccountId,
              displayName: candidateHolder || "Unknown",
              recordTime: candidateWr,
              timestamp: checkedAt,
            });
            if (event) {
              changed = true;
              wrChanges += 1;
              newWrTime = Number(event.wrMs || candidateWr);
              newHolder = String(event.holder || candidateHolder || "Unknown");
            } else {
              this.repository.touchMapCheckedAt(map.uid, checkedAt);
            }
          } else {
            this.repository.touchMapCheckedAt(map.uid, checkedAt);
          }
        } catch (error) {
          note = `error:${error?.message || "unknown"}`;
          this.repository.touchMapCheckedAt(map.uid, checkedAt);
        }

        checks.push({
          mapUid: map.uid,
          checkedAt,
          changed,
          oldWrTime,
          newWrTime,
          oldHolder,
          newHolder,
          source,
          note,
        });
      }

      const finishedAt = new Date().toISOString();
      const persistedRun = this.repository.recordTrackerRun({
        startedAt,
        finishedAt,
        mapsConsidered: dueMaps.length,
        mapsChecked: checks.length,
        wrChanges,
        provider: this.provider?.name || "unknown",
        note: reason,
        checks,
      });

      this.state.lastFinishedAt = finishedAt;
      this.state.lastRun = persistedRun;
      this.state.totalRuns += 1;
      this.state.totalChecked += checks.length;
      this.state.totalChanges += wrChanges;
      this.state.lastError = null;

      this.logger.log(
        `[tracker] run#${persistedRun.runId} reason=${reason} checked=${checks.length} changes=${wrChanges}`
      );

      return persistedRun;
    } catch (error) {
      this.state.lastError = {
        at: new Date().toISOString(),
        message: error?.message || String(error),
      };
      throw error;
    } finally {
      this.running = false;
    }
  }
}

export { TrackerEngine };
