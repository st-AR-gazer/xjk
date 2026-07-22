import {
  buildSimilarityWeightProfile,
  clampInt,
  rowToSimilarityWeightOverride,
  rowToSimilarityWeightRule,
  serializeJson,
  slugifyText,
  toText,
  uniqueBy,
} from "../alteredRepositorySupport.js";

class AlteredSimilarityWeightRepository {
  constructor(db) {
    this.db = db;
  }

  getSimilarityCampaignWeightOverrides({ campaignIds = [] } = {}) {
    const safeCampaignIds = uniqueBy(
      (Array.isArray(campaignIds) ? campaignIds : [campaignIds])
        .map((value) => clampInt(value, { min: 1, max: 2147483647, fallback: 0 }) || null)
        .filter(Boolean),
      (value) => value
    );
    if (!safeCampaignIds.length) return [];
    const placeholders = safeCampaignIds.map(() => "?").join(", ");
    const rows = this.db
      .prepare(
        `
        SELECT
          campaign_id AS campaignId,
          weights_json AS weightsJson,
          updated_at AS updatedAt
        FROM altered_similarity_campaign_weight_overrides
        WHERE campaign_id IN (${placeholders})
        `
      )
      .all(...safeCampaignIds);
    return rows.map((row) => rowToSimilarityWeightOverride(row));
  }

  getSimilarityMapWeightOverrides({ mapUids = [] } = {}) {
    const safeMapUids = uniqueBy(
      (Array.isArray(mapUids) ? mapUids : [mapUids]).map((value) => toText(value)).filter(Boolean),
      (value) => value.toLowerCase()
    );
    if (!safeMapUids.length) return [];
    const placeholders = safeMapUids.map(() => "?").join(", ");
    const rows = this.db
      .prepare(
        `
        SELECT
          map_uid AS mapUid,
          campaign_id AS campaignId,
          weights_json AS weightsJson,
          updated_at AS updatedAt
        FROM altered_similarity_map_weight_overrides
        WHERE map_uid IN (${placeholders})
        `
      )
      .all(...safeMapUids);
    return rows.map((row) => rowToSimilarityWeightOverride(row));
  }

  listSimilarityCampaignWeightOverrides() {
    const rows = this.db
      .prepare(
        `
        SELECT
          campaign_id AS campaignId,
          weights_json AS weightsJson,
          updated_at AS updatedAt
        FROM altered_similarity_campaign_weight_overrides
        ORDER BY updated_at DESC, campaign_id DESC
        `
      )
      .all();
    return rows.map((row) => rowToSimilarityWeightOverride(row));
  }

  listSimilarityWeightRules() {
    const rows = this.db
      .prepare(
        `
        SELECT
          rule_id AS ruleId,
          source_key AS sourceKey,
          season,
          season_year AS seasonYear,
          environment,
          alteration_slug AS alterationSlug,
          weights_json AS weightsJson,
          enabled,
          created_at AS createdAt,
          updated_at AS updatedAt
        FROM altered_similarity_weight_rules
        ORDER BY
          enabled DESC,
          updated_at DESC,
          rule_id DESC
        `
      )
      .all();
    return rows.map((row) => rowToSimilarityWeightRule(row));
  }

  upsertSimilarityWeightRule({
    ruleId = null,
    sourceKey = null,
    season = null,
    seasonYear = null,
    environment = null,
    alterationSlug = null,
    weights = null,
    enabled = true,
  } = {}) {
    const safeRuleId = clampInt(ruleId, { min: 1, max: 2147483647, fallback: 0 }) || null;
    const safeSourceKey = toText(sourceKey).toLowerCase() || null;
    const safeSeason = toText(season) || null;
    const safeSeasonYear = clampInt(seasonYear, { min: 1900, max: 3000, fallback: 0 }) || null;
    const safeEnvironment = toText(environment) || null;
    const safeAlterationSlug = slugifyText(alterationSlug || "", "") || null;
    const safeWeights = buildSimilarityWeightProfile(weights);
    const now = new Date().toISOString();

    if (!safeSourceKey && !safeSeason && !safeSeasonYear && !safeEnvironment && !safeAlterationSlug) {
      return {
        error: "Provide at least one scope filter for a similarity weight rule.",
      };
    }

    if (safeRuleId) {
      const result = this.db
        .prepare(
          `
          UPDATE altered_similarity_weight_rules
          SET
            source_key = ?,
            season = ?,
            season_year = ?,
            environment = ?,
            alteration_slug = ?,
            weights_json = ?,
            enabled = ?,
            updated_at = ?
          WHERE rule_id = ?
          `
        )
        .run(
          safeSourceKey,
          safeSeason,
          safeSeasonYear,
          safeEnvironment,
          safeAlterationSlug,
          serializeJson(safeWeights),
          enabled ? 1 : 0,
          now,
          safeRuleId
        );
      if (!Number(result?.changes || 0)) {
        return { error: "Similarity weight rule not found." };
      }
      return {
        ok: true,
        rule: {
          ruleId: safeRuleId,
          sourceKey: safeSourceKey,
          season: safeSeason,
          seasonYear: safeSeasonYear,
          environment: safeEnvironment,
          alterationSlug: safeAlterationSlug,
          weights: safeWeights,
          enabled: Boolean(enabled),
          updatedAt: now,
        },
      };
    }

    const insert = this.db
      .prepare(
        `
        INSERT INTO altered_similarity_weight_rules (
          source_key,
          season,
          season_year,
          environment,
          alteration_slug,
          weights_json,
          enabled,
          created_at,
          updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        `
      )
      .run(
        safeSourceKey,
        safeSeason,
        safeSeasonYear,
        safeEnvironment,
        safeAlterationSlug,
        serializeJson(safeWeights),
        enabled ? 1 : 0,
        now,
        now
      );
    return {
      ok: true,
      rule: {
        ruleId: Number(insert?.lastInsertRowid || 0) || null,
        sourceKey: safeSourceKey,
        season: safeSeason,
        seasonYear: safeSeasonYear,
        environment: safeEnvironment,
        alterationSlug: safeAlterationSlug,
        weights: safeWeights,
        enabled: Boolean(enabled),
        createdAt: now,
        updatedAt: now,
      },
    };
  }

  deleteSimilarityWeightRule({ ruleId } = {}) {
    const safeRuleId = clampInt(ruleId, { min: 1, max: 2147483647, fallback: 0 }) || null;
    if (!safeRuleId) return { error: "ruleId is required." };
    const result = this.db
      .prepare(
        `
        DELETE FROM altered_similarity_weight_rules
        WHERE rule_id = ?
        `
      )
      .run(safeRuleId);
    return {
      ok: true,
      ruleId: safeRuleId,
      deleted: Number(result?.changes || 0),
    };
  }

  upsertSimilarityCampaignWeightOverride({ campaignId, weights } = {}) {
    const safeCampaignId = clampInt(campaignId, { min: 1, max: 2147483647, fallback: 0 }) || null;
    if (!safeCampaignId) return { error: "campaignId is required." };
    const safeWeights = buildSimilarityWeightProfile(weights);
    const now = new Date().toISOString();
    const existed = Boolean(
      this.db
        .prepare(
          `
          SELECT 1
          FROM altered_similarity_campaign_weight_overrides
          WHERE campaign_id = ?
          LIMIT 1
          `
        )
        .get(safeCampaignId)
    );
    this.db
      .prepare(
        `
        INSERT INTO altered_similarity_campaign_weight_overrides (
          campaign_id,
          weights_json,
          updated_at
        ) VALUES (?, ?, ?)
        ON CONFLICT(campaign_id) DO UPDATE SET
          weights_json = excluded.weights_json,
          updated_at = excluded.updated_at
        `
      )
      .run(safeCampaignId, serializeJson(safeWeights), now);
    return {
      ok: true,
      inserted: existed ? 0 : 1,
      updated: existed ? 1 : 0,
      campaignId: safeCampaignId,
      weights: safeWeights,
      updatedAt: now,
    };
  }

  deleteSimilarityCampaignWeightOverride({ campaignId } = {}) {
    const safeCampaignId = clampInt(campaignId, { min: 1, max: 2147483647, fallback: 0 }) || null;
    if (!safeCampaignId) return { error: "campaignId is required." };
    const result = this.db
      .prepare(
        `
        DELETE FROM altered_similarity_campaign_weight_overrides
        WHERE campaign_id = ?
        `
      )
      .run(safeCampaignId);
    return {
      ok: true,
      campaignId: safeCampaignId,
      deleted: Number(result?.changes || 0),
    };
  }

  upsertSimilarityMapWeightOverride({ mapUid, campaignId = null, weights } = {}) {
    const safeMapUid = toText(mapUid);
    if (!safeMapUid) return { error: "mapUid is required." };
    const safeCampaignId = clampInt(campaignId, { min: 1, max: 2147483647, fallback: 0 }) || null;
    const safeWeights = buildSimilarityWeightProfile(weights);
    const now = new Date().toISOString();
    const existed = Boolean(
      this.db
        .prepare(
          `
          SELECT 1
          FROM altered_similarity_map_weight_overrides
          WHERE map_uid = ?
          LIMIT 1
          `
        )
        .get(safeMapUid)
    );
    this.db
      .prepare(
        `
        INSERT INTO altered_similarity_map_weight_overrides (
          map_uid,
          campaign_id,
          weights_json,
          updated_at
        ) VALUES (?, ?, ?, ?)
        ON CONFLICT(map_uid) DO UPDATE SET
          campaign_id = excluded.campaign_id,
          weights_json = excluded.weights_json,
          updated_at = excluded.updated_at
        `
      )
      .run(safeMapUid, safeCampaignId, serializeJson(safeWeights), now);
    return {
      ok: true,
      inserted: existed ? 0 : 1,
      updated: existed ? 1 : 0,
      mapUid: safeMapUid,
      campaignId: safeCampaignId,
      weights: safeWeights,
      updatedAt: now,
    };
  }

  deleteSimilarityMapWeightOverride({ mapUid } = {}) {
    const safeMapUid = toText(mapUid);
    if (!safeMapUid) return { error: "mapUid is required." };
    const result = this.db
      .prepare(
        `
        DELETE FROM altered_similarity_map_weight_overrides
        WHERE map_uid = ?
        `
      )
      .run(safeMapUid);
    return {
      ok: true,
      mapUid: safeMapUid,
      deleted: Number(result?.changes || 0),
    };
  }
}

export { AlteredSimilarityWeightRepository };
