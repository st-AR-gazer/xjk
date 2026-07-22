import {
  CAMPAIGN_LABEL_COLLATOR,
  DEFAULT_SIMILARITY_WEIGHT_PROFILE,
  NAMING_SIMILARITY_SOURCE_OPTIONS,
} from "./constants.js?v=2";
import { esc, escN, fmtDateTime, fmtNum } from "./formatters.js?v=2";
import { renderNamingMetricCard } from "./naming-ui.js?v=2";
import {
  buildAdminSimilarityWeightProfile,
  formatSimilarityWeightSummary,
  renderSelectedAlterationRegexHints,
  renderSimilarityScopeGrid,
  renderSimilarityWeightInputs,
  resolveAlterationRuleInputValue,
  slugifyAdminWeightValue,
} from "./similarity-profile.js?v=2";
import { state } from "./state.js?v=2";
import { selOpts, tableCard } from "./ui.js?v=2";

export function parseSimilarityWeightProfileFromFormData(fd, baseProfile = DEFAULT_SIMILARITY_WEIGHT_PROFILE) {
  return buildAdminSimilarityWeightProfile(
    {
      final: {
        absolute: fd.get("final.absolute"),
        relative: fd.get("final.relative"),
        weightedPlacement: fd.get("final.weightedPlacement"),
        model: fd.get("final.model"),
        name: fd.get("final.name"),
        regex: fd.get("final.regex"),
      },
      weightedPlacement: {
        absolute: fd.get("weightedPlacement.absolute"),
        relative: fd.get("weightedPlacement.relative"),
      },
      relationalFallback: {
        relative: fd.get("relationalFallback.relative"),
        model: fd.get("relationalFallback.model"),
        absolute: fd.get("relationalFallback.absolute"),
        name: fd.get("relationalFallback.name"),
      },
      nameSupport: fd.get("nameSupport"),
      regexOnly: fd.get("regexOnly") === "true",
      regexOverwriteWeights: fd.get("regexOverwriteWeights") === "true",
      selectedRegexPresets: fd.getAll("selectedRegexPresets"),
      customRegexPatterns: fd.get("customRegexPatterns"),
    },
    baseProfile
  );
}

export function renderSimilarityWeightScopeCard({
  scope = "map",
  title = "",
  description = "",
  mapUid = "",
  activeScope = "default",
  hasOverride = false,
  disabled = false,
  disabledMessage = "",
  profile = DEFAULT_SIMILARITY_WEIGHT_PROFILE,
} = {}) {
  const scopeKey = String(scope || "")
    .trim()
    .toLowerCase();
  const scopeLabel =
    scopeKey === "campaign"
      ? hasOverride
        ? "Campaign Override Saved"
        : activeScope === "campaign"
          ? "Campaign Driving Similarity"
          : "Campaign Using Defaults"
      : hasOverride
        ? "Map Override Saved"
        : activeScope === "map"
          ? "Map Driving Similarity"
          : "Map Inheriting Effective Mix";
  const toneClass = hasOverride || activeScope === scopeKey ? "tone-info" : "tone-muted";
  if (disabled) {
    return `
      <div class="card similarity-weight-card is-disabled">
        <div class="card-header">
          <div><p class="ws-label">Similarity Weights</p><h3>${esc(title)}</h3></div>
          <span class="pill tone-muted">Unavailable</span>
        </div>
        <p class="card-body" style="margin-top:.35rem;">${esc(description)}</p>
        <p class="card-body" style="margin-top:.35rem;color:var(--a-muted);">${esc(disabledMessage || "No campaign is assigned yet.")}</p>
      </div>
    `;
  }
  return `
    <div class="card similarity-weight-card">
      <div class="card-header">
        <div><p class="ws-label">Similarity Weights</p><h3>${esc(title)}</h3></div>
        <span class="pill ${toneClass}">${esc(scopeLabel)}</span>
      </div>
      <p class="card-body" style="margin-top:.35rem;">${esc(description)}</p>
      <p class="similarity-weight-summary">${esc(formatSimilarityWeightSummary(profile))}</p>
      <form data-drawer-form="similarity-weights" class="config-form" style="margin-top:.55rem;">
        <input type="hidden" name="mapUid" value="${esc(mapUid)}" />
        <input type="hidden" name="scope" value="${esc(scopeKey)}" />
        ${renderSimilarityWeightInputs(profile)}
        <p class="similarity-weight-note">Each group is normalized automatically, so the percentages do not need to add up to exactly 100.</p>
        <div class="form-footer">
          <button class="btn primary small" type="submit" name="weightAction" value="save">Save ${esc(scopeKey === "campaign" ? "Campaign" : "Map")} Weights</button>
          <button class="btn outline small" type="submit" name="weightAction" value="reset">Reset ${esc(scopeKey === "campaign" ? "Campaign" : "Map")}</button>
        </div>
      </form>
    </div>
  `;
}

export function resetSimilarityWeightRuleDraft() {
  state.similarityWeightsWorkspace.ruleDraft = {
    ruleId: "",
    sourceKey: "",
    season: "",
    seasonYear: "",
    environment: "",
    alterationSlug: "",
    profile: buildAdminSimilarityWeightProfile(DEFAULT_SIMILARITY_WEIGHT_PROFILE),
  };
}

export function resetSimilarityWeightCampaignDraft(campaignId = "") {
  state.similarityWeightsWorkspace.campaignDraft = {
    campaignId: campaignId ? String(campaignId) : "",
    profile: buildAdminSimilarityWeightProfile(DEFAULT_SIMILARITY_WEIGHT_PROFILE),
  };
}

function getSimilarityWeightSourceOptions() {
  const seen = new Set();
  const options = [];
  (Array.isArray(state.campaignCatalog) ? state.campaignCatalog : []).forEach((campaign) => {
    const sourceKey = String(campaign?.source_classification || campaign?.source_key || campaign?.sourceKey || "")
      .trim()
      .toLowerCase();
    if (!sourceKey || seen.has(sourceKey)) return;
    seen.add(sourceKey);
    const label = NAMING_SIMILARITY_SOURCE_OPTIONS.find(([value]) => value === sourceKey)?.[1] || sourceKey;
    options.push([sourceKey, label]);
  });
  return [["", "All Sources"], ...options.sort((a, b) => CAMPAIGN_LABEL_COLLATOR.compare(a[1], b[1]))];
}

function getSimilarityWeightSeasonOptions() {
  const seen = new Set();
  const options = [];
  (Array.isArray(state.campaignCatalog) ? state.campaignCatalog : []).forEach((campaign) => {
    const season = String(campaign?.season || "").trim();
    if (!season || seen.has(season.toLowerCase())) return;
    seen.add(season.toLowerCase());
    options.push([season, season]);
  });
  return [["", "All Seasons"], ...options.sort((a, b) => CAMPAIGN_LABEL_COLLATOR.compare(a[1], b[1]))];
}

function getSimilarityWeightYearOptions() {
  const years = new Set();
  (Array.isArray(state.campaignCatalog) ? state.campaignCatalog : []).forEach((campaign) => {
    const campaignYear = Number(campaign?.season_year || 0) || null;
    if (!campaignYear) return;
    years.add(String(campaignYear));
  });
  return [["", "All Years"], ...[...years].sort((a, b) => Number(a) - Number(b)).map((year) => [year, year])];
}

function getSimilarityWeightEnvironmentOptions() {
  const seen = new Set();
  const options = [];
  (Array.isArray(state.campaignCatalog) ? state.campaignCatalog : []).forEach((campaign) => {
    const environment = String(campaign?.environment || "").trim();
    const key = environment.toLowerCase();
    if (!environment || seen.has(key)) return;
    seen.add(key);
    options.push([environment, environment]);
  });
  return [["", "All Environments"], ...options.sort((a, b) => CAMPAIGN_LABEL_COLLATOR.compare(a[1], b[1]))];
}

function getSimilarityWeightCampaignOptions() {
  const rows = Array.isArray(state.campaignCatalog) ? state.campaignCatalog : [];
  const options = rows
    .filter((campaign) => Number(campaign?.campaign_db_id || 0) > 0)
    .map((campaign) => {
      const campaignId = String(Number(campaign.campaign_db_id));
      const sourceLabel =
        NAMING_SIMILARITY_SOURCE_OPTIONS.find(
          ([value]) =>
            value ===
            String(campaign?.source_classification || campaign?.source_key || "")
              .trim()
              .toLowerCase()
        )?.[1] ||
        campaign?.source_classification ||
        campaign?.source_key ||
        "";
      const seasonLabel = [campaign?.season, campaign?.season_year].filter(Boolean).join(" ");
      const alterationLabel =
        Array.isArray(campaign?.alterations) && campaign.alterations.length
          ? campaign.alterations
              .map((item) => item?.name)
              .filter(Boolean)
              .join(" + ")
          : "";
      const labelParts = [campaign?.name || campaignId, seasonLabel, sourceLabel, alterationLabel].filter(Boolean);
      return {
        value: campaignId,
        label: labelParts.join(" · "),
      };
    })
    .sort((a, b) => CAMPAIGN_LABEL_COLLATOR.compare(a.label, b.label));
  return [["", "Choose Campaign"], ...options.map((item) => [item.value, item.label])];
}

function buildSimilarityWeightAlterationOptions(alterations = []) {
  const list = Array.isArray(alterations) ? alterations : [];
  const seen = new Set();
  const merged = [];

  list.forEach((item) => {
    const value = String(item?.slug || "").trim();
    const label = item?.name || item?.slug || "";
    if (!value || seen.has(value.toLowerCase())) return;
    seen.add(value.toLowerCase());
    merged.push([value, label]);
  });

  (Array.isArray(state.campaignCatalog) ? state.campaignCatalog : []).forEach((campaign) => {
    const items = Array.isArray(campaign?.alterations) ? campaign.alterations : [];
    items.forEach((item) => {
      const value = String(item?.slug || "").trim();
      const label = item?.name || item?.slug || "";
      if (!value || seen.has(value.toLowerCase())) return;
      seen.add(value.toLowerCase());
      merged.push([value, label]);
    });

    const singleAlteration = String(campaign?.alteration || "").trim();
    const singleSlug = slugifyAdminWeightValue(singleAlteration);
    if (singleSlug && !seen.has(singleSlug)) {
      seen.add(singleSlug);
      merged.push([singleSlug, singleAlteration]);
    }
  });

  return [["", "All Alterations"], ...merged.sort((a, b) => CAMPAIGN_LABEL_COLLATOR.compare(a[1], b[1]))];
}

function findCampaignCatalogRowById(campaignId) {
  const safeCampaignId = Number(campaignId || 0) || 0;
  if (!safeCampaignId) return null;
  return (
    (Array.isArray(state.campaignCatalog) ? state.campaignCatalog : []).find(
      (campaign) => Number(campaign?.campaign_db_id || 0) === safeCampaignId
    ) || null
  );
}

function formatSimilarityWeightRuleScope(rule = {}, alterations = []) {
  const parts = [];
  const sourceKey = String(rule?.sourceKey || "")
    .trim()
    .toLowerCase();
  if (sourceKey) {
    const sourceLabel = NAMING_SIMILARITY_SOURCE_OPTIONS.find(([value]) => value === sourceKey)?.[1] || sourceKey;
    parts.push(sourceLabel);
  }
  if (rule?.season) {
    parts.push(rule.seasonYear ? `${rule.season} ${rule.seasonYear}` : String(rule.season));
  } else if (rule?.seasonYear) {
    parts.push(String(rule.seasonYear));
  }
  if (rule?.environment) {
    parts.push(`[${rule.environment}]`);
  }
  if (rule?.alterationSlug) {
    const alteration = (Array.isArray(alterations) ? alterations : []).find(
      (item) =>
        String(item?.slug || "")
          .trim()
          .toLowerCase() ===
        String(rule.alterationSlug || "")
          .trim()
          .toLowerCase()
    );
    parts.push(alteration?.name || rule.alterationSlug);
  }
  return parts.length ? parts.join(" · ") : "Default-like scoped rule";
}

export function renderSimilarityWeightsWorkspace(payload = {}) {
  const scopedRules = Array.isArray(payload?.scopedRules) ? payload.scopedRules : [];
  const campaignOverrides = Array.isArray(payload?.campaignOverrides) ? payload.campaignOverrides : [];
  const alterations = Array.isArray(payload?.alterations) ? payload.alterations : [];
  const alterationRegexLibrary =
    payload?.alterationRegexLibrary && typeof payload.alterationRegexLibrary === "object"
      ? payload.alterationRegexLibrary
      : {};
  const alterationRegexBehavior =
    payload?.alterationRegexBehavior && typeof payload.alterationRegexBehavior === "object"
      ? payload.alterationRegexBehavior
      : {};
  const defaultProfile = buildAdminSimilarityWeightProfile(payload?.defaults || DEFAULT_SIMILARITY_WEIGHT_PROFILE);
  const ruleDraft = state.similarityWeightsWorkspace.ruleDraft || {};
  const campaignDraft = state.similarityWeightsWorkspace.campaignDraft || {};
  const campaignDraftProfile = buildAdminSimilarityWeightProfile(
    campaignDraft.profile || defaultProfile,
    defaultProfile
  );
  const ruleDraftProfile = buildAdminSimilarityWeightProfile(ruleDraft.profile || defaultProfile, defaultProfile);
  const campaignOptions = getSimilarityWeightCampaignOptions();
  const sourceOptions = getSimilarityWeightSourceOptions();
  const seasonOptions = getSimilarityWeightSeasonOptions();
  const yearOptions = getSimilarityWeightYearOptions();
  const environmentOptions = getSimilarityWeightEnvironmentOptions();
  const alterationOptions = buildSimilarityWeightAlterationOptions(alterations);
  const selectedRuleAlteration = (() => {
    const resolvedValue = resolveAlterationRuleInputValue(ruleDraft.alterationSlug || "", alterationOptions);
    if (!resolvedValue) return null;
    const exact = (Array.isArray(alterationOptions) ? alterationOptions : []).find(
      (item) =>
        String(Array.isArray(item) ? item[1] : item?.name || "")
          .trim()
          .toLowerCase() === resolvedValue.toLowerCase()
    );
    if (!exact) return null;
    return {
      label: String(Array.isArray(exact) ? exact[1] : exact?.name || resolvedValue).trim(),
      slug: String(Array.isArray(exact) ? exact[0] : exact?.slug || resolvedValue).trim(),
    };
  })();

  return `
    <section class="naming-workspace-shell">
      <div class="naming-metric-grid">
        ${renderNamingMetricCard({ label: "Scoped Rules", value: scopedRules.length, note: "Source/season/year/alteration", accent: "info" })}
        ${renderNamingMetricCard({ label: "Campaign Overrides", value: campaignOverrides.length, note: "Hard campaign mix", accent: "warn" })}
        ${renderNamingMetricCard({ label: "Alterations", value: alterations.length, note: "Available scope filters", accent: "muted" })}
        ${renderNamingMetricCard({ label: "Default Mix", value: defaultProfile.final.absolute, note: formatSimilarityWeightSummary(defaultProfile), accent: "success" })}
      </div>

      <div class="similarity-weight-grid" style="margin-top:.75rem;">
        <div class="card similarity-weight-card">
          <div class="card-header">
            <div><p class="ws-label">Scoped Rule</p><h3>${esc(ruleDraft.ruleId ? `Edit Rule #${ruleDraft.ruleId}` : "Create Rule")}</h3></div>
            <span class="pill tone-info">${esc(ruleDraft.ruleId ? "Editing" : "New")}</span>
          </div>
          <p class="card-body" style="margin-top:.35rem;">Use these filters to target families like all flipped campaigns, only Spring 2020 flipped maps, or a single source-season slice.</p>
          <form data-similarity-weight-rule-form class="config-form" style="margin-top:.55rem;">
            <input type="hidden" name="ruleId" value="${esc(String(ruleDraft.ruleId || ""))}" />
            ${renderSimilarityScopeGrid({
              sourceOptions,
              seasonOptions,
              yearOptions,
              environmentOptions,
              alterationOptions,
              ruleDraft,
            })}
            ${renderSimilarityWeightInputs(ruleDraftProfile, {
              regexInfoMarkup: `<div
                data-selected-alteration-regex-panel
                data-alteration-regex-library="${esc(JSON.stringify(alterationRegexLibrary))}"
                data-alteration-regex-behavior="${esc(JSON.stringify(alterationRegexBehavior))}"
                style="margin-top:.55rem;"
              >${renderSelectedAlterationRegexHints({
                alterationSelection: selectedRuleAlteration,
                alterationRegexLibrary,
                alterationRegexBehavior,
              })}</div>`,
              regexSelectionRequired: true,
              regexSelectionReady: Boolean(selectedRuleAlteration?.slug),
            })}
            <p class="similarity-weight-note">A rule only needs one filter. Add more filters when you want a narrower slice.</p>
            <div class="form-footer">
              <button class="btn primary small" type="submit">Save Scoped Rule</button>
              <button class="btn outline small" type="button" data-reset-similarity-weight-rule-form>Clear Draft</button>
            </div>
          </form>
        </div>

        <div class="card similarity-weight-card">
          <div class="card-header">
            <div><p class="ws-label">Campaign Override</p><h3>${esc(campaignDraft.campaignId ? "Edit Campaign" : "Choose Campaign")}</h3></div>
            <span class="pill tone-warn">${esc(campaignDraft.campaignId ? "Override" : "Specific")}</span>
          </div>
          <p class="card-body" style="margin-top:.35rem;">Use this when one campaign should ignore the broader rule stack and carry its own tuned mix.</p>
          <form data-similarity-weight-campaign-form class="config-form" style="margin-top:.55rem;">
            <label class="field" style="grid-column:1 / -1;">
              <span>Campaign</span>
              <select name="campaignId">${selOpts(campaignOptions, campaignDraft.campaignId || "")}</select>
            </label>
            ${renderSimilarityWeightInputs(campaignDraftProfile)}
            <div class="form-footer">
              <button class="btn primary small" type="submit">Save Campaign Override</button>
              <button class="btn outline small" type="button" data-reset-similarity-weight-campaign-form>Clear Draft</button>
            </div>
          </form>
        </div>
      </div>

      ${tableCard(
        "Scoped Rules",
        `${fmtNum(scopedRules.length)} saved`,
        `
        <table class="data-table">
          <thead><tr><th>Scope</th><th>Weights</th><th>Updated</th><th></th></tr></thead>
          <tbody>
            ${
              scopedRules
                .map(
                  (rule) => `<tr>
              <td><strong>${esc(formatSimilarityWeightRuleScope(rule, alterations))}</strong><div class="cell-subline">Rule #${esc(String(rule.ruleId || "-"))}</div></td>
              <td>${esc(formatSimilarityWeightSummary(rule.weights || defaultProfile))}</td>
              <td>${esc(fmtDateTime(rule.updatedAt))}</td>
              <td><div class="cell-actions">
                <button class="btn outline small" type="button" data-similarity-weight-rule-edit="${esc(String(rule.ruleId || ""))}">Edit</button>
                <button class="btn ghost small" type="button" data-similarity-weight-rule-delete="${esc(String(rule.ruleId || ""))}">Delete</button>
              </div></td>
            </tr>`
                )
                .join("") ||
              `<tr><td colspan="4"><p class="inline-empty">No scoped similarity weight rules yet.</p></td></tr>`
            }
          </tbody>
        </table>
      `
      )}

      ${tableCard(
        "Campaign Overrides",
        `${fmtNum(campaignOverrides.length)} saved`,
        `
        <table class="data-table">
          <thead><tr><th>Campaign</th><th>Weights</th><th>Updated</th><th></th></tr></thead>
          <tbody>
            ${
              campaignOverrides
                .map((override) => {
                  const campaign = findCampaignCatalogRowById(override.campaignId);
                  const campaignLabel = campaign?.name || `Campaign ${override.campaignId || "-"}`;
                  const meta = [
                    campaign?.season_label || "",
                    campaign?.source_classification || campaign?.source_key || "",
                  ]
                    .filter(Boolean)
                    .join(" · ");
                  return `<tr>
                <td><strong>${escN(campaignLabel)}</strong><div class="cell-subline">${esc(meta || `campaign ${override.campaignId || "-"}`)}</div></td>
                <td>${esc(formatSimilarityWeightSummary(override.weights || defaultProfile))}</td>
                <td>${esc(fmtDateTime(override.updatedAt))}</td>
                <td><div class="cell-actions">
                  <button class="btn outline small" type="button" data-similarity-weight-campaign-edit="${esc(String(override.campaignId || ""))}">Edit</button>
                  <button class="btn ghost small" type="button" data-similarity-weight-campaign-delete="${esc(String(override.campaignId || ""))}">Delete</button>
                </div></td>
              </tr>`;
                })
                .join("") ||
              `<tr><td colspan="4"><p class="inline-empty">No campaign overrides saved yet.</p></td></tr>`
            }
          </tbody>
        </table>
      `
      )}
    </section>
  `;
}
