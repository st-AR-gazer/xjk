import {
  WEEKLY_SHORTS_SOURCE_KEY,
  OFFICIAL_SEASONAL_SOURCE_KEY,
  TOTD_SOURCE_KEY,
  WEEKLY_GRANDS_SOURCE_KEY,
  COMPETITION_SOURCE_KEY,
  DISCOVERY_SOURCE_KEY,
  LEGACY_SOURCE_KEY,
  toText,
} from "../serviceSupport.js";

class ProjectSourceScheduler {
  constructor({
    logger,
    projectSourceSync,
    getProjectSources,
    computeProjectSourceNextRunMs,
    syncOfficialSeasonalSource,
    syncTotdSource,
    syncWeeklyGrandsSource,
    syncCompetitionSource,
    syncDiscoverySource,
    syncLegacySource,
    syncWeeklyShortsSource,
    runSourceSync,
    runDueSyncs,
    scheduleNextRun,
  }) {
    this.logger = logger;
    this.projectSourceSync = projectSourceSync;
    this.getProjectSources = getProjectSources;
    this.computeProjectSourceNextRunMs = computeProjectSourceNextRunMs;
    this.syncOfficialSeasonalSource = syncOfficialSeasonalSource;
    this.syncTotdSource = syncTotdSource;
    this.syncWeeklyGrandsSource = syncWeeklyGrandsSource;
    this.syncCompetitionSource = syncCompetitionSource;
    this.syncDiscoverySource = syncDiscoverySource;
    this.syncLegacySource = syncLegacySource;
    this.syncWeeklyShortsSource = syncWeeklyShortsSource;
    this.runSourceSync = runSourceSync;
    this.runDueSyncs = runDueSyncs;
    this.scheduleNextRun = scheduleNextRun;
  }

  async syncProjectSourceByKey(sourceKey, options = {}) {
    const authContext = options?.authContext || null;
    const key = toText(sourceKey).toLowerCase();
    if (key === OFFICIAL_SEASONAL_SOURCE_KEY) return this.syncOfficialSeasonalSource({ authContext });
    if (key === TOTD_SOURCE_KEY) return this.syncTotdSource({ authContext });
    if (key === WEEKLY_GRANDS_SOURCE_KEY) return this.syncWeeklyGrandsSource({ authContext });
    if (key === COMPETITION_SOURCE_KEY) return this.syncCompetitionSource({ authContext });
    if (key === DISCOVERY_SOURCE_KEY) return this.syncDiscoverySource({ authContext });
    if (key === LEGACY_SOURCE_KEY) return this.syncLegacySource({ authContext });
    if (key === WEEKLY_SHORTS_SOURCE_KEY) {
      return this.syncWeeklyShortsSource({
        authContext,
        importLocalFiles: options?.importLocalFiles === undefined ? true : Boolean(options.importLocalFiles),
        importRoots: Array.isArray(options?.importRoots) ? options.importRoots : [],
      });
    }
    return { error: `Unsupported project source '${sourceKey}'.` };
  }

  async runDueProjectSourceSyncs({ reason = "schedule", fromTimeMs = Date.now() } = {}) {
    if (this.projectSourceSync.running) {
      return {
        ok: true,
        skipped: true,
        reason: "project-source-sync already running",
      };
    }

    const sources = this.getProjectSources({ includeDisabled: false });
    const dueSources = sources
      .map((source) => ({
        source,
        nextRunMs: this.computeProjectSourceNextRunMs(source, { fromTimeMs }),
      }))
      .filter((entry) => Number.isFinite(entry.nextRunMs) && entry.nextRunMs <= fromTimeMs)
      .sort((left, right) => left.nextRunMs - right.nextRunMs);

    if (!dueSources.length) {
      return {
        ok: true,
        processedSources: 0,
        sourceResults: [],
      };
    }

    this.projectSourceSync.running = true;
    this.projectSourceSync.lastStartedAt = new Date().toISOString();
    this.projectSourceSync.lastError = null;
    const results = [];

    try {
      for (const entry of dueSources) {
        const sourceKey = toText(entry?.source?.sourceKey);
        this.projectSourceSync.currentSourceKey = sourceKey || null;
        const result = await this.runSourceSync(sourceKey);
        results.push({
          sourceKey,
          ok: !result?.error,
          error: result?.error || null,
          campaignsSeen: Number(result?.ingest?.campaignsSeen || 0),
          mapsSeen: Number(result?.ingest?.mapsSeen || 0),
        });
      }

      const failed = results.filter((entry) => entry.error);
      this.projectSourceSync.lastError =
        failed.length > 0 ? failed.map((entry) => `${entry.sourceKey}: ${entry.error}`).join(" | ") : null;
      this.projectSourceSync.lastSummary = {
        reason,
        processedSources: results.length,
        syncedSources: results.filter((entry) => entry.ok).length,
        failedSources: failed.length,
        sourceResults: results,
      };
      this.projectSourceSync.lastFinishedAt = new Date().toISOString();
      return {
        ok: failed.length === 0,
        processedSources: results.length,
        sourceResults: results,
        error: this.projectSourceSync.lastError,
      };
    } finally {
      this.projectSourceSync.running = false;
      this.projectSourceSync.currentSourceKey = null;
      this.scheduleNextRun({ fromTimeMs: Date.now() });
    }
  }

  scheduleNextProjectSourceSyncRun({ fromTimeMs = Date.now() } = {}) {
    if (this.projectSourceSync.timer) {
      clearTimeout(this.projectSourceSync.timer);
      this.projectSourceSync.timer = null;
    }

    const sources = this.getProjectSources({ includeDisabled: false });
    const nextEntry =
      sources
        .map((source) => ({
          sourceKey: toText(source?.sourceKey),
          nextRunMs: this.computeProjectSourceNextRunMs(source, { fromTimeMs }),
        }))
        .filter((entry) => Number.isFinite(entry.nextRunMs))
        .sort((left, right) => left.nextRunMs - right.nextRunMs)[0] || null;

    if (!nextEntry) {
      this.projectSourceSync.nextRunAt = null;
      return null;
    }

    const nextRunAt = new Date(nextEntry.nextRunMs).toISOString();
    const delayMs = Math.max(1000, nextEntry.nextRunMs - Date.now());
    this.projectSourceSync.nextRunAt = nextRunAt;
    this.projectSourceSync.timer = setTimeout(() => {
      this.projectSourceSync.timer = null;
      this.runDueSyncs({
        reason: "schedule",
        fromTimeMs: Date.now(),
      }).catch((error) => {
        const message = error?.message || "Project source scheduled sync failed.";
        this.projectSourceSync.lastError = message;
        this.projectSourceSync.lastFinishedAt = new Date().toISOString();
        this.logger.warn(`[altered-project-source] scheduled sync failed: ${message}`);
        this.scheduleNextRun({ fromTimeMs: Date.now() });
      });
    }, delayMs);
    this.projectSourceSync.timer.unref?.();
    return nextRunAt;
  }

  startProjectSourceSyncScheduler() {
    this.scheduleNextRun({ fromTimeMs: Date.now() });
    return true;
  }

  stopProjectSourceSyncScheduler() {
    if (this.projectSourceSync.timer) {
      clearTimeout(this.projectSourceSync.timer);
      this.projectSourceSync.timer = null;
    }
    this.projectSourceSync.nextRunAt = null;
    this.projectSourceSync.running = false;
    this.projectSourceSync.currentSourceKey = null;
    return true;
  }
}

export { ProjectSourceScheduler };
