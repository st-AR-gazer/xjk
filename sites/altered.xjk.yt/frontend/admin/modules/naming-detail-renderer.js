import { esc, escN, fmtBytes, fmtNum, similarityDetailMeta, stripFmt } from "./formatters.js?v=2";

function formatNumbers(value) {
  return Array.isArray(value) && value.length ? value.join(", ") : "-";
}

function formatScore(value) {
  return Number.isFinite(Number(value)) ? Number(value).toFixed(6) : "-";
}

export function buildNamingDetailContext(
  payload,
  { defaultWeightProfile, buildWeightProfile, formatWeightSummary, similaritySearch = "" }
) {
  const map = payload?.map || {};
  const stored = payload?.storedCandidate || null;
  const fresh = payload?.freshCandidate || null;
  const similarity = payload?.similarity || null;
  const similarityWeights = payload?.similarityWeights || {};
  const similarityDetails = similarity?.details || {};
  const candidateMatches = Array.isArray(similarity?.candidateMatches) ? similarity.candidateMatches : [];
  const resolvedDefaultProfile = buildWeightProfile(similarityWeights.defaults || defaultWeightProfile);
  const effectiveWeightProfile = buildWeightProfile(
    similarityWeights.effective || similarityDetails?.weightProfile?.raw || null,
    resolvedDefaultProfile
  );
  const activeWeightScope = String(
    similarityWeights.activeScope || similarityDetails?.weightProfile?.activeScope || "default"
  )
    .trim()
    .toLowerCase();
  return {
    payload,
    map,
    localFile: payload?.localFile || null,
    stored,
    fresh,
    similarity,
    similarityWeights,
    signature: payload?.signature || null,
    diagnostics: payload?.diagnostics || {},
    similarityDetails,
    candidateMatches,
    closestMatch: candidateMatches[0] || null,
    similaritySearch: String(similaritySearch || ""),
    similarityCampaignLabel:
      similarityDetails?.targetCampaignName || map.campaign || similarity?.referenceCampaignName || "Campaign",
    similarityWarnings: Array.isArray(similarityDetails?.diagnosticWarnings)
      ? similarityDetails.diagnosticWarnings.filter(Boolean)
      : [],
    parserWarnings: [stored?.parserWarning || null, fresh?.parserWarning || null].filter(Boolean),
    campaignWeightProfile: buildWeightProfile(
      similarityWeights?.campaignOverride?.weights || null,
      resolvedDefaultProfile
    ),
    effectiveWeightProfile,
    mapWeightProfile: buildWeightProfile(similarityWeights?.mapOverride?.weights || null, effectiveWeightProfile),
    activeWeightScope,
    activeWeightSummary: formatWeightSummary(effectiveWeightProfile),
  };
}

function renderWarningCard(label, title, warnings) {
  if (!warnings.length) return "";
  return `<div class="card" style="margin-top:.45rem;border-color:rgba(255,138,92,.45);">
        <div class="card-header">
          <div><p class="ws-label">${esc(label)}</p><h3>${esc(title)}</h3></div>
          <span class="pill tone-warn">Warning</span>
        </div>
        <div class="card-body" style="margin-top:.35rem;display:grid;gap:.35rem;">
          ${warnings.map((warning) => `<p style="margin:0;">${esc(warning)}</p>`).join("")}
        </div>
      </div>`;
}

function buildOverviewKvs(context, renderKv) {
  const { map, stored, fresh, similarity, similarityDetails, localFile, signature, diagnostics } = context;
  return [
    renderKv("Campaign", map.campaign || "-"),
    renderKv("Slot", map.slot != null ? String(map.slot) : "-"),
    renderKv("Stored Numbers", formatNumbers(stored?.mapNumbers)),
    renderKv("Fresh Numbers", formatNumbers(fresh?.mapNumbers)),
    renderKv("Similarity Numbers", formatNumbers(similarity?.assignedMapNumbers)),
    renderKv("Stored Auto", stored?.automationState || "-"),
    renderKv("Fresh Auto", fresh?.automationState || "-"),
    renderKv("Stale Stored Row", diagnostics.staleStoredCandidate ? "Yes" : "No"),
    renderKv("Auto Resolvable Now", diagnostics.autoResolvableNow ? "Yes" : "No"),
    renderKv("Parser Pattern", stored?.parserPattern || fresh?.parserPattern || "-"),
    renderKv(
      "Parser Confidence",
      stored?.parserConfidence != null
        ? String(stored.parserConfidence)
        : fresh?.parserConfidence != null
          ? String(fresh.parserConfidence)
          : "-"
    ),
    renderKv("Parser Warning", stored?.parserWarning || fresh?.parserWarning || "-"),
    renderKv("Similarity Top", formatScore(similarity?.topScore)),
    renderKv("Similarity Second", formatScore(similarity?.secondScore)),
    renderKv("Similarity Confidence", formatScore(similarity?.confidence)),
    renderKv("Similarity Weighted", formatScore(context.closestMatch?.weightedScore)),
    renderKv("Similarity Weight Profile", `${context.activeWeightSummary} (${context.activeWeightScope || "default"})`),
    renderKv("Similarity Scope", similarityDetails?.referenceScope || "catalog-canonical-global"),
    renderKv("Reference Campaign", similarity?.referenceCampaignName || "-"),
    renderKv(
      "Reference Slot",
      similarity?.primaryReferenceSlot != null ? String(similarity.primaryReferenceSlot) : "-"
    ),
    renderKv("Local File", localFile?.status || "-"),
    renderKv("Local Path", localFile?.relativePath || "-"),
    renderKv("Local Bytes", localFile?.fileSizeBytes != null ? fmtBytes(localFile.fileSizeBytes) : "-"),
    renderKv("Signature Version", signature?.extractionVersion || "-"),
    renderKv("Signature Status", signature?.sourceStatus || "-"),
    renderKv("Signature Error", signature?.sourceError || "-"),
    renderKv("Why Unmatched", diagnostics.unmatchedReason || "-"),
    renderKv(
      "Auto-Approve",
      diagnostics.autoApproval?.eligible
        ? `Yes (${diagnostics.autoApproval.reason || "eligible"})`
        : diagnostics.autoApproval?.reason
          ? `No (${diagnostics.autoApproval.reason})`
          : "No"
    ),
    renderKv(
      "Close Slot Count",
      similarityDetails?.closeSlotCount != null ? String(similarityDetails.closeSlotCount) : "-"
    ),
    renderKv("Close Slots", formatNumbers(similarityDetails?.closeSlots)),
    renderKv(
      "Reference Maps Scanned",
      similarityDetails?.referenceMapCount != null ? fmtNum(similarityDetails.referenceMapCount) : "-"
    ),
    renderKv(
      "Reference Campaigns Scanned",
      similarityDetails?.referenceCampaignCount != null ? fmtNum(similarityDetails.referenceCampaignCount) : "-"
    ),
  ];
}

function renderClosestMatch(context, { renderKv, renderMapViewerAction }) {
  const { closestMatch, map } = context;
  if (!closestMatch) return `<p class="inline-empty">No stored similarity matches.</p>`;
  return `<div class="drawer-kv" style="margin-top:.45rem;">
      ${renderKv("Closest Map", closestMatch.mapName || closestMatch.mapUid || "-")}
      ${renderKv("Closest Campaign", closestMatch.campaignName || "-")}
      ${renderKv("Closest Slot", closestMatch.slot != null ? String(closestMatch.slot) : "-")}
      ${renderKv("Closest Final Score", formatScore(closestMatch.score))}
      ${renderKv("Closest Weighted Score", formatScore(closestMatch.weightedScore))}
      ${renderKv("Closest Content Score", formatScore(closestMatch.contentScore))}
      ${renderKv("Closest Name Score", formatScore(closestMatch.nameScore))}
    </div>
    <div style="margin-top:.6rem;display:flex;gap:.35rem;flex-wrap:wrap;">
      ${renderMapViewerAction(map.mapUid || "", closestMatch.mapUid || "")}
    </div>`;
}

function renderOverviewPanel(context, dependencies) {
  const { map, similarityDetails } = context;
  const similarityMeta = similarityDetailMeta(similarityDetails?.matchClassification);
  const parserWarnings = renderWarningCard("Parser Warning", "Regex Missed A Color-Set Name", [
    ...new Set(context.parserWarnings),
  ]);
  const similarityWarnings = renderWarningCard(
    "Similarity Warning",
    "Degraded Reference Coverage",
    context.similarityWarnings
  );
  return `<section class="drawer-tabpanel" data-drawer-tab-panel="overview">
      <div class="drawer-section">
        <h3 style="font-size:.92rem;">${escN(map.name || map.mapUid || "Map")}</h3>
        <p class="card-body">${esc(map.mapUid || "-")}</p>
        <div class="drawer-kv">${buildOverviewKvs(context, dependencies.renderKv).join("")}</div>
      </div>
      <div class="drawer-section">
        <div style="display:flex;justify-content:space-between;align-items:center;gap:.5rem;flex-wrap:wrap;">
          <h3 style="font-size:.92rem;">Closest Similarity</h3>
          <div style="display:flex;gap:.35rem;align-items:center;flex-wrap:wrap;">
            <span class="pill ${similarityMeta.tone}">${esc(similarityMeta.label)}</span>
            <button class="btn outline small" type="button" data-recompute-similarity="${esc(map.mapUid || "")}">Recompute Similarity</button>
            <button class="btn ghost small" type="button" data-open-similarity-weights="${esc(String(map.campaignId || ""))}">Similarity Weights</button>
          </div>
        </div>
        ${similarityDetails?.matchWarning ? `<p class="card-body" style="margin-top:.35rem;">${esc(similarityDetails.matchWarning)}</p>` : ""}
        ${parserWarnings}
        ${similarityWarnings}
        ${renderClosestMatch(context, dependencies)}
      </div>
    </section>`;
}

function renderWeightCards(context, renderSimilarityWeightScopeCard) {
  const { map, similarityWeights, activeWeightScope, campaignWeightProfile, mapWeightProfile } = context;
  return `<div class="similarity-weight-grid" style="margin-top:.6rem;">
    ${renderSimilarityWeightScopeCard({
      scope: "campaign",
      title: `Campaign · ${map.campaign || "Unassigned"}`,
      description: "Applies to every map in this campaign on future similarity recomputes and rescans.",
      mapUid: map.mapUid || "",
      activeScope: activeWeightScope,
      hasOverride: Boolean(similarityWeights?.campaignOverride),
      disabled: !map.campaignId,
      disabledMessage: "This map is not linked to a campaign yet, so a campaign-level profile cannot be saved.",
      profile: campaignWeightProfile,
    })}
    ${renderSimilarityWeightScopeCard({
      scope: "map",
      title: `Map · ${stripFmt(map.name || map.mapUid || "Current Map")}`,
      description: "Overrides the campaign/default profile for just this one map.",
      mapUid: map.mapUid || "",
      activeScope: activeWeightScope,
      hasOverride: Boolean(similarityWeights?.mapOverride),
      profile: mapWeightProfile,
    })}
  </div>`;
}

function renderCandidateRow(context, match, index, dependencies) {
  return `<tr
      data-naming-similarity-row
      data-similarity-rank="${esc(String(index + 1))}"
      data-similarity-search-text="${esc(dependencies.buildSimilarityMatchSearchText(match))}"
    >
      <td>${esc(String(index + 1))}</td>
      <td><input type="checkbox" name="candidateMapUid" value="${esc(match.mapUid || "")}" ${match.isAssignedBySystem ? "checked" : ""} /></td>
      <td><strong>${escN(match.mapName || match.mapUid || "-")}</strong><div style="font-size:.72rem;color:var(--a-muted);margin-top:.15rem;">${esc(match.campaignName || "-")}</div><div style="font-size:.72rem;color:var(--a-muted);margin-top:.12rem;">${esc(match.mapUid || "-")}</div></td>
      <td>${esc(String(match.slot || "-"))}</td>
      <td><div style="display:flex;gap:.25rem;flex-wrap:wrap;">${match.isCloseMatch ? `<span class="pill tone-warn">close</span>` : ""}${match.isAssignedBySystem ? `<span class="pill tone-info">selected</span>` : ""}</div></td>
      <td>${dependencies.renderMapViewerAction(context.map.mapUid || "", match.mapUid || "", "Open")}</td>
      <td>${esc(formatScore(match.modelScore))}</td>
      <td>${esc(formatScore(match.absoluteScore))}</td>
      <td>${esc(formatScore(match.relativeScore))}</td>
      <td>${esc(formatScore(match.weightedScore))}</td>
      <td>${esc(formatScore(match.nameScore))}</td>
      <td>${esc(formatScore(match.score))}</td>
    </tr>`;
}

function renderCandidateSelection(context, dependencies) {
  if (!context.candidateMatches.length) return `<p class="inline-empty">No stored similarity matches.</p>`;
  const rows = context.candidateMatches
    .map((match, index) => renderCandidateRow(context, match, index, dependencies))
    .join("");
  return `<div style="margin-top:.5rem;display:grid;gap:.45rem;">
      <label class="field" style="max-width:26rem;">
        <span>Search Similar Maps</span>
        <input type="search" value="${esc(context.similaritySearch)}" placeholder="Map, campaign, UID, or slot" data-naming-similarity-search-input />
      </label>
      <span style="font-size:.76rem;color:var(--a-muted);" data-naming-similarity-search-count></span>
    </div>
    <form data-drawer-form="similarity-selection" class="config-form" style="margin-top:.35rem;">
      <input type="hidden" name="mapUid" value="${esc(context.map.mapUid || "")}" />
      <div class="table-wrap drawer-wide"><table class="data-table">
        <thead><tr><th>#</th><th>Pick</th><th>Reference</th><th>Slot</th><th>Flags</th><th>Viewer</th><th>Model</th><th>Abs</th><th>Rel</th><th>Weighted</th><th>Name</th><th>Final</th></tr></thead>
        <tbody>${rows}</tbody>
      </table></div>
      <p class="inline-empty" data-naming-similarity-search-empty hidden style="margin-top:.6rem;">No similar maps match this search.</p>
      <div data-naming-similarity-pagination style="margin-top:.55rem;display:flex;justify-content:space-between;align-items:center;gap:.5rem;flex-wrap:wrap;" hidden>
        <span style="font-size:.76rem;color:var(--a-muted);" data-naming-similarity-page-label></span>
        <div style="display:flex;gap:.35rem;align-items:center;flex-wrap:wrap;">
          <button class="btn outline small" type="button" data-naming-similarity-page="prev">Previous 5</button>
          <button class="btn outline small" type="button" data-naming-similarity-page="next">Next 5</button>
        </div>
      </div>
      <div class="form-footer" style="margin-top:.6rem;display:flex;gap:.35rem;flex-wrap:wrap;">
        <button class="btn outline small" type="submit" name="selectionMode" value="apply">Apply Selected</button>
        <button class="btn primary small" type="submit" name="selectionMode" value="approve">Apply + Approve</button>
      </div>
    </form>`;
}

function renderSimilarityPanel(context, dependencies) {
  const similarityWarnings = renderWarningCard(
    "Similarity Warning",
    "Degraded Reference Coverage",
    context.similarityWarnings
  );
  return `<section class="drawer-tabpanel" data-drawer-tab-panel="similarity" hidden>
      <div class="drawer-section">
        <div style="display:flex;justify-content:space-between;align-items:center;gap:.5rem;flex-wrap:wrap;">
          <h3 style="font-size:.92rem;">${escN(context.similarityCampaignLabel)} Ranked Similarity</h3>
          <span style="font-size:.76rem;color:var(--a-muted);">Select one or more ranked references to lock the slot numbers.</span>
        </div>
        ${similarityWarnings}
        ${renderWeightCards(context, dependencies.renderSimilarityWeightScopeCard)}
        ${renderCandidateSelection(context, dependencies)}
      </div>
    </section>`;
}

function renderSignaturePanel(signature, renderKv) {
  const summary =
    signature?.signatureSummary && typeof signature.signatureSummary === "object" ? signature.signatureSummary : null;
  const body = summary
    ? `<div class="drawer-kv">${Object.entries(summary)
        .map(([key, value]) => renderKv(key, String(value)))
        .join("")}</div>`
    : `<p class="inline-empty">No signature summary stored.</p>`;
  return `<section class="drawer-tabpanel" data-drawer-tab-panel="signature" hidden>
      <div class="drawer-section"><h3 style="font-size:.92rem;">Signature Summary</h3>${body}</div>
    </section>`;
}

function renderStatusNote(payload) {
  if (payload?.loading) {
    return `<div class="drawer-section"><p class="card-body">Loading the latest naming diagnostics...</p></div>`;
  }
  if (payload?.loadError) {
    return `<div class="drawer-section"><p class="card-body">Showing the row snapshot because the full naming detail request failed: ${esc(payload.loadError)}</p></div>`;
  }
  return "";
}

export function renderNamingDetailMarkup(context, dependencies) {
  return `<div class="drawer-tabbar">
      <button class="drawer-tabbtn" type="button" data-drawer-tab="overview" aria-selected="true">Overview</button>
      <button class="drawer-tabbtn" type="button" data-drawer-tab="similarity" aria-selected="false">Similarity</button>
      <button class="drawer-tabbtn" type="button" data-drawer-tab="signature" aria-selected="false">Signature</button>
    </div>
    ${renderStatusNote(context.payload)}
    ${renderOverviewPanel(context, dependencies)}
    ${renderSimilarityPanel(context, dependencies)}
    ${renderSignaturePanel(context.signature, dependencies.renderKv)}`;
}

export { buildOverviewKvs, formatNumbers, formatScore, renderCandidateSelection, renderStatusNote, renderWarningCard };
