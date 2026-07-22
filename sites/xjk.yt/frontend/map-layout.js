import { SITE_LINES, XJK_SITES } from "../../shared/xjk-core/site-registry.js";
import { deepFreeze, gridPointOnRoutes, gridPointOnSegment, toGridBox, toGridPoint } from "./map-layout/geometry.js";
import {
  boxForLabel,
  chooseLabelPosition,
  labelMetrics,
  stationPositions,
  truncateText,
  wrapDescription,
} from "./map-layout/labels.js";
import {
  ROOT_SITE_ID,
  compareSites,
  deriveOverpasses,
  edgeLine,
  hubSpokeEdges,
  preferredRootPorts,
  rootPortOptions,
  routeOwner,
  routePath,
} from "./map-layout/routing.js";

// The home map is deliberately generated from registry metadata. The registry
// decides which stations exist and provides stable line/order metadata; this
// module places them automatically and gives every destination its own xjk spoke.

const DEFAULT_INTERNAL_SITE_IDS = Object.freeze(["admin"]);
const DEFAULT_MAP_GRID = Object.freeze({
  width: 1080,
  height: 660,
  cellSize: 10,
});

const DEFAULT_LAYOUT_OPTIONS = Object.freeze({
  ringRadiusX: 360,
  ringRadiusY: 220,
  ringStartAngle: -Math.PI * 0.9,
  internalRadiusX: 126,
  internalRadiusY: 82,
  internalStartAngle: Math.PI * 0.22,
  labelMargin: 20,
});

function mapEligibleSites(sites, internalSiteIds) {
  const internalIds = new Set(internalSiteIds);
  return sites.filter(
    (site) =>
      Boolean(site?.map?.line && Number.isFinite(Number(site.map.order))) &&
      (site?.id === ROOT_SITE_ID ||
        (!site?.internal && site?.hub?.visible === true) ||
        (site?.internal && internalIds.has(site.id)))
  );
}

function computeMapLayout(sites = XJK_SITES, customOptions = {}) {
  const mapGrid = {
    ...DEFAULT_MAP_GRID,
    ...(customOptions.mapGrid || {}),
  };
  const options = {
    ...DEFAULT_LAYOUT_OPTIONS,
    ...customOptions,
  };
  const internalSiteIds = customOptions.internalSiteIds || DEFAULT_INTERNAL_SITE_IDS;
  const requestedInternalIds = new Set(internalSiteIds);
  const requestedSites = sites.filter(
    (site) =>
      site?.id === ROOT_SITE_ID ||
      (!site?.internal && site?.hub?.visible === true) ||
      (site?.internal && requestedInternalIds.has(site.id))
  );
  const missingLayoutMetadata = requestedSites
    .filter((site) => !site?.map?.line || !Number.isFinite(Number(site.map.order)))
    .map((site) => site.id);
  if (missingLayoutMetadata.length > 0) {
    throw new Error(`Map sites are missing generated layout metadata: ${missingLayoutMetadata.join(", ")}`);
  }
  const eligibleSites = mapEligibleSites(sites, internalSiteIds);
  const siteById = new Map(eligibleSites.map((site) => [site.id, site]));
  const root = siteById.get(ROOT_SITE_ID);
  if (!root) throw new Error(`Map layout requires the ${ROOT_SITE_ID} registry site.`);

  const publicSites = eligibleSites.filter((site) => site.id !== ROOT_SITE_ID && !site.internal);
  const internalSites = eligibleSites.filter((site) => site.internal).sort(compareSites);
  const extraRingSites = Math.max(0, publicSites.length - 10);
  if (extraRingSites > 0) {
    if (customOptions.mapGrid?.width === undefined) mapGrid.width += extraRingSites * 80;
    if (customOptions.mapGrid?.height === undefined) mapGrid.height += extraRingSites * 40;
    if (customOptions.ringRadiusX === undefined) options.ringRadiusX += extraRingSites * 30;
    if (customOptions.ringRadiusY === undefined) options.ringRadiusY += extraRingSites * 20;
  }
  const ringOrder = [...publicSites].sort(compareSites).map((site) => site.id);
  const internalOrder = internalSites.map((site) => site.id);
  const hubOrder = [ROOT_SITE_ID, ...ringOrder, ...internalOrder];
  const { center, positions } = stationPositions(ringOrder, internalOrder, mapGrid, options, ROOT_SITE_ID);
  const descriptions = new Map(
    eligibleSites.map((site) => [site.id, site.id === ROOT_SITE_ID ? [] : wrapDescription(site.summary)])
  );
  const displayLabels = new Map(eligibleSites.map((site) => [site.id, truncateText(site.label || site.id, 20)]));
  const stationBoxes = hubOrder.map((siteId) => {
    const station = positions.get(siteId);
    const radius = siteId === ROOT_SITE_ID ? 34 : 22;
    return {
      id: siteId,
      box: {
        left: station.x - radius,
        top: station.y - radius,
        right: station.x + radius,
        bottom: station.y + radius,
      },
    };
  });

  const rootLabel = {
    x: center.x + 42,
    y: center.y + 7,
    anchor: "start",
  };
  const rootLabelBox = boxForLabel(
    rootLabel.x,
    rootLabel.y - 18,
    Math.max(32, displayLabels.get(ROOT_SITE_ID).length * 10.5),
    24,
    rootLabel.anchor
  );
  const placedLabelBoxes = [rootLabelBox];
  const layout = {
    [ROOT_SITE_ID]: {
      color: root.accent || SITE_LINES.core.color,
      station: toGridPoint(center, mapGrid.cellSize),
      label: toGridPoint({ x: rootLabel.x, y: rootLabel.y }, mapGrid.cellSize),
      labelBounds: toGridBox(rootLabelBox, mapGrid.cellSize),
      labelAnchor: rootLabel.anchor,
      displayLabel: displayLabels.get(ROOT_SITE_ID),
      description: [],
      central: true,
      minimalLabel: true,
    },
  };

  [...ringOrder, ...internalOrder].forEach((siteId) => {
    const site = siteById.get(siteId);
    const station = positions.get(siteId);
    const description = descriptions.get(siteId);
    const displayLabel = displayLabels.get(siteId);
    const metrics = labelMetrics(displayLabel, description);
    const selected = chooseLabelPosition(
      site,
      station,
      center,
      metrics,
      placedLabelBoxes,
      stationBoxes,
      mapGrid,
      options
    );
    const labelPoint = {
      x: selected.x,
      y: selected.top + 17,
    };

    placedLabelBoxes.push(selected.box);
    layout[siteId] = {
      color: site.accent || SITE_LINES[site.map?.line]?.color || SITE_LINES.core.color,
      station: toGridPoint(station, mapGrid.cellSize),
      label: toGridPoint(labelPoint, mapGrid.cellSize),
      labelBounds: toGridBox(selected.box, mapGrid.cellSize),
      labelAnchor: selected.anchor,
      displayLabel,
      description,
    };
  });

  const canonicalEdges = hubSpokeEdges(hubOrder, siteById);
  const canonicalEdgeIndex = new Map(
    canonicalEdges.map((edge, index) => [
      edge
        .map((site) => site.id)
        .sort()
        .join("::"),
      index,
    ])
  );
  const edges = [...canonicalEdges].sort((left, right) => {
    const leftRootNeighbor = left.find((site) => site.id !== ROOT_SITE_ID);
    const rightRootNeighbor = right.find((site) => site.id !== ROOT_SITE_ID);
    const leftTouchesRoot = left.some((site) => site.id === ROOT_SITE_ID);
    const rightTouchesRoot = right.some((site) => site.id === ROOT_SITE_ID);
    if (leftTouchesRoot !== rightTouchesRoot) return leftTouchesRoot ? -1 : 1;
    if (leftTouchesRoot && rightTouchesRoot) {
      const leftStation = positions.get(leftRootNeighbor.id);
      const rightStation = positions.get(rightRootNeighbor.id);
      const leftAngle = Math.atan2(leftStation.y - center.y, leftStation.x - center.x);
      const rightAngle = Math.atan2(rightStation.y - center.y, rightStation.x - center.x);
      if (Math.abs(leftAngle - rightAngle) > 0.000001) return leftAngle - rightAngle;
    }
    const leftKey = left
      .map((site) => site.id)
      .sort()
      .join("::");
    const rightKey = right
      .map((site) => site.id)
      .sort()
      .join("::");
    return canonicalEdgeIndex.get(leftKey) - canonicalEdgeIndex.get(rightKey);
  });
  const rootEdgeCount = edges.filter((edge) => edge.some((site) => site.id === ROOT_SITE_ID)).length;
  const rootPorts = rootPortOptions(rootEdgeCount, center, mapGrid.cellSize);
  const rootPortState = {
    ports: rootPorts,
    preferred: preferredRootPorts(edges, positions, rootPorts),
    used: new Set(),
  };
  const routedRoutes = [];
  edges.forEach(([left, right]) => {
    const owner = routeOwner(left, right);
    const lineId = edgeLine(left, right);
    routedRoutes.push({
      id: `${lineId}-${[left.id, right.id].sort().join("-")}`,
      hubId: owner.id,
      siteIds: [left.id, right.id],
      lineId,
      color: owner.accent || SITE_LINES[lineId]?.color || SITE_LINES.core.color,
      points: routePath(left, right, positions, rootPortState, routedRoutes, mapGrid),
      stops: [],
    });
  });

  const overpasses = deriveOverpasses(routedRoutes, positions, mapGrid.cellSize);
  const routes = routedRoutes.map((route) => ({
    ...route,
    points: route.points.map((point) => toGridPoint(point, mapGrid.cellSize)),
  }));
  const junctions = routes.length > 1 ? [{ point: layout[ROOT_SITE_ID].station, important: true }] : [];

  return deepFreeze({
    MAP_GRID: mapGrid,
    INTERNAL_HUB_IDS: internalOrder,
    HUB_ORDER: hubOrder,
    HUB_LAYOUT: layout,
    HUB_ROUTES: routes,
    OVERPASSES: overpasses,
    JUNCTIONS: junctions,
    INACTIVE_ROUTES: [],
    INACTIVE_NODES: [],
  });
}

const generatedLayout = computeMapLayout();
const {
  HUB_LAYOUT,
  HUB_ORDER,
  HUB_ROUTES,
  INTERNAL_HUB_IDS,
  INACTIVE_NODES,
  INACTIVE_ROUTES,
  JUNCTIONS,
  MAP_GRID,
  OVERPASSES,
} = generatedLayout;

export {
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
};
