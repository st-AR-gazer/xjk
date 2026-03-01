const state = {
  plugins: [],
  sourceLabel: "",
  syncWarning: "",
};

const elements = {
  buildDate: document.getElementById("buildDate"),
  statTotal: document.getElementById("statTotal"),
  statLive: document.getElementById("statLive"),
  statSoon: document.getElementById("statSoon"),
  catalogNote: document.getElementById("catalogNote"),
  toolSquares: document.getElementById("toolSquares"),
  toolGrid: document.getElementById("toolGrid"),
};

function normalizeImagePalette(rawPalette) {
  if (!rawPalette || typeof rawPalette !== "object") return null;

  const keys = [
    "accentA",
    "accentB",
    "buttonA",
    "buttonB",
    "buttonC",
    "buttonBorder",
    "buttonShadow",
    "cardBorderHover",
    "titleHover",
    "squareA",
    "squareB",
  ];

  const palette = {};
  for (const key of keys) {
    if (typeof rawPalette[key] !== "string" || !rawPalette[key]) {
      return null;
    }
    palette[key] = rawPalette[key];
  }

  palette.primaryHex = typeof rawPalette.primaryHex === "string" ? rawPalette.primaryHex : "";
  palette.secondaryHex = typeof rawPalette.secondaryHex === "string" ? rawPalette.secondaryHex : "";
  palette.source = typeof rawPalette.source === "string" ? rawPalette.source : "fallback";
  return palette;
}

function normalizePlugin(plugin, index) {
  if (!plugin || typeof plugin !== "object") return null;

  const statusRaw = String(plugin.status || "live").toLowerCase();
  const toneRaw = String(plugin.tone || "cool").toLowerCase();
  const tagsRaw = Array.isArray(plugin.tags) ? plugin.tags : [];

  return {
    id: String(plugin.id || `plugin-${index + 1}`),
    name: String(plugin.name || "Untitled Plugin"),
    description: String(plugin.description || "No description provided."),
    category: String(plugin.category || "Plugin"),
    status: statusRaw === "live" ? "live" : "soon",
    target: String(plugin.target || "Trackmania + Openplanet"),
    install: String(plugin.install || "Openplanet plugin manager"),
    link: typeof plugin.link === "string" ? plugin.link : "",
    tone: toneRaw === "warm" ? "warm" : "cool",
    image: typeof plugin.image === "string" ? plugin.image : "",
    tags: tagsRaw.map((tag) => String(tag)).filter(Boolean),
    imagePalette: normalizeImagePalette(plugin.imagePalette),
  };
}

function normalizePluginsList(rawPlugins) {
  if (!Array.isArray(rawPlugins)) return [];
  return rawPlugins.map((plugin, index) => normalizePlugin(plugin, index)).filter(Boolean);
}

function titleCase(value) {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function statusPillClass(status) {
  return status === "live" ? "pill pill-live" : "pill pill-soon";
}

function renderStats() {
  if (!elements.statTotal || !elements.statLive || !elements.statSoon) return;

  const liveCount = state.plugins.filter((plugin) => plugin.status === "live").length;
  const soonCount = state.plugins.filter((plugin) => plugin.status !== "live").length;

  elements.statTotal.textContent = String(state.plugins.length);
  elements.statLive.textContent = String(liveCount);
  elements.statSoon.textContent = String(soonCount);
}

function createMetaRow(label, value) {
  const row = document.createElement("li");
  const left = document.createElement("span");
  const right = document.createElement("strong");
  left.textContent = label;
  right.textContent = value;
  row.append(left, right);
  return row;
}

function createTagRow(tags) {
  if (!Array.isArray(tags) || !tags.length) return null;

  const row = document.createElement("div");
  row.className = "tool-tags";

  tags.forEach((tag) => {
    const chip = document.createElement("span");
    chip.className = "tool-tag";
    chip.textContent = tag;
    row.appendChild(chip);
  });

  return row;
}

function hashString(value) {
  let hash = 0;
  for (let i = 0; i < value.length; i += 1) {
    hash = (hash * 31 + value.charCodeAt(i)) >>> 0;
  }
  return hash;
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function wrapHue(hue) {
  const normalized = Number(hue) % 360;
  return normalized < 0 ? normalized + 360 : normalized;
}

function radToHue(rad) {
  return wrapHue((rad * 180) / Math.PI);
}

const TAU = Math.PI * 2;
const HUE_CIRCLE_START_RAD = (18 * Math.PI) / 180;
let hueByPluginId = new Map();

const SQUARE_EDGE_MARGIN_PERCENT = 4;
const SQUARE_MIN_RING_RATIO = 0.38;
const SQUARE_RADIUS_X_PERCENT = 46;
const SQUARE_RADIUS_Y_PERCENT = 42;
const SQUARE_INTERACTION_RADIUS_PX = 230;
const SQUARE_INTERACTION_SHIFT_PX = 10;
const SQUARE_INTERACTION_SCALE = 0.08;
const SQUARE_BASE_OPACITY = 0.16;
const SQUARE_HOVER_OPACITY = 0.34;

const squareMotionState = {
  items: [],
  pointerX: null,
  pointerY: null,
  rafId: 0,
  listenersReady: false,
  reduceMotion: window.matchMedia("(prefers-reduced-motion: reduce)").matches,
};

function seededUnit(seed, salt) {
  return (hashString(`${seed}:${salt}`) % 10000) / 10000;
}

function getSquareAnchor(seed) {
  const angle = seededUnit(seed, "angle") * TAU;
  const radius = SQUARE_MIN_RING_RATIO + seededUnit(seed, "radius") * (1 - SQUARE_MIN_RING_RATIO);
  const left = clamp(
    50 + Math.cos(angle) * radius * SQUARE_RADIUS_X_PERCENT,
    SQUARE_EDGE_MARGIN_PERCENT,
    100 - SQUARE_EDGE_MARGIN_PERCENT
  );
  const top = clamp(
    50 + Math.sin(angle) * radius * SQUARE_RADIUS_Y_PERCENT,
    SQUARE_EDGE_MARGIN_PERCENT,
    100 - SQUARE_EDGE_MARGIN_PERCENT
  );

  return { left, top };
}

function scheduleSquareMotionFrame() {
  if (squareMotionState.reduceMotion) return;
  if (squareMotionState.rafId) return;
  squareMotionState.rafId = window.requestAnimationFrame(() => {
    squareMotionState.rafId = 0;
    const hasPointer =
      Number.isFinite(squareMotionState.pointerX) && Number.isFinite(squareMotionState.pointerY);

    squareMotionState.items.forEach((item) => {
      let shiftX = 0;
      let shiftY = 0;
      let scale = 1;
      let opacity = SQUARE_BASE_OPACITY;

      if (hasPointer) {
        const centerX = (item.leftPercent / 100) * window.innerWidth;
        const centerY = (item.topPercent / 100) * window.innerHeight;
        const dx = squareMotionState.pointerX - centerX;
        const dy = squareMotionState.pointerY - centerY;
        const distance = Math.hypot(dx, dy);

        if (distance < SQUARE_INTERACTION_RADIUS_PX) {
          const influence = 1 - distance / SQUARE_INTERACTION_RADIUS_PX;
          const safeDistance = Math.max(distance, 1);
          const unitX = dx / safeDistance;
          const unitY = dy / safeDistance;

          shiftX = unitX * SQUARE_INTERACTION_SHIFT_PX * influence;
          shiftY = unitY * SQUARE_INTERACTION_SHIFT_PX * influence;
          scale = 1 + influence * SQUARE_INTERACTION_SCALE;
          opacity = SQUARE_BASE_OPACITY + (SQUARE_HOVER_OPACITY - SQUARE_BASE_OPACITY) * influence;
        }
      }

      item.element.style.setProperty("--square-shift-x", `${shiftX.toFixed(2)}px`);
      item.element.style.setProperty("--square-shift-y", `${shiftY.toFixed(2)}px`);
      item.element.style.setProperty("--square-scale", scale.toFixed(3));
      item.element.style.setProperty("--square-opacity", opacity.toFixed(3));
    });
  });
}

function setSquarePointerPosition(x, y) {
  squareMotionState.pointerX = x;
  squareMotionState.pointerY = y;
  scheduleSquareMotionFrame();
}

function clearSquarePointerPosition() {
  squareMotionState.pointerX = null;
  squareMotionState.pointerY = null;
  scheduleSquareMotionFrame();
}

function ensureSquareMotionListeners() {
  if (squareMotionState.reduceMotion || squareMotionState.listenersReady) return;

  window.addEventListener(
    "pointermove",
    (event) => {
      if (event.pointerType && event.pointerType !== "mouse") return;
      setSquarePointerPosition(event.clientX, event.clientY);
    },
    { passive: true }
  );
  window.addEventListener("pointerleave", clearSquarePointerPosition, { passive: true });
  window.addEventListener("blur", clearSquarePointerPosition, { passive: true });
  window.addEventListener("resize", scheduleSquareMotionFrame, { passive: true });

  squareMotionState.listenersReady = true;
}

function rebuildHueAssignments() {
  const uniqueSortedIds = [...new Set(state.plugins.map((plugin) => plugin.id).filter(Boolean))].sort();
  const count = Math.max(uniqueSortedIds.length, 1);
  const step = TAU / count;
  const nextMap = new Map();

  uniqueSortedIds.forEach((id, index) => {
    nextMap.set(id, radToHue(HUE_CIRCLE_START_RAD + step * index));
  });

  hueByPluginId = nextMap;
}

function createPalette(plugin) {
  if (plugin.imagePalette) {
    return plugin.imagePalette;
  }

  const seed = hashString(`${plugin.id}:${plugin.link || ""}`);
  const fallbackHue = radToHue(HUE_CIRCLE_START_RAD + ((seed % 8192) / 8192) * TAU);
  const hueCenter = hueByPluginId.get(plugin.id) ?? fallbackHue;
  const hueA = wrapHue(hueCenter - 7);
  const hueB = wrapHue(hueCenter + 7);

  const sat = 38;
  const satSoft = 32;
  const lightA = 61;
  const lightB = 56;
  const lightC = 51;

  return {
    accentA: `hsla(${hueA} ${sat}% ${lightB}% / 0.22)`,
    accentB: `hsla(${hueB} ${satSoft}% ${lightC - 1}% / 0.09)`,
    buttonA: `hsl(${hueA} ${sat}% ${lightA}%)`,
    buttonB: `hsl(${hueB} ${sat}% ${lightB}%)`,
    buttonC: `hsl(${hueB} ${satSoft}% ${lightC}%)`,
    buttonBorder: `hsla(${hueCenter} ${satSoft}% 76% / 0.28)`,
    buttonShadow: `hsla(${hueCenter} ${satSoft}% 20% / 0.3)`,
    cardBorderHover: `hsla(${hueCenter} ${sat}% 68% / 0.42)`,
    titleHover: `hsl(${hueCenter} ${sat}% 69%)`,
    squareA: `hsla(${hueA} ${sat}% ${lightB}% / 0.24)`,
    squareB: `hsla(${hueB} ${satSoft}% ${lightC}% / 0.1)`,
  };
}

function applyPalette(card, plugin) {
  const palette = createPalette(plugin);
  card.style.setProperty("--tool-accent-a", palette.accentA);
  card.style.setProperty("--tool-accent-b", palette.accentB);
  card.style.setProperty("--tool-btn-a", palette.buttonA);
  card.style.setProperty("--tool-btn-b", palette.buttonB);
  card.style.setProperty("--tool-btn-c", palette.buttonC);
  card.style.setProperty("--tool-btn-border", palette.buttonBorder);
  card.style.setProperty("--tool-btn-shadow", palette.buttonShadow);
  card.style.setProperty("--tool-card-border-hover", palette.cardBorderHover);
  card.style.setProperty("--tool-title-hover", palette.titleHover);
  card.style.setProperty("--tool-square-a", palette.squareA || palette.accentA);
  card.style.setProperty("--tool-square-b", palette.squareB || palette.accentB);
}

function renderLiveSquares() {
  if (!elements.toolSquares) return;

  elements.toolSquares.innerHTML = "";
  squareMotionState.items = [];
  ensureSquareMotionListeners();

  const livePlugins = state.plugins.filter((plugin) => plugin.status === "live");

  livePlugins.forEach((plugin, index) => {
    const palette = createPalette(plugin);
    const seed = hashString(`${plugin.id}:${plugin.link}:${index}`);

    const square = document.createElement("span");
    square.className = "bg-tool-square";

    const size = 86 + (seed % 56);
    const anchor = getSquareAnchor(seed);
    const rotation = Math.round(seededUnit(seed, "rotation") * 26 - 13);

    square.style.width = `${size}px`;
    square.style.height = `${size}px`;
    square.style.left = `${anchor.left}%`;
    square.style.top = `${anchor.top}%`;
    square.style.setProperty("--square-rot", `${rotation}deg`);
    square.style.setProperty("--square-shift-x", "0px");
    square.style.setProperty("--square-shift-y", "0px");
    square.style.setProperty("--square-scale", "1");
    square.style.setProperty("--square-opacity", `${SQUARE_BASE_OPACITY}`);
    square.style.background = `linear-gradient(140deg, ${palette.squareA || palette.accentA}, ${palette.squareB || palette.accentB})`;
    square.style.boxShadow = `0 12px 30px ${palette.buttonShadow || "rgba(4, 10, 20, 0.3)"}`;

    elements.toolSquares.appendChild(square);
    squareMotionState.items.push({
      element: square,
      leftPercent: anchor.left,
      topPercent: anchor.top,
    });
  });

  scheduleSquareMotionFrame();
}

function createCard(plugin, index) {
  const card = document.createElement("article");
  card.className = `tool-card tone-${plugin.tone}`;
  card.style.setProperty("--delay", `${index * 0.05}s`);
  applyPalette(card, plugin);

  const head = document.createElement("header");
  head.className = "tool-head";

  const category = document.createElement("p");
  category.className = "tool-category";
  category.textContent = plugin.category;

  const status = document.createElement("span");
  status.className = statusPillClass(plugin.status);
  status.textContent = titleCase(plugin.status);

  head.append(category, status);

  const title = document.createElement("h3");
  if (plugin.status === "live" && plugin.link) {
    const titleLink = document.createElement("a");
    titleLink.className = "tool-title-link";
    titleLink.href = plugin.link;
    titleLink.textContent = plugin.name;
    title.appendChild(titleLink);
  } else {
    title.textContent = plugin.name;
  }

  const desc = document.createElement("p");
  desc.className = "tool-desc";
  desc.textContent = plugin.description;

  let media = null;
  if (plugin.image) {
    media = document.createElement(plugin.link ? "a" : "div");
    media.className = plugin.link ? "tool-media tool-media-link" : "tool-media";
    if (plugin.link) media.href = plugin.link;

    const img = document.createElement("img");
    img.src = plugin.image;
    img.alt = `${plugin.name} preview`;
    img.loading = "lazy";
    media.appendChild(img);
  }

  const tagRow = createTagRow(plugin.tags);

  const meta = document.createElement("ul");
  meta.className = "tool-meta";
  meta.append(createMetaRow("Target", plugin.target), createMetaRow("Install", plugin.install));

  const foot = document.createElement("div");
  foot.className = "tool-foot";

  const openBtn = document.createElement("a");
  openBtn.className = "btn btn-card";
  openBtn.textContent = "Open Plugin";

  if (plugin.status === "live" && plugin.link) {
    openBtn.href = plugin.link;
  } else {
    openBtn.href = "#";
    openBtn.textContent = "Coming Soon";
    openBtn.classList.add("disabled");
    openBtn.setAttribute("aria-disabled", "true");
  }

  foot.append(openBtn);
  card.append(head, title);
  if (media) card.appendChild(media);
  card.append(desc);
  if (tagRow) card.append(tagRow);
  card.append(meta, foot);
  return card;
}

function renderCards() {
  elements.toolGrid.innerHTML = "";
  rebuildHueAssignments();
  renderLiveSquares();

  if (!state.plugins.length) {
    const empty = document.createElement("div");
    empty.className = "empty-state";
    empty.textContent = "No plugins loaded right now. Please refresh in a moment.";
    elements.toolGrid.appendChild(empty);
    return;
  }

  state.plugins.forEach((plugin, index) => {
    elements.toolGrid.appendChild(createCard(plugin, index));
  });
}

function renderBuildDate(stampInput = null) {
  const stamp = stampInput ? new Date(stampInput) : new Date();
  const safeStamp = Number.isNaN(stamp.getTime()) ? new Date() : stamp;
  const formatted = safeStamp.toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "2-digit",
  });
  elements.buildDate.textContent = formatted;
}

function renderCatalogNote() {
  if (!elements.catalogNote) return;

  const parts = [];
  if (state.sourceLabel) parts.push(state.sourceLabel);
  if (state.syncWarning) parts.push(state.syncWarning);
  elements.catalogNote.textContent = parts.join(" ");
}

async function loadPlugins() {
  const response = await fetch("/api/plugins", { headers: { Accept: "application/json" } });
  if (!response.ok) throw new Error(`API returned HTTP ${response.status}`);

  const payload = await response.json();
  const normalized = normalizePluginsList(payload?.plugins);
  if (!normalized.length) throw new Error("API returned no plugins.");

  state.plugins = normalized;
  state.sourceLabel = payload?.cached
    ? "Live Openplanet source (cached)."
    : "Live Openplanet source.";
  state.syncWarning = payload?.stale
    ? "Showing cached data while Openplanet is temporarily unavailable."
    : "";

  renderBuildDate(payload?.fetchedAt || null);
}

async function boot() {
  renderBuildDate();
  state.sourceLabel = "Loading plugins from Openplanet...";
  state.syncWarning = "";
  renderCatalogNote();
  elements.toolGrid.innerHTML = '<div class="empty-state">Loading plugins...</div>';

  try {
    await loadPlugins();
  } catch (err) {
    console.warn("Failed to load plugin catalog:", err);
    state.plugins = [];
    state.sourceLabel = "Openplanet source unavailable.";
    state.syncWarning = "Could not load plugin list. Try again in a few moments.";
  }

  renderStats();
  renderCatalogNote();
  renderCards();
}

boot();
