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
const statusEl = document.getElementById("status");
const errorEl = document.getElementById("error");

const summaryPanel = document.getElementById("summary");
const summaryGrid = document.getElementById("summaryGrid");
const summaryNote = document.getElementById("summaryNote");

const resultPanel = document.getElementById("resultPanel");
const resultJson = document.getElementById("resultJson");
const copyBtn = document.getElementById("copyBtn");
const downloadBtn = document.getElementById("downloadBtn");

const overlay = document.getElementById("overlay");
const overlayText = document.getElementById("overlayText");
const progressText = document.getElementById("progressText");

let selectedMap = null;
let selectedReplay = null;
let selectedManual = null;
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

function isMapFilename(name) {
  const lower = String(name || "").toLowerCase();
  return lower.endsWith(".map.gbx") || lower.endsWith(".gbx");
}

function isReplayFilename(name) {
  return String(name || "").toLowerCase().endsWith(".replay.gbx");
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

function onMapPick(file) {
  setError("");
  setStatus("");

  if (!file) {
    selectedMap = null;
    mapName.textContent = "No map selected";
    setDropReady(mapDrop, selectedMap);
    goBtn.disabled = true;
    return;
  }

  if (!isMapFilename(file.name)) {
    selectedMap = null;
    mapName.textContent = "No map selected";
    setDropReady(mapDrop, selectedMap);
    goBtn.disabled = true;
    setError("Map input must be .Map.Gbx / .Gbx.");
    return;
  }

  selectedMap = file;
  mapName.textContent = `Selected: ${file.name} (${formatKB(file.size)})`;
  setDropReady(mapDrop, selectedMap);
  goBtn.disabled = false;
}

function onReplayPick(file) {
  setError("");
  setStatus("");

  if (!file) {
    selectedReplay = null;
    replayName.textContent = "No replay selected";
    setDropReady(replayDrop, selectedReplay);
    return;
  }

  if (!isReplayFilename(file.name)) {
    selectedReplay = null;
    replayName.textContent = "No replay selected";
    setDropReady(replayDrop, selectedReplay);
    setError("Replay file must be .Replay.Gbx.");
    return;
  }

  selectedReplay = file;
  replayName.textContent = `Selected: ${file.name} (${formatKB(file.size)})`;
  setDropReady(replayDrop, selectedReplay);
}

function onManualPick(file) {
  setError("");
  setStatus("");

  if (!file) {
    selectedManual = null;
    manualName.textContent = "No manual file selected";
    setDropReady(manualDrop, selectedManual);
    return;
  }

  if (!String(file.name || "").toLowerCase().endsWith(".json")) {
    selectedManual = null;
    manualName.textContent = "No manual file selected";
    setDropReady(manualDrop, selectedManual);
    setError("Manual overrides file must be JSON.");
    return;
  }

  selectedManual = file;
  manualName.textContent = `Selected: ${file.name} (${formatKB(file.size)})`;
  setDropReady(manualDrop, selectedManual);
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

function renderSummary(result, exitCode) {
  summaryGrid.innerHTML = "";
  summaryGrid.append(
    summaryRow("UID", result?.uid || "Unknown"),
    summaryRow("Map Name", result?.mapName || "Unknown"),
    summaryRow("Validated", result?.validated || "Unknown"),
    summaryRow("Type", result?.type || "Unknown"),
    summaryRow("Replay Path", result?.replayPath || "N/A"),
    summaryRow("Error", result?.error || "None")
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
  a.download = "map-validation-result.json";
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
  setStatus("JSON downloaded.");
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

function runCheck() {
  if (!selectedMap) return;

  setError("");
  setStatus("");
  showOverlay("Uploading files...");

  goBtn.disabled = true;

  const xhr = new XMLHttpRequest();
  xhr.open("POST", "api/check", true);
  xhr.timeout = 5 * 60 * 1000;

  xhr.upload.onprogress = (event) => {
    if (!event.lengthComputable) return;
    const pct = Math.round((event.loaded / event.total) * 100);
    overlayText.textContent = "Uploading...";
    progressText.textContent = `${pct}% (${formatKB(event.loaded)} / ${formatKB(event.total)})`;
  };

  xhr.upload.onloadend = () => {
    overlayText.textContent = "Running validation checker...";
    progressText.textContent = "";
  };

  xhr.onerror = () => {
    goBtn.disabled = false;
    hideOverlay();
    setError("Network error while running checker.");
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
  };

  xhr.send(buildFormData());
}

copyBtn.addEventListener("click", copyResult);
downloadBtn.addEventListener("click", downloadResult);
goBtn.addEventListener("click", runCheck);

bindDropZone(mapDrop, mapInput, onMapPick);
bindDropZone(replayDrop, replayInput, onReplayPick);
bindDropZone(manualDrop, manualInput, onManualPick);
