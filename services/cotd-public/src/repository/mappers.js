import { toInteger, toTextOrFallback as asText, utcNowIso } from "../../../shared/valueUtils.js";
import { dayIdFor, normalizeTotdDay } from "../totdDay.js";

function asNullableText(value) {
  return asText(value) || null;
}

function snapshotIdFor(cotdDate, mapUid) {
  const date = asText(cotdDate, new Date().toISOString().slice(0, 10));
  const uid = asText(mapUid, "unknown-map").replace(/[^A-Za-z0-9_-]/g, "-");
  return `${date}:${uid}`;
}

function normalizeMapInfo(input = {}) {
  return {
    mapUid: asText(input.mapUid ?? input.map_uid),
    mapId: asNullableText(input.mapId ?? input.map_id),
    name: asNullableText(input.name),
    filename: asNullableText(input.filename),
    authorAccountId: asNullableText(input.author ?? input.authorAccountId ?? input.author_account_id),
    submitterAccountId: asNullableText(input.submitter ?? input.submitterAccountId ?? input.submitter_account_id),
    authorScore: toInteger(input.authorScore ?? input.author_score),
    bronzeScore: toInteger(input.bronzeScore ?? input.bronze_score),
    silverScore: toInteger(input.silverScore ?? input.silver_score),
    goldScore: toInteger(input.goldScore ?? input.gold_score),
    collectionName: asNullableText(input.collectionName ?? input.collection_name),
    mapStyle: asNullableText(input.mapStyle ?? input.map_style),
    mapType: asNullableText(input.mapType ?? input.map_type),
    isPlayable: input.isPlayable === null || input.isPlayable === undefined ? null : Number(Boolean(input.isPlayable)),
    hasClones: input.hasClones === null || input.hasClones === undefined ? null : Number(Boolean(input.hasClones)),
    createdWithGamepadEditor:
      input.createdWithGamepadEditor === null || input.createdWithGamepadEditor === undefined
        ? null
        : Number(Boolean(input.createdWithGamepadEditor)),
    createdWithSimpleEditor:
      input.createdWithSimpleEditor === null || input.createdWithSimpleEditor === undefined
        ? null
        : Number(Boolean(input.createdWithSimpleEditor)),
    thumbnailUrl: asNullableText(input.thumbnailUrl ?? input.thumbnail_url),
    fileUrl: asNullableText(input.fileUrl ?? input.file_url),
    timestamp: asNullableText(input.timestamp),
    raw: input.raw || input,
  };
}

function normalizeMapFile(input = {}) {
  return {
    mapUid: asText(input.mapUid ?? input.map_uid),
    mapId: asNullableText(input.mapId ?? input.map_id),
    fileUrl: asNullableText(input.fileUrl ?? input.file_url),
    filename: asNullableText(input.filename),
    storagePath: asNullableText(input.storagePath ?? input.storage_path),
    relativePath: asNullableText(input.relativePath ?? input.relative_path),
    sha256: asNullableText(input.sha256),
    sizeBytes: toInteger(input.sizeBytes ?? input.size_bytes),
    status: asText(input.status, "downloaded"),
    error: asNullableText(input.error),
    downloadedAt: asNullableText(input.downloadedAt ?? input.downloaded_at),
  };
}

function mapInfoFromRow(row = {}) {
  if (!row.info_map_uid) return null;
  return {
    mapUid: row.info_map_uid,
    mapId: row.info_map_id,
    name: row.info_name,
    filename: row.info_filename,
    authorAccountId: row.info_author_account_id,
    submitterAccountId: row.info_submitter_account_id,
    authorScore: row.info_author_score,
    bronzeScore: row.info_bronze_score,
    silverScore: row.info_silver_score,
    goldScore: row.info_gold_score,
    collectionName: row.info_collection_name,
    mapStyle: row.info_map_style,
    mapType: row.info_map_type,
    isPlayable:
      row.info_is_playable === null || row.info_is_playable === undefined ? null : Boolean(row.info_is_playable),
    hasClones: row.info_has_clones === null || row.info_has_clones === undefined ? null : Boolean(row.info_has_clones),
    thumbnailUrl: row.info_thumbnail_url,
    fileUrl: row.info_file_url,
    timestamp: row.info_timestamp,
    fetchedAt: row.info_fetched_at,
    updatedAt: row.info_updated_at,
  };
}

function mapFileFromRow(row = {}) {
  if (!row.file_map_uid) return null;
  const downloaded = row.file_status === "downloaded" && Boolean(row.file_storage_path);
  return {
    mapUid: row.file_map_uid,
    mapId: row.file_map_id,
    filename: row.file_filename,
    sha256: row.file_sha256,
    sizeBytes: row.file_size_bytes,
    status: row.file_status,
    error: row.file_error,
    downloaded,
    downloadedAt: row.file_downloaded_at,
    updatedAt: row.file_updated_at,
    downloadUrl: downloaded ? `/api/v1/maps/${encodeURIComponent(row.file_map_uid)}/file` : null,
  };
}

function cotdFromRows(row = {}, mapInfo = null) {
  return {
    cotdDate: row.day_cotd_date,
    competitionId:
      row.day_campaign_id === null || row.day_campaign_id === undefined ? null : String(row.day_campaign_id),
    mapUid: row.day_map_uid,
    mapName: mapInfo?.name || row.snapshot_map_name || row.day_map_uid || "Unknown TOTD map",
    authorName: row.snapshot_author_name || "Unknown mapper",
    authorAccountId: mapInfo?.authorAccountId || row.snapshot_author_account_id || null,
    thumbnailUrl: mapInfo?.thumbnailUrl || row.snapshot_thumbnail_url || null,
    trackId: mapInfo?.mapId || row.snapshot_track_id || null,
    startedAt: row.day_start_at || null,
    endedAt: row.day_end_at || null,
  };
}

const JOIN_SELECT = `
  d.id AS day_id,
  d.cotd_date AS day_cotd_date,
  d.year AS day_year,
  d.month AS day_month,
  d.day AS day_day,
  d.month_day AS day_month_day,
  d.campaign_id AS day_campaign_id,
  d.map_uid AS day_map_uid,
  d.season_uid AS day_season_uid,
  d.leaderboard_group AS day_leaderboard_group,
  d.start_timestamp AS day_start_timestamp,
  d.end_timestamp AS day_end_timestamp,
  d.start_at AS day_start_at,
  d.end_at AS day_end_at,
  s.payload_json AS snapshot_payload_json,
  s.source AS snapshot_source,
  s.status AS snapshot_status,
  json_extract(s.payload_json, '$.cotd.mapName') AS snapshot_map_name,
  json_extract(s.payload_json, '$.cotd.authorName') AS snapshot_author_name,
  json_extract(s.payload_json, '$.cotd.authorAccountId') AS snapshot_author_account_id,
  json_extract(s.payload_json, '$.cotd.thumbnailUrl') AS snapshot_thumbnail_url,
  json_extract(s.payload_json, '$.cotd.trackId') AS snapshot_track_id,
  mi.map_uid AS info_map_uid,
  mi.map_id AS info_map_id,
  mi.name AS info_name,
  mi.filename AS info_filename,
  mi.author_account_id AS info_author_account_id,
  mi.submitter_account_id AS info_submitter_account_id,
  mi.author_score AS info_author_score,
  mi.bronze_score AS info_bronze_score,
  mi.silver_score AS info_silver_score,
  mi.gold_score AS info_gold_score,
  mi.collection_name AS info_collection_name,
  mi.map_style AS info_map_style,
  mi.map_type AS info_map_type,
  mi.is_playable AS info_is_playable,
  mi.has_clones AS info_has_clones,
  mi.thumbnail_url AS info_thumbnail_url,
  mi.file_url AS info_file_url,
  mi.timestamp AS info_timestamp,
  mi.fetched_at AS info_fetched_at,
  mi.updated_at AS info_updated_at,
  mf.map_uid AS file_map_uid,
  mf.map_id AS file_map_id,
  mf.filename AS file_filename,
  mf.sha256 AS file_sha256,
  mf.size_bytes AS file_size_bytes,
  mf.status AS file_status,
  mf.error AS file_error,
  mf.storage_path AS file_storage_path,
  mf.downloaded_at AS file_downloaded_at,
  mf.updated_at AS file_updated_at
`;

const JOIN_FROM = `
  FROM cotd_days d
  LEFT JOIN style_snapshots s ON s.map_uid = d.map_uid AND s.cotd_date = d.cotd_date
  LEFT JOIN map_infos mi ON mi.map_uid = d.map_uid
  LEFT JOIN map_files mf ON mf.map_uid = d.map_uid
`;

export {
  JOIN_FROM,
  JOIN_SELECT,
  asText,
  cotdFromRows,
  dayIdFor,
  mapFileFromRow,
  mapInfoFromRow,
  normalizeMapFile,
  normalizeMapInfo,
  normalizeTotdDay,
  snapshotIdFor,
  utcNowIso,
};
