import "/shared/xjk-core/safe-html.js?v=2";
import { DEFAULT_SIMILARITY_WEIGHT_PROFILE } from "./constants.js?v=2";
import { esc } from "./formatters.js?v=2";
import { renderMapViewerAction } from "./map-viewer.js?v=2";
import { buildNamingDetailContext, renderNamingDetailMarkup } from "./naming-detail-renderer.js?v=2";
import { buildAdminSimilarityWeightProfile, formatSimilarityWeightSummary } from "./similarity-profile.js?v=2";
import { buildSimilarityMatchSearchText } from "./similarity-search.js?v=2";
import { renderSimilarityWeightScopeCard } from "./similarity-workspace.js?v=2";
import { el, state } from "./state.js?v=2";
import { field, kv } from "./ui.js?v=2";

export function renderNamingDetailDrawer(payload) {
  const context = buildNamingDetailContext(payload, {
    defaultWeightProfile: DEFAULT_SIMILARITY_WEIGHT_PROFILE,
    buildWeightProfile: buildAdminSimilarityWeightProfile,
    formatWeightSummary: formatSimilarityWeightSummary,
    similaritySearch: state.drawerUi.namingSimilaritySearch,
  });
  const markup = renderNamingDetailMarkup(context, {
    buildSimilarityMatchSearchText,
    renderKv: kv,
    renderMapViewerAction,
    renderSimilarityWeightScopeCard,
  });
  globalThis.XjkSafeHtml.set(el.drawerBody, markup);
}

export function renderTargetedDnDrawer() {
  globalThis.XjkSafeHtml.set(
    el.drawerBody,
    `
    <div class="drawer-section">
      <p class="card-body">Sync specific Ubisoft account IDs immediately.</p>
      <form data-drawer-form="targeted-displayname" style="margin-top:.5rem;">
        <label class="field"><span>Account IDs</span><textarea name="accountIds" placeholder="Paste IDs separated by commas, spaces, or newlines"></textarea></label>
        <div class="field check" style="margin-top:.5rem;"><span>Force refresh</span><input name="force" type="checkbox" /></div>
        <div class="form-footer" style="margin-top:.6rem;"><button class="btn primary" type="submit">Run Sync</button></div>
      </form>
    </div>
  `
  );
}

export function renderClubConfigDrawer(club) {
  globalThis.XjkSafeHtml.set(
    el.drawerBody,
    `
    <div class="drawer-section">
      <p class="card-body">Manage this club's hook settings and sync label.</p>
      <form data-drawer-form="club-config" style="margin-top:.5rem;">
        <input type="hidden" name="hookKey" value="${esc(club.hookKey || "")}" />
        ${field("Club ID", "clubId", "number", club.clubId || "", { min: 1 })}
        ${field("Club Name", "clubName", "text", club.clubName || "")}
        ${field("Source Label", "sourceLabel", "text", club.sourceLabel || "")}
        <div class="field check" style="margin-top:.4rem;"><span>Enabled</span><input name="enabled" type="checkbox" ${club.enabled ? "checked" : ""} /></div>
        <div class="field check" style="margin-top:.4rem;"><span>Auto-track New Maps</span><input name="autoTrackNewMaps" type="checkbox" ${club.autoTrackNewMaps ? "checked" : ""} /></div>
        <div style="display:flex;gap:.35rem;margin-top:.6rem;">
          <button class="btn primary" type="submit">Save Club</button>
          <button class="btn outline" type="button" data-club-action="sync" data-club-id="${esc(String(club.clubId || 0))}" data-hook-key="${esc(club.hookKey || "")}">Sync Club</button>
        </div>
      </form>
    </div>
  `
  );
}

export function setSimilarityWeightEditorTab(editor, tabKey = "final") {
  if (!(editor instanceof HTMLElement)) return;
  const safeTab = String(tabKey || "final").trim() || "final";
  editor.querySelectorAll("[data-similarity-weight-tab]").forEach((button) => {
    const active = String(button.getAttribute("data-similarity-weight-tab") || "") === safeTab;
    button.classList.toggle("is-active", active);
  });
  editor.querySelectorAll("[data-similarity-weight-panel]").forEach((panel) => {
    const active = String(panel.getAttribute("data-similarity-weight-panel") || "") === safeTab;
    panel.toggleAttribute("hidden", !active);
    panel.classList.toggle("is-active", active);
  });
}
