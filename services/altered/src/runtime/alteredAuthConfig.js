import path from "node:path";

import {
  ADMIN_TOKEN,
  ALTERED_INTERNAL_TOKEN,
  ALTERED_DEV_LOCAL_OPEN,
  ALTERED_LIVE_REQUEST_TIMEOUT_MS,
  ALTERED_LIVE_USER_AGENT,
  ALTERED_OAUTH_FALLBACK_LOCAL_ONLY,
  ALTERED_OAUTH_STATE_TTL_SECONDS,
  ALTERED_SESSION_COOKIE_NAME,
  ALTERED_SESSION_TTL_SECONDS,
  UBI_OAUTH_ALLOWED_SUBJECTS,
  UBI_OAUTH_ALLOWED_USERNAMES,
  UBI_OAUTH_AUTHORIZE_URL,
  UBI_OAUTH_CALLBACK_PATH,
  UBI_OAUTH_CLIENT_ID,
  UBI_OAUTH_CLIENT_SECRET,
  UBI_OAUTH_ENABLED,
  UBI_OAUTH_SCOPE,
  UBI_OAUTH_TOKEN_URL,
  UBI_OAUTH_USERINFO_URL,
} from "../config.js";

function createAlteredAuthConfig() {
  const sharedAuthAllowedReturnHosts = String(
    process.env.XJK_AUTH_ALLOWED_RETURN_HOSTS ||
      "xjk.yt,www.xjk.yt,learn.xjk.yt,console.xjk.yt,altered.xjk.yt,archive.xjk.yt,trackers.xjk.yt,aggregator.xjk.yt,dash.xjk.yt,plugins.xjk.yt,tools.xjk.yt,localhost,127.0.0.1,xjk.localhost,console.localhost,learn.localhost,altered.localhost,bingo.localhost,archive.localhost,trackers.localhost,aggregator.localhost,dash.localhost,plugins.localhost,tools.localhost"
  )
    .split(/[,;\n]/)
    .map((item) => item.trim())
    .filter(Boolean);

  return {
    ADMIN_TOKEN,
    ALTERED_INTERNAL_TOKEN,
    UBI_OAUTH_ENABLED,
    UBI_OAUTH_CLIENT_ID,
    UBI_OAUTH_CLIENT_SECRET,
    UBI_OAUTH_AUTHORIZE_URL,
    UBI_OAUTH_TOKEN_URL,
    UBI_OAUTH_USERINFO_URL,
    UBI_OAUTH_SCOPE,
    UBI_OAUTH_CALLBACK_PATH,
    UBI_OAUTH_ALLOWED_SUBJECTS,
    UBI_OAUTH_ALLOWED_USERNAMES,
    ALTERED_SESSION_COOKIE_NAME,
    ALTERED_SESSION_TTL_SECONDS,
    ALTERED_OAUTH_STATE_TTL_SECONDS,
    ALTERED_OAUTH_FALLBACK_LOCAL_ONLY,
    ALTERED_DEV_LOCAL_OPEN,
    ALTERED_LIVE_REQUEST_TIMEOUT_MS,
    ALTERED_LIVE_USER_AGENT,
    XJK_SHARED_AUTH_ENABLED:
      String(process.env.ALTERED_SHARED_AUTH_ENABLED ?? process.env.XJK_SHARED_AUTH_ENABLED ?? "1").trim() !== "0",
    XJK_SHARED_AUTH_DB_FILE: String(
      process.env.XJK_AUTH_DB_FILE || path.resolve(process.cwd(), "sites", "xjk.yt", "data", "xjk-auth.sqlite")
    ).trim(),
    XJK_SHARED_AUTH_ORIGIN: String(
      process.env.XJK_PUBLIC_ORIGIN || process.env.XJK_AUTH_PUBLIC_ORIGIN || "https://xjk.yt"
    ).trim(),
    XJK_SHARED_AUTH_LOCAL_ORIGIN: String(process.env.XJK_LOCAL_PUBLIC_ORIGIN || "http://localhost:8080").trim(),
    XJK_SHARED_AUTH_SESSION_COOKIE_NAME: String(process.env.XJK_AUTH_SESSION_COOKIE_NAME || "xjk_session").trim(),
    XJK_SHARED_AUTH_SESSION_COOKIE_DOMAIN: String(process.env.XJK_AUTH_SESSION_COOKIE_DOMAIN || ".xjk.yt").trim(),
    XJK_SHARED_AUTH_ALLOWED_RETURN_HOSTS: sharedAuthAllowedReturnHosts,
  };
}

export { createAlteredAuthConfig };
