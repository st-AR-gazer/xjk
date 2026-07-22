import { postJson } from "./api-client.js?v=2";
import { clearDisplayNameRefreshState } from "../../shared/display-name-refresh.js?v=2";
import { displayNamesByAccountId, state } from "./state.js?v=2";
import {
  firstMapValue,
  isUsableDisplayName,
  looksLikeAccountId,
  resolveDisplayLabel,
  savedMapperName,
} from "./formatters.js?v=2";
import { getChangeCountValue, getMapNumberLabel, getMapUidValue, numberMapValue } from "./map-model.js?v=2";
import { uniqueList } from "./query.js?v=2";

export function getCachedDisplayName(accountId) {
  const id = String(accountId || "")
    .trim()
    .toLowerCase();
  if (!looksLikeAccountId(id)) return "";
  const displayName = displayNamesByAccountId[id] || "";
  return isUsableDisplayName(displayName, id) ? String(displayName).trim() : "";
}

export function rememberResolvedDisplayNames(namesByAccountId = {}) {
  if (!namesByAccountId || typeof namesByAccountId !== "object") return {};
  const remembered = {};
  for (const [rawAccountId, rawDisplayName] of Object.entries(namesByAccountId)) {
    const accountId = String(rawAccountId || "")
      .trim()
      .toLowerCase();
    const displayName = String(rawDisplayName || "").trim();
    if (!looksLikeAccountId(accountId) || !isUsableDisplayName(displayName, accountId)) continue;
    displayNamesByAccountId[accountId] = displayName;
    remembered[accountId] = displayName;
  }
  return remembered;
}

export function getCachedDisplayNamesForAccountIds(accountIds = []) {
  const out = {};
  for (const accountId of accountIds) {
    const id = String(accountId || "")
      .trim()
      .toLowerCase();
    const displayName = getCachedDisplayName(id);
    if (displayName) out[id] = displayName;
  }
  return out;
}

export function resolveMapAuthorLabel(map) {
  const accountId = firstMapValue(map, ["author"], "");
  const confirmed =
    firstMapValue(map, ["author_display_name", "authorDisplayName"], "") || getCachedDisplayName(accountId);
  return resolveDisplayLabel(confirmed || savedMapperName(map, "author"), accountId, "Unknown");
}

export function collectPendingDisplayNameAccountIds(rows = []) {
  const out = [];
  const seen = new Set();
  const collect = (accountId, displayName) => {
    const id = String(accountId || "")
      .trim()
      .toLowerCase();
    const name = String(displayName || "").trim();
    if (!looksLikeAccountId(id) || isUsableDisplayName(name, id) || seen.has(id)) {
      return;
    }
    seen.add(id);
    out.push(id);
  };

  for (const row of Array.isArray(rows) ? rows : []) {
    collect(row?.author, row?.author_display_name ?? row?.authorDisplayName);
    collect(row?.submitter, row?.submitter_display_name ?? row?.submitterDisplayName);
    collect(
      row?.wr_account_id ?? row?.wrAccountId ?? row?.wr_holder ?? row?.wrHolder,
      looksLikeAccountId(row?.wr_holder ?? row?.wrHolder) ? "" : (row?.wr_holder ?? row?.wrHolder)
    );
  }

  return out;
}

export function rememberMapDisplayNames(rows = []) {
  const namesByAccountId = {};
  const collect = (accountId, displayName) => {
    const id = String(accountId || "")
      .trim()
      .toLowerCase();
    const name = String(displayName || "").trim();
    if (!looksLikeAccountId(id) || !isUsableDisplayName(name, id)) {
      return;
    }
    namesByAccountId[id] = name;
  };

  for (const row of Array.isArray(rows) ? rows : []) {
    collect(row?.author, row?.author_display_name ?? row?.authorDisplayName);
    collect(row?.submitter, row?.submitter_display_name ?? row?.submitterDisplayName);
    collect(
      row?.wr_account_id ?? row?.wrAccountId,
      looksLikeAccountId(row?.wr_holder ?? row?.wrHolder) ? "" : (row?.wr_holder ?? row?.wrHolder)
    );
  }
  rememberResolvedDisplayNames(namesByAccountId);
}

export function clearDisplayNameRefresh({ reset = true } = {}) {
  clearDisplayNameRefreshState(state.displayNameRefresh, { reset });
}

export function queuePriorityDisplayNameLookups(accountIds = []) {
  const pendingAccountIds = uniqueList(accountIds)
    .map((accountId) =>
      String(accountId || "")
        .trim()
        .toLowerCase()
    )
    .filter((accountId) => looksLikeAccountId(accountId));
  if (!pendingAccountIds.length) return Promise.resolve(null);
  return postJson("/api/v1/public/display-names/queue", {
    accountIds: pendingAccountIds,
  }).catch(() => null);
}

export function resolvePriorityDisplayNames(accountIds = []) {
  const pendingAccountIds = uniqueList(accountIds)
    .map((accountId) =>
      String(accountId || "")
        .trim()
        .toLowerCase()
    )
    .filter((accountId) => looksLikeAccountId(accountId));
  if (!pendingAccountIds.length) return Promise.resolve({});
  const cachedNamesByAccountId = getCachedDisplayNamesForAccountIds(pendingAccountIds);
  const missingAccountIds = pendingAccountIds.filter((accountId) => !cachedNamesByAccountId[accountId]);
  if (!missingAccountIds.length) return Promise.resolve(cachedNamesByAccountId);

  return postJson("/api/v1/public/display-names/resolve", {
    accountIds: missingAccountIds,
  })
    .then((payload) => {
      const resolvedNamesByAccountId =
        payload?.namesByAccountId && typeof payload.namesByAccountId === "object" ? payload.namesByAccountId : {};
      const remembered = rememberResolvedDisplayNames(resolvedNamesByAccountId);
      return {
        ...cachedNamesByAccountId,
        ...remembered,
      };
    })
    .catch(() => cachedNamesByAccountId);
}

function getResolvedDisplayName(namesByAccountId = {}, accountId = "") {
  const id = String(accountId || "")
    .trim()
    .toLowerCase();
  if (!looksLikeAccountId(id)) return "";
  const displayName = namesByAccountId?.[id] ?? namesByAccountId?.[String(accountId || "").trim()] ?? "";
  return isUsableDisplayName(displayName, id) ? String(displayName).trim() : "";
}

export function applyResolvedDisplayNamesToMap(map, namesByAccountId = {}) {
  if (!map || !namesByAccountId || typeof namesByAccountId !== "object") {
    return { map, changed: false };
  }
  const next = { ...map };
  let changed = false;
  const apply = (accountKeys, snakeDisplayKey, camelDisplayKey) => {
    const accountId = String(firstMapValue(next, accountKeys, "") || "")
      .trim()
      .toLowerCase();
    const displayName = getResolvedDisplayName(namesByAccountId, accountId);
    if (!displayName) return;
    if (next[snakeDisplayKey] !== displayName || next[camelDisplayKey] !== displayName) {
      changed = true;
    }
    next[snakeDisplayKey] = displayName;
    next[camelDisplayKey] = displayName;
  };

  apply(["author"], "author_display_name", "authorDisplayName");
  apply(["submitter"], "submitter_display_name", "submitterDisplayName");
  const wrAccountId =
    String(firstMapValue(next, ["wr_account_id", "wrAccountId"], "") || "")
      .trim()
      .toLowerCase() ||
    String(firstMapValue(next, ["wr_holder", "wrHolder"], "") || "")
      .trim()
      .toLowerCase();
  const wrDisplayName = getResolvedDisplayName(namesByAccountId, wrAccountId);
  if (wrDisplayName) {
    if (next.wr_holder !== wrDisplayName || next.wrHolder !== wrDisplayName) {
      changed = true;
    }
    next.wr_holder = wrDisplayName;
    next.wrHolder = wrDisplayName;
    if (!next.wr_account_id) next.wr_account_id = wrAccountId;
    if (!next.wrAccountId) next.wrAccountId = wrAccountId;
  }
  return { map: changed ? next : map, changed };
}

export function applyResolvedDisplayNamesToState(namesByAccountId = {}) {
  let changed = false;
  state.maps = state.maps.map((map) => {
    const result = applyResolvedDisplayNamesToMap(map, namesByAccountId);
    if (result.changed) changed = true;
    return result.map;
  });
  return changed;
}

export function applyCachedDisplayNamesToState() {
  const accountIds = collectPendingDisplayNameAccountIds(state.maps);
  if (!accountIds.length) return false;
  return applyResolvedDisplayNamesToState(getCachedDisplayNamesForAccountIds(accountIds));
}

export function applyCachedDisplayNamesToMap(map) {
  const accountIds = collectPendingDisplayNameAccountIds(map ? [map] : []);
  if (!accountIds.length) return { map, changed: false };
  return applyResolvedDisplayNamesToMap(map, getCachedDisplayNamesForAccountIds(accountIds));
}

export function mergePublicMapDetailIntoState(map) {
  const uid = getMapUidValue(map).toLowerCase();
  if (!uid) return false;
  const index = state.maps.findIndex((item) => getMapUidValue(item).toLowerCase() === uid);
  if (index < 0) return false;

  const patch = { map_uid: getMapUidValue(map) };
  const put = (key, value) => {
    if (value === undefined || value === null) return;
    if (typeof value === "string" && !value.trim()) return;
    patch[key] = value;
  };

  put("name", firstMapValue(map, ["name"], ""));
  put("thumbnail_url", firstMapValue(map, ["thumbnail_url", "thumbnailUrl"], ""));
  put("author", firstMapValue(map, ["author"], ""));
  put("author_display_name", firstMapValue(map, ["author_display_name", "authorDisplayName"], ""));
  put("author_saved_display_name", firstMapValue(map, ["author_saved_display_name", "authorSavedDisplayName"], ""));
  put("submitter", firstMapValue(map, ["submitter"], ""));
  put("submitter_display_name", firstMapValue(map, ["submitter_display_name", "submitterDisplayName"], ""));
  put(
    "submitter_saved_display_name",
    firstMapValue(map, ["submitter_saved_display_name", "submitterSavedDisplayName"], "")
  );
  put("author_time", numberMapValue(map, ["author_time", "authorTime", "authorScore"]));
  put("gold_time", numberMapValue(map, ["gold_time", "goldTime", "goldScore"]));
  put("silver_time", numberMapValue(map, ["silver_time", "silverTime", "silverScore"]));
  put("bronze_time", numberMapValue(map, ["bronze_time", "bronzeTime", "bronzeScore"]));
  put("wr_ms", numberMapValue(map, ["wr_ms", "wrMs"]));
  put("wr_holder", firstMapValue(map, ["wr_holder", "wrHolder"], ""));
  put("wr_updated_at", firstMapValue(map, ["wr_updated_at", "wrUpdatedAt"], ""));
  put("campaign_name", firstMapValue(map, ["campaign_name", "campaignName"], ""));
  put("season_label", firstMapValue(map, ["season_label", "seasonLabel", "season"], ""));
  put("alteration", firstMapValue(map, ["alteration"], ""));
  put("map_number", getMapNumberLabel(map) === "\u2014" ? "" : getMapNumberLabel(map));
  put("change_count", getChangeCountValue(map));
  put("tracking_status", firstMapValue(map, ["tracking_status", "trackingStatus", "status"], ""));

  state.maps[index] = {
    ...state.maps[index],
    ...patch,
  };
  return true;
}
