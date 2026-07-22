import { clamp } from "./geometry.js";
import { createSolidExporter } from "./export.js";
import { DEFAULT_STATE, createStudioState, randomizeStudioState, resetStudioState } from "./model.js";
import { createSolidRenderer } from "./renderer.js";

const ELEMENT_IDS = Object.freeze([
  "solidType",
  "scale",
  "lineWidth",
  "spinX",
  "spinY",
  "spinZ",
  "fillAlpha",
  "perspective",
  "colorA",
  "colorB",
  "wireColor",
  "transparentBg",
  "exportMode",
  "exportSeconds",
  "exportRotations",
  "exportFps",
  "exportLoopLock",
  "togglePlayBtn",
  "randomizeBtn",
  "resetBtn",
  "downloadPngBtn",
  "downloadWebpBtn",
  "exportVideoBgBtn",
  "exportVideoTransBtn",
  "statusLine",
  "solidCanvas",
]);

const VALUE_ELEMENT_IDS = Object.freeze({
  scale: "scaleVal",
  perspective: "perspectiveVal",
  spinX: "spinXVal",
  spinY: "spinYVal",
  spinZ: "spinZVal",
  lineWidth: "lineWidthVal",
  fillAlpha: "fillAlphaVal",
});

function elementsById(documentObject, ids) {
  return Object.fromEntries(ids.map((id) => [id, documentObject.getElementById(id)]));
}

function createPlatonicSolidsStudio({ documentObject = document, windowObject = window } = {}) {
  const elements = elementsById(documentObject, ELEMENT_IDS);
  const valueElements = Object.fromEntries(
    Object.entries(VALUE_ELEMENT_IDS).map(([key, id]) => [key, documentObject.getElementById(id)])
  );
  const state = createStudioState();
  const renderer = createSolidRenderer({ canvas: elements.solidCanvas, state, windowObject });

  function setStatus(message) {
    elements.statusLine.textContent = message;
  }

  function updateValueDisplays() {
    if (valueElements.scale) valueElements.scale.value = state.scale;
    if (valueElements.perspective) valueElements.perspective.value = Number(state.perspective).toFixed(2);
    if (valueElements.spinX) valueElements.spinX.value = Number(state.spinX).toFixed(2);
    if (valueElements.spinY) valueElements.spinY.value = Number(state.spinY).toFixed(2);
    if (valueElements.spinZ) valueElements.spinZ.value = Number(state.spinZ).toFixed(2);
    if (valueElements.lineWidth) valueElements.lineWidth.value = Number(state.lineWidth).toFixed(1);
    if (valueElements.fillAlpha) valueElements.fillAlpha.value = Number(state.fillAlpha).toFixed(2);
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
    state.scale = Number(elements.scale.value) || DEFAULT_STATE.scale;
    state.lineWidth = Number(elements.lineWidth.value) || DEFAULT_STATE.lineWidth;
    state.spinX = Number(elements.spinX.value) || 0;
    state.spinY = Number(elements.spinY.value) || 0;
    state.spinZ = Number(elements.spinZ.value) || 0;
    state.fillAlpha = clamp(Number(elements.fillAlpha.value) || 0, 0, 1);
    state.perspective = Number(elements.perspective.value) || DEFAULT_STATE.perspective;
    state.colorA = elements.colorA.value;
    state.colorB = elements.colorB.value;
    state.wireColor = elements.wireColor.value;
    state.transparentBg = elements.transparentBg.checked;
  }

  const exporter = createSolidExporter({
    documentObject,
    elements,
    readControlsToState,
    renderer,
    setStatus,
    state,
  });

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
    ].forEach((element) => {
      element.addEventListener("input", () => {
        readControlsToState();
        updateValueDisplays();
        renderer.drawFrame();
      });
    });

    elements.exportMode.addEventListener("input", syncExportModeUi);

    const valueToSlider = [
      [valueElements.scale, elements.scale],
      [valueElements.perspective, elements.perspective],
      [valueElements.spinX, elements.spinX],
      [valueElements.spinY, elements.spinY],
      [valueElements.spinZ, elements.spinZ],
      [valueElements.lineWidth, elements.lineWidth],
      [valueElements.fillAlpha, elements.fillAlpha],
    ];
    valueToSlider.forEach(([numberInput, rangeInput]) => {
      if (!numberInput) return;
      numberInput.addEventListener("input", () => {
        rangeInput.value = numberInput.value;
        readControlsToState();
        renderer.drawFrame();
      });
    });
  }

  function randomizeSettings() {
    randomizeStudioState(state);
    applyStateToControls();
    setStatus("Randomized settings.");
  }

  function resetSettings() {
    resetStudioState(state);
    elements.togglePlayBtn.textContent = "Pause";
    applyStateToControls();
    renderer.drawFrame();
    setStatus("Settings reset.");
  }

  function togglePlayback() {
    state.playing = !state.playing;
    elements.togglePlayBtn.textContent = state.playing ? "Pause" : "Play";
    setStatus(state.playing ? "Animation resumed." : "Animation paused.");
  }

  function bindActionButtons() {
    elements.togglePlayBtn.addEventListener("click", togglePlayback);
    elements.randomizeBtn.addEventListener("click", randomizeSettings);
    elements.resetBtn.addEventListener("click", resetSettings);
    elements.downloadPngBtn.addEventListener("click", exporter.downloadPngFrame);
    elements.downloadWebpBtn.addEventListener("click", exporter.exportAnimatedWebp);
    elements.exportVideoBgBtn.addEventListener("click", () => exporter.exportVideo(false));
    elements.exportVideoTransBtn.addEventListener("click", () => exporter.exportVideo(true));
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
      const deltaX = event.clientX - state.dragStartX;
      const deltaY = event.clientY - state.dragStartY;
      state.dragStartX = event.clientX;
      state.dragStartY = event.clientY;
      state.rotation.y += deltaX * 0.01;
      state.rotation.x += deltaY * 0.01;
      renderer.drawFrame();
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
    renderer.resize();
    readControlsToState();
    renderer.drawFrame();

    windowObject.addEventListener("resize", () => {
      renderer.resize();
      renderer.drawFrame();
    });

    setStatus("Drag on the render area to orbit manually.");
    renderer.startAnimation();
  }

  return { boot };
}

function bootPlatonicSolids(options) {
  const studio = createPlatonicSolidsStudio(options);
  studio.boot();
  return studio;
}

export { bootPlatonicSolids, createPlatonicSolidsStudio };
