import {
  DEFAULT_SIMILARITY_WEIGHT_PROFILE,
  buildSimilarityWeightProfile,
  listKnownAlterationRegexBehavior,
  listKnownAlterationRegexLibrary,
} from "../../serviceSupport.js";

class SimilarityWeightService {
  constructor({ repository, getAlterationCatalogService }) {
    this.repository = repository;
    this.getAlterationCatalogService = getAlterationCatalogService;
  }

  getRules() {
    return this.repository.naming.listSimilarityWeightRules();
  }

  getWorkspace() {
    const configuredAlterations = this.getAlterationCatalogService().getConfiguredAlterations();
    return {
      generatedAt: new Date().toISOString(),
      defaults: buildSimilarityWeightProfile(DEFAULT_SIMILARITY_WEIGHT_PROFILE),
      scopedRules: this.repository.naming.listSimilarityWeightRules(),
      campaignOverrides: this.repository.naming.listSimilarityCampaignWeightOverrides(),
      alterations: configuredAlterations.alterations,
      alterationRegexLibrary: listKnownAlterationRegexLibrary(),
      alterationRegexBehavior: listKnownAlterationRegexBehavior(),
    };
  }

  updateRule({
    ruleId = null,
    sourceKey = null,
    season = null,
    seasonYear = null,
    environment = null,
    alterationSlug = null,
    weights = null,
  } = {}) {
    return this.repository.naming.upsertSimilarityWeightRule({
      ruleId,
      sourceKey,
      season,
      seasonYear,
      environment,
      alterationSlug,
      weights,
      enabled: true,
    });
  }

  deleteRule({ ruleId } = {}) {
    return this.repository.naming.deleteSimilarityWeightRule({ ruleId });
  }

  updateCampaignOverride({ campaignId, weights = null } = {}) {
    return this.repository.naming.upsertSimilarityCampaignWeightOverride({
      campaignId,
      weights,
    });
  }

  deleteCampaignOverride({ campaignId } = {}) {
    return this.repository.naming.deleteSimilarityCampaignWeightOverride({ campaignId });
  }
}

export { SimilarityWeightService };
