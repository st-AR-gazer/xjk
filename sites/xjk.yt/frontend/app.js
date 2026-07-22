import "/shared/xjk-core/safe-html.js?v=2";
import {
  REDESIGN_SCOPES,
  getMapSites,
  getNavigationSites,
  resolveSiteHref,
  userHasAdminRole,
} from "/shared/xjk-core/site-runtime.js";
import { escapeAttribute, escapeHtml, uniqueSites } from "/shared/xjk-core/dom-utils.js";
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
  gridPointOnRoutes,
} from "./map-layout.js";

const mapCanvas = document.getElementById("mapCanvas");

const registrySites = uniqueSites([
  ...getMapSites({ includeInternal: true }),
  ...getNavigationSites({ includeHidden: true, includeInternal: true }),
]);
const registryById = new Map(registrySites.map((site) => [site.id, site]));

const allHubSites = HUB_ORDER.map((id) => registryById.get(id)).filter(Boolean);
const internalHubIds = new Set(INTERNAL_HUB_IDS);

const state = {
  activeHubId: null,
  admin: false,
  mapView: {
    panX: 0,
    panY: 0,
    scale: 1,
    drag: null,
    moved: false,
    suppressClick: false,
  },
};

const MAP_MIN_SCALE = 0.68;
const MAP_MAX_SCALE = 2.25;
const MAP_CLICK_TOLERANCE = 5;

function visualFor(site) {
  const layout = HUB_LAYOUT[site.id];
  if (layout) {
    const station = gridPoint(layout.station);
    const label = gridPoint(layout.label);
    return {
      ...layout,
      x: station.x,
      y: station.y,
      labelX: label.x,
      labelY: label.y,
    };
  }

  return {
    color: site.accent || "#f2f2f0",
    x: 500,
    y: 300,
    labelX: 530,
    labelY: 290,
    description: [site.summary || site.label],
  };
}

function colorFor(siteOrId) {
  const id = typeof siteOrId === "string" ? siteOrId : siteOrId.id;
  return HUB_LAYOUT[id]?.color || registryById.get(id)?.accent || "#f2f2f0";
}

function routeColor(route) {
  return route.color || colorFor(route.hubId);
}

function siteIsVisible(site) {
  if (!site) return false;
  if (!site.internal) return true;
  return state.admin && internalHubIds.has(site.id);
}

function visibleHubSites() {
  return allHubSites.filter(siteIsVisible);
}

function visibleHubIdSet() {
  return new Set(visibleHubSites().map((site) => site.id));
}

function visibleRoutes() {
  const visibleIds = visibleHubIdSet();
  return HUB_ROUTES.filter((route) => (route.siteIds || [route.hubId]).every((siteId) => visibleIds.has(siteId)));
}

function siteIsDimmed(site) {
  return Boolean(state.activeHubId && state.activeHubId !== site.id);
}

function routeIsDimmed(route) {
  const routeSiteIds = route.siteIds || [route.hubId];
  const visibleSites = routeSiteIds.map((siteId) => registryById.get(siteId)).filter(siteIsVisible);
  if (visibleSites.length === 0) return true;
  return Boolean(state.activeHubId && !routeSiteIds.includes(state.activeHubId));
}

function gridPoint(point) {
  return {
    x: Number(point[0]) * MAP_GRID.cellSize,
    y: Number(point[1]) * MAP_GRID.cellSize,
  };
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function pointKey(point) {
  return `${Number(point?.[0])},${Number(point?.[1])}`;
}

function angularPathFromGrid(points) {
  const parsedPoints = points.map(gridPoint);
  if (parsedPoints.length === 0) return "";
  if (parsedPoints.length === 1) return `M${parsedPoints[0].x} ${parsedPoints[0].y}`;

  return parsedPoints.map((point, index) => `${index === 0 ? "M" : "L"}${point.x} ${point.y}`).join(" ");
}

function renderRoutes() {
  return visibleRoutes()
    .map((route) => {
      const color = routeColor(route);
      const path = angularPathFromGrid(route.points);
      const siteIds = route.siteIds || [route.hubId];
      return `
      <path class="route route-shadow" d="${escapeAttribute(path)}"></path>
      <path class="route route-line" d="${escapeAttribute(path)}" data-route-id="${escapeAttribute(route.id)}" data-site-id="${escapeAttribute(route.hubId)}" data-site-ids="${escapeAttribute(siteIds.join(" "))}" style="--hub-color: ${escapeAttribute(color)}"></path>
    `;
    })
    .join("");
}

function renderRouteLabelMask() {
  const horizontalClearance = 6;
  const verticalClearance = 3;
  const textRect = (siteId, x, baseline, width, height, anchor) => {
    const anchoredLeft = anchor === "end" ? x - width : anchor === "middle" ? x - width / 2 : x;
    const left = clamp(anchoredLeft - horizontalClearance, 0, MAP_GRID.width);
    const top = clamp(baseline - height - verticalClearance, 0, MAP_GRID.height);
    const right = clamp(anchoredLeft + width + horizontalClearance, 0, MAP_GRID.width);
    const bottom = clamp(baseline + verticalClearance, 0, MAP_GRID.height);
    return `<rect class="route-label-clearance" data-route-label-id="${escapeAttribute(siteId)}" x="${left}" y="${top}" width="${right - left}" height="${bottom - top}" rx="3" fill="black"></rect>`;
  };
  const labelHoles = visibleHubSites()
    .map((site) => {
      const bounds = HUB_LAYOUT[site.id]?.labelBounds;
      if (!Array.isArray(bounds) || bounds.length !== 4) return "";

      const visual = visualFor(site);
      const anchor = visual.labelAnchor || "start";
      const displayLabel = visual.displayLabel || site.label;
      const rectangles = [
        textRect(site.id, visual.labelX, visual.labelY, Math.max(32, displayLabel.length * 10.5), 21, anchor),
      ];
      if (!visual.minimalLabel) {
        visual.description.forEach((line, index) => {
          rectangles.push(
            textRect(
              site.id,
              visual.labelX,
              visual.labelY + 24 + index * 16,
              Math.max(8, line.length * 6.8),
              14,
              anchor
            )
          );
        });
        const actionY = visual.labelY + 24 + visual.description.length * 16 + 19;
        rectangles.push(textRect(site.id, visual.labelX, actionY, 62, 14, anchor));
      }
      return rectangles.join("");
    })
    .join("");

  return `
    <mask id="route-label-mask" maskUnits="userSpaceOnUse" maskContentUnits="userSpaceOnUse" x="0" y="0" width="${MAP_GRID.width}" height="${MAP_GRID.height}" style="mask-type: luminance">
      <rect x="0" y="0" width="${MAP_GRID.width}" height="${MAP_GRID.height}" fill="white"></rect>
      ${labelHoles}
    </mask>
  `;
}

function renderOverpasses() {
  const visibleIds = visibleHubIdSet();
  return OVERPASSES.filter((overpass) => (overpass.siteIds || []).every((siteId) => visibleIds.has(siteId)))
    .map((overpass) => {
      const point = gridPoint(overpass.point);
      const from = gridPoint(overpass.from);
      const to = gridPoint(overpass.to);
      return `
      <circle class="route-overpass-gap" cx="${point.x}" cy="${point.y}" r="8"></circle>
      <line class="route-overpass-line" x1="${from.x}" y1="${from.y}" x2="${to.x}" y2="${to.y}" style="--hub-color: ${escapeAttribute(overpass.color)}"></line>
    `;
    })
    .join("");
}

function renderInactiveNetwork() {
  const inactivePath = (route) => angularPathFromGrid(route.points);
  const routes = INACTIVE_ROUTES.map(
    (route) =>
      `<path class="inactive-route${route.dashed ? " is-dashed" : ""}" d="${escapeAttribute(inactivePath(route))}"></path>`
  ).join("");
  const nodes = INACTIVE_NODES.map((point) => {
    const { x, y } = gridPoint(point);
    return `<circle class="inactive-node" cx="${x}" cy="${y}" r="4"></circle>`;
  }).join("");
  return `${routes}${nodes}`;
}

function stationPointKeys() {
  return new Set(
    visibleHubSites()
      .map((site) => HUB_LAYOUT[site.id]?.station)
      .filter(Boolean)
      .map(pointKey)
  );
}

function routeStopEntries() {
  const stationKeys = stationPointKeys();
  const stops = new Map();

  visibleRoutes().forEach((route) => {
    const routeStops = route.stops ?? route.points.slice(1, -1);
    routeStops.forEach((point) => {
      const key = pointKey(point);
      if (stationKeys.has(key)) return;

      const stop = stops.get(key) || { point, siteIds: [] };
      if (!stop.siteIds.includes(route.hubId)) stop.siteIds.push(route.hubId);
      stops.set(key, stop);
    });
  });

  return [...stops.values()];
}

function renderRouteStops() {
  return routeStopEntries()
    .map((stop) => {
      const { x, y } = gridPoint(stop.point);
      const primaryId = stop.siteIds[0] || "";
      const transferClass = stop.siteIds.length > 1 ? " route-stop--transfer" : "";
      return `<circle class="route-stop${transferClass}" cx="${x}" cy="${y}" r="${stop.siteIds.length > 1 ? 5 : 4.25}" data-site-id="${escapeAttribute(primaryId)}" data-site-ids="${escapeAttribute(stop.siteIds.join(" "))}" style="--hub-color: ${escapeAttribute(colorFor(primaryId))}"></circle>`;
    })
    .join("");
}

function renderJunctions() {
  const routes = visibleRoutes();
  return JUNCTIONS.filter((junction) => gridPointOnRoutes(junction.point, routes))
    .map((junction) => {
      const { x, y } = gridPoint(junction.point);
      const radius = junction.important ? 7 : 5;
      return `<circle class="junction${junction.important ? " junction--important" : ""}" cx="${x}" cy="${y}" r="${radius}"></circle>`;
    })
    .join("");
}

function mapLinkForSite(site) {
  const targetId = site.id === "xjk" ? "account" : site.id;
  const targetSite = registryById.get(targetId) || site;
  return {
    href: resolveSiteHref(targetId),
    linkId: targetId,
    label: targetSite.label || site.label,
  };
}

function renderHubNode(site) {
  const visual = visualFor(site);
  const link = mapLinkForSite(site);
  const centralClass = visual.central ? " hub-node--central" : "";
  const excludedClass = site.redesign?.scope === REDESIGN_SCOPES.excluded ? " hub-node--excluded" : "";
  return `
    <g class="hub-group${centralClass}" data-site-id="${escapeAttribute(site.id)}" style="--hub-color: ${escapeAttribute(visual.color)}">
      <a class="hub-node${centralClass}${excludedClass}" href="${escapeAttribute(link.href)}" data-site-id="${escapeAttribute(site.id)}" data-xjk-site-link="${escapeAttribute(link.linkId)}" aria-label="Open ${escapeAttribute(link.label)}">
        <circle class="node-glow" cx="${visual.x}" cy="${visual.y}" r="${visual.central ? 32 : 18}"></circle>
        <circle class="node-ring" cx="${visual.x}" cy="${visual.y}" r="${visual.central ? 28 : 15}"></circle>
        <circle class="node-inner" cx="${visual.x}" cy="${visual.y}" r="${visual.central ? 22 : 10.5}"></circle>
        <circle class="node-core" cx="${visual.x}" cy="${visual.y}" r="${visual.central ? 15 : 6.5}"></circle>
      </a>
      ${renderHubLabel(site)}
    </g>
  `;
}

function renderHubLabel(site) {
  const visual = visualFor(site);
  const link = mapLinkForSite(site);
  const titleY = visual.labelY;
  const textAnchor = visual.labelAnchor || "start";
  const displayLabel = visual.displayLabel || site.label;
  if (visual.minimalLabel) {
    return `
      <a class="hub-label-link" href="${escapeAttribute(link.href)}" data-site-id="${escapeAttribute(site.id)}" data-xjk-site-link="${escapeAttribute(link.linkId)}" aria-label="Open ${escapeAttribute(link.label)}">
        <text class="hub-title" x="${visual.labelX}" y="${titleY}" text-anchor="${escapeAttribute(textAnchor)}">${escapeHtml(displayLabel)}</text>
      </a>
    `;
  }
  const description = visual.description
    .map(
      (line, index) =>
        `<text class="hub-description" x="${visual.labelX}" y="${titleY + 24 + index * 16}" text-anchor="${escapeAttribute(textAnchor)}">${escapeHtml(line)}</text>`
    )
    .join("");
  const actionY = titleY + 24 + visual.description.length * 16 + 19;

  return `
    <a class="hub-label-link" href="${escapeAttribute(link.href)}" data-site-id="${escapeAttribute(site.id)}" data-xjk-site-link="${escapeAttribute(link.linkId)}">
      <text class="hub-title" x="${visual.labelX}" y="${titleY}" text-anchor="${escapeAttribute(textAnchor)}">${escapeHtml(displayLabel)}</text>
      ${description}
      <text class="hub-action" x="${visual.labelX}" y="${actionY}" text-anchor="${escapeAttribute(textAnchor)}">OPEN -></text>
    </a>
  `;
}

function renderMap() {
  if (!mapCanvas) return;

  globalThis.XjkSafeHtml.set(
    mapCanvas,
    `
    <svg class="network-map" viewBox="0 0 ${MAP_GRID.width} ${MAP_GRID.height}" preserveAspectRatio="xMidYMid meet" role="img" aria-labelledby="mapTitle">
      <defs>${renderRouteLabelMask()}</defs>
      <g class="route-layers" mask="url(#route-label-mask)">
        <g class="inactive-network" aria-hidden="true">${renderInactiveNetwork()}</g>
        <g class="active-routes">${renderRoutes()}</g>
        <g class="route-overpasses" aria-hidden="true">${renderOverpasses()}</g>
        <g class="route-stops" aria-hidden="true">${renderRouteStops()}</g>
      </g>
      <g class="junctions" aria-hidden="true">${renderJunctions()}</g>
      <g class="hub-stations">${visibleHubSites().map(renderHubNode).join("")}</g>
    </svg>
  `
  );

  mapCanvas.querySelectorAll("[data-site-id]").forEach((node) => {
    node.addEventListener("pointerenter", () => setActiveHub(node.dataset.siteId));
    node.addEventListener("pointerleave", () => setActiveHub(null));
    node.addEventListener("focus", () => setActiveHub(node.dataset.siteId));
    node.addEventListener("blur", () => setActiveHub(null));
  });

  updateMapView();
  centerMapStageOnMobile();
}

function centerMapStageOnMobile() {
  if (!mapCanvas || !window.matchMedia("(max-width: 700px)").matches) return;
  const mapStage = mapCanvas.closest(".map-stage");
  if (!mapStage) return;

  window.requestAnimationFrame(() => {
    mapStage.scrollLeft = Math.max(0, (mapStage.scrollWidth - mapStage.clientWidth) / 2);
  });
}

function updateMapView() {
  if (!mapCanvas) return;
  const { panX, panY, scale } = state.mapView;
  mapCanvas.style.setProperty("--map-pan-x", `${panX}px`);
  mapCanvas.style.setProperty("--map-pan-y", `${panY}px`);
  mapCanvas.style.setProperty("--map-scale", String(scale));
  mapCanvas.classList.toggle("is-panning", Boolean(state.mapView.drag));
}

function closestMapLink(target) {
  if (!(target instanceof Element)) return null;
  const link = target.closest("a[href]");
  return link && mapCanvas?.contains(link) ? link : null;
}

function hrefFromMapLink(link) {
  return link?.href?.baseVal || link?.getAttribute?.("href") || "";
}

function eventCanPanMap(event) {
  if (!mapCanvas || event.button !== 0) return false;
  if (closestMapLink(event.target)) return false;
  return mapCanvas.contains(event.target);
}

function bindMapNavigation() {
  if (!mapCanvas) return;

  window.addEventListener("resize", centerMapStageOnMobile, { passive: true });

  mapCanvas.addEventListener("pointerdown", (event) => {
    if (!eventCanPanMap(event)) return;
    state.mapView.drag = {
      pointerId: event.pointerId,
      startClientX: event.clientX,
      startClientY: event.clientY,
      startPanX: state.mapView.panX,
      startPanY: state.mapView.panY,
    };
    state.mapView.moved = false;
    mapCanvas.setPointerCapture?.(event.pointerId);
    updateMapView();
  });

  mapCanvas.addEventListener("pointermove", (event) => {
    const drag = state.mapView.drag;
    if (!drag || drag.pointerId !== event.pointerId) return;

    const deltaX = event.clientX - drag.startClientX;
    const deltaY = event.clientY - drag.startClientY;
    state.mapView.panX = drag.startPanX + deltaX;
    state.mapView.panY = drag.startPanY + deltaY;
    state.mapView.moved = state.mapView.moved || Math.hypot(deltaX, deltaY) > MAP_CLICK_TOLERANCE;
    updateMapView();
  });

  mapCanvas.addEventListener("pointerup", (event) => {
    const drag = state.mapView.drag;
    if (!drag || drag.pointerId !== event.pointerId) return;
    state.mapView.drag = null;
    state.mapView.suppressClick = state.mapView.moved;
    state.mapView.moved = false;
    if (state.mapView.suppressClick) {
      window.setTimeout(() => {
        state.mapView.suppressClick = false;
      }, 220);
    }
    mapCanvas.releasePointerCapture?.(event.pointerId);
    updateMapView();
  });

  mapCanvas.addEventListener("pointercancel", (event) => {
    const drag = state.mapView.drag;
    if (!drag || drag.pointerId !== event.pointerId) return;
    state.mapView.drag = null;
    state.mapView.moved = false;
    state.mapView.suppressClick = false;
    mapCanvas.releasePointerCapture?.(event.pointerId);
    updateMapView();
  });

  mapCanvas.addEventListener(
    "click",
    (event) => {
      if (state.mapView.suppressClick) {
        event.preventDefault();
        event.stopPropagation();
        state.mapView.suppressClick = false;
        return;
      }

      const link = closestMapLink(event.target);
      if (!link || event.defaultPrevented || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      const href = hrefFromMapLink(link);
      if (!href) return;
      event.preventDefault();
      window.location.href = href;
    },
    true
  );

  mapCanvas.addEventListener(
    "wheel",
    (event) => {
      if (window.matchMedia("(max-width: 700px)").matches && !event.ctrlKey) return;
      if (event.ctrlKey) event.preventDefault();
      const rect = mapCanvas.getBoundingClientRect();
      if (!rect.width || !rect.height) return;

      const previousScale = state.mapView.scale;
      const nextScale = clamp(previousScale * Math.exp(-event.deltaY * 0.0016), MAP_MIN_SCALE, MAP_MAX_SCALE);
      if (nextScale === previousScale) return;

      event.preventDefault();
      const originX = rect.left + rect.width / 2;
      const originY = rect.top + rect.height / 2;
      const localX = (event.clientX - originX - state.mapView.panX) / previousScale;
      const localY = (event.clientY - originY - state.mapView.panY) / previousScale;

      state.mapView.scale = nextScale;
      state.mapView.panX = event.clientX - originX - localX * nextScale;
      state.mapView.panY = event.clientY - originY - localY * nextScale;
      updateMapView();
    },
    { passive: false }
  );

  mapCanvas.addEventListener("dblclick", (event) => {
    if (!mapCanvas.contains(event.target)) return;
    event.preventDefault();
    state.mapView.panX = 0;
    state.mapView.panY = 0;
    state.mapView.scale = 1;
    updateMapView();
  });
}

function setActiveHub(siteId) {
  if (siteId && !visibleHubIdSet().has(siteId)) return;
  state.activeHubId = siteId || null;
  updateActiveStates();
}

function updateActiveStates() {
  visibleHubSites().forEach((site) => {
    const dimmed = siteIsDimmed(site);
    const selected = state.activeHubId === site.id;
    document.querySelectorAll(`[data-site-id="${CSS.escape(site.id)}"]`).forEach((node) => {
      node.classList.toggle("is-muted", dimmed);
      node.classList.toggle("is-selected", selected);
    });
  });

  document.querySelectorAll(".route-line[data-site-id]").forEach((route) => {
    const siteIds = String(route.dataset.siteIds || route.dataset.siteId || "")
      .split(/\s+/)
      .filter(Boolean);
    const dimmed = routeIsDimmed({ hubId: route.dataset.siteId, siteIds });
    const selected = Boolean(state.activeHubId && siteIds.includes(state.activeHubId));
    route.classList.toggle("is-muted", dimmed);
    route.classList.toggle("is-selected", selected);
    route.previousElementSibling?.classList.toggle("is-muted", dimmed);
  });

  document.querySelectorAll(".route-stop[data-site-ids]").forEach((stop) => {
    const siteIds = String(stop.dataset.siteIds || "")
      .split(/\s+/)
      .filter(Boolean);
    const sites = siteIds.map((siteId) => registryById.get(siteId)).filter(siteIsVisible);
    const dimmed = sites.length === 0 || sites.every(siteIsDimmed);
    const selected = Boolean(state.activeHubId && siteIds.includes(state.activeHubId));
    stop.classList.toggle("is-muted", dimmed);
    stop.classList.toggle("is-selected", selected);
  });
}

async function hydrateAdminAccess() {
  try {
    const response = await fetch("/api/v1/account/session", {
      credentials: "include",
      cache: "no-store",
    });
    const payload = await response.json();
    const isAdmin = userHasAdminRole(payload?.session?.user || payload?.user);
    if (state.admin === isAdmin) return;
    state.admin = isAdmin;
  } catch {
    if (!state.admin) return;
    state.admin = false;
  }

  if (state.activeHubId && !visibleHubIdSet().has(state.activeHubId)) {
    state.activeHubId = null;
  }
  renderMap();
  updateActiveStates();
}

function bootHub() {
  renderMap();
  bindMapNavigation();
  updateActiveStates();
  hydrateAdminAccess();
}

bootHub();
