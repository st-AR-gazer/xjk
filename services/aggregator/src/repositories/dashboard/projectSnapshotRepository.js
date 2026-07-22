import { mapIngestRunDbRow, parseJsonObject, toDbInt } from "../support/databaseValues.js";
import { normalizeArray, normalizeProjectKey } from "../support/repositoryValues.js";

class ProjectSnapshotRepository {
  constructor(db) {
    this.db = db;
  }

  getPreferredProject(projectKeys = []) {
    const keys = normalizeArray(projectKeys)
      .map((key) => normalizeProjectKey(key))
      .filter(Boolean);
    for (const key of keys) {
      const row =
        this.db
          .prepare(
            `
            SELECT
              project_key AS projectKey,
              display_name AS displayName,
              source_label AS sourceLabel,
              first_seen_at AS firstSeenAt,
              last_seen_at AS lastSeenAt
            FROM projects
            WHERE project_key = ?
            LIMIT 1
            `
          )
          .get(key) || null;
      if (row) return row;
    }
    return null;
  }

  getLatestProjectInstance(projectKey) {
    const safeProjectKey = normalizeProjectKey(projectKey);
    if (!safeProjectKey) return null;
    const row =
      this.db
        .prepare(
          `
          SELECT
            project_key AS projectKey,
            instance_id AS instanceId,
            instance_name AS instanceName,
            source_label AS sourceLabel,
            status,
            registered_at AS registeredAt,
            last_heartbeat_at AS lastHeartbeatAt,
            meta_json AS metaJson
          FROM project_instances
          WHERE project_key = ?
          ORDER BY last_heartbeat_at DESC, instance_id ASC
          LIMIT 1
          `
        )
        .get(safeProjectKey) || null;
    if (!row) return null;
    return {
      ...row,
      meta: parseJsonObject(row.metaJson),
      metaJson: undefined,
    };
  }

  getLatestIngestRun(projectKey) {
    const safeProjectKey = normalizeProjectKey(projectKey);
    if (!safeProjectKey) return null;
    return mapIngestRunDbRow(
      this.db
        .prepare(
          `
          SELECT *
          FROM ingest_runs
          WHERE project_key = ?
          ORDER BY
            CASE WHEN LOWER(COALESCE(provider, '')) LIKE '%nadeo%' THEN 0 ELSE 1 END,
            finished_at DESC,
            ingest_id DESC
          LIMIT 1
          `
        )
        .get(safeProjectKey) || null
    );
  }

  getIngestRunTotals(projectKey) {
    const safeProjectKey = normalizeProjectKey(projectKey);
    if (!safeProjectKey) {
      return {
        totalRuns: 0,
        totalChecked: 0,
        totalChanges: 0,
        latestFinishedAt: null,
      };
    }
    const row =
      this.db
        .prepare(
          `
          SELECT
            COUNT(*) AS totalRuns,
            COALESCE(SUM(maps_checked), 0) AS totalChecked,
            COALESCE(SUM(wr_changes), 0) AS totalChanges,
            MAX(finished_at) AS latestFinishedAt
          FROM ingest_runs
          WHERE project_key = ?
          `
        )
        .get(safeProjectKey) || {};
    return {
      totalRuns: toDbInt(row.totalRuns),
      totalChecked: toDbInt(row.totalChecked),
      totalChanges: toDbInt(row.totalChanges),
      latestFinishedAt: row.latestFinishedAt || null,
    };
  }

  getProjectMapStats(projectKey) {
    const safeProjectKey = normalizeProjectKey(projectKey);
    if (!safeProjectKey) {
      return {
        trackedMaps: 0,
        totalChecks: 0,
        totalChanges: 0,
        latestCheckedAt: null,
        latestChangedAt: null,
      };
    }
    const row =
      this.db
        .prepare(
          `
          SELECT
            COUNT(*) AS trackedMaps,
            COALESCE(SUM(check_count), 0) AS totalChecks,
            COALESCE(SUM(change_count), 0) AS totalChanges,
            MAX(latest_checked_at) AS latestCheckedAt,
            MAX(last_changed_at) AS latestChangedAt
          FROM project_maps
          WHERE project_key = ?
          `
        )
        .get(safeProjectKey) || {};
    return {
      trackedMaps: toDbInt(row.trackedMaps),
      totalChecks: toDbInt(row.totalChecks),
      totalChanges: toDbInt(row.totalChanges),
      latestCheckedAt: row.latestCheckedAt || null,
      latestChangedAt: row.latestChangedAt || null,
    };
  }

  buildDbTrackerEntry(key, projectKeys = []) {
    const project = this.getPreferredProject(projectKeys);
    if (!project) {
      return {
        ok: false,
        configured: false,
        status: null,
        error: "No database snapshot found.",
        source: "database",
      };
    }

    const instance = this.getLatestProjectInstance(project.projectKey);
    const meta = instance?.meta || {};
    const latestRun = this.getLatestIngestRun(project.projectKey);
    const totals = this.getIngestRunTotals(project.projectKey);
    const mapStats = this.getProjectMapStats(project.projectKey);
    const mode = key === "leaderboard" ? "leaderboard" : "wr";
    const provider = latestRun?.provider || meta.provider || null;
    const enabled = Boolean(project || instance);

    return {
      ok: true,
      configured: true,
      status: {
        source: "database",
        projectKey: project.projectKey,
        projectName: project.displayName || project.projectKey,
        sourceLabel: project.sourceLabel || instance?.sourceLabel || null,
        snapshotAt: project.lastSeenAt || instance?.lastHeartbeatAt || latestRun?.finishedAt || null,
        runtime: {
          enabled,
          running: false,
          timerActive: false,
          provider,
          providerReady: Boolean(provider),
          mode,
          tickSeconds: toDbInt(meta.tickSeconds),
          totalRuns: totals.totalRuns,
          totalChecked: totals.totalChecked,
          totalChanges: totals.totalChanges,
          lastRun: latestRun,
          lastError: meta.lastError || null,
          aggregatorEnabled: true,
        },
        latestRun,
        summary: {
          trackedMaps: mapStats.trackedMaps,
          totalChecks: mapStats.totalChecks || totals.totalChecked,
          totalChanges: mapStats.totalChanges || totals.totalChanges,
          latestCheckedAt: mapStats.latestCheckedAt || latestRun?.finishedAt || null,
          latestWrAt: mapStats.latestChangedAt || null,
        },
        instance: instance
          ? {
              instanceId: instance.instanceId,
              instanceName: instance.instanceName,
              status: instance.status,
              lastHeartbeatAt: instance.lastHeartbeatAt,
              sourceLabel: instance.sourceLabel || null,
            }
          : null,
      },
      error: null,
      baseUrl: null,
      source: "database",
    };
  }
}

export { ProjectSnapshotRepository };
