import { esc, escN, fmtDateTime, fmtDuration, fmtNum, fmtTimeAgo } from "./formatters.js?v=2";

function readCounter(counters, summary, key) {
  return Number(counters[key] !== undefined ? counters[key] : summary[key] || 0);
}

function calculatePercent({ emptySelection, total, processed, progress, hasSummary }) {
  const raw = emptySelection
    ? 0
    : total > 0
      ? Math.round((processed / total) * 100)
      : progress.percent !== undefined
        ? progress.percent
        : hasSummary
          ? 100
          : 0;
  return Math.max(0, Math.min(100, Number(raw) || 0));
}

function resolveTone(status, { active, canceled, emptySelection }) {
  if (active) return "tone-info";
  if (canceled) return "tone-muted";
  if (status.lastError) return "tone-error";
  if (emptySelection) return "tone-muted";
  return status.lastSummary ? "tone-success" : "tone-muted";
}

function resolveTitle(status, { active, canceled, emptySelection, rescanAll }) {
  if (active) return rescanAll ? "Similarity Full Rescan Running" : "Similarity Backfill Running";
  if (canceled) return "Similarity Backfill Canceled";
  if (status.lastError) return "Similarity Backfill Failed";
  if (emptySelection) return "No Matching Maps";
  if (!status.lastSummary) return "Similarity Backfill";
  return rescanAll ? "Similarity Full Rescan Complete" : "Similarity Backfill Complete";
}

function resolveMessage(status, model) {
  if (model.emptySelection) return "No maps matched the current filter.";
  const progressMessage = String(model.progress.message || "").trim();
  if (progressMessage) return progressMessage;
  const error = String(status.lastError || "").trim();
  if (error) return error;
  if (model.canceled) return "Canceled.";
  return status.lastSummary
    ? `Processed ${fmtNum(model.summary.processed || 0)} maps in ${fmtDuration(status.lastDurationMs)}.`
    : "";
}

function buildSimilarityStatusModel(status, { isRunning, now = Date.now() }) {
  const progress = status.progress || {};
  const progressState = String(progress.status || "")
    .trim()
    .toLowerCase();
  const progressStage = String(progress.stage || "")
    .trim()
    .toLowerCase();
  const canceled = progressStage === "canceled" || progressState === "canceled";
  const counters = progress.counters || {};
  const summary = status.lastSummary || {};
  const emptySelection = Boolean(progress.emptySelection || summary.emptySelection);
  const total = Number(
    counters.total !== undefined
      ? counters.total
      : emptySelection
        ? 0
        : summary.selectedMaps !== undefined
          ? summary.selectedMaps
          : summary.processed || 0
  );
  const processed = readCounter(counters, summary, "processed");
  const rescanAll = Boolean(progress.rescanAll || summary.rescanAll);
  const active = isRunning(status);
  const elapsedMs = status.running && status.lastStartedAt ? Math.max(0, now - Date.parse(status.lastStartedAt)) : 0;
  const recentMaps =
    Array.isArray(progress.recentMaps) && progress.recentMaps.length
      ? progress.recentMaps
      : Array.isArray(summary.recentMaps)
        ? summary.recentMaps
        : [];
  const model = {
    status,
    progress,
    summary,
    active,
    canceled,
    emptySelection,
    rescanAll,
    total,
    processed,
    resolved: readCounter(counters, summary, "resolved"),
    changedCandidates: readCounter(counters, summary, "changedCandidates"),
    refreshedSimilarityRecords: readCounter(counters, summary, "refreshedSimilarityRecords"),
    upgradedLegacySimilarityRecords: readCounter(counters, summary, "upgradedLegacySimilarityRecords"),
    similarityRowsWritten: readCounter(counters, summary, "similarityRowsWritten"),
    candidateRowsWritten: readCounter(counters, summary, "candidateRowsWritten"),
    autoApproved: readCounter(counters, summary, "autoApproved"),
    targetSignaturesReady: Number(counters.targetSignaturesReady || 0),
    targetSignaturesTotal: Number(counters.targetSignaturesTotal || 0),
    referenceSignaturesReady: Number(counters.referenceSignaturesReady || 0),
    referenceSignaturesTotal: Number(counters.referenceSignaturesTotal || 0),
    lastTouchedAt: progress.updatedAt || status.lastFinishedAt || status.lastStartedAt || null,
    elapsedMs,
    missingFamilies: Array.isArray(summary.missingReferenceFamilies) ? summary.missingReferenceFamilies : [],
    targetClubId: Number(progress.targetClubId || summary.targetClubId || 0) || null,
    recentMaps,
  };
  model.percent = calculatePercent({
    emptySelection,
    total,
    processed,
    progress,
    hasSummary: Boolean(status.lastSummary),
  });
  model.toneClassName = resolveTone(status, model);
  model.title = resolveTitle(status, model);
  model.message = resolveMessage(status, model);
  return model;
}

function renderRecentMapCards(recentMaps) {
  return recentMaps
    .map((entry) => {
      const numbers =
        Array.isArray(entry?.mapNumbers) && entry.mapNumbers.length ? entry.mapNumbers.join(", ") : "unresolved";
      const reference = [
        entry?.referenceCampaignName || "",
        entry?.primaryReferenceSlot != null ? `slot ${entry.primaryReferenceSlot}` : "",
      ].filter(Boolean);
      const confidence = Number.isFinite(Number(entry?.confidence))
        ? `conf ${Number(entry.confidence).toFixed(3)}`
        : "";
      const note = [
        entry?.campaignName || "",
        entry?.slot != null ? `slot ${entry.slot}` : "",
        reference.length ? `ref ${reference.join(" / ")}` : "",
        confidence,
        entry?.manualSelection ? "manual selection" : "",
      ]
        .filter(Boolean)
        .join(" | ");
      return `<div class="stat-card">
          <div class="label">${escN(entry?.mapName || entry?.mapUid || "Map")}</div>
          <div class="value">${esc(numbers)}</div>
          <div class="note">${escN(note || entry?.mapUid || "-")}</div>
        </div>`;
    })
    .join("");
}

function renderStatusPill(model) {
  if (model.active) return `${esc(String(model.percent))}%`;
  if (model.status.lastError) return "Error";
  if (model.canceled) return "Canceled";
  if (model.emptySelection) return "No matches";
  return "Complete";
}

function buildStatusMeta(model) {
  const entries = [
    `${fmtNum(model.processed)} / ${fmtNum(model.total || model.processed)} processed`,
    `${fmtNum(model.resolved)} resolved`,
    `${fmtNum(model.refreshedSimilarityRecords)} refreshed`,
    `${fmtNum(model.upgradedLegacySimilarityRecords)} upgraded`,
    `${fmtNum(model.changedCandidates)} changed`,
  ];
  if (model.similarityRowsWritten) entries.push(`${fmtNum(model.similarityRowsWritten)} similarity rows`);
  if (model.candidateRowsWritten) entries.push(`${fmtNum(model.candidateRowsWritten)} candidate rows`);
  if (model.autoApproved) entries.push(`${fmtNum(model.autoApproved)} auto-approved`);
  if (model.targetSignaturesTotal) {
    entries.push(`target signatures ${fmtNum(model.targetSignaturesReady)} / ${fmtNum(model.targetSignaturesTotal)}`);
  }
  if (model.referenceSignaturesTotal) {
    entries.push(
      `reference signatures ${fmtNum(model.referenceSignaturesReady)} / ${fmtNum(model.referenceSignaturesTotal)}`
    );
  }
  if (model.rescanAll) entries.push("all-map rescan");
  if (model.targetClubId) entries.push(`club ${model.targetClubId}`);
  if (model.elapsedMs > 0) entries.push(`Running ${fmtDuration(model.elapsedMs)}`);
  if (model.lastTouchedAt) {
    entries.push(
      model.active ? `Updated ${fmtTimeAgo(model.lastTouchedAt)}` : `Finished ${fmtDateTime(model.lastTouchedAt)}`
    );
  }
  if (model.missingFamilies.length) entries.push(`${fmtNum(model.missingFamilies.length)} missing families`);
  return entries.map((entry) => `<span>${esc(entry)}</span>`).join("");
}

export function renderSimilarityBackfillStatusMarkup(
  status,
  { compact = false, isRunning, renderDiagnostics = () => "", now = Date.now() } = {}
) {
  if (!status) return "";
  const model = buildSimilarityStatusModel(status, { isRunning, now });
  if (!model.active && !status.lastError && !status.lastSummary) return "";
  const recentMapCards = renderRecentMapCards(model.recentMaps);
  return `<div class="similarity-progress ${compact ? "similarity-progress-compact" : ""}">
      <div class="similarity-progress-top">
        <div><strong>${esc(model.title)}</strong><span>${esc(model.message || "Preparing similarity backfill...")}</span></div>
        <span class="pill ${model.toneClassName}">${renderStatusPill(model)}</span>
      </div>
      <div class="similarity-progress-track" aria-hidden="true">
        <div class="similarity-progress-fill ${status.lastError ? "is-error" : ""}" style="width:${model.percent}%"></div>
      </div>
      <div class="similarity-progress-meta">${buildStatusMeta(model)}</div>
      ${model.active && model.progress.currentMapName ? `<p class="similarity-progress-current">Current: ${escN(model.progress.currentMapName)}${model.progress.currentMapUid ? ` (${esc(model.progress.currentMapUid)})` : ""}</p>` : ""}
      ${renderDiagnostics({ compact })}
      ${recentMapCards ? `<div class="g-auto" style="margin-top:.55rem;">${recentMapCards}</div>` : ""}
    </div>`;
}

export {
  buildSimilarityStatusModel,
  buildStatusMeta,
  calculatePercent,
  renderRecentMapCards,
  resolveMessage,
  resolveTitle,
};
