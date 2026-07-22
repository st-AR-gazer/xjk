import {
  clampInt,
  firstTimestamp,
  formatBucketLabel,
  parseJsonSafe,
  startOfUtcBucket,
} from "../alteredRepositorySupport.js";

class AlteredCatalogOverviewRepository {
  constructor(db) {
    this.db = db;
  }

  getSummary() {
    const trackedMaps =
      this.db.prepare("SELECT COUNT(*) AS count FROM altered_maps WHERE tracked = 1").get()?.count || 0;
    const campaignCount = this.db.prepare("SELECT COUNT(*) AS count FROM altered_campaigns").get()?.count || 0;
    const latestWrAt =
      this.db.prepare("SELECT wr_updated_at AS at FROM altered_maps ORDER BY wr_updated_at DESC LIMIT 1").get()?.at ||
      null;
    return {
      trackedMaps: Number(trackedMaps),
      campaignCount: Number(campaignCount),
      latestWrAt,
    };
  }

  getAlterationsStats() {
    const row = this.db
      .prepare(
        `
        SELECT
          COUNT(*) AS totalMaps,
          SUM(
            CASE
              WHEN tracked = 1 AND LOWER(COALESCE(status, '')) = 'live' THEN 1
              ELSE 0
            END
          ) AS activelyTracked
        FROM altered_maps
        `
      )
      .get();
    const latestSync =
      this.db
        .prepare(
          `
          SELECT finished_at AS lastRunAt
          FROM altered_sync_runs
          WHERE status = 'ok'
          ORDER BY run_id DESC
          LIMIT 1
          `
        )
        .get()?.lastRunAt || null;
    const totalWrChanges = this.db.prepare("SELECT COUNT(*) AS count FROM altered_wr_events").get()?.count || 0;
    return {
      totalMaps: Number(row?.totalMaps || 0),
      activelyTracked: Number(row?.activelyTracked || 0),
      totalWrChanges: Number(totalWrChanges || 0),
      lastRunAt: latestSync,
    };
  }

  getCampaignTimeline({ source = "best", bucket = "month", days = 365, clubId = null } = {}) {
    const allowedSources = new Set(["best", "publication", "creation", "start", "discovered"]);
    const allowedBuckets = new Set(["day", "week", "month"]);
    const normalizedSource = String(source || "best")
      .trim()
      .toLowerCase();
    const normalizedBucket = String(bucket || "month")
      .trim()
      .toLowerCase();
    const safeSource = allowedSources.has(normalizedSource) ? normalizedSource : "best";
    const safeBucket = allowedBuckets.has(normalizedBucket) ? normalizedBucket : "month";
    const safeDays = clampInt(days, { min: 7, max: 3650, fallback: 365 });
    const parsedClubId = Number(clubId);
    const safeClubId =
      Number.isFinite(parsedClubId) && parsedClubId > 0
        ? clampInt(parsedClubId, {
            min: 1,
            max: 2147483647,
            fallback: 0,
          })
        : 0;

    const rows = safeClubId
      ? this.db
          .prepare(
            `
            SELECT
              campaign_id AS campaignId,
              club_id AS clubId,
              name,
              external_campaign_id AS externalCampaignId,
              start_timestamp AS startTimestamp,
              created_at AS discoveredAt,
              payload_json AS payloadJson
            FROM altered_campaigns
            WHERE club_id = ?
            ORDER BY created_at ASC
            `
          )
          .all(safeClubId)
      : this.db
          .prepare(
            `
            SELECT
              campaign_id AS campaignId,
              club_id AS clubId,
              name,
              external_campaign_id AS externalCampaignId,
              start_timestamp AS startTimestamp,
              created_at AS discoveredAt,
              payload_json AS payloadJson
            FROM altered_campaigns
            ORDER BY created_at ASC
            `
          )
          .all();

    const nowMs = Date.now();
    const fromMs = nowMs - safeDays * 24 * 60 * 60 * 1000;
    const bucketCounts = new Map();
    let campaignsWithTimestamp = 0;
    let campaignsMissingTimestamp = 0;
    let campaignsInRange = 0;
    let publicationAvailable = 0;
    let creationAvailable = 0;
    let startAvailable = 0;
    let discoveredAvailable = 0;

    const pickTimestamp = ({ publicationMs, creationMs, startMs, discoveredMs }) => {
      if (safeSource === "publication") return publicationMs;
      if (safeSource === "creation") return creationMs;
      if (safeSource === "start") return startMs;
      if (safeSource === "discovered") return discoveredMs;
      return publicationMs || creationMs || startMs || discoveredMs || null;
    };

    for (const row of rows) {
      const payload = parseJsonSafe(row.payloadJson, {}) || {};
      const publicationMs = firstTimestamp([
        payload?.publicationTimestamp,
        payload?.publication_timestamp,
        payload?.campaign?.publicationTimestamp,
        payload?.campaign?.publication_timestamp,
      ]);
      const creationMs = firstTimestamp([
        payload?.creationTimestamp,
        payload?.creation_timestamp,
        payload?.campaign?.creationTimestamp,
        payload?.campaign?.creation_timestamp,
      ]);
      const startMs = firstTimestamp([row.startTimestamp]);
      const discoveredMs = firstTimestamp([row.discoveredAt]);

      if (publicationMs) publicationAvailable += 1;
      if (creationMs) creationAvailable += 1;
      if (startMs) startAvailable += 1;
      if (discoveredMs) discoveredAvailable += 1;

      const selectedMs = pickTimestamp({
        publicationMs,
        creationMs,
        startMs,
        discoveredMs,
      });
      if (!selectedMs) {
        campaignsMissingTimestamp += 1;
        continue;
      }
      campaignsWithTimestamp += 1;
      if (selectedMs < fromMs || selectedMs > nowMs) continue;
      campaignsInRange += 1;
      const bucketStartMs = startOfUtcBucket(selectedMs, safeBucket);
      bucketCounts.set(bucketStartMs, Number(bucketCounts.get(bucketStartMs) || 0) + 1);
    }

    const sortedBucketMs = [...bucketCounts.keys()].sort((a, b) => a - b);
    let cumulative = 0;
    const points = sortedBucketMs.map((bucketStartMs) => {
      const count = Number(bucketCounts.get(bucketStartMs) || 0);
      cumulative += count;
      return {
        bucketStartAt: new Date(bucketStartMs).toISOString(),
        label: formatBucketLabel(bucketStartMs, safeBucket),
        count,
        cumulative,
      };
    });

    return {
      source: safeSource,
      bucket: safeBucket,
      days: safeDays,
      clubId: safeClubId || null,
      generatedAt: new Date(nowMs).toISOString(),
      rangeStartAt: new Date(fromMs).toISOString(),
      rangeEndAt: new Date(nowMs).toISOString(),
      totalCampaigns: rows.length,
      campaignsWithTimestamp,
      campaignsMissingTimestamp,
      campaignsInRange,
      availability: {
        publication: publicationAvailable,
        creation: creationAvailable,
        start: startAvailable,
        discovered: discoveredAvailable,
      },
      points,
    };
  }
}

export { AlteredCatalogOverviewRepository };
