const path = require("node:path");

function environmentValue(environment, names, fallback = "") {
  for (const name of names) {
    if (environment[name]) return environment[name];
  }
  return fallback;
}

function defineConsoleProcess({ defineProcess, productionServiceUrl, roots, serviceEnvironments }) {
  const environment = serviceEnvironments.forService("console-hub");
  const value = (names, fallback = "") => environmentValue(environment, names, fallback);

  return defineProcess("console-hub", {
    env: {
      FRONTEND_DIR: path.join(roots.console, "frontend"),
      CONSOLE_HUB_DATA_DIR: path.join(roots.console, "data"),
      CONSOLE_HUB_DB_FILE: value(
        ["CONSOLE_HUB_DB_FILE", "BINGO_BRIDGE_DB_FILE"],
        path.join(roots.console, "data", "bingo-bridge.sqlite")
      ),
      CONSOLE_HUB_PUBLIC_BASE_PATH: value(["CONSOLE_HUB_PUBLIC_BASE_PATH", "BINGO_BRIDGE_PUBLIC_BASE_PATH"], "/bingo"),
      CONSOLE_HUB_UBI_OAUTH_ENABLED: value(
        [
          "CONSOLE_HUB_UBI_OAUTH_ENABLED",
          "BINGO_BRIDGE_UBI_OAUTH_ENABLED",
          "UBI_OAUTH_ENABLED",
          "LEARN_UBI_OAUTH_ENABLED",
        ],
        "0"
      ),
      CONSOLE_HUB_UBI_OAUTH_CLIENT_ID: value([
        "CONSOLE_HUB_UBI_OAUTH_CLIENT_ID",
        "BINGO_BRIDGE_UBI_OAUTH_CLIENT_ID",
        "UBI_OAUTH_CLIENT_ID",
        "LEARN_UBI_OAUTH_CLIENT_ID",
      ]),
      CONSOLE_HUB_UBI_OAUTH_CLIENT_SECRET: value([
        "CONSOLE_HUB_UBI_OAUTH_CLIENT_SECRET",
        "BINGO_BRIDGE_UBI_OAUTH_CLIENT_SECRET",
        "UBI_OAUTH_CLIENT_SECRET",
        "LEARN_UBI_OAUTH_CLIENT_SECRET",
      ]),
      CONSOLE_HUB_UBI_OAUTH_AUTHORIZE_URL: value(
        [
          "CONSOLE_HUB_UBI_OAUTH_AUTHORIZE_URL",
          "BINGO_BRIDGE_UBI_OAUTH_AUTHORIZE_URL",
          "UBI_OAUTH_AUTHORIZE_URL",
          "LEARN_UBI_OAUTH_AUTHORIZE_URL",
        ],
        "https://api.trackmania.com/oauth/authorize"
      ),
      CONSOLE_HUB_UBI_OAUTH_TOKEN_URL: value(
        [
          "CONSOLE_HUB_UBI_OAUTH_TOKEN_URL",
          "BINGO_BRIDGE_UBI_OAUTH_TOKEN_URL",
          "UBI_OAUTH_TOKEN_URL",
          "LEARN_UBI_OAUTH_TOKEN_URL",
        ],
        "https://api.trackmania.com/api/access_token"
      ),
      CONSOLE_HUB_UBI_OAUTH_USERINFO_URL: value(
        [
          "CONSOLE_HUB_UBI_OAUTH_USERINFO_URL",
          "BINGO_BRIDGE_UBI_OAUTH_USERINFO_URL",
          "UBI_OAUTH_USERINFO_URL",
          "LEARN_UBI_OAUTH_USERINFO_URL",
        ],
        "https://api.trackmania.com/api/user"
      ),
      CONSOLE_HUB_UBI_OAUTH_SCOPE: value(
        ["CONSOLE_HUB_UBI_OAUTH_SCOPE", "BINGO_BRIDGE_UBI_OAUTH_SCOPE", "UBI_OAUTH_SCOPE", "LEARN_UBI_OAUTH_SCOPE"],
        "clubs"
      ),
      CONSOLE_HUB_UBI_OAUTH_CALLBACK_PATH: value(
        ["CONSOLE_HUB_UBI_OAUTH_CALLBACK_PATH", "BINGO_BRIDGE_UBI_OAUTH_CALLBACK_PATH", "UBI_OAUTH_CALLBACK_PATH"],
        "/bingo/auth/ubisoft/callback"
      ),
      CONSOLE_HUB_SESSION_COOKIE_NAME: value(
        ["CONSOLE_HUB_SESSION_COOKIE_NAME", "BINGO_BRIDGE_SESSION_COOKIE_NAME"],
        "console_hub_session"
      ),
      CONSOLE_HUB_SESSION_TTL_SECONDS: value(
        ["CONSOLE_HUB_SESSION_TTL_SECONDS", "BINGO_BRIDGE_SESSION_TTL_SECONDS"],
        "43200"
      ),
      CONSOLE_HUB_OAUTH_STATE_TTL_SECONDS: value(
        ["CONSOLE_HUB_OAUTH_STATE_TTL_SECONDS", "BINGO_BRIDGE_OAUTH_STATE_TTL_SECONDS"],
        "600"
      ),
      CONSOLE_HUB_OPERATOR_SUBJECTS: value([
        "CONSOLE_HUB_OPERATOR_SUBJECTS",
        "BINGO_BRIDGE_OPERATOR_SUBJECTS",
        "UBI_OAUTH_ALLOWED_SUBJECTS",
      ]),
      CONSOLE_HUB_OPERATOR_USERNAMES: value([
        "CONSOLE_HUB_OPERATOR_USERNAMES",
        "BINGO_BRIDGE_OPERATOR_USERNAMES",
        "UBI_OAUTH_ALLOWED_USERNAMES",
      ]),
      CONSOLE_HUB_CLUB_ID: value(["CONSOLE_HUB_CLUB_ID", "BINGO_BRIDGE_CLUB_ID"], "138640"),
      CONSOLE_HUB_CLUB_LABEL: value(["CONSOLE_HUB_CLUB_LABEL", "BINGO_BRIDGE_CLUB_LABEL"], "Bingo On Console"),
      CONSOLE_HUB_CLUB_ROOT_NAME: value(["CONSOLE_HUB_CLUB_ROOT_NAME", "BINGO_BRIDGE_CLUB_ROOT_NAME"], "Rooms"),
      CONSOLE_HUB_ROOM_REGION: value(["CONSOLE_HUB_ROOM_REGION", "BINGO_BRIDGE_ROOM_REGION"], "eu-west"),
      CONSOLE_HUB_ROOM_MAX_PLAYERS: value(["CONSOLE_HUB_ROOM_MAX_PLAYERS", "BINGO_BRIDGE_ROOM_MAX_PLAYERS"], "1"),
      CONSOLE_HUB_ROOM_SCRIPT: value(
        ["CONSOLE_HUB_ROOM_SCRIPT", "BINGO_BRIDGE_ROOM_SCRIPT"],
        "TrackMania/TM_TimeAttack_Online.Script.txt"
      ),
      CONSOLE_HUB_BINGO_TCP_HOST: value(["CONSOLE_HUB_BINGO_TCP_HOST", "BINGO_BRIDGE_BINGO_TCP_HOST"], "127.0.0.1"),
      CONSOLE_HUB_BINGO_TCP_PORT: value(["CONSOLE_HUB_BINGO_TCP_PORT", "BINGO_BRIDGE_BINGO_TCP_PORT"], "5000"),
      CONSOLE_HUB_BINGO_HTTP_BASE_URL: value(["CONSOLE_HUB_BINGO_HTTP_BASE_URL", "BINGO_BRIDGE_BINGO_HTTP_BASE_URL"]),
      CONSOLE_HUB_BINGO_PLUGIN_VERSION: value(
        ["CONSOLE_HUB_BINGO_PLUGIN_VERSION", "BINGO_BRIDGE_BINGO_PLUGIN_VERSION"],
        "5.0"
      ),
      CONSOLE_HUB_BINGO_AUTH_SECRET: value(["CONSOLE_HUB_BINGO_AUTH_SECRET", "BINGO_BRIDGE_BINGO_AUTH_SECRET"]),
      CONSOLE_HUB_DIRECTORY_ACCOUNT_ID: value([
        "CONSOLE_HUB_DIRECTORY_ACCOUNT_ID",
        "BINGO_BRIDGE_DIRECTORY_ACCOUNT_ID",
      ]),
      CONSOLE_HUB_DIRECTORY_DISPLAY_NAME: value(
        ["CONSOLE_HUB_DIRECTORY_DISPLAY_NAME", "BINGO_BRIDGE_DIRECTORY_DISPLAY_NAME"],
        "Console Directory"
      ),
      CONSOLE_HUB_OPERATOR_ACCESS_TOKEN: value([
        "CONSOLE_HUB_OPERATOR_ACCESS_TOKEN",
        "BINGO_BRIDGE_OPERATOR_ACCESS_TOKEN",
      ]),
      CONSOLE_HUB_OPERATOR_REFRESH_TOKEN: value([
        "CONSOLE_HUB_OPERATOR_REFRESH_TOKEN",
        "BINGO_BRIDGE_OPERATOR_REFRESH_TOKEN",
      ]),
      TM_SERVICE_ACCOUNT_LOGIN: value(["TM_SERVICE_ACCOUNT_LOGIN"]),
      TM_SERVICE_ACCOUNT_PASSWORD: value(["TM_SERVICE_ACCOUNT_PASSWORD"]),
      AGGREGATOR_BASE_URL: value(
        ["CONSOLE_HUB_AGGREGATOR_BASE_URL", "BINGO_BRIDGE_AGGREGATOR_BASE_URL", "AGGREGATOR_BASE_URL"],
        productionServiceUrl("aggregator-hub", "/api")
      ),
      AGGREGATOR_TOKEN: value([
        "CONSOLE_HUB_AGGREGATOR_TOKEN",
        "BINGO_BRIDGE_AGGREGATOR_TOKEN",
        "AGGREGATOR_TOKEN",
        "AGGREGATOR_INGEST_TOKEN",
      ]),
      TRACKER_DISPLAYNAME_BASE_URL: value(
        [
          "CONSOLE_HUB_TRACKER_DISPLAYNAME_BASE_URL",
          "BINGO_BRIDGE_TRACKER_DISPLAYNAME_BASE_URL",
          "TRACKER_DISPLAYNAME_BASE_URL",
        ],
        productionServiceUrl("tracker-displayname-hub", "/api")
      ),
      NADEO_GLOBAL_THROTTLE_FILE: value(
        ["NADEO_GLOBAL_THROTTLE_FILE"],
        path.join(roots.console, "data", "nadeo-global-throttle.txt")
      ),
      NADEO_GLOBAL_MIN_REQUEST_GAP_MS: value(["NADEO_GLOBAL_MIN_REQUEST_GAP_MS"], "5000"),
      CONSOLE_HUB_VERIFY_INTERVAL_SECONDS: value(
        ["CONSOLE_HUB_VERIFY_INTERVAL_SECONDS", "BINGO_BRIDGE_VERIFY_INTERVAL_SECONDS"],
        "120"
      ),
      CONSOLE_HUB_VERIFY_RETRY_SECONDS: value(
        ["CONSOLE_HUB_VERIFY_RETRY_SECONDS", "BINGO_BRIDGE_VERIFY_RETRY_SECONDS"],
        "30"
      ),
      CONSOLE_HUB_DISPLAYNAME_CACHE_TTL_MS: value(
        ["CONSOLE_HUB_DISPLAYNAME_CACHE_TTL_MS", "BINGO_BRIDGE_DISPLAYNAME_CACHE_TTL_MS"],
        "21600000"
      ),
      CONSOLE_HUB_REQUEST_TIMEOUT_MS: value(
        ["CONSOLE_HUB_REQUEST_TIMEOUT_MS", "BINGO_BRIDGE_REQUEST_TIMEOUT_MS"],
        "15000"
      ),
    },
  });
}

module.exports = { defineConsoleProcess, environmentValue };
