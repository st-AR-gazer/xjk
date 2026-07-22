import { elements } from "./dom.js";
import { applyXjkHomeHref, createWorkspaceSidebar } from "/shared/xjk-workspace/sidebar.js";

let activeWorkspace = "live";
let sidebarController = null;

function syncWorkspaceState(name) {
  activeWorkspace = name || "live";
  document.body.dataset.workspace = activeWorkspace;
}

export function activateWorkspace(name) {
  const next = name || "live";
  if (sidebarController) {
    sidebarController.activate(next);
    return;
  }

  syncWorkspaceState(next);
}

export function bindWorkspaceTabs() {
  applyXjkHomeHref(elements.sidebarHomeLink);
  sidebarController = createWorkspaceSidebar({
    buttons: elements.workspaceTabs,
    panels: elements.workspacePanels,
    defaultTarget: activeWorkspace,
    onChange: syncWorkspaceState,
  });
}

export function setWorkspaceHealth({ status, checkedAt }) {
  const normalized = String(status || "")
    .trim()
    .toLowerCase();
  const label = normalized === "ok" ? "Healthy" : normalized === "degraded" ? "Degraded" : "Offline";

  elements.statusLine.textContent = label;
  elements.statusLine.title = checkedAt ? `Checked ${checkedAt}` : label;
  elements.statusLine.dataset.tone = normalized === "ok" ? "success" : normalized === "degraded" ? "warning" : "error";
}

export function setWorkspaceHealthError() {
  elements.statusLine.textContent = "Offline";
  elements.statusLine.title = "Public service unavailable";
  elements.statusLine.dataset.tone = "error";
}

export function getActiveWorkspace() {
  return activeWorkspace;
}
