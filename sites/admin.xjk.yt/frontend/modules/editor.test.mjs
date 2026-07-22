import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { buildExportText } from "./export.js";
import {
  angularPath,
  normalizeGrid,
  normalizePoint,
  parsePointText,
  routeStopEntries,
  transformPointForGrid,
} from "./geometry.js";
import { createEditorStore } from "./state.js";

const source = {
  grid: { width: 1000, height: 600, cellSize: 10 },
  hubOrder: ["xjk", "tools"],
  layout: {
    xjk: { station: [50, 30], label: [55, 30], color: "#fff", central: true },
    tools: { station: [80, 30], label: [82, 30], color: "#0ff" },
  },
  routes: [
    {
      id: "xjk-tools",
      hubId: "tools",
      points: [
        [50, 30],
        [65, 30],
        [80, 30],
      ],
    },
  ],
  inactiveRoutes: [],
  inactiveNodes: [],
  junctions: [],
};

test("grid geometry scales, clamps, and serializes editor points", () => {
  const oldGrid = normalizeGrid(source.grid);
  const nextGrid = normalizeGrid({ width: 1200, height: 720, cellSize: 10 }, oldGrid);
  assert.deepEqual(transformPointForGrid([50, 30], oldGrid, nextGrid), [60, 36]);
  assert.deepEqual(normalizePoint([-2, 999], oldGrid), [0, 60]);
  assert.equal(
    angularPath(
      [
        [1, 2],
        [3, 4],
      ],
      oldGrid
    ),
    "M10 20 L30 40"
  );
  assert.deepEqual(parsePointText("1, 2\n120, -4", oldGrid), [
    [1, 2],
    [100, 0],
  ]);
  assert.equal(parsePointText("1, 2\ninvalid", oldGrid), null);
});

test("route stops omit stations and merge transfer metadata", () => {
  const routes = [
    {
      id: "a",
      hubId: "tools",
      points: [
        [0, 0],
        [5, 5],
        [10, 10],
      ],
    },
    {
      id: "b",
      hubId: "learn",
      points: [
        [0, 10],
        [5, 5],
        [10, 0],
      ],
    },
  ];
  assert.deepEqual(
    routeStopEntries(routes, [
      [0, 0],
      [10, 10],
    ]),
    [{ point: [5, 5], routeIds: ["a", "b"], hubIds: ["tools", "learn"] }]
  );
});

test("editor state owns reset and undo without mutating its source", () => {
  const store = createEditorStore(source);
  store.recordUndo("move station");
  store.state.layout.tools.station = [70, 28];
  assert.deepEqual(source.layout.tools.station, [80, 30]);

  const entry = store.undo();
  assert.equal(entry.label, "move station");
  assert.deepEqual(store.state.layout.tools.station, [80, 30]);

  store.recordUndo("reset");
  store.state.grid.width = 1400;
  store.reset();
  assert.equal(store.state.grid.width, 1000);
});

test("export snapshots contain every public map-layout binding", () => {
  const store = createEditorStore(source);
  const output = buildExportText(store.state);
  for (const name of [
    "MAP_GRID",
    "HUB_ORDER",
    "HUB_LAYOUT",
    "HUB_ROUTES",
    "JUNCTIONS",
    "INACTIVE_ROUTES",
    "INACTIVE_NODES",
  ]) {
    assert.match(output, new RegExp(`const ${name} = Object\\.freeze`));
  }
});

test("admin browser entry delegates focused editor boundaries", async () => {
  const entrySource = await readFile(new URL("../app.js", import.meta.url), "utf8");
  assert.ok(entrySource.split(/\r?\n/).length <= 160);
  for (const name of ["access", "controls", "export", "rendering", "state"]) {
    assert.match(entrySource, new RegExp(`\\./modules/${name}\\.js`));
  }

  for (const name of ["access", "controls", "export", "geometry", "rendering", "state"]) {
    const moduleSource = await readFile(new URL(`./${name}.js`, import.meta.url), "utf8");
    assert.ok(moduleSource.split(/\r?\n/).length <= 500, `${name}.js exceeded the local boundary`);
  }
});
