import { clampInt, parseJsonSafe, serializeJson, toText, uniqueBy } from "../alteredRepositorySupport.js";

class AlteredMapNumberSimilarityRepository {
  constructor(db) {
    this.db = db;
  }

  getMapNumberSimilarity({ mapUids = [] } = {}) {
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
          clampInt(record?.referenceCampaignId, {
            min: 1,
            max: 2147483647,
            fallback: 0,
          }) || null,
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
}

export { AlteredMapNumberSimilarityRepository };
