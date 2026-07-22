import { AlteredCatalogAlterationRepository } from "./alteredCatalog/alterationRepository.js";
import { AlteredCatalogCampaignRepository } from "./alteredCatalog/campaignRepository.js";
import { AlteredCatalogMapRepository } from "./alteredCatalog/mapRepository.js";
import { AlteredCatalogOverviewRepository } from "./alteredCatalog/overviewRepository.js";

class AlteredCatalogRepository {
  #alterationRepository;
  #campaignRepository;
  #mapRepository;
  #overviewRepository;

  constructor(db) {
    this.db = db;
    this.#alterationRepository = new AlteredCatalogAlterationRepository(db);
    this.#campaignRepository = new AlteredCatalogCampaignRepository(db);
    this.#mapRepository = new AlteredCatalogMapRepository(db);
    this.#overviewRepository = new AlteredCatalogOverviewRepository(db);
  }

  getSummary() {
    return this.#overviewRepository.getSummary();
  }

  getAlterationsStats() {
    return this.#overviewRepository.getAlterationsStats();
  }

  getAlterationsMapFilters() {
    return this.#campaignRepository.getAlterationsMapFilters();
  }

  getCampaignTimeline(...args) {
    return this.#overviewRepository.getCampaignTimeline(...args);
  }

  listAlterationsMaps(...args) {
    return this.#mapRepository.listAlterationsMaps(...args);
  }

  listAlterationsCampaigns(...args) {
    return this.#campaignRepository.listAlterationsCampaigns(...args);
  }

  upsertAlteration(name) {
    return this.#alterationRepository.upsertAlteration(name);
  }

  linkCampaignAlteration(campaignId, alterationId) {
    return this.#alterationRepository.linkCampaignAlteration(campaignId, alterationId);
  }

  clearCampaignAlterations(campaignId) {
    return this.#alterationRepository.clearCampaignAlterations(campaignId);
  }

  syncCampaignAlterationsById(campaignId) {
    return this.#alterationRepository.syncCampaignAlterationsById(campaignId);
  }

  deleteUnusedAlterations() {
    return this.#alterationRepository.deleteUnusedAlterations();
  }

  syncAllCampaignAlterations(...args) {
    return this.#alterationRepository.syncAllCampaignAlterations(...args);
  }

  countAlterations() {
    return this.#alterationRepository.countAlterations();
  }

  listAlterations() {
    return this.#alterationRepository.listAlterations();
  }

  listCampaignsByAlteration(alterationId) {
    return this.#alterationRepository.listCampaignsByAlteration(alterationId);
  }

  getAllCampaignAlterationLinks() {
    return this.#alterationRepository.getAllCampaignAlterationLinks();
  }

  listAlterationsUploadMaps(...args) {
    return this.#mapRepository.listAlterationsUploadMaps(...args);
  }

  listAlteredMapUids(...args) {
    return this.#mapRepository.listAlteredMapUids(...args);
  }

  listMostPlayedAlterationsMaps(...args) {
    return this.#mapRepository.listMostPlayedAlterationsMaps(...args);
  }

  resolveCampaignDbId(campaign) {
    return this.#campaignRepository.resolveCampaignDbId(campaign);
  }
}

export { AlteredCatalogRepository };
