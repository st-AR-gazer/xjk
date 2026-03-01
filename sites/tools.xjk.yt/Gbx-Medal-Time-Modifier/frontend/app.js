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
    refreshButtonState();
    return;
  }

  if (!isMapFilename(file.name)) {
    selectedMap = null;
    mapName.textContent = "No map selected";
    setDropReady(mapDrop, selectedMap);
    setError("Please select a .Map.Gbx or .Gbx map file.");
    refreshButtonState();
    return;
  }

  selectedMap = file;
  mapName.textContent = `Selected: ${file.name} (${formatKB(file.size)})`;
  setDropReady(mapDrop, selectedMap);
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

function downloadBlob(blob, contentDisposition) {
  const match = /filename="([^"]+)"/i.exec(contentDisposition || "");
  const outName = match ? match[1] : "modified-medal-times.Map.Gbx";

  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = outName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function runModifier() {
  if (!validateForm()) {
    setError("Please provide a map and valid medal tokens before running.");
    return;
  }

  setError("");
  setStatus("");
  showOverlay("Uploading map...");
  goBtn.disabled = true;

  const xhr = new XMLHttpRequest();
  xhr.open("POST", "api/modify", true);
  xhr.responseType = "blob";
  xhr.timeout = 5 * 60 * 1000;

  xhr.upload.onprogress = (event) => {
    if (!event.lengthComputable) return;
    const pct = Math.round((event.loaded / event.total) * 100);
    overlayText.textContent = "Uploading...";
    progressText.textContent = `${pct}% (${formatKB(event.loaded)} / ${formatKB(event.total)})`;
  };

  xhr.upload.onloadend = () => {
    overlayText.textContent = "Applying medal times...";
    progressText.textContent = "";
  };

  xhr.onprogress = (event) => {
    if (event.lengthComputable) {
      const pct = Math.round((event.loaded / event.total) * 100);
      overlayText.textContent = "Downloading modified map...";
      progressText.textContent = `${pct}% (${formatKB(event.loaded)} / ${formatKB(event.total)})`;
    }
  };

  xhr.onerror = () => {
    hideOverlay();
    refreshButtonState();
    setError("Network error while modifying medal times.");
  };

  xhr.ontimeout = () => {
    hideOverlay();
    refreshButtonState();
    setError("Request timed out.");
  };

  xhr.onload = () => {
    hideOverlay();
    refreshButtonState();

    if (xhr.status !== 200) {
      const reader = new FileReader();
      reader.onload = () => {
        try {
          const payload = JSON.parse(reader.result || "{}");
          setError(payload.error || "Modifier failed.");
        } catch {
          setError("Modifier failed.");
        }
      };
      reader.readAsText(xhr.response);
      return;
    }

    downloadBlob(xhr.response, xhr.getResponseHeader("Content-Disposition") || "");
    setStatus("Done. Modified map downloaded.");
  };

  xhr.send(buildFormData());
}

[atInput, goldInput, silverInput, bronzeInput].forEach((input) => {
  input.addEventListener("input", () => {
    setError("");
    refreshButtonState();
  });
});

goBtn.addEventListener("click", runModifier);
bindDropZone(mapDrop, mapInput, onMapPick);
