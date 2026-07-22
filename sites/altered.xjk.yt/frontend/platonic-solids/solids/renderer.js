import {
  GEOMETRIES,
  blendColor,
  normalizeVector,
  projectVertex,
  rotateAroundAxis,
  rotateVertex,
  vectorCross,
  vectorDot,
  vectorSubtract,
} from "./geometry.js";

function drawBackgroundToContext(targetContext, width, height, transparentBackground) {
  if (transparentBackground) {
    targetContext.clearRect(0, 0, width, height);
    return;
  }

  const backgroundGradient = targetContext.createLinearGradient(0, 0, width, height);
  backgroundGradient.addColorStop(0, "#060b14");
  backgroundGradient.addColorStop(1, "#0c1424");
  targetContext.fillStyle = backgroundGradient;
  targetContext.fillRect(0, 0, width, height);

  const firstGlow = targetContext.createRadialGradient(
    width * 0.9,
    height * 0.08,
    0,
    width * 0.9,
    height * 0.08,
    Math.max(width, height) * 0.8
  );
  firstGlow.addColorStop(0, "rgba(17, 102, 221, 0.22)");
  firstGlow.addColorStop(1, "rgba(17, 102, 221, 0)");
  targetContext.fillStyle = firstGlow;
  targetContext.fillRect(0, 0, width, height);

  const secondGlow = targetContext.createRadialGradient(
    width * 0.1,
    height * 0.9,
    0,
    width * 0.1,
    height * 0.9,
    Math.max(width, height) * 0.7
  );
  secondGlow.addColorStop(0, "rgba(34, 204, 238, 0.16)");
  secondGlow.addColorStop(1, "rgba(34, 204, 238, 0)");
  targetContext.fillStyle = secondGlow;
  targetContext.fillRect(0, 0, width, height);

  targetContext.globalAlpha = 0.12;
  targetContext.strokeStyle = "#22CCEE";
  targetContext.lineWidth = 1;
  const gridStep = 36;
  for (let x = 0; x < width; x += gridStep) {
    targetContext.beginPath();
    targetContext.moveTo(x, 0);
    targetContext.lineTo(x, height);
    targetContext.stroke();
  }
  for (let y = 0; y < height; y += gridStep) {
    targetContext.beginPath();
    targetContext.moveTo(0, y);
    targetContext.lineTo(width, y);
    targetContext.stroke();
  }
  targetContext.globalAlpha = 1;
}

function renderSolidToContext(targetContext, width, height, renderState, baseRotation, loopAxis = null, loopAngle = 0) {
  const geometry = GEOMETRIES[renderState.solidType];
  if (!geometry) return;

  let transformedVertices = geometry.vertices.map((vertex) =>
    rotateVertex(vertex, baseRotation.x, baseRotation.y, baseRotation.z)
  );

  if (loopAxis) {
    transformedVertices = transformedVertices.map((vertex) => rotateAroundAxis(vertex, loopAxis, loopAngle));
  }

  const projectedVertices = transformedVertices.map((vertex) =>
    projectVertex(vertex, width, height, renderState.scale, renderState.perspective)
  );
  const lightDirection = normalizeVector([-0.25, 0.8, 0.52]);

  const facePayload = geometry.faces.map((face) => {
    const firstVertex = transformedVertices[face[0]];
    const secondVertex = transformedVertices[face[1]];
    const thirdVertex = transformedVertices[face[2]];
    const firstEdge = vectorSubtract(secondVertex, firstVertex);
    const secondEdge = vectorSubtract(thirdVertex, firstVertex);
    const normal = normalizeVector(vectorCross(firstEdge, secondEdge));
    const light = (vectorDot(normal, lightDirection) + 1) * 0.5;
    const color = blendColor(renderState.colorA, renderState.colorB, light, renderState.fillAlpha);
    const points = face.map((index) => projectedVertices[index]);
    const averageDepth = points.reduce((sum, point) => sum + point.depth, 0) / points.length;
    return { points, averageDepth, color };
  });

  facePayload.sort((left, right) => right.averageDepth - left.averageDepth);
  facePayload.forEach((face) => {
    targetContext.beginPath();
    face.points.forEach((point, index) => {
      if (index === 0) targetContext.moveTo(point.x, point.y);
      else targetContext.lineTo(point.x, point.y);
    });
    targetContext.closePath();
    targetContext.fillStyle = face.color;
    targetContext.fill();
  });

  targetContext.strokeStyle = renderState.wireColor;
  targetContext.lineWidth = renderState.lineWidth;
  targetContext.globalAlpha = 0.95;
  geometry.edges.forEach(([firstIndex, secondIndex]) => {
    const first = projectedVertices[firstIndex];
    const second = projectedVertices[secondIndex];
    targetContext.beginPath();
    targetContext.moveTo(first.x, first.y);
    targetContext.lineTo(second.x, second.y);
    targetContext.stroke();
  });
  targetContext.globalAlpha = 1;
}

function createSolidRenderer({ canvas, state, windowObject = window }) {
  const context = canvas.getContext("2d");
  let previousFrameTime = 0;

  function resize() {
    const rect = canvas.getBoundingClientRect();
    state.devicePixelRatio = Math.min(2, windowObject.devicePixelRatio || 1);
    canvas.width = Math.max(1, Math.floor(rect.width * state.devicePixelRatio));
    canvas.height = Math.max(1, Math.floor(rect.height * state.devicePixelRatio));
    state.width = rect.width;
    state.height = rect.height;
    context.setTransform(state.devicePixelRatio, 0, 0, state.devicePixelRatio, 0, 0);
  }

  function drawFrame() {
    drawBackgroundToContext(context, state.width, state.height, state.transparentBg);
    renderSolidToContext(context, state.width, state.height, state, state.rotation);
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
    windowObject.requestAnimationFrame(animationTick);
  }

  return {
    drawFrame,
    resize,
    startAnimation() {
      windowObject.requestAnimationFrame(animationTick);
    },
  };
}

export { createSolidRenderer, drawBackgroundToContext, renderSolidToContext };
