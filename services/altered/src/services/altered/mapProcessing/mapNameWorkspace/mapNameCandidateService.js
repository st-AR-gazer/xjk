import {
  applySimilaritySelectionToMatches,
  buildMapNameCandidate,
  buildSimilarityWeightOverrideMaps,
  buildSimilarityWeightProfile,
  buildSimilarityWeightTargetContext,
  classifyNamingSimilaritySource,
  clampInt,
  CONTENT_SIGNATURE_VERSION,
  CONTENT_SIMILARITY_PATTERN,
  deriveSimilarityUnmatchedReason,
  evaluateSimilarityAutoApproval,
  mergeSimilarityIntoCandidate,
  normalizeMapNumbers,
  resolveActiveSimilarityWeightProfile,
  resolveMapCampaignName,
  resolveMapDownloadUrl,
  resolveMapSlot,
  resolveMapUid,
  similarityNeedsRefresh,
  toText,
  uniqueBy,
} from "../../serviceSupport.js";

function resolveStoredCandidate(repository, map, mapUid) {
  const storedCandidate = repository.naming.getMapNameCandidate(mapUid);
  if (storedCandidate || !map.derivedNameCandidate) return storedCandidate || null;
  return {
    ...map.derivedNameCandidate,
    mapUid: resolveMapUid(map),
    campaign: resolveMapCampaignName(map) || "Unassigned",
    campaignId: Number(map.campaignId || 0) || null,
    slot: resolveMapSlot(map) || 0,
    tracked: Boolean(map.tracked),
    status: map.status || "live",
    finalName:
      map.derivedNameCandidate.manualName ||
      map.derivedNameCandidate.proposedName ||
      map.derivedNameCandidate.sanitizedName ||
      map.derivedNameCandidate.originalName ||
      resolveMapUid(map),
  };
}

function candidateIsStale(storedCandidate, freshCandidate, staleSimilarity) {
  if (!storedCandidate) return true;
  const storedNumbers = JSON.stringify(Array.isArray(storedCandidate.mapNumbers) ? storedCandidate.mapNumbers : []);
  const freshNumbers = JSON.stringify(Array.isArray(freshCandidate?.mapNumbers) ? freshCandidate.mapNumbers : []);
  return (
    storedNumbers !== freshNumbers ||
    String(storedCandidate.automationState || "") !== String(freshCandidate?.automationState || "") ||
    Number(storedCandidate.mapNumber || 0) !== Number(freshCandidate?.mapNumber || 0) ||
    staleSimilarity
  );
}

function signatureDetail(signature) {
  if (!signature) return null;
  const groups = signature.signature?.groups;
  return {
    ...signature,
    signatureSummary: groups
      ? Object.fromEntries(
          Object.entries(groups).map(([key, entries]) => [key, Array.isArray(entries) ? entries.length : 0])
        )
      : null,
  };
}

function hasAssignedNumbers(candidate) {
  return Array.isArray(candidate?.mapNumbers) && candidate.mapNumbers.length > 0;
}

class MapNameCandidateService {
  constructor({
    repository,
    logger,
    getMapLocalFileService,
    getMapNameStandardizationCandidateDetail,
    assignStoredMapNumbersBySimilarity,
  }) {
    this.repository = repository;
    this.logger = logger;
    this.getMapLocalFileService = getMapLocalFileService;
    this.getMapNameStandardizationCandidateDetail = getMapNameStandardizationCandidateDetail;
    this.assignStoredMapNumbersBySimilarity = assignStoredMapNumbersBySimilarity;
  }

  list({ q = "", automationState = "", reviewState = "", requiresRegex = undefined, limit = 220, offset = 0 } = {}) {
    const hasFilters = !!(q || automationState || reviewState || requiresRegex !== undefined);
    const filterArgs = { q, automationState, reviewState, requiresRegex };
    return {
      summary: this.repository.naming.getMapNameCandidateSummary(),
      filteredTotal: hasFilters ? this.repository.naming.countMapNameCandidates(filterArgs) : undefined,
      candidates: this.repository.naming.listMapNameCandidates({ ...filterArgs, limit, offset }),
    };
  }

  async getDetail(mapUid) {
    const mapInfo = this.repository.maps.getMapInfo(mapUid);
    if (!mapInfo?.exists || !mapInfo.map) return { error: "Map not found." };

    const campaignId = Number(mapInfo.map.campaignId || 0) || null;
    const freshNameCandidate = buildMapNameCandidate(mapInfo.map);
    let storedCandidate = resolveStoredCandidate(this.repository, mapInfo.map, mapUid);
    let similarity = this.repository.naming.getMapNumberSimilarity({ mapUids: [mapUid] })[0] || null;
    const signature = this.repository.mapFiles.getMapContentSignatures({ mapUids: [mapUid] })[0] || null;
    const localFile = this.getMapLocalFileService().getPreferredMapLocalFiles({ mapUids: [mapUid] })[0] || null;
    const similarityWeightRules = this.repository.naming.listSimilarityWeightRules();
    const detailWeightContext = buildSimilarityWeightTargetContext({
      sourceKey: classifyNamingSimilaritySource(mapInfo.map),
      season: freshNameCandidate?.season || null,
      seasonYear: Number(freshNameCandidate?.year || 0) || null,
      environment: mapInfo.map?.mapEnvironment || mapInfo.map?.environment || "",
      alterationSlugs: Array.isArray(freshNameCandidate?.alterationMix)
        ? freshNameCandidate.alterationMix
        : [freshNameCandidate?.alteration],
    });
    const similarityWeightOverrides = buildSimilarityWeightOverrideMaps({
      mapOverrides: this.repository.naming.getSimilarityMapWeightOverrides({ mapUids: [mapUid] }),
      campaignOverrides: this.repository.naming.getSimilarityCampaignWeightOverrides({
        campaignIds: campaignId ? [campaignId] : [],
      }),
    });
    const activeSimilarityWeights = resolveActiveSimilarityWeightProfile(
      { mapUid, campaignId },
      {
        ...similarityWeightOverrides,
        scopedRules: similarityWeightRules,
        targetContext: detailWeightContext,
      }
    );
    const staleSimilarity = similarityNeedsRefresh(similarity, {
      expectedWeightFingerprint: activeSimilarityWeights.fingerprint,
    });

    if (staleSimilarity) {
      try {
        const refresh = await this.assignStoredMapNumbersBySimilarity({
          mapUids: [mapUid],
          limit: 1,
          persistCandidates: true,
        });
        if (refresh?.ok) {
          similarity = this.repository.naming.getMapNumberSimilarity({ mapUids: [mapUid] })[0] || similarity;
          storedCandidate = this.repository.naming.getMapNameCandidate(mapUid) || storedCandidate;
        }
      } catch (error) {
        this.logger.warn(`[altered-similarity-detail] refresh failed for ${mapUid}: ${error?.message || error}`);
      }
    }

    const freshCandidate = mergeSimilarityIntoCandidate(
      freshNameCandidate,
      similarity ? { ...similarity, mapNumbers: similarity.assignedMapNumbers } : null,
      { regexOnly: Boolean(activeSimilarityWeights?.effectiveWeights?.regexOnly) }
    );
    const autoApproval = evaluateSimilarityAutoApproval({
      similarity,
      signatureStatus: signature?.sourceStatus || "",
      assignedMapNumbers: similarity?.assignedMapNumbers || [],
    });
    const unmatchedReason = deriveSimilarityUnmatchedReason({
      candidate: storedCandidate,
      similarity,
      localFileStatus: localFile?.status || "",
      signatureStatus: signature?.sourceStatus || "",
      referenceMapCount: Number(similarity?.details?.referenceMapCount || 0),
    });

    const stale = candidateIsStale(storedCandidate, freshCandidate, staleSimilarity);

    return {
      ok: true,
      map: {
        mapUid: resolveMapUid(mapInfo.map),
        name: mapInfo.map.name || "",
        campaign: resolveMapCampaignName(mapInfo.map) || "Unassigned",
        campaignId,
        slot: resolveMapSlot(mapInfo.map) || null,
        downloadUrl: resolveMapDownloadUrl(mapInfo.map) || null,
      },
      localFile,
      storedCandidate,
      freshNameCandidate,
      freshCandidate,
      similarity,
      similarityWeights: {
        defaults: activeSimilarityWeights.defaults,
        matchedRules: activeSimilarityWeights.matchedRules,
        campaignOverride: activeSimilarityWeights.campaignOverride,
        mapOverride: activeSimilarityWeights.mapOverride,
        recommendedAlterationWeights: activeSimilarityWeights.recommendedAlterationWeights,
        effective: activeSimilarityWeights.effectiveWeights,
        activeScope: activeSimilarityWeights.activeScope,
        fingerprint: activeSimilarityWeights.fingerprint,
      },
      signature: signatureDetail(signature),
      diagnostics: {
        staleStoredCandidate: Boolean(stale),
        unmatchedReason,
        autoApproval,
        autoResolvableNow:
          hasAssignedNumbers(freshCandidate) ||
          hasAssignedNumbers({
            mapNumbers: similarity?.assignedMapNumbers,
          }),
      },
    };
  }

  async updateSelection({
    mapUid,
    candidateMapUids = [],
    mapNumbers = [],
    reviewState = undefined,
    reviewNote = undefined,
  } = {}) {
    const uid = toText(mapUid);
    if (!uid) return { error: "mapUid is required." };

    const detail = await this.getMapNameStandardizationCandidateDetail(uid);
    if (detail?.error) return detail;

    const similarity = detail?.similarity || null;
    const storedMatches = Array.isArray(similarity?.candidateMatches) ? similarity.candidateMatches : [];
    if (!storedMatches.length) return { error: "No stored similarity candidates are available for this map." };

    const normalizedCandidateMapUids = uniqueBy(
      (Array.isArray(candidateMapUids) ? candidateMapUids : [candidateMapUids])
        .map((value) => toText(value))
        .filter(Boolean),
      (value) => value.toLowerCase()
    );
    const normalizedRequestedNumbers = normalizeMapNumbers(mapNumbers);
    let selectedMatches = normalizedCandidateMapUids.length
      ? storedMatches.filter((match) => normalizedCandidateMapUids.includes(toText(match?.mapUid).toLowerCase()))
      : [];
    if (!selectedMatches.length && normalizedRequestedNumbers.length) {
      selectedMatches = storedMatches.filter((match) => normalizedRequestedNumbers.includes(Number(match?.slot || 0)));
    }
    if (!selectedMatches.length) return { error: "Select at least one stored similarity candidate." };

    const selectedMapNumbers = normalizeMapNumbers(selectedMatches.map((match) => match?.slot));
    if (!selectedMapNumbers.length) {
      return { error: "Selected similarity candidates do not expose valid slot numbers." };
    }

    const primaryMatch = selectedMatches[0] || null;
    const baseCandidate = detail?.storedCandidate ||
      detail?.freshCandidate ||
      detail?.freshNameCandidate || {
        mapUid: uid,
        originalName: detail?.map?.name || uid,
        sanitizedName: detail?.map?.name || uid,
        sourceVersion: CONTENT_SIGNATURE_VERSION,
      };
    const baseSourceVersion = toText(baseCandidate?.sourceVersion, CONTENT_SIGNATURE_VERSION);
    const nextSourceVersion = baseSourceVersion.includes("manual-similarity-selection")
      ? baseSourceVersion
      : `${baseSourceVersion}+manual-similarity-selection`;
    const nowIso = new Date().toISOString();

    const candidateUpsert = this.repository.naming.upsertMapNameCandidates({
      candidates: [
        {
          ...baseCandidate,
          mapUid: uid,
          mapNumber: selectedMapNumbers[0] || null,
          mapNumbers: selectedMapNumbers,
          parserPattern: `${CONTENT_SIMILARITY_PATTERN}:manual-selection`,
          parserConfidence: Math.max(
            clampInt(baseCandidate?.parserConfidence, { min: 0, max: 100, fallback: 0 }),
            Math.round(Number(similarity?.confidence || 0) * 100)
          ),
          automationState: selectedMapNumbers.length ? "matched" : "unmatched",
          requiresRegex: false,
          sourceVersion: nextSourceVersion,
        },
      ],
    });
    if (candidateUpsert?.error) return candidateUpsert;

    const similarityUpsert = this.repository.naming.upsertMapNumberSimilarity({
      records: [
        {
          ...similarity,
          mapUid: uid,
          referenceCampaignId: Number(primaryMatch?.campaignId || similarity?.referenceCampaignId || 0) || null,
          referenceCampaignName: primaryMatch?.campaignName || similarity?.referenceCampaignName || null,
          primaryReferenceMapUid: primaryMatch?.mapUid || similarity?.primaryReferenceMapUid || null,
          primaryReferenceSlot: Number(primaryMatch?.slot || similarity?.primaryReferenceSlot || 0) || null,
          assignedMapNumbers: selectedMapNumbers,
          candidateMatches: applySimilaritySelectionToMatches(storedMatches, {
            selectedCandidateMapUids: selectedMatches.map((match) => match?.mapUid).filter(Boolean),
            primaryReferenceMapUid: primaryMatch?.mapUid || similarity?.primaryReferenceMapUid || "",
          }),
          details: {
            ...(similarity?.details || {}),
            matchClassification: selectedMapNumbers.length > 1 ? "manual-multi-selection" : "manual-selected",
            matchWarning:
              selectedMapNumbers.length > 1
                ? `Manual selection applied across ${selectedMapNumbers.length} slots.`
                : `Manual selection locked to slot ${selectedMapNumbers[0]}.`,
            hasAmbiguousCloseSlots: selectedMapNumbers.length > 1,
            hasUniqueClosestSlot: selectedMapNumbers.length === 1,
            closeMatchCount: selectedMatches.length,
            closeSlotCount: selectedMapNumbers.length,
            closeSlots: selectedMapNumbers,
            selectedCandidateMapUids: selectedMatches.map((match) => match?.mapUid).filter(Boolean),
            selectedCandidateCount: selectedMatches.length,
            manualSelection: true,
            manualSelectionAt: nowIso,
            manualSelectedCandidateMapUids: selectedMatches.map((match) => match?.mapUid).filter(Boolean),
          },
        },
      ],
    });
    if (similarityUpsert?.error) return similarityUpsert;

    let review = null;
    if (reviewState !== undefined || reviewNote !== undefined) {
      review = this.repository.naming.updateMapNameCandidateReview({
        mapUid: uid,
        reviewState,
        reviewNote:
          reviewNote !== undefined
            ? reviewNote
            : `Similarity selection applied from admin (${selectedMapNumbers.join(", ")}).`,
      });
      if (review?.error) return review;
    }

    return {
      ok: true,
      selectedMapNumbers,
      selectedCandidateMatches: selectedMatches,
      candidateUpsert,
      similarityUpsert,
      review,
      detail: await this.getMapNameStandardizationCandidateDetail(uid),
    };
  }

  async updateWeights({ mapUid, scope = "map", weights = null, reset = false } = {}) {
    const uid = toText(mapUid);
    if (!uid) return { error: "mapUid is required." };

    const mapInfo = this.repository.maps.getMapInfo(uid);
    if (!mapInfo?.exists || !mapInfo.map) return { error: "Map not found." };

    const normalizedScope = toText(scope).toLowerCase();
    if (normalizedScope !== "map" && normalizedScope !== "campaign") {
      return { error: "scope must be 'map' or 'campaign'." };
    }

    const campaignId = Number(mapInfo.map.campaignId || 0) || null;
    if (normalizedScope === "campaign" && !campaignId) {
      return { error: "This map is not assigned to a campaign yet." };
    }

    const safeWeights = buildSimilarityWeightProfile(weights);
    let updateResult = null;
    if (reset) {
      updateResult =
        normalizedScope === "campaign"
          ? this.repository.naming.deleteSimilarityCampaignWeightOverride({ campaignId })
          : this.repository.naming.deleteSimilarityMapWeightOverride({ mapUid: uid });
    } else {
      updateResult =
        normalizedScope === "campaign"
          ? this.repository.naming.upsertSimilarityCampaignWeightOverride({ campaignId, weights: safeWeights })
          : this.repository.naming.upsertSimilarityMapWeightOverride({ mapUid: uid, campaignId, weights: safeWeights });
    }
    if (updateResult?.error) return updateResult;

    const recomputedSimilarity = await this.assignStoredMapNumbersBySimilarity({
      mapUids: [uid],
      limit: 1,
      force: true,
      persistCandidates: true,
    });
    if (recomputedSimilarity?.error || recomputedSimilarity?.ok === false) {
      return {
        error:
          recomputedSimilarity?.error ||
          recomputedSimilarity?.candidateUpsert?.error ||
          recomputedSimilarity?.similarityUpsert?.error ||
          "Similarity recompute failed after saving weights.",
      };
    }

    return {
      ok: true,
      scope: normalizedScope,
      reset: Boolean(reset),
      weights: safeWeights,
      update: updateResult,
      detail: await this.getMapNameStandardizationCandidateDetail(uid),
    };
  }

  updateReview({ mapUid, reviewState = undefined, manualName = undefined, reviewNote = undefined } = {}) {
    const result = this.repository.naming.updateMapNameCandidateReview({ mapUid, reviewState, manualName, reviewNote });
    if (result?.error) return result;
    return {
      ok: true,
      candidate: result.candidate,
      summary: this.repository.naming.getMapNameCandidateSummary(),
    };
  }
}

export { MapNameCandidateService };
