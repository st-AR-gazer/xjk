import { clamp, lerp } from "../utils.js";

const IDLE_SPIN = 0.00055;

function sphereRadius(state) {
  return Math.min(state.width, state.height) * 0.35 * state.zoom;
}

function projectPoint3d(state, point) {
  const cy = Math.cos(state.rotY);
  const sy = Math.sin(state.rotY);
  const cx = Math.cos(state.rotX);
  const sx = Math.sin(state.rotX);
  const x1 = point.x * cy + point.z * sy;
  const z1 = -point.x * sy + point.z * cy;
  const y2 = point.y * cx - z1 * sx;
  const z2 = point.y * sx + z1 * cx;
  const perspective = 3.1;
  const scale = perspective / (perspective - z2);
  const radius = sphereRadius(state);
  return {
    x: state.width / 2 + x1 * radius * scale,
    y: state.height / 2 + y2 * radius * scale,
    z: z2,
    s: scale,
  };
}

function transformNode(state, node) {
  if (state.mode === "3d") return projectPoint3d(state, node.p3);
  return {
    x: node.x * state.zoom + state.panX,
    y: node.y * state.zoom + state.panY,
    z: 1,
    s: 1,
  };
}

function constrainPan(state, x, y, zoomValue = state.targetZoom) {
  const scaleOverBase = Math.max(0, zoomValue - 1);
  const limitX = state.width * (0.72 + scaleOverBase * 0.7);
  const limitY = state.height * (0.58 + scaleOverBase * 0.7);
  return {
    x: clamp(x, -limitX, limitX),
    y: clamp(y, -limitY, limitY),
  };
}

function focusActiveNode(state, animated = true) {
  const active = state.nodes.find((node) => node.slug === state.activeSlug);
  if (!active) return;
  if (state.mode === "3d") {
    const point = active.p3;
    const horizontal = Math.hypot(point.x, point.z) || 0.0001;
    state.focusTarget = {
      rotY: Math.atan2(-point.x, point.z),
      rotX: Math.atan2(point.y, horizontal),
    };
    if (!animated || state.reducedMotion) {
      state.rotY = state.focusTarget.rotY;
      state.rotX = state.focusTarget.rotX;
      state.focusTarget = null;
    }
    return;
  }

  state.targetPanX = state.width * 0.46 - active.x * state.targetZoom;
  state.targetPanY = state.height * 0.48 - active.y * state.targetZoom;
  const constrained = constrainPan(state, state.targetPanX, state.targetPanY);
  state.targetPanX = constrained.x;
  state.targetPanY = constrained.y;
  if (!animated) {
    state.panX = state.targetPanX;
    state.panY = state.targetPanY;
  }
}

function wrapAngle(value) {
  let wrapped = value;
  while (wrapped > Math.PI) wrapped -= Math.PI * 2;
  while (wrapped < -Math.PI) wrapped += Math.PI * 2;
  return wrapped;
}

function advance3dCamera(state) {
  if (state.focusTarget) {
    const deltaY = wrapAngle(state.focusTarget.rotY - state.rotY);
    const deltaX = state.focusTarget.rotX - state.rotX;
    state.rotY += deltaY * 0.08;
    state.rotX += deltaX * 0.08;
    if (Math.abs(deltaY) < 0.012 && Math.abs(deltaX) < 0.012) state.focusTarget = null;
  } else if (state.dragPointerId === null) {
    state.rotY += state.spinY;
    state.rotX += state.spinX;
    state.spinX *= 0.94;
    if (!state.reducedMotion) state.spinY = state.spinY * 0.97 + IDLE_SPIN * 0.03;
    else state.spinY *= 0.94;
  }
  state.rotX = clamp(state.rotX, -1.25, 1.25);
  state.zoom = lerp(state.zoom, state.targetZoom, state.reducedMotion ? 1 : 0.08);
}

function advance2dCamera(state) {
  const smoothing = state.reducedMotion ? 1 : 0.06;
  state.zoom = lerp(state.zoom, state.targetZoom, smoothing);
  state.panX = lerp(state.panX, state.targetPanX, smoothing);
  state.panY = lerp(state.panY, state.targetPanY, smoothing);
}

function zoomBy(state, delta) {
  state.targetZoom = clamp(
    state.targetZoom + delta,
    state.mode === "3d" ? 0.68 : 0.72,
    state.mode === "3d" ? 1.9 : 1.8
  );
  if (state.mode === "2d") focusActiveNode(state, true);
}

function resetCameraForMode(state) {
  state.zoom = 1;
  state.targetZoom = 1;
  if (state.mode === "2d") {
    state.panX = 0;
    state.panY = 0;
    state.targetPanX = 0;
    state.targetPanY = 0;
  } else {
    state.spinY = IDLE_SPIN;
    state.spinX = 0;
  }
  focusActiveNode(state, false);
}

export {
  IDLE_SPIN,
  advance2dCamera,
  advance3dCamera,
  constrainPan,
  focusActiveNode,
  projectPoint3d,
  resetCameraForMode,
  sphereRadius,
  transformNode,
  zoomBy,
};
