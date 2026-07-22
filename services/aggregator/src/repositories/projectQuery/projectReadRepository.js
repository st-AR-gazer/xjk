import { normalizeProjectKey } from "../support/repositoryValues.js";

class ProjectReadRepository {
  constructor(db) {
    this.db = db;
  }

  listProjects({ limit = 100 } = {}) {
    const safeLimit = Math.max(1, Math.min(Number(limit) || 100, 500));
    let rows = [];

    try {
      rows = this.db
        .prepare(
          `
          SELECT
            p.project_key AS projectKey,
            p.display_name AS projectName,
            p.source_label AS sourceLabel,
            p.first_seen_at AS firstSeenAt,
            p.last_seen_at AS lastSeenAt,
            COALESCE(
              (
                SELECT COUNT(*)
                FROM project_maps pm
                WHERE pm.project_key = p.project_key
              ),
              0
            ) AS trackedMaps,
            COALESCE(
              (
                SELECT SUM(pm.check_count)
                FROM project_maps pm
                WHERE pm.project_key = p.project_key
              ),
              0
            ) AS totalChecks,
            COALESCE(
              (
                SELECT SUM(pm.change_count)
                FROM project_maps pm
                WHERE pm.project_key = p.project_key
              ),
              0
            ) AS totalChanges,
            (
              SELECT MAX(pm.latest_checked_at)
              FROM project_maps pm
              WHERE pm.project_key = p.project_key
            ) AS latestCheckedAt,
            (
              SELECT MAX(ir.finished_at)
              FROM ingest_runs ir
              WHERE ir.project_key = p.project_key
            ) AS latestRunAt
          FROM projects p
          ORDER BY p.last_seen_at DESC
          LIMIT ?
          `
        )
        .all(safeLimit);
    } catch {
      // Fallback when stats tables are partially corrupt: return project headers only.
      try {
        rows = this.db
          .prepare(
            `
            SELECT
              p.project_key AS projectKey,
              p.display_name AS projectName,
              p.source_label AS sourceLabel,
              p.first_seen_at AS firstSeenAt,
              p.last_seen_at AS lastSeenAt,
              0 AS trackedMaps,
              0 AS totalChecks,
              0 AS totalChanges,
              NULL AS latestCheckedAt,
              NULL AS latestRunAt
            FROM projects p
            ORDER BY p.last_seen_at DESC
            LIMIT ?
            `
          )
          .all(safeLimit);
      } catch {
        rows = [];
      }
    }

    return rows.map((row) => ({
      projectKey: row.projectKey,
      projectName: row.projectName,
      sourceLabel: row.sourceLabel || null,
      firstSeenAt: row.firstSeenAt,
      lastSeenAt: row.lastSeenAt,
      trackedMaps: Number(row.trackedMaps || 0),
      totalChecks: Number(row.totalChecks || 0),
      totalChanges: Number(row.totalChanges || 0),
      latestCheckedAt: row.latestCheckedAt || null,
      latestRunAt: row.latestRunAt || null,
    }));
  }

  listProjectInstances(projectKey, { limit = 120 } = {}) {
    const normalized = normalizeProjectKey(projectKey);
    if (!normalized) return [];
    const rows = this.db
      .prepare(
        `
        SELECT
          project_key AS projectKey,
          instance_id AS instanceId,
          instance_name AS instanceName,
          source_label AS sourceLabel,
          status AS status,
          registered_at AS registeredAt,
          last_heartbeat_at AS lastHeartbeatAt,
          meta_json AS metaJson
        FROM project_instances
        WHERE project_key = ?
        ORDER BY last_heartbeat_at DESC
        LIMIT ?
        `
      )
      .all(normalized, Math.max(1, Math.min(Number(limit) || 120, 1000)));

    return rows.map((row) => {
      let meta = null;
      if (row.metaJson) {
        try {
          meta = JSON.parse(row.metaJson);
        } catch {
          meta = null;
        }
      }
      return {
        projectKey: row.projectKey,
        instanceId: row.instanceId,
        instanceName: row.instanceName || row.instanceId,
        sourceLabel: row.sourceLabel || null,
        status: row.status || "online",
        registeredAt: row.registeredAt,
        lastHeartbeatAt: row.lastHeartbeatAt,
        meta,
      };
    });
  }

  getProject(projectKey) {
    const normalized = normalizeProjectKey(projectKey);
    if (!normalized) return null;
    const row = this.db
      .prepare(
        `
        SELECT
          p.project_key AS projectKey,
          p.display_name AS projectName,
          p.source_label AS sourceLabel,
          p.first_seen_at AS firstSeenAt,
          p.last_seen_at AS lastSeenAt,
          COALESCE(stats.trackedMaps, 0) AS trackedMaps,
          COALESCE(stats.totalChecks, 0) AS totalChecks,
          COALESCE(stats.totalChanges, 0) AS totalChanges,
          stats.latestCheckedAt AS latestCheckedAt,
          runs.latestRunAt AS latestRunAt
        FROM projects p
        LEFT JOIN (
          SELECT
            project_key,
            COUNT(*) AS trackedMaps,
            SUM(check_count) AS totalChecks,
            SUM(change_count) AS totalChanges,
            MAX(latest_checked_at) AS latestCheckedAt
          FROM project_maps
          GROUP BY project_key
        ) stats ON stats.project_key = p.project_key
        LEFT JOIN (
          SELECT
            project_key,
            MAX(finished_at) AS latestRunAt
          FROM ingest_runs
          GROUP BY project_key
        ) runs ON runs.project_key = p.project_key
        WHERE p.project_key = ?
        LIMIT 1
        `
      )
      .get(normalized);

    if (!row) return null;
    return {
      projectKey: row.projectKey,
      projectName: row.projectName,
      sourceLabel: row.sourceLabel || null,
      firstSeenAt: row.firstSeenAt,
      lastSeenAt: row.lastSeenAt,
      trackedMaps: Number(row.trackedMaps || 0),
      totalChecks: Number(row.totalChecks || 0),
      totalChanges: Number(row.totalChanges || 0),
      latestCheckedAt: row.latestCheckedAt || null,
      latestRunAt: row.latestRunAt || null,
    };
  }

  getProjectMaps(projectKey, { q = "", limit = 500, changedOnly = false } = {}) {
    const normalized = normalizeProjectKey(projectKey);
    if (!normalized) return [];

    const query = String(q || "")
      .trim()
      .toLowerCase();
    const clauses = ["pm.project_key = ?"];
    const args = [normalized];
    if (query) {
      clauses.push("(LOWER(pm.map_uid) LIKE ? OR LOWER(COALESCE(mr.map_name, '')) LIKE ?)");
      args.push(`%${query}%`, `%${query}%`);
    }
    if (changedOnly) {
      clauses.push("pm.change_count > 0");
    }

    const rows = this.db
      .prepare(
        `
        SELECT
          pm.project_key AS projectKey,
          pm.map_uid AS mapUid,
          mr.map_name AS mapName,
          pm.latest_checked_at AS latestCheckedAt,
          pm.last_changed_at AS lastChangedAt,
          pm.wr_ms AS wrMs,
          pm.wr_holder AS wrHolder,
          pm.source AS source,
          pm.note AS note,
          pm.check_count AS checkCount,
          pm.change_count AS changeCount,
          pm.status AS status
        FROM project_maps pm
        LEFT JOIN map_registry mr ON mr.map_uid = pm.map_uid
        WHERE ${clauses.join(" AND ")}
        ORDER BY
          COALESCE(pm.last_changed_at, '') DESC,
          COALESCE(pm.latest_checked_at, '') DESC,
          pm.map_uid ASC
        LIMIT ?
        `
      )
      .all(...args, Math.max(1, Math.min(Number(limit) || 500, 2000)));

    return rows.map((row) => ({
      projectKey: row.projectKey,
      mapUid: row.mapUid,
      mapName: row.mapName || row.mapUid,
      latestCheckedAt: row.latestCheckedAt || null,
      lastChangedAt: row.lastChangedAt || null,
      wrMs: Number(row.wrMs || 0),
      wrHolder: row.wrHolder || null,
      source: row.source || null,
      note: row.note || null,
      checkCount: Number(row.checkCount || 0),
      changeCount: Number(row.changeCount || 0),
      status: row.status || "ok",
    }));
  }

  getMapProjects(mapUid, { limit = 100 } = {}) {
    const uid = String(mapUid || "").trim();
    if (!uid) return [];
    const rows = this.db
      .prepare(
        `
        SELECT
          pm.project_key AS projectKey,
          p.display_name AS projectName,
          pm.latest_checked_at AS latestCheckedAt,
          pm.last_changed_at AS lastChangedAt,
          pm.wr_ms AS wrMs,
          pm.wr_holder AS wrHolder,
          pm.check_count AS checkCount,
          pm.change_count AS changeCount,
          pm.status AS status
        FROM project_maps pm
        JOIN projects p ON p.project_key = pm.project_key
        WHERE pm.map_uid = ?
        ORDER BY COALESCE(pm.latest_checked_at, '') DESC
        LIMIT ?
        `
      )
      .all(uid, Math.max(1, Math.min(Number(limit) || 100, 1000)));

    return rows.map((row) => ({
      projectKey: row.projectKey,
      projectName: row.projectName,
      latestCheckedAt: row.latestCheckedAt || null,
      lastChangedAt: row.lastChangedAt || null,
      wrMs: Number(row.wrMs || 0),
      wrHolder: row.wrHolder || null,
      checkCount: Number(row.checkCount || 0),
      changeCount: Number(row.changeCount || 0),
      status: row.status || "ok",
    }));
  }
}

export { ProjectReadRepository };
