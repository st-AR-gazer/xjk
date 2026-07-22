import { renderGhostDetails } from "/shared/safe-rendering.js";

const mapDrop = document.getElementById("mapDrop");
const sourceDrop = document.getElementById("sourceDrop");
const mapInput = document.getElementById("mapFile");
const sourceInput = document.getElementById("sourceFile");
const mapName = document.getElementById("mapName");
const sourceName = document.getElementById("sourceName");
const goBtn = document.getElementById("go");

const replayPanel = document.getElementById("replayPanel");
const replaySummary = document.getElementById("replaySummary");
const ghostList = document.getElementById("ghostList");

const statusEl = document.getElementById("status");
const errorEl = document.getElementById("error");

const overlay = document.getElementById("overlay");
const overlayText = document.getElementById("overlayText");
const progressText = document.getElementById("progressText");

let selectedMap = null;
let selectedSource = null;
let activeInputKind = null;
let replayData = null;
let selectedGhostIndex = 0;

let inspectXhr = null;
let isEmbedding = false;

const { bindFileDropZone, createToolUiBindings, formatKilobytes, formatPercent, parseJsonOrNull, setDropZoneReady } =
  window.ToolTheme;
const { hideOverlay, setError, setStatus, showOverlay } = createToolUiBindings({
  statusElement: statusEl,
  errorElement: errorEl,
  overlayElement: overlay,
  overlayTextElement: overlayText,
  progressTextElement: progressText,
});

function formatMs(totalMs) {
  if (totalMs === null || totalMs === undefined || totalMs === "") return "Unknown";
  const n = Number(totalMs);
  if (!Number.isFinite(n) || n < 0) return "Unknown";
  const minutes = Math.floor(n / 60000);
  const seconds = Math.floor((n % 60000) / 1000);
  const millis = Math.floor(n % 1000);
  return `${minutes}:${String(seconds).padStart(2, "0")}.${String(millis).padStart(3, "0")}`;
}

function isReplayName(fileName) {
  return String(fileName || "")
    .toLowerCase()
    .endsWith(".replay.gbx");
}

function resetReplayUi() {
  replayPanel.classList.add("hidden");
  replaySummary.replaceChildren();
  ghostList.replaceChildren();
  replayData = null;
  selectedGhostIndex = 0;
}

function updateButtonState() {
  if (isEmbedding || !selectedMap || !selectedSource) {
    goBtn.disabled = true;
    return;
  }

  if (activeInputKind === "replay") {
    goBtn.disabled = !replayData || !Number.isInteger(selectedGhostIndex);
    return;
  }

  goBtn.disabled = false;
}

function renderSummaryItem(key, value) {
  const item = document.createElement("div");
  item.className = "summary-item";

  const k = document.createElement("div");
  k.className = "k";
  k.textContent = key;

  const v = document.createElement("div");
  v.className = "v";
  v.textContent = value == null || value === "" ? "N/A" : String(value);

  item.appendChild(k);
  item.appendChild(v);
  return item;
}

function renderReplaySummary(replay) {
  replaySummary.replaceChildren();
  replaySummary.appendChild(renderSummaryItem("Replay Type", replay?.replayType || "Unknown"));
  replaySummary.appendChild(renderSummaryItem("Replay Time", formatMs(replay?.totalTimeMs)));
  replaySummary.appendChild(renderSummaryItem("Ghost Count", replay?.ghostCount ?? 0));
  replaySummary.appendChild(
    renderSummaryItem("Replay Player", replay?.playerNickname || replay?.playerLogin || "Unknown")
  );
  replaySummary.appendChild(
    renderSummaryItem("Replay Author", replay?.authorNickname || replay?.authorLogin || "Unknown")
  );
  replaySummary.appendChild(renderSummaryItem("Map ID", replay?.mapInfo?.id || "Unknown"));
}

function chip(text) {
  const span = document.createElement("span");
  span.className = "chip";
  span.textContent = text;
  return span;
}

function renderGhostList(ghosts) {
  ghostList.replaceChildren();

  ghosts.forEach((ghost) => {
    const label = document.createElement("label");
    label.className = "ghost-card";
    if (ghost.index === selectedGhostIndex) label.classList.add("active");

    const radio = document.createElement("input");
    radio.type = "radio";
    radio.name = "ghostIndex";
    radio.className = "ghost-radio";
    radio.value = String(ghost.index);
    radio.checked = ghost.index === selectedGhostIndex;
    radio.addEventListener("change", () => {
      selectedGhostIndex = Number(ghost.index);
      renderGhostList(ghosts);
      updateButtonState();
    });

    const top = document.createElement("div");
    top.className = "ghost-top";

    const title = document.createElement("p");
    title.className = "ghost-title";
    title.textContent = `#${ghost.index} ${ghost.ghostNickname || ghost.ghostLogin || "Unnamed ghost"}`;

    const time = document.createElement("p");
    time.className = "ghost-time";
    time.textContent = formatMs(ghost?.raceTime?.totalMilliseconds);

    top.appendChild(title);
    top.appendChild(time);

    const chips = document.createElement("div");
    chips.className = "chips";
    chips.appendChild(chip(`Respawns: ${ghost.respawns ?? "?"}`));
    chips.appendChild(chip(`Checkpoints: ${ghost.checkpointCount ?? 0}`));
    chips.appendChild(chip(`Stunt: ${ghost.stuntScore ?? 0}`));
    chips.appendChild(chip(`UID: ${ghost.ghostUidNumber ?? "?"}`));

    const details = document.createElement("div");
    details.className = "ghost-details";
    renderGhostDetails(document, details, ghost);

    label.appendChild(radio);
    label.appendChild(top);
    label.appendChild(chips);
    label.appendChild(details);
    ghostList.appendChild(label);
  });
}

function stopReplayInspection() {
  if (!inspectXhr) return;
  try {
    inspectXhr.abort();
  } catch {}
  inspectXhr = null;
}

function inspectReplayFile(file) {
  stopReplayInspection();

  const xhr = new XMLHttpRequest();
  inspectXhr = xhr;
  xhr.open("POST", "api/inspect-replay", true);
  xhr.responseType = "text";
  xhr.timeout = 5 * 60 * 1000;

  const form = new FormData();
  form.append("replay", file, file.name);

  showOverlay("Uploading replay for metadata...");
  setStatus("Replay selected. Inspecting metadata...");
  setError("");

  xhr.upload.onprogress = (event) => {
    if (!event.lengthComputable) return;
    overlayText.textContent = "Uploading replay for metadata...";
    progressText.textContent = `${formatPercent((event.loaded / event.total) * 100)} (${formatKilobytes(event.loaded)} / ${formatKilobytes(event.total)})`;
  };

  xhr.upload.onloadend = () => {
    overlayText.textContent = "Extracting replay ghosts...";
    progressText.textContent = "";
  };

  xhr.onerror = () => {
    if (inspectXhr !== xhr) return;
    inspectXhr = null;
    hideOverlay();
    replayData = null;
    activeInputKind = "replay";
    updateButtonState();
    setError("Replay inspection failed (network error).");
  };

  xhr.ontimeout = () => {
    if (inspectXhr !== xhr) return;
    inspectXhr = null;
    hideOverlay();
    replayData = null;
    activeInputKind = "replay";
    updateButtonState();
    setError("Replay inspection timed out.");
  };

  xhr.onload = () => {
    if (inspectXhr !== xhr) return;
    inspectXhr = null;
    hideOverlay();

    const payload = parseJsonOrNull(xhr.responseText || "");
    if (xhr.status !== 200 || !payload?.ok) {
      replayData = null;
      activeInputKind = "replay";
      updateButtonState();
      setError(payload?.error || "Replay inspection failed.");
      return;
    }

    replayData = payload.replay;
    activeInputKind = "replay";
    selectedGhostIndex = Number.isInteger(payload.selectedGhostIndex) ? payload.selectedGhostIndex : 0;
    replayPanel.classList.remove("hidden");
    renderReplaySummary(replayData);
    renderGhostList(replayData.ghosts || []);
    setStatus(`Replay inspected. Found ${replayData.ghostCount} ghost(s).`);
    updateButtonState();
  };

  xhr.send(form);
}

function onMapPick(file) {
  selectedMap = file || null;
  mapName.textContent = selectedMap
    ? `Selected: ${selectedMap.name} (${formatKilobytes(selectedMap.size)})`
    : "No map selected";
  setDropZoneReady(mapDrop, selectedMap);
  setError("");
  setStatus("");
  updateButtonState();
}

function onSourcePick(file) {
  selectedSource = file || null;
  sourceName.textContent = selectedSource
    ? `Selected: ${selectedSource.name} (${formatKilobytes(selectedSource.size)})`
    : "No source selected";
  setDropZoneReady(sourceDrop, selectedSource);
  resetReplayUi();
  stopReplayInspection();
  setError("");
  setStatus("");

  if (!selectedSource) {
    activeInputKind = null;
    updateButtonState();
    return;
  }

  if (isReplayName(selectedSource.name)) {
    activeInputKind = "replay";
    inspectReplayFile(selectedSource);
    return;
  }

  activeInputKind = "ghost";
  setStatus("Ghost source selected. It will upload when you press the embed button.");
  updateButtonState();
}

goBtn.addEventListener("click", () => {
  if (!selectedMap || !selectedSource || isEmbedding) return;
  if (activeInputKind === "replay" && !replayData) return;

  isEmbedding = true;
  updateButtonState();
  setError("");
  setStatus("");

  const xhr = new XMLHttpRequest();
  xhr.open("POST", "api/embed", true);
  xhr.responseType = "blob";
  xhr.timeout = 5 * 60 * 1000;

  const form = new FormData();
  form.append("map", selectedMap, selectedMap.name);
  form.append("source", selectedSource, selectedSource.name);
  form.append("sourceKind", activeInputKind === "replay" ? "replay" : "ghost");
  if (activeInputKind === "replay") {
    form.append("ghostIndex", String(selectedGhostIndex));
  }

  showOverlay("Uploading files...");

  xhr.upload.onprogress = (event) => {
    if (!event.lengthComputable) return;
    overlayText.textContent = "Uploading files...";
    progressText.textContent = `${formatPercent((event.loaded / event.total) * 100)} (${formatKilobytes(event.loaded)} / ${formatKilobytes(event.total)})`;
  };

  xhr.upload.onloadend = () => {
    overlayText.textContent = "Embedding selected ghost...";
    progressText.textContent = "";
  };

  let downloadStarted = false;
  xhr.onprogress = (event) => {
    if (!downloadStarted) {
      downloadStarted = true;
      overlayText.textContent = "Downloading embedded map...";
      progressText.textContent = "";
    }

    if (event.lengthComputable) {
      progressText.textContent = `${formatPercent((event.loaded / event.total) * 100)} (${formatKilobytes(event.loaded)} / ${formatKilobytes(event.total)})`;
    } else {
      progressText.textContent = `${formatKilobytes(event.loaded)}`;
    }
  };

  xhr.onerror = () => {
    isEmbedding = false;
    updateButtonState();
    hideOverlay();
    setError("Network error during embed request.");
  };

  xhr.ontimeout = () => {
    isEmbedding = false;
    updateButtonState();
    hideOverlay();
    setError("Timed out while embedding.");
  };

  xhr.onload = () => {
    isEmbedding = false;
    updateButtonState();
    hideOverlay();

    if (xhr.status !== 200) {
      const reader = new FileReader();
      reader.onload = () => {
        const parsed = parseJsonOrNull(reader.result || "");
        setError(parsed?.error || "Embed request failed.");
      };
      reader.readAsText(xhr.response);
      return;
    }

    const blob = xhr.response;
    const contentDisposition = xhr.getResponseHeader("Content-Disposition") || "";
    const match = /filename="([^"]+)"/i.exec(contentDisposition);
    const outName = match ? match[1] : "embedded-validation-ghost.Map.Gbx";

    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = outName;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);

    if (activeInputKind === "replay") {
      setStatus(`Done. Uploaded files, embedded replay ghost index ${selectedGhostIndex}, and downloaded map.`);
    } else {
      setStatus("Done. Uploaded files, embedded ghost, and downloaded map.");
    }
  };

  xhr.send(form);
});

bindFileDropZone(mapDrop, mapInput, onMapPick);
bindFileDropZone(sourceDrop, sourceInput, onSourcePick);
