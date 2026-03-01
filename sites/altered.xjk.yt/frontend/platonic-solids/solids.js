const PHI = (1 + Math.sqrt(5)) / 2;
const TAU = Math.PI * 2;
const ALTERED_PALETTE = ["#0033CC", "#1166DD", "#2299EE", "#22CCEE", "#33FFFF"];

const RAW_GEOMETRIES = {
  tetrahedron: {
    vertices: [
      [1, 1, 1],
      [-1, -1, 1],
      [-1, 1, -1],
      [1, -1, -1],
    ],
    faces: [
      [0, 1, 2],
      [0, 3, 1],
      [0, 2, 3],
      [1, 3, 2],
    ],
  },
  cube: {
    vertices: [
      [-1, -1, -1],
      [-1, -1, 1],
      [-1, 1, -1],
      [-1, 1, 1],
      [1, -1, -1],
      [1, -1, 1],
      [1, 1, -1],
      [1, 1, 1],
    ],
    faces: [
      [0, 1, 3, 2],
      [4, 6, 7, 5],
      [0, 4, 5, 1],
      [2, 3, 7, 6],
      [0, 2, 6, 4],
      [1, 5, 7, 3],
    ],
  },
  octahedron: {
    vertices: [
      [1, 0, 0],
      [-1, 0, 0],
      [0, 1, 0],
      [0, -1, 0],
      [0, 0, 1],
      [0, 0, -1],
    ],
    faces: [
      [0, 2, 4],
      [2, 1, 4],
      [1, 3, 4],
      [3, 0, 4],
      [0, 5, 2],
      [2, 5, 1],
      [1, 5, 3],
      [3, 5, 0],
    ],
  },
  dodecahedron: {
    vertices: [
      [1, 1, 1],
      [1, 1, -1],
      [1, -1, 1],
      [1, -1, -1],
      [-1, 1, 1],
      [-1, 1, -1],
      [-1, -1, 1],
      [-1, -1, -1],
      [0, 1 / PHI, PHI],
      [0, 1 / PHI, -PHI],
      [0, -1 / PHI, PHI],
      [0, -1 / PHI, -PHI],
      [1 / PHI, PHI, 0],
      [1 / PHI, -PHI, 0],
      [-1 / PHI, PHI, 0],
      [-1 / PHI, -PHI, 0],
      [PHI, 0, 1 / PHI],
      [PHI, 0, -1 / PHI],
      [-PHI, 0, 1 / PHI],
      [-PHI, 0, -1 / PHI],
    ],
    faces: [
      [0, 8, 10, 2, 16],
      [0, 16, 17, 1, 12],
      [0, 12, 14, 4, 8],
      [8, 4, 18, 6, 10],
      [16, 2, 13, 3, 17],
      [12, 1, 9, 5, 14],
      [4, 14, 5, 19, 18],
      [2, 10, 6, 15, 13],
      [1, 17, 3, 11, 9],
      [5, 9, 11, 7, 19],
      [6, 18, 19, 7, 15],
      [3, 13, 15, 7, 11],
    ],
  },
  icosahedron: {
    vertices: [
      [-1, PHI, 0],
      [1, PHI, 0],
      [-1, -PHI, 0],
      [1, -PHI, 0],
      [0, -1, PHI],
      [0, 1, PHI],
      [0, -1, -PHI],
      [0, 1, -PHI],
      [PHI, 0, -1],
      [PHI, 0, 1],
      [-PHI, 0, -1],
      [-PHI, 0, 1],
    ],
    faces: [
      [0, 11, 5],
      [0, 5, 1],
      [0, 1, 7],
      [0, 7, 10],
      [0, 10, 11],
      [1, 5, 9],
      [5, 11, 4],
      [11, 10, 2],
      [10, 7, 6],
      [7, 1, 8],
      [3, 9, 4],
      [3, 4, 2],
      [3, 2, 6],
      [3, 6, 8],
      [3, 8, 9],
      [4, 9, 5],
      [2, 4, 11],
      [6, 2, 10],
      [8, 6, 7],
      [9, 8, 1],
    ],
  },
};

const elements = {
  solidType: document.getElementById("solidType"),
  scale: document.getElementById("scale"),
  lineWidth: document.getElementById("lineWidth"),
  spinX: document.getElementById("spinX"),
  spinY: document.getElementById("spinY"),
  spinZ: document.getElementById("spinZ"),
  fillAlpha: document.getElementById("fillAlpha"),
  perspective: document.getElementById("perspective"),
  colorA: document.getElementById("colorA"),
  colorB: document.getElementById("colorB"),
  wireColor: document.getElementById("wireColor"),
  transparentBg: document.getElementById("transparentBg"),
  exportMode: document.getElementById("exportMode"),
  exportSeconds: document.getElementById("exportSeconds"),
  exportRotations: document.getElementById("exportRotations"),
  exportFps: document.getElementById("exportFps"),
  exportLoopLock: document.getElementById("exportLoopLock"),
  togglePlayBtn: document.getElementById("togglePlayBtn"),
  randomizeBtn: document.getElementById("randomizeBtn"),
  resetBtn: document.getElementById("resetBtn"),
  downloadPngBtn: document.getElementById("downloadPngBtn"),
  downloadWebpBtn: document.getElementById("downloadWebpBtn"),
  exportVideoBgBtn: document.getElementById("exportVideoBgBtn"),
  exportVideoTransBtn: document.getElementById("exportVideoTransBtn"),
  statusLine: document.getElementById("statusLine"),
  solidCanvas: document.getElementById("solidCanvas"),
};

const ctx = elements.solidCanvas.getContext("2d");

const valEls = {
  scale: document.getElementById("scaleVal"),
  perspective: document.getElementById("perspectiveVal"),
  spinX: document.getElementById("spinXVal"),
  spinY: document.getElementById("spinYVal"),
  spinZ: document.getElementById("spinZVal"),
  lineWidth: document.getElementById("lineWidthVal"),
  fillAlpha: document.getElementById("fillAlphaVal"),
};

function updateValueDisplays() {
  if (valEls.scale) valEls.scale.value = state.scale;
  if (valEls.perspective) valEls.perspective.value = Number(state.perspective).toFixed(2);
  if (valEls.spinX) valEls.spinX.value = Number(state.spinX).toFixed(2);
  if (valEls.spinY) valEls.spinY.value = Number(state.spinY).toFixed(2);
  if (valEls.spinZ) valEls.spinZ.value = Number(state.spinZ).toFixed(2);
  if (valEls.lineWidth) valEls.lineWidth.value = Number(state.lineWidth).toFixed(1);
  if (valEls.fillAlpha) valEls.fillAlpha.value = Number(state.fillAlpha).toFixed(2);
}

const defaultState = {
  solidType: "dodecahedron",
  scale: 215,
  lineWidth: 1.5,
  spinX: 0.2,
  spinY: 0.58,
  spinZ: 0.14,
  fillAlpha: 0.54,
  perspective: 2.7,
  colorA: "#0033CC",
  colorB: "#22CCEE",
  wireColor: "#33FFFF",
  transparentBg: false,
};

const state = {
  ...defaultState,
  width: 0,
  height: 0,
  devicePixelRatio: 1,
  playing: true,
  rotation: { x: 0.44, y: 0.23, z: 0.06 },
  dragging: false,
  dragStartX: 0,
  dragStartY: 0,
};

let previousFrameTime = 0;

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function normalizeGeometry(vertices) {
  const maxLength = vertices.reduce((max, vertex) => {
    const length = Math.hypot(vertex[0], vertex[1], vertex[2]);
    return Math.max(max, length);
  }, 1);
  return vertices.map((vertex) => vertex.map((component) => component / maxLength));
}

function buildEdgeSet(faces) {
  const edgeSet = new Set();
  faces.forEach((face) => {
    for (let i = 0; i < face.length; i += 1) {
      const a = face[i];
      const b = face[(i + 1) % face.length];
      const min = Math.min(a, b);
      const max = Math.max(a, b);
      edgeSet.add(`${min}:${max}`);
    }
  });
  return Array.from(edgeSet).map((edge) => edge.split(":").map((value) => Number(value)));
}

const geometries = Object.fromEntries(
  Object.entries(RAW_GEOMETRIES).map(([key, geometry]) => [
    key,
    {
      vertices: normalizeGeometry(geometry.vertices),
      faces: geometry.faces,
      edges: buildEdgeSet(geometry.faces),
    },
  ])
);

function setStatus(message) {
  elements.statusLine.textContent = message;
}

function hexToRgb(hex) {
  const normalized = hex.replace("#", "");
  const value =
    normalized.length === 3
      ? normalized
          .split("")
          .map((char) => `${char}${char}`)
          .join("")
      : normalized;
  const int = Number.parseInt(value, 16);
  return {
    r: (int >> 16) & 255,
    g: (int >> 8) & 255,
    b: int & 255,
  };
}

function blendColor(hexA, hexB, t, alpha = 1) {
  const colorA = hexToRgb(hexA);
  const colorB = hexToRgb(hexB);
  const mix = clamp(t, 0, 1);
  const r = Math.round(colorA.r + (colorB.r - colorA.r) * mix);
  const g = Math.round(colorA.g + (colorB.g - colorA.g) * mix);
  const b = Math.round(colorA.b + (colorB.b - colorA.b) * mix);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

function rotateVertex(vertex, rx, ry, rz) {
  let [x, y, z] = vertex;

  const cosX = Math.cos(rx);
  const sinX = Math.sin(rx);
  let y1 = y * cosX - z * sinX;
  let z1 = y * sinX + z * cosX;
  y = y1;
  z = z1;

  const cosY = Math.cos(ry);
  const sinY = Math.sin(ry);
  let x1 = x * cosY + z * sinY;
  z1 = -x * sinY + z * cosY;
  x = x1;
  z = z1;

  const cosZ = Math.cos(rz);
  const sinZ = Math.sin(rz);
  x1 = x * cosZ - y * sinZ;
  y1 = x * sinZ + y * cosZ;
  x = x1;
  y = y1;

  return [x, y, z];
}

function vectorSubtract(a, b) {
  return [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
}

function vectorCross(a, b) {
  return [
    a[1] * b[2] - a[2] * b[1],
    a[2] * b[0] - a[0] * b[2],
    a[0] * b[1] - a[1] * b[0],
  ];
}

function vectorDot(a, b) {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}

function normalizeVector(v) {
  const length = Math.hypot(v[0], v[1], v[2]) || 1;
  return [v[0] / length, v[1] / length, v[2] / length];
}

function normalizeSpinAxis(x, y, z) {
  const length = Math.hypot(x, y, z);
  if (length < 0.00001) return [0, 1, 0];
  return [x / length, y / length, z / length];
}

function rotateAroundAxis(vertex, axis, angle) {
  const [ux, uy, uz] = axis;
  const [x, y, z] = vertex;
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  const dot = ux * x + uy * y + uz * z;
  const crossX = uy * z - uz * y;
  const crossY = uz * x - ux * z;
  const crossZ = ux * y - uy * x;

  return [
    x * cos + crossX * sin + ux * dot * (1 - cos),
    y * cos + crossY * sin + uy * dot * (1 - cos),
    z * cos + crossZ * sin + uz * dot * (1 - cos),
  ];
}

function projectVertex(vertex, width, height, scale, perspective) {
  const depth = Math.max(0.2, perspective - vertex[2]);
  const projectedScale = scale / depth;
  return {
    x: width * 0.5 + vertex[0] * projectedScale,
    y: height * 0.5 - vertex[1] * projectedScale,
    depth,
  };
}

function resizeCanvas() {
  const rect = elements.solidCanvas.getBoundingClientRect();
  state.devicePixelRatio = Math.min(2, window.devicePixelRatio || 1);
  elements.solidCanvas.width = Math.max(1, Math.floor(rect.width * state.devicePixelRatio));
  elements.solidCanvas.height = Math.max(1, Math.floor(rect.height * state.devicePixelRatio));
  state.width = rect.width;
  state.height = rect.height;
  ctx.setTransform(state.devicePixelRatio, 0, 0, state.devicePixelRatio, 0, 0);
}

function drawBackgroundToContext(targetCtx, width, height, transparentBg) {
  if (transparentBg) {
    targetCtx.clearRect(0, 0, width, height);
    return;
  }

  const bgGradient = targetCtx.createLinearGradient(0, 0, width, height);
  bgGradient.addColorStop(0, "#060b14");
  bgGradient.addColorStop(1, "#0c1424");
  targetCtx.fillStyle = bgGradient;
  targetCtx.fillRect(0, 0, width, height);

  const glowA = targetCtx.createRadialGradient(width * 0.9, height * 0.08, 0, width * 0.9, height * 0.08, Math.max(width, height) * 0.8);
  glowA.addColorStop(0, 'rgba(17, 102, 221, 0.22)');
  glowA.addColorStop(1, 'rgba(17, 102, 221, 0)');
  targetCtx.fillStyle = glowA;
  targetCtx.fillRect(0, 0, width, height);

  const glowB = targetCtx.createRadialGradient(width * 0.1, height * 0.9, 0, width * 0.1, height * 0.9, Math.max(width, height) * 0.7);
  glowB.addColorStop(0, 'rgba(34, 204, 238, 0.16)');
  glowB.addColorStop(1, 'rgba(34, 204, 238, 0)');
  targetCtx.fillStyle = glowB;
  targetCtx.fillRect(0, 0, width, height);

  targetCtx.globalAlpha = 0.12;
  targetCtx.strokeStyle = "#22CCEE";
  targetCtx.lineWidth = 1;
  const step = 36;
  for (let x = 0; x < width; x += step) {
    targetCtx.beginPath();
    targetCtx.moveTo(x, 0);
    targetCtx.lineTo(x, height);
    targetCtx.stroke();
  }
  for (let y = 0; y < height; y += step) {
    targetCtx.beginPath();
    targetCtx.moveTo(0, y);
    targetCtx.lineTo(width, y);
    targetCtx.stroke();
  }
  targetCtx.globalAlpha = 1;
}

function renderSolidToContext(
  targetCtx,
  width,
  height,
  renderState,
  baseRotation,
  loopAxis = null,
  loopAngle = 0
) {
  const geometry = geometries[renderState.solidType];
  if (!geometry) return;

  let transformedVertices = geometry.vertices.map((vertex) =>
    rotateVertex(vertex, baseRotation.x, baseRotation.y, baseRotation.z)
  );

  if (loopAxis) {
    transformedVertices = transformedVertices.map((vertex) =>
      rotateAroundAxis(vertex, loopAxis, loopAngle)
    );
  }

  const projectedVertices = transformedVertices.map((vertex) =>
    projectVertex(vertex, width, height, renderState.scale, renderState.perspective)
  );
  const lightDir = normalizeVector([-0.25, 0.8, 0.52]);

  const facePayload = geometry.faces.map((face) => {
    const a = transformedVertices[face[0]];
    const b = transformedVertices[face[1]];
    const c = transformedVertices[face[2]];
    const ab = vectorSubtract(b, a);
    const ac = vectorSubtract(c, a);
    const normal = normalizeVector(vectorCross(ab, ac));
    const light = (vectorDot(normal, lightDir) + 1) * 0.5;
    const color = blendColor(renderState.colorA, renderState.colorB, light, renderState.fillAlpha);

    const points = face.map((index) => projectedVertices[index]);
    const averageDepth = points.reduce((sum, point) => sum + point.depth, 0) / points.length;

    return { points, averageDepth, color };
  });

  facePayload.sort((a, b) => b.averageDepth - a.averageDepth);
  facePayload.forEach((face) => {
    targetCtx.beginPath();
    face.points.forEach((point, index) => {
      if (index === 0) {
        targetCtx.moveTo(point.x, point.y);
      } else {
        targetCtx.lineTo(point.x, point.y);
      }
    });
    targetCtx.closePath();
    targetCtx.fillStyle = face.color;
    targetCtx.fill();
  });

  targetCtx.strokeStyle = renderState.wireColor;
  targetCtx.lineWidth = renderState.lineWidth;
  targetCtx.globalAlpha = 0.95;
  geometry.edges.forEach(([a, b]) => {
    const first = projectedVertices[a];
    const second = projectedVertices[b];
    targetCtx.beginPath();
    targetCtx.moveTo(first.x, first.y);
    targetCtx.lineTo(second.x, second.y);
    targetCtx.stroke();
  });
  targetCtx.globalAlpha = 1;
}

function drawFrame() {
  drawBackgroundToContext(ctx, state.width, state.height, state.transparentBg);
  renderSolidToContext(ctx, state.width, state.height, state, state.rotation);
}

function animationTick(timestamp) {
  const secondsDelta = previousFrameTime ? (timestamp - previousFrameTime) / 1000 : 0;
  previousFrameTime = timestamp;

  if (state.playing) {
    state.rotation.x += state.spinX * secondsDelta;
    state.rotation.y += state.spinY * secondsDelta;
    state.rotation.z += state.spinZ * secondsDelta;
  }

  drawFrame();
  window.requestAnimationFrame(animationTick);
}

function applyStateToControls() {
  elements.solidType.value = state.solidType;
  elements.scale.value = String(state.scale);
  elements.lineWidth.value = String(state.lineWidth);
  elements.spinX.value = String(state.spinX);
  elements.spinY.value = String(state.spinY);
  elements.spinZ.value = String(state.spinZ);
  elements.fillAlpha.value = String(state.fillAlpha);
  elements.perspective.value = String(state.perspective);
  elements.colorA.value = state.colorA;
  elements.colorB.value = state.colorB;
  elements.wireColor.value = state.wireColor;
  elements.transparentBg.checked = state.transparentBg;
  updateValueDisplays();
}

function readControlsToState() {
  state.solidType = elements.solidType.value;
  state.scale = Number(elements.scale.value) || defaultState.scale;
  state.lineWidth = Number(elements.lineWidth.value) || defaultState.lineWidth;
  state.spinX = Number(elements.spinX.value) || 0;
  state.spinY = Number(elements.spinY.value) || 0;
  state.spinZ = Number(elements.spinZ.value) || 0;
  state.fillAlpha = clamp(Number(elements.fillAlpha.value) || 0, 0, 1);
  state.perspective = Number(elements.perspective.value) || defaultState.perspective;
  state.colorA = elements.colorA.value;
  state.colorB = elements.colorB.value;
  state.wireColor = elements.wireColor.value;
  state.transparentBg = elements.transparentBg.checked;
}

function syncExportModeUi() {
  const mode = elements.exportMode.value;
  elements.exportSeconds.disabled = mode !== "seconds";
  elements.exportRotations.disabled = mode !== "rotations";
}

function bindFormControls() {
  [
    elements.solidType,
    elements.scale,
    elements.lineWidth,
    elements.spinX,
    elements.spinY,
    elements.spinZ,
    elements.fillAlpha,
    elements.perspective,
    elements.colorA,
    elements.colorB,
    elements.wireColor,
    elements.transparentBg,
  ].forEach((node) => {
    node.addEventListener("input", () => {
      readControlsToState();
      updateValueDisplays();
      drawFrame();
    });
  });

  elements.exportMode.addEventListener("input", syncExportModeUi);

  const valToSlider = [
    [valEls.scale, elements.scale],
    [valEls.perspective, elements.perspective],
    [valEls.spinX, elements.spinX],
    [valEls.spinY, elements.spinY],
    [valEls.spinZ, elements.spinZ],
    [valEls.lineWidth, elements.lineWidth],
    [valEls.fillAlpha, elements.fillAlpha],
  ];
  valToSlider.forEach(([numInput, rangeInput]) => {
    if (!numInput) return;
    numInput.addEventListener("input", () => {
      rangeInput.value = numInput.value;
      readControlsToState();
      drawFrame();
    });
  });
}

function randomFromPalette() {
  return ALTERED_PALETTE[Math.floor(Math.random() * ALTERED_PALETTE.length)];
}

function randomizeSettings() {
  const keys = Object.keys(geometries);
  state.solidType = keys[Math.floor(Math.random() * keys.length)];
  state.scale = Math.floor(150 + Math.random() * 170);
  state.lineWidth = Number((0.9 + Math.random() * 2.5).toFixed(1));
  state.spinX = Number((Math.random() * 1.6 - 0.8).toFixed(2));
  state.spinY = Number((Math.random() * 1.6 - 0.8).toFixed(2));
  state.spinZ = Number((Math.random() * 1.6 - 0.8).toFixed(2));
  state.fillAlpha = Number((0.35 + Math.random() * 0.45).toFixed(2));
  state.perspective = Number((2.1 + Math.random() * 1.7).toFixed(2));
  state.colorA = randomFromPalette();
  state.colorB = randomFromPalette();
  state.wireColor = randomFromPalette();
  applyStateToControls();
  setStatus("Randomized settings.");
}

function resetSettings() {
  Object.assign(state, defaultState);
  state.rotation = { x: 0.44, y: 0.23, z: 0.06 };
  state.playing = true;
  elements.togglePlayBtn.textContent = "Pause";
  applyStateToControls();
  drawFrame();
  setStatus("Settings reset.");
}

function togglePlayback() {
  state.playing = !state.playing;
  elements.togglePlayBtn.textContent = state.playing ? "Pause" : "Play";
  setStatus(state.playing ? "Animation resumed." : "Animation paused.");
}

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function downloadPngFrame() {
  drawFrame();
  elements.solidCanvas.toBlob((blob) => {
    if (!blob) {
      setStatus("PNG export failed.");
      return;
    }
    downloadBlob(blob, `altered-solid-${state.solidType}-${Date.now()}.png`);
    setStatus("PNG downloaded.");
  }, "image/png");
}

function resolveExportPlan() {
  const mode = elements.exportMode.value;
  const fps = clamp(Math.round(Number(elements.exportFps.value) || 30), 10, 60);
  const secondsInput = clamp(Number(elements.exportSeconds.value) || 4, 0.5, 60);
  const rotationsInput = clamp(Math.round(Number(elements.exportRotations.value) || 2), 1, 120);
  const loopLock = elements.exportLoopLock.checked;

  const spinMagnitude = Math.hypot(state.spinX, state.spinY, state.spinZ);
  const axis = normalizeSpinAxis(state.spinX, state.spinY, state.spinZ);

  let durationSec = secondsInput;
  let rotations = rotationsInput;

  if (mode === "rotations") {
    rotations = loopLock ? Math.max(1, Math.round(rotationsInput)) : rotationsInput;
    const speed = spinMagnitude > 0.00001 ? spinMagnitude : 1;
    durationSec = clamp(Math.abs((rotations * TAU) / speed), 0.5, 60);
  } else {
    durationSec = secondsInput;
    const naturalRotations = (Math.max(spinMagnitude, 1) * durationSec) / TAU;
    rotations = loopLock ? Math.max(1, Math.round(Math.abs(naturalRotations))) : naturalRotations;
  }

  const frames = clamp(Math.round(durationSec * fps), 2, 2400);
  return { mode, fps, durationSec, rotations, frames, axis, loopLock };
}

async function ensureWebpEncodingSupport() {
  if (typeof ImageEncoder === "undefined" || typeof VideoFrame === "undefined") {
    throw new Error("Animated WebP export requires a WebCodecs-capable browser.");
  }
  if (typeof ImageEncoder.isConfigSupported === "function") {
    const support = await ImageEncoder.isConfigSupported({ type: "image/webp", quality: 0.95 });
    if (!support?.supported) {
      throw new Error("This browser does not support animated WebP encoding.");
    }
  }
}

async function exportAnimatedWebp() {
  readControlsToState();

  try {
    await ensureWebpEncodingSupport();
  } catch (error) {
    setStatus(error.message);
    return;
  }

  const plan = resolveExportPlan();
  const width = Math.max(320, Math.round(state.width));
  const height = Math.max(220, Math.round(state.height));
  const frameDurationUs = Math.round(1_000_000 / plan.fps);

  const exportCanvas = document.createElement("canvas");
  exportCanvas.width = width;
  exportCanvas.height = height;
  const exportCtx = exportCanvas.getContext("2d", { alpha: true });
  if (!exportCtx) {
    setStatus("Failed to initialize export canvas.");
    return;
  }

  const baseRotation = { ...state.rotation };
  const chunks = [];
  let encoderError = null;

  let encoder = null;
  try {
    encoder = new ImageEncoder({
      type: "image/webp",
      quality: 0.95,
      output: (chunk) => {
        const bytes = new Uint8Array(chunk.byteLength);
        chunk.copyTo(bytes);
        chunks.push(bytes);
      },
      error: (error) => {
        encoderError = error || new Error("Unknown encoding error.");
      },
    });
  } catch (error) {
    setStatus(`WebP encoder init failed: ${error.message}`);
    return;
  }

  elements.downloadWebpBtn.disabled = true;
  const oldLabel = elements.downloadWebpBtn.textContent;
  elements.downloadWebpBtn.textContent = "Encoding...";

  try {
    for (let i = 0; i < plan.frames; i += 1) {
      const progress = i / plan.frames;
      const angle = plan.rotations * TAU * progress;

      drawBackgroundToContext(exportCtx, width, height, true);
      renderSolidToContext(exportCtx, width, height, state, baseRotation, plan.axis, angle);

      const frame = new VideoFrame(exportCanvas, {
        timestamp: i * frameDurationUs,
        duration: frameDurationUs,
      });

      const result = encoder.encode(frame, { keyFrame: i === 0 });
      frame.close();
      if (result && typeof result.then === "function") {
        await result;
      }

      if (encoderError) {
        throw encoderError;
      }

      if (i % 12 === 0 || i === plan.frames - 1) {
        setStatus(
          `Encoding transparent WEBP ${i + 1}/${plan.frames} (mode=${plan.mode}, loop=${
            plan.loopLock ? "locked" : "free"
          })...`
        );
      }
    }

    await encoder.flush();
    if (encoderError) throw encoderError;

    const blob = new Blob(chunks, { type: "image/webp" });
    if (!blob.size) {
      throw new Error("Encoder returned an empty WebP file.");
    }

    const loopNote = plan.loopLock ? "loop-locked" : "free-spin";
    downloadBlob(
      blob,
      `altered-solid-${state.solidType}-${plan.mode}-${loopNote}-${Date.now()}.webp`
    );
    setStatus(
      `Transparent WEBP downloaded (${plan.frames} frames, ${plan.durationSec.toFixed(2)}s, ${plan.rotations.toFixed(
        2
      )} rotations).`
    );
  } catch (error) {
    setStatus(`WebP export failed: ${error.message}`);
  } finally {
    elements.downloadWebpBtn.disabled = false;
    elements.downloadWebpBtn.textContent = oldLabel;
  }
}

async function exportVideo(transparent) {
  readControlsToState();

  if (typeof MediaRecorder === "undefined") {
    setStatus("Video export requires a browser with MediaRecorder support.");
    return;
  }

  const plan = resolveExportPlan();
  const width = Math.max(320, Math.round(state.width));
  const height = Math.max(220, Math.round(state.height));
  const frameInterval = 1000 / plan.fps;

  const exportCanvas = document.createElement("canvas");
  exportCanvas.width = width;
  exportCanvas.height = height;
  const exportCtx = exportCanvas.getContext("2d", { alpha: true });
  if (!exportCtx) {
    setStatus("Failed to create export canvas.");
    return;
  }

  let mimeType = "video/webm;codecs=vp9";
  if (!MediaRecorder.isTypeSupported(mimeType)) {
    mimeType = "video/webm;codecs=vp8";
  }
  if (!MediaRecorder.isTypeSupported(mimeType)) {
    mimeType = "video/webm";
  }
  if (!MediaRecorder.isTypeSupported(mimeType)) {
    setStatus("No supported WebM codec found in this browser.");
    return;
  }

  const stream = exportCanvas.captureStream(0);
  const recorder = new MediaRecorder(stream, {
    mimeType,
    videoBitsPerSecond: 8_000_000,
  });

  const chunks = [];
  recorder.ondataavailable = (e) => {
    if (e.data.size > 0) chunks.push(e.data);
  };

  const baseRotation = { ...state.rotation };
  const btn = transparent ? elements.exportVideoTransBtn : elements.exportVideoBgBtn;
  btn.disabled = true;
  const oldLabel = btn.textContent;
  btn.textContent = "Encoding\u2026";

  recorder.start();

  const track = stream.getVideoTracks()[0];

  for (let i = 0; i < plan.frames; i += 1) {
    const progress = i / plan.frames;
    const angle = plan.rotations * TAU * progress;

    drawBackgroundToContext(exportCtx, width, height, transparent);
    renderSolidToContext(exportCtx, width, height, state, baseRotation, plan.axis, angle);

    if (track.requestFrame) {
      track.requestFrame();
    }

    if (i % 12 === 0 || i === plan.frames - 1) {
      setStatus(
        `Encoding video ${i + 1}/${plan.frames} (${transparent ? "transparent" : "with background"})\u2026`
      );
    }

    await new Promise((r) => setTimeout(r, frameInterval));
  }

  return new Promise((resolve) => {
    recorder.onstop = () => {
      const blob = new Blob(chunks, { type: "video/webm" });
      if (!blob.size) {
        setStatus("Video export failed: empty file.");
      } else {
        const label = transparent ? "alpha" : "background";
        downloadBlob(
          blob,
          `altered-solid-${state.solidType}-${label}-${Date.now()}.webm`
        );
        setStatus(
          `Video downloaded (${plan.frames} frames, ${plan.durationSec.toFixed(1)}s, ${label}).`
        );
      }
      btn.disabled = false;
      btn.textContent = oldLabel;
      resolve();
    };
    recorder.stop();
  });
}

function bindActionButtons() {
  elements.togglePlayBtn.addEventListener("click", togglePlayback);
  elements.randomizeBtn.addEventListener("click", randomizeSettings);
  elements.resetBtn.addEventListener("click", resetSettings);
  elements.downloadPngBtn.addEventListener("click", downloadPngFrame);
  elements.downloadWebpBtn.addEventListener("click", exportAnimatedWebp);
  elements.exportVideoBgBtn.addEventListener("click", () => exportVideo(false));
  elements.exportVideoTransBtn.addEventListener("click", () => exportVideo(true));
}

function bindPointerControls() {
  const canvas = elements.solidCanvas;

  canvas.addEventListener("pointerdown", (event) => {
    state.dragging = true;
    state.dragStartX = event.clientX;
    state.dragStartY = event.clientY;
    canvas.setPointerCapture(event.pointerId);
    canvas.style.cursor = "grabbing";
  });

  canvas.addEventListener("pointermove", (event) => {
    if (!state.dragging) return;
    const dx = event.clientX - state.dragStartX;
    const dy = event.clientY - state.dragStartY;
    state.dragStartX = event.clientX;
    state.dragStartY = event.clientY;

    state.rotation.y += dx * 0.01;
    state.rotation.x += dy * 0.01;
    drawFrame();
  });

  const endDrag = () => {
    state.dragging = false;
    canvas.style.cursor = "grab";
  };

  canvas.addEventListener("pointerup", endDrag);
  canvas.addEventListener("pointercancel", endDrag);
  canvas.addEventListener("pointerleave", endDrag);
  canvas.style.cursor = "grab";
}

function boot() {
  applyStateToControls();
  bindFormControls();
  bindActionButtons();
  bindPointerControls();
  syncExportModeUi();
  resizeCanvas();
  readControlsToState();
  drawFrame();

  window.addEventListener("resize", () => {
    resizeCanvas();
    drawFrame();
  });

  setStatus("Drag on the render area to orbit manually.");
  window.requestAnimationFrame(animationTick);
}

boot();

