import { parseJsonSafe as tryParseJson } from "../../../../shared/valueUtils.js";

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

export { toDbNumber, toDbInt, parseJsonObject, secondsBetweenIso, mapIngestRunDbRow };
