import path from "node:path";
import { fileURLToPath } from "node:url";
import { buildXjkOauthReturnHosts } from "../../shared/xjk-auth/oauth-return-hosts.js";
import { parseEnvFile } from "../../shared/envUtils.js";
import {
  clampInt,
  DEFAULT_XJK_SESSION_TTL_SECONDS,
  firstDefined,
  loadXjkAdminIdentityConfig,
  normalizePath,
  parseList,
} from "../../shared/xjkAuth.js";

const serviceDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const repoRoot = path.resolve(serviceDir, "..", "..");
const defaultFrontendDir = path.join(repoRoot, "sites", "xjk.yt", "frontend");
const defaultAccountDir = path.join(repoRoot, "sites", "account.xjk.yt", "frontend");
const defaultSharedDir = path.join(repoRoot, "sites", "shared");
const defaultDataDir = path.join(repoRoot, "sites", "xjk.yt", "data");

function mergeMissingEnvironment(environment, values, include = () => true) {
  for (const [key, value] of Object.entries(values)) {
    if (!include(key)) continue;
    if (environment[key] !== undefined && String(environment[key]).trim() !== "") continue;
    environment[key] = value;
  }
}

function isSharedXjkAuthSetting(key) {
  return String(key || "").startsWith("XJK_") || String(key || "").startsWith("UBI_OAUTH_");
}

function loadXjkAuthEnvironment({ environment = process.env } = {}) {
  mergeMissingEnvironment(environment, parseEnvFile(path.join(serviceDir, ".env")));
  for (const filePath of [
    path.join(repoRoot, "deploy", "server", ".env"),
    path.join(repoRoot, "services", "console-hub", ".env"),
    path.join(repoRoot, "services", "learn-profile", ".env"),
    path.join(repoRoot, "services", "altered", ".env"),
  ]) {
    mergeMissingEnvironment(environment, parseEnvFile(filePath), isSharedXjkAuthSetting);
  }
  return environment;
}

function loadXjkAuthConfig({ env = process.env, loadEnvironment = true } = {}) {
  if (loadEnvironment) loadXjkAuthEnvironment({ environment: env });
  const inferredPort = clampInt(env.PORT || 3038, { min: 1, max: 65535, fallback: 3038 });
  const isLocalStack = inferredPort >= 3100;
  const requestTimeoutMs = clampInt(env.XJK_AUTH_REQUEST_TIMEOUT_MS || 15000, {
    min: 1000,
    max: 120000,
    fallback: 15000,
  });

  return {
    port: inferredPort,
    frontendDir: normalizePath(env.FRONTEND_DIR, defaultFrontendDir, serviceDir),
    accountDir: normalizePath(env.XJK_ACCOUNT_FRONTEND_DIR, defaultAccountDir, serviceDir),
    sharedDir: normalizePath(env.XJK_SHARED_FRONTEND_DIR, defaultSharedDir, serviceDir),
    dataDir: normalizePath(env.XJK_AUTH_DATA_DIR, defaultDataDir, serviceDir),
    dbFile: normalizePath(
      firstDefined(env.XJK_AUTH_DB_FILE, path.join(defaultDataDir, "xjk-auth.sqlite")),
      path.join(defaultDataDir, "xjk-auth.sqlite"),
      serviceDir
    ),
    publicOrigin: String(
      firstDefined(
        env.XJK_PUBLIC_ORIGIN,
        env.XJK_AUTH_PUBLIC_ORIGIN,
        isLocalStack ? "http://localhost:8080" : "https://xjk.yt"
      )
    ).trim(),
    localOrigin: String(firstDefined(env.XJK_LOCAL_PUBLIC_ORIGIN, "http://localhost:8080")).trim(),
    callbackPath: String(
      firstDefined(env.UBI_OAUTH_CALLBACK_PATH, env.XJK_AUTH_CALLBACK_PATH, "/auth/ubisoft/callback")
    ).trim(),
    sessionCookieName: String(firstDefined(env.XJK_AUTH_SESSION_COOKIE_NAME, "xjk_session")).trim(),
    sessionCookieDomain: String(env.XJK_AUTH_SESSION_COOKIE_DOMAIN || ".xjk.yt").trim(),
    sessionTtlSeconds: clampInt(env.XJK_AUTH_SESSION_TTL_SECONDS || DEFAULT_XJK_SESSION_TTL_SECONDS, {
      min: 300,
      max: 30 * 24 * 60 * 60,
      fallback: DEFAULT_XJK_SESSION_TTL_SECONDS,
    }),
    oauthStateTtlSeconds: clampInt(env.XJK_AUTH_OAUTH_STATE_TTL_SECONDS || 600, {
      min: 60,
      max: 3600,
      fallback: 600,
    }),
    oauthStateMaxEntries: clampInt(env.XJK_AUTH_OAUTH_STATE_MAX_ENTRIES || 1024, {
      min: 16,
      max: 100000,
      fallback: 1024,
    }),
    oauthNonceCookieName: String(env.XJK_AUTH_OAUTH_NONCE_COOKIE_NAME || "xjk_oauth_nonce").trim(),
    oauthLoginRateLimitMax: clampInt(env.XJK_AUTH_OAUTH_LOGIN_RATE_LIMIT_MAX || 20, {
      min: 1,
      max: 1000,
      fallback: 20,
    }),
    oauthLoginRateLimitWindowSeconds: clampInt(env.XJK_AUTH_OAUTH_LOGIN_RATE_LIMIT_WINDOW_SECONDS || 60, {
      min: 10,
      max: 3600,
      fallback: 60,
    }),
    requestTimeoutMs,
    userAgent: String(env.XJK_AUTH_USER_AGENT || "xjk.yt shared auth").trim(),
    allowedReturnHosts: buildXjkOauthReturnHosts(parseList(env.XJK_AUTH_ALLOWED_RETURN_HOSTS)),
    adminIdentity: loadXjkAdminIdentityConfig(env),
    oauth: {
      enabled: String(env.UBI_OAUTH_ENABLED || "0").trim() !== "0",
      clientId: String(env.UBI_OAUTH_CLIENT_ID || "").trim(),
      clientSecret: String(env.UBI_OAUTH_CLIENT_SECRET || "").trim(),
      authorizeUrl: String(env.UBI_OAUTH_AUTHORIZE_URL || "https://api.trackmania.com/oauth/authorize").trim(),
      tokenUrl: String(env.UBI_OAUTH_TOKEN_URL || "https://api.trackmania.com/api/access_token").trim(),
      userInfoUrl: String(env.UBI_OAUTH_USERINFO_URL || "https://api.trackmania.com/api/user").trim(),
      scope: String(env.UBI_OAUTH_SCOPE || "clubs").trim() || "clubs",
      requestTimeoutMs,
      userAgent: String(env.XJK_AUTH_USER_AGENT || "xjk.yt shared auth").trim(),
    },
  };
}

export {
  isSharedXjkAuthSetting,
  loadXjkAuthConfig,
  loadXjkAuthEnvironment,
  mergeMissingEnvironment,
  repoRoot,
  serviceDir,
};
