import "/shared/xjk-core/safe-html.js?v=2";
import {
  CAMPAIGN_LABEL_COLLATOR,
  DEFAULT_SIMILARITY_WEIGHT_PROFILE,
  SIMILARITY_WEIGHT_SECTIONS,
} from "./constants.js?v=2";
import { esc } from "./formatters.js?v=2";
import { selOpts } from "./ui.js?v=2";

function clampSimilarityWeightPercent(value, fallback = 0) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(0, Math.min(100, Math.round(parsed * 10) / 10));
}

function normalizeSimilarityWeightStringArray(value = []) {
  const list = Array.isArray(value) ? value : typeof value === "string" ? value.split(/[\r\n,;]+/) : [];
  return [...new Set(list.map((item) => String(item || "").trim()).filter(Boolean))];
}

function normalizeSimilarityWeightRegexPatterns(value = []) {
  return normalizeSimilarityWeightStringArray(value);
}

export function buildAdminSimilarityWeightProfile(profile = null, baseProfile = DEFAULT_SIMILARITY_WEIGHT_PROFILE) {
  const base =
    baseProfile && typeof baseProfile === "object"
      ? JSON.parse(JSON.stringify(baseProfile))
      : JSON.parse(JSON.stringify(DEFAULT_SIMILARITY_WEIGHT_PROFILE));
  const raw = profile && typeof profile === "object" ? profile : {};
  const final = raw.final && typeof raw.final === "object" ? raw.final : {};
  const weightedPlacement =
    raw.weightedPlacement && typeof raw.weightedPlacement === "object" ? raw.weightedPlacement : {};
  const relationalFallback =
    raw.relationalFallback && typeof raw.relationalFallback === "object" ? raw.relationalFallback : {};
  const regexOverwriteWeights = Boolean(raw.regexOverwriteWeights ?? raw.overwriteWeights);
  return {
    final: {
      absolute: clampSimilarityWeightPercent(final.absolute, base.final.absolute),
      relative: clampSimilarityWeightPercent(final.relative, base.final.relative),
      weightedPlacement: clampSimilarityWeightPercent(final.weightedPlacement, base.final.weightedPlacement),
      model: clampSimilarityWeightPercent(final.model, base.final.model),
      name: clampSimilarityWeightPercent(final.name ?? raw.nameSupport, base.final.name ?? base.nameSupport ?? 0),
      regex: regexOverwriteWeights ? clampSimilarityWeightPercent(final.regex, base.final.regex ?? 0) : 0,
    },
    weightedPlacement: {
      absolute: clampSimilarityWeightPercent(weightedPlacement.absolute, base.weightedPlacement.absolute),
      relative: clampSimilarityWeightPercent(weightedPlacement.relative, base.weightedPlacement.relative),
    },
    relationalFallback: {
      relative: clampSimilarityWeightPercent(relationalFallback.relative, base.relationalFallback.relative),
      model: clampSimilarityWeightPercent(relationalFallback.model, base.relationalFallback.model),
      absolute: clampSimilarityWeightPercent(relationalFallback.absolute, base.relationalFallback.absolute),
      name: clampSimilarityWeightPercent(
        relationalFallback.name ?? raw.nameSupport,
        base.relationalFallback.name ?? base.nameSupport ?? 0
      ),
    },
    nameSupport: clampSimilarityWeightPercent(raw.nameSupport, base.nameSupport),
    regexOnly: Boolean(raw.regexOnly),
    regexOverwriteWeights,
    selectedRegexPresets: normalizeSimilarityWeightStringArray(
      raw.selectedRegexPresets ?? raw.regexPresets ?? base.selectedRegexPresets
    ),
    customRegexPatterns: normalizeSimilarityWeightRegexPatterns(
      raw.customRegexPatterns ?? raw.regexPatterns ?? base.customRegexPatterns
    ),
  };
}

export function formatSimilarityWeightSummary(profile = null) {
  const safeProfile = buildAdminSimilarityWeightProfile(profile);
  const parts = [
    `A ${safeProfile.final.absolute}%`,
    `R ${safeProfile.final.relative}%`,
    `W ${safeProfile.final.weightedPlacement}%`,
    `M ${safeProfile.final.model}%`,
    `N ${safeProfile.final.name ?? 0}%`,
  ];
  if (safeProfile.regexOverwriteWeights) parts.push(`RX ${safeProfile.final.regex ?? 0}%`);
  return parts.join(" · ");
}

export function renderSimilarityWeightInputs(
  profile = null,
  { regexInfoMarkup = "", regexSelectionRequired = false, regexSelectionReady = true } = {}
) {
  const safeProfile = buildAdminSimilarityWeightProfile(profile);
  const regexEnabled = Boolean(safeProfile.regexOverwriteWeights);
  const sectionMeta = {
    final: {
      title: "Final Blend",
      note: "Used for the primary similarity score when the weighted placement signal is strong. Regex contributes here when a strict map-number parse is available.",
    },
    weightedPlacement: {
      title: "Weighted Placement Blend",
      note: "Combines weighted absolute and relative placement similarity before the final blend uses it.",
    },
    relationalFallback: {
      title: "Fallback Blend",
      note: "Used when weighted placement is too weak to trust on its own.",
    },
  };
  const sectionsMarkup = SIMILARITY_WEIGHT_SECTIONS.map(
    (section) => `
    <section
      class="similarity-weight-panel ${section.key === "final" ? "is-active" : ""}"
      data-similarity-weight-panel="${esc(section.key)}"
      ${section.key === "final" ? "" : "hidden"}
    >
      <div class="similarity-weight-section">
        <p class="similarity-weight-section-title">${esc(sectionMeta[section.key]?.title || section.label)}</p>
        <p class="similarity-weight-note">${esc(sectionMeta[section.key]?.note || "")}</p>
      </div>
      <div class="similarity-weight-inputs">
        ${section.fields
          .map(
            ([fieldKey, fieldLabel]) => `
          <label
            class="field${section.key === "final" && fieldKey === "regex" ? " similarity-weight-final-regex-field" : ""}"
            ${section.key === "final" && fieldKey === "regex" && !regexEnabled ? "hidden" : ""}
            ${section.key === "final" && fieldKey === "regex" ? "data-similarity-weight-final-regex" : ""}
          >
            <span>${esc(fieldLabel)}</span>
            <input
              type="number"
              name="${esc(`${section.key}.${fieldKey}`)}"
              min="0"
              max="100"
              step="0.1"
              value="${esc(String(safeProfile?.[section.key]?.[fieldKey] ?? 0))}"
            />
          </label>
        `
          )
          .join("")}
      </div>
    </section>
  `
  ).join("");
  return `
    <div class="similarity-weight-editor" data-similarity-weight-editor>
      <div class="similarity-weight-tabbar">
        <button class="similarity-weight-tabbtn is-active" type="button" data-similarity-weight-tab="final">Final Blend</button>
        <button class="similarity-weight-tabbtn" type="button" data-similarity-weight-tab="weightedPlacement">Weighted Blend</button>
        <button class="similarity-weight-tabbtn" type="button" data-similarity-weight-tab="relationalFallback">Fallback Blend</button>
        <button class="similarity-weight-tabbtn" type="button" data-similarity-weight-tab="regex">Regex</button>
      </div>
      ${sectionsMarkup}
      <section class="similarity-weight-panel" data-similarity-weight-panel="regex" hidden>
        <div class="similarity-weight-section">
          <p class="similarity-weight-section-title">Regex Control</p>
          <p class="similarity-weight-note">${
            regexSelectionRequired && !regexSelectionReady
              ? "Select an alteration to load its regex guidance and enable regex-specific controls."
              : "Use this when similarity should never override a strict campaign-name regex parse. The Final Blend regex field only appears when overwrite is enabled."
          }</p>
        </div>
        ${
          regexSelectionRequired && !regexSelectionReady
            ? ""
            : `
              <div class="similarity-weight-inputs">
                <label class="field check" style="grid-column:1 / -1;">
                  <span>Only accept regex map numbers</span>
                  <input
                    type="checkbox"
                    name="regexOnly"
                    value="true"
                    ${safeProfile.regexOnly ? "checked" : ""}
                  />
                </label>
                <label class="field check" style="grid-column:1 / -1;">
                  <span>Overwrite weights when regex resolves</span>
                  <input
                    type="checkbox"
                    name="regexOverwriteWeights"
                    value="true"
                    ${safeProfile.regexOverwriteWeights ? "checked" : ""}
                  />
                </label>
              </div>
            `
        }
        ${regexInfoMarkup}
      </section>
      <p class="similarity-weight-note">Each blend is normalized automatically, so values do not need to add up to exactly 100.</p>
    </div>
  `;
}

export function syncSimilarityWeightRegexVisibility(scope = document) {
  const root = scope instanceof Document || scope instanceof HTMLElement ? scope : document;
  root.querySelectorAll("[data-similarity-weight-editor]").forEach((editor) => {
    if (!(editor instanceof HTMLElement)) return;
    const toggle = editor.querySelector('input[name="regexOverwriteWeights"]');
    const regexField = editor.querySelector("[data-similarity-weight-final-regex]");
    if (!(regexField instanceof HTMLElement)) return;
    regexField.hidden = !(toggle instanceof HTMLInputElement && toggle.checked);
  });
}

if (typeof document !== "undefined") {
  document.addEventListener("change", (event) => {
    const target = event.target;
    if (!(target instanceof HTMLInputElement)) return;
    if (target.name !== "regexOverwriteWeights") return;
    const editor = target.closest("[data-similarity-weight-editor]");
    if (!(editor instanceof HTMLElement)) return;
    syncSimilarityWeightRegexVisibility(editor);
  });
}

export function resolveAlterationRuleInputValue(alterationSlug = "", alterations = []) {
  const raw = String(alterationSlug || "").trim();
  if (!raw) return "";
  const match = (Array.isArray(alterations) ? alterations : []).find(
    (item) =>
      String(Array.isArray(item) ? item[0] : item?.slug || "")
        .trim()
        .toLowerCase() === raw.toLowerCase()
  );
  if (Array.isArray(match)) return match[1] || raw;
  return match?.name || raw;
}

function renderAlterationRuleInput(alterations = [], value = "") {
  const safeValue = resolveAlterationRuleInputValue(value, alterations);
  const suggestions = [
    ...new Map(
      (Array.isArray(alterations) ? alterations : [])
        .map((item) => {
          const label = String(Array.isArray(item) ? item[1] : item?.name || "").trim();
          const slug = String(Array.isArray(item) ? item[0] : item?.slug || "").trim();
          if (!label) return null;
          return [label.toLowerCase(), { label, slug: slug || slugifyAdminWeightValue(label) }];
        })
        .filter(Boolean)
    ).values(),
  ].sort((a, b) => CAMPAIGN_LABEL_COLLATOR.compare(a.label, b.label));
  return `
    <label class="field field-search">
      <span>Alteration</span>
      <div class="similarity-weight-search-shell" data-alteration-search>
        <input
          name="alterationSlug"
          value="${esc(safeValue)}"
          placeholder="Search alteration"
          autocomplete="off"
          data-alteration-search-input
        />
        <div class="similarity-weight-search-list" data-alteration-search-list hidden>
          ${suggestions
            .map(
              (item) => `
            <button
              class="similarity-weight-search-option"
              type="button"
              data-alteration-option="${esc(item.label)}"
              data-alteration-slug="${esc(item.slug)}"
              data-search-text="${esc(item.label.toLowerCase())}"
            >${esc(item.label)}</button>
          `
            )
            .join("")}
        </div>
      </div>
    </label>
  `;
}

export function slugifyAdminWeightValue(value = "") {
  return String(value || "")
    .trim()
    .normalize("NFKD")
    .replace(/[^\x00-\x7F]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function parseSimilarityWeightRegexLibrary(rawValue = "") {
  try {
    const parsed = JSON.parse(String(rawValue || "{}"));
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function parseSimilarityWeightRegexBehavior(rawValue = "") {
  try {
    const parsed = JSON.parse(String(rawValue || "{}"));
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function resolveAlterationRuleInputSelection(input) {
  if (!(input instanceof HTMLInputElement)) return null;
  const raw = String(input.value || "").trim();
  if (!raw) return null;
  const normalizedRawSlug = slugifyAdminWeightValue(raw);
  const shell = input.closest("[data-alteration-search]");
  const match = Array.from(shell?.querySelectorAll("[data-alteration-option]") || []).find((option) => {
    const optionLabel = String(option.getAttribute("data-alteration-option") || "").trim();
    const optionSlug = slugifyAdminWeightValue(option.getAttribute("data-alteration-slug") || optionLabel);
    return optionLabel.toLowerCase() === raw.toLowerCase() || optionSlug === normalizedRawSlug;
  });
  if (!(match instanceof HTMLElement)) return null;
  return {
    label: String(match.getAttribute("data-alteration-option") || raw).trim(),
    slug: slugifyAdminWeightValue(match.getAttribute("data-alteration-slug") || raw),
  };
}

function getAlterationRegexEntries(alterationRegexLibrary = {}, alterationSlug = "") {
  const selectedSlug = slugifyAdminWeightValue(alterationSlug);
  const rawEntries = alterationRegexLibrary?.[selectedSlug];
  const entries = Array.isArray(rawEntries) ? rawEntries : Array.isArray(rawEntries?.entries) ? rawEntries.entries : [];
  return entries.filter((entry) => String(entry?.pattern || "").trim());
}

function getAlterationRegexBehaviorEntry(alterationRegexBehavior = {}, alterationSlug = "") {
  const selectedSlug = slugifyAdminWeightValue(alterationSlug);
  const entry = alterationRegexBehavior?.[selectedSlug];
  return entry && typeof entry === "object" ? entry : null;
}

export function renderSelectedAlterationRegexHints({
  alterationSelection = null,
  alterationRegexLibrary = {},
  alterationRegexBehavior = {},
} = {}) {
  const selectedSlug = slugifyAdminWeightValue(alterationSelection?.slug || "");
  const selectedLabel = String(alterationSelection?.label || "").trim() || selectedSlug;
  if (!selectedSlug) {
    return `<p class="similarity-weight-note">Select an alteration to unlock its regex guidance.</p>`;
  }
  const entries = getAlterationRegexEntries(alterationRegexLibrary, selectedSlug);
  const behavior = getAlterationRegexBehaviorEntry(alterationRegexBehavior, selectedSlug);
  const recommendedProfile =
    behavior?.recommendedProfile && typeof behavior.recommendedProfile === "object"
      ? behavior.recommendedProfile
      : null;
  return `
    <div style="grid-column:1 / -1;">
      <p class="similarity-weight-note" style="margin-bottom:.45rem;">Known regex patterns for <strong>${esc(selectedLabel)}</strong>${entries.length ? ` (${esc(String(entries.length))})` : ""}</p>
      ${
        recommendedProfile || String(behavior?.reason || "").trim()
          ? `
            <div class="card-body" style="margin:0 0 .55rem 0;padding:.6rem .72rem;border:1px solid rgba(123,193,255,.18);border-radius:14px;background:rgba(13,20,32,.45);">
              <div class="ws-label">Recommended Mode</div>
              ${
                recommendedProfile
                  ? `<p style="margin:0;color:var(--a-ink);">Regex only: <strong>${recommendedProfile.regexOnly ? "On" : "Off"}</strong>${recommendedProfile.regexOverwriteWeights ? " | overwrite weights: On" : ""}</p>`
                  : ""
              }
              ${
                behavior?.reason
                  ? `<p class="similarity-weight-note" style="margin:.35rem 0 0 0;">${esc(String(behavior.reason || ""))}</p>`
                  : ""
              }
            </div>
          `
          : ""
      }
      ${
        entries.length
          ? entries
              .map(
                (entry) => `
              <div class="card-body" style="margin:0 0 .45rem 0;padding:.55rem .7rem;border:1px solid rgba(123,193,255,.18);border-radius:14px;background:rgba(13,20,32,.45);">
                <div class="ws-label">${esc(entry?.label || entry?.parserPattern || entry?.legacyPatternId || "Regex")}</div>
                <code style="display:block;white-space:pre-wrap;word-break:break-word;margin-top:.25rem;">${esc(String(entry?.pattern || ""))}</code>
              </div>
            `
              )
              .join("")
          : `<p class="similarity-weight-note">No known regex patterns are registered for this alteration yet.</p>`
      }
    </div>
  `;
}

function applySelectedAlterationRegexBehavior(form, alterationRegexBehavior = {}) {
  if (!(form instanceof HTMLFormElement)) return;
  const ruleId = String(form.querySelector('input[name="ruleId"]')?.value || "").trim();
  if (ruleId) return;
  const input = form.querySelector('input[name="alterationSlug"]');
  if (!(input instanceof HTMLInputElement)) return;
  const selection = resolveAlterationRuleInputSelection(input);
  const behavior = selection ? getAlterationRegexBehaviorEntry(alterationRegexBehavior, selection.slug) : null;
  const profile =
    behavior?.recommendedProfile && typeof behavior.recommendedProfile === "object"
      ? behavior.recommendedProfile
      : null;
  const regexOnly = form.querySelector('input[name="regexOnly"]');
  const regexOverwrite = form.querySelector('input[name="regexOverwriteWeights"]');
  if (regexOnly instanceof HTMLInputElement) {
    regexOnly.checked = Boolean(profile?.regexOnly);
  }
  if (regexOverwrite instanceof HTMLInputElement) {
    regexOverwrite.checked = Boolean(profile?.regexOverwriteWeights);
  }
  syncSimilarityWeightRegexVisibility(form);
}

export function syncSelectedAlterationRegexHints(scope = document) {
  const root = scope instanceof Document || scope instanceof HTMLElement ? scope : document;
  root.querySelectorAll("[data-selected-alteration-regex-panel]").forEach((panel) => {
    if (!(panel instanceof HTMLElement)) return;
    const form = panel.closest("form");
    if (!(form instanceof HTMLFormElement)) return;
    const input = form.querySelector('input[name="alterationSlug"]');
    if (!(input instanceof HTMLInputElement)) return;
    const library = parseSimilarityWeightRegexLibrary(panel.getAttribute("data-alteration-regex-library"));
    const behavior = parseSimilarityWeightRegexBehavior(panel.getAttribute("data-alteration-regex-behavior"));
    applySelectedAlterationRegexBehavior(form, behavior);
    globalThis.XjkSafeHtml.set(
      panel,
      renderSelectedAlterationRegexHints({
        alterationSelection: resolveAlterationRuleInputSelection(input),
        alterationRegexLibrary: library,
        alterationRegexBehavior: behavior,
      })
    );
  });
}

function renderCompactScopeField(label, controlMarkup, { wide = false } = {}) {
  return `
    <label class="field similarity-weight-scope-field${wide ? " is-wide" : ""}">
      <span>${esc(label)}</span>
      ${controlMarkup}
    </label>
  `;
}

export function renderSimilarityScopeGrid({
  sourceOptions,
  seasonOptions,
  yearOptions,
  environmentOptions,
  alterationOptions,
  ruleDraft,
}) {
  return `
    <div class="similarity-weight-scope-grid">
      ${renderCompactScopeField("Source", `<select name="sourceKey">${selOpts(sourceOptions, ruleDraft.sourceKey || "")}</select>`)}
      ${renderCompactScopeField("Season", `<select name="season">${selOpts(seasonOptions, ruleDraft.season || "")}</select>`)}
      ${renderCompactScopeField("Year", `<select name="seasonYear">${selOpts(yearOptions, ruleDraft.seasonYear || "")}</select>`)}
      ${renderCompactScopeField("Environment", `<select name="environment">${selOpts(environmentOptions, ruleDraft.environment || "")}</select>`)}
      ${renderAlterationRuleInput(alterationOptions, ruleDraft.alterationSlug || "")}
    </div>
  `;
}

export function hideAlterationSearchLists(exceptShell = null) {
  document.querySelectorAll("[data-alteration-search-list]").forEach((list) => {
    if (!(list instanceof HTMLElement)) return;
    if (exceptShell && list.closest("[data-alteration-search]") === exceptShell) return;
    list.hidden = true;
  });
}

export function updateAlterationSearchSuggestions(input, { showAllOnEmpty = false } = {}) {
  if (!(input instanceof HTMLInputElement)) return;
  const shell = input.closest("[data-alteration-search]");
  if (!(shell instanceof HTMLElement)) return;
  const list = shell.querySelector("[data-alteration-search-list]");
  if (!(list instanceof HTMLElement)) return;
  const query = String(input.value || "")
    .trim()
    .toLowerCase();
  const options = Array.from(list.querySelectorAll("[data-alteration-option]"));
  const isFocused = document.activeElement === input || shell.contains(document.activeElement);
  let visible = 0;
  options.forEach((option) => {
    const searchText = String(option.getAttribute("data-search-text") || "")
      .trim()
      .toLowerCase();
    const matches = (showAllOnEmpty && !query) || searchText.includes(query);
    const show = matches && visible < 14;
    option.toggleAttribute("hidden", !show);
    if (show) visible += 1;
  });
  hideAlterationSearchLists(shell);
  list.hidden = !(isFocused && visible > 0);
}

if (typeof document !== "undefined") {
  document.addEventListener("input", (event) => {
    const target = event.target;
    if (!(target instanceof HTMLInputElement)) return;
    if (target.name !== "alterationSlug") return;
    const form = target.closest("form");
    if (!(form instanceof HTMLFormElement)) return;
    syncSelectedAlterationRegexHints(form);
  });

  document.addEventListener("click", (event) => {
    const target = event.target;
    if (!(target instanceof HTMLElement)) return;
    if (!target.closest("[data-alteration-option]")) return;
    const form = target.closest("form");
    window.setTimeout(() => {
      if (form instanceof HTMLFormElement) syncSelectedAlterationRegexHints(form);
    }, 0);
  });
}
