import { fetchJsonWithTimeout } from "../../../../shared/httpJson.js";
import { normalizeBaseUrl } from "../../../../shared/valueUtils.js";
import { buildServiceUrl } from "./routeSupport.js";

function createAlteredClient({ baseUrl = "", internalToken = "", requestJson = fetchJsonWithTimeout } = {}) {
  const normalizedBaseUrl = normalizeBaseUrl(baseUrl);
  const normalizedInternalToken = String(internalToken || "").trim();

  function buildHeaders({ hasBody = false, requiresInternalAuth = true } = {}) {
    const headers = {};
    if (hasBody) headers["content-type"] = "application/json";
    if (requiresInternalAuth && normalizedInternalToken) {
      headers["x-aggregator-token"] = normalizedInternalToken;
    }
    return headers;
  }

  async function request(
    routePath,
    { method = "GET", body = undefined, timeoutMs = 15000, requiresInternalAuth = true } = {}
  ) {
    if (!normalizedBaseUrl) {
      const error = new Error("Altered base URL is not configured.");
      error.statusCode = 400;
      throw error;
    }

    return requestJson(buildServiceUrl(normalizedBaseUrl, routePath), {
      method,
      body,
      timeoutMs,
      headers: buildHeaders({ hasBody: body !== undefined, requiresInternalAuth }),
    });
  }

  return Object.freeze({ request });
}

export { createAlteredClient };
