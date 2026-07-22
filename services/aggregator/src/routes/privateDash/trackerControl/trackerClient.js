import { fetchJsonWithTimeout } from "../../../../../shared/httpJson.js";
import { buildServiceUrl } from "../routeSupport.js";

function createClientError(message) {
  const error = new Error(message);
  error.statusCode = 400;
  return error;
}

function buildControlHeaders(tracker, adminToken) {
  const headers = { "content-type": "application/json" };
  if (!tracker?.requiresAdminToken) return headers;
  if (!adminToken) {
    throw createClientError(
      `Tracker '${tracker?.key || "unknown"}' requires DASH_TRACKER_ADMIN_TOKEN to control from dash.`
    );
  }
  headers["x-admin-token"] = adminToken;
  headers.authorization = `Bearer ${adminToken}`;
  return headers;
}

async function fetchStatusEntry(requestJson, tracker, { timeoutMs = 10000 } = {}) {
  if (!tracker?.baseUrl) {
    return { ok: false, configured: false, error: "Tracker base URL is not configured.", status: null };
  }

  const statusPaths = Array.isArray(tracker.statusPaths)
    ? tracker.statusPaths.filter(Boolean)
    : [tracker.statusPath].filter(Boolean);
  let payload = null;
  let lastError = null;
  for (const routePath of statusPaths) {
    try {
      payload = await requestJson(buildServiceUrl(tracker.baseUrl, routePath), {
        method: "GET",
        timeoutMs,
      });
      lastError = null;
      break;
    } catch (error) {
      lastError = error;
    }
  }

  return payload
    ? { ok: true, configured: true, status: payload, error: null, baseUrl: tracker.baseUrl }
    : {
        ok: false,
        configured: true,
        status: null,
        error: lastError?.message || "Status request failed.",
        baseUrl: tracker.baseUrl,
      };
}

function createTrackerClient({ trackers, adminToken = "", requestJson = fetchJsonWithTimeout }) {
  const normalizedAdminToken = String(adminToken || "").trim();

  function getTracker(key) {
    return (
      trackers[
        String(key || "")
          .trim()
          .toLowerCase()
      ] || null
    );
  }

  async function fetchAllStatuses() {
    const statusResults = {};
    for (const tracker of Object.values(trackers)) {
      statusResults[tracker.key] = await fetchStatusEntry(requestJson, tracker);
    }
    return statusResults;
  }

  async function sendControlRequest(tracker, action, payload = {}) {
    if (!tracker) throw createClientError("Unknown tracker.");
    if (!tracker.baseUrl) throw createClientError(`Tracker '${tracker.key}' is not configured.`);

    if (action === "run-now") {
      if (!tracker.supportsRunNow || !tracker.runNowPath) {
        throw createClientError(`Tracker '${tracker.key}' does not support run-now.`);
      }
      return requestJson(buildServiceUrl(tracker.baseUrl, tracker.runNowPath), {
        method: "POST",
        headers: buildControlHeaders(tracker, normalizedAdminToken),
        body: payload && typeof payload === "object" ? payload : {},
        timeoutMs: 30000,
      });
    }

    if (action === "enable" || action === "disable" || action === "set") {
      if (!tracker.supportsEnabledToggle || !tracker.configPath) {
        throw createClientError(`Tracker '${tracker.key}' does not support config.`);
      }
      const enabledValue = action === "enable" ? true : action === "disable" ? false : Boolean(payload?.enabled);
      const configBody =
        action === "set" && payload && typeof payload === "object" ? { ...payload } : { enabled: enabledValue };
      if (
        tracker.key === "displayname" &&
        configBody.enabled !== undefined &&
        configBody.schedulerEnabled === undefined
      ) {
        configBody.schedulerEnabled = Boolean(configBody.enabled);
      }
      return requestJson(buildServiceUrl(tracker.baseUrl, tracker.configPath), {
        method: "POST",
        headers: buildControlHeaders(tracker, normalizedAdminToken),
        body: configBody,
        timeoutMs: 15000,
      });
    }

    throw createClientError("Unsupported action. Use run-now, enable, disable, or set.");
  }

  return Object.freeze({ fetchAllStatuses, getTracker, sendControlRequest });
}

export { createTrackerClient };
