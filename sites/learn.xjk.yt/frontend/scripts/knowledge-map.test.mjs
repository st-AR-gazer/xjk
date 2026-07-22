import assert from "node:assert/strict";
import test from "node:test";

import { buildKnowledgeMapLayout } from "./knowledge-map-layout.js";
import { clusterColor, createKnowledgeMap } from "./knowledge-map.js";

class FakeEventTarget {
  constructor() {
    this.listeners = new Map();
  }

  addEventListener(type, listener) {
    if (!this.listeners.has(type)) this.listeners.set(type, new Set());
    this.listeners.get(type).add(listener);
  }

  removeEventListener(type, listener) {
    this.listeners.get(type)?.delete(listener);
  }

  dispatch(type, event = {}) {
    const dispatched = {
      preventDefault() {
        this.defaultPrevented = true;
      },
      ...event,
    };
    this.listeners.get(type)?.forEach((listener) => listener(dispatched));
    return dispatched;
  }

  listenerCount(type) {
    return this.listeners.get(type)?.size || 0;
  }
}

class FakeClassList {
  constructor() {
    this.values = new Set();
  }

  add(value) {
    this.values.add(value);
  }

  remove(value) {
    this.values.delete(value);
  }

  contains(value) {
    return this.values.has(value);
  }
}

class FakeCanvasContext {
  constructor() {
    this.calls = [];
  }

  record(name, ...args) {
    this.calls.push({ name, args });
  }

  arc(...args) {
    this.record("arc", ...args);
  }

  arcTo(...args) {
    this.record("arcTo", ...args);
  }

  beginPath() {
    this.record("beginPath");
  }

  bezierCurveTo(...args) {
    this.record("bezierCurveTo", ...args);
  }

  clearRect(...args) {
    this.record("clearRect", ...args);
  }

  closePath() {
    this.record("closePath");
  }

  ellipse(...args) {
    this.record("ellipse", ...args);
  }

  fill() {
    this.record("fill");
  }

  fillText(...args) {
    this.record("fillText", ...args);
  }

  lineTo(...args) {
    this.record("lineTo", ...args);
  }

  measureText(value) {
    return { width: String(value).length * 7 };
  }

  moveTo(...args) {
    this.record("moveTo", ...args);
  }

  restore() {
    this.record("restore");
  }

  save() {
    this.record("save");
  }

  setLineDash(...args) {
    this.record("setLineDash", ...args);
  }

  setTransform(...args) {
    this.record("setTransform", ...args);
  }

  stroke() {
    this.record("stroke");
  }
}

class FakeCanvas extends FakeEventTarget {
  constructor(width, height) {
    super();
    this.rect = { left: 0, top: 0, width, height };
    this.context = new FakeCanvasContext();
    this.style = {};
    this.classList = new FakeClassList();
    this.capturedPointers = new Set();
    this.width = 0;
    this.height = 0;
  }

  getBoundingClientRect() {
    return this.rect;
  }

  getContext(type) {
    assert.equal(type, "2d");
    return this.context;
  }

  setPointerCapture(pointerId) {
    this.capturedPointers.add(pointerId);
  }

  releasePointerCapture(pointerId) {
    this.capturedPointers.delete(pointerId);
  }
}

class FakeWindow extends FakeEventTarget {
  constructor() {
    super();
    this.devicePixelRatio = 1.5;
    this.timers = [];
  }

  matchMedia() {
    return { matches: false };
  }

  setTimeout(callback) {
    this.timers.push(callback);
    return this.timers.length;
  }

  flushTimers() {
    this.timers.splice(0).forEach((callback) => callback());
  }
}

function createAnimationScheduler() {
  let nextId = 1;
  const frames = new Map();
  const cancelled = new Set();
  return {
    request(callback) {
      const id = nextId;
      nextId += 1;
      frames.set(id, callback);
      return id;
    },
    cancel(id) {
      cancelled.add(id);
      frames.delete(id);
    },
    runNext() {
      const entry = frames.entries().next().value;
      assert.ok(entry, "a frame should be scheduled");
      const [id, callback] = entry;
      frames.delete(id);
      callback(16);
      return id;
    },
    pending: () => frames.size,
    cancelled,
  };
}

function installGlobals(context, values) {
  const descriptors = new Map(
    Object.keys(values).map((key) => [key, Object.getOwnPropertyDescriptor(globalThis, key)])
  );
  for (const [key, value] of Object.entries(values)) {
    Object.defineProperty(globalThis, key, { configurable: true, writable: true, value });
  }
  context.after(() => {
    for (const [key, descriptor] of descriptors) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor);
      else delete globalThis[key];
    }
  });
}

test("knowledge-map facade preserves 2D/3D rendering, interaction, resize, and cleanup behavior", (context) => {
  const windowRef = new FakeWindow();
  const scheduler = createAnimationScheduler();
  const documentRef = {
    createElement(tagName) {
      return { tagName: String(tagName).toUpperCase(), textContent: "" };
    },
  };
  installGlobals(context, {
    window: windowRef,
    document: documentRef,
    requestAnimationFrame: (callback) => scheduler.request(callback),
    cancelAnimationFrame: (frame) => scheduler.cancel(frame),
  });

  const manifest = {
    clusters: [{ id: "inputs", title: "Inputs", x: 0.5, y: 0.5 }],
    pages: [
      {
        slug: "alpha",
        title: "Alpha",
        summary: "Alpha summary",
        cluster: "inputs",
        graph: { primaryCluster: "inputs", orbit: 0, weight: 0.8 },
        links: [{ slug: "beta", kind: "related", weight: 0.7 }],
      },
      {
        slug: "beta",
        title: "Beta",
        summary: "Beta summary",
        cluster: "inputs",
        graph: { primaryCluster: "inputs", orbit: 0.5, weight: 0.6 },
      },
    ],
  };
  const canvas = new FakeCanvas(600, 400);
  const tooltip = {
    style: {},
    children: [],
    replaceChildren(...children) {
      this.children = children;
    },
  };
  const selected = [];
  const map = createKnowledgeMap(canvas, {
    manifest,
    tooltip,
    onSelect: (slug) => selected.push(slug),
    settings: { mapMode: "2d", motion: "reduced", graphLabels: true, tendrilIntensity: 1.18 },
  });

  assert.equal(map.getMode(), "2d");
  assert.equal(canvas.width, 900);
  assert.equal(canvas.height, 600);
  assert.equal(canvas.style.cursor, "grab");
  assert.equal(windowRef.listenerCount("resize"), 1);
  assert.equal(canvas.listenerCount("pointermove"), 1);
  assert.equal(scheduler.pending(), 1);

  scheduler.runNext();
  assert.ok(
    canvas.context.calls.some(({ name }) => name === "ellipse"),
    "2D renderer should draw its background"
  );
  assert.ok(
    canvas.context.calls.some(({ name }) => name === "bezierCurveTo"),
    "2D renderer should draw graph edges"
  );

  const [alpha] = buildKnowledgeMapLayout(manifest, { width: 600, height: 400 }).nodes;
  canvas.dispatch("pointermove", { clientX: alpha.x, clientY: alpha.y, pointerId: 9 });
  assert.equal(canvas.style.cursor, "pointer");
  assert.equal(tooltip.style.display, "block");
  assert.deepEqual(
    tooltip.children.map(({ textContent }) => textContent),
    ["Alpha", "Alpha summary"]
  );
  canvas.dispatch("click", { clientX: alpha.x, clientY: alpha.y });
  assert.deepEqual(selected, ["alpha"]);

  canvas.dispatch("pointerdown", {
    button: 0,
    pointerType: "mouse",
    pointerId: 4,
    clientX: alpha.x,
    clientY: alpha.y,
  });
  assert.equal(canvas.classList.contains("is-panning"), true);
  canvas.dispatch("pointermove", {
    pointerId: 4,
    clientX: alpha.x + 12,
    clientY: alpha.y + 8,
  });
  canvas.dispatch("pointerup", { pointerId: 4 });
  canvas.dispatch("click", { clientX: alpha.x, clientY: alpha.y });
  assert.deepEqual(selected, ["alpha"], "a completed drag should suppress its trailing click");
  windowRef.flushTimers();
  canvas.dispatch("click", { clientX: alpha.x, clientY: alpha.y });
  assert.deepEqual(selected, ["alpha", "alpha"]);

  map.zoomBy(0.3);
  map.setLabels(false);
  map.setIntensity(0.8);
  map.setReducedMotion(false);
  map.setMode("3d");
  assert.equal(map.getMode(), "3d");
  assert.equal(tooltip.style.display, "none");
  scheduler.runNext();
  assert.ok(
    canvas.context.calls.some(({ name }) => name === "lineTo"),
    "3D renderer should draw its graticule"
  );

  canvas.rect = { left: 0, top: 0, width: 400, height: 300 };
  windowRef.dispatch("resize");
  assert.equal(canvas.width, 600);
  assert.equal(canvas.height, 450);

  map.destroy();
  assert.equal(windowRef.listenerCount("resize"), 0);
  assert.equal(canvas.listenerCount("pointermove"), 0);
  assert.equal(scheduler.pending(), 0);
  assert.ok(scheduler.cancelled.size > 0);
  assert.equal(clusterColor("inputs"), "56,189,248");
  assert.equal(clusterColor("unknown"), "230,230,230");
});
