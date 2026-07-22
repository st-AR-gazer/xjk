import { readJsonBody } from "../../shared/httpJson.js";
import { buildOauthNonceCookie, oauthLoginClientKey } from "../../shared/xjk-auth/oauth-state-policy.js";
import {
  buildAbsoluteUrl,
  buildCookie,
  exchangeUbisoftCode,
  fetchUbisoftUserInfo,
  isLocalHostname,
  normalizeReturnTo,
  normalizeUbisoftProfile,
  oauthConfigured,
  parseCookies,
  publicAccountWithRolesFromRow,
  publicSessionWithRolesFromRow,
  requestHost,
  requestHostname,
  requestIsSecure,
  tokenExpiryMs,
  xjkAdminIdentityConfigured,
} from "../../shared/xjkAuth.js";
import {
  accountIdFromSessionRow,
  accountPreferencesWithDefaults,
  createAccountPreferencesService,
  DEFAULT_ACCOUNT_PREFERENCES,
  normalizeAccountPreferences,
} from "./accountPreferences.js";
import { redirect, sendJson, sendText } from "./httpResponses.js";
import { createStaticFileService } from "./staticFiles.js";

const accountHosts = new Set(["account.xjk.yt", "account.localhost"]);

function createXjkAuthApp({ config, store, oauthStateStore, logger = console }) {
  const preferencesService = createAccountPreferencesService(store);

  function isAccountHost(req) {
    return accountHosts.has(requestHostname(req));
  }

  const staticFiles = createStaticFileService({
    accountDir: config.accountDir,
    sharedDir: config.sharedDir,
    isAccountHost,
    logger,
  });

  function resolveCookieDomain(req) {
    if (!config.sessionCookieDomain || isLocalHostname(requestHostname(req))) return "";
    return config.sessionCookieDomain;
  }

  function buildSessionCookie(req, value, maxAgeSeconds) {
    return buildCookie({
      name: config.sessionCookieName,
      value,
      maxAgeSeconds,
      secure: requestIsSecure(req),
      domain: resolveCookieDomain(req),
      path: "/",
      sameSite: "Lax",
      httpOnly: true,
    });
  }

  function renewSessionForResponse(entry = null) {
    if (!entry?.token) return null;
    const renewed = store.renewSession(entry.token, config.sessionTtlSeconds);
    return renewed ? { token: entry.token, row: renewed } : entry;
  }

  function accountRequestPath(req, requestPath = "/") {
    const safePath = String(requestPath || "").startsWith("/")
      ? String(requestPath || "")
      : `/${String(requestPath || "")}`;
    if (isAccountHost(req)) return safePath;
    return safePath === "/" ? "/account/" : `/account${safePath}`;
  }

  function accountRequestUrl(req, requestPath = "/") {
    return buildAbsoluteUrl(req, accountRequestPath(req, requestPath));
  }

  function buildLoginUrl(req, returnTo = accountRequestUrl(req, "/")) {
    const url = new URL("/auth/ubisoft/login", "http://localhost");
    url.searchParams.set(
      "return_to",
      normalizeReturnTo(returnTo, {
        fallback: accountRequestUrl(req, "/"),
        publicOrigin: config.publicOrigin,
        allowedHosts: config.allowedReturnHosts,
        localOrigin: config.localOrigin,
      })
    );
    return url.pathname + url.search;
  }

  function buildSessionPayload(req, entry = null) {
    return {
      ok: true,
      provider: "xjk-auth",
      configured: oauthConfigured(config.oauth),
      authenticated: Boolean(entry?.row),
      loginUrl: oauthConfigured(config.oauth) ? buildLoginUrl(req, accountRequestUrl(req, "/")) : null,
      session: entry?.row ? publicSessionWithRolesFromRow(entry.row, config.adminIdentity) : null,
      preferences: preferencesService.preferencesForRow(entry?.row),
    };
  }

  function handleLogin(req, res, url) {
    if (!oauthConfigured(config.oauth)) {
      return sendText(res, 503, "Shared xjk login is not configured. Set the shared UBI_OAUTH_* values for xjk-auth.");
    }
    const defaultReturnTo = accountRequestUrl(req, "/");
    const redirectUri = buildAbsoluteUrl(req, config.callbackPath, { publicOrigin: config.publicOrigin });
    const issued = oauthStateStore.issue({
      clientKey: oauthLoginClientKey(req),
      record: {
        returnTo: normalizeReturnTo(url.searchParams.get("return_to") || defaultReturnTo, {
          fallback: defaultReturnTo,
          publicOrigin: config.publicOrigin,
          allowedHosts: config.allowedReturnHosts,
          localOrigin: config.localOrigin,
        }),
        redirectUri,
      },
    });
    if (!issued.ok) {
      const statusCode = issued.reason === "rate_limited" ? 429 : 503;
      return sendText(
        res,
        statusCode,
        statusCode === 429 ? "Too many login attempts. Please try again shortly." : "Login is temporarily busy.",
        "text/plain; charset=utf-8",
        { "retry-after": String(issued.retryAfterSeconds || 1) }
      );
    }
    const authorize = new URL(config.oauth.authorizeUrl);
    authorize.searchParams.set("response_type", "code");
    authorize.searchParams.set("client_id", config.oauth.clientId);
    authorize.searchParams.set("redirect_uri", redirectUri);
    authorize.searchParams.set("scope", config.oauth.scope);
    authorize.searchParams.set("state", issued.state);
    return redirect(res, authorize.toString(), {
      "set-cookie": buildOauthNonceCookie(req, {
        cookieName: config.oauthNonceCookieName,
        nonce: issued.browserNonce,
        maxAgeSeconds: config.oauthStateTtlSeconds,
        callbackPath: config.callbackPath,
      }),
    });
  }

  async function handleCallback(req, res, url) {
    const code = String(url.searchParams.get("code") || "").trim();
    const stateKey = String(url.searchParams.get("state") || "").trim();
    const browserNonce = String(parseCookies(req?.headers?.cookie || "")[config.oauthNonceCookieName] || "").trim();
    const record = code ? oauthStateStore.consume(stateKey, browserNonce) : null;
    if (!code || !record) return sendText(res, 400, "OAuth callback state is invalid or expired.");
    const clearNonceCookie = buildOauthNonceCookie(req, {
      cookieName: config.oauthNonceCookieName,
      nonce: "",
      maxAgeSeconds: 0,
      callbackPath: config.callbackPath,
    });
    try {
      const tokenInfo = await exchangeUbisoftCode(config.oauth, { code, redirectUri: record.redirectUri });
      const accessToken = String(tokenInfo.access_token || "").trim();
      if (!accessToken) throw new Error("OAuth token response did not include access_token.");
      const profile = normalizeUbisoftProfile(await fetchUbisoftUserInfo(config.oauth, accessToken), tokenInfo);
      const account = store.upsertUbisoftAccount(profile, { touchLogin: true });
      const session = store.createSessionForAccount({
        accountId: account.xjk_account_id || account.account_id,
        oauth: {
          accessToken,
          refreshToken: String(tokenInfo.refresh_token || "").trim(),
          tokenType: String(tokenInfo.token_type || "Bearer").trim(),
          idToken: String(tokenInfo.id_token || "").trim(),
          scope: String(tokenInfo.scope || config.oauth.scope).trim(),
          expiresAt: tokenExpiryMs(tokenInfo, Date.now() + 3600 * 1000),
        },
        sessionTtlSeconds: config.sessionTtlSeconds,
      });
      return redirect(res, record.returnTo, {
        "set-cookie": [buildSessionCookie(req, session.session_token, config.sessionTtlSeconds), clearNonceCookie],
      });
    } catch (error) {
      return sendText(
        res,
        500,
        `Shared xjk login failed: ${error?.message || "Unknown OAuth error."}`,
        "text/plain; charset=utf-8",
        { "set-cookie": clearNonceCookie }
      );
    }
  }

  function handleLogout(req, res) {
    const entry = store.resolveSessionFromRequest(req);
    if (entry?.token) store.deleteSessionByToken(entry.token);
    return sendJson(res, 200, { ok: true, authenticated: false }, { "set-cookie": buildSessionCookie(req, "", 0) });
  }

  function handleSession(req, res) {
    store.cleanupExpiredSessions();
    const entry = renewSessionForResponse(store.resolveSessionFromRequest(req));
    return sendJson(
      res,
      200,
      buildSessionPayload(req, entry),
      entry?.token ? { "set-cookie": buildSessionCookie(req, entry.token, config.sessionTtlSeconds) } : {}
    );
  }

  function handleMe(req, res) {
    store.cleanupExpiredSessions();
    const entry = renewSessionForResponse(store.resolveSessionFromRequest(req));
    if (!entry?.row) {
      return sendJson(res, 401, { ok: false, error: "Not authenticated.", status: buildSessionPayload(req, null) });
    }
    return sendJson(
      res,
      200,
      {
        ok: true,
        account: publicAccountWithRolesFromRow(entry.row, config.adminIdentity),
        session: publicSessionWithRolesFromRow(entry.row, config.adminIdentity),
        preferences: preferencesService.preferencesForRow(entry.row),
      },
      { "set-cookie": buildSessionCookie(req, entry.token, config.sessionTtlSeconds) }
    );
  }

  function requireAuthenticatedEntry(req, res) {
    store.cleanupExpiredSessions();
    const entry = store.resolveSessionFromRequest(req);
    if (entry?.row) return entry;
    sendJson(res, 401, { ok: false, error: "Not authenticated.", status: buildSessionPayload(req, null) });
    return null;
  }

  function handlePreferencesGet(req, res) {
    const entry = requireAuthenticatedEntry(req, res);
    if (!entry) return;
    return sendJson(res, 200, {
      ok: true,
      preferences: preferencesService.preferencesForRow(entry.row),
      defaults: DEFAULT_ACCOUNT_PREFERENCES,
    });
  }

  async function handlePreferencesPut(req, res) {
    const entry = requireAuthenticatedEntry(req, res);
    if (!entry) return;
    let body = {};
    try {
      body = await readJsonBody(req);
    } catch (error) {
      const statusCode = Number(error?.statusCode || 0) === 413 ? 413 : 400;
      return sendJson(res, statusCode, {
        ok: false,
        error: statusCode === 413 ? "Request body is too large." : "Invalid JSON body.",
      });
    }
    const saved = store.saveAccountPreferences(
      accountIdFromSessionRow(entry.row),
      normalizeAccountPreferences(body.preferences || body)
    );
    return sendJson(res, 200, {
      ok: true,
      preferences: accountPreferencesWithDefaults(saved?.preferences, saved?.updatedAt),
    });
  }

  function handlePreferencesDelete(req, res) {
    const entry = requireAuthenticatedEntry(req, res);
    if (!entry) return;
    store.clearAccountPreferences(accountIdFromSessionRow(entry.row));
    return sendJson(res, 200, {
      ok: true,
      preferences: accountPreferencesWithDefaults(),
    });
  }

  async function handleRequest(req, res) {
    try {
      const url = new URL(req.url || "/", "http://localhost");
      const pathname = url.pathname;
      if (req.method === "GET" && pathname === "/health") {
        return sendJson(res, 200, {
          ok: true,
          service: "xjk-auth",
          timestamp: new Date().toISOString(),
          oauthConfigured: oauthConfigured(config.oauth),
          adminIdentityConfigured: xjkAdminIdentityConfigured(config.adminIdentity),
          publicOrigin: config.publicOrigin,
          requestHost: requestHost(req),
        });
      }
      if (req.method === "GET" && pathname === "/auth/ubisoft/login") return handleLogin(req, res, url);
      if (req.method === "GET" && pathname === config.callbackPath) return handleCallback(req, res, url);
      if (["POST", "GET"].includes(req.method) && pathname === "/auth/logout") return handleLogout(req, res);
      if (req.method === "GET" && pathname === "/api/v1/account/session") return handleSession(req, res);
      if (req.method === "GET" && pathname === "/api/v1/account/me") return handleMe(req, res);
      if (req.method === "GET" && pathname === "/api/v1/account/preferences") return handlePreferencesGet(req, res);
      if (["PUT", "POST"].includes(req.method) && pathname === "/api/v1/account/preferences") {
        return handlePreferencesPut(req, res);
      }
      if (req.method === "DELETE" && pathname === "/api/v1/account/preferences") {
        return handlePreferencesDelete(req, res);
      }
      if (req.method === "GET" && pathname.startsWith("/shared/")) return staticFiles.serveShared(req, res);
      if (req.method === "GET" && (isAccountHost(req) || pathname === "/account" || pathname.startsWith("/account/"))) {
        return staticFiles.serveAccount(req, res);
      }
      return sendText(res, 404, "Not Found");
    } catch (error) {
      return sendJson(res, Number(error?.statusCode || 500), {
        ok: false,
        error: error?.message || "Unhandled xjk auth error.",
      });
    }
  }

  return { handleRequest };
}

export { createXjkAuthApp };
