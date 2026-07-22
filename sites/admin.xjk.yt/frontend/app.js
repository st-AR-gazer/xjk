import "/shared/xjk-core/safe-html.js?v=2";
import { applySiteLinks, getMapSites, getNavigationSites } from "/shared/xjk-core/site-runtime.js";
import { uniqueSites } from "/shared/xjk-core/dom-utils.js";
import {
  HUB_LAYOUT,
  HUB_ORDER,
  HUB_ROUTES,
  INACTIVE_NODES,
  INACTIVE_ROUTES,
  JUNCTIONS,
  MAP_GRID,
  gridPointOnRoutes,
} from "/map-layout.js";
import { requireAdminAccess } from "./modules/access.js";
import { createEditorControls } from "./modules/controls.js";
import { createExportController } from "./modules/export.js";
import { createEditorRenderer } from "./modules/rendering.js";
import { createEditorStore } from "./modules/state.js";

const elementIds = [
  "stationCount",
  "stationList",
  "routeCount",
  "routeList",
  "mapCanvas",
  "mapViewport",
  "statusLine",
  "inspectorTitle",
  "selectionBadge",
  "stationInspector",
  "routeInspector",
  "stationSelect",
  "routeSelect",
  "stationX",
  "stationY",
  "labelX",
  "labelY",
  "stationColor",
  "stationDescription",
  "routePointList",
  "routePointsText",
  "addRoutePointBtn",
  "removeRoutePointBtn",
  "showInactiveToggle",
  "showLabelsToggle",
  "resolutionPreset",
  "gridWidth",
  "gridHeight",
  "gridCellSize",
  "exportText",
  "exportSize",
  "saveExportBtn",
  "refreshExportBtn",
  "undoBtn",
  "copyExportBtn",
  "downloadExportBtn",
  "resetBtn",
];

const elements = Object.fromEntries(elementIds.map((id) => [id, document.getElementById(id)]));
const resolutionPresets = Object.freeze([
  {
    id: "default",
    label: `Default / ${MAP_GRID.width} x ${MAP_GRID.height} / ${MAP_GRID.cellSize}`,
    ...MAP_GRID,
  },
  { id: "hd", label: "HD / 1200 x 720 / 10", width: 1200, height: 720, cellSize: 10 },
  { id: "wide", label: "Wide / 1440 x 810 / 10", width: 1440, height: 810, cellSize: 10 },
  { id: "fine", label: "Fine / 1000 x 604 / 5", width: 1000, height: 604, cellSize: 5 },
  { id: "compact", label: "Compact / 800 x 480 / 10", width: 800, height: 480, cellSize: 10 },
  { id: "custom", label: "Custom", custom: true },
]);

const sourceLayout = {
  grid: MAP_GRID,
  hubOrder: HUB_ORDER,
  layout: HUB_LAYOUT,
  routes: HUB_ROUTES,
  inactiveRoutes: INACTIVE_ROUTES,
  inactiveNodes: INACTIVE_NODES,
  junctions: JUNCTIONS,
};
const registrySites = uniqueSites([
  ...getMapSites({ includeInternal: true }),
  ...getNavigationSites({ includeHidden: true, includeInternal: true }),
]);

const editor = {
  elements,
  gridPointOnRoutes,
  registryById: new Map(registrySites.map((site) => [site.id, site])),
  resolutionPresets,
  setStatus(message) {
    if (elements.statusLine) elements.statusLine.textContent = message;
  },
  store: createEditorStore(sourceLayout),
};

editor.exporter = createExportController(editor);
editor.renderer = createEditorRenderer(editor);
editor.controls = createEditorControls(editor);
editor.store.subscribeHistory(editor.renderer.updateUndoButton);

async function boot() {
  applySiteLinks();
  if (!(await requireAdminAccess(editor))) return;
  editor.renderer.populateResolutionPresets();
  elements.undoBtn?.removeAttribute("hidden");
  elements.copyExportBtn?.removeAttribute("hidden");
  editor.controls.bind();
  editor.renderer.renderAll();
}

boot();
