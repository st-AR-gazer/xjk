import { clampInt, parseJsonSafe as tryParseJson, toIso } from "../../../../shared/valueUtils.js";
import {
  normalizeTrafficBytes,
  normalizeTrafficDirection,
  normalizeTrafficDurationMs,
  normalizeTrafficHost as normalizeHost,
  normalizeTrafficMethod as normalizeHttpMethod,
  normalizeTrafficPath as normalizeHttpPath,
  normalizeTrafficStatusCode,
} from "../../../../shared/trafficTelemetry.js";
import { normalizeMaybeString, normalizeProjectKey } from "../support/repositoryValues.js";

function parseBucket(value) {
  const raw = String(value || "")
    .trim()
    .toLowerCase();
  if (raw === "minute" || raw === "min") {
    return {
      key: "minute",
      expr: "strftime('%Y-%m-%dT%H:%M:00Z', __ts__)",
    };
  }
  if (raw === "quarter_hour" || raw === "quarter-hour" || raw === "quarter" || raw === "15min" || raw === "15m") {
    return {
      key: "quarter_hour",
      expr: "substr(__ts__, 1, 14) || printf('%02d:00Z', CAST(CAST(substr(__ts__, 15, 2) AS INTEGER) / 15 AS INTEGER) * 15)",
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

function normalizeComponent(value) {
  const raw = String(value || "").trim();
  return raw ? raw.slice(0, 120) : "http";
}

function toSafeNumber(value, { min = 0, max = Number.MAX_SAFE_INTEGER } = {}) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return 0;
  return Math.max(min, Math.min(max, parsed));
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
  const durationMs = normalizeTrafficDurationMs(payload.durationMs || row.duration_ms || 0);
  const bytesIn = normalizeTrafficBytes(payload.bytesIn || row.bytes_in || 0);
  const bytesOut = normalizeTrafficBytes(payload.bytesOut || row.bytes_out || 0);
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
  const durationMs = normalizeTrafficDurationMs(sample?.durationMs || sample?.duration || 0);
  const bytesIn = normalizeTrafficBytes(sample?.bytesIn || sample?.requestBytes || 0);
  const bytesOut = normalizeTrafficBytes(sample?.bytesOut || sample?.responseBytes || 0);
  const safeOccurredAt = toIso(sample?.occurredAt || sample?.at || occurredAt, new Date().toISOString());
  const isNadeoOutgoing = direction === "outgoing" && isNadeoTargetHost(targetHost);
  const isInternalOutgoing = direction === "outgoing" && isPrivateOrLocalTargetHost(targetHost);
  const statusGroup = statusCode >= 500 ? "5xx" : statusCode >= 400 ? "4xx" : statusCode >= 300 ? "3xx" : "2xx";

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
    durationMs: normalizeTrafficDurationMs(row?.durationMs || 0),
    bytesIn: normalizeTrafficBytes(row?.bytesIn || 0),
    bytesOut: normalizeTrafficBytes(row?.bytesOut || 0),
    occurredAt: toIso(row?.occurredAt || "", new Date().toISOString()),
    isNadeoOutgoing: Boolean(Number(row?.isNadeoOutgoing || 0)),
    isInternalOutgoing: Boolean(Number(row?.isInternalOutgoing || 0)),
  };
}

export {
  parseBucket,
  normalizeWindowHours,
  normalizeTrafficDirection,
  normalizeHttpMethod,
  normalizeHttpPath,
  normalizeComponent,
  normalizeTrafficStatusCode,
  toSafeNumber,
  normalizeHost,
  isNadeoTargetHost,
  isPrivateOrLocalTargetHost,
  toTrafficBucket,
  parseTrafficRow,
  normalizeTrafficSample,
  mapTrafficSampleDbRow,
};
