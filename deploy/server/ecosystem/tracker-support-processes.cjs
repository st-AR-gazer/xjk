const path = require("node:path");

function defineTrackerSupportProcesses({
  aggregatorAccessEnvironment,
  aggregatorUpstreamCredentials,
  defineProcess,
  productionServiceUrl,
  roots,
  serviceEnvironments,
}) {
  const aggregatorEnvironment = serviceEnvironments.forService("aggregator-hub");
  const displayNameEnvironment = serviceEnvironments.forService("tracker-displayname-hub");
  const clubEnvironment = serviceEnvironments.forService("tracker-club-hub");

  return [
    defineProcess("aggregator-hub", {
      authoritativeEnv: {
        DASH_ALTERED_INTERNAL_TOKEN: aggregatorUpstreamCredentials.DASH_ALTERED_INTERNAL_TOKEN,
        DASH_TRACKER_ADMIN_TOKEN: aggregatorUpstreamCredentials.DASH_TRACKER_ADMIN_TOKEN,
      },
      env: {
        FRONTEND_DIR: path.join(roots.aggregator, "frontend"),
        DASH_FRONTEND_DIR: path.join(roots.dash, "frontend"),
        DATA_DIR: path.join(roots.altered, "data"),
        DB_FILE: path.join(roots.altered, "data", "tracker-aggregator.sqlite"),
        ...aggregatorAccessEnvironment,
        DASH_HOSTNAMES: aggregatorEnvironment.DASH_HOSTNAMES || "dash.xjk.yt,dash.localhost",
      },
    }),
    defineProcess("tracker-displayname-hub", {
      env: {
        FRONTEND_DIR: path.join(roots.trackers, "frontend", "__runtime", "displayname"),
        TRACKER_DISPLAYNAME_AGGREGATOR_BASE_URL:
          displayNameEnvironment.TRACKER_DISPLAYNAME_AGGREGATOR_BASE_URL ||
          productionServiceUrl("aggregator-hub", "/api"),
        TRACKER_DISPLAYNAME_AGGREGATOR_TOKEN:
          displayNameEnvironment.TRACKER_DISPLAYNAME_AGGREGATOR_TOKEN ||
          displayNameEnvironment.AGGREGATOR_INGEST_TOKEN ||
          "",
        TRACKER_DISPLAYNAME_PROJECT_KEY:
          displayNameEnvironment.TRACKER_DISPLAYNAME_PROJECT_KEY || "prod-tracker-displayname",
        TRACKER_DISPLAYNAME_PROJECT_NAME:
          displayNameEnvironment.TRACKER_DISPLAYNAME_PROJECT_NAME || "Prod Tracker Displayname",
        TRACKER_DISPLAYNAME_SOURCE_LABEL: displayNameEnvironment.TRACKER_DISPLAYNAME_SOURCE_LABEL || "prod",
        TRACKER_DISPLAYNAME_ENABLED: displayNameEnvironment.TRACKER_DISPLAYNAME_ENABLED || "1",
        TRACKER_DISPLAYNAME_SCHEDULER_ENABLED: displayNameEnvironment.TRACKER_DISPLAYNAME_SCHEDULER_ENABLED || "1",
        TRACKER_DISPLAYNAME_MAINTENANCE_INTERVAL_SECONDS:
          displayNameEnvironment.TRACKER_DISPLAYNAME_MAINTENANCE_INTERVAL_SECONDS || "60",
        TRACKER_DISPLAYNAME_STALE_AFTER_SECONDS:
          displayNameEnvironment.TRACKER_DISPLAYNAME_STALE_AFTER_SECONDS || "86400",
        TRACKER_DISPLAYNAME_BATCH_SIZE: displayNameEnvironment.TRACKER_DISPLAYNAME_BATCH_SIZE || "50",
        TRACKER_DISPLAYNAME_MAX_ACCOUNTS_PER_CYCLE:
          displayNameEnvironment.TRACKER_DISPLAYNAME_MAX_ACCOUNTS_PER_CYCLE || "200",
        TRACKER_DISPLAYNAME_REQUEST_TIMEOUT_MS:
          displayNameEnvironment.TRACKER_DISPLAYNAME_REQUEST_TIMEOUT_MS || "15000",
        TRACKER_DISPLAYNAME_MIN_REQUEST_GAP_MS: displayNameEnvironment.TRACKER_DISPLAYNAME_MIN_REQUEST_GAP_MS || "5000",
        NADEO_GLOBAL_THROTTLE_FILE:
          displayNameEnvironment.NADEO_GLOBAL_THROTTLE_FILE ||
          path.join(roots.altered, "data", "nadeo-global-throttle.txt"),
        NADEO_GLOBAL_MIN_REQUEST_GAP_MS: displayNameEnvironment.NADEO_GLOBAL_MIN_REQUEST_GAP_MS || "5000",
        TRACKER_DISPLAYNAME_API_BASE_URL:
          displayNameEnvironment.TRACKER_DISPLAYNAME_API_BASE_URL || "https://api.trackmania.com",
        TRACKER_DISPLAYNAME_SCOPE: displayNameEnvironment.TRACKER_DISPLAYNAME_SCOPE || "clubs",
        TRACKER_DISPLAYNAME_USER_AGENT:
          displayNameEnvironment.TRACKER_DISPLAYNAME_USER_AGENT || "xjk.yt tracker (admin@xjk.yt)",
        UBI_OAUTH_CLIENT_ID: displayNameEnvironment.UBI_OAUTH_CLIENT_ID || "",
        UBI_OAUTH_CLIENT_SECRET: displayNameEnvironment.UBI_OAUTH_CLIENT_SECRET || "",
        UBI_OAUTH_TOKEN_URL:
          displayNameEnvironment.UBI_OAUTH_TOKEN_URL || "https://api.trackmania.com/api/access_token",
      },
    }),
    defineProcess("tracker-club-hub", {
      env: {
        FRONTEND_DIR: path.join(roots.trackers, "frontend", "__runtime", "club"),
        TRACKER_CLUB_ENABLED: clubEnvironment.TRACKER_CLUB_ENABLED || "1",
        TRACKER_CLUB_PROJECT_KEY: clubEnvironment.TRACKER_CLUB_PROJECT_KEY || "prod-tracker-club",
        TRACKER_CLUB_PROJECT_NAME: clubEnvironment.TRACKER_CLUB_PROJECT_NAME || "Prod Tracker Club",
        TRACKER_CLUB_SOURCE_LABEL: clubEnvironment.TRACKER_CLUB_SOURCE_LABEL || "prod",
        TRACKER_CLUB_AGGREGATOR_BASE_URL:
          clubEnvironment.TRACKER_CLUB_AGGREGATOR_BASE_URL || productionServiceUrl("aggregator-hub", "/api"),
        TRACKER_CLUB_AGGREGATOR_TOKEN:
          clubEnvironment.TRACKER_CLUB_AGGREGATOR_TOKEN || clubEnvironment.AGGREGATOR_INGEST_TOKEN || "",
        TRACKER_CLUB_REQUEST_TIMEOUT_MS: clubEnvironment.TRACKER_CLUB_REQUEST_TIMEOUT_MS || "15000",
      },
    }),
  ];
}

module.exports = { defineTrackerSupportProcesses };
