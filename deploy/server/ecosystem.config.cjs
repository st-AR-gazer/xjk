const fs = require("fs");
const path = require("path");

const repoRoot = path.resolve(__dirname, "..", "..");
const sitesRoot = path.join(repoRoot, "sites");
const toolsDomainRoot = path.join(sitesRoot, "tools.xjk.yt");
const pluginsDomainRoot = path.join(sitesRoot, "plugins.xjk.yt");
const alteredDomainRoot = path.join(sitesRoot, "altered.xjk.yt");
const trackerDomainRoot = path.join(sitesRoot, "tracker.xjk.yt");
const aggregatorDomainRoot = path.join(sitesRoot, "aggregator.xjk.yt");
const dashDomainRoot = path.join(sitesRoot, "dash.xjk.yt");
const trackerDisplaynameDomainRoot = path.join(sitesRoot, "tracker-displayname.xjk.yt");
const trackerClubDomainRoot = path.join(sitesRoot, "tracker-club.xjk.yt");
const alteredServiceRoot = path.join(repoRoot, "services", "altered");
const trackerServiceRoot = path.join(repoRoot, "services", "tracker");
const aggregatorServiceRoot = path.join(repoRoot, "services", "aggregator");
const trackerDisplaynameServiceRoot = path.join(repoRoot, "services", "tracker-displayname");
const trackerClubServiceRoot = path.join(repoRoot, "services", "tracker-club");

function loadEnvFile(filePath) {
  if (!filePath || !fs.existsSync(filePath)) {
    return;
  }

  const lines = fs.readFileSync(filePath, "utf8").split(/\r?\n/);
  for (const rawLine of lines) {
    const line = String(rawLine || "").trim();
    if (!line || line.startsWith("#")) {
      continue;
    }

    const equalsIndex = line.indexOf("=");
    if (equalsIndex <= 0) {
      continue;
    }

    const key = line.slice(0, equalsIndex).trim();
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(key)) {
      continue;
    }

    let value = line.slice(equalsIndex + 1);
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }

    process.env[key] = value;
  }
}

[
  path.join(repoRoot, "deploy", "server", ".env"),
  path.join(repoRoot, "services", "altered", ".env"),
  path.join(repoRoot, "services", "tracker", ".env"),
  path.join(repoRoot, "services", "tracker-displayname", ".env"),
  path.join(repoRoot, "services", "tracker-club", ".env"),
].forEach(loadEnvFile);

function optionalEnvVar(targetKey, ...sourceKeys) {
  const keys = [targetKey, ...sourceKeys].filter(Boolean);
  for (const key of keys) {
    const value = process.env[key];
    if (typeof value === "string" && value.trim()) {
      return { [targetKey]: value };
    }
  }
  return {};
}

module.exports = {
  apps: [
    {
      name: "xjk-plugins-hub",
      cwd: path.join(pluginsDomainRoot, "Plugins-Hub", "backend"),
      script: "server.js",
      interpreter: "node",
      env: {
        NODE_ENV: "production",
        PORT: "3020",
        FRONTEND_DIR: path.join(pluginsDomainRoot, "Plugins-Hub", "frontend"),
        DATA_DIR: path.join(pluginsDomainRoot, "Plugins-Hub", "data"),
        PLUGINS_FILE: path.join(pluginsDomainRoot, "Plugins-Hub", "data", "plugins.json"),
      },
    },
    {
      name: "xjk-altered-hub",
      cwd: alteredServiceRoot,
      script: "server.js",
      interpreter: "node",
      env: {
        NODE_ENV: "production",
        PORT: "3030",
        FRONTEND_DIR: path.join(alteredDomainRoot, "frontend"),
        TRACKER_PUBLIC_BASE_URL: "http://127.0.0.1:3031/api",
        TRACKER_ADMIN_BASE_URL: "http://127.0.0.1:3031/api/admin",
        TRACKER_DISPLAYNAME_BASE_URL: "http://127.0.0.1:3041/api",
        TRACKER_CLUB_BASE_URL: "http://127.0.0.1:3042/api",
        AGGREGATOR_BASE_URL: "http://127.0.0.1:3040/api",
        AGGREGATOR_TOKEN: process.env.AGGREGATOR_TOKEN || process.env.AGGREGATOR_INGEST_TOKEN || "",
        TRACKER_PROXY_TIMEOUT_MS: process.env.TRACKER_PROXY_TIMEOUT_MS || "15000",
        NADEO_GLOBAL_THROTTLE_FILE:
          process.env.NADEO_GLOBAL_THROTTLE_FILE ||
          path.join(alteredDomainRoot, "data", "nadeo-global-throttle.txt"),
        NADEO_GLOBAL_MIN_REQUEST_GAP_MS:
          process.env.NADEO_GLOBAL_MIN_REQUEST_GAP_MS || "5000",
        ALTERED_ADMIN_TOKEN: process.env.ALTERED_ADMIN_TOKEN || "",
        TRACKER_ADMIN_TOKEN: process.env.TRACKER_ADMIN_TOKEN || "",
        ALTERED_WR_WEBHOOK_SECRET:
          process.env.ALTERED_WR_WEBHOOK_SECRET ||
          process.env.TRACKER_ADMIN_TOKEN ||
          process.env.ALTERED_ADMIN_TOKEN ||
          "",
        UBI_OAUTH_ENABLED: process.env.UBI_OAUTH_ENABLED || "0",
        UBI_OAUTH_CLIENT_ID: process.env.UBI_OAUTH_CLIENT_ID || "",
        UBI_OAUTH_CLIENT_SECRET: process.env.UBI_OAUTH_CLIENT_SECRET || "",
        UBI_OAUTH_AUTHORIZE_URL: process.env.UBI_OAUTH_AUTHORIZE_URL || "",
        UBI_OAUTH_TOKEN_URL: process.env.UBI_OAUTH_TOKEN_URL || "",
        UBI_OAUTH_USERINFO_URL: process.env.UBI_OAUTH_USERINFO_URL || "",
        UBI_OAUTH_SCOPE: process.env.UBI_OAUTH_SCOPE || "openid profile",
        UBI_OAUTH_CALLBACK_PATH: process.env.UBI_OAUTH_CALLBACK_PATH || "/auth/ubisoft/callback",
        UBI_OAUTH_ALLOWED_SUBJECTS: process.env.UBI_OAUTH_ALLOWED_SUBJECTS || "",
        UBI_OAUTH_ALLOWED_USERNAMES: process.env.UBI_OAUTH_ALLOWED_USERNAMES || "",
        ALTERED_SESSION_COOKIE_NAME: process.env.ALTERED_SESSION_COOKIE_NAME || "altered_admin_session",
        ALTERED_SESSION_TTL_SECONDS: process.env.ALTERED_SESSION_TTL_SECONDS || "43200",
        ALTERED_OAUTH_STATE_TTL_SECONDS: process.env.ALTERED_OAUTH_STATE_TTL_SECONDS || "600",
      },
    },
    {
      name: "xjk-tracker-hub",
      cwd: trackerServiceRoot,
      script: "server.js",
      interpreter: "node",
      env: {
        NODE_ENV: "production",
        PORT: "3031",
        FRONTEND_DIR: path.join(trackerDomainRoot, "frontend"),
        DATA_DIR: path.join(alteredDomainRoot, "data"),
        DB_FILE: path.join(alteredDomainRoot, "data", "altered-tracker.sqlite"),
        TRACKER_ENABLED: "1",
        TRACKER_MODE: process.env.TRACKER_MODE || "wr",
        TRACKER_LEADERBOARD_TOP_N: process.env.TRACKER_LEADERBOARD_TOP_N || "1",
        TRACKER_PROVIDER: "nadeo-live",
        TRACKER_NADEO_AUTH_MODE: process.env.TRACKER_NADEO_AUTH_MODE || "basic",
        ...optionalEnvVar(
          "TRACKER_NADEO_DEDI_LOGIN",
          "TRACKER_UBI_EMAIL",
          "NADEO_ACCOUNT_EMAIL"
        ),
        ...optionalEnvVar(
          "TRACKER_NADEO_DEDI_PASSWORD",
          "TRACKER_UBI_PASSWORD",
          "NADEO_ACCOUNT_PASSWORD"
        ),
        ...optionalEnvVar("TRACKER_NADEO_LIVE_ACCESS_TOKEN"),
        ...optionalEnvVar("TRACKER_NADEO_LIVE_REFRESH_TOKEN"),
        TRACKER_TOKEN_CACHE_FILE:
          process.env.TRACKER_TOKEN_CACHE_FILE ||
          path.join(alteredDomainRoot, "data", "nadeo-token-cache.json"),
        TRACKER_TICK_SECONDS: process.env.TRACKER_TICK_SECONDS || "15",
        TRACKER_BATCH_SIZE: process.env.TRACKER_BATCH_SIZE || "20",
        TRACKER_MAX_CHECK_INTERVAL_SECONDS: "3600",
        TRACKER_REQUEST_TIMEOUT_MS: process.env.TRACKER_REQUEST_TIMEOUT_MS || "15000",
        TRACKER_MIN_REQUEST_GAP_MS: "3000",
        NADEO_GLOBAL_THROTTLE_FILE:
          process.env.NADEO_GLOBAL_THROTTLE_FILE ||
          path.join(alteredDomainRoot, "data", "nadeo-global-throttle.txt"),
        NADEO_GLOBAL_MIN_REQUEST_GAP_MS: "3000",
        TRACKER_USER_AGENT:
          process.env.TRACKER_USER_AGENT || "altered project by ar, contact @ar___ on discord",
        TRACKER_WR_WEBHOOK_ENABLED: process.env.TRACKER_WR_WEBHOOK_ENABLED || "1",
        TRACKER_WR_WEBHOOK_URL:
          process.env.TRACKER_WR_WEBHOOK_URL || "http://127.0.0.1:3030/api/v1/webhook/wr",
        TRACKER_WR_WEBHOOK_SECRET:
          process.env.TRACKER_WR_WEBHOOK_SECRET ||
          process.env.ALTERED_WR_WEBHOOK_SECRET ||
          process.env.TRACKER_ADMIN_TOKEN ||
          process.env.ALTERED_ADMIN_TOKEN ||
          "",
        TRACKER_WR_WEBHOOK_TIMEOUT_MS: process.env.TRACKER_WR_WEBHOOK_TIMEOUT_MS || "5000",
        TRACKER_AGGREGATOR_ENABLED: process.env.TRACKER_AGGREGATOR_ENABLED || "1",
        TRACKER_AGGREGATOR_BASE_URL:
          process.env.TRACKER_AGGREGATOR_BASE_URL || "http://127.0.0.1:3040/api",
        TRACKER_AGGREGATOR_TOKEN:
          process.env.TRACKER_AGGREGATOR_TOKEN || process.env.AGGREGATOR_INGEST_TOKEN || "",
        TRACKER_AGGREGATOR_PROJECT_KEY:
          process.env.TRACKER_AGGREGATOR_PROJECT_KEY || "prod-tracker-main",
        TRACKER_AGGREGATOR_PROJECT_NAME:
          process.env.TRACKER_AGGREGATOR_PROJECT_NAME || "Prod Tracker Main",
        TRACKER_AGGREGATOR_SOURCE_LABEL: process.env.TRACKER_AGGREGATOR_SOURCE_LABEL || "prod",
      },
    },
    {
      name: "xjk-tracker-leaderboard-hub",
      cwd: trackerServiceRoot,
      script: "server.js",
      interpreter: "node",
      env: {
        NODE_ENV: "production",
        PORT: "3043",
        FRONTEND_DIR: path.join(trackerDomainRoot, "frontend"),
        DATA_DIR: path.join(alteredDomainRoot, "data"),
        DB_FILE: path.join(alteredDomainRoot, "data", "altered-tracker-leaderboard.sqlite"),
        TRACKER_ENABLED: "1",
        TRACKER_MODE: "leaderboard",
        TRACKER_LEADERBOARD_TOP_N: process.env.TRACKER_LEADERBOARD_TOP_N || "100",
        TRACKER_PROVIDER: "nadeo-live",
        TRACKER_NADEO_AUTH_MODE: process.env.TRACKER_NADEO_AUTH_MODE || "basic",
        ...optionalEnvVar(
          "TRACKER_NADEO_DEDI_LOGIN",
          "TRACKER_UBI_EMAIL",
          "NADEO_ACCOUNT_EMAIL"
        ),
        ...optionalEnvVar(
          "TRACKER_NADEO_DEDI_PASSWORD",
          "TRACKER_UBI_PASSWORD",
          "NADEO_ACCOUNT_PASSWORD"
        ),
        ...optionalEnvVar("TRACKER_NADEO_LIVE_ACCESS_TOKEN"),
        ...optionalEnvVar("TRACKER_NADEO_LIVE_REFRESH_TOKEN"),
        TRACKER_TOKEN_CACHE_FILE:
          process.env.TRACKER_LEADERBOARD_TOKEN_CACHE_FILE ||
          process.env.TRACKER_TOKEN_CACHE_FILE ||
          path.join(alteredDomainRoot, "data", "nadeo-token-cache.json"),
        TRACKER_LIVE_GROUP_UID: process.env.TRACKER_LIVE_GROUP_UID || "Personal_Best",
        TRACKER_LIVE_ONLY_WORLD: process.env.TRACKER_LIVE_ONLY_WORLD || "1",
        TRACKER_TICK_SECONDS: process.env.TRACKER_LEADERBOARD_TICK_SECONDS || "15",
        TRACKER_BATCH_SIZE: process.env.TRACKER_LEADERBOARD_BATCH_SIZE || "10",
        TRACKER_MAX_CHECK_INTERVAL_SECONDS: "3600",
        TRACKER_REQUEST_TIMEOUT_MS:
          process.env.TRACKER_LEADERBOARD_REQUEST_TIMEOUT_MS ||
          process.env.TRACKER_REQUEST_TIMEOUT_MS ||
          "15000",
        TRACKER_MIN_REQUEST_GAP_MS: "3000",
        NADEO_GLOBAL_THROTTLE_FILE:
          process.env.NADEO_GLOBAL_THROTTLE_FILE ||
          path.join(alteredDomainRoot, "data", "nadeo-global-throttle.txt"),
        NADEO_GLOBAL_MIN_REQUEST_GAP_MS: "3000",
        TRACKER_USER_AGENT:
          process.env.TRACKER_LEADERBOARD_USER_AGENT ||
          process.env.TRACKER_USER_AGENT ||
          "altered project by ar, contact @ar___ on discord",
        TRACKER_WR_WEBHOOK_ENABLED: "0",
        TRACKER_AGGREGATOR_ENABLED: process.env.TRACKER_AGGREGATOR_ENABLED || "1",
        TRACKER_AGGREGATOR_BASE_URL:
          process.env.TRACKER_AGGREGATOR_BASE_URL || "http://127.0.0.1:3040/api",
        TRACKER_AGGREGATOR_TOKEN:
          process.env.TRACKER_AGGREGATOR_TOKEN || process.env.AGGREGATOR_INGEST_TOKEN || "",
        TRACKER_AGGREGATOR_PROJECT_KEY:
          process.env.TRACKER_LEADERBOARD_AGGREGATOR_PROJECT_KEY || "prod-tracker-leaderboard",
        TRACKER_AGGREGATOR_PROJECT_NAME:
          process.env.TRACKER_LEADERBOARD_AGGREGATOR_PROJECT_NAME || "Prod Tracker Leaderboard",
        TRACKER_AGGREGATOR_SOURCE_LABEL:
          process.env.TRACKER_LEADERBOARD_AGGREGATOR_SOURCE_LABEL || "prod",
        TRACKER_INSTANCE_ID:
          process.env.TRACKER_LEADERBOARD_INSTANCE_ID || "prod-tracker-leaderboard",
        TRACKER_INSTANCE_NAME:
          process.env.TRACKER_LEADERBOARD_INSTANCE_NAME || "Prod Tracker Leaderboard",
      },
    },
    {
      name: "xjk-aggregator-hub",
      cwd: aggregatorServiceRoot,
      script: "server.js",
      interpreter: "node",
      env: {
        NODE_ENV: "production",
        PORT: "3040",
        FRONTEND_DIR: path.join(aggregatorDomainRoot, "frontend"),
        DASH_FRONTEND_DIR: path.join(dashDomainRoot, "frontend"),
        DATA_DIR: path.join(alteredDomainRoot, "data"),
        DB_FILE: path.join(alteredDomainRoot, "data", "tracker-aggregator.sqlite"),
        AGGREGATOR_INGEST_TOKEN: process.env.AGGREGATOR_INGEST_TOKEN || "",
        DASH_ADMIN_TOKEN: process.env.DASH_ADMIN_TOKEN || process.env.AGGREGATOR_INGEST_TOKEN || "",
        DASH_TRACKER_ADMIN_TOKEN:
          process.env.DASH_TRACKER_ADMIN_TOKEN || process.env.TRACKER_ADMIN_TOKEN || "",
        TRACKER_ADMIN_TOKEN:
          process.env.TRACKER_ADMIN_TOKEN || process.env.DASH_TRACKER_ADMIN_TOKEN || "",
        DASH_HOSTNAMES: process.env.DASH_HOSTNAMES || "dash.xjk.yt,dash.localhost",
      },
    },
    {
      name: "xjk-tracker-displayname-hub",
      cwd: trackerDisplaynameServiceRoot,
      script: "server.js",
      interpreter: "node",
      env: {
        NODE_ENV: "production",
        PORT: "3041",
        FRONTEND_DIR: path.join(trackerDisplaynameDomainRoot, "frontend"),
        TRACKER_DISPLAYNAME_AGGREGATOR_BASE_URL:
          process.env.TRACKER_DISPLAYNAME_AGGREGATOR_BASE_URL || "http://127.0.0.1:3040/api",
        TRACKER_DISPLAYNAME_AGGREGATOR_TOKEN:
          process.env.TRACKER_DISPLAYNAME_AGGREGATOR_TOKEN ||
          process.env.AGGREGATOR_INGEST_TOKEN ||
          "",
        TRACKER_DISPLAYNAME_PROJECT_KEY:
          process.env.TRACKER_DISPLAYNAME_PROJECT_KEY || "prod-tracker-displayname",
        TRACKER_DISPLAYNAME_PROJECT_NAME:
          process.env.TRACKER_DISPLAYNAME_PROJECT_NAME || "Prod Tracker Displayname",
        TRACKER_DISPLAYNAME_SOURCE_LABEL: process.env.TRACKER_DISPLAYNAME_SOURCE_LABEL || "prod",
        TRACKER_DISPLAYNAME_ENABLED: process.env.TRACKER_DISPLAYNAME_ENABLED || "1",
        TRACKER_DISPLAYNAME_SCHEDULER_ENABLED:
          process.env.TRACKER_DISPLAYNAME_SCHEDULER_ENABLED || "1",
        TRACKER_DISPLAYNAME_MAINTENANCE_INTERVAL_SECONDS:
          process.env.TRACKER_DISPLAYNAME_MAINTENANCE_INTERVAL_SECONDS || "60",
        TRACKER_DISPLAYNAME_STALE_AFTER_SECONDS:
          process.env.TRACKER_DISPLAYNAME_STALE_AFTER_SECONDS || "86400",
        TRACKER_DISPLAYNAME_BATCH_SIZE: process.env.TRACKER_DISPLAYNAME_BATCH_SIZE || "50",
        TRACKER_DISPLAYNAME_MAX_ACCOUNTS_PER_CYCLE:
          process.env.TRACKER_DISPLAYNAME_MAX_ACCOUNTS_PER_CYCLE || "200",
        TRACKER_DISPLAYNAME_REQUEST_TIMEOUT_MS:
          process.env.TRACKER_DISPLAYNAME_REQUEST_TIMEOUT_MS || "15000",
        TRACKER_DISPLAYNAME_MIN_REQUEST_GAP_MS:
          process.env.TRACKER_DISPLAYNAME_MIN_REQUEST_GAP_MS || "5000",
        NADEO_GLOBAL_THROTTLE_FILE:
          process.env.NADEO_GLOBAL_THROTTLE_FILE ||
          path.join(alteredDomainRoot, "data", "nadeo-global-throttle.txt"),
        NADEO_GLOBAL_MIN_REQUEST_GAP_MS:
          process.env.NADEO_GLOBAL_MIN_REQUEST_GAP_MS || "5000",
        TRACKER_DISPLAYNAME_API_BASE_URL:
          process.env.TRACKER_DISPLAYNAME_API_BASE_URL || "https://api.trackmania.com",
        TRACKER_DISPLAYNAME_SCOPE: process.env.TRACKER_DISPLAYNAME_SCOPE || "clubs",
        TRACKER_DISPLAYNAME_USER_AGENT:
          process.env.TRACKER_DISPLAYNAME_USER_AGENT ||
          "altered project by ar, contact @ar___ on discord",
        UBI_OAUTH_CLIENT_ID: process.env.UBI_OAUTH_CLIENT_ID || "",
        UBI_OAUTH_CLIENT_SECRET: process.env.UBI_OAUTH_CLIENT_SECRET || "",
        UBI_OAUTH_TOKEN_URL:
          process.env.UBI_OAUTH_TOKEN_URL || "https://api.trackmania.com/api/access_token",
      },
    },
    {
      name: "xjk-tracker-club-hub",
      cwd: trackerClubServiceRoot,
      script: "server.js",
      interpreter: "node",
      env: {
        NODE_ENV: "production",
        PORT: "3042",
        FRONTEND_DIR: path.join(trackerClubDomainRoot, "frontend"),
        TRACKER_CLUB_ENABLED: process.env.TRACKER_CLUB_ENABLED || "1",
        TRACKER_CLUB_PROJECT_KEY: process.env.TRACKER_CLUB_PROJECT_KEY || "prod-tracker-club",
        TRACKER_CLUB_PROJECT_NAME: process.env.TRACKER_CLUB_PROJECT_NAME || "Prod Tracker Club",
        TRACKER_CLUB_SOURCE_LABEL: process.env.TRACKER_CLUB_SOURCE_LABEL || "prod",
        TRACKER_CLUB_AGGREGATOR_BASE_URL:
          process.env.TRACKER_CLUB_AGGREGATOR_BASE_URL || "http://127.0.0.1:3040/api",
        TRACKER_CLUB_AGGREGATOR_TOKEN:
          process.env.TRACKER_CLUB_AGGREGATOR_TOKEN || process.env.AGGREGATOR_INGEST_TOKEN || "",
        TRACKER_CLUB_REQUEST_TIMEOUT_MS: process.env.TRACKER_CLUB_REQUEST_TIMEOUT_MS || "15000",
      },
    },
    {
      name: "xjk-tools-hub",
      cwd: path.join(toolsDomainRoot, "Tools-Hub", "backend"),
      script: "server.js",
      interpreter: "node",
      env: {
        NODE_ENV: "production",
        PORT: "3010",
        FRONTEND_DIR: path.join(toolsDomainRoot, "Tools-Hub", "frontend"),
        DATA_DIR: path.join(toolsDomainRoot, "Tools-Hub", "data"),
        TOOLS_FILE: path.join(toolsDomainRoot, "Tools-Hub", "data", "tools.json"),
      },
    },
    {
      name: "xjk-tools-strip",
      cwd: path.join(toolsDomainRoot, "Strip-RaceValidationGhost", "backend"),
      script: "server.js",
      interpreter: "node",
      env: {
        NODE_ENV: "production",
        PORT: "3011",
        FRONTEND_DIR: path.join(toolsDomainRoot, "Strip-RaceValidationGhost", "frontend"),
        UPLOAD_DIR: path.join(toolsDomainRoot, "Strip-RaceValidationGhost", "data", "uploads"),
        OUTPUT_DIR: path.join(toolsDomainRoot, "Strip-RaceValidationGhost", "data", "processed"),
        TOOL_PATH: path.join(toolsDomainRoot, "Strip-RaceValidationGhost", "tools", "stripValidationReplay.exe"),
      },
    },
    {
      name: "xjk-tools-embed",
      cwd: path.join(toolsDomainRoot, "Embed-RaceValidationGhost", "backend"),
      script: "server.js",
      interpreter: "node",
      env: {
        NODE_ENV: "production",
        PORT: "3012",
        FRONTEND_DIR: path.join(toolsDomainRoot, "Embed-RaceValidationGhost", "frontend"),
        UPLOAD_DIR: path.join(toolsDomainRoot, "Embed-RaceValidationGhost", "data", "uploads"),
        OUTPUT_DIR: path.join(toolsDomainRoot, "Embed-RaceValidationGhost", "data", "processed"),
        TOOL_PATH: path.join(toolsDomainRoot, "Embed-RaceValidationGhost", "tools", "EmbedRaceValidationGhost.exe"),
        REPLAY_EXTRACT_TOOL_PATH: path.join(
          toolsDomainRoot,
          "Embed-RaceValidationGhost",
          "tools",
          "ReplayDataExtractor.exe"
        ),
        GBXLZO_PATH: path.join(toolsDomainRoot, "Strip-RaceValidationGhost", "tools", "gbxlzo.exe"),
      },
    },
    {
      name: "xjk-tools-embedded-checker",
      cwd: path.join(toolsDomainRoot, "Embedded-Blocks-And-Items-Checker", "backend"),
      script: "server.js",
      interpreter: "node",
      env: {
        NODE_ENV: "production",
        PORT: "3013",
        FRONTEND_DIR: path.join(toolsDomainRoot, "Embedded-Blocks-And-Items-Checker", "frontend"),
        UPLOAD_DIR: path.join(toolsDomainRoot, "Embedded-Blocks-And-Items-Checker", "data", "uploads"),
        OUTPUT_DIR: path.join(toolsDomainRoot, "Embedded-Blocks-And-Items-Checker", "data", "processed"),
        TOOL_PATH: path.join(
          toolsDomainRoot,
          "Embedded-Blocks-And-Items-Checker",
          "tools",
          "EmbeddedBlocksAndItemsChecker.exe"
        ),
      },
    },
    {
      name: "xjk-tools-extract-replay",
      cwd: path.join(toolsDomainRoot, "Extract-Replay-Data", "backend"),
      script: "server.js",
      interpreter: "node",
      env: {
        NODE_ENV: "production",
        PORT: "3014",
        FRONTEND_DIR: path.join(toolsDomainRoot, "Extract-Replay-Data", "frontend"),
        UPLOAD_DIR: path.join(toolsDomainRoot, "Extract-Replay-Data", "data", "uploads"),
        OUTPUT_DIR: path.join(toolsDomainRoot, "Extract-Replay-Data", "data", "processed"),
        TOOL_PATH: path.join(toolsDomainRoot, "Extract-Replay-Data", "tools", "ReplayDataExtractor.exe"),
      },
    },
    {
      name: "xjk-tools-medal-modifier",
      cwd: path.join(toolsDomainRoot, "Gbx-Medal-Time-Modifier", "backend"),
      script: "server.js",
      interpreter: "node",
      env: {
        NODE_ENV: "production",
        PORT: "3015",
        FRONTEND_DIR: path.join(toolsDomainRoot, "Gbx-Medal-Time-Modifier", "frontend"),
        UPLOAD_DIR: path.join(toolsDomainRoot, "Gbx-Medal-Time-Modifier", "data", "uploads"),
        OUTPUT_DIR: path.join(toolsDomainRoot, "Gbx-Medal-Time-Modifier", "data", "processed"),
        TOOL_PATH: path.join(toolsDomainRoot, "Gbx-Medal-Time-Modifier", "tools", "GbxMedalTimeModifier.exe"),
      },
    },
    {
      name: "xjk-tools-map-validation",
      cwd: path.join(toolsDomainRoot, "Map-Validation-Checker", "backend"),
      script: "server.js",
      interpreter: "node",
      env: {
        NODE_ENV: "production",
        PORT: "3016",
        FRONTEND_DIR: path.join(toolsDomainRoot, "Map-Validation-Checker", "frontend"),
        UPLOAD_DIR: path.join(toolsDomainRoot, "Map-Validation-Checker", "data", "uploads"),
        OUTPUT_DIR: path.join(toolsDomainRoot, "Map-Validation-Checker", "data", "processed"),
        TOOL_PATH: path.join(toolsDomainRoot, "Map-Validation-Checker", "tools", "MapValidationChecker.exe"),
      },
    },
  ],
};

