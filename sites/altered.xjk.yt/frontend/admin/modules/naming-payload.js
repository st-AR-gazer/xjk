import { findRow } from "./ui.js?v=2";

export function buildNamingDetailFallbackPayload(mapUid) {
  const uid = String(mapUid || "").trim();
  const row = findRow(uid);
  if (!row) {
    return {
      map: {
        mapUid: uid,
        name: uid || "Map",
        campaign: "Unassigned",
        slot: null,
      },
      diagnostics: {},
      loading: true,
      loadError: "",
    };
  }

  const candidate = {
    mapUid: row.mapUid || uid,
    originalName: row.originalName || "",
    sanitizedName: row.sanitizedName || "",
    proposedName: row.proposedName || null,
    manualName: row.manualName || null,
    finalName: row.finalName || row.proposedName || row.sanitizedName || row.originalName || row.mapUid || uid,
    parserPattern: row.parserPattern || null,
    parserConfidence: row.parserConfidence != null ? Number(row.parserConfidence) : null,
    mapNumber: row.mapNumber != null ? Number(row.mapNumber) : null,
    mapNumbers: Array.isArray(row.mapNumbers) ? row.mapNumbers : [],
    automationState: row.automationState || null,
    reviewState: row.reviewState || null,
    requiresRegex: Boolean(row.requiresRegex),
    campaign: row.campaign || "Unassigned",
    campaignId: row.campaignId != null ? Number(row.campaignId) : null,
    slot: row.slot != null ? Number(row.slot) : null,
    tracked: Boolean(row.tracked),
    status: row.status || "live",
    sourceVersion: row.sourceVersion || null,
  };
  const similarityDetails =
    row.similarityDetails && typeof row.similarityDetails === "object" ? row.similarityDetails : {};
  const similarityMatches = Array.isArray(row.similarityCandidateMatches) ? row.similarityCandidateMatches : [];

  return {
    map: {
      mapUid: candidate.mapUid,
      name: candidate.finalName || candidate.originalName || candidate.mapUid,
      campaign: candidate.campaign,
      slot: candidate.slot,
    },
    localFile:
      row.localFileStatus || row.localFilePath
        ? {
            status: row.localFileStatus || null,
            relativePath: row.localFilePath || null,
          }
        : null,
    storedCandidate: candidate,
    freshCandidate: candidate,
    similarity:
      row.similarityStatus || similarityMatches.length || Object.keys(similarityDetails).length
        ? {
            assignedMapNumbers: candidate.mapNumbers,
            topScore: row.similarityTopScore != null ? Number(row.similarityTopScore) : null,
            confidence: row.similarityConfidence != null ? Number(row.similarityConfidence) : null,
            referenceCampaignName: row.similarityReferenceCampaignName || null,
            primaryReferenceSlot: row.similarityReferenceSlot != null ? Number(row.similarityReferenceSlot) : null,
            candidateMatches: similarityMatches,
            details: similarityDetails,
          }
        : null,
    signature:
      row.signatureStatus || row.signatureError
        ? {
            sourceStatus: row.signatureStatus || null,
            sourceError: row.signatureError || null,
          }
        : null,
    diagnostics: {
      staleStoredCandidate: false,
      unmatchedReason: row.similarityMatchWarning || "",
      autoApproval: null,
      autoResolvableNow: Array.isArray(candidate.mapNumbers) && candidate.mapNumbers.length > 0,
    },
    loading: true,
    loadError: "",
  };
}

export function mergeNamingDetailPayload(basePayload, detailPayload) {
  const base = basePayload && typeof basePayload === "object" ? basePayload : {};
  const detail = detailPayload && typeof detailPayload === "object" ? detailPayload : {};
  return {
    ...base,
    ...detail,
    map: {
      ...(base.map || {}),
      ...(detail.map || {}),
    },
    localFile: detail.localFile ?? base.localFile ?? null,
    storedCandidate: detail.storedCandidate ?? base.storedCandidate ?? null,
    freshNameCandidate: detail.freshNameCandidate ?? base.freshNameCandidate ?? null,
    freshCandidate: detail.freshCandidate ?? base.freshCandidate ?? null,
    similarity: detail.similarity ?? base.similarity ?? null,
    similarityWeights: detail.similarityWeights ?? base.similarityWeights ?? null,
    signature: detail.signature ?? base.signature ?? null,
    diagnostics: {
      ...(base.diagnostics || {}),
      ...(detail.diagnostics || {}),
    },
    loading: Boolean(detail.loading),
    loadError: detail.loadError || "",
  };
}
