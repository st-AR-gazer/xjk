import { getJson } from "./api-client.js?v=2";
import { scheduleDisplayNameRefresh } from "../../shared/display-name-refresh.js?v=2";
import { API, DISPLAY_NAME_REFRESH_DELAYS_MS } from "./config.js?v=2";
import { $modalBackdrop } from "./elements.js?v=2";
import { state } from "./state.js?v=2";
import {
  applyResolvedDisplayNamesToMap,
  applyResolvedDisplayNamesToState,
  clearDisplayNameRefresh,
  collectPendingDisplayNameAccountIds,
  getCachedDisplayNamesForAccountIds,
  mergePublicMapDetailIntoState,
  queuePriorityDisplayNameLookups,
  rememberMapDisplayNames,
  resolvePriorityDisplayNames,
} from "./display-names.js?v=2";
import { getMapUidValue } from "./map-model.js?v=2";
import { renderMapModal, renderPage } from "./map-view.js?v=2";
import { uniqueList } from "./query.js?v=2";
import { looksLikeAccountId } from "./formatters.js?v=2";

export function schedulePendingDisplayNameRefresh(accountIds = []) {
  const pendingAccountIds = uniqueList(accountIds)
    .map((accountId) =>
      String(accountId || "")
        .trim()
        .toLowerCase()
    )
    .filter((accountId) => looksLikeAccountId(accountId));
  scheduleDisplayNameRefresh({
    state: state.displayNameRefresh,
    accountIds: pendingAccountIds,
    delaysMs: DISPLAY_NAME_REFRESH_DELAYS_MS,
    onAccountIdsChanged: (ids) => void queuePriorityDisplayNameLookups(ids),
    onRefresh: () => {
      if (state.activeModalMapUid) {
        refreshOpenMapDisplayNames().catch(() => {});
        return;
      }
      refreshVisibleMapDisplayNames().catch(() => {});
    },
  });
}

export async function refreshOpenMapDisplayNames() {
  const mapUid = String(state.activeModalMapUid || "").trim();
  if (!mapUid) {
    await refreshVisibleMapDisplayNames();
    return;
  }

  const currentMap =
    state.activeModalDetail ||
    state.maps.find((item) => getMapUidValue(item).toLowerCase() === mapUid.toLowerCase()) ||
    null;
  const pendingBefore = collectPendingDisplayNameAccountIds(currentMap ? [currentMap] : []);
  const namesByAccountId = await resolvePriorityDisplayNames(
    pendingBefore.length ? pendingBefore : state.displayNameRefresh.key.split(",")
  );
  const stateNamesChanged = applyResolvedDisplayNamesToState(namesByAccountId);
  const resolvedCurrent = applyResolvedDisplayNamesToMap(currentMap, namesByAccountId);
  if (resolvedCurrent?.changed) {
    state.activeModalDetail = resolvedCurrent.map;
  }
  if (stateNamesChanged || resolvedCurrent?.changed) {
    renderPage();
  }
  if (resolvedCurrent?.map && $modalBackdrop && !$modalBackdrop.hidden) {
    renderMapModal(resolvedCurrent.map, { updateUrl: false, mapUid });
  }

  let payload = null;
  try {
    payload = await getJson(`${API.mapDetail}/${encodeURIComponent(mapUid)}`);
  } catch {
    const remainingAccountIds = collectPendingDisplayNameAccountIds(
      resolvedCurrent?.map ? [resolvedCurrent.map] : currentMap ? [currentMap] : []
    );
    if (remainingAccountIds.length) {
      schedulePendingDisplayNameRefresh(remainingAccountIds);
      return;
    }
    clearDisplayNameRefresh({ reset: true });
    return;
  }
  rememberMapDisplayNames(payload?.map ? [payload.map] : []);
  const resolved = applyResolvedDisplayNamesToMap(payload?.map, {
    ...getCachedDisplayNamesForAccountIds(collectPendingDisplayNameAccountIds(payload?.map ? [payload.map] : [])),
    ...namesByAccountId,
  });
  const map = resolved.map;
  if (!map) return;

  state.activeModalDetail = map;
  const mergedIntoList = mergePublicMapDetailIntoState(map);
  if (mergedIntoList || stateNamesChanged || resolvedCurrent?.changed) renderPage();
  if ($modalBackdrop && !$modalBackdrop.hidden) {
    renderMapModal(map, { updateUrl: false, mapUid });
  }

  const pendingAccountIds = collectPendingDisplayNameAccountIds([map]);
  if (pendingAccountIds.length) {
    schedulePendingDisplayNameRefresh(pendingAccountIds);
    return;
  }
  clearDisplayNameRefresh({ reset: true });
}

export async function refreshVisibleMapDisplayNames() {
  const pendingAccountIds = collectPendingDisplayNameAccountIds(state.maps);
  if (!pendingAccountIds.length) {
    clearDisplayNameRefresh({ reset: true });
    return;
  }

  const namesByAccountId = await resolvePriorityDisplayNames(pendingAccountIds);
  if (applyResolvedDisplayNamesToState(namesByAccountId)) {
    renderPage();
  }

  const remainingAccountIds = collectPendingDisplayNameAccountIds(state.maps);
  if (remainingAccountIds.length) {
    schedulePendingDisplayNameRefresh(remainingAccountIds);
    return;
  }
  clearDisplayNameRefresh({ reset: true });
}
