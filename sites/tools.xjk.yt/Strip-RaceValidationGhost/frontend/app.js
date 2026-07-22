const drop = document.getElementById("drop");
const fileInput = document.getElementById("file");
const fileName = document.getElementById("fileName");
const goBtn = document.getElementById("go");

const returnMapInput = document.getElementById("returnMap");
const returnGhostInput = document.getElementById("returnGhost");
const returnReplayInput = document.getElementById("returnReplay");

let selectedFile = null;

const {
  bindFileDropZone,
  createStandardToolUi,
  createTransferProgressCallbacks,
  formatKilobytes,
  parseContentDispositionFilename,
  parseJsonOrNull,
  readBlobText,
  readBlobErrorMessage,
  sendXhr,
  setDropZoneReady,
  triggerBlobDownload,
} = window.ToolTheme;
const {
  hideOverlay,
  overlayTextElement: overlayText,
  progressTextElement: progressText,
  setError,
  setStatus,
  showOverlay,
} = createStandardToolUi();

function pickFile(file) {
  selectedFile = file;
  setDropZoneReady(drop, file);
  if (!file) {
    fileName.textContent = "No map selected";
    goBtn.disabled = true;
    return;
  }
  fileName.textContent = `Selected: ${file.name} (${formatKilobytes(file.size)})`;
  goBtn.disabled = false;
}

function getReturnSelection() {
  return {
    returnMap: Boolean(returnMapInput?.checked),
    returnGhost: Boolean(returnGhostInput?.checked),
    returnReplay: Boolean(returnReplayInput?.checked),
  };
}

bindFileDropZone(drop, fileInput, pickFile);

async function processMap() {
  if (!selectedFile) return;

  const returns = getReturnSelection();

  setError("");
  setStatus("");

  const form = new FormData();
  form.append("map", selectedFile, selectedFile.name);

  if (returns.returnMap) form.append("returnMap", "true");
  if (returns.returnGhost) form.append("returnGhost", "true");
  if (returns.returnReplay) form.append("returnReplay", "true");

  const transferProgress = createTransferProgressCallbacks({
    overlayTextElement: overlayText,
    progressTextElement: progressText,
    processingLabel: "Processing...",
    processingMessage: "Removing validation replay and clearing clone flags when present...",
  });

  showOverlay("Uploading...");
  goBtn.disabled = true;
  try {
    const xhr = await sendXhr({
      url: "api/strip",
      body: form,
      responseType: "blob",
      ...transferProgress,
    });
    if (xhr.status !== 200) {
      setError(await readBlobErrorMessage(xhr.response, "Server error."));
      return;
    }

    const contentType = (xhr.getResponseHeader("Content-Type") || "").toLowerCase();

    if (contentType.includes("application/json")) {
      const payload = parseJsonOrNull(await readBlobText(xhr.response));
      setStatus(payload?.message || "Processed successfully.");
      return;
    }

    const blob = xhr.response;
    const headerName = parseContentDispositionFilename(xhr.getResponseHeader("Content-Disposition"));
    let outName = headerName || "download.bin";
    if (!headerName && contentType.includes("application/zip")) {
      outName = "exports.zip";
    }
    triggerBlobDownload(blob, outName);

    if (contentType.includes("application/zip")) {
      setStatus("Done! Your selected files downloaded as a zip.");
    } else {
      setStatus("Done! Your selected file downloaded.");
    }
  } catch (error) {
    setError(
      error?.code === "timeout"
        ? "Timed out waiting for the server. Try again or increase timeouts."
        : "Network error while uploading/downloading."
    );
  } finally {
    hideOverlay();
    goBtn.disabled = !selectedFile;
  }
}

goBtn.addEventListener("click", processMap);
