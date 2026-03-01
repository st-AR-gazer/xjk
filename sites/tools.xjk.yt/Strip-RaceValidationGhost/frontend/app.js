const drop = document.getElementById("drop");
const fileInput = document.getElementById("file");
const fileName = document.getElementById("fileName");
const goBtn = document.getElementById("go");

const returnMapInput = document.getElementById("returnMap");
const returnGhostInput = document.getElementById("returnGhost");
const returnReplayInput = document.getElementById("returnReplay");

const statusEl = document.getElementById("status");
const errorEl = document.getElementById("error");

const overlay = document.getElementById("overlay");
const overlayText = document.getElementById("overlayText");
const progressText = document.getElementById("progressText");

let selectedFile = null;

function setError(msg) {
  errorEl.textContent = msg || "";
}

function setStatus(msg) {
  statusEl.textContent = msg || "";
}

function showOverlay(text) {
  overlayText.textContent = text;
  progressText.textContent = "";
  overlay.classList.remove("hidden");
}

function hideOverlay() {
  overlay.classList.add("hidden");
}

function formatPct(n) {
  return `${Math.round(n)}%`;
}

function pickFile(file) {
  selectedFile = file;
  drop.classList.toggle("ready", Boolean(file));
  if (!file) {
    fileName.textContent = "No map selected";
    goBtn.disabled = true;
    return;
  }
  fileName.textContent = `Selected: ${file.name} (${Math.round(file.size / 1024)} KB)`;
  goBtn.disabled = false;
}

function getReturnSelection() {
  return {
    returnMap: Boolean(returnMapInput?.checked),
    returnGhost: Boolean(returnGhostInput?.checked),
    returnReplay: Boolean(returnReplayInput?.checked),
  };
}

drop.addEventListener("click", () => fileInput.click());

drop.addEventListener("dragover", (e) => {
  e.preventDefault();
  drop.classList.add("dragover");
});

drop.addEventListener("dragleave", () => drop.classList.remove("dragover"));

drop.addEventListener("drop", (e) => {
  e.preventDefault();
  drop.classList.remove("dragover");
  const file = e.dataTransfer.files?.[0];
  pickFile(file);
});

fileInput.addEventListener("change", () => {
  pickFile(fileInput.files?.[0]);
});

goBtn.addEventListener("click", () => {
  if (!selectedFile) return;

  const returns = getReturnSelection();

  setError("");
  setStatus("");

  const xhr = new XMLHttpRequest();
  xhr.open("POST", "api/strip", true);
  xhr.responseType = "blob";
  xhr.timeout = 5 * 60 * 1000;

  const form = new FormData();
  form.append("map", selectedFile, selectedFile.name);

  if (returns.returnMap) form.append("returnMap", "true");
  if (returns.returnGhost) form.append("returnGhost", "true");
  if (returns.returnReplay) form.append("returnReplay", "true");

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
    overlayText.textContent = "Processing...";
    progressText.textContent = "Running the remover on the server...";
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

  xhr.onerror = () => {
    hideOverlay();
    setError("Network error while uploading/downloading.");
  };

  xhr.ontimeout = () => {
    hideOverlay();
    setError("Timed out waiting for the server. Try again or increase timeouts.");
  };

  xhr.onload = () => {
    hideOverlay();

    if (xhr.status !== 200) {
      const reader = new FileReader();
      reader.onload = () => {
        try {
          const obj = JSON.parse(reader.result);
          setError(obj.error || "Server error.");
        } catch {
          setError("Server error.");
        }
      };
      reader.readAsText(xhr.response);
      return;
    }

    const contentType = (xhr.getResponseHeader("Content-Type") || "").toLowerCase();

    if (contentType.includes("application/json")) {
      const reader = new FileReader();
      reader.onload = () => {
        try {
          const obj = JSON.parse(reader.result);
          setStatus(obj.message || "Processed successfully.");
        } catch {
          setStatus("Processed successfully.");
        }
      };
      reader.readAsText(xhr.response);
      return;
    }

    const blob = xhr.response;
    const cd = xhr.getResponseHeader("Content-Disposition") || "";
    const match = /filename="([^"]+)"/i.exec(cd);
    let outName = match ? match[1] : "download.bin";

    if (!match && contentType.includes("application/zip")) {
      outName = "exports.zip";
    }

    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = outName;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);

    if (contentType.includes("application/zip")) {
      setStatus("Done! Your selected files downloaded as a zip.");
    } else {
      setStatus("Done! Your selected file downloaded.");
    }
  };

  xhr.send(form);
});
