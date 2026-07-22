import { MAP_PAGE_SIZE_OPTIONS, DEFAULT_MAP_VIEW } from "./constants.js";
import { requestJson, validateLookupValue } from "./api.js";
import { elements } from "./dom.js";
import {
  absoluteUrlForPath,
  buildMapPath,
  buildRecordPath,
  navigateToMap,
  navigateToRecord,
  normalizeMapRouteState,
} from "./routes.js";
import { renderMapMessage, renderMapResult, renderRecordMessage, renderRecordResult } from "./renderers.js";
import { renderRecentHistoryPanel } from "./product-panels.js";
import { rememberRecentEntry } from "./recent-history.js";
import { state } from "./state.js";
import { resetMessages, setError, setStatus } from "./ui.js";
import { createDefaultVerification, verificationMap } from "./verifications.js";
import { activateWorkspace } from "./workspace.js";

function openMapFromRecord(mapUid) {
  activateWorkspace("map");
  elements.mapInput.value = mapUid || "";
  void loadMap(mapUid || "", { updateHistory: true });
}

function openRecordFromMap(recordId) {
  activateWorkspace("record");
  elements.recordInput.value = recordId || "";
  void loadRecord(recordId || "", { updateHistory: true });
}

function fallbackBundleFromMapItem(item) {
  return {
    record_id: item.record_id,
    map_uid: item.map_uid,
    rank: item.rank,
    updated_at: item.updated_at,
    verifications: Array.isArray(item.verifications) ? item.verifications : [createDefaultVerification("replay")],
  };
}

function rememberRecord(bundle) {
  rememberRecentEntry({
    type: "record",
    label: bundle.record_id,
    href: buildRecordPath(bundle.record_id),
    meta: bundle.map_uid ? `Map ${bundle.map_uid}` : "Record detail",
    summary: `${verificationMap(bundle.verifications).replay.status} / ${verificationMap(bundle.verifications).deep.status}`,
  });
  renderRecentHistoryPanel();
}

function rememberMap(viewData) {
  rememberRecentEntry({
    type: "map",
    label: viewData.map_uid,
    href: buildMapPath(viewData.map_uid, viewData),
    meta: viewData.track === "replay" ? "Replay coverage" : "Deep coverage",
    summary: `${viewData.filteredCount} visible of ${viewData.totalCount}`,
  });
  renderRecentHistoryPanel();
}

function normalizePageSize(value) {
  const parsed = Number(value);
  return MAP_PAGE_SIZE_OPTIONS.includes(parsed) ? parsed : DEFAULT_MAP_VIEW.pageSize;
}

function setMapViewState(patch = {}) {
  state.mapView = {
    ...state.mapView,
    ...normalizeMapRouteState({
      ...state.mapView,
      ...patch,
      pageSize: patch.pageSize ?? state.mapView.pageSize,
    }),
    mapUid: patch.mapUid ?? state.mapView.mapUid,
    primaryData: patch.primaryData ?? state.mapView.primaryData,
    bundles: patch.bundles ?? state.mapView.bundles,
  };
  return state.mapView;
}

function syncMapFormToState() {
  elements.mapTrackSelect.value = state.mapView.track || DEFAULT_MAP_VIEW.track;
}

function copyShareUrl(pathname, message) {
  const absoluteUrl = absoluteUrlForPath(pathname);
  if (navigator.clipboard?.writeText) {
    navigator.clipboard.writeText(absoluteUrl).then(
      () => setStatus(message),
      () => setStatus(absoluteUrl)
    );
    return;
  }

  setStatus(absoluteUrl);
}

function renderCurrentMapView() {
  const mapUid = String(state.mapView.mapUid || "").trim();
  if (!mapUid) {
    return;
  }
  const primary = state.mapView.primaryData || {};
  const visibleItems =
    Array.isArray(state.mapView.bundles) && state.mapView.bundles.length
      ? state.mapView.bundles
      : Array.isArray(primary.items)
        ? primary.items
        : [];
  const viewData = {
    map_uid: mapUid,
    track: state.mapView.track,
    sort: state.mapView.sort,
    status: state.mapView.status,
    page: Number(primary.page || state.mapView.page || 1),
    pageCount: Number(primary.page_count || 1),
    pageSize: Number(primary.limit || state.mapView.pageSize || DEFAULT_MAP_VIEW.pageSize),
    totalCount: Number(primary.total_items || visibleItems.length),
    filteredCount: Number(primary.filtered_items || visibleItems.length),
    latestUpdate: primary.latest_update || null,
    counts: primary.counts || {
      pass: 0,
      fail: 0,
      pending: 0,
      unavailable: 0,
      not_run: 0,
    },
    items: visibleItems,
    apiHref:
      `/api/v1/maps/${encodeURIComponent(mapUid)}/verdicts` +
      `?track=${encodeURIComponent(state.mapView.track)}` +
      `&limit=${encodeURIComponent(String(state.mapView.pageSize))}` +
      `&page=${encodeURIComponent(String(state.mapView.page))}` +
      `&sort=${encodeURIComponent(state.mapView.sort)}` +
      `&status=${encodeURIComponent(state.mapView.status)}`,
  };

  syncMapFormToState();
  renderMapResult(viewData, {
    onOpenRecord: openRecordFromMap,
    onTrackChange: (track) => {
      void loadMap(mapUid, {
        updateHistory: true,
        replaceHistory: true,
        mapView: {
          ...state.mapView,
          track,
          page: 1,
        },
      });
    },
    onViewChange: (patch) => {
      const nextView = {
        ...state.mapView,
        ...patch,
        pageSize: patch.pageSize ? normalizePageSize(patch.pageSize) : state.mapView.pageSize,
      };
      void loadMap(mapUid, {
        updateHistory: true,
        replaceHistory: true,
        mapView: nextView,
      });
    },
    onCopyLink: () => {
      copyShareUrl(buildMapPath(mapUid, state.mapView), "Map view link copied.");
    },
  });

  rememberMap(viewData);
}

export function seedMapViewState(rawMapView = {}) {
  setMapViewState(normalizeMapRouteState(rawMapView));
  syncMapFormToState();
}

export async function loadRecord(recordId, options = {}) {
  try {
    activateWorkspace("record");
    resetMessages();

    const value = validateLookupValue(recordId, "Record ID");
    if (options.updateHistory !== false) {
      navigateToRecord(value, { replace: Boolean(options.replaceHistory) });
    }

    const bundle = await requestJson(`/api/v1/records/${encodeURIComponent(value)}`, "Loading record data...");

    elements.recordInput.value = value;
    elements.submissionRecordIdInput.value = value;

    if (bundle.map_uid) {
      elements.mapInput.value = bundle.map_uid;
      elements.submissionMapUidInput.value = bundle.map_uid;
    }

    renderRecordResult(bundle, {
      onOpenMap: openMapFromRecord,
      onCopyLink: (currentBundle) => {
        copyShareUrl(buildRecordPath(currentBundle.record_id), "Record link copied.");
      },
    });
    rememberRecord(bundle);
    setStatus("Record verification loaded.");
  } catch (error) {
    if (error.name === "AbortError") {
      return;
    }

    renderRecordMessage(elements.recordResult, "Record lookup", recordId, error?.message || "Record lookup failed.");
    setError(error?.message || "Record lookup failed.");
  }
}

export async function loadMap(mapUid, options = {}) {
  try {
    activateWorkspace("map");
    resetMessages();

    const value = validateLookupValue(mapUid, "Map UID");
    const nextMapView = normalizeMapRouteState({
      ...state.mapView,
      track: elements.mapTrackSelect.value,
      ...options.mapView,
    });
    const limit = normalizePageSize(nextMapView.pageSize);

    if (options.updateHistory !== false) {
      navigateToMap(value, { ...nextMapView, pageSize: limit }, { replace: Boolean(options.replaceHistory) });
    }

    const primaryMapData = await requestJson(
      `/api/v1/maps/${encodeURIComponent(value)}/verdicts` +
        `?track=${encodeURIComponent(nextMapView.track)}` +
        `&limit=${encodeURIComponent(String(limit))}` +
        `&page=${encodeURIComponent(String(nextMapView.page))}` +
        `&sort=${encodeURIComponent(nextMapView.sort)}` +
        `&status=${encodeURIComponent(nextMapView.status)}`,
      "Loading map data..."
    );

    elements.mapInput.value = value;
    elements.submissionMapUidInput.value = value;

    let bundles = [];
    const recordIds = (primaryMapData.items || []).map((item) => item.record_id).filter(Boolean);

    if (recordIds.length) {
      try {
        const batchData = await requestJson("/api/v1/verdicts/batch", "Loading record details...", {
          method: "POST",
          body: {
            record_ids: recordIds,
            track: "all",
          },
        });

        const byRecordId = new Map((batchData.records || []).map((bundle) => [bundle.record_id, bundle]));

        bundles = (primaryMapData.items || []).map(
          (item) => byRecordId.get(item.record_id) || fallbackBundleFromMapItem(item)
        );
      } catch {
        bundles = (primaryMapData.items || []).map(fallbackBundleFromMapItem);
      }
    }

    setMapViewState({
      ...nextMapView,
      page: Number(primaryMapData.page || nextMapView.page || 1),
      pageSize: limit,
      mapUid: value,
      primaryData: primaryMapData,
      bundles,
    });
    renderCurrentMapView({ replaceHistory: true });
    setStatus("Map verification loaded.");
  } catch (error) {
    if (error.name === "AbortError") {
      return;
    }

    renderMapMessage(mapUid, "Map lookup unavailable.", error?.message || "Map lookup failed.");
    setError(error?.message || "Map lookup failed.");
  }
}
