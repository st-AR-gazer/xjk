const mapDrop = document.getElementById("mapDrop");
const replayDrop = document.getElementById("replayDrop");
const manualDrop = document.getElementById("manualDrop");
const mapInput = document.getElementById("mapFile");
const replayInput = document.getElementById("replayFile");
const manualInput = document.getElementById("manualFile");
const mapName = document.getElementById("mapName");
const replayName = document.getElementById("replayName");
const manualName = document.getElementById("manualName");

const strictGpsInput = document.getElementById("strictGps");
const noGpsInput = document.getElementById("noGps");
const includePathInput = document.getElementById("includePath");
const dataDumpInput = document.getElementById("dataDump");
const gpsThresholdInput = document.getElementById("gpsThresholdMs");
const maxDepthInput = document.getElementById("maxDepth");

const goBtn = document.getElementById("go");
const summaryPanel = document.getElementById("summary");
const summaryGrid = document.getElementById("summaryGrid");
const summaryNote = document.getElementById("summaryNote");

let selectedMap = null;
let selectedReplay = null;
let selectedManual = null;

const {
  bindFileDropZone,
  createSummaryRow,
  createStandardJsonResultBindings,
  createStandardToolUi,
  formatTransferProgress,
  isMapGbxFilename,
  parseJsonOrNull,
  selectUploadFile,
  sendXhr,
} = window.ToolTheme;
const {
  hideOverlay,
  overlayTextElement: overlayText,
  progressTextElement: progressText,
  setError,
  setStatus,
  showOverlay,
} = createStandardToolUi();
const { render: renderJsonResult } = createStandardJsonResultBindings({
  downloadName: "map-validation-result.json",
  setStatus,
  setError,
});

function isReplayFilename(name) {
  return String(name || "")
    .toLowerCase()
    .endsWith(".replay.gbx");
}

function onMapPick(file) {
  selectedMap = selectUploadFile({
    file,
    dropElement: mapDrop,
    nameElement: mapName,
    submitElement: goBtn,
    emptyLabel: "No map selected",
    invalidMessage: "Map input must be .Map.Gbx / .Gbx.",
    accepts: (candidate) => isMapGbxFilename(candidate.name),
    setError,
    setStatus,
  });
}

function onReplayPick(file) {
  selectedReplay = selectUploadFile({
    file,
    dropElement: replayDrop,
    nameElement: replayName,
    emptyLabel: "No replay selected",
    invalidMessage: "Replay file must be .Replay.Gbx.",
    accepts: (candidate) => isReplayFilename(candidate.name),
    controlsSubmit: false,
    setError,
    setStatus,
  });
}

function onManualPick(file) {
  selectedManual = selectUploadFile({
    file,
    dropElement: manualDrop,
    nameElement: manualName,
    emptyLabel: "No manual file selected",
    invalidMessage: "Manual overrides file must be JSON.",
    accepts: (candidate) =>
      String(candidate.name || "")
        .toLowerCase()
        .endsWith(".json"),
    controlsSubmit: false,
    setError,
    setStatus,
  });
}

function renderSummary(result, exitCode) {
  summaryGrid.replaceChildren();
  summaryGrid.append(
    createSummaryRow("UID", result?.uid || "Unknown"),
    createSummaryRow("Map Name", result?.mapName || "Unknown"),
    createSummaryRow("Validated", result?.validated || "Unknown"),
    createSummaryRow("Type", result?.type || "Unknown"),
    createSummaryRow("Replay Path", result?.replayPath || "N/A"),
    createSummaryRow("Error", result?.error || "None")
  );

  if (result?.note) {
    summaryNote.textContent = `Note: ${result.note}`;
  } else if (Number.isInteger(exitCode) && exitCode !== 0) {
    summaryNote.textContent = `Checker completed with exit code ${exitCode}.`;
  } else {
    summaryNote.textContent = "";
  }

  summaryPanel.classList.remove("hidden");
}

function renderResult(result) {
  renderJsonResult(result);
}

function buildFormData() {
  const form = new FormData();
  form.append("map", selectedMap, selectedMap.name);
  if (selectedReplay) form.append("replay", selectedReplay, selectedReplay.name);
  if (selectedManual) form.append("manual", selectedManual, selectedManual.name);

  form.append("strictGps", String(Boolean(strictGpsInput.checked)));
  form.append("noGps", String(Boolean(noGpsInput.checked)));
  form.append("includePath", String(Boolean(includePathInput.checked)));
  form.append("dataDump", String(Boolean(dataDumpInput.checked)));
  form.append("gpsThresholdMs", String(gpsThresholdInput.value || "100"));
  form.append("maxDepth", String(maxDepthInput.value || "20"));
  form.append("pretty", "true");

  return form;
}

async function runCheck() {
  if (!selectedMap) return;

  setError("");
  setStatus("");
  showOverlay("Uploading files...");

  goBtn.disabled = true;

  try {
    const xhr = await sendXhr({
      url: "api/check",
      body: buildFormData(),
      onUploadProgress(event) {
        if (!event.lengthComputable) return;
        overlayText.textContent = "Uploading...";
        progressText.textContent = formatTransferProgress(event);
      },
      onUploadComplete() {
        overlayText.textContent = "Running validation checker...";
        progressText.textContent = "";
      },
    });
    const payload = parseJsonOrNull(xhr.responseText || "{}");
    if (xhr.status !== 200 || !payload?.ok) {
      setError(payload?.error || "Validation check failed.");
      return;
    }

    renderSummary(payload.result, payload.toolExitCode);
    renderResult(payload.result);

    if (Number.isInteger(payload.toolExitCode) && payload.toolExitCode !== 0) {
      setStatus(`Validation checker completed with exit code ${payload.toolExitCode}.`);
    } else {
      setStatus("Validation checker completed.");
    }
  } catch (error) {
    setError(error?.code === "timeout" ? "Request timed out." : "Network error while running checker.");
  } finally {
    goBtn.disabled = false;
    hideOverlay();
  }
}

goBtn.addEventListener("click", runCheck);

bindFileDropZone(mapDrop, mapInput, onMapPick);
bindFileDropZone(replayDrop, replayInput, onReplayPick);
bindFileDropZone(manualDrop, manualInput, onManualPick);
