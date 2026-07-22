import { utcNowIso } from "../../../shared/valueUtils.js";
import {
  pickUniqueCampaignName,
  resolveCampaignIdentity,
  resolveDesiredCampaignName,
} from "./alteredCampaign/identity.js";
import { normalizeCampaignInput } from "./alteredCampaign/input.js";
import { getCampaignIdentity, saveCampaignRecord } from "./alteredCampaign/recordPersistence.js";
import { clampInt, DEFAULT_HOOK_KEY, normalizeStatus } from "./alteredRepositorySupport.js";

class AlteredCampaignRepository {
  constructor({ db, catalogRepository, configurationRepository, mapRepository }) {
    this.db = db;
    this.catalogRepository = catalogRepository;
    this.configurationRepository = configurationRepository;
    this.mapRepository = mapRepository;
  }

  upsertCampaign(payload = {}) {
    const input = normalizeCampaignInput(payload);
    if (!input) return null;

    const { target } = resolveCampaignIdentity(this.db, input);
    const campaignId = Number(target?.campaignId || 0);
    const desiredName = resolveDesiredCampaignName(this.db, input, target);
    const name = pickUniqueCampaignName(this.db, {
      clubId: input.clubId,
      desiredName,
      excludeCampaignId: campaignId,
    });
    const savedCampaignId = saveCampaignRecord(this.db, {
      input,
      target,
      name,
      now: utcNowIso(),
    });
    if (!savedCampaignId) return null;

    this.catalogRepository.syncCampaignAlterationsById(savedCampaignId);
    return getCampaignIdentity(this.db, savedCampaignId);
  }

  upsertCampaignByName({ clubId, campaignName, ...rest }) {
    return this.upsertCampaign({ clubId, campaignName, ...rest });
  }

  updateMapCampaign({ mapUid, campaignName, slot = 1 }) {
    const map = this.db.prepare("SELECT map_uid AS uid FROM altered_maps WHERE map_uid = ? LIMIT 1").get(mapUid);
    if (!map) return null;

    const hook =
      this.configurationRepository.getHookConfig(DEFAULT_HOOK_KEY) ||
      this.configurationRepository.ensureDefaultHookConfig();
    const campaign = this.upsertCampaignByName({ clubId: hook.clubId, campaignName });
    if (!campaign) return null;

    const now = utcNowIso();
    this.db
      .prepare(
        `INSERT INTO altered_map_positions (map_uid, campaign_id, slot, updated_at)
         VALUES (?, ?, ?, ?)
         ON CONFLICT(map_uid) DO UPDATE SET
           campaign_id = excluded.campaign_id,
           slot = excluded.slot,
           updated_at = excluded.updated_at`
      )
      .run(mapUid, campaign.campaignId, Math.max(1, Math.floor(slot)), now);

    this.db.prepare("UPDATE altered_maps SET updated_at = ? WHERE map_uid = ?").run(now, mapUid);
    return this.mapRepository.getMapInfo(mapUid);
  }

  updateMapTracking({ mapUid, tracked, status, checkFrequency }) {
    const sets = ["updated_at = ?"];
    const params = [utcNowIso()];

    if (typeof tracked === "boolean") {
      sets.push("tracked = ?");
      params.push(tracked ? 1 : 0);
    }
    if (typeof status === "string") {
      sets.push("status = ?");
      params.push(normalizeStatus(status, "live"));
    }
    if (Number.isFinite(checkFrequency)) {
      sets.push("check_frequency = ?");
      params.push(clampInt(checkFrequency, { min: 120, max: 604800, fallback: 21600 }));
    }

    params.push(mapUid);
    const result = this.db.prepare(`UPDATE altered_maps SET ${sets.join(", ")} WHERE map_uid = ?`).run(...params);
    if (!result.changes) return null;
    return this.mapRepository.getMapInfo(mapUid);
  }

  recordSyncRun({
    hookKey = DEFAULT_HOOK_KEY,
    startedAt,
    finishedAt,
    campaignsSeen = 0,
    mapsSeen = 0,
    mapsInserted = 0,
    mapsUpdated = 0,
    mapsLinked = 0,
    status = "ok",
    note = "",
  } = {}) {
    const row = this.db
      .prepare(
        `INSERT INTO altered_sync_runs (
           hook_key, started_at, finished_at, campaigns_seen, maps_seen,
           maps_inserted, maps_updated, maps_linked, status, note
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        hookKey,
        startedAt,
        finishedAt,
        Math.max(0, Number(campaignsSeen) || 0),
        Math.max(0, Number(mapsSeen) || 0),
        Math.max(0, Number(mapsInserted) || 0),
        Math.max(0, Number(mapsUpdated) || 0),
        Math.max(0, Number(mapsLinked) || 0),
        status === "error" ? "error" : "ok",
        String(note || "")
      );
    return Number(row.lastInsertRowid || 0);
  }

  getMapsForTracker(mapUids = []) {
    if (!Array.isArray(mapUids) || !mapUids.length) return [];
    const placeholders = mapUids.map(() => "?").join(", ");
    const rows = this.db
      .prepare(
        `SELECT
           map_uid AS uid,
           map_id AS mapId,
           name,
           author,
           submitter,
           author_time AS authorMs,
           gold_time AS goldMs,
           silver_time AS silverMs,
           bronze_time AS bronzeMs,
           nb_laps AS nbLaps,
           thumbnail_url AS thumbnailUrl,
           download_url AS downloadUrl,
           wr_ms AS wrMs,
           wr_holder AS wrHolder,
           tracked,
           status,
           check_frequency AS checkFrequency,
           last_checked_at AS lastCheckedAt,
           pos.campaignName,
           pos.slot,
           pos.clubId
         FROM altered_maps m
         LEFT JOIN (
           SELECT
             p.map_uid AS mapUid,
             p.slot,
             c.name AS campaignName,
             c.club_id AS clubId
           FROM altered_map_positions p
           JOIN altered_campaigns c ON c.campaign_id = p.campaign_id
           WHERE p.rowid IN (
             SELECT MAX(p2.rowid)
             FROM altered_map_positions p2
             GROUP BY p2.map_uid
           )
         ) pos ON pos.mapUid = m.map_uid
         WHERE map_uid IN (${placeholders})`
      )
      .all(...mapUids);
    return rows.map((row) => ({
      ...row,
      tracked: Boolean(row.tracked),
      status: normalizeStatus(row.status, row.tracked ? "live" : "paused"),
      checkFrequency: Number(row.checkFrequency || 21600),
      wrMs: Number(row.wrMs || 0),
      campaignName: String(row.campaignName || "").trim() || null,
      slot: Number(row.slot || 0),
      clubId: Number(row.clubId || 0) || null,
    }));
  }
}

export { AlteredCampaignRepository };
