const path = require("node:path");

function definePlatformProcesses({ defineProcess, roots, serviceEnvironments }) {
  const authEnvironment = serviceEnvironments.forService("xjk-auth");
  const learnEnvironment = serviceEnvironments.forService("learn-profile");

  return [
    defineProcess("plugins-hub", {
      env: {
        FRONTEND_DIR: path.join(roots.plugins, "Plugins-Hub", "frontend"),
        DATA_DIR: path.join(roots.plugins, "Plugins-Hub", "data"),
        PLUGINS_FILE: path.join(roots.plugins, "Plugins-Hub", "data", "plugins.json"),
      },
    }),
    defineProcess("xjk-auth", {
      env: {
        XJK_PUBLIC_ORIGIN: authEnvironment.XJK_PUBLIC_ORIGIN || "https://xjk.yt",
        XJK_LOCAL_PUBLIC_ORIGIN: authEnvironment.XJK_LOCAL_PUBLIC_ORIGIN || "http://localhost:8080",
        XJK_AUTH_DB_FILE:
          authEnvironment.XJK_AUTH_DB_FILE || path.join(roots.sites, "xjk.yt", "data", "xjk-auth.sqlite"),
        XJK_AUTH_SESSION_COOKIE_NAME: authEnvironment.XJK_AUTH_SESSION_COOKIE_NAME || "xjk_session",
        XJK_AUTH_SESSION_COOKIE_DOMAIN: authEnvironment.XJK_AUTH_SESSION_COOKIE_DOMAIN || ".xjk.yt",
        UBI_OAUTH_ENABLED: authEnvironment.UBI_OAUTH_ENABLED || "0",
        UBI_OAUTH_CLIENT_ID: authEnvironment.UBI_OAUTH_CLIENT_ID || "",
        UBI_OAUTH_CLIENT_SECRET: authEnvironment.UBI_OAUTH_CLIENT_SECRET || "",
        UBI_OAUTH_AUTHORIZE_URL:
          authEnvironment.UBI_OAUTH_AUTHORIZE_URL || "https://api.trackmania.com/oauth/authorize",
        UBI_OAUTH_TOKEN_URL: authEnvironment.UBI_OAUTH_TOKEN_URL || "https://api.trackmania.com/api/access_token",
        UBI_OAUTH_USERINFO_URL: authEnvironment.UBI_OAUTH_USERINFO_URL || "https://api.trackmania.com/api/user",
        UBI_OAUTH_SCOPE: authEnvironment.UBI_OAUTH_SCOPE || "clubs",
        UBI_OAUTH_CALLBACK_PATH: authEnvironment.UBI_OAUTH_CALLBACK_PATH || "/auth/ubisoft/callback",
      },
    }),
    defineProcess("learn-profile", {
      env: {
        FRONTEND_DIR: path.join(roots.learn, "frontend"),
        LEARN_CONTENT_DIR: path.join(roots.learn, "frontend", "content"),
        LEARN_PROFILE_DATA_DIR: path.join(roots.learn, "data"),
        LEARN_UBI_OAUTH_ENABLED: learnEnvironment.LEARN_UBI_OAUTH_ENABLED || "0",
        LEARN_UBI_OAUTH_CLIENT_ID: learnEnvironment.LEARN_UBI_OAUTH_CLIENT_ID || "",
        LEARN_UBI_OAUTH_CLIENT_SECRET: learnEnvironment.LEARN_UBI_OAUTH_CLIENT_SECRET || "",
        LEARN_UBI_OAUTH_AUTHORIZE_URL:
          learnEnvironment.LEARN_UBI_OAUTH_AUTHORIZE_URL || "https://api.trackmania.com/oauth/authorize",
        LEARN_UBI_OAUTH_TOKEN_URL:
          learnEnvironment.LEARN_UBI_OAUTH_TOKEN_URL || "https://api.trackmania.com/api/access_token",
        LEARN_UBI_OAUTH_USERINFO_URL:
          learnEnvironment.LEARN_UBI_OAUTH_USERINFO_URL || "https://api.trackmania.com/api/user",
        LEARN_UBI_OAUTH_SCOPE: learnEnvironment.LEARN_UBI_OAUTH_SCOPE || "clubs",
        LEARN_UBI_OAUTH_CALLBACK_PATH: learnEnvironment.LEARN_UBI_OAUTH_CALLBACK_PATH || "/auth/ubisoft/callback",
        LEARN_SESSION_COOKIE_NAME: learnEnvironment.LEARN_SESSION_COOKIE_NAME || "learn_profile_session",
        LEARN_SESSION_TTL_SECONDS: learnEnvironment.LEARN_SESSION_TTL_SECONDS || "43200",
        LEARN_OAUTH_STATE_TTL_SECONDS: learnEnvironment.LEARN_OAUTH_STATE_TTL_SECONDS || "600",
        LEARN_PROFILE_USER_AGENT: learnEnvironment.LEARN_PROFILE_USER_AGENT || "learn.xjk.yt profile integration",
        LEARN_PROFILE_REQUEST_TIMEOUT_MS: learnEnvironment.LEARN_PROFILE_REQUEST_TIMEOUT_MS || "15000",
        LEARN_HEAD_ADMIN_SUBJECTS: learnEnvironment.LEARN_HEAD_ADMIN_SUBJECTS || "",
        LEARN_HEAD_ADMIN_USERNAMES: learnEnvironment.LEARN_HEAD_ADMIN_USERNAMES || "",
        LEARN_EDITOR_SUBJECTS: learnEnvironment.LEARN_EDITOR_SUBJECTS || "",
        LEARN_EDITOR_USERNAMES: learnEnvironment.LEARN_EDITOR_USERNAMES || "",
      },
    }),
  ];
}

module.exports = { definePlatformProcesses };
