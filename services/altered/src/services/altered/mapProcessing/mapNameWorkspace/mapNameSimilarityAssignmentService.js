import {
  NAMING_SIMILARITY_PROGRESS_MATCHING_SPAN,
  NAMING_SIMILARITY_PROGRESS_MATCHING_START,
  normalizeMapNumbers,
  toText,
} from "../../serviceSupport.js";
import { processSimilarityBatches } from "./similarityBatches.js";
import { buildReferenceCatalog, refreshReferenceSources } from "./similarityReferenceCatalog.js";
import { prepareReferenceSignatures } from "./similaritySignatures.js";
import { loadSimilarityTargets, loadSimilarityWeights } from "./similarityAssignmentTargets.js";

class MapNameSimilarityAssignmentService {
  constructor({
    repository,
    logger,
    getMapLocalFileService,
    getProjectSourceService,
    applyAutoApprovalFromSimilarity,
  }) {
    this.dependencies = {
      repository,
      logger,
      getMapLocalFileService,
      getProjectSourceService,
      applyAutoApprovalFromSimilarity,
    };
  }

  assign(options = {}) {
    return new SimilarityAssignmentRun({ ...this.dependencies, options }).run();
  }
}

class SimilarityAssignmentRun {
  constructor({
    repository,
    logger,
    getMapLocalFileService,
    getProjectSourceService,
    applyAutoApprovalFromSimilarity,
    options = {},
  }) {
    const {
      q = "",
      limit = 250,
      mapUids = [],
      clubId = null,
      sourceKey = "",
      campaignName = "",
      force = false,
      rescanAll = false,
      persistCandidates = true,
      onProgress = null,
    } = options;
    this.repository = repository;
    this.logger = logger;
    this.getMapLocalFileService = getMapLocalFileService;
    this.getProjectSourceService = getProjectSourceService;
    this.applyAutoApprovalFromSimilarity = applyAutoApprovalFromSimilarity;
    this.q = q;
    this.limit = limit;
    this.mapUids = mapUids;
    this.clubId = clubId;
    this.sourceKey = sourceKey;
    this.campaignName = campaignName;
    this.force = force;
    this.rescanAll = rescanAll;
    this.persistCandidates = persistCandidates;
    this.onProgress = onProgress;
    this.matchingProgressStart = NAMING_SIMILARITY_PROGRESS_MATCHING_START;
    this.matchingProgressSpan = NAMING_SIMILARITY_PROGRESS_MATCHING_SPAN;
  }

  async run() {
    Object.assign(this, loadSimilarityTargets(this));
    if (!this.normalizedMaps.length) return this.buildEmptyResult();

    Object.assign(this, loadSimilarityWeights(this));
    this.reportProgress({
      status: "running",
      stage: "loading-references",
      message: `Loaded ${this.normalizedMaps.length} naming candidates. Building reference catalog...`,
      percent: 6,
      replaceCounters: true,
      counters: {
        total: this.normalizedMaps.length,
        processed: 0,
        resolved: 0,
        unresolved: 0,
        changedCandidates: 0,
      },
      targetClubId: this.effectiveClubId,
      sourceKey: toText(this.sourceKey).toLowerCase() || null,
      rescanAll: Boolean(this.rescanAll),
    });
    await refreshReferenceSources(this);
    Object.assign(this, buildReferenceCatalog(this));
    this.initializeProcessingState();

    this.reportProgress({
      status: "running",
      stage: "signatures-references",
      message: `Ensuring content signatures for ${this.globalReferenceMaps.length} reference maps...`,
      percent: 22,
      counters: {
        total: this.normalizedMaps.length,
        processed: 0,
        resolved: 0,
        unresolved: 0,
        changedCandidates: 0,
      },
      signatureSummary: this.signatureSummary,
      targetClubId: this.effectiveClubId,
      rescanAll: Boolean(this.rescanAll),
    });
    Object.assign(this, await prepareReferenceSignatures(this));
    this.reportProgress({
      status: "running",
      stage: "matching",
      message: `Comparing ${this.normalizedMaps.length} maps against ${this.referenceContext.entries.length} references...`,
      percent: this.matchingProgressStart,
      counters: {
        total: this.normalizedMaps.length,
        processed: 0,
        resolved: 0,
        unresolved: 0,
        changedCandidates: 0,
      },
      signatureSummary: this.signatureSummary,
      targetClubId: this.effectiveClubId,
      rescanAll: Boolean(this.rescanAll),
    });
    return processSimilarityBatches(this);
  }

  initializeProcessingState() {
    this.resolved = 0;
    this.unresolved = 0;
    this.changedCandidates = 0;
    this.refreshedSimilarityRecords = 0;
    this.upgradedLegacySimilarityRecords = 0;
    this.processed = 0;
    this.recentMaps = [];
    this.targetSignatureTotals = {
      total: 0,
      reused: 0,
      parsed: 0,
      errors: 0,
      missingDownload: 0,
      localFiles: { total: 0, reused: 0, downloaded: 0, missing: 0, errors: 0 },
    };
    this.signatureSummary = { targets: this.targetSignatureTotals, references: null };
    this.similarityUpsert = { processed: 0, inserted: 0, updated: 0, error: null };
    this.candidateUpsert = { processed: 0, inserted: 0, updated: 0, error: null };
    this.approvals = { processed: 0, eligible: 0, approved: 0, mapUids: [] };
    this.referenceSignatureProgress = {
      total: this.globalReferenceMaps.length,
      ready: 0,
      currentMapUid: null,
      currentMapName: "",
    };
    this.targetSignatureProgress = {
      total: this.normalizedMaps.length,
      ready: 0,
      currentMapUid: null,
      currentMapName: "",
    };
    this.targetBatchSize = this.rescanAll ? 25 : 100;
    this.progressUpdateInterval = Math.max(1, Math.min(25, Math.floor(this.normalizedMaps.length / 40) || 1));
    this.eventLoopYieldInterval = this.rescanAll ? 1 : 5;
  }

  reportProgress(partial = {}) {
    if (typeof this.onProgress !== "function") return;
    try {
      this.onProgress(partial);
    } catch (error) {
      this.logger.warn(`[altered-similarity-backfill] progress callback failed: ${error?.message || error}`);
    }
  }

  async withProgressHeartbeat(buildPartial, task, intervalMs = 5000) {
    const safeBuilder = typeof buildPartial === "function" ? buildPartial : () => ({});
    this.reportProgress(safeBuilder());
    const timer = setInterval(() => this.reportProgress(safeBuilder()), Math.max(1000, Number(intervalMs) || 5000));
    try {
      return await task();
    } finally {
      clearInterval(timer);
    }
  }

  getProgressCounters() {
    return {
      total: this.normalizedMaps.length,
      processed: this.processed,
      resolved: this.resolved,
      unresolved: this.unresolved,
      changedCandidates: this.changedCandidates,
      refreshedSimilarityRecords: this.refreshedSimilarityRecords,
      upgradedLegacySimilarityRecords: this.upgradedLegacySimilarityRecords,
      similarityRowsWritten: Number(this.similarityUpsert.processed || 0),
      candidateRowsWritten: Number(this.candidateUpsert.processed || 0),
      autoApproved: Number(this.approvals.approved || 0),
      targetSignaturesReady: Number(this.targetSignatureProgress.ready || 0),
      targetSignaturesTotal: Number(this.targetSignatureProgress.total || this.normalizedMaps.length),
      referenceSignaturesReady: Number(this.referenceSignatureProgress.ready || 0),
      referenceSignaturesTotal: Number(this.referenceSignatureProgress.total || this.globalReferenceMaps.length),
    };
  }

  pushRecentMap(sample = {}) {
    const mapUid = toText(sample?.mapUid);
    if (!mapUid) return;
    this.recentMaps.push({
      mapUid,
      mapName: toText(sample?.mapName) || mapUid,
      campaignName: toText(sample?.campaignName) || null,
      slot: Number(sample?.slot || 0) || null,
      resolved: Boolean(sample?.resolved),
      mapNumbers: normalizeMapNumbers(sample?.mapNumbers || []),
      referenceCampaignName: toText(sample?.referenceCampaignName) || null,
      primaryReferenceMapUid: toText(sample?.primaryReferenceMapUid) || null,
      primaryReferenceSlot: Number(sample?.primaryReferenceSlot || 0) || null,
      topScore: Number.isFinite(Number(sample?.topScore)) ? Number(sample.topScore) : null,
      confidence: Number.isFinite(Number(sample?.confidence)) ? Number(sample.confidence) : null,
      manualSelection: Boolean(sample?.manualSelection),
    });
    if (this.recentMaps.length > 5) this.recentMaps.splice(0, this.recentMaps.length - 5);
  }

  addNumericFields(target = {}, source = null, fields = []) {
    for (const field of fields) target[field] = Number(target[field] || 0) + Number(source?.[field] || 0);
    return target;
  }

  buildEmptyResult() {
    this.reportProgress({
      status: "ok",
      stage: "complete",
      message: "Similarity backfill complete. No maps matched the current filter.",
      percent: 100,
      replaceCounters: true,
      counters: { total: 0, processed: 0, resolved: 0, unresolved: 0, changedCandidates: 0 },
    });
    return { ok: true, processed: 0, resolved: 0, unresolved: 0, missingReferenceFamilies: [] };
  }

  buildResult() {
    return {
      ok: true,
      processed: this.processed,
      resolved: this.resolved,
      unresolved: this.unresolved,
      changedCandidates: this.changedCandidates,
      refreshedSimilarityRecords: this.refreshedSimilarityRecords,
      upgradedLegacySimilarityRecords: this.upgradedLegacySimilarityRecords,
      missingReferenceFamilies: this.missingReferenceFamilies,
      signatures: this.signatureSummary,
      similarityUpsert: this.similarityUpsert,
      candidateUpsert: this.candidateUpsert,
      approvals: this.approvals,
      recentMaps: this.recentMaps.slice(),
      targetClubId: this.effectiveClubId,
      rescanAll: Boolean(this.rescanAll),
    };
  }
}

export { MapNameSimilarityAssignmentService };
