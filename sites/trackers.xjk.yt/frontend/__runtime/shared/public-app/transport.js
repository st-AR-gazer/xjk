import { toLocalApiPath, toPrimaryApiUrl } from "./config.js";

function createTrackerTransport({ config, fetchJson, state }) {
  async function fetchTrackerJson(url, { method, headers, body }) {
    return fetchJson(url, {
      method,
      headers,
      body,
      onResponse(response) {
        if (response.headers.get("x-xjk-remote-tracker") === "1") {
          state.source.remoteProxyRead = true;
        }
      },
    });
  }

  async function api(pathname, { method = "GET", body, admin = false } = {}) {
    const safeMethod = String(method || "GET").toUpperCase();
    const localPath = toLocalApiPath(config, pathname);
    const servicePath = String(pathname || "").startsWith("/") ? String(pathname) : `/${pathname || ""}`;
    const usePrimaryRead =
      safeMethod === "GET" && !admin && state.source.usePrimaryRead && state.source.primaryReadHealthy;
    const headers = body ? { "content-type": "application/json" } : {};
    const requestBody = body ? JSON.stringify(body) : undefined;

    if (usePrimaryRead) {
      try {
        return await fetchTrackerJson(toPrimaryApiUrl(config, servicePath), {
          method: safeMethod,
          headers,
          body: requestBody,
        });
      } catch {
        state.source.primaryReadHealthy = false;
      }
    }

    return fetchTrackerJson(localPath, {
      method: safeMethod,
      headers,
      body: requestBody,
    });
  }

  return {
    api,
    primaryApiUrl: (pathname) => toPrimaryApiUrl(config, pathname),
  };
}

export { createTrackerTransport };
