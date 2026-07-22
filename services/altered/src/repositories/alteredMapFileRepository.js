import {
  parseJsonSafe,
  serializeJson,
  toIso,
  toNullableIso,
  toText,
  uniqueBy,
  OVERSIZED_SIGNATURE_JSON_MAX_BYTES,
  buildOversizedSignatureFallback,
  rowToMapLocalFileFix,
} from "./alteredRepositorySupport.js";

class AlteredMapFileRepository {
  constructor(db) {
    this.db = db;
  }

  getMapLocalFiles({ mapUids = [] } = {}) {
    const safeMapUids = uniqueBy(
      (Array.isArray(mapUids) ? mapUids : []).map((value) => toText(value)).filter(Boolean),
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
      (Array.isArray(mapUids) ? mapUids : []).map((value) => toText(value)).filter(Boolean),
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
          ["ready", "missing", "error"].includes(
            String(record?.status || "")
              .trim()
              .toLowerCase()
          )
            ? String(record.status).trim().toLowerCase()
            : "missing",
          toText(record?.note) || null,
          toText(record?.lastError) || null,
          existed
            ? this.db
                .prepare(`SELECT created_at AS createdAt FROM altered_map_local_file_fixes WHERE map_uid = ? LIMIT 1`)
                .get(mapUid)?.createdAt || now
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
          ["ready", "missing", "error"].includes(
            String(record?.status || "")
              .trim()
              .toLowerCase()
          )
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
    const totalMaps = Number(this.db.prepare("SELECT COUNT(*) AS count FROM altered_maps").get()?.count || 0);

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
      (Array.isArray(mapUids) ? mapUids : []).map((value) => toText(value)).filter(Boolean),
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
            String(record?.sourceStatus || "")
              .trim()
              .toLowerCase()
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
}

export { AlteredMapFileRepository };
