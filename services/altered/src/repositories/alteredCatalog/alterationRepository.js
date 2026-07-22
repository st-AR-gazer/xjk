import { clampInt, parseCampaignStandardizedFields, slugifyText, uniqueTexts } from "../alteredRepositorySupport.js";

class AlteredCatalogAlterationRepository {
  constructor(db) {
    this.db = db;
  }

  upsertAlteration(name) {
    const safeName = String(name || "").trim();
    if (!safeName) return null;
    const baseSlug = slugifyText(safeName, safeName);
    const existingByName =
      this.db
        .prepare(
          `
          SELECT alteration_id AS id, name, slug
          FROM altered_alterations
          WHERE name = ?
          LIMIT 1
          `
        )
        .get(safeName) || null;
    const existingBySlug =
      this.db
        .prepare(
          `
          SELECT alteration_id AS id, name, slug
          FROM altered_alterations
          WHERE slug = ?
          LIMIT 1
          `
        )
        .get(baseSlug) || null;
    const existing = existingByName || existingBySlug;
    const pickUniqueSlug = (desiredSlug, excludeId = 0) => {
      let candidate = slugifyText(desiredSlug, safeName);
      let suffix = 2;
      while (true) {
        const conflict =
          this.db
            .prepare(
              `
              SELECT alteration_id AS id
              FROM altered_alterations
              WHERE slug = ?
              LIMIT 1
              `
            )
            .get(candidate) || null;
        if (!conflict || Number(conflict.id || 0) === Number(excludeId || 0)) {
          return candidate;
        }
        candidate = `${slugifyText(desiredSlug, safeName)}-${suffix}`;
        suffix += 1;
      }
    };
    const now = new Date().toISOString();
    if (existingBySlug && !existingByName) {
      this.db
        .prepare(
          `
          UPDATE altered_alterations
          SET updated_at = ?
          WHERE alteration_id = ?
          `
        )
        .run(now, Number(existingBySlug.id || 0));
      return {
        id: Number(existingBySlug.id || 0),
        name: existingBySlug.name,
        slug: slugifyText(existingBySlug.slug || existingBySlug.name, existingBySlug.name),
      };
    }

    const safeSlug = pickUniqueSlug(baseSlug, existing?.id || 0);
    this.db
      .prepare(
        `INSERT INTO altered_alterations (name, slug, created_at, updated_at)
         VALUES (?, ?, ?, ?)
         ON CONFLICT(name) DO UPDATE SET
           slug = COALESCE(NULLIF(excluded.slug, ''), altered_alterations.slug),
           updated_at = excluded.updated_at`
      )
      .run(safeName, safeSlug, now, now);
    const row = this.db
      .prepare(`SELECT alteration_id AS id, name, slug FROM altered_alterations WHERE name = ?`)
      .get(safeName);
    return row
      ? {
          id: Number(row.id),
          name: row.name,
          slug: slugifyText(row.slug || row.name, row.name),
        }
      : null;
  }

  linkCampaignAlteration(campaignId, alterationId) {
    this.db
      .prepare(
        `INSERT OR IGNORE INTO altered_campaign_alterations (campaign_id, alteration_id)
         VALUES (?, ?)`
      )
      .run(Number(campaignId), Number(alterationId));
  }

  clearCampaignAlterations(campaignId) {
    this.db.prepare(`DELETE FROM altered_campaign_alterations WHERE campaign_id = ?`).run(Number(campaignId));
  }

  syncCampaignAlterationsById(campaignId) {
    const safeCampaignId = clampInt(campaignId, {
      min: 1,
      max: 2147483647,
      fallback: 0,
    });
    if (!safeCampaignId) {
      return {
        ok: false,
        campaignId: null,
        linked: 0,
        alterations: [],
      };
    }

    const campaign = this.db
      .prepare(
        `
        SELECT
          campaign_id AS campaignId,
          name AS campaignName,
          start_timestamp AS startTimestamp
        FROM altered_campaigns
        WHERE campaign_id = ?
        LIMIT 1
        `
      )
      .get(safeCampaignId);
    if (!campaign) {
      return {
        ok: false,
        campaignId: safeCampaignId,
        linked: 0,
        alterations: [],
      };
    }

    const parsed = parseCampaignStandardizedFields(campaign.campaignName || "", {
      startTimestamp: campaign.startTimestamp || null,
    });
    const alterationNames = uniqueTexts(
      Array.isArray(parsed?.alterations) && parsed.alterations.length
        ? parsed.alterations
        : Array.isArray(parsed?.alterationMix) && parsed.alterationMix.length
          ? parsed.alterationMix
          : [parsed?.alteration || ""]
    );

    this.clearCampaignAlterations(safeCampaignId);

    const linkedAlterations = [];
    for (const alterationName of alterationNames) {
      const alteration = this.upsertAlteration(alterationName);
      if (!alteration?.id) continue;
      this.linkCampaignAlteration(safeCampaignId, alteration.id);
      linkedAlterations.push(alteration);
    }

    return {
      ok: true,
      campaignId: safeCampaignId,
      linked: linkedAlterations.length,
      alterations: linkedAlterations,
      parsedCampaign: parsed,
    };
  }

  deleteUnusedAlterations() {
    const result = this.db
      .prepare(
        `
        DELETE FROM altered_alterations
        WHERE alteration_id NOT IN (
          SELECT DISTINCT alteration_id
          FROM altered_campaign_alterations
        )
        `
      )
      .run();
    return Number(result?.changes || 0);
  }

  syncAllCampaignAlterations({ cleanupUnused = true } = {}) {
    const campaignRows = this.db
      .prepare(
        `
        SELECT campaign_id AS campaignId
        FROM altered_campaigns
        ORDER BY campaign_id ASC
        `
      )
      .all();

    const summary = {
      campaigns_scanned: campaignRows.length,
      campaigns_linked: 0,
      links_inserted: 0,
      alterations_touched: 0,
      unused_deleted: 0,
    };
    const touchedAlterationIds = new Set();

    try {
      this.db.exec("BEGIN IMMEDIATE");
      for (const row of campaignRows) {
        const result = this.syncCampaignAlterationsById(row.campaignId);
        if (!result?.ok) continue;
        if (result.linked > 0) summary.campaigns_linked += 1;
        summary.links_inserted += Number(result.linked || 0);
        for (const alteration of result.alterations || []) {
          if (alteration?.id) touchedAlterationIds.add(Number(alteration.id));
        }
      }
      summary.alterations_touched = touchedAlterationIds.size;
      if (cleanupUnused) {
        summary.unused_deleted = this.deleteUnusedAlterations();
      }
      this.db.exec("COMMIT");
    } catch (error) {
      try {
        this.db.exec("ROLLBACK");
      } catch {}
      throw error;
    }

    return summary;
  }

  countAlterations() {
    return Number(this.db.prepare("SELECT COUNT(*) AS count FROM altered_alterations").get()?.count || 0);
  }

  listAlterations() {
    return this.db
      .prepare(
        `SELECT
           a.alteration_id AS alterationId,
           a.name,
           a.slug AS slug,
           a.created_at AS createdAt,
           COUNT(DISTINCT ca.campaign_id) AS campaignCount,
           COALESCE(SUM(sub.mapCount), 0) AS mapCount
         FROM altered_alterations a
         LEFT JOIN altered_campaign_alterations ca ON ca.alteration_id = a.alteration_id
         LEFT JOIN (
           SELECT p.campaign_id, COUNT(p.map_uid) AS mapCount
           FROM altered_map_positions p
           JOIN altered_maps m ON m.map_uid = p.map_uid
           GROUP BY p.campaign_id
         ) sub ON sub.campaign_id = ca.campaign_id
         GROUP BY a.alteration_id
         ORDER BY a.name COLLATE NOCASE ASC`
      )
      .all()
      .map((row) => ({
        id: Number(row.alterationId),
        name: row.name,
        slug: slugifyText(row.slug || row.name, row.name),
        campaign_count: Number(row.campaignCount || 0),
        map_count: Number(row.mapCount || 0),
        created_at: row.createdAt,
      }));
  }

  listCampaignsByAlteration(alterationId) {
    return this.db
      .prepare(
        `SELECT
           c.campaign_id AS campaignDbId,
           c.external_campaign_id AS campaignExternalId,
           c.name AS campaignName,
           c.start_timestamp AS startTimestamp,
           c.payload_json AS payloadJson,
           c.created_at AS createdAt,
           c.updated_at AS updatedAt,
           COUNT(m.map_uid) AS mapCount,
           (
             SELECT m2.thumbnail_url
             FROM altered_map_positions p2
             JOIN altered_maps m2 ON m2.map_uid = p2.map_uid
             WHERE p2.campaign_id = c.campaign_id
               AND m2.thumbnail_url IS NOT NULL
               AND m2.thumbnail_url != ''
             LIMIT 1
           ) AS thumbnailUrl
         FROM altered_campaigns c
         JOIN altered_campaign_alterations ca ON ca.campaign_id = c.campaign_id
         LEFT JOIN altered_map_positions p ON p.campaign_id = c.campaign_id
         LEFT JOIN altered_maps m ON m.map_uid = p.map_uid
         WHERE ca.alteration_id = ?
         GROUP BY c.campaign_id
         HAVING COUNT(m.map_uid) > 0`
      )
      .all(Number(alterationId));
  }

  getAllCampaignAlterationLinks() {
    return this.db
      .prepare(
        `SELECT campaign_id AS campaignId, alteration_id AS alterationId
         FROM altered_campaign_alterations`
      )
      .all();
  }
}

export { AlteredCatalogAlterationRepository };
