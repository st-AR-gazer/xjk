import { toDbInt, toDbNumber } from "../support/databaseValues.js";
import { normalizeWindowHours } from "../traffic/trafficNormalization.js";

class TrackerSnapshotRepository {
  constructor(db, { projectRepository, trafficRepository } = {}) {
    this.db = db;
    this.projectRepository = projectRepository;
    this.trafficRepository = trafficRepository;
  }

  getDisplayNameTrackerSnapshot() {
    const project = this.projectRepository.getPreferredProject([
      "prod-tracker-displayname",
      "local-tracker-displayname",
      "altered-mapper-displayname",
    ]);
    if (!project) {
      return {
        ok: false,
        configured: false,
        status: null,
        error: "No displayname database snapshot found.",
        source: "database",
      };
    }
    const instance = this.projectRepository.getLatestProjectInstance(project.projectKey);
    const meta = instance?.meta || {};
    const stats =
      this.db
        .prepare(
          `
          SELECT
            (SELECT COUNT(*) FROM accounts) AS accounts,
            (SELECT COUNT(*) FROM account_display_name_current) AS displayNames,
            (SELECT MAX(observed_at) FROM account_display_name_current) AS latestObservedAt,
            (SELECT COUNT(*) FROM aggregator_events WHERE event_type = 'displayname.sync') AS syncRuns,
            (SELECT MAX(occurred_at) FROM aggregator_events WHERE event_type = 'displayname.sync') AS latestSyncAt
          `
        )
        .get() || {};
    return {
      ok: true,
      configured: true,
      status: {
        source: "database",
        projectKey: project.projectKey,
        projectName: project.displayName || project.projectKey,
        sourceLabel: project.sourceLabel || instance?.sourceLabel || null,
        enabled: Boolean(project || instance),
        schedulerEnabled: Boolean(project || instance),
        maintenanceIntervalSeconds: toDbInt(meta.maintenanceIntervalSeconds || meta.tickSeconds),
        staleAfterSeconds: toDbInt(meta.staleAfterSeconds),
        batchSize: toDbInt(meta.batchSize),
        maxAccountsPerCycle: toDbInt(meta.maxAccountsPerCycle),
        minRequestGapMs: toDbInt(meta.minRequestGapMs),
        queueSize: toDbInt(meta.queueSize),
        lastRunAt: meta.lastRunAt || stats.latestSyncAt || project.lastSeenAt || null,
        lastFinishedAt: meta.lastFinishedAt || stats.latestSyncAt || project.lastSeenAt || null,
        lastError: meta.lastError || null,
        lastSummary: {
          accountsKnown: toDbInt(stats.accounts),
          displayNames: toDbInt(stats.displayNames),
          latestObservedAt: stats.latestObservedAt || null,
          syncRuns: toDbInt(stats.syncRuns),
          latestSyncAt: stats.latestSyncAt || null,
        },
      },
      error: null,
      baseUrl: null,
      source: "database",
    };
  }

  getClubTrackerSnapshot() {
    const project = this.projectRepository.getPreferredProject(["prod-tracker-club", "local-tracker-club"]);
    const instance = project ? this.projectRepository.getLatestProjectInstance(project.projectKey) : null;
    const club =
      this.db
        .prepare(
          `
          SELECT
            c.club_id AS clubId,
            c.club_name AS clubName,
            c.source_label AS sourceLabel,
            c.first_seen_at AS firstSeenAt,
            c.last_synced_at AS lastSyncedAt,
            c.payload_json AS payloadJson,
            (
              (SELECT COUNT(*) FROM club_campaign_maps ccm WHERE ccm.club_id = c.club_id) +
              (SELECT COUNT(*) FROM club_upload_maps cum WHERE cum.club_id = c.club_id)
            ) AS mapCount,
            (SELECT COUNT(*) FROM club_members cm WHERE cm.club_id = c.club_id) AS memberCount
          FROM clubs c
          ORDER BY
            mapCount DESC,
            memberCount DESC,
            CASE WHEN c.source_label = 'prod' THEN 0 ELSE 1 END,
            c.last_synced_at DESC,
            c.club_id ASC
          LIMIT 1
          `
        )
        .get() || null;
    if (!project && !club) {
      return {
        ok: false,
        configured: false,
        status: null,
        error: "No club database snapshot found.",
        source: "database",
      };
    }
    const clubId = toDbInt(club?.clubId);
    const stats = clubId
      ? this.db
          .prepare(
            `
            SELECT
              (SELECT COUNT(*) FROM club_campaigns WHERE club_id = ?) AS campaigns,
              (SELECT COUNT(*) FROM club_campaign_maps WHERE club_id = ?) AS campaignMaps,
              (SELECT COUNT(*) FROM club_uploads WHERE club_id = ?) AS uploads,
              (SELECT COUNT(*) FROM club_upload_maps WHERE club_id = ?) AS uploadMaps,
              (SELECT COUNT(*) FROM club_members WHERE club_id = ?) AS members,
              (SELECT MAX(last_synced_at) FROM club_campaign_maps WHERE club_id = ?) AS latestCampaignMapAt,
              (SELECT MAX(last_synced_at) FROM club_upload_maps WHERE club_id = ?) AS latestUploadMapAt
            `
          )
          .get(clubId, clubId, clubId, clubId, clubId, clubId, clubId) || {}
      : {};
    return {
      ok: true,
      configured: true,
      status: {
        source: "database",
        projectKey: project?.projectKey || null,
        projectName: project?.displayName || project?.projectKey || null,
        sourceLabel: project?.sourceLabel || club?.sourceLabel || instance?.sourceLabel || null,
        enabled: Boolean(project || club || instance),
        clubId: clubId || null,
        clubName: club?.clubName || null,
        lastIngestAt:
          club?.lastSyncedAt ||
          stats.latestCampaignMapAt ||
          stats.latestUploadMapAt ||
          project?.lastSeenAt ||
          instance?.lastHeartbeatAt ||
          null,
        lastError: instance?.meta?.lastError || null,
        lastSummary: {
          campaigns: toDbInt(stats.campaigns),
          campaignMaps: toDbInt(stats.campaignMaps),
          uploads: toDbInt(stats.uploads),
          uploadMaps: toDbInt(stats.uploadMaps),
          members: toDbInt(stats.members),
        },
      },
      error: null,
      baseUrl: null,
      source: "database",
    };
  }

  getTrackerStatusSnapshots() {
    return {
      source: "database",
      trackers: {
        wr: this.projectRepository.buildDbTrackerEntry("wr", ["prod-tracker-main", "local-tracker-main"]),
        leaderboard: this.projectRepository.buildDbTrackerEntry("leaderboard", [
          "prod-tracker-leaderboard",
          "local-tracker-leaderboard",
        ]),
        displayname: this.getDisplayNameTrackerSnapshot(),
        club: this.getClubTrackerSnapshot(),
      },
    };
  }

  getNadeoGuardrailSnapshot({ windowHours = 24, projectKey = "", service = "" } = {}) {
    const safeWindowHours = normalizeWindowHours(windowHours, 24);
    const overview = this.trafficRepository.getTrafficOverview({
      windowHours: safeWindowHours,
      projectKey,
      service,
    });
    const live = overview?.live || {};
    const traffic = {
      source: "traffic-database",
      available: toDbNumber(overview.nadeoOutgoingRequests) > 0 || toDbNumber(live.nadeoOutgoingPerSecond) > 0,
      requests: toDbInt(overview.nadeoOutgoingRequests),
      requestsPerSecond: toDbNumber(live.nadeoOutgoingPerSecond),
      requestsPerMinute: toDbNumber(live.nadeoOutgoingPerMinute),
      transferBytes: toDbInt(overview.nadeoTransferBytes),
    };

    const wrSnapshot = this.projectRepository.buildDbTrackerEntry("wr", ["prod-tracker-main", "local-tracker-main"]);
    const runtime = wrSnapshot?.status?.runtime || {};
    const latestRun = runtime.lastRun || wrSnapshot?.status?.latestRun || null;
    const recentRequests = toDbInt(latestRun?.mapsChecked);
    const durationSeconds = toDbNumber(latestRun?.durationSeconds);
    const trackerRps = durationSeconds > 0 && recentRequests > 0 ? recentRequests / durationSeconds : 0;
    const tracker = {
      source: "tracker-database",
      available: Boolean(wrSnapshot?.ok && (toDbInt(runtime.totalChecked) > 0 || recentRequests > 0)),
      requests: toDbInt(runtime.totalChecked) || recentRequests,
      recentRequests,
      requestsPerSecond: trackerRps,
      requestsPerMinute: trackerRps * 60,
      transferBytes: null,
      provider: runtime.provider || latestRun?.provider || null,
      running: Boolean(runtime.running),
      lastRunStartedAt: latestRun?.startedAt || null,
      lastRunFinishedAt: latestRun?.finishedAt || null,
      projectKey: wrSnapshot?.status?.projectKey || null,
    };

    const effective = traffic.available
      ? {
          ...traffic,
          source: tracker.available ? "traffic-database+tracker-database" : traffic.source,
          requestsPerSecond: traffic.requestsPerSecond > 0 ? traffic.requestsPerSecond : tracker.requestsPerSecond || 0,
          requestsPerMinute: traffic.requestsPerMinute > 0 ? traffic.requestsPerMinute : tracker.requestsPerMinute || 0,
          provider: tracker.provider || null,
          running: tracker.running || false,
          lastRunStartedAt: tracker.lastRunStartedAt || null,
          lastRunFinishedAt: tracker.lastRunFinishedAt || null,
          projectKey: tracker.projectKey || null,
        }
      : tracker.available
        ? tracker
        : traffic;
    return {
      windowHours: safeWindowHours,
      traffic,
      tracker,
      trackerError: wrSnapshot?.ok ? null : wrSnapshot?.error || "WR tracker database snapshot unavailable.",
      effective,
    };
  }
}

export { TrackerSnapshotRepository };
