import { NAMING_DETAIL_DRAWER_WIDTH } from "./constants.js?v=2";
import { renderDrawer } from "./drawer.js?v=2";
import { clampDrawerWidth, saveDrawerWidth, stopDrawerResize } from "./drawer-size.js?v=2";
import { syncDrawerTabs } from "./drawer-tabs.js?v=2";
import { stripFmt } from "./formatters.js?v=2";
import { syncNamingSimilaritySearch } from "./similarity-search.js?v=2";
import { el, state } from "./state.js?v=2";

export function refreshDrawer() {
  renderDrawer();
  syncDrawerTabs();
  syncNamingSimilaritySearch();
}

export function openDrawer(drawer = {}) {
  const { activeTab = "", drawerTab = "", width = null, drawerWidth = null, ...drawerState } = drawer || {};
  const requestedWidth = Number(width ?? drawerWidth);
  if (Number.isFinite(requestedWidth) && requestedWidth > 0) {
    state.drawerUi.width = clampDrawerWidth(requestedWidth);
    el.drawer?.style.setProperty("--drawer-width", `${state.drawerUi.width}px`);
    saveDrawerWidth(state.drawerUi.width);
  }
  state.drawer = { open: true, ...drawerState };
  state.drawerUi.activeTab = String(activeTab || drawerTab || "overview").trim() || "overview";
  refreshDrawer();
}

export function closeDrawer() {
  stopDrawerResize();
  state.drawerUi.namingSimilaritySearch = "";
  state.drawerUi.namingSimilarityPage = 1;
  state.drawer = { open: false, type: null, title: "", subtitle: "", kicker: "Detail", payload: null };
  refreshDrawer();
}

export function openNamingDetailDrawer(payload, { activeTab = "similarity", width = NAMING_DETAIL_DRAWER_WIDTH } = {}) {
  const mapUid = String(payload?.map?.mapUid || payload?.map?.uid || "").trim();
  const currentMapUid =
    state.drawer?.type === "naming-detail"
      ? String(state.drawer?.payload?.map?.mapUid || state.drawer?.payload?.map?.uid || "").trim()
      : "";
  if (mapUid !== currentMapUid) {
    state.drawerUi.namingSimilaritySearch = "";
    state.drawerUi.namingSimilarityPage = 1;
  }
  openDrawer({
    type: "naming-detail",
    kicker: "Naming Detail",
    title: stripFmt(payload?.map?.name || mapUid),
    subtitle: mapUid,
    payload,
    activeTab,
    width,
  });
}
