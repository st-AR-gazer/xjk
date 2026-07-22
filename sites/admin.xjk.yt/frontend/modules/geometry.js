function clampNumber(value, { min, max, fallback }) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(min, Math.min(max, Math.round(parsed)));
}

function normalizeGrid(input = {}, fallback = {}) {
  const base = fallback || {};
  return {
    width: clampNumber(input.width, { min: 400, max: 4096, fallback: Number(base.width) || 1000 }),
    height: clampNumber(input.height, { min: 300, max: 4096, fallback: Number(base.height) || 604 }),
    cellSize: clampNumber(input.cellSize, { min: 2, max: 40, fallback: Number(base.cellSize) || 10 }),
  };
}

function gridsMatch(left = {}, right = {}) {
  return (
    Number(left.width) === Number(right.width) &&
    Number(left.height) === Number(right.height) &&
    Number(left.cellSize) === Number(right.cellSize)
  );
}

function cellLimit(axis, grid) {
  const size = axis === "x" ? grid.width : grid.height;
  return Math.floor(size / grid.cellSize);
}

function clampCell(value, axis, grid) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return 0;
  return Math.max(0, Math.min(cellLimit(axis, grid), Math.round(parsed)));
}

function normalizePoint(point, grid) {
  return [clampCell(point?.[0], "x", grid), clampCell(point?.[1], "y", grid)];
}

function samePoint(left, right) {
  return Number(left?.[0]) === Number(right?.[0]) && Number(left?.[1]) === Number(right?.[1]);
}

function pointListMatches(left = [], right = []) {
  return left.length === right.length && left.every((point, index) => samePoint(point, right[index]));
}

function transformPointForGrid(point, oldGrid, nextGrid) {
  const xRatio = nextGrid.width / oldGrid.width;
  const yRatio = nextGrid.height / oldGrid.height;
  const nextX = (Number(point?.[0] || 0) * oldGrid.cellSize * xRatio) / nextGrid.cellSize;
  const nextY = (Number(point?.[1] || 0) * oldGrid.cellSize * yRatio) / nextGrid.cellSize;
  return normalizePoint([nextX, nextY], nextGrid);
}

function pointKey(point) {
  return `${Number(point?.[0])},${Number(point?.[1])}`;
}

function gridPoint(point, grid) {
  return {
    x: Number(point[0]) * grid.cellSize,
    y: Number(point[1]) * grid.cellSize,
  };
}

function angularPath(points, grid) {
  const parsed = points.map((point) => gridPoint(point, grid));
  if (!parsed.length) return "";
  return parsed.map((point, index) => `${index === 0 ? "M" : "L"}${point.x} ${point.y}`).join(" ");
}

function pointText(points) {
  return points.map((point) => `${point[0]}, ${point[1]}`).join("\n");
}

function parsePointText(text, grid) {
  const points = String(text || "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      if (!/^-?\d+(?:\.\d+)?\s*,\s*-?\d+(?:\.\d+)?$/.test(line)) return null;
      return normalizePoint(line.split(",").map(Number), grid);
    });

  if (!points.length || points.some((point) => !point)) return null;
  return points;
}

function routeStopEntries(routes, stationPoints) {
  const stationKeys = new Set(stationPoints.map(pointKey));
  const stops = new Map();

  routes.forEach((route) => {
    const routeStops = route.stops ?? route.points.slice(1, -1);
    routeStops.forEach((point) => {
      const key = pointKey(point);
      if (stationKeys.has(key)) return;

      const stop = stops.get(key) || { point, routeIds: [], hubIds: [] };
      if (!stop.routeIds.includes(route.id)) stop.routeIds.push(route.id);
      if (!stop.hubIds.includes(route.hubId)) stop.hubIds.push(route.hubId);
      stops.set(key, stop);
    });
  });

  return [...stops.values()];
}

export {
  angularPath,
  cellLimit,
  clampCell,
  gridPoint,
  gridsMatch,
  normalizeGrid,
  normalizePoint,
  parsePointText,
  pointKey,
  pointListMatches,
  pointText,
  routeStopEntries,
  samePoint,
  transformPointForGrid,
};
