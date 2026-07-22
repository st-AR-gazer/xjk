const drop = document.getElementById("drop");
const fileInput = document.getElementById("file");
const fileName = document.getElementById("fileName");
const goBtn = document.getElementById("go");

const variantSelect = document.getElementById("variant");
const coverageSelect = document.getElementById("coverage");
const suffixInput = document.getElementById("suffix");

let selectedFiles = [];
let isBusy = false;

const {
  bindFileDropZone,
  createStandardToolUi,
  createTransferProgressCallbacks,
  delay,
  formatKilobytes,
  formatTransferProgress,
  parseContentDispositionFilename,
  readBlobErrorMessage,
  sendXhr,
  setDropZoneReady,
  triggerBlobDownload,
} = window.ToolTheme;
const {
  errorElement: errorEl,
  hideOverlay,
  overlayTextElement: overlayText,
  progressTextElement: progressText,
  setError,
  setStatus,
  showOverlay,
} = createStandardToolUi();

function setBusy(busy) {
  isBusy = busy;
  goBtn.disabled = busy || selectedFiles.length === 0;
}

function pickFiles(files) {
  selectedFiles = Array.from(files || []).filter(Boolean);
  setDropZoneReady(drop, selectedFiles.length > 0);
  if (selectedFiles.length === 0) {
    fileName.textContent = "No maps selected";
    setBusy(false);
    return;
  }

  if (selectedFiles.length === 1) {
    const file = selectedFiles[0];
    fileName.textContent = `Selected: ${file.name} (${formatKilobytes(file.size)})`;
  } else {
    const totalBytes = selectedFiles.reduce((sum, file) => sum + (file?.size || 0), 0);
    fileName.textContent = `Selected: ${selectedFiles.length} maps (${formatKilobytes(totalBytes)} total)`;
  }

  setBusy(false);
}

bindFileDropZone(drop, fileInput, pickFiles, {
  isDisabled: () => isBusy,
  multiple: true,
});

function buildOptionsFormData(form) {
  form.append("variant", variantSelect.value);
  form.append("coverage", coverageSelect.value);
  form.append("suffix", suffixInput.value.trim() || "Underwater");
}

async function downloadFromUrl(url, fallbackName) {
  overlayText.textContent = "Downloading...";
  progressText.textContent = "";
  const xhr = await sendXhr({
    method: "GET",
    url,
    responseType: "blob",
    timeoutMs: 10 * 60 * 1000,
    onDownloadProgress(event) {
      overlayText.textContent = "Downloading...";
      progressText.textContent = formatTransferProgress(event);
    },
  });
  if (xhr.status !== 200) {
    setError(await readBlobErrorMessage(xhr.response, "Server error."));
    throw new Error("Server error.");
  }

  const blob = xhr.response;
  const outName = parseContentDispositionFilename(xhr.getResponseHeader("Content-Disposition")) || fallbackName;
  triggerBlobDownload(blob, outName);
  return { outName, contentType: xhr.getResponseHeader("Content-Type") || "" };
}

async function convertSingle(file) {
  const form = new FormData();
  form.append("map", file, file.name);
  buildOptionsFormData(form);

  const transferProgress = createTransferProgressCallbacks({
    overlayTextElement: overlayText,
    progressTextElement: progressText,
    processingLabel: "Converting...",
    processingMessage: "Placing water carriers and building the underwater map...",
  });
  showOverlay("Uploading...");
  const xhr = await sendXhr({
    url: "api/convert",
    body: form,
    responseType: "blob",
    timeoutMs: 10 * 60 * 1000,
    ...transferProgress,
  });
  hideOverlay();

  if (xhr.status !== 200) {
    setError(await readBlobErrorMessage(xhr.response, "Server error."));
    throw new Error("Server error.");
  }

  const blob = xhr.response;
  const cdName = parseContentDispositionFilename(xhr.getResponseHeader("Content-Disposition"));
  const contentType = (xhr.getResponseHeader("Content-Type") || "").toLowerCase();
  const outName = cdName || (contentType.includes("zip") ? "underwater.zip" : "underwater.Map.Gbx");
  triggerBlobDownload(blob, outName);
  return { outName, contentType };
}

async function convertBatch(files) {
  showOverlay("Uploading...");

  const start = await new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", "api/convert-batch", true);
    xhr.responseType = "json";
    xhr.timeout = 10 * 60 * 1000;

    const form = new FormData();
    files.forEach((file) => form.append("maps", file, file.name));
    buildOptionsFormData(form);

    xhr.upload.onprogress = (e) => {
      if (!e.lengthComputable) return;
      overlayText.textContent = "Uploading...";
      progressText.textContent = formatTransferProgress(e);
    };

    xhr.onerror = () => reject(new Error("Network error."));
    xhr.ontimeout = () => reject(new Error("Request timed out."));

    xhr.onload = () => {
      if (xhr.status !== 202) {
        const text = xhr.responseText || "";
        try {
          setError(JSON.parse(text).error || "Server error.");
        } catch {
          setError("Server error.");
        }
        hideOverlay();
        return reject(new Error("Server error."));
      }

      const payload =
        xhr.response ||
        (() => {
          try {
            return JSON.parse(xhr.responseText || "{}");
          } catch {
            return {};
          }
        })();

      if (!payload?.jobId || !payload?.statusUrl || !payload?.downloadUrl) {
        hideOverlay();
        setError("Server response was missing job details.");
        return reject(new Error("Bad server response."));
      }

      resolve(payload);
    };

    xhr.send(form);
  });

  overlayText.textContent = "Queued...";
  progressText.textContent = "Waiting for the server to finish converting your maps...";

  const statusUrl = start.statusUrl.replace(/^\//, "");
  const downloadUrl = start.downloadUrl.replace(/^\//, "");

  let status = null;
  for (;;) {
    const resp = await fetch(statusUrl, { cache: "no-store" });
    if (!resp.ok) {
      hideOverlay();
      setError("Failed to read job status.");
      throw new Error("Failed to read job status.");
    }

    status = await resp.json();
    const accepted = status?.counts?.accepted ?? status?.files?.length ?? 0;
    const rejected = status?.counts?.rejected ?? status?.rejectedFiles?.length ?? 0;
    const done = status?.counts?.done ?? 0;
    const ok = status?.counts?.ok ?? 0;
    const failed = status?.counts?.failed ?? 0;

    if (status?.state === "done") break;

    overlayText.textContent = status?.state === "processing" ? `Converting... (${done}/${accepted})` : "Queued...";
    progressText.textContent = `${ok} ok, ${failed} failed, ${rejected} rejected`;

    await delay(2000);
  }

  overlayText.textContent = "Downloading...";
  progressText.textContent = "";

  const fallbackName = status?.zip?.name || "underwater-batch.zip";
  await downloadFromUrl(downloadUrl, fallbackName);

  const ok = status?.counts?.ok ?? 0;
  const failed = status?.counts?.failed ?? 0;
  const rejected = status?.counts?.rejected ?? 0;
  setStatus(`Done! ${ok} converted, ${failed + rejected} failed/rejected. (See errors.json inside the zip.)`);
}

goBtn.addEventListener("click", () => {
  if (isBusy) return;
  if (selectedFiles.length === 0) return;

  setError("");
  setStatus("");
  setBusy(true);

  const promise =
    selectedFiles.length === 1
      ? convertSingle(selectedFiles[0]).then(({ contentType }) => {
          setStatus(contentType.includes("zip") ? "Done! Downloaded a zip." : "Done! Converted map downloaded.");
        })
      : convertBatch(selectedFiles);

  promise
    .catch((err) => {
      if (String(err?.message || "").includes("timed out")) setError("Request timed out.");
      else if (!errorEl.textContent) setError("Something went wrong.");
    })
    .finally(() => {
      hideOverlay();
      setBusy(false);
    });
});
