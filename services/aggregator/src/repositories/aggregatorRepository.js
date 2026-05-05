import {
  sanitizeResolvedDisplayName,
  normalizeDisplayNameQuery,
  validateSharedDisplayName,
} from "../../../shared/displayNameResolution.js";

function clampInt(value, { min = 0, max = Number.MAX_SAFE_INTEGER, fallback = 0 } = {}) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(min, Math.min(max, Math.floor(parsed)));
}

function toIso(value, fallbackIso) {
  if (value === null || value === undefined || value === "") return fallbackIso;
  const dt = new Date(value);
  if (Number.isNaN(dt.getTime())) return fallbackIso;
  return dt.toISOString();
}

function normalizeProjectKey(value) {
  const cleaned = String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return cleaned.slice(0, 120);
}

function normalizeInstanceId(value) {
  const cleaned = String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return cleaned.slice(0, 120);
}

function normalizeMaybeString(value) {
  const text = String(value || "").trim();
  return text || null;
}

function normalizeAccountId(value) {
  const text = String(value || "").trim().toLowerCase();
  if (!text) return "";
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(text)) {
    return text;
  }
  return "";
}

function normalizeClubId(value) {
  return clampInt(value, { min: 1, max: 2147483647, fallback: 0 });
}

function normalizeArray(value) {
  return Array.isArray(value) ? value : [];
}

function normalizeSearchMode(value) {
  const raw = String(value || "").trim().toLowerCase();
  if (raw === "prefix" || raw === "contains" || raw === "fuzzy") return raw;
  return "contains";
}

const FUZZY_SEARCH_ROW_LIMIT = 5000;

function computeDiceScore(a, b) {
  const left = String(a || "");
  const right = String(b || "");
  if (!left || !right) return 0;
  if (left === right) return 1;
  if (left.length === 1 || right.length === 1) {
    return left === right ? 1 : 0;
  }

  const grams = (value) => {
    const out = new Map();
    for (let i = 0; i < value.length - 1; i += 1) {
      const gram = value.slice(i, i + 2);
      out.set(gram, (out.get(gram) || 0) + 1);
    }
    return out;
  };

  const leftGrams = grams(left);
  const rightGrams = grams(right);
  let overlap = 0;
  for (const [gram, count] of leftGrams.entries()) {
    overlap += Math.min(count, rightGrams.get(gram) || 0);
  }
  return (2 * overlap) / (Math.max(1, left.length - 1) + Math.max(1, right.length - 1));
}

function uniqueBy(values, toKey) {
  const keyFn = typeof toKey === "function" ? toKey : (value) => value;
  const seen = new Set();
  const out = [];
  for (const value of Array.isArray(values) ? values : []) {
    const key = keyFn(value);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(value);
  }
  return out;
}

function isSafeIdentifier(value) {
  return /^[A-Za-z_][A-Za-z0-9_]*$/.test(String(value || ""));
}

function quoteIdentifier(value) {
  if (!isSafeIdentifier(value)) return "";
  return `"${String(value).replace(/"/g, "\"\"")}"`;
}

function parseBucket(value) {
  const raw = String(value || "").trim().toLowerCase();
  if (raw === "minute" || raw === "min") {
    return {
      key: "minute",
      expr: "strftime('%Y-%m-%dT%H:%M:00Z', __ts__)",
    };
  }
  if (
    raw === "quarter_hour" ||
    raw === "quarter-hour" ||
    raw === "quarter" ||
    raw === "15min" ||
    raw === "15m"
  ) {
    return {
      key: "quarter_hour",
      expr:
        "substr(__ts__, 1, 14) || printf('%02d:00Z', CAST(CAST(substr(__ts__, 15, 2) AS INTEGER) / 15 AS INTEGER) * 15)",
    };
  }
  if (raw === "day" || raw === "daily") {
    return {
      key: "day",
      expr: "strftime('%Y-%m-%dT00:00:00Z', __ts__)",
    };
  }
  return {
    key: "hour",
    expr: "strftime('%Y-%m-%dT%H:00:00Z', __ts__)",
  };
}

function normalizeWindowHours(value, fallback = 24) {
  return clampInt(value, {
    min: 1,
    max: 24 * 90,
    fallback,
  });
}

function normalizeTrafficDirection(value) {
  const raw = String(value || "").trim().toLowerCase();
  return raw === "incoming" ? "incoming" : "outgoing";
}

function normalizeHttpMethod(value) {
  const raw = String(value || "").trim().toUpperCase();
  if (!raw) return "GET";
  return raw.slice(0, 12);
}

function normalizeHttpPath(value) {
  const raw = String(value || "").trim();
  if (!raw) return "/";
  if (raw.startsWith("/")) return raw.slice(0, 300);
  return `/${raw}`.slice(0, 300);
}

function normalizeComponent(value) {
  const raw = String(value || "").trim();
  return raw ? raw.slice(0, 120) : "http";
}

function normalizeTrafficStatusCode(value) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return 0;
  return Math.max(0, Math.min(999, Math.floor(parsed)));
}

function toSafeNumber(value, { min = 0, max = Number.MAX_SAFE_INTEGER } = {}) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return 0;
  return Math.max(min, Math.min(max, parsed));
}

function normalizeHost(value) {
  const raw = String(value || "").trim().toLowerCase();
  if (!raw) return "";
  return raw.slice(0, 160);
}

function isNadeoTargetHost(value) {
  const host = normalizeHost(value);
  if (!host) return false;
  return (
    host.includes("trackmania.com") ||
    host.includes("nadeo.live") ||
    host.includes(".nadeo.") ||
    host.startsWith("nadeo.") ||
    host.includes("ubisoft.com") ||
    host.includes(".ubi.com")
  );
}

function isPrivateOrLocalTargetHost(value) {
  const host = normalizeHost(value);
  if (!host) return false;
  if (host === "localhost" || host === "::1" || host.startsWith("127.")) return true;
  if (host.startsWith("10.") || host.startsWith("192.168.")) return true;
  const octets = host.split(".");
  if (octets.length === 4) {
    const first = Number(octets[0] || 0);
    const second = Number(octets[1] || 0);
    if (first === 172 && second >= 16 && second <= 31) return true;
  }
  return false;
}

function tryParseJson(value) {
  const raw = String(value || "").trim();
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function toTrafficBucket(iso, bucketKey) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  if (bucketKey === "day") {
    return date.toISOString().slice(0, 10) + "T00:00:00Z";
  }
  if (bucketKey === "quarter_hour") {
    const minute = Math.floor(date.getUTCMinutes() / 15) * 15;
    date.setUTCMinutes(minute, 0, 0);
    return date.toISOString().slice(0, 16) + ":00Z";
  }
  if (bucketKey === "minute") {
    return date.toISOString().slice(0, 16) + ":00Z";
  }
  return date.toISOString().slice(0, 13) + ":00:00Z";
}

function parseTrafficRow(row = {}) {
  const payload = tryParseJson(row.payload_json) || {};
  const direction = normalizeTrafficDirection(payload.direction || row.direction || "outgoing");
  const service = String(payload.service || row.service || "").trim() || "tracker";
  const component = normalizeComponent(payload.component || row.component || "http");
  const method = normalizeHttpMethod(payload.method || row.method || "GET");
  const route = normalizeHttpPath(payload.route || row.route || "/");
  const targetHost = normalizeHost(payload.targetHost || row.target_host || "");
  const targetPath = normalizeHttpPath(payload.targetPath || row.target_path || "/");
  const statusCode = normalizeTrafficStatusCode(payload.statusCode || row.status_code || 0);
  const durationMs = toSafeNumber(payload.durationMs || row.duration_ms || 0, { min: 0, max: 3_600_000 });
  const bytesIn = toSafeNumber(payload.bytesIn || row.bytes_in || 0, { min: 0, max: Number.MAX_SAFE_INTEGER });
  const bytesOut = toSafeNumber(payload.bytesOut || row.bytes_out || 0, {
    min: 0,
    max: Number.MAX_SAFE_INTEGER,
  });
  const occurredAt = toIso(payload.occurredAt || row.occurred_at || "", new Date().toISOString());
  const statusGroup = statusCode >= 500 ? "5xx" : statusCode >= 400 ? "4xx" : statusCode >= 300 ? "3xx" : "2xx";
  return {
    projectKey: String(row.project_key || payload.projectKey || "").trim() || null,
    sourceLabel: String(row.source_label || payload.sourceLabel || "").trim() || null,
    direction,
    service,
    component,
    method,
    route,
    targetHost,
    targetPath,
    statusCode,
    statusGroup,
    durationMs,
    bytesIn,
    bytesOut,
    occurredAt,
  };
}

function normalizeTrafficSample(sample = {}, { projectKey = null, sourceLabel = null, occurredAt = "" } = {}) {
  const direction = normalizeTrafficDirection(sample?.direction || "outgoing");
  const service = String(sample?.service || sample?.component || "tracker").trim() || "tracker";
  const component = normalizeComponent(sample?.component || "http");
  const method = normalizeHttpMethod(sample?.method || "GET");
  const route = normalizeHttpPath(sample?.route || sample?.path || "/");
  const targetHost = normalizeHost(sample?.targetHost || sample?.host || "");
  const targetPath = normalizeHttpPath(sample?.targetPath || sample?.path || route);
  const statusCode = normalizeTrafficStatusCode(sample?.statusCode || sample?.status || 0);
  const durationMs = toSafeNumber(sample?.durationMs || sample?.duration || 0, {
    min: 0,
    max: 3_600_000,
  });
  const bytesIn = toSafeNumber(sample?.bytesIn || sample?.requestBytes || 0, {
    min: 0,
    max: Number.MAX_SAFE_INTEGER,
  });
  const bytesOut = toSafeNumber(sample?.bytesOut || sample?.responseBytes || 0, {
    min: 0,
    max: Number.MAX_SAFE_INTEGER,
  });
  const safeOccurredAt = toIso(sample?.occurredAt || sample?.at || occurredAt, new Date().toISOString());
  const isNadeoOutgoing = direction === "outgoing" && isNadeoTargetHost(targetHost);
  const isInternalOutgoing = direction === "outgoing" && isPrivateOrLocalTargetHost(targetHost);
  const statusGroup =
    statusCode >= 500 ? "5xx" : statusCode >= 400 ? "4xx" : statusCode >= 300 ? "3xx" : "2xx";

  return {
    projectKey: normalizeProjectKey(projectKey) || null,
    sourceLabel: normalizeMaybeString(sourceLabel),
    direction,
    service,
    component,
    method,
    route,
    targetHost,
    targetPath,
    statusCode,
    statusGroup,
    durationMs,
    bytesIn,
    bytesOut,
    occurredAt: safeOccurredAt,
    isNadeoOutgoing,
    isInternalOutgoing,
  };
}

function mapTrafficSampleDbRow(row = {}) {
  return {
    projectKey: normalizeProjectKey(row?.projectKey) || null,
    sourceLabel: normalizeMaybeString(row?.sourceLabel),
    direction: normalizeTrafficDirection(row?.direction),
    service: String(row?.service || "").trim() || "tracker",
    component: normalizeComponent(row?.component || "http"),
    method: normalizeHttpMethod(row?.method || "GET"),
    route: normalizeHttpPath(row?.route || "/"),
    targetHost: normalizeHost(row?.targetHost || ""),
    targetPath: normalizeHttpPath(row?.targetPath || "/"),
    statusCode: normalizeTrafficStatusCode(row?.statusCode || 0),
    statusGroup: String(row?.statusGroup || "").trim() || "2xx",
    durationMs: toSafeNumber(row?.durationMs || 0, { min: 0, max: 3_600_000 }),
    bytesIn: toSafeNumber(row?.bytesIn || 0, { min: 0, max: Number.MAX_SAFE_INTEGER }),
    bytesOut: toSafeNumber(row?.bytesOut || 0, { min: 0, max: Number.MAX_SAFE_INTEGER }),
    occurredAt: toIso(row?.occurredAt || "", new Date().toISOString()),
    isNadeoOutgoing: Boolean(Number(row?.isNadeoOutgoing || 0)),
    isInternalOutgoing: Boolean(Number(row?.isInternalOutgoing || 0)),
  };
}

function buildTrafficQueryMeta({
  sinceIso = "",
  projectKey = "",
  service = "",
  direction = "",
  statusMin = 0,
  q = "",
} = {}) {
  const safeWindowHours = normalizeWindowHours(windowHours, 24);
  const safeProjectKey = normalizeProjectKey(projectKey);
  const safeService = String(service || "").trim().toLowerCase();
  const rawDirection = String(direction || "").trim().toLowerCase();
  const safeDirection =
    rawDirection === "incoming" || rawDirection === "outgoing" ? rawDirection : "";
  const safeStatusMin = clampInt(statusMin, { min: 0, max: 999, fallback: 0 });
  const queryText = String(q || "").trim().toLowerCase();
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

function toDbNumber(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function toDbInt(value) {
  return Math.max(0, Math.floor(toDbNumber(value)));
}

function parseJsonObject(value) {
  const parsed = tryParseJson(value);
  return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
}

function secondsBetweenIso(startValue, endValue) {
  const startMs = Date.parse(String(startValue || ""));
  const endMs = Date.parse(String(endValue || ""));
  if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || endMs <= startMs) return 0;
  return (endMs - startMs) / 1000;
}

function mapIngestRunDbRow(row = null) {
  if (!row) return null;
  const mapsChecked = toDbInt(row.maps_checked);
  const wrChanges = toDbInt(row.wr_changes);
  return {
    runId: toDbInt(row.ingest_id),
    status: "finished",
    provider: row.provider || null,
    reason: row.reason || null,
    sourceLabel: row.source_label || null,
    startedAt: row.started_at || null,
    finishedAt: row.finished_at || null,
    mapsConsidered: toDbInt(row.maps_considered),
    mapsChecked,
    mapsTotal: toDbInt(row.maps_considered),
    mapsChanged: wrChanges,
    wrChanges,
    note: row.note || null,
    receivedAt: row.received_at || null,
    durationSeconds: secondsBetweenIso(row.started_at, row.finished_at),
  };
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

function normalizeDisplayNameEntries(payload = {}) {
  const out = [];
  const rejected = [];

  const rejectEntry = ({ accountId = "", displayName = "", reason = "invalid_display_name" } = {}) => {
    rejected.push({
      accountId: accountId || null,
      displayName: displayName || null,
      reason,
    });
  };

  const maybeArray = normalizeArray(payload.names);
  for (const row of maybeArray) {
    const accountId = normalizeAccountId(row?.accountId || row?.account_id || row?.id);
    const rawDisplayName = row?.displayName ?? row?.display_name ?? row?.name ?? "";
    const validation = validateSharedDisplayName(rawDisplayName, { accountId });
    if (!accountId) {
      rejectEntry({ accountId, displayName: String(rawDisplayName || "").trim(), reason: "invalid_account_id" });
      continue;
    }
    if (!validation.ok) {
      rejectEntry({ accountId, displayName: validation.displayName || String(rawDisplayName || "").trim(), reason: validation.reason });
      continue;
    }
    out.push({
      accountId,
      displayName: validation.displayName,
      observedAt: row?.observedAt || row?.observed_at || payload.observedAt || payload.observed_at,
      source: row?.source || payload.sourceLabel || payload.source,
    });
  }

  const mapping = payload.namesByAccountId || payload.displayNames || payload.names_map;
  if (mapping && typeof mapping === "object" && !Array.isArray(mapping)) {
    for (const [rawAccountId, rawName] of Object.entries(mapping)) {
      const accountId = normalizeAccountId(rawAccountId);
      const validation = validateSharedDisplayName(rawName, { accountId });
      if (!accountId) {
        rejectEntry({ accountId, displayName: String(rawName || "").trim(), reason: "invalid_account_id" });
        continue;
      }
      if (!validation.ok) {
        rejectEntry({ accountId, displayName: validation.displayName || String(rawName || "").trim(), reason: validation.reason });
        continue;
      }
      out.push({
        accountId,
        displayName: validation.displayName,
        observedAt: payload.observedAt || payload.observed_at,
        source: payload.sourceLabel || payload.source,
      });
    }
  }

  const dedup = new Map();
  for (const entry of out) {
    const key = `${entry.accountId}|${entry.displayName}`;
    if (!dedup.has(key)) dedup.set(key, entry);
  }
  return {
    entries: [...dedup.values()],
    rejected,
  };
}

class AggregatorRepository {
  constructor(db) {
    this.db = db;
    this.trafficQueryCache = new Map();
    this.trafficCacheVersion = 0;
    this.trafficBackfillStateCache = {
      expiresAtMs: 0,
      complete: false,
      sampleCount: 0,
      eventCount: 0,
    };
  }

  bumpTrafficCacheVersion() {
    this.trafficCacheVersion += 1;
    this.trafficQueryCache.clear();
    this.trafficBackfillStateCache.expiresAtMs = 0;
    return this.trafficCacheVersion;
  }

  backfillNormalizedDisplayNames() {
    try {
      const db = this.db;
      db.exec("BEGIN");
      
      const unnormalizedCurrent = db.prepare("SELECT account_id, display_name FROM account_display_name_current WHERE normalized_display_name IS NULL LIMIT 20000").all();
      const updateCurrent = db.prepare("UPDATE account_display_name_current SET normalized_display_name = ? WHERE account_id = ?");
      for (const row of unnormalizedCurrent) {
        updateCurrent.run(normalizeDisplayNameQuery(row.display_name), row.account_id);
      }

      const unnormalizedHistory = db.prepare("SELECT id, display_name FROM account_display_name_history WHERE normalized_display_name IS NULL LIMIT 20000").all();
      const updateHistory = db.prepare("UPDATE account_display_name_history SET normalized_display_name = ? WHERE id = ?");
      for (const row of unnormalizedHistory) {
        updateHistory.run(normalizeDisplayNameQuery(row.display_name), row.id);
      }
      
      db.exec("COMMIT");
      if (unnormalizedCurrent.length > 0 || unnormalizedHistory.length > 0) {
        return true;
      }
      return false;
    } catch (err) {
      try { this.db.exec("ROLLBACK"); } catch(e) {}
      console.error("Failed to backfill normalized display names:", err);
      return false;
    }
  }

  getDisplayNamesByName({ displayNames = [], maxAgeSeconds = 0 } = {}) {
    const isStale = (ageSeconds) =>
      Number(maxAgeSeconds || 0) > 0 ? Number(ageSeconds || 0) > Number(maxAgeSeconds) : false;

    const names = normalizeArray(displayNames).map((n) => String(n || "").trim()).filter(Boolean);
    const uniqueOriginals = [...new Set(names)];

    const queries = uniqueOriginals.map((original) => {
      return {
        displayName: original,
        normalizedDisplayName: normalizeDisplayNameQuery(original),
        matches: []
      };
    });

    const normalizedToQuery = new Map();
    for (const q of queries) {
      if (!normalizedToQuery.has(q.normalizedDisplayName)) {
        normalizedToQuery.set(q.normalizedDisplayName, []);
      }
      normalizedToQuery.get(q.normalizedDisplayName).push(q);
    }

    const uniqueNormalized = [...normalizedToQuery.keys()];

    if (uniqueNormalized.length > 0) {
      const placeholders = uniqueNormalized.map(() => "?").join(",");
      const rows = this.db
        .prepare(
          `
        SELECT
          c.account_id AS accountId,
          c.display_name AS displayName,
          c.normalized_display_name AS normalizedDisplayName,
          c.source,
          c.observed_at AS observedAt,
          c.updated_at AS updatedAt,
          CAST((julianday('now') - julianday(c.observed_at)) * 86400 AS INTEGER) AS ageSeconds
        FROM account_display_name_current c
        WHERE c.normalized_display_name IN (${placeholders})
        ORDER BY c.account_id ASC
        `
        )
        .all(...uniqueNormalized);

      for (const row of rows) {
        const item = {
          accountId: row.accountId,
          displayName: row.displayName,
          normalizedDisplayName: row.normalizedDisplayName,
          source: row.source || null,
          observedAt: row.observedAt,
          updatedAt: row.updatedAt,
          stale: isStale(row.ageSeconds),
          missing: false,
        };
        const mappedQueries = normalizedToQuery.get(row.normalizedDisplayName) || [];
        for (const mq of mappedQueries) {
          mq.matches.push(item);
        }
      }
    }

    return {
      queries,
      count: queries.length,
    };
  }

  withTrafficCache(cacheKey, compute, { ttlMs = 15000 } = {}) {
    const safeKey = String(cacheKey || "").trim();
    if (!safeKey || typeof compute !== "function") {
      return typeof compute === "function" ? compute() : null;
    }
    const nowMs = Date.now();
    const existing = this.trafficQueryCache.get(safeKey);
    if (
      existing &&
      existing.version === this.trafficCacheVersion &&
      existing.expiresAtMs > nowMs
    ) {
      return existing.value;
    }
    const value = compute();
    this.trafficQueryCache.set(safeKey, {
      version: this.trafficCacheVersion,
      expiresAtMs: nowMs + Math.max(1000, Number(ttlMs) || 15000),
      value,
    });
    return value;
  }

  insertTrafficSampleRecord(eventId, sample = {}) {
    const safeEventId = clampInt(eventId, { min: 1, max: Number.MAX_SAFE_INTEGER, fallback: 0 });
    if (!safeEventId) return 0;
    const normalized = normalizeTrafficSample(sample, {
      projectKey: sample?.projectKey,
      sourceLabel: sample?.sourceLabel,
      occurredAt: sample?.occurredAt,
    });
    const result = this.db
      .prepare(
        `
        INSERT OR IGNORE INTO traffic_http_samples (
          event_id,
          project_key,
          source_label,
          direction,
          service,
          component,
          method,
          route,
          target_host,
          target_path,
          status_code,
          status_group,
          duration_ms,
          bytes_in,
          bytes_out,
          occurred_at,
          is_nadeo_outgoing,
          is_internal_outgoing
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `
      )
      .run(
        safeEventId,
        normalized.projectKey,
        normalized.sourceLabel,
        normalized.direction,
        normalized.service,
        normalized.component,
        normalized.method,
        normalized.route,
        normalized.targetHost || null,
        normalized.targetPath,
        normalized.statusCode,
        normalized.statusGroup,
        normalized.durationMs,
        Math.floor(normalized.bytesIn),
        Math.floor(normalized.bytesOut),
        normalized.occurredAt,
        normalized.isNadeoOutgoing ? 1 : 0,
        normalized.isInternalOutgoing ? 1 : 0
      );
    return Number(result?.changes || 0);
  }

  backfillTrafficSamples({ batchSize = 5000, maxBatches = 500 } = {}) {
    const safeBatchSize = clampInt(batchSize, { min: 100, max: 50000, fallback: 5000 });
    const safeMaxBatches = clampInt(maxBatches, { min: 1, max: 50000, fallback: 500 });
    const selectStmt = this.db.prepare(
      `
      SELECT
        ae.event_id AS eventId,
        ae.project_key AS projectKey,
        ae.source_label AS sourceLabel,
        ae.occurred_at AS occurredAt,
        ae.payload_json AS payloadJson
      FROM aggregator_events ae
      LEFT JOIN traffic_http_samples ths ON ths.event_id = ae.event_id
      WHERE ae.event_type = 'traffic.http' AND ths.event_id IS NULL
      ORDER BY ae.event_id ASC
      LIMIT ?
      `
    );

    let inserted = 0;
    for (let batchIndex = 0; batchIndex < safeMaxBatches; batchIndex += 1) {
      const rows = selectStmt.all(safeBatchSize);
      if (!rows.length) break;
      this.db.exec("BEGIN");
      try {
        for (const row of rows) {
          const normalized = parseTrafficRow({
            project_key: row.projectKey,
            source_label: row.sourceLabel,
            occurred_at: row.occurredAt,
            payload_json: row.payloadJson,
          });
          inserted += this.insertTrafficSampleRecord(row.eventId, normalized);
        }
        this.db.exec("COMMIT");
      } catch (error) {
        try {
          this.db.exec("ROLLBACK");
        } catch {}
        throw error;
      }
      if (rows.length < safeBatchSize) break;
    }
    if (inserted > 0) this.bumpTrafficCacheVersion();
    return { inserted };
  }

  getTrafficBackfillState({ ttlMs = 10000 } = {}) {
    const nowMs = Date.now();
    if (this.trafficBackfillStateCache.expiresAtMs > nowMs) {
      return { ...this.trafficBackfillStateCache };
    }

    let eventCount = 0;
    let sampleCount = 0;
    try {
      eventCount = Number(
        this.db
          .prepare("SELECT COUNT(*) AS count FROM aggregator_events WHERE event_type = 'traffic.http'")
          .get()?.count || 0
      );
      sampleCount = Number(
        this.db.prepare("SELECT COUNT(*) AS count FROM traffic_http_samples").get()?.count || 0
      );
    } catch {
      eventCount = 0;
      sampleCount = 0;
    }

    const complete = eventCount === 0 || sampleCount >= eventCount;
    this.trafficBackfillStateCache = {
      expiresAtMs: nowMs + Math.max(1000, Number(ttlMs) || 10000),
      complete,
      sampleCount,
      eventCount,
    };
    return { ...this.trafficBackfillStateCache };
  }

  listLegacyTrafficSamples({ windowHours = 24, projectKey = "", service = "", direction = "" } = {}) {
    const safeWindowHours = normalizeWindowHours(windowHours, 24);
    const safeProjectKey = normalizeProjectKey(projectKey);
    const safeService = String(service || "").trim().toLowerCase();
    const rawDirection = String(direction || "").trim().toLowerCase();
    const safeDirection =
      rawDirection === "incoming" || rawDirection === "outgoing" ? rawDirection : "";
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

  upsertProjectSeen(projectKey, projectName, sourceLabel, observedAt) {
    const normalizedProjectKey = normalizeProjectKey(projectKey);
    if (!normalizedProjectKey) return;
    const safeName = String(projectName || normalizedProjectKey).trim() || normalizedProjectKey;
    this.db
      .prepare(
        `
        INSERT INTO projects (
          project_key, display_name, source_label, first_seen_at, last_seen_at
        ) VALUES (?, ?, ?, ?, ?)
        ON CONFLICT(project_key) DO UPDATE SET
          display_name = excluded.display_name,
          source_label = COALESCE(excluded.source_label, projects.source_label),
          last_seen_at = excluded.last_seen_at
        `
      )
      .run(normalizedProjectKey, safeName, normalizeMaybeString(sourceLabel), observedAt, observedAt);
  }

  appendAggregatorEvent({
    projectKey = "",
    projectName = "",
    sourceLabel = null,
    occurredAt = "",
    eventType = "",
    detail1 = null,
    detail2 = null,
    detail3 = null,
    payload = null,
  } = {}) {
    const safeProjectKey = normalizeProjectKey(projectKey);
    const safeOccurredAt = toIso(occurredAt, new Date().toISOString());
    const safeEventType = String(eventType || "").trim();
    if (!safeEventType) return;
    if (safeProjectKey) {
      const safeProjectName = String(projectName || safeProjectKey).trim() || safeProjectKey;
      this.upsertProjectSeen(safeProjectKey, safeProjectName, sourceLabel, safeOccurredAt);
    }
    const payloadJson = payload && typeof payload === "object" ? JSON.stringify(payload) : null;
    const result = this.db
      .prepare(
        `
        INSERT INTO aggregator_events (
          project_key, occurred_at, event_type, detail_1, detail_2, detail_3, source_label, payload_json
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `
      )
      .run(
        safeProjectKey || null,
        safeOccurredAt,
        safeEventType,
        normalizeMaybeString(detail1),
        normalizeMaybeString(detail2),
        normalizeMaybeString(detail3),
        normalizeMaybeString(sourceLabel),
        payloadJson
      );
    return Number(result?.lastInsertRowid || 0);
  }

  ingestEvents(payload = {}) {
    const receivedAt = new Date().toISOString();
    const defaultProjectKey = normalizeProjectKey(payload.projectKey || payload.project?.key);
    const defaultProjectName = String(
      payload.projectName || payload.project?.name || defaultProjectKey || "event-producer"
    ).trim();
    const defaultSourceLabel = normalizeMaybeString(
      payload.sourceLabel || payload.source || payload.project?.sourceLabel
    );

    const events = Array.isArray(payload.events)
      ? payload.events
      : payload && typeof payload.event === "object"
        ? [payload.event]
        : payload && typeof payload === "object" && payload.eventType
          ? [payload]
          : [];

    if (!events.length) {
      return { error: "No valid events provided." };
    }

    let accepted = 0;
    for (const event of events) {
      const eventType = String(event?.eventType || event?.type || "").trim();
      if (!eventType) continue;

      const projectKey = normalizeProjectKey(
        event?.projectKey || event?.project?.key || defaultProjectKey
      );
      const projectName = String(
        event?.projectName || event?.project?.name || defaultProjectName || projectKey || "event-producer"
      ).trim();
      const sourceLabel = normalizeMaybeString(
        event?.sourceLabel || event?.source || event?.project?.sourceLabel || defaultSourceLabel
      );

      const rawChanged = String(
        event?.changedLabel ?? event?.changed ?? event?.change ?? ""
      )
        .trim()
        .toLowerCase();
      const changedMarker =
        rawChanged === "*" || rawChanged === "new"
          ? "*"
          : rawChanged === "1" ||
              rawChanged === "true" ||
              rawChanged === "yes" ||
              rawChanged === "changed"
            ? "yes"
            : "no";

      const existingDetail3 = String(event?.detail3 || "").trim();
      const detail3 =
        existingDetail3 || changedMarker ? (existingDetail3 || `change:${changedMarker}`) : null;

      const payloadObject =
        event?.payload && typeof event.payload === "object"
          ? {
              ...event.payload,
              changed: changedMarker !== "no",
              change: changedMarker === "*" ? "new" : changedMarker === "yes" ? "changed" : "none",
            }
          : {
              changed: changedMarker !== "no",
              change: changedMarker === "*" ? "new" : changedMarker === "yes" ? "changed" : "none",
            };

      this.appendAggregatorEvent({
        projectKey,
        projectName,
        sourceLabel,
        occurredAt: event?.occurredAt || event?.at || receivedAt,
        eventType,
        detail1: event?.detail1 || event?.item || null,
        detail2: event?.detail2 || event?.message || null,
        detail3,
        payload: payloadObject,
      });
      accepted += 1;
    }

    if (!accepted) {
      return { error: "No events were accepted." };
    }

    return {
      projectKey: defaultProjectKey || null,
      sourceLabel: defaultSourceLabel,
      accepted,
      receivedAt,
    };
  }

  ingestTraffic(payload = {}) {
    const receivedAt = new Date().toISOString();
    const defaultProjectKey = normalizeProjectKey(payload.projectKey || payload.project?.key);
    const defaultProjectName = String(
      payload.projectName || payload.project?.name || defaultProjectKey || "traffic-producer"
    ).trim();
    const defaultSourceLabel = normalizeMaybeString(
      payload.sourceLabel || payload.source || payload.project?.sourceLabel
    );
    const defaultService = String(payload.service || payload.component || "tracker").trim() || "tracker";

    const samples = Array.isArray(payload.samples)
      ? payload.samples
      : Array.isArray(payload.items)
        ? payload.items
        : Array.isArray(payload.events)
          ? payload.events
          : payload && typeof payload.sample === "object"
            ? [payload.sample]
            : payload &&
                typeof payload === "object" &&
                (payload.direction || payload.method || payload.route || payload.targetHost)
              ? [payload]
              : [];

    if (!samples.length) {
      return { error: "No traffic samples provided." };
    }

    let accepted = 0;
    try {
      this.db.exec("BEGIN");
      for (const sample of samples) {
        const projectKey = normalizeProjectKey(
          sample?.projectKey || sample?.project?.key || defaultProjectKey
        );
        const projectName = String(
          sample?.projectName ||
            sample?.project?.name ||
            defaultProjectName ||
            projectKey ||
            "traffic-producer"
        ).trim();
        const normalized = normalizeTrafficSample(sample, {
          projectKey,
          sourceLabel:
            sample?.sourceLabel ||
            sample?.source ||
            sample?.project?.sourceLabel ||
            defaultSourceLabel ||
            defaultService,
          occurredAt: receivedAt,
        });
        const sourceLabel = normalizeMaybeString(normalized.sourceLabel);

        const eventId = this.appendAggregatorEvent({
          projectKey,
          projectName,
          sourceLabel,
          occurredAt: normalized.occurredAt,
          eventType: "traffic.http",
          detail1: `${normalized.direction}:${normalized.service}`,
          detail2: `${normalized.method} ${normalized.route}`,
          detail3: `${normalized.statusCode || 0} ${Math.round(normalized.durationMs)}ms`,
          payload: {
            direction: normalized.direction,
            service: normalized.service,
            component: normalized.component,
            method: normalized.method,
            route: normalized.route,
            targetHost: normalized.targetHost,
            targetPath: normalized.targetPath,
            statusCode: normalized.statusCode,
            durationMs: normalized.durationMs,
            bytesIn: normalized.bytesIn,
            bytesOut: normalized.bytesOut,
            occurredAt: normalized.occurredAt,
            projectKey: normalized.projectKey || null,
            sourceLabel: sourceLabel || null,
          },
        });
        if (eventId) {
          this.insertTrafficSampleRecord(eventId, normalized);
        }
        accepted += 1;
      }
      this.db.exec("COMMIT");
    } catch (error) {
      try {
        this.db.exec("ROLLBACK");
      } catch {}
      throw error;
    }

    if (!accepted) {
      return { error: "No traffic samples were accepted." };
    }
    this.bumpTrafficCacheVersion();

    return {
      projectKey: defaultProjectKey || null,
      sourceLabel: defaultSourceLabel,
      accepted,
      receivedAt,
    };
  }

  listTrafficSamples({ windowHours = 24, projectKey = "", service = "", direction = "" } = {}) {
    const backfillState = this.getTrafficBackfillState();
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
    return this.withTrafficCache(
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
    return this.withTrafficCache(
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
      ...appendTrafficWhere(baseMeta, ["occurred_at >= ?", "occurred_at <= ?", ...extraClauses], [
        sinceIso,
        latest,
        ...extraArgs,
      ]),
      latestObservedAt: latest,
      fallbackSinceIso: sinceIso,
      safeWindowHours,
    };
  }

  getTrafficOverview({ windowHours = 24, projectKey = "", service = "" } = {}) {
    const safeWindowHours = normalizeWindowHours(windowHours, 24);
    const safeProjectKey = normalizeProjectKey(projectKey) || null;
    const safeService = String(service || "").trim() || null;
    const cacheKey = `traffic-overview:${JSON.stringify({ windowHours: safeWindowHours, projectKey: safeProjectKey || "", service: safeService || "" })}`;
    return this.withTrafficCache(
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

  getTrafficTimeseries({
    bucket = "hour",
    windowHours = 24,
    projectKey = "",
    service = "",
  } = {}) {
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
    return this.withTrafficCache(
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
    const rawDimension = String(dimension || "").trim().toLowerCase();
    const safeDimension =
      rawDimension || (safeDirection === "incoming" ? "route" : "target");
    const cacheKey = `traffic-top:${JSON.stringify({
      windowHours: safeWindowHours,
      projectKey: safeProjectKey || "",
      service: safeService || "",
      direction: safeDirection,
      dimension: safeDimension,
      limit: safeLimit,
    })}`;
    return this.withTrafficCache(
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
          keySql = "COALESCE(NULLIF(method, ''), 'GET') || ' ' || COALESCE(NULLIF(target_path, ''), NULLIF(route, ''), '/')";
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
    const rawDirection = String(direction || "").trim().toLowerCase();
    const safeDirection =
      rawDirection === "incoming" || rawDirection === "outgoing" ? rawDirection : "";
    const safeLimit = clampInt(limit, { min: 1, max: 500, fallback: 50 });
    const requestedPage = Math.max(1, Number(page) || 1);
    const requestedOffset =
      Number(offset) > 0 ? Math.max(0, Math.floor(Number(offset))) : (requestedPage - 1) * safeLimit;
    const queryText = String(q || "").trim().toLowerCase();
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
    return this.withTrafficCache(
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

  ingestTrackerRun(payload = {}) {
    const receivedAt = new Date().toISOString();
    const projectKey = normalizeProjectKey(payload.projectKey || payload.project?.key);
    if (!projectKey) {
      return { error: "projectKey is required." };
    }

    const projectName =
      String(payload.projectName || payload.project?.name || projectKey).trim() || projectKey;
    const sourceLabel = normalizeMaybeString(payload.sourceLabel || payload.project?.sourceLabel);
    const run = payload.run && typeof payload.run === "object" ? payload.run : {};
    const checks = Array.isArray(payload.checks) ? payload.checks : [];

    const startedAt = toIso(run.startedAt, receivedAt);
    const finishedAt = toIso(run.finishedAt, receivedAt);
    const provider = normalizeMaybeString(run.provider);
    const reason = normalizeMaybeString(run.reason || run.note);
    const note = normalizeMaybeString(run.note);
    const mapsConsidered = clampInt(run.mapsConsidered, { min: 0, max: 100000, fallback: 0 });
    const mapsChecked = clampInt(run.mapsChecked, { min: 0, max: 100000, fallback: checks.length });
    const wrChanges = clampInt(run.wrChanges, { min: 0, max: 100000, fallback: 0 });

    let ingestId = 0;
    let acceptedChecks = 0;
    let changedChecks = 0;
    let queuedBaselineAnomalies = 0;

    try {
      this.db.exec("BEGIN");

      this.db
        .prepare(
          `
          INSERT INTO projects (
            project_key, display_name, source_label, first_seen_at, last_seen_at
          ) VALUES (?, ?, ?, ?, ?)
          ON CONFLICT(project_key) DO UPDATE SET
            display_name = excluded.display_name,
            source_label = COALESCE(excluded.source_label, projects.source_label),
            last_seen_at = excluded.last_seen_at
          `
        )
        .run(projectKey, projectName, sourceLabel, receivedAt, receivedAt);

      const runResult = this.db
        .prepare(
          `
          INSERT INTO ingest_runs (
            project_key, provider, reason, source_label, started_at, finished_at,
            maps_considered, maps_checked, wr_changes, note, received_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          `
        )
        .run(
          projectKey,
          provider,
          reason,
          sourceLabel,
          startedAt,
          finishedAt,
          mapsConsidered,
          mapsChecked,
          wrChanges,
          note,
          receivedAt
        );
      ingestId = Number(runResult.lastInsertRowid || 0);

      const upsertMapRegistry = this.db.prepare(
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

      const upsertProjectMap = this.db.prepare(
        `
        INSERT INTO project_maps (
          project_key, map_uid, latest_checked_at, last_changed_at, wr_ms, wr_holder,
          source, note, check_count, change_count, status, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(project_key, map_uid) DO UPDATE SET
          latest_checked_at = excluded.latest_checked_at,
          last_changed_at = COALESCE(excluded.last_changed_at, project_maps.last_changed_at),
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
          check_count = project_maps.check_count + excluded.check_count,
          change_count = project_maps.change_count + excluded.change_count,
          status = excluded.status,
          updated_at = excluded.updated_at
        `
      );

      const upsertAccount = this.db.prepare(
        `
        INSERT INTO accounts (
          account_id, first_seen_at, last_seen_at
        ) VALUES (?, ?, ?)
        ON CONFLICT(account_id) DO UPDATE SET
          last_seen_at = excluded.last_seen_at
        `
      );

      const insertMapEvent = this.db.prepare(
        `
        INSERT INTO map_events (
          ingest_id, project_key, map_uid, map_name, checked_at, changed,
          old_wr_time, new_wr_time, old_holder, new_holder, source, note
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `
      );

      const insertWrBaselineQueue = this.db.prepare(
        `
        INSERT OR IGNORE INTO wr_baseline_queue (
          project_key, map_uid, map_name, checked_at, reason_code,
          old_wr_time, new_wr_time, old_holder, new_holder, source, note,
          status, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'queued', ?, ?)
        `
      );

      for (const rawCheck of checks) {
        const mapUid = String(rawCheck?.mapUid || rawCheck?.uid || "").trim();
        if (!mapUid) continue;

        const checkedAt = toIso(rawCheck.checkedAt, finishedAt);
        const changed = Boolean(rawCheck.changed);
        const mapName = normalizeMaybeString(rawCheck.mapName || rawCheck.name || mapUid);
        const oldWrTime = clampInt(rawCheck.oldWrTime, {
          min: 0,
          max: 2147483647,
          fallback: 0,
        });
        const newWrTime = clampInt(rawCheck.newWrTime, {
          min: 0,
          max: 2147483647,
          fallback: 0,
        });
        const oldHolder = normalizeMaybeString(rawCheck.oldHolder);
        const newHolder = normalizeMaybeString(rawCheck.newHolder);
        const source = normalizeMaybeString(rawCheck.source || provider);
        const checkNote = normalizeMaybeString(rawCheck.note);
        const wrMs = newWrTime > 0 ? newWrTime : null;
        const wrHolder = newHolder || null;
        const status =
          checkNote && checkNote.toLowerCase().startsWith("error:") ? "error" : "ok";

        const oldHolderAccountId = normalizeAccountId(
          rawCheck?.oldHolderAccountId || rawCheck?.old_holder_account_id
        );
        const newHolderAccountId = normalizeAccountId(
          rawCheck?.newHolderAccountId || rawCheck?.new_holder_account_id
        );
        const accountIds = uniqueBy(
          [
            ...normalizeArray(rawCheck?.accountIds || rawCheck?.account_ids),
            oldHolderAccountId,
            newHolderAccountId,
          ]
            .map((value) => normalizeAccountId(value))
            .filter(Boolean),
          (accountId) => accountId
        );
        for (const accountId of accountIds) {
          upsertAccount.run(accountId, checkedAt, checkedAt);
        }

        upsertMapRegistry.run(mapUid, mapName, checkedAt, checkedAt);
        upsertProjectMap.run(
          projectKey,
          mapUid,
          checkedAt,
          changed ? checkedAt : null,
          wrMs,
          wrHolder,
          source,
          checkNote,
          1,
          changed ? 1 : 0,
          status,
          receivedAt
        );
        insertMapEvent.run(
          ingestId,
          projectKey,
          mapUid,
          mapName,
          checkedAt,
          changed ? 1 : 0,
          oldWrTime || null,
          newWrTime || null,
          oldHolder,
          newHolder,
          source,
          checkNote
        );

        const oldWrMissing = oldWrTime <= 0;
        const oldHolderMissing = !oldHolder;
        const newWrPresent = newWrTime > 0;
        const newHolderPresent = Boolean(newHolder);
        const shouldQueueBaselineAnomaly =
          changed && (oldWrMissing || oldHolderMissing) && (newWrPresent || newHolderPresent);
        if (shouldQueueBaselineAnomaly) {
          const queueResult = insertWrBaselineQueue.run(
            projectKey,
            mapUid,
            mapName,
            checkedAt,
            "wr-baseline-missing",
            oldWrTime || null,
            newWrTime || null,
            oldHolder,
            newHolder,
            source,
            checkNote,
            receivedAt,
            receivedAt
          );
          if (Number(queueResult?.changes || 0) > 0) {
            queuedBaselineAnomalies += 1;
            this.appendAggregatorEvent({
              projectKey,
              projectName,
              sourceLabel: source || sourceLabel,
              occurredAt: checkedAt,
              eventType: "queue.wr_baseline_missing",
              detail1: mapName || mapUid,
              detail2: `wr: ${oldWrTime > 0 ? oldWrTime : "-"} -> ${newWrTime > 0 ? newWrTime : "-"}`,
              detail3: `holder: ${oldHolder || "-"} -> ${newHolder || "-"}`,
              payload: {
                projectKey,
                mapUid,
                mapName: mapName || mapUid,
                reason: "wr-baseline-missing",
                oldWrTime: oldWrTime || null,
                newWrTime: newWrTime || null,
                oldHolder: oldHolder || null,
                newHolder: newHolder || null,
                checkedAt,
              },
            });
          }
        }

        acceptedChecks += 1;
        if (changed) changedChecks += 1;
      }

      this.appendAggregatorEvent({
        projectKey,
        projectName,
        sourceLabel,
        occurredAt: finishedAt,
        eventType: "tracker.run",
        detail1: `maps considered: ${mapsConsidered}`,
        detail2: `maps checked: ${acceptedChecks}, wr changes: ${changedChecks}, queued anomalies: ${queuedBaselineAnomalies}`,
        detail3: reason || provider || note || "tracker ingest",
        payload: {
          ingestId,
          provider,
          reason,
          mapsConsidered,
          mapsChecked: acceptedChecks,
          wrChanges: changedChecks,
          queuedBaselineAnomalies,
          startedAt,
          finishedAt,
        },
      });

      this.db.exec("COMMIT");
    } catch (error) {
      try {
        this.db.exec("ROLLBACK");
      } catch {}
      throw error;
    }

    return {
      ingestId,
      projectKey,
      projectName,
      acceptedChecks,
      changedChecks,
      queuedBaselineAnomalies,
      receivedAt,
    };
  }

  registerInstance(payload = {}) {
    const now = new Date().toISOString();
    const projectKey = normalizeProjectKey(payload.projectKey || payload.project?.key);
    const instanceId = normalizeInstanceId(payload.instanceId || payload.instance?.id);
    if (!projectKey) return { error: "projectKey is required." };
    if (!instanceId) return { error: "instanceId is required." };
    const projectName =
      String(payload.projectName || payload.project?.name || projectKey).trim() || projectKey;
    const sourceLabel = normalizeMaybeString(payload.sourceLabel || payload.project?.sourceLabel);
    const instanceName =
      normalizeMaybeString(payload.instanceName || payload.instance?.name) || instanceId;
    const status = normalizeMaybeString(payload.status) || "online";
    const metaJson = payload.meta ? JSON.stringify(payload.meta) : null;

    this.db
      .prepare(
        `
        INSERT INTO projects (
          project_key, display_name, source_label, first_seen_at, last_seen_at
        ) VALUES (?, ?, ?, ?, ?)
        ON CONFLICT(project_key) DO UPDATE SET
          display_name = excluded.display_name,
          source_label = COALESCE(excluded.source_label, projects.source_label),
          last_seen_at = excluded.last_seen_at
        `
      )
      .run(projectKey, projectName, sourceLabel, now, now);

    this.db
      .prepare(
        `
        INSERT INTO project_instances (
          project_key, instance_id, instance_name, source_label, status,
          registered_at, last_heartbeat_at, meta_json
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(project_key, instance_id) DO UPDATE SET
          instance_name = excluded.instance_name,
          source_label = COALESCE(excluded.source_label, project_instances.source_label),
          status = excluded.status,
          last_heartbeat_at = excluded.last_heartbeat_at,
          meta_json = COALESCE(excluded.meta_json, project_instances.meta_json)
        `
      )
      .run(projectKey, instanceId, instanceName, sourceLabel, status, now, now, metaJson);

    this.appendAggregatorEvent({
      projectKey,
      projectName,
      sourceLabel,
      occurredAt: now,
      eventType: "instance.register",
      detail1: `instance: ${instanceName}`,
      detail2: `status: ${status}`,
      detail3: null,
      payload: {
        instanceId,
        instanceName,
        status,
      },
    });

    return {
      projectKey,
      instanceId,
      instanceName,
      status,
      registeredAt: now,
      lastHeartbeatAt: now,
    };
  }

  heartbeatInstance(payload = {}) {
    const now = new Date().toISOString();
    const projectKey = normalizeProjectKey(payload.projectKey || payload.project?.key);
    const instanceId = normalizeInstanceId(payload.instanceId || payload.instance?.id);
    if (!projectKey) return { error: "projectKey is required." };
    if (!instanceId) return { error: "instanceId is required." };
    const status = normalizeMaybeString(payload.status) || "online";
    const instanceName =
      normalizeMaybeString(payload.instanceName || payload.instance?.name) || instanceId;
    const sourceLabel = normalizeMaybeString(payload.sourceLabel || payload.project?.sourceLabel);
    const metaJson = payload.meta ? JSON.stringify(payload.meta) : null;
    const projectName =
      String(payload.projectName || payload.project?.name || projectKey).trim() || projectKey;

    this.db
      .prepare(
        `
        INSERT INTO projects (
          project_key, display_name, source_label, first_seen_at, last_seen_at
        ) VALUES (?, ?, ?, ?, ?)
        ON CONFLICT(project_key) DO UPDATE SET
          display_name = COALESCE(excluded.display_name, projects.display_name),
          source_label = COALESCE(excluded.source_label, projects.source_label),
          last_seen_at = excluded.last_seen_at
        `
      )
      .run(projectKey, projectName, sourceLabel, now, now);

    this.db
      .prepare(
        `
        INSERT INTO project_instances (
          project_key, instance_id, instance_name, source_label, status,
          registered_at, last_heartbeat_at, meta_json
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(project_key, instance_id) DO UPDATE SET
          instance_name = COALESCE(excluded.instance_name, project_instances.instance_name),
          source_label = COALESCE(excluded.source_label, project_instances.source_label),
          status = excluded.status,
          last_heartbeat_at = excluded.last_heartbeat_at,
          meta_json = COALESCE(excluded.meta_json, project_instances.meta_json)
        `
      )
      .run(projectKey, instanceId, instanceName, sourceLabel, status, now, now, metaJson);

    this.appendAggregatorEvent({
      projectKey,
      projectName,
      sourceLabel,
      occurredAt: now,
      eventType: "instance.heartbeat",
      detail1: `instance: ${instanceName}`,
      detail2: `status: ${status}`,
      detail3: null,
      payload: {
        instanceId,
        instanceName,
        status,
      },
    });

    return {
      projectKey,
      instanceId,
      status,
      lastHeartbeatAt: now,
    };
  }

  getMeta() {
    const safeCount = (sql) => {
      try {
        return Number(this.db.prepare(sql).get()?.count || 0);
      } catch {
        return 0;
      }
    };
    const safeApproxCount = (sql) => {
      try {
        return Number(this.db.prepare(sql).get()?.count || 0);
      } catch {
        return 0;
      }
    };
    const safeGetAt = (sql) => {
      try {
        return this.db.prepare(sql).get()?.at || null;
      } catch {
        return null;
      }
    };

    const projectCount = safeCount("SELECT COUNT(*) AS count FROM projects");
    const mapCount = safeCount("SELECT COUNT(*) AS count FROM map_registry");
    const mapEventCount = safeApproxCount("SELECT MAX(event_id) AS count FROM map_events");
    const aggregatorEventCount = safeApproxCount("SELECT MAX(event_id) AS count FROM aggregator_events");
    const eventCount = mapEventCount + aggregatorEventCount;

    const latestMapEventAt = safeGetAt(
      "SELECT checked_at AS at FROM map_events ORDER BY checked_at DESC LIMIT 1"
    );
    const latestAggregatorEventAt = safeGetAt(
      "SELECT occurred_at AS at FROM aggregator_events ORDER BY occurred_at DESC LIMIT 1"
    );
    const latestEventAt =
      String(latestMapEventAt || "") > String(latestAggregatorEventAt || "")
        ? latestMapEventAt
        : latestAggregatorEventAt;

    const latestChangeAt = safeGetAt(
      "SELECT checked_at AS at FROM map_events WHERE changed = 1 ORDER BY checked_at DESC LIMIT 1"
    );

    return {
      projects: Number(projectCount),
      maps: Number(mapCount),
      events: Number(eventCount),
      latestEventAt,
      latestChangeAt,
    };
  }

  listDataTables({ includeCounts = true } = {}) {
    let tables = [];
    try {
      tables = this.db
        .prepare(
          `
          SELECT name
          FROM sqlite_master
          WHERE type = 'table' AND name NOT LIKE 'sqlite_%'
          ORDER BY name ASC
          `
        )
        .all()
        .map((row) => String(row.name || ""))
        .filter((name) => isSafeIdentifier(name));
    } catch {
      return [];
    }

    return tables.map((name) => {
      const quoted = quoteIdentifier(name);
      let columnCount = 0;
      try {
        columnCount = this.db.prepare(`PRAGMA table_info(${quoted})`).all().length;
      } catch {
        columnCount = 0;
      }

      let rowCount = null;
      if (includeCounts) {
        try {
          rowCount = Number(this.db.prepare(`SELECT COUNT(*) AS count FROM ${quoted}`).get()?.count || 0);
        } catch {
          rowCount = null;
        }
      }
      return {
        table: name,
        rowCount,
        columnCount: Number(columnCount || 0),
      };
    });
  }

  getTableSchema(tableName) {
    const table = String(tableName || "").trim();
    if (!isSafeIdentifier(table)) return null;
    const quoted = quoteIdentifier(table);

    const exists = this.db
      .prepare(
        `
        SELECT COUNT(*) AS count
        FROM sqlite_master
        WHERE type = 'table' AND name = ?
        `
      )
      .get(table)?.count;
    if (!Number(exists)) return null;

    const columns = this.db
      .prepare(`PRAGMA table_info(${quoted})`)
      .all()
      .map((row) => ({
        cid: Number(row.cid || 0),
        name: row.name,
        type: row.type || "",
        notNull: Boolean(row.notnull),
        defaultValue: row.dflt_value ?? null,
        primaryKey: Boolean(row.pk),
      }));

    const indexes = this.db
      .prepare(`PRAGMA index_list(${quoted})`)
      .all()
      .map((row) => ({
        name: row.name,
        unique: Boolean(row.unique),
        origin: row.origin || null,
        partial: Boolean(row.partial),
      }));

    return {
      table,
      columns,
      indexes,
    };
  }

  getTableRows(tableName, { limit = 50, offset = 0, sortBy = "", sortDir = "desc" } = {}) {
    const schema = this.getTableSchema(tableName);
    if (!schema) return null;
    const table = schema.table;
    const quotedTable = quoteIdentifier(table);

    const safeLimit = Math.max(1, Math.min(Number(limit) || 50, 300));
    const safeOffset = Math.max(0, Number(offset) || 0);
    const columns = schema.columns.map((col) => String(col.name || ""));
    const safeSortBy = columns.includes(String(sortBy || "")) ? String(sortBy) : "";
    const order = String(sortDir || "").toLowerCase() === "asc" ? "ASC" : "DESC";

    const orderSql = safeSortBy ? ` ORDER BY ${quoteIdentifier(safeSortBy)} ${order}` : "";
    const rows = this.db
      .prepare(`SELECT * FROM ${quotedTable}${orderSql} LIMIT ? OFFSET ?`)
      .all(safeLimit, safeOffset)
      .map((row) => ({ ...row }));

    const total = Number(this.db.prepare(`SELECT COUNT(*) AS count FROM ${quotedTable}`).get()?.count || 0);

    return {
      table,
      total,
      limit: safeLimit,
      offset: safeOffset,
      sortBy: safeSortBy || null,
      sortDir: safeSortBy ? order.toLowerCase() : null,
      rows,
      columns,
    };
  }

  getPreferredProject(projectKeys = []) {
    const keys = normalizeArray(projectKeys).map((key) => normalizeProjectKey(key)).filter(Boolean);
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

  getDisplayNameTrackerSnapshot() {
    const project = this.getPreferredProject([
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
    const instance = this.getLatestProjectInstance(project.projectKey);
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
    const project = this.getPreferredProject(["prod-tracker-club", "local-tracker-club"]);
    const instance = project ? this.getLatestProjectInstance(project.projectKey) : null;
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
        wr: this.buildDbTrackerEntry("wr", ["prod-tracker-main", "local-tracker-main"]),
        leaderboard: this.buildDbTrackerEntry("leaderboard", [
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
    const overview = this.getTrafficOverview({
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

    const wrSnapshot = this.buildDbTrackerEntry("wr", ["prod-tracker-main", "local-tracker-main"]);
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
          requestsPerSecond:
            traffic.requestsPerSecond > 0 ? traffic.requestsPerSecond : tracker.requestsPerSecond || 0,
          requestsPerMinute:
            traffic.requestsPerMinute > 0 ? traffic.requestsPerMinute : tracker.requestsPerMinute || 0,
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

  getAlteredDashboardSummary({ syncRunsLimit = 12, pollRunsLimit = 20 } = {}) {
    const safeSyncRunsLimit = clampInt(syncRunsLimit, { min: 1, max: 100, fallback: 12 });
    const safePollRunsLimit = clampInt(pollRunsLimit, { min: 1, max: 100, fallback: 20 });
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
    const clubId = toDbInt(club?.clubId);
    const clubStats = clubId
      ? this.db
          .prepare(
            `
            SELECT
              (SELECT COUNT(*) FROM club_campaigns WHERE club_id = ?) AS campaigns,
              (SELECT COUNT(*) FROM club_campaign_maps WHERE club_id = ?) AS campaignMaps,
              (SELECT COUNT(*) FROM club_uploads WHERE club_id = ?) AS uploads,
              (SELECT COUNT(*) FROM club_upload_maps WHERE club_id = ?) AS uploadMaps,
              (SELECT COUNT(*) FROM club_members WHERE club_id = ?) AS members
            `
          )
          .get(clubId, clubId, clubId, clubId, clubId) || {}
      : {};
    const hookEvents = this.db
      .prepare(
        `
        SELECT
          event_id AS eventId,
          occurred_at AS occurredAt,
          source_label AS sourceLabel,
          payload_json AS payloadJson,
          detail_1 AS detail1,
          detail_2 AS detail2,
          detail_3 AS detail3
        FROM aggregator_events
        WHERE event_type = 'club.snapshot'
        ORDER BY
          occurred_at DESC,
          event_id DESC
        LIMIT 50
        `
      )
      .all();
    const syncRuns = hookEvents.map((event) => {
      const payload = parseJsonObject(event.payloadJson);
      const mapsSeen = toDbInt(payload.campaignMapsSeen) + toDbInt(payload.uploadMapsSeen);
      return {
        runId: event.eventId,
        status: "finished",
        startedAt: event.occurredAt || null,
        finishedAt: event.occurredAt || null,
        mapsSeen,
        mapsInserted: 0,
        mapsUpdated: mapsSeen,
        note: [event.detail1, event.detail2, event.detail3].filter(Boolean).join(" | "),
        sourceLabel: event.sourceLabel || null,
      };
    }).sort((left, right) => {
      const leftMaps = toDbInt(left.mapsSeen);
      const rightMaps = toDbInt(right.mapsSeen);
      if (leftMaps !== rightMaps) return rightMaps - leftMaps;
      return String(right.finishedAt || "").localeCompare(String(left.finishedAt || ""));
    }).slice(0, safeSyncRunsLimit);
    if (!syncRuns.length && club) {
      syncRuns.push({
        runId: "club",
        status: "finished",
        startedAt: club.lastSyncedAt || null,
        finishedAt: club.lastSyncedAt || null,
        mapsSeen: toDbInt(clubStats.campaignMaps) + toDbInt(clubStats.uploadMaps),
        mapsInserted: 0,
        mapsUpdated: toDbInt(clubStats.campaignMaps) + toDbInt(clubStats.uploadMaps),
        note: "database club snapshot",
        sourceLabel: club.sourceLabel || null,
      });
    }

    const pollRuns = this.db
      .prepare(
        `
        SELECT *
        FROM ingest_runs
        WHERE project_key IN ('prod-tracker-main', 'prod-tracker-leaderboard', 'local-tracker-main', 'local-tracker-leaderboard')
        ORDER BY
          CASE WHEN source_label = 'prod' THEN 0 ELSE 1 END,
          finished_at DESC,
          ingest_id DESC
        LIMIT ?
        `
      )
      .all(safePollRunsLimit)
      .map((row) => mapIngestRunDbRow(row))
      .filter(Boolean);
    const latestPollRun = pollRuns[0] || null;
    const latestSyncRun = syncRuns[0] || null;
    const mapsLoaded = toDbInt(clubStats.campaignMaps) + toDbInt(clubStats.uploadMaps);

    return {
      source: "database",
      altered: {
        hook: club
          ? {
              enabled: true,
              clubId: clubId || null,
              clubName: club.clubName || "Altered",
              autoTrackNewMaps: true,
              trackedCount: mapsLoaded,
              mapCount: mapsLoaded,
              lastSyncedAt: club.lastSyncedAt || null,
              latestRun: latestSyncRun,
              sourceLabel: club.sourceLabel || null,
            }
          : null,
        syncRuns,
        liveStatus: {
          monitor: {
            enabled: true,
            running: false,
            discoveryRunning: false,
            discoveryEnabled: true,
            lastFinishedAt: latestSyncRun?.finishedAt || club?.lastSyncedAt || null,
            nextRunAt: null,
            lastError: null,
            lastSummary: {
              campaignsLoaded: toDbInt(clubStats.campaigns) + toDbInt(clubStats.uploads),
              mapsLoaded,
              membersLoaded: toDbInt(clubStats.members),
            },
          },
        },
        opsOverview: {
          scheduler: {
            enabled: true,
            tickSeconds: 0,
            source: "database",
          },
        },
        pollRuns,
      },
      warnings: [],
      degraded: false,
      latestPollRun,
    };
  }

  getAlteredCheckHistory({ q = "", mapUid = "", limit = 120 } = {}) {
    const safeLimit = clampInt(limit, { min: 1, max: 500, fallback: 120 });
    const safeMapUid = String(mapUid || "").trim();
    const queryText = String(q || "").trim().toLowerCase();
    const clauses = ["1 = 1"];
    const args = [];
    if (safeMapUid) {
      clauses.push("me.map_uid = ?");
      args.push(safeMapUid);
    }
    if (queryText) {
      clauses.push(
        `(
          LOWER(COALESCE(me.map_name, mr.map_name, '')) LIKE ?
          OR LOWER(COALESCE(me.map_uid, '')) LIKE ?
          OR LOWER(COALESCE(me.old_holder, '')) LIKE ?
          OR LOWER(COALESCE(me.new_holder, '')) LIKE ?
        )`
      );
      args.push(`%${queryText}%`, `%${queryText}%`, `%${queryText}%`, `%${queryText}%`);
    }
    return this.db
      .prepare(
        `
        SELECT
          me.event_id AS eventId,
          me.ingest_id AS runId,
          me.project_key AS projectKey,
          me.map_uid AS mapUid,
          COALESCE(me.map_name, mr.map_name, me.map_uid) AS mapName,
          me.checked_at AS checkedAt,
          me.changed AS changed,
          me.old_wr_time AS oldWrMs,
          me.new_wr_time AS newWrMs,
          me.old_holder AS oldWrHolder,
          me.new_holder AS newWrHolder,
          me.note AS note
        FROM map_events me
        LEFT JOIN map_registry mr ON mr.map_uid = me.map_uid
        WHERE ${clauses.join(" AND ")}
        ORDER BY
          CASE WHEN me.project_key LIKE 'prod-%' THEN 0 ELSE 1 END,
          me.checked_at DESC,
          me.event_id DESC
        LIMIT ?
        `
      )
      .all(...args, safeLimit)
      .map((row) => ({
        eventId: toDbInt(row.eventId),
        runId: toDbInt(row.runId),
        projectKey: row.projectKey || null,
        mapUid: row.mapUid || null,
        mapName: row.mapName || row.mapUid || "Unknown map",
        checkedAt: row.checkedAt || null,
        changed: Boolean(Number(row.changed || 0)),
        oldWrMs: row.oldWrMs === null || row.oldWrMs === undefined ? null : toDbInt(row.oldWrMs),
        newWrMs: row.newWrMs === null || row.newWrMs === undefined ? null : toDbInt(row.newWrMs),
        oldWrHolder: row.oldWrHolder || null,
        newWrHolder: row.newWrHolder || null,
        error:
          row.note && String(row.note).toLowerCase().startsWith("error:")
            ? String(row.note).replace(/^error:\s*/i, "")
            : null,
        note: row.note || null,
      }));
  }

  getMetricsOverview() {
    try {
    const base = this.getMeta();
    const projects = Number(this.db.prepare("SELECT COUNT(*) AS count FROM projects").get()?.count || 0);
    const instances = Number(this.db.prepare("SELECT COUNT(*) AS count FROM project_instances").get()?.count || 0);
    const onlineInstances = Number(
      this.db
        .prepare(
          `
          SELECT COUNT(*) AS count
          FROM project_instances
          WHERE status = 'online'
            AND julianday(last_heartbeat_at) >= julianday('now') - (10.0 / 1440.0)
          `
        )
        .get()?.count || 0
    );
    const ingestRuns = Number(this.db.prepare("SELECT COUNT(*) AS count FROM ingest_runs").get()?.count || 0);
    const eventsChanged = Number(
      this.db.prepare("SELECT COUNT(*) AS count FROM map_events WHERE changed = 1").get()?.count || 0
    );
    let accounts = 0;
    try {
      accounts = Number(this.db.prepare("SELECT COUNT(*) AS count FROM accounts").get()?.count || 0);
    } catch {
      // Fallback for partially corrupt account indexes: derive coverage baseline from name tables.
      try {
        accounts = Number(
          this.db
            .prepare("SELECT COUNT(DISTINCT account_id) AS count FROM account_display_name_current NOT INDEXED")
            .get()?.count || 0
        );
      } catch {
        try {
          accounts = Number(
            this.db
              .prepare("SELECT COUNT(DISTINCT account_id) AS count FROM account_display_name_history NOT INDEXED")
              .get()?.count || 0
          );
        } catch {
          accounts = 0;
        }
      }
    }
    const displayNames = Number(
      this.db.prepare("SELECT COUNT(*) AS count FROM account_display_name_current").get()?.count || 0
    );
    const clubs = Number(this.db.prepare("SELECT COUNT(*) AS count FROM clubs").get()?.count || 0);
    const clubCampaigns = Number(this.db.prepare("SELECT COUNT(*) AS count FROM club_campaigns").get()?.count || 0);
    const clubMaps = Number(
      this.db
        .prepare(
          `
          SELECT
            (SELECT COUNT(*) FROM club_campaign_maps) +
            (SELECT COUNT(*) FROM club_upload_maps) AS count
          `
        )
        .get()?.count || 0
    );
    const clubMembers = Number(this.db.prepare("SELECT COUNT(*) AS count FROM club_members").get()?.count || 0);
    const lastIngestAt =
      this.db.prepare("SELECT finished_at AS at FROM ingest_runs ORDER BY finished_at DESC LIMIT 1").get()?.at ||
      null;

    const mapFreshnessRaw =
      this.db
        .prepare(
          `
          SELECT
            COUNT(*) AS trackedMaps,
            COALESCE(SUM(CASE WHEN latest_checked_at IS NULL THEN 1 ELSE 0 END), 0) AS neverChecked,
            COALESCE(SUM(CASE WHEN julianday(latest_checked_at) >= julianday('now') - (6.0 / 24.0) THEN 1 ELSE 0 END), 0) AS checked6h,
            COALESCE(SUM(CASE WHEN julianday(latest_checked_at) >= julianday('now') - (24.0 / 24.0) THEN 1 ELSE 0 END), 0) AS checked24h,
            COALESCE(SUM(CASE WHEN julianday(latest_checked_at) >= julianday('now') - (7.0) THEN 1 ELSE 0 END), 0) AS checked7d,
            MIN(latest_checked_at) AS oldestCheckedAt,
            MAX(latest_checked_at) AS newestCheckedAt
          FROM project_maps
          `
        )
        .get() || {};
    const trackedMaps = Number(mapFreshnessRaw.trackedMaps || 0);
    const checked6h = Number(mapFreshnessRaw.checked6h || 0);
    const checked24h = Number(mapFreshnessRaw.checked24h || 0);
    const checked7d = Number(mapFreshnessRaw.checked7d || 0);
    const neverChecked = Number(mapFreshnessRaw.neverChecked || 0);
    const stale24h = Math.max(0, trackedMaps - checked24h);
    const stale7d = Math.max(0, trackedMaps - checked7d);

    const events24hRaw =
      this.db
        .prepare(
          `
          SELECT
            COUNT(*) AS checks24h,
            COALESCE(SUM(changed), 0) AS changes24h,
            COALESCE(
              SUM(CASE WHEN note IS NOT NULL AND LOWER(note) LIKE 'error:%' THEN 1 ELSE 0 END),
              0
            ) AS errors24h
          FROM map_events
          WHERE julianday(checked_at) >= julianday('now') - (24.0 / 24.0)
          `
        )
        .get() || {};
    const checks24h = Number(events24hRaw.checks24h || 0);
    const changes24h = Number(events24hRaw.changes24h || 0);
    const errors24h = Number(events24hRaw.errors24h || 0);

    const run24hRaw =
      this.db
        .prepare(
          `
          SELECT
            COUNT(*) AS runs24h,
            COALESCE(SUM(maps_checked), 0) AS mapsChecked24h,
            COALESCE(SUM(wr_changes), 0) AS wrChanges24h,
            COALESCE(AVG((julianday(finished_at) - julianday(started_at)) * 86400.0), 0) AS avgRunDurationSeconds24h,
            COALESCE(MAX((julianday(finished_at) - julianday(started_at)) * 86400.0), 0) AS maxRunDurationSeconds24h
          FROM ingest_runs
          WHERE julianday(finished_at) >= julianday('now') - (24.0 / 24.0)
          `
        )
        .get() || {};
    const runs24h = Number(run24hRaw.runs24h || 0);
    const mapsChecked24h = Number(run24hRaw.mapsChecked24h || 0);
    const wrChanges24h = Number(run24hRaw.wrChanges24h || 0);
    const avgRunDurationSeconds24h = Number(run24hRaw.avgRunDurationSeconds24h || 0);
    const maxRunDurationSeconds24h = Number(run24hRaw.maxRunDurationSeconds24h || 0);

    const instanceHealthRaw =
      this.db
        .prepare(
          `
          SELECT
            COALESCE(
              SUM(
                CASE
                  WHEN status <> 'online'
                    OR julianday(last_heartbeat_at) < julianday('now') - (10.0 / 1440.0)
                  THEN 1
                  ELSE 0
                END
              ),
              0
            ) AS staleOrOfflineInstances,
            COALESCE(AVG((julianday('now') - julianday(last_heartbeat_at)) * 86400.0), 0) AS avgHeartbeatAgeSeconds,
            COALESCE(MAX((julianday('now') - julianday(last_heartbeat_at)) * 86400.0), 0) AS maxHeartbeatAgeSeconds
          FROM project_instances
          `
        )
        .get() || {};
    const staleOrOfflineInstances = Number(instanceHealthRaw.staleOrOfflineInstances || 0);
    const avgHeartbeatAgeSeconds = Number(instanceHealthRaw.avgHeartbeatAgeSeconds || 0);
    const maxHeartbeatAgeSeconds = Number(instanceHealthRaw.maxHeartbeatAgeSeconds || 0);

    const nameHealthRaw =
      this.db
        .prepare(
          `
          SELECT
            COALESCE(
              SUM(CASE WHEN julianday(observed_at) >= julianday('now') - (24.0 / 24.0) THEN 1 ELSE 0 END),
              0
            ) AS observed24h,
            COALESCE(
              SUM(CASE WHEN julianday(observed_at) < julianday('now') - 20.0 THEN 1 ELSE 0 END),
              0
            ) AS stale20d,
            MAX(observed_at) AS lastObservedAt
          FROM account_display_name_current
          `
        )
        .get() || {};
    const observed24h = Number(nameHealthRaw.observed24h || 0);
    const stale20d = Number(nameHealthRaw.stale20d || 0);
    const lastObservedAt = nameHealthRaw.lastObservedAt || null;
    let renameEvents30d = 0;
    try {
      renameEvents30d = Number(
        this.db
          .prepare(
            `
            SELECT COUNT(*) AS count
            FROM account_display_name_history
            WHERE julianday(valid_from) >= julianday('now') - 30.0
            `
          )
          .get()?.count || 0
      );
    } catch {
      renameEvents30d = 0;
    }
    const missingDisplayNames = Math.max(0, accounts - displayNames);

    const pageCount = Number(this.db.prepare("PRAGMA page_count").get()?.page_count || 0);
    const pageSize = Number(this.db.prepare("PRAGMA page_size").get()?.page_size || 0);
    const freelistCount = Number(this.db.prepare("PRAGMA freelist_count").get()?.freelist_count || 0);
    const dbBytes = pageCount * pageSize;
    const freeBytes = freelistCount * pageSize;
    const usedBytes = Math.max(0, dbBytes - freeBytes);

    let topProjects = [];
    try {
      topProjects = this.db
        .prepare(
          `
          SELECT
            p.project_key AS projectKey,
            p.display_name AS projectName,
            COALESCE(SUM(pm.check_count), 0) AS checks,
            COALESCE(SUM(pm.change_count), 0) AS changes,
            COALESCE(COUNT(pm.map_uid), 0) AS trackedMaps
          FROM projects p
          LEFT JOIN project_maps pm NOT INDEXED ON pm.project_key = p.project_key
          GROUP BY p.project_key, p.display_name
          ORDER BY checks DESC, changes DESC, trackedMaps DESC
          LIMIT 8
          `
        )
        .all()
        .map((row) => ({
          projectKey: row.projectKey,
          projectName: row.projectName || row.projectKey,
          checks: Number(row.checks || 0),
          changes: Number(row.changes || 0),
          trackedMaps: Number(row.trackedMaps || 0),
        }));
    } catch {
      topProjects = [];
    }

    return {
      ...base,
      projects,
      instances,
      onlineInstances,
      ingestRuns,
      eventsChanged,
      accounts,
      displayNames,
      clubs,
      clubCampaigns,
      clubMaps,
      clubMembers,
      lastIngestAt,
      storage: {
        pageCount,
        pageSize,
        dbBytes,
        usedBytes,
        freeBytes,
      },
      freshness: {
        trackedMaps,
        checked6h,
        checked24h,
        checked7d,
        stale24h,
        stale7d,
        neverChecked,
        oldestCheckedAt: mapFreshnessRaw.oldestCheckedAt || null,
        newestCheckedAt: mapFreshnessRaw.newestCheckedAt || null,
      },
      throughput24h: {
        checks: checks24h,
        changes: changes24h,
        errors: errors24h,
        runs: runs24h,
        mapsChecked: mapsChecked24h,
        wrChanges: wrChanges24h,
      },
      rates: {
        changeRateOverallPct: base.events > 0 ? (eventsChanged / base.events) * 100 : 0,
        changeRate24hPct: checks24h > 0 ? (changes24h / checks24h) * 100 : 0,
        errorRate24hPct: checks24h > 0 ? (errors24h / checks24h) * 100 : 0,
      },
      runHealth: {
        avgRunDurationSeconds24h,
        maxRunDurationSeconds24h,
        avgMapsPerRun24h: runs24h > 0 ? mapsChecked24h / runs24h : 0,
        avgWrChangesPerRun24h: runs24h > 0 ? wrChanges24h / runs24h : 0,
      },
      instanceHealth: {
        staleOrOfflineInstances,
        avgHeartbeatAgeSeconds,
        maxHeartbeatAgeSeconds,
      },
      nameHealth: {
        observed24h,
        stale20d,
        renameEvents30d,
        missingDisplayNames,
        coveragePct: accounts > 0 ? (displayNames / accounts) * 100 : 0,
        lastObservedAt,
      },
      topProjects,
    };
    } catch (error) {
      let base = {
        projects: 0,
        maps: 0,
        events: 0,
        latestEventAt: null,
        latestChangeAt: null,
      };
      try {
        base = this.getMeta();
      } catch {}

      return {
        ...base,
        projects: Number(base.projects || 0),
        instances: 0,
        onlineInstances: 0,
        ingestRuns: 0,
        eventsChanged: 0,
        accounts: 0,
        displayNames: 0,
        clubs: 0,
        clubCampaigns: 0,
        clubMaps: 0,
        clubMembers: 0,
        lastIngestAt: null,
        degraded: true,
        degradedReason: String(error?.message || error || "database issue"),
        storage: {
          pageCount: 0,
          pageSize: 0,
          dbBytes: 0,
          usedBytes: 0,
          freeBytes: 0,
        },
        freshness: {
          trackedMaps: 0,
          checked6h: 0,
          checked24h: 0,
          checked7d: 0,
          stale24h: 0,
          stale7d: 0,
          neverChecked: 0,
          oldestCheckedAt: null,
          newestCheckedAt: null,
        },
        throughput24h: {
          checks: 0,
          changes: 0,
          errors: 0,
          runs: 0,
          mapsChecked: 0,
          wrChanges: 0,
        },
        rates: {
          changeRateOverallPct: 0,
          changeRate24hPct: 0,
          errorRate24hPct: 0,
        },
        runHealth: {
          avgRunDurationSeconds24h: 0,
          maxRunDurationSeconds24h: 0,
          avgMapsPerRun24h: 0,
          avgWrChangesPerRun24h: 0,
        },
        instanceHealth: {
          staleOrOfflineInstances: 0,
          avgHeartbeatAgeSeconds: 0,
          maxHeartbeatAgeSeconds: 0,
        },
        nameHealth: {
          observed24h: 0,
          stale20d: 0,
          renameEvents30d: 0,
          missingDisplayNames: 0,
          coveragePct: 0,
          lastObservedAt: null,
        },
        topProjects: [],
      };
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

    const query = String(q || "").trim().toLowerCase();
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

  ingestDisplayNames(payload = {}) {
    const receivedAt = new Date().toISOString();
    const projectKey = normalizeProjectKey(payload.projectKey || payload.project?.key);
    const projectName = String(payload.projectName || payload.project?.name || projectKey || "display-name-tracker").trim();
    const sourceLabel = normalizeMaybeString(payload.sourceLabel || payload.source || payload.project?.sourceLabel);
    const normalizedPayload = normalizeDisplayNameEntries(payload);
    const entries = normalizedPayload.entries;
    const rejected = normalizedPayload.rejected;
    if (!entries.length) {
      return {
        error: "No valid display-name entries provided.",
        rejected,
        rejectedCount: rejected.length,
      };
    }

    let accepted = 0;
    let inserted = 0;
    let updated = 0;
    let unchanged = 0;

    try {
      this.db.exec("BEGIN");

      if (projectKey) {
        this.upsertProjectSeen(projectKey, projectName, sourceLabel, receivedAt);
      }

      const upsertAccountStmt = this.db.prepare(
        `
        INSERT INTO accounts (
          account_id, first_seen_at, last_seen_at
        ) VALUES (?, ?, ?)
        ON CONFLICT(account_id) DO UPDATE SET
          last_seen_at = excluded.last_seen_at
        `
      );

      const getCurrentStmt = this.db.prepare(
        `
        SELECT
          display_name AS displayName,
          observed_at AS observedAt
        FROM account_display_name_current
        WHERE account_id = ?
        LIMIT 1
        `
      );

      const insertCurrentStmt = this.db.prepare(
        `
        INSERT INTO account_display_name_current (
          account_id, display_name, normalized_display_name, source, observed_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?)
        ON CONFLICT(account_id) DO UPDATE SET
          display_name = excluded.display_name,
          normalized_display_name = excluded.normalized_display_name,
          source = COALESCE(excluded.source, account_display_name_current.source),
          observed_at = excluded.observed_at,
          updated_at = excluded.updated_at
        `
      );

      const closeHistoryStmt = this.db.prepare(
        `
        UPDATE account_display_name_history
        SET valid_to = ?
        WHERE account_id = ? AND valid_to IS NULL
        `
      );

      const insertHistoryStmt = this.db.prepare(
        `
        INSERT OR IGNORE INTO account_display_name_history (
          account_id, display_name, normalized_display_name, source, valid_from, valid_to, observed_at
        ) VALUES (?, ?, ?, ?, ?, NULL, ?)
        `
      );

      const insertEventStmt = this.db.prepare(
        `
        INSERT INTO aggregator_events (
          project_key, occurred_at, event_type, detail_1, detail_2, detail_3, source_label, payload_json
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `
      );

      for (const entry of entries) {
        const accountId = normalizeAccountId(entry.accountId);
        const displayName = String(entry.displayName || "").trim();
        if (!accountId || !displayName) continue;
        const observedAt = toIso(entry.observedAt, receivedAt);
        const source = normalizeMaybeString(entry.source || sourceLabel);
        let previousName = null;
        let changeMarker = "no";
        let changeType = "none";

        upsertAccountStmt.run(accountId, observedAt, observedAt);
        const current = getCurrentStmt.get(accountId);
        if (current?.displayName) previousName = String(current.displayName || "").trim() || null;

        if (!current) {
          insertCurrentStmt.run(accountId, displayName, normalizeDisplayNameQuery(displayName), source, observedAt, receivedAt);
          insertHistoryStmt.run(accountId, displayName, normalizeDisplayNameQuery(displayName), source, observedAt, observedAt);
          accepted += 1;
          inserted += 1;
          changeMarker = "*";
          changeType = "new";
        } else {
          const currentName = String(current.displayName || "");
          if (currentName !== displayName) {
            closeHistoryStmt.run(observedAt, accountId);
            insertHistoryStmt.run(accountId, displayName, normalizeDisplayNameQuery(displayName), source, observedAt, observedAt);
            insertCurrentStmt.run(accountId, displayName, normalizeDisplayNameQuery(displayName), source, observedAt, receivedAt);
            accepted += 1;
            updated += 1;
            changeMarker = "yes";
            changeType = "changed";
          } else {
            insertCurrentStmt.run(accountId, displayName, normalizeDisplayNameQuery(displayName), source, observedAt, receivedAt);
            accepted += 1;
            unchanged += 1;
            changeMarker = "no";
            changeType = "none";
          }
        }

        insertEventStmt.run(
          projectKey || null,
          observedAt,
          "displayname.checked",
          displayName,
          accountId,
          `change:${changeMarker}`,
          source,
          JSON.stringify({
            accountId,
            displayName,
            previousDisplayName: previousName,
            changed: changeMarker !== "no",
            change: changeType,
            observedAt,
          })
        );
      }

      this.appendAggregatorEvent({
        projectKey,
        projectName,
        sourceLabel,
        occurredAt: receivedAt,
        eventType: "displayname.sync",
        detail1: `accepted: ${accepted}`,
        detail2: `inserted: ${inserted}, updated: ${updated}`,
        detail3: `unchanged: ${unchanged}`,
        payload: {
          accepted,
          inserted,
          updated,
          unchanged,
        },
      });

      this.db.exec("COMMIT");
    } catch (error) {
      try {
        this.db.exec("ROLLBACK");
      } catch {}
      throw error;
    }

    return {
      projectKey: projectKey || null,
      sourceLabel,
      accepted,
      inserted,
      updated,
      unchanged,
      receivedAt,
      rejected,
      rejectedCount: rejected.length,
    };
  }

  getDisplayNames({
    accountIds = [],
    q = "",
    limit = 200,
    maxAgeSeconds = 0,
  } = {}) {
    const safeLimit = Math.max(1, Math.min(Number(limit) || 200, 2000));
    const normalizedIds = [...new Set(normalizeArray(accountIds).map(normalizeAccountId).filter(Boolean))];
    const queryText = String(q || "").trim().toLowerCase();
    const isStale = (ageSeconds) =>
      Number(maxAgeSeconds || 0) > 0 ? Number(ageSeconds || 0) > Number(maxAgeSeconds) : false;
    const mapRow = (row, missing = false, accountIdOverride = null) => {
      const accountId = accountIdOverride || row?.accountId || null;
      const displayName = sanitizeResolvedDisplayName(row?.displayName, { accountId });
      const normalizedDisplayName = displayName
        ? String(row?.normalizedDisplayName || normalizeDisplayNameQuery(displayName))
        : null;
      return {
        accountId,
        displayName: displayName || null,
        normalizedDisplayName,
        source: row?.source || null,
        observedAt: displayName ? row?.observedAt || null : null,
        updatedAt: row?.updatedAt || null,
        ageSeconds: displayName ? Number(row?.ageSeconds || 0) : 0,
        stale: displayName ? isStale(row?.ageSeconds) : true,
        missing: Boolean(missing) || !displayName,
      };
    };

    if (normalizedIds.length) {
      const placeholders = normalizedIds.map(() => "?").join(", ");
      let rows = [];
      try {
        rows = this.db
          .prepare(
            `
            SELECT
              c.account_id AS accountId,
              c.display_name AS displayName,
              c.normalized_display_name AS normalizedDisplayName,
              c.source AS source,
              c.observed_at AS observedAt,
              c.updated_at AS updatedAt,
              CAST((julianday('now') - julianday(c.observed_at)) * 86400 AS INTEGER) AS ageSeconds
            FROM account_display_name_current c NOT INDEXED
            WHERE c.account_id IN (${placeholders})
            ORDER BY c.account_id ASC
            `
          )
          .all(...normalizedIds);
      } catch {
        rows = [];
      }

      const byAccountId = new Map(rows.map((row) => [String(row.accountId || ""), row]));
      return normalizedIds
        .map((accountId) => {
          const row = byAccountId.get(accountId);
          if (!row) {
            return mapRow(null, true, accountId);
          }
          return mapRow(row, false, accountId);
        })
        .sort((a, b) => String(a.accountId || "").localeCompare(String(b.accountId || "")));
    }

    const clauses = [];
    const args = [];
    if (queryText) {
      clauses.push("(c.normalized_display_name LIKE ? OR LOWER(c.account_id) LIKE ?)");
      args.push(`%${queryText}%`, `%${queryText}%`);
    }

    let rows = [];
    try {
      rows = this.db
        .prepare(
          `
            SELECT
              c.account_id AS accountId,
              c.display_name AS displayName,
              c.normalized_display_name AS normalizedDisplayName,
              c.source AS source,
              c.observed_at AS observedAt,
              c.updated_at AS updatedAt,
            CAST((julianday('now') - julianday(c.observed_at)) * 86400 AS INTEGER) AS ageSeconds
          FROM account_display_name_current c NOT INDEXED
          ${clauses.length ? `WHERE ${clauses.join(" AND ")}` : ""}
          ORDER BY c.observed_at DESC, c.account_id ASC
          LIMIT ?
          `
        )
        .all(...args, safeLimit);
    } catch {
      rows = [];
    }

    return rows.map((row) => mapRow(row, false, null));
  }

  searchDisplayNames({
    q = "",
    mode = "contains",
    limit = 20,
    maxAgeSeconds = 0,
  } = {}) {
    const queryText = normalizeDisplayNameQuery(q);
    if (!queryText) {
      return {
        query: String(q || "").trim(),
        mode: normalizeSearchMode(mode),
        matches: [],
        count: 0,
      };
    }

    const safeMode = normalizeSearchMode(mode);
    const safeLimit = Math.max(1, Math.min(Number(limit) || 20, 200));
    const isStale = (ageSeconds) =>
      Number(maxAgeSeconds || 0) > 0 ? Number(ageSeconds || 0) > Number(maxAgeSeconds) : false;

    let whereClause = "";
    const args = [];
    if (safeMode === "prefix") {
      whereClause = "WHERE c.normalized_display_name LIKE ? OR LOWER(c.account_id) LIKE ?";
      args.push(`${queryText}%`, `${queryText}%`);
    } else if (safeMode === "contains") {
      whereClause = "WHERE c.normalized_display_name LIKE ? OR LOWER(c.account_id) LIKE ?";
      args.push(`%${queryText}%`, `%${queryText}%`);
    }

    let rows = [];
    try {
      if (safeMode === "fuzzy") {
        rows = this.db
          .prepare(
            `
            SELECT
              c.account_id AS accountId,
              c.display_name AS displayName,
              c.normalized_display_name AS normalizedDisplayName,
              c.source AS source,
              c.observed_at AS observedAt,
              c.updated_at AS updatedAt,
              CAST((julianday('now') - julianday(c.observed_at)) * 86400 AS INTEGER) AS ageSeconds
            FROM account_display_name_current c
            ORDER BY c.observed_at DESC, c.account_id ASC
            LIMIT ?
            `
          )
          .all(FUZZY_SEARCH_ROW_LIMIT);
      } else {
        rows = this.db
          .prepare(
            `
            SELECT
              c.account_id AS accountId,
              c.display_name AS displayName,
              c.normalized_display_name AS normalizedDisplayName,
              c.source AS source,
              c.observed_at AS observedAt,
              c.updated_at AS updatedAt,
              CAST((julianday('now') - julianday(c.observed_at)) * 86400 AS INTEGER) AS ageSeconds
            FROM account_display_name_current c
            ${whereClause}
            ORDER BY c.observed_at DESC, c.account_id ASC
            LIMIT ?
            `
          )
          .all(...args, Math.max(safeLimit * 4, safeLimit));
      }
    } catch {
      rows = [];
    }

    const matches = rows
      .map((row) => {
        const accountId = row?.accountId || null;
        const displayName = sanitizeResolvedDisplayName(row?.displayName, { accountId });
        const normalizedDisplayName = String(row?.normalizedDisplayName || normalizeDisplayNameQuery(displayName));
        let score = 0;

        if (safeMode === "prefix") {
          score = normalizedDisplayName.startsWith(queryText) ? 1 : accountId && String(accountId).startsWith(queryText) ? 0.75 : 0;
        } else if (safeMode === "contains") {
          score = normalizedDisplayName.includes(queryText) ? 1 : accountId && String(accountId).includes(queryText) ? 0.75 : 0;
        } else {
          const nameScore = computeDiceScore(normalizedDisplayName, queryText);
          const accountScore = computeDiceScore(String(accountId || ""), queryText) * 0.65;
          score = Math.max(nameScore, accountScore);
        }

        return {
          accountId,
          displayName: displayName || null,
          normalizedDisplayName: normalizedDisplayName || null,
          source: row?.source || null,
          observedAt: row?.observedAt || null,
          updatedAt: row?.updatedAt || null,
          stale: isStale(row?.ageSeconds),
          missing: false,
          score: Number(score.toFixed(4)),
        };
      })
      .filter((row) => row.accountId && row.displayName && row.score > 0)
      .sort((a, b) => {
        const scoreDiff = Number(b.score || 0) - Number(a.score || 0);
        if (scoreDiff !== 0) return scoreDiff;
        return String(a.displayName || "").localeCompare(String(b.displayName || ""));
      })
      .slice(0, safeLimit);

    return {
      query: String(q || "").trim(),
      mode: safeMode,
      matches,
      count: matches.length,
    };
  }

  collectDisplayNameCandidates({ staleAfterSeconds = 86400 } = {}) {
    const safeStaleAfter = Math.max(0, Number(staleAfterSeconds) || 0);
    const nowMs = Date.now();
    const staleMs = safeStaleAfter * 1000;
    const parseMs = (value) => {
      const ms = Date.parse(String(value || ""));
      return Number.isFinite(ms) ? ms : 0;
    };
    const toIso = (ms) => (Number(ms) > 0 ? new Date(Number(ms)).toISOString() : null);
    const safeAll = (sql, ...args) => {
      try {
        return this.db.prepare(sql).all(...args);
      } catch {
        return [];
      }
    };

    const accountRows = safeAll(
      `
      SELECT
        a.account_id AS accountId,
        a.last_seen_at AS accountLastSeenAt,
        c.display_name AS displayName,
        c.observed_at AS observedAt
      FROM accounts a
      LEFT JOIN account_display_name_current c ON c.account_id = a.account_id
      `
    );

    const metaByAccountId = new Map();
    for (const row of accountRows) {
      const accountId = normalizeAccountId(row?.accountId);
      if (!accountId) continue;
      const displayName = sanitizeResolvedDisplayName(row?.displayName, { accountId });
      metaByAccountId.set(accountId, {
        observedAtMs: displayName ? parseMs(row?.observedAt) : 0,
        accountLastSeenMs: parseMs(row?.accountLastSeenAt),
      });
    }

    const candidates = new Map();
    const addCandidate = (rawAccountId, baseScore = 0, seenAt = 0) => {
      const accountId = normalizeAccountId(rawAccountId);
      if (!accountId) return;
      const meta = metaByAccountId.get(accountId) || { observedAtMs: 0, accountLastSeenMs: 0 };
      const isMissing = !meta.observedAtMs;
      const isStale = isMissing || nowMs - meta.observedAtMs > staleMs;
      if (!isStale) return;

      const existing = candidates.get(accountId) || {
        score: 0,
        lastSeenMs: 0,
        observedAtMs: meta.observedAtMs,
      };
      existing.score += Number(baseScore || 0);
      existing.lastSeenMs = Math.max(existing.lastSeenMs, Number(seenAt || 0), Number(meta.accountLastSeenMs || 0));
      existing.observedAtMs = Math.max(Number(existing.observedAtMs || 0), Number(meta.observedAtMs || 0));
      candidates.set(accountId, existing);
    };

    for (const [accountId, meta] of metaByAccountId.entries()) {
      const isMissing = !meta.observedAtMs;
      const isStale = isMissing || nowMs - meta.observedAtMs > staleMs;
      if (!isStale) continue;
      addCandidate(accountId, isMissing ? 120 : 10, meta.accountLastSeenMs);
    }

    for (const row of safeAll(
      `
      SELECT account_id AS accountId, last_synced_at AS seenAt
      FROM club_members
      ORDER BY last_synced_at DESC
      LIMIT 8000
      `
    )) {
      addCandidate(row?.accountId, 90, parseMs(row?.seenAt));
    }

    for (const row of safeAll(
      `
      SELECT author_account_id AS accountId, players_total AS playersTotal, last_synced_at AS seenAt
      FROM club_campaign_maps
      WHERE NULLIF(TRIM(COALESCE(author_account_id, '')), '') IS NOT NULL
      ORDER BY last_synced_at DESC
      LIMIT 12000
      `
    )) {
      const popularityBoost = Math.min(25, Math.floor(Number(row?.playersTotal || 0) / 200));
      addCandidate(row?.accountId, 70 + popularityBoost, parseMs(row?.seenAt));
    }

    for (const row of safeAll(
      `
      SELECT author_account_id AS accountId, players_total AS playersTotal, last_synced_at AS seenAt
      FROM club_upload_maps
      WHERE NULLIF(TRIM(COALESCE(author_account_id, '')), '') IS NOT NULL
      ORDER BY last_synced_at DESC
      LIMIT 12000
      `
    )) {
      const popularityBoost = Math.min(25, Math.floor(Number(row?.playersTotal || 0) / 200));
      addCandidate(row?.accountId, 65 + popularityBoost, parseMs(row?.seenAt));
    }

    for (const row of safeAll(
      `
      SELECT wr_holder AS accountId, latest_checked_at AS seenAt
      FROM project_maps
      WHERE NULLIF(TRIM(COALESCE(wr_holder, '')), '') IS NOT NULL
      ORDER BY latest_checked_at DESC
      LIMIT 12000
      `
    )) {
      addCandidate(row?.accountId, 50, parseMs(row?.seenAt));
    }

    for (const row of safeAll(
      `
      SELECT old_holder AS accountId, checked_at AS seenAt
      FROM map_events
      WHERE NULLIF(TRIM(COALESCE(old_holder, '')), '') IS NOT NULL
      ORDER BY checked_at DESC
      LIMIT 12000
      `
    )) {
      addCandidate(row?.accountId, 45, parseMs(row?.seenAt));
    }
    for (const row of safeAll(
      `
      SELECT new_holder AS accountId, checked_at AS seenAt
      FROM map_events
      WHERE NULLIF(TRIM(COALESCE(new_holder, '')), '') IS NOT NULL
      ORDER BY checked_at DESC
      LIMIT 12000
      `
    )) {
      addCandidate(row?.accountId, 46, parseMs(row?.seenAt));
    }

    return [...candidates.entries()]
      .map(([accountId, candidate]) => {
        const observedAtMs = Number(candidate?.observedAtMs || 0);
        const ageSeconds = observedAtMs > 0 ? Math.max(0, Math.floor((nowMs - observedAtMs) / 1000)) : null;
        return {
          accountId,
          score: Number(candidate?.score || 0),
          lastSeenAt: toIso(candidate?.lastSeenMs),
          observedAt: toIso(observedAtMs),
          ageSeconds,
          missing: observedAtMs <= 0,
          stale: observedAtMs <= 0 || nowMs - observedAtMs > staleMs,
        };
      })
      .sort((a, b) => {
        const scoreDiff = Number(b?.score || 0) - Number(a?.score || 0);
        if (scoreDiff !== 0) return scoreDiff;
        const timeDiff = Date.parse(String(b?.lastSeenAt || "")) - Date.parse(String(a?.lastSeenAt || ""));
        if (Number.isFinite(timeDiff) && timeDiff !== 0) return timeDiff;
        return String(a?.accountId || "").localeCompare(String(b?.accountId || ""));
      });
  }

  listDisplayNameCandidateDetails({ staleAfterSeconds = 86400, limit = 200, offset = 0 } = {}) {
    const safeLimit = Math.max(1, Math.min(Number(limit) || 200, 5000));
    const safeOffset = Math.max(0, Number(offset) || 0);
    const rows = this.collectDisplayNameCandidates({ staleAfterSeconds });
    return {
      count: rows.length,
      limit: safeLimit,
      offset: safeOffset,
      candidates: rows.slice(safeOffset, safeOffset + safeLimit),
    };
  }

  listDisplayNameCandidates({ staleAfterSeconds = 86400, limit = 200 } = {}) {
    const safeLimit = Math.max(1, Math.min(Number(limit) || 200, 5000));
    return this.collectDisplayNameCandidates({ staleAfterSeconds })
      .slice(0, safeLimit)
      .map((row) => row.accountId)
      .filter(Boolean);
  }

  ingestClubSnapshot(payload = {}) {
    const receivedAt = new Date().toISOString();
    const projectKey = normalizeProjectKey(payload.projectKey || payload.project?.key);
    const projectName = String(payload.projectName || payload.project?.name || projectKey || "tracker-club").trim();
    const sourceLabel = normalizeMaybeString(payload.sourceLabel || payload.source || payload.project?.sourceLabel);
    const observedAt = toIso(payload.observedAt || payload.observed_at, receivedAt);
    const club = payload.club && typeof payload.club === "object" ? payload.club : payload;
    const clubId = normalizeClubId(club.clubId || club.club_id || club.id || payload.clubId || payload.club_id);
    if (!clubId) return { error: "clubId is required." };

    const clubName = normalizeMaybeString(club.clubName || club.club_name || club.name);
    const campaigns = normalizeArray(payload.campaigns || club.campaigns);
    const uploads = normalizeArray(payload.uploads || payload.uploadBuckets || club.uploads || club.uploadBuckets);
    const members = normalizeArray(payload.members || club.members);

    let campaignsSeen = 0;
    let campaignMapsSeen = 0;
    let uploadsSeen = 0;
    let uploadMapsSeen = 0;
    let membersSeen = 0;

    try {
      this.db.exec("BEGIN");

      if (projectKey) {
        this.upsertProjectSeen(projectKey, projectName, sourceLabel, receivedAt);
      }

      this.db
        .prepare(
          `
          INSERT INTO clubs (
            club_id, club_name, source_label, first_seen_at, last_synced_at, payload_json
          ) VALUES (?, ?, ?, ?, ?, ?)
          ON CONFLICT(club_id) DO UPDATE SET
            club_name = COALESCE(excluded.club_name, clubs.club_name),
            source_label = COALESCE(excluded.source_label, clubs.source_label),
            last_synced_at = excluded.last_synced_at,
            payload_json = COALESCE(excluded.payload_json, clubs.payload_json)
          `
        )
        .run(clubId, clubName, sourceLabel, observedAt, observedAt, JSON.stringify(club || {}));

      const upsertMapRegistry = this.db.prepare(
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
      const upsertAccount = this.db.prepare(
        `
        INSERT INTO accounts (
          account_id, first_seen_at, last_seen_at
        ) VALUES (?, ?, ?)
        ON CONFLICT(account_id) DO UPDATE SET
          last_seen_at = excluded.last_seen_at
        `
      );

      const upsertCampaign = this.db.prepare(
        `
        INSERT INTO club_campaigns (
          club_id, campaign_id, activity_id, name, publication_ts, creation_ts, maps_count, source_label, payload_json, last_synced_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(club_id, campaign_id) DO UPDATE SET
          activity_id = COALESCE(excluded.activity_id, club_campaigns.activity_id),
          name = COALESCE(excluded.name, club_campaigns.name),
          publication_ts = COALESCE(excluded.publication_ts, club_campaigns.publication_ts),
          creation_ts = COALESCE(excluded.creation_ts, club_campaigns.creation_ts),
          maps_count = excluded.maps_count,
          source_label = COALESCE(excluded.source_label, club_campaigns.source_label),
          payload_json = COALESCE(excluded.payload_json, club_campaigns.payload_json),
          last_synced_at = excluded.last_synced_at
        `
      );

      const upsertCampaignMap = this.db.prepare(
        `
        INSERT INTO club_campaign_maps (
          club_id, campaign_id, map_uid, map_name, position, author_account_id, players_total, source_label, payload_json, last_synced_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(club_id, campaign_id, map_uid) DO UPDATE SET
          map_name = COALESCE(excluded.map_name, club_campaign_maps.map_name),
          position = COALESCE(excluded.position, club_campaign_maps.position),
          author_account_id = COALESCE(excluded.author_account_id, club_campaign_maps.author_account_id),
          players_total = COALESCE(excluded.players_total, club_campaign_maps.players_total),
          source_label = COALESCE(excluded.source_label, club_campaign_maps.source_label),
          payload_json = COALESCE(excluded.payload_json, club_campaign_maps.payload_json),
          last_synced_at = excluded.last_synced_at
        `
      );

      for (const campaign of campaigns) {
        const campaignId = clampInt(campaign?.campaignId ?? campaign?.campaign_id ?? campaign?.id, {
          min: 1,
          max: 2147483647,
          fallback: 0,
        });
        if (!campaignId) continue;
        const maps = normalizeArray(campaign?.maps || campaign?.playlist);
        upsertCampaign.run(
          clubId,
          campaignId,
          clampInt(campaign?.activityId ?? campaign?.activity_id, { min: 0, max: 2147483647, fallback: 0 }) || null,
          normalizeMaybeString(campaign?.name || campaign?.campaignName),
          clampInt(campaign?.publicationTimestamp ?? campaign?.publication_ts, { min: 0, max: 2147483647, fallback: 0 }) || null,
          clampInt(campaign?.creationTimestamp ?? campaign?.creation_ts, { min: 0, max: 2147483647, fallback: 0 }) || null,
          maps.length,
          sourceLabel,
          JSON.stringify(campaign || {}),
          observedAt
        );
        campaignsSeen += 1;

        for (let index = 0; index < maps.length; index += 1) {
          const map = maps[index] || {};
          const mapUid = String(map?.uid || map?.mapUid || map?.map_uid || "").trim();
          if (!mapUid) continue;
          const mapName = normalizeMaybeString(map?.name || map?.mapName);
          const authorAccountId = normalizeAccountId(
            map?.authorAccountId || map?.author_account_id || map?.author || map?.submitter
          );
          if (authorAccountId) upsertAccount.run(authorAccountId, observedAt, observedAt);
          upsertMapRegistry.run(mapUid, mapName, observedAt, observedAt);
          upsertCampaignMap.run(
            clubId,
            campaignId,
            mapUid,
            mapName,
            clampInt(map?.position ?? map?.slot ?? index + 1, { min: 0, max: 100000, fallback: index + 1 }),
            authorAccountId || null,
            clampInt(map?.playersTotal ?? map?.playerCount ?? map?.player_count, { min: 0, max: 2147483647, fallback: 0 }) || null,
            sourceLabel,
            JSON.stringify(map || {}),
            observedAt
          );
          campaignMapsSeen += 1;
        }
      }

      const upsertUpload = this.db.prepare(
        `
        INSERT INTO club_uploads (
          club_id, upload_id, activity_id, name, publication_ts, creation_ts, maps_count, source_label, payload_json, last_synced_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(club_id, upload_id) DO UPDATE SET
          activity_id = COALESCE(excluded.activity_id, club_uploads.activity_id),
          name = COALESCE(excluded.name, club_uploads.name),
          publication_ts = COALESCE(excluded.publication_ts, club_uploads.publication_ts),
          creation_ts = COALESCE(excluded.creation_ts, club_uploads.creation_ts),
          maps_count = excluded.maps_count,
          source_label = COALESCE(excluded.source_label, club_uploads.source_label),
          payload_json = COALESCE(excluded.payload_json, club_uploads.payload_json),
          last_synced_at = excluded.last_synced_at
        `
      );

      const upsertUploadMap = this.db.prepare(
        `
        INSERT INTO club_upload_maps (
          club_id, upload_id, map_uid, map_name, position, author_account_id, players_total, source_label, payload_json, last_synced_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(club_id, upload_id, map_uid) DO UPDATE SET
          map_name = COALESCE(excluded.map_name, club_upload_maps.map_name),
          position = COALESCE(excluded.position, club_upload_maps.position),
          author_account_id = COALESCE(excluded.author_account_id, club_upload_maps.author_account_id),
          players_total = COALESCE(excluded.players_total, club_upload_maps.players_total),
          source_label = COALESCE(excluded.source_label, club_upload_maps.source_label),
          payload_json = COALESCE(excluded.payload_json, club_upload_maps.payload_json),
          last_synced_at = excluded.last_synced_at
        `
      );

      for (const upload of uploads) {
        const uploadId = clampInt(upload?.uploadId ?? upload?.upload_id ?? upload?.bucketId ?? upload?.bucket_id ?? upload?.id, {
          min: 1,
          max: 2147483647,
          fallback: 0,
        });
        if (!uploadId) continue;
        const maps = normalizeArray(upload?.maps || upload?.mapList);
        upsertUpload.run(
          clubId,
          uploadId,
          clampInt(upload?.activityId ?? upload?.activity_id, { min: 0, max: 2147483647, fallback: 0 }) || null,
          normalizeMaybeString(upload?.name || upload?.uploadName || upload?.bucketName),
          clampInt(upload?.publicationTimestamp ?? upload?.publication_ts, { min: 0, max: 2147483647, fallback: 0 }) || null,
          clampInt(upload?.creationTimestamp ?? upload?.creation_ts, { min: 0, max: 2147483647, fallback: 0 }) || null,
          maps.length,
          sourceLabel,
          JSON.stringify(upload || {}),
          observedAt
        );
        uploadsSeen += 1;

        for (let index = 0; index < maps.length; index += 1) {
          const map = maps[index] || {};
          const mapUid = String(map?.uid || map?.mapUid || map?.map_uid || "").trim();
          if (!mapUid) continue;
          const mapName = normalizeMaybeString(map?.name || map?.mapName);
          const authorAccountId = normalizeAccountId(
            map?.authorAccountId || map?.author_account_id || map?.author || map?.submitter
          );
          if (authorAccountId) upsertAccount.run(authorAccountId, observedAt, observedAt);
          upsertMapRegistry.run(mapUid, mapName, observedAt, observedAt);
          upsertUploadMap.run(
            clubId,
            uploadId,
            mapUid,
            mapName,
            clampInt(map?.position ?? map?.slot ?? index + 1, { min: 0, max: 100000, fallback: index + 1 }),
            authorAccountId || null,
            clampInt(map?.playersTotal ?? map?.playerCount ?? map?.player_count, { min: 0, max: 2147483647, fallback: 0 }) || null,
            sourceLabel,
            JSON.stringify(map || {}),
            observedAt
          );
          uploadMapsSeen += 1;
        }
      }

      const upsertMember = this.db.prepare(
        `
        INSERT INTO club_members (
          club_id, account_id, role, source_label, payload_json, last_synced_at
        ) VALUES (?, ?, ?, ?, ?, ?)
        ON CONFLICT(club_id, account_id) DO UPDATE SET
          role = COALESCE(excluded.role, club_members.role),
          source_label = COALESCE(excluded.source_label, club_members.source_label),
          payload_json = COALESCE(excluded.payload_json, club_members.payload_json),
          last_synced_at = excluded.last_synced_at
        `
      );

      const upsertCurrentName = this.db.prepare(
        `
        INSERT INTO account_display_name_current (
          account_id, display_name, normalized_display_name, source, observed_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?)
        ON CONFLICT(account_id) DO UPDATE SET
          display_name = excluded.display_name,
          normalized_display_name = excluded.normalized_display_name,
          source = COALESCE(excluded.source, account_display_name_current.source),
          observed_at = excluded.observed_at,
          updated_at = excluded.updated_at
        `
      );
      const upsertHistoryName = this.db.prepare(
        `
        INSERT OR IGNORE INTO account_display_name_history (
          account_id, display_name, normalized_display_name, source, valid_from, valid_to, observed_at
        ) VALUES (?, ?, ?, ?, ?, NULL, ?)
        `
      );
      const closeHistoryName = this.db.prepare(
        `
        UPDATE account_display_name_history
        SET valid_to = ?
        WHERE account_id = ? AND valid_to IS NULL
        `
      );
      const getCurrentName = this.db.prepare(
        `
        SELECT display_name AS displayName
        FROM account_display_name_current
        WHERE account_id = ?
        LIMIT 1
        `
      );

      for (const member of members) {
        const accountId = normalizeAccountId(
          member?.accountId || member?.account_id || member?.id || member?.playerId
        );
        if (!accountId) continue;
        const displayName = sanitizeResolvedDisplayName(
          member?.displayName || member?.display_name || member?.name || "",
          { accountId }
        );
        upsertAccount.run(accountId, observedAt, observedAt);
        upsertMember.run(
          clubId,
          accountId,
          normalizeMaybeString(
            member?.role || member?.status || member?.memberRole || member?.member_role
          ),
          sourceLabel,
          JSON.stringify(member || {}),
          observedAt
        );
        membersSeen += 1;

        if (displayName) {
          const current = getCurrentName.get(accountId);
          if (!current || String(current.displayName || "") !== displayName) {
            closeHistoryName.run(observedAt, accountId);
            upsertHistoryName.run(accountId, displayName, normalizeDisplayNameQuery(displayName), sourceLabel, observedAt, observedAt);
          }
          upsertCurrentName.run(accountId, displayName, normalizeDisplayNameQuery(displayName), sourceLabel, observedAt, receivedAt);
        }
      }

      this.appendAggregatorEvent({
        projectKey,
        projectName,
        sourceLabel,
        occurredAt: observedAt,
        eventType: "club.snapshot",
        detail1: `club: ${clubName || clubId}`,
        detail2: `campaigns: ${campaignsSeen}, uploads: ${uploadsSeen}, members: ${membersSeen}`,
        detail3: `maps: ${campaignMapsSeen + uploadMapsSeen}`,
        payload: {
          clubId,
          clubName,
          campaignsSeen,
          campaignMapsSeen,
          uploadsSeen,
          uploadMapsSeen,
          membersSeen,
        },
      });

      this.db.exec("COMMIT");
    } catch (error) {
      try {
        this.db.exec("ROLLBACK");
      } catch {}
      throw error;
    }

    return {
      projectKey: projectKey || null,
      sourceLabel,
      clubId,
      clubName,
      observedAt,
      campaignsSeen,
      campaignMapsSeen,
      uploadsSeen,
      uploadMapsSeen,
      membersSeen,
      receivedAt,
    };
  }

  getClubSummary(clubId) {
    const normalizedClubId = normalizeClubId(clubId);
    if (!normalizedClubId) return null;
    const row = this.db
      .prepare(
        `
        SELECT
          c.club_id AS clubId,
          c.club_name AS clubName,
          c.source_label AS sourceLabel,
          c.last_synced_at AS lastSyncedAt,
          COALESCE(campaigns.count, 0) AS campaignsCount,
          COALESCE(campaignMaps.count, 0) AS campaignMapsCount,
          COALESCE(uploads.count, 0) AS uploadsCount,
          COALESCE(uploadMaps.count, 0) AS uploadMapsCount,
          COALESCE(members.count, 0) AS membersCount
        FROM clubs c
        LEFT JOIN (
          SELECT club_id, COUNT(*) AS count FROM club_campaigns GROUP BY club_id
        ) campaigns ON campaigns.club_id = c.club_id
        LEFT JOIN (
          SELECT club_id, COUNT(*) AS count FROM club_campaign_maps GROUP BY club_id
        ) campaignMaps ON campaignMaps.club_id = c.club_id
        LEFT JOIN (
          SELECT club_id, COUNT(*) AS count FROM club_uploads GROUP BY club_id
        ) uploads ON uploads.club_id = c.club_id
        LEFT JOIN (
          SELECT club_id, COUNT(*) AS count FROM club_upload_maps GROUP BY club_id
        ) uploadMaps ON uploadMaps.club_id = c.club_id
        LEFT JOIN (
          SELECT club_id, COUNT(*) AS count FROM club_members GROUP BY club_id
        ) members ON members.club_id = c.club_id
        WHERE c.club_id = ?
        LIMIT 1
        `
      )
      .get(normalizedClubId);

    if (!row) return null;
    return {
      clubId: Number(row.clubId),
      clubName: row.clubName || null,
      sourceLabel: row.sourceLabel || null,
      lastSyncedAt: row.lastSyncedAt || null,
      campaignsCount: Number(row.campaignsCount || 0),
      campaignMapsCount: Number(row.campaignMapsCount || 0),
      uploadsCount: Number(row.uploadsCount || 0),
      uploadMapsCount: Number(row.uploadMapsCount || 0),
      membersCount: Number(row.membersCount || 0),
    };
  }

  getClubCampaigns(clubId, { limit = 200 } = {}) {
    const normalizedClubId = normalizeClubId(clubId);
    if (!normalizedClubId) return [];
    const rows = this.db
      .prepare(
        `
        SELECT
          campaign_id AS campaignId,
          activity_id AS activityId,
          name AS name,
          publication_ts AS publicationTs,
          creation_ts AS creationTs,
          maps_count AS mapsCount,
          source_label AS sourceLabel,
          last_synced_at AS lastSyncedAt
        FROM club_campaigns
        WHERE club_id = ?
        ORDER BY COALESCE(publication_ts, 0) DESC, campaign_id DESC
        LIMIT ?
        `
      )
      .all(normalizedClubId, Math.max(1, Math.min(Number(limit) || 200, 2000)));
    return rows.map((row) => ({
      campaignId: Number(row.campaignId || 0),
      activityId: row.activityId === null ? null : Number(row.activityId || 0),
      name: row.name || null,
      publicationTs: row.publicationTs === null ? null : Number(row.publicationTs || 0),
      creationTs: row.creationTs === null ? null : Number(row.creationTs || 0),
      mapsCount: Number(row.mapsCount || 0),
      sourceLabel: row.sourceLabel || null,
      lastSyncedAt: row.lastSyncedAt || null,
    }));
  }

  getClubMembers(clubId, { q = "", limit = 200 } = {}) {
    const normalizedClubId = normalizeClubId(clubId);
    if (!normalizedClubId) return [];
    const query = String(q || "").trim().toLowerCase();
    const clauses = ["m.club_id = ?"];
    const args = [normalizedClubId];
    if (query) {
      clauses.push("(LOWER(m.account_id) LIKE ? OR LOWER(COALESCE(c.display_name, '')) LIKE ?)");
      args.push(`%${query}%`, `%${query}%`);
    }
    const rows = this.db
      .prepare(
        `
        SELECT
          m.account_id AS accountId,
          m.role AS role,
          m.source_label AS sourceLabel,
          m.last_synced_at AS lastSyncedAt,
          c.display_name AS displayName,
          c.observed_at AS nameObservedAt
        FROM club_members m
        LEFT JOIN account_display_name_current c ON c.account_id = m.account_id
        WHERE ${clauses.join(" AND ")}
        ORDER BY m.last_synced_at DESC, m.account_id ASC
        LIMIT ?
        `
      )
      .all(...args, Math.max(1, Math.min(Number(limit) || 200, 5000)));
    return rows.map((row) => ({
      accountId: row.accountId,
      displayName: row.displayName || null,
      role: row.role || null,
      sourceLabel: row.sourceLabel || null,
      nameObservedAt: row.nameObservedAt || null,
      lastSyncedAt: row.lastSyncedAt || null,
    }));
  }

  getClubMaps(clubId, { q = "", limit = 500 } = {}) {
    const normalizedClubId = normalizeClubId(clubId);
    if (!normalizedClubId) return [];
    const query = String(q || "").trim().toLowerCase();
    const clauses = ["club_id = ?"];
    const args = [normalizedClubId];
    if (query) {
      clauses.push("(LOWER(map_uid) LIKE ? OR LOWER(COALESCE(map_name, '')) LIKE ?)");
      args.push(`%${query}%`, `%${query}%`);
    }

    const campaignRows = this.db
      .prepare(
        `
        SELECT
          map_uid AS mapUid,
          map_name AS mapName,
          author_account_id AS authorAccountId,
          players_total AS playersTotal,
          last_synced_at AS lastSyncedAt,
          campaign_id AS relationId,
          'campaign' AS relationType
        FROM club_campaign_maps
        WHERE ${clauses.join(" AND ")}
        `
      )
      .all(...args);

    const uploadRows = this.db
      .prepare(
        `
        SELECT
          map_uid AS mapUid,
          map_name AS mapName,
          author_account_id AS authorAccountId,
          players_total AS playersTotal,
          last_synced_at AS lastSyncedAt,
          upload_id AS relationId,
          'upload' AS relationType
        FROM club_upload_maps
        WHERE ${clauses.join(" AND ")}
        `
      )
      .all(...args);

    const merged = [...campaignRows, ...uploadRows]
      .sort((a, b) => String(b.lastSyncedAt || "").localeCompare(String(a.lastSyncedAt || "")))
      .slice(0, Math.max(1, Math.min(Number(limit) || 500, 10000)));

    return merged.map((row) => ({
      mapUid: row.mapUid,
      mapName: row.mapName || row.mapUid,
      authorAccountId: row.authorAccountId || null,
      playersTotal: row.playersTotal === null ? null : Number(row.playersTotal || 0),
      lastSyncedAt: row.lastSyncedAt || null,
      relationType: row.relationType,
      relationId: Number(row.relationId || 0),
    }));
  }

  getEventFacets({
    projectKey = "",
    includeSystem = false,
    fromIso = "",
    toIso = "",
  } = {}) {
    const queryKey = normalizeProjectKey(projectKey);
    const parsedFromMs = Date.parse(String(fromIso || ""));
    const parsedToMs = Date.parse(String(toIso || ""));
    const normalizedFromIso = Number.isFinite(parsedFromMs)
      ? new Date(parsedFromMs).toISOString()
      : "";
    const normalizedToIso = Number.isFinite(parsedToMs) ? new Date(parsedToMs).toISOString() : "";
    const facetSampleLimit = 2000;

    const sourceSet = new Set();
    const eventTypeSet = new Set();

    const mapClauses = [];
    const mapArgs = [];
    if (queryKey) {
      mapClauses.push("project_key = ?");
      mapArgs.push(queryKey);
    }
    if (normalizedFromIso) {
      mapClauses.push("checked_at >= ?");
      mapArgs.push(normalizedFromIso);
    }
    if (normalizedToIso) {
      mapClauses.push("checked_at <= ?");
      mapArgs.push(normalizedToIso);
    }
    const mapWhereSql = mapClauses.length ? `WHERE ${mapClauses.join(" AND ")}` : "";

    const aggregatorClauses = [];
    const aggregatorArgs = [];
    if (queryKey) {
      aggregatorClauses.push("project_key = ?");
      aggregatorArgs.push(queryKey);
    }
    if (!includeSystem) {
      aggregatorClauses.push("event_type NOT LIKE 'instance.%'");
    }
    if (normalizedFromIso) {
      aggregatorClauses.push("occurred_at >= ?");
      aggregatorArgs.push(normalizedFromIso);
    }
    if (normalizedToIso) {
      aggregatorClauses.push("occurred_at <= ?");
      aggregatorArgs.push(normalizedToIso);
    }
    const aggregatorWhereSql = aggregatorClauses.length
      ? `WHERE ${aggregatorClauses.join(" AND ")}`
      : "";

    const mapFacetRows = this.db
      .prepare(
        `
        SELECT source, changed
        FROM map_events
        ${mapWhereSql}
        ORDER BY checked_at DESC
        LIMIT ${facetSampleLimit}
        `
      )
      .all(...mapArgs);
    if (mapFacetRows.length > 0) {
      sourceSet.add("tracker-run");
    }
    for (const row of mapFacetRows) {
      if (Number(row?.changed || 0) === 1) {
        eventTypeSet.add("map.wr_changed");
      } else {
        eventTypeSet.add("map.checked");
      }
    }

    const aggregatorFacetRows = this.db
      .prepare(
        `
        SELECT source_label AS sourceLabel, event_type AS eventType
        FROM aggregator_events
        ${aggregatorWhereSql}
        ORDER BY occurred_at DESC
        LIMIT ${facetSampleLimit}
        `
      )
      .all(...aggregatorArgs);
    for (const row of aggregatorFacetRows) {
      const sourceLabel = String(row?.sourceLabel || "").trim();
      if (sourceLabel) sourceSet.add(sourceLabel);
      const eventType = String(row?.eventType || "").trim();
      if (eventType) eventTypeSet.add(eventType);
    }

    return {
      sources: [...sourceSet].sort((a, b) => a.localeCompare(b)),
      eventTypes: [...eventTypeSet].sort((a, b) => a.localeCompare(b)),
      filters: {
        projectKey: queryKey || "",
        includeSystem: Boolean(includeSystem),
        fromIso: normalizedFromIso || "",
        toIso: normalizedToIso || "",
      },
    };
  }

  getWrBaselineQueue({
    limit = 100,
    offset = 0,
    page = 1,
    status = "queued",
    projectKey = "",
    q = "",
  } = {}) {
    const queryKey = normalizeProjectKey(projectKey);
    const safeLimit = Math.max(1, Math.min(Number(limit) || 100, 500));
    const requestedPage = Math.max(1, Number(page) || 1);
    const requestedOffset =
      Number(offset) > 0 ? Math.max(0, Math.floor(Number(offset))) : (requestedPage - 1) * safeLimit;
    const safeStatus = String(status || "").trim().toLowerCase();
    const queryText = String(q || "").trim().toLowerCase();

    const clauses = [];
    const args = [];
    if (safeStatus && safeStatus !== "all") {
      clauses.push("LOWER(wq.status) = ?");
      args.push(safeStatus);
    }
    if (queryKey) {
      clauses.push("wq.project_key = ?");
      args.push(queryKey);
    }
    if (queryText) {
      clauses.push(
        "(" +
          [
            "LOWER(COALESCE(wq.map_uid, '')) LIKE ?",
            "LOWER(COALESCE(wq.map_name, '')) LIKE ?",
            "LOWER(COALESCE(wq.old_holder, '')) LIKE ?",
            "LOWER(COALESCE(wq.new_holder, '')) LIKE ?",
            "LOWER(COALESCE(wq.reason_code, '')) LIKE ?",
            "LOWER(COALESCE(p.display_name, '')) LIKE ?",
          ].join(" OR ") +
          ")"
      );
      for (let i = 0; i < 6; i += 1) args.push(`%${queryText}%`);
    }
    const whereSql = clauses.length ? `WHERE ${clauses.join(" AND ")}` : "";

    const totalRow =
      this.db
        .prepare(
          `
          SELECT COUNT(*) AS count
          FROM wr_baseline_queue wq
          LEFT JOIN projects p ON p.project_key = wq.project_key
          ${whereSql}
          `
        )
        .get(...args) || {};
    const total = Number(totalRow.count || 0);
    const totalPages = Math.max(1, Math.ceil(total / safeLimit));
    const clampedPage = Math.max(1, Math.min(requestedPage, totalPages));
    const clampedOffset = Math.max(0, (clampedPage - 1) * safeLimit);

    const rows = this.db
      .prepare(
        `
        SELECT
          wq.queue_id AS queueId,
          wq.project_key AS projectKey,
          p.display_name AS projectName,
          wq.map_uid AS mapUid,
          wq.map_name AS mapName,
          wq.checked_at AS checkedAt,
          wq.reason_code AS reasonCode,
          wq.old_wr_time AS oldWrTime,
          wq.new_wr_time AS newWrTime,
          wq.old_holder AS oldHolder,
          wq.new_holder AS newHolder,
          wq.source AS source,
          wq.note AS note,
          wq.status AS status,
          wq.resolution_note AS resolutionNote,
          wq.created_at AS createdAt,
          wq.updated_at AS updatedAt,
          wq.resolved_at AS resolvedAt
        FROM wr_baseline_queue wq
        LEFT JOIN projects p ON p.project_key = wq.project_key
        ${whereSql}
        ORDER BY datetime(wq.created_at) DESC, wq.queue_id DESC
        LIMIT ? OFFSET ?
        `
      )
      .all(...args, safeLimit, clampedOffset);

    return {
      items: rows.map((row) => ({
        queueId: Number(row.queueId || 0),
        projectKey: row.projectKey || null,
        projectName: row.projectName || row.projectKey || null,
        mapUid: row.mapUid || null,
        mapName: row.mapName || row.mapUid || null,
        checkedAt: row.checkedAt || null,
        reasonCode: row.reasonCode || null,
        oldWrTime: row.oldWrTime === null ? null : Number(row.oldWrTime || 0),
        newWrTime: row.newWrTime === null ? null : Number(row.newWrTime || 0),
        oldHolder: row.oldHolder || null,
        newHolder: row.newHolder || null,
        source: row.source || null,
        note: row.note || null,
        status: row.status || null,
        resolutionNote: row.resolutionNote || null,
        createdAt: row.createdAt || null,
        updatedAt: row.updatedAt || null,
        resolvedAt: row.resolvedAt || null,
      })),
      count: rows.length,
      total,
      limit: safeLimit,
      offset: clampedOffset,
      page: clampedPage,
      totalPages,
      filters: {
        status: safeStatus || "all",
        projectKey: queryKey || "",
        q: queryText,
      },
    };
  }

  getRecentEvents({
    limit = 80,
    offset = 0,
    page = 1,
    projectKey = "",
    changedOnly = false,
    includeSystem = false,
    source = "",
    eventType = "",
    fromIso = "",
    toIso = "",
    q = "",
  } = {}) {
    const queryKey = normalizeProjectKey(projectKey);
    const safeLimit = Math.max(1, Math.min(Number(limit) || 80, 500));
    const requestedPage = Math.max(1, Number(page) || 1);
    const requestedOffset =
      Number(offset) > 0 ? Math.max(0, Math.floor(Number(offset))) : (requestedPage - 1) * safeLimit;

    const parsedFromMs = Date.parse(String(fromIso || ""));
    const parsedToMs = Date.parse(String(toIso || ""));
    const normalizedFromIso = Number.isFinite(parsedFromMs)
      ? new Date(parsedFromMs).toISOString()
      : "";
    const normalizedToIso = Number.isFinite(parsedToMs) ? new Date(parsedToMs).toISOString() : "";
    const queryText = String(q || "").trim().toLowerCase();
    const sourceFilter = String(source || "").trim().toLowerCase();
    const eventTypeFilter = String(eventType || "").trim().toLowerCase();
    const sampleLimit = Math.min(20000, Math.max(2000, requestedOffset + safeLimit * 10));

    const includeMapEvents =
      !eventTypeFilter || eventTypeFilter === "map.checked" || eventTypeFilter === "map.wr_changed";
    const includeAggregatorEvents =
      !eventTypeFilter || (eventTypeFilter !== "map.checked" && eventTypeFilter !== "map.wr_changed");

    const rows = [];

    if (includeMapEvents) {
      const mapClauses = [];
      const mapArgs = [];
      if (queryKey) {
        mapClauses.push("me.project_key = ?");
        mapArgs.push(queryKey);
      }
      if (changedOnly || eventTypeFilter === "map.wr_changed") {
        mapClauses.push("me.changed = 1");
      } else if (eventTypeFilter === "map.checked") {
        mapClauses.push("me.changed = 0");
      }
      if (sourceFilter) {
        mapClauses.push("LOWER(COALESCE(me.source, 'tracker-run')) = ?");
        mapArgs.push(sourceFilter);
      }
      if (normalizedFromIso) {
        mapClauses.push("me.checked_at >= ?");
        mapArgs.push(normalizedFromIso);
      }
      if (normalizedToIso) {
        mapClauses.push("me.checked_at <= ?");
        mapArgs.push(normalizedToIso);
      }
      const mapWhereSql = mapClauses.length ? `WHERE ${mapClauses.join(" AND ")}` : "";
      const mapRows = this.db
        .prepare(
          `
          SELECT
            me.event_id AS eventId,
            'map:' || me.event_id AS eventKey,
            me.project_key AS projectKey,
            p.display_name AS projectName,
            me.checked_at AS occurredAt,
            CASE WHEN me.changed = 1 THEN 'map.wr_changed' ELSE 'map.checked' END AS eventType,
            COALESCE(me.map_name, mr.map_name, me.map_uid) AS detail1,
            CASE
              WHEN me.changed = 1 THEN ('wr: ' || COALESCE(CAST(me.old_wr_time AS TEXT), '-') || ' -> ' || COALESCE(CAST(me.new_wr_time AS TEXT), '-'))
              ELSE 'wr unchanged'
            END AS detail2,
            CASE
              WHEN me.changed = 1 THEN ('holder: ' || COALESCE(me.old_holder, '-') || ' -> ' || COALESCE(me.new_holder, '-'))
              ELSE COALESCE(me.note, '')
            END AS detail3,
            COALESCE(me.source, 'tracker-run') AS sourceLabel,
            NULL AS payloadJson,
            me.map_uid AS mapUid,
            COALESCE(me.map_name, mr.map_name, me.map_uid) AS mapName,
            me.changed AS changed,
            CASE
              WHEN me.changed = 1 AND COALESCE(me.old_wr_time, 0) <= 0 THEN '*'
              WHEN me.changed = 1 THEN 'yes'
              ELSE 'no'
            END AS changedMarker,
            me.old_wr_time AS oldWrTime,
            me.new_wr_time AS newWrTime,
            me.old_holder AS oldHolder,
            me.new_holder AS newHolder,
            me.note AS note
          FROM map_events me
          LEFT JOIN projects p ON p.project_key = me.project_key
          LEFT JOIN map_registry mr ON mr.map_uid = me.map_uid
          ${mapWhereSql}
          ORDER BY me.checked_at DESC, me.event_id DESC
          LIMIT ?
          `
        )
        .all(...mapArgs, sampleLimit);
      rows.push(...mapRows);
    }

    if (includeAggregatorEvents) {
      const aggregatorClauses = [];
      const aggregatorArgs = [];
      if (queryKey) {
        aggregatorClauses.push("ae.project_key = ?");
        aggregatorArgs.push(queryKey);
      }
      if (!includeSystem) {
        aggregatorClauses.push("ae.event_type NOT LIKE 'instance.%'");
      }
      if (sourceFilter) {
        aggregatorClauses.push("LOWER(COALESCE(ae.source_label, '')) = ?");
        aggregatorArgs.push(sourceFilter);
      }
      if (eventTypeFilter) {
        aggregatorClauses.push("LOWER(ae.event_type) = ?");
        aggregatorArgs.push(eventTypeFilter);
      }
      if (normalizedFromIso) {
        aggregatorClauses.push("ae.occurred_at >= ?");
        aggregatorArgs.push(normalizedFromIso);
      }
      if (normalizedToIso) {
        aggregatorClauses.push("ae.occurred_at <= ?");
        aggregatorArgs.push(normalizedToIso);
      }
      const aggregatorWhereSql = aggregatorClauses.length
        ? `WHERE ${aggregatorClauses.join(" AND ")}`
        : "";
      const aggregatorRows = this.db
        .prepare(
          `
          SELECT
            ae.event_id AS eventId,
            'agg:' || ae.event_id AS eventKey,
            ae.project_key AS projectKey,
            p.display_name AS projectName,
            ae.occurred_at AS occurredAt,
            ae.event_type AS eventType,
            ae.detail_1 AS detail1,
            ae.detail_2 AS detail2,
            ae.detail_3 AS detail3,
            ae.source_label AS sourceLabel,
            ae.payload_json AS payloadJson,
            NULL AS mapUid,
            NULL AS mapName,
            0 AS changed,
            CASE
              WHEN ae.event_type = 'displayname.checked' THEN
                CASE
                  WHEN LOWER(COALESCE(ae.detail_3, '')) LIKE 'change:*%' THEN '*'
                  WHEN LOWER(COALESCE(ae.detail_3, '')) LIKE 'change:yes%' THEN 'yes'
                  ELSE 'no'
                END
              ELSE 'no'
            END AS changedMarker,
            NULL AS oldWrTime,
            NULL AS newWrTime,
            NULL AS oldHolder,
            NULL AS newHolder,
            NULL AS note
          FROM aggregator_events ae
          LEFT JOIN projects p ON p.project_key = ae.project_key
          ${aggregatorWhereSql}
          ORDER BY ae.occurred_at DESC, ae.event_id DESC
          LIMIT ?
          `
        )
        .all(...aggregatorArgs, sampleLimit);
      rows.push(...aggregatorRows);
    }

    const mappedEvents = rows.map((row) => {
      let payloadObject = null;
      if (row.payloadJson) {
        try {
          payloadObject = JSON.parse(String(row.payloadJson));
        } catch {
          payloadObject = null;
        }
      }

      const detail3Text = String(row.detail3 || "").trim();
      const detail3ForEvent = detail3Text.replace(/^change:(\*|yes|no)\s*/i, "").trim();
      let changedLabel = String(row.changedMarker || "").trim().toLowerCase();
      if (!changedLabel) {
        if (payloadObject?.change === "new") changedLabel = "*";
        else if (payloadObject?.changed === true || payloadObject?.change === "changed")
          changedLabel = "yes";
        else if (Boolean(row.changed)) {
          changedLabel = Number(row.oldWrTime || 0) <= 0 ? "*" : "yes";
        } else {
          changedLabel = "no";
        }
      }
      if (changedLabel !== "*" && changedLabel !== "yes" && changedLabel !== "no") {
        changedLabel = "no";
      }

      const item =
        row.mapName ||
        row.mapUid ||
        row.detail1 ||
        payloadObject?.displayName ||
        payloadObject?.accountId ||
        "-";
      const eventDetail = [row.detail2, detail3ForEvent].filter(Boolean).join(" | ");

      return {
        eventId: Number(row.eventId || 0),
        eventKey: row.eventKey || String(row.eventId || ""),
        projectKey: row.projectKey,
        projectName: row.projectName || row.projectKey,
        occurredAt: row.occurredAt || row.checkedAt || null,
        checkedAt: row.occurredAt || row.checkedAt || null,
        eventType: row.eventType || "event",
        event: row.eventType || "event",
        detail1: row.detail1 || null,
        detail2: row.detail2 || null,
        detail3: row.detail3 || null,
        mapUid: row.mapUid,
        mapName: row.mapName || row.mapUid,
        item,
        eventDetail: eventDetail || null,
        changed: changedLabel === "yes" || changedLabel === "*",
        changedLabel,
        oldWrTime: Number(row.oldWrTime || 0),
        newWrTime: Number(row.newWrTime || 0),
        oldHolder: row.oldHolder || null,
        newHolder: row.newHolder || null,
        source: row.sourceLabel || null,
        sourceLabel: row.sourceLabel || null,
        note: row.note || null,
        payload: row.payloadJson ? String(row.payloadJson) : null,
      };
    });

    const filteredEvents = mappedEvents
      .filter((event) => {
        if (changedOnly && !event.changed) return false;
        if (!queryText) return true;
        return [
          event.detail1,
          event.detail2,
          event.detail3,
          event.mapName,
          event.mapUid,
          event.eventType,
          event.projectName,
          event.item,
          event.eventDetail,
          event.sourceLabel,
        ].some((value) => String(value || "").toLowerCase().includes(queryText));
      })
      .sort((a, b) => {
        const timeCompare = String(b.occurredAt || "").localeCompare(String(a.occurredAt || ""));
        if (timeCompare !== 0) return timeCompare;
        return Number(b.eventId || 0) - Number(a.eventId || 0);
      });

    const total = filteredEvents.length;
    const totalPages = Math.max(1, Math.ceil(total / safeLimit));
    const clampedPage = Math.max(1, Math.min(requestedPage, totalPages));
    const clampedOffset = Math.max(0, (clampedPage - 1) * safeLimit);
    const events = filteredEvents.slice(clampedOffset, clampedOffset + safeLimit);

    return {
      events,
      count: events.length,
      total,
      limit: safeLimit,
      offset: clampedOffset,
      page: clampedPage,
      totalPages,
      filters: {
        projectKey: queryKey || "",
        changedOnly: Boolean(changedOnly),
        includeSystem: Boolean(includeSystem),
        source: String(source || "").trim(),
        eventType: String(eventType || "").trim(),
        fromIso: normalizedFromIso || "",
        toIso: normalizedToIso || "",
        q: queryText,
      },
    };
  }
}

export { AggregatorRepository };
