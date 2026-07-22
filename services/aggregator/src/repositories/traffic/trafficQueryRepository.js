import { normalizeProjectKey } from "../support/repositoryValues.js";
import { mapTrafficSampleDbRow, normalizeWindowHours, parseTrafficRow } from "./trafficNormalization.js";
import {
  appendTrafficWhere,
  buildAllTimeTrafficQueryMeta,
  buildTrafficSampleQueryMeta,
} from "./trafficQuerySupport.js";

class TrafficQueryRepository {
  constructor(db, { support }) {
    this.db = db;
    this.support = support;
  }

  listLegacyTrafficSamples({ windowHours = 24, projectKey = "", service = "", direction = "" } = {}) {
    const safeWindowHours = normalizeWindowHours(windowHours, 24);
    const safeProjectKey = normalizeProjectKey(projectKey);
    const safeService = String(service || "")
      .trim()
      .toLowerCase();
    const rawDirection = String(direction || "")
      .trim()
      .toLowerCase();
    const safeDirection = rawDirection === "incoming" || rawDirection === "outgoing" ? rawDirection : "";
    const sinceIso = new Date(Date.now() - safeWindowHours * 60 * 60 * 1000).toISOString();

    const clauses = ["event_type = ?", "occurred_at >= ?"];
    const args = ["traffic.http", sinceIso];
    if (safeProjectKey) {
      clauses.push("project_key = ?");
      args.push(safeProjectKey);
    }

    return this.db
      .prepare(
        `
        SELECT
          project_key,
          source_label,
          occurred_at,
          payload_json
        FROM aggregator_events
        WHERE ${clauses.join(" AND ")}
        ORDER BY occurred_at ASC, event_id ASC
        `
      )
      .all(...args)
      .map((row) => parseTrafficRow(row))
      .filter((row) => {
        if (safeService && String(row.service || "").toLowerCase() !== safeService) return false;
        if (safeDirection && row.direction !== safeDirection) return false;
        return true;
      });
  }

  listTrafficSamples({ windowHours = 24, projectKey = "", service = "", direction = "" } = {}) {
    const backfillState = this.support.getTrafficBackfillState();
    if (!backfillState.complete) {
      return this.listLegacyTrafficSamples({ windowHours, projectKey, service, direction });
    }
    const meta = buildTrafficSampleQueryMeta({ windowHours, projectKey, service, direction });
    const cacheKey = `traffic-samples:${JSON.stringify({
      windowHours: meta.safeWindowHours,
      projectKey: meta.safeProjectKey || "",
      service: meta.safeService || "",
      direction: meta.safeDirection || "",
    })}`;
    return this.support.withTrafficCache(
      cacheKey,
      () =>
        this.db
          .prepare(
            `
            SELECT
              project_key AS projectKey,
              source_label AS sourceLabel,
              direction,
              service,
              component,
              method,
              route,
              target_host AS targetHost,
              target_path AS targetPath,
              status_code AS statusCode,
              status_group AS statusGroup,
              duration_ms AS durationMs,
              bytes_in AS bytesIn,
              bytes_out AS bytesOut,
              occurred_at AS occurredAt,
              is_nadeo_outgoing AS isNadeoOutgoing,
              is_internal_outgoing AS isInternalOutgoing
            FROM traffic_http_samples INDEXED BY idx_traffic_http_samples_occurred
            WHERE ${meta.clauses.join(" AND ")}
            ORDER BY occurred_at ASC, event_id ASC
            `
          )
          .all(...meta.args)
          .map((row) => mapTrafficSampleDbRow(row)),
      { ttlMs: 15000 }
    );
  }

  getTrafficFacets({ windowHours = 24, projectKey = "" } = {}) {
    const safeWindowHours = normalizeWindowHours(windowHours, 24);
    const safeProjectKey = normalizeProjectKey(projectKey) || null;
    const cacheKey = `traffic-facets:${JSON.stringify({ windowHours: safeWindowHours, projectKey: safeProjectKey || "" })}`;
    return this.support.withTrafficCache(
      cacheKey,
      () => {
        const meta = buildTrafficSampleQueryMeta({ windowHours: safeWindowHours, projectKey });
        const whereSql = meta.clauses.join(" AND ");
        const services = this.db
          .prepare(
            `
            SELECT DISTINCT service AS value
            FROM traffic_http_samples INDEXED BY idx_traffic_http_samples_occurred
            WHERE ${whereSql} AND service IS NOT NULL AND service != ''
            ORDER BY service ASC
            `
          )
          .all(...meta.args)
          .map((row) => row.value);
        const sources = this.db
          .prepare(
            `
            SELECT DISTINCT source_label AS value
            FROM traffic_http_samples INDEXED BY idx_traffic_http_samples_occurred
            WHERE ${whereSql} AND source_label IS NOT NULL AND source_label != ''
            ORDER BY source_label ASC
            `
          )
          .all(...meta.args)
          .map((row) => row.value);
        const projects = this.db
          .prepare(
            `
            SELECT DISTINCT project_key AS value
            FROM traffic_http_samples INDEXED BY idx_traffic_http_samples_occurred
            WHERE ${whereSql} AND project_key IS NOT NULL AND project_key != ''
            ORDER BY project_key ASC
            `
          )
          .all(...meta.args)
          .map((row) => row.value);

        return {
          windowHours: safeWindowHours,
          projectKey: safeProjectKey,
          services,
          sourceLabels: sources,
          projects,
        };
      },
      { ttlMs: 15000 }
    );
  }

  getLatestObservedTrafficWindowMeta({
    windowHours = 24,
    projectKey = "",
    service = "",
    direction = "",
    statusMin = 0,
    q = "",
    extraClauses = [],
    extraArgs = [],
  } = {}) {
    const safeWindowHours = normalizeWindowHours(windowHours, 24);
    const baseMeta = buildAllTimeTrafficQueryMeta({
      projectKey,
      service,
      direction,
      statusMin,
      q,
    });
    const latestMeta = appendTrafficWhere(baseMeta, extraClauses, extraArgs);
    const latest =
      this.db
        .prepare(
          `
          SELECT MAX(occurred_at) AS latest
          FROM traffic_http_samples
          WHERE ${latestMeta.clauses.join(" AND ")}
          `
        )
        .get(...latestMeta.args)?.latest || null;
    const latestMs = Date.parse(String(latest || ""));
    if (!Number.isFinite(latestMs)) {
      return {
        ...latestMeta,
        latestObservedAt: null,
        fallbackSinceIso: null,
        safeWindowHours,
      };
    }
    const sinceIso = new Date(latestMs - safeWindowHours * 60 * 60 * 1000).toISOString();
    return {
      ...appendTrafficWhere(
        baseMeta,
        ["occurred_at >= ?", "occurred_at <= ?", ...extraClauses],
        [sinceIso, latest, ...extraArgs]
      ),
      latestObservedAt: latest,
      fallbackSinceIso: sinceIso,
      safeWindowHours,
    };
  }
}

export { TrafficQueryRepository };
