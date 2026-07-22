import crypto from "node:crypto";

import { buildAbsoluteUrl, buildCookie, requestIsSecure } from "../../../shared/xjkAuth.js";
import { DEFAULT_OAUTH_ACCESS_TOKEN_LIFETIME_MS } from "../constants.js";

export function createAuthSessionRoutes({
  auth,
  config,
  directory,
  displayNames,
  helpers,
  httpSupport,
  lifecycle,
  repository,
  roomRuntime,
  sharedAuthStore,
} = {}) {
  const {
    deleteSession,
    ensureFreshOauthSession,
    exchangeCode,
    fetchUserInfo,
    getSessionFromRequest,
    oauthConfigured,
    oauthStates,
    operatorEligible,
    saveSession,
    setSetting,
  } = auth;
  const { directoryState, ensureDirectoryConnection } = directory;
  const { authoritativeSessionIdentity, rememberObservedDisplayName } = displayNames;
  const {
    buildConsolePublicUrl,
    buildLoginUrl,
    buildSharedLoginUrl,
    buildSharedLogoutCookie,
    normalizeProfile,
    nowMs,
    safeReturnTo,
    toPublicPath,
    tokenExpiryMs,
  } = helpers;
  const { redirect, sendJson, sendText } = httpSupport;
  const { closeMatchingPlayerConnections } = lifecycle;
  const { buildReadiness, deletePlayerBindingById, getPlayerBindingsForAccount } = repository;
  const { cleanupConsoleResourcesForPlayer } = roomRuntime;

  function buildSessionPayload(req, sessionEntry = null) {
    const readiness = buildReadiness();
    if (!sessionEntry?.row) {
      return {
        ok: true,
        session: null,
        readiness,
        loginUrl: oauthConfigured() ? buildLoginUrl(req) : null,
      };
    }
    const identity = authoritativeSessionIdentity(sessionEntry.row);
    if (identity.accountId && identity.displayName) {
      rememberObservedDisplayName({
        accountId: identity.accountId,
        displayName: identity.displayName,
        subject: identity.subject,
        isOperator: false,
      });
    }
    return {
      ok: true,
      session: {
        user: {
          accountId: identity.accountId,
          displayName: identity.displayName,
          username: identity.username,
          subject: identity.subject,
          isOperator: operatorEligible({
            accountId: identity.accountId,
            subject: identity.subject,
            displayName: identity.displayName,
          }),
          xjkAccountId: identity.xjkAccountId,
        },
        expiresAt: new Date(Number(sessionEntry.row.expires_at || 0)).toISOString(),
        oauthExpiresAt: new Date(Number(sessionEntry.row.oauth_expires_at || 0)).toISOString(),
      },
      readiness,
      loginUrl: oauthConfigured() ? buildLoginUrl(req) : null,
    };
  }

  function requireSession(req, res) {
    const entry = getSessionFromRequest(req);
    if (!entry) {
      sendJson(res, 401, {
        ok: false,
        error: "Login required.",
        loginUrl: buildLoginUrl(req),
        ...buildReadiness(),
      });
      return null;
    }
    return entry;
  }

  async function handleOauthLogin(req, res, url) {
    if (sharedAuthStore) {
      return redirect(
        res,
        buildSharedLoginUrl(req, url.searchParams.get("return_to") || buildConsolePublicUrl(req, "/"))
      );
    }
    if (!oauthConfigured()) {
      return sendText(
        res,
        503,
        "Console hub login is not configured. Set CONSOLE_HUB_UBI_OAUTH_* or shared UBI_OAUTH_* values first."
      );
    }
    const state = crypto.randomBytes(20).toString("hex");
    const redirectUri = buildAbsoluteUrl(req, config.callbackPath);
    oauthStates.set(state, {
      returnTo: safeReturnTo(url.searchParams.get("return_to") || toPublicPath("/"), toPublicPath("/")),
      redirectUri,
      expiresAt: nowMs() + config.oauthStateTtlSeconds * 1000,
    });
    const authorize = new URL(config.authorizeUrl);
    authorize.searchParams.set("response_type", "code");
    authorize.searchParams.set("client_id", config.clientId);
    authorize.searchParams.set("redirect_uri", redirectUri);
    authorize.searchParams.set("scope", config.scope);
    authorize.searchParams.set("state", state);
    return redirect(res, authorize.toString());
  }

  async function handleOauthCallback(req, res, url) {
    if (sharedAuthStore) {
      const callbackUrl = new URL("/auth/ubisoft/callback", config.sharedAuthOrigin);
      callbackUrl.search = url.search;
      return redirect(res, callbackUrl.toString());
    }
    const code = String(url.searchParams.get("code") || "").trim();
    const stateKey = String(url.searchParams.get("state") || "").trim();
    const record = oauthStates.get(stateKey);
    oauthStates.delete(stateKey);
    if (!code || !record || Number(record.expiresAt || 0) <= nowMs()) {
      return sendText(res, 400, "OAuth callback state is invalid or expired.");
    }
    try {
      const tokenInfo = await exchangeCode({ code, redirectUri: record.redirectUri });
      const accessToken = String(tokenInfo.access_token || "").trim();
      if (!accessToken) throw new Error("OAuth token response did not include access_token.");
      const userInfo = await fetchUserInfo(accessToken);
      const profile = normalizeProfile(userInfo, tokenInfo);
      if (!profile.accountId) throw new Error("OAuth profile did not include an account ID.");
      const sessionToken = crypto.randomBytes(32).toString("hex");
      const isOperator = operatorEligible(profile);
      saveSession({
        sessionToken,
        profile,
        oauth: {
          accessToken,
          refreshToken: String(tokenInfo.refresh_token || "").trim(),
          tokenType: String(tokenInfo.token_type || "Bearer").trim(),
          idToken: String(tokenInfo.id_token || "").trim(),
          scope: String(tokenInfo.scope || config.scope).trim(),
          expiresAt: tokenExpiryMs(tokenInfo, nowMs() + DEFAULT_OAUTH_ACCESS_TOKEN_LIFETIME_MS),
        },
        isOperator,
      });
      if (isOperator) {
        setSetting("operator_session", {
          accountId: profile.accountId,
          displayName: profile.displayName,
          subject: profile.subject,
          accessToken,
          refreshToken: String(tokenInfo.refresh_token || "").trim(),
          expiresAt: tokenExpiryMs(tokenInfo, nowMs() + DEFAULT_OAUTH_ACCESS_TOKEN_LIFETIME_MS),
        });
        ensureDirectoryConnection().catch(() => {});
      }
      return redirect(res, record.returnTo, {
        "set-cookie": buildCookie({
          name: config.sessionCookieName,
          value: sessionToken,
          maxAgeSeconds: config.sessionTtlSeconds,
          secure: requestIsSecure(req),
        }),
      });
    } catch (error) {
      return sendText(res, 500, `Console hub login failed: ${error?.message || error}`);
    }
  }

  async function handleSession(req, res) {
    const entry = getSessionFromRequest(req);
    if (entry?.row) {
      try {
        const refreshed = await ensureFreshOauthSession(entry.row, { persistOperator: true });
        entry.row = refreshed || entry.row;
      } catch {
        // Keep the existing session data visible even if refresh failed.
      }
    }
    sendJson(res, 200, buildSessionPayload(req, entry));
  }

  async function handleHealth(_req, res) {
    sendJson(res, 200, {
      ok: true,
      service: "xjk-console-hub",
      timestamp: new Date().toISOString(),
      readiness: buildReadiness(),
      roomsMirrored: directoryState.rooms.size,
      directoryConnected: Boolean(directoryState.ready),
      frontendDir: config.frontendDir,
    });
  }

  async function handleLogout(req, res) {
    const entry = getSessionFromRequest(req);
    if (entry) {
      const accountId = authoritativeSessionIdentity(entry.row).accountId;
      for (const binding of getPlayerBindingsForAccount(accountId)) {
        closeMatchingPlayerConnections({
          accountId,
          matchUid: binding.match_uid,
          joinCode: binding.join_code,
          message: "You logged out of the console bridge.",
        });
        if (binding.match_uid) {
          await cleanupConsoleResourcesForPlayer({
            accountId,
            matchUid: binding.match_uid,
            reason: "logout",
          });
        }
        deletePlayerBindingById(binding.binding_id);
      }
      deleteSession(entry.token);
    }
    sendJson(
      res,
      200,
      { ok: true },
      {
        "set-cookie": sharedAuthStore
          ? buildSharedLogoutCookie(req)
          : buildCookie({
              name: config.sessionCookieName,
              value: "",
              maxAgeSeconds: 0,
              secure: requestIsSecure(req),
            }),
      }
    );
  }

  return {
    buildSessionPayload,
    requireSession,
    handleHealth,
    handleLogout,
    handleOauthCallback,
    handleOauthLogin,
    handleSession,
  };
}
