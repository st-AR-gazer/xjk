import { serializeJson, toText, uniqueBy } from "../alteredRepositorySupport.js";

class AlteredNameCandidateRepository {
  constructor(db) {
    this.db = db;
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
          Number.isFinite(Number(candidate?.parserConfidence)) ? Number(candidate.parserConfidence) : 0,
          String(candidate?.season || "").trim() || null,
          Number.isFinite(Number(candidate?.year)) ? Math.floor(Number(candidate.year)) : null,
          Number.isFinite(Number(candidate?.mapNumber)) ? Math.floor(Number(candidate.mapNumber)) : null,
          serializeJson(Array.isArray(candidate?.mapNumbers) ? candidate.mapNumbers : []),
          String(candidate?.alteration || "").trim() || null,
          serializeJson(Array.isArray(candidate?.alterationMix) ? candidate.alterationMix : []),
          String(candidate?.automationState || "")
            .trim()
            .toLowerCase() === "matched"
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
      (Array.isArray(mapUids) ? mapUids : []).map((value) => toText(value)).filter(Boolean),
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
}

export { AlteredNameCandidateRepository };
