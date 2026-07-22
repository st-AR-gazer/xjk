import { alteredUrl } from "./constants.js?v=2";
import { esc } from "./formatters.js?v=2";
import { getPreferredAlteredOrigin } from "./request-client.js?v=2";

const DEFAULT_MAP_VIEWER_BASE_URL = "http://localhost:5174";
const MAP_VIEWER_BASE_URL_STORAGE_KEY = "alteredAdmin.mapViewerBaseUrl";

function getMapViewerBaseUrl() {
  try {
    const stored = String(localStorage.getItem(MAP_VIEWER_BASE_URL_STORAGE_KEY) || "").trim();
    return (stored || DEFAULT_MAP_VIEWER_BASE_URL).replace(/\/+$/, "");
  } catch {
    return DEFAULT_MAP_VIEWER_BASE_URL;
  }
}

function buildMapViewerPayloadUrl(targetMapUid, referenceMapUid) {
  const targetUid = String(targetMapUid || "").trim();
  const referenceUid = String(referenceMapUid || "").trim();
  if (!targetUid || !referenceUid) return "";
  const url = new URL(
    alteredUrl(`/api/v1/public/maps/${encodeURIComponent(targetUid)}/viewer-diff`),
    getPreferredAlteredOrigin()
  );
  url.searchParams.set("referenceMapUid", referenceUid);
  return url.toString();
}

function buildMapViewerDiffUrl(targetMapUid, referenceMapUid) {
  const payloadUrl = buildMapViewerPayloadUrl(targetMapUid, referenceMapUid);
  if (!payloadUrl) return "";
  const viewerUrl = new URL("/diff", getMapViewerBaseUrl());
  viewerUrl.searchParams.set("payloadUrl", payloadUrl);
  return viewerUrl.toString();
}

export function renderMapViewerAction(targetMapUid, referenceMapUid, label = "Open In Map Viewer") {
  const href = buildMapViewerDiffUrl(targetMapUid, referenceMapUid);
  const payloadUrl = buildMapViewerPayloadUrl(targetMapUid, referenceMapUid);
  if (!href) {
    return `<button class="btn outline small" type="button" disabled>${esc(label)}</button>`;
  }
  return `<a class="btn outline small" href="${esc(href)}" target="_blank" rel="noreferrer" title="${esc(payloadUrl)}">${esc(label)}</a>`;
}
