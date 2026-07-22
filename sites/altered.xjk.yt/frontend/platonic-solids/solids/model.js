import { GEOMETRIES, TAU, clamp, normalizeSpinAxis } from "./geometry.js";

const ALTERED_PALETTE = Object.freeze(["#0033CC", "#1166DD", "#2299EE", "#22CCEE", "#33FFFF"]);
const DEFAULT_ROTATION = Object.freeze({ x: 0.44, y: 0.23, z: 0.06 });
const DEFAULT_STATE = Object.freeze({
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
});

function createStudioState() {
  return {
    ...DEFAULT_STATE,
    width: 0,
    height: 0,
    devicePixelRatio: 1,
    playing: true,
    rotation: { ...DEFAULT_ROTATION },
    dragging: false,
    dragStartX: 0,
    dragStartY: 0,
  };
}

function resetStudioState(state) {
  Object.assign(state, DEFAULT_STATE);
  state.rotation = { ...DEFAULT_ROTATION };
  state.playing = true;
}

function randomFromPalette(random = Math.random) {
  return ALTERED_PALETTE[Math.floor(random() * ALTERED_PALETTE.length)];
}

function randomizeStudioState(state, random = Math.random) {
  const geometryKeys = Object.keys(GEOMETRIES);
  state.solidType = geometryKeys[Math.floor(random() * geometryKeys.length)];
  state.scale = Math.floor(150 + random() * 170);
  state.lineWidth = Number((0.9 + random() * 2.5).toFixed(1));
  state.spinX = Number((random() * 1.6 - 0.8).toFixed(2));
  state.spinY = Number((random() * 1.6 - 0.8).toFixed(2));
  state.spinZ = Number((random() * 1.6 - 0.8).toFixed(2));
  state.fillAlpha = Number((0.35 + random() * 0.45).toFixed(2));
  state.perspective = Number((2.1 + random() * 1.7).toFixed(2));
  state.colorA = randomFromPalette(random);
  state.colorB = randomFromPalette(random);
  state.wireColor = randomFromPalette(random);
}

function resolveExportPlan(state, inputs = {}) {
  const mode = inputs.mode;
  const fps = clamp(Math.round(Number(inputs.fps) || 30), 10, 60);
  const secondsInput = clamp(Number(inputs.seconds) || 4, 0.5, 60);
  const rotationsInput = clamp(Math.round(Number(inputs.rotations) || 2), 1, 120);
  const loopLock = Boolean(inputs.loopLock);
  const spinMagnitude = Math.hypot(state.spinX, state.spinY, state.spinZ);
  const axis = normalizeSpinAxis(state.spinX, state.spinY, state.spinZ);

  let durationSec = secondsInput;
  let rotations = rotationsInput;

  if (mode === "rotations") {
    rotations = loopLock ? Math.max(1, Math.round(rotationsInput)) : rotationsInput;
    const speed = spinMagnitude > 0.00001 ? spinMagnitude : 1;
    durationSec = clamp(Math.abs((rotations * TAU) / speed), 0.5, 60);
  } else {
    const naturalRotations = (Math.max(spinMagnitude, 1) * durationSec) / TAU;
    rotations = loopLock ? Math.max(1, Math.round(Math.abs(naturalRotations))) : naturalRotations;
  }

  const frames = clamp(Math.round(durationSec * fps), 2, 2400);
  return { mode, fps, durationSec, rotations, frames, axis, loopLock };
}

export {
  ALTERED_PALETTE,
  DEFAULT_ROTATION,
  DEFAULT_STATE,
  createStudioState,
  randomizeStudioState,
  resetStudioState,
  resolveExportPlan,
};
