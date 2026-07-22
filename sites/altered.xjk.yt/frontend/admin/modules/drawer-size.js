import { DEFAULT_DRAWER_WIDTH, DRAWER_WIDTH_KEY, MAX_DRAWER_WIDTH, MIN_DRAWER_WIDTH } from "./constants.js?v=2";
import { el, state } from "./state.js?v=2";

export function clampDrawerWidth(value) {
  const viewportMax = Math.max(MIN_DRAWER_WIDTH, Math.min(MAX_DRAWER_WIDTH, window.innerWidth - 24));
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return Math.min(DEFAULT_DRAWER_WIDTH, viewportMax);
  return Math.max(MIN_DRAWER_WIDTH, Math.min(viewportMax, Math.round(parsed)));
}

export function loadStoredDrawerWidth() {
  try {
    return clampDrawerWidth(window.localStorage.getItem(DRAWER_WIDTH_KEY));
  } catch {
    return clampDrawerWidth(DEFAULT_DRAWER_WIDTH);
  }
}

export function saveDrawerWidth(width) {
  try {
    window.localStorage.setItem(DRAWER_WIDTH_KEY, String(clampDrawerWidth(width)));
  } catch {}
}

export function startDrawerResize(event) {
  if (!state.drawer.open || window.innerWidth <= 1040) return;
  event.preventDefault();
  const rect = el.drawer?.getBoundingClientRect();
  state.drawerUi.resize = {
    startX: event.clientX,
    startWidth: rect?.width || state.drawerUi.width || DEFAULT_DRAWER_WIDTH,
  };
  el.drawer?.classList.add("drawer--resizing");
  document.body.style.userSelect = "none";
}

export function onPointerMove(event) {
  const resize = state.drawerUi.resize;
  if (!resize) return;
  const delta = resize.startX - event.clientX;
  state.drawerUi.width = clampDrawerWidth(resize.startWidth + delta);
  el.drawer?.style.setProperty("--drawer-width", `${state.drawerUi.width}px`);
}

export function stopDrawerResize() {
  if (!state.drawerUi.resize) return;
  state.drawerUi.resize = null;
  el.drawer?.classList.remove("drawer--resizing");
  document.body.style.userSelect = "";
  saveDrawerWidth(state.drawerUi.width);
}
