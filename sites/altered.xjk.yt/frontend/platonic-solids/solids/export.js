import { TAU } from "./geometry.js";
import { resolveExportPlan } from "./model.js";
import { drawBackgroundToContext, renderSolidToContext } from "./renderer.js";

function downloadBlob(blob, filename, documentObject = document) {
  const url = URL.createObjectURL(blob);
  const link = documentObject.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

async function ensureWebpEncodingSupport() {
  if (typeof ImageEncoder === "undefined" || typeof VideoFrame === "undefined") {
    throw new Error("Animated WebP export requires a WebCodecs-capable browser.");
  }
  if (typeof ImageEncoder.isConfigSupported === "function") {
    const support = await ImageEncoder.isConfigSupported({ type: "image/webp", quality: 0.95 });
    if (!support?.supported) throw new Error("This browser does not support animated WebP encoding.");
  }
}

function createSolidExporter({ documentObject = document, elements, readControlsToState, renderer, setStatus, state }) {
  function currentPlan() {
    return resolveExportPlan(state, {
      mode: elements.exportMode.value,
      fps: elements.exportFps.value,
      seconds: elements.exportSeconds.value,
      rotations: elements.exportRotations.value,
      loopLock: elements.exportLoopLock.checked,
    });
  }

  function downloadPngFrame() {
    renderer.drawFrame();
    elements.solidCanvas.toBlob((blob) => {
      if (!blob) {
        setStatus("PNG export failed.");
        return;
      }
      downloadBlob(blob, `altered-solid-${state.solidType}-${Date.now()}.png`, documentObject);
      setStatus("PNG downloaded.");
    }, "image/png");
  }

  async function exportAnimatedWebp() {
    readControlsToState();

    try {
      await ensureWebpEncodingSupport();
    } catch (error) {
      setStatus(error.message);
      return;
    }

    const plan = currentPlan();
    const width = Math.max(320, Math.round(state.width));
    const height = Math.max(220, Math.round(state.height));
    const frameDurationUs = Math.round(1_000_000 / plan.fps);

    const exportCanvas = documentObject.createElement("canvas");
    exportCanvas.width = width;
    exportCanvas.height = height;
    const exportContext = exportCanvas.getContext("2d", { alpha: true });
    if (!exportContext) {
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
      for (let index = 0; index < plan.frames; index += 1) {
        const progress = index / plan.frames;
        const angle = plan.rotations * TAU * progress;

        drawBackgroundToContext(exportContext, width, height, true);
        renderSolidToContext(exportContext, width, height, state, baseRotation, plan.axis, angle);

        const frame = new VideoFrame(exportCanvas, {
          timestamp: index * frameDurationUs,
          duration: frameDurationUs,
        });

        const result = encoder.encode(frame, { keyFrame: index === 0 });
        frame.close();
        if (result && typeof result.then === "function") await result;
        if (encoderError) throw encoderError;

        if (index % 12 === 0 || index === plan.frames - 1) {
          setStatus(
            `Encoding transparent WEBP ${index + 1}/${plan.frames} (mode=${plan.mode}, loop=${
              plan.loopLock ? "locked" : "free"
            })...`
          );
        }
      }

      await encoder.flush();
      if (encoderError) throw encoderError;

      const blob = new Blob(chunks, { type: "image/webp" });
      if (!blob.size) throw new Error("Encoder returned an empty WebP file.");

      const loopNote = plan.loopLock ? "loop-locked" : "free-spin";
      downloadBlob(
        blob,
        `altered-solid-${state.solidType}-${plan.mode}-${loopNote}-${Date.now()}.webp`,
        documentObject
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

    const plan = currentPlan();
    const width = Math.max(320, Math.round(state.width));
    const height = Math.max(220, Math.round(state.height));
    const frameInterval = 1000 / plan.fps;
    const exportCanvas = documentObject.createElement("canvas");
    exportCanvas.width = width;
    exportCanvas.height = height;
    const exportContext = exportCanvas.getContext("2d", { alpha: true });
    if (!exportContext) {
      setStatus("Failed to create export canvas.");
      return;
    }

    let mimeType = "video/webm;codecs=vp9";
    if (!MediaRecorder.isTypeSupported(mimeType)) mimeType = "video/webm;codecs=vp8";
    if (!MediaRecorder.isTypeSupported(mimeType)) mimeType = "video/webm";
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
    recorder.ondataavailable = (event) => {
      if (event.data.size > 0) chunks.push(event.data);
    };

    const baseRotation = { ...state.rotation };
    const button = transparent ? elements.exportVideoTransBtn : elements.exportVideoBgBtn;
    button.disabled = true;
    const oldLabel = button.textContent;
    button.textContent = "Encoding…";
    recorder.start();

    const track = stream.getVideoTracks()[0];
    for (let index = 0; index < plan.frames; index += 1) {
      const progress = index / plan.frames;
      const angle = plan.rotations * TAU * progress;

      drawBackgroundToContext(exportContext, width, height, transparent);
      renderSolidToContext(exportContext, width, height, state, baseRotation, plan.axis, angle);
      if (track.requestFrame) track.requestFrame();

      if (index % 12 === 0 || index === plan.frames - 1) {
        setStatus(`Encoding video ${index + 1}/${plan.frames} (${transparent ? "transparent" : "with background"})…`);
      }

      await new Promise((resolve) => setTimeout(resolve, frameInterval));
    }

    return new Promise((resolve) => {
      recorder.onstop = () => {
        const blob = new Blob(chunks, { type: "video/webm" });
        if (!blob.size) {
          setStatus("Video export failed: empty file.");
        } else {
          const label = transparent ? "alpha" : "background";
          downloadBlob(blob, `altered-solid-${state.solidType}-${label}-${Date.now()}.webm`, documentObject);
          setStatus(`Video downloaded (${plan.frames} frames, ${plan.durationSec.toFixed(1)}s, ${label}).`);
        }
        button.disabled = false;
        button.textContent = oldLabel;
        resolve();
      };
      recorder.stop();
    });
  }

  return { downloadPngFrame, exportAnimatedWebp, exportVideo };
}

export { createSolidExporter, downloadBlob, ensureWebpEncodingSupport };
