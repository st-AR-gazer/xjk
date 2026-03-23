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

let selectedFile = null;

function setError(msg) { errorEl.textContent = msg || ""; }
function setStatus(msg) { statusEl.textContent = msg || ""; }

function showOverlay(text) {
  overlayText.textContent = text;
  progressText.textContent = "";
  overlay.classList.remove("hidden");
}

function hideOverlay() { overlay.classList.add("hidden"); }
function formatPct(n) { return `${Math.round(n)}%`; }

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

drop.addEventListener("click", () => fileInput.click());

drop.addEventListener("dragover", (e) => {
  e.preventDefault();
  drop.classList.add("dragover");
});

drop.addEventListener("dragleave", () => drop.classList.remove("dragover"));

drop.addEventListener("drop", (e) => {
  e.preventDefault();
  drop.classList.remove("dragover");
  pickFile(e.dataTransfer.files?.[0]);
});

fileInput.addEventListener("change", () => pickFile(fileInput.files?.[0]));

goBtn.addEventListener("click", () => {
  if (!selectedFile) return;

  setError("");
  setStatus("");

  const xhr = new XMLHttpRequest();
  xhr.open("POST", "api/convert", true);
  xhr.responseType = "blob";
  xhr.timeout = 10 * 60 * 1000;

  const form = new FormData();
  form.append("map", selectedFile, selectedFile.name);
  form.append("variant", variantSelect.value);
  form.append("coverage", coverageSelect.value);
  form.append("suffix", suffixInput.value.trim() || "Underwater");

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

  xhr.onerror = () => { hideOverlay(); setError("Network error."); };
  xhr.ontimeout = () => { hideOverlay(); setError("Request timed out."); };

  xhr.onload = () => {
    hideOverlay();

    if (xhr.status !== 200) {
      const reader = new FileReader();
      reader.onload = () => {
        try { setError(JSON.parse(reader.result).error || "Server error."); }
        catch { setError("Server error."); }
      };
      reader.readAsText(xhr.response);
      return;
    }

    const blob = xhr.response;
    const cd = xhr.getResponseHeader("Content-Disposition") || "";
    const match = /filename="([^"]+)"/i.exec(cd);
    const contentType = (xhr.getResponseHeader("Content-Type") || "").toLowerCase();
    let outName = match ? match[1] : (contentType.includes("zip") ? "underwater.zip" : "underwater.Map.Gbx");

    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = outName;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);

    setStatus(contentType.includes("zip") ? "Done! Both variants downloaded as a zip." : "Done! Converted map downloaded.");
  };

  xhr.send(form);
});
