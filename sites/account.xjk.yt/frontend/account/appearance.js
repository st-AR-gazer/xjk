import "/shared/xjk-core/safe-html.js?v=2";
import { escapeAttribute, escapeHtml } from "/shared/xjk-core/dom-utils.js";

const DEFAULT_PREFERENCES = Object.freeze({
  appearance: {
    accent: "white",
    density: "comfortable",
    motion: "full",
  },
  updatedAt: null,
});

const ACCENT_OPTIONS = Object.freeze([
  { id: "white", label: "White", color: "#e5e7eb" },
  { id: "lime", label: "Lime", color: "#84cc16" },
  { id: "cyan", label: "Blue", color: "#38bdf8" },
  { id: "teal", label: "Cyan", color: "#22d3ee" },
  { id: "red", label: "Red", color: "#ef4444" },
  { id: "orange", label: "Orange", color: "#fb923c" },
  { id: "purple", label: "Violet", color: "#c4b5fd" },
]);
const DENSITY_OPTIONS = Object.freeze([
  { id: "comfortable", label: "Comfortable" },
  { id: "spacious", label: "Balanced" },
  { id: "compact", label: "Compact" },
]);
const MOTION_OPTIONS = Object.freeze([
  { id: "full", label: "On" },
  { id: "reduced", label: "Reduced" },
  { id: "off", label: "Off" },
]);

function cloneDefaults() {
  return JSON.parse(JSON.stringify(DEFAULT_PREFERENCES));
}

function normalizePreferences(input = {}) {
  const source = input && typeof input === "object" ? input : {};
  const appearance = source.appearance && typeof source.appearance === "object" ? source.appearance : source;
  const rawAccent = String(appearance.accent || "").trim();
  const accentId = rawAccent === "amber" ? "orange" : rawAccent;
  const accent = ACCENT_OPTIONS.some((item) => item.id === accentId) ? accentId : DEFAULT_PREFERENCES.appearance.accent;
  const density = DENSITY_OPTIONS.some((item) => item.id === appearance.density)
    ? appearance.density
    : DEFAULT_PREFERENCES.appearance.density;
  const motion = MOTION_OPTIONS.some((item) => item.id === appearance.motion)
    ? appearance.motion
    : DEFAULT_PREFERENCES.appearance.motion;
  return {
    ...cloneDefaults(),
    ...source,
    appearance: { accent, density, motion },
    updatedAt: source.updatedAt || null,
  };
}

function createAppearanceFeature({ state, elements, isAuthenticated, render }) {
  function applyAppearance() {
    const appearance = normalizePreferences(state.preferences).appearance;
    document.documentElement.dataset.accent = appearance.accent;
    document.documentElement.dataset.density = appearance.density;
    document.documentElement.dataset.motion = appearance.motion;
    elements.appearanceAccent.value = appearance.accent;
    elements.appearanceDensity.value = appearance.density;
    elements.appearanceMotion.value = appearance.motion;
  }

  function renderAppearanceControls() {
    const appearance = normalizePreferences(state.preferences).appearance;
    const selectedAccent = ACCENT_OPTIONS.find((item) => item.id === appearance.accent) || ACCENT_OPTIONS[0];
    const selectedDensity = DENSITY_OPTIONS.find((item) => item.id === appearance.density) || DENSITY_OPTIONS[0];
    const selectedMotion = MOTION_OPTIONS.find((item) => item.id === appearance.motion) || MOTION_OPTIONS[0];

    elements.accentReadout.textContent = selectedAccent.label;
    elements.densityReadout.textContent = selectedDensity.label;
    elements.motionReadout.textContent = selectedMotion.label;

    globalThis.XjkSafeHtml.set(
      elements.accentSwatches,
      ACCENT_OPTIONS.map(
        (item) => `
      <button class="swatch${item.id === appearance.accent ? " is-active" : ""}" type="button" data-accent-value="${escapeAttribute(item.id)}" role="radio" aria-checked="${item.id === appearance.accent ? "true" : "false"}" title="${escapeAttribute(item.label)}" style="--swatch-color:${escapeAttribute(item.color)}">
        <span class="sr-only">${escapeHtml(item.label)}</span>
      </button>
    `
      ).join("")
    );
    globalThis.XjkSafeHtml.set(
      elements.densitySegments,
      DENSITY_OPTIONS.map(
        (item) =>
          `<button class="segment${item.id === appearance.density ? " is-active" : ""}" type="button" data-density-value="${escapeAttribute(item.id)}">${escapeHtml(item.label)}</button>`
      ).join("")
    );
    globalThis.XjkSafeHtml.set(
      elements.motionSegments,
      MOTION_OPTIONS.map(
        (item) =>
          `<button class="segment${item.id === appearance.motion ? " is-active" : ""}" type="button" data-motion-value="${escapeAttribute(item.id)}">${escapeHtml(item.label)}</button>`
      ).join("")
    );
    if (elements.appearancePreviewTitle) {
      elements.appearancePreviewTitle.textContent = `${selectedAccent.label} route`;
    }
    if (elements.appearancePreviewMeta) {
      elements.appearancePreviewMeta.textContent = `${selectedDensity.label} / ${selectedMotion.label}`;
    }
    if (elements.appearanceActiveValue) {
      elements.appearanceActiveValue.textContent = `${selectedAccent.label} / ${selectedDensity.label} / ${selectedMotion.label}`;
    }

    elements.accentSwatches.querySelectorAll("[data-accent-value]").forEach((button) => {
      button.addEventListener("click", () => {
        elements.appearanceAccent.value = button.dataset.accentValue;
        updateDraftFromControls();
      });
    });
    elements.densitySegments.querySelectorAll("[data-density-value]").forEach((button) => {
      button.addEventListener("click", () => {
        elements.appearanceDensity.value = button.dataset.densityValue;
        updateDraftFromControls();
      });
    });
    elements.motionSegments.querySelectorAll("[data-motion-value]").forEach((button) => {
      button.addEventListener("click", () => {
        elements.appearanceMotion.value = button.dataset.motionValue;
        updateDraftFromControls();
      });
    });
  }

  async function saveAppearance() {
    if (!isAuthenticated()) return;
    const response = await fetch("/api/v1/account/preferences", {
      method: "PUT",
      credentials: "same-origin",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ preferences: normalizePreferences(state.preferences) }),
    });
    const payload = await response.json();
    if (!response.ok || !payload?.ok) throw new Error(payload?.error || "Unable to save preferences.");
    state.preferences = normalizePreferences(payload.preferences || DEFAULT_PREFERENCES);
    state.dirty = false;
    render();
  }

  async function clearSavedAppearance() {
    if (!isAuthenticated()) {
      state.preferences = cloneDefaults();
      state.dirty = false;
      render();
      return;
    }
    const response = await fetch("/api/v1/account/preferences", {
      method: "DELETE",
      credentials: "same-origin",
    });
    const payload = await response.json();
    if (!response.ok || !payload?.ok) throw new Error(payload?.error || "Unable to clear saved preferences.");
    state.preferences = normalizePreferences(payload.preferences || DEFAULT_PREFERENCES);
    state.dirty = false;
    render();
  }

  function updateDraftFromControls() {
    state.preferences = normalizePreferences({
      appearance: {
        accent: elements.appearanceAccent.value,
        density: elements.appearanceDensity.value,
        motion: elements.appearanceMotion.value,
      },
      updatedAt: state.preferences.updatedAt || null,
    });
    state.dirty = true;
    render();
  }

  function bindEvents() {
    elements.clearPreferencesButton?.addEventListener("click", () => {
      clearSavedAppearance().catch((error) => {
        elements.appearanceHint.textContent = error?.message || "Unable to clear saved appearance.";
      });
    });
    elements.saveAppearanceButton.addEventListener("click", () => {
      saveAppearance().catch((error) => {
        elements.appearanceHint.textContent = error?.message || "Unable to save appearance preferences.";
      });
    });
    elements.resetAppearanceButton.addEventListener("click", () => {
      state.preferences = cloneDefaults();
      state.dirty = true;
      render();
    });
    elements.appearanceAccent.addEventListener("change", updateDraftFromControls);
    elements.appearanceDensity.addEventListener("change", updateDraftFromControls);
    elements.appearanceMotion.addEventListener("change", updateDraftFromControls);
  }

  return {
    applyAppearance,
    bindEvents,
    clear: clearSavedAppearance,
    renderAppearanceControls,
    save: saveAppearance,
  };
}

export { cloneDefaults, createAppearanceFeature, normalizePreferences };
