import {
  clampInt,
  parseDelimitedTextValues as parseAccountIds,
  parseOptionalBoolean,
  toText,
} from "../../../../shared/valueUtils.js";

function parseIntegerValues(value) {
  const rawValues = Array.isArray(value) ? value : typeof value === "string" ? value.split(/[\s,;]+/) : [];
  return rawValues
    .map((item) => Number(item))
    .filter((item) => Number.isFinite(item))
    .map((item) => Math.floor(item));
}

function parseStringValues(value, { splitPattern = /[\r\n,;]+/ } = {}) {
  const rawValues = Array.isArray(value) ? value : typeof value === "string" ? value.split(splitPattern) : [];
  return [...new Set(rawValues.map((item) => String(item || "").trim()).filter(Boolean))];
}

function parseSimilarityWeightProfile(value) {
  const raw = value && typeof value === "object" ? value : {};
  return {
    final: raw.final && typeof raw.final === "object" ? raw.final : {},
    weightedPlacement: raw.weightedPlacement && typeof raw.weightedPlacement === "object" ? raw.weightedPlacement : {},
    relationalFallback:
      raw.relationalFallback && typeof raw.relationalFallback === "object" ? raw.relationalFallback : {},
    nameSupport: raw.nameSupport,
    regexOnly:
      parseOptionalBoolean(raw.regexOnly ?? raw.preferRegexOnly ?? raw.onlyAcceptRegex) === undefined
        ? undefined
        : Boolean(parseOptionalBoolean(raw.regexOnly ?? raw.preferRegexOnly ?? raw.onlyAcceptRegex)),
    regexOverwriteWeights:
      parseOptionalBoolean(raw.regexOverwriteWeights ?? raw.overwriteWeights) === undefined
        ? undefined
        : Boolean(parseOptionalBoolean(raw.regexOverwriteWeights ?? raw.overwriteWeights)),
    selectedRegexPresets: parseStringValues(raw.selectedRegexPresets ?? raw.regexPresets),
    customRegexPatterns: parseStringValues(raw.customRegexPatterns ?? raw.regexPatterns),
  };
}

function parseOptionalClubId(value) {
  if (value === undefined) return undefined;
  if (value === null || value === "") return null;
  return clampInt(value, { min: 1, max: 2147483647, fallback: 0 }) || null;
}

function resolveNamingSimilarityClubId({ requestedMapUids = [], requestedClubId = undefined, query = "" } = {}) {
  if (requestedMapUids.length || toText(query)) return requestedClubId;
  if (requestedClubId !== undefined) return requestedClubId;
  return null;
}

function normalizeIso(value) {
  const parsed = Date.parse(value || "");
  return Number.isFinite(parsed) ? new Date(parsed).toISOString() : null;
}

function resolveCursorOffset(cursor, fallback = 0) {
  if (cursor === undefined || cursor === null || cursor === "") return fallback;
  return clampInt(cursor, { min: 0, max: 2000000, fallback });
}

function createAction(key, label, tone = "lite") {
  return { key, label, tone };
}

function deriveJobState({ configured = true, enabled = true, running = false, error = null, successAt = null } = {}) {
  if (!configured) return "blocked";
  if (error) return "failed";
  if (running) return "running";
  if (!enabled) return "warning";
  if (successAt) return "success";
  return "idle";
}

function buildEvent({
  id,
  kind,
  title,
  subtitle = "",
  createdAt = null,
  mapUid = null,
  jobKey = null,
  status = "info",
  summary = "",
  detail = null,
  meta = {},
} = {}) {
  return {
    id: toText(id) || `${kind}:${title}:${createdAt || "na"}`,
    kind,
    title,
    subtitle,
    createdAt: normalizeIso(createdAt),
    mapUid: toText(mapUid) || null,
    jobKey: toText(jobKey) || null,
    status,
    summary,
    detail: detail ? String(detail) : null,
    meta: meta && typeof meta === "object" ? meta : {},
  };
}

function sortEvents(items = []) {
  return [...items].sort((a, b) => {
    const left = Date.parse(a?.createdAt || "") || 0;
    const right = Date.parse(b?.createdAt || "") || 0;
    return right - left;
  });
}

function summarizeHookRun(run) {
  if (!run) return "No full sync has completed yet.";
  return `${Number(run.campaignsSeen || 0)} campaigns | ${Number(run.mapsSeen || 0)} maps | +${Number(run.mapsInserted || 0)} inserted | ~${Number(run.mapsUpdated || 0)} updated`;
}

function summarizeDiscovery(monitor = {}) {
  const summary = monitor.lastDiscoverySummary || null;
  if (!summary) return "No discovery sync has completed yet.";
  return `${Number(summary.newCampaignsStored || 0)} new campaigns | ${Number(summary.uploadBucketsSeen || 0)} upload buckets`;
}

function summarizeTrackerRun(trackerStatus = {}, trackerRuns = []) {
  const latest = trackerStatus?.latestRun || trackerRuns[0] || null;
  if (!latest) return "No tracker run has completed yet.";
  return `${Number(latest.mapsChecked || 0)} maps checked | ${Number(latest.wrChanges || 0)} WR changes`;
}

function summarizeDisplayname(mapperNameSync = {}) {
  const summary = mapperNameSync.lastSummary || null;
  if (!summary) return "No display-name sync has completed yet.";
  if (summary.error) return summary.error;
  return `${Number(summary.batchSize || 0)} accounts processed | ${Number(summary.resolved || 0)} resolved | ${Number(summary.accepted || 0)} accepted`;
}

function buildJobHistoryItem({
  id,
  state,
  startedAt = null,
  finishedAt = null,
  durationMs = null,
  summary = "",
  detail = null,
  meta = {},
} = {}) {
  return {
    id: toText(id) || `history:${state}:${finishedAt || startedAt || "na"}`,
    state,
    startedAt: normalizeIso(startedAt),
    finishedAt: normalizeIso(finishedAt),
    durationMs: Number.isFinite(Number(durationMs)) ? Number(durationMs) : null,
    summary,
    detail,
    meta,
  };
}

export {
  buildEvent,
  buildJobHistoryItem,
  clampInt,
  createAction,
  deriveJobState,
  normalizeIso,
  parseAccountIds,
  parseIntegerValues,
  parseOptionalBoolean,
  parseOptionalClubId,
  parseSimilarityWeightProfile,
  resolveCursorOffset,
  resolveNamingSimilarityClubId,
  sortEvents,
  summarizeDiscovery,
  summarizeDisplayname,
  summarizeHookRun,
  summarizeTrackerRun,
  toText,
};
