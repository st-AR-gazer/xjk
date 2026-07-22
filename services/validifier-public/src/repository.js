import crypto from "node:crypto";
import { ensureParentDirectorySync } from "../../shared/fsUtils.js";
import { openSqliteDatabase } from "../../shared/sqliteRuntime.js";
import { utcNowIso } from "../../shared/valueUtils.js";

function plusMs(baseIso, amountMs, fallbackMs = Date.now()) {
  const parsed = Date.parse(baseIso);
  return new Date((Number.isFinite(parsed) ? parsed : fallbackMs) + amountMs).toISOString();
}

function initializeDatabase(db, { submissionTtlMs, now }) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS uploaded_artifacts (
      artifact_ref TEXT PRIMARY KEY,
      kind TEXT NOT NULL,
      sha256 TEXT NOT NULL,
      size_bytes INTEGER NOT NULL,
      original_filename TEXT NOT NULL,
      storage_path TEXT NOT NULL,
      created_at TEXT NOT NULL,
      expires_at TEXT NOT NULL,
      last_used_at TEXT NOT NULL,
      CHECK(kind IN ('map', 'replay'))
    );

    CREATE UNIQUE INDEX IF NOT EXISTS idx_uploaded_artifacts_kind_sha256
      ON uploaded_artifacts(kind, sha256);
    CREATE INDEX IF NOT EXISTS idx_uploaded_artifacts_expires_at
      ON uploaded_artifacts(expires_at);

    CREATE TABLE IF NOT EXISTS replay_submissions (
      submission_id TEXT PRIMARY KEY,
      record_id TEXT NOT NULL,
      map_uid TEXT NOT NULL,
      rank INTEGER NULL,
      map_ref TEXT NOT NULL,
      replay_ref TEXT NOT NULL,
      status TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      expires_at TEXT NOT NULL,
      private_job_id TEXT NULL,
      FOREIGN KEY(map_ref) REFERENCES uploaded_artifacts(artifact_ref),
      FOREIGN KEY(replay_ref) REFERENCES uploaded_artifacts(artifact_ref)
    );

    CREATE TABLE IF NOT EXISTS upload_quota_usage (
      client_key TEXT NOT NULL,
      day_utc TEXT NOT NULL,
      bytes_used INTEGER NOT NULL,
      updated_at TEXT NOT NULL,
      PRIMARY KEY(client_key, day_utc),
      CHECK(bytes_used >= 0)
    );
  `);

  const submissionColumns = new Set(
    db
      .prepare("PRAGMA table_info(replay_submissions)")
      .all()
      .map((column) => String(column.name || ""))
  );
  if (!submissionColumns.has("expires_at")) {
    db.exec("ALTER TABLE replay_submissions ADD COLUMN expires_at TEXT NULL;");
  }

  const legacySubmissions = db
    .prepare(
      `
        SELECT submission_id, created_at, updated_at
          FROM replay_submissions
         WHERE expires_at IS NULL OR expires_at = ''
      `
    )
    .all();
  if (legacySubmissions.length) {
    const fallbackMs = now();
    const updateExpiry = db.prepare("UPDATE replay_submissions SET expires_at = ? WHERE submission_id = ?");
    for (const submission of legacySubmissions) {
      updateExpiry.run(
        plusMs(submission.updated_at || submission.created_at, submissionTtlMs, fallbackMs),
        submission.submission_id
      );
    }
  }

  db.exec(`
    CREATE UNIQUE INDEX IF NOT EXISTS idx_uploaded_artifacts_kind_sha256
      ON uploaded_artifacts(kind, sha256);
    CREATE INDEX IF NOT EXISTS idx_uploaded_artifacts_expires_at
      ON uploaded_artifacts(expires_at);
    CREATE INDEX IF NOT EXISTS idx_replay_submissions_record
      ON replay_submissions(record_id, updated_at DESC);
    CREATE INDEX IF NOT EXISTS idx_replay_submissions_map
      ON replay_submissions(map_uid, updated_at DESC);
    CREATE INDEX IF NOT EXISTS idx_replay_submissions_expires_at
      ON replay_submissions(expires_at);
    CREATE INDEX IF NOT EXISTS idx_upload_quota_usage_day
      ON upload_quota_usage(day_utc);
  `);
  return db;
}

function createDatabase(filePath, { submissionTtlMs, now = Date.now } = {}) {
  ensureParentDirectorySync(filePath);
  return openSqliteDatabase({
    filePath,
    initialize: (db) => initializeDatabase(db, { submissionTtlMs, now }),
  });
}

class ValidifierRepository {
  constructor({ dbFile, artifactTtlMs, submissionTtlMs = artifactTtlMs, now = Date.now }) {
    this.artifactTtlMs = Math.max(1, Number(artifactTtlMs) || 1);
    this.submissionTtlMs = Math.max(1, Number(submissionTtlMs) || this.artifactTtlMs);
    this.now = now;
    this.db = createDatabase(dbFile, { submissionTtlMs: this.submissionTtlMs, now: this.now });
  }

  createOrReuseArtifact({ kind, sha256, sizeBytes, originalFilename, storagePath }) {
    const existing = this.findArtifactByHash(kind, sha256);
    const nowIso = utcNowIso(this.now);
    const expiresAt = plusMs(nowIso, this.artifactTtlMs);

    if (existing) {
      this.db
        .prepare(
          `
            UPDATE uploaded_artifacts
               SET size_bytes = ?,
                   original_filename = ?,
                   storage_path = ?,
                   expires_at = ?,
                   last_used_at = ?
             WHERE artifact_ref = ?
          `
        )
        .run(sizeBytes, originalFilename, storagePath, expiresAt, nowIso, existing.artifact_ref);
      return {
        reused: true,
        artifact: this.findArtifactByRef(existing.artifact_ref),
      };
    }

    const artifactRef = `vfart_${kind}_${crypto.randomUUID().replace(/-/g, "")}`;
    this.db
      .prepare(
        `
          INSERT INTO uploaded_artifacts (
            artifact_ref,
            kind,
            sha256,
            size_bytes,
            original_filename,
            storage_path,
            created_at,
            expires_at,
            last_used_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        `
      )
      .run(artifactRef, kind, sha256, sizeBytes, originalFilename, storagePath, nowIso, expiresAt, nowIso);

    return {
      reused: false,
      artifact: this.findArtifactByRef(artifactRef),
    };
  }

  findArtifactByHash(kind, sha256) {
    return (
      this.db
        .prepare(
          `
            SELECT artifact_ref, kind, sha256, size_bytes, original_filename, storage_path, created_at, expires_at, last_used_at
              FROM uploaded_artifacts
             WHERE kind = ? AND sha256 = ?
             LIMIT 1
          `
        )
        .get(kind, sha256) || null
    );
  }

  findArtifactByRef(artifactRef) {
    return (
      this.db
        .prepare(
          `
            SELECT artifact_ref, kind, sha256, size_bytes, original_filename, storage_path, created_at, expires_at, last_used_at
              FROM uploaded_artifacts
             WHERE artifact_ref = ?
             LIMIT 1
          `
        )
        .get(artifactRef) || null
    );
  }

  touchArtifacts(artifactRefs = []) {
    const nowIso = utcNowIso(this.now);
    const expiresAt = plusMs(nowIso, this.artifactTtlMs);
    const stmt = this.db.prepare(
      `
        UPDATE uploaded_artifacts
           SET expires_at = ?,
               last_used_at = ?
         WHERE artifact_ref = ?
      `
    );

    for (const artifactRef of artifactRefs) {
      if (!artifactRef) continue;
      stmt.run(expiresAt, nowIso, artifactRef);
    }
  }

  nextSubmissionId() {
    return `vfsub_${crypto.randomUUID().replace(/-/g, "")}`;
  }

  createReplaySubmission({ submissionId = null, recordId, mapUid, rank, mapRef, replayRef, privateJobId = null }) {
    const resolvedSubmissionId = submissionId || this.nextSubmissionId();
    const nowIso = utcNowIso(this.now);
    const expiresAt = plusMs(nowIso, this.submissionTtlMs);
    this.db
      .prepare(
        `
          INSERT INTO replay_submissions (
            submission_id,
            record_id,
            map_uid,
            rank,
            map_ref,
            replay_ref,
            status,
            created_at,
            updated_at,
            expires_at,
            private_job_id
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `
      )
      .run(
        resolvedSubmissionId,
        recordId,
        mapUid,
        Number.isInteger(rank) ? rank : null,
        mapRef,
        replayRef,
        "pending",
        nowIso,
        nowIso,
        expiresAt,
        privateJobId
      );
    return this.getSubmissionById(resolvedSubmissionId);
  }

  getSubmissionById(submissionId) {
    return (
      this.db
        .prepare(
          `
            SELECT submission_id, record_id, map_uid, rank, map_ref, replay_ref, status, created_at, updated_at, expires_at, private_job_id
              FROM replay_submissions
             WHERE submission_id = ?
               AND expires_at > ?
             LIMIT 1
          `
        )
        .get(submissionId, utcNowIso(this.now)) || null
    );
  }

  getLatestSubmissionForRecord(recordId) {
    return (
      this.db
        .prepare(
          `
            SELECT submission_id, record_id, map_uid, rank, map_ref, replay_ref, status, created_at, updated_at, expires_at, private_job_id
              FROM replay_submissions
             WHERE record_id = ?
               AND expires_at > ?
             ORDER BY updated_at DESC, created_at DESC
             LIMIT 1
          `
        )
        .get(recordId, utcNowIso(this.now)) || null
    );
  }

  getLatestSubmissionsForRecordIds(recordIds = []) {
    const values = [...new Set((recordIds || []).filter(Boolean))];
    if (!values.length) return [];
    const placeholders = values.map(() => "?").join(", ");
    const rows =
      this.db
        .prepare(
          `
            SELECT submission_id, record_id, map_uid, rank, map_ref, replay_ref, status, created_at, updated_at, expires_at, private_job_id
              FROM replay_submissions
             WHERE record_id IN (${placeholders})
               AND expires_at > ?
             ORDER BY record_id ASC, updated_at DESC, created_at DESC
          `
        )
        .all(...values, utcNowIso(this.now)) || [];

    const latestByRecordId = new Map();
    for (const row of rows) {
      if (!latestByRecordId.has(row.record_id)) {
        latestByRecordId.set(row.record_id, row);
      }
    }
    return [...latestByRecordId.values()];
  }

  listLatestSubmissions(limit = 250) {
    const rows =
      this.db
        .prepare(
          `
            SELECT submission_id, record_id, map_uid, rank, map_ref, replay_ref, status, created_at, updated_at, expires_at, private_job_id
              FROM replay_submissions
             WHERE expires_at > ?
             ORDER BY updated_at DESC, created_at DESC
          `
        )
        .all(utcNowIso(this.now)) || [];

    const latestByRecordId = new Map();
    for (const row of rows) {
      if (!latestByRecordId.has(row.record_id)) {
        latestByRecordId.set(row.record_id, row);
      }
    }

    return [...latestByRecordId.values()].slice(0, Math.max(1, Number(limit) || 250));
  }

  listLatestSubmissionsForMap(mapUid, limit = 100) {
    const rows =
      this.db
        .prepare(
          `
            SELECT submission_id, record_id, map_uid, rank, map_ref, replay_ref, status, created_at, updated_at, expires_at, private_job_id
              FROM replay_submissions
             WHERE map_uid = ?
               AND expires_at > ?
             ORDER BY updated_at DESC, created_at DESC
          `
        )
        .all(mapUid, utcNowIso(this.now)) || [];

    const latestByRecordId = new Map();
    for (const row of rows) {
      if (!latestByRecordId.has(row.record_id)) {
        latestByRecordId.set(row.record_id, row);
      }
    }

    return [...latestByRecordId.values()]
      .sort((left, right) => {
        const leftRank = Number.isInteger(left.rank) ? left.rank : Number.MAX_SAFE_INTEGER;
        const rightRank = Number.isInteger(right.rank) ? right.rank : Number.MAX_SAFE_INTEGER;
        if (leftRank !== rightRank) return leftRank - rightRank;
        return String(right.updated_at || "").localeCompare(String(left.updated_at || ""));
      })
      .slice(0, Math.max(1, Number(limit) || 100));
  }

  gcExpiredSubmissions() {
    const nowIso = utcNowIso(this.now);
    const rows =
      this.db
        .prepare(
          `
            SELECT submission_id, map_ref, replay_ref
              FROM replay_submissions
             WHERE julianday(expires_at) IS NULL
                OR expires_at <= ?
          `
        )
        .all(nowIso) || [];
    if (!rows.length) return [];

    const remove = this.db.prepare(
      `
        DELETE FROM replay_submissions
         WHERE submission_id = ?
           AND (julianday(expires_at) IS NULL OR expires_at <= ?)
      `
    );
    for (const row of rows) remove.run(row.submission_id, nowIso);
    return rows;
  }

  listExpiredArtifacts() {
    return (
      this.db
        .prepare(
          `
            SELECT artifact_ref, storage_path
              FROM uploaded_artifacts
             WHERE expires_at <= ?
               AND NOT EXISTS (
                 SELECT 1
                   FROM replay_submissions
                  WHERE replay_submissions.map_ref = uploaded_artifacts.artifact_ref
                     OR replay_submissions.replay_ref = uploaded_artifacts.artifact_ref
               )
          `
        )
        .all(utcNowIso(this.now)) || []
    );
  }

  deleteExpiredArtifact(artifactRef, storagePath) {
    const result = this.db
      .prepare(
        `
          DELETE FROM uploaded_artifacts
           WHERE artifact_ref = ?
             AND storage_path = ?
             AND expires_at <= ?
             AND NOT EXISTS (
               SELECT 1
                 FROM replay_submissions
                WHERE replay_submissions.map_ref = uploaded_artifacts.artifact_ref
                   OR replay_submissions.replay_ref = uploaded_artifacts.artifact_ref
             )
        `
      )
      .run(artifactRef, storagePath, utcNowIso(this.now));
    return result.changes === 1;
  }

  gcExpiredArtifacts() {
    return this.listExpiredArtifacts();
  }

  reserveUploadBytes({ clientKey, byteCount, bytesPerDay, globalBytesPerDay, nowMs = this.now() }) {
    const bytes = Number(byteCount);
    const limit = Number(bytesPerDay);
    const globalLimit = Number(globalBytesPerDay);
    if (
      !clientKey ||
      !Number.isSafeInteger(bytes) ||
      bytes <= 0 ||
      !Number.isSafeInteger(limit) ||
      limit <= 0 ||
      !Number.isSafeInteger(globalLimit) ||
      globalLimit <= 0
    ) {
      throw new Error("Invalid upload quota reservation.");
    }
    if (bytes > limit) return { allowed: false, scope: "client", bytesUsed: 0, globalBytesUsed: 0 };
    if (bytes > globalLimit) return { allowed: false, scope: "global", bytesUsed: 0, globalBytesUsed: 0 };

    const dayUtc = new Date(nowMs).toISOString().slice(0, 10);
    const updatedAt = new Date(nowMs).toISOString();
    const clientUsageKey = `client:${clientKey}`;
    const globalUsageKey = "global";
    const findUsage = this.db.prepare("SELECT bytes_used FROM upload_quota_usage WHERE client_key = ? AND day_utc = ?");
    const storeUsage = this.db.prepare(
      `
        INSERT INTO upload_quota_usage (client_key, day_utc, bytes_used, updated_at)
        VALUES (?, ?, ?, ?)
        ON CONFLICT(client_key, day_utc) DO UPDATE SET
          bytes_used = excluded.bytes_used,
          updated_at = excluded.updated_at
      `
    );

    this.db.exec("BEGIN IMMEDIATE;");
    try {
      const clientBytesUsed = Number(findUsage.get(clientUsageKey, dayUtc)?.bytes_used) || 0;
      const globalBytesUsed = Number(findUsage.get(globalUsageKey, dayUtc)?.bytes_used) || 0;
      if (clientBytesUsed + bytes > limit) {
        this.db.exec("ROLLBACK;");
        return { allowed: false, scope: "client", bytesUsed: clientBytesUsed, globalBytesUsed };
      }
      if (globalBytesUsed + bytes > globalLimit) {
        this.db.exec("ROLLBACK;");
        return { allowed: false, scope: "global", bytesUsed: clientBytesUsed, globalBytesUsed };
      }

      storeUsage.run(clientUsageKey, dayUtc, clientBytesUsed + bytes, updatedAt);
      storeUsage.run(globalUsageKey, dayUtc, globalBytesUsed + bytes, updatedAt);
      this.db.exec("COMMIT;");
      return {
        allowed: true,
        scope: null,
        bytesUsed: clientBytesUsed + bytes,
        globalBytesUsed: globalBytesUsed + bytes,
      };
    } catch (error) {
      try {
        this.db.exec("ROLLBACK;");
      } catch {}
      throw error;
    }
  }

  pruneUploadQuotaUsage() {
    const currentDay = new Date(this.now()).toISOString().slice(0, 10);
    return this.db.prepare("DELETE FROM upload_quota_usage WHERE day_utc < ?").run(currentDay).changes;
  }
}

export { ValidifierRepository };
