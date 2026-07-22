import {
  clampCell,
  gridsMatch,
  normalizeGrid,
  normalizePoint,
  parsePointText,
  pointListMatches,
  pointText,
  samePoint,
  transformPointForGrid,
} from "./geometry.js";
import { routeById, selectedRoute } from "./state.js";

function createEditorControls(editor) {
  const { elements, registryById, resolutionPresets, setStatus, store } = editor;

  function applyGridResolution(input, label = "resolution") {
    const state = store.state;
    const oldGrid = normalizeGrid(state.grid);
    const nextGrid = normalizeGrid(input, oldGrid);
    if (gridsMatch(oldGrid, nextGrid)) {
      editor.renderer.syncGridControls();
      return;
    }

    store.recordUndo(label);
    const transform = (point) => transformPointForGrid(point, oldGrid, nextGrid);

    state.grid = nextGrid;
    Object.values(state.layout).forEach((layout) => {
      layout.station = transform(layout.station);
      layout.label = transform(layout.label);
    });
    state.routes = state.routes.map((route) => ({
      ...route,
      points: route.points.map(transform),
    }));
    state.inactiveRoutes = state.inactiveRoutes.map((route) => ({
      ...route,
      points: route.points.map(transform),
    }));
    state.junctions = state.junctions.map((junction) => ({
      ...junction,
      point: transform(junction.point),
    }));
    state.inactiveNodes = state.inactiveNodes.map(transform);

    editor.renderer.renderAll();
    setStatus(`Resolution ${nextGrid.width}x${nextGrid.height} / ${nextGrid.cellSize}px`);
  }

  function selectStation(hubId) {
    const state = store.state;
    if (!state.layout[hubId]) return;
    state.selectedMode = "station";
    state.selectedHubId = hubId;
    editor.renderer.renderLists();
    editor.renderer.renderInspector();
    editor.renderer.renderMap();
    setStatus(`${registryById.get(hubId)?.label || hubId} selected`);
  }

  function selectRoute(routeId, pointIndex = store.state.selectedPointIndex) {
    const state = store.state;
    if (!routeById(state, routeId)) return;
    state.selectedMode = "route";
    state.selectedRouteId = routeId;
    const route = selectedRoute(state);
    state.selectedPointIndex = Math.max(0, Math.min(route.points.length - 1, Number(pointIndex) || 0));
    editor.renderer.renderLists();
    editor.renderer.renderInspector();
    editor.renderer.renderMap();
    setStatus(`${routeId} selected`);
  }

  function moveStation(hubId, nextPoint) {
    const state = store.state;
    const layout = state.layout[hubId];
    if (!layout) return;
    const previousPoint = [...layout.station];
    layout.station = nextPoint;

    state.routes.forEach((route) => {
      route.points = route.points.map((point, index, points) => {
        const endpoint = index === 0 || index === points.length - 1;
        const routeOwnsStation = route.hubId === hubId;
        const centralStation = Boolean(layout.central);
        if (samePoint(point, previousPoint) && (endpoint || routeOwnsStation || centralStation)) {
          return [...nextPoint];
        }
        return point;
      });
    });
  }

  function updateRoutePoint(routeId, pointIndex, axis, value) {
    const state = store.state;
    const route = routeById(state, routeId);
    if (!route?.points[pointIndex]) return;
    const nextPoint = [...route.points[pointIndex]];
    nextPoint[axis === "x" ? 0 : 1] = clampCell(value, axis, state.grid);
    if (samePoint(route.points[pointIndex], nextPoint)) return;
    store.recordUndo("route point");
    route.points[pointIndex] = nextPoint;
    state.selectedPointIndex = pointIndex;
    elements.routePointsText.value = pointText(route.points);
    editor.renderer.renderMap();
    editor.exporter.update();
  }

  function updateStationAxis(kind, axis, value) {
    const state = store.state;
    const layout = state.layout[state.selectedHubId];
    if (!layout) return;
    const point = [...layout[kind]];
    point[axis === "x" ? 0 : 1] = clampCell(value, axis, state.grid);
    if (samePoint(layout[kind], point)) return;
    store.recordUndo(kind === "station" ? "station position" : "label position");
    if (kind === "station") moveStation(state.selectedHubId, point);
    else layout.label = point;
    editor.renderer.renderLists();
    editor.renderer.renderMap();
    editor.exporter.update();
  }

  function eventToCell(event) {
    const svg = document.getElementById("mapSvg");
    if (!svg) return null;
    const rect = svg.getBoundingClientRect();
    if (!rect.width || !rect.height) return null;
    const { grid } = store.state;
    const x = ((event.clientX - rect.left) / rect.width) * grid.width;
    const y = ((event.clientY - rect.top) / rect.height) * grid.height;
    return normalizePoint([x / grid.cellSize, y / grid.cellSize], grid);
  }

  function handleMapPointerDown(event) {
    const handle = event.target.closest("[data-drag-kind]");
    if (!handle) return;

    const kind = handle.dataset.dragKind;
    if (kind === "route") {
      selectRoute(handle.dataset.routeId);
      return;
    }

    event.preventDefault();
    const state = store.state;

    if (kind === "station" || kind === "label") {
      selectStation(handle.dataset.hubId);
      state.drag = {
        kind,
        hubId: handle.dataset.hubId,
        undoLabel: kind === "station" ? "station drag" : "label drag",
        undoRecorded: false,
      };
    }

    if (kind === "route-point") {
      selectRoute(handle.dataset.routeId, Number(handle.dataset.pointIndex));
      state.drag = {
        kind,
        routeId: handle.dataset.routeId,
        pointIndex: Number(handle.dataset.pointIndex),
        undoLabel: "route point drag",
        undoRecorded: false,
      };
    }
  }

  function handlePointerMove(event) {
    const state = store.state;
    if (!state.drag) return;
    const cell = eventToCell(event);
    if (!cell) return;

    if (!state.drag.undoRecorded) {
      store.recordUndo(state.drag.undoLabel || "drag");
      state.drag.undoRecorded = true;
    }

    if (state.drag.kind === "station") {
      moveStation(state.drag.hubId, cell);
      editor.renderer.syncStationInspector();
    }

    if (state.drag.kind === "label") {
      const layout = state.layout[state.drag.hubId];
      if (layout) layout.label = cell;
      editor.renderer.syncStationInspector();
    }

    if (state.drag.kind === "route-point") {
      const route = routeById(state, state.drag.routeId);
      if (route?.points[state.drag.pointIndex]) {
        route.points[state.drag.pointIndex] = cell;
        editor.renderer.syncRouteInspector();
      }
    }

    editor.renderer.renderMap();
    editor.exporter.update();
    setStatus(`${cell[0]}, ${cell[1]}`);
  }

  function handlePointerUp() {
    const state = store.state;
    if (!state.drag) return;
    state.drag = null;
    editor.renderer.renderLists();
    editor.renderer.renderInspector();
    editor.renderer.renderMap();
    editor.exporter.update();
    setStatus("Map updated");
  }

  function undoLastChange() {
    const entry = store.undo();
    if (!entry) return;
    editor.renderer.renderAll();
    setStatus(`Undid ${entry.label}`);
  }

  function resetEditor() {
    store.recordUndo("reset");
    store.reset();
    editor.renderer.renderAll();
    setStatus("Reset to source");
  }

  function bindNumberField(input, handler) {
    input?.addEventListener("input", () => handler(input.value));
  }

  function bind() {
    elements.stationSelect?.addEventListener("change", () => selectStation(elements.stationSelect.value));
    elements.routeSelect?.addEventListener("change", () => selectRoute(elements.routeSelect.value));
    elements.undoBtn?.addEventListener("click", undoLastChange);
    elements.resolutionPreset?.addEventListener("change", () => {
      const preset = resolutionPresets.find((item) => item.id === elements.resolutionPreset.value);
      if (!preset || preset.custom) {
        editor.renderer.syncGridControls();
        return;
      }
      applyGridResolution(preset, "resolution preset");
    });
    [elements.gridWidth, elements.gridHeight, elements.gridCellSize].forEach((input) => {
      input?.addEventListener("change", () => {
        applyGridResolution(
          {
            width: elements.gridWidth?.value,
            height: elements.gridHeight?.value,
            cellSize: elements.gridCellSize?.value,
          },
          "resolution"
        );
      });
    });

    bindNumberField(elements.stationX, (value) => updateStationAxis("station", "x", value));
    bindNumberField(elements.stationY, (value) => updateStationAxis("station", "y", value));
    bindNumberField(elements.labelX, (value) => updateStationAxis("label", "x", value));
    bindNumberField(elements.labelY, (value) => updateStationAxis("label", "y", value));

    elements.stationColor?.addEventListener("input", () => {
      const state = store.state;
      const layout = state.layout[state.selectedHubId];
      if (!layout) return;
      const nextColor = elements.stationColor.value || layout.color;
      if (layout.color === nextColor) return;
      store.recordUndo("station color");
      layout.color = nextColor;
      editor.renderer.renderLists();
      editor.renderer.renderMap();
      editor.exporter.update();
    });

    elements.stationDescription?.addEventListener("input", () => {
      const state = store.state;
      const layout = state.layout[state.selectedHubId];
      if (!layout) return;
      const nextDescription = elements.stationDescription.value
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter(Boolean);
      if (JSON.stringify(layout.description || []) === JSON.stringify(nextDescription)) return;
      store.recordUndo("station description");
      layout.description = nextDescription;
      editor.renderer.renderMap();
      editor.exporter.update();
    });

    elements.routePointsText?.addEventListener("change", () => {
      const state = store.state;
      const route = selectedRoute(state);
      const points = parsePointText(elements.routePointsText.value, state.grid);
      if (!route || !points) {
        setStatus("Invalid point list");
        return;
      }
      if (pointListMatches(route.points, points)) return;
      store.recordUndo("route points");
      route.points = points;
      state.selectedPointIndex = Math.min(state.selectedPointIndex, points.length - 1);
      editor.renderer.renderInspector();
      editor.renderer.renderLists();
      editor.renderer.renderMap();
      editor.exporter.update();
      setStatus("Route points updated");
    });

    elements.addRoutePointBtn?.addEventListener("click", () => {
      const state = store.state;
      const route = selectedRoute(state);
      if (!route) return;
      store.recordUndo("add route point");
      const last = route.points[route.points.length - 1] || [0, 0];
      route.points.push(normalizePoint([last[0] + 4, last[1]], state.grid));
      state.selectedPointIndex = route.points.length - 1;
      editor.renderer.renderLists();
      editor.renderer.renderInspector();
      editor.renderer.renderMap();
      editor.exporter.update();
    });

    elements.removeRoutePointBtn?.addEventListener("click", () => {
      const state = store.state;
      const route = selectedRoute(state);
      if (!route || route.points.length <= 2) return;
      store.recordUndo("remove route point");
      route.points.pop();
      state.selectedPointIndex = Math.min(state.selectedPointIndex, route.points.length - 1);
      editor.renderer.renderLists();
      editor.renderer.renderInspector();
      editor.renderer.renderMap();
      editor.exporter.update();
    });

    elements.showInactiveToggle?.addEventListener("change", () => {
      store.state.showInactive = Boolean(elements.showInactiveToggle.checked);
      editor.renderer.renderMap();
    });

    elements.showLabelsToggle?.addEventListener("change", () => {
      store.state.showLabels = Boolean(elements.showLabelsToggle.checked);
      editor.renderer.renderMap();
    });

    elements.refreshExportBtn?.addEventListener("click", () => {
      editor.exporter.update();
      setStatus("Export refreshed");
    });

    elements.saveExportBtn?.addEventListener("click", editor.exporter.save);
    elements.copyExportBtn?.addEventListener("click", editor.exporter.copy);
    elements.downloadExportBtn?.addEventListener("click", editor.exporter.download);
    elements.resetBtn?.addEventListener("click", resetEditor);

    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", handlePointerUp);
    window.addEventListener("pointercancel", handlePointerUp);
  }

  return { bind, handleMapPointerDown, selectRoute, selectStation, updateRoutePoint };
}

export { createEditorControls };
