import { clone } from "./state.js";

function layoutPayload(state) {
  return {
    grid: clone(state.grid),
    hubOrder: clone(state.hubOrder),
    layout: clone(state.layout),
    routes: clone(state.routes),
    junctions: clone(state.junctions),
    inactiveRoutes: clone(state.inactiveRoutes),
    inactiveNodes: clone(state.inactiveNodes),
  };
}

function buildExportText(state) {
  const payload = layoutPayload(state);
  return `// Read-only xjk hub map snapshot.
// Production geometry is generated from the site registry in map-layout.js.
// Coordinates are grid cells, not raw pixels. With cellSize 10,
// [49, 29] renders at x=490, y=290 in the SVG viewBox.

const MAP_GRID = Object.freeze(${JSON.stringify(payload.grid, null, 2)});

const HUB_ORDER = Object.freeze(${JSON.stringify(payload.hubOrder, null, 2)});

const HUB_LAYOUT = Object.freeze(${JSON.stringify(payload.layout, null, 2)});

const HUB_ROUTES = Object.freeze(${JSON.stringify(payload.routes, null, 2)});

const JUNCTIONS = Object.freeze(${JSON.stringify(payload.junctions, null, 2)});

const INACTIVE_ROUTES = Object.freeze(${JSON.stringify(payload.inactiveRoutes, null, 2)});

const INACTIVE_NODES = Object.freeze(${JSON.stringify(payload.inactiveNodes, null, 2)});

export {
  HUB_LAYOUT,
  HUB_ORDER,
  HUB_ROUTES,
  INACTIVE_NODES,
  INACTIVE_ROUTES,
  JUNCTIONS,
  MAP_GRID,
};
`;
}

function createExportController(editor) {
  const { elements, setStatus, store } = editor;

  function update() {
    const text = buildExportText(store.state);
    if (elements.exportText) elements.exportText.value = text;
    if (elements.exportSize) elements.exportSize.textContent = `${new Blob([text]).size.toLocaleString()} B`;
  }

  async function copy() {
    update();
    const text = elements.exportText?.value || "";
    try {
      await navigator.clipboard.writeText(text);
      setStatus("Export copied");
    } catch {
      elements.exportText?.select();
      setStatus("Export selected");
    }
  }

  function save() {
    update();
    setStatus("Save disabled: the home map is generated from the site registry");
  }

  function download() {
    update();
    const blob = new Blob([elements.exportText.value], { type: "application/javascript;charset=utf-8" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = "map-layout-snapshot.js";
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(link.href), 500);
    setStatus("Export downloaded");
  }

  return { copy, download, save, update };
}

export { buildExportText, createExportController, layoutPayload };
