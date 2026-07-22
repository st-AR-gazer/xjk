import { toText } from "../../shared/valueUtils.js";

const PUBLIC_TRACKS = ["replay", "deep"];
const PUBLIC_STATUSES = new Set(["pass", "fail", "pending", "unavailable", "not_run"]);
const PUBLIC_REASON_CODES = new Set([
  "verified",
  "failed_verification",
  "awaiting_processing",
  "manual_review",
  "artifacts_missing",
  "unsupported",
  "service_error",
  "not_run",
  "unknown",
]);

const UNAVAILABLE_REASON_CODES = new Set(["MISSING_ARTIFACT", "UNSUPPORTED_VERSION", "RUNTIME_FAILURE"]);

const PENDING_STATES = new Set(["queued", "running"]);

const PRIVATE_TRACKS = new Map([
  ["replay", "replay"],
  ["replay_validation", "replay"],
  ["deep", "deep"],
  ["runtime_validation", "deep"],
  ["full_playback", "deep"],
]);

const VERDICT_COLLECTION_KEYS = ["verdicts", "items", "results", "records"];
const VERDICT_CONTAINER_KEYS = ["data", "record", "map"];
const MAX_VERDICT_ENVELOPE_DEPTH = 6;

function toNullableText(value) {
  const text = toText(value);
  return text || null;
}

function toNullableInt(value) {
  if (value === undefined || value === null) return null;
  if (typeof value !== "number" && typeof value !== "string") return null;
  if (typeof value === "string" && !value.trim()) return null;
  const number = Number(value);
  return Number.isInteger(number) ? number : null;
}

function toIsoOrNull(value) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function compareIsoDesc(left, right) {
  const leftTime = left ? Date.parse(left) : 0;
  const rightTime = right ? Date.parse(right) : 0;
  return rightTime - leftTime;
}

function maxIso(...values) {
  const sorted = values.map(toIsoOrNull).filter(Boolean).sort(compareIsoDesc);
  return sorted[0] || null;
}

function isObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function ownValue(value, keys) {
  if (!isObject(value)) return undefined;
  for (const key of keys) {
    if (Object.prototype.hasOwnProperty.call(value, key)) {
      return value[key];
    }
  }
  return undefined;
}

function resolveTrackKey(rawTrack) {
  const normalized = toText(rawTrack).toLowerCase();
  return PRIVATE_TRACKS.get(normalized) || null;
}

function contextFromObject(value) {
  return {
    recordId: toNullableText(ownValue(value, ["record_id", "recordId"])),
    mapUid: toNullableText(ownValue(value, ["map_uid", "mapUid", "uid"])),
    rank: toNullableInt(ownValue(value, ["rank"])),
  };
}

function mergeContext(parent, current) {
  return {
    recordId: current.recordId ?? parent.recordId ?? null,
    mapUid: current.mapUid ?? parent.mapUid ?? null,
    rank: current.rank ?? parent.rank ?? null,
  };
}

function normalizeVerdictDto(raw, inheritedContext) {
  if (!isObject(raw)) return null;
  const track = resolveTrackKey(ownValue(raw, ["validation_track", "validationTrack"]));
  if (!track) return null;

  const context = mergeContext(inheritedContext, contextFromObject(raw));
  return {
    record_id: context.recordId,
    map_uid: context.mapUid,
    rank: context.rank,
    validation_track: track,
    state: toNullableText(ownValue(raw, ["state"])),
    verdict: toNullableText(ownValue(raw, ["verdict"])),
    public_reason_code: toNullableText(ownValue(raw, ["public_reason_code", "publicReasonCode"])),
    validated_at: ownValue(raw, ["validated_at", "validatedAt"]),
    checked_at: ownValue(raw, ["checked_at", "checkedAt"]),
    updated_at: ownValue(raw, ["updated_at", "updatedAt"]),
    confidence_bucket: toNullableText(ownValue(raw, ["confidence_bucket", "confidenceBucket"])),
    policy_version: toNullableText(ownValue(raw, ["policy_version", "policyVersion"])),
  };
}

function collectVerdictDtos(value, inheritedContext, output, seen, depth = 0) {
  if (depth > MAX_VERDICT_ENVELOPE_DEPTH || !value || typeof value !== "object" || seen.has(value)) return;
  seen.add(value);

  if (Array.isArray(value)) {
    for (const item of value) {
      collectVerdictDtos(item, inheritedContext, output, seen, depth + 1);
    }
    return;
  }

  const context = mergeContext(inheritedContext, contextFromObject(value));
  const verdict = normalizeVerdictDto(value, context);
  if (verdict) {
    output.push(verdict);
    return;
  }

  for (const key of VERDICT_CONTAINER_KEYS) {
    if (Object.prototype.hasOwnProperty.call(value, key)) {
      collectVerdictDtos(value[key], context, output, seen, depth + 1);
    }
  }
  for (const key of VERDICT_COLLECTION_KEYS) {
    if (Object.prototype.hasOwnProperty.call(value, key)) {
      collectVerdictDtos(value[key], context, output, seen, depth + 1);
    }
  }
}

function payloadContext(payload) {
  if (!isObject(payload)) return { recordId: null, mapUid: null, rank: null };

  let context = contextFromObject(payload);
  const data = isObject(payload.data) ? payload.data : null;
  if (data) context = mergeContext(context, contextFromObject(data));

  for (const container of [payload.record, payload.map, data?.record, data?.map]) {
    if (isObject(container)) {
      context = mergeContext(context, contextFromObject(container));
    }
  }
  return context;
}

function adaptVerdictPayload(payload) {
  const context = payloadContext(payload);
  const verdicts = [];
  collectVerdictDtos(payload, context, verdicts, new Set());
  return { context, verdicts };
}

function extractVerdictItems(payload) {
  return adaptVerdictPayload(payload).verdicts;
}

function normalizeConfidence(rawValue) {
  const normalized = toText(rawValue).toUpperCase();
  if (normalized === "HIGH") return "high";
  if (normalized === "MEDIUM") return "medium";
  if (normalized === "LOW") return "low";
  return null;
}

function resolveStatus(raw) {
  const state = toText(raw?.state).toLowerCase();
  const verdict = toText(raw?.verdict).toUpperCase();
  const reasonCode = toText(raw?.public_reason_code ?? raw?.publicReasonCode).toUpperCase();

  if (PENDING_STATES.has(state) || verdict === "INCONCLUSIVE") {
    return "pending";
  }

  if (verdict === "VALID") {
    return "pass";
  }

  if (verdict === "INVALID") {
    return "fail";
  }

  if (UNAVAILABLE_REASON_CODES.has(reasonCode)) {
    return "unavailable";
  }

  if (state || verdict || reasonCode) {
    return "unavailable";
  }

  return "not_run";
}

function normalizeReasonCode(raw, status) {
  const state = toText(raw?.state).toLowerCase();
  const verdict = toText(raw?.verdict).toUpperCase();
  const rawReasonCode = toText(raw?.public_reason_code ?? raw?.publicReasonCode);
  const approvedReasonCode = rawReasonCode.toLowerCase();

  if (PUBLIC_REASON_CODES.has(approvedReasonCode)) {
    return approvedReasonCode;
  }

  if (status === "not_run") {
    return "not_run";
  }

  if (PENDING_STATES.has(state)) {
    return "awaiting_processing";
  }

  if (verdict === "INCONCLUSIVE") {
    return "manual_review";
  }

  if (verdict === "VALID") {
    return "verified";
  }

  if (verdict === "INVALID") {
    return "failed_verification";
  }

  const normalizedRawReason = rawReasonCode.toUpperCase();
  if (normalizedRawReason === "MISSING_ARTIFACT") {
    return "artifacts_missing";
  }
  if (normalizedRawReason === "UNSUPPORTED_VERSION") {
    return "unsupported";
  }
  if (normalizedRawReason === "RUNTIME_FAILURE") {
    return "service_error";
  }

  if (status === "unavailable") {
    return "unknown";
  }

  return null;
}

function createNotRunVerification(track) {
  return {
    track,
    status: "not_run",
    checked_at: null,
    confidence: null,
    reason_code: "not_run",
    policy_version: null,
    updated_at: null,
  };
}

function createVerificationSummary({
  track,
  status,
  checkedAt = null,
  confidence = null,
  reasonCode = null,
  policyVersion = null,
  updatedAt = null,
}) {
  return {
    track,
    status: PUBLIC_STATUSES.has(status) ? status : "unavailable",
    checked_at: toIsoOrNull(checkedAt),
    confidence: normalizeConfidence(confidence) || confidence || null,
    reason_code: reasonCode || null,
    policy_version: toNullableText(policyVersion),
    updated_at: toIsoOrNull(updatedAt),
  };
}

function normalizeVerificationSummary(raw, track) {
  const status = resolveStatus(raw);
  const checkedAt = maxIso(raw?.validated_at, raw?.checked_at, raw?.updated_at);
  const updatedAt = maxIso(raw?.updated_at, checkedAt);

  return {
    track,
    status: PUBLIC_STATUSES.has(status) ? status : "unavailable",
    checked_at: checkedAt,
    confidence: normalizeConfidence(raw?.confidence_bucket),
    reason_code: normalizeReasonCode(raw, status),
    policy_version: toNullableText(raw?.policy_version),
    updated_at: updatedAt,
  };
}

function contextForRequest(context, requestedId, idType) {
  return {
    recordId: context.recordId || (idType === "record" ? toNullableText(requestedId) : null),
    mapUid: context.mapUid || (idType === "map" ? toNullableText(requestedId) : null),
    rank: context.rank,
  };
}

function chooseLatestRecord(sourceItems, track) {
  let latest = null;
  for (const item of sourceItems) {
    if (item?.validation_track !== track) continue;
    if (!latest) {
      latest = item;
      continue;
    }
    const latestUpdatedAt = maxIso(latest?.updated_at, latest?.validated_at);
    const candidateUpdatedAt = maxIso(item?.updated_at, item?.validated_at);
    if (compareIsoDesc(latestUpdatedAt, candidateUpdatedAt) > 0) {
      latest = item;
    }
  }
  return latest;
}

function filterTracks(trackMode = "all") {
  if (trackMode === "replay") return ["replay"];
  if (trackMode === "deep") return ["deep"];
  return [...PUBLIC_TRACKS];
}

function buildRecordBundle({ recordId, mapUid, rank, tracksByKey, trackMode = "all" }) {
  const selectedTracks = filterTracks(trackMode);
  const verifications = selectedTracks.map((track) => tracksByKey[track] || createNotRunVerification(track));
  return {
    record_id: recordId,
    map_uid: mapUid,
    rank,
    updated_at: maxIso(...verifications.map((item) => item.updated_at || item.checked_at)),
    verifications,
  };
}

function sortRecordBundles(left, right) {
  const leftRank = Number.isInteger(left.rank) ? left.rank : Number.MAX_SAFE_INTEGER;
  const rightRank = Number.isInteger(right.rank) ? right.rank : Number.MAX_SAFE_INTEGER;
  if (leftRank !== rightRank) return leftRank - rightRank;

  const timeCompare = compareIsoDesc(left.updated_at, right.updated_at);
  if (timeCompare !== 0) return timeCompare;

  return String(left.record_id || "").localeCompare(String(right.record_id || ""));
}

function normalizeRecordBundle(payload, requestedRecordId, options = {}) {
  const trackMode = options.track || "all";
  const adapted = adaptVerdictPayload(payload);
  const context = contextForRequest(adapted.context, requestedRecordId, "record");
  const verdictItems = adapted.verdicts;

  let recordId = context.recordId || toText(requestedRecordId);
  let mapUid = context.mapUid;
  let rank = context.rank;
  const tracksByKey = {};

  for (const track of PUBLIC_TRACKS) {
    const latestItem = chooseLatestRecord(verdictItems, track);
    if (!latestItem) {
      tracksByKey[track] = createNotRunVerification(track);
      continue;
    }

    tracksByKey[track] = normalizeVerificationSummary(latestItem, track);
    recordId = recordId || toText(latestItem.record_id);
    mapUid = mapUid || toNullableText(latestItem.map_uid);
    rank = rank ?? toNullableInt(latestItem.rank);
  }

  return buildRecordBundle({
    recordId: recordId || toText(requestedRecordId),
    mapUid,
    rank,
    tracksByKey,
    trackMode,
  });
}

function normalizeMapVerdictList(payload, requestedMapUid, requestedTrack, _options = {}) {
  const track = requestedTrack || "replay";
  const adapted = adaptVerdictPayload(payload);
  const context = contextForRequest(adapted.context, requestedMapUid, "map");
  const verdictItems = adapted.verdicts;
  const bundlesByRecordId = new Map();

  for (const item of verdictItems) {
    if (item.validation_track !== track) continue;
    const recordId = toText(item.record_id);
    if (!recordId) continue;

    const summary = normalizeVerificationSummary(item, track);
    const existing = bundlesByRecordId.get(recordId) || {
      record_id: recordId,
      map_uid: toNullableText(item.map_uid) || context.mapUid || toText(requestedMapUid),
      rank: toNullableInt(item.rank),
      updated_at: null,
      verifications: [],
    };

    existing.map_uid = existing.map_uid || toNullableText(item.map_uid) || context.mapUid;
    existing.rank = existing.rank ?? toNullableInt(item.rank);
    existing.verifications = [summary];
    existing.updated_at = maxIso(existing.updated_at, summary.updated_at, summary.checked_at);
    bundlesByRecordId.set(recordId, existing);
  }

  const items = [...bundlesByRecordId.values()].sort(sortRecordBundles);

  return {
    map_uid: context.mapUid || toText(requestedMapUid),
    track,
    items,
  };
}

function filterRecordBundleByTrack(bundle, trackMode = "all") {
  if (!bundle || !isObject(bundle)) return bundle;
  const selectedTracks = filterTracks(trackMode);
  const verifications = (Array.isArray(bundle.verifications) ? bundle.verifications : []).filter((item) =>
    selectedTracks.includes(item.track)
  );
  return {
    record_id: bundle.record_id,
    map_uid: bundle.map_uid ?? null,
    rank: bundle.rank ?? null,
    updated_at: maxIso(...verifications.map((item) => item.updated_at || item.checked_at)),
    verifications,
  };
}

function bundleFromSubmission(submission, trackMode = "all") {
  const updatedAt = toIsoOrNull(submission?.updated_at ?? submission?.created_at) || new Date().toISOString();
  const bundle = {
    record_id: toText(submission?.record_id),
    map_uid: toNullableText(submission?.map_uid),
    rank: toNullableInt(submission?.rank),
    updated_at: updatedAt,
    verifications: [
      createVerificationSummary({
        track: "replay",
        status: "pending",
        checkedAt: null,
        confidence: null,
        reasonCode: "awaiting_processing",
        policyVersion: null,
        updatedAt,
      }),
      createNotRunVerification("deep"),
    ],
  };
  return filterRecordBundleByTrack(bundle, trackMode);
}

function overlayRecordBundleWithSubmission(bundle, submission) {
  if (!submission) {
    return bundle;
  }

  if (!bundle || !isObject(bundle)) {
    return bundleFromSubmission(submission, "all");
  }

  const replayOverlay = bundleFromSubmission(submission, "replay");
  const replaySummary = Array.isArray(bundle.verifications)
    ? bundle.verifications.find((item) => item?.track === "replay")
    : null;

  if (replaySummary && replaySummary.status !== "not_run") {
    return bundle;
  }

  const existingByTrack = new Map();
  for (const item of Array.isArray(bundle.verifications) ? bundle.verifications : []) {
    if (item?.track) {
      existingByTrack.set(item.track, item);
    }
  }

  for (const item of replayOverlay.verifications || []) {
    existingByTrack.set(item.track, item);
  }

  if (!existingByTrack.has("deep")) {
    existingByTrack.set("deep", createNotRunVerification("deep"));
  }

  return {
    record_id: bundle.record_id || replayOverlay.record_id,
    map_uid: bundle.map_uid ?? replayOverlay.map_uid ?? null,
    rank: bundle.rank ?? replayOverlay.rank ?? null,
    updated_at: maxIso(bundle.updated_at, replayOverlay.updated_at),
    verifications: PUBLIC_TRACKS.map((track) => existingByTrack.get(track) || createNotRunVerification(track)),
  };
}

function mergeMapPayloadWithPendingSubmissions(payload, submissions, options = {}) {
  const track = options.track || payload?.track || "replay";
  const bundlesByRecordId = new Map();

  for (const item of Array.isArray(payload?.items) ? payload.items : []) {
    const recordId = toText(item?.record_id);
    if (!recordId) continue;
    bundlesByRecordId.set(recordId, item);
  }

  for (const submission of submissions || []) {
    const bundle = filterRecordBundleByTrack(bundleFromSubmission(submission, "all"), track);
    const recordId = toText(bundle?.record_id);
    if (!recordId || bundlesByRecordId.has(recordId)) continue;
    bundlesByRecordId.set(recordId, bundle);
  }

  return {
    map_uid: payload?.map_uid || toText(submissions?.[0]?.map_uid),
    track,
    items: [...bundlesByRecordId.values()].sort(sortRecordBundles),
  };
}

function statusForTrack(bundle, track) {
  const verification = Array.isArray(bundle?.verifications) ? bundle.verifications[0] || null : null;
  if (verification?.track === track) {
    return verification.status || "not_run";
  }
  return "not_run";
}

function compareMapItems(left, right, track, sortMode = "rank_asc") {
  if (sortMode === "record_asc") {
    return String(left.record_id || "").localeCompare(String(right.record_id || ""));
  }

  if (sortMode === "updated_desc") {
    const leftTime = Date.parse(left.updated_at || "") || 0;
    const rightTime = Date.parse(right.updated_at || "") || 0;
    if (leftTime !== rightTime) {
      return rightTime - leftTime;
    }
  }

  const leftRank = Number.isInteger(left.rank) ? left.rank : Number.MAX_SAFE_INTEGER;
  const rightRank = Number.isInteger(right.rank) ? right.rank : Number.MAX_SAFE_INTEGER;

  if (sortMode === "rank_desc") {
    if (leftRank !== rightRank) return rightRank - leftRank;
  } else if (leftRank !== rightRank) {
    return leftRank - rightRank;
  }

  const leftStatus = statusForTrack(left, track);
  const rightStatus = statusForTrack(right, track);
  if (leftStatus !== rightStatus) {
    return String(leftStatus).localeCompare(String(rightStatus));
  }

  return String(left.record_id || "").localeCompare(String(right.record_id || ""));
}

function countStatuses(items, track) {
  const counts = {
    pass: 0,
    fail: 0,
    pending: 0,
    unavailable: 0,
    not_run: 0,
  };

  for (const item of items || []) {
    const status = statusForTrack(item, track);
    if (Object.prototype.hasOwnProperty.call(counts, status)) {
      counts[status] += 1;
    }
  }

  return counts;
}

function latestMapUpdate(items) {
  return maxIso(...(items || []).map((item) => item?.updated_at || null));
}

function paginateMapPayload(payload, options = {}) {
  const track = options.track || payload?.track || "replay";
  const sort = toText(options.sort).toLowerCase() || "rank_asc";
  const status = toText(options.status).toLowerCase() || "all";
  const limit = Math.max(1, Number(options.limit) || 100);
  const page = Math.max(1, Number(options.page) || 1);
  const allItems = Array.isArray(payload?.items) ? payload.items : [];
  const counts = countStatuses(allItems, track);

  const filteredItems =
    status === "all" ? [...allItems] : allItems.filter((item) => statusForTrack(item, track) === status);

  filteredItems.sort((left, right) => compareMapItems(left, right, track, sort));

  const pageCount = Math.max(1, Math.ceil(filteredItems.length / limit));
  const safePage = Math.min(page, pageCount);
  const startIndex = (safePage - 1) * limit;
  const items = filteredItems.slice(startIndex, startIndex + limit);

  return {
    map_uid: payload?.map_uid || null,
    track,
    sort,
    status,
    page: safePage,
    limit,
    total_items: allItems.length,
    filtered_items: filteredItems.length,
    page_count: pageCount,
    latest_update: latestMapUpdate(allItems),
    counts,
    items,
  };
}

export {
  PUBLIC_TRACKS,
  bundleFromSubmission,
  extractVerdictItems,
  filterRecordBundleByTrack,
  mergeMapPayloadWithPendingSubmissions,
  normalizeMapVerdictList,
  normalizeRecordBundle,
  overlayRecordBundleWithSubmission,
  paginateMapPayload,
};
