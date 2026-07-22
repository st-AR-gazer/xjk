import { ROUTE_SUB_TABS, TABS, state } from "./state.js?v=2";
import { clampInt } from "./formatters.js?v=2";
import { syncLogsServiceSelect } from "./logs.js?v=2";
import { appendOption, clearElement } from "./dom.js?v=2";

function normalizeTab(nextTab) {
  const tab = String(nextTab || "")
    .trim()
    .toLowerCase();
  return TABS.includes(tab) ? tab : "overview";
}

function normalizeRouteSubTab(nextSubtab) {
  const subtab = String(nextSubtab || "")
    .trim()
    .toLowerCase();
  return ROUTE_SUB_TABS.includes(subtab) ? subtab : "incoming";
}

function readHashParts() {
  return decodeURIComponent(String(window.location.hash || "").replace(/^#/, ""))
    .split(/[?&=]/)[0]
    .split("/")
    .map((part) => part.trim().toLowerCase())
    .filter(Boolean);
}

export function readTabFromUrl() {
  const hashTab = readHashParts()[0] || "";
  if (TABS.includes(hashTab)) return hashTab;

  const queryTab = new URLSearchParams(window.location.search).get("tab");
  return normalizeTab(queryTab);
}

export function readRouteSubTabFromUrl() {
  const hashParts = readHashParts();
  if (hashParts[0] === "routes" && ROUTE_SUB_TABS.includes(hashParts[1])) {
    return hashParts[1];
  }

  const query = new URLSearchParams(window.location.search);
  return normalizeRouteSubTab(query.get("route_subtab") || query.get("subtab"));
}

function writeTabToUrl(nextTab, { replace = false, routeSubTab = state.routeSubTab } = {}) {
  const tab = normalizeTab(nextTab);
  const url = new URL(window.location.href);
  url.searchParams.delete("tab");
  url.searchParams.delete("route_subtab");
  url.searchParams.delete("subtab");
  url.hash = tab === "routes" ? `${tab}/${normalizeRouteSubTab(routeSubTab)}` : tab;

  if (url.href === window.location.href) return;

  const statePayload = {
    ...(history.state && typeof history.state === "object" ? history.state : {}),
    dashTab: tab,
    dashRouteSubTab: tab === "routes" ? normalizeRouteSubTab(routeSubTab) : state.routeSubTab,
  };
  if (replace) {
    history.replaceState(statePayload, "", url);
  } else {
    history.pushState(statePayload, "", url);
  }
}

export function setActiveTab(nextTab, { updateUrl = true, replaceUrl = false } = {}) {
  const tab = normalizeTab(nextTab);
  state.activeTab = tab;

  document.querySelectorAll(".tab-nav .tab-btn").forEach((btn) => {
    const isActive = btn.dataset.tab === tab;
    btn.classList.toggle("is-active", isActive);
    btn.setAttribute("aria-selected", String(isActive));
  });

  TABS.forEach((t) => {
    const panelId = "tab" + t.charAt(0).toUpperCase() + t.slice(1);
    const panel = document.getElementById(panelId);
    if (panel) panel.hidden = t !== tab;
  });

  if (updateUrl) {
    writeTabToUrl(tab, { replace: replaceUrl, routeSubTab: state.routeSubTab });
  }
}

export function setActiveRouteSubTab(subtab, { updateUrl = true, replaceUrl = false } = {}) {
  const active = normalizeRouteSubTab(subtab);
  state.routeSubTab = active;

  document.querySelectorAll("#tabRoutes .sub-tab-btn").forEach((btn) => {
    btn.classList.toggle("is-active", btn.dataset.subtab === active);
  });

  ROUTE_SUB_TABS.forEach((s) => {
    const panelId = "routes" + s.charAt(0).toUpperCase() + s.slice(1);
    const panel = document.getElementById(panelId);
    if (panel) panel.hidden = s !== active;
  });

  if (updateUrl && state.activeTab === "routes") {
    writeTabToUrl("routes", { replace: replaceUrl, routeSubTab: active });
  }
}

export function syncControls() {
  document.getElementById("windowHours").value = String(state.filters.windowHours);

  const projectSelect = document.getElementById("projectKey");
  const selectedProject = state.filters.projectKey;
  clearElement(projectSelect);
  appendOption(projectSelect, "", "All projects");
  state.projects.forEach((project) => {
    appendOption(projectSelect, project.projectKey, project.projectName || project.projectKey);
  });
  projectSelect.value = [...projectSelect.options].some((option) => option.value === selectedProject)
    ? selectedProject
    : "";
  state.filters.projectKey = projectSelect.value;

  const serviceSelect = document.getElementById("serviceName");
  const selectedService = state.filters.service;
  clearElement(serviceSelect);
  appendOption(serviceSelect, "", "All services");
  state.services.forEach((service) => {
    appendOption(serviceSelect, service, service);
  });
  serviceSelect.value = [...serviceSelect.options].some((option) => option.value === selectedService)
    ? selectedService
    : "";
  state.filters.service = serviceSelect.value;

  const errorsSearch = document.getElementById("errorsSearch");
  if (errorsSearch && errorsSearch.value !== state.errors.q) {
    errorsSearch.value = state.errors.q;
  }
  const errorsDirection = document.getElementById("errorsDirection");
  if (errorsDirection) {
    errorsDirection.value = state.errors.direction || "";
  }

  syncLogsServiceSelect();
  const logsStream = document.getElementById("logsStream");
  if (logsStream) logsStream.value = state.logs.stream || "out";
  const logsLines = document.getElementById("logsLines");
  if (logsLines) logsLines.value = String(clampInt(state.logs.lines, { min: 10, max: 2000, fallback: 200 }));
  const logsFollowTail = document.getElementById("logsFollowTail");
  if (logsFollowTail) logsFollowTail.checked = Boolean(state.logs.followTail);
  const alteredCheckSearch = document.getElementById("alteredCheckSearch");
  if (alteredCheckSearch && alteredCheckSearch.value !== state.altered.checkQuery) {
    alteredCheckSearch.value = state.altered.checkQuery;
  }
}
