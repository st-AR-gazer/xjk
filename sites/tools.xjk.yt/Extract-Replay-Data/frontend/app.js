const replayDrop = document.getElementById("replayDrop");
const requestDrop = document.getElementById("requestDrop");
const replayInput = document.getElementById("replayFile");
const requestFileInput = document.getElementById("requestFile");
const replayName = document.getElementById("replayName");
const requestName = document.getElementById("requestName");

const includeNullsInput = document.getElementById("includeNulls");
const prettyPrintInput = document.getElementById("prettyPrint");
const maxDepthInput = document.getElementById("maxDepth");
const maxCollectionItemsInput = document.getElementById("maxCollectionItems");
const requestJsonTextInput = document.getElementById("requestJsonText");

const goBtn = document.getElementById("go");
const statusEl = document.getElementById("status");
const errorEl = document.getElementById("error");

const summaryPanel = document.getElementById("summary");
const summaryGrid = document.getElementById("summaryGrid");

const resultPanel = document.getElementById("resultPanel");
const resultJson = document.getElementById("resultJson");
const copyBtn = document.getElementById("copyBtn");
const downloadBtn = document.getElementById("downloadBtn");

const overlay = document.getElementById("overlay");
const overlayText = document.getElementById("overlayText");
const progressText = document.getElementById("progressText");

let selectedReplay = null;
let selectedRequestFile = null;

const {
  bindFileDropZone,
  createJsonResultBindings,
  createSummaryRow,
  createToolUiBindings,
  formatKilobytes,
  formatTransferProgress,
  parseJsonOrNull,
  sendXhr,
  setDropZoneReady,
} = window.ToolTheme;
const { hideOverlay, setError, setStatus, showOverlay } = createToolUiBindings({
  statusElement: statusEl,
  errorElement: errorEl,
  overlayElement: overlay,
  overlayTextElement: overlayText,
  progressTextElement: progressText,
});
const {
  copy: copyJsonResult,
  download: downloadJsonResult,
  render: renderJsonResult,
} = createJsonResultBindings({
  resultElement: resultJson,
  panelElement: resultPanel,
  downloadName: "replay-extract.json",
  setStatus,
  setError,
});

function onReplayPick(file) {
  setError("");
  setStatus("");

  if (!file) {
    selectedReplay = null;
    replayName.textContent = "No replay selected";
    setDropZoneReady(replayDrop, selectedReplay);
    goBtn.disabled = true;
    return;
  }

  const lower = String(file.name || "").toLowerCase();
  if (!lower.endsWith(".replay.gbx")) {
    selectedReplay = null;
    replayName.textContent = "No replay selected";
    setDropZoneReady(replayDrop, selectedReplay);
    goBtn.disabled = true;
    setError("Replay input must be a .Replay.Gbx file.");
    return;
  }

  selectedReplay = file;
  replayName.textContent = `Selected: ${file.name} (${formatKilobytes(file.size)})`;
  setDropZoneReady(replayDrop, selectedReplay);
  goBtn.disabled = false;
}

function onRequestPick(file) {
  setError("");
  setStatus("");

  if (!file) {
    selectedRequestFile = null;
    requestName.textContent = "No request file selected";
    setDropZoneReady(requestDrop, selectedRequestFile);
    return;
  }

  const lower = String(file.name || "").toLowerCase();
  if (!lower.endsWith(".json")) {
    selectedRequestFile = null;
    requestName.textContent = "No request file selected";
    setDropZoneReady(requestDrop, selectedRequestFile);
    setError("Request file must be JSON.");
    return;
  }

  selectedRequestFile = file;
  requestName.textContent = `Selected: ${file.name} (${formatKilobytes(file.size)})`;
  setDropZoneReady(requestDrop, selectedRequestFile);
}

function renderSummary(result) {
  const replayType = result?.$type || result?.replayType || "Unknown";
  const ghostCount = Array.isArray(result?.Ghosts) ? result.Ghosts.length : result?.ghostCount;
  const player =
    result?.PlayerNickname || result?.playerNickname || result?.PlayerLogin || result?.playerLogin || "Unknown";
  const mapId = result?.MapInfo?.Id || result?.mapInfo?.id || "Unknown";
  const totalMs = result?.Time?.TotalMilliseconds || result?.totalTimeMs;

  summaryGrid.replaceChildren();
  summaryGrid.append(
    createSummaryRow("Replay Type", replayType),
    createSummaryRow("Ghost Count", ghostCount ?? "N/A"),
    createSummaryRow("Player", player),
    createSummaryRow("Map ID", mapId),
    createSummaryRow("Total Time (ms)", totalMs ?? "N/A"),
    createSummaryRow("Top-level Keys", Object.keys(result || {}).length)
  );

  summaryPanel.classList.remove("hidden");
}

function renderResult(result) {
  renderJsonResult(result);
}

function buildFormData() {
  const form = new FormData();
  form.append("replay", selectedReplay, selectedReplay.name);
  if (selectedRequestFile) {
    form.append("requestFile", selectedRequestFile, selectedRequestFile.name);
  }

  form.append("includeNulls", String(Boolean(includeNullsInput.checked)));
  form.append("prettyPrint", String(Boolean(prettyPrintInput.checked)));
  form.append("maxDepth", String(maxDepthInput.value || "20"));
  form.append("maxCollectionItems", String(maxCollectionItemsInput.value || "100000"));

  const customText = String(requestJsonTextInput.value || "").trim();
  if (customText.length > 0) {
    form.append("requestJsonText", customText);
  }

  return form;
}

async function runExtractor() {
  if (!selectedReplay) return;

  setError("");
  setStatus("");
  showOverlay("Uploading replay...");

  goBtn.disabled = true;
  try {
    const xhr = await sendXhr({
      url: "api/extract",
      body: buildFormData(),
      onUploadProgress(event) {
        if (!event.lengthComputable) return;
        overlayText.textContent = "Uploading...";
        progressText.textContent = formatTransferProgress(event);
      },
      onUploadComplete() {
        overlayText.textContent = "Extracting replay data...";
        progressText.textContent = "";
      },
    });
    const payload = parseJsonOrNull(xhr.responseText || "{}");
    if (xhr.status !== 200 || !payload?.ok) {
      setError(payload?.error || "Replay extraction failed.");
      return;
    }

    renderSummary(payload.result);
    renderResult(payload.result);

    if (Number.isInteger(payload.toolExitCode) && payload.toolExitCode !== 0) {
      setStatus(`Extractor completed with exit code ${payload.toolExitCode}.`);
    } else {
      setStatus("Replay extraction completed.");
    }
  } catch (error) {
    setError(error?.code === "timeout" ? "Request timed out." : "Network error while extracting replay data.");
  } finally {
    goBtn.disabled = false;
    hideOverlay();
  }
}

copyBtn.addEventListener("click", copyJsonResult);
downloadBtn.addEventListener("click", downloadJsonResult);
goBtn.addEventListener("click", runExtractor);

bindFileDropZone(replayDrop, replayInput, onReplayPick);
bindFileDropZone(requestDrop, requestFileInput, onRequestPick);
