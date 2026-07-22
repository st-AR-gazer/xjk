import { fetchJson } from "../../../shared/xjk-core/http.js?v=2";

const DASH_API_BASES = ["/api/private/dash", "/api/v1/private/dash"];

export async function fetchDashJson(pathAndQuery, options = {}) {
  const { body, headers = {}, ...requestOptions } = options;
  let lastError = null;

  for (const base of DASH_API_BASES) {
    const url = new URL(base + pathAndQuery, window.location.origin);
    url.searchParams.set("_t", String(Date.now()));
    try {
      return await fetchJson(url.pathname + url.search, {
        ...requestOptions,
        ...(body === undefined ? {} : { json: body }),
        headers: {
          "cache-control": "no-cache",
          ...headers,
        },
      });
    } catch (error) {
      lastError = error;
      if (!error || error.status !== 404) break;
    }
  }

  throw lastError || new Error("Dashboard API unavailable.");
}
