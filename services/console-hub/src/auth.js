import { waitForGlobalNadeoSlot } from "../../shared/nadeoGlobalThrottle.js";
import { ensureFreshSharedSession, parseCookies } from "../../shared/xjkAuth.js";
import {
  exchangeUbisoftCode,
  fetchUbisoftUserInfo,
  oauthConfigured as ubisoftOauthConfigured,
  refreshUbisoftToken,
  requestJson,
} from "../../shared/xjk-auth/oauth-profile.js";
import { DEFAULT_OAUTH_ACCESS_TOKEN_LIFETIME_MS } from "./constants.js";

export function createAuthService({ config, db, displayNames, fetchImpl = fetch, helpers, sharedAuthStore } = {}) {
  const { jsonTryParse, nowMs, tokenExpiryMs } = helpers;
  const { observeDisplayName, rememberObservedDisplayName } = displayNames;

  const oauthStates = new Map();

  function oauthConfigured() {
    if (sharedAuthStore) {
      return Boolean(config.sharedAuthOrigin);
    }
    return ubisoftOauthConfigured({ ...config, enabled: config.oauthEnabled });
  }

  async function throttledFetch(url, options = {}, { throttleLabel = "bingo-bridge" } = {}) {
    if (config.globalMinRequestGapMs > 0) {
      await waitForGlobalNadeoSlot({
        stateFile: config.globalThrottleFile,
        minGapMs: config.globalMinRequestGapMs,
        label: throttleLabel,
      });
    }
    return fetchImpl(url, options);
  }

  async function fetchJson(url, options = {}, { throttleLabel = "bingo-bridge" } = {}) {
    return requestJson(url, options, {
      timeoutMs: config.requestTimeoutMs,
      fetchImpl: (requestUrl, requestOptions) => throttledFetch(requestUrl, requestOptions, { throttleLabel }),
    });
  }

  async function exchangeCode({ code, redirectUri }) {
    return exchangeUbisoftCode(
      config,
      { code, redirectUri },
      {
        fetchImpl: (requestUrl, requestOptions) =>
          throttledFetch(requestUrl, requestOptions, { throttleLabel: "bingo-bridge-oauth-code" }),
      }
    );
  }

  async function refreshTrackmaniaOauth(refreshToken) {
    return refreshUbisoftToken(config, refreshToken, {
      fetchImpl: (requestUrl, requestOptions) =>
        throttledFetch(requestUrl, requestOptions, { throttleLabel: "bingo-bridge-oauth-refresh" }),
    });
  }

  async function fetchUserInfo(accessToken) {
    return fetchUbisoftUserInfo(config, accessToken, {
      fetchImpl: (requestUrl, requestOptions) =>
        throttledFetch(requestUrl, requestOptions, { throttleLabel: "bingo-bridge-oauth-userinfo" }),
    });
  }

  function upsertUser({ accountId, subject, displayName, isOperator = false }) {
    return rememberObservedDisplayName({
      accountId,
      subject,
      displayName,
      isOperator,
    });
  }

  function saveSession({ sessionToken, profile, oauth, isOperator }) {
    const now = nowMs();
    const persistedDisplayName =
      upsertUser({
        accountId: profile.accountId,
        subject: profile.subject,
        displayName: profile.displayName,
        isOperator,
      }) || profile.displayName;
    profile.displayName = persistedDisplayName;
    db.prepare(
      `
      INSERT INTO bingo_oauth_sessions (
        session_token, account_id, subject, display_name, access_token, refresh_token, token_type,
        id_token, scope, oauth_expires_at, created_at, expires_at, is_operator
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(session_token) DO UPDATE SET
        account_id = excluded.account_id,
        subject = excluded.subject,
        display_name = excluded.display_name,
        access_token = excluded.access_token,
        refresh_token = excluded.refresh_token,
        token_type = excluded.token_type,
        id_token = excluded.id_token,
        scope = excluded.scope,
        oauth_expires_at = excluded.oauth_expires_at,
        expires_at = excluded.expires_at,
        is_operator = excluded.is_operator
    `
    ).run(
      sessionToken,
      profile.accountId,
      profile.subject || null,
      persistedDisplayName,
      oauth.accessToken,
      oauth.refreshToken || null,
      oauth.tokenType || "Bearer",
      oauth.idToken || null,
      oauth.scope || config.scope,
      oauth.expiresAt,
      now,
      now + config.sessionTtlSeconds * 1000,
      isOperator ? 1 : 0
    );
    void observeDisplayName(profile.accountId, persistedDisplayName, {
      subject: profile.subject,
      isOperator,
      source: "bingo-bridge-oauth-userinfo",
    }).catch((error) => {
      console.warn(`[bingo-bridge-displayname] session observe failed: ${error?.message || error}`);
    });
  }

  function deleteSession(sessionToken) {
    if (sharedAuthStore) {
      sharedAuthStore.deleteSessionByToken(sessionToken);
      return;
    }
    db.prepare("DELETE FROM bingo_oauth_sessions WHERE session_token = ?").run(sessionToken);
  }

  function getSessionByToken(sessionToken) {
    if (!sessionToken) return null;
    if (sharedAuthStore) {
      return sharedAuthStore.getJoinedSessionByToken(sessionToken);
    }
    const row = db
      .prepare("SELECT * FROM bingo_oauth_sessions WHERE session_token = ? AND expires_at > ?")
      .get(sessionToken, nowMs());
    return row || null;
  }

  function getSessionFromRequest(req) {
    if (sharedAuthStore) return sharedAuthStore.resolveSessionFromRequest(req);
    const token = String(parseCookies(req)[config.sessionCookieName] || "").trim();
    if (!token) return null;
    const row = getSessionByToken(token);
    if (!row) return null;
    return {
      token,
      row,
    };
  }

  function operatorEligible(profile) {
    const subject = String(profile?.subject || "")
      .trim()
      .toLowerCase();
    const accountId = String(profile?.accountId || "")
      .trim()
      .toLowerCase();
    const displayName = String(profile?.displayName || "")
      .trim()
      .toLowerCase();
    return (
      (subject && config.operatorSubjects.some((value) => value.toLowerCase() === subject)) ||
      (accountId && config.operatorSubjects.some((value) => value.toLowerCase() === accountId)) ||
      (displayName && config.operatorUsernames.some((value) => value.toLowerCase() === displayName))
    );
  }

  function setSetting(key, value) {
    db.prepare(
      `
      INSERT INTO bingo_settings (key, value, updated_at)
      VALUES (?, ?, ?)
      ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at
    `
    ).run(key, JSON.stringify(value), nowMs());
  }

  function getSetting(key, fallback = null) {
    const row = db.prepare("SELECT value FROM bingo_settings WHERE key = ?").get(key);
    if (!row) return fallback;
    return jsonTryParse(row.value, fallback);
  }

  async function ensureFreshOauthSession(row, { persistOperator = false } = {}) {
    if (!row) return null;
    if (sharedAuthStore && row.session_token) {
      const entry = await ensureFreshSharedSession(
        sharedAuthStore,
        { token: row.session_token, row },
        {
          ...config,
          enabled: config.oauthEnabled,
        }
      );
      const nextRow = entry?.row || row;
      if (
        persistOperator &&
        operatorEligible({
          subject: nextRow.subject,
          accountId: nextRow.account_id,
          displayName: nextRow.display_name,
        })
      ) {
        setSetting("operator_session", {
          accountId: nextRow.account_id,
          subject: nextRow.subject || "",
          displayName: nextRow.display_name,
          accessToken: nextRow.access_token,
          refreshToken: nextRow.refresh_token,
          expiresAt: nextRow.oauth_expires_at,
        });
      }
      return nextRow;
    }
    if (Number(row.oauth_expires_at || 0) - nowMs() > 90 * 1000) return row;
    if (!row.refresh_token) return row;
    const refreshed = await refreshTrackmaniaOauth(String(row.refresh_token || ""));
    const accessToken = String(refreshed.access_token || "").trim();
    if (!accessToken) throw new Error("OAuth refresh did not return an access token.");
    const nextRow = {
      ...row,
      access_token: accessToken,
      refresh_token: String(refreshed.refresh_token || row.refresh_token || "").trim(),
      token_type: String(refreshed.token_type || row.token_type || "Bearer").trim(),
      id_token: String(refreshed.id_token || row.id_token || "").trim(),
      scope: String(refreshed.scope || row.scope || config.scope).trim(),
      oauth_expires_at: tokenExpiryMs(refreshed, nowMs() + DEFAULT_OAUTH_ACCESS_TOKEN_LIFETIME_MS),
    };
    db.prepare(
      `
      UPDATE bingo_oauth_sessions
      SET access_token = ?, refresh_token = ?, token_type = ?, id_token = ?, scope = ?, oauth_expires_at = ?
      WHERE session_token = ?
    `
    ).run(
      nextRow.access_token,
      nextRow.refresh_token,
      nextRow.token_type,
      nextRow.id_token,
      nextRow.scope,
      nextRow.oauth_expires_at,
      row.session_token
    );
    if (persistOperator && Number(row.is_operator || 0) === 1) {
      setSetting("operator_session", {
        accountId: row.account_id,
        subject: row.subject || "",
        displayName: row.display_name,
        accessToken: nextRow.access_token,
        refreshToken: nextRow.refresh_token,
        expiresAt: nextRow.oauth_expires_at,
      });
    }
    return db.prepare("SELECT * FROM bingo_oauth_sessions WHERE session_token = ?").get(row.session_token);
  }

  function getOperatorIdentitySnapshot() {
    const stored = getSetting("operator_session", null);
    if (stored?.accountId && stored?.displayName) return stored;
    const serviceIdentity = getSetting("service_identity", null);
    if (serviceIdentity?.accountId && serviceIdentity?.displayName) return serviceIdentity;
    if (config.directoryAccountId && config.directoryDisplayName) {
      return {
        accountId: config.directoryAccountId,
        displayName: config.directoryDisplayName,
        subject: "",
      };
    }
    return null;
  }

  async function getOperatorOauthTokens() {
    if (config.operatorAccessToken && config.operatorRefreshToken) {
      return {
        accountId: config.directoryAccountId || "",
        displayName: config.directoryDisplayName || "Operator",
        accessToken: config.operatorAccessToken,
        refreshToken: config.operatorRefreshToken,
        subject: "",
      };
    }
    const stored = getSetting("operator_session", null);
    if (!stored?.refreshToken && !stored?.accessToken) return null;
    if (Number(stored?.expiresAt || 0) - nowMs() > 90 * 1000 && stored?.accessToken) {
      return stored;
    }
    if (!stored?.refreshToken) return stored || null;
    const refreshed = await refreshTrackmaniaOauth(String(stored.refreshToken || ""));
    const accessToken = String(refreshed.access_token || "").trim();
    if (!accessToken) throw new Error("Operator OAuth refresh did not return an access token.");
    const next = {
      ...stored,
      accessToken,
      refreshToken: String(refreshed.refresh_token || stored.refreshToken || "").trim(),
      expiresAt: tokenExpiryMs(refreshed, nowMs() + DEFAULT_OAUTH_ACCESS_TOKEN_LIFETIME_MS),
    };
    setSetting("operator_session", next);
    return next;
  }

  return {
    oauthStates,
    oauthConfigured,
    fetchJson,
    exchangeCode,
    refreshTrackmaniaOauth,
    fetchUserInfo,
    upsertUser,
    saveSession,
    deleteSession,
    getSessionByToken,
    getSessionFromRequest,
    operatorEligible,
    setSetting,
    getSetting,
    ensureFreshOauthSession,
    getOperatorIdentitySnapshot,
    getOperatorOauthTokens,
  };
}
