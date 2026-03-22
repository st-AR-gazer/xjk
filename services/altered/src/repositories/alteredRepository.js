import {
  hasResolvedDisplayName,
  sanitizeResolvedDisplayName,
} from "../../../shared/displayNameResolution.js";
import {
  deriveParserWarning,
  parseCampaignStandardizedFields,
} from "../services/mapNameStandardizer.js";

const DEFAULT_HOOK_KEY = "altered-club";
const ALTERATION_VALUE_SEPARATOR = "\u001f";
const OVERSIZED_SIGNATURE_JSON_MAX_BYTES = 1_000_000;
const OVERSIZED_SIGNATURE_FALLBACK_VERSION = "oversized-signature-fallback-v1";
const EXCLUDE_NONCANONICAL_WEEKLY_SHORTS_SQL = `
  AND NOT (
    LOWER(COALESCE(json_extract(c.payload_json, '$.sourceKey'), json_extract(c.payload_json, '$.source_key'), '')) = 'weekly-shorts'
    AND COALESCE(
      json_extract(c.payload_json, '$.weeklyShorts.isCanonicalNadeoWeek'),
      json_extract(c.payload_json, '$.weekly_shorts.isCanonicalNadeoWeek'),
      0
    ) = 0
  )
`;

function clampInt(value, { min = 0, max = Number.MAX_SAFE_INTEGER, fallback = min } = {}) {
  if (value === undefined || value === null) return fallback;
  if (typeof value === "string" && !value.trim()) return fallback;
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(min, Math.min(max, Math.floor(parsed)));
}

function normalizeCampaignSlotValue({ slot, order, position, fallbackSlot = 1, max = 999 } = {}) {
  const safeFallback = clampInt(fallbackSlot, { min: 1, max, fallback: 1 });
  const directSlot = clampInt(slot, { min: 1, max, fallback: 0 });
  if (directSlot) return directSlot;
  for (const rawValue of [order, position]) {
    if (rawValue === undefined || rawValue === null || rawValue === "") continue;
    const parsed = Number(rawValue);
    if (!Number.isFinite(parsed)) continue;
    return clampInt(parsed + 1, { min: 1, max, fallback: safeFallback });
  }
  return safeFallback;
}

function toText(value, fallback = "") {
  return String(value ?? fallback).trim();
}

function truncateText(value, maxLength = 255) {
  const text = toText(value);
  if (!text || text.length <= maxLength) return text;
  if (maxLength <= 3) return text.slice(0, maxLength);
  return `${text.slice(0, maxLength - 3)}...`;
}

function normalizeStatus(value, fallback = "live") {
  const status = String(value || "").trim().toLowerCase();
  if (status === "live" || status === "paused" || status === "archived") return status;
  return fallback;
}

function normalizeScheduleMode(value, fallback = "interval") {
  const mode = String(value || "").trim().toLowerCase();
  if (mode === "daily" || mode === "interval") return mode;
  return fallback;
}

function normalizeAccountId(value) {
  const accountId = String(value || "").trim().toLowerCase();
  if (!accountId) return "";
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(accountId)) {
    return accountId;
  }
  return "";
}

function normalizeLooseId(value) {
  const id = String(value || "").trim().toLowerCase();
  if (!id) return "";
  return normalizeAccountId(id) || id;
}

function firstTruthy(values = []) {
  for (const value of values) {
    if (value === undefined || value === null) continue;
    const text = String(value).trim();
    if (text) return text;
  }
  return "";
}

function uniqueTexts(values = []) {
  const out = [];
  const seen = new Set();
  for (const value of Array.isArray(values) ? values : []) {
    const text = toText(value);
    const key = text.toLowerCase();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(text);
  }
  return out;
}

function boolFromAny(value) {
  if (typeof value === "boolean") return value;
  if (value === undefined || value === null || value === "") return false;
  const raw = String(value).trim().toLowerCase();
  return (
    raw === "1" ||
    raw === "true" ||
    raw === "yes" ||
    raw === "on" ||
    raw === "admin" ||
    raw === "vip" ||
    raw === "creator"
  );
}

function uniqueBy(items, makeKey) {
  const out = [];
  const seen = new Set();
  for (const item of items) {
    const key = String(makeKey(item));
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(item);
  }
  return out;
}

function slugifyText(value, fallback = "") {
  const normalized = toText(value)
    .normalize("NFKD")
    .replace(/[^\x00-\x7F]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return normalized || toText(fallback) || "item";
}

function splitGroupedValues(value, separator = ALTERATION_VALUE_SEPARATOR) {
  return String(value || "")
    .split(separator)
    .map((item) => toText(item))
    .filter(Boolean);
}

function extractRowAlterations(row = {}) {
  const preset = Array.isArray(row?.alterations) ? row.alterations : [];
  if (preset.length) {
    return uniqueBy(
      preset
        .map((item) => ({
          id: Number(item?.id || item?.alterationId || 0) || null,
          name: toText(item?.name),
          slug: slugifyText(item?.slug || item?.name, item?.name),
        }))
        .filter((item) => item.name),
      (item) => item.slug
    );
  }

  const ids = String(
    row?.alterationIdsCsv ||
      row?.alteration_ids_csv ||
      row?.alterationIds ||
      row?.alteration_ids ||
      ""
  )
    .split(",")
    .map((item) => clampInt(item, { min: 1, max: 2147483647, fallback: 0 }) || null);
  const names = splitGroupedValues(
    row?.alterationNamesCsv || row?.alteration_names_csv || row?.alterationNames || ""
  );
  const slugs = splitGroupedValues(
    row?.alterationSlugsCsv || row?.alteration_slugs_csv || row?.alterationSlugs || ""
  );
  const total = Math.max(ids.length, names.length, slugs.length);
  const out = [];
  for (let index = 0; index < total; index += 1) {
    const name = toText(names[index]);
    if (!name) continue;
    out.push({
      id: ids[index] || null,
      name,
      slug: slugifyText(slugs[index] || name, name),
    });
  }
  return uniqueBy(out, (item) => item.slug);
}

function toIso(value, fallbackIso = new Date().toISOString()) {
  const epochMs = toEpochMs(value);
  if (!Number.isFinite(epochMs) || epochMs <= 0) return fallbackIso;
  return new Date(epochMs).toISOString();
}

function toNullableIso(value) {
  const epochMs = toEpochMs(value);
  if (!Number.isFinite(epochMs) || epochMs <= 0) return null;
  return new Date(epochMs).toISOString();
}

function toEpochMs(value) {
  if (value === undefined || value === null || value === "") return null;
  if (typeof value === "number" && Number.isFinite(value)) {
    if (value <= 0) return null;
    return Math.floor(value < 1e12 ? value * 1000 : value);
  }
  const raw = String(value).trim();
  if (!raw) return null;
  if (/^-?\d+(\.\d+)?$/.test(raw)) {
    const numeric = Number(raw);
    if (!Number.isFinite(numeric) || numeric <= 0) return null;
    return Math.floor(numeric < 1e12 ? numeric * 1000 : numeric);
  }
  const parsed = Date.parse(raw);
  if (!Number.isFinite(parsed) || parsed <= 0) return null;
  return Math.floor(parsed);
}

function firstTimestamp(values = []) {
  for (const value of values) {
    const parsed = toEpochMs(value);
    if (Number.isFinite(parsed) && parsed > 0) return parsed;
  }
  return null;
}

function startOfUtcBucket(epochMs, bucket) {
  const date = new Date(epochMs);
  if (bucket === "month") {
    return Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1, 0, 0, 0, 0);
  }
  if (bucket === "week") {
    const start = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate(), 0, 0, 0, 0));
    const day = start.getUTCDay();
    const mondayOffset = (day + 6) % 7;
    start.setUTCDate(start.getUTCDate() - mondayOffset);
    return start.getTime();
  }
  return Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate(), 0, 0, 0, 0);
}

function formatBucketLabel(epochMs, bucket) {
  const iso = new Date(epochMs).toISOString();
  if (bucket === "month") return iso.slice(0, 7);
  if (bucket === "week") return `Wk of ${iso.slice(0, 10)}`;
  return iso.slice(0, 10);
}

function serializeJson(value) {
  if (value === undefined || value === null) return null;
  try {
    return JSON.stringify(value);
  } catch {
    return null;
  }
}

function parseJsonSafe(value, fallback = null) {
  const raw = String(value || "").trim();
  if (!raw) return fallback;
  try {
    return JSON.parse(raw);
  } catch {
    return fallback;
  }
}

function buildOversizedSignatureFallback({
  assetTokenCount = 0,
  printableTokenCount = 0,
  signatureJsonLength = 0,
} = {}) {
  return {
    version: OVERSIZED_SIGNATURE_FALLBACK_VERSION,
    printableSegments: Number(printableTokenCount || 0),
    assetTokenCount: Number(assetTokenCount || 0),
    uniqueAssetTokenCount: 0,
    oversized: true,
    originalBytes: Number(signatureJsonLength || 0),
    groups: {
      modelTokens: [],
      absolutePlacementTokens: [],
      relativePlacementTokens: [],
    },
    tokens: [],
  };
}

function normalizeCampaignStorageName(name, externalCampaignId = null) {
  const base = String(name || "").trim();
  if (!base) return "";
  const suffixId = clampInt(externalCampaignId, {
    min: 1,
    max: 2147483647,
    fallback: 0,
  });
  if (!suffixId) return base;
  const suffix = ` [${suffixId}]`;
  return base.endsWith(suffix) ? base : `${base}${suffix}`;
}

function rowToMap(row) {
  return {
    uid: row.uid,
    mapId: row.mapId || null,
    name: row.name,
    mapType: row.mapType || null,
    mapStyle: row.mapStyle || null,
    mapEnvironment: row.mapEnvironment || null,
    campaign: row.campaign || "Unassigned",
    campaignId: row.campaignId || null,
    campaignExternalId: row.campaignExternalId || null,
    campaignMapCount: Number(row.campaignMapCount || 0) || null,
    slot: Number(row.slot || 0),
    author: row.author || "",
    authorDisplayName: row.authorDisplayName || null,
    submitter: row.submitter || "",
    submitterDisplayName: row.submitterDisplayName || null,
    authorMs: Number(row.authorMs || 0),
    wrMs: Number(row.wrMs || 0),
    wrHolder: row.wrHolder || "-",
    wrUpdatedAt: row.wrUpdatedAt || null,
    playerCount: Number(row.playerCount || 0),
    playerCountUpdatedAt: row.playerCountUpdatedAt || null,
    goldMs: Number(row.goldMs || 0),
    silverMs: Number(row.silverMs || 0),
    bronzeMs: Number(row.bronzeMs || 0),
    laps: Number(row.laps || row.nbLaps || 1),
    tracked: Boolean(row.tracked),
    status: row.status || "live",
    checkFrequency: Number(row.checkFrequency || 0),
    lastCheckedAt: row.lastCheckedAt || null,
    mapCreatedAt: row.mapCreatedAt || null,
    mapUpdatedAt: row.mapUpdatedAt || null,
    thumbnailUrl: row.thumbnailUrl || null,
    downloadUrl: row.downloadUrl || null,
  };
}

function rowToNameCandidate(row) {
  const mapNumber = Number(row.mapNumber || 0) || null;
  const mapNumbers = parseJsonSafe(row.mapNumbersJson, []) || [];
  const similarityDetails = parseJsonSafe(row.similarityDetailsJson, null);
  const similarityCandidateMatches = (parseJsonSafe(row.similarityCandidateMatchesJson, []) || [])
    .filter((entry) => entry && typeof entry === "object")
    .slice(0, 5);
  const parserPattern = row.parserPattern || null;
  return {
    mapUid: row.mapUid,
    originalName: row.originalName || "",
    sanitizedName: row.sanitizedName || "",
    proposedName: row.proposedName || null,
    manualName: row.manualName || null,
    finalName: row.finalName || row.proposedName || row.sanitizedName || row.originalName || "",
    parserPattern,
    parserConfidence: Number(row.parserConfidence || 0),
    season: row.season || null,
    year: Number(row.year || 0) || null,
    mapNumber,
    mapNumbers: mapNumbers.length ? mapNumbers : mapNumber ? [mapNumber] : [],
    alteration: row.alterationLabel || null,
    alterationMix: parseJsonSafe(row.alterationMixJson, []) || [],
    automationState: row.automationState || "unmatched",
    reviewState: row.reviewState || "pending",
    requiresRegex: Boolean(row.requiresRegex),
    parserWarning: deriveParserWarning({
      mapName: row.originalName || row.sanitizedName || "",
      campaignName: row.campaign || "",
      parserPattern,
    }),
    reviewNote: row.reviewNote || null,
    sourceVersion: row.sourceVersion || null,
    campaign: row.campaign || "Unassigned",
    campaignId: Number(row.campaignId || 0) || null,
    slot: Number(row.slot || 0) || 0,
    tracked: Boolean(row.tracked),
    status: row.status || "live",
    localFileStatus: row.localFileStatus || null,
    localFilePath: row.localFilePath || null,
    signatureStatus: row.signatureStatus || null,
    signatureError: row.signatureError || null,
    similarityStatus: row.similarityStatus || null,
    similarityTopScore: Number(row.similarityTopScore || 0) || null,
    similarityConfidence: Number(row.similarityConfidence || 0) || null,
    similarityReferenceCampaignName: row.similarityReferenceCampaignName || null,
    similarityReferenceSlot: Number(row.similarityReferenceSlot || 0) || null,
    similarityCandidateMatches,
    similarityMatchClassification: similarityDetails?.matchClassification || null,
    similarityMatchWarning: similarityDetails?.matchWarning || null,
    similarityCloseSlotCount: Number(similarityDetails?.closeSlotCount || 0) || 0,
    similarityDetails,
    updatedAt: row.updatedAt || null,
    lastProcessedAt: row.lastProcessedAt || null,
  };
}

function rowToMapLocalFileFix(row) {
  return {
    mapUid: row.mapUid,
    relativePath: row.relativePath || null,
    sourceFilePath: row.sourceFilePath || null,
    fileSha256: row.fileSha256 || null,
    fileSizeBytes: Number(row.fileSizeBytes || 0),
    importedAt: row.importedAt || null,
    verifiedAt: row.verifiedAt || null,
    status: row.status || "missing",
    note: row.note || null,
    lastError: row.lastError || null,
    updatedAt: row.updatedAt || null,
  };
}

function inferSeasonFromName(value) {
  const name = String(value || "").toLowerCase();
  if (name.includes("winter")) return "Winter";
  if (name.includes("spring")) return "Spring";
  if (name.includes("summer")) return "Summer";
  if (name.includes("fall") || name.includes("autumn")) return "Fall";
  return "Other";
}

function inferSeasonWindowFromTimestamp(epochMs) {
  if (!Number.isFinite(epochMs) || epochMs <= 0) return null;
  const date = new Date(epochMs);
  const month = date.getUTCMonth();
  const year = date.getUTCFullYear();
  let season = "Fall";
  if (month <= 2) season = "Winter";
  else if (month <= 5) season = "Spring";
  else if (month <= 8) season = "Summer";
  return {
    season,
    year,
    label: `${season} ${year}`,
    key: `${season.toLowerCase()}-${year}`,
  };
}

function deriveCampaignOrdering(row) {
  const payload = parseJsonSafe(row?.payloadJson, {}) || {};
  const campaignPayload =
    payload?.campaign && typeof payload.campaign === "object" ? payload.campaign : {};
  const sortTimestampMs = firstTimestamp([
    campaignPayload?.publicationTimestamp,
    payload?.publicationTimestamp,
    campaignPayload?.startTimestamp,
    payload?.startTimestamp,
    campaignPayload?.creationTimestamp,
    payload?.creationTimestamp,
    row?.startTimestamp,
    row?.createdAt,
    row?.updatedAt,
  ]);
  const seasonInfo = inferSeasonWindowFromTimestamp(sortTimestampMs);
  return {
    sortTimestampMs,
    addedAt:
      (sortTimestampMs ? new Date(sortTimestampMs).toISOString() : null) ||
      toNullableIso(row?.createdAt) ||
      toNullableIso(row?.updatedAt) ||
      null,
    seasonInfo,
  };
}

function mapTrackingStatus({ tracked, status }) {
  if (tracked && String(status || "").toLowerCase() === "live") return "active";
  if (String(status || "").toLowerCase() === "paused") return "paused";
  if (tracked) return "active";
  return "idle";
}

function buildCampaignCatalogMetadata(row = {}) {
  const campaignName = toText(row?.campaignName || row?.campaign_name || row?.name);
  const parsed = parseCampaignStandardizedFields(campaignName, {
    startTimestamp: row?.startTimestamp || row?.start_timestamp || null,
  });
  const linkedAlterations = extractRowAlterations(row);
  const parsedAlterations =
    Array.isArray(parsed?.alterationMix) && parsed.alterationMix.length
      ? parsed.alterationMix
      : [parsed?.alteration || ""];
  const alterationNames = uniqueTexts([
    ...linkedAlterations.map((item) => item?.name),
    ...parsedAlterations,
  ]);
  const alterations = uniqueBy(
    alterationNames.map((name, index) => {
      const existing = linkedAlterations.find(
        (item) => String(item?.name || "").toLowerCase() === name.toLowerCase()
      );
      return {
        id: existing?.id || null,
        name: existing?.name || name,
        slug: slugifyText(existing?.slug || existing?.name || name, `alteration-${index + 1}`),
      };
    }),
    (item) => item.slug
  );

  const ordering = deriveCampaignOrdering({
    payloadJson: row?.payloadJson || row?.payload_json || null,
    startTimestamp: row?.startTimestamp || row?.start_timestamp || null,
    createdAt: row?.createdAt || row?.created_at || null,
    updatedAt: row?.updatedAt || row?.updated_at || null,
  });

  let season = parsed?.season || null;
  let seasonYear = Number(parsed?.year || 0) || null;
  let seasonLabel = null;
  let seasonKey = null;

  if (parsed?.special) {
    seasonLabel = parsed.special;
    seasonKey = slugifyText(parsed.special, "special");
  } else if (parsed?.season && parsed?.year) {
    seasonLabel = `${parsed.season} ${parsed.year}`;
    seasonKey = `${parsed.season.toLowerCase()}-${parsed.year}`;
  } else if (parsed?.season) {
    seasonLabel = parsed.season;
    seasonKey = slugifyText(parsed.season, "season");
  } else if (ordering.seasonInfo?.label) {
    season = ordering.seasonInfo.season || null;
    seasonYear = Number(ordering.seasonInfo.year || 0) || null;
    seasonLabel = ordering.seasonInfo.label || null;
    seasonKey = ordering.seasonInfo.key || null;
  }

  return {
    parsedCampaign: parsed,
    alterations,
    primaryAlteration: alterations[0] || null,
    season: season || null,
    seasonYear,
    seasonLabel,
    seasonKey,
    environment: parsed?.environment || null,
    campaignType: parsed?.type || null,
    isCatalog: Boolean(parsed?.season || parsed?.special || alterations.length),
    sortTimestampMs: Number(ordering.sortTimestampMs || 0) || 0,
    addedAt: ordering.addedAt || null,
  };
}

class AlteredRepository {
  constructor(db) {
    this.db = db;
  }

  ensureDefaultHookConfig({
    hookKey = DEFAULT_HOOK_KEY,
    clubId = 24231,
    clubName = "Altered Nadeo",
    sourceLabel = "altered-monitor",
  } = {}) {
    const existing = this.getHookConfig(hookKey);
    if (existing) return existing;
    return this.updateHookConfig({
      hookKey,
      clubId,
      clubName,
      sourceLabel,
      enabled: true,
      autoTrackNewMaps: true,
    });
  }

  ensureHookConfigs(configs = []) {
    const list = Array.isArray(configs) ? configs : [];
    const out = [];
    for (const config of list) {
      const hookKey = String(config?.hookKey || DEFAULT_HOOK_KEY).trim() || DEFAULT_HOOK_KEY;
      const existing = this.getHookConfig(hookKey);
      if (existing) {
        out.push(existing);
        continue;
      }
      const inserted = this.updateHookConfig({
        hookKey,
        clubId: config?.clubId,
        clubName: config?.clubName,
        sourceLabel: config?.sourceLabel,
        enabled: config?.enabled === undefined ? true : Boolean(config.enabled),
        autoTrackNewMaps:
          config?.autoTrackNewMaps === undefined ? true : Boolean(config.autoTrackNewMaps),
      });
      if (inserted) out.push(inserted);
    }
    return out;
  }

  getHookConfig(hookKey = DEFAULT_HOOK_KEY) {
    const row = this.db
      .prepare(
        `
        SELECT
          hook_key AS hookKey,
          club_id AS clubId,
          club_name AS clubName,
          source_label AS sourceLabel,
          enabled AS enabled,
          auto_track_new_maps AS autoTrackNewMaps,
          created_at AS createdAt,
          updated_at AS updatedAt,
          last_synced_at AS lastSyncedAt,
          last_error AS lastError
        FROM altered_hook_config
        WHERE hook_key = ?
        LIMIT 1
        `
      )
      .get(hookKey);
    if (!row) return null;
    return {
      ...row,
      enabled: Boolean(row.enabled),
      autoTrackNewMaps: Boolean(row.autoTrackNewMaps),
    };
  }

  listHookConfigs({ includeDisabled = true } = {}) {
    const whereSql = includeDisabled ? "" : "WHERE enabled = 1";
    const rows = this.db
      .prepare(
        `
        SELECT
          hook_key AS hookKey,
          club_id AS clubId,
          club_name AS clubName,
          source_label AS sourceLabel,
          enabled AS enabled,
          auto_track_new_maps AS autoTrackNewMaps,
          created_at AS createdAt,
          updated_at AS updatedAt,
          last_synced_at AS lastSyncedAt,
          last_error AS lastError
        FROM altered_hook_config
        ${whereSql}
        ORDER BY
          CASE WHEN hook_key = ? THEN 0 ELSE 1 END,
          enabled DESC,
          updated_at DESC,
          club_name COLLATE NOCASE ASC
        `
      )
      .all(DEFAULT_HOOK_KEY);
    return rows.map((row) => ({
      ...row,
      enabled: Boolean(row.enabled),
      autoTrackNewMaps: Boolean(row.autoTrackNewMaps),
    }));
  }

  updateHookConfig(options = {}) {
    const hookKey = String(options.hookKey || DEFAULT_HOOK_KEY).trim() || DEFAULT_HOOK_KEY;
    const existing = this.getHookConfig(hookKey);
    const now = new Date().toISOString();
    const hasLastSyncedAt = Object.prototype.hasOwnProperty.call(options, "lastSyncedAt");
    const hasLastError = Object.prototype.hasOwnProperty.call(options, "lastError");

    const clubId =
      options.clubId !== undefined
        ? clampInt(options.clubId, { min: 1, max: 2147483647, fallback: 0 })
        : clampInt(existing?.clubId, { min: 1, max: 2147483647, fallback: 0 });
    if (!clubId) return null;

    const clubName =
      String(options.clubName || "").trim() ||
      String(existing?.clubName || "").trim() ||
      `Club ${clubId}`;
    const sourceLabel =
      String(options.sourceLabel || "").trim() ||
      String(existing?.sourceLabel || "").trim() ||
      "altered-monitor";
    const enabled =
      options.enabled === undefined ? Boolean(existing?.enabled ?? true) : Boolean(options.enabled);
    const autoTrackNewMaps =
      options.autoTrackNewMaps === undefined
        ? Boolean(existing?.autoTrackNewMaps ?? true)
        : Boolean(options.autoTrackNewMaps);
    const lastSyncedAt = hasLastSyncedAt
      ? options.lastSyncedAt
        ? toIso(options.lastSyncedAt, now)
        : null
      : existing?.lastSyncedAt || null;
    const lastError = hasLastError
      ? options.lastError
        ? String(options.lastError)
        : null
      : existing?.lastError || null;

    this.db
      .prepare(
        `
        INSERT INTO altered_hook_config (
          hook_key, club_id, club_name, source_label, enabled, auto_track_new_maps,
          created_at, updated_at, last_synced_at, last_error
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(hook_key) DO UPDATE SET
          club_id = excluded.club_id,
          club_name = excluded.club_name,
          source_label = excluded.source_label,
          enabled = excluded.enabled,
          auto_track_new_maps = excluded.auto_track_new_maps,
          updated_at = excluded.updated_at,
          last_synced_at = excluded.last_synced_at,
          last_error = excluded.last_error
        `
      )
      .run(
        hookKey,
        clubId,
        clubName,
        sourceLabel,
        enabled ? 1 : 0,
        autoTrackNewMaps ? 1 : 0,
        existing?.createdAt || now,
        now,
        lastSyncedAt,
        lastError
      );

    return this.getHookConfig(hookKey);
  }

  getProjectSource(sourceKey = "") {
    const safeSourceKey = toText(sourceKey);
    if (!safeSourceKey) return null;
    const row = this.db
      .prepare(
        `
        SELECT
          source_key AS sourceKey,
          source_type AS sourceType,
          display_name AS displayName,
          source_label AS sourceLabel,
          enabled AS enabled,
          last_synced_at AS lastSyncedAt,
          last_error AS lastError,
          summary_json AS summaryJson,
          metadata_json AS metadataJson,
          created_at AS createdAt,
          updated_at AS updatedAt
        FROM altered_project_sources
        WHERE source_key = ?
        LIMIT 1
        `
      )
      .get(safeSourceKey);
    if (!row) return null;

    const summary = parseJsonSafe(row.summaryJson, {}) || {};
    const metadata = parseJsonSafe(row.metadataJson, {}) || {};
    let campaignCount = Number(summary.campaignCount || 0);
    let mapCount = Number(summary.mapCount || 0);
    let trackedCount = Number(summary.trackedCount || 0);
    const campaignType = toText(metadata.campaignType);
    if (campaignType) {
      const aggregate = this.db
        .prepare(
          `
          SELECT
            COUNT(DISTINCT c.campaign_id) AS campaignCount,
            COUNT(DISTINCT p.map_uid) AS mapCount,
            SUM(CASE WHEN m.tracked = 1 THEN 1 ELSE 0 END) AS trackedCount
          FROM altered_campaigns c
          LEFT JOIN altered_map_positions p ON p.campaign_id = c.campaign_id
          LEFT JOIN altered_maps m ON m.map_uid = p.map_uid
          WHERE LOWER(COALESCE(c.campaign_type, '')) = LOWER(?)
          `
        )
        .get(campaignType);
      campaignCount = Number(aggregate?.campaignCount || campaignCount || 0);
      mapCount = Number(aggregate?.mapCount || mapCount || 0);
      trackedCount = Number(aggregate?.trackedCount || trackedCount || 0);
    }

    return {
      sourceKey: row.sourceKey,
      sourceType: row.sourceType || "special",
      displayName: row.displayName || row.sourceKey,
      sourceLabel: row.sourceLabel || row.sourceKey,
      enabled: Boolean(row.enabled),
      lastSyncedAt: row.lastSyncedAt || null,
      lastError: row.lastError || null,
      summary: summary && typeof summary === "object" ? summary : {},
      metadata: metadata && typeof metadata === "object" ? metadata : {},
      createdAt: row.createdAt || null,
      updatedAt: row.updatedAt || null,
      campaignCount,
      mapCount,
      trackedCount,
    };
  }

  listProjectSources({ includeDisabled = true } = {}) {
    const whereSql = includeDisabled ? "" : "WHERE enabled = 1";
    const rows = this.db
      .prepare(
        `
        SELECT source_key AS sourceKey
        FROM altered_project_sources
        ${whereSql}
        ORDER BY enabled DESC, updated_at DESC, display_name COLLATE NOCASE ASC
        `
      )
      .all();
    return rows
      .map((row) => this.getProjectSource(row.sourceKey))
      .filter(Boolean);
  }

  upsertProjectSource({
    sourceKey,
    sourceType = "special",
    displayName = "",
    sourceLabel = "",
    enabled = true,
    lastSyncedAt = undefined,
    lastError = undefined,
    summary = undefined,
    metadata = undefined,
  } = {}) {
    const safeSourceKey = toText(sourceKey);
    if (!safeSourceKey) return null;
    const existing = this.getProjectSource(safeSourceKey);
    const now = new Date().toISOString();
    const hasLastSyncedAt = Object.prototype.hasOwnProperty.call(arguments[0] || {}, "lastSyncedAt");
    const hasLastError = Object.prototype.hasOwnProperty.call(arguments[0] || {}, "lastError");
    const hasSummary = Object.prototype.hasOwnProperty.call(arguments[0] || {}, "summary");
    const hasMetadata = Object.prototype.hasOwnProperty.call(arguments[0] || {}, "metadata");
    const nextSummary = hasSummary ? serializeJson(summary || {}) : serializeJson(existing?.summary || {});
    const nextMetadata = hasMetadata ? serializeJson(metadata || {}) : serializeJson(existing?.metadata || {});
    const nextLastSyncedAt = hasLastSyncedAt
      ? lastSyncedAt
        ? toIso(lastSyncedAt, now)
        : null
      : existing?.lastSyncedAt || null;
    const nextLastError = hasLastError
      ? lastError
        ? toText(lastError)
        : null
      : existing?.lastError || null;

    this.db
      .prepare(
        `
        INSERT INTO altered_project_sources (
          source_key,
          source_type,
          display_name,
          source_label,
          enabled,
          last_synced_at,
          last_error,
          summary_json,
          metadata_json,
          created_at,
          updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(source_key) DO UPDATE SET
          source_type = excluded.source_type,
          display_name = excluded.display_name,
          source_label = excluded.source_label,
          enabled = excluded.enabled,
          last_synced_at = excluded.last_synced_at,
          last_error = excluded.last_error,
          summary_json = excluded.summary_json,
          metadata_json = excluded.metadata_json,
          updated_at = excluded.updated_at
        `
      )
      .run(
        safeSourceKey,
        toText(sourceType) || "special",
        toText(displayName) || existing?.displayName || safeSourceKey,
        toText(sourceLabel) || existing?.sourceLabel || safeSourceKey,
        enabled ? 1 : 0,
        nextLastSyncedAt,
        nextLastError,
        nextSummary,
        nextMetadata,
        existing?.createdAt || now,
        now
      );

    return this.getProjectSource(safeSourceKey);
  }

  getLiveMonitorConfig() {
    const row = this.db
      .prepare(
        `
        SELECT
          enabled AS enabled,
          schedule_mode AS scheduleMode,
          daily_hour_utc AS dailyHourUtc,
          daily_minute_utc AS dailyMinuteUtc,
          club_id AS clubId,
          interval_seconds AS intervalSeconds,
          discovery_enabled AS discoveryEnabled,
          discovery_interval_seconds AS discoveryIntervalSeconds,
          discovery_campaign_limit AS discoveryCampaignLimit,
          discovery_activity_page_size AS discoveryActivityPageSize,
          activity_page_size AS activityPageSize,
          active_only AS activeOnly,
          fetch_map_details AS fetchMapDetails,
          tracker_chunk_size AS trackerChunkSize,
          updated_at AS updatedAt
        FROM altered_live_monitor_config
        WHERE config_id = 1
        LIMIT 1
        `
      )
      .get();
    if (!row) return null;
    return {
      enabled: Boolean(row.enabled),
      scheduleMode: normalizeScheduleMode(row.scheduleMode, "daily"),
      dailyHourUtc: clampInt(row.dailyHourUtc, { min: 0, max: 23, fallback: 3 }),
      dailyMinuteUtc: clampInt(row.dailyMinuteUtc, { min: 0, max: 59, fallback: 0 }),
      clubId: clampInt(row.clubId, { min: 1, max: 2147483647, fallback: 24231 }),
      intervalSeconds: clampInt(row.intervalSeconds, { min: 60, max: 86400, fallback: 21600 }),
      discoveryEnabled: Boolean(row.discoveryEnabled),
      discoveryIntervalSeconds: clampInt(row.discoveryIntervalSeconds, {
        min: 300,
        max: 86400,
        fallback: 3600,
      }),
      discoveryCampaignLimit: clampInt(row.discoveryCampaignLimit, {
        min: 1,
        max: 250,
        fallback: 25,
      }),
      discoveryActivityPageSize: clampInt(row.discoveryActivityPageSize, {
        min: 1,
        max: 250,
        fallback: 100,
      }),
      activityPageSize: clampInt(row.activityPageSize, { min: 1, max: 250, fallback: 250 }),
      activeOnly: Boolean(row.activeOnly),
      fetchMapDetails: Boolean(row.fetchMapDetails),
      trackerChunkSize: clampInt(row.trackerChunkSize, {
        min: 25,
        max: 1000,
        fallback: 350,
      }),
      updatedAt: row.updatedAt || null,
    };
  }

  upsertLiveMonitorConfig(options = {}) {
    const existing = this.getLiveMonitorConfig();
    const now = new Date().toISOString();
    const enabled =
      options.enabled === undefined ? Boolean(existing?.enabled ?? false) : Boolean(options.enabled);
    const scheduleMode = normalizeScheduleMode(
      options.scheduleMode,
      existing?.scheduleMode || "daily"
    );
    const dailyHourUtc = clampInt(
      options.dailyHourUtc !== undefined ? options.dailyHourUtc : existing?.dailyHourUtc,
      { min: 0, max: 23, fallback: 3 }
    );
    const dailyMinuteUtc = clampInt(
      options.dailyMinuteUtc !== undefined ? options.dailyMinuteUtc : existing?.dailyMinuteUtc,
      { min: 0, max: 59, fallback: 0 }
    );
    const clubId = clampInt(options.clubId !== undefined ? options.clubId : existing?.clubId, {
      min: 1,
      max: 2147483647,
      fallback: 24231,
    });
    const intervalSeconds = clampInt(
      options.intervalSeconds !== undefined ? options.intervalSeconds : existing?.intervalSeconds,
      { min: 60, max: 86400, fallback: 21600 }
    );
    const discoveryEnabled =
      options.discoveryEnabled === undefined
        ? Boolean(existing?.discoveryEnabled ?? true)
        : Boolean(options.discoveryEnabled);
    const discoveryIntervalSeconds = clampInt(
      options.discoveryIntervalSeconds !== undefined
        ? options.discoveryIntervalSeconds
        : existing?.discoveryIntervalSeconds,
      { min: 300, max: 86400, fallback: 3600 }
    );
    const discoveryCampaignLimit = clampInt(
      options.discoveryCampaignLimit !== undefined
        ? options.discoveryCampaignLimit
        : existing?.discoveryCampaignLimit,
      { min: 1, max: 250, fallback: 25 }
    );
    const discoveryActivityPageSize = clampInt(
      options.discoveryActivityPageSize !== undefined
        ? options.discoveryActivityPageSize
        : existing?.discoveryActivityPageSize,
      { min: 1, max: 250, fallback: 100 }
    );
    const activityPageSize = clampInt(
      options.activityPageSize !== undefined ? options.activityPageSize : existing?.activityPageSize,
      { min: 1, max: 250, fallback: 250 }
    );
    const activeOnly =
      options.activeOnly === undefined
        ? Boolean(existing?.activeOnly ?? false)
        : Boolean(options.activeOnly);
    const fetchMapDetails =
      options.fetchMapDetails === undefined
        ? Boolean(existing?.fetchMapDetails ?? true)
        : Boolean(options.fetchMapDetails);
    const trackerChunkSize = clampInt(
      options.trackerChunkSize !== undefined ? options.trackerChunkSize : existing?.trackerChunkSize,
      { min: 25, max: 1000, fallback: 350 }
    );

    this.db
      .prepare(
        `
        INSERT INTO altered_live_monitor_config (
          config_id,
          enabled,
          schedule_mode,
          daily_hour_utc,
          daily_minute_utc,
          club_id,
          interval_seconds,
          discovery_enabled,
          discovery_interval_seconds,
          discovery_campaign_limit,
          discovery_activity_page_size,
          activity_page_size,
          active_only,
          fetch_map_details,
          tracker_chunk_size,
          updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(config_id) DO UPDATE SET
          enabled = excluded.enabled,
          schedule_mode = excluded.schedule_mode,
          daily_hour_utc = excluded.daily_hour_utc,
          daily_minute_utc = excluded.daily_minute_utc,
          club_id = excluded.club_id,
          interval_seconds = excluded.interval_seconds,
          discovery_enabled = excluded.discovery_enabled,
          discovery_interval_seconds = excluded.discovery_interval_seconds,
          discovery_campaign_limit = excluded.discovery_campaign_limit,
          discovery_activity_page_size = excluded.discovery_activity_page_size,
          activity_page_size = excluded.activity_page_size,
          active_only = excluded.active_only,
          fetch_map_details = excluded.fetch_map_details,
          tracker_chunk_size = excluded.tracker_chunk_size,
          updated_at = excluded.updated_at
        `
      )
      .run(
        1,
        enabled ? 1 : 0,
        scheduleMode,
        dailyHourUtc,
        dailyMinuteUtc,
        clubId,
        intervalSeconds,
        discoveryEnabled ? 1 : 0,
        discoveryIntervalSeconds,
        discoveryCampaignLimit,
        discoveryActivityPageSize,
        activityPageSize,
        activeOnly ? 1 : 0,
        fetchMapDetails ? 1 : 0,
        trackerChunkSize,
        now
      );

    return this.getLiveMonitorConfig();
  }

  normalizeAdminRole(value, fallback = "admin") {
    const role = String(value || "").trim().toLowerCase();
    if (role === "owner" || role === "admin" || role === "operator" || role === "viewer") {
      return role;
    }
    return fallback;
  }

  rowToAdminUser(row) {
    if (!row) return null;
    return {
      adminUserId: Number(row.adminUserId || 0),
      subject: String(row.subject || "").trim() || null,
      username: String(row.username || "").trim() || null,
      displayName: String(row.displayName || "").trim() || null,
      role: this.normalizeAdminRole(row.role, "admin"),
      isActive: Boolean(row.isActive),
      source: String(row.source || "").trim() || "manual",
      note: String(row.note || "").trim() || null,
      createdAt: row.createdAt || null,
      updatedAt: row.updatedAt || null,
      lastLoginAt: row.lastLoginAt || null,
    };
  }

  getAdminUserById(adminUserId) {
    const row = this.db
      .prepare(
        `
        SELECT
          admin_user_id AS adminUserId,
          ubisoft_subject AS subject,
          ubisoft_username AS username,
          display_name AS displayName,
          role,
          is_active AS isActive,
          source,
          note,
          created_at AS createdAt,
          updated_at AS updatedAt,
          last_login_at AS lastLoginAt
        FROM altered_admin_users
        WHERE admin_user_id = ?
        LIMIT 1
        `
      )
      .get(Number(adminUserId) || 0);
    return this.rowToAdminUser(row);
  }

  listAdminUsers({ includeInactive = true, limit = 500 } = {}) {
    const rows = this.db
      .prepare(
        `
        SELECT
          admin_user_id AS adminUserId,
          ubisoft_subject AS subject,
          ubisoft_username AS username,
          display_name AS displayName,
          role,
          is_active AS isActive,
          source,
          note,
          created_at AS createdAt,
          updated_at AS updatedAt,
          last_login_at AS lastLoginAt
        FROM altered_admin_users
        WHERE (? = 1 OR is_active = 1)
        ORDER BY admin_user_id DESC
        LIMIT ?
        `
      )
      .all(includeInactive ? 1 : 0, Math.max(1, Math.min(Number(limit) || 500, 5000)));
    return rows.map((row) => this.rowToAdminUser(row)).filter(Boolean);
  }

  findAdminUserBySubjectOrUsername({
    subject = "",
    username = "",
    includeInactive = false,
  } = {}) {
    const safeSubject = String(subject || "").trim();
    const safeUsername = String(username || "").trim().toLowerCase();
    if (!safeSubject && !safeUsername) return null;

    const row = this.db
      .prepare(
        `
        SELECT
          admin_user_id AS adminUserId,
          ubisoft_subject AS subject,
          ubisoft_username AS username,
          display_name AS displayName,
          role,
          is_active AS isActive,
          source,
          note,
          created_at AS createdAt,
          updated_at AS updatedAt,
          last_login_at AS lastLoginAt
        FROM altered_admin_users
        WHERE
          (? = 1 OR is_active = 1)
          AND (
            (? <> '' AND LOWER(COALESCE(ubisoft_subject, '')) = LOWER(?))
            OR (? <> '' AND LOWER(COALESCE(ubisoft_username, '')) = ?)
          )
        ORDER BY
          CASE
            WHEN (? <> '' AND LOWER(COALESCE(ubisoft_subject, '')) = LOWER(?)) THEN 0
            ELSE 1
          END,
          admin_user_id DESC
        LIMIT 1
        `
      )
      .get(
        includeInactive ? 1 : 0,
        safeSubject,
        safeSubject,
        safeUsername,
        safeUsername,
        safeSubject,
        safeSubject
      );
    return this.rowToAdminUser(row);
  }

  countActiveAdminUsers() {
    const row = this.db
      .prepare("SELECT COUNT(*) AS count FROM altered_admin_users WHERE is_active = 1")
      .get();
    return Number(row?.count || 0);
  }

  upsertAdminUser({
    subject = "",
    username = "",
    displayName = "",
    role = "admin",
    isActive = true,
    source = "manual",
    note = "",
  } = {}) {
    const safeSubject = String(subject || "").trim();
    const safeUsername = String(username || "").trim();
    if (!safeSubject && !safeUsername) {
      return { error: "subject or username is required." };
    }

    const safeDisplayName = String(displayName || "").trim() || null;
    const safeRole = this.normalizeAdminRole(role, "admin");
    const safeSource = String(source || "").trim() || "manual";
    const safeNote = String(note || "").trim() || null;
    const now = new Date().toISOString();

    const existing = this.findAdminUserBySubjectOrUsername({
      subject: safeSubject,
      username: safeUsername,
      includeInactive: true,
    });

    if (existing) {
      this.db
        .prepare(
          `
          UPDATE altered_admin_users
          SET
            ubisoft_subject = COALESCE(NULLIF(?, ''), ubisoft_subject),
            ubisoft_username = COALESCE(NULLIF(?, ''), ubisoft_username),
            display_name = COALESCE(?, display_name),
            role = ?,
            is_active = ?,
            source = ?,
            note = ?,
            updated_at = ?
          WHERE admin_user_id = ?
          `
        )
        .run(
          safeSubject,
          safeUsername,
          safeDisplayName,
          safeRole,
          isActive ? 1 : 0,
          safeSource,
          safeNote,
          now,
          existing.adminUserId
        );
      return { adminUser: this.getAdminUserById(existing.adminUserId) };
    }

    try {
      const created = this.db
        .prepare(
          `
          INSERT INTO altered_admin_users (
            ubisoft_subject,
            ubisoft_username,
            display_name,
            role,
            is_active,
            source,
            note,
            created_at,
            updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
          `
        )
        .run(
          safeSubject || null,
          safeUsername || null,
          safeDisplayName,
          safeRole,
          isActive ? 1 : 0,
          safeSource,
          safeNote,
          now,
          now
        );
      return { adminUser: this.getAdminUserById(Number(created.lastInsertRowid || 0)) };
    } catch (error) {
      if (String(error?.message || "").toLowerCase().includes("unique")) {
        return { error: "Admin user with this Ubisoft subject already exists." };
      }
      return { error: error?.message || "Failed to upsert admin user." };
    }
  }

  updateAdminUserActive({ adminUserId, isActive }) {
    const existing = this.getAdminUserById(adminUserId);
    if (!existing) return null;
    this.db
      .prepare(
        `
        UPDATE altered_admin_users
        SET is_active = ?, updated_at = ?
        WHERE admin_user_id = ?
        `
      )
      .run(Boolean(isActive) ? 1 : 0, new Date().toISOString(), existing.adminUserId);
    return this.getAdminUserById(existing.adminUserId);
  }

  seedAdminAllowlistFromConfig({ subjects = [], usernames = [] } = {}) {
    const seeded = [];

    for (const subject of Array.isArray(subjects) ? subjects : []) {
      const safeSubject = String(subject || "").trim();
      if (!safeSubject) continue;
      const result = this.upsertAdminUser({
        subject: safeSubject,
        source: "env-bootstrap",
        role: "admin",
        isActive: true,
      });
      if (!result?.error && result?.adminUser) {
        seeded.push(result.adminUser);
      }
    }

    for (const username of Array.isArray(usernames) ? usernames : []) {
      const safeUsername = String(username || "").trim();
      if (!safeUsername) continue;
      const result = this.upsertAdminUser({
        username: safeUsername,
        source: "env-bootstrap",
        role: "admin",
        isActive: true,
      });
      if (!result?.error && result?.adminUser) {
        seeded.push(result.adminUser);
      }
    }

    return {
      seededCount: seeded.length,
      activeCount: this.countActiveAdminUsers(),
      seeded,
    };
  }

  isUbisoftAdminAllowed({ subject = "", username = "", profile = null } = {}) {
    const safeSubject = String(subject || "").trim();
    const safeUsername = String(username || "").trim();
    if (!safeSubject && !safeUsername) {
      return {
        allowed: false,
        reason: "Ubisoft profile did not include subject or username.",
      };
    }

    const entry = this.findAdminUserBySubjectOrUsername({
      subject: safeSubject,
      username: safeUsername,
      includeInactive: true,
    });
    if (!entry) {
      return {
        allowed: false,
        reason: "Authenticated Ubisoft user is not in the admin allowlist.",
      };
    }
    if (!entry.isActive) {
      return {
        allowed: false,
        reason: "Authenticated Ubisoft user is disabled in the admin allowlist.",
      };
    }

    const now = new Date().toISOString();
    const displayName =
      String(
        profile?.raw?.userInfo?.display_name ||
          profile?.raw?.userInfo?.name ||
          profile?.displayName ||
          entry.displayName ||
          ""
      ).trim() || null;

    this.db
      .prepare(
        `
        UPDATE altered_admin_users
        SET
          ubisoft_subject = COALESCE(NULLIF(?, ''), ubisoft_subject),
          ubisoft_username = COALESCE(NULLIF(?, ''), ubisoft_username),
          display_name = COALESCE(?, display_name),
          last_login_at = ?,
          updated_at = ?
        WHERE admin_user_id = ?
        `
      )
      .run(safeSubject, safeUsername, displayName, now, now, entry.adminUserId);

    const updated = this.getAdminUserById(entry.adminUserId) || entry;
    return {
      allowed: true,
      user: updated,
    };
  }

  normalizeAdminSessionRecord(record = {}) {
    if (!record || typeof record !== "object") return null;
    const createdAt = clampInt(record.createdAt, {
      min: 1,
      max: Number.MAX_SAFE_INTEGER,
      fallback: Date.now(),
    });
    const expiresAt = clampInt(record.expiresAt, {
      min: 1,
      max: Number.MAX_SAFE_INTEGER,
      fallback: 0,
    });
    if (!expiresAt) return null;
    const user = record.user && typeof record.user === "object" ? { ...record.user } : {};
    const oauth = record.oauth && typeof record.oauth === "object" ? { ...record.oauth } : {};
    return {
      ...record,
      user,
      oauth,
      createdAt,
      expiresAt,
    };
  }

  getAdminSessionByToken(sessionToken) {
    const token = String(sessionToken || "").trim();
    if (!token) return null;

    const row = this.db
      .prepare(
        `
        SELECT
          session_token AS token,
          session_json AS sessionJson,
          expires_at AS expiresAt
        FROM altered_admin_sessions
        WHERE session_token = ?
        LIMIT 1
        `
      )
      .get(token);
    if (!row) return null;

    const expiresAt = clampInt(row.expiresAt, {
      min: 0,
      max: Number.MAX_SAFE_INTEGER,
      fallback: 0,
    });
    if (!expiresAt || expiresAt <= Date.now()) {
      this.deleteAdminSessionByToken(token);
      return null;
    }

    const parsed = this.normalizeAdminSessionRecord(parseJsonSafe(row.sessionJson, null));
    if (!parsed || parsed.expiresAt <= Date.now()) {
      this.deleteAdminSessionByToken(token);
      return null;
    }

    return {
      token,
      record: parsed,
    };
  }

  upsertAdminSession({ token, record } = {}) {
    const safeToken = String(token || "").trim();
    if (!safeToken) return false;

    const normalized = this.normalizeAdminSessionRecord(record);
    if (!normalized) return false;

    const serialized = serializeJson(normalized);
    if (!serialized) return false;

    const now = Date.now();
    const safeSubject = String(normalized.user?.subject || "").trim() || null;
    const safeUsername = String(normalized.user?.username || "").trim() || null;
    const adminUserId = clampInt(normalized.user?.adminUserId, {
      min: 1,
      max: 2147483647,
      fallback: 0,
    });

    this.db
      .prepare(
        `
        INSERT INTO altered_admin_sessions (
          session_token,
          admin_user_id,
          ubisoft_subject,
          ubisoft_username,
          session_json,
          created_at,
          expires_at,
          updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(session_token) DO UPDATE SET
          admin_user_id = excluded.admin_user_id,
          ubisoft_subject = excluded.ubisoft_subject,
          ubisoft_username = excluded.ubisoft_username,
          session_json = excluded.session_json,
          created_at = excluded.created_at,
          expires_at = excluded.expires_at,
          updated_at = excluded.updated_at
        `
      )
      .run(
        safeToken,
        adminUserId || null,
        safeSubject,
        safeUsername,
        serialized,
        clampInt(normalized.createdAt, {
          min: 1,
          max: Number.MAX_SAFE_INTEGER,
          fallback: now,
        }),
        clampInt(normalized.expiresAt, {
          min: 1,
          max: Number.MAX_SAFE_INTEGER,
          fallback: now,
        }),
        now
      );

    return true;
  }

  deleteAdminSessionByToken(sessionToken) {
    const token = String(sessionToken || "").trim();
    if (!token) return 0;
    const result = this.db
      .prepare("DELETE FROM altered_admin_sessions WHERE session_token = ?")
      .run(token);
    return Number(result?.changes || 0);
  }

  deleteExpiredAdminSessions({ beforeMs = Date.now() } = {}) {
    const threshold = clampInt(beforeMs, {
      min: 1,
      max: Number.MAX_SAFE_INTEGER,
      fallback: Date.now(),
    });
    const result = this.db
      .prepare("DELETE FROM altered_admin_sessions WHERE expires_at <= ?")
      .run(threshold);
    return Number(result?.changes || 0);
  }

  insertWrEvent({
    mapUid,
    mapName,
    accountId,
    holder,
    wrMs,
    recordedAt,
    receivedAt,
  } = {}) {
    const safeMapUid = toText(mapUid);
    if (!safeMapUid) return null;
    const nowIso = new Date().toISOString();
    const safeRecordedAt = toIso(recordedAt, nowIso);
    const safeReceivedAt = toIso(receivedAt, nowIso);
    const safeMapName = toText(mapName);
    const safeAccountId = normalizeAccountId(accountId || holder);
    const safeHolder = toText(holder);
    const safeWrMs = clampInt(wrMs, { min: 0, max: 2147483647, fallback: 0 });

    const result = this.db
      .prepare(
        `
        INSERT INTO altered_wr_events (
          map_uid,
          map_name,
          account_id,
          holder,
          wr_ms,
          recorded_at,
          received_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?)
        `
      )
      .run(
        safeMapUid,
        safeMapName,
        safeAccountId || null,
        safeHolder,
        safeWrMs,
        safeRecordedAt,
        safeReceivedAt
      );

    return {
      eventId: Number(result?.lastInsertRowid || 0),
      mapUid: safeMapUid,
      mapName: safeMapName,
      accountId: safeAccountId || null,
      holder: safeHolder,
      wrMs: safeWrMs,
      recordedAt: safeRecordedAt,
      receivedAt: safeReceivedAt,
    };
  }

  getLatestWrEvent() {
    const row = this.db
      .prepare(
        `
        SELECT
          event_id AS eventId,
          map_uid AS mapUid,
          map_name AS mapName,
          account_id AS accountId,
          holder AS holder,
          wr_ms AS wrMs,
          recorded_at AS recordedAt,
          received_at AS receivedAt
        FROM altered_wr_events
        ORDER BY recorded_at DESC, event_id DESC
        LIMIT 1
        `
      )
      .get();
    if (!row) return null;
    return {
      eventId: Number(row.eventId || 0),
      mapUid: toText(row.mapUid),
      mapName: toText(row.mapName),
      accountId: normalizeAccountId(row.accountId),
      holder: toText(row.holder),
      wrMs: Number(row.wrMs || 0),
      recordedAt: row.recordedAt || null,
      receivedAt: row.receivedAt || null,
    };
  }

  getRecentWrEvents({ limit = 10, offset = 0 } = {}) {
    const safeLimit = clampInt(limit, { min: 1, max: 500, fallback: 10 });
    const safeOffset = clampInt(offset, { min: 0, max: 1000000, fallback: 0 });
    const rows = this.db
      .prepare(
        `
        SELECT
          event_id AS eventId,
          map_uid AS mapUid,
          map_name AS mapName,
          account_id AS accountId,
          holder AS holder,
          wr_ms AS wrMs,
          recorded_at AS recordedAt,
          received_at AS receivedAt
        FROM altered_wr_events
        ORDER BY recorded_at DESC, event_id DESC
        LIMIT ?
        OFFSET ?
        `
      )
      .all(safeLimit, safeOffset);
    return rows.map((row) => ({
      eventId: Number(row.eventId || 0),
      mapUid: toText(row.mapUid),
      mapName: toText(row.mapName),
      accountId: normalizeAccountId(row.accountId),
      holder: toText(row.holder),
      wrMs: Number(row.wrMs || 0),
      recordedAt: row.recordedAt || null,
      receivedAt: row.receivedAt || null,
    }));
  }

  getRecentWrEventsForMap({ mapUid, limit = 10, offset = 0 } = {}) {
    const safeMapUid = toText(mapUid);
    if (!safeMapUid) return [];
    const safeLimit = clampInt(limit, { min: 1, max: 100, fallback: 10 });
    const safeOffset = clampInt(offset, { min: 0, max: 1000000, fallback: 0 });
    const rows = this.db
      .prepare(
        `
        SELECT
          event_id AS eventId,
          map_uid AS mapUid,
          map_name AS mapName,
          account_id AS accountId,
          holder AS holder,
          wr_ms AS wrMs,
          recorded_at AS recordedAt,
          received_at AS receivedAt
        FROM altered_wr_events
        WHERE LOWER(map_uid) = LOWER(?)
        ORDER BY recorded_at DESC, event_id DESC
        LIMIT ?
        OFFSET ?
        `
      )
      .all(safeMapUid, safeLimit, safeOffset);
    return rows.map((row) => ({
      eventId: Number(row.eventId || 0),
      mapUid: toText(row.mapUid),
      mapName: toText(row.mapName),
      accountId: normalizeAccountId(row.accountId),
      holder: toText(row.holder),
      wrMs: Number(row.wrMs || 0),
      recordedAt: row.recordedAt || null,
      receivedAt: row.receivedAt || null,
    }));
  }

  recordApiRequest({
    endpointKey,
    requestPath,
    method = "GET",
    statusCode = 200,
    mapUid = "",
    origin = "",
    clientHash = "",
    userAgent = "",
    durationMs = 0,
    createdAt = null,
  } = {}) {
    const safeEndpointKey = toText(endpointKey);
    const safeRequestPath = toText(requestPath);
    if (!safeEndpointKey || !safeRequestPath) return null;

    const safeMethod = truncateText(method || "GET", 12).toUpperCase();
    const safeStatusCode = clampInt(statusCode, {
      min: 100,
      max: 599,
      fallback: 200,
    });
    const safeMapUid = toText(mapUid) || null;
    const safeOrigin = truncateText(origin, 320) || null;
    const safeClientHash = truncateText(clientHash, 128) || null;
    const safeUserAgent = truncateText(userAgent, 512) || null;
    const safeDurationMs = clampInt(durationMs, {
      min: 0,
      max: 3600000,
      fallback: 0,
    });
    const safeCreatedAt = toIso(createdAt, new Date().toISOString());

    const result = this.db
      .prepare(
        `
        INSERT INTO altered_api_requests (
          endpoint_key,
          request_path,
          method,
          status_code,
          map_uid,
          origin,
          client_hash,
          user_agent,
          duration_ms,
          created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `
      )
      .run(
        safeEndpointKey,
        safeRequestPath,
        safeMethod,
        safeStatusCode,
        safeMapUid,
        safeOrigin,
        safeClientHash,
        safeUserAgent,
        safeDurationMs,
        safeCreatedAt
      );

    return {
      requestId: Number(result?.lastInsertRowid || 0),
      endpointKey: safeEndpointKey,
      requestPath: safeRequestPath,
      method: safeMethod,
      statusCode: safeStatusCode,
      mapUid: safeMapUid,
      origin: safeOrigin,
      clientHash: safeClientHash,
      userAgent: safeUserAgent,
      durationMs: safeDurationMs,
      createdAt: safeCreatedAt,
    };
  }

  getApiUsageSummary({ days = 30, recentLimit = 20, topLimit = 8, originsLimit = 8 } = {}) {
    const safeDays = clampInt(days, { min: 1, max: 365, fallback: 30 });
    const safeRecentLimit = clampInt(recentLimit, { min: 1, max: 100, fallback: 20 });
    const safeTopLimit = clampInt(topLimit, { min: 1, max: 25, fallback: 8 });
    const safeOriginsLimit = clampInt(originsLimit, { min: 1, max: 25, fallback: 8 });
    const now = Date.now();
    const cutoff24h = new Date(now - 24 * 60 * 60 * 1000).toISOString();
    const cutoff7d = new Date(now - 7 * 24 * 60 * 60 * 1000).toISOString();
    const cutoffWindow = new Date(now - safeDays * 24 * 60 * 60 * 1000).toISOString();

    const totals = this.db
      .prepare(
        `
        SELECT
          COUNT(*) AS totalRequests,
          SUM(CASE WHEN created_at >= ? THEN 1 ELSE 0 END) AS requests24h,
          SUM(CASE WHEN created_at >= ? THEN 1 ELSE 0 END) AS requests7d,
          SUM(CASE WHEN created_at >= ? THEN 1 ELSE 0 END) AS requestsWindow,
          SUM(CASE WHEN status_code >= 200 AND status_code < 400 THEN 1 ELSE 0 END) AS successCount,
          SUM(CASE WHEN status_code >= 400 AND status_code < 500 THEN 1 ELSE 0 END) AS clientErrorCount,
          SUM(CASE WHEN status_code >= 500 THEN 1 ELSE 0 END) AS serverErrorCount,
          COUNT(DISTINCT CASE
            WHEN created_at >= ? AND client_hash IS NOT NULL AND TRIM(client_hash) <> ''
            THEN client_hash
          END) AS uniqueClientsWindow
        FROM altered_api_requests
        `
      )
      .get(cutoff24h, cutoff7d, cutoffWindow, cutoffWindow);

    const endpoints = this.db
      .prepare(
        `
        SELECT
          endpoint_key AS endpointKey,
          MAX(request_path) AS requestPath,
          COUNT(*) AS totalRequests,
          SUM(CASE WHEN created_at >= ? THEN 1 ELSE 0 END) AS requests24h,
          SUM(CASE WHEN created_at >= ? THEN 1 ELSE 0 END) AS requests7d,
          SUM(CASE WHEN created_at >= ? THEN 1 ELSE 0 END) AS requestsWindow,
          SUM(CASE WHEN status_code >= 500 THEN 1 ELSE 0 END) AS serverErrorCount,
          AVG(duration_ms) AS avgDurationMs,
          MAX(created_at) AS lastRequestedAt
        FROM altered_api_requests
        GROUP BY endpoint_key
        ORDER BY requests7d DESC, totalRequests DESC, endpoint_key ASC
        LIMIT ?
        `
      )
      .all(cutoff24h, cutoff7d, cutoffWindow, safeTopLimit)
      .map((row) => ({
        endpointKey: toText(row.endpointKey),
        requestPath: toText(row.requestPath),
        totalRequests: Number(row.totalRequests || 0),
        requests24h: Number(row.requests24h || 0),
        requests7d: Number(row.requests7d || 0),
        requestsWindow: Number(row.requestsWindow || 0),
        serverErrorCount: Number(row.serverErrorCount || 0),
        avgDurationMs: Number(Number(row.avgDurationMs || 0).toFixed(1)),
        lastRequestedAt: row.lastRequestedAt || null,
      }));

    const origins = this.db
      .prepare(
        `
        SELECT
          COALESCE(NULLIF(TRIM(origin), ''), 'direct') AS originLabel,
          COUNT(*) AS totalRequests,
          MAX(created_at) AS lastRequestedAt
        FROM altered_api_requests
        WHERE created_at >= ?
        GROUP BY COALESCE(NULLIF(TRIM(origin), ''), 'direct')
        ORDER BY totalRequests DESC, lastRequestedAt DESC
        LIMIT ?
        `
      )
      .all(cutoffWindow, safeOriginsLimit)
      .map((row) => ({
        origin: toText(row.originLabel, "direct") || "direct",
        totalRequests: Number(row.totalRequests || 0),
        lastRequestedAt: row.lastRequestedAt || null,
      }));

    const timeline = this.db
      .prepare(
        `
        SELECT
          substr(created_at, 1, 10) AS day,
          COUNT(*) AS totalRequests,
          SUM(CASE WHEN status_code >= 500 THEN 1 ELSE 0 END) AS serverErrorCount
        FROM altered_api_requests
        WHERE created_at >= ?
        GROUP BY substr(created_at, 1, 10)
        ORDER BY day ASC
        `
      )
      .all(cutoffWindow)
      .map((row) => ({
        day: toText(row.day),
        totalRequests: Number(row.totalRequests || 0),
        serverErrorCount: Number(row.serverErrorCount || 0),
      }));

    const recentRequests = this.db
      .prepare(
        `
        SELECT
          request_id AS requestId,
          endpoint_key AS endpointKey,
          request_path AS requestPath,
          method AS method,
          status_code AS statusCode,
          map_uid AS mapUid,
          origin AS origin,
          user_agent AS userAgent,
          duration_ms AS durationMs,
          created_at AS createdAt
        FROM altered_api_requests
        ORDER BY request_id DESC
        LIMIT ?
        `
      )
      .all(safeRecentLimit)
      .map((row) => ({
        requestId: Number(row.requestId || 0),
        endpointKey: toText(row.endpointKey),
        requestPath: toText(row.requestPath),
        method: toText(row.method),
        statusCode: Number(row.statusCode || 0),
        mapUid: toText(row.mapUid) || null,
        origin: toText(row.origin) || null,
        userAgent: toText(row.userAgent) || null,
        durationMs: Number(row.durationMs || 0),
        createdAt: row.createdAt || null,
      }));

    return {
      generatedAt: new Date().toISOString(),
      windowDays: safeDays,
      totals: {
        totalRequests: Number(totals?.totalRequests || 0),
        requests24h: Number(totals?.requests24h || 0),
        requests7d: Number(totals?.requests7d || 0),
        requestsWindow: Number(totals?.requestsWindow || 0),
        successCount: Number(totals?.successCount || 0),
        clientErrorCount: Number(totals?.clientErrorCount || 0),
        serverErrorCount: Number(totals?.serverErrorCount || 0),
        uniqueClientsWindow: Number(totals?.uniqueClientsWindow || 0),
      },
      endpoints,
      origins,
      timeline,
      recentRequests,
    };
  }

  getRecentUpdateRequest(mapUid, withinMinutes = 60) {
    const safeMapUid = toText(mapUid);
    if (!safeMapUid) return null;
    const safeMinutes = clampInt(withinMinutes, { min: 1, max: 1440, fallback: 60 });
    const cutoffIso = new Date(Date.now() - safeMinutes * 60 * 1000).toISOString();
    const row = this.db
      .prepare(
        `
        SELECT
          request_id AS requestId,
          map_uid AS mapUid,
          map_name AS mapName,
          reason AS reason,
          status AS status,
          requester_ip AS requesterIp,
          requester_user_agent AS requesterUserAgent,
          created_at AS createdAt,
          resolved_at AS resolvedAt,
          resolution_note AS resolutionNote
        FROM altered_update_requests
        WHERE map_uid = ? AND created_at >= ?
        ORDER BY created_at DESC, request_id DESC
        LIMIT 1
        `
      )
      .get(safeMapUid, cutoffIso);
    if (!row) return null;
    return {
      requestId: Number(row.requestId || 0),
      mapUid: toText(row.mapUid),
      mapName: toText(row.mapName),
      reason: toText(row.reason),
      status: toText(row.status, "queued") || "queued",
      requesterIp: toText(row.requesterIp) || null,
      requesterUserAgent: toText(row.requesterUserAgent) || null,
      createdAt: row.createdAt || null,
      resolvedAt: row.resolvedAt || null,
      resolutionNote: toText(row.resolutionNote) || null,
    };
  }

  insertUpdateRequest({
    mapUid,
    mapName,
    reason,
    status = "queued",
    requesterIp = "",
    requesterUserAgent = "",
    createdAt,
  } = {}) {
    const safeMapUid = toText(mapUid);
    if (!safeMapUid) return null;
    const safeStatusRaw = toText(status, "queued").toLowerCase();
    const safeStatus = ["queued", "processing", "done", "rejected"].includes(safeStatusRaw)
      ? safeStatusRaw
      : "queued";
    const safeMapName = toText(mapName);
    const safeReason = toText(reason);
    const safeCreatedAt = toIso(createdAt, new Date().toISOString());
    const safeRequesterIp = toText(requesterIp);
    const safeRequesterUserAgent = toText(requesterUserAgent);

    const result = this.db
      .prepare(
        `
        INSERT INTO altered_update_requests (
          map_uid,
          map_name,
          reason,
          status,
          requester_ip,
          requester_user_agent,
          created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?)
        `
      )
      .run(
        safeMapUid,
        safeMapName,
        safeReason,
        safeStatus,
        safeRequesterIp || null,
        safeRequesterUserAgent || null,
        safeCreatedAt
      );

    return {
      requestId: Number(result?.lastInsertRowid || 0),
      mapUid: safeMapUid,
      mapName: safeMapName,
      reason: safeReason,
      status: safeStatus,
      requesterIp: safeRequesterIp || null,
      requesterUserAgent: safeRequesterUserAgent || null,
      createdAt: safeCreatedAt,
      resolvedAt: null,
      resolutionNote: null,
    };
  }

  getUpdateRequestById(requestId) {
    const safeRequestId = clampInt(requestId, { min: 1, max: 2147483647, fallback: 0 });
    if (!safeRequestId) return null;
    const row = this.db
      .prepare(
        `
        SELECT
          request_id AS requestId,
          map_uid AS mapUid,
          map_name AS mapName,
          reason AS reason,
          status AS status,
          requester_ip AS requesterIp,
          requester_user_agent AS requesterUserAgent,
          created_at AS createdAt,
          resolved_at AS resolvedAt,
          resolution_note AS resolutionNote
        FROM altered_update_requests
        WHERE request_id = ?
        LIMIT 1
        `
      )
      .get(safeRequestId);
    if (!row) return null;
    return {
      requestId: Number(row.requestId || 0),
      mapUid: toText(row.mapUid),
      mapName: toText(row.mapName),
      reason: toText(row.reason),
      status: toText(row.status, "queued") || "queued",
      requesterIp: toText(row.requesterIp) || null,
      requesterUserAgent: toText(row.requesterUserAgent) || null,
      createdAt: row.createdAt || null,
      resolvedAt: row.resolvedAt || null,
      resolutionNote: toText(row.resolutionNote) || null,
    };
  }

  listUpdateRequests({ status = "", q = "", limit = 100, offset = 0 } = {}) {
    const safeStatusRaw = toText(status).toLowerCase();
    const safeStatus = ["queued", "processing", "done", "rejected"].includes(safeStatusRaw)
      ? safeStatusRaw
      : "";
    const query = toText(q).toLowerCase();
    const pattern = `%${query}%`;
    const safeLimit = clampInt(limit, { min: 1, max: 500, fallback: 100 });
    const safeOffset = clampInt(offset, { min: 0, max: 500000, fallback: 0 });
    const rows = this.db
      .prepare(
        `
        SELECT
          request_id AS requestId,
          map_uid AS mapUid,
          map_name AS mapName,
          reason AS reason,
          status AS status,
          requester_ip AS requesterIp,
          requester_user_agent AS requesterUserAgent,
          created_at AS createdAt,
          resolved_at AS resolvedAt,
          resolution_note AS resolutionNote
        FROM altered_update_requests
        WHERE
          (? = '' OR LOWER(status) = ?)
          AND (
            ? = ''
            OR LOWER(map_uid) LIKE ?
            OR LOWER(map_name) LIKE ?
            OR LOWER(reason) LIKE ?
          )
        ORDER BY created_at DESC, request_id DESC
        LIMIT ? OFFSET ?
        `
      )
      .all(
        safeStatus,
        safeStatus,
        query,
        pattern,
        pattern,
        pattern,
        safeLimit,
        safeOffset
      );
    return rows.map((row) => ({
      requestId: Number(row.requestId || 0),
      mapUid: toText(row.mapUid),
      mapName: toText(row.mapName),
      reason: toText(row.reason),
      status: toText(row.status, "queued") || "queued",
      requesterIp: toText(row.requesterIp) || null,
      requesterUserAgent: toText(row.requesterUserAgent) || null,
      createdAt: row.createdAt || null,
      resolvedAt: row.resolvedAt || null,
      resolutionNote: toText(row.resolutionNote) || null,
    }));
  }

  updateUpdateRequestStatus({ requestId, status, resolutionNote = "" } = {}) {
    const safeRequestId = clampInt(requestId, { min: 1, max: 2147483647, fallback: 0 });
    if (!safeRequestId) return null;
    const safeStatusRaw = toText(status).toLowerCase();
    if (!["queued", "processing", "done", "rejected"].includes(safeStatusRaw)) return null;
    const nowIso = new Date().toISOString();
    const safeResolutionNote = toText(resolutionNote);
    const resolvedAt =
      safeStatusRaw === "done" || safeStatusRaw === "rejected" ? nowIso : null;
    const result = this.db
      .prepare(
        `
        UPDATE altered_update_requests
        SET
          status = ?,
          resolved_at = ?,
          resolution_note = ?
        WHERE request_id = ?
        `
      )
      .run(
        safeStatusRaw,
        resolvedAt,
        safeResolutionNote || null,
        safeRequestId
      );
    if (!Number(result?.changes || 0)) return null;
    return this.getUpdateRequestById(safeRequestId);
  }

  getSummary() {
    const trackedMaps =
      this.db.prepare("SELECT COUNT(*) AS count FROM altered_maps WHERE tracked = 1").get()?.count ||
      0;
    const campaignCount =
      this.db.prepare("SELECT COUNT(*) AS count FROM altered_campaigns").get()?.count || 0;
    const latestWrAt =
      this.db
        .prepare("SELECT wr_updated_at AS at FROM altered_maps ORDER BY wr_updated_at DESC LIMIT 1")
        .get()?.at || null;
    return {
      trackedMaps: Number(trackedMaps),
      campaignCount: Number(campaignCount),
      latestWrAt,
    };
  }

  getAlterationsStats() {
    const row = this.db
      .prepare(
        `
        SELECT
          COUNT(*) AS totalMaps,
          SUM(
            CASE
              WHEN tracked = 1 AND LOWER(COALESCE(status, '')) = 'live' THEN 1
              ELSE 0
            END
          ) AS activelyTracked
        FROM altered_maps
        `
      )
      .get();
    const latestSync =
      this.db
        .prepare(
          `
          SELECT finished_at AS lastRunAt
          FROM altered_sync_runs
          WHERE status = 'ok'
          ORDER BY run_id DESC
          LIMIT 1
          `
        )
        .get()?.lastRunAt || null;
    const totalWrChanges =
      this.db.prepare("SELECT COUNT(*) AS count FROM altered_wr_events").get()?.count || 0;
    return {
      totalMaps: Number(row?.totalMaps || 0),
      activelyTracked: Number(row?.activelyTracked || 0),
      totalWrChanges: Number(totalWrChanges || 0),
      lastRunAt: latestSync,
    };
  }

  getAlterationsMapFilters() {
    const seasons = this.db
      .prepare(
        `
        SELECT DISTINCT season
        FROM altered_map_name_candidates
        WHERE season IS NOT NULL AND TRIM(season) <> ''
        ORDER BY
          CASE LOWER(season)
            WHEN 'winter' THEN 1
            WHEN 'spring' THEN 2
            WHEN 'summer' THEN 3
            WHEN 'fall' THEN 4
            ELSE 5
          END,
          season COLLATE NOCASE ASC
        `
      )
      .all()
      .map((row) => row.season)
      .filter(Boolean);
    const years = this.db
      .prepare(
        `
        SELECT DISTINCT year
        FROM altered_map_name_candidates
        WHERE year IS NOT NULL
        ORDER BY year DESC
        `
      )
      .all()
      .map((row) => Number(row.year || 0))
      .filter(Boolean);
    const environments = this.db
      .prepare(
        `
        SELECT DISTINCT map_environment AS value
        FROM altered_maps
        WHERE map_environment IS NOT NULL AND TRIM(map_environment) <> ''
        ORDER BY map_environment COLLATE NOCASE ASC
        `
      )
      .all()
      .map((row) => row.value)
      .filter(Boolean);
    const mapTypes = this.db
      .prepare(
        `
        SELECT DISTINCT map_type AS value
        FROM altered_maps
        WHERE map_type IS NOT NULL AND TRIM(map_type) <> ''
        ORDER BY map_type COLLATE NOCASE ASC
        `
      )
      .all()
      .map((row) => row.value)
      .filter(Boolean);

    return {
      seasons,
      years,
      environments,
      map_types: mapTypes,
      statuses: ["active", "paused", "idle"],
      wr_states: ["with_wr", "without_wr"],
    };
  }

  getCampaignTimeline({
    source = "best",
    bucket = "month",
    days = 365,
    clubId = null,
  } = {}) {
    const allowedSources = new Set(["best", "publication", "creation", "start", "discovered"]);
    const allowedBuckets = new Set(["day", "week", "month"]);
    const normalizedSource = String(source || "best").trim().toLowerCase();
    const normalizedBucket = String(bucket || "month").trim().toLowerCase();
    const safeSource = allowedSources.has(normalizedSource) ? normalizedSource : "best";
    const safeBucket = allowedBuckets.has(normalizedBucket) ? normalizedBucket : "month";
    const safeDays = clampInt(days, { min: 7, max: 3650, fallback: 365 });
    const parsedClubId = Number(clubId);
    const safeClubId =
      Number.isFinite(parsedClubId) && parsedClubId > 0
        ? clampInt(parsedClubId, {
            min: 1,
            max: 2147483647,
            fallback: 0,
          })
        : 0;

    const rows = safeClubId
      ? this.db
          .prepare(
            `
            SELECT
              campaign_id AS campaignId,
              club_id AS clubId,
              name,
              external_campaign_id AS externalCampaignId,
              start_timestamp AS startTimestamp,
              created_at AS discoveredAt,
              payload_json AS payloadJson
            FROM altered_campaigns
            WHERE club_id = ?
            ORDER BY created_at ASC
            `
          )
          .all(safeClubId)
      : this.db
          .prepare(
            `
            SELECT
              campaign_id AS campaignId,
              club_id AS clubId,
              name,
              external_campaign_id AS externalCampaignId,
              start_timestamp AS startTimestamp,
              created_at AS discoveredAt,
              payload_json AS payloadJson
            FROM altered_campaigns
            ORDER BY created_at ASC
            `
          )
          .all();

    const nowMs = Date.now();
    const fromMs = nowMs - safeDays * 24 * 60 * 60 * 1000;
    const bucketCounts = new Map();
    let campaignsWithTimestamp = 0;
    let campaignsMissingTimestamp = 0;
    let campaignsInRange = 0;
    let publicationAvailable = 0;
    let creationAvailable = 0;
    let startAvailable = 0;
    let discoveredAvailable = 0;

    const pickTimestamp = ({ publicationMs, creationMs, startMs, discoveredMs }) => {
      if (safeSource === "publication") return publicationMs;
      if (safeSource === "creation") return creationMs;
      if (safeSource === "start") return startMs;
      if (safeSource === "discovered") return discoveredMs;
      return publicationMs || creationMs || startMs || discoveredMs || null;
    };

    for (const row of rows) {
      const payload = parseJsonSafe(row.payloadJson, {}) || {};
      const publicationMs = firstTimestamp([
        payload?.publicationTimestamp,
        payload?.publication_timestamp,
        payload?.campaign?.publicationTimestamp,
        payload?.campaign?.publication_timestamp,
      ]);
      const creationMs = firstTimestamp([
        payload?.creationTimestamp,
        payload?.creation_timestamp,
        payload?.campaign?.creationTimestamp,
        payload?.campaign?.creation_timestamp,
      ]);
      const startMs = firstTimestamp([row.startTimestamp]);
      const discoveredMs = firstTimestamp([row.discoveredAt]);

      if (publicationMs) publicationAvailable += 1;
      if (creationMs) creationAvailable += 1;
      if (startMs) startAvailable += 1;
      if (discoveredMs) discoveredAvailable += 1;

      const selectedMs = pickTimestamp({
        publicationMs,
        creationMs,
        startMs,
        discoveredMs,
      });
      if (!selectedMs) {
        campaignsMissingTimestamp += 1;
        continue;
      }
      campaignsWithTimestamp += 1;
      if (selectedMs < fromMs || selectedMs > nowMs) continue;
      campaignsInRange += 1;
      const bucketStartMs = startOfUtcBucket(selectedMs, safeBucket);
      bucketCounts.set(bucketStartMs, Number(bucketCounts.get(bucketStartMs) || 0) + 1);
    }

    const sortedBucketMs = [...bucketCounts.keys()].sort((a, b) => a - b);
    let cumulative = 0;
    const points = sortedBucketMs.map((bucketStartMs) => {
      const count = Number(bucketCounts.get(bucketStartMs) || 0);
      cumulative += count;
      return {
        bucketStartAt: new Date(bucketStartMs).toISOString(),
        label: formatBucketLabel(bucketStartMs, safeBucket),
        count,
        cumulative,
      };
    });

    return {
      source: safeSource,
      bucket: safeBucket,
      days: safeDays,
      clubId: safeClubId || null,
      generatedAt: new Date(nowMs).toISOString(),
      rangeStartAt: new Date(fromMs).toISOString(),
      rangeEndAt: new Date(nowMs).toISOString(),
      totalCampaigns: rows.length,
      campaignsWithTimestamp,
      campaignsMissingTimestamp,
      campaignsInRange,
      availability: {
        publication: publicationAvailable,
        creation: creationAvailable,
        start: startAvailable,
        discovered: discoveredAvailable,
      },
      points,
    };
  }

  listAlterationsMaps({
    limit = 50000,
    offset = 0,
    q = "",
    sort = "name",
    campaignIds = [],
    status = "",
    season = "",
    year = null,
    alterationSlugs = [],
    alterationIds = [],
    mapNumber = null,
    environment = "",
    mapType = "",
    hasWr = undefined,
  } = {}) {
    const safeLimit = clampInt(limit, { min: 1, max: 100000, fallback: 50000 });
    const safeOffset = clampInt(offset, { min: 0, max: 2000000, fallback: 0 });
    const normalizedQuery = toText(q).toLowerCase();
    const normalizedStatus = toText(status).toLowerCase();
    const normalizedSeason = toText(season);
    const normalizedEnvironment = toText(environment);
    const normalizedMapType = toText(mapType);
    const normalizedMapNumber = clampInt(mapNumber, {
      min: 1,
      max: 999,
      fallback: 0,
    });
    const normalizedYear = clampInt(year, {
      min: 1900,
      max: 2500,
      fallback: 0,
    });
    const normalizedCampaignIds = uniqueBy(
      (Array.isArray(campaignIds) ? campaignIds : [campaignIds])
        .flatMap((value) => String(value || "").split(","))
        .map((value) => toText(value))
        .filter((value) => /^\d+$/.test(value)),
      (value) => value
    );
    const normalizedAlterationSlugs = uniqueBy(
      (Array.isArray(alterationSlugs) ? alterationSlugs : [alterationSlugs])
        .flatMap((value) => String(value || "").split(","))
        .map((value) => slugifyText(value))
        .filter(Boolean),
      (value) => value
    );
    const normalizedAlterationIds = uniqueBy(
      (Array.isArray(alterationIds) ? alterationIds : [alterationIds])
        .flatMap((value) => String(value || "").split(","))
        .map((value) => clampInt(value, { min: 1, max: 2147483647, fallback: 0 }))
        .filter(Boolean),
      (value) => value
    );

    const whereClauses = [];
    const params = [];

    if (normalizedCampaignIds.length) {
      whereClauses.push(
        `CAST(COALESCE(c.external_campaign_id, c.campaign_id) AS TEXT) IN (${normalizedCampaignIds
          .map(() => "?")
          .join(", ")})`
      );
      params.push(...normalizedCampaignIds);
    }

    if (normalizedQuery) {
      const like = `%${normalizedQuery}%`;
      whereClauses.push(
        `(
          LOWER(COALESCE(m.name, '')) LIKE ?
          OR LOWER(COALESCE(m.author, '')) LIKE ?
          OR LOWER(COALESCE(m.wr_holder, '')) LIKE ?
          OR LOWER(COALESCE(m.map_uid, '')) LIKE ?
          OR LOWER(COALESCE(c.name, '')) LIKE ?
        )`
      );
      params.push(like, like, like, like, like);
    }

    if (normalizedStatus === "active") {
      whereClauses.push("m.tracked = 1 AND LOWER(COALESCE(m.status, 'live')) != 'paused'");
    } else if (normalizedStatus === "paused") {
      whereClauses.push("LOWER(COALESCE(m.status, '')) = 'paused'");
    } else if (normalizedStatus === "idle") {
      whereClauses.push("m.tracked = 0");
    }

    if (normalizedSeason) {
      whereClauses.push("LOWER(COALESCE(n.season, '')) = LOWER(?)");
      params.push(normalizedSeason);
    }

    if (normalizedYear) {
      whereClauses.push("n.year = ?");
      params.push(normalizedYear);
    }

    if (normalizedMapNumber) {
      whereClauses.push("n.map_number = ?");
      params.push(normalizedMapNumber);
    }

    if (normalizedEnvironment) {
      whereClauses.push("LOWER(COALESCE(m.map_environment, '')) = LOWER(?)");
      params.push(normalizedEnvironment);
    }

    if (normalizedMapType) {
      whereClauses.push("LOWER(COALESCE(m.map_type, '')) = LOWER(?)");
      params.push(normalizedMapType);
    }

    if (hasWr === true) {
      whereClauses.push("COALESCE(m.wr_ms, 0) > 0");
    } else if (hasWr === false) {
      whereClauses.push("COALESCE(m.wr_ms, 0) <= 0");
    }

    if (normalizedAlterationSlugs.length) {
      whereClauses.push(
        `EXISTS (
          SELECT 1
          FROM altered_campaign_alterations ca_filter
          JOIN altered_alterations a_filter ON a_filter.alteration_id = ca_filter.alteration_id
          WHERE ca_filter.campaign_id = c.campaign_id
            AND a_filter.slug IN (${normalizedAlterationSlugs.map(() => "?").join(", ")})
        )`
      );
      params.push(...normalizedAlterationSlugs);
    }

    if (normalizedAlterationIds.length) {
      whereClauses.push(
        `EXISTS (
          SELECT 1
          FROM altered_campaign_alterations ca_filter
          WHERE ca_filter.campaign_id = c.campaign_id
            AND ca_filter.alteration_id IN (${normalizedAlterationIds.map(() => "?").join(", ")})
        )`
      );
      params.push(...normalizedAlterationIds);
    }

    let orderBy = "ORDER BY m.name COLLATE NOCASE ASC, m.map_uid ASC";
    if (sort === "newest") {
      orderBy = `ORDER BY
        COALESCE(n.updated_at, m.map_updated_at, m.map_created_at, p.updated_at, c.updated_at, c.created_at, m.updated_at, m.created_at, '') DESC,
        m.name COLLATE NOCASE ASC,
        m.map_uid ASC`;
    } else if (sort === "wr_ms") {
      orderBy = `ORDER BY
        CASE WHEN COALESCE(m.wr_ms, 0) > 0 THEN 0 ELSE 1 END ASC,
        COALESCE(m.wr_ms, 2147483647) ASC,
        m.name COLLATE NOCASE ASC,
        m.map_uid ASC`;
    } else if (sort === "author_time") {
      orderBy = `ORDER BY
        CASE WHEN COALESCE(m.author_time, 0) > 0 THEN 0 ELSE 1 END ASC,
        COALESCE(m.author_time, 2147483647) ASC,
        m.name COLLATE NOCASE ASC,
        m.map_uid ASC`;
    } else if (sort === "wr_updated_at" || sort === "latest_wr") {
      orderBy = `ORDER BY
        COALESCE(m.wr_updated_at, '') DESC,
        COALESCE(m.wr_ms, 2147483647) ASC,
        m.name COLLATE NOCASE ASC,
        m.map_uid ASC`;
    } else if (sort === "change_count" || sort === "most_changes") {
      orderBy = `ORDER BY
        COALESCE(wrc.wrChangeCount, 0) DESC,
        COALESCE(m.wr_updated_at, '') DESC,
        m.name COLLATE NOCASE ASC,
        m.map_uid ASC`;
    }

    const joinSql = `
      LEFT JOIN altered_map_positions p ON p.map_uid = m.map_uid
      LEFT JOIN altered_campaigns c ON c.campaign_id = p.campaign_id
      LEFT JOIN altered_map_name_candidates n ON n.map_uid = m.map_uid
      LEFT JOIN (
        SELECT
          ca.campaign_id AS campaignId,
          GROUP_CONCAT(CAST(a.alteration_id AS TEXT), ',') AS alterationIdsCsv,
          GROUP_CONCAT(a.name, '${ALTERATION_VALUE_SEPARATOR}') AS alterationNamesCsv,
          GROUP_CONCAT(COALESCE(a.slug, ''), '${ALTERATION_VALUE_SEPARATOR}') AS alterationSlugsCsv
        FROM altered_campaign_alterations ca
        JOIN altered_alterations a ON a.alteration_id = ca.alteration_id
        GROUP BY ca.campaign_id
      ) alt ON alt.campaignId = c.campaign_id
      LEFT JOIN (
        SELECT map_uid AS mapUid, COUNT(*) AS wrChangeCount
        FROM altered_wr_events
        GROUP BY map_uid
      ) wrc ON wrc.mapUid = m.map_uid
    `;
    const whereSql = whereClauses.length ? `WHERE ${whereClauses.join(" AND ")}` : "";

    const total = Number(
      this.db
        .prepare(
          `
          SELECT COUNT(*) AS total
          FROM altered_maps m
          ${joinSql}
          ${whereSql}
          `
        )
        .get(...params)?.total || 0
    );

    const rows = this.db
      .prepare(
        `
        SELECT
          m.map_uid AS mapUid,
          m.name AS name,
          m.map_type AS mapType,
          m.map_style AS mapStyle,
          m.map_environment AS mapEnvironment,
          m.author AS author,
          m.thumbnail_url AS thumbnailUrl,
          m.download_url AS downloadUrl,
          m.player_count AS playerCount,
          m.author_time AS authorTime,
          m.gold_time AS goldTime,
          m.silver_time AS silverTime,
          m.bronze_time AS bronzeTime,
          m.wr_ms AS wrMs,
          m.wr_holder AS wrHolder,
          m.wr_updated_at AS wrUpdatedAt,
          m.tracked AS tracked,
          m.status AS status,
          c.campaign_id AS campaignDbId,
          c.external_campaign_id AS campaignExternalId,
          c.name AS campaignName,
          c.start_timestamp AS campaignStartTimestamp,
          c.payload_json AS campaignPayloadJson,
          c.created_at AS campaignCreatedAt,
          c.updated_at AS campaignUpdatedAt,
          p.slot AS slot,
          n.season AS derivedSeason,
          n.year AS derivedYear,
          n.map_number AS derivedMapNumber,
          n.map_numbers_json AS derivedMapNumbersJson,
          n.alteration_label AS derivedAlterationLabel,
          n.alteration_mix_json AS derivedAlterationMixJson,
          alt.alterationIdsCsv AS alterationIdsCsv,
          alt.alterationNamesCsv AS alterationNamesCsv,
          alt.alterationSlugsCsv AS alterationSlugsCsv,
          COALESCE(wrc.wrChangeCount, 0) AS wrChangeCount
        FROM altered_maps m
        ${joinSql}
        ${whereSql}
        ${orderBy}
        LIMIT ?
        OFFSET ?
        `
      )
      .all(...params, safeLimit, safeOffset);

    return {
      total,
      rows: rows.map((row) => {
        const campaignId =
          row.campaignExternalId !== null && row.campaignExternalId !== undefined
            ? String(row.campaignExternalId)
            : row.campaignDbId !== null && row.campaignDbId !== undefined
              ? String(row.campaignDbId)
              : null;
        const campaignMeta = buildCampaignCatalogMetadata({
          campaignName: row.campaignName,
          startTimestamp: row.campaignStartTimestamp,
          payloadJson: row.campaignPayloadJson,
          createdAt: row.campaignCreatedAt,
          updatedAt: row.campaignUpdatedAt,
          alterationIdsCsv: row.alterationIdsCsv,
          alterationNamesCsv: row.alterationNamesCsv,
          alterationSlugsCsv: row.alterationSlugsCsv,
        });
        const derivedAlterationMix = parseJsonSafe(row.derivedAlterationMixJson, []) || [];
        const mapAlterationNames = campaignMeta.alterations.length
          ? campaignMeta.alterations.map((item) => item.name)
          : uniqueTexts(
              derivedAlterationMix.length ? derivedAlterationMix : [row.derivedAlterationLabel || ""]
            );
        const mapAlterations = mapAlterationNames.map((name) => {
          const existing = campaignMeta.alterations.find(
            (item) => String(item?.name || "").toLowerCase() === name.toLowerCase()
          );
          return {
            id: existing?.id || null,
            name: existing?.name || name,
            slug: existing?.slug || slugifyText(name, name),
          };
        });

        return {
          map_uid: row.mapUid,
          name: row.name || row.mapUid,
          author: row.author || "",
          thumbnail_url: row.thumbnailUrl || null,
          download_url: row.downloadUrl || null,
          map_type: row.mapType || null,
          map_style: row.mapStyle || null,
          map_environment: row.mapEnvironment || null,
          author_time: Number(row.authorTime || 0),
          gold_time: Number(row.goldTime || 0),
          silver_time: Number(row.silverTime || 0),
          bronze_time: Number(row.bronzeTime || 0),
          player_count: Number(row.playerCount || 0),
          wr_ms: Number(row.wrMs || 0) || null,
          wr_holder: row.wrHolder || null,
          wr_updated_at: row.wrUpdatedAt || null,
          tracked: Boolean(row.tracked),
          status: row.status || "live",
          tracking_status: mapTrackingStatus({
            tracked: Boolean(row.tracked),
            status: row.status || "live",
          }),
          check_count: 0,
          change_count: Number(row.wrChangeCount || 0),
          campaign_id: campaignId,
          campaign_db_id: Number(row.campaignDbId || 0) || null,
          campaign_external_id: Number(row.campaignExternalId || 0) || null,
          campaign_name: row.campaignName || null,
          campaign_sort_timestamp_ms: Number(campaignMeta.sortTimestampMs || 0) || 0,
          campaign_added_at: campaignMeta.addedAt || null,
          season: row.derivedSeason || campaignMeta.season || null,
          year: Number(row.derivedYear || 0) || campaignMeta.seasonYear || null,
          season_label: campaignMeta.seasonLabel || null,
          season_key: campaignMeta.seasonKey || null,
          map_number: Number(row.derivedMapNumber || 0) || null,
          map_numbers: parseJsonSafe(row.derivedMapNumbersJson, []) || [],
          alteration: row.derivedAlterationLabel || campaignMeta.primaryAlteration?.name || null,
          alterations: mapAlterations,
          campaign_alterations: campaignMeta.alterations,
          slot: Number(row.slot || 0) || 0,
        };
      }),
    };
  }

  listAlterationsCampaigns({
    limit = 3000,
    offset = 0,
    catalogOnly = false,
    linkedOnly = false,
    alterationSlugs = [],
    alterationIds = [],
  } = {}) {
    const safeLimit = clampInt(limit, { min: 1, max: 10000, fallback: 3000 });
    const safeOffset = clampInt(offset, { min: 0, max: 2000000, fallback: 0 });
    const normalizedAlterationSlugs = uniqueBy(
      (Array.isArray(alterationSlugs) ? alterationSlugs : [alterationSlugs])
        .flatMap((value) => String(value || "").split(","))
        .map((value) => slugifyText(value))
        .filter(Boolean),
      (value) => value
    );
    const normalizedAlterationIds = uniqueBy(
      (Array.isArray(alterationIds) ? alterationIds : [alterationIds])
        .flatMap((value) => String(value || "").split(","))
        .map((value) => clampInt(value, { min: 1, max: 2147483647, fallback: 0 }))
        .filter(Boolean),
      (value) => value
    );
    const rows = this.db
      .prepare(
        `
        SELECT
          c.club_id AS clubId,
          c.campaign_id AS campaignDbId,
          c.external_campaign_id AS campaignExternalId,
          c.name AS campaignName,
          c.start_timestamp AS startTimestamp,
          c.payload_json AS payloadJson,
          c.created_at AS createdAt,
          c.updated_at AS updatedAt,
          COUNT(m.map_uid) AS mapCount,
          (
            SELECT m2.thumbnail_url
            FROM altered_map_positions p2
            JOIN altered_maps m2 ON m2.map_uid = p2.map_uid
            WHERE p2.campaign_id = c.campaign_id
              AND m2.thumbnail_url IS NOT NULL
              AND m2.thumbnail_url != ''
            LIMIT 1
          ) AS thumbnailUrl,
          alt.alterationIdsCsv AS alterationIdsCsv,
          alt.alterationNamesCsv AS alterationNamesCsv,
          alt.alterationSlugsCsv AS alterationSlugsCsv
        FROM altered_campaigns c
        LEFT JOIN altered_map_positions p ON p.campaign_id = c.campaign_id
        LEFT JOIN altered_maps m ON m.map_uid = p.map_uid
        LEFT JOIN (
          SELECT
            ca.campaign_id AS campaignId,
            GROUP_CONCAT(CAST(a.alteration_id AS TEXT), ',') AS alterationIdsCsv,
            GROUP_CONCAT(a.name, '${ALTERATION_VALUE_SEPARATOR}') AS alterationNamesCsv,
            GROUP_CONCAT(COALESCE(a.slug, ''), '${ALTERATION_VALUE_SEPARATOR}') AS alterationSlugsCsv
          FROM altered_campaign_alterations ca
          JOIN altered_alterations a ON a.alteration_id = ca.alteration_id
          GROUP BY ca.campaign_id
        ) alt ON alt.campaignId = c.campaign_id
        GROUP BY c.campaign_id
        HAVING COUNT(m.map_uid) > 0
        `
      )
      .all();

    const filtered = rows
      .map((row) => {
        const meta = buildCampaignCatalogMetadata({
          campaignName: row.campaignName,
          startTimestamp: row.startTimestamp,
          payloadJson: row.payloadJson,
          createdAt: row.createdAt,
          updatedAt: row.updatedAt,
          alterationIdsCsv: row.alterationIdsCsv,
          alterationNamesCsv: row.alterationNamesCsv,
          alterationSlugsCsv: row.alterationSlugsCsv,
        });
        return { row, meta };
      })
      .filter(({ meta }) => {
        if (catalogOnly && !meta.isCatalog) return false;
        if (linkedOnly && !meta.alterations.length) return false;
        if (
          normalizedAlterationSlugs.length &&
          !meta.alterations.some((item) => normalizedAlterationSlugs.includes(item.slug))
        ) {
          return false;
        }
        if (
          normalizedAlterationIds.length &&
          !meta.alterations.some((item) => normalizedAlterationIds.includes(Number(item.id || 0)))
        ) {
          return false;
        }
        return true;
      })
      .sort((a, b) => {
        const timeDiff = Number(b.meta.sortTimestampMs || 0) - Number(a.meta.sortTimestampMs || 0);
        if (timeDiff !== 0) return timeDiff;
        const clubDiff = Number(b.row.clubId || 0) - Number(a.row.clubId || 0);
        if (clubDiff !== 0) return clubDiff;
        return Number(b.row.campaignDbId || 0) - Number(a.row.campaignDbId || 0);
      });

    const total = filtered.length;
    const campaigns = filtered
      .slice(safeOffset, safeOffset + safeLimit)
      .map(({ row, meta }) => ({
        id:
          row.campaignExternalId !== null && row.campaignExternalId !== undefined
            ? String(row.campaignExternalId)
            : String(row.campaignDbId),
        campaign_db_id: Number(row.campaignDbId || 0) || null,
        campaign_external_id: Number(row.campaignExternalId || 0) || null,
        club_id: Number(row.clubId || 0) || null,
        name: row.campaignName || `Campaign ${row.campaignDbId}`,
        display_name: meta.seasonLabel || row.campaignName || `Campaign ${row.campaignDbId}`,
        season: meta.season || null,
        season_year: meta.seasonYear || null,
        season_label: meta.seasonLabel || null,
        season_key: meta.seasonKey || null,
        sort_timestamp_ms: Number(meta.sortTimestampMs || 0) || 0,
        added_at: meta.addedAt || null,
        map_count: Number(row.mapCount || 0),
        thumbnail_url: row.thumbnailUrl || null,
        alteration: meta.primaryAlteration?.name || null,
        alterations: meta.alterations,
        primary_alteration: meta.primaryAlteration || null,
        environment: meta.environment || null,
        campaign_type: meta.campaignType || null,
        is_catalog: meta.isCatalog,
        has_alteration: meta.alterations.length > 0,
      }));

    return {
      total,
      rows: campaigns,
    };
  }

  upsertAlteration(name) {
    const safeName = String(name || "").trim();
    if (!safeName) return null;
    const baseSlug = slugifyText(safeName, safeName);
    const existingByName =
      this.db
        .prepare(
          `
          SELECT alteration_id AS id, name, slug
          FROM altered_alterations
          WHERE name = ?
          LIMIT 1
          `
        )
        .get(safeName) || null;
    const existingBySlug =
      this.db
        .prepare(
          `
          SELECT alteration_id AS id, name, slug
          FROM altered_alterations
          WHERE slug = ?
          LIMIT 1
          `
        )
        .get(baseSlug) || null;
    const existing = existingByName || existingBySlug;
    const pickUniqueSlug = (desiredSlug, excludeId = 0) => {
      let candidate = slugifyText(desiredSlug, safeName);
      let suffix = 2;
      while (true) {
        const conflict =
          this.db
            .prepare(
              `
              SELECT alteration_id AS id
              FROM altered_alterations
              WHERE slug = ?
              LIMIT 1
              `
            )
            .get(candidate) || null;
        if (!conflict || Number(conflict.id || 0) === Number(excludeId || 0)) {
          return candidate;
        }
        candidate = `${slugifyText(desiredSlug, safeName)}-${suffix}`;
        suffix += 1;
      }
    };
    const now = new Date().toISOString();
    if (existingBySlug && !existingByName) {
      this.db
        .prepare(
          `
          UPDATE altered_alterations
          SET updated_at = ?
          WHERE alteration_id = ?
          `
        )
        .run(now, Number(existingBySlug.id || 0));
      return {
        id: Number(existingBySlug.id || 0),
        name: existingBySlug.name,
        slug: slugifyText(existingBySlug.slug || existingBySlug.name, existingBySlug.name),
      };
    }

    const safeSlug = pickUniqueSlug(baseSlug, existing?.id || 0);
    this.db
      .prepare(
        `INSERT INTO altered_alterations (name, slug, created_at, updated_at)
         VALUES (?, ?, ?, ?)
         ON CONFLICT(name) DO UPDATE SET
           slug = COALESCE(NULLIF(excluded.slug, ''), altered_alterations.slug),
           updated_at = excluded.updated_at`
      )
      .run(safeName, safeSlug, now, now);
    const row = this.db
      .prepare(`SELECT alteration_id AS id, name, slug FROM altered_alterations WHERE name = ?`)
      .get(safeName);
    return row
      ? {
          id: Number(row.id),
          name: row.name,
          slug: slugifyText(row.slug || row.name, row.name),
        }
      : null;
  }

  linkCampaignAlteration(campaignId, alterationId) {
    this.db
      .prepare(
        `INSERT OR IGNORE INTO altered_campaign_alterations (campaign_id, alteration_id)
         VALUES (?, ?)`
      )
      .run(Number(campaignId), Number(alterationId));
  }

  clearCampaignAlterations(campaignId) {
    this.db
      .prepare(`DELETE FROM altered_campaign_alterations WHERE campaign_id = ?`)
      .run(Number(campaignId));
  }

  syncCampaignAlterationsById(campaignId) {
    const safeCampaignId = clampInt(campaignId, {
      min: 1,
      max: 2147483647,
      fallback: 0,
    });
    if (!safeCampaignId) {
      return {
        ok: false,
        campaignId: null,
        linked: 0,
        alterations: [],
      };
    }

    const campaign = this.db
      .prepare(
        `
        SELECT
          campaign_id AS campaignId,
          name AS campaignName,
          start_timestamp AS startTimestamp
        FROM altered_campaigns
        WHERE campaign_id = ?
        LIMIT 1
        `
      )
      .get(safeCampaignId);
    if (!campaign) {
      return {
        ok: false,
        campaignId: safeCampaignId,
        linked: 0,
        alterations: [],
      };
    }

    const parsed = parseCampaignStandardizedFields(campaign.campaignName || "", {
      startTimestamp: campaign.startTimestamp || null,
    });
    const alterationNames = uniqueTexts(
      Array.isArray(parsed?.alterationMix) && parsed.alterationMix.length
        ? parsed.alterationMix
        : [parsed?.alteration || ""]
    );

    this.clearCampaignAlterations(safeCampaignId);

    const linkedAlterations = [];
    for (const alterationName of alterationNames) {
      const alteration = this.upsertAlteration(alterationName);
      if (!alteration?.id) continue;
      this.linkCampaignAlteration(safeCampaignId, alteration.id);
      linkedAlterations.push(alteration);
    }

    return {
      ok: true,
      campaignId: safeCampaignId,
      linked: linkedAlterations.length,
      alterations: linkedAlterations,
      parsedCampaign: parsed,
    };
  }

  deleteUnusedAlterations() {
    const result = this.db
      .prepare(
        `
        DELETE FROM altered_alterations
        WHERE alteration_id NOT IN (
          SELECT DISTINCT alteration_id
          FROM altered_campaign_alterations
        )
        `
      )
      .run();
    return Number(result?.changes || 0);
  }

  syncAllCampaignAlterations({ cleanupUnused = true } = {}) {
    const campaignRows = this.db
      .prepare(
        `
        SELECT campaign_id AS campaignId
        FROM altered_campaigns
        ORDER BY campaign_id ASC
        `
      )
      .all();

    const summary = {
      campaigns_scanned: campaignRows.length,
      campaigns_linked: 0,
      links_inserted: 0,
      alterations_touched: 0,
      unused_deleted: 0,
    };
    const touchedAlterationIds = new Set();

    try {
      this.db.exec("BEGIN IMMEDIATE");
      for (const row of campaignRows) {
        const result = this.syncCampaignAlterationsById(row.campaignId);
        if (!result?.ok) continue;
        if (result.linked > 0) summary.campaigns_linked += 1;
        summary.links_inserted += Number(result.linked || 0);
        for (const alteration of result.alterations || []) {
          if (alteration?.id) touchedAlterationIds.add(Number(alteration.id));
        }
      }
      summary.alterations_touched = touchedAlterationIds.size;
      if (cleanupUnused) {
        summary.unused_deleted = this.deleteUnusedAlterations();
      }
      this.db.exec("COMMIT");
    } catch (error) {
      try {
        this.db.exec("ROLLBACK");
      } catch {}
      throw error;
    }

    return summary;
  }

  countAlterations() {
    return Number(
      this.db.prepare("SELECT COUNT(*) AS count FROM altered_alterations").get()?.count || 0
    );
  }

  listAlterations() {
    return this.db
      .prepare(
        `SELECT
           a.alteration_id AS alterationId,
           a.name,
           a.slug AS slug,
           a.created_at AS createdAt,
           COUNT(DISTINCT ca.campaign_id) AS campaignCount,
           COALESCE(SUM(sub.mapCount), 0) AS mapCount
         FROM altered_alterations a
         LEFT JOIN altered_campaign_alterations ca ON ca.alteration_id = a.alteration_id
         LEFT JOIN (
           SELECT p.campaign_id, COUNT(p.map_uid) AS mapCount
           FROM altered_map_positions p
           JOIN altered_maps m ON m.map_uid = p.map_uid
           GROUP BY p.campaign_id
         ) sub ON sub.campaign_id = ca.campaign_id
         GROUP BY a.alteration_id
         ORDER BY campaignCount DESC, a.name ASC`
      )
      .all()
      .map((row) => ({
        id: Number(row.alterationId),
        name: row.name,
        slug: slugifyText(row.slug || row.name, row.name),
        campaign_count: Number(row.campaignCount || 0),
        map_count: Number(row.mapCount || 0),
        created_at: row.createdAt,
      }));
  }

  listCampaignsByAlteration(alterationId) {
    return this.db
      .prepare(
        `SELECT
           c.campaign_id AS campaignDbId,
           c.external_campaign_id AS campaignExternalId,
           c.name AS campaignName,
           c.start_timestamp AS startTimestamp,
           c.payload_json AS payloadJson,
           c.created_at AS createdAt,
           c.updated_at AS updatedAt,
           COUNT(m.map_uid) AS mapCount,
           (
             SELECT m2.thumbnail_url
             FROM altered_map_positions p2
             JOIN altered_maps m2 ON m2.map_uid = p2.map_uid
             WHERE p2.campaign_id = c.campaign_id
               AND m2.thumbnail_url IS NOT NULL
               AND m2.thumbnail_url != ''
             LIMIT 1
           ) AS thumbnailUrl
         FROM altered_campaigns c
         JOIN altered_campaign_alterations ca ON ca.campaign_id = c.campaign_id
         LEFT JOIN altered_map_positions p ON p.campaign_id = c.campaign_id
         LEFT JOIN altered_maps m ON m.map_uid = p.map_uid
         WHERE ca.alteration_id = ?
         GROUP BY c.campaign_id
         HAVING COUNT(m.map_uid) > 0`
      )
      .all(Number(alterationId));
  }

  getAllCampaignAlterationLinks() {
    return this.db
      .prepare(
        `SELECT campaign_id AS campaignId, alteration_id AS alterationId
         FROM altered_campaign_alterations`
      )
      .all();
  }

  listAlterationsUploadMaps({ limit = 5000, offset = 0 } = {}) {
    const safeLimit = clampInt(limit, { min: 1, max: 100000, fallback: 5000 });
    const safeOffset = clampInt(offset, { min: 0, max: 2000000, fallback: 0 });
    const rows = this.db
      .prepare(
        `
        SELECT
          um.club_id AS clubId,
          um.bucket_id AS bucketId,
          ub.name AS bucketName,
          ub.map_count AS bucketMapCount,
          ub.active AS bucketActive,
          um.map_uid AS mapUid,
          um.slot AS slot,
          um.map_name AS mapName,
          um.author_account_id AS authorAccountId,
          um.first_seen_at AS firstSeenAt,
          um.last_seen_at AS lastSeenAt,
          um.updated_at AS updatedAt
        FROM altered_upload_maps um
        LEFT JOIN altered_upload_buckets ub
          ON ub.club_id = um.club_id AND ub.bucket_id = um.bucket_id
        ORDER BY
          COALESCE(um.last_seen_at, um.updated_at, um.first_seen_at, '') DESC,
          um.bucket_id DESC,
          um.slot ASC,
          um.map_uid ASC
        LIMIT ?
        OFFSET ?
        `
      )
      .all(safeLimit, safeOffset);

    return rows.map((row) => ({
      club_id: Number(row.clubId || 0),
      bucket_id: Number(row.bucketId || 0),
      bucket_name: String(row.bucketName || "").trim() || `Bucket ${row.bucketId}`,
      bucket_map_count: Number(row.bucketMapCount || 0),
      bucket_active: Number(row.bucketActive || 0) > 0,
      map_uid: String(row.mapUid || "").trim(),
      slot: Number(row.slot || 0),
      map_name: String(row.mapName || "").trim() || String(row.mapUid || "").trim(),
      author_account_id: normalizeAccountId(row.authorAccountId),
      first_seen_at: toNullableIso(row.firstSeenAt) || null,
      last_seen_at: toNullableIso(row.lastSeenAt) || null,
      updated_at: toNullableIso(row.updatedAt) || null,
    }));
  }

  listAlteredMapUids({ trackedOnly = true, limit = 100000 } = {}) {
    const safeLimit = clampInt(limit, { min: 1, max: 500000, fallback: 100000 });
    const rows = this.db
      .prepare(
        `
        SELECT map_uid AS mapUid
        FROM altered_maps
        WHERE (? = 0 OR (tracked = 1 AND LOWER(COALESCE(status, '')) = 'live'))
        ORDER BY map_uid ASC
        LIMIT ?
        `
      )
      .all(trackedOnly ? 1 : 0, safeLimit);

    return uniqueBy(
      rows
        .map((row) => String(row.mapUid || "").trim().toLowerCase())
        .filter(Boolean),
      (mapUid) => mapUid
    );
  }

  listMostPlayedAlterationsMaps({ limit = 50, offset = 0 } = {}) {
    const safeLimit = clampInt(limit, { min: 1, max: 2000, fallback: 50 });
    const safeOffset = clampInt(offset, { min: 0, max: 2000000, fallback: 0 });
    return this.db
      .prepare(
        `
        SELECT
          m.map_uid AS mapUid,
          m.name AS mapName,
          COALESCE(c.name, 'Unassigned') AS campaignName,
          COALESCE(p.slot, 0) AS slot,
          m.player_count AS playerCount,
          m.wr_holder AS wrHolder,
          m.wr_ms AS wrMs,
          m.wr_updated_at AS wrUpdatedAt,
          m.author_time AS authorTime,
          m.gold_time AS goldTime,
          m.silver_time AS silverTime,
          m.bronze_time AS bronzeTime
        FROM altered_maps m
        LEFT JOIN altered_map_positions p ON p.map_uid = m.map_uid
        LEFT JOIN altered_campaigns c ON c.campaign_id = p.campaign_id
        ORDER BY m.player_count DESC, m.name COLLATE NOCASE ASC
        LIMIT ?
        OFFSET ?
        `
      )
      .all(safeLimit, safeOffset)
      .map((row) => ({
        map_uid: row.mapUid,
        map_name: row.mapName || row.mapUid,
        campaign_name: row.campaignName || "Unassigned",
        slot: Number(row.slot || 0),
        player_count: Number(row.playerCount || 0),
        wr_holder: row.wrHolder || null,
        wr_ms: Number(row.wrMs || 0) || null,
        wr_updated_at: row.wrUpdatedAt || null,
        author_time: Number(row.authorTime || 0),
        gold_time: Number(row.goldTime || 0),
        silver_time: Number(row.silverTime || 0),
        bronze_time: Number(row.bronzeTime || 0),
      }));
  }

  listWrLeaderboardOverall({ limit = 300, offset = 0 } = {}) {
    const safeLimit = clampInt(limit, { min: 1, max: 5000, fallback: 300 });
    const safeOffset = clampInt(offset, { min: 0, max: 2000000, fallback: 0 });
    return this.db
      .prepare(
        `
        SELECT
          TRIM(m.wr_holder) AS player,
          COUNT(*) AS wrCount,
          MAX(COALESCE(m.wr_updated_at, m.updated_at, m.created_at)) AS latestWrAt
        FROM altered_maps m
        WHERE m.wr_ms > 0 AND TRIM(COALESCE(m.wr_holder, '')) != ''
        GROUP BY TRIM(m.wr_holder)
        ORDER BY wrCount DESC, COALESCE(latestWrAt, '') DESC, player COLLATE NOCASE ASC
        LIMIT ?
        OFFSET ?
        `
      )
      .all(safeLimit, safeOffset)
      .map((row) => ({
        player: row.player,
        wr_count: Number(row.wrCount || 0),
        latest_wr_at: row.latestWrAt || null,
      }));
  }

  getWrLeaderboardSummary() {
    const row = this.db
      .prepare(
        `
        WITH grouped AS (
          SELECT
            TRIM(m.wr_holder) AS player,
            COUNT(*) AS wrCount
          FROM altered_maps m
          WHERE m.wr_ms > 0 AND TRIM(COALESCE(m.wr_holder, '')) != ''
          GROUP BY TRIM(m.wr_holder)
        )
        SELECT
          COUNT(*) AS uniquePlayers,
          COALESCE(SUM(wrCount), 0) AS totalWrs
        FROM grouped
        `
      )
      .get();

    return {
      unique_players: Number(row?.uniquePlayers || 0),
      total_wrs: Number(row?.totalWrs || 0),
    };
  }

  listWrLeaderboardByCampaign({ perBucketLimit = 10, maxRows = 4000 } = {}) {
    const safePerBucketLimit = clampInt(perBucketLimit, {
      min: 1,
      max: 100,
      fallback: 10,
    });
    const safeMaxRows = clampInt(maxRows, { min: 1, max: 20000, fallback: 4000 });
    return this.db
      .prepare(
        `
        WITH grouped AS (
          SELECT
            COALESCE(c.name, 'Unassigned') AS bucket,
            TRIM(m.wr_holder) AS player,
            COUNT(*) AS wrCount,
            MAX(COALESCE(m.wr_updated_at, m.updated_at, m.created_at)) AS latestWrAt
          FROM altered_maps m
          LEFT JOIN altered_map_positions p ON p.map_uid = m.map_uid
          LEFT JOIN altered_campaigns c ON c.campaign_id = p.campaign_id
          WHERE m.wr_ms > 0 AND TRIM(COALESCE(m.wr_holder, '')) != ''
          GROUP BY bucket, TRIM(m.wr_holder)
        ),
        ranked AS (
          SELECT
            bucket,
            player,
            wrCount,
            latestWrAt,
            ROW_NUMBER() OVER (
              PARTITION BY bucket
              ORDER BY wrCount DESC, COALESCE(latestWrAt, '') DESC, player COLLATE NOCASE ASC
            ) AS rank
          FROM grouped
        )
        SELECT bucket, player, wrCount, latestWrAt, rank
        FROM ranked
        WHERE rank <= ?
        ORDER BY bucket COLLATE NOCASE ASC, rank ASC
        LIMIT ?
        `
      )
      .all(safePerBucketLimit, safeMaxRows)
      .map((row) => ({
        bucket: row.bucket || "Unassigned",
        player: row.player,
        wr_count: Number(row.wrCount || 0),
        latest_wr_at: row.latestWrAt || null,
        rank: Number(row.rank || 0),
      }));
  }

  listWrLeaderboardBySeason({ perBucketLimit = 10, maxRows = 1000 } = {}) {
    const safePerBucketLimit = clampInt(perBucketLimit, {
      min: 1,
      max: 100,
      fallback: 10,
    });
    const safeMaxRows = clampInt(maxRows, { min: 1, max: 5000, fallback: 1000 });
    return this.db
      .prepare(
        `
        WITH grouped AS (
          SELECT
            CASE
              WHEN LOWER(COALESCE(c.name, '')) LIKE '%winter%' THEN 'Winter'
              WHEN LOWER(COALESCE(c.name, '')) LIKE '%spring%' THEN 'Spring'
              WHEN LOWER(COALESCE(c.name, '')) LIKE '%summer%' THEN 'Summer'
              WHEN LOWER(COALESCE(c.name, '')) LIKE '%fall%' OR LOWER(COALESCE(c.name, '')) LIKE '%autumn%' THEN 'Fall'
              ELSE 'Other'
            END AS bucket,
            TRIM(m.wr_holder) AS player,
            COUNT(*) AS wrCount,
            MAX(COALESCE(m.wr_updated_at, m.updated_at, m.created_at)) AS latestWrAt
          FROM altered_maps m
          LEFT JOIN altered_map_positions p ON p.map_uid = m.map_uid
          LEFT JOIN altered_campaigns c ON c.campaign_id = p.campaign_id
          WHERE m.wr_ms > 0 AND TRIM(COALESCE(m.wr_holder, '')) != ''
          GROUP BY bucket, TRIM(m.wr_holder)
        ),
        ranked AS (
          SELECT
            bucket,
            player,
            wrCount,
            latestWrAt,
            ROW_NUMBER() OVER (
              PARTITION BY bucket
              ORDER BY wrCount DESC, COALESCE(latestWrAt, '') DESC, player COLLATE NOCASE ASC
            ) AS rank
          FROM grouped
        )
        SELECT bucket, player, wrCount, latestWrAt, rank
        FROM ranked
        WHERE rank <= ?
        ORDER BY bucket COLLATE NOCASE ASC, rank ASC
        LIMIT ?
        `
      )
      .all(safePerBucketLimit, safeMaxRows)
      .map((row) => ({
        bucket: row.bucket || "Other",
        player: row.player,
        wr_count: Number(row.wrCount || 0),
        latest_wr_at: row.latestWrAt || null,
        rank: Number(row.rank || 0),
      }));
  }

  listWrLeaderboardBySlot({ perBucketLimit = 10, maxRows = 1000 } = {}) {
    const safePerBucketLimit = clampInt(perBucketLimit, {
      min: 1,
      max: 100,
      fallback: 10,
    });
    const safeMaxRows = clampInt(maxRows, { min: 1, max: 5000, fallback: 1000 });
    return this.db
      .prepare(
        `
        WITH grouped AS (
          SELECT
            CASE
              WHEN COALESCE(p.slot, 0) BETWEEN 1 AND 25 THEN printf('%02d', p.slot)
              ELSE 'Other'
            END AS bucket,
            TRIM(m.wr_holder) AS player,
            COUNT(*) AS wrCount,
            MAX(COALESCE(m.wr_updated_at, m.updated_at, m.created_at)) AS latestWrAt
          FROM altered_maps m
          LEFT JOIN altered_map_positions p ON p.map_uid = m.map_uid
          WHERE m.wr_ms > 0 AND TRIM(COALESCE(m.wr_holder, '')) != ''
          GROUP BY bucket, TRIM(m.wr_holder)
        ),
        ranked AS (
          SELECT
            bucket,
            player,
            wrCount,
            latestWrAt,
            ROW_NUMBER() OVER (
              PARTITION BY bucket
              ORDER BY wrCount DESC, COALESCE(latestWrAt, '') DESC, player COLLATE NOCASE ASC
            ) AS rank
          FROM grouped
        )
        SELECT bucket, player, wrCount, latestWrAt, rank
        FROM ranked
        WHERE rank <= ?
        ORDER BY
          CASE WHEN bucket = 'Other' THEN 999 ELSE CAST(bucket AS INTEGER) END ASC,
          rank ASC
        LIMIT ?
        `
      )
      .all(safePerBucketLimit, safeMaxRows)
      .map((row) => ({
        bucket: row.bucket || "Other",
        player: row.player,
        wr_count: Number(row.wrCount || 0),
        latest_wr_at: row.latestWrAt || null,
        rank: Number(row.rank || 0),
      }));
  }

  listMaps({ q = "", limit = 1200, offset = 0 } = {}) {
    const query = String(q || "").trim().toLowerCase();
    const pattern = `%${query}%`;
    const safeLimit = Math.max(1, Math.min(Number(limit) || 1200, 50000));
    const safeOffset = clampInt(offset, { min: 0, max: 2000000, fallback: 0 });
    const rows = this.db
      .prepare(
        `
        SELECT
          m.map_uid AS uid,
          m.map_id AS mapId,
          m.name AS name,
          m.map_type AS mapType,
          m.map_style AS mapStyle,
          m.map_environment AS mapEnvironment,
          c.name AS campaign,
          c.campaign_id AS campaignId,
          p.slot AS slot,
          m.author_time AS authorMs,
          m.player_count AS playerCount,
          m.player_count_updated_at AS playerCountUpdatedAt,
          m.wr_ms AS wrMs,
          m.wr_holder AS wrHolder,
          m.wr_updated_at AS wrUpdatedAt,
          m.tracked AS tracked,
          m.status AS status,
          m.check_frequency AS checkFrequency,
          m.last_checked_at AS lastCheckedAt,
          m.map_created_at AS mapCreatedAt,
          m.map_updated_at AS mapUpdatedAt
        FROM altered_maps m
        LEFT JOIN altered_map_positions p ON p.map_uid = m.map_uid
        LEFT JOIN altered_campaigns c ON c.campaign_id = p.campaign_id
        WHERE (? = '' OR LOWER(m.name) LIKE ? OR LOWER(m.map_uid) LIKE ?)
        ORDER BY COALESCE(c.name, 'Unassigned') COLLATE NOCASE ASC, COALESCE(p.slot, 9999) ASC, m.name COLLATE NOCASE ASC
        LIMIT ?
        OFFSET ?
        `
      )
      .all(query, pattern, pattern, safeLimit, safeOffset);
    return rows.map(rowToMap);
  }

  countMapsWorkspace({
    q = "",
    campaign = "",
    tracked = undefined,
    status = "",
    staleState = "",
  } = {}) {
    const query = String(q || "").trim().toLowerCase();
    const pattern = `%${query}%`;
    const safeCampaign = String(campaign || "").trim();
    const trackedFlag =
      typeof tracked === "boolean" ? (tracked ? 1 : 0) : Number(tracked) === 1 ? 1 : Number(tracked) === 0 ? 0 : -1;
    const safeStatus = String(status || "").trim().toLowerCase();
    const safeStaleState = String(staleState || "").trim().toLowerCase();
    const row = this.db
      .prepare(
        `
        SELECT COUNT(*) AS count
        FROM altered_maps m
        LEFT JOIN altered_map_positions p ON p.map_uid = m.map_uid
        LEFT JOIN altered_campaigns c ON c.campaign_id = p.campaign_id
        WHERE (? = '' OR LOWER(m.name) LIKE ? OR LOWER(m.map_uid) LIKE ?)
          AND (? = '' OR LOWER(COALESCE(c.name, 'Unassigned')) = LOWER(?))
          AND (? = -1 OR m.tracked = ?)
          AND (? = '' OR LOWER(COALESCE(m.status, 'live')) = ?)
          AND (
            ? = ''
            OR (? = 'fresh' AND m.last_checked_at IS NOT NULL AND datetime(m.last_checked_at) > datetime('now', '-1 day'))
            OR (? = 'stale' AND (m.last_checked_at IS NULL OR datetime(m.last_checked_at) <= datetime('now', '-1 day')))
          )
        `
      )
      .get(
        query,
        pattern,
        pattern,
        safeCampaign,
        safeCampaign,
        trackedFlag,
        trackedFlag,
        safeStatus,
        safeStatus,
        safeStaleState,
        safeStaleState,
        safeStaleState
      );
    return Number(row?.count || 0);
  }

  listMapsWorkspace({
    q = "",
    campaign = "",
    tracked = undefined,
    status = "",
    staleState = "",
    limit = 50,
    offset = 0,
  } = {}) {
    const query = String(q || "").trim().toLowerCase();
    const pattern = `%${query}%`;
    const safeCampaign = String(campaign || "").trim();
    const trackedFlag =
      typeof tracked === "boolean" ? (tracked ? 1 : 0) : Number(tracked) === 1 ? 1 : Number(tracked) === 0 ? 0 : -1;
    const safeStatus = String(status || "").trim().toLowerCase();
    const safeStaleState = String(staleState || "").trim().toLowerCase();
    const safeLimit = Math.max(1, Math.min(Number(limit) || 50, 500));
    const safeOffset = clampInt(offset, { min: 0, max: 2000000, fallback: 0 });
    const rows = this.db
      .prepare(
        `
        SELECT
          m.map_uid AS uid,
          m.map_id AS mapId,
          m.name AS name,
          m.map_type AS mapType,
          m.map_style AS mapStyle,
          m.map_environment AS mapEnvironment,
          c.name AS campaign,
          c.campaign_id AS campaignId,
          p.slot AS slot,
          m.author_time AS authorMs,
          m.player_count AS playerCount,
          m.player_count_updated_at AS playerCountUpdatedAt,
          m.wr_ms AS wrMs,
          m.wr_holder AS wrHolder,
          m.wr_updated_at AS wrUpdatedAt,
          m.tracked AS tracked,
          m.status AS status,
          m.check_frequency AS checkFrequency,
          m.last_checked_at AS lastCheckedAt,
          m.map_created_at AS mapCreatedAt,
          m.map_updated_at AS mapUpdatedAt
        FROM altered_maps m
        LEFT JOIN altered_map_positions p ON p.map_uid = m.map_uid
        LEFT JOIN altered_campaigns c ON c.campaign_id = p.campaign_id
        WHERE (? = '' OR LOWER(m.name) LIKE ? OR LOWER(m.map_uid) LIKE ?)
          AND (? = '' OR LOWER(COALESCE(c.name, 'Unassigned')) = LOWER(?))
          AND (? = -1 OR m.tracked = ?)
          AND (? = '' OR LOWER(COALESCE(m.status, 'live')) = ?)
          AND (
            ? = ''
            OR (? = 'fresh' AND m.last_checked_at IS NOT NULL AND datetime(m.last_checked_at) > datetime('now', '-1 day'))
            OR (? = 'stale' AND (m.last_checked_at IS NULL OR datetime(m.last_checked_at) <= datetime('now', '-1 day')))
          )
        ORDER BY COALESCE(c.name, 'Unassigned') COLLATE NOCASE ASC, COALESCE(p.slot, 9999) ASC, m.name COLLATE NOCASE ASC
        LIMIT ?
        OFFSET ?
        `
      )
      .all(
        query,
        pattern,
        pattern,
        safeCampaign,
        safeCampaign,
        trackedFlag,
        trackedFlag,
        safeStatus,
        safeStatus,
        safeStaleState,
        safeStaleState,
        safeStaleState,
        safeLimit,
        safeOffset
      );
    return rows.map(rowToMap);
  }

  getMapOptions({ limit = 25000, offset = 0 } = {}) {
    return this.listMaps({ limit, offset }).map((map) => ({
      uid: map.uid,
      name: map.name,
      campaign: map.campaign,
      slot: map.slot,
    }));
  }

  listMapsForCampaignNames({ campaignNames = [] } = {}) {
    const safeCampaignNames = uniqueBy(
      (Array.isArray(campaignNames) ? campaignNames : [campaignNames])
        .map((value) => toText(value))
        .filter(Boolean),
      (value) => value.toLowerCase()
    );
    if (!safeCampaignNames.length) return [];
    const placeholders = safeCampaignNames.map(() => "?").join(", ");
    const rows = this.db
      .prepare(
        `
        SELECT
          m.map_uid AS mapUid,
          m.name AS name,
          m.download_url AS downloadUrl,
          m.map_type AS mapType,
          m.map_style AS mapStyle,
          m.map_environment AS mapEnvironment,
          c.campaign_id AS campaignId,
          c.name AS campaignName,
          p.slot AS slot
        FROM altered_maps m
        JOIN altered_map_positions p ON p.map_uid = m.map_uid
        JOIN altered_campaigns c ON c.campaign_id = p.campaign_id
        WHERE c.name IN (${placeholders})
        ORDER BY c.name COLLATE NOCASE ASC, p.slot ASC, m.name COLLATE NOCASE ASC, m.map_uid ASC
        `
      )
      .all(...safeCampaignNames);
    return rows.map((row) => ({
      mapUid: row.mapUid,
      uid: row.mapUid,
      name: row.name || row.mapUid,
      mapName: row.name || row.mapUid,
      downloadUrl: row.downloadUrl || null,
      mapType: row.mapType || null,
      mapStyle: row.mapStyle || null,
      mapEnvironment: row.mapEnvironment || null,
      campaignId: Number(row.campaignId || 0) || null,
      campaignName: row.campaignName || null,
      campaign: row.campaignName || null,
      slot: Number(row.slot || 0) || 0,
    }));
  }

  listMapsForNameStandardization({
    q = "",
    limit = 60000,
    mapUids = [],
    clubId = null,
    reviewState = "",
    includePayload = true,
  } = {}) {
    const query = String(q || "").trim().toLowerCase();
    const pattern = `%${query}%`;
    const safeClubId = clampInt(clubId, { min: 1, max: 2147483647, fallback: 0 }) || null;
    const safeMapUids = uniqueBy(
      (Array.isArray(mapUids) ? mapUids : [])
        .map((value) => toText(value))
        .filter(Boolean),
      (value) => value.toLowerCase()
    );
    const mapUidWhere = safeMapUids.length
      ? `AND m.map_uid IN (${safeMapUids.map(() => "?").join(", ")})`
      : "";
    const clubWhere = safeClubId ? `AND c.club_id = ?` : "";
    const normalizedReview = String(reviewState || "").trim().toLowerCase();
    const reviewWhere = (normalizedReview === "pending" || normalizedReview === "approved" || normalizedReview === "ignored")
      ? "AND nc.review_state = ?"
      : "";
    const reviewJoin = reviewWhere
      ? "INNER JOIN altered_map_name_candidates nc ON nc.map_uid = m.map_uid"
      : "";
    const safeLimit = Math.max(1, Math.min(Number(limit) || 60000, 120000));
    return this.db
      .prepare(
        includePayload
          ? `
            SELECT
              m.map_uid AS mapUid,
              m.map_id AS mapId,
              m.name AS name,
              m.map_type AS mapType,
              m.map_style AS mapStyle,
              m.map_environment AS mapEnvironment,
              m.author AS author,
              m.submitter AS submitter,
              m.download_url AS downloadUrl,
              m.payload_json AS payloadJson,
              c.name AS campaign,
              c.campaign_id AS campaignId,
              c.external_campaign_id AS campaignExternalId,
              campaign_counts.mapCount AS campaignMapCount,
              c.start_timestamp AS campaignStartTimestamp,
              c.payload_json AS campaignPayloadJson,
              p.slot AS slot
            FROM altered_maps m
            LEFT JOIN altered_map_positions p ON p.map_uid = m.map_uid
            LEFT JOIN altered_campaigns c ON c.campaign_id = p.campaign_id
            ${reviewJoin}
            LEFT JOIN (
              SELECT p2.campaign_id AS campaignId, COUNT(*) AS mapCount
              FROM altered_map_positions p2
              GROUP BY p2.campaign_id
            ) campaign_counts ON campaign_counts.campaignId = c.campaign_id
            WHERE (? = '' OR LOWER(m.name) LIKE ? OR LOWER(m.map_uid) LIKE ?)
              ${mapUidWhere}
              ${clubWhere}
              ${reviewWhere}
              ${EXCLUDE_NONCANONICAL_WEEKLY_SHORTS_SQL}
            ORDER BY COALESCE(c.name, 'Unassigned') COLLATE NOCASE ASC, COALESCE(p.slot, 9999) ASC, m.name COLLATE NOCASE ASC
            LIMIT ?
          `
          : `
            SELECT
              m.map_uid AS mapUid,
              m.map_id AS mapId,
              m.name AS name,
              m.map_type AS mapType,
              m.map_style AS mapStyle,
              m.map_environment AS mapEnvironment,
              m.author AS author,
              m.submitter AS submitter,
              m.download_url AS downloadUrl,
              NULL AS payloadJson,
              c.name AS campaign,
              c.campaign_id AS campaignId,
              c.external_campaign_id AS campaignExternalId,
              NULL AS campaignMapCount,
              c.start_timestamp AS campaignStartTimestamp,
              NULL AS campaignPayloadJson,
              p.slot AS slot
            FROM altered_maps m
            LEFT JOIN altered_map_positions p ON p.map_uid = m.map_uid
            LEFT JOIN altered_campaigns c ON c.campaign_id = p.campaign_id
            ${reviewJoin}
            WHERE (? = '' OR LOWER(m.name) LIKE ? OR LOWER(m.map_uid) LIKE ?)
              ${mapUidWhere}
              ${clubWhere}
              ${reviewWhere}
              ${EXCLUDE_NONCANONICAL_WEEKLY_SHORTS_SQL}
            ORDER BY COALESCE(c.name, 'Unassigned') COLLATE NOCASE ASC, COALESCE(p.slot, 9999) ASC, m.name COLLATE NOCASE ASC
            LIMIT ?
          `
      )
      .all(
        query,
        pattern,
        pattern,
        ...safeMapUids,
        ...(safeClubId ? [safeClubId] : []),
        ...(reviewWhere ? [normalizedReview] : []),
        safeLimit
      )
      .map((row) => ({
        ...row,
        payload: parseJsonSafe(row.payloadJson, null),
        campaignPayload: parseJsonSafe(row.campaignPayloadJson, null),
      }));
  }

  listMapsNeedingSimilarityRefresh({
    q = "",
    limit = 250,
    mapUids = [],
    clubId = null,
    reviewState = "",
    requiredAssignmentMethod = "",
    includePayload = true,
  } = {}) {
    const query = String(q || "").trim().toLowerCase();
    const pattern = `%${query}%`;
    const requiredMethod = toText(requiredAssignmentMethod).toLowerCase();
    const safeClubId = clampInt(clubId, { min: 1, max: 2147483647, fallback: 0 }) || null;
    const safeMapUids = uniqueBy(
      (Array.isArray(mapUids) ? mapUids : [])
        .map((value) => toText(value))
        .filter(Boolean),
      (value) => value.toLowerCase()
    );
    const mapUidWhere = safeMapUids.length
      ? `AND m.map_uid IN (${safeMapUids.map(() => "?").join(", ")})`
      : "";
    const clubWhere = safeClubId ? `AND c.club_id = ?` : "";
    const normalizedReview = String(reviewState || "").trim().toLowerCase();
    const reviewWhere = (normalizedReview === "pending" || normalizedReview === "approved" || normalizedReview === "ignored")
      ? "AND nc.review_state = ?"
      : "";
    const reviewJoin = reviewWhere
      ? "INNER JOIN altered_map_name_candidates nc ON nc.map_uid = m.map_uid"
      : "";
    const safeLimit = Math.max(1, Math.min(Number(limit) || 250, 120000));

    return this.db
      .prepare(
        includePayload
          ? `
            SELECT
              m.map_uid AS mapUid,
              m.map_id AS mapId,
              m.name AS name,
              m.map_type AS mapType,
              m.map_style AS mapStyle,
              m.map_environment AS mapEnvironment,
              m.author AS author,
              m.submitter AS submitter,
              m.download_url AS downloadUrl,
              m.payload_json AS payloadJson,
              c.name AS campaign,
              c.campaign_id AS campaignId,
              c.external_campaign_id AS campaignExternalId,
              campaign_counts.mapCount AS campaignMapCount,
              c.start_timestamp AS campaignStartTimestamp,
              c.payload_json AS campaignPayloadJson,
              p.slot AS slot,
              sim.assignment_method AS similarityAssignmentMethod,
              sim.updated_at AS similarityUpdatedAt
            FROM altered_maps m
            LEFT JOIN altered_map_positions p ON p.map_uid = m.map_uid
            LEFT JOIN altered_campaigns c ON c.campaign_id = p.campaign_id
            LEFT JOIN altered_map_number_similarity sim ON sim.map_uid = m.map_uid
            ${reviewJoin}
            LEFT JOIN (
              SELECT p2.campaign_id AS campaignId, COUNT(*) AS mapCount
              FROM altered_map_positions p2
              GROUP BY p2.campaign_id
            ) campaign_counts ON campaign_counts.campaignId = c.campaign_id
            WHERE (? = '' OR LOWER(m.name) LIKE ? OR LOWER(m.map_uid) LIKE ?)
              ${mapUidWhere}
              ${clubWhere}
              ${reviewWhere}
              ${EXCLUDE_NONCANONICAL_WEEKLY_SHORTS_SQL}
              AND (
                sim.map_uid IS NULL
                OR (? <> '' AND LOWER(COALESCE(sim.assignment_method, '')) <> ?)
                OR json_extract(sim.candidate_matches_json, '$[0].weightedScore') IS NULL
              )
            ORDER BY
              CASE
                WHEN sim.map_uid IS NULL THEN 0
                WHEN (? <> '' AND LOWER(COALESCE(sim.assignment_method, '')) <> ?) THEN 1
                WHEN json_extract(sim.candidate_matches_json, '$[0].weightedScore') IS NULL THEN 2
                ELSE 3
              END ASC,
              COALESCE(c.name, 'Unassigned') COLLATE NOCASE ASC,
              COALESCE(p.slot, 9999) ASC,
              m.name COLLATE NOCASE ASC
            LIMIT ?
          `
          : `
            SELECT
              m.map_uid AS mapUid,
              m.map_id AS mapId,
              m.name AS name,
              m.map_type AS mapType,
              m.map_style AS mapStyle,
              m.map_environment AS mapEnvironment,
              m.author AS author,
              m.submitter AS submitter,
              m.download_url AS downloadUrl,
              NULL AS payloadJson,
              c.name AS campaign,
              c.campaign_id AS campaignId,
              c.external_campaign_id AS campaignExternalId,
              NULL AS campaignMapCount,
              c.start_timestamp AS campaignStartTimestamp,
              NULL AS campaignPayloadJson,
              p.slot AS slot,
              sim.assignment_method AS similarityAssignmentMethod,
              sim.updated_at AS similarityUpdatedAt
            FROM altered_maps m
            LEFT JOIN altered_map_positions p ON p.map_uid = m.map_uid
            LEFT JOIN altered_campaigns c ON c.campaign_id = p.campaign_id
            LEFT JOIN altered_map_number_similarity sim ON sim.map_uid = m.map_uid
            ${reviewJoin}
            WHERE (? = '' OR LOWER(m.name) LIKE ? OR LOWER(m.map_uid) LIKE ?)
              ${mapUidWhere}
              ${clubWhere}
              ${reviewWhere}
              ${EXCLUDE_NONCANONICAL_WEEKLY_SHORTS_SQL}
              AND (
                sim.map_uid IS NULL
                OR (? <> '' AND LOWER(COALESCE(sim.assignment_method, '')) <> ?)
                OR json_extract(sim.candidate_matches_json, '$[0].weightedScore') IS NULL
              )
            ORDER BY
              CASE
                WHEN sim.map_uid IS NULL THEN 0
                WHEN (? <> '' AND LOWER(COALESCE(sim.assignment_method, '')) <> ?) THEN 1
                WHEN json_extract(sim.candidate_matches_json, '$[0].weightedScore') IS NULL THEN 2
                ELSE 3
              END ASC,
              COALESCE(c.name, 'Unassigned') COLLATE NOCASE ASC,
              COALESCE(p.slot, 9999) ASC,
              m.name COLLATE NOCASE ASC
            LIMIT ?
          `
      )
      .all(
        query,
        pattern,
        pattern,
        ...safeMapUids,
        ...(safeClubId ? [safeClubId] : []),
        ...(reviewWhere ? [normalizedReview] : []),
        requiredMethod,
        requiredMethod,
        requiredMethod,
        requiredMethod,
        safeLimit
      )
      .map((row) => ({
        ...row,
        payload: parseJsonSafe(row.payloadJson, null),
        campaignPayload: parseJsonSafe(row.campaignPayloadJson, null),
      }));
  }

  upsertMapNameCandidates({ candidates = [] } = {}) {
    const list = Array.isArray(candidates) ? candidates : [];
    if (!list.length) {
      return {
        processed: 0,
        inserted: 0,
        updated: 0,
      };
    }

    const now = new Date().toISOString();
    const upsertStmt = this.db.prepare(
      `
        INSERT INTO altered_map_name_candidates (
          map_uid,
          original_name,
          sanitized_name,
          proposed_name,
          parser_pattern,
          parser_confidence,
          season,
          year,
          map_number,
          map_numbers_json,
          alteration_label,
          alteration_mix_json,
          automation_state,
          review_state,
          manual_name,
          review_note,
          requires_regex,
          source_version,
          created_at,
          updated_at,
          last_processed_at
        ) VALUES (
          ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', NULL, NULL, ?, ?, ?, ?, ?
        )
        ON CONFLICT(map_uid) DO UPDATE SET
          original_name = excluded.original_name,
          sanitized_name = excluded.sanitized_name,
          proposed_name = excluded.proposed_name,
          parser_pattern = excluded.parser_pattern,
          parser_confidence = excluded.parser_confidence,
          season = excluded.season,
          year = excluded.year,
          map_number = excluded.map_number,
          map_numbers_json = excluded.map_numbers_json,
          alteration_label = excluded.alteration_label,
          alteration_mix_json = excluded.alteration_mix_json,
          automation_state = excluded.automation_state,
          requires_regex = excluded.requires_regex,
          source_version = excluded.source_version,
          updated_at = excluded.updated_at,
          last_processed_at = excluded.last_processed_at,
          review_state = altered_map_name_candidates.review_state,
          manual_name = altered_map_name_candidates.manual_name,
          review_note = altered_map_name_candidates.review_note
      `
    );

    const existsStmt = this.db.prepare(
      `
      SELECT map_uid AS mapUid
      FROM altered_map_name_candidates
      WHERE map_uid = ?
      LIMIT 1
      `
    );

    let inserted = 0;
    let updated = 0;

    try {
      this.db.exec("BEGIN IMMEDIATE");
      for (const candidate of list) {
        const mapUid = String(candidate?.mapUid || "").trim();
        if (!mapUid) continue;
        const existed = Boolean(existsStmt.get(mapUid));
        upsertStmt.run(
          mapUid,
          String(candidate?.originalName || mapUid).trim() || mapUid,
          String(candidate?.sanitizedName || candidate?.originalName || mapUid).trim() || mapUid,
          String(candidate?.proposedName || "").trim() || null,
          String(candidate?.parserPattern || "").trim() || null,
          Number.isFinite(Number(candidate?.parserConfidence))
            ? Number(candidate.parserConfidence)
            : 0,
          String(candidate?.season || "").trim() || null,
            Number.isFinite(Number(candidate?.year)) ? Math.floor(Number(candidate.year)) : null,
            Number.isFinite(Number(candidate?.mapNumber))
              ? Math.floor(Number(candidate.mapNumber))
              : null,
            serializeJson(Array.isArray(candidate?.mapNumbers) ? candidate.mapNumbers : []),
            String(candidate?.alteration || "").trim() || null,
            serializeJson(Array.isArray(candidate?.alterationMix) ? candidate.alterationMix : []),
            String(candidate?.automationState || "").trim().toLowerCase() === "matched"
              ? "matched"
            : "unmatched",
          candidate?.requiresRegex ? 1 : 0,
          String(candidate?.sourceVersion || "").trim() || "sorting-v3-lite",
          now,
          now,
          now
        );
        if (existed) updated += 1;
        else inserted += 1;
      }
      this.db.exec("COMMIT");
    } catch (error) {
      try {
        this.db.exec("ROLLBACK");
      } catch {}
      return {
        error: error?.message || "Failed to upsert map naming candidates.",
        processed: inserted + updated,
        inserted,
        updated,
      };
    }

    return {
      processed: inserted + updated,
      inserted,
      updated,
    };
  }

  deleteMapNameCandidates({ mapUids = [] } = {}) {
    const safeMapUids = uniqueBy(
      (Array.isArray(mapUids) ? mapUids : [])
        .map((value) => toText(value))
        .filter(Boolean),
      (value) => value.toLowerCase()
    );
    if (!safeMapUids.length) {
      return {
        processed: 0,
        deleted: 0,
      };
    }

    const result = this.db
      .prepare(
        `
        DELETE FROM altered_map_name_candidates
        WHERE map_uid IN (${safeMapUids.map(() => "?").join(", ")})
        `
      )
      .run(...safeMapUids);

    return {
      processed: safeMapUids.length,
      deleted: Number(result?.changes || 0),
    };
  }

  getMapLocalFiles({ mapUids = [] } = {}) {
    const safeMapUids = uniqueBy(
      (Array.isArray(mapUids) ? mapUids : [])
        .map((value) => toText(value))
        .filter(Boolean),
      (value) => value.toLowerCase()
    );
    if (!safeMapUids.length) return [];
    const placeholders = safeMapUids.map(() => "?").join(", ");
    const rows = this.db
      .prepare(
        `
        SELECT
          map_uid AS mapUid,
          relative_path AS relativePath,
          download_url AS downloadUrl,
          file_sha256 AS fileSha256,
          file_size_bytes AS fileSizeBytes,
          downloaded_at AS downloadedAt,
          verified_at AS verifiedAt,
          status AS status,
          last_error AS lastError,
          updated_at AS updatedAt
        FROM altered_map_local_files
        WHERE map_uid IN (${placeholders})
        `
      )
      .all(...safeMapUids);
    return rows.map((row) => ({
      mapUid: row.mapUid,
      relativePath: row.relativePath || null,
      downloadUrl: row.downloadUrl || null,
      fileSha256: row.fileSha256 || null,
      fileSizeBytes: Number(row.fileSizeBytes || 0),
      downloadedAt: row.downloadedAt || null,
      verifiedAt: row.verifiedAt || null,
      status: row.status || "missing",
      lastError: row.lastError || null,
      updatedAt: row.updatedAt || null,
    }));
  }

  getMapLocalFileFixes({ mapUids = [] } = {}) {
    const safeMapUids = uniqueBy(
      (Array.isArray(mapUids) ? mapUids : [])
        .map((value) => toText(value))
        .filter(Boolean),
      (value) => value.toLowerCase()
    );
    if (!safeMapUids.length) return [];
    const placeholders = safeMapUids.map(() => "?").join(", ");
    const rows = this.db
      .prepare(
        `
        SELECT
          map_uid AS mapUid,
          relative_path AS relativePath,
          source_file_path AS sourceFilePath,
          file_sha256 AS fileSha256,
          file_size_bytes AS fileSizeBytes,
          imported_at AS importedAt,
          verified_at AS verifiedAt,
          status AS status,
          note AS note,
          last_error AS lastError,
          updated_at AS updatedAt
        FROM altered_map_local_file_fixes
        WHERE map_uid IN (${placeholders})
        `
      )
      .all(...safeMapUids);
    return rows.map(rowToMapLocalFileFix);
  }

  upsertMapLocalFileFixes({ records = [] } = {}) {
    const list = Array.isArray(records) ? records : [];
    if (!list.length) {
      return { processed: 0, inserted: 0, updated: 0 };
    }

    const now = new Date().toISOString();
    const existsStmt = this.db.prepare(
      `
      SELECT map_uid AS mapUid
      FROM altered_map_local_file_fixes
      WHERE map_uid = ?
      LIMIT 1
      `
    );
    const upsertStmt = this.db.prepare(
      `
      INSERT INTO altered_map_local_file_fixes (
        map_uid,
        relative_path,
        source_file_path,
        file_sha256,
        file_size_bytes,
        imported_at,
        verified_at,
        status,
        note,
        last_error,
        created_at,
        updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(map_uid) DO UPDATE SET
        relative_path = excluded.relative_path,
        source_file_path = excluded.source_file_path,
        file_sha256 = excluded.file_sha256,
        file_size_bytes = excluded.file_size_bytes,
        imported_at = excluded.imported_at,
        verified_at = excluded.verified_at,
        status = excluded.status,
        note = excluded.note,
        last_error = excluded.last_error,
        updated_at = excluded.updated_at
      `
    );

    let inserted = 0;
    let updated = 0;
    try {
      this.db.exec("BEGIN IMMEDIATE");
      for (const record of list) {
        const mapUid = toText(record?.mapUid);
        if (!mapUid) continue;
        const existed = Boolean(existsStmt.get(mapUid));
        upsertStmt.run(
          mapUid,
          toText(record?.relativePath) || null,
          toText(record?.sourceFilePath) || null,
          toText(record?.fileSha256) || null,
          Math.max(0, Number(record?.fileSizeBytes || 0) || 0),
          toNullableIso(record?.importedAt) || null,
          toNullableIso(record?.verifiedAt) || null,
          ["ready", "missing", "error"].includes(String(record?.status || "").trim().toLowerCase())
            ? String(record.status).trim().toLowerCase()
            : "missing",
          toText(record?.note) || null,
          toText(record?.lastError) || null,
          existed
            ? (
                this.db.prepare(
                  `SELECT created_at AS createdAt FROM altered_map_local_file_fixes WHERE map_uid = ? LIMIT 1`
                ).get(mapUid)?.createdAt || now
              )
            : now,
          now
        );
        if (existed) updated += 1;
        else inserted += 1;
      }
      this.db.exec("COMMIT");
    } catch (error) {
      try {
        this.db.exec("ROLLBACK");
      } catch {}
      return {
        error: error?.message || "Failed to upsert local map file fixes.",
        processed: inserted + updated,
        inserted,
        updated,
      };
    }

    return { processed: inserted + updated, inserted, updated };
  }

  upsertMapLocalFiles({ records = [] } = {}) {
    const list = Array.isArray(records) ? records : [];
    if (!list.length) {
      return { processed: 0, inserted: 0, updated: 0 };
    }

    const now = new Date().toISOString();
    const existsStmt = this.db.prepare(
      `
      SELECT map_uid AS mapUid
      FROM altered_map_local_files
      WHERE map_uid = ?
      LIMIT 1
      `
    );
    const upsertStmt = this.db.prepare(
      `
      INSERT INTO altered_map_local_files (
        map_uid,
        relative_path,
        download_url,
        file_sha256,
        file_size_bytes,
        downloaded_at,
        verified_at,
        status,
        last_error,
        updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(map_uid) DO UPDATE SET
        relative_path = excluded.relative_path,
        download_url = excluded.download_url,
        file_sha256 = excluded.file_sha256,
        file_size_bytes = excluded.file_size_bytes,
        downloaded_at = excluded.downloaded_at,
        verified_at = excluded.verified_at,
        status = excluded.status,
        last_error = excluded.last_error,
        updated_at = excluded.updated_at
      `
    );

    let inserted = 0;
    let updated = 0;
    try {
      this.db.exec("BEGIN IMMEDIATE");
      for (const record of list) {
        const mapUid = toText(record?.mapUid);
        if (!mapUid) continue;
        const existed = Boolean(existsStmt.get(mapUid));
        upsertStmt.run(
          mapUid,
          toText(record?.relativePath) || null,
          toText(record?.downloadUrl) || null,
          toText(record?.fileSha256) || null,
          Math.max(0, Number(record?.fileSizeBytes || 0) || 0),
          toNullableIso(record?.downloadedAt) || null,
          toNullableIso(record?.verifiedAt) || null,
          ["ready", "missing", "error"].includes(String(record?.status || "").trim().toLowerCase())
            ? String(record.status).trim().toLowerCase()
            : "missing",
          toText(record?.lastError) || null,
          now
        );
        if (existed) updated += 1;
        else inserted += 1;
      }
      this.db.exec("COMMIT");
    } catch (error) {
      try {
        this.db.exec("ROLLBACK");
      } catch {}
      return {
        error: error?.message || "Failed to upsert local map files.",
        processed: inserted + updated,
        inserted,
        updated,
      };
    }

    return { processed: inserted + updated, inserted, updated };
  }

  getMapLocalStoreSummary({ includeParserDiagnostics = false } = {}) {
    const totalMaps = Number(
      this.db.prepare("SELECT COUNT(*) AS count FROM altered_maps").get()?.count || 0
    );

    const localFileRows = this.db
      .prepare(
        `
        SELECT
          status,
          COUNT(*) AS count,
          SUM(COALESCE(file_size_bytes, 0)) AS totalBytes
        FROM altered_map_local_files
        GROUP BY status
        `
      )
      .all();
    const localFileCounts = new Map(
      localFileRows.map((row) => [
        toText(row?.status).toLowerCase(),
        {
          count: Number(row?.count || 0),
          totalBytes: Number(row?.totalBytes || 0),
        },
      ])
    );
    const downloadedCount = Number(localFileCounts.get("ready")?.count || 0);
    const explicitMissingCount = Number(localFileCounts.get("missing")?.count || 0);
    const errorCount = Number(localFileCounts.get("error")?.count || 0);
    const trackedLocalFileRows = [...localFileCounts.values()].reduce(
      (sum, entry) => sum + Number(entry?.count || 0),
      0
    );
    const missingCount = Math.max(0, totalMaps - trackedLocalFileRows) + explicitMissingCount;
    const totalBytes = Number(localFileCounts.get("ready")?.totalBytes || 0);

    const signatureRows = this.db
      .prepare(
        `
        SELECT source_status AS sourceStatus, COUNT(*) AS count
        FROM altered_map_content_signatures
        GROUP BY source_status
        `
      )
      .all();
    const signatureCounts = new Map(
      signatureRows.map((row) => [toText(row?.sourceStatus).toLowerCase(), Number(row?.count || 0)])
    );
    const signatureReadyCount = Number(signatureCounts.get("ready") || 0);
    const signatureErrorCount = Number(signatureCounts.get("error") || 0);

    const similarityReadyCount = Number(
      this.db
        .prepare(
          `
          SELECT COUNT(*) AS count
          FROM altered_map_number_similarity
          WHERE COALESCE(assigned_map_numbers_json, '[]') <> '[]'
          `
        )
        .get()?.count || 0
    );

    let fallbackSignatureCount = 0;
    let parserUnknownChunkCount = 0;
    let parserChunk164A8Count = 0;
    let parserInvalidStringLengthCount = 0;

    if (includeParserDiagnostics) {
      fallbackSignatureCount = Number(
        this.db
          .prepare(
            `
            SELECT COUNT(*) AS count
            FROM altered_map_content_signatures
            WHERE source_status = 'ready'
              AND extraction_version = 'asset-token-jaccard-v1-fallback'
            `
          )
          .get()?.count || 0
      );
      parserUnknownChunkCount = Number(
        this.db
          .prepare(
            `
            SELECT COUNT(*) AS count
            FROM altered_map_content_signatures
            WHERE source_status = 'ready'
              AND COALESCE(source_error, '') LIKE '%Unknown unskippable chunk%'
            `
          )
          .get()?.count || 0
      );
      parserChunk164A8Count = Number(
        this.db
          .prepare(
            `
            SELECT COUNT(*) AS count
            FROM altered_map_content_signatures
            WHERE source_status = 'ready'
              AND COALESCE(source_error, '') LIKE '%0x000164A8%'
            `
          )
          .get()?.count || 0
      );
      parserInvalidStringLengthCount = Number(
        this.db
          .prepare(
            `
            SELECT COUNT(*) AS count
            FROM altered_map_content_signatures
            WHERE source_status = 'ready'
              AND COALESCE(source_error, '') LIKE '%Invalid string length%'
            `
          )
          .get()?.count || 0
      );
    }

    return {
      totalMaps,
      downloadedCount,
      missingCount,
      errorCount,
      totalBytes,
      signatureReadyCount,
      signatureErrorCount,
      fallbackSignatureCount,
      parserUnknownChunkCount,
      parserChunk164A8Count,
      parserInvalidStringLengthCount,
      similarityReadyCount,
    };
  }

  listMapUidsForLocalFileStatus({ statuses = [], limit = 5000 } = {}) {
    const safeStatuses = uniqueBy(
      (Array.isArray(statuses) ? statuses : [statuses])
        .map((value) => toText(value).toLowerCase())
        .filter((value) => ["ready", "missing", "error"].includes(value)),
      (value) => value
    );
    if (!safeStatuses.length) return [];
    const placeholders = safeStatuses.map(() => "?").join(", ");
    const rows = this.db
      .prepare(
        `
        SELECT map_uid AS mapUid
        FROM altered_map_local_files
        WHERE status IN (${placeholders})
        ORDER BY updated_at DESC, map_uid ASC
        LIMIT ?
        `
      )
      .all(...safeStatuses, Math.max(1, Math.min(Number(limit) || 5000, 50000)));
    return rows.map((row) => toText(row.mapUid)).filter(Boolean);
  }

  listMapUidsNeedingLocalStoreBackfill({ limit = 5000 } = {}) {
    const safeLimit = Math.max(1, Math.min(Number(limit) || 5000, 50000));
    const rows = this.db
      .prepare(
        `
        SELECT DISTINCT m.map_uid AS mapUid
        FROM altered_maps m
        LEFT JOIN altered_map_local_files lf ON lf.map_uid = m.map_uid
        LEFT JOIN altered_map_content_signatures sig ON sig.map_uid = m.map_uid
        WHERE lf.map_uid IS NULL
          OR COALESCE(lf.status, 'missing') IN ('missing', 'error')
          OR COALESCE(sig.source_status, 'missing') <> 'ready'
        ORDER BY
          COALESCE(m.updated_at, m.created_at, '') DESC,
          m.map_uid ASC
        LIMIT ?
        `
      )
      .all(safeLimit);
    return rows.map((row) => toText(row.mapUid)).filter(Boolean);
  }

  getMapContentSignatures({ mapUids = [] } = {}) {
    const safeMapUids = uniqueBy(
      (Array.isArray(mapUids) ? mapUids : [])
        .map((value) => toText(value))
        .filter(Boolean),
      (value) => value.toLowerCase()
    );
    if (!safeMapUids.length) return [];
    const placeholders = safeMapUids.map(() => "?").join(", ");
    const rows = this.db
      .prepare(
        `
        SELECT
          map_uid AS mapUid,
          extraction_version AS extractionVersion,
          file_sha256 AS fileSha256,
          download_url AS downloadUrl,
          printable_token_count AS printableTokenCount,
          asset_token_count AS assetTokenCount,
          CASE
            WHEN LENGTH(COALESCE(signature_json, '')) <= ?
              THEN signature_json
            ELSE NULL
          END AS signatureJson,
          LENGTH(COALESCE(signature_json, '')) AS signatureJsonLength,
          source_status AS sourceStatus,
          source_error AS sourceError,
          extracted_at AS extractedAt,
          updated_at AS updatedAt
        FROM altered_map_content_signatures
        WHERE map_uid IN (${placeholders})
        `
      )
      .all(OVERSIZED_SIGNATURE_JSON_MAX_BYTES, ...safeMapUids);
    return rows.map((row) => {
      const signatureJsonLength = Number(row.signatureJsonLength || 0);
      const oversizedSignature = signatureJsonLength > OVERSIZED_SIGNATURE_JSON_MAX_BYTES;
      const signature = oversizedSignature
        ? buildOversizedSignatureFallback({
            assetTokenCount: row.assetTokenCount,
            printableTokenCount: row.printableTokenCount,
            signatureJsonLength,
          })
        : parseJsonSafe(row.signatureJson, null);
      const oversizedMessage = oversizedSignature
        ? `Stored signature JSON is ${signatureJsonLength} bytes; using lightweight fallback.`
        : null;
      return {
        mapUid: row.mapUid,
        extractionVersion: row.extractionVersion || null,
        fileSha256: row.fileSha256 || null,
        downloadUrl: row.downloadUrl || null,
        printableTokenCount: Number(row.printableTokenCount || 0),
        assetTokenCount: Number(row.assetTokenCount || 0),
        signature,
        sourceStatus: row.sourceStatus || "ready",
        sourceError: oversizedMessage || row.sourceError || null,
        extractedAt: row.extractedAt || null,
        updatedAt: row.updatedAt || null,
      };
    });
  }

  upsertMapContentSignatures({ records = [] } = {}) {
    const list = Array.isArray(records) ? records : [];
    if (!list.length) {
      return {
        processed: 0,
        inserted: 0,
        updated: 0,
      };
    }

    const now = new Date().toISOString();
    const existsStmt = this.db.prepare(
      `
      SELECT map_uid AS mapUid
      FROM altered_map_content_signatures
      WHERE map_uid = ?
      LIMIT 1
      `
    );
    const upsertStmt = this.db.prepare(
      `
      INSERT INTO altered_map_content_signatures (
        map_uid,
        extraction_version,
        file_sha256,
        download_url,
        printable_token_count,
        asset_token_count,
        signature_json,
        source_status,
        source_error,
        extracted_at,
        updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(map_uid) DO UPDATE SET
        extraction_version = excluded.extraction_version,
        file_sha256 = excluded.file_sha256,
        download_url = excluded.download_url,
        printable_token_count = excluded.printable_token_count,
        asset_token_count = excluded.asset_token_count,
        signature_json = excluded.signature_json,
        source_status = excluded.source_status,
        source_error = excluded.source_error,
        extracted_at = excluded.extracted_at,
        updated_at = excluded.updated_at
      `
    );

    let inserted = 0;
    let updated = 0;
    try {
      this.db.exec("BEGIN IMMEDIATE");
      for (const record of list) {
        const mapUid = toText(record?.mapUid);
        if (!mapUid) continue;
        const existed = Boolean(existsStmt.get(mapUid));
        upsertStmt.run(
          mapUid,
          toText(record?.extractionVersion, "asset-token-jaccard-v1"),
          toText(record?.fileSha256) || null,
          toText(record?.downloadUrl) || null,
          Math.max(0, Number(record?.printableTokenCount || 0) || 0),
          Math.max(0, Number(record?.assetTokenCount || 0) || 0),
          serializeJson(record?.signature),
          ["ready", "missing-download", "error"].includes(
            String(record?.sourceStatus || "").trim().toLowerCase()
          )
            ? String(record.sourceStatus).trim().toLowerCase()
            : "ready",
          toText(record?.sourceError) || null,
          toIso(record?.extractedAt, now),
          now
        );
        if (existed) updated += 1;
        else inserted += 1;
      }
      this.db.exec("COMMIT");
    } catch (error) {
      try {
        this.db.exec("ROLLBACK");
      } catch {}
      return {
        error: error?.message || "Failed to upsert map content signatures.",
        processed: inserted + updated,
        inserted,
        updated,
      };
    }

    return {
      processed: inserted + updated,
      inserted,
      updated,
    };
  }

  getMapNumberSimilarity({ mapUids = [] } = {}) {
    const safeMapUids = uniqueBy(
      (Array.isArray(mapUids) ? mapUids : [])
        .map((value) => toText(value))
        .filter(Boolean),
      (value) => value.toLowerCase()
    );
    if (!safeMapUids.length) return [];
    const placeholders = safeMapUids.map(() => "?").join(", ");
    const rows = this.db
      .prepare(
        `
        SELECT
          map_uid AS mapUid,
          family_key AS familyKey,
          reference_campaign_id AS referenceCampaignId,
          reference_campaign_name AS referenceCampaignName,
          primary_reference_map_uid AS primaryReferenceMapUid,
          primary_reference_slot AS primaryReferenceSlot,
          assigned_map_numbers_json AS assignedMapNumbersJson,
          top_score AS topScore,
          second_score AS secondScore,
          confidence AS confidence,
          assignment_method AS assignmentMethod,
          candidate_matches_json AS candidateMatchesJson,
          details_json AS detailsJson,
          updated_at AS updatedAt
        FROM altered_map_number_similarity
        WHERE map_uid IN (${placeholders})
        `
      )
      .all(...safeMapUids);
    return rows.map((row) => ({
      mapUid: row.mapUid,
      familyKey: row.familyKey || null,
      referenceCampaignId: Number(row.referenceCampaignId || 0) || null,
      referenceCampaignName: row.referenceCampaignName || null,
      primaryReferenceMapUid: row.primaryReferenceMapUid || null,
      primaryReferenceSlot: Number(row.primaryReferenceSlot || 0) || null,
      assignedMapNumbers: parseJsonSafe(row.assignedMapNumbersJson, []) || [],
      topScore: Number(row.topScore || 0),
      secondScore: Number(row.secondScore || 0),
      confidence: Number(row.confidence || 0),
      assignmentMethod: row.assignmentMethod || "asset-token-jaccard-v1",
      candidateMatches: parseJsonSafe(row.candidateMatchesJson, []) || [],
      details: parseJsonSafe(row.detailsJson, null),
      updatedAt: row.updatedAt || null,
    }));
  }

  upsertMapNumberSimilarity({ records = [] } = {}) {
    const list = Array.isArray(records) ? records : [];
    if (!list.length) {
      return {
        processed: 0,
        inserted: 0,
        updated: 0,
      };
    }

    const now = new Date().toISOString();
    const existsStmt = this.db.prepare(
      `
      SELECT map_uid AS mapUid
      FROM altered_map_number_similarity
      WHERE map_uid = ?
      LIMIT 1
      `
    );
    const upsertStmt = this.db.prepare(
      `
      INSERT INTO altered_map_number_similarity (
        map_uid,
        family_key,
        reference_campaign_id,
        reference_campaign_name,
        primary_reference_map_uid,
        primary_reference_slot,
        assigned_map_numbers_json,
        top_score,
        second_score,
        confidence,
        assignment_method,
        candidate_matches_json,
        details_json,
        updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(map_uid) DO UPDATE SET
        family_key = excluded.family_key,
        reference_campaign_id = excluded.reference_campaign_id,
        reference_campaign_name = excluded.reference_campaign_name,
        primary_reference_map_uid = excluded.primary_reference_map_uid,
        primary_reference_slot = excluded.primary_reference_slot,
        assigned_map_numbers_json = excluded.assigned_map_numbers_json,
        top_score = excluded.top_score,
        second_score = excluded.second_score,
        confidence = excluded.confidence,
        assignment_method = excluded.assignment_method,
        candidate_matches_json = excluded.candidate_matches_json,
        details_json = excluded.details_json,
        updated_at = excluded.updated_at
      `
    );

    let inserted = 0;
    let updated = 0;
    try {
      this.db.exec("BEGIN IMMEDIATE");
      for (const record of list) {
        const mapUid = toText(record?.mapUid);
        if (!mapUid) continue;
        const existed = Boolean(existsStmt.get(mapUid));
        upsertStmt.run(
          mapUid,
          toText(record?.familyKey) || null,
          clampInt(record?.referenceCampaignId, { min: 1, max: 2147483647, fallback: 0 }) || null,
          toText(record?.referenceCampaignName) || null,
          toText(record?.primaryReferenceMapUid) || null,
          clampInt(record?.primaryReferenceSlot, { min: 1, max: 999, fallback: 0 }) || null,
          serializeJson(Array.isArray(record?.assignedMapNumbers) ? record.assignedMapNumbers : []),
          Number.isFinite(Number(record?.topScore)) ? Number(record.topScore) : 0,
          Number.isFinite(Number(record?.secondScore)) ? Number(record.secondScore) : 0,
          Number.isFinite(Number(record?.confidence)) ? Number(record.confidence) : 0,
          toText(record?.assignmentMethod, "asset-token-jaccard-v1"),
          serializeJson(Array.isArray(record?.candidateMatches) ? record.candidateMatches : []),
          serializeJson(record?.details),
          now
        );
        if (existed) updated += 1;
        else inserted += 1;
      }
      this.db.exec("COMMIT");
    } catch (error) {
      try {
        this.db.exec("ROLLBACK");
      } catch {}
      return {
        error: error?.message || "Failed to upsert map-number similarity results.",
        processed: inserted + updated,
        inserted,
        updated,
      };
    }

    return {
      processed: inserted + updated,
      inserted,
      updated,
    };
  }

  bulkApproveMapNameCandidates({ mapUids = [], reviewNote = "" } = {}) {
    const safeMapUids = uniqueBy(
      (Array.isArray(mapUids) ? mapUids : [])
        .map((value) => toText(value))
        .filter(Boolean),
      (value) => value.toLowerCase()
    );
    if (!safeMapUids.length) {
      return { processed: 0, approved: 0 };
    }
    const now = new Date().toISOString();
    const placeholders = safeMapUids.map(() => "?").join(", ");
    const result = this.db
      .prepare(
        `
        UPDATE altered_map_name_candidates
        SET
          review_state = 'approved',
          review_note = CASE
            WHEN COALESCE(TRIM(?), '') <> '' THEN ?
            ELSE review_note
          END,
          updated_at = ?
        WHERE map_uid IN (${placeholders})
          AND review_state = 'pending'
        `
      )
      .run(toText(reviewNote), toText(reviewNote) || null, now, ...safeMapUids);
    return {
      processed: safeMapUids.length,
      approved: Number(result?.changes || 0),
    };
  }

  getMapNameCandidateSummary() {
    const row = this.db
      .prepare(
        `
        SELECT
          COUNT(*) AS total,
          SUM(CASE WHEN automation_state = 'matched' THEN 1 ELSE 0 END) AS matched,
          SUM(CASE WHEN automation_state = 'unmatched' THEN 1 ELSE 0 END) AS unmatched,
          SUM(CASE WHEN review_state = 'pending' THEN 1 ELSE 0 END) AS pending,
          SUM(
            CASE
              WHEN review_state = 'pending' AND (
                automation_state = 'unmatched'
                OR requires_regex = 1
                OR COALESCE(json_extract(sim.details_json, '$.manualReviewRequired'), 0) = 1
                OR COALESCE(json_extract(sim.details_json, '$.hasAmbiguousCloseSlots'), 0) = 1
                OR COALESCE(json_extract(sim.details_json, '$.closeSlotCount'), 0) > 1
                OR LOWER(COALESCE(json_extract(sim.details_json, '$.matchClassification'), '')) IN ('ambiguous-close-slots', 'fallback-manual-review')
              ) THEN 1
              ELSE 0
            END
          ) AS pendingManualReview,
          SUM(CASE WHEN review_state = 'pending' AND automation_state = 'matched' THEN 1 ELSE 0 END) AS pendingMatched,
          SUM(CASE WHEN review_state = 'approved' THEN 1 ELSE 0 END) AS approved,
          SUM(CASE WHEN review_state = 'ignored' THEN 1 ELSE 0 END) AS ignored,
          SUM(CASE WHEN requires_regex = 1 THEN 1 ELSE 0 END) AS requiresRegex,
          SUM(CASE WHEN COALESCE(TRIM(manual_name), '') <> '' THEN 1 ELSE 0 END) AS manualNamed
        FROM altered_map_name_candidates
        LEFT JOIN altered_map_positions p ON p.map_uid = altered_map_name_candidates.map_uid
        LEFT JOIN altered_campaigns c ON c.campaign_id = p.campaign_id
        LEFT JOIN altered_map_number_similarity sim ON sim.map_uid = altered_map_name_candidates.map_uid
        WHERE 1 = 1
          ${EXCLUDE_NONCANONICAL_WEEKLY_SHORTS_SQL}
        `
      )
      .get();

    return {
      total: Number(row?.total || 0),
      matched: Number(row?.matched || 0),
      unmatched: Number(row?.unmatched || 0),
      pending: Number(row?.pending || 0),
      pendingManualReview: Number(row?.pendingManualReview || 0),
      pendingMatched: Number(row?.pendingMatched || 0),
      approved: Number(row?.approved || 0),
      ignored: Number(row?.ignored || 0),
      requiresRegex: Number(row?.requiresRegex || 0),
      manualNamed: Number(row?.manualNamed || 0),
    };
  }

  listMapNameCandidates({
    q = "",
    automationState = "",
    reviewState = "",
    requiresRegex = undefined,
    limit = 220,
    offset = 0,
  } = {}) {
    const where = [];
    const params = [];

    const query = String(q || "").trim().toLowerCase();
    if (query) {
      const pattern = `%${query}%`;
      where.push(
        `(LOWER(n.map_uid) LIKE ? OR LOWER(n.original_name) LIKE ? OR LOWER(COALESCE(n.proposed_name, '')) LIKE ? OR LOWER(COALESCE(n.manual_name, '')) LIKE ? OR LOWER(COALESCE(c.name, '')) LIKE ?)`
      );
      params.push(pattern, pattern, pattern, pattern, pattern);
    }

    const normalizedAutomation = String(automationState || "").trim().toLowerCase();
    if (normalizedAutomation === "matched" || normalizedAutomation === "unmatched") {
      where.push(`n.automation_state = ?`);
      params.push(normalizedAutomation);
    }

    const normalizedReview = String(reviewState || "").trim().toLowerCase();
    if (
      normalizedReview === "pending" ||
      normalizedReview === "approved" ||
      normalizedReview === "ignored"
    ) {
      where.push(`n.review_state = ?`);
      params.push(normalizedReview);
    }

    if (requiresRegex === true || requiresRegex === false) {
      where.push(`n.requires_regex = ?`);
      params.push(requiresRegex ? 1 : 0);
    }

    const whereSql = where.length ? `WHERE ${where.join(" AND ")}` : "";
    const safeLimit = Math.max(1, Math.min(Number(limit) || 220, 1200));
    const safeOffset = Math.max(0, Math.min(Number(offset) || 0, 1_000_000));

    const rows = this.db
      .prepare(
        `
        SELECT
          n.map_uid AS mapUid,
          n.original_name AS originalName,
          n.sanitized_name AS sanitizedName,
          n.proposed_name AS proposedName,
          n.manual_name AS manualName,
          COALESCE(NULLIF(n.manual_name, ''), NULLIF(n.proposed_name, ''), n.sanitized_name, n.original_name) AS finalName,
          n.parser_pattern AS parserPattern,
          n.parser_confidence AS parserConfidence,
          n.season AS season,
          n.year AS year,
          n.map_number AS mapNumber,
          n.map_numbers_json AS mapNumbersJson,
          n.alteration_label AS alterationLabel,
          n.alteration_mix_json AS alterationMixJson,
          n.automation_state AS automationState,
          n.review_state AS reviewState,
          n.requires_regex AS requiresRegex,
          n.review_note AS reviewNote,
          n.source_version AS sourceVersion,
          n.updated_at AS updatedAt,
          n.last_processed_at AS lastProcessedAt,
          c.name AS campaign,
          c.campaign_id AS campaignId,
          p.slot AS slot,
          m.tracked AS tracked,
          m.status AS status,
          lf.status AS localFileStatus,
          lf.relative_path AS localFilePath,
          sig.source_status AS signatureStatus,
          sig.source_error AS signatureError,
          CASE
            WHEN sim.map_uid IS NOT NULL AND COALESCE(sim.assigned_map_numbers_json, '[]') <> '[]' THEN 'matched'
            WHEN sim.map_uid IS NOT NULL THEN 'scanned'
            ELSE 'missing'
          END AS similarityStatus,
          sim.top_score AS similarityTopScore,
          sim.confidence AS similarityConfidence,
          sim.reference_campaign_name AS similarityReferenceCampaignName,
          sim.primary_reference_slot AS similarityReferenceSlot,
          sim.candidate_matches_json AS similarityCandidateMatchesJson,
          sim.details_json AS similarityDetailsJson
        FROM altered_map_name_candidates n
        LEFT JOIN altered_maps m ON m.map_uid = n.map_uid
        LEFT JOIN altered_map_positions p ON p.map_uid = n.map_uid
        LEFT JOIN altered_campaigns c ON c.campaign_id = p.campaign_id
        LEFT JOIN altered_map_local_files lf ON lf.map_uid = n.map_uid
        LEFT JOIN altered_map_content_signatures sig ON sig.map_uid = n.map_uid
        LEFT JOIN altered_map_number_similarity sim ON sim.map_uid = n.map_uid
        ${whereSql}
        ${EXCLUDE_NONCANONICAL_WEEKLY_SHORTS_SQL}
        ORDER BY
          CASE n.review_state
            WHEN 'pending' THEN 0
            WHEN 'approved' THEN 1
            WHEN 'ignored' THEN 2
            ELSE 3
          END ASC,
          CASE n.automation_state
            WHEN 'unmatched' THEN 0
            ELSE 1
          END ASC,
          n.parser_confidence DESC,
          COALESCE(c.name, 'Unassigned') COLLATE NOCASE ASC,
          COALESCE(p.slot, 9999) ASC,
          n.original_name COLLATE NOCASE ASC
        LIMIT ?
        OFFSET ?
        `
      )
      .all(...params, safeLimit, safeOffset);

    return rows.map(rowToNameCandidate);
  }

  countMapNameCandidates({
    q = "",
    automationState = "",
    reviewState = "",
    requiresRegex = undefined,
  } = {}) {
    const where = ["1 = 1"];
    const params = [];

    const query = String(q || "").trim().toLowerCase();
    if (query) {
      const pattern = `%${query}%`;
      where.push(
        `(LOWER(n.map_uid) LIKE ? OR LOWER(n.original_name) LIKE ? OR LOWER(COALESCE(n.proposed_name, '')) LIKE ? OR LOWER(COALESCE(n.manual_name, '')) LIKE ? OR LOWER(COALESCE(c.name, '')) LIKE ?)`
      );
      params.push(pattern, pattern, pattern, pattern, pattern);
    }

    const normalizedAutomation = String(automationState || "").trim().toLowerCase();
    if (normalizedAutomation === "matched" || normalizedAutomation === "unmatched") {
      where.push(`n.automation_state = ?`);
      params.push(normalizedAutomation);
    }

    const normalizedReview = String(reviewState || "").trim().toLowerCase();
    if (normalizedReview === "pending" || normalizedReview === "approved" || normalizedReview === "ignored") {
      where.push(`n.review_state = ?`);
      params.push(normalizedReview);
    }

    if (requiresRegex === true || requiresRegex === false) {
      where.push(`n.requires_regex = ?`);
      params.push(requiresRegex ? 1 : 0);
    }

    const row = this.db
      .prepare(
        `
        SELECT COUNT(*) AS cnt
        FROM altered_map_name_candidates n
        LEFT JOIN altered_map_positions p ON p.map_uid = n.map_uid
        LEFT JOIN altered_campaigns c ON c.campaign_id = p.campaign_id
        LEFT JOIN altered_map_number_similarity sim ON sim.map_uid = n.map_uid
        WHERE ${where.join(" AND ")}
          ${EXCLUDE_NONCANONICAL_WEEKLY_SHORTS_SQL}
        `
      )
      .get(...params);

    return Number(row?.cnt || 0);
  }

  getMapNameCandidate(mapUid) {
    const uid = String(mapUid || "").trim();
    if (!uid) return null;
    const row = this.db
      .prepare(
        `
        SELECT
          n.map_uid AS mapUid,
          n.original_name AS originalName,
          n.sanitized_name AS sanitizedName,
          n.proposed_name AS proposedName,
          n.manual_name AS manualName,
          COALESCE(NULLIF(n.manual_name, ''), NULLIF(n.proposed_name, ''), n.sanitized_name, n.original_name) AS finalName,
          n.parser_pattern AS parserPattern,
          n.parser_confidence AS parserConfidence,
          n.season AS season,
          n.year AS year,
          n.map_number AS mapNumber,
          n.map_numbers_json AS mapNumbersJson,
          n.alteration_label AS alterationLabel,
          n.alteration_mix_json AS alterationMixJson,
          n.automation_state AS automationState,
          n.review_state AS reviewState,
          n.requires_regex AS requiresRegex,
          n.review_note AS reviewNote,
          n.source_version AS sourceVersion,
          n.updated_at AS updatedAt,
          n.last_processed_at AS lastProcessedAt,
          c.name AS campaign,
          c.campaign_id AS campaignId,
          p.slot AS slot,
          m.tracked AS tracked,
          m.status AS status,
          lf.status AS localFileStatus,
          lf.relative_path AS localFilePath,
          sig.source_status AS signatureStatus,
          sig.source_error AS signatureError,
          CASE
            WHEN sim.map_uid IS NOT NULL AND COALESCE(sim.assigned_map_numbers_json, '[]') <> '[]' THEN 'matched'
            WHEN sim.map_uid IS NOT NULL THEN 'scanned'
            ELSE 'missing'
          END AS similarityStatus,
          sim.top_score AS similarityTopScore,
          sim.confidence AS similarityConfidence,
          sim.reference_campaign_name AS similarityReferenceCampaignName,
          sim.primary_reference_slot AS similarityReferenceSlot,
          sim.candidate_matches_json AS similarityCandidateMatchesJson,
          sim.details_json AS similarityDetailsJson
        FROM altered_map_name_candidates n
        LEFT JOIN altered_maps m ON m.map_uid = n.map_uid
        LEFT JOIN altered_map_positions p ON p.map_uid = n.map_uid
        LEFT JOIN altered_campaigns c ON c.campaign_id = p.campaign_id
        LEFT JOIN altered_map_local_files lf ON lf.map_uid = n.map_uid
        LEFT JOIN altered_map_content_signatures sig ON sig.map_uid = n.map_uid
        LEFT JOIN altered_map_number_similarity sim ON sim.map_uid = n.map_uid
        WHERE LOWER(n.map_uid) = LOWER(?)
        LIMIT 1
        `
      )
      .get(uid);
    if (!row) return null;
    return rowToNameCandidate(row);
  }

  updateMapNameCandidateReview({ mapUid, reviewState, manualName, reviewNote } = {}) {
    const uid = String(mapUid || "").trim();
    if (!uid) return { error: "mapUid is required." };
    const updates = [];
    const params = [];

    const normalizedReview = String(reviewState || "").trim().toLowerCase();
    if (
      normalizedReview === "pending" ||
      normalizedReview === "approved" ||
      normalizedReview === "ignored"
    ) {
      updates.push("review_state = ?");
      params.push(normalizedReview);
    }

    if (manualName !== undefined) {
      const normalizedManual = String(manualName || "").trim();
      updates.push("manual_name = ?");
      params.push(normalizedManual || null);
    }

    if (reviewNote !== undefined) {
      const normalizedNote = String(reviewNote || "").trim();
      updates.push("review_note = ?");
      params.push(normalizedNote || null);
    }

    if (!updates.length) {
      return { error: "Nothing to update." };
    }

    const now = new Date().toISOString();
    updates.push("updated_at = ?");
    params.push(now);
    params.push(uid);

    const result = this.db
      .prepare(
        `
        UPDATE altered_map_name_candidates
        SET ${updates.join(", ")}
        WHERE LOWER(map_uid) = LOWER(?)
        `
      )
      .run(...params);

    if (!Number(result?.changes || 0)) {
      return { error: "Map naming candidate not found." };
    }

    const candidate = this.getMapNameCandidate(uid);
    return {
      ok: true,
      candidate,
    };
  }

  getMapInfo(mapUid) {
    const uid = String(mapUid || "").trim();
    if (!uid) return { exists: false };
    const row = this.db
      .prepare(
        `
        SELECT
          m.map_uid AS uid,
          m.map_id AS mapId,
          m.name AS name,
          m.map_type AS mapType,
          m.map_style AS mapStyle,
          m.map_environment AS mapEnvironment,
          c.name AS campaign,
          c.campaign_id AS campaignId,
          c.external_campaign_id AS campaignExternalId,
          campaign_counts.mapCount AS campaignMapCount,
          p.slot AS slot,
          m.author AS author,
          m.author_display_name AS authorDisplayName,
          m.submitter AS submitter,
          m.submitter_display_name AS submitterDisplayName,
          m.author_time AS authorMs,
          m.gold_time AS goldMs,
          m.silver_time AS silverMs,
          m.bronze_time AS bronzeMs,
          m.nb_laps AS laps,
          m.thumbnail_url AS thumbnailUrl,
          m.download_url AS downloadUrl,
          m.player_count AS playerCount,
          m.player_count_updated_at AS playerCountUpdatedAt,
          m.wr_ms AS wrMs,
          m.wr_holder AS wrHolder,
          m.wr_updated_at AS wrUpdatedAt,
          m.tracked AS tracked,
          m.status AS status,
          m.check_frequency AS checkFrequency,
          m.last_checked_at AS lastCheckedAt,
          m.map_created_at AS mapCreatedAt,
          m.map_updated_at AS mapUpdatedAt,
          m.payload_json AS payloadJson,
          c.payload_json AS campaignPayloadJson,
          n.original_name AS derivedOriginalName,
          n.sanitized_name AS derivedSanitizedName,
          n.proposed_name AS derivedProposedName,
          n.manual_name AS derivedManualName,
          n.season AS derivedSeason,
          n.year AS derivedYear,
          n.map_number AS derivedMapNumber,
          n.alteration_mix_json AS derivedAlterationMixJson,
          n.parser_pattern AS derivedParserPattern,
          n.parser_confidence AS derivedParserConfidence,
          n.source_version AS derivedSourceVersion,
          n.map_numbers_json AS derivedMapNumbersJson,
          n.alteration_label AS derivedAlterationLabel
          FROM altered_maps m
          LEFT JOIN altered_map_positions p ON p.map_uid = m.map_uid
          LEFT JOIN altered_campaigns c ON c.campaign_id = p.campaign_id
          LEFT JOIN (
            SELECT p2.campaign_id AS campaignId, COUNT(*) AS mapCount
            FROM altered_map_positions p2
            GROUP BY p2.campaign_id
          ) campaign_counts ON campaign_counts.campaignId = c.campaign_id
          LEFT JOIN altered_map_name_candidates n ON n.map_uid = m.map_uid
          WHERE LOWER(m.map_uid) = LOWER(?)
          LIMIT 1
        `
      )
      .get(uid);

    if (!row) return { exists: false };
    return {
      exists: true,
      map: {
        ...rowToMap(row),
        payload: parseJsonSafe(row.payloadJson, null),
        campaignPayload: parseJsonSafe(row.campaignPayloadJson, null),
        derivedNameCandidate:
          row.derivedOriginalName || row.derivedSanitizedName || row.derivedProposedName
            ? {
                originalName: row.derivedOriginalName || null,
                sanitizedName: row.derivedSanitizedName || null,
                proposedName: row.derivedProposedName || null,
                manualName: row.derivedManualName || null,
                season: row.derivedSeason || null,
                year: Number(row.derivedYear || 0) || null,
                mapNumber: Number(row.derivedMapNumber || 0) || null,
                mapNumbers: parseJsonSafe(row.derivedMapNumbersJson, []) || [],
                alteration: row.derivedAlterationLabel || null,
                alterationMix: parseJsonSafe(row.derivedAlterationMixJson, []) || [],
                parserPattern: row.derivedParserPattern || null,
                parserConfidence: Number(row.derivedParserConfidence || 0),
                sourceVersion: row.derivedSourceVersion || null,
              }
            : null,
      },
    };
  }

  upsertMapperNames({ accountIds = [], namesByAccountId = {}, source = "trackmania-oauth" } = {}) {
    const normalizedAccountIds = uniqueBy(
      (Array.isArray(accountIds) ? accountIds : [])
        .map((accountId) => normalizeAccountId(accountId))
        .filter(Boolean),
      (accountId) => accountId
    );
    if (!normalizedAccountIds.length) {
      return {
        accountsSeen: 0,
        namesResolved: 0,
        namesUpdated: 0,
        historyInserted: 0,
      };
    }

    const now = new Date().toISOString();
    const safeSource = String(source || "").trim() || "trackmania-oauth";
    const selectStmt = this.db.prepare(
      `
      SELECT latest_display_name AS latestDisplayName
      FROM altered_mapper_accounts
      WHERE account_id = ?
      LIMIT 1
      `
    );
    const accountUpsertStmt = this.db.prepare(
      `
      INSERT INTO altered_mapper_accounts (
        account_id,
        latest_display_name,
        latest_source,
        first_seen_at,
        last_seen_at,
        last_resolved_at,
        last_resolution_error,
        created_at,
        updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(account_id) DO UPDATE SET
        latest_display_name = COALESCE(NULLIF(excluded.latest_display_name, ''), altered_mapper_accounts.latest_display_name),
        latest_source = COALESCE(NULLIF(excluded.latest_source, ''), altered_mapper_accounts.latest_source),
        last_seen_at = excluded.last_seen_at,
        last_resolved_at = COALESCE(excluded.last_resolved_at, altered_mapper_accounts.last_resolved_at),
        last_resolution_error = excluded.last_resolution_error,
        updated_at = excluded.updated_at
      `
    );
    const historyInsertStmt = this.db.prepare(
      `
      INSERT OR IGNORE INTO altered_mapper_name_history (
        account_id,
        display_name,
        observed_at,
        source,
        created_at
      ) VALUES (?, ?, ?, ?, ?)
      `
    );

    const namesMap =
      namesByAccountId && typeof namesByAccountId === "object" ? namesByAccountId : {};

    let namesResolved = 0;
    let namesUpdated = 0;
    let historyInserted = 0;

    try {
      this.db.exec("BEGIN");
      for (const accountId of normalizedAccountIds) {
        const existing = selectStmt.get(accountId);
        const displayName = sanitizeResolvedDisplayName(namesMap[accountId], { accountId });
        const hasDisplayName = Boolean(displayName);
        if (hasDisplayName) namesResolved += 1;

        accountUpsertStmt.run(
          accountId,
          hasDisplayName ? displayName : null,
          hasDisplayName ? safeSource : null,
          now,
          now,
          hasDisplayName ? now : null,
          hasDisplayName ? null : "display-name-not-resolved",
          now,
          now
        );

        if (hasDisplayName && String(existing?.latestDisplayName || "") !== displayName) {
          namesUpdated += 1;
        }

        if (hasDisplayName) {
          const result = historyInsertStmt.run(accountId, displayName, now, safeSource, now);
          if (Number(result?.changes || 0) > 0) historyInserted += 1;
        }
      }
      this.db.exec("COMMIT");
    } catch (error) {
      try {
        this.db.exec("ROLLBACK");
      } catch {}
      return { error: error?.message || "Failed to upsert mapper names." };
    }

    return {
      accountsSeen: normalizedAccountIds.length,
      namesResolved,
      namesUpdated,
      historyInserted,
    };
  }

  updateMapMapperDisplayNames({ namesByAccountId = {} } = {}) {
    const entries = Object.entries(
      namesByAccountId && typeof namesByAccountId === "object" ? namesByAccountId : {}
    )
      .map(([rawAccountId, rawDisplayName]) => ({
        accountId: normalizeAccountId(rawAccountId),
        displayName: sanitizeResolvedDisplayName(rawDisplayName, {
          accountId: normalizeAccountId(rawAccountId),
        }),
      }))
      .filter((entry) => entry.accountId && entry.displayName);
    if (!entries.length) return { updated: 0 };

    const updateAuthorStmt = this.db.prepare(
      `
      UPDATE altered_maps
      SET
        author_display_name = ?,
        updated_at = ?
      WHERE LOWER(COALESCE(author, '')) = ?
      `
    );
    const updateSubmitterStmt = this.db.prepare(
      `
      UPDATE altered_maps
      SET
        submitter_display_name = ?,
        updated_at = ?
      WHERE LOWER(COALESCE(submitter, '')) = ?
      `
    );
    const updateWrHolderStmt = this.db.prepare(
      `
      UPDATE altered_maps
      SET
        wr_holder = ?,
        updated_at = ?
      WHERE
        LOWER(COALESCE(wr_holder, '')) = ?
        AND COALESCE(wr_holder, '') <> ?
      `
    );
    const updateWrEventHolderStmt = this.db.prepare(
      `
      UPDATE altered_wr_events
      SET holder = ?
      WHERE
        LOWER(COALESCE(account_id, '')) = ?
        AND LOWER(COALESCE(holder, '')) = ?
        AND COALESCE(holder, '') <> ?
      `
    );

    let updated = 0;
    const now = new Date().toISOString();
    try {
      this.db.exec("BEGIN");
      for (const entry of entries) {
        const authorResult = updateAuthorStmt.run(entry.displayName, now, entry.accountId);
        updated += Number(authorResult?.changes || 0);
        const submitterResult = updateSubmitterStmt.run(entry.displayName, now, entry.accountId);
        updated += Number(submitterResult?.changes || 0);
        const wrHolderResult = updateWrHolderStmt.run(
          entry.displayName,
          now,
          entry.accountId,
          entry.displayName
        );
        updated += Number(wrHolderResult?.changes || 0);
        const wrEventHolderResult = updateWrEventHolderStmt.run(
          entry.displayName,
          entry.accountId,
          entry.accountId,
          entry.displayName
        );
        updated += Number(wrEventHolderResult?.changes || 0);
      }
      this.db.exec("COMMIT");
    } catch (error) {
      try {
        this.db.exec("ROLLBACK");
      } catch {}
      return {
        error: error?.message || "Failed to apply resolved display names to altered storage.",
        updated,
      };
    }

    return { updated };
  }

  listKnownMapperAccountIds({ limit = 50000 } = {}) {
    const safeLimit = clampInt(limit, { min: 1, max: 250000, fallback: 50000 });
    const rows = this.db
      .prepare(
        `
        SELECT account_id AS accountId FROM altered_mapper_accounts
        UNION
        SELECT LOWER(TRIM(author)) AS accountId
        FROM altered_maps
        WHERE NULLIF(TRIM(COALESCE(author, '')), '') IS NOT NULL
        UNION
        SELECT LOWER(TRIM(submitter)) AS accountId
        FROM altered_maps
        WHERE NULLIF(TRIM(COALESCE(submitter, '')), '') IS NOT NULL
        UNION
        SELECT LOWER(TRIM(wr_holder)) AS accountId
        FROM altered_maps
        WHERE NULLIF(TRIM(COALESCE(wr_holder, '')), '') IS NOT NULL
        UNION
        SELECT LOWER(TRIM(account_id)) AS accountId
        FROM altered_club_members
        WHERE NULLIF(TRIM(COALESCE(account_id, '')), '') IS NOT NULL
        UNION
        SELECT LOWER(TRIM(author_account_id)) AS accountId
        FROM altered_club_activities
        WHERE NULLIF(TRIM(COALESCE(author_account_id, '')), '') IS NOT NULL
        UNION
        SELECT LOWER(TRIM(author_account_id)) AS accountId
        FROM altered_upload_maps
        WHERE NULLIF(TRIM(COALESCE(author_account_id, '')), '') IS NOT NULL
        LIMIT ?
        `
      )
      .all(safeLimit);

    return uniqueBy(
      rows
        .map((row) => normalizeAccountId(row?.accountId))
        .filter(Boolean),
      (accountId) => accountId
    );
  }

  seedMapperAccounts({ accountIds = [], source = "seed" } = {}) {
    const normalizedAccountIds = uniqueBy(
      (Array.isArray(accountIds) ? accountIds : [])
        .map((accountId) => normalizeAccountId(accountId))
        .filter(Boolean),
      (accountId) => accountId
    );
    if (!normalizedAccountIds.length) {
      return { accountsSeen: 0, inserted: 0, updated: 0 };
    }

    const now = new Date().toISOString();
    const safeSource = String(source || "").trim() || "seed";
    const existsStmt = this.db.prepare(
      `
      SELECT 1 AS present
      FROM altered_mapper_accounts
      WHERE account_id = ?
      LIMIT 1
      `
    );
    const upsertStmt = this.db.prepare(
      `
      INSERT INTO altered_mapper_accounts (
        account_id,
        latest_display_name,
        latest_source,
        first_seen_at,
        last_seen_at,
        last_resolved_at,
        last_resolution_error,
        created_at,
        updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(account_id) DO UPDATE SET
        latest_source = COALESCE(NULLIF(altered_mapper_accounts.latest_source, ''), excluded.latest_source),
        last_seen_at = excluded.last_seen_at
      `
    );

    let inserted = 0;
    let updated = 0;
    try {
      this.db.exec("BEGIN");
      for (const accountId of normalizedAccountIds) {
        const existed = Boolean(existsStmt.get(accountId));
        upsertStmt.run(
          accountId,
          null,
          safeSource,
          now,
          now,
          null,
          null,
          now,
          now
        );
        if (existed) updated += 1;
        else inserted += 1;
      }
      this.db.exec("COMMIT");
    } catch (error) {
      try {
        this.db.exec("ROLLBACK");
      } catch {}
      return {
        error: error?.message || "Failed to seed mapper accounts.",
        accountsSeen: normalizedAccountIds.length,
        inserted,
        updated,
      };
    }

    return {
      accountsSeen: normalizedAccountIds.length,
      inserted,
      updated,
    };
  }

  getMapperAccountStats() {
    const rows = this.db
      .prepare(
        `
        SELECT
          account_id AS accountId,
          latest_display_name AS latestDisplayName,
          last_resolved_at AS lastResolvedAt
        FROM altered_mapper_accounts
        `
      )
      .all();

    let unresolvedAccounts = 0;
    let neverResolvedAccounts = 0;
    let latestResolvedAtMs = 0;
    let oldestResolvedAtMs = 0;
    for (const row of rows) {
      const accountId = normalizeAccountId(row?.accountId);
      const hasDisplayName = hasResolvedDisplayName(row?.latestDisplayName, { accountId });
      if (!hasDisplayName) unresolvedAccounts += 1;
      const resolvedAt = toNullableIso(row?.lastResolvedAt) || null;
      if (!resolvedAt) {
        neverResolvedAccounts += 1;
        continue;
      }
      const resolvedAtMs = Date.parse(resolvedAt);
      if (!Number.isFinite(resolvedAtMs)) continue;
      latestResolvedAtMs = Math.max(latestResolvedAtMs, resolvedAtMs);
      oldestResolvedAtMs =
        oldestResolvedAtMs > 0 ? Math.min(oldestResolvedAtMs, resolvedAtMs) : resolvedAtMs;
    }

    return {
      totalAccounts: Number(rows.length || 0),
      unresolvedAccounts,
      neverResolvedAccounts,
      latestResolvedAt: latestResolvedAtMs > 0 ? new Date(latestResolvedAtMs).toISOString() : null,
      oldestResolvedAt: oldestResolvedAtMs > 0 ? new Date(oldestResolvedAtMs).toISOString() : null,
    };
  }

  getMapperAccountsForSync({ limit = 50, accountIds = [], minResolvedAgeSeconds = 0 } = {}) {
    const safeLimit = clampInt(limit, { min: 1, max: 5000, fallback: 50 });
    const safeMinResolvedAgeSeconds = clampInt(minResolvedAgeSeconds, {
      min: 0,
      max: 30 * 24 * 60 * 60,
      fallback: 0,
    });
    const filteredAccountIds = uniqueBy(
      (Array.isArray(accountIds) ? accountIds : [])
        .map((accountId) => normalizeAccountId(accountId))
        .filter(Boolean),
      (accountId) => accountId
    );
    const params = [];
    let whereClause = "";
    if (filteredAccountIds.length) {
      const placeholders = filteredAccountIds.map(() => "?").join(", ");
      whereClause = `WHERE account_id IN (${placeholders})`;
      params.push(...filteredAccountIds);
    }

    const staleBeforeMs =
      safeMinResolvedAgeSeconds > 0 ? Date.now() - safeMinResolvedAgeSeconds * 1000 : 0;
    const rows = this.db
      .prepare(
        `
        SELECT
          account_id AS accountId,
          latest_display_name AS latestDisplayName,
          last_resolved_at AS lastResolvedAt,
          last_resolution_error AS lastResolutionError,
          updated_at AS updatedAt,
          first_seen_at AS firstSeenAt
        FROM altered_mapper_accounts
        ${whereClause}
        `
      )
      .all(...params);

    return rows
      .map((row) => ({
        accountId: normalizeAccountId(row.accountId),
        latestDisplayName:
          sanitizeResolvedDisplayName(row.latestDisplayName, {
            accountId: normalizeAccountId(row.accountId),
          }) || null,
        lastResolvedAt: toNullableIso(row.lastResolvedAt) || null,
        lastResolutionError: String(row.lastResolutionError || "").trim() || null,
        updatedAt: toNullableIso(row.updatedAt) || null,
        firstSeenAt: toNullableIso(row.firstSeenAt) || null,
      }))
      .filter((row) => {
        if (!row.accountId) return false;
        if (!safeMinResolvedAgeSeconds) return true;
        if (!row.latestDisplayName) return true;
        const resolvedAtMs = Date.parse(String(row.lastResolvedAt || ""));
        return !Number.isFinite(resolvedAtMs) || resolvedAtMs <= staleBeforeMs;
      })
      .sort((a, b) => {
        const aResolved = a.latestDisplayName ? 1 : 0;
        const bResolved = b.latestDisplayName ? 1 : 0;
        if (aResolved !== bResolved) return aResolved - bResolved;
        const aSeenAt =
          Date.parse(String(a.lastResolvedAt || a.updatedAt || a.firstSeenAt || "")) || 0;
        const bSeenAt =
          Date.parse(String(b.lastResolvedAt || b.updatedAt || b.firstSeenAt || "")) || 0;
        if (aSeenAt !== bSeenAt) return aSeenAt - bSeenAt;
        return String(a.accountId || "").localeCompare(String(b.accountId || ""));
      })
      .slice(0, safeLimit)
      .map(({ firstSeenAt, ...row }) => row);
  }

  upsertCampaign({
    clubId,
    campaignName,
    externalCampaignId,
    activityId,
    activityType = "",
    campaignType = "",
    startTimestamp = null,
    endTimestamp = null,
    published = undefined,
    leaderboardGroupUid = "",
    payload = null,
  }) {
    const club = clampInt(clubId, { min: 0, max: 2147483647, fallback: 0 });
    const name = String(campaignName || "").trim();
    const externalId = clampInt(externalCampaignId, {
      min: 1,
      max: 2147483647,
      fallback: 0,
    });
    const normalizedExternalId = externalId || null;
    if ((!Number.isFinite(club) && club !== 0) || !name) return null;

    const now = new Date().toISOString();
    const normalizedActivityId = clampInt(activityId, {
      min: 1,
      max: 2147483647,
      fallback: 0,
    });
    const normalizedActivityType = String(activityType || "").trim() || null;
    const normalizedCampaignType = String(campaignType || "").trim() || null;
    const normalizedStart = toNullableIso(startTimestamp);
    const normalizedEnd = toNullableIso(endTimestamp);
    const normalizedPublished = Boolean(published);
    const normalizedLeaderboardGroupUid = String(leaderboardGroupUid || "").trim() || null;
    const payloadJson = serializeJson(payload);

    const byExternal =
      normalizedExternalId === null
        ? null
        : this.db
            .prepare(
              `
              SELECT
                campaign_id AS campaignId,
                name,
                external_campaign_id AS externalCampaignId
              FROM altered_campaigns
              WHERE club_id = ? AND external_campaign_id = ?
              LIMIT 1
              `
            )
            .get(club, normalizedExternalId) || null;
    const byName =
      this.db
        .prepare(
          `
          SELECT
            campaign_id AS campaignId,
            name,
            external_campaign_id AS externalCampaignId
          FROM altered_campaigns
          WHERE club_id = ? AND name = ?
          LIMIT 1
          `
        )
        .get(club, name) || null;

    let target = byExternal;
    if (!target && byName) {
      const byNameExternalId = clampInt(byName.externalCampaignId, {
        min: 1,
        max: 2147483647,
        fallback: 0,
      });
      if (!normalizedExternalId || !byNameExternalId || byNameExternalId === normalizedExternalId) {
        target = byName;
      }
    }

    const pickUniqueName = (desiredName, excludeCampaignId = 0) => {
      let candidate = desiredName;
      let suffix = 2;
      while (true) {
        const existing =
          this.db
            .prepare(
              `
              SELECT campaign_id AS campaignId
              FROM altered_campaigns
              WHERE club_id = ? AND name = ?
              LIMIT 1
              `
            )
            .get(club, candidate) || null;
        if (!existing || Number(existing.campaignId || 0) === Number(excludeCampaignId || 0)) {
          return candidate;
        }
        candidate = `${desiredName} (${suffix})`;
        suffix += 1;
      }
    };

    let desiredName = name;
    if (normalizedExternalId !== null) {
      const conflictByName =
        this.db
          .prepare(
            `
            SELECT
              campaign_id AS campaignId,
              external_campaign_id AS externalCampaignId
            FROM altered_campaigns
            WHERE club_id = ? AND name = ?
            LIMIT 1
            `
          )
          .get(club, name) || null;
      if (conflictByName) {
        const conflictCampaignId = Number(conflictByName.campaignId || 0);
        const conflictExternalId = clampInt(conflictByName.externalCampaignId, {
          min: 1,
          max: 2147483647,
          fallback: 0,
        });
        if (
          conflictCampaignId &&
          conflictCampaignId !== Number(target?.campaignId || 0) &&
          conflictExternalId > 0 &&
          conflictExternalId !== normalizedExternalId
        ) {
          desiredName = normalizeCampaignStorageName(name, normalizedExternalId);
        }
      }
    }

    let campaignPk = Number(target?.campaignId || 0);
    const existingTargetRow =
      campaignPk > 0
        ? this.db
            .prepare(
              `
              SELECT
                external_campaign_id AS externalCampaignId,
                activity_id AS activityId,
                activity_type AS activityType,
                campaign_type AS campaignType,
                start_timestamp AS startTimestamp,
                end_timestamp AS endTimestamp,
                published AS published,
                leaderboard_group_uid AS leaderboardGroupUid,
                payload_json AS payloadJson
              FROM altered_campaigns
              WHERE campaign_id = ?
              LIMIT 1
              `
            )
            .get(campaignPk)
        : null;
    const resolvedExternalId =
      normalizedExternalId !== null
        ? normalizedExternalId
        : clampInt(existingTargetRow?.externalCampaignId, {
            min: 1,
            max: 2147483647,
            fallback: 0,
          }) || null;
    const resolvedActivityId =
      normalizedActivityId > 0
        ? normalizedActivityId
        : clampInt(existingTargetRow?.activityId, {
            min: 1,
            max: 2147483647,
            fallback: 0,
          }) || null;
    const resolvedActivityType =
      normalizedActivityType !== null
        ? normalizedActivityType
        : toText(existingTargetRow?.activityType || "") || null;
    const resolvedCampaignType =
      normalizedCampaignType !== null
        ? normalizedCampaignType
        : toText(existingTargetRow?.campaignType || "") || null;
    const resolvedStart =
      normalizedStart !== null ? normalizedStart : existingTargetRow?.startTimestamp || null;
    const resolvedEnd = normalizedEnd !== null ? normalizedEnd : existingTargetRow?.endTimestamp || null;
    const resolvedPublished =
      typeof published === "boolean"
        ? normalizedPublished
        : Boolean(Number(existingTargetRow?.published || 0));
    const resolvedLeaderboardGroupUid =
      normalizedLeaderboardGroupUid !== null
        ? normalizedLeaderboardGroupUid
        : toText(existingTargetRow?.leaderboardGroupUid || "") || null;
    const resolvedPayloadJson = payloadJson !== null ? payloadJson : existingTargetRow?.payloadJson || null;

    if (!target) {
      const uniqueName = pickUniqueName(desiredName, 0);
      const insertResult = this.db
        .prepare(
          `
          INSERT INTO altered_campaigns (
            club_id,
            name,
            external_campaign_id,
            activity_id,
            activity_type,
            campaign_type,
            start_timestamp,
            end_timestamp,
            published,
            leaderboard_group_uid,
            payload_json,
            monitor_updated_at,
            created_at,
            updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          `
        )
        .run(
          club,
          uniqueName,
          resolvedExternalId,
          resolvedActivityId,
          resolvedActivityType,
          resolvedCampaignType,
          resolvedStart,
          resolvedEnd,
          resolvedPublished ? 1 : 0,
          resolvedLeaderboardGroupUid,
          resolvedPayloadJson,
          now,
          now,
          now
        );
      campaignPk = Number(insertResult.lastInsertRowid || 0);
    } else {
      const targetId = Number(target.campaignId || 0);
      const uniqueName = pickUniqueName(desiredName, targetId);
      this.db
        .prepare(
          `
          UPDATE altered_campaigns
          SET
            name = ?,
            external_campaign_id = ?,
            activity_id = ?,
            activity_type = ?,
            campaign_type = ?,
            start_timestamp = ?,
            end_timestamp = ?,
            published = ?,
            leaderboard_group_uid = ?,
            payload_json = ?,
            monitor_updated_at = ?,
            updated_at = ?
          WHERE campaign_id = ?
          `
        )
        .run(
          uniqueName,
          resolvedExternalId,
          resolvedActivityId,
          resolvedActivityType,
          resolvedCampaignType,
          resolvedStart,
          resolvedEnd,
          resolvedPublished ? 1 : 0,
          resolvedLeaderboardGroupUid,
          resolvedPayloadJson,
          now,
          now,
          targetId
        );
      campaignPk = targetId;
    }

    if (campaignPk) {
      this.syncCampaignAlterationsById(campaignPk);
      return (
        this.db
          .prepare(
            `
            SELECT
              campaign_id AS campaignId,
              name,
              external_campaign_id AS externalCampaignId
            FROM altered_campaigns
            WHERE campaign_id = ?
            LIMIT 1
            `
          )
          .get(campaignPk) || null
      );
    }

    return null;
  }

  upsertCampaignByName({ clubId, campaignName, ...rest }) {
    return this.upsertCampaign({
      clubId,
      campaignName,
      ...rest,
    });
  }

  updateMapCampaign({ mapUid, campaignName, slot = 1 }) {
    const map = this.db
      .prepare("SELECT map_uid AS uid FROM altered_maps WHERE map_uid = ? LIMIT 1")
      .get(mapUid);
    if (!map) return null;

    const hook = this.getHookConfig(DEFAULT_HOOK_KEY) || this.ensureDefaultHookConfig();
    const campaign = this.upsertCampaignByName({
      clubId: hook.clubId,
      campaignName,
    });
    if (!campaign) return null;

    const now = new Date().toISOString();
    this.db
      .prepare(
        `
        INSERT INTO altered_map_positions (map_uid, campaign_id, slot, updated_at)
        VALUES (?, ?, ?, ?)
        ON CONFLICT(map_uid) DO UPDATE SET
          campaign_id = excluded.campaign_id,
          slot = excluded.slot,
          updated_at = excluded.updated_at
        `
      )
      .run(mapUid, campaign.campaignId, Math.max(1, Math.floor(slot)), now);

    this.db.prepare("UPDATE altered_maps SET updated_at = ? WHERE map_uid = ?").run(now, mapUid);
    return this.getMapInfo(mapUid);
  }

  updateMapTracking({ mapUid, tracked, status, checkFrequency }) {
    const sets = ["updated_at = ?"];
    const params = [new Date().toISOString()];

    if (typeof tracked === "boolean") {
      sets.push("tracked = ?");
      params.push(tracked ? 1 : 0);
    }
    if (typeof status === "string") {
      sets.push("status = ?");
      params.push(normalizeStatus(status, "live"));
    }
    if (Number.isFinite(checkFrequency)) {
      sets.push("check_frequency = ?");
      params.push(clampInt(checkFrequency, { min: 120, max: 604800, fallback: 21600 }));
    }

    params.push(mapUid);
    const result = this.db
      .prepare(`UPDATE altered_maps SET ${sets.join(", ")} WHERE map_uid = ?`)
      .run(...params);
    if (!result.changes) return null;
    return this.getMapInfo(mapUid);
  }

  listHookRuns(limit = 30, hookKey = DEFAULT_HOOK_KEY) {
    const rows = this.db
      .prepare(
        `
        SELECT
          run_id AS runId,
          started_at AS startedAt,
          finished_at AS finishedAt,
          campaigns_seen AS campaignsSeen,
          maps_seen AS mapsSeen,
          maps_inserted AS mapsInserted,
          maps_updated AS mapsUpdated,
          maps_linked AS mapsLinked,
          status AS status,
          note AS note
        FROM altered_sync_runs
        WHERE hook_key = ?
        ORDER BY run_id DESC
        LIMIT ?
        `
      )
      .all(hookKey, Math.max(1, Math.min(Number(limit) || 30, 300)));

    return rows.map((row) => ({
      runId: Number(row.runId || 0),
      startedAt: row.startedAt,
      finishedAt: row.finishedAt,
      campaignsSeen: Number(row.campaignsSeen || 0),
      mapsSeen: Number(row.mapsSeen || 0),
      mapsInserted: Number(row.mapsInserted || 0),
      mapsUpdated: Number(row.mapsUpdated || 0),
      mapsLinked: Number(row.mapsLinked || 0),
      status: row.status || "ok",
      note: row.note || "",
    }));
  }

  getHookStatus(hookKey = DEFAULT_HOOK_KEY) {
    const hook = this.getHookConfig(hookKey);
    if (!hook) return null;
    let mapCount = 0;
    let trackedCount = 0;
    let campaignCount = 0;
    if (hookKey === DEFAULT_HOOK_KEY) {
      mapCount = this.db.prepare("SELECT COUNT(*) AS count FROM altered_maps").get()?.count || 0;
      trackedCount =
        this.db
          .prepare("SELECT COUNT(*) AS count FROM altered_maps WHERE tracked = 1")
          .get()?.count || 0;
      campaignCount =
        this.db.prepare("SELECT COUNT(*) AS count FROM altered_campaigns").get()?.count || 0;
    } else {
      campaignCount =
        this.db
          .prepare("SELECT COUNT(*) AS count FROM altered_campaigns WHERE club_id = ?")
          .get(hook.clubId)?.count || 0;
      mapCount =
        this.db
          .prepare(
            `
            SELECT COUNT(DISTINCT p.map_uid) AS count
            FROM altered_map_positions p
            JOIN altered_campaigns c ON c.campaign_id = p.campaign_id
            WHERE c.club_id = ?
            `
          )
          .get(hook.clubId)?.count || 0;
      trackedCount =
        this.db
          .prepare(
            `
            SELECT COUNT(DISTINCT m.map_uid) AS count
            FROM altered_maps m
            JOIN altered_map_positions p ON p.map_uid = m.map_uid
            JOIN altered_campaigns c ON c.campaign_id = p.campaign_id
            WHERE c.club_id = ? AND m.tracked = 1
            `
          )
          .get(hook.clubId)?.count || 0;
    }
    const latestRun = this.listHookRuns(1, hookKey)[0] || null;
    return {
      ...hook,
      mapCount: Number(mapCount),
      trackedCount: Number(trackedCount),
      campaignCount: Number(campaignCount),
      latestRun,
    };
  }

  listHookStatuses({ includeDisabled = true } = {}) {
    return this.listHookConfigs({ includeDisabled }).map((hook) => {
      const campaignCount =
        this.db
          .prepare("SELECT COUNT(*) AS count FROM altered_campaigns WHERE club_id = ?")
          .get(hook.clubId)?.count || 0;
      const mapCount =
        this.db
          .prepare(
            `
            SELECT COUNT(DISTINCT p.map_uid) AS count
            FROM altered_map_positions p
            JOIN altered_campaigns c ON c.campaign_id = p.campaign_id
            WHERE c.club_id = ?
            `
          )
          .get(hook.clubId)?.count || 0;
      const trackedCount =
        this.db
          .prepare(
            `
            SELECT COUNT(DISTINCT m.map_uid) AS count
            FROM altered_maps m
            JOIN altered_map_positions p ON p.map_uid = m.map_uid
            JOIN altered_campaigns c ON c.campaign_id = p.campaign_id
            WHERE c.club_id = ? AND m.tracked = 1
            `
          )
          .get(hook.clubId)?.count || 0;
      return {
        ...hook,
        mapCount: Number(mapCount),
        trackedCount: Number(trackedCount),
        campaignCount: Number(campaignCount),
        latestRun: this.listHookRuns(1, hook.hookKey)[0] || null,
      };
    });
  }

  getKnownCampaignExternalIds({ clubId, campaignExternalIds = [] } = {}) {
    const safeClubId = clampInt(clubId, { min: 1, max: 2147483647, fallback: 0 });
    if (!safeClubId) return [];
    const ids = uniqueBy(
      (Array.isArray(campaignExternalIds) ? campaignExternalIds : [])
        .map((value) => clampInt(value, { min: 1, max: 2147483647, fallback: 0 }))
        .filter((value) => value > 0),
      (value) => value
    );
    if (!ids.length) return [];
    const placeholders = ids.map(() => "?").join(", ");
    return this.db
      .prepare(
        `
        SELECT external_campaign_id AS externalCampaignId
        FROM altered_campaigns
        WHERE club_id = ? AND external_campaign_id IN (${placeholders})
        `
      )
      .all(safeClubId, ...ids)
      .map((row) => clampInt(row?.externalCampaignId, { min: 1, max: 2147483647, fallback: 0 }))
      .filter((value) => value > 0);
  }

  getKnownActivityIds({ clubId, activityIds = [] } = {}) {
    const safeClubId = clampInt(clubId, { min: 1, max: 2147483647, fallback: 0 });
    if (!safeClubId) return [];
    const ids = uniqueBy(
      (Array.isArray(activityIds) ? activityIds : [])
        .map((value) => clampInt(value, { min: 1, max: 2147483647, fallback: 0 }))
        .filter((value) => value > 0),
      (value) => value
    );
    if (!ids.length) return [];
    const placeholders = ids.map(() => "?").join(", ");
    return this.db
      .prepare(
        `
        SELECT activity_id AS activityId
        FROM altered_club_activities
        WHERE club_id = ? AND activity_id IN (${placeholders})
        `
      )
      .all(safeClubId, ...ids)
      .map((row) => clampInt(row?.activityId, { min: 1, max: 2147483647, fallback: 0 }))
      .filter((value) => value > 0);
  }

  getKnownUploadBucketIds({ clubId, bucketIds = [] } = {}) {
    const safeClubId = clampInt(clubId, { min: 1, max: 2147483647, fallback: 0 });
    if (!safeClubId) return [];
    const ids = uniqueBy(
      (Array.isArray(bucketIds) ? bucketIds : [])
        .map((value) => clampInt(value, { min: 1, max: 2147483647, fallback: 0 }))
        .filter((value) => value > 0),
      (value) => value
    );
    if (!ids.length) return [];
    const placeholders = ids.map(() => "?").join(", ");
    return this.db
      .prepare(
        `
        SELECT bucket_id AS bucketId
        FROM altered_upload_buckets
        WHERE club_id = ? AND bucket_id IN (${placeholders})
        `
      )
      .all(safeClubId, ...ids)
      .map((row) => clampInt(row?.bucketId, { min: 1, max: 2147483647, fallback: 0 }))
      .filter((value) => value > 0);
  }

  upsertClubMonitoringData({ clubId, members = [], activities = [], uploadBuckets = [] } = {}) {
    const safeClubId = clampInt(clubId, { min: 1, max: 2147483647, fallback: 0 });
    if (!safeClubId) {
      return { error: "clubId is required." };
    }

    const now = new Date().toISOString();
    const counters = {
      membersSeen: 0,
      membersInserted: 0,
      membersUpdated: 0,
      activitiesSeen: 0,
      activitiesInserted: 0,
      activitiesUpdated: 0,
      uploadBucketsSeen: 0,
      uploadBucketsInserted: 0,
      uploadBucketsUpdated: 0,
      uploadMapsSeen: 0,
      uploadMapsInserted: 0,
      uploadMapsUpdated: 0,
    };

    const normalizedMembers = uniqueBy(
      (Array.isArray(members) ? members : [])
        .map((raw) => {
          const accountId = normalizeLooseId(
            raw?.accountId ?? raw?.account_id ?? raw?.memberId ?? raw?.member_id ?? raw?.playerId ?? raw?.id
          );
          if (!accountId) return null;
          const role = firstTruthy([
            raw?.role,
            raw?.memberRole,
            raw?.member_role,
            raw?.clubRole,
            raw?.club_role,
            raw?.type,
          ]);
          const status = firstTruthy([raw?.status, raw?.memberStatus, raw?.member_status, raw?.state]);
          const normalizedRole = role.toLowerCase();
          return {
            accountId,
            displayName: firstTruthy([
              raw?.displayName,
              raw?.display_name,
              raw?.name,
              raw?.nickname,
              raw?.login,
              raw?.accountName,
            ]),
            role,
            status,
            isAdmin:
              boolFromAny(raw?.isAdmin) ||
              boolFromAny(raw?.admin) ||
              normalizedRole.includes("admin") ||
              normalizedRole.includes("owner"),
            isVip: boolFromAny(raw?.isVip) || boolFromAny(raw?.vip) || normalizedRole.includes("vip"),
            isCreator:
              boolFromAny(raw?.isCreator) ||
              boolFromAny(raw?.creator) ||
              normalizedRole.includes("creator"),
            joinedAt: toNullableIso(raw?.joinedAt ?? raw?.joined_at ?? raw?.joinDate ?? raw?.join_date),
            leftAt: toNullableIso(raw?.leftAt ?? raw?.left_at ?? raw?.leaveDate ?? raw?.leave_date),
            payload: raw,
          };
        })
        .filter(Boolean),
      (item) => item.accountId
    );

    const normalizedActivities = uniqueBy(
      (Array.isArray(activities) ? activities : [])
        .map((raw) => {
          const activityId = clampInt(raw?.activityId ?? raw?.activity_id ?? raw?.id, {
            min: 1,
            max: 2147483647,
            fallback: 0,
          });
          if (!activityId) return null;
          const mapUid = firstTruthy([
            raw?.mapUid,
            raw?.map_uid,
            raw?.map?.uid,
            raw?.track?.uid,
            raw?.item?.uid,
          ]);
          return {
            activityId,
            activityType: firstTruthy([raw?.activityType, raw?.activity_type, raw?.type]),
            itemType: firstTruthy([raw?.itemType, raw?.item_type, raw?.targetType, raw?.target_type]),
            name: firstTruthy([raw?.name, raw?.itemName, raw?.item_name, raw?.title]),
            campaignExternalId:
              clampInt(raw?.campaignId ?? raw?.campaign_id ?? raw?.campaign?.id, {
                min: 1,
                max: 2147483647,
                fallback: 0,
              }) || null,
            bucketId:
              clampInt(raw?.bucketId ?? raw?.bucket_id ?? raw?.activityObjectId ?? raw?.objectId, {
                min: 1,
                max: 2147483647,
                fallback: 0,
              }) || null,
            mapUid: mapUid || null,
            authorAccountId: normalizeLooseId(
              raw?.author ?? raw?.authorId ?? raw?.author_id ?? raw?.accountId ?? raw?.account_id
            ),
            active: boolFromAny(raw?.active ?? raw?.isActive ?? raw?.enabled),
            occurredAt: toNullableIso(
              raw?.occurredAt ??
                raw?.occurred_at ??
                raw?.timestamp ??
                raw?.createdAt ??
                raw?.created_at ??
                raw?.activityAt ??
                raw?.activity_at
            ),
            payload: raw,
          };
        })
        .filter(Boolean),
      (item) => item.activityId
    );

    const normalizedUploadBuckets = uniqueBy(
      (Array.isArray(uploadBuckets) ? uploadBuckets : [])
        .map((raw) => {
          const bucketId = clampInt(raw?.bucketId ?? raw?.bucket_id ?? raw?.id, {
            min: 1,
            max: 2147483647,
            fallback: 0,
          });
          if (!bucketId) return null;
          const maps = uniqueBy(
            (Array.isArray(raw?.maps) ? raw.maps : [])
              .map((map, index) => {
                const mapUid = firstTruthy([map?.uid, map?.mapUid, map?.map_uid]);
                if (!mapUid) return null;
                return {
                  mapUid,
                  slot: normalizeCampaignSlotValue({
                    slot: map?.slot,
                    order: map?.order,
                    position: map?.position,
                    fallbackSlot: index + 1,
                    max: 100000,
                  }),
                  mapName: firstTruthy([map?.name, map?.title, mapUid]),
                  authorAccountId: normalizeLooseId(
                    map?.author ?? map?.authorId ?? map?.author_id ?? map?.accountId ?? map?.account_id
                  ),
                  payload: map,
                };
              })
              .filter(Boolean),
            (map) => map.mapUid.toLowerCase()
          );
          return {
            bucketId,
            bucketType: firstTruthy([raw?.bucketType, raw?.bucket_type, raw?.type]) || "map",
            name: firstTruthy([raw?.name, raw?.title, raw?.bucketName, raw?.bucket_name]),
            activityId:
              clampInt(raw?.activityId ?? raw?.activity_id ?? raw?.activity?.id, {
                min: 1,
                max: 2147483647,
                fallback: 0,
              }) || null,
            mapCount: clampInt(raw?.mapCount ?? raw?.map_count ?? maps.length, {
              min: 0,
              max: 2147483647,
              fallback: maps.length,
            }),
            active: boolFromAny(raw?.active ?? raw?.isActive ?? true),
            maps,
            payload: raw,
          };
        })
        .filter(Boolean),
      (item) => item.bucketId
    );

    const selectMemberStmt = this.db.prepare(
      `
      SELECT 1 AS present
      FROM altered_club_members
      WHERE club_id = ? AND account_id = ?
      LIMIT 1
      `
    );
    const upsertMemberStmt = this.db.prepare(
      `
      INSERT INTO altered_club_members (
        club_id,
        account_id,
        display_name,
        role,
        status,
        is_admin,
        is_vip,
        is_creator,
        joined_at,
        left_at,
        payload_json,
        first_seen_at,
        last_seen_at,
        updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(club_id, account_id) DO UPDATE SET
        display_name = COALESCE(NULLIF(excluded.display_name, ''), altered_club_members.display_name),
        role = COALESCE(NULLIF(excluded.role, ''), altered_club_members.role),
        status = COALESCE(NULLIF(excluded.status, ''), altered_club_members.status),
        is_admin = excluded.is_admin,
        is_vip = excluded.is_vip,
        is_creator = excluded.is_creator,
        joined_at = COALESCE(excluded.joined_at, altered_club_members.joined_at),
        left_at = excluded.left_at,
        payload_json = COALESCE(excluded.payload_json, altered_club_members.payload_json),
        last_seen_at = excluded.last_seen_at,
        updated_at = excluded.updated_at
      `
    );

    const selectActivityStmt = this.db.prepare(
      `
      SELECT 1 AS present
      FROM altered_club_activities
      WHERE club_id = ? AND activity_id = ?
      LIMIT 1
      `
    );
    const upsertActivityStmt = this.db.prepare(
      `
      INSERT INTO altered_club_activities (
        club_id,
        activity_id,
        activity_type,
        item_type,
        name,
        campaign_external_id,
        bucket_id,
        map_uid,
        author_account_id,
        active,
        occurred_at,
        payload_json,
        first_seen_at,
        last_seen_at,
        updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(club_id, activity_id) DO UPDATE SET
        activity_type = COALESCE(NULLIF(excluded.activity_type, ''), altered_club_activities.activity_type),
        item_type = COALESCE(NULLIF(excluded.item_type, ''), altered_club_activities.item_type),
        name = COALESCE(NULLIF(excluded.name, ''), altered_club_activities.name),
        campaign_external_id = COALESCE(excluded.campaign_external_id, altered_club_activities.campaign_external_id),
        bucket_id = COALESCE(excluded.bucket_id, altered_club_activities.bucket_id),
        map_uid = COALESCE(NULLIF(excluded.map_uid, ''), altered_club_activities.map_uid),
        author_account_id = COALESCE(NULLIF(excluded.author_account_id, ''), altered_club_activities.author_account_id),
        active = excluded.active,
        occurred_at = COALESCE(excluded.occurred_at, altered_club_activities.occurred_at),
        payload_json = COALESCE(excluded.payload_json, altered_club_activities.payload_json),
        last_seen_at = excluded.last_seen_at,
        updated_at = excluded.updated_at
      `
    );

    const selectUploadBucketStmt = this.db.prepare(
      `
      SELECT 1 AS present
      FROM altered_upload_buckets
      WHERE club_id = ? AND bucket_id = ?
      LIMIT 1
      `
    );
    const upsertUploadBucketStmt = this.db.prepare(
      `
      INSERT INTO altered_upload_buckets (
        club_id,
        bucket_id,
        bucket_type,
        name,
        activity_id,
        map_count,
        active,
        payload_json,
        first_seen_at,
        last_seen_at,
        updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(club_id, bucket_id) DO UPDATE SET
        bucket_type = COALESCE(NULLIF(excluded.bucket_type, ''), altered_upload_buckets.bucket_type),
        name = COALESCE(NULLIF(excluded.name, ''), altered_upload_buckets.name),
        activity_id = COALESCE(excluded.activity_id, altered_upload_buckets.activity_id),
        map_count = excluded.map_count,
        active = excluded.active,
        payload_json = COALESCE(excluded.payload_json, altered_upload_buckets.payload_json),
        last_seen_at = excluded.last_seen_at,
        updated_at = excluded.updated_at
      `
    );

    const selectUploadMapStmt = this.db.prepare(
      `
      SELECT 1 AS present
      FROM altered_upload_maps
      WHERE club_id = ? AND bucket_id = ? AND map_uid = ?
      LIMIT 1
      `
    );
    const upsertUploadMapStmt = this.db.prepare(
      `
      INSERT INTO altered_upload_maps (
        club_id,
        bucket_id,
        map_uid,
        slot,
        map_name,
        author_account_id,
        payload_json,
        first_seen_at,
        last_seen_at,
        updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(club_id, bucket_id, map_uid) DO UPDATE SET
        slot = excluded.slot,
        map_name = COALESCE(NULLIF(excluded.map_name, ''), altered_upload_maps.map_name),
        author_account_id = COALESCE(NULLIF(excluded.author_account_id, ''), altered_upload_maps.author_account_id),
        payload_json = COALESCE(excluded.payload_json, altered_upload_maps.payload_json),
        last_seen_at = excluded.last_seen_at,
        updated_at = excluded.updated_at
      `
    );

    try {
      this.db.exec("BEGIN");

      for (const member of normalizedMembers) {
        counters.membersSeen += 1;
        const existed = Boolean(selectMemberStmt.get(safeClubId, member.accountId));
        upsertMemberStmt.run(
          safeClubId,
          member.accountId,
          member.displayName || null,
          member.role || null,
          member.status || null,
          member.isAdmin ? 1 : 0,
          member.isVip ? 1 : 0,
          member.isCreator ? 1 : 0,
          member.joinedAt,
          member.leftAt,
          serializeJson(member.payload),
          now,
          now,
          now
        );
        if (existed) counters.membersUpdated += 1;
        else counters.membersInserted += 1;
      }

      for (const activity of normalizedActivities) {
        counters.activitiesSeen += 1;
        const existed = Boolean(selectActivityStmt.get(safeClubId, activity.activityId));
        upsertActivityStmt.run(
          safeClubId,
          activity.activityId,
          activity.activityType || null,
          activity.itemType || null,
          activity.name || null,
          activity.campaignExternalId,
          activity.bucketId,
          activity.mapUid || null,
          activity.authorAccountId || null,
          activity.active ? 1 : 0,
          activity.occurredAt,
          serializeJson(activity.payload),
          now,
          now,
          now
        );
        if (existed) counters.activitiesUpdated += 1;
        else counters.activitiesInserted += 1;
      }

      for (const bucket of normalizedUploadBuckets) {
        counters.uploadBucketsSeen += 1;
        const bucketExisted = Boolean(selectUploadBucketStmt.get(safeClubId, bucket.bucketId));
        upsertUploadBucketStmt.run(
          safeClubId,
          bucket.bucketId,
          bucket.bucketType,
          bucket.name || null,
          bucket.activityId,
          bucket.mapCount,
          bucket.active ? 1 : 0,
          serializeJson(bucket.payload),
          now,
          now,
          now
        );
        if (bucketExisted) counters.uploadBucketsUpdated += 1;
        else counters.uploadBucketsInserted += 1;

        for (const map of bucket.maps) {
          counters.uploadMapsSeen += 1;
          const mapExisted = Boolean(
            selectUploadMapStmt.get(safeClubId, bucket.bucketId, map.mapUid)
          );
          upsertUploadMapStmt.run(
            safeClubId,
            bucket.bucketId,
            map.mapUid,
            map.slot,
            map.mapName || null,
            map.authorAccountId || null,
            serializeJson(map.payload),
            now,
            now,
            now
          );
          if (mapExisted) counters.uploadMapsUpdated += 1;
          else counters.uploadMapsInserted += 1;
        }
      }

      this.db.exec("COMMIT");
      return counters;
    } catch (error) {
      try {
        this.db.exec("ROLLBACK");
      } catch {}
      return {
        error: error?.message || "Failed to upsert club monitoring data.",
        ...counters,
      };
    }
  }

  recordSyncRun({
    hookKey = DEFAULT_HOOK_KEY,
    startedAt,
    finishedAt,
    campaignsSeen = 0,
    mapsSeen = 0,
    mapsInserted = 0,
    mapsUpdated = 0,
    mapsLinked = 0,
    status = "ok",
    note = "",
  } = {}) {
    const row = this.db
      .prepare(
        `
        INSERT INTO altered_sync_runs (
          hook_key, started_at, finished_at, campaigns_seen, maps_seen,
          maps_inserted, maps_updated, maps_linked, status, note
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `
      )
      .run(
        hookKey,
        startedAt,
        finishedAt,
        Math.max(0, Number(campaignsSeen) || 0),
        Math.max(0, Number(mapsSeen) || 0),
        Math.max(0, Number(mapsInserted) || 0),
        Math.max(0, Number(mapsUpdated) || 0),
        Math.max(0, Number(mapsLinked) || 0),
        status === "error" ? "error" : "ok",
        String(note || "")
      );
    return Number(row.lastInsertRowid || 0);
  }

  getMapsForTracker(mapUids = []) {
    if (!Array.isArray(mapUids) || !mapUids.length) return [];
    const placeholders = mapUids.map(() => "?").join(", ");
    const rows = this.db
      .prepare(
        `
        SELECT
          map_uid AS uid,
          map_id AS mapId,
          name AS name,
          author AS author,
          submitter AS submitter,
          author_time AS authorMs,
          gold_time AS goldMs,
          silver_time AS silverMs,
          bronze_time AS bronzeMs,
          nb_laps AS nbLaps,
          thumbnail_url AS thumbnailUrl,
          download_url AS downloadUrl,
          wr_ms AS wrMs,
          wr_holder AS wrHolder,
          tracked AS tracked,
          status AS status,
          check_frequency AS checkFrequency,
          last_checked_at AS lastCheckedAt,
          pos.campaignName AS campaignName,
          pos.slot AS slot,
          pos.clubId AS clubId
        FROM altered_maps m
        LEFT JOIN (
          SELECT
            p.map_uid AS mapUid,
            p.slot AS slot,
            c.name AS campaignName,
            c.club_id AS clubId
          FROM altered_map_positions p
          JOIN altered_campaigns c ON c.campaign_id = p.campaign_id
          WHERE p.rowid IN (
            SELECT MAX(p2.rowid)
            FROM altered_map_positions p2
            GROUP BY p2.map_uid
          )
        ) pos ON pos.mapUid = m.map_uid
        WHERE map_uid IN (${placeholders})
        `
      )
      .all(...mapUids);
    return rows.map((row) => ({
      ...row,
      tracked: Boolean(row.tracked),
      status: normalizeStatus(row.status, row.tracked ? "live" : "paused"),
      checkFrequency: Number(row.checkFrequency || 21600),
      wrMs: Number(row.wrMs || 0),
      campaignName: String(row.campaignName || "").trim() || null,
      slot: Number(row.slot || 0),
      clubId: Number(row.clubId || 0) || null,
    }));
  }

  ingestProjectSourceSnapshot({
    sourceKey = "",
    sourceType = "special",
    displayName = "",
    sourceLabel = "",
    campaignType = "",
    clubId = 0,
    campaigns = [],
    note = "",
    trackedDefault = true,
  } = {}) {
    const startedAt = new Date().toISOString();
    const safeSourceKey = toText(sourceKey);
    const safeCampaignType = toText(campaignType).toLowerCase() || null;
    const safeClubId = clampInt(clubId, { min: 0, max: 2147483647, fallback: 0 });
    const safeDisplayName = toText(displayName) || safeSourceKey || "Project Source";
    const safeSourceLabel = toText(sourceLabel) || safeSourceKey || "project-source";
    const payloadCampaigns = Array.isArray(campaigns) ? campaigns : [];
    if (!safeSourceKey) {
      return { error: "sourceKey is required for source sync." };
    }
    if (!payloadCampaigns.length) {
      return { error: "campaigns[] is required for source sync." };
    }

    const counters = {
      campaignsSeen: 0,
      mapsSeen: 0,
      mapsInserted: 0,
      mapsUpdated: 0,
      mapsLinked: 0,
    };
    const touchedMapUids = new Set();

    this.upsertProjectSource({
      sourceKey: safeSourceKey,
      sourceType: sourceType || "special",
      displayName: safeDisplayName,
      sourceLabel: safeSourceLabel,
      enabled: true,
      lastError: null,
      metadata: {
        campaignType: safeCampaignType,
        storageClubId: safeClubId,
      },
    });

    try {
      this.db.exec("BEGIN IMMEDIATE");
      for (const campaign of payloadCampaigns) {
        const campaignName = toText(campaign?.name || campaign?.campaignName);
        if (!campaignName) continue;
        const campaignPayload = {
          ...(campaign?.raw && typeof campaign.raw === "object" ? campaign.raw : campaign?.payload && typeof campaign.payload === "object" ? campaign.payload : campaign),
          sourceKey: safeSourceKey,
          sourceLabel: safeSourceLabel,
          sourceType: sourceType || "special",
          campaignType: safeCampaignType,
        };
        const campaignRow = this.upsertCampaign({
          clubId: safeClubId,
          campaignName,
          externalCampaignId:
            campaign?.externalCampaignId ??
            campaign?.campaignId ??
            campaign?.campaign_id ??
            campaign?.id,
          activityId: campaign?.activityId ?? campaign?.activity_id ?? campaign?.activity?.id,
          activityType: campaign?.activityType ?? campaign?.activity_type ?? campaign?.activity?.type,
          campaignType:
            safeCampaignType ||
            campaign?.campaignType ||
            campaign?.campaign_type ||
            campaign?.type,
          startTimestamp:
            campaign?.startTimestamp ??
            campaign?.startDate ??
            campaign?.start_date ??
            campaign?.startsAt,
          endTimestamp:
            campaign?.endTimestamp ??
            campaign?.endDate ??
            campaign?.end_date ??
            campaign?.endsAt,
          published: campaign?.published ?? campaign?.isPublished ?? true,
          leaderboardGroupUid:
            campaign?.leaderboardGroupUid ??
            campaign?.leaderboard_group_uid ??
            campaign?.leaderboardUid,
          payload: campaignPayload,
        });
        const campaignPk = Number(campaignRow?.campaignId || 0);
        if (!campaignPk) continue;
        counters.campaignsSeen += 1;

        const maps = Array.isArray(campaign?.maps) ? campaign.maps : [];
        for (let index = 0; index < maps.length; index += 1) {
          const map = maps[index] || {};
          const mapUid = toText(map.uid || map.mapUid || map.map_uid);
          if (!mapUid) continue;
          counters.mapsSeen += 1;
          touchedMapUids.add(mapUid);

          const existing = this.db
            .prepare(
              `
              SELECT
                tracked,
                status,
                check_frequency AS checkFrequency,
                wr_ms AS wrMs,
                wr_holder AS wrHolder,
                player_count AS playerCount
              FROM altered_maps
              WHERE map_uid = ?
              LIMIT 1
              `
            )
            .get(mapUid);
          const now = new Date().toISOString();
          const payloadTracked = typeof map.tracked === "boolean" ? map.tracked : null;
          const tracked = payloadTracked === null ? Boolean(existing ? existing.tracked : trackedDefault) : payloadTracked;
          const status = normalizeStatus(
            map.status,
            tracked ? existing?.status || "live" : existing ? existing.status || "paused" : "paused"
          );
          const checkFrequency = clampInt(map.checkFrequency ?? map.check_frequency, {
            min: 120,
            max: 604800,
            fallback: clampInt(existing?.checkFrequency, {
              min: 120,
              max: 604800,
              fallback: 21600,
            }),
          });
          const wrMs = clampInt(map.wrMs ?? map.wrTime ?? map.wr_time, {
            min: 0,
            max: 2147483647,
            fallback: clampInt(existing?.wrMs, { min: 0, max: 2147483647, fallback: 0 }),
          });
          const wrHolder =
            toText(map.wrHolder ?? map.wrDisplayName ?? map.wr_display_name ?? existing?.wrHolder) || null;
          const playerCount = clampInt(
            map.playerCount ??
              map.player_count ??
              map.nbPlayers ??
              map.nb_players ??
              map.playCount ??
              map.play_count ??
              map.playersCount ??
              map.players_count,
            {
              min: 0,
              max: 2147483647,
              fallback: clampInt(existing?.playerCount, {
                min: 0,
                max: 2147483647,
                fallback: 0,
              }),
            }
          );
          const mapPayload = {
            ...(map?.raw && typeof map.raw === "object" ? map.raw : map?.payload && typeof map.payload === "object" ? map.payload : map),
            sourceKey: safeSourceKey,
            sourceLabel: safeSourceLabel,
            sourceType: sourceType || "special",
            campaignType: safeCampaignType,
          };

          this.db
            .prepare(
              `
              INSERT INTO altered_maps (
                map_uid, map_id, name, map_type, map_style, map_environment, author, author_display_name, submitter, submitter_display_name,
                author_time, gold_time, silver_time, bronze_time, nb_laps,
                thumbnail_url, download_url, player_count, player_count_updated_at, wr_ms, wr_holder, wr_updated_at,
                tracked, status, check_frequency, last_checked_at,
                map_created_at, map_updated_at, payload_json, monitor_updated_at,
                created_at, updated_at, last_synced_at
              ) VALUES (
                ?, ?, ?, ?, ?, ?, ?, ?, ?, ?,
                ?, ?, ?, ?, ?,
                ?, ?, ?, ?, ?, ?, ?,
                ?, ?, ?, ?,
                ?, ?, ?, ?,
                ?, ?, ?
              )
              ON CONFLICT(map_uid) DO UPDATE SET
                map_id = excluded.map_id,
                name = excluded.name,
                map_type = excluded.map_type,
                map_style = excluded.map_style,
                map_environment = excluded.map_environment,
                author = excluded.author,
                author_display_name = COALESCE(NULLIF(excluded.author_display_name, ''), altered_maps.author_display_name),
                submitter = excluded.submitter,
                submitter_display_name = COALESCE(NULLIF(excluded.submitter_display_name, ''), altered_maps.submitter_display_name),
                author_time = excluded.author_time,
                gold_time = excluded.gold_time,
                silver_time = excluded.silver_time,
                bronze_time = excluded.bronze_time,
                nb_laps = excluded.nb_laps,
                thumbnail_url = excluded.thumbnail_url,
                download_url = excluded.download_url,
                player_count = excluded.player_count,
                player_count_updated_at = excluded.player_count_updated_at,
                wr_ms = excluded.wr_ms,
                wr_holder = excluded.wr_holder,
                wr_updated_at = excluded.wr_updated_at,
                tracked = excluded.tracked,
                status = excluded.status,
                check_frequency = excluded.check_frequency,
                last_checked_at = COALESCE(excluded.last_checked_at, altered_maps.last_checked_at),
                map_created_at = COALESCE(excluded.map_created_at, altered_maps.map_created_at),
                map_updated_at = COALESCE(excluded.map_updated_at, altered_maps.map_updated_at),
                payload_json = COALESCE(excluded.payload_json, altered_maps.payload_json),
                monitor_updated_at = excluded.monitor_updated_at,
                updated_at = excluded.updated_at,
                last_synced_at = excluded.last_synced_at
              `
            )
            .run(
              mapUid,
              toText(map.mapId || map.map_id || map.id, `map-${mapUid.toLowerCase()}`),
              toText(map.name || map.title, mapUid) || mapUid,
              toText(map.mapType ?? map.map_type ?? map.type) || null,
              toText(map.mapStyle ?? map.map_style ?? map.style) || null,
              toText(map.mapEnvironment ?? map.map_environment ?? map.environment ?? map.mood) || null,
              toText(map.author),
              toText(
                map.authorDisplayName ??
                  map.author_display_name ??
                  map.authorName ??
                  map.author_name
              ),
              toText(map.submitter),
              toText(
                map.submitterDisplayName ??
                  map.submitter_display_name ??
                  map.submitterName ??
                  map.submitter_name
              ),
              clampInt(map.authorMs ?? map.authorTime ?? map.author_time, {
                min: 0,
                max: 2147483647,
                fallback: 0,
              }),
              clampInt(map.goldMs ?? map.goldTime ?? map.gold_time, {
                min: 0,
                max: 2147483647,
                fallback: 0,
              }),
              clampInt(map.silverMs ?? map.silverTime ?? map.silver_time, {
                min: 0,
                max: 2147483647,
                fallback: 0,
              }),
              clampInt(map.bronzeMs ?? map.bronzeTime ?? map.bronze_time, {
                min: 0,
                max: 2147483647,
                fallback: 0,
              }),
              clampInt(map.nbLaps ?? map.nb_laps, {
                min: 1,
                max: 64,
                fallback: 1,
              }),
              toText(map.thumbnailUrl ?? map.thumbnail_url),
              toText(map.downloadUrl ?? map.download_url),
              playerCount,
              now,
              wrMs,
              wrHolder,
              wrMs > 0 ? now : null,
              tracked ? 1 : 0,
              status,
              checkFrequency,
              map.lastCheckedAt || map.last_checked_at || null,
              toNullableIso(
                map.mapCreatedAt ??
                  map.map_created_at ??
                  map.createdAt ??
                  map.created_at ??
                  map.uploadTimestamp
              ),
              toNullableIso(
                map.mapUpdatedAt ??
                  map.map_updated_at ??
                  map.updatedAt ??
                  map.updated_at ??
                  map.updateTimestamp
              ),
              serializeJson(mapPayload),
              now,
              now,
              now,
              now
            );

          if (existing) counters.mapsUpdated += 1;
          else counters.mapsInserted += 1;

          const slot = normalizeCampaignSlotValue({
            slot: map.slot,
            order: map.order,
            position: map.position ?? map?.payload?.campaignMap?.position,
            fallbackSlot: index + 1,
            max: 999,
          });
          const oldPosition = this.db
            .prepare(
              `
              SELECT campaign_id AS campaignId, slot
              FROM altered_map_positions
              WHERE map_uid = ?
              LIMIT 1
              `
            )
            .get(mapUid);
          const changedPosition =
            !oldPosition ||
            Number(oldPosition.campaignId || 0) !== campaignPk ||
            Number(oldPosition.slot || 0) !== slot;

          this.db
            .prepare(
              `
              INSERT INTO altered_map_positions (map_uid, campaign_id, slot, updated_at)
              VALUES (?, ?, ?, ?)
              ON CONFLICT(map_uid) DO UPDATE SET
                campaign_id = excluded.campaign_id,
                slot = excluded.slot,
                updated_at = excluded.updated_at
              `
            )
            .run(mapUid, campaignPk, slot, now);
          if (changedPosition) counters.mapsLinked += 1;
        }
      }

      this.db.exec("COMMIT");
    } catch (error) {
      try {
        this.db.exec("ROLLBACK");
      } catch {}
      const finishedAt = new Date().toISOString();
      const message = error?.message || "Project source sync failed.";
      this.recordSyncRun({
        hookKey: `source:${safeSourceKey}`,
        startedAt,
        finishedAt,
        ...counters,
        status: "error",
        note: message,
      });
      return {
        error: message,
        ...counters,
      };
    }

    const finishedAt = new Date().toISOString();
    this.recordSyncRun({
      hookKey: `source:${safeSourceKey}`,
      startedAt,
      finishedAt,
      ...counters,
      status: "ok",
      note: toText(note) || safeSourceLabel,
    });

    return {
      source: this.getProjectSource(safeSourceKey),
      mapsForTracker: this.getMapsForTracker([...touchedMapUids]),
      ...counters,
    };
  }

  ingestHookSnapshot({
    hookKey = DEFAULT_HOOK_KEY,
    club = null,
    clubId = null,
    clubName = "",
    campaigns = [],
    sourceLabel = "",
    note = "",
  } = {}) {
    const startedAt = new Date().toISOString();
    const existingHook = this.getHookConfig(hookKey) || this.ensureDefaultHookConfig({ hookKey });
    const resolvedClubId = clampInt(club?.id ?? clubId ?? existingHook?.clubId, {
      min: 1,
      max: 2147483647,
      fallback: 0,
    });
    if (!resolvedClubId) {
      return { error: "clubId is required for hook sync." };
    }

    const payloadCampaigns = Array.isArray(campaigns)
      ? campaigns
      : Array.isArray(club?.campaigns)
        ? club.campaigns
        : [];
    if (!payloadCampaigns.length) {
      return { error: "campaigns[] is required for hook sync." };
    }

    const resolvedClubName =
      String(club?.name || clubName || existingHook?.clubName || "").trim() ||
      `Club ${resolvedClubId}`;
    const resolvedSourceLabel =
      String(sourceLabel || existingHook?.sourceLabel || "").trim() || "altered-monitor";
    const hook = this.updateHookConfig({
      hookKey,
      clubId: resolvedClubId,
      clubName: resolvedClubName,
      sourceLabel: resolvedSourceLabel,
    });
    if (!hook) {
      return { error: "Unable to initialize altered hook config." };
    }

    const counters = {
      campaignsSeen: 0,
      mapsSeen: 0,
      mapsInserted: 0,
      mapsUpdated: 0,
      mapsLinked: 0,
    };
    const touchedMapUids = new Set();

    try {
      this.db.exec("BEGIN");
      for (const campaign of payloadCampaigns) {
        const campaignName = String(campaign?.name || campaign?.campaignName || "").trim();
        if (!campaignName) continue;
        const campaignRow = this.upsertCampaign({
          clubId: resolvedClubId,
          campaignName,
          externalCampaignId:
            campaign?.externalCampaignId ??
            campaign?.campaignId ??
            campaign?.campaign_id ??
            campaign?.id,
          activityId: campaign?.activityId ?? campaign?.activity_id ?? campaign?.activity?.id,
          activityType: campaign?.activityType ?? campaign?.activity_type ?? campaign?.activity?.type,
          campaignType: campaign?.campaignType ?? campaign?.campaign_type ?? campaign?.type,
          startTimestamp:
            campaign?.startTimestamp ??
            campaign?.startDate ??
            campaign?.start_date ??
            campaign?.startsAt,
          endTimestamp:
            campaign?.endTimestamp ??
            campaign?.endDate ??
            campaign?.end_date ??
            campaign?.endsAt,
          published: campaign?.published ?? campaign?.isPublished ?? false,
          leaderboardGroupUid:
            campaign?.leaderboardGroupUid ??
            campaign?.leaderboard_group_uid ??
            campaign?.leaderboardUid,
          payload: campaign?.raw ?? campaign?.payload ?? campaign,
        });
        const campaignPk = Number(campaignRow?.campaignId || 0);
        if (!campaignPk) continue;
        counters.campaignsSeen += 1;

        const maps = Array.isArray(campaign?.maps) ? campaign.maps : [];
        for (let index = 0; index < maps.length; index += 1) {
          const map = maps[index] || {};
          const mapUid = String(map.uid || map.mapUid || map.map_uid || "").trim();
          if (!mapUid) continue;
          counters.mapsSeen += 1;
          touchedMapUids.add(mapUid);

          const existing = this.db
            .prepare(
              `
              SELECT
                tracked,
                status,
                check_frequency AS checkFrequency,
                wr_ms AS wrMs,
                wr_holder AS wrHolder,
                player_count AS playerCount
              FROM altered_maps
              WHERE map_uid = ?
              LIMIT 1
              `
            )
            .get(mapUid);
          const now = new Date().toISOString();
          const payloadTracked = typeof map.tracked === "boolean" ? map.tracked : null;
          const tracked =
            payloadTracked === null
              ? existing
                ? Boolean(existing.tracked)
                : Boolean(hook.autoTrackNewMaps)
              : payloadTracked;
          const status = normalizeStatus(
            map.status,
            tracked
              ? existing?.status || "live"
              : existing
                ? existing.status || "paused"
                : "paused"
          );
          const checkFrequency = clampInt(map.checkFrequency ?? map.check_frequency, {
            min: 120,
            max: 604800,
            fallback: clampInt(existing?.checkFrequency, {
              min: 120,
              max: 604800,
              fallback: 21600,
            }),
          });
          const wrMs = clampInt(map.wrMs ?? map.wrTime ?? map.wr_time, {
            min: 0,
            max: 2147483647,
            fallback: clampInt(existing?.wrMs, { min: 0, max: 2147483647, fallback: 0 }),
          });
          const wrHolder =
            String(map.wrHolder ?? map.wrDisplayName ?? map.wr_display_name ?? existing?.wrHolder ?? "")
              .trim() || null;
          const playerCount = clampInt(
            map.playerCount ??
              map.player_count ??
              map.nbPlayers ??
              map.nb_players ??
              map.playCount ??
              map.play_count ??
              map.playersCount ??
              map.players_count,
            {
              min: 0,
              max: 2147483647,
              fallback: clampInt(existing?.playerCount, {
                min: 0,
                max: 2147483647,
                fallback: 0,
              }),
            }
          );

          this.db
            .prepare(
              `
              INSERT INTO altered_maps (
                map_uid, map_id, name, map_type, map_style, map_environment, author, author_display_name, submitter, submitter_display_name,
                author_time, gold_time, silver_time, bronze_time, nb_laps,
                thumbnail_url, download_url, player_count, player_count_updated_at, wr_ms, wr_holder, wr_updated_at,
                tracked, status, check_frequency, last_checked_at,
                map_created_at, map_updated_at, payload_json, monitor_updated_at,
                created_at, updated_at, last_synced_at
              ) VALUES (
                ?, ?, ?, ?, ?, ?, ?, ?, ?, ?,
                ?, ?, ?, ?, ?,
                ?, ?, ?, ?, ?, ?, ?,
                ?, ?, ?, ?,
                ?, ?, ?, ?,
                ?, ?, ?
              )
              ON CONFLICT(map_uid) DO UPDATE SET
                map_id = excluded.map_id,
                name = excluded.name,
                map_type = excluded.map_type,
                map_style = excluded.map_style,
                map_environment = excluded.map_environment,
                author = excluded.author,
                author_display_name = COALESCE(NULLIF(excluded.author_display_name, ''), altered_maps.author_display_name),
                submitter = excluded.submitter,
                submitter_display_name = COALESCE(NULLIF(excluded.submitter_display_name, ''), altered_maps.submitter_display_name),
                author_time = excluded.author_time,
                gold_time = excluded.gold_time,
                silver_time = excluded.silver_time,
                bronze_time = excluded.bronze_time,
                nb_laps = excluded.nb_laps,
                thumbnail_url = excluded.thumbnail_url,
                download_url = excluded.download_url,
                player_count = excluded.player_count,
                player_count_updated_at = excluded.player_count_updated_at,
                wr_ms = excluded.wr_ms,
                wr_holder = excluded.wr_holder,
                wr_updated_at = excluded.wr_updated_at,
                tracked = excluded.tracked,
                status = excluded.status,
                check_frequency = excluded.check_frequency,
                last_checked_at = COALESCE(excluded.last_checked_at, altered_maps.last_checked_at),
                map_created_at = COALESCE(excluded.map_created_at, altered_maps.map_created_at),
                map_updated_at = COALESCE(excluded.map_updated_at, altered_maps.map_updated_at),
                payload_json = COALESCE(excluded.payload_json, altered_maps.payload_json),
                monitor_updated_at = excluded.monitor_updated_at,
                updated_at = excluded.updated_at,
                last_synced_at = excluded.last_synced_at
              `
            )
            .run(
              mapUid,
              String(map.mapId || map.map_id || map.id || `map-${mapUid.toLowerCase()}`).trim(),
              String(map.name || map.title || mapUid).trim() || mapUid,
              String(map.mapType ?? map.map_type ?? map.type ?? "").trim() || null,
              String(map.mapStyle ?? map.map_style ?? map.style ?? "").trim() || null,
              String(map.mapEnvironment ?? map.map_environment ?? map.environment ?? map.mood ?? "").trim() ||
                null,
              String(map.author || "").trim(),
              String(
                map.authorDisplayName ??
                  map.author_display_name ??
                  map.authorName ??
                  map.author_name ??
                  ""
              ).trim(),
              String(map.submitter || "").trim(),
              String(
                map.submitterDisplayName ??
                  map.submitter_display_name ??
                  map.submitterName ??
                  map.submitter_name ??
                  ""
              ).trim(),
              clampInt(map.authorMs ?? map.authorTime ?? map.author_time, {
                min: 0,
                max: 2147483647,
                fallback: 0,
              }),
              clampInt(map.goldMs ?? map.goldTime ?? map.gold_time, {
                min: 0,
                max: 2147483647,
                fallback: 0,
              }),
              clampInt(map.silverMs ?? map.silverTime ?? map.silver_time, {
                min: 0,
                max: 2147483647,
                fallback: 0,
              }),
              clampInt(map.bronzeMs ?? map.bronzeTime ?? map.bronze_time, {
                min: 0,
                max: 2147483647,
                fallback: 0,
              }),
              clampInt(map.nbLaps ?? map.nb_laps, {
                min: 1,
                max: 64,
                fallback: 1,
              }),
              String(map.thumbnailUrl ?? map.thumbnail_url ?? "").trim(),
              String(map.downloadUrl ?? map.download_url ?? "").trim(),
              playerCount,
              now,
              wrMs,
              wrHolder,
              wrMs > 0 ? now : null,
              tracked ? 1 : 0,
              status,
              checkFrequency,
              map.lastCheckedAt || map.last_checked_at || null,
              toNullableIso(
                map.mapCreatedAt ??
                  map.map_created_at ??
                  map.createdAt ??
                  map.created_at ??
                  map.uploadTimestamp
              ),
              toNullableIso(
                map.mapUpdatedAt ??
                  map.map_updated_at ??
                  map.updatedAt ??
                  map.updated_at ??
                  map.updateTimestamp
              ),
              serializeJson(map.raw ?? map.payload ?? map),
              now,
              now,
              now,
              now
            );

          if (existing) counters.mapsUpdated += 1;
          else counters.mapsInserted += 1;

          const slot = normalizeCampaignSlotValue({
            slot: map.slot,
            order: map.order,
            position: map.position ?? map?.payload?.campaignMap?.position,
            fallbackSlot: index + 1,
            max: 999,
          });
          const oldPosition = this.db
            .prepare(
              `
              SELECT campaign_id AS campaignId, slot
              FROM altered_map_positions
              WHERE map_uid = ?
              LIMIT 1
              `
            )
            .get(mapUid);
          const changedPosition =
            !oldPosition ||
            Number(oldPosition.campaignId || 0) !== campaignPk ||
            Number(oldPosition.slot || 0) !== slot;

          this.db
            .prepare(
              `
              INSERT INTO altered_map_positions (map_uid, campaign_id, slot, updated_at)
              VALUES (?, ?, ?, ?)
              ON CONFLICT(map_uid) DO UPDATE SET
                campaign_id = excluded.campaign_id,
                slot = excluded.slot,
                updated_at = excluded.updated_at
              `
            )
            .run(mapUid, campaignPk, slot, now);
          if (changedPosition) counters.mapsLinked += 1;
        }
      }

      this.db.exec("COMMIT");
    } catch (error) {
      try {
        this.db.exec("ROLLBACK");
      } catch {}
      const finishedAt = new Date().toISOString();
      const message = error?.message || "Hook sync failed.";
      this.recordSyncRun({
        hookKey,
        startedAt,
        finishedAt,
        ...counters,
        status: "error",
        note: message,
      });
      const hookWithError = this.updateHookConfig({
        hookKey,
        clubId: resolvedClubId,
        clubName: resolvedClubName,
        sourceLabel: resolvedSourceLabel,
        lastError: message,
      });
      return {
        error: message,
        hook: hookWithError,
        ...counters,
      };
    }

    const finishedAt = new Date().toISOString();
    const runId = this.recordSyncRun({
      hookKey,
      startedAt,
      finishedAt,
      ...counters,
      status: "ok",
      note: String(note || resolvedSourceLabel || "manual-sync"),
    });
    const updatedHook = this.updateHookConfig({
      hookKey,
      clubId: resolvedClubId,
      clubName: resolvedClubName,
      sourceLabel: resolvedSourceLabel,
      lastSyncedAt: finishedAt,
      lastError: null,
    });

    return {
      hook: updatedHook,
      run: this.listHookRuns(1, hookKey)[0] || { runId },
      mapsForTracker: this.getMapsForTracker([...touchedMapUids]),
      ...counters,
    };
  }
}

export { AlteredRepository };
