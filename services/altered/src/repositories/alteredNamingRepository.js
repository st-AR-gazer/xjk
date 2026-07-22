import {
  AlteredNamingMapSelectionRepository,
  buildMapSelectionFilter,
} from "./alteredNaming/mapSelectionRepository.js";
import { AlteredMapNumberSimilarityRepository } from "./alteredNaming/mapNumberSimilarityRepository.js";
import { AlteredNameCandidateRepository } from "./alteredNaming/nameCandidateRepository.js";
import {
  AlteredNameCandidateReviewRepository,
  buildNameCandidateFilter,
} from "./alteredNaming/nameCandidateReviewRepository.js";
import { AlteredSimilarityWeightRepository } from "./alteredNaming/similarityWeightRepository.js";

class AlteredNamingRepository {
  constructor(db) {
    this.db = db;
    this.mapSelectionRepository = new AlteredNamingMapSelectionRepository(db);
    this.nameCandidateRepository = new AlteredNameCandidateRepository(db);
    this.mapNumberSimilarityRepository = new AlteredMapNumberSimilarityRepository(db);
    this.similarityWeightRepository = new AlteredSimilarityWeightRepository(db);
    this.nameCandidateReviewRepository = new AlteredNameCandidateReviewRepository(db);
  }

  listMapsForNameStandardization(options = {}) {
    return this.mapSelectionRepository.listMapsForNameStandardization(options);
  }

  listMapsNeedingSimilarityRefresh(options = {}) {
    return this.mapSelectionRepository.listMapsNeedingSimilarityRefresh(options);
  }

  upsertMapNameCandidates(options = {}) {
    return this.nameCandidateRepository.upsertMapNameCandidates(options);
  }

  deleteMapNameCandidates(options = {}) {
    return this.nameCandidateRepository.deleteMapNameCandidates(options);
  }

  getMapNumberSimilarity(options = {}) {
    return this.mapNumberSimilarityRepository.getMapNumberSimilarity(options);
  }

  upsertMapNumberSimilarity(options = {}) {
    return this.mapNumberSimilarityRepository.upsertMapNumberSimilarity(options);
  }

  getSimilarityCampaignWeightOverrides(options = {}) {
    return this.similarityWeightRepository.getSimilarityCampaignWeightOverrides(options);
  }

  getSimilarityMapWeightOverrides(options = {}) {
    return this.similarityWeightRepository.getSimilarityMapWeightOverrides(options);
  }

  listSimilarityCampaignWeightOverrides() {
    return this.similarityWeightRepository.listSimilarityCampaignWeightOverrides();
  }

  listSimilarityWeightRules() {
    return this.similarityWeightRepository.listSimilarityWeightRules();
  }

  upsertSimilarityWeightRule(options = {}) {
    return this.similarityWeightRepository.upsertSimilarityWeightRule(options);
  }

  deleteSimilarityWeightRule(options = {}) {
    return this.similarityWeightRepository.deleteSimilarityWeightRule(options);
  }

  upsertSimilarityCampaignWeightOverride(options = {}) {
    return this.similarityWeightRepository.upsertSimilarityCampaignWeightOverride(options);
  }

  deleteSimilarityCampaignWeightOverride(options = {}) {
    return this.similarityWeightRepository.deleteSimilarityCampaignWeightOverride(options);
  }

  upsertSimilarityMapWeightOverride(options = {}) {
    return this.similarityWeightRepository.upsertSimilarityMapWeightOverride(options);
  }

  deleteSimilarityMapWeightOverride(options = {}) {
    return this.similarityWeightRepository.deleteSimilarityMapWeightOverride(options);
  }

  bulkApproveMapNameCandidates(options = {}) {
    return this.nameCandidateReviewRepository.bulkApproveMapNameCandidates(options);
  }

  getMapNameCandidateSummary() {
    return this.nameCandidateReviewRepository.getMapNameCandidateSummary();
  }

  listMapNameCandidates(options = {}) {
    return this.nameCandidateReviewRepository.listMapNameCandidates(options);
  }

  countMapNameCandidates(options = {}) {
    return this.nameCandidateReviewRepository.countMapNameCandidates(options);
  }

  getMapNameCandidate(mapUid) {
    return this.nameCandidateReviewRepository.getMapNameCandidate(mapUid);
  }

  updateMapNameCandidateReview(options = {}) {
    return this.nameCandidateReviewRepository.updateMapNameCandidateReview(options);
  }
}

export { AlteredNamingRepository, buildMapSelectionFilter, buildNameCandidateFilter };
