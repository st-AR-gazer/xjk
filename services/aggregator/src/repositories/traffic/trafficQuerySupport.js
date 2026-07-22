import { clampInt } from "../../../../shared/valueUtils.js";
import { normalizeArray, normalizeProjectKey } from "../support/repositoryValues.js";
import { normalizeWindowHours, toTrafficBucket } from "./trafficNormalization.js";

function buildTrafficQueryMeta({
  sinceIso = "",
  projectKey = "",
  service = "",
  direction = "",
  statusMin = 0,
  q = "",
} = {}) {
  const safeProjectKey = normalizeProjectKey(projectKey);
  const safeService = String(service || "")
    .trim()
    .toLowerCase();
  const rawDirection = String(direction || "")
    .trim()
    .toLowerCase();
  const safeDirection = rawDirection === "incoming" || rawDirection === "outgoing" ? rawDirection : "";
  const safeStatusMin = clampInt(statusMin, { min: 0, max: 999, fallback: 0 });
  const queryText = String(q || "")
    .trim()
    .toLowerCase();
  const clauses = sinceIso ? ["occurred_at >= ?"] : ["1 = 1"];
  const args = sinceIso ? [sinceIso] : [];

  if (safeProjectKey) {
    clauses.push("project_key = ?");
    args.push(safeProjectKey);
  }
  if (safeService) {
    clauses.push("LOWER(service) = ?");
    args.push(safeService);
  }
  if (safeDirection) {
    clauses.push("direction = ?");
    args.push(safeDirection);
  }
  if (safeStatusMin > 0) {
    clauses.push("status_code >= ?");
    args.push(safeStatusMin);
  }
  if (queryText) {
    clauses.push(
      "(" +
        [
          "LOWER(COALESCE(method, '')) LIKE ?",
          "LOWER(COALESCE(route, '')) LIKE ?",
          "LOWER(COALESCE(target_host, '')) LIKE ?",
          "LOWER(COALESCE(target_path, '')) LIKE ?",
          "LOWER(COALESCE(service, '')) LIKE ?",
          "LOWER(COALESCE(project_key, '')) LIKE ?",
          "LOWER(COALESCE(source_label, '')) LIKE ?",
          "LOWER(CAST(COALESCE(status_code, 0) AS TEXT)) LIKE ?",
        ].join(" OR ") +
        ")"
    );
    for (let i = 0; i < 8; i += 1) {
      args.push(`%${queryText}%`);
    }
  }

  return {
    safeProjectKey,
    safeService,
    safeDirection,
    safeStatusMin,
    queryText,
    sinceIso: sinceIso || null,
    clauses,
    args,
  };
}

function buildTrafficSampleQueryMeta({
  windowHours = 24,
  projectKey = "",
  service = "",
  direction = "",
  statusMin = 0,
  q = "",
} = {}) {
  const safeWindowHours = normalizeWindowHours(windowHours, 24);
  const sinceIso = new Date(Date.now() - safeWindowHours * 60 * 60 * 1000).toISOString();
  return {
    safeWindowHours,
    ...buildTrafficQueryMeta({
      sinceIso,
      projectKey,
      service,
      direction,
      statusMin,
      q,
    }),
  };
}

function buildAllTimeTrafficQueryMeta(options = {}) {
  return buildTrafficQueryMeta(options);
}

function trafficBucketSqlExpression(bucketKey) {
  if (bucketKey === "day") return "substr(occurred_at, 1, 10) || 'T00:00:00Z'";
  if (bucketKey === "minute") return "substr(occurred_at, 1, 16) || ':00Z'";
  if (bucketKey === "quarter_hour") {
    return "substr(occurred_at, 1, 14) || printf('%02d:00Z', CAST(CAST(substr(occurred_at, 15, 2) AS INTEGER) / 15 AS INTEGER) * 15)";
  }
  return "substr(occurred_at, 1, 13) || ':00:00Z'";
}

function appendTrafficWhere(meta, clauses = [], args = []) {
  return {
    clauses: [...meta.clauses, ...clauses],
    args: [...meta.args, ...args],
  };
}

function trafficBucketStepMs(bucketKey) {
  if (bucketKey === "minute") return 60 * 1000;
  if (bucketKey === "quarter_hour") return 15 * 60 * 1000;
  if (bucketKey === "day") return 24 * 60 * 60 * 1000;
  return 60 * 60 * 1000;
}

function floorTrafficBucketMs(ms, bucketKey) {
  const date = new Date(ms);
  if (Number.isNaN(date.getTime())) return 0;
  if (bucketKey === "day") {
    return Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());
  }
  if (bucketKey === "hour") {
    return Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate(), date.getUTCHours());
  }
  if (bucketKey === "quarter_hour") {
    const minute = Math.floor(date.getUTCMinutes() / 15) * 15;
    return Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate(), date.getUTCHours(), minute);
  }
  return Date.UTC(
    date.getUTCFullYear(),
    date.getUTCMonth(),
    date.getUTCDate(),
    date.getUTCHours(),
    date.getUTCMinutes()
  );
}

function emptyTrafficTimeseriesPoint(bucket) {
  return {
    bucket,
    requests: 0,
    incomingRequests: 0,
    outgoingRequests: 0,
    nadeoOutgoingRequests: 0,
    internalOutgoingRequests: 0,
    publicNonNadeoOutgoingRequests: 0,
    errorRequests: 0,
    bytesIn: 0,
    bytesOut: 0,
    nadeoTransferBytes: 0,
    internalTransferBytes: 0,
    publicNonNadeoTransferBytes: 0,
    avgDurationMs: 0,
  };
}

function fillTrafficTimeseriesBuckets(points = [], { bucketKey = "hour", windowHours = 24 } = {}) {
  const stepMs = trafficBucketStepMs(bucketKey);
  const endMs = floorTrafficBucketMs(Date.now(), bucketKey);
  const startMs = floorTrafficBucketMs(Date.now() - normalizeWindowHours(windowHours, 24) * 60 * 60 * 1000, bucketKey);
  if (!startMs || !endMs || endMs < startMs || (endMs - startMs) / stepMs > 5000) {
    return normalizeArray(points);
  }

  const byBucket = new Map();
  for (const point of normalizeArray(points)) {
    if (!point?.bucket) continue;
    byBucket.set(point.bucket, point);
  }

  const out = [];
  for (let cursor = startMs; cursor <= endMs; cursor += stepMs) {
    const bucket = toTrafficBucket(new Date(cursor).toISOString(), bucketKey);
    out.push(byBucket.get(bucket) || emptyTrafficTimeseriesPoint(bucket));
  }
  return out;
}

export {
  buildTrafficQueryMeta,
  buildTrafficSampleQueryMeta,
  buildAllTimeTrafficQueryMeta,
  trafficBucketSqlExpression,
  appendTrafficWhere,
  trafficBucketStepMs,
  floorTrafficBucketMs,
  emptyTrafficTimeseriesPoint,
  fillTrafficTimeseriesBuckets,
};
