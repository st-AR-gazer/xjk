import { clampInt, utcNowIso } from "../../../../shared/valueUtils.js";
import { normalizeStatus } from "../trackerRepositorySupport.js";

const TIME_OPTIONS = { min: 0, max: 2147483647, fallback: 0 };

function text(value, fallback = "") {
  return String(value ?? fallback).trim();
}

function normalizeMapTimes(item) {
  return {
    authorTime: clampInt(item?.authorMs ?? item?.authorTime ?? item?.author_time, TIME_OPTIONS),
    goldTime: clampInt(item?.goldMs ?? item?.goldTime ?? item?.gold_time, TIME_OPTIONS),
    silverTime: clampInt(item?.silverMs ?? item?.silverTime ?? item?.silver_time, TIME_OPTIONS),
    bronzeTime: clampInt(item?.bronzeMs ?? item?.bronzeTime ?? item?.bronze_time, TIME_OPTIONS),
  };
}

function normalizeWr(item, existing, now) {
  const wrTime = clampInt(item?.wrMs ?? item?.wrTime ?? item?.wr_time, {
    ...TIME_OPTIONS,
    fallback: clampInt(existing?.wrTime, TIME_OPTIONS),
  });
  return {
    wrTime,
    wrHolder: text(item?.wrHolder ?? item?.wrDisplayName ?? item?.wr_display_name ?? existing?.wrHolder) || null,
    wrAccountId: text(item?.wrAccountId ?? item?.wr_account_id ?? existing?.wrAccountId) || null,
    wrUpdatedAt: wrTime > 0 ? now : existing?.wrUpdatedAt || null,
  };
}

function normalizeMapInput(item, existing, now = utcNowIso()) {
  const mapUid = text(item?.uid || item?.mapUid || item?.map_uid);
  if (!mapUid) return null;
  const tracked = typeof item?.tracked === "boolean" ? item.tracked : existing ? Boolean(existing.tracked) : false;
  const status = normalizeStatus(item?.status, tracked ? "live" : existing?.status || "paused");
  return {
    mapUid,
    mapId: text(item?.mapId || item?.map_id || existing?.mapId) || `map-${mapUid.toLowerCase()}`,
    mapName: text(item?.name || item?.title || mapUid) || mapUid,
    author: text(item?.author),
    submitter: text(item?.submitter),
    ...normalizeMapTimes(item),
    laps: clampInt(item?.laps ?? item?.nbLaps ?? item?.nb_laps, { min: 1, max: 64, fallback: 1 }),
    thumbnailUrl: text(item?.thumbnailUrl ?? item?.thumbnail_url),
    downloadUrl: text(item?.downloadUrl ?? item?.download_url),
    checkFrequency: clampInt(item?.checkFrequency ?? item?.check_frequency, {
      min: 120,
      max: 604800,
      fallback: clampInt(existing?.checkFrequency, { min: 120, max: 604800, fallback: 21600 }),
    }),
    lastCheckedAt: item?.lastCheckedAt || item?.last_checked_at || existing?.lastCheckedAt || null,
    ...normalizeWr(item, existing, now),
    tracked,
    status,
    now,
  };
}

function normalizeCampaignRequest(item) {
  const campaignName = text(item?.campaignName ?? item?.campaign ?? item?.campaign_name);
  if (!campaignName) return null;
  return {
    campaignName,
    slot: clampInt(item?.slot, { min: 1, max: 5000, fallback: 1 }),
    clubId: clampInt(item?.clubId ?? item?.club_id, {
      min: 1,
      max: 2147483647,
      fallback: 558282,
    }),
  };
}

export { normalizeCampaignRequest, normalizeMapInput };
