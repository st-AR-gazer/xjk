import { ensureFreshSharedSession } from "../../../../shared/xjkAuth.js";

function createHttpError(message, statusCode) {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
}

function createAdminSessionContext({ repository, ubisoftAuth, sharedAuthStore, config, requestContext }) {
  const {
    UBI_OAUTH_ENABLED,
    UBI_OAUTH_CLIENT_ID,
    UBI_OAUTH_CLIENT_SECRET,
    UBI_OAUTH_TOKEN_URL,
    UBI_OAUTH_USERINFO_URL,
    UBI_OAUTH_SCOPE,
    ALTERED_LIVE_REQUEST_TIMEOUT_MS,
    ALTERED_LIVE_USER_AGENT,
    ALTERED_OAUTH_FALLBACK_LOCAL_ONLY,
    ALTERED_DEV_LOCAL_OPEN,
  } = config;

  function isOAuthEnforced() {
    if (sharedAuthStore) return true;
    return UBI_OAUTH_ENABLED && ubisoftAuth.getStatus().enabled;
  }

  async function getSharedAdminContext(req, { refresh = false } = {}) {
    if (!sharedAuthStore) return null;
    let entry = sharedAuthStore.resolveSessionFromRequest(req);
    if (!entry?.row) return null;
    if (refresh) {
      entry =
        (await ensureFreshSharedSession(sharedAuthStore, entry, {
          enabled: UBI_OAUTH_ENABLED,
          clientId: UBI_OAUTH_CLIENT_ID,
          clientSecret: UBI_OAUTH_CLIENT_SECRET,
          tokenUrl: UBI_OAUTH_TOKEN_URL,
          userInfoUrl: UBI_OAUTH_USERINFO_URL,
          scope: UBI_OAUTH_SCOPE,
          requestTimeoutMs: ALTERED_LIVE_REQUEST_TIMEOUT_MS,
          userAgent: ALTERED_LIVE_USER_AGENT,
        })) || entry;
    }

    const row = entry.row;
    const profile = {
      subject: String(row.subject || "").trim(),
      username: String(row.username || row.display_name || "").trim(),
      displayName: String(row.display_name || row.account_display_name || "").trim(),
      accountId: String(row.account_id || "").trim(),
      xjkAccountId: String(row.xjk_account_id || "").trim() || null,
      raw: {
        userInfo: {
          display_name: String(row.display_name || row.account_display_name || "").trim(),
        },
      },
    };
    const allowlist = repository.admin.isUbisoftAdminAllowed({
      subject: profile.subject,
      username: profile.username,
      profile,
    });
    return {
      entry,
      row,
      profile,
      allowlist,
      user: allowlist?.allowed
        ? {
            ...profile,
            adminUserId: allowlist.user?.adminUserId || null,
            role: allowlist.user?.role || null,
            isActive: allowlist.user?.isActive !== false,
          }
        : profile,
    };
  }

  function isOAuthFallbackOpen(req) {
    if (ALTERED_DEV_LOCAL_OPEN && requestContext.isLocalRequest(req)) return true;
    const oauthStatus = ubisoftAuth.getStatus();
    if (!UBI_OAUTH_ENABLED || oauthStatus.enabled) return false;
    return Boolean(ALTERED_OAUTH_FALLBACK_LOCAL_ONLY && requestContext.isLocalRequest(req));
  }

  function isOAuthRequiredButUnavailable(req) {
    return UBI_OAUTH_ENABLED && !ubisoftAuth.getStatus().enabled && !isOAuthFallbackOpen(req);
  }

  async function resolveSharedLiveAuthContext(req) {
    const context = await getSharedAdminContext(req, { refresh: true });
    if (!context?.entry?.row) throw createHttpError("Unauthorized", 401);
    if (!context.allowlist?.allowed) {
      throw createHttpError(
        context.allowlist?.reason || "This xjk account is not allowed to access Altered admin.",
        403
      );
    }
    if (!context.entry.row.access_token) {
      throw createHttpError(
        "Ubisoft session token is unavailable or expired for Nadeo API calls. Log out and sign in again.",
        401
      );
    }
    return {
      ubisoftAccessToken: context.entry.row.access_token,
      ubisoftRefreshToken: context.entry.row.refresh_token,
      subject: context.entry.row.subject,
      username: context.entry.row.username || context.entry.row.display_name,
    };
  }

  async function resolveLiveAuthContext(req) {
    if (requestContext.isTrustedServiceAdminRequest(req)) return null;
    if (sharedAuthStore) return resolveSharedLiveAuthContext(req);
    if (!isOAuthEnforced()) return null;

    const session = ubisoftAuth.getSessionFromRequest(req);
    if (!session) throw createHttpError("Unauthorized", 401);
    const context = await ubisoftAuth.getNadeoAuthContextFromRequest(req);
    if (!context?.ubisoftAccessToken) {
      throw createHttpError(
        "Ubisoft session token is unavailable or expired for Nadeo API calls. Log out and sign in again.",
        401
      );
    }
    return context;
  }

  return {
    getSharedAdminContext,
    isOAuthEnforced,
    isOAuthFallbackOpen,
    isOAuthRequiredButUnavailable,
    resolveLiveAuthContext,
  };
}

export { createAdminSessionContext };
