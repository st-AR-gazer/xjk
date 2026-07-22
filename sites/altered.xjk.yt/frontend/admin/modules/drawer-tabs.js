import { el, state } from "./state.js?v=2";

export function syncDrawerTabs() {
  const buttons = el.drawerBody?.querySelectorAll("[data-drawer-tab]");
  const panels = el.drawerBody?.querySelectorAll("[data-drawer-tab-panel]");
  if (!buttons?.length || !panels?.length) return;
  const availableTabs = Array.from(buttons)
    .map((button) => String(button.getAttribute("data-drawer-tab") || "").trim())
    .filter(Boolean);
  const requestedTab = String(state.drawerUi.activeTab || "").trim();
  const active =
    (requestedTab && availableTabs.includes(requestedTab) ? requestedTab : "") || availableTabs[0] || "overview";
  state.drawerUi.activeTab = active;
  buttons.forEach((button) => {
    const isActive = button.getAttribute("data-drawer-tab") === active;
    button.classList.toggle("drawer-tabbtn--active", isActive);
    button.setAttribute("aria-selected", isActive ? "true" : "false");
  });
  panels.forEach((panel) => {
    panel.hidden = panel.getAttribute("data-drawer-tab-panel") !== active;
  });
}
