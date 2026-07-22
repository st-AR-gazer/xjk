import "/shared/xjk-core/safe-html.js?v=2";
import { requestJson, requestJsonQuiet, requestUpload, validateLookupValue } from "./api.js";
import { elements } from "./dom.js";
import { formatTimestamp, textOrFallback } from "./format.js";
import { loadMap } from "./lookups.js";
import { renderRecentHistoryPanel } from "./product-panels.js";
import { renderSubmissionResult } from "./renderers.js";
import { rememberRecentEntry } from "./recent-history.js";
import { absoluteUrlForPath, buildRecordPath } from "./routes.js";
import { state } from "./state.js";
import { resetMessages, setError, setStatus, setSubmissionStatus } from "./ui.js";
import { verificationMap } from "./verifications.js";
import { activateWorkspace } from "./workspace.js";
import { escapeHtml } from "/shared/xjk-core/dom-utils.js";

function stopSubmissionPolling() {
  if (!state.submissionPollTimer) {
    return;
  }

  clearInterval(state.submissionPollTimer);
  state.submissionPollTimer = null;
}

function selectedFileFingerprint(file) {
  if (!file) return "";
  return `${file.name}|${file.size}|${file.lastModified}`;
}

function getSelectedFile(kind) {
  return kind === "map" ? elements.mapFileInput.files?.[0] || null : elements.replayFileInput.files?.[0] || null;
}

function syncArtifactStateToCurrentFile(kind) {
  const selectedFile = getSelectedFile(kind);
  const fingerprint = selectedFileFingerprint(selectedFile);

  if (!state.uploadState[kind]) {
    return;
  }

  if (state.uploadState[kind].fingerprint !== fingerprint) {
    state.uploadState[kind] = null;
  }
}

function openMapFromSubmission(mapUid) {
  elements.mapInput.value = mapUid || "";
  void loadMap(mapUid || "", { updateHistory: true });
}

function copySubmissionRecordLink(recordId) {
  const absoluteUrl = absoluteUrlForPath(buildRecordPath(recordId));
  if (navigator.clipboard?.writeText) {
    navigator.clipboard.writeText(absoluteUrl).then(
      () => setStatus("Canonical record link copied."),
      () => setStatus(absoluteUrl)
    );
    return;
  }

  setStatus(absoluteUrl);
}

function rememberSubmission(bundle, submissionId) {
  rememberRecentEntry({
    type: "submission",
    label: submissionId ? `Submission ${submissionId}` : `Submission ${bundle.record_id}`,
    href: buildRecordPath(bundle.record_id),
    meta: bundle.map_uid ? `Record ${bundle.record_id} · Map ${bundle.map_uid}` : `Record ${bundle.record_id}`,
    summary: `Canonical route · replay ${verificationMap(bundle.verifications).replay.status}`,
  });
  renderRecentHistoryPanel();
}

export function renderArtifactStatus() {
  elements.artifactStatus.replaceChildren();

  const kinds = [
    { key: "map", label: "Map upload" },
    { key: "replay", label: "Replay upload" },
  ];

  for (const item of kinds) {
    const currentState = state.uploadState[item.key];
    const card = document.createElement("article");
    card.className = "artifact-card";

    if (!currentState) {
      globalThis.XjkSafeHtml.set(
        card,
        `
        <div class="artifact-head">
          <h3>${escapeHtml(item.label)}</h3>
          <span class="pill pill-not_run">Not uploaded</span>
        </div>
        <p class="artifact-copy">No public artifact ref has been created for the current file selection yet.</p>
      `
      );
      elements.artifactStatus.appendChild(card);
      continue;
    }

    const tone = currentState.error ? "fail" : currentState.status === "uploaded" ? "pass" : "pending";

    globalThis.XjkSafeHtml.set(
      card,
      `
      <div class="artifact-head">
        <h3>${escapeHtml(item.label)}</h3>
        <span class="pill pill-${tone}">${currentState.error ? "Error" : currentState.reused ? "Reused" : "Uploaded"}</span>
      </div>
      <p class="artifact-copy">${escapeHtml(
        textOrFallback(
          currentState.error ||
            `${currentState.fileName} - ${currentState.sizeBytes || currentState.size_bytes || "?"} bytes`
        )
      )}</p>
      <div class="artifact-meta">
        <div class="artifact-meta-card"><div class="artifact-meta-label">Artifact ref</div><div class="artifact-meta-value">${escapeHtml(textOrFallback(currentState.artifact_ref))}</div></div>
        <div class="artifact-meta-card"><div class="artifact-meta-label">SHA-256</div><div class="artifact-meta-value">${escapeHtml(textOrFallback(currentState.sha256))}</div></div>
        <div class="artifact-meta-card"><div class="artifact-meta-label">Expires</div><div class="artifact-meta-value">${escapeHtml(formatTimestamp(currentState.expires_at))}</div></div>
      </div>
    `
    );
    elements.artifactStatus.appendChild(card);
  }
}

export function resetArtifactState(kind) {
  state.uploadState[kind] = null;
  renderArtifactStatus();
}

export async function uploadArtifact(kind) {
  activateWorkspace("submission");
  syncArtifactStateToCurrentFile(kind);

  const file = getSelectedFile(kind);
  if (!file) {
    throw new Error(kind === "map" ? "Select a map file first." : "Select a replay file first.");
  }

  const endpoint = kind === "map" ? "/api/v1/uploads/map" : "/api/v1/uploads/replay";
  const upload = await requestUpload(
    `${endpoint}?filename=${encodeURIComponent(file.name)}`,
    file,
    kind === "map" ? "Uploading map artifact..." : "Uploading replay artifact..."
  );

  state.uploadState[kind] = {
    ...upload,
    fingerprint: selectedFileFingerprint(file),
    fileName: file.name,
  };

  renderArtifactStatus();
  setSubmissionStatus(
    kind === "map" ? `Map upload ready: ${upload.artifact_ref}` : `Replay upload ready: ${upload.artifact_ref}`,
    "success"
  );

  return state.uploadState[kind];
}

async function ensureUploadedArtifact(kind) {
  syncArtifactStateToCurrentFile(kind);

  if (state.uploadState[kind]?.artifact_ref) {
    return state.uploadState[kind];
  }

  return uploadArtifact(kind);
}

function submissionRecordBundle(submission, recordId, mapUid, rank) {
  if (submission?.record) {
    return submission.record;
  }

  return {
    record_id: recordId,
    map_uid: mapUid,
    rank,
    updated_at: null,
    verifications: [],
  };
}

export async function pollSubmittedRecord({ silent = false } = {}) {
  activateWorkspace("submission");
  const recordId = validateLookupValue(
    state.lastSubmittedRecordId || elements.submissionRecordIdInput.value,
    "Record ID"
  );

  const bundle = await requestJsonQuiet(`/api/v1/records/${encodeURIComponent(recordId)}`);

  renderSubmissionResult(bundle, state.lastSubmissionId, {
    onOpenMap: openMapFromSubmission,
    onCopyLink: (currentBundle) => copySubmissionRecordLink(currentBundle.record_id),
  });

  const replayVerification = verificationMap(bundle.verifications).replay;

  if (!silent) {
    setSubmissionStatus(
      `Canonical record status refreshed: replay=${textOrFallback(replayVerification.status)}`,
      replayVerification.status === "pass"
        ? "success"
        : replayVerification.status === "fail" || replayVerification.status === "unavailable"
          ? "error"
          : "neutral"
    );
  }

  if (["pass", "fail", "unavailable"].includes(replayVerification.status)) {
    stopSubmissionPolling();
  }

  state.lastSubmittedRecordId = bundle.record_id || recordId;
  return bundle;
}

function startSubmissionPolling(recordId) {
  stopSubmissionPolling();
  state.lastSubmittedRecordId = recordId;
  state.submissionPollTimer = setInterval(() => {
    pollSubmittedRecord({ silent: true }).catch(() => {});
  }, 5000);
}

export async function submitReplayVerification() {
  try {
    activateWorkspace("submission");
    resetMessages();

    const recordId = validateLookupValue(elements.submissionRecordIdInput.value, "Record ID");
    const mapUid = validateLookupValue(elements.submissionMapUidInput.value, "Map UID");
    const rankText = String(elements.submissionRankInput.value || "").trim();
    const rank = rankText === "" ? null : Number.parseInt(rankText, 10);

    if (rankText !== "" && (!Number.isInteger(rank) || rank < 0)) {
      throw new Error("Rank must be a non-negative integer when provided.");
    }

    const mapUpload = await ensureUploadedArtifact("map");
    const replayUpload = await ensureUploadedArtifact("replay");

    const submission = await requestJson("/api/v1/submissions/replay", "Submitting replay verification...", {
      method: "POST",
      body: {
        record_id: recordId,
        map_uid: mapUid,
        rank,
        map_ref: mapUpload.artifact_ref,
        replay_ref: replayUpload.artifact_ref,
      },
    });

    const recordBundle = submissionRecordBundle(submission, recordId, mapUid, rank);
    state.lastSubmissionId = submission.submission_id || "";
    state.lastSubmittedRecordId = recordBundle.record_id || recordId;

    renderSubmissionResult(recordBundle, state.lastSubmissionId, {
      onOpenMap: openMapFromSubmission,
      onCopyLink: (currentBundle) => copySubmissionRecordLink(currentBundle.record_id),
    });
    rememberSubmission(recordBundle, state.lastSubmissionId);

    setSubmissionStatus(
      `Submission accepted as ${textOrFallback(state.lastSubmissionId)}. Watching the canonical record route for updates...`,
      "success"
    );
    setStatus("Replay submission accepted.");

    elements.recordInput.value = recordId;
    elements.mapInput.value = mapUid;

    startSubmissionPolling(state.lastSubmittedRecordId);
  } catch (error) {
    if (error.name === "AbortError") {
      return;
    }

    setSubmissionStatus(error?.message || "Replay submission failed.", "error");
    setError(error?.message || "Replay submission failed.");
  }
}
