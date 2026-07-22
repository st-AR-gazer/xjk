import {
  angularDistance,
  heapPop,
  heapPush,
  octilinearPath,
  pixelPointsEqual,
  pixelSegmentIntersection,
  pointToSegmentDistance,
  simplifyPath,
  snap,
  toGridPoint,
} from "./geometry.js";

const ROOT_SITE_ID = "xjk";

const ROOT_PORT_DIRECTIONS = Object.freeze([
  { angle: -Math.PI, vector: [-1, 0] },
  { angle: -Math.PI * 0.75, vector: [-1, -1] },
  { angle: -Math.PI * 0.5, vector: [0, -1] },
  { angle: -Math.PI * 0.25, vector: [1, -1] },
  { angle: 0, vector: [1, 0] },
  { angle: Math.PI * 0.25, vector: [1, 1] },
  { angle: Math.PI * 0.5, vector: [0, 1] },
  { angle: Math.PI * 0.75, vector: [-1, 1] },
]);

const GRID_ROUTE_DIRECTIONS = Object.freeze([
  { x: 1, y: 0, cost: 1 },
  { x: 1, y: 1, cost: Math.SQRT2 },
  { x: 0, y: 1, cost: 1 },
  { x: -1, y: 1, cost: Math.SQRT2 },
  { x: -1, y: 0, cost: 1 },
  { x: -1, y: -1, cost: Math.SQRT2 },
  { x: 0, y: -1, cost: 1 },
  { x: 1, y: -1, cost: Math.SQRT2 },
]);

function compareSites(left, right) {
  const leftOrder = Number(left?.map?.order ?? left?.hub?.order ?? Number.MAX_SAFE_INTEGER);
  const rightOrder = Number(right?.map?.order ?? right?.hub?.order ?? Number.MAX_SAFE_INTEGER);
  return leftOrder - rightOrder || String(left?.id || "").localeCompare(String(right?.id || ""));
}

function rootPortOptions(rootEdgeCount, center, cellSize) {
  const directions =
    rootEdgeCount <= ROOT_PORT_DIRECTIONS.length
      ? ROOT_PORT_DIRECTIONS
      : Array.from({ length: rootEdgeCount }, (_, index) => {
          const angle = -Math.PI + (Math.PI * 2 * index) / rootEdgeCount;
          return { angle, vector: [Math.cos(angle), Math.sin(angle)] };
        });
  const cardinalOffset = cellSize * 6;
  const diagonalOffset = cellSize * 4;
  return directions.map((port, index) => {
    const isOctilinearPort = rootEdgeCount <= ROOT_PORT_DIRECTIONS.length;
    const offsetX = isOctilinearPort
      ? port.vector[0] * (port.vector[1] === 0 ? cardinalOffset : diagonalOffset)
      : port.vector[0] * cellSize * 7;
    const offsetY = isOctilinearPort
      ? port.vector[1] * (port.vector[0] === 0 ? cardinalOffset : diagonalOffset)
      : port.vector[1] * cellSize * 7;
    return {
      index,
      angle: port.angle,
      point: {
        x: snap(center.x + offsetX, cellSize),
        y: snap(center.y + offsetY, cellSize),
      },
    };
  });
}

function preferredRootPorts(edges, positions, ports) {
  const entries = edges
    .map((edge) => edge.find((site) => site.id !== ROOT_SITE_ID))
    .map((site) => {
      const station = positions.get(site.id);
      const center = positions.get(ROOT_SITE_ID);
      return {
        site,
        angle: Math.atan2(station.y - center.y, station.x - center.x),
      };
    })
    .sort((left, right) => left.angle - right.angle || compareSites(left.site, right.site));

  if (entries.length === ports.length && entries.length > ROOT_PORT_DIRECTIONS.length) {
    const rotations = ports.map((_, rotation) => ({
      rotation,
      score: entries.reduce(
        (total, entry, index) => total + angularDistance(entry.angle, ports[(index + rotation) % ports.length].angle),
        0
      ),
    }));
    const bestRotation = rotations.sort((left, right) => left.score - right.score || left.rotation - right.rotation)[0]
      .rotation;
    return new Map(entries.map((entry, index) => [entry.site.id, ports[(index + bestRotation) % ports.length].index]));
  }

  let best = null;
  function assign(entryIndex, usedPorts, assignments, score) {
    if (best && score > best.score + 0.000001) return;
    if (entryIndex >= entries.length) {
      const key = assignments.join(":");
      if (!best || score < best.score - 0.000001 || (Math.abs(score - best.score) <= 0.000001 && key < best.key)) {
        best = { assignments: [...assignments], key, score };
      }
      return;
    }
    ports.forEach((port) => {
      if (usedPorts.has(port.index)) return;
      usedPorts.add(port.index);
      assignments.push(port.index);
      assign(entryIndex + 1, usedPorts, assignments, score + angularDistance(entries[entryIndex].angle, port.angle));
      assignments.pop();
      usedPorts.delete(port.index);
    });
  }
  assign(0, new Set(), [], 0);
  return new Map(entries.map((entry, index) => [entry.site.id, best.assignments[index]]));
}

function alternateOctilinearPath(start, end) {
  const deltaX = end.x - start.x;
  const deltaY = end.y - start.y;
  const absoluteX = Math.abs(deltaX);
  const absoluteY = Math.abs(deltaY);
  const points = [start];

  if (Math.abs(absoluteX - absoluteY) > 0.001) {
    if (absoluteX > absoluteY) {
      points.push({
        x: start.x + Math.sign(deltaX) * absoluteY,
        y: end.y,
      });
    } else {
      points.push({
        x: end.x,
        y: start.y + Math.sign(deltaY) * absoluteX,
      });
    }
  }

  points.push(end);
  return simplifyPath(points);
}

function nonRootRouteCandidates(start, end, mapGrid) {
  const candidates = [
    octilinearPath(start, end),
    alternateOctilinearPath(start, end),
    simplifyPath([start, { x: end.x, y: start.y }, end]),
    simplifyPath([start, { x: start.x, y: end.y }, end]),
  ];
  const maximumOffset = Math.ceil(Math.max(mapGrid.width, mapGrid.height) / mapGrid.cellSize);

  for (let offsetCells = 4; offsetCells <= maximumOffset; offsetCells += 4) {
    const offset = offsetCells * mapGrid.cellSize;
    [Math.min(start.y, end.y) - offset, Math.max(start.y, end.y) + offset].forEach((laneY) => {
      candidates.push(simplifyPath([start, { x: start.x, y: laneY }, { x: end.x, y: laneY }, end]));
    });
    [Math.min(start.x, end.x) - offset, Math.max(start.x, end.x) + offset].forEach((laneX) => {
      candidates.push(simplifyPath([start, { x: laneX, y: start.y }, { x: laneX, y: end.y }, end]));
    });
  }

  const unique = new Map();
  candidates.forEach((candidate) => {
    const key = candidate.map((point) => `${point.x},${point.y}`).join("|");
    if (!unique.has(key)) unique.set(key, candidate);
  });
  return [...unique.values()];
}

function routeCandidateConflicts(candidate, siteIds, routedRoutes, positions, mapGrid) {
  let conflicts = 0;
  const endpointIds = new Set(siteIds);

  candidate.forEach((point) => {
    if (point.x < 20 || point.y < 20 || point.x > mapGrid.width - 20 || point.y > mapGrid.height - 20) {
      conflicts += 1;
    }
  });

  for (let index = 1; index < candidate.length; index += 1) {
    const start = candidate[index - 1];
    const end = candidate[index];

    positions.forEach((station, stationId) => {
      if (endpointIds.has(stationId)) return;
      if (pointToSegmentDistance(station, start, end) < 22) conflicts += 1;
    });

    routedRoutes.forEach((route) => {
      const sharedIds = siteIds.filter((siteId) => route.siteIds.includes(siteId));
      const allowedPoints = sharedIds.map((siteId) => positions.get(siteId));
      for (let routeIndex = 1; routeIndex < route.points.length; routeIndex += 1) {
        const intersection = pixelSegmentIntersection(
          start,
          end,
          route.points[routeIndex - 1],
          route.points[routeIndex]
        );
        if (!intersection) continue;
        const allowed =
          intersection.type === "point" && allowedPoints.some((point) => pixelPointsEqual(point, intersection.point));
        if (!allowed && intersection.type === "overlap") conflicts += 1;
      }
    });
  }

  return conflicts;
}

function routeCandidateCrossings(candidate, siteIds, routedRoutes, positions) {
  let crossings = 0;
  for (let index = 1; index < candidate.length; index += 1) {
    const start = candidate[index - 1];
    const end = candidate[index];
    routedRoutes.forEach((route) => {
      const sharedIds = siteIds.filter((siteId) => route.siteIds.includes(siteId));
      const allowedPoints = sharedIds.map((siteId) => positions.get(siteId));
      for (let routeIndex = 1; routeIndex < route.points.length; routeIndex += 1) {
        const intersection = pixelSegmentIntersection(
          start,
          end,
          route.points[routeIndex - 1],
          route.points[routeIndex]
        );
        if (!intersection || intersection.type !== "point") continue;
        const allowed = allowedPoints.some((point) => pixelPointsEqual(point, intersection.point));
        if (!allowed) crossings += 1;
      }
    });
  }
  return crossings;
}

function routePathScore(points) {
  const length = points.reduce(
    (total, point, index) =>
      index === 0 ? total : total + Math.hypot(point.x - points[index - 1].x, point.y - points[index - 1].y),
    0
  );
  return length + Math.max(0, points.length - 2) * 30;
}

function gridRouteCandidate(start, end, siteIds, routedRoutes, positions, mapGrid, forbiddenPoints = []) {
  const cellSize = mapGrid.cellSize;
  const startCell = { x: Math.round(start.x / cellSize), y: Math.round(start.y / cellSize) };
  const endCell = { x: Math.round(end.x / cellSize), y: Math.round(end.y / cellSize) };
  const maximumX = Math.floor((mapGrid.width - 20) / cellSize);
  const maximumY = Math.floor((mapGrid.height - 20) / cellSize);
  const minimumCell = Math.ceil(20 / cellSize);
  const forbiddenKeys = new Set(
    forbiddenPoints.map((point) => `${Math.round(point.x / cellSize)},${Math.round(point.y / cellSize)}`)
  );
  const stateKey = (x, y, direction) => `${x},${y},${direction}`;
  const pointKey = (x, y) => `${x},${y}`;
  const heuristic = (x, y) => {
    const deltaX = Math.abs(endCell.x - x);
    const deltaY = Math.abs(endCell.y - y);
    return Math.max(deltaX, deltaY) + (Math.SQRT2 - 1) * Math.min(deltaX, deltaY);
  };
  const startKey = stateKey(startCell.x, startCell.y, -1);
  const open = [];
  const bestCost = new Map([[startKey, 0]]);
  const parent = new Map();
  const states = new Map([[startKey, { ...startCell, direction: -1 }]]);
  heapPush(open, { key: startKey, priority: heuristic(startCell.x, startCell.y) });

  while (open.length > 0) {
    const currentEntry = heapPop(open);
    const current = states.get(currentEntry.key);
    const currentCost = bestCost.get(currentEntry.key);
    if (current.x === endCell.x && current.y === endCell.y) {
      const points = [];
      let key = currentEntry.key;
      while (key) {
        const state = states.get(key);
        points.push({ x: state.x * cellSize, y: state.y * cellSize });
        key = parent.get(key);
      }
      return simplifyPath(points.reverse());
    }

    GRID_ROUTE_DIRECTIONS.forEach((direction, directionIndex) => {
      const nextX = current.x + direction.x;
      const nextY = current.y + direction.y;
      if (nextX < minimumCell || nextY < minimumCell || nextX > maximumX || nextY > maximumY) return;
      if (forbiddenKeys.has(pointKey(nextX, nextY)) && (nextX !== endCell.x || nextY !== endCell.y)) return;
      const currentPoint = { x: current.x * cellSize, y: current.y * cellSize };
      const nextPoint = { x: nextX * cellSize, y: nextY * cellSize };
      if (routeCandidateConflicts([currentPoint, nextPoint], siteIds, routedRoutes, positions, mapGrid) > 0) return;

      const bendCost = current.direction === -1 || current.direction === directionIndex ? 0 : 0.4;
      const nextCost = currentCost + direction.cost + bendCost;
      const nextKey = stateKey(nextX, nextY, directionIndex);
      if (nextCost >= (bestCost.get(nextKey) ?? Number.POSITIVE_INFINITY) - 0.000001) return;
      bestCost.set(nextKey, nextCost);
      parent.set(nextKey, currentEntry.key);
      states.set(nextKey, { x: nextX, y: nextY, direction: directionIndex });
      heapPush(open, { key: nextKey, priority: nextCost + heuristic(nextX, nextY) });
    });
  }

  return null;
}

function collisionFreeRouteOptions(candidates, siteIds, routedRoutes, positions, mapGrid) {
  return candidates
    .map((points, index) => {
      const crossings = routeCandidateCrossings(points, siteIds, routedRoutes, positions);
      return {
        points,
        index,
        conflicts: routeCandidateConflicts(points, siteIds, routedRoutes, positions, mapGrid),
        crossings,
        score: routePathScore(points) + crossings * 10000,
      };
    })
    .filter((candidate) => candidate.conflicts === 0)
    .sort(
      (leftCandidate, rightCandidate) =>
        leftCandidate.score - rightCandidate.score || leftCandidate.index - rightCandidate.index
    );
}

function routePath(left, right, positions, rootPortState, routedRoutes, mapGrid) {
  const owner = routeOwner(left, right);
  const other = owner.id === left.id ? right : left;
  const start = positions.get(owner.id);
  const end = positions.get(other.id);
  if (other.id !== ROOT_SITE_ID && owner.id !== ROOT_SITE_ID) {
    const siteIds = [left.id, right.id];
    const viable = collisionFreeRouteOptions(
      nonRootRouteCandidates(start, end, mapGrid),
      siteIds,
      routedRoutes,
      positions,
      mapGrid
    );
    if (viable.length > 0) return viable[0].points;
    const gridRoute = gridRouteCandidate(start, end, siteIds, routedRoutes, positions, mapGrid);
    if (gridRoute) return gridRoute;
    throw new Error(`Unable to route ${left.id} to ${right.id} without a collision.`);
  }

  const nonRootId = owner.id === ROOT_SITE_ID ? other.id : owner.id;
  const nonRootStart = positions.get(nonRootId);
  const center = positions.get(ROOT_SITE_ID);
  const stationAngle = Math.atan2(nonRootStart.y - center.y, nonRootStart.x - center.x);
  const preferredPortIndex = rootPortState.preferred.get(nonRootId);
  const portChoices = rootPortState.ports
    .filter((port) => !rootPortState.used.has(port.index))
    .map((port) => {
      const candidates = nonRootRouteCandidates(nonRootStart, port.point, mapGrid).map((points) =>
        simplifyPath([...points, center])
      );
      let viable = collisionFreeRouteOptions(candidates, [ROOT_SITE_ID, nonRootId], routedRoutes, positions, mapGrid);
      if (viable.length === 0) {
        const gridApproach = gridRouteCandidate(
          nonRootStart,
          port.point,
          [ROOT_SITE_ID, nonRootId],
          routedRoutes,
          positions,
          mapGrid,
          [center]
        );
        if (gridApproach) {
          const fullRoute = simplifyPath([...gridApproach, center]);
          if (routeCandidateConflicts(fullRoute, [ROOT_SITE_ID, nonRootId], routedRoutes, positions, mapGrid) === 0) {
            viable = [{ points: fullRoute, score: routePathScore(fullRoute), index: candidates.length }];
          }
        }
      }
      if (viable.length === 0) return null;
      return {
        port,
        points: viable[0].points,
        score:
          viable[0].score +
          angularDistance(stationAngle, port.angle) * 180 +
          (port.index === preferredPortIndex ? 0 : 1000000),
      };
    })
    .filter(Boolean)
    .sort(
      (leftChoice, rightChoice) =>
        leftChoice.score - rightChoice.score || leftChoice.port.index - rightChoice.port.index
    );
  if (portChoices.length === 0) {
    throw new Error(`Unable to route ${nonRootId} to ${ROOT_SITE_ID} without a collision.`);
  }
  rootPortState.used.add(portChoices[0].port.index);
  return portChoices[0].points;
}

function deriveOverpasses(routes, positions, cellSize) {
  const overpasses = new Map();

  routes.forEach((underRoute, underIndex) => {
    routes.slice(underIndex + 1).forEach((overRoute) => {
      const sharedIds = underRoute.siteIds.filter((siteId) => overRoute.siteIds.includes(siteId));
      const allowedPoints = sharedIds.map((siteId) => positions.get(siteId));

      for (let underSegment = 1; underSegment < underRoute.points.length; underSegment += 1) {
        for (let overSegment = 1; overSegment < overRoute.points.length; overSegment += 1) {
          const overStart = overRoute.points[overSegment - 1];
          const overEnd = overRoute.points[overSegment];
          const intersection = pixelSegmentIntersection(
            underRoute.points[underSegment - 1],
            underRoute.points[underSegment],
            overStart,
            overEnd
          );
          if (!intersection) continue;
          const allowed =
            intersection.type === "point" && allowedPoints.some((point) => pixelPointsEqual(point, intersection.point));
          if (allowed) continue;
          if (intersection.type === "overlap") {
            throw new Error(`${underRoute.id} and ${overRoute.id} contain an ambiguous route overlap.`);
          }

          const deltaX = overEnd.x - overStart.x;
          const deltaY = overEnd.y - overStart.y;
          const length = Math.hypot(deltaX, deltaY) || 1;
          const unitX = deltaX / length;
          const unitY = deltaY / length;
          const key = `${overRoute.id}:${intersection.point.x.toFixed(3)},${intersection.point.y.toFixed(3)}`;
          if (overpasses.has(key)) continue;
          overpasses.set(key, {
            id: `overpass-${overpasses.size + 1}`,
            routeId: overRoute.id,
            routeIds: [underRoute.id, overRoute.id],
            siteIds: [...new Set([...underRoute.siteIds, ...overRoute.siteIds])],
            color: overRoute.color,
            point: toGridPoint(intersection.point, cellSize),
            from: toGridPoint({ x: intersection.point.x - unitX * 9, y: intersection.point.y - unitY * 9 }, cellSize),
            to: toGridPoint({ x: intersection.point.x + unitX * 9, y: intersection.point.y + unitY * 9 }, cellSize),
          });
        }
      }
    });
  });

  return [...overpasses.values()];
}

function edgeLine(left, right) {
  if (left.map?.line === right.map?.line) return left.map.line;
  if (left.id === ROOT_SITE_ID) return right.map?.line || right.line || "core";
  if (right.id === ROOT_SITE_ID) return left.map?.line || left.line || "core";
  return compareSites(left, right) <= 0
    ? right.map?.line || right.line || "core"
    : left.map?.line || left.line || "core";
}

function routeOwner(left, right) {
  if (left.id === ROOT_SITE_ID) return right;
  if (right.id === ROOT_SITE_ID) return left;
  if (left.internal !== right.internal) return left.internal ? left : right;
  return compareSites(left, right) <= 0 ? right : left;
}

function hubSpokeEdges(hubOrder, siteById) {
  const root = siteById.get(ROOT_SITE_ID);
  return hubOrder.filter((siteId) => siteId !== ROOT_SITE_ID).map((siteId) => [root, siteById.get(siteId)]);
}

export {
  ROOT_SITE_ID,
  compareSites,
  deriveOverpasses,
  edgeLine,
  hubSpokeEdges,
  preferredRootPorts,
  rootPortOptions,
  routeOwner,
  routePath,
};
