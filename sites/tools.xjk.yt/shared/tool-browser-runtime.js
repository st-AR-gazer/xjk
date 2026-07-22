(function initToolBrowserRuntime(global) {
  "use strict";

  function formatPercent(value) {
    return `${Math.round(Number(value) || 0)}%`;
  }

  function formatKilobytes(bytes) {
    return `${Math.round((Number(bytes) || 0) / 1024)} KB`;
  }

  function formatTransferProgress(event) {
    const loaded = Number(event?.loaded) || 0;
    const total = Number(event?.total) || 0;
    if (!event?.lengthComputable || total <= 0) return formatKilobytes(loaded);
    return `${formatPercent((loaded / total) * 100)} (${formatKilobytes(loaded)} / ${formatKilobytes(total)})`;
  }

  function delay(ms) {
    return new Promise((resolve) => global.setTimeout(resolve, ms));
  }

  function createTransferProgressCallbacks({
    overlayTextElement,
    progressTextElement,
    uploadLabel = "Uploading...",
    processingLabel = "Processing...",
    processingMessage = "",
    downloadLabel = "Downloading...",
  } = {}) {
    let uploadComplete = false;
    let downloadStarted = false;

    return Object.freeze({
      onUploadProgress(event) {
        if (!event?.lengthComputable) return;
        if (overlayTextElement) overlayTextElement.textContent = uploadLabel;
        if (progressTextElement) progressTextElement.textContent = formatTransferProgress(event);
      },
      onUploadComplete() {
        uploadComplete = true;
        if (overlayTextElement) overlayTextElement.textContent = processingLabel;
        if (progressTextElement) progressTextElement.textContent = processingMessage;
      },
      onDownloadProgress(event) {
        if (!downloadStarted) {
          downloadStarted = true;
          if (overlayTextElement) overlayTextElement.textContent = downloadLabel;
          if (progressTextElement) progressTextElement.textContent = "";
        }
        if ((event?.lengthComputable || uploadComplete) && progressTextElement) {
          progressTextElement.textContent = formatTransferProgress(event);
        }
      },
    });
  }

  function parseJsonOrNull(value) {
    try {
      return JSON.parse(String(value ?? ""));
    } catch {
      return null;
    }
  }

  function isMapGbxFilename(value) {
    const filename = String(value || "").toLowerCase();
    return filename.endsWith(".map.gbx") || filename.endsWith(".gbx");
  }

  function createSummaryRow(label, value) {
    const item = global.document.createElement("div");
    item.className = "summary-item";

    const key = global.document.createElement("div");
    key.className = "k";
    key.textContent = label;

    const data = global.document.createElement("div");
    data.className = "v";
    data.textContent = value == null || value === "" ? "N/A" : String(value);

    item.append(key, data);
    return item;
  }

  async function copyTextToClipboard(value, { onSuccess, onError } = {}) {
    if (!value) return false;

    try {
      const clipboard = global.navigator?.clipboard;
      if (typeof clipboard?.writeText !== "function") throw new Error("Clipboard API is unavailable");
      await clipboard.writeText(String(value));
    } catch (error) {
      onError?.(error);
      return false;
    }

    onSuccess?.();
    return true;
  }

  function copyJsonToClipboard(value, { setStatus, setError } = {}) {
    return copyTextToClipboard(value, {
      onSuccess: () => setStatus?.("JSON copied to clipboard."),
      onError: () => setError?.("Could not copy JSON to clipboard."),
    });
  }

  async function readBlobText(blob) {
    if (typeof blob?.text === "function") {
      try {
        return String((await blob.text()) || "");
      } catch {
        return "";
      }
    }

    return await new Promise((resolve) => {
      const reader = new global.FileReader();
      reader.onload = () => resolve(String(reader.result || ""));
      reader.onerror = () => resolve("");
      reader.readAsText(blob);
    });
  }

  function parseContentDispositionFilename(value) {
    const match = /filename="([^"]+)"/i.exec(String(value || ""));
    return match ? match[1] : "";
  }

  function triggerBlobDownload(blob, filename, { document = global.document, URL = global.URL } = {}) {
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  }

  async function readBlobErrorMessage(blob, fallback = "Server error.") {
    const text = await readBlobText(blob);
    if (!text) return fallback;
    const payload = parseJsonOrNull(text);
    return payload?.error || text || fallback;
  }

  function sendXhr({
    url,
    method = "POST",
    body,
    responseType = "",
    timeoutMs = 5 * 60 * 1000,
    onUploadProgress,
    onUploadComplete,
    onDownloadProgress,
    xhrFactory = () => new global.XMLHttpRequest(),
  } = {}) {
    return new Promise((resolve, reject) => {
      const xhr = xhrFactory();
      xhr.open(method, url, true);
      if (responseType) xhr.responseType = responseType;
      xhr.timeout = timeoutMs;
      if (onUploadProgress) xhr.upload.onprogress = onUploadProgress;
      if (onUploadComplete) xhr.upload.onloadend = onUploadComplete;
      if (onDownloadProgress) xhr.onprogress = onDownloadProgress;
      xhr.onerror = () => reject(Object.assign(new Error("Network error."), { code: "network", xhr }));
      xhr.ontimeout = () => reject(Object.assign(new Error("Request timed out."), { code: "timeout", xhr }));
      xhr.onload = () => resolve(xhr);
      xhr.send(body);
    });
  }

  function setDropZoneReady(dropElement, value) {
    dropElement?.classList.toggle("ready", Boolean(value));
  }

  function bindFileDropZone(dropElement, inputElement, onPick, { isDisabled = () => false, multiple = false } = {}) {
    const pickFiles = (files) => onPick(multiple ? files : files?.[0] || null);

    dropElement.addEventListener("click", () => {
      if (!isDisabled()) inputElement.click();
    });

    dropElement.addEventListener("keydown", (event) => {
      if (event.key !== "Enter" && event.key !== " ") return;
      event.preventDefault();
      if (!isDisabled()) inputElement.click();
    });

    dropElement.addEventListener("dragover", (event) => {
      event.preventDefault();
      if (!isDisabled()) dropElement.classList.add("dragover");
    });

    dropElement.addEventListener("dragleave", () => {
      dropElement.classList.remove("dragover");
    });

    dropElement.addEventListener("drop", (event) => {
      event.preventDefault();
      dropElement.classList.remove("dragover");
      if (!isDisabled()) pickFiles(event.dataTransfer?.files);
    });

    inputElement.addEventListener("change", () => {
      if (!isDisabled()) pickFiles(inputElement.files);
    });
  }

  function createToolUiBindings({
    statusElement,
    errorElement,
    overlayElement,
    overlayTextElement,
    progressTextElement,
  } = {}) {
    function setError(message = "") {
      if (errorElement) errorElement.textContent = message || "";
    }

    function setStatus(message = "") {
      if (statusElement) statusElement.textContent = message || "";
    }

    function showOverlay(message = "Working...") {
      if (overlayTextElement) overlayTextElement.textContent = message || "Working...";
      if (progressTextElement) progressTextElement.textContent = "";
      overlayElement?.classList.remove("hidden");
    }

    function hideOverlay() {
      overlayElement?.classList.add("hidden");
    }

    return Object.freeze({
      hideOverlay,
      setError,
      setStatus,
      showOverlay,
    });
  }

  function createStandardToolUi(document = global.document) {
    const elements = {
      errorElement: document.getElementById("error"),
      overlayElement: document.getElementById("overlay"),
      overlayTextElement: document.getElementById("overlayText"),
      progressTextElement: document.getElementById("progressText"),
      statusElement: document.getElementById("status"),
    };
    return Object.freeze({
      ...elements,
      ...createToolUiBindings(elements),
    });
  }

  function createJsonResultBindings({
    resultElement,
    panelElement,
    downloadName = "result.json",
    setStatus,
    setError,
  } = {}) {
    let resultText = "";

    function render(value) {
      resultText = JSON.stringify(value, null, 2);
      if (resultElement) resultElement.textContent = resultText;
      panelElement?.classList.remove("hidden");
      return resultText;
    }

    function copy() {
      return copyJsonToClipboard(resultText, { setStatus, setError });
    }

    function download() {
      if (!resultText) return false;

      const blob = new global.Blob([resultText], { type: "application/json" });
      const url = global.URL.createObjectURL(blob);
      const link = global.document.createElement("a");
      link.href = url;
      link.download = downloadName;
      global.document.body.appendChild(link);
      link.click();
      link.remove();
      global.URL.revokeObjectURL(url);
      setStatus?.("JSON downloaded.");
      return true;
    }

    return Object.freeze({ copy, download, render });
  }

  function createStandardJsonResultBindings({ downloadName, setStatus, setError, document = global.document } = {}) {
    const bindings = createJsonResultBindings({
      resultElement: document.getElementById("resultJson"),
      panelElement: document.getElementById("resultPanel"),
      downloadName,
      setStatus,
      setError,
    });
    document.getElementById("copyBtn")?.addEventListener("click", bindings.copy);
    document.getElementById("downloadBtn")?.addEventListener("click", bindings.download);
    return bindings;
  }

  function selectUploadFile({
    file,
    dropElement,
    nameElement,
    submitElement,
    emptyLabel,
    invalidMessage,
    accepts = () => true,
    controlsSubmit = true,
    setError = () => {},
    setStatus = () => {},
  } = {}) {
    setError("");
    setStatus("");

    const accepted = file && accepts(file) ? file : null;
    setDropZoneReady(dropElement, accepted);
    if (nameElement) {
      nameElement.textContent = accepted
        ? `Selected: ${accepted.name} (${formatKilobytes(accepted.size)})`
        : emptyLabel;
    }
    if (controlsSubmit && submitElement) submitElement.disabled = !accepted;
    if (file && !accepted && invalidMessage) setError(invalidMessage);
    return accepted;
  }

  global.ToolBrowserRuntime = Object.freeze({
    bindFileDropZone,
    copyJsonToClipboard,
    copyTextToClipboard,
    createJsonResultBindings,
    createStandardJsonResultBindings,
    createStandardToolUi,
    createSummaryRow,
    createTransferProgressCallbacks,
    createToolUiBindings,
    delay,
    formatKilobytes,
    formatPercent,
    formatTransferProgress,
    isMapGbxFilename,
    parseContentDispositionFilename,
    parseJsonOrNull,
    readBlobErrorMessage,
    readBlobText,
    selectUploadFile,
    sendXhr,
    setDropZoneReady,
    triggerBlobDownload,
  });
})(window);
