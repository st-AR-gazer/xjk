const fallbackTools = [
  {
    id: "map-cleaner",
    name: "Strip Race Validation Ghost",
    description:
      "Upload a map, strip the validation replay, and optionally export cleaned map and extracted ghost files.",
    category: "Validation",
    status: "live",
    input: ".Map.Gbx",
    output: "Map / Ghost / Zip",
    link: "Strip-RaceValidationGhost/",
    tone: "cool",
  },
  {
    id: "ghost-embedder",
    name: "Embed Race Validation Ghost",
    description:
      "Upload a map and a ghost/replay source, pick replay ghost index if needed, then download embedded map output.",
    category: "Validation",
    status: "live",
    input: ".Map.Gbx + .Ghost/.Replay.Gbx",
    output: "Embedded .Map.Gbx",
    link: "Embed-RaceValidationGhost/",
    tone: "warm",
  },
  {
    id: "embedded-checker",
    name: "Embedded Blocks And Items Checker",
    description: "Check map embedding consistency and inspect missing expected/custom embedded models.",
    category: "Inspection",
    status: "live",
    input: ".Map.Gbx",
    output: "JSON report",
    link: "Embedded-Blocks-And-Items-Checker/",
    tone: "cool",
  },
  {
    id: "replay-data-extractor",
    name: "Extract Replay Data",
    description: "Extract structured replay JSON using default projection or a custom request selection.",
    category: "Replay",
    status: "live",
    input: ".Replay.Gbx",
    output: "JSON data",
    link: "Extract-Replay-Data/",
    tone: "cool",
  },
  {
    id: "medal-time-modifier",
    name: "GBX Medal Time Modifier",
    description: "Set AT/Gold/Silver/Bronze medal values for a map and download the modified map file.",
    category: "Map Editing",
    status: "live",
    input: ".Map.Gbx + medal values",
    output: "Modified .Map.Gbx",
    link: "Gbx-Medal-Time-Modifier/",
    tone: "warm",
  },
  {
    id: "map-validation-checker",
    name: "Map Validation Checker",
    description: "Inspect map validation status with optional replay evidence and manual override support.",
    category: "Validation",
    status: "live",
    input: ".Map.Gbx (+ optional replay/manual)",
    output: "JSON verdict",
    link: "Map-Validation-Checker/",
    tone: "cool",
  },
];

const state = {
  tools: [],
};

const elements = {
  buildDate: document.getElementById("buildDate"),
  statTotal: document.getElementById("statTotal"),
  statLive: document.getElementById("statLive"),
  statSoon: document.getElementById("statSoon"),
  toolSquares: document.getElementById("toolSquares"),
  toolGrid: document.getElementById("toolGrid"),
};

function normalizeTool(tool, index) {
  if (!tool || typeof tool !== "object") return null;

  const statusRaw = String(tool.status || "live").toLowerCase();
  const toneRaw = String(tool.tone || "cool").toLowerCase();

  return {
    id: String(tool.id || `tool-${index + 1}`),
    name: String(tool.name || "Untitled Tool"),
    description: String(tool.description || "No description provided."),
    category: String(tool.category || "General"),
    status: statusRaw === "live" ? "live" : "soon",
    input: String(tool.input || "N/A"),
    output: String(tool.output || "N/A"),
    link: typeof tool.link === "string" ? tool.link : "",
    tone: toneRaw === "warm" ? "warm" : "cool",
  };
}

function normalizeToolsList(rawTools) {
  if (!Array.isArray(rawTools)) return [];
  return rawTools.map((tool, index) => normalizeTool(tool, index)).filter(Boolean);
}

function titleCase(value) {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function statusPillClass(status) {
  return status === "live" ? "pill pill-live" : "pill pill-soon";
}

function renderStats() {
  const liveCount = state.tools.filter((tool) => tool.status === "live").length;
  const soonCount = state.tools.filter((tool) => tool.status !== "live").length;

  elements.statTotal.textContent = String(state.tools.length);
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

function hashString(value) {
  if (window.ToolTheme?.hashString) return window.ToolTheme.hashString(value);
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
const FALLBACK_TOOL_IDS = fallbackTools.map((tool) => tool.id);
const FALLBACK_HUE_BY_TOOL_ID = FALLBACK_TOOL_IDS.reduce((acc, id, index) => {
  const step = TAU / Math.max(FALLBACK_TOOL_IDS.length, 1);
  acc[id] = radToHue(HUE_CIRCLE_START_RAD + step * index);
  return acc;
}, {});
const FALLBACK_ID_BY_SLUG = fallbackTools.reduce((acc, tool) => {
  const slug = String(tool.link || "").replace(/^\/+|\/+$/g, "");
  if (slug) acc[slug] = tool.id;
  return acc;
}, {});

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

function createPalette(tool) {
  if (window.ToolTheme?.getToolPalette) {
    return window.ToolTheme.getToolPalette(tool);
  }

  const seed = hashString(`${tool.id}:${tool.link || ""}`);
  const slug = String(tool.link || "").replace(/^\/+|\/+$/g, "");
  const knownIdFromSlug = FALLBACK_ID_BY_SLUG[slug] || "";
  const resolvedId = FALLBACK_HUE_BY_TOOL_ID[tool.id] ? tool.id : knownIdFromSlug || tool.id;
  const fallbackHue = radToHue(HUE_CIRCLE_START_RAD + ((seed % 8192) / 8192) * TAU);
  const hueCenter = FALLBACK_HUE_BY_TOOL_ID[resolvedId] ?? fallbackHue;
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

function applyPalette(card, tool) {
  const palette = createPalette(tool);
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

  const liveTools = state.tools.filter((tool) => tool.status === "live");

  liveTools.forEach((tool, index) => {
    const palette = createPalette(tool);
    const seed = hashString(`${tool.id}:${tool.link}:${index}`);

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

function createCard(tool, index) {
  const card = document.createElement("article");
  card.className = `tool-card tone-${tool.tone}`;
  card.style.setProperty("--delay", `${index * 0.06}s`);
  applyPalette(card, tool);

  const head = document.createElement("header");
  head.className = "tool-head";

  const category = document.createElement("p");
  category.className = "tool-category";
  category.textContent = tool.category;

  const status = document.createElement("span");
  status.className = statusPillClass(tool.status);
  status.textContent = titleCase(tool.status);

  head.append(category, status);

  const title = document.createElement("h3");
  if (tool.status === "live" && tool.link) {
    const titleLink = document.createElement("a");
    titleLink.className = "tool-title-link";
    titleLink.href = tool.link;
    titleLink.textContent = tool.name;
    title.appendChild(titleLink);
  } else {
    title.textContent = tool.name;
  }

  const desc = document.createElement("p");
  desc.className = "tool-desc";
  desc.textContent = tool.description;

  const meta = document.createElement("ul");
  meta.className = "tool-meta";
  meta.append(createMetaRow("Input", tool.input), createMetaRow("Output", tool.output));

  const foot = document.createElement("div");
  foot.className = "tool-foot";

  const openBtn = document.createElement("a");
  openBtn.className = "btn btn-card";
  openBtn.textContent = "Open Tool";

  if (tool.status === "live" && tool.link) {
    openBtn.href = tool.link;
  } else {
    openBtn.href = "#";
    openBtn.textContent = "Coming Soon";
    openBtn.classList.add("disabled");
    openBtn.setAttribute("aria-disabled", "true");
  }

  foot.append(openBtn);
  card.append(head, title, desc, meta, foot);
  return card;
}

function renderCards() {
  elements.toolGrid.innerHTML = "";
  renderLiveSquares();

  if (!state.tools.length) {
    const empty = document.createElement("div");
    empty.className = "empty-state";
    empty.textContent = "No tools available.";
    elements.toolGrid.appendChild(empty);
    return;
  }

  state.tools.forEach((tool, index) => {
    elements.toolGrid.appendChild(createCard(tool, index));
  });
}

function renderBuildDate() {
  const stamp = new Date();
  const formatted = stamp.toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "2-digit",
  });
  elements.buildDate.textContent = formatted;
}

async function loadTools() {
  try {
    const response = await fetch("/api/tools", { headers: { Accept: "application/json" } });
    if (!response.ok) throw new Error(`API returned HTTP ${response.status}`);

    const payload = await response.json();
    const normalized = normalizeToolsList(payload?.tools);
    if (!normalized.length) throw new Error("API returned no tools.");

    state.tools = normalized;
  } catch (err) {
    console.warn("Falling back to bundled tools:", err);
    state.tools = normalizeToolsList(fallbackTools);
  }
}

async function boot() {
  renderBuildDate();
  elements.toolGrid.innerHTML = '<div class="empty-state">Loading tools...</div>';
  await loadTools();
  renderStats();
  renderCards();
}

boot();
