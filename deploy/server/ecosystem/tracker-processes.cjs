const path = require("node:path");

function defineTrackerProcesses({
  aggregatorUpstreamCredentials,
  defineProcess,
  optionalEnvVarFor,
  productionServiceUrl,
  roots,
  serviceEnvironments,
  wrWebhookCredentials,
}) {
  const alteredEnvironment = serviceEnvironments.forService("altered-hub");
  const bannerEnvironment = serviceEnvironments.forService("bannerbuilder");
  const trackerEnvironment = serviceEnvironments.forService("tracker-hub");
  const leaderboardEnvironment = serviceEnvironments.forService("tracker-leaderboard-hub");

  function createSharedTrackerEnvironment(environment, serviceId) {
    return {
      TRACKER_NADEO_AUTH_MODE: environment.TRACKER_NADEO_AUTH_MODE || "basic",
      ...optionalEnvVarFor(serviceId, "TRACKER_NADEO_DEDI_LOGIN", "TRACKER_UBI_EMAIL", "NADEO_ACCOUNT_EMAIL"),
      ...optionalEnvVarFor(serviceId, "TRACKER_NADEO_DEDI_PASSWORD", "TRACKER_UBI_PASSWORD", "NADEO_ACCOUNT_PASSWORD"),
      ...optionalEnvVarFor(serviceId, "TRACKER_NADEO_LIVE_ACCESS_TOKEN"),
      ...optionalEnvVarFor(serviceId, "TRACKER_NADEO_LIVE_REFRESH_TOKEN"),
      TRACKER_PROVIDER: "nadeo-live",
      TRACKER_MAX_CHECK_INTERVAL_SECONDS: "3600",
      TRACKER_MIN_REQUEST_GAP_MS: "3000",
      NADEO_GLOBAL_THROTTLE_FILE:
        environment.NADEO_GLOBAL_THROTTLE_FILE || path.join(roots.altered, "data", "nadeo-global-throttle.txt"),
      NADEO_GLOBAL_MIN_REQUEST_GAP_MS: "3000",
    };
  }

  return [
    defineProcess("altered-hub", {
      authoritativeEnv: {
        TRACKER_ADMIN_TOKEN: aggregatorUpstreamCredentials.TRACKER_ADMIN_TOKEN,
        ALTERED_INTERNAL_TOKEN: aggregatorUpstreamCredentials.ALTERED_INTERNAL_TOKEN,
        ALTERED_WR_WEBHOOK_SECRET: wrWebhookCredentials.ALTERED_WR_WEBHOOK_SECRET,
      },
      env: {
        FRONTEND_DIR: path.join(roots.altered, "frontend"),
        TRACKER_PUBLIC_BASE_URL: productionServiceUrl("tracker-hub", "/api"),
        TRACKER_ADMIN_BASE_URL: productionServiceUrl("tracker-hub", "/api/admin"),
        TRACKER_DISPLAYNAME_BASE_URL: productionServiceUrl("tracker-displayname-hub", "/api"),
        TRACKER_CLUB_BASE_URL: productionServiceUrl("tracker-club-hub", "/api"),
        AGGREGATOR_BASE_URL: productionServiceUrl("aggregator-hub", "/api"),
        AGGREGATOR_TOKEN: alteredEnvironment.AGGREGATOR_TOKEN || alteredEnvironment.AGGREGATOR_INGEST_TOKEN || "",
        TRACKER_PROXY_TIMEOUT_MS: alteredEnvironment.TRACKER_PROXY_TIMEOUT_MS || "15000",
        NADEO_GLOBAL_THROTTLE_FILE:
          alteredEnvironment.NADEO_GLOBAL_THROTTLE_FILE ||
          path.join(roots.altered, "data", "nadeo-global-throttle.txt"),
        NADEO_GLOBAL_MIN_REQUEST_GAP_MS: alteredEnvironment.NADEO_GLOBAL_MIN_REQUEST_GAP_MS || "5000",
        ALTERED_ADMIN_TOKEN: alteredEnvironment.ALTERED_ADMIN_TOKEN || "",
        UBI_OAUTH_ENABLED: alteredEnvironment.UBI_OAUTH_ENABLED || "0",
        UBI_OAUTH_CLIENT_ID: alteredEnvironment.UBI_OAUTH_CLIENT_ID || "",
        UBI_OAUTH_CLIENT_SECRET: alteredEnvironment.UBI_OAUTH_CLIENT_SECRET || "",
        UBI_OAUTH_AUTHORIZE_URL: alteredEnvironment.UBI_OAUTH_AUTHORIZE_URL || "",
        UBI_OAUTH_TOKEN_URL: alteredEnvironment.UBI_OAUTH_TOKEN_URL || "",
        UBI_OAUTH_USERINFO_URL: alteredEnvironment.UBI_OAUTH_USERINFO_URL || "",
        UBI_OAUTH_SCOPE: alteredEnvironment.UBI_OAUTH_SCOPE || "openid profile",
        UBI_OAUTH_CALLBACK_PATH: alteredEnvironment.UBI_OAUTH_CALLBACK_PATH || "/auth/ubisoft/callback",
        UBI_OAUTH_ALLOWED_SUBJECTS: alteredEnvironment.UBI_OAUTH_ALLOWED_SUBJECTS || "",
        UBI_OAUTH_ALLOWED_USERNAMES: alteredEnvironment.UBI_OAUTH_ALLOWED_USERNAMES || "",
        ALTERED_SESSION_COOKIE_NAME: alteredEnvironment.ALTERED_SESSION_COOKIE_NAME || "altered_admin_session",
        ALTERED_SESSION_TTL_SECONDS: alteredEnvironment.ALTERED_SESSION_TTL_SECONDS || "43200",
        ALTERED_OAUTH_STATE_TTL_SECONDS: alteredEnvironment.ALTERED_OAUTH_STATE_TTL_SECONDS || "600",
        ALTERED_LIVE_MONITOR_ENABLED: alteredEnvironment.ALTERED_LIVE_MONITOR_ENABLED || "0",
        ALTERED_LIVE_AUTH_MODE:
          alteredEnvironment.ALTERED_LIVE_AUTH_MODE || alteredEnvironment.TRACKER_NADEO_AUTH_MODE || "basic",
        ...optionalEnvVarFor("altered-hub", "ALTERED_LIVE_DEDI_LOGIN", "TRACKER_NADEO_DEDI_LOGIN"),
        ...optionalEnvVarFor("altered-hub", "ALTERED_LIVE_DEDI_PASSWORD", "TRACKER_NADEO_DEDI_PASSWORD"),
        ...optionalEnvVarFor("altered-hub", "ALTERED_LIVE_ACCESS_TOKEN", "TRACKER_NADEO_LIVE_ACCESS_TOKEN"),
        ...optionalEnvVarFor("altered-hub", "ALTERED_LIVE_REFRESH_TOKEN", "TRACKER_NADEO_LIVE_REFRESH_TOKEN"),
      },
    }),
    defineProcess("bannerbuilder", {
      env: {
        HOST: "127.0.0.1",
        FLASK_DEBUG: bannerEnvironment.BANNERBUILDER_LEGACY_DEBUG || "0",
        TRUST_PROXY: bannerEnvironment.BANNERBUILDER_LEGACY_TRUST_PROXY || "1",
        DASHMAP_USER: bannerEnvironment.DASHMAP_USER || "",
        ...optionalEnvVarFor("bannerbuilder", "DASHMAP_API_KEY"),
        ...optionalEnvVarFor("bannerbuilder", "SECRET_KEY", "BANNERBUILDER_LEGACY_SECRET_KEY", "SECRET_KEY"),
        ...optionalEnvVarFor("bannerbuilder", "ADMIN_PWHASH", "BANNERBUILDER_LEGACY_ADMIN_PWHASH", "ADMIN_PWHASH"),
        ...optionalEnvVarFor(
          "bannerbuilder",
          "ADMIN_PASSWORD",
          "BANNERBUILDER_LEGACY_ADMIN_PASSWORD",
          "ADMIN_PASSWORD"
        ),
      },
    }),
    defineProcess("tracker-hub", {
      authoritativeEnv: {
        TRACKER_ADMIN_TOKEN: aggregatorUpstreamCredentials.TRACKER_ADMIN_TOKEN,
        TRACKER_WR_WEBHOOK_SECRET: wrWebhookCredentials.TRACKER_WR_WEBHOOK_SECRET,
      },
      env: {
        FRONTEND_DIR: path.join(roots.trackers, "frontend", "__runtime", "wr"),
        DATA_DIR: path.join(roots.altered, "data"),
        DB_FILE: path.join(roots.altered, "data", "altered-tracker.sqlite"),
        ...createSharedTrackerEnvironment(trackerEnvironment, "tracker-hub"),
        TRACKER_ENABLED: "1",
        TRACKER_MODE: trackerEnvironment.TRACKER_MODE || "wr",
        TRACKER_LEADERBOARD_TOP_N: trackerEnvironment.TRACKER_LEADERBOARD_TOP_N || "1",
        TRACKER_TOKEN_CACHE_FILE:
          trackerEnvironment.TRACKER_TOKEN_CACHE_FILE || path.join(roots.altered, "data", "nadeo-token-cache.json"),
        TRACKER_TICK_SECONDS: trackerEnvironment.TRACKER_TICK_SECONDS || "15",
        TRACKER_BATCH_SIZE: trackerEnvironment.TRACKER_BATCH_SIZE || "20",
        TRACKER_REQUEST_TIMEOUT_MS: trackerEnvironment.TRACKER_REQUEST_TIMEOUT_MS || "15000",
        TRACKER_USER_AGENT: trackerEnvironment.TRACKER_USER_AGENT || "xjk.yt tracker (admin@xjk.yt)",
        TRACKER_WR_WEBHOOK_ENABLED: trackerEnvironment.TRACKER_WR_WEBHOOK_ENABLED || "1",
        TRACKER_WR_WEBHOOK_URL:
          trackerEnvironment.TRACKER_WR_WEBHOOK_URL || productionServiceUrl("altered-hub", "/api/v1/webhook/wr"),
        TRACKER_WR_WEBHOOK_TIMEOUT_MS: trackerEnvironment.TRACKER_WR_WEBHOOK_TIMEOUT_MS || "5000",
        TRACKER_AGGREGATOR_ENABLED: trackerEnvironment.TRACKER_AGGREGATOR_ENABLED || "1",
        TRACKER_AGGREGATOR_BASE_URL:
          trackerEnvironment.TRACKER_AGGREGATOR_BASE_URL || productionServiceUrl("aggregator-hub", "/api"),
        TRACKER_AGGREGATOR_TOKEN:
          trackerEnvironment.TRACKER_AGGREGATOR_TOKEN || trackerEnvironment.AGGREGATOR_INGEST_TOKEN || "",
        TRACKER_AGGREGATOR_PROJECT_KEY: trackerEnvironment.TRACKER_AGGREGATOR_PROJECT_KEY || "prod-tracker-main",
        TRACKER_AGGREGATOR_PROJECT_NAME: trackerEnvironment.TRACKER_AGGREGATOR_PROJECT_NAME || "Prod Tracker Main",
        TRACKER_AGGREGATOR_SOURCE_LABEL: trackerEnvironment.TRACKER_AGGREGATOR_SOURCE_LABEL || "prod",
      },
    }),
    defineProcess("tracker-leaderboard-hub", {
      authoritativeEnv: {
        TRACKER_ADMIN_TOKEN: aggregatorUpstreamCredentials.TRACKER_ADMIN_TOKEN,
        TRACKER_ENABLED: "1",
        TRACKER_MODE: "leaderboard",
        TRACKER_PROVIDER: "nadeo-live",
        TRACKER_WR_WEBHOOK_ENABLED: "0",
      },
      env: {
        FRONTEND_DIR: path.join(roots.trackers, "frontend", "__runtime", "leaderboard"),
        DATA_DIR: path.join(roots.altered, "data"),
        DB_FILE: path.join(roots.altered, "data", "altered-tracker-leaderboard.sqlite"),
        ...createSharedTrackerEnvironment(leaderboardEnvironment, "tracker-leaderboard-hub"),
        TRACKER_ENABLED: "1",
        TRACKER_MODE: "leaderboard",
        TRACKER_LEADERBOARD_TOP_N: leaderboardEnvironment.TRACKER_LEADERBOARD_TOP_N || "100",
        TRACKER_TOKEN_CACHE_FILE:
          leaderboardEnvironment.TRACKER_LEADERBOARD_TOKEN_CACHE_FILE ||
          leaderboardEnvironment.TRACKER_TOKEN_CACHE_FILE ||
          path.join(roots.altered, "data", "nadeo-token-cache.json"),
        TRACKER_LIVE_GROUP_UID: leaderboardEnvironment.TRACKER_LIVE_GROUP_UID || "Personal_Best",
        TRACKER_LIVE_ONLY_WORLD: leaderboardEnvironment.TRACKER_LIVE_ONLY_WORLD || "1",
        TRACKER_TICK_SECONDS: leaderboardEnvironment.TRACKER_LEADERBOARD_TICK_SECONDS || "15",
        TRACKER_BATCH_SIZE: leaderboardEnvironment.TRACKER_LEADERBOARD_BATCH_SIZE || "10",
        TRACKER_REQUEST_TIMEOUT_MS:
          leaderboardEnvironment.TRACKER_LEADERBOARD_REQUEST_TIMEOUT_MS ||
          leaderboardEnvironment.TRACKER_REQUEST_TIMEOUT_MS ||
          "15000",
        TRACKER_USER_AGENT:
          leaderboardEnvironment.TRACKER_LEADERBOARD_USER_AGENT ||
          leaderboardEnvironment.TRACKER_USER_AGENT ||
          "xjk.yt tracker (admin@xjk.yt)",
        TRACKER_WR_WEBHOOK_ENABLED: "0",
        TRACKER_AGGREGATOR_ENABLED: leaderboardEnvironment.TRACKER_AGGREGATOR_ENABLED || "1",
        TRACKER_AGGREGATOR_BASE_URL:
          leaderboardEnvironment.TRACKER_AGGREGATOR_BASE_URL || productionServiceUrl("aggregator-hub", "/api"),
        TRACKER_AGGREGATOR_TOKEN:
          leaderboardEnvironment.TRACKER_AGGREGATOR_TOKEN || leaderboardEnvironment.AGGREGATOR_INGEST_TOKEN || "",
        TRACKER_AGGREGATOR_PROJECT_KEY:
          leaderboardEnvironment.TRACKER_LEADERBOARD_AGGREGATOR_PROJECT_KEY || "prod-tracker-leaderboard",
        TRACKER_AGGREGATOR_PROJECT_NAME:
          leaderboardEnvironment.TRACKER_LEADERBOARD_AGGREGATOR_PROJECT_NAME || "Prod Tracker Leaderboard",
        TRACKER_AGGREGATOR_SOURCE_LABEL: leaderboardEnvironment.TRACKER_LEADERBOARD_AGGREGATOR_SOURCE_LABEL || "prod",
        TRACKER_INSTANCE_ID: leaderboardEnvironment.TRACKER_LEADERBOARD_INSTANCE_ID || "prod-tracker-leaderboard",
        TRACKER_INSTANCE_NAME: leaderboardEnvironment.TRACKER_LEADERBOARD_INSTANCE_NAME || "Prod Tracker Leaderboard",
      },
    }),
  ];
}

module.exports = { defineTrackerProcesses };
