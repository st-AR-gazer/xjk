import crypto from "node:crypto";

import {
  buildAbsoluteUrl,
  buildCookie,
  ensureFreshSharedSession,
  exchangeUbisoftCode,
  fetchUbisoftUserInfo,
  refreshUbisoftToken,
  requestJson as requestSharedJson,
  requestIsSecure,
  tokenExpiryMs,
} from "../../shared/xjkAuth.js";
import { permissionsForRole, publicAccount } from "./access-control.js";
import { DEFAULT_OAUTH_ACCESS_TOKEN_LIFETIME_MS } from "./constants.js";

export function createAuthService({
  accounts,
  config,
  httpSupport,
  identity,
  learnData,
  sessions,
  sharedAuthStore = null,
  fetchImpl = fetch,
} = {}) {
  const { redirect, sendJson, sendText } = httpSupport;

  async function requestJson(url, options = {}) {
    return requestSharedJson(url, options, {
      timeoutMs: config.requestTimeoutMs,
      fetchImpl,
    });
  }

  async function exchangeCode({ code, redirectUri }) {
    return exchangeUbisoftCode(config, { code, redirectUri }, { fetchImpl });
  }

  async function refreshAccess(session) {
    const refreshToken = String(session?.oauth?.refreshToken || "").trim();
    if (!refreshToken) return session;
    if (Number(session?.oauth?.expiresAt || 0) - Date.now() > 90 * 1000) return session;

    const tokenInfo = await refreshUbisoftToken(config, refreshToken, { fetchImpl });
    session.oauth = {
      accessToken: String(tokenInfo.access_token || "").trim(),
      refreshToken: String(tokenInfo.refresh_token || "").trim() || refreshToken,
      tokenType: String(tokenInfo.token_type || session.oauth?.tokenType || "Bearer").trim(),
      idToken: String(tokenInfo.id_token || session.oauth?.idToken || "").trim(),
      scope: String(tokenInfo.scope || session.oauth?.scope || config.scope).trim(),
      obtainedAt: Date.now(),
      expiresAt: tokenExpiryMs(tokenInfo, Date.now() + DEFAULT_OAUTH_ACCESS_TOKEN_LIFETIME_MS),
    };
    sessions.schedulePersist();
    return session;
  }

  async function fetchUserInfo(accessToken) {
    return fetchUbisoftUserInfo(config, accessToken, { fetchImpl });
  }

  async function refreshSessionAccount(session, { touchLogin = false } = {}) {
    if (!session?.user) return null;
    const account = await accounts.ensureAccountForProfile(session.user, { touchLogin });
    accounts.attachAccountToSession(session, account);
    sessions.schedulePersist();
    return account;
  }

  function authStatus(req) {
    const entry = sessions.getSession(req);
    return {
      ok: true,
      provider: "nadeo-profile",
      configured: identity.oauthConfigured(),
      oauthEnabled: sharedAuthStore ? true : config.oauthEnabled,
      authenticated: Boolean(entry),
      loginUrl: identity.oauthConfigured()
        ? sharedAuthStore
          ? identity.buildSharedLoginUrl(req, identity.buildLearnPublicUrl(req, "/#/profile"))
          : `/auth/ubisoft/login?return_to=${encodeURIComponent("/#/profile")}`
        : null,
      session: entry ? identity.publicSession(entry.session) : null,
      config: {
        hasClientId: Boolean(config.clientId),
        hasClientSecret: Boolean(config.clientSecret),
        authorizeUrl: config.authorizeUrl,
        tokenUrl: config.tokenUrl,
        userInfoUrl: config.userInfoUrl,
        scope: config.scope,
        callbackPath: sharedAuthStore ? "/auth/ubisoft/callback" : config.callbackPath,
        sessionCookieName: sharedAuthStore ? config.sharedAuthSessionCookieName : config.sessionCookieName,
      },
    };
  }

  async function handleProfileMe(req, res) {
    const entry = sessions.getSession(req);
    if (!entry) {
      return sendJson(res, 401, {
        ok: false,
        error: "Not authenticated.",
        status: authStatus(req),
      });
    }
    try {
      if (sharedAuthStore && entry.row) {
        const refreshedEntry = await ensureFreshSharedSession(
          sharedAuthStore,
          { token: entry.token, row: entry.row },
          {
            enabled: config.oauthEnabled,
            clientId: config.clientId,
            clientSecret: config.clientSecret,
            tokenUrl: config.tokenUrl,
            userInfoUrl: config.userInfoUrl,
            scope: config.scope,
            requestTimeoutMs: config.requestTimeoutMs,
            userAgent: config.userAgent,
          }
        );
        if (refreshedEntry?.row) {
          entry.row = refreshedEntry.row;
          entry.session = sessions.sharedRowToLearnSession(refreshedEntry.row);
        }
      } else {
        await refreshAccess(entry.session);
      }
      const accessToken = String(entry.session.oauth?.accessToken || "").trim();
      if (accessToken) {
        const userInfo = await fetchUserInfo(accessToken);
        entry.session.user = identity.normalizeProfile(userInfo, {
          access_token: accessToken,
          id_token: entry.session.oauth?.idToken || "",
        });
        entry.session.user.xjkAccountId = entry.session.user.xjkAccountId || entry.row?.xjk_account_id || null;
        await refreshSessionAccount(entry.session);
        sessions.schedulePersist();
      }
      return sendJson(res, 200, {
        ok: true,
        provider: "nadeo-profile",
        profile: entry.session.user,
        session: identity.publicSession(entry.session),
      });
    } catch (error) {
      return sendJson(res, 502, {
        ok: false,
        error: `Nadeo profile request failed: ${error?.message || error}`,
        profile: entry.session.user || null,
        session: identity.publicSession(entry.session),
      });
    }
  }

  async function handleLogin(req, res, url) {
    if (sharedAuthStore) {
      return redirect(
        res,
        identity.buildSharedLoginUrl(
          req,
          url.searchParams.get("return_to") || identity.buildLearnPublicUrl(req, "/#/profile")
        )
      );
    }
    if (!identity.oauthConfigured()) {
      return sendText(
        res,
        503,
        "Learn Trackmania profile login is not configured. Set LEARN_UBI_OAUTH_* for this service."
      );
    }
    const state = crypto.randomBytes(20).toString("hex");
    const redirectUri = buildAbsoluteUrl(req, config.callbackPath);
    sessions.oauthStates.set(state, {
      returnTo: identity.safeReturnTo(url.searchParams.get("return_to") || "/#/profile"),
      redirectUri,
      expiresAt: Date.now() + config.oauthStateTtlSeconds * 1000,
    });
    const authorize = new URL(config.authorizeUrl);
    authorize.searchParams.set("response_type", "code");
    authorize.searchParams.set("client_id", config.clientId);
    authorize.searchParams.set("redirect_uri", redirectUri);
    authorize.searchParams.set("scope", config.scope);
    authorize.searchParams.set("state", state);
    return redirect(res, authorize.toString());
  }

  async function handleCallback(req, res, url) {
    if (sharedAuthStore) {
      const callbackUrl = new URL("/auth/ubisoft/callback", config.sharedAuthOrigin);
      callbackUrl.search = url.search;
      return redirect(res, callbackUrl.toString());
    }
    const code = String(url.searchParams.get("code") || "").trim();
    const state = String(url.searchParams.get("state") || "").trim();
    const stateRecord = sessions.oauthStates.get(state);
    sessions.oauthStates.delete(state);
    if (!code || !stateRecord || Number(stateRecord.expiresAt || 0) <= Date.now()) {
      return sendText(res, 400, "OAuth callback state is invalid or expired.");
    }
    try {
      const tokenInfo = await exchangeCode({ code, redirectUri: stateRecord.redirectUri });
      const accessToken = String(tokenInfo.access_token || "").trim();
      if (!accessToken) throw new Error("OAuth token response did not include access_token.");
      const userInfo = await fetchUserInfo(accessToken);
      const now = Date.now();
      const sessionToken = crypto.randomBytes(32).toString("hex");
      const profile = identity.normalizeProfile(userInfo, tokenInfo);
      const account = await accounts.ensureAccountForProfile(profile, { touchLogin: true });
      const session = {
        user: {
          ...profile,
          role: account.role,
          accountRecordId: account.id,
          permissions: permissionsForRole(account.role),
        },
        oauth: {
          accessToken,
          refreshToken: String(tokenInfo.refresh_token || "").trim(),
          tokenType: String(tokenInfo.token_type || "Bearer").trim(),
          idToken: String(tokenInfo.id_token || "").trim(),
          scope: String(tokenInfo.scope || config.scope).trim(),
          obtainedAt: now,
          expiresAt: tokenExpiryMs(tokenInfo, now + DEFAULT_OAUTH_ACCESS_TOKEN_LIFETIME_MS),
        },
        createdAt: now,
        expiresAt: now + config.sessionTtlSeconds * 1000,
      };
      sessions.sessions.set(sessionToken, session);
      sessions.schedulePersist();
      return redirect(res, stateRecord.returnTo, {
        "set-cookie": buildCookie({
          name: config.sessionCookieName,
          value: sessionToken,
          maxAgeSeconds: config.sessionTtlSeconds,
          secure: requestIsSecure(req),
        }),
      });
    } catch (error) {
      return sendText(res, 500, `Learn profile login failed: ${error?.message || "Unknown OAuth error."}`);
    }
  }

  function handleLogout(req, res) {
    if (sharedAuthStore) {
      const entry = sessions.getSession(req);
      if (entry?.token) sharedAuthStore.deleteSessionByToken(entry.token);
      return sendJson(
        res,
        200,
        { ok: true, authenticated: false },
        {
          "set-cookie": identity.buildSharedLogoutCookie(req),
        }
      );
    }
    const token = identity.getSessionToken(req);
    if (token) {
      sessions.sessions.delete(token);
      sessions.schedulePersist();
    }
    return sendJson(
      res,
      200,
      { ok: true, authenticated: false },
      {
        "set-cookie": buildCookie({
          name: config.sessionCookieName,
          value: "",
          maxAgeSeconds: 0,
          secure: requestIsSecure(req),
        }),
      }
    );
  }

  async function getActor(req) {
    const entry = sessions.getSession(req);
    if (!entry) return { entry: null, account: null, publicAccount: null };
    const account = await refreshSessionAccount(entry.session);
    learnData.migrateLearnUserDataKey(account);
    return { entry, account, publicAccount: publicAccount(account) };
  }

  async function requireActiveActor(req, res, { page, permission = "" } = {}) {
    const actor = await getActor(req);
    if (!actor.entry) {
      sendJson(res, 401, {
        ok: false,
        error: "Login required.",
        loginUrl: sharedAuthStore
          ? identity.buildSharedLoginUrl(req, identity.buildLearnPublicUrl(req, `/#/${page}`))
          : `/auth/ubisoft/login?return_to=${encodeURIComponent(`/#/${page}`)}`,
      });
      return null;
    }
    if (!actor.account || actor.account.isActive === false) {
      sendJson(res, 403, { ok: false, error: "Your Learn account is disabled or missing." });
      return null;
    }
    if (!permission) return actor;
    const permissions = permissionsForRole(actor.account.role);
    if (!permissions[permission]) {
      sendJson(res, 403, {
        ok: false,
        error: "Your Learn role does not have permission for this action.",
        account: publicAccount(actor.account),
      });
      return null;
    }
    return actor;
  }

  async function requirePermission(req, res, permission) {
    return requireActiveActor(req, res, { page: "admin", permission });
  }

  async function requireLearnAccount(req, res) {
    return requireActiveActor(req, res, { page: "profile" });
  }

  return {
    requestJson,
    exchangeCode,
    refreshAccess,
    fetchUserInfo,
    refreshSessionAccount,
    authStatus,
    handleProfileMe,
    handleLogin,
    handleCallback,
    handleLogout,
    getActor,
    requirePermission,
    requireLearnAccount,
  };
}
