import { MapLocalFileService } from "./mapProcessing/mapLocalFileService.js";
import { SimilarityBackfillService } from "./mapProcessing/similarityBackfillService.js";
import { MapNameWorkspaceService } from "./mapProcessing/mapNameWorkspaceService.js";

class MapProcessingService {
  constructor({
    repository,
    mapCopyConfig = {},
    logger = console,
    getAlterationCatalogService,
    getProjectSourceService,
  }) {
    this.mapLocalFileService = new MapLocalFileService({
      repository,
      mapCopyConfig,
      logger,
      getMapNameWorkspaceService: () => this.mapNameWorkspaceService,
    });
    this.mapNameWorkspaceService = new MapNameWorkspaceService({
      repository,
      logger,
      getAlterationCatalogService,
      getMapLocalFileService: () => this.mapLocalFileService,
      getProjectSourceService,
    });
    this.similarityBackfillService = new SimilarityBackfillService({
      repository,
      logger,
      getMapLocalFileService: () => this.mapLocalFileService,
      getMapNameWorkspaceService: () => this.mapNameWorkspaceService,
    });
  }

  get mapCopy() {
    return this.mapLocalFileService.mapCopy;
  }

  get namingSimilarityBackfill() {
    return this.similarityBackfillService.namingSimilarityBackfill;
  }

  getSimilarityWeightRules(...args) {
    return this.mapNameWorkspaceService.getSimilarityWeightRules(...args);
  }

  getSimilarityWeightWorkspace(...args) {
    return this.mapNameWorkspaceService.getSimilarityWeightWorkspace(...args);
  }

  updateSimilarityWeightRule(...args) {
    return this.mapNameWorkspaceService.updateSimilarityWeightRule(...args);
  }

  deleteSimilarityWeightRule(...args) {
    return this.mapNameWorkspaceService.deleteSimilarityWeightRule(...args);
  }

  updateSimilarityCampaignWeightOverride(...args) {
    return this.mapNameWorkspaceService.updateSimilarityCampaignWeightOverride(...args);
  }

  deleteSimilarityCampaignWeightOverride(...args) {
    return this.mapNameWorkspaceService.deleteSimilarityCampaignWeightOverride(...args);
  }

  getNamingSimilaritySourceOptions(...args) {
    return this.mapNameWorkspaceService.getNamingSimilaritySourceOptions(...args);
  }

  collectCampaignSnapshotMapUids(...args) {
    return this.mapNameWorkspaceService.collectCampaignSnapshotMapUids(...args);
  }

  getAutomaticSimilarityTargetMapUids(...args) {
    return this.mapNameWorkspaceService.getAutomaticSimilarityTargetMapUids(...args);
  }

  runAutomaticNamingAssignments(...args) {
    return this.mapNameWorkspaceService.runAutomaticNamingAssignments(...args);
  }

  assignStoredMapMetadata(...args) {
    return this.mapNameWorkspaceService.assignStoredMapMetadata(...args);
  }

  processMapNameStandardization(...args) {
    return this.mapNameWorkspaceService.processMapNameStandardization(...args);
  }

  getLocalMapFileAbsolutePath(...args) {
    return this.mapLocalFileService.getLocalMapFileAbsolutePath(...args);
  }

  getMapLocalFixAbsolutePath(...args) {
    return this.mapLocalFileService.getMapLocalFixAbsolutePath(...args);
  }

  getPreferredMapLocalFiles(...args) {
    return this.mapLocalFileService.getPreferredMapLocalFiles(...args);
  }

  getMapLocalStoreStatus(...args) {
    return this.mapLocalFileService.getMapLocalStoreStatus(...args);
  }

  updateMapCopyProgress(...args) {
    return this.mapLocalFileService.updateMapCopyProgress(...args);
  }

  buildNamingSimilarityBackfillTargets(...args) {
    return this.similarityBackfillService.buildNamingSimilarityBackfillTargets(...args);
  }

  shouldUseExternalNamingSimilarityBackfill(...args) {
    return this.similarityBackfillService.shouldUseExternalNamingSimilarityBackfill(...args);
  }

  buildNamingSimilaritySummaryFromExternalProgress(...args) {
    return this.similarityBackfillService.buildNamingSimilaritySummaryFromExternalProgress(...args);
  }

  readNamingSimilarityBackfillExternalProgress(...args) {
    return this.similarityBackfillService.readNamingSimilarityBackfillExternalProgress(...args);
  }

  clearNamingSimilarityBackfillExternalArtifacts(...args) {
    return this.similarityBackfillService.clearNamingSimilarityBackfillExternalArtifacts(...args);
  }

  recoverNamingSimilarityBackfillExternalState(...args) {
    return this.similarityBackfillService.recoverNamingSimilarityBackfillExternalState(...args);
  }

  refreshNamingSimilarityBackfillExternalState(...args) {
    return this.similarityBackfillService.refreshNamingSimilarityBackfillExternalState(...args);
  }

  launchExternalNamingSimilarityBackfill(...args) {
    return this.similarityBackfillService.launchExternalNamingSimilarityBackfill(...args);
  }

  getNamingSimilarityBackfillStatus(...args) {
    return this.similarityBackfillService.getNamingSimilarityBackfillStatus(...args);
  }

  cancelNamingSimilarityBackfill(...args) {
    return this.similarityBackfillService.cancelNamingSimilarityBackfill(...args);
  }

  updateNamingSimilarityBackfillProgress(...args) {
    return this.similarityBackfillService.updateNamingSimilarityBackfillProgress(...args);
  }

  startNamingSimilarityBackfill(...args) {
    return this.similarityBackfillService.startNamingSimilarityBackfill(...args);
  }

  buildMapsForLocalCopyBackfill(...args) {
    return this.mapLocalFileService.buildMapsForLocalCopyBackfill(...args);
  }

  applyAutoApprovalFromSimilarity(...args) {
    return this.mapNameWorkspaceService.applyAutoApprovalFromSimilarity(...args);
  }

  runMapLocalCopyBackfill(...args) {
    return this.mapLocalFileService.runMapLocalCopyBackfill(...args);
  }

  startMapLocalCopyBackfillOnBoot(...args) {
    return this.mapLocalFileService.startMapLocalCopyBackfillOnBoot(...args);
  }

  ensureMapLocalFiles(...args) {
    return this.mapLocalFileService.ensureMapLocalFiles(...args);
  }

  downloadMapFileBuffer(...args) {
    return this.mapLocalFileService.downloadMapFileBuffer(...args);
  }

  ensureMapContentSignatures(...args) {
    return this.mapLocalFileService.ensureMapContentSignatures(...args);
  }

  assignStoredMapNumbersBySimilarity(...args) {
    return this.mapNameWorkspaceService.assignStoredMapNumbersBySimilarity(...args);
  }

  getMapNameStandardizationCandidates(...args) {
    return this.mapNameWorkspaceService.getMapNameStandardizationCandidates(...args);
  }

  getMapNameStandardizationCandidateDetail(...args) {
    return this.mapNameWorkspaceService.getMapNameStandardizationCandidateDetail(...args);
  }

  getMapViewerDiffPayload(...args) {
    return this.mapLocalFileService.getMapViewerDiffPayload(...args);
  }

  importMapLocalFileFix(...args) {
    return this.mapLocalFileService.importMapLocalFileFix(...args);
  }

  updateMapNameCandidateSimilaritySelection(...args) {
    return this.mapNameWorkspaceService.updateMapNameCandidateSimilaritySelection(...args);
  }

  updateMapNameCandidateSimilarityWeights(...args) {
    return this.mapNameWorkspaceService.updateMapNameCandidateSimilarityWeights(...args);
  }

  updateMapNameStandardizationCandidateReview(...args) {
    return this.mapNameWorkspaceService.updateMapNameStandardizationCandidateReview(...args);
  }

  updateHookConfig(...args) {
    return this.mapNameWorkspaceService.updateHookConfig(...args);
  }

  updateMapCampaign(...args) {
    return this.mapNameWorkspaceService.updateMapCampaign(...args);
  }
}

export { MapProcessingService };
