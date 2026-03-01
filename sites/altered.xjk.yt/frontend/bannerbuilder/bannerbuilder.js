const CANVAS_WIDTH = 1600;
const CANVAS_HEIGHT = 200;

const BACKGROUND_FILES = {
  winter: "assets/backgrounds/Winter.png",
  spring: "assets/backgrounds/Spring.png",
  summer: "assets/backgrounds/Summer.png",
  fall: "assets/backgrounds/Fall.png",
  training: "assets/backgrounds/Training.png",
  other: "assets/backgrounds/Other.png",
};

const SOLID_FILES = {
  none: "",
  dodecahedron: "assets/solids/Dodecahedron.png",
  tetrahedron: "assets/solids/Tetrahedron.png",
  cube: "assets/solids/Cube.png",
  octahedron: "assets/solids/Octahedron.png",
  icosahedron: "assets/solids/Icosahedron.png",
};

const SLOT_POSITIONS = [
  { x: 166, y: 106, bias: 0 },
  { x: 445, y: 80, bias: -10 },
  { x: 800, y: 106, bias: 16 },
  { x: 1168, y: 80, bias: -12 },
  { x: 1438, y: 106, bias: 0 },
];

const DEFAULT_PRESET = {
  mainText: "1:23:45.678",
  subText: "ft. ar",
  background: "winter",
  mainSize: 126,
  subSize: 58,
  mainY: 130,
  subX: 1365,
  solidSize: 158,
  slots: [
    { shape: "dodecahedron", rotation: 0 },
    { shape: "tetrahedron", rotation: -8 },
    { shape: "cube", rotation: 0 },
    { shape: "octahedron", rotation: 8 },
    { shape: "icosahedron", rotation: 0 },
  ],
};

const elements = {
  mainText: document.getElementById("mainText"),
  subText: document.getElementById("subText"),
  backgroundSelect: document.getElementById("backgroundSelect"),
  mainSize: document.getElementById("mainSize"),
  subSize: document.getElementById("subSize"),
  mainY: document.getElementById("mainY"),
  subX: document.getElementById("subX"),
  solidSize: document.getElementById("solidSize"),
  slotControls: document.getElementById("slotControls"),
  randomizeBtn: document.getElementById("randomizeBtn"),
  resetBtn: document.getElementById("resetBtn"),
  copyPresetBtn: document.getElementById("copyPresetBtn"),
  loadPresetBtn: document.getElementById("loadPresetBtn"),
  downloadBtn: document.getElementById("downloadBtn"),
  statusLine: document.getElementById("statusLine"),
  bannerCanvas: document.getElementById("bannerCanvas"),
};

const ctx = elements.bannerCanvas.getContext("2d");
const state = structuredClone(DEFAULT_PRESET);
const images = {
  backgrounds: new Map(),
  solids: new Map(),
};

function setStatus(message, tone = "neutral") {
  elements.statusLine.textContent = message;
  elements.statusLine.classList.remove("ok", "bad");
  if (tone === "ok") elements.statusLine.classList.add("ok");
  if (tone === "bad") elements.statusLine.classList.add("bad");
}

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`Failed to load image: ${src}`));
    img.src = src;
  });
}

async function loadAssets() {
  const backgroundEntries = Object.entries(BACKGROUND_FILES);
  const solidEntries = Object.entries(SOLID_FILES).filter(([key]) => key !== "none");

  await Promise.all(
    backgroundEntries.map(async ([key, src]) => {
      images.backgrounds.set(key, await loadImage(src));
    })
  );

  await Promise.all(
    solidEntries.map(async ([key, src]) => {
      images.solids.set(key, await loadImage(src));
    })
  );
}

function createSlotControls() {
  elements.slotControls.innerHTML = "";

  for (let i = 0; i < SLOT_POSITIONS.length; i += 1) {
    const slot = state.slots[i];
    const row = document.createElement("div");
    row.className = "slot-row";
    row.innerHTML = `
      <strong>Slot ${i + 1}</strong>
      <select data-slot-shape="${i}">
        <option value="none">None</option>
        <option value="dodecahedron">Dodecahedron</option>
        <option value="tetrahedron">Tetrahedron</option>
        <option value="cube">Cube</option>
        <option value="octahedron">Octahedron</option>
        <option value="icosahedron">Icosahedron</option>
      </select>
      <input data-slot-rotation="${i}" type="number" min="-360" max="360" step="1" />
    `;

    const shapeSelect = row.querySelector(`[data-slot-shape="${i}"]`);
    const rotationInput = row.querySelector(`[data-slot-rotation="${i}"]`);

    shapeSelect.value = slot.shape;
    rotationInput.value = String(slot.rotation);

    shapeSelect.addEventListener("input", () => {
      state.slots[i].shape = shapeSelect.value;
      drawBanner();
    });

    rotationInput.addEventListener("input", () => {
      const value = Number(rotationInput.value);
      state.slots[i].rotation = Number.isFinite(value) ? value : 0;
      drawBanner();
    });

    elements.slotControls.append(row);
  }
}

function syncInputsFromState() {
  elements.mainText.value = state.mainText;
  elements.subText.value = state.subText;
  elements.backgroundSelect.value = state.background;
  elements.mainSize.value = String(state.mainSize);
  elements.subSize.value = String(state.subSize);
  elements.mainY.value = String(state.mainY);
  elements.subX.value = String(state.subX);
  elements.solidSize.value = String(state.solidSize);
  createSlotControls();
}

function syncStateFromInputs() {
  state.mainText = elements.mainText.value;
  state.subText = elements.subText.value;
  state.background = elements.backgroundSelect.value;
  state.mainSize = Number(elements.mainSize.value) || DEFAULT_PRESET.mainSize;
  state.subSize = Number(elements.subSize.value) || DEFAULT_PRESET.subSize;
  state.mainY = Number(elements.mainY.value) || DEFAULT_PRESET.mainY;
  state.subX = Number(elements.subX.value) || DEFAULT_PRESET.subX;
  state.solidSize = Number(elements.solidSize.value) || DEFAULT_PRESET.solidSize;
}

function withShadow(fn) {
  ctx.save();
  ctx.shadowColor = "rgba(17, 102, 221, 0.35)";
  ctx.shadowBlur = 8;
  ctx.shadowOffsetY = 3;
  fn();
  ctx.restore();
}

function drawBackground() {
  const bgImage = images.backgrounds.get(state.background);
  if (bgImage) {
    ctx.drawImage(bgImage, 0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
  } else {
    ctx.fillStyle = "#060b15";
    ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
  }

  const overlay = ctx.createLinearGradient(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
  overlay.addColorStop(0, "rgba(0, 51, 204, 0.28)");
  overlay.addColorStop(1, "rgba(17, 102, 221, 0.16)");
  ctx.fillStyle = overlay;
  ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
}

function drawSolids() {
  const baseSize = state.solidSize;
  const wobble = [0, -14, 18, -8, 0];

  state.slots.forEach((slot, index) => {
    if (!slot.shape || slot.shape === "none") return;

    const image = images.solids.get(slot.shape);
    if (!image) return;

    const anchor = SLOT_POSITIONS[index];
    const size = Math.max(40, baseSize + wobble[index] + anchor.bias);

    withShadow(() => {
      ctx.save();
      ctx.globalAlpha = 0.94;
      ctx.translate(anchor.x, anchor.y);
      ctx.rotate((slot.rotation * Math.PI) / 180);
      ctx.drawImage(image, -size / 2, -size / 2, size, size);
      ctx.restore();
    });
  });
}

function drawTexts() {
  const mainText = state.mainText.trim() || "1:23:45.678";
  const subText = state.subText.trim();

  ctx.textAlign = "center";
  ctx.textBaseline = "alphabetic";
  ctx.lineJoin = "round";
  ctx.lineWidth = Math.max(2, state.mainSize * 0.08);
  ctx.font = `700 ${state.mainSize}px "Chakra Petch", "Trebuchet MS", sans-serif`;

  ctx.strokeStyle = "rgba(0, 51, 204, 0.74)";
  ctx.fillStyle = "#ecfcff";
  ctx.strokeText(mainText, CANVAS_WIDTH / 2, state.mainY);
  ctx.fillText(mainText, CANVAS_WIDTH / 2, state.mainY);

  if (subText) {
    ctx.textAlign = "right";
    ctx.lineWidth = Math.max(2, state.subSize * 0.07);
    ctx.font = `600 ${state.subSize}px "Chakra Petch", "Trebuchet MS", sans-serif`;
    ctx.strokeStyle = "rgba(0, 51, 204, 0.72)";
    ctx.fillStyle = "rgba(236, 252, 255, 0.95)";
    ctx.strokeText(subText, state.subX, 72);
    ctx.fillText(subText, state.subX, 72);
  }
}

function drawBorder() {
  ctx.lineWidth = 4;
  const border = ctx.createLinearGradient(0, 0, CANVAS_WIDTH, 0);
  border.addColorStop(0, "rgba(17, 102, 221, 0.82)");
  border.addColorStop(0.5, "rgba(34, 204, 238, 0.82)");
  border.addColorStop(1, "rgba(51, 255, 255, 0.82)");
  ctx.strokeStyle = border;
  ctx.strokeRect(2, 2, CANVAS_WIDTH - 4, CANVAS_HEIGHT - 4);
}

function drawBanner() {
  syncStateFromInputs();

  ctx.clearRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
  drawBackground();
  drawSolids();
  drawTexts();
  drawBorder();
}

function randomSolid() {
  const keys = Object.keys(SOLID_FILES).filter((key) => key !== "none");
  return keys[Math.floor(Math.random() * keys.length)];
}

function randomizeSolids() {
  for (let i = 0; i < state.slots.length; i += 1) {
    state.slots[i].shape = Math.random() > 0.15 ? randomSolid() : "none";
    state.slots[i].rotation = Math.floor(Math.random() * 721) - 360;
  }
  createSlotControls();
  drawBanner();
}

function resetPreset() {
  const reset = structuredClone(DEFAULT_PRESET);
  Object.assign(state, reset);
  syncInputsFromState();
  drawBanner();
}

function serializePreset() {
  syncStateFromInputs();
  return JSON.stringify(
    {
      mainText: state.mainText,
      subText: state.subText,
      background: state.background,
      mainSize: state.mainSize,
      subSize: state.subSize,
      mainY: state.mainY,
      subX: state.subX,
      solidSize: state.solidSize,
      slots: state.slots.map((slot) => ({
        shape: slot.shape,
        rotation: Number(slot.rotation) || 0,
      })),
    },
    null,
    2
  );
}

async function copyPreset() {
  try {
    await navigator.clipboard.writeText(serializePreset());
    setStatus("Preset JSON copied to clipboard.", "ok");
  } catch {
    setStatus("Failed to copy preset. Clipboard permission is required.", "bad");
  }
}

function loadPresetFromPrompt() {
  const input = window.prompt("Paste preset JSON:");
  if (!input) return;

  let parsed = null;
  try {
    parsed = JSON.parse(input);
  } catch {
    setStatus("Invalid preset JSON.", "bad");
    return;
  }

  if (!parsed || typeof parsed !== "object") {
    setStatus("Invalid preset payload.", "bad");
    return;
  }

  state.mainText = String(parsed.mainText ?? DEFAULT_PRESET.mainText);
  state.subText = String(parsed.subText ?? DEFAULT_PRESET.subText);
  state.background = String(parsed.background ?? DEFAULT_PRESET.background);
  state.mainSize = Number(parsed.mainSize) || DEFAULT_PRESET.mainSize;
  state.subSize = Number(parsed.subSize) || DEFAULT_PRESET.subSize;
  state.mainY = Number(parsed.mainY) || DEFAULT_PRESET.mainY;
  state.subX = Number(parsed.subX) || DEFAULT_PRESET.subX;
  state.solidSize = Number(parsed.solidSize) || DEFAULT_PRESET.solidSize;

  const slots = Array.isArray(parsed.slots) ? parsed.slots : DEFAULT_PRESET.slots;
  state.slots = SLOT_POSITIONS.map((_, index) => {
    const incoming = slots[index] || {};
    return {
      shape:
        typeof incoming.shape === "string" &&
        Object.prototype.hasOwnProperty.call(SOLID_FILES, incoming.shape)
          ? incoming.shape
          : "none",
      rotation: Number(incoming.rotation) || 0,
    };
  });

  syncInputsFromState();
  drawBanner();
  setStatus("Preset loaded.", "ok");
}

function downloadBanner() {
  drawBanner();
  const link = document.createElement("a");
  link.href = elements.bannerCanvas.toDataURL("image/png");
  link.download = `altered-banner-${Date.now()}.png`;
  link.click();
}

function bindEvents() {
  [
    elements.mainText,
    elements.subText,
    elements.backgroundSelect,
    elements.mainSize,
    elements.subSize,
    elements.mainY,
    elements.subX,
    elements.solidSize,
  ].forEach((node) => {
    node.addEventListener("input", drawBanner);
  });

  elements.randomizeBtn.addEventListener("click", randomizeSolids);
  elements.resetBtn.addEventListener("click", () => {
    resetPreset();
    setStatus("Layout reset.", "ok");
  });
  elements.copyPresetBtn.addEventListener("click", copyPreset);
  elements.loadPresetBtn.addEventListener("click", loadPresetFromPrompt);
  elements.downloadBtn.addEventListener("click", () => {
    downloadBanner();
    setStatus("PNG downloaded.", "ok");
  });
}

async function boot() {
  try {
    await loadAssets();
    await document.fonts.ready;
    bindEvents();
    syncInputsFromState();
    drawBanner();
    setStatus("Assets loaded. Banner ready.", "ok");
  } catch (error) {
    setStatus(error.message || "Failed to initialize builder.", "bad");
  }
}

boot();


