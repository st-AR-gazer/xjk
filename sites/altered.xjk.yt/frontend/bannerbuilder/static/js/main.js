const form = document.getElementById("banner-form");
const generateBtn = document.getElementById("generate-btn");
const resetBtn = document.getElementById("reset-btn");
const previewImg = document.getElementById("preview-img");

const editMainBtn = document.getElementById("edit-main-btn");
const editSubBtn = document.getElementById("edit-sub-btn");

const topRow = document.getElementById("solids-top");
const bottomRow = document.getElementById("solids-bottom");

const panel = document.getElementById("editor-panel");
const panelTitle = document.getElementById("editor-title");
const panelForm = document.getElementById("editor-form");
const closePanel = document.getElementById("close-editor");

const downloadBtn = document.getElementById("download-btn");
const dashBtn = document.getElementById("dashmap-btn");
const pageConfig = document.body?.dataset || {};
const dashmapEnabled = pageConfig.dashmapEnabled === "true";
const dashmapMessage =
  pageConfig.dashmapMessage || "Dashmap uploads are not configured on this server.";
const ACTIVE_BANNER_KEEPALIVE_MS = 120000;

window.__latestBannerId = null;
window.__selectedBannerId = null;
window.__dashmapCache = window.__dashmapCache || {};
window.__dashmapEnabled = dashmapEnabled;
window.__dashmapMessage = dashmapMessage;
window.__activeBannerIds = window.__activeBannerIds || new Set();
window.__setDownloadReady = (ready) => {
  if (!downloadBtn) return;
  downloadBtn.classList.toggle("ready", Boolean(ready));
};
window.__setDashmapReady = (ready) => {
  if (!dashBtn) return;
  dashBtn.classList.toggle("ready", Boolean(ready) && dashmapEnabled);
};

let keepaliveTimer = null;

function getActiveBannerIds() {
  return Array.from(window.__activeBannerIds || []);
}

function rememberActiveBanner(id) {
  if (!id) return;
  window.__activeBannerIds.add(id);
}

async function refreshActiveBanners() {
  const ids = getActiveBannerIds();
  if (!ids.length) return;

  try {
    await fetch("api/banners/refresh", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ids }),
    });
  } catch (_) {
  }
}

function ensureKeepalive() {
  if (keepaliveTimer) return;
  keepaliveTimer = window.setInterval(() => {
    void refreshActiveBanners();
  }, ACTIVE_BANNER_KEEPALIVE_MS);
}

function releaseActiveBanners() {
  const ids = getActiveBannerIds();
  if (!ids.length) return;

  window.__activeBannerIds.clear();

  const payload = JSON.stringify({ ids });
  if (navigator.sendBeacon) {
    const blob = new Blob([payload], { type: "application/json" });
    navigator.sendBeacon("api/banners/release", blob);
    return;
  }

  fetch("api/banners/release", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: payload,
    keepalive: true,
  }).catch(() => {});
}

window.addEventListener("pagehide", releaseActiveBanners);

const elements = {
  main: { title: "Main time", props: { fs: 120, x: null, y: null, rot: 0 } },
  sub: { title: "Secondary", props: { fs: 60, x: 1130, y: 100, rot: 350 } },
  dodecahedron: {
    title: "Dodecahedron",
    img: "assets/solids/Dodecahedron.png",
    props: { w: 180, h: 180, x: null, y: null, rot: 0 },
  },
  tetrahedron: {
    title: "Tetrahedron",
    img: "assets/solids/Tetrahedron.png",
    props: { w: 180, h: 180, x: null, y: null, rot: 0 },
  },
  cube: {
    title: "Cube",
    img: "assets/solids/Cube.png",
    props: { w: 180, h: 180, x: null, y: null, rot: 0 },
  },
  octahedron: {
    title: "Octahedron",
    img: "assets/solids/Octahedron.png",
    props: { w: 180, h: 180, x: null, y: null, rot: 0 },
  },
  icosahedron: {
    title: "Icosahedron",
    img: "assets/solids/Icosahedron.png",
    props: { w: 180, h: 180, x: null, y: null, rot: 0 },
  },
};

let topBoxes = [null, null, "cube", null, null];
let bottomBoxes = ["dodecahedron", "tetrahedron", "octahedron", "icosahedron"];

function renderRows() {
  const build = (container, arr, isBottom) => {
    container.innerHTML = "";
    arr.forEach((key, idx) => {
      const box = document.createElement("div");
      box.className = "drop-box";
      box.dataset.row = isBottom ? "bottom" : "top";
      box.dataset.idx = idx;

      box.ondragover = (e) => {
        e.preventDefault();
        box.classList.add("over");
      };
      box.ondragleave = () => box.classList.remove("over");
      box.ondrop = (e) => {
        e.preventDefault();
        box.classList.remove("over");
        const from = e.dataTransfer.getData("text/plain");
        if (from) swap(from, box.dataset.row, parseInt(box.dataset.idx, 10));
      };

      if (key) {
        const img = document.createElement("img");
        img.src = elements[key].img;
        img.alt = elements[key].title;
        img.draggable = true;
        img.ondragstart = (e) => e.dataTransfer.setData("text/plain", key);
        img.ondblclick = () => openPanel(key);
        box.append(img);

        if (isBottom) {
          const badge = document.createElement("span");
          badge.className = "badge";
          badge.textContent = idx + 1;
          box.append(badge);
        }
      }
      container.append(box);
    });
  };
  build(topRow, topBoxes, false);
  build(bottomRow, bottomBoxes, true);
}

function swap(key, row, idx) {
  const srcArr = topBoxes.includes(key) ? topBoxes : bottomBoxes;
  const dstArr = row === "top" ? topBoxes : bottomBoxes;
  const srcIdx = srcArr.indexOf(key);
  [srcArr[srcIdx], dstArr[idx]] = [dstArr[idx], srcArr[srcIdx]];
  renderRows();
}

resetBtn.onclick = () => {
  topBoxes = [null, null, "cube", null, null];
  bottomBoxes = ["dodecahedron", "tetrahedron", "octahedron", "icosahedron"];
  renderRows();
};

editMainBtn.onclick = () => openPanel("main");
editSubBtn.onclick = () => openPanel("sub");
closePanel.onclick = () => panel.classList.remove("open");

function openPanel(key) {
  panelTitle.textContent = elements[key].title;
  panelForm.innerHTML = "";
  for (const p in elements[key].props) panelForm.append(ctrl(p, elements[key]));
  panel.classList.add("open");
}

function ctrl(prop, el) {
  const names = { fs: "Font size", x: "X", y: "Y", w: "Width", h: "Height", rot: "Rotation" };
  const wrap = document.createElement("label");
  wrap.textContent = names[prop];

  const r = document.createElement("input");
  r.type = "range";
  const n = document.createElement("input");
  n.type = "number";

  const lim = { x: 1600, y: 200, w: 800, h: 800, fs: 400, rot: 360 }[prop] || 200;
  r.min = prop === "fs" ? 8 : 0;
  r.max = lim;
  r.step = 1;
  n.step = 1;

  r.value = el.props[prop] ?? 0;
  n.value = r.value;

  r.oninput = () => {
    n.value = r.value;
    el.props[prop] = parseInt(r.value, 10);
  };
  n.oninput = () => {
    r.value = n.value;
    el.props[prop] = parseInt(n.value, 10);
  };

  wrap.append(r, n);
  return wrap;
}

function payload() {
  const p = Object.fromEntries(new FormData(form).entries());
  p.order = bottomBoxes.join(",");
  for (const [k, el] of Object.entries(elements)) {
    for (const [prop, val] of Object.entries(el.props)) {
      if (val !== null && val !== "") p[`${k}_${prop}`] = val;
    }
  }
  return p;
}

async function readErrorMessage(response, fallback) {
  const contentType = response.headers.get("content-type") || "";
  if (contentType.includes("application/json")) {
    try {
      const data = await response.json();
      if (typeof data?.error === "string" && data.error.trim()) return data.error;
      if (typeof data?.message === "string" && data.message.trim()) return data.message;
    } catch (_) {
    }
  }

  const text = (await response.text()).trim();
  if (!text) return fallback;

  const lower = text.toLowerCase();
  if (lower.startsWith("<!doctype") || lower.startsWith("<html")) return fallback;

  return text;
}

async function downloadCurrentBanner() {
  const id = window.__selectedBannerId || window.__latestBannerId;
  const src = previewImg.currentSrc || previewImg.src;
  if (!src) {
    alert("Generate a banner first, or pick one from History.");
    return;
  }

  try {
    downloadBtn.disabled = true;
    downloadBtn.textContent = "Downloading...";

    const response = await fetch(src);
    if (!response.ok) {
      throw new Error(await readErrorMessage(response, "Download failed."));
    }

    const blob = await response.blob();
    const href = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = href;
    link.download = id ? `banner-${id}.png` : "banner.png";
    document.body.append(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(href), 1000);
  } catch (error) {
    alert(error.message || String(error));
  } finally {
    downloadBtn.disabled = false;
    downloadBtn.textContent = "Download image";
  }
}

generateBtn.onclick = async () => {
  generateBtn.classList.remove("hollow");
  window.__setDownloadReady(false);
  window.__setDashmapReady(false);
  previewImg.classList.remove("visible");

  try {
    const res = await fetch("api/banners", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload()),
    });
    if (!res.ok) throw new Error(await readErrorMessage(res, "Banner generation failed."));

    const { id, url } = await res.json();
    window.__latestBannerId = id;
    window.__selectedBannerId = id;
    rememberActiveBanner(id);
    ensureKeepalive();

    previewImg.src = url;
    previewImg.onload = () => previewImg.classList.add("visible");

    generateBtn.classList.add("hollow");
    window.__setDownloadReady(true);
    window.__setDashmapReady(true);

    window.__addBannerHistory(id, url);
  } catch (e) {
    alert(e.message || String(e));
  }
};

if (downloadBtn) {
  downloadBtn.onclick = downloadCurrentBanner;
}

dashBtn.onclick = async () => {
  if (!dashmapEnabled) {
    alert(dashmapMessage);
    return;
  }

  const id = window.__selectedBannerId || window.__latestBannerId;
  if (!id) {
    alert("Generate a banner first, or pick one from History.");
    return;
  }

  if (window.__dashmapCache[id]) {
    window.showDashmapModal(window.__dashmapCache[id]);
    return;
  }

  try {
    dashBtn.disabled = true;
    dashBtn.textContent = "Uploading...";

    const res = await fetch(`api/banners/${id}/dashmap`, { method: "POST" });
    if (!res.ok) {
      throw new Error(await readErrorMessage(res, "Dashmap upload failed."));
    }

    const { dashmap_url } = await res.json();
    window.__dashmapCache[id] = dashmap_url;
    window.showDashmapModal(dashmap_url);
  } catch (err) {
    alert(err.message || String(err));
  } finally {
    dashBtn.disabled = false;
    dashBtn.textContent = "Dashmap URL";
  }
};

renderRows();
