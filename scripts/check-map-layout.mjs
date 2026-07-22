import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { XJK_SITES } from "../sites/shared/xjk-core/site-registry.js";
import {
  HUB_LAYOUT,
  HUB_ORDER,
  HUB_ROUTES,
  INTERNAL_HUB_IDS,
  INACTIVE_NODES,
  INACTIVE_ROUTES,
  JUNCTIONS,
  MAP_GRID,
  OVERPASSES,
  computeMapLayout,
  gridPointOnRoutes,
  gridPointOnSegment,
} from "../sites/xjk.yt/frontend/map-layout.js";

const EXPECTED_DEFAULT_STATION_IDS = Object.freeze(
  XJK_SITES.filter(
    (site) => site.id === "xjk" || (!site.internal && site.hub?.visible === true) || site.id === "admin"
  ).map((site) => site.id)
);
const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const adminApp = fs.readFileSync(path.join(repoRoot, "sites/admin.xjk.yt/frontend/app.js"), "utf8");
assert.match(
  adminApp,
  /label:\s*`Default \/ \$\{MAP_GRID\.width\} x \$\{MAP_GRID\.height\} \/ \$\{MAP_GRID\.cellSize\}`[\s\S]*?\.\.\.MAP_GRID/,
  "map admin default resolution must derive from the generated map grid"
);

function sorted(values) {
  return [...values].sort((left, right) => String(left).localeCompare(String(right)));
}

function edgeKey(siteIds) {
  return sorted(siteIds).join("::");
}

function pointKey(point) {
  return `${Number(point?.[0])},${Number(point?.[1])}`;
}

function pointsEqual(left, right, tolerance = 0.001) {
  return Math.abs(left[0] - right[0]) <= tolerance && Math.abs(left[1] - right[1]) <= tolerance;
}

function boxOverlap(left, right) {
  return (
    Math.min(left[2], right[2]) - Math.max(left[0], right[0]) > 0.000001 &&
    Math.min(left[3], right[3]) - Math.max(left[1], right[1]) > 0.000001
  );
}

function pointOnSegment(point, start, end) {
  const cross = (point[0] - start[0]) * (end[1] - start[1]) - (point[1] - start[1]) * (end[0] - start[0]);
  return (
    Math.abs(cross) <= 0.000001 &&
    point[0] >= Math.min(start[0], end[0]) - 0.000001 &&
    point[0] <= Math.max(start[0], end[0]) + 0.000001 &&
    point[1] >= Math.min(start[1], end[1]) - 0.000001 &&
    point[1] <= Math.max(start[1], end[1]) + 0.000001
  );
}

function segmentIntersection(leftStart, leftEnd, rightStart, rightEnd) {
  const leftVector = [leftEnd[0] - leftStart[0], leftEnd[1] - leftStart[1]];
  const rightVector = [rightEnd[0] - rightStart[0], rightEnd[1] - rightStart[1]];
  const offset = [rightStart[0] - leftStart[0], rightStart[1] - leftStart[1]];
  const denominator = leftVector[0] * rightVector[1] - leftVector[1] * rightVector[0];

  if (Math.abs(denominator) <= 0.000001) {
    const collinear = Math.abs(offset[0] * leftVector[1] - offset[1] * leftVector[0]) <= 0.000001;
    if (!collinear) return null;
    const sharedPoints = [leftStart, leftEnd, rightStart, rightEnd].filter(
      (point, index, points) =>
        pointOnSegment(point, leftStart, leftEnd) &&
        pointOnSegment(point, rightStart, rightEnd) &&
        points.findIndex((candidate) => pointsEqual(candidate, point)) === index
    );
    if (sharedPoints.length === 0) return null;
    return {
      type: sharedPoints.length > 1 ? "overlap" : "point",
      point: sharedPoints[0],
    };
  }

  const leftRatio = (offset[0] * rightVector[1] - offset[1] * rightVector[0]) / denominator;
  const rightRatio = (offset[0] * leftVector[1] - offset[1] * leftVector[0]) / denominator;
  if (leftRatio < -0.000001 || leftRatio > 1.000001 || rightRatio < -0.000001 || rightRatio > 1.000001) {
    return null;
  }

  return {
    type: "point",
    point: [leftStart[0] + leftRatio * leftVector[0], leftStart[1] + leftRatio * leftVector[1]],
  };
}

function exportedLayoutSnapshot() {
  return {
    MAP_GRID,
    OVERPASSES,
    INTERNAL_HUB_IDS,
    HUB_ORDER,
    HUB_LAYOUT,
    HUB_ROUTES,
    JUNCTIONS,
    INACTIVE_ROUTES,
    INACTIVE_NODES,
  };
}

function expectedHubSpokes(eligibleIds) {
  return new Set(eligibleIds.filter((siteId) => siteId !== "xjk").map((siteId) => edgeKey(["xjk", siteId])));
}

function assertDeterministicLayout() {
  const first = computeMapLayout();
  const second = computeMapLayout();
  assert.deepEqual(second, first, "map layout output changed across identical runs");
  assert.deepEqual(exportedLayoutSnapshot(), first, "exported map constants differ from the default generated layout");

  const reversedRegistry = computeMapLayout([...XJK_SITES].reverse());
  assert.deepEqual(
    reversedRegistry,
    first,
    "map layout depends on registry array order instead of canonical site ordering"
  );

  return first;
}

function assertExpectedStations(layout) {
  assert.deepEqual(
    sorted(layout.HUB_ORDER),
    sorted(EXPECTED_DEFAULT_STATION_IDS),
    "default map station IDs do not match the registry-driven home-map contract"
  );
  assert.equal(new Set(layout.HUB_ORDER).size, layout.HUB_ORDER.length, "map contains duplicate station IDs");
  assert.deepEqual(
    sorted(Object.keys(layout.HUB_LAYOUT)),
    sorted(layout.HUB_ORDER),
    "HUB_LAYOUT keys do not exactly match HUB_ORDER"
  );

  assert.ok(layout.HUB_ORDER.includes("cotd"), "COTD must be present on the public home map");
  assert.ok(!layout.HUB_ORDER.includes("account"), "Account is represented by the central xjk station");
  assert.ok(!layout.HUB_ORDER.includes("dash"), "Dash must not appear in the default internal station set");
  assert.ok(layout.HUB_ORDER.includes("admin"), "Admin must be included in the generated internal layout");

  const admin = XJK_SITES.find((site) => site.id === "admin");
  assert.equal(admin?.internal, true, "Admin registry entry must remain internal");
}

function assertUniqueInBoundsStations(layout) {
  const { width, height, cellSize } = layout.MAP_GRID;
  assert.ok(Number.isFinite(width) && width > 0, "map grid width must be positive and finite");
  assert.ok(Number.isFinite(height) && height > 0, "map grid height must be positive and finite");
  assert.ok(Number.isFinite(cellSize) && cellSize > 0, "map grid cell size must be positive and finite");

  const occupied = new Map();
  layout.HUB_ORDER.forEach((siteId) => {
    const point = layout.HUB_LAYOUT[siteId]?.station;
    assert.ok(Array.isArray(point) && point.length === 2, `${siteId} station must be an [x, y] pair`);
    assert.ok(point.every(Number.isFinite), `${siteId} station contains a non-finite coordinate`);

    const key = pointKey(point);
    assert.ok(!occupied.has(key), `${siteId} shares station ${key} with ${occupied.get(key)}`);
    occupied.set(key, siteId);

    const radius = siteId === "xjk" ? 34 : 22;
    const pixelX = point[0] * cellSize;
    const pixelY = point[1] * cellSize;
    assert.ok(pixelX - radius >= 0, `${siteId} station glow crosses the left map bound`);
    assert.ok(pixelX + radius <= width, `${siteId} station glow crosses the right map bound`);
    assert.ok(pixelY - radius >= 0, `${siteId} station glow crosses the top map bound`);
    assert.ok(pixelY + radius <= height, `${siteId} station glow crosses the bottom map bound`);
  });
}

function assertCollisionFreeLabels(layout, context = "map") {
  const gridWidth = layout.MAP_GRID.width / layout.MAP_GRID.cellSize;
  const gridHeight = layout.MAP_GRID.height / layout.MAP_GRID.cellSize;
  const entries = layout.HUB_ORDER.map((siteId) => {
    const bounds = layout.HUB_LAYOUT[siteId]?.labelBounds;
    assert.ok(Array.isArray(bounds) && bounds.length === 4, `${siteId} needs generated label bounds`);
    assert.ok(bounds.every(Number.isFinite), `${siteId} label bounds contain a non-finite value`);
    assert.ok(bounds[0] >= 0 && bounds[1] >= 0, `${siteId} label leaves the top/left ${context} bounds`);
    assert.ok(bounds[2] <= gridWidth && bounds[3] <= gridHeight, `${siteId} label leaves the ${context} bounds`);
    assert.ok(bounds[0] < bounds[2] && bounds[1] < bounds[3], `${siteId} label bounds are inverted`);
    return { siteId, bounds };
  });

  entries.forEach((left, leftIndex) => {
    entries.slice(leftIndex + 1).forEach((right) => {
      assert.equal(
        boxOverlap(left.bounds, right.bounds),
        false,
        `${left.siteId} and ${right.siteId} labels overlap in ${context}`
      );
    });

    layout.HUB_ORDER.forEach((stationId) => {
      const station = layout.HUB_LAYOUT[stationId].station;
      const radius = (stationId === "xjk" ? 34 : 22) / layout.MAP_GRID.cellSize;
      const stationBounds = [station[0] - radius, station[1] - radius, station[0] + radius, station[1] + radius];
      assert.equal(
        boxOverlap(left.bounds, stationBounds),
        false,
        `${left.siteId} label overlaps ${stationId} station in ${context}`
      );
    });
  });
}

function assertRoutesAreUnambiguous(layout, context = "map") {
  const matchedOverpasses = new Set();
  layout.HUB_ROUTES.forEach((leftRoute, leftRouteIndex) => {
    layout.HUB_ROUTES.slice(leftRouteIndex + 1).forEach((rightRoute) => {
      const sharedSiteIds = leftRoute.siteIds.filter((siteId) => rightRoute.siteIds.includes(siteId));
      const allowedPoints = sharedSiteIds.map((siteId) => layout.HUB_LAYOUT[siteId].station);

      for (let leftIndex = 1; leftIndex < leftRoute.points.length; leftIndex += 1) {
        for (let rightIndex = 1; rightIndex < rightRoute.points.length; rightIndex += 1) {
          const intersection = segmentIntersection(
            leftRoute.points[leftIndex - 1],
            leftRoute.points[leftIndex],
            rightRoute.points[rightIndex - 1],
            rightRoute.points[rightIndex]
          );
          if (!intersection) continue;
          const allowedEndpoint =
            intersection.type === "point" && allowedPoints.some((point) => pointsEqual(point, intersection.point));
          if (allowedEndpoint) continue;
          assert.notEqual(
            intersection.type,
            "overlap",
            `${leftRoute.id} and ${rightRoute.id} overlap ambiguously in ${context}`
          );
          const overpassIndex = layout.OVERPASSES.findIndex(
            (overpass) =>
              overpass.routeIds.includes(leftRoute.id) &&
              overpass.routeIds.includes(rightRoute.id) &&
              pointsEqual(overpass.point, intersection.point)
          );
          assert.ok(
            overpassIndex >= 0,
            `${leftRoute.id} and ${rightRoute.id} have an unmarked crossing at ${pointKey(intersection.point)} in ${context}`
          );
          matchedOverpasses.add(overpassIndex);
        }
      }
    });
  });
  assert.equal(matchedOverpasses.size, layout.OVERPASSES.length, `${context} contains a stale route overpass marker`);
}

function assertStarTopology(layout, context = "map") {
  assert.equal(
    layout.HUB_ROUTES.length,
    layout.HUB_ORDER.length - 1,
    `${context} must have exactly one xjk spoke per non-root station`
  );
  const routeCountByHub = new Map(layout.HUB_ORDER.filter((siteId) => siteId !== "xjk").map((siteId) => [siteId, 0]));
  layout.HUB_ROUTES.forEach((route) => {
    assert.equal(route.siteIds.length, 2, `${route.id} must have exactly two endpoints in ${context}`);
    assert.equal(
      route.siteIds.filter((siteId) => siteId === "xjk").length,
      1,
      `${route.id} must connect to xjk exactly once in ${context}`
    );
    const destinationId = route.siteIds.find((siteId) => siteId !== "xjk");
    assert.equal(route.hubId, destinationId, `${route.id} has the wrong destination owner in ${context}`);
    assert.ok(routeCountByHub.has(destinationId), `${route.id} targets an unknown hub in ${context}`);
    routeCountByHub.set(destinationId, routeCountByHub.get(destinationId) + 1);
  });
  routeCountByHub.forEach((count, siteId) => {
    assert.equal(count, 1, `${siteId} must have exactly one direct xjk spoke in ${context}`);
  });
  assert.deepEqual(
    layout.JUNCTIONS,
    layout.HUB_ROUTES.length > 1 ? [{ point: layout.HUB_LAYOUT.xjk.station, important: true }] : [],
    `${context} must only expose xjk as the generated junction`
  );
}

function assertCanonicalRoutes(layout) {
  assertStarTopology(layout);
  const eligibleIds = new Set(EXPECTED_DEFAULT_STATION_IDS);
  const expectedEdges = expectedHubSpokes([...eligibleIds]);
  const actualEdges = new Map();

  layout.HUB_ROUTES.forEach((route) => {
    assert.ok(Array.isArray(route.siteIds) && route.siteIds.length === 2, `${route.id} must name exactly two sites`);
    assert.notEqual(route.siteIds[0], route.siteIds[1], `${route.id} cannot connect a site to itself`);
    route.siteIds.forEach((siteId) => {
      assert.ok(eligibleIds.has(siteId), `${route.id} references ineligible station ${siteId}`);
    });
    assert.ok(route.siteIds.includes(route.hubId), `${route.id} owner ${route.hubId} is not one of its endpoint sites`);
    assert.ok(route.siteIds.includes("xjk"), `${route.id} must connect directly to xjk`);
    assert.notEqual(route.hubId, "xjk", `${route.id} must be owned by its destination hub`);
    const destinationSite = XJK_SITES.find((site) => site.id === route.hubId);
    assert.equal(route.lineId, destinationSite?.map?.line, `${route.id} has the wrong destination line metadata`);
    assert.equal(route.color, destinationSite?.accent, `${route.id} must use its destination hub accent`);

    const key = edgeKey(route.siteIds);
    assert.ok(!actualEdges.has(key), `registry edge ${key} has more than one generated route`);
    actualEdges.set(key, route);

    const canonicalId = `${route.lineId}-${sorted(route.siteIds).join("-")}`;
    assert.equal(route.id, canonicalId, `${route.id} is not the canonical route ID for ${key}`);

    assert.ok(Array.isArray(route.points) && route.points.length >= 2, `${route.id} needs at least two route points`);
    route.points.forEach((point, index) => {
      assert.ok(Array.isArray(point) && point.length === 2, `${route.id} point ${index} must be an [x, y] pair`);
      assert.ok(point.every(Number.isFinite), `${route.id} point ${index} contains a non-finite coordinate`);
      if (index > 0) {
        assert.notEqual(
          pointKey(point),
          pointKey(route.points[index - 1]),
          `${route.id} contains duplicate consecutive route points at index ${index}`
        );
        const previous = route.points[index - 1];
        const deltaX = Math.abs(point[0] - previous[0]);
        const deltaY = Math.abs(point[1] - previous[1]);
        const isCenterApproach = route.siteIds.includes("xjk") && pointsEqual(point, layout.HUB_LAYOUT.xjk.station);
        assert.ok(
          isCenterApproach || deltaX <= 0.000001 || deltaY <= 0.000001 || Math.abs(deltaX - deltaY) <= 0.000001,
          `${route.id} segment ${index - 1} is not horizontal, vertical, or 45 degrees`
        );
      }
    });

    const endpointKeys = new Set([pointKey(route.points[0]), pointKey(route.points.at(-1))]);
    const stationKeys = new Set(route.siteIds.map((siteId) => pointKey(layout.HUB_LAYOUT[siteId].station)));
    assert.deepEqual(endpointKeys, stationKeys, `${route.id} endpoints do not land on both connected stations`);

    assert.ok(Object.hasOwn(route, "stops"), `${route.id} must explicitly declare bend stops`);
    assert.deepEqual(route.stops, [], `${route.id} generated bends must not become semantic stops`);

    layout.HUB_ORDER.filter((siteId) => !route.siteIds.includes(siteId)).forEach((siteId) => {
      const station = layout.HUB_LAYOUT[siteId].station;
      const crossesStation = route.points.some(
        (point, index) => index > 0 && pointOnSegment(station, route.points[index - 1], point)
      );
      assert.equal(crossesStation, false, `${route.id} passes through unrelated station ${siteId}`);
    });
  });

  assert.deepEqual(
    sorted(actualEdges.keys()),
    sorted(expectedEdges),
    "generated routes do not map one-to-one from each hub directly to xjk"
  );
}

function assertStablePublicLayout(defaultLayout) {
  const withoutAdmin = computeMapLayout(XJK_SITES, { internalSiteIds: [] });
  const publicIds = EXPECTED_DEFAULT_STATION_IDS.filter((siteId) => siteId !== "admin");

  assert.deepEqual(
    sorted(withoutAdmin.HUB_ORDER),
    sorted(publicIds),
    "disabling internal stations changed the public station set"
  );
  assert.ok(!withoutAdmin.HUB_ORDER.includes("admin"), "internalSiteIds: [] must omit Admin");
  assertStarTopology(withoutAdmin, "public-only map");

  publicIds.forEach((siteId) => {
    assert.deepEqual(
      withoutAdmin.HUB_LAYOUT[siteId],
      defaultLayout.HUB_LAYOUT[siteId],
      `${siteId} layout moved when Admin was omitted`
    );
  });

  const publicEdges = expectedHubSpokes(publicIds);
  const defaultPublicRoutes = defaultLayout.HUB_ROUTES.filter((route) => publicEdges.has(edgeKey(route.siteIds))).map(
    (route) => edgeKey(route.siteIds)
  );
  assert.deepEqual(
    sorted(withoutAdmin.HUB_ROUTES.map((route) => edgeKey(route.siteIds))),
    sorted(defaultPublicRoutes),
    "public route topology changed when Admin was omitted"
  );
  assertRoutesAreUnambiguous(withoutAdmin, "public-only map");
}

function registryWithSyntheticHub() {
  const syntheticId = "future-laboratory";
  const registry = [...XJK_SITES];

  registry.push({
    id: syntheticId,
    label: "Future Laboratory With A Very Long Name",
    public: true,
    internal: false,
    line: "utilities",
    accent: "#8b5cf6",
    summary: "averyveryveryveryverylongtoken.example future automatically positioned experiments",
    hub: { visible: true, order: 110 },
    map: {
      line: "utilities",
      order: 110,
    },
  });

  return registry;
}

function assertFutureRegistryAddition() {
  const registry = registryWithSyntheticHub();
  const layout = computeMapLayout(registry);
  assertStarTopology(layout, "future-addition map");
  assert.ok(layout.HUB_ORDER.includes("future-laboratory"), "new visible registry hub was not positioned");
  assertCollisionFreeLabels(layout, "future-addition map");
  assertRoutesAreUnambiguous(layout, "future-addition map");

  const visual = layout.HUB_LAYOUT["future-laboratory"];
  assert.ok(visual.displayLabel.length <= 20, "long generated station title was not bounded");
  visual.description.forEach((line) => {
    assert.ok(line.length <= 24, "long generated description token was not bounded");
  });

  const missingTopology = registry.map((site) =>
    site.id === "future-laboratory" ? { ...site, map: undefined } : site
  );
  assert.throws(
    () => computeMapLayout(missingTopology),
    /missing generated layout metadata/,
    "visible registry hubs without generated layout metadata must fail layout generation"
  );

  const bridgeId = "future-bridge";
  const bridgeRegistry = [...XJK_SITES];
  bridgeRegistry.push({
    id: bridgeId,
    label: "Future Bridge",
    public: true,
    internal: false,
    line: "community",
    accent: "#ffffff",
    summary: "Cross-network future bridge",
    hub: { visible: true, order: 35 },
    map: {
      line: "community",
      order: 35,
    },
  });
  const bridgeLayout = computeMapLayout(bridgeRegistry);
  assertStarTopology(bridgeLayout, "future-bridge map");
  assertCollisionFreeLabels(bridgeLayout, "future-bridge map");
  assertRoutesAreUnambiguous(bridgeLayout, "future-bridge map");

  const directIds = ["future-direct-a", "future-direct-b"];
  const highDegreeRegistry = [...XJK_SITES];
  directIds.forEach((siteId, index) => {
    highDegreeRegistry.push({
      id: siteId,
      label: `Future Direct ${index + 1}`,
      public: true,
      internal: false,
      line: "utilities",
      accent: "#a855f7",
      summary: "Future direct xjk connection",
      hub: { visible: true, order: 120 + index },
      map: {
        line: "utilities",
        order: 120 + index,
      },
    });
  });
  const highDegreeLayout = computeMapLayout(highDegreeRegistry);
  assertStarTopology(highDegreeLayout, "high-degree map");
  assertCollisionFreeLabels(highDegreeLayout, "nine-lane root map");
  assertRoutesAreUnambiguous(highDegreeLayout, "nine-lane root map");

  for (let additionCount = 1; additionCount <= 9; additionCount += 1) {
    const chainIds = Array.from({ length: additionCount }, (_, index) => `future-chain-${index}`);
    const chainRegistry = [...XJK_SITES];
    chainIds.forEach((siteId, index) => {
      chainRegistry.push({
        id: siteId,
        label: `Future Chain ${index + 1}`,
        public: true,
        internal: false,
        line: "utilities",
        accent: "#a855f7",
        summary: "Automatically positioned future chain station",
        hub: { visible: true, order: 140 + index },
        map: {
          line: "utilities",
          order: 140 + index,
        },
      });
    });
    const chainLayout = computeMapLayout(chainRegistry);
    assertStarTopology(chainLayout, `${additionCount}-station growth map`);
    assertCollisionFreeLabels(chainLayout, `${additionCount}-station growth map`);
  }
}

function assertAdminPreviewCompatibility() {
  const adminGeometry = fs.readFileSync(
    new URL("../sites/admin.xjk.yt/frontend/modules/geometry.js", import.meta.url),
    "utf8"
  );
  const adminRendering = fs.readFileSync(
    new URL("../sites/admin.xjk.yt/frontend/modules/rendering.js", import.meta.url),
    "utf8"
  );
  assert.doesNotMatch(
    [adminApp, adminGeometry, adminRendering].join("\n"),
    /fetch\(["']\/api\/admin\/map-layout/,
    "Admin must not overwrite the registry-driven map module"
  );
  assert.match(adminGeometry, /route\.stops \?\? route\.points\.slice/, "Admin preview ignores explicit route stops");
  assert.match(adminRendering, /route\.color \|\| colorFor/, "Admin preview ignores generated line colors");
}

function assertRouteLabelMask() {
  const appSource = fs.readFileSync(new URL("../sites/xjk.yt/frontend/app.js", import.meta.url), "utf8");
  assert.match(appSource, /function renderRouteLabelMask\(\)/, "home map is missing its route label mask");
  assert.match(appSource, /HUB_LAYOUT\[site\.id\]\?\.labelBounds/, "route mask is not generated from label bounds");
  assert.match(appSource, /visibleHubSites\(\)\.map/, "route mask does not follow visible stations");
  assert.match(appSource, /maskUnits="userSpaceOnUse"/, "route mask uses unstable object bounds");
  assert.match(
    appSource,
    /class="route-layers" mask="url\(#route-label-mask\)"/,
    "route layers do not use the label mask"
  );
}

const layout = assertDeterministicLayout();
assertExpectedStations(layout);
assertUniqueInBoundsStations(layout);
assertCollisionFreeLabels(layout);
assertCanonicalRoutes(layout);
assertRoutesAreUnambiguous(layout);
assert.equal(layout.OVERPASSES.length, 0, "default registry map should not need route overpasses");
assertStablePublicLayout(layout);
assertFutureRegistryAddition();
assertAdminPreviewCompatibility();
assertRouteLabelMask();
assert.equal(
  gridPointOnSegment([1, 1], [0, 0], [2, 2]),
  true,
  "shared grid geometry should detect a point on a segment"
);
assert.equal(gridPointOnSegment([1, 2], [0, 0], [2, 2]), false, "shared grid geometry should reject off-route points");
assert.equal(
  gridPointOnRoutes(
    [2, 1],
    [
      {
        points: [
          [0, 1],
          [3, 1],
        ],
      },
    ]
  ),
  true,
  "shared grid geometry should detect a point across route segments"
);

console.log(
  `map layout ok: ${layout.HUB_ORDER.length} stations, ${layout.HUB_ROUTES.length} direct xjk spokes, unambiguous and deterministic`
);
