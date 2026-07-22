import { normalizeProjectKey } from "../support/repositoryValues.js";
import { parseBucket } from "../traffic/trafficNormalization.js";
import { createDegradedMetricsOverview, loadMetricsOverview } from "./metricsOverview.js";

class MetricsRepository {
  constructor(db, { adminDataRepository } = {}) {
    this.db = db;
    this.adminDataRepository = adminDataRepository;
  }

  getMetricsOverview() {
    try {
      return loadMetricsOverview(this.db, this.adminDataRepository);
    } catch (error) {
      return createDegradedMetricsOverview(this.adminDataRepository, error);
    }
  }

  getMetricsTimeseries({ bucket = "hour", windowHours = 168, projectKey = "" } = {}) {
    try {
      const safeWindowHours = Math.max(1, Math.min(Number(windowHours) || 168, 24 * 365));
      const bucketMeta = parseBucket(bucket);
      const normalizedProjectKey = normalizeProjectKey(projectKey);

      const eventClauses = ["julianday(checked_at) >= julianday('now') - (? / 24.0)"];
      const eventArgs = [safeWindowHours];
      if (normalizedProjectKey) {
        eventClauses.push("project_key = ?");
        eventArgs.push(normalizedProjectKey);
      }

      const runClauses = ["julianday(finished_at) >= julianday('now') - (? / 24.0)"];
      const runArgs = [safeWindowHours];
      if (normalizedProjectKey) {
        runClauses.push("project_key = ?");
        runArgs.push(normalizedProjectKey);
      }

      const eventBucketExpr = bucketMeta.expr.replace(/__ts__/g, "checked_at");
      const runBucketExpr = bucketMeta.expr.replace(/__ts__/g, "finished_at");

      const events = this.db
        .prepare(
          `
        SELECT
          ${eventBucketExpr} AS bucket,
          COUNT(*) AS checks,
          COALESCE(SUM(changed), 0) AS changes
        FROM map_events
        WHERE ${eventClauses.join(" AND ")}
        GROUP BY bucket
        ORDER BY bucket ASC
        `
        )
        .all(...eventArgs)
        .map((row) => ({
          bucket: row.bucket,
          checks: Number(row.checks || 0),
          changes: Number(row.changes || 0),
        }));

      const runs = this.db
        .prepare(
          `
        SELECT
          ${runBucketExpr} AS bucket,
          COUNT(*) AS runs,
          COALESCE(SUM(maps_checked), 0) AS mapsChecked,
          COALESCE(SUM(wr_changes), 0) AS wrChanges,
          COALESCE(AVG((julianday(finished_at) - julianday(started_at)) * 86400.0), 0) AS avgDurationSeconds
        FROM ingest_runs
        WHERE ${runClauses.join(" AND ")}
        GROUP BY bucket
        ORDER BY bucket ASC
        `
        )
        .all(...runArgs)
        .map((row) => ({
          bucket: row.bucket,
          runs: Number(row.runs || 0),
          mapsChecked: Number(row.mapsChecked || 0),
          wrChanges: Number(row.wrChanges || 0),
          avgDurationSeconds: Number(row.avgDurationSeconds || 0),
        }));

      const nameBucketExpr = bucketMeta.expr.replace(/__ts__/g, "valid_from");
      const names = this.db
        .prepare(
          `
        SELECT
          ${nameBucketExpr} AS bucket,
          COUNT(*) AS updates
        FROM account_display_name_history
        WHERE julianday(valid_from) >= julianday('now') - (? / 24.0)
        GROUP BY bucket
        ORDER BY bucket ASC
        `
        )
        .all(safeWindowHours)
        .map((row) => ({
          bucket: row.bucket,
          updates: Number(row.updates || 0),
        }));

      return {
        bucket: bucketMeta.key,
        windowHours: safeWindowHours,
        projectKey: normalizedProjectKey || null,
        events,
        runs,
        names,
      };
    } catch (error) {
      const safeWindowHours = Math.max(1, Math.min(Number(windowHours) || 168, 24 * 365));
      const bucketMeta = parseBucket(bucket);
      const normalizedProjectKey = normalizeProjectKey(projectKey);
      const aggBucketExpr = bucketMeta.expr.replace(/__ts__/g, "occurred_at");
      const clauses = ["julianday(occurred_at) >= julianday('now') - (? / 24.0)"];
      const args = [safeWindowHours];
      if (normalizedProjectKey) {
        clauses.push("project_key = ?");
        args.push(normalizedProjectKey);
      }
      let events = [];
      try {
        events = this.db
          .prepare(
            `
            SELECT
              ${aggBucketExpr} AS bucket,
              COUNT(*) AS checks,
              0 AS changes
            FROM aggregator_events NOT INDEXED
            WHERE ${clauses.join(" AND ")}
            GROUP BY bucket
            ORDER BY bucket ASC
            `
          )
          .all(...args)
          .map((row) => ({
            bucket: row.bucket,
            checks: Number(row.checks || 0),
            changes: 0,
          }));
      } catch {
        events = [];
      }
      return {
        bucket: bucketMeta.key,
        windowHours: safeWindowHours,
        projectKey: normalizedProjectKey || null,
        degraded: true,
        degradedReason: String(error?.message || error || "database issue"),
        events,
        runs: [],
        names: [],
      };
    }
  }
}

export { MetricsRepository };
