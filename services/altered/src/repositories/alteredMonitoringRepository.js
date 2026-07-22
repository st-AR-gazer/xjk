import { utcNowIso } from "../../../shared/valueUtils.js";
import { normalizeClubMonitoringData } from "./alteredMonitoring/normalization.js";
import { createMonitoringCounters, persistClubMonitoringData } from "./alteredMonitoring/persistence.js";
import { getClubMonitoringCounts, listKnownIds } from "./alteredMonitoring/queries.js";
import { clampInt, DEFAULT_HOOK_KEY } from "./alteredRepositorySupport.js";

class AlteredMonitoringRepository {
  constructor({ db, configurationRepository }) {
    this.db = db;
    this.configurationRepository = configurationRepository;
  }

  listHookRuns(limit = 30, hookKey = DEFAULT_HOOK_KEY) {
    const rows = this.db
      .prepare(
        `SELECT
           run_id AS runId,
           started_at AS startedAt,
           finished_at AS finishedAt,
           campaigns_seen AS campaignsSeen,
           maps_seen AS mapsSeen,
           maps_inserted AS mapsInserted,
           maps_updated AS mapsUpdated,
           maps_linked AS mapsLinked,
           status,
           note
         FROM altered_sync_runs
         WHERE hook_key = ?
         ORDER BY run_id DESC
         LIMIT ?`
      )
      .all(hookKey, Math.max(1, Math.min(Number(limit) || 30, 300)));

    return rows.map((row) => ({
      runId: Number(row.runId || 0),
      startedAt: row.startedAt,
      finishedAt: row.finishedAt,
      campaignsSeen: Number(row.campaignsSeen || 0),
      mapsSeen: Number(row.mapsSeen || 0),
      mapsInserted: Number(row.mapsInserted || 0),
      mapsUpdated: Number(row.mapsUpdated || 0),
      mapsLinked: Number(row.mapsLinked || 0),
      status: row.status || "ok",
      note: row.note || "",
    }));
  }

  getHookStatus(hookKey = DEFAULT_HOOK_KEY) {
    const hook = this.configurationRepository.getHookConfig(hookKey);
    if (!hook) return null;
    return {
      ...hook,
      ...getClubMonitoringCounts(this.db, hook.clubId, { global: hookKey === DEFAULT_HOOK_KEY }),
      latestRun: this.listHookRuns(1, hookKey)[0] || null,
    };
  }

  listHookStatuses({ includeDisabled = true } = {}) {
    return this.configurationRepository.listHookConfigs({ includeDisabled }).map((hook) => ({
      ...hook,
      ...getClubMonitoringCounts(this.db, hook.clubId),
      latestRun: this.listHookRuns(1, hook.hookKey)[0] || null,
    }));
  }

  getKnownCampaignExternalIds({ clubId, campaignExternalIds = [] } = {}) {
    return listKnownIds(this.db, "campaigns", { clubId, values: campaignExternalIds });
  }

  getKnownActivityIds({ clubId, activityIds = [] } = {}) {
    return listKnownIds(this.db, "activities", { clubId, values: activityIds });
  }

  getKnownUploadBucketIds({ clubId, bucketIds = [] } = {}) {
    return listKnownIds(this.db, "uploadBuckets", { clubId, values: bucketIds });
  }

  upsertClubMonitoringData({ clubId, members = [], activities = [], uploadBuckets = [] } = {}) {
    const safeClubId = clampInt(clubId, { min: 1, max: 2147483647, fallback: 0 });
    if (!safeClubId) return { error: "clubId is required." };

    const counters = createMonitoringCounters();
    try {
      return persistClubMonitoringData(this.db, {
        clubId: safeClubId,
        records: normalizeClubMonitoringData({ members, activities, uploadBuckets }),
        now: utcNowIso(),
        counters,
      });
    } catch (error) {
      return {
        error: error?.message || "Failed to upsert club monitoring data.",
        ...counters,
      };
    }
  }
}

export { AlteredMonitoringRepository };
