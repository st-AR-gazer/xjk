const mapDrop = document.getElementById("mapDrop");
const manualDrop = document.getElementById("manualDrop");
const mapFileInput = document.getElementById("mapFile");
const manualFileInput = document.getElementById("manualFile");
const mapName = document.getElementById("mapName");
const manualName = document.getElementById("manualName");
const goBtn = document.getElementById("go");

const prettyInput = document.getElementById("pretty");
const caseSensitiveInput = document.getElementById("caseSensitive");
const includeExpectedListInput = document.getElementById("includeExpectedList");
const includeMapNameInput = document.getElementById("includeMapName");
const relaxedStemMatchInput = document.getElementById("relaxedStemMatch");
const dumpZipInput = document.getElementById("dumpZip");

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
let selectedManual = null;
let lastResultText = "";

function setStatus(msg) {
  statusEl.textContent = msg || "";
}

function setError(msg) {
  errorEl.textContent = msg || "";
}

function showOverlay(text) {
  overlayText.textContent = text || "Working...";
  progressText.textContent = "";
  overlay.classList.remove("hidden");
}

function hideOverlay() {
  overlay.classList.add("hidden");
}

function formatKB(bytes) {
  return `${Math.round(Number(bytes || 0) / 1024)} KB`;
}

function setDropReady(dropEl, file) {
  dropEl.classList.toggle("ready", Boolean(file));
}

function isMapFilename(name) {
  const lower = String(name || "").toLowerCase();
  return lower.endsWith(".map.gbx") || lower.endsWith(".gbx");
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
    setError("Please select a .Map.Gbx or .Gbx map file.");
    return;
  }

  selectedMap = file;
  mapName.textContent = `Selected: ${file.name} (${formatKB(file.size)})`;
  setDropReady(mapDrop, selectedMap);
  goBtn.disabled = false;
}

function onManualPick(file) {
  setError("");
  setStatus("");

  if (!file) {
    selectedManual = null;
    manualName.textContent = "No manual overrides file selected";
    setDropReady(manualDrop, selectedManual);
    return;
  }

  if (!String(file.name || "").toLowerCase().endsWith(".json")) {
    selectedManual = null;
    manualName.textContent = "No manual overrides file selected";
    setDropReady(manualDrop, selectedManual);
    setError("Manual overrides must be a JSON file.");
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

function firstReportNode(report) {
  if (Array.isArray(report) && report.length > 0) return report[0];
  if (report && typeof report === "object") return report;
  return null;
}

function renderSummary(payload) {
  const report = firstReportNode(payload?.report);

  if (!report) {
    summaryPanel.classList.add("hidden");
    return;
  }

  summaryGrid.innerHTML = "";
  summaryGrid.append(
    summaryRow("Map UID", report.mapUid || "Unknown"),
    summaryRow("Map Name", report.mapName || "Unknown"),
    summaryRow("Properly Embedded", report.hasProperlyEmbeddedBlocks === true ? "Yes" : report.hasProperlyEmbeddedBlocks === false ? "No" : "Unknown"),
    summaryRow("Missing Expected", report.missingExpectedEmbeddedItemCount ?? "N/A"),
    summaryRow("Not Properly Embedded", report.notProperlyEmbeddedItemCount ?? "N/A"),
    summaryRow("Used Custom Models", report.usedCustomItemCount ?? "N/A")
  );

  const exitCode = payload?.toolExitCode;
  if (Number.isInteger(exitCode) && exitCode !== 0) {
    summaryNote.textContent = `Tool exited with code ${exitCode}. JSON output is still shown.`;
  } else {
    summaryNote.textContent = "";
  }

  summaryPanel.classList.remove("hidden");
}

function renderResult(payload) {
  lastResultText = JSON.stringify(payload?.report ?? payload, null, 2);
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
  a.download = "embedded-check-report.json";
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
  setStatus("JSON downloaded.");
}

function buildFormData() {
  const form = new FormData();
  form.append("map", selectedMap, selectedMap.name);
  if (selectedManual) {
    form.append("manualOverrides", selectedManual, selectedManual.name);
  }

  form.append("pretty", String(Boolean(prettyInput.checked)));
  form.append("caseSensitive", String(Boolean(caseSensitiveInput.checked)));
  form.append("includeExpectedList", String(Boolean(includeExpectedListInput.checked)));
  form.append("includeMapName", String(Boolean(includeMapNameInput.checked)));
  form.append("relaxedStemMatch", String(Boolean(relaxedStemMatchInput.checked)));
  form.append("dumpZip", String(Boolean(dumpZipInput.checked)));
  return form;
}

function runChecker() {
  if (!selectedMap) return;

  setError("");
  setStatus("");
  showOverlay("Uploading map...");

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
    overlayText.textContent = "Running checker...";
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
      setError(payload?.error || "Checker failed.");
      return;
    }

    renderSummary(payload);
    renderResult(payload);
    setStatus("Checker completed.");
  };

  xhr.send(buildFormData());
}

copyBtn.addEventListener("click", copyResult);
downloadBtn.addEventListener("click", downloadResult);
goBtn.addEventListener("click", runChecker);

bindDropZone(mapDrop, mapFileInput, onMapPick);
bindDropZone(manualDrop, manualFileInput, onManualPick);
