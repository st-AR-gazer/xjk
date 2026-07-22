import { IDLE_SPIN, focusActiveNode, resetCameraForMode, zoomBy as updateZoom } from "./camera.js";
import { createKnowledgeMapInteractions } from "./interactions.js";
import { renderKnowledgeMap2d } from "./renderer-2d.js";
import { renderKnowledgeMap3d } from "./renderer-3d.js";

function createBrowserRuntime() {
  return {
    window: globalThis.window,
    document: globalThis.document,
    performance: globalThis.performance,
    requestAnimationFrame: (callback) => globalThis.requestAnimationFrame(callback),
    cancelAnimationFrame: (frame) => globalThis.cancelAnimationFrame(frame),
  };
}

function createKnowledgeMapController(canvas, options = {}, dependencies = {}) {
  const runtime = dependencies.runtime || createBrowserRuntime();
  const buildLayout = dependencies.buildLayout;
  if (typeof buildLayout !== "function") {
    throw new TypeError("A knowledge-map layout builder is required.");
  }

  const state = {
    canvas,
    ctx: canvas.getContext("2d"),
    runtime,
    manifest: options.manifest,
    tooltip: options.tooltip,
    onSelect: options.onSelect || (() => {}),
    activeSlug: options.activeSlug,
    labels: options.settings?.graphLabels !== false,
    intensity: Number(options.settings?.tendrilIntensity || 1.18),
    reducedMotion:
      options.settings?.motion === "reduced" || runtime.window.matchMedia?.("(prefers-reduced-motion: reduce)").matches,
    mode: options.settings?.mapMode === "2d" ? "2d" : "3d",
    nodes: [],
    edges: [],
    clusters3d: [],
    width: 1,
    height: 1,
    dpr: 1,
    frame: 0,
    hover: null,
    zoom: 1,
    targetZoom: 1,
    panX: 0,
    panY: 0,
    targetPanX: 0,
    targetPanY: 0,
    rotY: 0.4,
    rotX: -0.22,
    spinY: IDLE_SPIN,
    spinX: 0,
    focusTarget: null,
    dragPointerId: null,
    dragStartX: 0,
    dragStartY: 0,
    dragStartPanX: 0,
    dragStartPanY: 0,
    dragLastX: 0,
    dragLastY: 0,
    dragMoved: false,
    suppressClick: false,
  };
  const interactions = createKnowledgeMapInteractions(state);

  function layout() {
    const nextLayout = buildLayout(state.manifest, { width: state.width, height: state.height });
    state.nodes = nextLayout.nodes;
    state.edges = nextLayout.edges;
    state.clusters3d = nextLayout.clusters;
    focusActiveNode(state, false);
  }

  function resize() {
    const rect = canvas.getBoundingClientRect();
    state.width = Math.max(1, rect.width);
    state.height = Math.max(1, rect.height);
    state.dpr = Math.min(2, runtime.window.devicePixelRatio || 1);
    canvas.width = Math.round(state.width * state.dpr);
    canvas.height = Math.round(state.height * state.dpr);
    state.ctx.setTransform(state.dpr, 0, 0, state.dpr, 0, 0);
    layout();
  }

  function draw() {
    if (state.mode === "3d") renderKnowledgeMap3d(state);
    else renderKnowledgeMap2d(state);
    state.frame = runtime.requestAnimationFrame(draw);
  }

  function setMode(next) {
    const value = next === "2d" ? "2d" : "3d";
    if (value === state.mode) return;
    state.mode = value;
    state.hover = null;
    state.focusTarget = null;
    interactions.showTooltip(null);
    resetCameraForMode(state);
  }

  function destroy() {
    runtime.cancelAnimationFrame(state.frame);
    runtime.window.removeEventListener("resize", resize);
    interactions.destroy();
  }

  runtime.window.addEventListener("resize", resize);
  interactions.attach();
  resize();
  state.frame = runtime.requestAnimationFrame(draw);

  return {
    zoomBy: (delta) => updateZoom(state, delta),
    focusActive: (animated = true) => focusActiveNode(state, animated),
    setLabels: (value) => {
      state.labels = Boolean(value);
    },
    setIntensity: (value) => {
      state.intensity = Number(value) || 1;
    },
    setReducedMotion: (value) => {
      state.reducedMotion = Boolean(value);
    },
    setMode,
    getMode: () => state.mode,
    destroy,
  };
}

export { createKnowledgeMapController };
