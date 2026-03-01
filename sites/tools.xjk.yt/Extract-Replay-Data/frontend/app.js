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
let lastResultText = "";

function setStatus(msg) {
  statusEl.textContent = msg || "";
}

function setError(msg) {
  errorEl.textContent = msg || "";
}

function formatKB(bytes) {
  return `${Math.round(Number(bytes || 0) / 1024)} KB`;
}

function showOverlay(text) {
  overlayText.textContent = text || "Working...";
  progressText.textContent = "";
  overlay.classList.remove("hidden");
}

function hideOverlay() {
  overlay.classList.add("hidden");
}

function setDropReady(dropEl, file) {
  dropEl.classList.toggle("ready", Boolean(file));
}

function bindDropZone(drop, input, onPick) {
  drop.addEventListener("click", () => input.click());

  drop.addEventListener("keydown", (event) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      input.click();
    }
  });

  drop.addEventListener("dragover", (event) => {
    event.preventDefault();
    drop.classList.add("dragover");
  });

  drop.addEventListener("dragleave", () => {
    drop.classList.remove("dragover");
  });

  drop.addEventListener("drop", (event) => {
    event.preventDefault();
    drop.classList.remove("dragover");
    onPick(event.dataTransfer?.files?.[0] || null);
  });

  input.addEventListener("change", () => {
    onPick(input.files?.[0] || null);
  });
}

function onReplayPick(file) {
  setError("");
  setStatus("");

  if (!file) {
    selectedReplay = null;
    replayName.textContent = "No replay selected";
    setDropReady(replayDrop, selectedReplay);
    goBtn.disabled = true;
    return;
  }

  const lower = String(file.name || "").toLowerCase();
  if (!lower.endsWith(".replay.gbx")) {
    selectedReplay = null;
    replayName.textContent = "No replay selected";
    setDropReady(replayDrop, selectedReplay);
    goBtn.disabled = true;
    setError("Replay input must be a .Replay.Gbx file.");
    return;
  }

  selectedReplay = file;
  replayName.textContent = `Selected: ${file.name} (${formatKB(file.size)})`;
  setDropReady(replayDrop, selectedReplay);
  goBtn.disabled = false;
}

function onRequestPick(file) {
  setError("");
  setStatus("");

  if (!file) {
    selectedRequestFile = null;
    requestName.textContent = "No request file selected";
    setDropReady(requestDrop, selectedRequestFile);
    return;
  }

  const lower = String(file.name || "").toLowerCase();
  if (!lower.endsWith(".json")) {
    selectedRequestFile = null;
    requestName.textContent = "No request file selected";
    setDropReady(requestDrop, selectedRequestFile);
    setError("Request file must be JSON.");
    return;
  }

  selectedRequestFile = file;
  requestName.textContent = `Selected: ${file.name} (${formatKB(file.size)})`;
  setDropReady(requestDrop, selectedRequestFile);
}

function summaryRow(label, value) {
  const item = document.createElement("div");
  item.className = "summary-item";

  const k = document.createElement("div");
  k.className = "k";
  k.textContent = label;

  const v = document.createElement("div");
  v.className = "v";
  v.textContent = value == null || value === "" ? "N/A" : String(value);

  item.append(k, v);
  return item;
}

function renderSummary(result) {
  const replayType = result?.$type || result?.replayType || "Unknown";
  const ghostCount = Array.isArray(result?.Ghosts) ? result.Ghosts.length : result?.ghostCount;
  const player = result?.PlayerNickname || result?.playerNickname || result?.PlayerLogin || result?.playerLogin || "Unknown";
  const mapId = result?.MapInfo?.Id || result?.mapInfo?.id || "Unknown";
  const totalMs = result?.Time?.TotalMilliseconds || result?.totalTimeMs;

  summaryGrid.innerHTML = "";
  summaryGrid.append(
    summaryRow("Replay Type", replayType),
    summaryRow("Ghost Count", ghostCount ?? "N/A"),
    summaryRow("Player", player),
    summaryRow("Map ID", mapId),
    summaryRow("Total Time (ms)", totalMs ?? "N/A"),
    summaryRow("Top-level Keys", Object.keys(result || {}).length)
  );

  summaryPanel.classList.remove("hidden");
}

function renderResult(result) {
  lastResultText = JSON.stringify(result, null, 2);
  resultJson.textContent = lastResultText;
  resultPanel.classList.remove("hidden");
}

async function copyResult() {
  if (!lastResultText) return;
  try {
    await navigator.clipboard.writeText(lastResultText);
    setStatus("JSON copied to clipboard.");
  } catch {
    setError("Could not copy JSON to clipboard.");
  }
}

function downloadResult() {
  if (!lastResultText) return;
  const blob = new Blob([lastResultText], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "replay-extract.json";
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
  setStatus("JSON downloaded.");
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

function runExtractor() {
  if (!selectedReplay) return;

  setError("");
  setStatus("");
  showOverlay("Uploading replay...");

  goBtn.disabled = true;
  const xhr = new XMLHttpRequest();
  xhr.open("POST", "api/extract", true);
  xhr.timeout = 5 * 60 * 1000;

  xhr.upload.onprogress = (event) => {
    if (!event.lengthComputable) return;
    const pct = Math.round((event.loaded / event.total) * 100);
    overlayText.textContent = "Uploading...";
    progressText.textContent = `${pct}% (${formatKB(event.loaded)} / ${formatKB(event.total)})`;
  };

  xhr.upload.onloadend = () => {
    overlayText.textContent = "Extracting replay data...";
    progressText.textContent = "";
  };

  xhr.onerror = () => {
    goBtn.disabled = false;
    hideOverlay();
    setError("Network error while extracting replay data.");
  };

  xhr.ontimeout = () => {
    goBtn.disabled = false;
    hideOverlay();
    setError("Request timed out.");
  };

  xhr.onload = () => {
    goBtn.disabled = false;
    hideOverlay();

    let payload = null;
    try {
      payload = JSON.parse(xhr.responseText || "{}");
    } catch {
      payload = null;
    }

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
  };

  xhr.send(buildFormData());
}

copyBtn.addEventListener("click", copyResult);
downloadBtn.addEventListener("click", downloadResult);
goBtn.addEventListener("click", runExtractor);

bindDropZone(replayDrop, replayInput, onReplayPick);
bindDropZone(requestDrop, requestFileInput, onRequestPick);
