import { clampInt, toText } from "../serviceSupport.js";

function createAggregate() {
  return {
    clubsSynced: 0,
    campaignsLoaded: 0,
    mapsLoaded: 0,
    mapDetailsLoaded: 0,
    mapsStored: 0,
    mapsInserted: 0,
    mapsUpdated: 0,
    mapsLinked: 0,
    membersLoaded: 0,
    activitiesSeen: 0,
    uploadBucketsLoaded: 0,
    uploadMapsLoaded: 0,
    membersStored: 0,
    activitiesStored: 0,
    uploadBucketsStored: 0,
    uploadMapsStored: 0,
    mapperAccountsSeen: 0,
    mapperNamesResolved: 0,
    mapperNamesUpdated: 0,
    mapperNameHistoryInserted: 0,
    mapperMapNameLinksUpdated: 0,
    clubs: [],
  };
}

function addResultToAggregate(aggregate, entry) {
  const summary = entry?.result?.fetched?.summary || {};
  const synced = entry?.result?.synced || {};
  const monitoring = synced?.monitoring || {};
  const mapperNames = synced?.mapperNames || {};
  aggregate.clubsSynced += 1;
  aggregate.campaignsLoaded += Number(summary.campaignsLoaded || 0);
  aggregate.mapsLoaded += Number(summary.mapsLoaded || 0);
  aggregate.mapDetailsLoaded += Number(summary.mapDetailsLoaded || 0);
  aggregate.mapsStored += Number(synced.mapsSeen || 0);
  aggregate.mapsInserted += Number(synced.mapsInserted || 0);
  aggregate.mapsUpdated += Number(synced.mapsUpdated || 0);
  aggregate.mapsLinked += Number(synced.mapsLinked || 0);
  aggregate.membersLoaded += Number(summary.membersLoaded || 0);
  aggregate.activitiesSeen += Number(summary.activitiesSeen || 0);
  aggregate.uploadBucketsLoaded += Number(summary.uploadBucketsLoaded || 0);
  aggregate.uploadMapsLoaded += Number(summary.uploadMapsLoaded || 0);
  aggregate.membersStored += Number(monitoring.membersSeen || 0);
  aggregate.activitiesStored += Number(monitoring.activitiesSeen || 0);
  aggregate.uploadBucketsStored += Number(monitoring.uploadBucketsSeen || 0);
  aggregate.uploadMapsStored += Number(monitoring.uploadMapsSeen || 0);
  aggregate.mapperAccountsSeen += Number(mapperNames.mapperAccountsSeen || 0);
  aggregate.mapperNamesResolved += Number(mapperNames.mapperNamesResolved || 0);
  aggregate.mapperNamesUpdated += Number(mapperNames.mapperNamesUpdated || 0);
  aggregate.mapperNameHistoryInserted += Number(mapperNames.mapperNameHistoryInserted || 0);
  aggregate.mapperMapNameLinksUpdated += Number(mapperNames.mapperMapNameLinksUpdated || 0);
  aggregate.clubs.push({
    hookKey: entry.hookKey,
    clubId: entry.clubId,
    clubName: entry.clubName,
    sourceLabel: entry.sourceLabel,
    primary: entry.primary,
    campaignsLoaded: Number(summary.campaignsLoaded || 0),
    mapsLoaded: Number(summary.mapsLoaded || 0),
    mapsStored: Number(synced.mapsSeen || 0),
    mapsInserted: Number(synced.mapsInserted || 0),
    mapsUpdated: Number(synced.mapsUpdated || 0),
    mapsLinked: Number(synced.mapsLinked || 0),
    lastWarning:
      Array.isArray(entry?.result?.fetched?.warnings) && entry.result.fetched.warnings.length
        ? String(entry.result.fetched.warnings[0] || "")
        : null,
  });
}

class MonitorSyncCycleRunner {
  constructor({
    liveMonitor,
    logger,
    getMapCopy,
    getAlterationCatalogService,
    getProjectClubsForSync,
    syncLiveClubSnapshot,
    updateLiveProgress,
  }) {
    this.liveMonitor = liveMonitor;
    this.logger = logger;
    this.getMapCopy = getMapCopy;
    this.getAlterationCatalogService = getAlterationCatalogService;
    this.getProjectClubsForSync = getProjectClubsForSync;
    this.syncLiveClubSnapshot = syncLiveClubSnapshot;
    this.updateLiveProgress = updateLiveProgress;
  }

  getSkipResult() {
    if (this.getMapCopy().running) {
      return { skipped: true, reason: "map-local-copy-backfill running" };
    }
    if (this.liveMonitor.running || this.liveMonitor.discoveryRunning) {
      return { skipped: true, reason: "monitor already running" };
    }
    return null;
  }

  start(reason) {
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
      phase: "queued",
      percent: 0,
      startedAt,
      finishedAt: null,
      message: "Starting live club sync.",
      counters: {},
      replaceCounters: true,
    });
    return { startedAt, startedMs, runId };
  }

  async syncTargets({ reason, authContext, run }) {
    const syncTargets = this.getProjectClubsForSync();
    const targetCount = Math.max(1, syncTargets.length);
    const results = [];

    for (let index = 0; index < syncTargets.length; index += 1) {
      const target = syncTargets[index];
      const clubLabel =
        toText(target?.clubName || "", `Club ${target?.clubId || index + 1}`) || `Club ${target?.clubId || index + 1}`;
      const startPercent = Math.floor((index * 100) / targetCount);
      const endPercent = Math.floor(((index + 1) * 100) / targetCount);
      const result = await this.syncLiveClubSnapshot({
        hookKey: target.hookKey || "altered-club",
        clubId: target.clubId,
        sourceLabel: target.sourceLabel || "altered-live-monitor",
        activityPageSize: this.liveMonitor.activityPageSize,
        activeOnly: this.liveMonitor.activeOnly,
        fetchMapDetails: this.liveMonitor.fetchMapDetails,
        note: `live-monitor:${reason}:${target.hookKey || target.clubId}`,
        authContext,
        onProgress: (partial) => {
          const partialPercent = clampInt(partial?.percent, { min: 0, max: 100, fallback: 0 });
          const scaledPercent = startPercent + Math.floor(((endPercent - startPercent) * partialPercent) / 100);
          this.updateLiveProgress({
            runId: run.runId,
            reason,
            status: "running",
            startedAt: run.startedAt,
            ...partial,
            percent: scaledPercent,
            message:
              targetCount > 1 && partial?.message
                ? `${clubLabel}: ${partial.message}`
                : partial?.message || `Syncing ${clubLabel}.`,
          });
        },
      });
      results.push({
        hookKey: target.hookKey || "altered-club",
        clubId: Number(target.clubId || 0),
        clubName: clubLabel,
        sourceLabel: target.sourceLabel || "altered-live-monitor",
        primary: Boolean(target.primary),
        result,
      });
      if (result?.error) {
        return { results, fatalError: `${clubLabel}: ${result.error}` };
      }
    }

    return { results, fatalError: null };
  }

  finishError({ reason, run, message, results = null, recordFinishedAt = false }) {
    const finishedAt = new Date().toISOString();
    const durationMs = Math.max(0, Date.now() - run.startedMs);
    this.liveMonitor.lastError = message;
    this.liveMonitor.lastDurationMs = durationMs;
    if (recordFinishedAt) this.liveMonitor.lastFinishedAt = finishedAt;
    this.updateLiveProgress({
      runId: run.runId,
      reason,
      status: "error",
      phase: "failed",
      percent: this.liveMonitor.progress?.percent || 0,
      finishedAt,
      durationMs,
      message,
    });
    return results ? { error: message, results } : { error: message };
  }

  finishSuccess({ reason, run, results }) {
    const aggregate = createAggregate();
    for (const entry of results) addResultToAggregate(aggregate, entry);

    const finishedAt = new Date().toISOString();
    const durationMs = Math.max(0, Date.now() - run.startedMs);
    this.liveMonitor.lastDurationMs = durationMs;
    this.updateLiveProgress({
      runId: run.runId,
      reason,
      status: "ok",
      phase: "complete",
      percent: 100,
      finishedAt,
      durationMs,
      message:
        aggregate.clubsSynced > 1
          ? `Synced ${aggregate.clubsSynced} clubs: ${aggregate.campaignsLoaded} campaigns, ${aggregate.mapsLoaded} maps.`
          : `Sync completed: ${aggregate.campaignsLoaded} campaigns, ${aggregate.mapsLoaded} maps.`,
      counters: { ...aggregate, durationMs },
    });
    this.liveMonitor.lastSummary = aggregate;
    this.liveMonitor.lastFinishedAt = finishedAt;

    try {
      this.getAlterationCatalogService().queueAlterationsSync({ reason: `post-live-monitor:${reason}` });
    } catch (error) {
      this.logger.warn(`[alterations-sync] post-cycle sync failed: ${error?.message || error}`);
    }
    return {
      fetched: { summary: aggregate },
      synced: {
        mapsSeen: aggregate.mapsStored,
        mapsInserted: aggregate.mapsInserted,
        mapsUpdated: aggregate.mapsUpdated,
        mapsLinked: aggregate.mapsLinked,
      },
      results,
    };
  }

  async run({ reason = "manual", authContext = null } = {}) {
    const skipped = this.getSkipResult();
    if (skipped) return skipped;
    const run = this.start(reason);

    try {
      const { results, fatalError } = await this.syncTargets({ reason, authContext, run });
      if (fatalError) return this.finishError({ reason, run, message: fatalError, results });
      return this.finishSuccess({ reason, run, results });
    } catch (error) {
      const message = error?.message || "Live monitor cycle failed.";
      const result = this.finishError({ reason, run, message, recordFinishedAt: true });
      this.logger.warn(`[altered-live] monitor cycle failed: ${message}`);
      return result;
    } finally {
      this.liveMonitor.running = false;
    }
  }
}

export { MonitorSyncCycleRunner };
