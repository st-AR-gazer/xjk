const HISTORY_LIMIT = 80;

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function createInitialState(source) {
  return {
    grid: clone(source.grid),
    hubOrder: clone(source.hubOrder),
    layout: clone(source.layout),
    routes: clone(source.routes),
    inactiveRoutes: clone(source.inactiveRoutes),
    inactiveNodes: clone(source.inactiveNodes),
    junctions: clone(source.junctions),
    selectedMode: "station",
    selectedHubId: source.hubOrder[0] || "",
    selectedRouteId: source.routes[0]?.id || "",
    selectedPointIndex: 0,
    showInactive: true,
    showLabels: true,
    drag: null,
  };
}

function editableStateSnapshot(state) {
  return {
    grid: clone(state.grid),
    hubOrder: clone(state.hubOrder),
    layout: clone(state.layout),
    routes: clone(state.routes),
    inactiveRoutes: clone(state.inactiveRoutes),
    inactiveNodes: clone(state.inactiveNodes),
    junctions: clone(state.junctions),
    selectedMode: state.selectedMode,
    selectedHubId: state.selectedHubId,
    selectedRouteId: state.selectedRouteId,
    selectedPointIndex: state.selectedPointIndex,
    showInactive: state.showInactive,
    showLabels: state.showLabels,
  };
}

function createEditorStore(source, { historyLimit = HISTORY_LIMIT } = {}) {
  let state = createInitialState(source);
  const undoStack = [];
  const historyListeners = new Set();

  function notifyHistory() {
    for (const listener of historyListeners) listener();
  }

  function recordUndo(label = "change") {
    const snapshot = editableStateSnapshot(state);
    const serialized = JSON.stringify(snapshot);
    if (undoStack[undoStack.length - 1]?.serialized === serialized) return;
    undoStack.push({ snapshot, serialized, label });
    if (undoStack.length > historyLimit) undoStack.shift();
    notifyHistory();
  }

  function undo() {
    const entry = undoStack.pop();
    if (!entry) return null;
    state = {
      ...state,
      ...clone(entry.snapshot),
      drag: null,
    };
    notifyHistory();
    return entry;
  }

  return {
    get state() {
      return state;
    },
    get nextUndoLabel() {
      return undoStack[undoStack.length - 1]?.label || "";
    },
    recordUndo,
    reset() {
      state = createInitialState(source);
    },
    subscribeHistory(listener) {
      historyListeners.add(listener);
      return () => historyListeners.delete(listener);
    },
    undo,
  };
}

function stationSites(state, registryById) {
  return state.hubOrder.map((id) => registryById.get(id)).filter((site) => site && state.layout[site.id]);
}

function routeById(state, routeId) {
  return state.routes.find((route) => route.id === routeId) || null;
}

function selectedSite(state, registryById) {
  return registryById.get(state.selectedHubId) || stationSites(state, registryById)[0] || null;
}

function selectedRoute(state) {
  return routeById(state, state.selectedRouteId) || state.routes[0] || null;
}

function colorFor(state, registryById, hubId) {
  return state.layout[hubId]?.color || registryById.get(hubId)?.accent || "#f2f2f0";
}

export { clone, colorFor, createEditorStore, createInitialState, routeById, selectedRoute, selectedSite, stationSites };
