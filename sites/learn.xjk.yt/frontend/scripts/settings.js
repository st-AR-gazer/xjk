import "../../../shared/xjk-core/safe-html.js?v=2";
import { escapeHtml } from "./utils.js";
import { applySettings, getState, updateSetting } from "./state.js";

const DEFAULT_SETTINGS = {
  accent: "white",
  density: "comfortable",
  motion: "full",
  graphLabels: true,
  tendrilIntensity: 1.18,
};

export function applySettingsSideEffects(settings = getState().settings) {
  const root = document.documentElement;
  root.dataset.graphLabels = settings.graphLabels ? "on" : "off";
  root.style.setProperty("--learn-graph-label-opacity", settings.graphLabels ? "1" : "0");
  root.style.setProperty("--learn-tendril-intensity", String(settings.tendrilIntensity));
  window.dispatchEvent(new CustomEvent("learn:settingschange", { detail: { settings } }));
}

function selectSetting(label, key, description, value, options) {
  return `<div class="learn-setting-row">
    <div><strong>${escapeHtml(label)}</strong><p>${escapeHtml(description)}</p></div>
    <select class="learn-select" data-setting="${key}">
      ${options.map(([optionValue, optionLabel]) => `<option value="${optionValue}" ${optionValue === value ? "selected" : ""}>${escapeHtml(optionLabel)}</option>`).join("")}
    </select>
  </div>`;
}

export function renderSettingsView({ root, state, onSetting, showToast }) {
  const settings = state.settings;
  applySettingsSideEffects(settings);
  globalThis.XjkSafeHtml.set(
    root,
    `<div class="learn-workspace learn-single-workspace">
    <div class="learn-page-scaffold">
      <div class="learn-page-head">
        <div>
          <p class="learn-eyebrow">Settings</p>
          <h1 class="learn-page-title">Local settings</h1>
          <p class="learn-page-subtitle">These controls update the static app immediately and persist in namespaced localStorage.</p>
        </div>
        <div class="learn-card-actions">
          <button class="learn-button" data-settings-action="reset-settings" type="button">Reset settings</button>
          <button class="learn-button" data-action="reset-local-state" type="button">Reset local state</button>
        </div>
      </div>
      <section class="learn-panel">
        ${selectSetting(
          "Accent",
          "accent",
          "Keep the default monochrome look or add a restrained accent.",
          settings.accent,
          [
            ["white", "White"],
            ["cyan", "Ice"],
            ["teal", "Mint"],
            ["amber", "Amber"],
            ["purple", "Violet"],
          ]
        )}
        ${selectSetting(
          "Reader density",
          "density",
          "Comfortable uses more breathing room; compact tightens long lessons.",
          settings.density,
          [
            ["comfortable", "Comfortable"],
            ["compact", "Compact"],
            ["spacious", "Spacious"],
          ]
        )}
        ${selectSetting(
          "Motion",
          "motion",
          "Reduced motion disables major graph movement and animated transitions.",
          settings.motion,
          [
            ["full", "Full"],
            ["reduced", "Reduced"],
            ["off", "Off"],
          ]
        )}
        <div class="learn-setting-row">
          <div><strong>Graph labels</strong><p>Show labels for active and nearby graph nodes.</p></div>
          <label class="learn-toggle" aria-pressed="${settings.graphLabels ? "true" : "false"}">
            <input data-setting="graphLabels" type="checkbox" ${settings.graphLabels ? "checked" : ""} />
            <span>${settings.graphLabels ? "On" : "Off"}</span>
          </label>
        </div>
        <div class="learn-setting-row">
          <div><strong>Tendril intensity</strong><p>Controls how strongly the knowledge graph lines glow.</p></div>
          <input class="learn-range" data-setting="tendrilIntensity" type="range" min="0.35" max="1.8" step="0.05" value="${settings.tendrilIntensity}" />
        </div>
      </section>
    </div>
  </div>`
  );

  const setSetting = (key, rawValue) => {
    const value = key === "graphLabels" ? Boolean(rawValue) : key === "tendrilIntensity" ? Number(rawValue) : rawValue;
    if (onSetting) onSetting(key, value);
    else updateSetting(key, value);
    applySettingsSideEffects({ ...getState().settings, [key]: value });
  };

  const onInput = (event) => {
    const control = event.target.closest("[data-setting]");
    if (!control) return;
    event.stopPropagation();
    setSetting(control.dataset.setting, control.type === "checkbox" ? control.checked : control.value);
    if (control.dataset.setting === "graphLabels") {
      const label = control.closest(".learn-toggle")?.querySelector("span");
      if (label) label.textContent = control.checked ? "On" : "Off";
    }
  };

  const onClick = (event) => {
    const reset = event.target.closest("[data-settings-action='reset-settings']");
    if (!reset) return;
    if (onSetting) {
      Object.entries(DEFAULT_SETTINGS).forEach(([key, value]) => onSetting(key, value));
    } else {
      applySettings({ ...DEFAULT_SETTINGS });
    }
    applySettingsSideEffects(DEFAULT_SETTINGS);
    root.querySelectorAll("[data-setting]").forEach((control) => {
      const key = control.dataset.setting;
      if (control.type === "checkbox") control.checked = Boolean(DEFAULT_SETTINGS[key]);
      else control.value = DEFAULT_SETTINGS[key];
    });
    const graphLabel = root
      .querySelector("[data-setting='graphLabels']")
      ?.closest(".learn-toggle")
      ?.querySelector("span");
    if (graphLabel) graphLabel.textContent = "On";
    showToast?.("Settings reset");
  };

  root.addEventListener("input", onInput);
  root.addEventListener("change", onInput);
  root.addEventListener("click", onClick);
  return () => {
    root.removeEventListener("input", onInput);
    root.removeEventListener("change", onInput);
    root.removeEventListener("click", onClick);
  };
}
