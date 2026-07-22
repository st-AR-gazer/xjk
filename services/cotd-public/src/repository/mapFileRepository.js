import { asText, mapFileFromRow, normalizeMapFile, utcNowIso } from "./mappers.js";

function listMapFileDownloadCandidates(repository, { mapUids = [], includeDownloaded = false } = {}) {
  const uids = [...new Set(mapUids.map((value) => asText(value)).filter(Boolean))];
  if (!uids.length) return [];
  const placeholders = uids.map(() => "?").join(", ");
  return (
    repository.db
      .prepare(
        `SELECT
           mi.map_uid AS mapUid,
           mi.map_id AS mapId,
           mi.filename AS filename,
           mi.file_url AS fileUrl,
           mf.status AS fileStatus,
           mf.storage_path AS storagePath
         FROM map_infos mi
         LEFT JOIN map_files mf ON mf.map_uid = mi.map_uid
         WHERE mi.map_uid IN (${placeholders})
           AND mi.file_url IS NOT NULL
           ${includeDownloaded ? "" : "AND (mf.map_uid IS NULL OR mf.status != 'downloaded' OR mf.storage_path IS NULL)"}
         ORDER BY mi.map_uid ASC`
      )
      .all(...uids) || []
  );
}

function upsertMapFile(repository, input = {}) {
  const nowIso = utcNowIso();
  const file = normalizeMapFile(input);
  if (!file.mapUid) return null;
  repository.db
    .prepare(
      `INSERT INTO map_files (
         map_uid, map_id, file_url, filename, storage_path, relative_path, sha256,
         size_bytes, status, error, downloaded_at, updated_at
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(map_uid) DO UPDATE SET
         map_id = COALESCE(excluded.map_id, map_files.map_id),
         file_url = COALESCE(excluded.file_url, map_files.file_url),
         filename = COALESCE(excluded.filename, map_files.filename),
         storage_path = COALESCE(excluded.storage_path, map_files.storage_path),
         relative_path = COALESCE(excluded.relative_path, map_files.relative_path),
         sha256 = COALESCE(excluded.sha256, map_files.sha256),
         size_bytes = COALESCE(excluded.size_bytes, map_files.size_bytes),
         status = excluded.status,
         error = excluded.error,
         downloaded_at = COALESCE(excluded.downloaded_at, map_files.downloaded_at),
         updated_at = excluded.updated_at`
    )
    .run(
      file.mapUid,
      file.mapId,
      file.fileUrl,
      file.filename,
      file.storagePath,
      file.relativePath,
      file.sha256,
      file.sizeBytes,
      file.status,
      file.error,
      file.downloadedAt,
      nowIso
    );
  return getMapFile(repository, file.mapUid);
}

function getMapFile(repository, mapUid) {
  const row =
    repository.db
      .prepare(
        `SELECT
           map_uid AS file_map_uid,
           map_id AS file_map_id,
           filename AS file_filename,
           sha256 AS file_sha256,
           size_bytes AS file_size_bytes,
           status AS file_status,
           error AS file_error,
           storage_path AS file_storage_path,
           downloaded_at AS file_downloaded_at,
           updated_at AS file_updated_at
         FROM map_files
         WHERE map_uid = ?
         LIMIT 1`
      )
      .get(asText(mapUid)) || null;
  if (!row) return null;
  return { ...mapFileFromRow(row), storagePath: row.file_storage_path };
}

export { getMapFile, listMapFileDownloadCandidates, upsertMapFile };
