import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  GEOMETRIES,
  blendColor,
  normalizeSpinAxis,
  projectVertex,
  rotateAroundAxis,
  rotateVertex,
} from "./geometry.js";
import { createStudioState, randomizeStudioState, resetStudioState, resolveExportPlan } from "./model.js";
import { drawBackgroundToContext, renderSolidToContext } from "./renderer.js";

const expectedGeometry = {
  tetrahedron: { vertices: 4, faces: 4, edges: 6 },
  cube: { vertices: 8, faces: 6, edges: 12 },
  octahedron: { vertices: 6, faces: 8, edges: 12 },
  dodecahedron: { vertices: 20, faces: 12, edges: 30 },
  icosahedron: { vertices: 12, faces: 20, edges: 30 },
};

test("Platonic geometry retains canonical vertex, face, edge, and radius contracts", () => {
  for (const [name, expected] of Object.entries(expectedGeometry)) {
    const geometry = GEOMETRIES[name];
    assert.equal(geometry.vertices.length, expected.vertices, `${name} vertices`);
    assert.equal(geometry.faces.length, expected.faces, `${name} faces`);
    assert.equal(geometry.edges.length, expected.edges, `${name} edges`);
    assert.ok(
      geometry.vertices.every((vertex) => Math.hypot(...vertex) <= 1 + Number.EPSILON),
      `${name} vertices are normalized`
    );
  }
});

test("rotation, projection, axis, and color helpers preserve rendering math", () => {
  const vertex = [0.4, -0.2, 0.7];
  const rotated = rotateVertex(vertex, 0.3, -0.4, 0.8);
  assert.ok(Math.abs(Math.hypot(...rotated) - Math.hypot(...vertex)) < 1e-12);

  const axisRotated = rotateAroundAxis([1, 0, 0], [0, 0, 1], Math.PI / 2);
  assert.ok(Math.abs(axisRotated[0]) < 1e-12);
  assert.ok(Math.abs(axisRotated[1] - 1) < 1e-12);
  assert.deepEqual(normalizeSpinAxis(0, 0, 0), [0, 1, 0]);
  assert.deepEqual(projectVertex([0, 0, 0], 800, 600, 200, 2.5), { x: 400, y: 300, depth: 2.5 });
  assert.equal(blendColor("#0033cc", "#33ffff", 0.5, 0.4), "rgba(26, 153, 230, 0.4)");
});

test("studio randomization and reset retain bounded deterministic state", () => {
  const state = createStudioState();
  const originalRotation = { ...state.rotation };
  randomizeStudioState(state, () => 0.5);
  assert.equal(state.solidType, "octahedron");
  assert.equal(state.scale, 235);
  assert.equal(state.lineWidth, 2.1);
  assert.equal(state.fillAlpha, 0.57);
  assert.equal(state.colorA, "#2299EE");

  state.rotation.x = 99;
  state.playing = false;
  resetStudioState(state);
  assert.deepEqual(state.rotation, originalRotation);
  assert.equal(state.playing, true);
  assert.equal(state.solidType, "dodecahedron");
});

test("seconds and rotation export plans retain loop and frame bounds", () => {
  const state = createStudioState();
  const secondsPlan = resolveExportPlan(state, {
    mode: "seconds",
    fps: 30,
    seconds: 4,
    rotations: 2,
    loopLock: true,
  });
  assert.equal(secondsPlan.durationSec, 4);
  assert.equal(secondsPlan.rotations, 1);
  assert.equal(secondsPlan.frames, 120);
  assert.ok(Math.abs(Math.hypot(...secondsPlan.axis) - 1) < 1e-12);

  const rotationsPlan = resolveExportPlan(
    { ...state, spinX: 0, spinY: 0, spinZ: 0 },
    { mode: "rotations", fps: 100, seconds: 4, rotations: 200, loopLock: true }
  );
  assert.equal(rotationsPlan.fps, 60);
  assert.equal(rotationsPlan.rotations, 120);
  assert.equal(rotationsPlan.durationSec, 60);
  assert.equal(rotationsPlan.frames, 2400);
});

function createRenderingContext() {
  const calls = { beginPath: 0, clearRect: 0, fill: 0, fillRect: 0, stroke: 0 };
  const gradient = { addColorStop() {} };
  return {
    calls,
    beginPath() {
      calls.beginPath += 1;
    },
    clearRect() {
      calls.clearRect += 1;
    },
    closePath() {},
    createLinearGradient: () => gradient,
    createRadialGradient: () => gradient,
    fill() {
      calls.fill += 1;
    },
    fillRect() {
      calls.fillRect += 1;
    },
    lineTo() {},
    moveTo() {},
    stroke() {
      calls.stroke += 1;
    },
  };
}

test("renderer emits every face and edge and respects transparent backgrounds", () => {
  const context = createRenderingContext();
  const state = { ...createStudioState(), solidType: "cube" };
  renderSolidToContext(context, 800, 600, state, state.rotation);
  assert.equal(context.calls.fill, expectedGeometry.cube.faces);
  assert.equal(context.calls.stroke, expectedGeometry.cube.edges);

  drawBackgroundToContext(context, 800, 600, true);
  assert.equal(context.calls.clearRect, 1);
  drawBackgroundToContext(context, 72, 72, false);
  assert.ok(context.calls.fillRect >= 3);
  assert.ok(context.calls.stroke > expectedGeometry.cube.edges);
});

test("Platonic-solids entry and focused modules stay within their boundaries", async () => {
  const entrySource = await readFile(new URL("../solids.js", import.meta.url), "utf8");
  assert.ok(entrySource.split(/\r?\n/).length <= 10);
  assert.match(entrySource, /\.\/solids\/controller\.js/);
  assert.match(entrySource, /bootPlatonicSolids\(\)/);

  for (const name of ["controller", "export", "geometry", "model", "renderer"]) {
    const source = await readFile(new URL(`./${name}.js`, import.meta.url), "utf8");
    assert.ok(source.split(/\r?\n/).length <= 320, `${name}.js exceeded the local boundary`);
  }

  const pageSource = await readFile(new URL("../index.html", import.meta.url), "utf8");
  assert.match(pageSource, /<script type="module" src="solids\.js\?v=2"><\/script>/);

  const architectureSource = await readFile(
    new URL("../../../../../test/source-architecture.test.mjs", import.meta.url),
    "utf8"
  );
  assert.doesNotMatch(architectureSource, /platonic-solids\/solids\.js/);
});
