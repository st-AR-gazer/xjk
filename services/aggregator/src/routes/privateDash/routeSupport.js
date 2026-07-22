import path from "node:path";

import { normalizeBaseUrl } from "../../../../shared/valueUtils.js";

function buildServiceUrl(baseUrl, routePath) {
  const base = normalizeBaseUrl(baseUrl);
  const suffix = String(routePath || "")
    .trim()
    .replace(/^\/+/, "");
  if (!base || !suffix) return "";
  return `${base}/${suffix}`;
}

function normalizeStateFilePath(value) {
  const text = String(value || "").trim();
  return text ? path.resolve(text) : "";
}

function upstreamErrorStatus(error, fallback = 502) {
  const statusCode = Number(error?.statusCode || 0);
  return statusCode >= 400 && statusCode < 500 ? statusCode : fallback;
}

export { buildServiceUrl, normalizeStateFilePath, upstreamErrorStatus };
