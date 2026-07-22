import {
  EXCLUDE_NONCANONICAL_WEEKLY_SHORTS_SQL,
  rowToNameCandidate,
  toText,
  uniqueBy,
} from "../alteredRepositorySupport.js";

function buildNameCandidateFilter({ q, automationState, reviewState, requiresRegex }) {
  const where = ["1 = 1"];
  const params = [];
  const query = toText(q).toLowerCase();
  if (query) {
    const pattern = `%${query}%`;
    where.push(
      `(LOWER(n.map_uid) LIKE ? OR LOWER(n.original_name) LIKE ? OR LOWER(COALESCE(n.proposed_name, '')) LIKE ? OR LOWER(COALESCE(n.manual_name, '')) LIKE ? OR LOWER(COALESCE(c.name, '')) LIKE ?)`
    );
    params.push(pattern, pattern, pattern, pattern, pattern);
  }

  const normalizedAutomation = toText(automationState).toLowerCase();
  if (["matched", "unmatched"].includes(normalizedAutomation)) {
    where.push("n.automation_state = ?");
    params.push(normalizedAutomation);
  }

  const normalizedReview = toText(reviewState).toLowerCase();
  if (["pending", "approved", "ignored"].includes(normalizedReview)) {
    where.push("n.review_state = ?");
    params.push(normalizedReview);
  }

  if (typeof requiresRegex === "boolean") {
    where.push("n.requires_regex = ?");
    params.push(requiresRegex ? 1 : 0);
  }
  return { where, params };
}

const NAME_CANDIDATE_SELECT = `
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
`;

class AlteredNameCandidateReviewRepository {
  constructor(db) {
    this.db = db;
  }

  bulkApproveMapNameCandidates({ mapUids = [], reviewNote = "" } = {}) {
    const safeMapUids = uniqueBy(
      (Array.isArray(mapUids) ? mapUids : []).map((value) => toText(value)).filter(Boolean),
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
    const { where, params } = buildNameCandidateFilter({
      q,
      automationState,
      reviewState,
      requiresRegex,
    });
    const safeLimit = Math.max(1, Math.min(Number(limit) || 220, 1200));
    const safeOffset = Math.max(0, Math.min(Number(offset) || 0, 1_000_000));

    const rows = this.db
      .prepare(
        `
        ${NAME_CANDIDATE_SELECT}
        WHERE ${where.join(" AND ")}
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

  countMapNameCandidates({ q = "", automationState = "", reviewState = "", requiresRegex = undefined } = {}) {
    const { where, params } = buildNameCandidateFilter({
      q,
      automationState,
      reviewState,
      requiresRegex,
    });

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
        ${NAME_CANDIDATE_SELECT}
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

    const normalizedReview = String(reviewState || "")
      .trim()
      .toLowerCase();
    if (normalizedReview === "pending" || normalizedReview === "approved" || normalizedReview === "ignored") {
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
}

export { AlteredNameCandidateReviewRepository, buildNameCandidateFilter };
