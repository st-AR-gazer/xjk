import { DatabaseSync } from "node:sqlite";
import fs from "node:fs";

function readArg(name, fallback = "") {
  const key = `--${name}=`;
  const found = process.argv.find((arg) => String(arg).startsWith(key));
  if (!found) return fallback;
  return String(found).slice(key.length);
}

function hasFlag(name) {
  const key = `--${name}`;
  return process.argv.includes(key);
}

function toIsoOrNow(value, nowIso) {
  const raw = String(value || "").trim();
  if (!raw) return nowIso;
  const dt = new Date(raw);
  if (Number.isNaN(dt.getTime())) return nowIso;
  return dt.toISOString();
}

function normalizeProjectKey(value, fallback) {
  const cleaned = String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return cleaned || fallback;
}

function main() {
  const defaultRoot = "C:\\srv\\xjk\\sites\\altered.xjk.yt\\data";
  const trackerDbPath = readArg("tracker-db", `${defaultRoot}\\altered-tracker.sqlite`);
  const aggregatorDbPath = readArg("aggregator-db", `${defaultRoot}\\tracker-aggregator.sqlite`);
  const projectKey = normalizeProjectKey(readArg("project-key", "prod-tracker-main"), "prod-tracker-main");
  const projectName = String(readArg("project-name", "Prod Tracker Main")).trim() || "Prod Tracker Main";
  const sourceLabel = String(readArg("source", "catalog-sync")).trim() || "catalog-sync";
  const dryRun = hasFlag("dry-run");

  if (!fs.existsSync(trackerDbPath)) {
    throw new Error(`Tracker DB not found: ${trackerDbPath}`);
  }
  if (!fs.existsSync(aggregatorDbPath)) {
    throw new Error(`Aggregator DB not found: ${aggregatorDbPath}`);
  }

  const trackerDb = new DatabaseSync(trackerDbPath, { open: true, readOnly: true });
  const aggregatorDb = new DatabaseSync(aggregatorDbPath, { open: true });
  const nowIso = new Date().toISOString();

  const trackedRows = trackerDb
    .prepare(
      `
      SELECT
        map_uid AS mapUid,
        name AS mapName,
        last_checked_at AS lastCheckedAt,
        wr_time AS wrMs,
        wr_display_name AS wrHolder,
        tracking_status AS trackingStatus
      FROM maps
      WHERE is_tracked = 1
        AND map_uid IS NOT NULL
        AND TRIM(map_uid) <> ''
      `
    )
    .all();

  const trackerTrackedCount = trackedRows.length;

  const upsertProject = aggregatorDb.prepare(
    `
    INSERT INTO projects (
      project_key, display_name, source_label, first_seen_at, last_seen_at
    ) VALUES (?, ?, ?, ?, ?)
    ON CONFLICT(project_key) DO UPDATE SET
      display_name = excluded.display_name,
      source_label = COALESCE(excluded.source_label, projects.source_label),
      last_seen_at = excluded.last_seen_at
    `
  );

  const upsertMapRegistry = aggregatorDb.prepare(
    `
    INSERT INTO map_registry (
      map_uid, map_name, first_seen_at, last_seen_at
    ) VALUES (?, ?, ?, ?)
    ON CONFLICT(map_uid) DO UPDATE SET
      map_name = CASE
        WHEN excluded.map_name IS NOT NULL AND excluded.map_name <> '' THEN excluded.map_name
        ELSE map_registry.map_name
      END,
      last_seen_at = excluded.last_seen_at
    `
  );

  const upsertProjectMap = aggregatorDb.prepare(
    `
    INSERT INTO project_maps (
      project_key, map_uid, latest_checked_at, last_changed_at, wr_ms, wr_holder,
      source, note, check_count, change_count, status, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(project_key, map_uid) DO UPDATE SET
      latest_checked_at = COALESCE(excluded.latest_checked_at, project_maps.latest_checked_at),
      wr_ms = CASE
        WHEN excluded.wr_ms IS NOT NULL AND excluded.wr_ms > 0 THEN excluded.wr_ms
        ELSE project_maps.wr_ms
      END,
      wr_holder = CASE
        WHEN excluded.wr_holder IS NOT NULL AND excluded.wr_holder <> '' THEN excluded.wr_holder
        ELSE project_maps.wr_holder
      END,
      source = COALESCE(excluded.source, project_maps.source),
      note = COALESCE(excluded.note, project_maps.note),
      status = COALESCE(excluded.status, project_maps.status),
      updated_at = excluded.updated_at
    `
  );

  const beforeAggMaps = Number(
    aggregatorDb.prepare("SELECT COUNT(*) AS count FROM map_registry").get()?.count || 0
  );
  const beforeProjectMaps = Number(
    aggregatorDb
      .prepare("SELECT COUNT(*) AS count FROM project_maps WHERE project_key = ?")
      .get(projectKey)?.count || 0
  );

  let upserted = 0;
  let insertedInProject = 0;

  try {
    if (!dryRun) {
      aggregatorDb.exec("BEGIN");
      upsertProject.run(projectKey, projectName, sourceLabel, nowIso, nowIso);
    }

    const hadProjectMap = aggregatorDb.prepare(
      "SELECT 1 AS ok FROM project_maps WHERE project_key = ? AND map_uid = ? LIMIT 1"
    );

    for (const row of trackedRows) {
      const mapUid = String(row?.mapUid || "").trim();
      if (!mapUid) continue;

      const mapName = String(row?.mapName || "").trim() || mapUid;
      const latestCheckedAt = toIsoOrNow(row?.lastCheckedAt, nowIso);
      const wrMsRaw = Number(row?.wrMs || 0);
      const wrMs = Number.isFinite(wrMsRaw) && wrMsRaw > 0 ? Math.floor(wrMsRaw) : null;
      const wrHolder = String(row?.wrHolder || "").trim() || null;
      const trackingStatus = String(row?.trackingStatus || "").trim().toLowerCase() || "live";
      const status = trackingStatus === "paused" || trackingStatus === "archived" ? trackingStatus : "ok";

      const existed = Boolean(hadProjectMap.get(projectKey, mapUid)?.ok);
      if (!dryRun) {
        upsertMapRegistry.run(mapUid, mapName, latestCheckedAt, latestCheckedAt);
        upsertProjectMap.run(
          projectKey,
          mapUid,
          latestCheckedAt,
          null,
          wrMs,
          wrHolder,
          sourceLabel,
          "catalog-sync",
          0,
          0,
          status,
          nowIso
        );
      }
      upserted += 1;
      if (!existed) insertedInProject += 1;
    }

    if (!dryRun) {
      aggregatorDb.exec("COMMIT");
    }
  } catch (error) {
    if (!dryRun) {
      try {
        aggregatorDb.exec("ROLLBACK");
      } catch {}
    }
    throw error;
  } finally {
    trackerDb.close();
    aggregatorDb.close();
  }

  const verifyDb = new DatabaseSync(aggregatorDbPath, { open: true, readOnly: true });
  const afterAggMaps = Number(
    verifyDb.prepare("SELECT COUNT(*) AS count FROM map_registry").get()?.count || 0
  );
  const afterProjectMaps = Number(
    verifyDb
      .prepare("SELECT COUNT(*) AS count FROM project_maps WHERE project_key = ?")
      .get(projectKey)?.count || 0
  );
  verifyDb.close();

  console.log(
    JSON.stringify(
      {
        dryRun,
        trackerDbPath,
        aggregatorDbPath,
        projectKey,
        trackerTrackedCount,
        before: {
          aggregatorMapRegistry: beforeAggMaps,
          projectMapsForProject: beforeProjectMaps,
        },
        processed: upserted,
        insertedInProject,
        after: {
          aggregatorMapRegistry: afterAggMaps,
          projectMapsForProject: afterProjectMaps,
        },
        delta: {
          aggregatorMapRegistry: afterAggMaps - beforeAggMaps,
          projectMapsForProject: afterProjectMaps - beforeProjectMaps,
        },
      },
      null,
      2
    )
  );
}

try {
  main();
} catch (error) {
  const message = String(error?.message || error || "");
  if (message.toLowerCase().includes("database disk image is malformed")) {
    console.error(
      [
        message,
        "",
        "Aggregator DB is corrupted.",
        "1) Stop aggregator process/service.",
        "2) Backup tracker-aggregator.sqlite (+ -wal/-shm).",
        "3) Recreate a clean tracker-aggregator.sqlite (restart aggregator service).",
        "4) Re-run this backfill script.",
      ].join("\n")
    );
  } else {
    console.error(message || String(error));
  }
  process.exitCode = 1;
}
