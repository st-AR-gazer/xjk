import path from "node:path";
import { fileURLToPath } from "node:url";

import { clampInt, firstDefined, loadEnvFile, normalizePath, parseBool, parseList } from "../../shared/xjkAuth.js";

const MODULE_DIR = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_SERVICE_DIR = path.resolve(MODULE_DIR, "..");
const DEFAULT_PUBLIC_BASE_PATH = "/bingo";
const DEFAULT_PORT = 3037;
const LOCAL_STACK_PORT_THRESHOLD = 3100;
const DEFAULT_SESSION_TTL_SECONDS = 12 * 60 * 60;
const DEFAULT_OAUTH_STATE_TTL_SECONDS = 10 * 60;
const DEFAULT_CONSOLE_CLUB_ID = 138640;
const DEFAULT_BINGO_TCP_PORT = 5000;
const DEFAULT_DISPLAYNAME_CACHE_TTL_MS = 6 * 60 * 60 * 1000;
const DEFAULT_REQUEST_TIMEOUT_MS = 15 * 1000;
const DEFAULT_VERIFY_INTERVAL_SECONDS = 60;
const DEFAULT_VERIFY_RETRY_SECONDS = 30;
const DEFAULT_GLOBAL_MIN_REQUEST_GAP_MS = 200;
const DEFAULT_MANUAL_CHECK_LIMIT = 10;
const DEFAULT_MANUAL_CHECK_WINDOW_MS = 60 * 1000;
const DEFAULT_SHARED_AUTH_LOCAL_ORIGIN = "http://localhost:8080";
const DEFAULT_WEB_PLAYER_TTL_MS = 12 * 60 * 60 * 1000;
const DEFAULT_CONSOLE_ROOM_TTL_MS = 24 * 60 * 60 * 1000;
const DEFAULT_CONSOLE_MATCH_TTL_MS = 24 * 60 * 60 * 1000;
const DEFAULT_LIFECYCLE_SWEEP_INTERVAL_MS = 5 * 60 * 1000;
const LOCAL_STACK_SERVICE_PORTS = Object.freeze({
  aggregator: { local: 3140, server: 3040 },
  trackerDisplayname: { local: 3141, server: 3041 },
});

export function normalizeRoutePrefix(value, fallback = "") {
  let raw = String(value || "").trim();
  if (!raw) raw = fallback;
  if (!raw || raw === "/") return "";
  if (!raw.startsWith("/")) raw = `/${raw}`;
  raw = raw.replace(/\/+$/g, "");
  return raw || "";
}

export function joinUrlPath(basePath, leafPath = "/") {
  const normalizedBase = normalizeRoutePrefix(basePath);
  const normalizedLeaf = String(leafPath || "").startsWith("/") ? String(leafPath || "") : `/${String(leafPath || "")}`;
  if (!normalizedBase) return normalizedLeaf || "/";
  if (normalizedLeaf === "/") return `${normalizedBase}/`;
  return `${normalizedBase}${normalizedLeaf}`;
}

export function normalizeCallbackPath(value, publicBasePath) {
  const raw = String(value || "").trim();
  if (!raw) return joinUrlPath(publicBasePath, "/auth/ubisoft/callback");
  if (/^https?:\/\//i.test(raw)) {
    try {
      const url = new URL(raw);
      return normalizeCallbackPath(`${url.pathname || "/"}${url.search || ""}`, publicBasePath);
    } catch {
      return joinUrlPath(publicBasePath, "/auth/ubisoft/callback");
    }
  }
  if (!raw.startsWith("/")) {
    return normalizeCallbackPath(`/${raw}`, publicBasePath);
  }
  if (!publicBasePath) return raw;
  if (raw === publicBasePath || raw.startsWith(`${publicBasePath}/`)) return raw;
  if (raw.startsWith("/auth/")) return joinUrlPath(publicBasePath, raw);
  return raw;
}

export function loopbackApiBaseUrl(port) {
  return `http://127.0.0.1:${port}/api`;
}

function resolveRuntimeDefaults(env) {
  const port = clampInt(env.PORT || DEFAULT_PORT, {
    min: 1,
    max: 65535,
    fallback: DEFAULT_PORT,
  });
  const isLocalStack = port >= LOCAL_STACK_PORT_THRESHOLD;
  const portMode = isLocalStack ? "local" : "server";
  return {
    port,
    isLocalStack,
    aggregatorBaseUrl: loopbackApiBaseUrl(LOCAL_STACK_SERVICE_PORTS.aggregator[portMode]),
    trackerDisplaynameBaseUrl: loopbackApiBaseUrl(LOCAL_STACK_SERVICE_PORTS.trackerDisplayname[portMode]),
  };
}

export function loadConsoleHubConfig({
  env = process.env,
  serviceDir = DEFAULT_SERVICE_DIR,
  repoRoot = path.resolve(serviceDir, "..", ".."),
  loadEnv = true,
} = {}) {
  if (loadEnv) loadEnvFile(path.join(serviceDir, ".env"));

  const DEFAULT_FRONTEND_DIR = path.join(repoRoot, "sites", "console.xjk.yt", "frontend");
  const DEFAULT_DATA_DIR = path.join(repoRoot, "sites", "console.xjk.yt", "data");
  const runtimeDefaults = resolveRuntimeDefaults(env);
  const publicBasePath = normalizeRoutePrefix(
    firstDefined(env.CONSOLE_HUB_PUBLIC_BASE_PATH, env.BINGO_BRIDGE_PUBLIC_BASE_PATH, DEFAULT_PUBLIC_BASE_PATH),
    DEFAULT_PUBLIC_BASE_PATH
  );

  const config = {
    port: runtimeDefaults.port,
    frontendDir: normalizePath(env.FRONTEND_DIR, DEFAULT_FRONTEND_DIR, serviceDir),
    publicBasePath,
    dataDir: normalizePath(
      firstDefined(env.CONSOLE_HUB_DATA_DIR, env.BINGO_BRIDGE_DATA_DIR),
      DEFAULT_DATA_DIR,
      serviceDir
    ),
    dbFile: normalizePath(
      firstDefined(env.CONSOLE_HUB_DB_FILE, env.BINGO_BRIDGE_DB_FILE),
      path.join(DEFAULT_DATA_DIR, "bingo-bridge.sqlite"),
      serviceDir
    ),
    oauthEnabled: parseBool(
      firstDefined(env.CONSOLE_HUB_UBI_OAUTH_ENABLED, env.BINGO_BRIDGE_UBI_OAUTH_ENABLED, env.UBI_OAUTH_ENABLED),
      false
    ),
    clientId: String(
      firstDefined(env.CONSOLE_HUB_UBI_OAUTH_CLIENT_ID, env.BINGO_BRIDGE_UBI_OAUTH_CLIENT_ID, env.UBI_OAUTH_CLIENT_ID)
    ).trim(),
    clientSecret: String(
      firstDefined(
        env.CONSOLE_HUB_UBI_OAUTH_CLIENT_SECRET,
        env.BINGO_BRIDGE_UBI_OAUTH_CLIENT_SECRET,
        env.UBI_OAUTH_CLIENT_SECRET
      )
    ).trim(),
    authorizeUrl: String(
      firstDefined(
        env.CONSOLE_HUB_UBI_OAUTH_AUTHORIZE_URL,
        env.BINGO_BRIDGE_UBI_OAUTH_AUTHORIZE_URL,
        env.UBI_OAUTH_AUTHORIZE_URL,
        "https://api.trackmania.com/oauth/authorize"
      )
    ).trim(),
    tokenUrl: String(
      firstDefined(
        env.CONSOLE_HUB_UBI_OAUTH_TOKEN_URL,
        env.BINGO_BRIDGE_UBI_OAUTH_TOKEN_URL,
        env.UBI_OAUTH_TOKEN_URL,
        "https://api.trackmania.com/api/access_token"
      )
    ).trim(),
    userInfoUrl: String(
      firstDefined(
        env.CONSOLE_HUB_UBI_OAUTH_USERINFO_URL,
        env.BINGO_BRIDGE_UBI_OAUTH_USERINFO_URL,
        env.UBI_OAUTH_USERINFO_URL,
        "https://api.trackmania.com/api/user"
      )
    ).trim(),
    scope:
      String(
        firstDefined(env.CONSOLE_HUB_UBI_OAUTH_SCOPE, env.BINGO_BRIDGE_UBI_OAUTH_SCOPE, env.UBI_OAUTH_SCOPE, "clubs")
      ).trim() || "clubs",
    callbackPath: normalizeCallbackPath(
      firstDefined(
        env.CONSOLE_HUB_UBI_OAUTH_CALLBACK_PATH,
        env.BINGO_BRIDGE_UBI_OAUTH_CALLBACK_PATH,
        env.UBI_OAUTH_CALLBACK_PATH,
        ""
      ),
      publicBasePath
    ),
    sessionCookieName: String(
      firstDefined(env.CONSOLE_HUB_SESSION_COOKIE_NAME, env.BINGO_BRIDGE_SESSION_COOKIE_NAME, "console_hub_session")
    ).trim(),
    sessionTtlSeconds: clampInt(
      firstDefined(
        env.CONSOLE_HUB_SESSION_TTL_SECONDS,
        env.BINGO_BRIDGE_SESSION_TTL_SECONDS,
        DEFAULT_SESSION_TTL_SECONDS
      ),
      {
        min: 300,
        max: 30 * 24 * 60 * 60,
        fallback: DEFAULT_SESSION_TTL_SECONDS,
      }
    ),
    oauthStateTtlSeconds: clampInt(
      firstDefined(
        env.CONSOLE_HUB_OAUTH_STATE_TTL_SECONDS,
        env.BINGO_BRIDGE_OAUTH_STATE_TTL_SECONDS,
        DEFAULT_OAUTH_STATE_TTL_SECONDS
      ),
      {
        min: 60,
        max: 3600,
        fallback: DEFAULT_OAUTH_STATE_TTL_SECONDS,
      }
    ),
    operatorSubjects: parseList(
      firstDefined(
        env.CONSOLE_HUB_OPERATOR_SUBJECTS,
        env.BINGO_BRIDGE_OPERATOR_SUBJECTS,
        env.UBI_OAUTH_ALLOWED_SUBJECTS
      )
    ),
    operatorUsernames: parseList(
      firstDefined(
        env.CONSOLE_HUB_OPERATOR_USERNAMES,
        env.BINGO_BRIDGE_OPERATOR_USERNAMES,
        env.UBI_OAUTH_ALLOWED_USERNAMES,
        "ar"
      )
    ),
    clubId: clampInt(firstDefined(env.CONSOLE_HUB_CLUB_ID, env.BINGO_BRIDGE_CLUB_ID, DEFAULT_CONSOLE_CLUB_ID), {
      min: 1,
      max: 2147483647,
      fallback: DEFAULT_CONSOLE_CLUB_ID,
    }),
    clubLabel: String(firstDefined(env.CONSOLE_HUB_CLUB_LABEL, env.BINGO_BRIDGE_CLUB_LABEL, "Bingo On Console")).trim(),
    clubRootName: String(firstDefined(env.CONSOLE_HUB_CLUB_ROOT_NAME, env.BINGO_BRIDGE_CLUB_ROOT_NAME, "Rooms")).trim(),
    roomRegion:
      String(firstDefined(env.CONSOLE_HUB_ROOM_REGION, env.BINGO_BRIDGE_ROOM_REGION, "eu-west")).trim() || "eu-west",
    roomMaxPlayers: clampInt(firstDefined(env.CONSOLE_HUB_ROOM_MAX_PLAYERS, env.BINGO_BRIDGE_ROOM_MAX_PLAYERS, 1), {
      min: 1,
      max: 64,
      fallback: 1,
    }),
    roomScript: String(
      firstDefined(
        env.CONSOLE_HUB_ROOM_SCRIPT,
        env.BINGO_BRIDGE_ROOM_SCRIPT,
        "TrackMania/TM_TimeAttack_Online.Script.txt"
      )
    ).trim(),
    bingoTcpHost: String(
      firstDefined(env.CONSOLE_HUB_BINGO_TCP_HOST, env.BINGO_BRIDGE_BINGO_TCP_HOST, "127.0.0.1")
    ).trim(),
    bingoTcpPort: clampInt(
      firstDefined(env.CONSOLE_HUB_BINGO_TCP_PORT, env.BINGO_BRIDGE_BINGO_TCP_PORT, DEFAULT_BINGO_TCP_PORT),
      {
        min: 1,
        max: 65535,
        fallback: DEFAULT_BINGO_TCP_PORT,
      }
    ),
    bingoHttpBaseUrl: String(
      firstDefined(env.CONSOLE_HUB_BINGO_HTTP_BASE_URL, env.BINGO_BRIDGE_BINGO_HTTP_BASE_URL)
    ).trim(),
    bingoPluginVersion: String(
      firstDefined(env.CONSOLE_HUB_BINGO_PLUGIN_VERSION, env.BINGO_BRIDGE_BINGO_PLUGIN_VERSION, "5.0")
    ).trim(),
    bingoAuthSecret: String(firstDefined(env.CONSOLE_HUB_BINGO_AUTH_SECRET, env.BINGO_BRIDGE_BINGO_AUTH_SECRET)).trim(),
    bingoAllowDevKeyExchange: parseBool(
      firstDefined(env.CONSOLE_HUB_BINGO_ALLOW_DEV_KEY_EXCHANGE, env.BINGO_BRIDGE_BINGO_ALLOW_DEV_KEY_EXCHANGE, "0"),
      false
    ),
    directoryAccountId: String(
      firstDefined(env.CONSOLE_HUB_DIRECTORY_ACCOUNT_ID, env.BINGO_BRIDGE_DIRECTORY_ACCOUNT_ID)
    ).trim(),
    directoryDisplayName: String(
      firstDefined(env.CONSOLE_HUB_DIRECTORY_DISPLAY_NAME, env.BINGO_BRIDGE_DIRECTORY_DISPLAY_NAME, "Console Directory")
    ).trim(),
    operatorAccessToken: String(
      firstDefined(env.CONSOLE_HUB_OPERATOR_ACCESS_TOKEN, env.BINGO_BRIDGE_OPERATOR_ACCESS_TOKEN)
    ).trim(),
    operatorRefreshToken: String(
      firstDefined(env.CONSOLE_HUB_OPERATOR_REFRESH_TOKEN, env.BINGO_BRIDGE_OPERATOR_REFRESH_TOKEN)
    ).trim(),
    serviceLogin: String(env.TM_SERVICE_ACCOUNT_LOGIN || "").trim(),
    servicePassword: String(env.TM_SERVICE_ACCOUNT_PASSWORD || "").trim(),
    aggregatorBaseUrl: String(
      firstDefined(
        env.CONSOLE_HUB_AGGREGATOR_BASE_URL,
        env.BINGO_BRIDGE_AGGREGATOR_BASE_URL,
        env.AGGREGATOR_BASE_URL,
        runtimeDefaults.aggregatorBaseUrl
      )
    ).trim(),
    aggregatorToken: String(
      firstDefined(env.CONSOLE_HUB_AGGREGATOR_TOKEN, env.BINGO_BRIDGE_AGGREGATOR_TOKEN, env.AGGREGATOR_TOKEN)
    ).trim(),
    trackerDisplaynameBaseUrl: String(
      firstDefined(
        env.CONSOLE_HUB_TRACKER_DISPLAYNAME_BASE_URL,
        env.BINGO_BRIDGE_TRACKER_DISPLAYNAME_BASE_URL,
        env.TRACKER_DISPLAYNAME_BASE_URL,
        runtimeDefaults.trackerDisplaynameBaseUrl
      )
    ).trim(),
    displayNameCacheTtlMs: clampInt(
      firstDefined(
        env.CONSOLE_HUB_DISPLAYNAME_CACHE_TTL_MS,
        env.BINGO_BRIDGE_DISPLAYNAME_CACHE_TTL_MS,
        DEFAULT_DISPLAYNAME_CACHE_TTL_MS
      ),
      {
        min: 30000,
        max: 30 * 24 * 60 * 60 * 1000,
        fallback: DEFAULT_DISPLAYNAME_CACHE_TTL_MS,
      }
    ),
    requestTimeoutMs: clampInt(
      firstDefined(env.CONSOLE_HUB_REQUEST_TIMEOUT_MS, env.BINGO_BRIDGE_REQUEST_TIMEOUT_MS, DEFAULT_REQUEST_TIMEOUT_MS),
      {
        min: 1000,
        max: 120000,
        fallback: DEFAULT_REQUEST_TIMEOUT_MS,
      }
    ),
    verifyIntervalSeconds: clampInt(
      firstDefined(
        env.CONSOLE_HUB_VERIFY_INTERVAL_SECONDS,
        env.BINGO_BRIDGE_VERIFY_INTERVAL_SECONDS,
        DEFAULT_VERIFY_INTERVAL_SECONDS
      ),
      {
        min: 15,
        max: 3600,
        fallback: DEFAULT_VERIFY_INTERVAL_SECONDS,
      }
    ),
    verifyRetrySeconds: clampInt(
      firstDefined(
        env.CONSOLE_HUB_VERIFY_RETRY_SECONDS,
        env.BINGO_BRIDGE_VERIFY_RETRY_SECONDS,
        DEFAULT_VERIFY_RETRY_SECONDS
      ),
      {
        min: 5,
        max: 300,
        fallback: DEFAULT_VERIFY_RETRY_SECONDS,
      }
    ),
    manualCheckLimit: clampInt(
      firstDefined(env.CONSOLE_HUB_MANUAL_CHECK_LIMIT, env.BINGO_BRIDGE_MANUAL_CHECK_LIMIT, DEFAULT_MANUAL_CHECK_LIMIT),
      {
        min: 1,
        max: 120,
        fallback: DEFAULT_MANUAL_CHECK_LIMIT,
      }
    ),
    manualCheckWindowMs: clampInt(
      firstDefined(
        env.CONSOLE_HUB_MANUAL_CHECK_WINDOW_MS,
        env.BINGO_BRIDGE_MANUAL_CHECK_WINDOW_MS,
        DEFAULT_MANUAL_CHECK_WINDOW_MS
      ),
      {
        min: 1000,
        max: 60 * 60 * 1000,
        fallback: DEFAULT_MANUAL_CHECK_WINDOW_MS,
      }
    ),
    webPlayerTtlMs: clampInt(
      firstDefined(env.CONSOLE_HUB_WEB_PLAYER_TTL_MS, env.BINGO_BRIDGE_WEB_PLAYER_TTL_MS, DEFAULT_WEB_PLAYER_TTL_MS),
      {
        min: 5 * 60 * 1000,
        max: 7 * 24 * 60 * 60 * 1000,
        fallback: DEFAULT_WEB_PLAYER_TTL_MS,
      }
    ),
    consoleRoomTtlMs: clampInt(
      firstDefined(
        env.CONSOLE_HUB_CONSOLE_ROOM_TTL_MS,
        env.BINGO_BRIDGE_CONSOLE_ROOM_TTL_MS,
        DEFAULT_CONSOLE_ROOM_TTL_MS
      ),
      {
        min: 5 * 60 * 1000,
        max: 7 * 24 * 60 * 60 * 1000,
        fallback: DEFAULT_CONSOLE_ROOM_TTL_MS,
      }
    ),
    consoleMatchTtlMs: clampInt(
      firstDefined(
        env.CONSOLE_HUB_CONSOLE_MATCH_TTL_MS,
        env.BINGO_BRIDGE_CONSOLE_MATCH_TTL_MS,
        DEFAULT_CONSOLE_MATCH_TTL_MS
      ),
      {
        min: 5 * 60 * 1000,
        max: 7 * 24 * 60 * 60 * 1000,
        fallback: DEFAULT_CONSOLE_MATCH_TTL_MS,
      }
    ),
    lifecycleSweepIntervalMs: clampInt(
      firstDefined(
        env.CONSOLE_HUB_LIFECYCLE_SWEEP_INTERVAL_MS,
        env.BINGO_BRIDGE_LIFECYCLE_SWEEP_INTERVAL_MS,
        DEFAULT_LIFECYCLE_SWEEP_INTERVAL_MS
      ),
      {
        min: 30 * 1000,
        max: 60 * 60 * 1000,
        fallback: DEFAULT_LIFECYCLE_SWEEP_INTERVAL_MS,
      }
    ),
    globalThrottleFile: normalizePath(
      env.NADEO_GLOBAL_THROTTLE_FILE,
      path.join(DEFAULT_DATA_DIR, "nadeo-global-throttle.txt"),
      serviceDir
    ),
    globalMinRequestGapMs: clampInt(env.NADEO_GLOBAL_MIN_REQUEST_GAP_MS || DEFAULT_GLOBAL_MIN_REQUEST_GAP_MS, {
      min: 0,
      max: 60000,
      fallback: DEFAULT_GLOBAL_MIN_REQUEST_GAP_MS,
    }),
    userAgent: String(
      firstDefined(env.CONSOLE_HUB_USER_AGENT, env.BINGO_BRIDGE_USER_AGENT, "console.xjk.yt/1.0 (+https://xjk.yt/)")
    ).trim(),
    sharedAuthEnabled: parseBool(
      firstDefined(env.CONSOLE_HUB_SHARED_AUTH_ENABLED, env.XJK_SHARED_AUTH_ENABLED, 1),
      true
    ),
    sharedAuthDbFile: normalizePath(
      firstDefined(env.XJK_AUTH_DB_FILE),
      path.join(repoRoot, "sites", "xjk.yt", "data", "xjk-auth.sqlite"),
      serviceDir
    ),
    sharedAuthOrigin: String(
      firstDefined(
        env.XJK_PUBLIC_ORIGIN,
        env.XJK_AUTH_PUBLIC_ORIGIN,
        runtimeDefaults.isLocalStack ? DEFAULT_SHARED_AUTH_LOCAL_ORIGIN : "https://xjk.yt"
      )
    ).trim(),
    sharedAuthLocalOrigin: String(firstDefined(env.XJK_LOCAL_PUBLIC_ORIGIN, DEFAULT_SHARED_AUTH_LOCAL_ORIGIN)).trim(),
    sharedAuthSessionCookieName: String(firstDefined(env.XJK_AUTH_SESSION_COOKIE_NAME, "xjk_session")).trim(),
    sharedAuthSessionCookieDomain: String(env.XJK_AUTH_SESSION_COOKIE_DOMAIN || ".xjk.yt").trim(),
    sharedAuthAllowedReturnHosts: parseList(
      firstDefined(
        env.XJK_AUTH_ALLOWED_RETURN_HOSTS,
        "xjk.yt,www.xjk.yt,learn.xjk.yt,console.xjk.yt,altered.xjk.yt,archive.xjk.yt,trackers.xjk.yt,aggregator.xjk.yt,dash.xjk.yt,plugins.xjk.yt,tools.xjk.yt,localhost,127.0.0.1,xjk.localhost,console.localhost,learn.localhost,altered.localhost,bingo.localhost,archive.localhost,trackers.localhost,aggregator.localhost,dash.localhost,plugins.localhost,tools.localhost"
      )
    ),
  };

  return config;
}
