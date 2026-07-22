import { renderClipCandidate } from "/shared/safe-rendering.js";

const mapDrop = document.getElementById("mapDrop");
const templateDrop = document.getElementById("templateDrop");
const mapInput = document.getElementById("mapFile");
const templateInput = document.getElementById("templateGhostFile");
const mapName = document.getElementById("mapName");
const templateName = document.getElementById("templateName");

const templateModeInput = document.getElementById("templateMode");
const includeManifestInput = document.getElementById("includeManifest");
const clipIndexInput = document.getElementById("clipIndex");
const trackIndexInput = document.getElementById("trackIndex");
const blockIndexInput = document.getElementById("blockIndex");
const clearSelectionBtn = document.getElementById("clearSelectionBtn");
const pageTabButtons = Array.from(document.querySelectorAll("[data-page-tab]"));
const toolTabPanel = document.getElementById("toolTabPanel");
const docsTabPanel = document.getElementById("docsTabPanel");

const scanBtn = document.getElementById("scanBtn");
const exportBtn = document.getElementById("exportBtn");
const statusEl = document.getElementById("status");
const errorEl = document.getElementById("error");

const summaryPanel = document.getElementById("summaryPanel");
const summaryGrid = document.getElementById("summaryGrid");
const candidatesPanel = document.getElementById("candidatesPanel");
const candidatesCount = document.getElementById("candidatesCount");
const candidateGrid = document.getElementById("candidateGrid");

const resultPanel = document.getElementById("resultPanel");
const manifestJson = document.getElementById("manifestJson");
const copyManifestBtn = document.getElementById("copyManifestBtn");
const downloadManifestBtn = document.getElementById("downloadManifestBtn");

const overlay = document.getElementById("overlay");
const overlayText = document.getElementById("overlayText");
const progressText = document.getElementById("progressText");

let selectedMap = null;
let selectedTemplateGhost = null;
let selectedCandidateKey = "";
let lastManifest = null;
let lastManifestText = "";
let isBusy = false;

const {
  bindFileDropZone,
  copyTextToClipboard,
  createSummaryRow,
  createTransferProgressCallbacks,
  createToolUiBindings,
  formatKilobytes,
  isMapGbxFilename,
  parseContentDispositionFilename,
  parseJsonOrNull,
  readBlobText,
  sendXhr,
  setDropZoneReady,
  triggerBlobDownload,
} = window.ToolTheme;
const { hideOverlay, setError, setStatus, showOverlay } = createToolUiBindings({
  statusElement: statusEl,
  errorElement: errorEl,
  overlayElement: overlay,
  overlayTextElement: overlayText,
  progressTextElement: progressText,
});

function setPageTab(tabName) {
  const isDocs = tabName === "docs";
  pageTabButtons.forEach((button) => {
    const active = button.getAttribute("data-page-tab") === tabName;
    button.classList.toggle("is-active", active);
    button.setAttribute("aria-selected", active ? "true" : "false");
  });
  toolTabPanel.classList.toggle("is-active", !isDocs);
  toolTabPanel.classList.toggle("hidden", isDocs);
  docsTabPanel.classList.toggle("is-active", isDocs);
  docsTabPanel.classList.toggle("hidden", !isDocs);
}

function formatRaceTime(ms) {
  const value = Number(ms);
  if (!Number.isFinite(value) || value < 0) return "n/a";
  const minutes = Math.floor(value / 60000);
  const seconds = Math.floor((value % 60000) / 1000);
  const millis = Math.floor(value % 1000);
  return `${minutes}:${String(seconds).padStart(2, "0")}.${String(millis).padStart(3, "0")}`;
}

function isGhostFilename(fileName) {
  const lower = String(fileName || "").toLowerCase();
  return lower.endsWith(".ghost.gbx") || lower.endsWith(".gbx");
}

function buildCandidateKey(entry) {
  return `${entry.clipIndex}:${entry.trackIndex}:${entry.blockIndex}`;
}

function getFilters() {
  const clipIndex = clipIndexInput.value.trim();
  const trackIndex = trackIndexInput.value.trim();
  const blockIndex = blockIndexInput.value.trim();

  return {
    clipIndex,
    trackIndex,
    blockIndex,
  };
}

function resetInspectionState() {
  selectedCandidateKey = "";
  lastManifest = null;
  lastManifestText = "";
  summaryPanel.classList.add("hidden");
  candidatesPanel.classList.add("hidden");
  resultPanel.classList.add("hidden");
  summaryGrid.replaceChildren();
  candidateGrid.replaceChildren();
  candidatesCount.textContent = "";
}

function syncTemplateMode() {
  const isCustom = templateModeInput.value === "custom";
  templateDrop.classList.toggle("hidden", !isCustom);
  if (!isCustom) {
    selectedTemplateGhost = null;
    templateInput.value = "";
    templateName.textContent = "No template ghost selected";
    setDropZoneReady(templateDrop, selectedTemplateGhost);
  }
  updateButtons();
}

function updateButtons() {
  scanBtn.disabled = isBusy || !selectedMap;
  exportBtn.disabled = isBusy || !selectedMap || (templateModeInput.value === "custom" && !selectedTemplateGhost);
}

function onMapPick(file) {
  setError("");
  setStatus("");
  resetInspectionState();

  if (!file) {
    selectedMap = null;
    mapName.textContent = "No map selected";
    setDropZoneReady(mapDrop, selectedMap);
    updateButtons();
    return;
  }

  if (!isMapGbxFilename(file.name)) {
    selectedMap = null;
    mapName.textContent = "No map selected";
    setDropZoneReady(mapDrop, selectedMap);
    setError("Map input must be .Map.Gbx / .Gbx.");
    updateButtons();
    return;
  }

  selectedMap = file;
  mapName.textContent = `Selected: ${file.name} (${formatKilobytes(file.size)})`;
  setDropZoneReady(mapDrop, selectedMap);
  updateButtons();
}

function onTemplatePick(file) {
  setError("");
  setStatus("");

  if (!file) {
    selectedTemplateGhost = null;
    templateName.textContent = "No template ghost selected";
    setDropZoneReady(templateDrop, selectedTemplateGhost);
    updateButtons();
    return;
  }

  if (!isGhostFilename(file.name)) {
    selectedTemplateGhost = null;
    templateName.textContent = "No template ghost selected";
    setDropZoneReady(templateDrop, selectedTemplateGhost);
    setError("Template ghost must be .Ghost.Gbx / .Gbx.");
    updateButtons();
    return;
  }

  selectedTemplateGhost = file;
  templateName.textContent = `Selected: ${file.name} (${formatKilobytes(file.size)})`;
  setDropZoneReady(templateDrop, selectedTemplateGhost);
  updateButtons();
}

function renderSummary(manifest) {
  summaryGrid.replaceChildren();
  summaryGrid.append(
    createSummaryRow("Source Map", manifest?.sourceMapPath || "Unknown"),
    createSummaryRow("Template Mode", manifest?.templateMode || "Unknown"),
    createSummaryRow("Candidates", manifest?.candidatesDiscovered ?? 0),
    createSummaryRow("Exported", manifest?.exportedCount ?? 0),
    createSummaryRow("List Only", manifest?.listOnly ? "Yes" : "No"),
    createSummaryRow("Tool Version", manifest?.toolVersion || "Unknown")
  );
  summaryPanel.classList.remove("hidden");
}

function setFilterInputs(entry) {
  clipIndexInput.value = String(entry?.clipIndex ?? "");
  trackIndexInput.value = String(entry?.trackIndex ?? "");
  blockIndexInput.value = String(entry?.blockIndex ?? "");
}

function clearSelection() {
  selectedCandidateKey = "";
  setFilterInputs(null);
  if (lastManifest) renderCandidates(lastManifest.entries || []);
}

function renderCandidates(entries) {
  candidateGrid.replaceChildren();
  candidatesCount.textContent = `${entries.length} candidate${entries.length === 1 ? "" : "s"}`;

  if (!entries.length) {
    const empty = document.createElement("div");
    empty.className = "empty-state";
    empty.textContent = "No GPS clip candidates were found for this map.";
    candidateGrid.appendChild(empty);
    candidatesPanel.classList.remove("hidden");
    return;
  }

  entries.forEach((entry) => {
    const key = buildCandidateKey(entry);
    const card = document.createElement("button");
    card.type = "button";
    card.className = "candidate-card";
    if (key === selectedCandidateKey) card.classList.add("active");

    renderClipCandidate(document, card, entry, { formatRaceTime });

    card.addEventListener("click", () => {
      selectedCandidateKey = key;
      setFilterInputs(entry);
      renderCandidates(entries);
      setStatus(`Selected clip ${entry.clipIndex}, track ${entry.trackIndex}, block ${entry.blockIndex}.`);
    });

    candidateGrid.appendChild(card);
  });

  candidatesPanel.classList.remove("hidden");
}

function renderManifest(manifest) {
  lastManifest = manifest;
  lastManifestText = JSON.stringify(manifest, null, 2);
  manifestJson.textContent = lastManifestText;
  resultPanel.classList.remove("hidden");
}

async function copyManifest() {
  if (!lastManifestText) return;
  await copyTextToClipboard(lastManifestText, {
    onSuccess: () => setStatus("Manifest JSON copied to clipboard."),
    onError: () => setError("Could not copy manifest JSON."),
  });
}

function downloadManifest() {
  if (!lastManifestText) return;
  const blob = new Blob([lastManifestText], { type: "application/json" });
  triggerBlobDownload(blob, "clip-to-ghost.manifest.json");
  setStatus("Manifest JSON downloaded.");
}

function buildInspectFormData() {
  const form = new FormData();
  form.append("map", selectedMap, selectedMap.name);

  const filters = getFilters();
  if (filters.clipIndex) form.append("clipIndex", filters.clipIndex);
  if (filters.trackIndex) form.append("trackIndex", filters.trackIndex);
  if (filters.blockIndex) form.append("blockIndex", filters.blockIndex);

  return form;
}

function buildExportFormData() {
  const form = buildInspectFormData();
  form.append("templateMode", templateModeInput.value);
  form.append("includeManifest", String(Boolean(includeManifestInput.checked)));
  if (templateModeInput.value === "custom" && selectedTemplateGhost) {
    form.append("templateGhost", selectedTemplateGhost, selectedTemplateGhost.name);
  }
  return form;
}

async function scanCandidates() {
  if (!selectedMap || isBusy) return;

  isBusy = true;
  updateButtons();
  setError("");
  setStatus("");
  resetInspectionState();
  showOverlay("Scanning GPS blocks...");

  try {
    const response = await fetch("api/inspect", {
      method: "POST",
      body: buildInspectFormData(),
    });

    const payload = parseJsonOrNull(await response.text());
    hideOverlay();

    if (!response.ok || !payload?.ok) {
      setError(payload?.error || "Scan failed.");
      return;
    }

    renderSummary(payload.manifest);
    renderCandidates(Array.isArray(payload.manifest?.entries) ? payload.manifest.entries : []);
    renderManifest(payload.manifest);
    setStatus(`Discovered ${payload.manifest?.candidatesDiscovered ?? 0} GPS candidate(s).`);
  } catch (err) {
    hideOverlay();
    setError(String(err?.message || err));
  } finally {
    isBusy = false;
    updateButtons();
  }
}

async function exportGhosts() {
  if (!selectedMap || isBusy) return;

  isBusy = true;
  updateButtons();
  setError("");
  setStatus("");
  showOverlay("Uploading and exporting...");

  const transferProgress = createTransferProgressCallbacks({
    overlayTextElement: overlayText,
    progressTextElement: progressText,
    uploadLabel: "Uploading map...",
    processingLabel: "Exporting ghosts...",
    processingMessage: "Building manifest and ghost files...",
    downloadLabel: "Downloading export...",
  });

  try {
    const xhr = await sendXhr({
      url: "api/export",
      body: buildExportFormData(),
      responseType: "blob",
      timeoutMs: 10 * 60 * 1000,
      ...transferProgress,
    });
    const contentType = xhr.getResponseHeader("Content-Type") || "";
    if (xhr.status !== 200 || contentType.includes("application/json")) {
      const text = await readBlobText(xhr.response);
      const payload = parseJsonOrNull(text);
      setError(payload?.error || text || "Export failed.");
      return;
    }

    const outName =
      parseContentDispositionFilename(xhr.getResponseHeader("Content-Disposition")) ||
      (includeManifestInput.checked ? "clip-to-ghost.zip" : "ghost.Ghost.Gbx");
    triggerBlobDownload(xhr.response, outName);
    setStatus(`Export ready: ${outName}`);
  } catch (error) {
    setError(error?.code === "timeout" ? "Export request timed out." : "Network error during export.");
  } finally {
    hideOverlay();
    isBusy = false;
    updateButtons();
  }
}

const dropZoneOptions = { isDisabled: () => isBusy };
bindFileDropZone(mapDrop, mapInput, onMapPick, dropZoneOptions);
bindFileDropZone(templateDrop, templateInput, onTemplatePick, dropZoneOptions);

templateModeInput.addEventListener("change", syncTemplateMode);
clearSelectionBtn.addEventListener("click", clearSelection);
scanBtn.addEventListener("click", scanCandidates);
exportBtn.addEventListener("click", exportGhosts);
copyManifestBtn.addEventListener("click", copyManifest);
downloadManifestBtn.addEventListener("click", downloadManifest);
pageTabButtons.forEach((button) => {
  button.addEventListener("click", () => setPageTab(button.getAttribute("data-page-tab") || "tool"));
});

[clipIndexInput, trackIndexInput, blockIndexInput].forEach((input) => {
  input.addEventListener("input", () => {
    selectedCandidateKey = "";
    if (lastManifest) renderCandidates(lastManifest.entries || []);
  });
});

syncTemplateMode();
setPageTab("tool");
updateButtons();
