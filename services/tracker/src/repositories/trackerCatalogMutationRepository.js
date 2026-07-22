import { clampInt, utcNowIso } from "../../../shared/valueUtils.js";
import { withSqliteTransaction } from "../../../shared/sqliteRuntime.js";
import { bulkUpsertMaps } from "./trackerCatalogMutation/bulkMapIngestion.js";

class TrackerCatalogMutationRepository {
  constructor({ db, mapQueryRepository }) {
    this.db = db;
    this.mapQueryRepository = mapQueryRepository;
  }

  upsertClub({ clubId, clubName }) {
    const id = clampInt(clubId, { min: 1, max: 2147483647, fallback: 0 });
    if (!id) return null;
    const name = String(clubName || "").trim() || `Club ${id}`;
    const now = utcNowIso();
    this.db
      .prepare(
        `
        INSERT OR IGNORE INTO clubs (
          club_id, name, description, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?)
      `
      )
      .run(id, name, "", now, now);
    this.db.prepare("UPDATE clubs SET name = ?, updated_at = ? WHERE club_id = ?").run(name, now, id);

    return this.db
      .prepare(
        `
        SELECT club_id AS clubId, name AS clubName
        FROM clubs
        WHERE club_id = ?
        LIMIT 1
      `
      )
      .get(id);
  }

  upsertCampaignByName({ name, clubId }) {
    const now = utcNowIso();
    this.upsertClub({ clubId, clubName: `Club ${clubId}` });
    this.db
      .prepare(
        `
        INSERT OR IGNORE INTO campaigns (
          name, club_id, published, created_at, updated_at
        ) VALUES (?, ?, 0, ?, ?)
      `
      )
      .run(name, clubId, now, now);
    this.db.prepare("UPDATE campaigns SET updated_at = ? WHERE name = ? AND club_id = ?").run(now, name, clubId);
    return (
      this.db
        .prepare("SELECT campaign_id AS campaignId, name FROM campaigns WHERE name = ? AND club_id = ? LIMIT 1")
        .get(name, clubId) || null
    );
  }

  updateMapCampaign({ mapUid, campaignName, slot = 1, clubId = 558282 }) {
    const map = this.mapQueryRepository.getMapByUid(mapUid);
    if (!map) return null;
    const replaceLink = () => {
      const campaign = this.upsertCampaignByName({ name: campaignName, clubId });
      if (!campaign) return null;
      const now = utcNowIso();
      this.db.prepare("DELETE FROM map_campaigns WHERE map_uid = ?").run(mapUid);
      this.db
        .prepare(
          `
          INSERT INTO map_campaigns (map_uid, campaign_id, slot, created_at)
          VALUES (?, ?, ?, ?)
        `
        )
        .run(mapUid, campaign.campaignId, Math.max(1, Math.floor(slot)), now);
      this.db.prepare("UPDATE maps SET updated_at = ? WHERE map_uid = ?").run(now, mapUid);
      return this.mapQueryRepository.getMapInfo(mapUid);
    };
    if (this.db.isTransaction) return replaceLink();
    return withSqliteTransaction(this.db, replaceLink, { mode: "IMMEDIATE" });
  }

  updateMapTracking({ mapUid, tracked, status, checkFrequency }) {
    const sets = ["updated_at = ?"];
    const params = [utcNowIso()];
    if (typeof tracked === "boolean") {
      sets.push("is_tracked = ?");
      params.push(tracked ? 1 : 0);
    }
    if (typeof status === "string" && ["live", "paused", "archived"].includes(status)) {
      sets.push("tracking_status = ?");
      params.push(status);
    }
    if (Number.isFinite(checkFrequency)) {
      sets.push("check_frequency = ?");
      params.push(Math.max(120, Math.floor(checkFrequency)));
    }

    params.push(mapUid);
    const result = this.db.prepare(`UPDATE maps SET ${sets.join(", ")} WHERE map_uid = ?`).run(...params);
    if (!result.changes) return null;
    return this.mapQueryRepository.getMapInfo(mapUid);
  }

  bulkUpsertMaps(options = {}) {
    return bulkUpsertMaps(
      {
        db: this.db,
        linkMapToCampaign: (request) => this.updateMapCampaign(request),
      },
      options
    );
  }
}

export { TrackerCatalogMutationRepository };
