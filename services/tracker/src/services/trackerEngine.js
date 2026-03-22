class TrackerEngine {
  constructor({
    repository,
    provider,
    enabled = true,
    mode = "wr",
    leaderboardTopN = 100,
    tickSeconds = 20,
    batchSize = 6,
    maxCheckIntervalSeconds = 0,
    aggregatorReporter = null,
    wrWebhookReporter = null,
    realtimeHub = null,
    logger = console,
  }) {
    this.repository = repository;
    this.provider = provider;
    this.enabled = Boolean(enabled);
    this.mode = String(mode || "").toLowerCase() === "leaderboard" ? "leaderboard" : "wr";
    this.leaderboardTopN = Math.max(1, Math.min(Number(leaderboardTopN) || 100, 1000));
    this.tickSeconds = Math.max(3, Number(tickSeconds) || 20);
    this.batchSize = Math.max(1, Number(batchSize) || 6);
    this.maxCheckIntervalSeconds = Math.max(0, Number(maxCheckIntervalSeconds) || 0);
    this.aggregatorReporter = aggregatorReporter;
    this.wrWebhookReporter = wrWebhookReporter;
    this.realtimeHub = realtimeHub;
    this.logger = logger;

    this.timer = null;
    this.running = false;
    this.state = {
      enabled: this.enabled,
      provider: this.provider?.name || "unknown",
      mode: this.mode,
      leaderboardTopN: this.leaderboardTopN,
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
      `[tracker] started mode=${this.mode} provider=${this.state.provider} tick=${this.tickSeconds}s batch=${this.batchSize}`
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

  setConfig({
    enabled,
    tickSeconds,
    batchSize,
    maxCheckIntervalSeconds,
    leaderboardTopN,
  } = {}) {
    const prevTickSeconds = this.tickSeconds;
    const prevEnabled = this.enabled;

    if (enabled !== undefined) {
      this.enabled = Boolean(enabled);
      this.state.enabled = this.enabled;
    }
    if (tickSeconds !== undefined && Number.isFinite(Number(tickSeconds))) {
      this.tickSeconds = Math.max(3, Number(tickSeconds) || this.tickSeconds);
      this.state.tickSeconds = this.tickSeconds;
    }
    if (batchSize !== undefined && Number.isFinite(Number(batchSize))) {
      this.batchSize = Math.max(1, Number(batchSize) || this.batchSize);
      this.state.batchSize = this.batchSize;
    }
    if (
      maxCheckIntervalSeconds !== undefined &&
      Number.isFinite(Number(maxCheckIntervalSeconds))
    ) {
      this.maxCheckIntervalSeconds = Math.max(
        0,
        Number(maxCheckIntervalSeconds) || this.maxCheckIntervalSeconds
      );
      this.state.maxCheckIntervalSeconds = this.maxCheckIntervalSeconds;
    }
    if (leaderboardTopN !== undefined && Number.isFinite(Number(leaderboardTopN))) {
      this.leaderboardTopN = Math.max(1, Math.min(Number(leaderboardTopN) || this.leaderboardTopN, 1000));
      this.state.leaderboardTopN = this.leaderboardTopN;
    }

    if (prevEnabled && !this.enabled) {
      this.stop();
    } else if (!prevEnabled && this.enabled) {
      this.start();
    } else if (this.enabled && this.timer && prevTickSeconds !== this.tickSeconds) {
      this.stop();
      this.start();
    }

    return this.getStatus();
  }

  getStatus() {
    return {
      ...this.state,
      timerActive: Boolean(this.timer),
      running: this.running,
      providerReady:
        typeof this.provider?.isReady === "boolean"
          ? this.provider.isReady
          : Boolean(this.provider),
      mode: this.mode,
      leaderboardTopN: this.leaderboardTopN,
      aggregatorEnabled: Boolean(this.aggregatorReporter?.isReady),
      wrWebhookEnabled: Boolean(this.wrWebhookReporter?.isReady),
      realtimeClients: Number(this.realtimeHub?.getStatus?.().connectedClients || 0),
    };
  }

  async reportRunToAggregator({ run, checks = [] } = {}) {
    if (!this.aggregatorReporter?.isReady) return;
    try {
      await this.aggregatorReporter.reportTrackerRun({
        run,
        checks,
      });
      await this.aggregatorReporter.heartbeatInstance({
        status: "online",
        meta: {
          provider: this.provider?.name || "unknown",
          lastRunId: Number(run?.runId || 0),
          mapsChecked: Number(run?.mapsChecked || 0),
          wrChanges: Number(run?.wrChanges || 0),
        },
      });
    } catch (error) {
      this.logger.warn(`[tracker] aggregator report failed: ${error?.message || error}`);
    }
  }

  async reportWrEventsToWebhook({ run, events = [] } = {}) {
    if (!this.wrWebhookReporter?.isReady) return;
    if (!Array.isArray(events) || !events.length) return;
    try {
      await this.wrWebhookReporter.sendEvents(events, { run });
    } catch (error) {
      this.logger.warn(`[tracker] WR webhook report failed: ${error?.message || error}`);
    }
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
        await this.reportRunToAggregator({
          run: this.state.lastRun,
          checks: [],
        });
        this.realtimeHub?.broadcast("tracker-update", {
          at: finishedAt,
          reason,
          status: "idle",
          run: this.state.lastRun,
        });
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
      const wrEvents = [];

      for (const map of dueMaps) {
        const checkedAt = new Date().toISOString();
        let changed = false;
        let oldWrTime = Number(map.wrMs || 0);
        let oldHolder = String(map.wrHolder || "");
        let oldHolderAccountId = String(map.wrAccountId || "").trim();
        let newWrTime = oldWrTime;
        let newHolder = oldHolder;
        let newHolderAccountId = oldHolderAccountId;
        let accountIds = [];
        let source = this.provider?.name || "unknown";
        let note = "checked";

        try {
          if (this.mode === "leaderboard") {
            const result =
              (await this.provider.checkMapLeaderboard?.(map, {
                length: this.leaderboardTopN,
              })) || {};
            source = String(result.source || source || "unknown");
            note = String(result.note || note);

            const snapshot = this.repository.replaceLeaderboardSnapshot({
              mapUid: map.uid,
              entries: Array.isArray(result.entries) ? result.entries : [],
              checkedAt,
              source,
              note,
            });

            const top = snapshot?.top || null;
            if (top) {
              newWrTime = Number(top.score || 0);
              newHolder = String(top.displayName || "").trim() || "-";
              newHolderAccountId = String(top.accountId || "").trim();
              accountIds = Array.isArray(result.entries)
                ? result.entries
                    .map((entry) => String(entry?.accountId || "").trim())
                    .filter(Boolean)
                : [];
              changed =
                newWrTime > 0 &&
                (oldWrTime <= 0 ||
                  newWrTime < oldWrTime ||
                  (newWrTime === oldWrTime && newHolder && newHolder !== oldHolder));
            } else {
              this.repository.touchMapCheckedAt(map.uid, checkedAt);
            }
          } else {
            const result = (await this.provider.checkMap(map)) || {};
            source = String(result.source || source || "unknown");
            note = String(result.note || note);

            const candidateWr = Number(result.wrMs || 0);
            const candidateHolder = String(result.displayName || "").trim();
            const candidateAccountId =
              String(result.accountId || "").trim() ||
              `acc-${(candidateHolder || "unknown").toLowerCase()}`;
            const candidateRecordedAt = String(result.recordedAt || "").trim();

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
                timestamp: candidateRecordedAt || checkedAt,
              });
              if (event) {
                changed = true;
                newWrTime = Number(event.wrMs || candidateWr);
                newHolder = String(event.holder || candidateHolder || "Unknown");
                newHolderAccountId = String(result.accountId || "").trim();
                accountIds = newHolderAccountId ? [newHolderAccountId] : [];
                wrEvents.push(event);
              } else {
                this.repository.touchMapCheckedAt(map.uid, checkedAt);
              }
            } else {
              this.repository.touchMapCheckedAt(map.uid, checkedAt);
            }
          }
        } catch (error) {
          note = `error:${error?.message || "unknown"}`;
          this.repository.touchMapCheckedAt(map.uid, checkedAt);
        }

        if (changed) {
          wrChanges += 1;
        }

        checks.push({
          mapUid: map.uid,
          mapName: map.name,
          checkedAt,
          changed,
          oldWrTime,
          newWrTime,
          oldHolder,
          newHolder,
          oldHolderAccountId,
          newHolderAccountId,
          accountIds,
          source,
          note,
        });

        this.realtimeHub?.broadcast("map-checked", {
          at: checkedAt,
          reason,
          progress: {
            current: checks.length,
            total: dueMaps.length,
          },
          map: {
            uid: map.uid,
            name: map.name,
            campaign: map.campaign,
            slot: map.slot,
          },
          wr: {
            changed,
            oldMs: oldWrTime,
            newMs: newWrTime,
            oldHolder,
            newHolder,
          },
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

      await this.reportRunToAggregator({
        run: persistedRun,
        checks,
      });

      if (this.mode === "wr") {
        await this.reportWrEventsToWebhook({
          run: persistedRun,
          events: wrEvents,
        });
      }

      this.realtimeHub?.broadcast("tracker-update", {
        at: finishedAt,
        reason,
        status: "completed",
        run: {
          runId: Number(persistedRun.runId || 0),
          mapsChecked: Number(persistedRun.mapsChecked || 0),
          mapsConsidered: Number(persistedRun.mapsConsidered || 0),
          wrChanges: Number(persistedRun.wrChanges || 0),
          finishedAt: persistedRun.finishedAt || finishedAt,
        },
      });

      return persistedRun;
    } catch (error) {
      this.state.lastError = {
        at: new Date().toISOString(),
        message: error?.message || String(error),
      };
      this.realtimeHub?.broadcast("tracker-update", {
        at: this.state.lastError.at,
        reason,
        status: "error",
        error: this.state.lastError.message,
      });
      throw error;
    } finally {
      this.running = false;
    }
  }
}

export { TrackerEngine };
