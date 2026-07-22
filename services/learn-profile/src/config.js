import path from "node:path";
import { fileURLToPath } from "node:url";

import { clampInt, loadEnvFile, normalizePath, parseBool, parseList } from "../../shared/xjkAuth.js";

const MODULE_DIR = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_SERVICE_DIR = path.resolve(MODULE_DIR, "..");
const DEFAULT_PORT = 3036;
const DEFAULT_SESSION_TTL_SECONDS = 12 * 60 * 60;
const DEFAULT_OAUTH_STATE_TTL_SECONDS = 10 * 60;
const DEFAULT_REQUEST_TIMEOUT_MS = 15 * 1000;
const DEFAULT_SHARED_AUTH_LOCAL_ORIGIN = "http://localhost:8080";

export function loadLearnProfileConfig({
  env = process.env,
  serviceDir = DEFAULT_SERVICE_DIR,
  repoRoot = path.resolve(serviceDir, "..", ".."),
  loadEnv = true,
} = {}) {
  if (loadEnv) loadEnvFile(path.join(serviceDir, ".env"));

  return {
    port: clampInt(env.PORT || DEFAULT_PORT, { min: 1, max: 65535, fallback: DEFAULT_PORT }),
    frontendDir: normalizePath(env.FRONTEND_DIR, path.join(repoRoot, "sites", "learn.xjk.yt", "frontend"), serviceDir),
    sharedDir: normalizePath(env.XJK_SHARED_FRONTEND_DIR, path.join(repoRoot, "sites", "shared"), serviceDir),
    contentDir: normalizePath(
      env.LEARN_CONTENT_DIR,
      path.join(repoRoot, "sites", "learn.xjk.yt", "frontend", "content"),
      serviceDir
    ),
    dataDir: normalizePath(
      env.LEARN_PROFILE_DATA_DIR,
      path.join(repoRoot, "sites", "learn.xjk.yt", "data"),
      serviceDir
    ),
    oauthEnabled: parseBool(env.LEARN_UBI_OAUTH_ENABLED ?? env.UBI_OAUTH_ENABLED, false),
    clientId: String(env.LEARN_UBI_OAUTH_CLIENT_ID || env.UBI_OAUTH_CLIENT_ID || "").trim(),
    clientSecret: String(env.LEARN_UBI_OAUTH_CLIENT_SECRET || env.UBI_OAUTH_CLIENT_SECRET || "").trim(),
    authorizeUrl: String(
      env.LEARN_UBI_OAUTH_AUTHORIZE_URL || env.UBI_OAUTH_AUTHORIZE_URL || "https://api.trackmania.com/oauth/authorize"
    ).trim(),
    tokenUrl: String(
      env.LEARN_UBI_OAUTH_TOKEN_URL || env.UBI_OAUTH_TOKEN_URL || "https://api.trackmania.com/api/access_token"
    ).trim(),
    userInfoUrl: String(
      env.LEARN_UBI_OAUTH_USERINFO_URL || env.UBI_OAUTH_USERINFO_URL || "https://api.trackmania.com/api/user"
    ).trim(),
    scope: String(env.LEARN_UBI_OAUTH_SCOPE || env.UBI_OAUTH_SCOPE || "clubs").trim(),
    callbackPath: String(env.LEARN_UBI_OAUTH_CALLBACK_PATH || "/auth/ubisoft/callback").trim(),
    sessionCookieName: String(env.LEARN_SESSION_COOKIE_NAME || "learn_profile_session").trim(),
    sessionTtlSeconds: clampInt(env.LEARN_SESSION_TTL_SECONDS || DEFAULT_SESSION_TTL_SECONDS, {
      min: 300,
      max: 30 * 24 * 60 * 60,
      fallback: DEFAULT_SESSION_TTL_SECONDS,
    }),
    oauthStateTtlSeconds: clampInt(env.LEARN_OAUTH_STATE_TTL_SECONDS || DEFAULT_OAUTH_STATE_TTL_SECONDS, {
      min: 60,
      max: 3600,
      fallback: DEFAULT_OAUTH_STATE_TTL_SECONDS,
    }),
    userAgent: String(env.LEARN_PROFILE_USER_AGENT || "learn.xjk.yt profile integration").trim(),
    requestTimeoutMs: clampInt(env.LEARN_PROFILE_REQUEST_TIMEOUT_MS || DEFAULT_REQUEST_TIMEOUT_MS, {
      min: 1000,
      max: 120000,
      fallback: DEFAULT_REQUEST_TIMEOUT_MS,
    }),
    headAdminSubjects: parseList(env.LEARN_HEAD_ADMIN_SUBJECTS),
    headAdminUsernames: parseList(env.LEARN_HEAD_ADMIN_USERNAMES),
    bootstrapEditorSubjects: parseList(env.LEARN_EDITOR_SUBJECTS),
    bootstrapEditorUsernames: parseList(env.LEARN_EDITOR_USERNAMES),
    sharedAuthEnabled: parseBool(env.LEARN_SHARED_AUTH_ENABLED ?? env.XJK_SHARED_AUTH_ENABLED ?? "1", true),
    sharedAuthDbFile: normalizePath(
      env.XJK_AUTH_DB_FILE,
      path.join(repoRoot, "sites", "xjk.yt", "data", "xjk-auth.sqlite"),
      serviceDir
    ),
    sharedAuthOrigin: String(env.XJK_PUBLIC_ORIGIN || env.XJK_AUTH_PUBLIC_ORIGIN || "https://xjk.yt").trim(),
    sharedAuthLocalOrigin: String(env.XJK_LOCAL_PUBLIC_ORIGIN || DEFAULT_SHARED_AUTH_LOCAL_ORIGIN).trim(),
    sharedAuthSessionCookieName: String(env.XJK_AUTH_SESSION_COOKIE_NAME || "xjk_session").trim(),
    sharedAuthSessionCookieDomain: String(env.XJK_AUTH_SESSION_COOKIE_DOMAIN || ".xjk.yt").trim(),
    sharedAuthAllowedReturnHosts: parseList(
      env.XJK_AUTH_ALLOWED_RETURN_HOSTS ||
        "xjk.yt,www.xjk.yt,learn.xjk.yt,console.xjk.yt,altered.xjk.yt,archive.xjk.yt,trackers.xjk.yt,aggregator.xjk.yt,dash.xjk.yt,plugins.xjk.yt,tools.xjk.yt,localhost,127.0.0.1,xjk.localhost,console.localhost,learn.localhost,altered.localhost,bingo.localhost,archive.localhost,trackers.localhost,aggregator.localhost,dash.localhost,plugins.localhost,tools.localhost"
    ),
  };
}

export function createLearnProfilePaths(config) {
  return Object.freeze({
    sessionFile: path.join(config.dataDir, "learn-profile-sessions.json"),
    accountsFile: path.join(config.dataDir, "learn-profile-accounts.json"),
    userDataFile: path.join(config.dataDir, "learn-user-data.json"),
    suggestionsFile: path.join(config.dataDir, "learn-suggestions.jsonl"),
    auditFile: path.join(config.dataDir, "learn-admin-audit.jsonl"),
    manifestFile: path.join(config.contentDir, "index.json"),
    backupDir: path.join(config.dataDir, "content-backups"),
  });
}
