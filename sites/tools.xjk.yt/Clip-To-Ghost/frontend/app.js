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

function setStatus(msg) {
  statusEl.textContent = msg || "";
}

function setError(msg) {
  errorEl.textContent = msg || "";
}

function formatKB(bytes) {
  return `${Math.round(Number(bytes || 0) / 1024)} KB`;
}

function formatPct(value) {
  return `${Math.round(value)}%`;
}

function formatRaceTime(ms) {
  const value = Number(ms);
  if (!Number.isFinite(value) || value < 0) return "n/a";
  const minutes = Math.floor(value / 60000);
  const seconds = Math.floor((value % 60000) / 1000);
  const millis = Math.floor(value % 1000);
  return `${minutes}:${String(seconds).padStart(2, "0")}.${String(millis).padStart(3, "0")}`;
}

function parseJsonSafe(text) {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
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

function isMapFilename(fileName) {
  const lower = String(fileName || "").toLowerCase();
  return lower.endsWith(".map.gbx") || lower.endsWith(".gbx");
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
  summaryGrid.innerHTML = "";
  candidateGrid.innerHTML = "";
  candidatesCount.textContent = "";
}

function syncTemplateMode() {
  const isCustom = templateModeInput.value === "custom";
  templateDrop.classList.toggle("hidden", !isCustom);
  if (!isCustom) {
    selectedTemplateGhost = null;
    templateInput.value = "";
    templateName.textContent = "No template ghost selected";
    setDropReady(templateDrop, selectedTemplateGhost);
  }
  updateButtons();
}

function updateButtons() {
  scanBtn.disabled = isBusy || !selectedMap;
  exportBtn.disabled = isBusy || !selectedMap || (templateModeInput.value === "custom" && !selectedTemplateGhost);
}

function bindDropZone(zone, input, onPick) {
  zone.addEventListener("click", () => {
    if (isBusy) return;
    input.click();
  });

  zone.addEventListener("keydown", (event) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      if (isBusy) return;
      input.click();
    }
  });

  zone.addEventListener("dragover", (event) => {
    event.preventDefault();
    if (isBusy) return;
    zone.classList.add("dragover");
  });

  zone.addEventListener("dragleave", () => {
    zone.classList.remove("dragover");
  });

  zone.addEventListener("drop", (event) => {
    event.preventDefault();
    zone.classList.remove("dragover");
    if (isBusy) return;
    onPick(event.dataTransfer?.files?.[0] || null);
  });

  input.addEventListener("change", () => {
    if (isBusy) return;
    onPick(input.files?.[0] || null);
  });
}

function onMapPick(file) {
  setError("");
  setStatus("");
  resetInspectionState();

  if (!file) {
    selectedMap = null;
    mapName.textContent = "No map selected";
    setDropReady(mapDrop, selectedMap);
    updateButtons();
    return;
  }

  if (!isMapFilename(file.name)) {
    selectedMap = null;
    mapName.textContent = "No map selected";
    setDropReady(mapDrop, selectedMap);
    setError("Map input must be .Map.Gbx / .Gbx.");
    updateButtons();
    return;
  }

  selectedMap = file;
  mapName.textContent = `Selected: ${file.name} (${formatKB(file.size)})`;
  setDropReady(mapDrop, selectedMap);
  updateButtons();
}

function onTemplatePick(file) {
  setError("");
  setStatus("");

  if (!file) {
    selectedTemplateGhost = null;
    templateName.textContent = "No template ghost selected";
    setDropReady(templateDrop, selectedTemplateGhost);
    updateButtons();
    return;
  }

  if (!isGhostFilename(file.name)) {
    selectedTemplateGhost = null;
    templateName.textContent = "No template ghost selected";
    setDropReady(templateDrop, selectedTemplateGhost);
    setError("Template ghost must be .Ghost.Gbx / .Gbx.");
    updateButtons();
    return;
  }

  selectedTemplateGhost = file;
  templateName.textContent = `Selected: ${file.name} (${formatKB(file.size)})`;
  setDropReady(templateDrop, selectedTemplateGhost);
  updateButtons();
}

function summaryRow(label, value) {
  const item = document.createElement("div");
  item.className = "summary-item";

  const key = document.createElement("div");
  key.className = "k";
  key.textContent = label;

  const data = document.createElement("div");
  data.className = "v";
  data.textContent = value == null || value === "" ? "N/A" : String(value);

  item.append(key, data);
  return item;
}

function renderSummary(manifest) {
  summaryGrid.innerHTML = "";
  summaryGrid.append(
    summaryRow("Source Map", manifest?.sourceMapPath || "Unknown"),
    summaryRow("Template Mode", manifest?.templateMode || "Unknown"),
    summaryRow("Candidates", manifest?.candidatesDiscovered ?? 0),
    summaryRow("Exported", manifest?.exportedCount ?? 0),
    summaryRow("List Only", manifest?.listOnly ? "Yes" : "No"),
    summaryRow("Tool Version", manifest?.toolVersion || "Unknown")
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
  candidateGrid.innerHTML = "";
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

    card.innerHTML = `
      <div class="candidate-top">
        <strong>clip ${entry.clipIndex} / track ${entry.trackIndex} / block ${entry.blockIndex}</strong>
        <span class="candidate-time">${formatRaceTime(entry.derivedRaceTimeMs)}</span>
      </div>
      <div class="candidate-meta">
        <span>EntList: ${entry.entListCount}</span>
        <span>Samples: ${entry.totalSamples}</span>
        <span>Samples2: ${entry.totalSamples2}</span>
      </div>
      <div class="candidate-path">${entry.sourcePath || "Unknown source path"}</div>
    `;

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
  try {
    await navigator.clipboard.writeText(lastManifestText);
    setStatus("Manifest JSON copied to clipboard.");
  } catch {
    setError("Could not copy manifest JSON.");
  }
}

function downloadManifest() {
  if (!lastManifestText) return;
  const blob = new Blob([lastManifestText], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = "clip-to-ghost.manifest.json";
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
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

    const payload = parseJsonSafe(await response.text());
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

function parseContentDispositionFilename(value) {
  const match = /filename="([^"]+)"/i.exec(String(value || ""));
  return match ? match[1] : "";
}

async function blobToText(blob) {
  return await new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => resolve("");
    reader.readAsText(blob);
  });
}

function triggerDownload(blob, fileName) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

async function exportGhosts() {
  if (!selectedMap || isBusy) return;

  isBusy = true;
  updateButtons();
  setError("");
  setStatus("");
  showOverlay("Uploading and exporting...");

  await new Promise((resolve) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", "api/export", true);
    xhr.responseType = "blob";
    xhr.timeout = 10 * 60 * 1000;

    xhr.upload.onprogress = (event) => {
      if (!event.lengthComputable) return;
      overlayText.textContent = "Uploading map...";
      progressText.textContent = `${formatPct((event.loaded / event.total) * 100)} (${formatKB(event.loaded)} / ${formatKB(event.total)})`;
    };

    xhr.upload.onloadend = () => {
      overlayText.textContent = "Exporting ghosts...";
      progressText.textContent = "Building manifest and ghost files...";
    };

    xhr.onprogress = (event) => {
      if (!event.lengthComputable) return;
      overlayText.textContent = "Downloading export...";
      progressText.textContent = `${formatPct((event.loaded / event.total) * 100)} (${formatKB(event.loaded)} / ${formatKB(event.total)})`;
    };

    xhr.onerror = async () => {
      hideOverlay();
      setError("Network error during export.");
      isBusy = false;
      updateButtons();
      resolve();
    };

    xhr.ontimeout = async () => {
      hideOverlay();
      setError("Export request timed out.");
      isBusy = false;
      updateButtons();
      resolve();
    };

    xhr.onload = async () => {
      hideOverlay();

      const contentType = xhr.getResponseHeader("Content-Type") || "";
      if (xhr.status !== 200 || contentType.includes("application/json")) {
        const text = await blobToText(xhr.response);
        const payload = parseJsonSafe(text);
        setError(payload?.error || text || "Export failed.");
        isBusy = false;
        updateButtons();
        resolve();
        return;
      }

      const outName =
        parseContentDispositionFilename(xhr.getResponseHeader("Content-Disposition")) ||
        (includeManifestInput.checked ? "clip-to-ghost.zip" : "ghost.Ghost.Gbx");
      triggerDownload(xhr.response, outName);
      setStatus(`Export ready: ${outName}`);
      isBusy = false;
      updateButtons();
      resolve();
    };

    xhr.send(buildExportFormData());
  });
}

bindDropZone(mapDrop, mapInput, onMapPick);
bindDropZone(templateDrop, templateInput, onTemplatePick);

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
