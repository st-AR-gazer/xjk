import { readJson, readText, unique, writeJson, writeText } from "./utils.js";

export const STORAGE_KEYS = {
  settings: "xjk.learn.settings",
  bookmarks: "xjk.learn.bookmarks",
  completed: "xjk.learn.completed",
  recent: "xjk.learn.recent",
  notes: "xjk.learn.notes",
};

const defaultSettings = {
  accent: "white",
  density: "comfortable",
  motion: "full",
  graphLabels: true,
  tendrilIntensity: 1.18,
  mapMode: "3d",
};

const listeners = new Set();

export const state = {
  manifest: null,
  activeSlug: "",
  activePage: null,
  activeAst: [],
  activeView: "learn",
  routeMode: "hash",
  authenticated: false,
  account: null,
  selectedCluster: "all",
  graphHover: null,
  bookmarks: readJson(STORAGE_KEYS.bookmarks, []),
  completed: readJson(STORAGE_KEYS.completed, []),
  recent: readJson(STORAGE_KEYS.recent, []),
  notes: readJson(STORAGE_KEYS.notes, {}),
  settings: {
    ...defaultSettings,
    ...readJson(STORAGE_KEYS.settings, {}),
  },
};

export function subscribe(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function getState() {
  return state;
}

export function setState(patch = {}) {
  Object.assign(state, patch);
  notify();
}

function writeAccountLocalState() {
  writeJson(STORAGE_KEYS.bookmarks, state.bookmarks);
  writeJson(STORAGE_KEYS.completed, state.completed);
  writeJson(STORAGE_KEYS.recent, state.recent);
  writeJson(STORAGE_KEYS.notes, state.notes);
}

export function applyAccountData(data = {}) {
  state.bookmarks = Array.isArray(data.bookmarks) ? data.bookmarks : state.bookmarks;
  state.completed = Array.isArray(data.completed) ? data.completed : state.completed;
  state.recent = Array.isArray(data.recent) ? data.recent : state.recent;
  state.notes = data.notes && typeof data.notes === "object" ? data.notes : state.notes;
  writeAccountLocalState();
  if (data.settings && typeof data.settings === "object") {
    applySettings({ ...state.settings, ...data.settings });
  } else {
    notify();
  }
}

export function accountDataSnapshot() {
  return {
    bookmarks: state.bookmarks,
    completed: state.completed,
    recent: state.recent,
    notes: state.notes,
    settings: state.settings,
  };
}

export function notify() {
  listeners.forEach((listener) => listener(state));
}

export function applySettings(settings = state.settings) {
  const next = { ...defaultSettings, ...settings };
  state.settings = next;
  document.documentElement.dataset.accent = next.accent;
  document.documentElement.dataset.density = next.density;
  document.documentElement.dataset.motion = next.motion;
  document.documentElement.style.setProperty("--learn-tendril-intensity", String(next.tendrilIntensity));
  writeJson(STORAGE_KEYS.settings, next);
  notify();
}

export function updateSetting(key, value) {
  const next = { ...state.settings, [key]: value };
  applySettings(next);
}

export function toggleBookmark(slug = state.activeSlug) {
  const exists = state.bookmarks.includes(slug);
  state.bookmarks = exists ? state.bookmarks.filter((item) => item !== slug) : unique([slug, ...state.bookmarks]);
  writeJson(STORAGE_KEYS.bookmarks, state.bookmarks);
  notify();
  return !exists;
}

export function setLessonNote(slug = state.activeSlug, text = "") {
  if (!slug) return null;
  const next = { ...state.notes };
  const value = String(text || "");
  if (value.trim()) {
    next[slug] = { text: value, updatedAt: new Date().toISOString() };
  } else {
    delete next[slug];
  }
  state.notes = next;
  writeJson(STORAGE_KEYS.notes, state.notes);
  notify();
  return state.notes[slug] || null;
}

export function toggleCompleted(slug = state.activeSlug) {
  const exists = state.completed.includes(slug);
  state.completed = exists ? state.completed.filter((item) => item !== slug) : unique([slug, ...state.completed]);
  writeJson(STORAGE_KEYS.completed, state.completed);
  notify();
  return !exists;
}

export function clearProgress() {
  state.completed = [];
  writeJson(STORAGE_KEYS.completed, state.completed);
  notify();
}

export function resetLocalState() {
  Object.values(STORAGE_KEYS).forEach((key) => {
    try {
      window.localStorage.removeItem(key);
    } catch {
      // Ignore locked storage.
    }
  });
  state.bookmarks = [];
  state.completed = [];
  state.recent = [];
  state.notes = {};
  state.settings = { ...defaultSettings };
  applySettings(state.settings);
}

export function addRecent(slug) {
  if (!slug) return;
  state.recent = unique([slug, ...state.recent]).slice(0, 8);
  writeJson(STORAGE_KEYS.recent, state.recent);
  notify();
}

export function getActiveSlugFallback() {
  return readText("xjk.learn.activeSlug", "");
}

export function setActiveSlug(slug) {
  state.activeSlug = slug;
  writeText("xjk.learn.activeSlug", slug);
  addRecent(slug);
}
