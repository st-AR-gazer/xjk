const mapDrop = document.getElementById("mapDrop");
const mapInput = document.getElementById("mapFile");
const mapName = document.getElementById("mapName");

const atInput = document.getElementById("at");
const goldInput = document.getElementById("gold");
const silverInput = document.getElementById("silver");
const bronzeInput = document.getElementById("bronze");

const goBtn = document.getElementById("go");
const statusEl = document.getElementById("status");
const errorEl = document.getElementById("error");

const overlay = document.getElementById("overlay");
const overlayText = document.getElementById("overlayText");
const progressText = document.getElementById("progressText");

let selectedMap = null;

const {
  bindFileDropZone,
  createToolUiBindings,
  formatKilobytes,
  formatTransferProgress,
  isMapGbxFilename,
  parseContentDispositionFilename,
  readBlobErrorMessage,
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

function isMedalToken(value, allowAuto) {
  const token = String(value || "").trim();
  if (!token) return false;
  if (token === "_") return true;
  if (allowAuto && token.toLowerCase() === "auto") return true;
  return /^\d+$/.test(token);
}

function validateForm() {
  if (!selectedMap) return false;

  const at = atInput.value;
  const gold = goldInput.value;
  const silver = silverInput.value;
  const bronze = bronzeInput.value;

  if (!isMedalToken(at, false)) return false;
  if (!isMedalToken(gold, true)) return false;
  if (!isMedalToken(silver, true)) return false;
  if (!isMedalToken(bronze, true)) return false;
  return true;
}

function refreshButtonState() {
  goBtn.disabled = !validateForm();
}

function onMapPick(file) {
  setError("");
  setStatus("");

  if (!file) {
    selectedMap = null;
    mapName.textContent = "No map selected";
    setDropZoneReady(mapDrop, selectedMap);
    refreshButtonState();
    return;
  }

  if (!isMapGbxFilename(file.name)) {
    selectedMap = null;
    mapName.textContent = "No map selected";
    setDropZoneReady(mapDrop, selectedMap);
    setError("Please select a .Map.Gbx or .Gbx map file.");
    refreshButtonState();
    return;
  }

  selectedMap = file;
  mapName.textContent = `Selected: ${file.name} (${formatKilobytes(file.size)})`;
  setDropZoneReady(mapDrop, selectedMap);
  refreshButtonState();
}

function buildFormData() {
  const form = new FormData();
  form.append("map", selectedMap, selectedMap.name);
  form.append("at", String(atInput.value || "").trim());
  form.append("gold", String(goldInput.value || "").trim());
  form.append("silver", String(silverInput.value || "").trim());
  form.append("bronze", String(bronzeInput.value || "").trim());
  return form;
}

async function runModifier() {
  if (!validateForm()) {
    setError("Please provide a map and valid medal tokens before running.");
    return;
  }

  setError("");
  setStatus("");
  showOverlay("Uploading map...");
  goBtn.disabled = true;

  try {
    const xhr = await sendXhr({
      url: "api/modify",
      body: buildFormData(),
      responseType: "blob",
      onUploadProgress(event) {
        if (!event.lengthComputable) return;
        overlayText.textContent = "Uploading...";
        progressText.textContent = formatTransferProgress(event);
      },
      onUploadComplete() {
        overlayText.textContent = "Applying medal times...";
        progressText.textContent = "";
      },
      onDownloadProgress(event) {
        if (!event.lengthComputable) return;
        overlayText.textContent = "Downloading modified map...";
        progressText.textContent = formatTransferProgress(event);
      },
    });
    if (xhr.status !== 200) {
      setError(await readBlobErrorMessage(xhr.response, "Modifier failed."));
      return;
    }

    const filename =
      parseContentDispositionFilename(xhr.getResponseHeader("Content-Disposition")) || "modified-medal-times.Map.Gbx";
    triggerBlobDownload(xhr.response, filename);
    setStatus("Done. Modified map downloaded.");
  } catch (error) {
    setError(error?.code === "timeout" ? "Request timed out." : "Network error while modifying medal times.");
  } finally {
    hideOverlay();
    refreshButtonState();
  }
}

[atInput, goldInput, silverInput, bronzeInput].forEach((input) => {
  input.addEventListener("input", () => {
    setError("");
    refreshButtonState();
  });
});

goBtn.addEventListener("click", runModifier);
bindFileDropZone(mapDrop, mapInput, onMapPick);
