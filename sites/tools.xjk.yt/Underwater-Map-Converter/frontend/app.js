const drop = document.getElementById("drop");
const fileInput = document.getElementById("file");
const fileName = document.getElementById("fileName");
const goBtn = document.getElementById("go");

const variantSelect = document.getElementById("variant");
const coverageSelect = document.getElementById("coverage");
const suffixInput = document.getElementById("suffix");

const statusEl = document.getElementById("status");
const errorEl = document.getElementById("error");

const overlay = document.getElementById("overlay");
const overlayText = document.getElementById("overlayText");
const progressText = document.getElementById("progressText");

let selectedFiles = [];
let isBusy = false;

function setError(msg) { errorEl.textContent = msg || ""; }
function setStatus(msg) { statusEl.textContent = msg || ""; }

function showOverlay(text) {
  overlayText.textContent = text;
  progressText.textContent = "";
  overlay.classList.remove("hidden");
}

function hideOverlay() { overlay.classList.add("hidden"); }
function formatPct(n) { return `${Math.round(n)}%`; }

function setBusy(busy) {
  isBusy = busy;
  goBtn.disabled = busy || selectedFiles.length === 0;
}

function pickFiles(files) {
  selectedFiles = Array.from(files || []).filter(Boolean);
  drop.classList.toggle("ready", selectedFiles.length > 0);
  if (selectedFiles.length === 0) {
    fileName.textContent = "No maps selected";
    setBusy(false);
    return;
  }

  if (selectedFiles.length === 1) {
    const file = selectedFiles[0];
    fileName.textContent = `Selected: ${file.name} (${Math.round(file.size / 1024)} KB)`;
  } else {
    const totalKB = Math.round(selectedFiles.reduce((sum, f) => sum + (f?.size || 0), 0) / 1024);
    fileName.textContent = `Selected: ${selectedFiles.length} maps (${totalKB} KB total)`;
  }

  setBusy(false);
}

drop.addEventListener("click", () => {
  if (isBusy) return;
  fileInput.click();
});

drop.addEventListener("dragover", (e) => {
  e.preventDefault();
  if (isBusy) return;
  drop.classList.add("dragover");
});

drop.addEventListener("dragleave", () => drop.classList.remove("dragover"));

drop.addEventListener("drop", (e) => {
  e.preventDefault();
  drop.classList.remove("dragover");
  if (isBusy) return;
  pickFiles(e.dataTransfer.files);
});

fileInput.addEventListener("change", () => {
  if (isBusy) return;
  pickFiles(fileInput.files);
});

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function parseContentDispositionFilename(value) {
  const cd = String(value || "");
  const match = /filename="([^"]+)"/i.exec(cd);
  return match ? match[1] : "";
}

function triggerDownload(blob, outName) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = outName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function readBlobText(blob) {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => resolve("");
    reader.readAsText(blob);
  });
}

async function setErrorFromBlobResponse(blob, fallback) {
  const text = await readBlobText(blob);
  if (!text) {
    setError(fallback);
    return;
  }
  try {
    setError(JSON.parse(text).error || fallback);
  } catch {
    setError(text || fallback);
  }
}

function buildOptionsFormData(form) {
  form.append("variant", variantSelect.value);
  form.append("coverage", coverageSelect.value);
  form.append("suffix", suffixInput.value.trim() || "Underwater");
}

async function downloadFromUrl(url, fallbackName) {
  return await new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("GET", url, true);
    xhr.responseType = "blob";
    xhr.timeout = 10 * 60 * 1000;

    let downloadStarted = false;
    overlayText.textContent = "Downloading...";
    progressText.textContent = "";

    xhr.onprogress = (e) => {
      if (!downloadStarted) {
        downloadStarted = true;
        overlayText.textContent = "Downloading...";
        progressText.textContent = "";
      }
      if (e.lengthComputable) {
        const pct = (e.loaded / e.total) * 100;
        progressText.textContent = `${formatPct(pct)} (${Math.round(e.loaded / 1024)} KB / ${Math.round(e.total / 1024)} KB)`;
      } else {
        progressText.textContent = `${Math.round(e.loaded / 1024)} KB`;
      }
    };

    xhr.onerror = () => reject(new Error("Network error."));
    xhr.ontimeout = () => reject(new Error("Request timed out."));

    xhr.onload = async () => {
      if (xhr.status !== 200) {
        await setErrorFromBlobResponse(xhr.response, "Server error.");
        return reject(new Error("Server error."));
      }

      const blob = xhr.response;
      const outName = parseContentDispositionFilename(xhr.getResponseHeader("Content-Disposition")) || fallbackName;
      triggerDownload(blob, outName);
      resolve({ outName, contentType: xhr.getResponseHeader("Content-Type") || "" });
    };

    xhr.send();
  });
}

async function convertSingle(file) {
  return await new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", "api/convert", true);
    xhr.responseType = "blob";
    xhr.timeout = 10 * 60 * 1000;

    const form = new FormData();
    form.append("map", file, file.name);
    buildOptionsFormData(form);

    let uploadDone = false;
    let downloadStarted = false;

    showOverlay("Uploading...");

    xhr.upload.onprogress = (e) => {
      if (!e.lengthComputable) return;
      const pct = (e.loaded / e.total) * 100;
      overlayText.textContent = "Uploading...";
      progressText.textContent = `${formatPct(pct)} (${Math.round(e.loaded / 1024)} KB / ${Math.round(e.total / 1024)} KB)`;
    };

    xhr.upload.onloadend = () => {
      uploadDone = true;
      overlayText.textContent = "Converting...";
      progressText.textContent = "Placing water carriers and building the underwater map...";
    };

    xhr.onprogress = (e) => {
      if (!downloadStarted) {
        downloadStarted = true;
        overlayText.textContent = "Downloading...";
        progressText.textContent = "";
      }
      if (e.lengthComputable) {
        const pct = (e.loaded / e.total) * 100;
        progressText.textContent = `${formatPct(pct)} (${Math.round(e.loaded / 1024)} KB / ${Math.round(e.total / 1024)} KB)`;
      } else if (uploadDone) {
        progressText.textContent = `${Math.round(e.loaded / 1024)} KB`;
      }
    };

    xhr.onerror = () => reject(new Error("Network error."));
    xhr.ontimeout = () => reject(new Error("Request timed out."));

    xhr.onload = async () => {
      hideOverlay();

      if (xhr.status !== 200) {
        await setErrorFromBlobResponse(xhr.response, "Server error.");
        return reject(new Error("Server error."));
      }

      const blob = xhr.response;
      const cdName = parseContentDispositionFilename(xhr.getResponseHeader("Content-Disposition"));
      const contentType = (xhr.getResponseHeader("Content-Type") || "").toLowerCase();
      const outName = cdName || (contentType.includes("zip") ? "underwater.zip" : "underwater.Map.Gbx");

      triggerDownload(blob, outName);
      resolve({ outName, contentType });
    };

    xhr.send(form);
  });
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
      const pct = (e.loaded / e.total) * 100;
      overlayText.textContent = "Uploading...";
      progressText.textContent = `${formatPct(pct)} (${Math.round(e.loaded / 1024)} KB / ${Math.round(e.total / 1024)} KB)`;
    };

    xhr.onerror = () => reject(new Error("Network error."));
    xhr.ontimeout = () => reject(new Error("Request timed out."));

    xhr.onload = () => {
      if (xhr.status !== 202) {
        const text = xhr.responseText || "";
        try { setError(JSON.parse(text).error || "Server error."); }
        catch { setError("Server error."); }
        hideOverlay();
        return reject(new Error("Server error."));
      }

      const payload = xhr.response || (() => {
        try { return JSON.parse(xhr.responseText || "{}"); } catch { return {}; }
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

    overlayText.textContent = status?.state === "processing"
      ? `Converting... (${done}/${accepted})`
      : "Queued...";
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

  const promise = selectedFiles.length === 1
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
