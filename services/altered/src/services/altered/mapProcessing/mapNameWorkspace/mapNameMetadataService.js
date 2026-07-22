import {
  buildMapNameCandidate,
  CONTENT_SIGNATURE_VERSION,
  evaluateSimilarityAutoApproval,
  NAMING_SIMILARITY_SOURCE_OPTIONS,
  normalizeUniqueStrings,
  resolveMapUid,
  shouldExcludeFromNamingReview,
  summarizeCandidates,
  toText,
} from "../../serviceSupport.js";

class MapNameMetadataService {
  constructor({
    repository,
    getProjectSourceService,
    getAutomaticSimilarityTargetMapUids,
    assignStoredMapMetadata,
    assignStoredMapNumbersBySimilarity,
  }) {
    this.repository = repository;
    this.getProjectSourceService = getProjectSourceService;
    this.getAutomaticSimilarityTargetMapUids = getAutomaticSimilarityTargetMapUids;
    this.assignStoredMapMetadata = assignStoredMapMetadata;
    this.assignStoredMapNumbersBySimilarity = assignStoredMapNumbersBySimilarity;
  }

  getSourceOptions() {
    const enabledProjectSources = new Set(
      this.getProjectSourceService()
        .getProjectSources({ includeDisabled: true })
        .filter((source) => source?.enabled !== false)
        .map((source) => toText(source?.sourceKey).toLowerCase())
        .filter(Boolean)
    );
    return NAMING_SIMILARITY_SOURCE_OPTIONS.filter((option) => !option.key || enabledProjectSources.has(option.key));
  }

  collectCampaignMapUids(campaigns = [], predicate = null) {
    const filterFn = typeof predicate === "function" ? predicate : null;
    return normalizeUniqueStrings(
      (Array.isArray(campaigns) ? campaigns : []).flatMap((campaign) =>
        (Array.isArray(campaign?.maps) ? campaign.maps : [])
          .filter((map) => (filterFn ? filterFn(map, campaign) : true))
          .map((map) => resolveMapUid(map))
      )
    );
  }

  getAutomaticTargetMapUids({ mapUids = [], forceSimilarity = false } = {}) {
    const safeMapUids = normalizeUniqueStrings(mapUids);
    if (!safeMapUids.length) return [];
    if (forceSimilarity) return safeMapUids;
    return normalizeUniqueStrings(
      this.repository.naming
        .listMapsNeedingSimilarityRefresh({
          mapUids: safeMapUids,
          limit: Math.max(1, safeMapUids.length),
          requiredAssignmentMethod: CONTENT_SIGNATURE_VERSION,
          includePayload: false,
        })
        .map((map) => resolveMapUid(map))
        .filter(Boolean)
    );
  }

  async runAutomaticAssignments({ mapUids = [], forceSimilarity = false, persistCandidates = true } = {}) {
    const selectedMapUids = this.getAutomaticSimilarityTargetMapUids({ mapUids, forceSimilarity });
    if (!selectedMapUids.length) {
      return {
        selectedMapUids: [],
        metadataAssignment: { ok: true, processed: 0, matched: 0, unmatched: 0 },
        namingAssignment: { ok: true, processed: 0, resolved: 0, unresolved: 0 },
      };
    }

    const metadataAssignment = this.assignStoredMapMetadata({
      mapUids: selectedMapUids,
      limit: Math.max(1, selectedMapUids.length),
    });
    const namingAssignment = await this.assignStoredMapNumbersBySimilarity({
      mapUids: selectedMapUids,
      limit: Math.max(1, selectedMapUids.length),
      persistCandidates,
      force: forceSimilarity,
      rescanAll: false,
    });
    return { selectedMapUids, metadataAssignment, namingAssignment };
  }

  assignStoredMetadata({ q = "", limit = 60000, mapUids = [] } = {}) {
    const sourceMaps = this.repository.naming.listMapsForNameStandardization({ q, limit, mapUids });
    const excludedMapUids = sourceMaps
      .filter((map) => shouldExcludeFromNamingReview(map))
      .map((map) => String(map?.mapUid || "").trim())
      .filter(Boolean);
    const excludedMapUidSet = new Set(excludedMapUids.map((mapUid) => mapUid.toLowerCase()));
    const candidates = sourceMaps
      .filter(
        (map) =>
          !excludedMapUidSet.has(
            String(map?.mapUid || "")
              .trim()
              .toLowerCase()
          )
      )
      .map((map) => buildMapNameCandidate(map))
      .filter((candidate) => String(candidate?.mapUid || "").trim().length > 0);
    const counts = summarizeCandidates(candidates);

    if (excludedMapUids.length) {
      this.repository.naming.deleteMapNameCandidates({ mapUids: excludedMapUids });
    }

    const upsert = this.repository.naming.upsertMapNameCandidates({ candidates });
    if (upsert?.error) return { error: upsert.error };

    return {
      ok: true,
      processed: Number(upsert.processed || 0),
      inserted: Number(upsert.inserted || 0),
      updated: Number(upsert.updated || 0),
      excluded: excludedMapUids.length,
      matched: counts.matched,
      unmatched: counts.unmatched,
      summary: this.repository.naming.getMapNameCandidateSummary(),
    };
  }

  processStandardization({ q = "", limit = 60000 } = {}) {
    return this.assignStoredMapMetadata({ q, limit });
  }

  applyAutoApproval({ mapUids = [] } = {}) {
    const similarityByUid = new Map(
      this.repository.naming
        .getMapNumberSimilarity({ mapUids })
        .map((item) => [String(item.mapUid || "").toLowerCase(), item])
    );
    const signatureByUid = new Map(
      this.repository.mapFiles
        .getMapContentSignatures({ mapUids })
        .map((item) => [String(item.mapUid || "").toLowerCase(), item])
    );
    const eligibleMapUids = [];
    for (const rawMapUid of Array.isArray(mapUids) ? mapUids : []) {
      const mapUid = toText(rawMapUid);
      if (!mapUid) continue;
      const similarity = similarityByUid.get(mapUid.toLowerCase()) || null;
      const signature = signatureByUid.get(mapUid.toLowerCase()) || null;
      const decision = evaluateSimilarityAutoApproval({
        similarity,
        signatureStatus: signature?.sourceStatus || "",
        assignedMapNumbers: similarity?.assignedMapNumbers || [],
      });
      if (decision.eligible) eligibleMapUids.push(mapUid);
    }
    const approval = this.repository.naming.bulkApproveMapNameCandidates({
      mapUids: eligibleMapUids,
      reviewNote: "Auto-approved by local map-copy similarity backfill.",
    });
    return {
      processed: Array.isArray(mapUids) ? mapUids.length : 0,
      eligible: eligibleMapUids.length,
      approved: Number(approval?.approved || 0),
      mapUids: eligibleMapUids,
    };
  }
}

export { MapNameMetadataService };
