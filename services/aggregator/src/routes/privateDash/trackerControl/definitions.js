import { normalizeBaseUrl } from "../../../../../shared/valueUtils.js";

const probePaths = [
  "/health",
  "/status",
  "/tracker/status",
  "/api/status",
  "/api/tracker/status",
  "/api/v1/status",
  "/api/v1/tracker/status",
];

const localProbePorts = {
  wr: 3131,
  leaderboard: 3143,
  displayname: 3141,
  club: 3142,
};

const localProbeEnvKeys = {
  wr: "DASH_TRACKER_WR_LOCAL_BASE_URL",
  leaderboard: "DASH_TRACKER_LEADERBOARD_LOCAL_BASE_URL",
  displayname: "DASH_TRACKER_DISPLAYNAME_LOCAL_BASE_URL",
  club: "DASH_TRACKER_CLUB_LOCAL_BASE_URL",
};

function createTrackedDefinition(key, baseUrl) {
  return {
    key,
    baseUrl: normalizeBaseUrl(baseUrl),
    statusPaths: ["/api/v1/tracker/status", "/api/v1/status"],
    runNowPath: "/api/v1/admin/tracker/run-now",
    configPath: "/api/v1/admin/tracker/config",
    requiresAdminToken: true,
    supportsRunNow: true,
    supportsEnabledToggle: true,
  };
}

function createTrackerDefinitions(control) {
  return {
    wr: createTrackedDefinition("wr", control.wrBaseUrl),
    leaderboard: createTrackedDefinition("leaderboard", control.leaderboardBaseUrl),
    displayname: {
      key: "displayname",
      baseUrl: normalizeBaseUrl(control.displaynameBaseUrl),
      statusPaths: ["/api/v1/status", "/api/v1/tracker/status"],
      runNowPath: "/api/v1/sync/run-now",
      configPath: "/api/v1/config",
      requiresAdminToken: false,
      supportsRunNow: true,
      supportsEnabledToggle: true,
    },
    club: {
      key: "club",
      baseUrl: normalizeBaseUrl(control.clubBaseUrl),
      statusPaths: ["/api/v1/status", "/api/v1/tracker/status"],
      runNowPath: "",
      configPath: "/api/v1/config",
      requiresAdminToken: false,
      supportsRunNow: false,
      supportsEnabledToggle: true,
    },
  };
}

function getLocalProbeBaseUrl(tracker, env = process.env) {
  const key = String(tracker?.key || "")
    .trim()
    .toLowerCase();
  const envKey = localProbeEnvKeys[key];
  const envBaseUrl = envKey ? normalizeBaseUrl(env[envKey]) : "";
  if (envBaseUrl) return envBaseUrl;

  const configuredBaseUrl = normalizeBaseUrl(tracker?.baseUrl);
  const defaultPort = localProbePorts[key];
  if (!defaultPort) return "";
  return configuredBaseUrl.includes("/__remote/trackers") ? `http://127.0.0.1:${defaultPort}` : "";
}

export { createTrackerDefinitions, getLocalProbeBaseUrl, probePaths };
