import { DEFAULT_MAP_VIEW, MAP_PAGE_SIZE_OPTIONS, MAP_SORT_OPTIONS, MAP_STATUS_FILTERS, TRACKS } from "./constants.js";

const XJK_SITE_BASE_URL = new URL(".", document.baseURI);
const XJK_SITE_BASE_PATH = XJK_SITE_BASE_URL.pathname.replace(/\/$/, "");

function sitePath(pathname) {
  const relativePath = String(pathname || "").replace(/^\/+/, "");
  const url = new URL(relativePath, XJK_SITE_BASE_URL);
  return `${url.pathname}${url.search}${url.hash}`;
}

function routePathname(url) {
  if (!XJK_SITE_BASE_PATH) return url.pathname;
  if (url.pathname === XJK_SITE_BASE_PATH) return "/";
  if (url.pathname.startsWith(`${XJK_SITE_BASE_PATH}/`)) {
    return url.pathname.slice(XJK_SITE_BASE_PATH.length) || "/";
  }
  return url.pathname;
}

function sanitizeLookupValue(value = "") {
  return String(value || "").trim();
}

function sanitizeTrack(value) {
  const track = String(value || "")
    .trim()
    .toLowerCase();
  return TRACKS.includes(track) ? track : DEFAULT_MAP_VIEW.track;
}

function sanitizeStatus(value) {
  const status = String(value || "")
    .trim()
    .toLowerCase();
  return MAP_STATUS_FILTERS.includes(status) ? status : DEFAULT_MAP_VIEW.status;
}

function sanitizeSort(value) {
  const sort = String(value || "")
    .trim()
    .toLowerCase();
  return MAP_SORT_OPTIONS.includes(sort) ? sort : DEFAULT_MAP_VIEW.sort;
}

function sanitizePositiveInt(value, fallback) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

export function normalizeMapRouteState(input = {}) {
  const pageSize = sanitizePositiveInt(input.pageSize, DEFAULT_MAP_VIEW.pageSize);
  const safePageSize = MAP_PAGE_SIZE_OPTIONS.includes(pageSize) ? pageSize : DEFAULT_MAP_VIEW.pageSize;

  return {
    track: sanitizeTrack(input.track),
    sort: sanitizeSort(input.sort),
    status: sanitizeStatus(input.status),
    page: sanitizePositiveInt(input.page, DEFAULT_MAP_VIEW.page),
    pageSize: safePageSize,
  };
}

function parseLegacyQuery(url) {
  const recordId = sanitizeLookupValue(url.searchParams.get("recordId"));
  if (recordId) {
    return {
      workspace: "record",
      recordId,
    };
  }

  const mapUid = sanitizeLookupValue(url.searchParams.get("mapUid"));
  if (mapUid) {
    return {
      workspace: "map",
      mapUid,
      mapView: normalizeMapRouteState({
        track: url.searchParams.get("track"),
        sort: url.searchParams.get("sort"),
        status: url.searchParams.get("status"),
        page: url.searchParams.get("page"),
        pageSize: url.searchParams.get("pageSize"),
      }),
    };
  }

  return {
    workspace: "live",
  };
}

export function parseAppRoute(locationLike = window.location) {
  const url = new URL(locationLike.href || window.location.href);
  const segments = routePathname(url)
    .split("/")
    .filter(Boolean)
    .map((segment) => decodeURIComponent(segment));

  if (!segments.length || segments[0] === "live") {
    return {
      workspace: "live",
    };
  }

  if (segments[0] === "records" && segments[1]) {
    return {
      workspace: "record",
      recordId: sanitizeLookupValue(segments[1]),
    };
  }

  if (segments[0] === "records") {
    return {
      workspace: "record",
    };
  }

  if (segments[0] === "maps" && segments[1]) {
    return {
      workspace: "map",
      mapUid: sanitizeLookupValue(segments[1]),
      mapView: normalizeMapRouteState({
        track: url.searchParams.get("track"),
        sort: url.searchParams.get("sort"),
        status: url.searchParams.get("status"),
        page: url.searchParams.get("page"),
        pageSize: url.searchParams.get("pageSize"),
      }),
    };
  }

  if (segments[0] === "maps") {
    return {
      workspace: "map",
      mapView: normalizeMapRouteState({
        track: url.searchParams.get("track"),
        sort: url.searchParams.get("sort"),
        status: url.searchParams.get("status"),
        page: url.searchParams.get("page"),
        pageSize: url.searchParams.get("pageSize"),
      }),
    };
  }

  if (segments[0] === "submit") {
    return {
      workspace: "submission",
      recordId: sanitizeLookupValue(url.searchParams.get("recordId")),
      mapUid: sanitizeLookupValue(url.searchParams.get("mapUid")),
    };
  }

  if (segments[0] === "clients") {
    return {
      workspace: "clients",
    };
  }

  if (segments[0] === "recent") {
    return {
      workspace: "recent",
    };
  }

  return parseLegacyQuery(url);
}

export function buildRecordPath(recordId) {
  const safeRecordId = sanitizeLookupValue(recordId);
  return sitePath(safeRecordId ? `/records/${encodeURIComponent(safeRecordId)}` : "/records");
}

export function buildMapPath(mapUid, rawOptions = {}) {
  const safeMapUid = sanitizeLookupValue(mapUid);
  if (!safeMapUid) {
    return sitePath("/maps");
  }

  const mapView = normalizeMapRouteState(rawOptions);
  const params = new URLSearchParams();

  if (mapView.track !== DEFAULT_MAP_VIEW.track) params.set("track", mapView.track);
  if (mapView.sort !== DEFAULT_MAP_VIEW.sort) params.set("sort", mapView.sort);
  if (mapView.status !== DEFAULT_MAP_VIEW.status) params.set("status", mapView.status);
  if (mapView.page !== DEFAULT_MAP_VIEW.page) params.set("page", String(mapView.page));
  if (mapView.pageSize !== DEFAULT_MAP_VIEW.pageSize) params.set("pageSize", String(mapView.pageSize));

  const query = params.toString();
  return sitePath(`/maps/${encodeURIComponent(safeMapUid)}${query ? `?${query}` : ""}`);
}

export function buildSubmissionPath(values = {}) {
  const params = new URLSearchParams();
  const recordId = sanitizeLookupValue(values.recordId);
  const mapUid = sanitizeLookupValue(values.mapUid);

  if (recordId) params.set("recordId", recordId);
  if (mapUid) params.set("mapUid", mapUid);

  const query = params.toString();
  return sitePath(`/submit${query ? `?${query}` : ""}`);
}

export function buildClientsPath() {
  return sitePath("/clients");
}

export function buildRecentPath() {
  return sitePath("/recent");
}

export function buildLivePath() {
  return sitePath("/live");
}

function updateHistory(path, { replace = false } = {}) {
  const method = replace ? "replaceState" : "pushState";
  window.history[method]({}, "", path);
}

export function navigateToRecord(recordId, options = {}) {
  updateHistory(buildRecordPath(recordId), options);
}

export function navigateToMap(mapUid, mapView, options = {}) {
  updateHistory(buildMapPath(mapUid, mapView), options);
}

export function navigateToSubmission(values = {}, options = {}) {
  updateHistory(buildSubmissionPath(values), options);
}

export function navigateToClients(options = {}) {
  updateHistory(buildClientsPath(), options);
}

export function navigateToRecent(options = {}) {
  updateHistory(buildRecentPath(), options);
}

export function navigateToLive(options = {}) {
  updateHistory(buildLivePath(), options);
}

export function absoluteUrlForPath(pathname) {
  const value = String(pathname || "");
  if (/^https?:\/\//i.test(value)) return value;
  return new URL(value.replace(/^\/+/, ""), XJK_SITE_BASE_URL).toString();
}

export { absoluteUrlForPath as apiUrl };
