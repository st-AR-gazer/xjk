import { escapeAttribute, escapeHtml } from "../../../shared/xjk-core/dom-utils.js";
import { angularPath, gridPoint, gridsMatch, pointText, routeStopEntries } from "./geometry.js";
import { colorFor, selectedRoute, selectedSite, stationSites } from "./state.js";

function createEditorRenderer(editor) {
  const { elements, gridPointOnRoutes, registryById, resolutionPresets, store } = editor;

  function sites() {
    return stationSites(store.state, registryById);
  }

  function populateResolutionPresets() {
    if (!elements.resolutionPreset) return;
    globalThis.XjkSafeHtml.set(
      elements.resolutionPreset,
      resolutionPresets
        .map((preset) => `<option value="${escapeAttribute(preset.id)}">${escapeHtml(preset.label)}</option>`)
        .join("")
    );
  }

  function matchingResolutionPreset() {
    return (
      resolutionPresets.find((preset) => !preset.custom && gridsMatch(store.state.grid, preset)) ||
      resolutionPresets.find((preset) => preset.custom)
    );
  }

  function syncGridControls() {
    const { grid } = store.state;
    if (elements.gridWidth) elements.gridWidth.value = grid.width;
    if (elements.gridHeight) elements.gridHeight.value = grid.height;
    if (elements.gridCellSize) elements.gridCellSize.value = grid.cellSize;
    if (elements.resolutionPreset) elements.resolutionPreset.value = matchingResolutionPreset()?.id || "custom";
  }

  function syncLayerControls() {
    if (elements.showInactiveToggle) elements.showInactiveToggle.checked = store.state.showInactive;
    if (elements.showLabelsToggle) elements.showLabelsToggle.checked = store.state.showLabels;
  }

  function updateUndoButton() {
    if (!elements.undoBtn) return;
    const label = store.nextUndoLabel;
    elements.undoBtn.disabled = !label;
    elements.undoBtn.title = label ? `Undo ${label}` : "Nothing to undo";
  }

  function renderStationList() {
    if (!elements.stationList) return;
    const state = store.state;
    const mapSites = sites();
    globalThis.XjkSafeHtml.set(
      elements.stationList,
      mapSites
        .map((site) => {
          const layout = state.layout[site.id];
          const selected = state.selectedMode === "station" && state.selectedHubId === site.id;
          return `
            <button class="object-button${selected ? " is-selected" : ""}" type="button" data-select-station="${escapeAttribute(site.id)}" style="--hub-color:${escapeAttribute(layout.color)}">
              <span class="object-marker" aria-hidden="true"></span>
              <span class="object-copy">
                <strong>${escapeHtml(site.label)}</strong>
                <small>${escapeHtml(layout.station.join(", "))} / ${escapeHtml(layout.label.join(", "))}</small>
              </span>
            </button>
          `;
        })
        .join("")
    );
    if (elements.stationCount) elements.stationCount.textContent = String(mapSites.length);

    elements.stationList.querySelectorAll("[data-select-station]").forEach((button) => {
      button.addEventListener("click", () => editor.controls.selectStation(button.dataset.selectStation));
    });
  }

  function renderRouteList() {
    if (!elements.routeList) return;
    const state = store.state;
    globalThis.XjkSafeHtml.set(
      elements.routeList,
      state.routes
        .map((route) => {
          const site = registryById.get(route.hubId);
          const selected = state.selectedMode === "route" && state.selectedRouteId === route.id;
          return `
            <button class="object-button${selected ? " is-selected" : ""}" type="button" data-select-route="${escapeAttribute(route.id)}" style="--hub-color:${escapeAttribute(colorFor(state, registryById, route.hubId))}">
              <span class="object-line" aria-hidden="true"></span>
              <span class="object-copy">
                <strong>${escapeHtml(site?.label || route.hubId)}</strong>
                <small>${escapeHtml(route.id)} / ${route.points.length} points</small>
              </span>
            </button>
          `;
        })
        .join("")
    );
    if (elements.routeCount) elements.routeCount.textContent = String(state.routes.length);

    elements.routeList.querySelectorAll("[data-select-route]").forEach((button) => {
      button.addEventListener("click", () => editor.controls.selectRoute(button.dataset.selectRoute));
    });
  }

  function renderSelectOptions() {
    const state = store.state;
    if (elements.stationSelect) {
      globalThis.XjkSafeHtml.set(
        elements.stationSelect,
        sites()
          .map((site) => `<option value="${escapeAttribute(site.id)}">${escapeHtml(site.label)}</option>`)
          .join("")
      );
      elements.stationSelect.value = state.selectedHubId;
    }

    if (elements.routeSelect) {
      globalThis.XjkSafeHtml.set(
        elements.routeSelect,
        state.routes
          .map((route) => `<option value="${escapeAttribute(route.id)}">${escapeHtml(route.id)}</option>`)
          .join("")
      );
      elements.routeSelect.value = state.selectedRouteId;
    }
  }

  function renderLists() {
    renderStationList();
    renderRouteList();
    renderSelectOptions();
  }

  function syncStationInspector() {
    const state = store.state;
    const site = selectedSite(state, registryById);
    if (!site) return;
    const layout = state.layout[site.id];
    if (!layout) return;

    elements.stationSelect.value = site.id;
    elements.stationX.value = layout.station[0];
    elements.stationY.value = layout.station[1];
    elements.labelX.value = layout.label[0];
    elements.labelY.value = layout.label[1];
    elements.stationColor.value = layout.color;
    elements.stationDescription.value = (layout.description || []).join("\n");
  }

  function renderRoutePointList(route) {
    if (!elements.routePointList) return;
    globalThis.XjkSafeHtml.set(
      elements.routePointList,
      route.points
        .map(
          (point, index) => `
            <div class="point-row${index === store.state.selectedPointIndex ? " is-selected" : ""}" data-point-index="${index}">
              <button type="button" data-select-point="${index}">${index + 1}</button>
              <input type="number" min="0" step="1" value="${point[0]}" data-point-axis="x" data-point-index="${index}" aria-label="Point ${index + 1} x" />
              <input type="number" min="0" step="1" value="${point[1]}" data-point-axis="y" data-point-index="${index}" aria-label="Point ${index + 1} y" />
            </div>
          `
        )
        .join("")
    );

    elements.routePointList.querySelectorAll("[data-select-point]").forEach((button) => {
      button.addEventListener("click", () => {
        store.state.selectedPointIndex = Number(button.dataset.selectPoint) || 0;
        renderInspector();
        renderMap();
      });
    });

    elements.routePointList.querySelectorAll("[data-point-axis]").forEach((input) => {
      input.addEventListener("input", () => {
        editor.controls.updateRoutePoint(
          route.id,
          Number(input.dataset.pointIndex),
          input.dataset.pointAxis,
          input.value
        );
      });
    });
  }

  function syncRouteInspector() {
    const route = selectedRoute(store.state);
    if (!route) return;
    elements.routeSelect.value = route.id;
    renderRoutePointList(route);
    elements.routePointsText.value = pointText(route.points);
  }

  function renderInspector() {
    const isRoute = store.state.selectedMode === "route";
    elements.stationInspector.hidden = isRoute;
    elements.routeInspector.hidden = !isRoute;
    if (elements.selectionBadge) elements.selectionBadge.textContent = isRoute ? "route" : "station";
    if (elements.inspectorTitle) elements.inspectorTitle.textContent = isRoute ? "Route" : "Station";

    if (isRoute) syncRouteInspector();
    else syncStationInspector();
  }

  function renderInactiveNetwork() {
    const state = store.state;
    if (!state.showInactive) return "";
    const routes = state.inactiveRoutes
      .map(
        (route) =>
          `<path class="inactive-route${route.dashed ? " is-dashed" : ""}" d="${escapeAttribute(angularPath(route.points, state.grid))}"></path>`
      )
      .join("");
    const nodes = state.inactiveNodes
      .map((point) => {
        const { x, y } = gridPoint(point, state.grid);
        return `<circle class="inactive-node" cx="${x}" cy="${y}" r="4"></circle>`;
      })
      .join("");
    return `<g class="inactive-layer" aria-hidden="true">${routes}${nodes}</g>`;
  }

  function renderRoutes() {
    const state = store.state;
    return state.routes
      .map((route) => {
        const selected = state.selectedMode === "route" && state.selectedRouteId === route.id;
        const color = route.color || colorFor(state, registryById, route.hubId);
        const path = angularPath(route.points, state.grid);
        return `
          <path class="route-shadow${selected ? " is-selected" : ""}" d="${escapeAttribute(path)}"></path>
          <path class="route-line${selected ? " is-selected" : ""}" d="${escapeAttribute(path)}" data-drag-kind="route" data-route-id="${escapeAttribute(route.id)}" style="--hub-color:${escapeAttribute(color)}"></path>
        `;
      })
      .join("");
  }

  function renderRouteStops() {
    const state = store.state;
    const stationPoints = sites()
      .map((site) => state.layout[site.id]?.station)
      .filter(Boolean);
    return routeStopEntries(state.routes, stationPoints)
      .map((stop) => {
        const { x, y } = gridPoint(stop.point, state.grid);
        const selected = state.selectedMode === "route" && stop.routeIds.includes(state.selectedRouteId);
        const transferClass = stop.routeIds.length > 1 ? " route-stop--transfer" : "";
        const selectedClass = selected ? " is-selected" : "";
        const primaryHubId = stop.hubIds[0] || "";
        return `<circle class="route-stop${transferClass}${selectedClass}" cx="${x}" cy="${y}" r="${stop.routeIds.length > 1 ? 5 : 4.25}" style="--hub-color:${escapeAttribute(colorFor(state, registryById, primaryHubId))}"></circle>`;
      })
      .join("");
  }

  function renderJunctions() {
    const state = store.state;
    return state.junctions
      .filter((junction) => gridPointOnRoutes(junction.point, state.routes))
      .map((junction) => {
        const { x, y } = gridPoint(junction.point, state.grid);
        return `<circle class="junction${junction.important ? " junction--important" : ""}" cx="${x}" cy="${y}" r="${junction.important ? 7 : 5}"></circle>`;
      })
      .join("");
  }

  function renderStationLabel(site, layout) {
    const label = gridPoint(layout.label, store.state.grid);
    const textAnchor = layout.labelAnchor || "start";
    const displayLabel = layout.displayLabel || site.label;
    if (layout.minimalLabel) {
      const hitboxX = textAnchor === "end" ? label.x - 68 : textAnchor === "middle" ? label.x - 38 : label.x - 8;
      return `
        <g class="station-label" data-drag-kind="label" data-hub-id="${escapeAttribute(site.id)}">
          <rect class="label-hitbox" x="${hitboxX}" y="${label.y - 24}" width="76" height="36"></rect>
          <text class="station-title" x="${label.x}" y="${label.y}" text-anchor="${escapeAttribute(textAnchor)}">${escapeHtml(displayLabel)}</text>
        </g>
      `;
    }
    const description = (layout.description || [])
      .map(
        (line, index) =>
          `<text class="station-description" x="${label.x}" y="${label.y + 24 + index * 15}" text-anchor="${escapeAttribute(textAnchor)}">${escapeHtml(line)}</text>`
      )
      .join("");
    const actionY = label.y + 24 + (layout.description || []).length * 15 + 18;
    const hitboxX = textAnchor === "end" ? label.x - 128 : textAnchor === "middle" ? label.x - 68 : label.x - 8;

    return `
      <g class="station-label" data-drag-kind="label" data-hub-id="${escapeAttribute(site.id)}">
        <rect class="label-hitbox" x="${hitboxX}" y="${label.y - 24}" width="136" height="${58 + (layout.description || []).length * 15}"></rect>
        <text class="station-title" x="${label.x}" y="${label.y}" text-anchor="${escapeAttribute(textAnchor)}">${escapeHtml(displayLabel)}</text>
        ${description}
        <text class="station-action" x="${label.x}" y="${actionY}" text-anchor="${escapeAttribute(textAnchor)}">OPEN -></text>
      </g>
    `;
  }

  function renderStation(site) {
    const state = store.state;
    const layout = state.layout[site.id];
    const station = gridPoint(layout.station, state.grid);
    const selected = state.selectedMode === "station" && state.selectedHubId === site.id;
    const label = state.showLabels ? renderStationLabel(site, layout) : "";
    return `
      <g class="station-group${selected ? " is-selected" : ""}" data-hub-id="${escapeAttribute(site.id)}" style="--hub-color:${escapeAttribute(layout.color)}">
        <circle class="station-glow" cx="${station.x}" cy="${station.y}" r="${layout.central ? 32 : 20}"></circle>
        <circle class="station-ring" cx="${station.x}" cy="${station.y}" r="${layout.central ? 27 : 15}" data-drag-kind="station" data-hub-id="${escapeAttribute(site.id)}"></circle>
        <circle class="station-core" cx="${station.x}" cy="${station.y}" r="${layout.central ? 16 : 7}" data-drag-kind="station" data-hub-id="${escapeAttribute(site.id)}"></circle>
        ${label}
      </g>
    `;
  }

  function renderSelectedRoutePoints() {
    const state = store.state;
    const route = selectedRoute(state);
    if (state.selectedMode !== "route" || !route) return "";
    return route.points
      .map((point, index) => {
        const { x, y } = gridPoint(point, state.grid);
        return `
          <g class="route-point${index === state.selectedPointIndex ? " is-selected" : ""}" data-drag-kind="route-point" data-route-id="${escapeAttribute(route.id)}" data-point-index="${index}">
            <circle cx="${x}" cy="${y}" r="9"></circle>
            <text x="${x}" y="${y + 3}">${index + 1}</text>
          </g>
        `;
      })
      .join("");
  }

  function renderMap() {
    if (!elements.mapCanvas) return;
    const state = store.state;
    globalThis.XjkSafeHtml.set(
      elements.mapCanvas,
      `<svg id="mapSvg" class="network-map" viewBox="0 0 ${state.grid.width} ${state.grid.height}" role="img" aria-label="Editable xjk subway map">
        ${renderInactiveNetwork()}
        <g class="route-layer">${renderRoutes()}</g>
        <g class="route-stop-layer">${renderRouteStops()}</g>
        <g class="junction-layer">${renderJunctions()}</g>
        <g class="station-layer">${sites().map(renderStation).join("")}</g>
        <g class="point-layer">${renderSelectedRoutePoints()}</g>
      </svg>`
    );

    document.getElementById("mapSvg")?.addEventListener("pointerdown", editor.controls.handleMapPointerDown);
  }

  function renderAll() {
    syncLayerControls();
    syncGridControls();
    renderLists();
    renderInspector();
    renderMap();
    editor.exporter.update();
    updateUndoButton();
  }

  return {
    populateResolutionPresets,
    renderAll,
    renderInspector,
    renderLists,
    renderMap,
    syncGridControls,
    syncRouteInspector,
    syncStationInspector,
    updateUndoButton,
  };
}

export { createEditorRenderer };
