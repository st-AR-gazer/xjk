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

const summaryPanel = document.getElementById("summary");
const summaryGrid = document.getElementById("summaryGrid");
const summaryNote = document.getElementById("summaryNote");

let selectedMap = null;
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
  downloadName: "embedded-check-report.json",
  setStatus,
  setError,
});

function onMapPick(file) {
  selectedMap = selectUploadFile({
    file,
    dropElement: mapDrop,
    nameElement: mapName,
    submitElement: goBtn,
    emptyLabel: "No map selected",
    invalidMessage: "Please select a .Map.Gbx or .Gbx map file.",
    accepts: (candidate) => isMapGbxFilename(candidate.name),
    setError,
    setStatus,
  });
}

function onManualPick(file) {
  selectedManual = selectUploadFile({
    file,
    dropElement: manualDrop,
    nameElement: manualName,
    emptyLabel: "No manual overrides file selected",
    invalidMessage: "Manual overrides must be a JSON file.",
    accepts: (candidate) =>
      String(candidate.name || "")
        .toLowerCase()
        .endsWith(".json"),
    controlsSubmit: false,
    setError,
    setStatus,
  });
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

  summaryGrid.replaceChildren();
  summaryGrid.append(
    createSummaryRow("Map UID", report.mapUid || "Unknown"),
    createSummaryRow("Map Name", report.mapName || "Unknown"),
    createSummaryRow(
      "Properly Embedded",
      report.hasProperlyEmbeddedBlocks === true ? "Yes" : report.hasProperlyEmbeddedBlocks === false ? "No" : "Unknown"
    ),
    createSummaryRow("Missing Expected", report.missingExpectedEmbeddedItemCount ?? "N/A"),
    createSummaryRow("Not Properly Embedded", report.notProperlyEmbeddedItemCount ?? "N/A"),
    createSummaryRow("Used Custom Models", report.usedCustomItemCount ?? "N/A")
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
  renderJsonResult(payload?.report ?? payload);
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

async function runChecker() {
  if (!selectedMap) return;

  setError("");
  setStatus("");
  showOverlay("Uploading map...");

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
        overlayText.textContent = "Running checker...";
        progressText.textContent = "";
      },
    });
    const payload = parseJsonOrNull(xhr.responseText || "{}");
    if (xhr.status !== 200 || !payload?.ok) {
      setError(payload?.error || "Checker failed.");
      return;
    }

    renderSummary(payload);
    renderResult(payload);
    setStatus("Checker completed.");
  } catch (error) {
    setError(error?.code === "timeout" ? "Request timed out." : "Network error while running checker.");
  } finally {
    goBtn.disabled = false;
    hideOverlay();
  }
}

goBtn.addEventListener("click", runChecker);

bindFileDropZone(mapDrop, mapFileInput, onMapPick);
bindFileDropZone(manualDrop, manualFileInput, onManualPick);
