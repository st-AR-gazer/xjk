import { MapCampaignService } from "./mapNameWorkspace/mapCampaignService.js";
import { MapNameCandidateService } from "./mapNameWorkspace/mapNameCandidateService.js";
import { MapNameMetadataService } from "./mapNameWorkspace/mapNameMetadataService.js";
import { MapNameSimilarityAssignmentService } from "./mapNameWorkspace/mapNameSimilarityAssignmentService.js";
import { SimilarityWeightService } from "./mapNameWorkspace/similarityWeightService.js";

class MapNameWorkspaceService {
  constructor({
    repository,
    logger = console,
    getAlterationCatalogService,
    getMapLocalFileService,
    getProjectSourceService,
  }) {
    this.repository = repository;
    this.logger = logger;
    this.getAlterationCatalogService = getAlterationCatalogService;
    this.getMapLocalFileService = getMapLocalFileService;
    this.getProjectSourceService = getProjectSourceService;

    this.similarityWeightService = new SimilarityWeightService({ repository, getAlterationCatalogService });
    this.similarityAssignmentService = new MapNameSimilarityAssignmentService({
      repository,
      logger,
      getMapLocalFileService,
      getProjectSourceService,
      applyAutoApprovalFromSimilarity: (...args) => this.applyAutoApprovalFromSimilarity(...args),
    });
    this.metadataService = new MapNameMetadataService({
      repository,
      getProjectSourceService,
      getAutomaticSimilarityTargetMapUids: (...args) => this.getAutomaticSimilarityTargetMapUids(...args),
      assignStoredMapMetadata: (...args) => this.assignStoredMapMetadata(...args),
      assignStoredMapNumbersBySimilarity: (...args) => this.assignStoredMapNumbersBySimilarity(...args),
    });
    this.candidateService = new MapNameCandidateService({
      repository,
      logger,
      getMapLocalFileService,
      getMapNameStandardizationCandidateDetail: (...args) => this.getMapNameStandardizationCandidateDetail(...args),
      assignStoredMapNumbersBySimilarity: (...args) => this.assignStoredMapNumbersBySimilarity(...args),
    });
    this.campaignService = new MapCampaignService({
      repository,
      assignStoredMapMetadata: (...args) => this.assignStoredMapMetadata(...args),
      assignStoredMapNumbersBySimilarity: (...args) => this.assignStoredMapNumbersBySimilarity(...args),
    });
  }

  getSimilarityWeightRules(...args) {
    return this.similarityWeightService.getRules(...args);
  }

  getSimilarityWeightWorkspace(...args) {
    return this.similarityWeightService.getWorkspace(...args);
  }

  updateSimilarityWeightRule(...args) {
    return this.similarityWeightService.updateRule(...args);
  }

  deleteSimilarityWeightRule(...args) {
    return this.similarityWeightService.deleteRule(...args);
  }

  updateSimilarityCampaignWeightOverride(...args) {
    return this.similarityWeightService.updateCampaignOverride(...args);
  }

  deleteSimilarityCampaignWeightOverride(...args) {
    return this.similarityWeightService.deleteCampaignOverride(...args);
  }

  getNamingSimilaritySourceOptions(...args) {
    return this.metadataService.getSourceOptions(...args);
  }

  collectCampaignSnapshotMapUids(...args) {
    return this.metadataService.collectCampaignMapUids(...args);
  }

  getAutomaticSimilarityTargetMapUids(...args) {
    return this.metadataService.getAutomaticTargetMapUids(...args);
  }

  runAutomaticNamingAssignments(...args) {
    return this.metadataService.runAutomaticAssignments(...args);
  }

  assignStoredMapMetadata(...args) {
    return this.metadataService.assignStoredMetadata(...args);
  }

  processMapNameStandardization(...args) {
    return this.metadataService.processStandardization(...args);
  }

  applyAutoApprovalFromSimilarity(...args) {
    return this.metadataService.applyAutoApproval(...args);
  }

  assignStoredMapNumbersBySimilarity(...args) {
    return this.similarityAssignmentService.assign(...args);
  }

  getMapNameStandardizationCandidates(...args) {
    return this.candidateService.list(...args);
  }

  getMapNameStandardizationCandidateDetail(...args) {
    return this.candidateService.getDetail(...args);
  }

  updateMapNameCandidateSimilaritySelection(...args) {
    return this.candidateService.updateSelection(...args);
  }

  updateMapNameCandidateSimilarityWeights(...args) {
    return this.candidateService.updateWeights(...args);
  }

  updateMapNameStandardizationCandidateReview(...args) {
    return this.candidateService.updateReview(...args);
  }

  updateHookConfig(...args) {
    return this.campaignService.updateHookConfig(...args);
  }

  updateMapCampaign(...args) {
    return this.campaignService.updateMapCampaign(...args);
  }
}

export { MapNameWorkspaceService };
