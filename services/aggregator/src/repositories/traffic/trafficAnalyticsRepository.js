import { clampInt } from "../../../../shared/valueUtils.js";
import { toDbNumber } from "../support/databaseValues.js";
import { normalizeProjectKey } from "../support/repositoryValues.js";
import {
  mapTrafficSampleDbRow,
  normalizeTrafficDirection,
  normalizeWindowHours,
  parseBucket,
} from "./trafficNormalization.js";
import {
  appendTrafficWhere,
  buildTrafficSampleQueryMeta,
  fillTrafficTimeseriesBuckets,
  trafficBucketSqlExpression,
} from "./trafficQuerySupport.js";

class TrafficAnalyticsRepository {
  constructor(db, { support }) {
    this.db = db;
    this.support = support;
  }

  getTrafficOverview({ windowHours = 24, projectKey = "", service = "" } = {}) {
    const safeWindowHours = normalizeWindowHours(windowHours, 24);
    const safeProjectKey = normalizeProjectKey(projectKey) || null;
    const safeService = String(service || "").trim() || null;
    const cacheKey = `traffic-overview:${JSON.stringify({ windowHours: safeWindowHours, projectKey: safeProjectKey || "", service: safeService || "" })}`;
    return this.support.withTrafficCache(
      cacheKey,
      () => {
        const meta = buildTrafficSampleQueryMeta({ windowHours: safeWindowHours, projectKey, service });
        const whereSql = meta.clauses.join(" AND ");
        const last60Iso = new Date(Date.now() - 60 * 1000).toISOString();
        const last300Iso = new Date(Date.now() - 300 * 1000).toISOString();
        const row =
          this.db
            .prepare(
              `
              WITH filtered AS (
                SELECT *
                FROM traffic_http_samples INDEXED BY idx_traffic_http_samples_occurred
                WHERE ${whereSql}
              )
              SELECT
                COUNT(*) AS requests,
                SUM(CASE WHEN direction = 'incoming' THEN 1 ELSE 0 END) AS incomingRequests,
                SUM(CASE WHEN direction = 'outgoing' THEN 1 ELSE 0 END) AS outgoingRequests,
                SUM(CASE WHEN direction = 'outgoing' AND is_nadeo_outgoing = 1 THEN 1 ELSE 0 END) AS nadeoOutgoingRequests,
                SUM(CASE WHEN direction = 'outgoing' AND is_internal_outgoing = 1 THEN 1 ELSE 0 END) AS internalOutgoingRequests,
                SUM(CASE WHEN direction = 'outgoing' AND is_nadeo_outgoing != 1 AND is_internal_outgoing != 1 THEN 1 ELSE 0 END) AS publicNonNadeoOutgoingRequests,
                SUM(CASE WHEN status_code >= 400 THEN 1 ELSE 0 END) AS errorRequests,
                SUM(COALESCE(bytes_in, 0)) AS bytesIn,
                SUM(COALESCE(bytes_out, 0)) AS bytesOut,
                SUM(CASE WHEN direction = 'outgoing' AND is_nadeo_outgoing = 1 THEN COALESCE(bytes_in, 0) + COALESCE(bytes_out, 0) ELSE 0 END) AS nadeoTransferBytes,
                SUM(CASE WHEN direction = 'outgoing' AND is_internal_outgoing = 1 THEN COALESCE(bytes_in, 0) + COALESCE(bytes_out, 0) ELSE 0 END) AS internalTransferBytes,
                SUM(CASE WHEN direction = 'outgoing' AND is_nadeo_outgoing != 1 AND is_internal_outgoing != 1 THEN COALESCE(bytes_in, 0) + COALESCE(bytes_out, 0) ELSE 0 END) AS publicNonNadeoTransferBytes,
                SUM(COALESCE(duration_ms, 0)) AS durationMs,
                SUM(CASE WHEN status_code >= 200 AND status_code < 300 THEN 1 ELSE 0 END) AS status2xx,
                SUM(CASE WHEN status_code >= 300 AND status_code < 400 THEN 1 ELSE 0 END) AS status3xx,
                SUM(CASE WHEN status_code >= 400 AND status_code < 500 THEN 1 ELSE 0 END) AS status4xx,
                SUM(CASE WHEN status_code >= 500 THEN 1 ELSE 0 END) AS status5xx,
                SUM(CASE WHEN status_code < 200 THEN 1 ELSE 0 END) AS statusOther,
                SUM(CASE WHEN occurred_at >= ? THEN 1 ELSE 0 END) AS requestsLast60s,
                SUM(CASE WHEN occurred_at >= ? AND direction = 'incoming' THEN 1 ELSE 0 END) AS incomingLast60s,
                SUM(CASE WHEN occurred_at >= ? AND direction = 'outgoing' THEN 1 ELSE 0 END) AS outgoingLast60s,
                SUM(CASE WHEN occurred_at >= ? AND direction = 'outgoing' AND is_nadeo_outgoing = 1 THEN 1 ELSE 0 END) AS nadeoOutgoingLast60s,
                SUM(CASE WHEN occurred_at >= ? AND direction = 'outgoing' AND is_internal_outgoing = 1 THEN 1 ELSE 0 END) AS internalOutgoingLast60s,
                SUM(CASE WHEN occurred_at >= ? AND direction = 'outgoing' AND is_nadeo_outgoing != 1 AND is_internal_outgoing != 1 THEN 1 ELSE 0 END) AS publicNonNadeoOutgoingLast60s,
                SUM(CASE WHEN occurred_at >= ? AND status_code >= 400 THEN 1 ELSE 0 END) AS errorsLast60s,
                SUM(CASE WHEN occurred_at >= ? THEN 1 ELSE 0 END) AS requestsLast300s,
                SUM(CASE WHEN occurred_at >= ? AND direction = 'outgoing' AND is_nadeo_outgoing = 1 THEN 1 ELSE 0 END) AS nadeoOutgoingLast300s
              FROM filtered
              `
            )
            .get(
              ...meta.args,
              last60Iso,
              last60Iso,
              last60Iso,
              last60Iso,
              last60Iso,
              last60Iso,
              last60Iso,
              last300Iso,
              last300Iso
            ) || {};
        const groupedTop = ({ keySql, extraClauses = [], extraArgs = [], limit = 12 }) => {
          const groupMeta = appendTrafficWhere(meta, extraClauses, extraArgs);
          return this.db
            .prepare(
              `
              SELECT ${keySql} AS key, COUNT(*) AS count
              FROM traffic_http_samples INDEXED BY idx_traffic_http_samples_occurred
              WHERE ${groupMeta.clauses.join(" AND ")}
              GROUP BY key
              ORDER BY count DESC, key ASC
              LIMIT ?
              `
            )
            .all(...groupMeta.args, limit)
            .map((item) => ({ key: item.key, count: Number(item.count || 0) }));
        };

        const requests = toDbNumber(row.requests);
        const errorRequests = toDbNumber(row.errorRequests);
        const live = {
          requestsLast60s: toDbNumber(row.requestsLast60s),
          incomingLast60s: toDbNumber(row.incomingLast60s),
          outgoingLast60s: toDbNumber(row.outgoingLast60s),
          nadeoOutgoingLast60s: toDbNumber(row.nadeoOutgoingLast60s),
          internalOutgoingLast60s: toDbNumber(row.internalOutgoingLast60s),
          publicNonNadeoOutgoingLast60s: toDbNumber(row.publicNonNadeoOutgoingLast60s),
          errorsLast60s: toDbNumber(row.errorsLast60s),
          requestsLast300s: toDbNumber(row.requestsLast300s),
          nadeoOutgoingLast300s: toDbNumber(row.nadeoOutgoingLast300s),
        };
        const incomingRequests = toDbNumber(row.incomingRequests);
        const outgoingRequests = toDbNumber(row.outgoingRequests);
        const nadeoOutgoingRequests = toDbNumber(row.nadeoOutgoingRequests);
        const internalOutgoingRequests = toDbNumber(row.internalOutgoingRequests);
        const publicNonNadeoOutgoingRequests = toDbNumber(row.publicNonNadeoOutgoingRequests);
        const bytesIn = toDbNumber(row.bytesIn);
        const bytesOut = toDbNumber(row.bytesOut);
        const nadeoTransferBytes = toDbNumber(row.nadeoTransferBytes);
        const internalTransferBytes = toDbNumber(row.internalTransferBytes);
        const publicNonNadeoTransferBytes = toDbNumber(row.publicNonNadeoTransferBytes);
        const trafficScope = "window";
        const fallbackLatestObservedAt = null;
        const fallbackSinceIso = null;
        const effectiveRequests = requests;

        return {
          windowHours: safeWindowHours,
          projectKey: safeProjectKey,
          service: safeService,
          requests: effectiveRequests,
          incomingRequests,
          outgoingRequests,
          nadeoOutgoingRequests,
          internalOutgoingRequests,
          publicNonNadeoOutgoingRequests,
          errorRequests,
          errorRatePct: effectiveRequests > 0 ? (errorRequests / effectiveRequests) * 100 : 0,
          avgDurationMs: requests > 0 ? toDbNumber(row.durationMs) / requests : 0,
          bytesIn,
          bytesOut,
          nadeoTransferBytes,
          internalTransferBytes,
          publicNonNadeoTransferBytes,
          trafficScope,
          fallbackLatestObservedAt,
          fallbackSinceIso,
          statusCounts: {
            "2xx": toDbNumber(row.status2xx),
            "3xx": toDbNumber(row.status3xx),
            "4xx": toDbNumber(row.status4xx),
            "5xx": toDbNumber(row.status5xx),
            other: toDbNumber(row.statusOther),
          },
          live: {
            ...live,
            requestsPerSecond: live.requestsLast60s / 60,
            requestsPerMinute: live.requestsLast60s,
            incomingPerSecond: live.incomingLast60s / 60,
            outgoingPerSecond: live.outgoingLast60s / 60,
            nadeoOutgoingPerSecond: live.nadeoOutgoingLast60s / 60,
            nadeoOutgoingPerMinute: live.nadeoOutgoingLast60s,
            internalOutgoingPerSecond: live.internalOutgoingLast60s / 60,
            publicNonNadeoOutgoingPerSecond: live.publicNonNadeoOutgoingLast60s / 60,
            errorsPerMinute: live.errorsLast60s,
            requestsPerMinute5mAvg: live.requestsLast300s / 5,
            nadeoOutgoingPerMinute5mAvg: live.nadeoOutgoingLast300s / 5,
          },
          topServices: groupedTop({
            keySql: "COALESCE(NULLIF(service, ''), 'tracker')",
            limit: 10,
          }),
          topIncomingRoutes: groupedTop({
            keySql: "COALESCE(NULLIF(method, ''), 'GET') || ' ' || COALESCE(NULLIF(route, ''), '/')",
            extraClauses: ["direction = 'incoming'"],
            limit: 10,
          }),
          topOutgoingTargets: groupedTop({
            keySql: "COALESCE(NULLIF(target_host, ''), '(unknown)') || COALESCE(NULLIF(target_path, ''), '/')",
            extraClauses: ["direction = 'outgoing'"],
            limit: 10,
          }),
        };
      },
      { ttlMs: 15000 }
    );
  }

  getTrafficTimeseries({ bucket = "hour", windowHours = 24, projectKey = "", service = "" } = {}) {
    const safeWindowHours = normalizeWindowHours(windowHours, 24);
    const safeProjectKey = normalizeProjectKey(projectKey) || null;
    const safeService = String(service || "").trim() || null;
    const bucketMeta = parseBucket(bucket);
    const cacheKey = `traffic-timeseries:${JSON.stringify({
      bucket: bucketMeta.key,
      windowHours: safeWindowHours,
      projectKey: safeProjectKey || "",
      service: safeService || "",
    })}`;
    return this.support.withTrafficCache(
      cacheKey,
      () => {
        const meta = buildTrafficSampleQueryMeta({
          windowHours: safeWindowHours,
          projectKey,
          service,
        });
        const bucketSql = trafficBucketSqlExpression(bucketMeta.key);
        const points = this.db
          .prepare(
            `
            SELECT
              ${bucketSql} AS bucket,
              COUNT(*) AS requests,
              SUM(CASE WHEN direction = 'incoming' THEN 1 ELSE 0 END) AS incomingRequests,
              SUM(CASE WHEN direction = 'outgoing' THEN 1 ELSE 0 END) AS outgoingRequests,
              SUM(CASE WHEN direction = 'outgoing' AND is_nadeo_outgoing = 1 THEN 1 ELSE 0 END) AS nadeoOutgoingRequests,
              SUM(CASE WHEN direction = 'outgoing' AND is_internal_outgoing = 1 THEN 1 ELSE 0 END) AS internalOutgoingRequests,
              SUM(CASE WHEN direction = 'outgoing' AND is_nadeo_outgoing != 1 AND is_internal_outgoing != 1 THEN 1 ELSE 0 END) AS publicNonNadeoOutgoingRequests,
              SUM(CASE WHEN status_code >= 400 THEN 1 ELSE 0 END) AS errorRequests,
              SUM(COALESCE(bytes_in, 0)) AS bytesIn,
              SUM(COALESCE(bytes_out, 0)) AS bytesOut,
              SUM(CASE WHEN direction = 'outgoing' AND is_nadeo_outgoing = 1 THEN COALESCE(bytes_in, 0) + COALESCE(bytes_out, 0) ELSE 0 END) AS nadeoTransferBytes,
              SUM(CASE WHEN direction = 'outgoing' AND is_internal_outgoing = 1 THEN COALESCE(bytes_in, 0) + COALESCE(bytes_out, 0) ELSE 0 END) AS internalTransferBytes,
              SUM(CASE WHEN direction = 'outgoing' AND is_nadeo_outgoing != 1 AND is_internal_outgoing != 1 THEN COALESCE(bytes_in, 0) + COALESCE(bytes_out, 0) ELSE 0 END) AS publicNonNadeoTransferBytes,
              AVG(COALESCE(duration_ms, 0)) AS avgDurationMs
            FROM traffic_http_samples INDEXED BY idx_traffic_http_samples_occurred
            WHERE ${meta.clauses.join(" AND ")}
            GROUP BY bucket
            ORDER BY bucket ASC
            `
          )
          .all(...meta.args)
          .map((item) => ({
            bucket: item.bucket,
            requests: toDbNumber(item.requests),
            incomingRequests: toDbNumber(item.incomingRequests),
            outgoingRequests: toDbNumber(item.outgoingRequests),
            nadeoOutgoingRequests: toDbNumber(item.nadeoOutgoingRequests),
            internalOutgoingRequests: toDbNumber(item.internalOutgoingRequests),
            publicNonNadeoOutgoingRequests: toDbNumber(item.publicNonNadeoOutgoingRequests),
            errorRequests: toDbNumber(item.errorRequests),
            bytesIn: toDbNumber(item.bytesIn),
            bytesOut: toDbNumber(item.bytesOut),
            nadeoTransferBytes: toDbNumber(item.nadeoTransferBytes),
            internalTransferBytes: toDbNumber(item.internalTransferBytes),
            publicNonNadeoTransferBytes: toDbNumber(item.publicNonNadeoTransferBytes),
            avgDurationMs: toDbNumber(item.avgDurationMs),
          }));

        const filledPoints = fillTrafficTimeseriesBuckets(points, {
          bucketKey: bucketMeta.key,
          windowHours: safeWindowHours,
        });

        return {
          bucket: bucketMeta.key,
          windowHours: safeWindowHours,
          projectKey: safeProjectKey,
          service: safeService,
          points: filledPoints,
        };
      },
      { ttlMs: 15000 }
    );
  }

  getTrafficTop({
    windowHours = 24,
    projectKey = "",
    service = "",
    direction = "outgoing",
    dimension = "",
    limit = 20,
  } = {}) {
    const safeWindowHours = normalizeWindowHours(windowHours, 24);
    const safeProjectKey = normalizeProjectKey(projectKey) || null;
    const safeService = String(service || "").trim() || null;
    const safeDirection = normalizeTrafficDirection(direction);
    const safeLimit = clampInt(limit, { min: 1, max: 200, fallback: 20 });
    const rawDimension = String(dimension || "")
      .trim()
      .toLowerCase();
    const safeDimension = rawDimension || (safeDirection === "incoming" ? "route" : "target");
    const cacheKey = `traffic-top:${JSON.stringify({
      windowHours: safeWindowHours,
      projectKey: safeProjectKey || "",
      service: safeService || "",
      direction: safeDirection,
      dimension: safeDimension,
      limit: safeLimit,
    })}`;
    return this.support.withTrafficCache(
      cacheKey,
      () => {
        const meta = buildTrafficSampleQueryMeta({
          windowHours: safeWindowHours,
          projectKey,
          service,
          direction: safeDirection,
        });
        let keySql = "COALESCE(NULLIF(target_host, ''), '(unknown)') || COALESCE(NULLIF(target_path, ''), '/')";
        let extraClauses = [];
        if (safeDimension === "nadeo_route") {
          keySql =
            "COALESCE(NULLIF(method, ''), 'GET') || ' ' || COALESCE(NULLIF(target_path, ''), NULLIF(route, ''), '/')";
          extraClauses = ["is_nadeo_outgoing = 1"];
        } else if (safeDimension === "status") {
          keySql = "COALESCE(NULLIF(status_group, ''), 'other')";
        } else if (safeDimension === "service") {
          keySql = "COALESCE(NULLIF(service, ''), 'tracker')";
        } else if (safeDimension === "method") {
          keySql = "COALESCE(NULLIF(method, ''), 'GET')";
        } else if (safeDimension === "route") {
          keySql = "COALESCE(NULLIF(method, ''), 'GET') || ' ' || COALESCE(NULLIF(route, ''), '/')";
        }
        const readTopItems = (queryMeta, { useIndex = true } = {}) =>
          this.db
            .prepare(
              `
              SELECT
                ${keySql} AS key,
                COUNT(*) AS requests,
                SUM(CASE WHEN status_code >= 400 THEN 1 ELSE 0 END) AS errorRequests,
                SUM(COALESCE(bytes_in, 0)) AS bytesIn,
                SUM(COALESCE(bytes_out, 0)) AS bytesOut,
                AVG(COALESCE(duration_ms, 0)) AS avgDurationMs
              FROM traffic_http_samples${useIndex ? " INDEXED BY idx_traffic_http_samples_occurred" : ""}
              WHERE ${queryMeta.clauses.join(" AND ")}
              GROUP BY key
              ORDER BY requests DESC, key ASC
              LIMIT ?
              `
            )
            .all(...queryMeta.args, safeLimit)
            .map((item) => {
              const requests = toDbNumber(item.requests);
              const errorRequests = toDbNumber(item.errorRequests);
              return {
                key: item.key,
                requests,
                errorRequests,
                errorRatePct: requests > 0 ? (errorRequests / requests) * 100 : 0,
                bytesIn: toDbNumber(item.bytesIn),
                bytesOut: toDbNumber(item.bytesOut),
                avgDurationMs: toDbNumber(item.avgDurationMs),
              };
            });

        const topMeta = appendTrafficWhere(meta, extraClauses);
        const items = readTopItems(topMeta);
        const source = "traffic-database-window";

        return {
          windowHours: safeWindowHours,
          projectKey: safeProjectKey,
          service: safeService,
          direction: safeDirection,
          dimension: safeDimension,
          source,
          items,
        };
      },
      { ttlMs: 15000 }
    );
  }

  getTrafficErrors({
    windowHours = 24,
    projectKey = "",
    service = "",
    direction = "",
    statusMin = 400,
    q = "",
    limit = 50,
    page = 1,
    offset = 0,
  } = {}) {
    const safeWindowHours = normalizeWindowHours(windowHours, 24);
    const safeProjectKey = normalizeProjectKey(projectKey) || null;
    const safeService = String(service || "").trim() || null;
    const safeStatusMin = clampInt(statusMin, { min: 400, max: 599, fallback: 400 });
    const rawDirection = String(direction || "")
      .trim()
      .toLowerCase();
    const safeDirection = rawDirection === "incoming" || rawDirection === "outgoing" ? rawDirection : "";
    const safeLimit = clampInt(limit, { min: 1, max: 500, fallback: 50 });
    const requestedPage = Math.max(1, Number(page) || 1);
    const requestedOffset =
      Number(offset) > 0 ? Math.max(0, Math.floor(Number(offset))) : (requestedPage - 1) * safeLimit;
    const queryText = String(q || "")
      .trim()
      .toLowerCase();
    const cacheKey = `traffic-errors:${JSON.stringify({
      windowHours: safeWindowHours,
      projectKey: safeProjectKey || "",
      service: safeService || "",
      direction: safeDirection || "",
      statusMin: safeStatusMin,
      q: queryText,
      limit: safeLimit,
      page: requestedPage,
      offset: requestedOffset,
    })}`;
    return this.support.withTrafficCache(
      cacheKey,
      () => {
        const meta = buildTrafficSampleQueryMeta({
          windowHours: safeWindowHours,
          projectKey,
          service,
          direction: safeDirection,
          statusMin: safeStatusMin,
          q: queryText,
        });
        const whereSql = meta.clauses.join(" AND ");
        const total = toDbNumber(
          this.db
            .prepare(
              `
              SELECT COUNT(*) AS count
              FROM traffic_http_samples INDEXED BY idx_traffic_http_samples_occurred
              WHERE ${whereSql}
              `
            )
            .get(...meta.args)?.count
        );
        const totalPages = Math.max(1, Math.ceil(total / safeLimit));
        const clampedPage = Math.max(1, Math.min(requestedPage, totalPages));
        const clampedOffset = Math.max(0, (clampedPage - 1) * safeLimit);
        const pageRows = this.db
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
            WHERE ${whereSql}
            ORDER BY occurred_at DESC, duration_ms DESC
            LIMIT ? OFFSET ?
            `
          )
          .all(...meta.args, safeLimit, clampedOffset)
          .map((row) => mapTrafficSampleDbRow(row));

        const topSummary = ({ keySql, extraClauses = [], limit = 8 }) => {
          const topMeta = appendTrafficWhere(meta, extraClauses);
          return this.db
            .prepare(
              `
              SELECT ${keySql} AS key, COUNT(*) AS count
              FROM traffic_http_samples INDEXED BY idx_traffic_http_samples_occurred
              WHERE ${topMeta.clauses.join(" AND ")}
              GROUP BY key
              ORDER BY count DESC, key ASC
              LIMIT ?
              `
            )
            .all(...topMeta.args, limit)
            .map((row) => ({ key: String(row.key || ""), count: Number(row.count || 0) }));
        };

        const items = pageRows.map((row) => ({
          occurredAt: row.occurredAt,
          direction: row.direction,
          service: row.service,
          method: row.method,
          route: row.route,
          targetHost: row.targetHost || null,
          targetPath: row.targetPath || null,
          target: row.targetHost ? `${row.targetHost}${row.targetPath || "/"}` : null,
          statusCode: row.statusCode,
          statusGroup: row.statusGroup,
          durationMs: row.durationMs,
          bytesIn: row.bytesIn,
          bytesOut: row.bytesOut,
          projectKey: row.projectKey || null,
          sourceLabel: row.sourceLabel || null,
          isNadeoOutgoing: Boolean(row.isNadeoOutgoing),
          isInternalOutgoing: Boolean(row.isInternalOutgoing),
        }));

        return {
          windowHours: safeWindowHours,
          projectKey: safeProjectKey,
          service: safeService,
          direction: safeDirection || null,
          statusMin: safeStatusMin,
          q: queryText || "",
          total,
          count: items.length,
          limit: safeLimit,
          offset: clampedOffset,
          page: clampedPage,
          totalPages,
          items,
          summary: {
            statusCounts: topSummary({
              keySql: "CAST(COALESCE(status_code, 0) AS TEXT)",
              limit: 12,
            }),
            topIncomingRoutes: topSummary({
              keySql: "COALESCE(NULLIF(method, ''), 'GET') || ' ' || COALESCE(NULLIF(route, ''), '/')",
              extraClauses: ["direction = 'incoming'"],
              limit: 8,
            }),
            topOutgoingTargets: topSummary({
              keySql: "COALESCE(NULLIF(target_host, ''), '(unknown)') || COALESCE(NULLIF(target_path, ''), '/')",
              extraClauses: ["direction = 'outgoing'"],
              limit: 8,
            }),
          },
        };
      },
      { ttlMs: 15000 }
    );
  }
}

export { TrafficAnalyticsRepository };
