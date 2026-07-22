import {
  CONTENT_SIGNATURE_VERSION,
  CONTENT_SIMILARITY_PATTERN,
  applySimilaritySelectionToMatches,
  buildCampaignFamily,
  buildMapNameCandidate,
  buildSimilarityWeightProfile,
  buildSimilarityWeightTargetContext,
  classifyNamingSimilaritySource,
  clampInt,
  computeContentSimilarity,
  isCompetitionFamily,
  mergeSimilarityIntoCandidate,
  normalizeMapNumbers,
  normalizeUniqueStrings,
  resolveActiveSimilarityWeightProfile,
  similarityNeedsRefresh,
  toText,
} from "../../serviceSupport.js";
import { normalizeReferenceFamilyKey } from "./similarityReferenceCatalog.js";

function resolveTargetWeightContext(run, map) {
  const targetCampaignMeta =
    Number(map?.campaignId || 0) > 0 ? run.campaignCatalogById.get(Number(map.campaignId)) || null : null;
  return buildSimilarityWeightTargetContext({
    sourceKey:
      toText(targetCampaignMeta?.source_classification || targetCampaignMeta?.source_key).toLowerCase() ||
      classifyNamingSimilaritySource(map),
    season: targetCampaignMeta?.season || null,
    seasonYear: Number(targetCampaignMeta?.season_year || 0) || null,
    environment: targetCampaignMeta?.environment || map?.mapEnvironment || map?.environment || "",
    alterationSlugs: Array.isArray(targetCampaignMeta?.alterations)
      ? targetCampaignMeta.alterations.map((item) => item?.slug)
      : [],
  });
}

function resolveReferenceContext(run, campaignName) {
  const family = buildCampaignFamily(campaignName);
  const familyKey = toText(family.key);
  const normalizedFamilyKey = normalizeReferenceFamilyKey(familyKey);
  const familyContext = familyKey
    ? run.familyReferenceContextByKey.get(familyKey) || run.familyReferenceContextByKey.get(normalizedFamilyKey) || null
    : null;
  const hasFamilyEntries = Boolean(familyContext?.entries?.length);
  return {
    family,
    activeReferenceContext: hasFamilyEntries ? familyContext : run.referenceContext,
    activeReferenceScope: hasFamilyEntries ? "catalog-family" : "catalog-base-global",
  };
}

function resolveSignatureDiagnostics(targetSignatureRecord, activeReferenceContext) {
  const targetSignature = targetSignatureRecord?.signature || null;
  const targetSignatureVersion = toText(targetSignatureRecord?.signature?.version || "") || null;
  const targetUsesFallbackSignature =
    String(targetSignatureRecord?.sourceStatus || "").toLowerCase() === "ready" &&
    targetSignatureVersion !== CONTENT_SIGNATURE_VERSION;
  const fallbackReferenceEntries = Array.isArray(activeReferenceContext?.entries)
    ? activeReferenceContext.entries.filter((entry) => !Boolean(entry?.isStructuredSignature))
    : [];
  const fallbackReferenceSlots = normalizeMapNumbers(fallbackReferenceEntries.map((entry) => entry?.slot));
  const fallbackReferenceMapUids = normalizeUniqueStrings(
    fallbackReferenceEntries.map((entry) => toText(entry?.mapUid))
  );
  const diagnosticWarnings = [];
  if (targetUsesFallbackSignature) {
    diagnosticWarnings.push("Target map is using a fallback asset-token signature. Similarity precision is degraded.");
  }
  if (fallbackReferenceSlots.length > 0) {
    diagnosticWarnings.push(
      `Reference slots ${fallbackReferenceSlots.join(", ")} are using fallback asset-token signatures. Similarity rankings for those slots are degraded.`
    );
  }
  return {
    targetSignature,
    targetSignatureVersion,
    targetUsesFallbackSignature,
    fallbackReferenceEntries,
    fallbackReferenceSlots,
    fallbackReferenceMapUids,
    diagnosticWarnings,
  };
}

function matchTargetMap(run, map, targetSignatureRecord, existingSimilarity) {
  const targetWeightContext = resolveTargetWeightContext(run, map);
  const activeWeightProfile = resolveActiveSimilarityWeightProfile(
    { mapUid: map.mapUid, campaignId: map.campaignId },
    {
      ...run.similarityWeightOverrides,
      scopedRules: run.similarityWeightRules,
      targetContext: targetWeightContext,
    }
  );
  const { family, activeReferenceContext, activeReferenceScope } = resolveReferenceContext(run, map.campaignName);
  const baseCandidate = buildMapNameCandidate(map);
  const {
    targetSignature,
    targetSignatureVersion,
    targetUsesFallbackSignature,
    fallbackReferenceEntries,
    fallbackReferenceSlots,
    fallbackReferenceMapUids,
    diagnosticWarnings,
  } = resolveSignatureDiagnostics(targetSignatureRecord, activeReferenceContext);

  const isWeeklyShortsFamily = toText(family?.parsed?.special).toLowerCase() === "weekly shorts";
  const includeNameSupport = !toText(family?.parsed?.season) || isCompetitionFamily(family, null);
  const computedSimilarity = isWeeklyShortsFamily
    ? buildWeeklyShortsSimilarity(baseCandidate, map)
    : computeContentSimilarity(targetSignature, activeReferenceContext, {
        targetName: map.name,
        targetMapNumbers: Array.isArray(baseCandidate?.mapNumbers) ? baseCandidate.mapNumbers : [],
        targetParserPattern: baseCandidate?.parserPattern || "",
        includeNameSupport,
        weightProfile: activeWeightProfile.effectiveWeights,
      });
  const hasManualSimilaritySelection = Boolean(existingSimilarity?.details?.manualSelection);
  const similarity = hasManualSimilaritySelection
    ? preserveManualSelection(computedSimilarity, existingSimilarity)
    : computedSimilarity;
  const mergedCandidateBase = mergeSimilarityIntoCandidate(baseCandidate, similarity, {
    regexOnly: Boolean(activeWeightProfile?.effectiveWeights?.regexOnly),
  });
  const mergedCandidate = hasManualSimilaritySelection
    ? preserveManualCandidate(mergedCandidateBase, similarity)
    : mergedCandidateBase;

  return {
    candidate: mergedCandidate,
    similarityRecord: buildSimilarityRecord({
      map,
      family,
      similarity,
      activeWeightProfile,
      activeReferenceContext,
      activeReferenceScope,
      targetSignatureRecord,
      targetSignatureVersion,
      targetUsesFallbackSignature,
      fallbackReferenceEntries,
      fallbackReferenceSlots,
      fallbackReferenceMapUids,
      diagnosticWarnings,
      includeNameSupport,
      isWeeklyShortsFamily,
    }),
    recentMap: {
      mapUid: map.mapUid,
      mapName: map.name || map.mapUid,
      campaignName: map.campaignName || null,
      slot: map.slot || null,
      resolved: Array.isArray(similarity?.mapNumbers) && similarity.mapNumbers.length > 0,
      mapNumbers: similarity?.mapNumbers || [],
      referenceCampaignName: similarity?.referenceCampaignName || null,
      primaryReferenceMapUid: similarity?.primaryReferenceMapUid || null,
      primaryReferenceSlot: similarity?.primaryReferenceSlot || null,
      topScore: similarity?.topScore,
      confidence: similarity?.confidence,
      manualSelection: hasManualSimilaritySelection,
    },
    changed:
      JSON.stringify(Array.isArray(baseCandidate.mapNumbers) ? baseCandidate.mapNumbers : []) !==
      JSON.stringify(Array.isArray(mergedCandidate.mapNumbers) ? mergedCandidate.mapNumbers : []),
    resolved: Array.isArray(similarity?.mapNumbers) && similarity.mapNumbers.length > 0,
    refreshed: similarityNeedsRefresh(existingSimilarity, {
      expectedWeightFingerprint: activeWeightProfile.fingerprint,
    }),
    upgraded:
      Boolean(existingSimilarity && toText(existingSimilarity?.assignmentMethod)) &&
      toText(existingSimilarity?.assignmentMethod) !== CONTENT_SIGNATURE_VERSION,
  };
}

function buildWeeklyShortsSimilarity(baseCandidate, map) {
  const resolved = Array.isArray(baseCandidate?.mapNumbers) && baseCandidate.mapNumbers.length > 0;
  return {
    resolved,
    mapNumbers: Array.isArray(baseCandidate?.mapNumbers) ? baseCandidate.mapNumbers : [],
    topScore: resolved ? 1 : 0,
    secondScore: 0,
    confidence: resolved ? 1 : 0,
    primaryReferenceMapUid: null,
    primaryReferenceSlot: Number(baseCandidate?.mapNumber || 0) || null,
    referenceCampaignId: null,
    referenceCampaignName: map.campaignName || null,
    candidateMatches: [],
    details: {
      matchClassification: resolved ? "weekly-shorts-canonical" : "weekly-shorts-unresolved",
      matchWarning: resolved
        ? `Weekly Shorts slot ${baseCandidate.mapNumber} resolved from week metadata and title mapping.`
        : "Weekly Shorts map could not be resolved from title mapping.",
      selectedCandidateMapUids: [],
      selectedCandidateCount: 0,
      referenceCampaignCount: 1,
      referenceMapCount: 5,
      referenceMapCountTotal: 5,
      structuredReferenceMapCount: 0,
      usedStructuredReferences: false,
      closestMapName: toText(baseCandidate?.weeklyShortsTitle) || null,
      weeklyShorts: {
        week: Number(baseCandidate?.weeklyShortsWeek || 0) || null,
        position: Number(baseCandidate?.weeklyShortsPosition || 0) || null,
        title: toText(baseCandidate?.weeklyShortsTitle) || null,
      },
    },
  };
}

function preserveManualSelection(computedSimilarity, existingSimilarity) {
  return {
    ...computedSimilarity,
    mapNumbers: normalizeMapNumbers(existingSimilarity?.assignedMapNumbers || existingSimilarity?.mapNumbers || []),
    primaryReferenceMapUid:
      existingSimilarity?.primaryReferenceMapUid || computedSimilarity?.primaryReferenceMapUid || null,
    primaryReferenceSlot:
      Number(existingSimilarity?.primaryReferenceSlot || computedSimilarity?.primaryReferenceSlot || 0) || null,
    referenceCampaignId:
      Number(existingSimilarity?.referenceCampaignId || computedSimilarity?.referenceCampaignId || 0) || null,
    referenceCampaignName:
      existingSimilarity?.referenceCampaignName || computedSimilarity?.referenceCampaignName || null,
    details: {
      ...(computedSimilarity?.details || {}),
      ...(existingSimilarity?.details || {}),
      manualSelection: true,
    },
    candidateMatches: applySimilaritySelectionToMatches(
      Array.isArray(computedSimilarity?.candidateMatches) ? computedSimilarity.candidateMatches : [],
      {
        selectedCandidateMapUids:
          existingSimilarity?.details?.manualSelectedCandidateMapUids ||
          existingSimilarity?.details?.selectedCandidateMapUids ||
          [],
        primaryReferenceMapUid:
          existingSimilarity?.primaryReferenceMapUid || computedSimilarity?.primaryReferenceMapUid || "",
      }
    ),
  };
}

function preserveManualCandidate(mergedCandidate, similarity) {
  const sourceVersion = toText(mergedCandidate?.sourceVersion || CONTENT_SIGNATURE_VERSION);
  return {
    ...mergedCandidate,
    parserPattern: `${CONTENT_SIMILARITY_PATTERN}:manual-selection`,
    parserConfidence: Math.max(
      clampInt(mergedCandidate?.parserConfidence, { min: 0, max: 100, fallback: 0 }),
      Math.round(Number(similarity?.confidence || 0) * 100)
    ),
    sourceVersion: sourceVersion.includes("manual-similarity-selection")
      ? sourceVersion
      : `${sourceVersion}+manual-similarity-selection`,
    requiresRegex: false,
    automationState:
      Array.isArray(similarity?.mapNumbers) && similarity.mapNumbers.length
        ? "matched"
        : mergedCandidate?.automationState || "unmatched",
  };
}

function buildSimilarityRecord(context) {
  const {
    map,
    family,
    similarity,
    activeWeightProfile,
    activeReferenceContext,
    activeReferenceScope,
    targetSignatureRecord,
    targetSignatureVersion,
    targetUsesFallbackSignature,
    fallbackReferenceEntries,
    fallbackReferenceSlots,
    fallbackReferenceMapUids,
    diagnosticWarnings,
    includeNameSupport,
    isWeeklyShortsFamily,
  } = context;
  return {
    mapUid: map.mapUid,
    familyKey: family.key || null,
    referenceCampaignId: similarity.referenceCampaignId || null,
    referenceCampaignName: similarity.referenceCampaignName || null,
    primaryReferenceMapUid: similarity.primaryReferenceMapUid || null,
    primaryReferenceSlot: similarity.primaryReferenceSlot || null,
    assignedMapNumbers: Array.isArray(similarity?.mapNumbers) ? similarity.mapNumbers : [],
    topScore: Number(similarity.topScore || 0),
    secondScore: Number(similarity.secondScore || 0),
    confidence: Number(similarity.confidence || 0),
    assignmentMethod: CONTENT_SIGNATURE_VERSION,
    candidateMatches: Array.isArray(similarity.candidateMatches) ? similarity.candidateMatches : [],
    details: {
      ...(similarity?.details || {}),
      targetCampaignName: map.campaignName || null,
      targetSlot: map.slot || null,
      targetFamilyKey: family.key || null,
      referenceScope: isWeeklyShortsFamily ? "weekly-shorts-canonical" : activeReferenceScope,
      referenceMapCount: isWeeklyShortsFamily ? 5 : activeReferenceContext.entries.length,
      referenceCampaignCount: isWeeklyShortsFamily ? 1 : Number(activeReferenceContext.campaignCount || 0),
      targetSignatureStatus: targetSignatureRecord?.sourceStatus || "missing",
      targetSignatureVersion,
      targetSignatureFallback: targetUsesFallbackSignature,
      fallbackReferenceCount: fallbackReferenceEntries.length,
      fallbackReferenceSlots,
      fallbackReferenceMapUids,
      diagnosticWarnings,
      includeNameSupport,
      weightProfile: {
        ...(similarity?.details?.weightProfile && typeof similarity.details.weightProfile === "object"
          ? similarity.details.weightProfile
          : {}),
        raw: buildSimilarityWeightProfile(activeWeightProfile.effectiveWeights),
        fingerprint: activeWeightProfile.fingerprint,
        activeScope: activeWeightProfile.activeScope,
        hasCampaignOverride: Boolean(activeWeightProfile.campaignOverride),
        hasMapOverride: Boolean(activeWeightProfile.mapOverride),
        matchedRules: activeWeightProfile.matchedRules.map((rule) => ({
          ruleId: rule.ruleId,
          sourceKey: rule.sourceKey,
          season: rule.season,
          seasonYear: rule.seasonYear,
          alterationSlug: rule.alterationSlug,
        })),
        campaignOverrideUpdatedAt: activeWeightProfile.campaignOverride?.updatedAt || null,
        mapOverrideUpdatedAt: activeWeightProfile.mapOverride?.updatedAt || null,
      },
      weightProfileFingerprint: activeWeightProfile.fingerprint,
    },
  };
}

export { matchTargetMap };
