import { normalizeAccountId } from "../../live/trackmaniaOAuthClient.js";
import { sanitizeResolvedDisplayName } from "../../../../shared/displayNameResolution.js";
import { clampInt } from "./runtimeSupport.js";
import { asArray, toNullableIso, toText } from "./valueSupport.js";

function summarizeCandidates(candidates = []) {
  const list = Array.isArray(candidates) ? candidates : [];
  const matched = list.reduce(
    (sum, candidate) => sum + (String(candidate?.automationState || "") === "matched" ? 1 : 0),
    0
  );
  return {
    matched,
    unmatched: Math.max(0, list.length - matched),
  };
}

function normalizeWrFeedEntry(value = {}) {
  if (!value || typeof value !== "object") return null;
  const mapUid = toText(value.mapUid || value.uid || value.map_uid);
  const name = toText(value.name || value.mapName || value.map_name);
  const accountId = normalizeAccountId(
    value.accountId || value.account_id || value.wrAccountId || value.wr_account_id || value.holder
  );
  const holder =
    sanitizeResolvedDisplayName(value.holder || value.wrHolder || value.displayName, { accountId }) ||
    accountId ||
    "Unknown";
  const wrMs = clampInt(value.wrMs ?? value.wr_ms ?? value.recordTime, {
    min: 0,
    max: 2147483647,
    fallback: 0,
  });
  const at = toNullableIso(value.at || value.recordedAt || value.recorded_at || value.timestamp);
  if (!name && !mapUid) return null;
  return {
    mapUid,
    name: name || mapUid || "Unknown map",
    accountId: accountId || null,
    holder: holder || "Unknown",
    wrMs,
    at: at || new Date().toISOString(),
  };
}

function pickLatestWr(primary, secondary) {
  const first = normalizeWrFeedEntry(primary);
  const second = normalizeWrFeedEntry(secondary);
  if (!first && !second) return null;
  if (!first) return second;
  if (!second) return first;
  const firstMs = Date.parse(first.at || "");
  const secondMs = Date.parse(second.at || "");
  if (Number.isFinite(firstMs) && Number.isFinite(secondMs)) {
    return firstMs >= secondMs ? first : second;
  }
  if (Number.isFinite(firstMs)) return first;
  if (Number.isFinite(secondMs)) return second;
  return first;
}

function groupLeaderboardBuckets(rows = [], { order = "alpha" } = {}) {
  const byBucket = new Map();
  for (const row of asArray(rows)) {
    const bucket = toText(row?.bucket, "Other") || "Other";
    if (!byBucket.has(bucket)) byBucket.set(bucket, []);
    const accountId = normalizeAccountId(row?.account_id ?? row?.accountId ?? row?.player);
    const displayName = toText(row?.display_name ?? row?.displayName ?? row?.player, "Unknown");
    byBucket.get(bucket).push({
      rank: Number(row?.rank || 0),
      player: displayName || "Unknown",
      account_id: accountId || null,
      display_name: displayName || "Unknown",
      wr_count: Number(row?.wr_count || 0),
      latest_wr_at: toNullableIso(row?.latest_wr_at) || null,
    });
  }

  const sortedBuckets = [...byBucket.keys()].sort((a, b) => {
    if (order === "season") {
      const seasonOrder = ["Winter", "Spring", "Summer", "Fall", "Other"];
      const left = seasonOrder.indexOf(a);
      const right = seasonOrder.indexOf(b);
      if (left !== -1 || right !== -1) {
        const safeLeft = left === -1 ? Number.MAX_SAFE_INTEGER : left;
        const safeRight = right === -1 ? Number.MAX_SAFE_INTEGER : right;
        if (safeLeft !== safeRight) return safeLeft - safeRight;
      }
    }

    if (order === "slot") {
      const leftNum = /^\d+$/.test(a) ? Number(a) : Number.MAX_SAFE_INTEGER;
      const rightNum = /^\d+$/.test(b) ? Number(b) : Number.MAX_SAFE_INTEGER;
      if (leftNum !== rightNum) return leftNum - rightNum;
    }

    return a.localeCompare(b, undefined, { sensitivity: "base" });
  });

  return sortedBuckets.map((bucket) => {
    const players = (byBucket.get(bucket) || []).sort((a, b) => {
      const rankDiff = Number(a.rank || 0) - Number(b.rank || 0);
      if (rankDiff !== 0) return rankDiff;
      const countDiff = Number(b.wr_count || 0) - Number(a.wr_count || 0);
      if (countDiff !== 0) return countDiff;
      return String(a.display_name || a.player || "").localeCompare(
        String(b.display_name || b.player || ""),
        undefined,
        {
          sensitivity: "base",
        }
      );
    });

    const totalWrs = players.reduce((sum, item) => sum + Number(item.wr_count || 0), 0);
    return {
      bucket,
      total_wrs: totalWrs,
      players,
    };
  });
}

function collectLeaderboardAccountIds(rows = []) {
  const ids = [];
  const seen = new Set();
  for (const row of asArray(rows)) {
    const accountId = normalizeAccountId(row?.account_id ?? row?.accountId ?? row?.player);
    if (!accountId || seen.has(accountId)) continue;
    seen.add(accountId);
    ids.push(accountId);
  }
  return ids;
}

function applyLeaderboardDisplayNames(rows = [], namesByAccountId = {}) {
  const map = namesByAccountId && typeof namesByAccountId === "object" ? namesByAccountId : {};
  return asArray(rows).map((row) => {
    const accountId = normalizeAccountId(row?.account_id ?? row?.accountId ?? row?.player);
    if (!accountId) {
      const fallback = toText(row?.display_name ?? row?.displayName ?? row?.player, "Unknown");
      return {
        ...row,
        player: fallback || "Unknown",
        account_id: null,
        display_name: fallback || "Unknown",
      };
    }
    const candidate = toText(map[accountId] ?? row?.display_name ?? row?.displayName ?? row?.player, "");
    const resolvedName = candidate && !normalizeAccountId(candidate) ? candidate : accountId;
    return {
      ...row,
      player: resolvedName,
      account_id: accountId,
      display_name: resolvedName,
    };
  });
}

function mergeWrDisplayNamesFromTracker({
  wrOverall = [],
  wrBySeasonRows = [],
  wrByCampaignRows = [],
  wrBySlotRows = [],
  namesByAccountId = {},
} = {}) {
  return {
    overall: applyLeaderboardDisplayNames(wrOverall, namesByAccountId),
    bySeasonRows: applyLeaderboardDisplayNames(wrBySeasonRows, namesByAccountId),
    byCampaignRows: applyLeaderboardDisplayNames(wrByCampaignRows, namesByAccountId),
    bySlotRows: applyLeaderboardDisplayNames(wrBySlotRows, namesByAccountId),
  };
}

function collectAllWrLeaderboardAccountIds({
  wrOverall = [],
  wrBySeasonRows = [],
  wrByCampaignRows = [],
  wrBySlotRows = [],
} = {}) {
  const seen = new Set();
  const out = [];
  const push = (rows) => {
    for (const accountId of collectLeaderboardAccountIds(rows)) {
      if (seen.has(accountId)) continue;
      seen.add(accountId);
      out.push(accountId);
    }
  };
  push(wrOverall);
  push(wrBySeasonRows);
  push(wrByCampaignRows);
  push(wrBySlotRows);
  return out;
}

function sortOverallWrRows(rows = []) {
  return asArray(rows).sort((a, b) => {
    const countDiff = Number(b.wr_count || 0) - Number(a.wr_count || 0);
    if (countDiff !== 0) return countDiff;
    const timeDiff = new Date(b.latest_wr_at || 0).getTime() - new Date(a.latest_wr_at || 0).getTime();
    if (timeDiff !== 0) return timeDiff;
    return String(a.display_name || a.player || "").localeCompare(String(b.display_name || b.player || ""), undefined, {
      sensitivity: "base",
    });
  });
}

function inferSeasonFromCampaignName(value) {
  const lower = String(value || "").toLowerCase();
  if (lower.includes("winter")) return "Winter";
  if (lower.includes("spring")) return "Spring";
  if (lower.includes("summer")) return "Summer";
  if (lower.includes("fall") || lower.includes("autumn")) return "Fall";
  return "Other";
}

function buildWrLeaderboardsFromTrackerMaps(trackerMaps = []) {
  const normalizedMaps = asArray(trackerMaps)
    .map((item) => {
      const accountId = normalizeAccountId(
        item?.wrAccountId ?? item?.wr_account_id ?? item?.accountId ?? item?.account_id
      );
      const player =
        sanitizeResolvedDisplayName(item?.wrHolder || item?.wr_holder || "", { accountId }) || accountId || "";
      const wrMs = clampInt(item?.wrMs ?? item?.wr_ms, { min: 0, max: 2147483647, fallback: 0 });
      const lower = player.trim().toLowerCase();
      if (!player || lower === "-" || lower === "unknown") return null;
      const campaign = toText(item?.campaign, "Unassigned") || "Unassigned";
      const slotInt = clampInt(item?.slot, { min: 0, max: 5000, fallback: 0 });
      const slot = slotInt >= 1 && slotInt <= 25 ? String(slotInt).padStart(2, "0") : "Other";
      const latestWrAt = toNullableIso(item?.wrUpdatedAt || item?.wr_updated_at) || null;
      if (wrMs <= 0 && !latestWrAt) return null;
      return {
        accountId: accountId || null,
        player,
        campaign,
        season: inferSeasonFromCampaignName(campaign),
        slot,
        latestWrAt,
      };
    })
    .filter(Boolean);

  const overallMap = new Map();
  const seasonMap = new Map();
  const campaignMap = new Map();
  const slotMap = new Map();

  const upsert = (target, bucket, player, latestWrAt, accountId = "") => {
    const key = `${bucket}::${accountId || player.toLowerCase()}`;
    if (!target.has(key)) {
      target.set(key, {
        bucket,
        account_id: accountId || null,
        player,
        wr_count: 0,
        latest_wr_at: latestWrAt,
      });
    }
    const current = target.get(key);
    current.wr_count += 1;
    if (latestWrAt && (!current.latest_wr_at || new Date(latestWrAt) > new Date(current.latest_wr_at))) {
      current.latest_wr_at = latestWrAt;
    }
  };

  for (const item of normalizedMaps) {
    upsert(overallMap, "overall", item.player, item.latestWrAt, item.accountId || "");
    upsert(seasonMap, item.season, item.player, item.latestWrAt, item.accountId || "");
    upsert(campaignMap, item.campaign, item.player, item.latestWrAt, item.accountId || "");
    upsert(slotMap, item.slot, item.player, item.latestWrAt, item.accountId || "");
  }

  const overall = [...overallMap.values()]
    .sort((a, b) => {
      const countDiff = Number(b.wr_count || 0) - Number(a.wr_count || 0);
      if (countDiff !== 0) return countDiff;
      const timeDiff = new Date(b.latest_wr_at || 0).getTime() - new Date(a.latest_wr_at || 0).getTime();
      if (timeDiff !== 0) return timeDiff;
      return String(a.player || "").localeCompare(String(b.player || ""), undefined, {
        sensitivity: "base",
      });
    })
    .map((row) => ({
      account_id: row.account_id || null,
      player: row.player,
      wr_count: Number(row.wr_count || 0),
      latest_wr_at: row.latest_wr_at || null,
    }));

  const toRankedRows = (target) => {
    const byBucket = new Map();
    for (const row of target.values()) {
      if (!byBucket.has(row.bucket)) byBucket.set(row.bucket, []);
      byBucket.get(row.bucket).push({
        account_id: row.account_id || null,
        player: row.player,
        wr_count: Number(row.wr_count || 0),
        latest_wr_at: row.latest_wr_at || null,
      });
    }

    const out = [];
    for (const [bucket, players] of byBucket.entries()) {
      players
        .sort((a, b) => {
          const countDiff = Number(b.wr_count || 0) - Number(a.wr_count || 0);
          if (countDiff !== 0) return countDiff;
          const timeDiff = new Date(b.latest_wr_at || 0).getTime() - new Date(a.latest_wr_at || 0).getTime();
          if (timeDiff !== 0) return timeDiff;
          return String(a.player || "").localeCompare(String(b.player || ""), undefined, {
            sensitivity: "base",
          });
        })
        .forEach((entry, index) => {
          out.push({
            bucket,
            account_id: entry.account_id || null,
            player: entry.player,
            wr_count: entry.wr_count,
            latest_wr_at: entry.latest_wr_at,
            rank: index + 1,
          });
        });
    }
    return out;
  };

  return {
    overall,
    by_season_rows: toRankedRows(seasonMap),
    by_campaign_rows: toRankedRows(campaignMap),
    by_slot_rows: toRankedRows(slotMap),
  };
}

export {
  summarizeCandidates,
  normalizeWrFeedEntry,
  pickLatestWr,
  groupLeaderboardBuckets,
  collectLeaderboardAccountIds,
  applyLeaderboardDisplayNames,
  mergeWrDisplayNamesFromTracker,
  collectAllWrLeaderboardAccountIds,
  sortOverallWrRows,
  inferSeasonFromCampaignName,
  buildWrLeaderboardsFromTrackerMaps,
};
