import crypto from "crypto";

function parseCookies(req) {
  const header = String(req?.headers?.cookie || "");
  const entries = header
    .split(";")
    .map((part) => part.trim())
    .filter(Boolean);
  const out = {};
  for (const entry of entries) {
    const index = entry.indexOf("=");
    if (index <= 0) continue;
    const key = decodeURIComponent(entry.slice(0, index).trim());
    const value = decodeURIComponent(entry.slice(index + 1).trim());
    out[key] = value;
  }
  return out;
}

function buildCookieHeader({
  name,
  value,
  maxAgeSeconds,
  path = "/",
  httpOnly = true,
  secure = false,
  sameSite = "Lax",
} = {}) {
  const parts = [`${encodeURIComponent(name)}=${encodeURIComponent(value || "")}`];
  if (Number.isFinite(maxAgeSeconds)) parts.push(`Max-Age=${Math.max(0, Math.floor(maxAgeSeconds))}`);
  if (path) parts.push(`Path=${path}`);
  if (httpOnly) parts.push("HttpOnly");
  if (secure) parts.push("Secure");
  if (sameSite) parts.push(`SameSite=${sameSite}`);
  return parts.join("; ");
}

function decodeJwtPayload(token) {
  const raw = String(token || "");
  const parts = raw.split(".");
  if (parts.length < 2) return null;
  try {
    const normalized = parts[1].replace(/-/g, "+").replace(/_/g, "/");
    const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "=");
    const decoded = Buffer.from(padded, "base64").toString("utf8");
    return JSON.parse(decoded);
  } catch {
    return null;
  }
}

function getTokenExpiryMs(tokenInfo = {}, fallbackMs = 0) {
  const jwtPayload = decodeJwtPayload(tokenInfo?.access_token || tokenInfo?.id_token || "");
  const jwtExpSeconds = Number(jwtPayload?.exp || 0);
  if (Number.isFinite(jwtExpSeconds) && jwtExpSeconds > 0) {
    return jwtExpSeconds * 1000;
  }
  const expiresInSeconds = Number(tokenInfo?.expires_in || tokenInfo?.expiresIn || 0);
  if (Number.isFinite(expiresInSeconds) && expiresInSeconds > 0) {
    return Date.now() + expiresInSeconds * 1000;
  }
  return fallbackMs;
}

function buildAbsoluteUrl(req, path) {
  const rawProto = String(req.headers["x-forwarded-proto"] || req.protocol || "http")
    .split(",")[0]
    .trim()
    .toLowerCase();
  const protocol = rawProto === "https" ? "https" : "http";
  const host = String(req.headers["x-forwarded-host"] || req.headers.host || "localhost").trim();
  return `${protocol}://${host}${path.startsWith("/") ? path : `/${path}`}`;
}

function normalizeUserProfile(userInfo = {}, tokenInfo = {}) {
  const jwtPayload = decodeJwtPayload(tokenInfo?.id_token || "");
  const subject =
    String(
      userInfo.sub ||
        userInfo.account_id ||
        userInfo.accountId ||
        userInfo.user_id ||
        jwtPayload?.sub ||
        ""
    ).trim() || null;
  const username =
    String(
      userInfo.preferred_username ||
        userInfo.nickname ||
        userInfo.display_name ||
        userInfo.name ||
        userInfo.login ||
        jwtPayload?.preferred_username ||
        jwtPayload?.nickname ||
        ""
    ).trim() || null;

  return {
    subject,
    username,
    raw: {
      userInfo,
      tokenInfo,
      jwtPayload,
    },
  };
}

function deriveAuthConfigState(config = {}) {
  const hasEndpoints =
    Boolean(config.authorizeUrl) && Boolean(config.tokenUrl) && Boolean(config.userInfoUrl);
  const hasCredentials = Boolean(config.clientId) && Boolean(config.clientSecret);
  const enabled = Boolean(config.enabled && hasEndpoints && hasCredentials);
  return {
    enabled,
    hasEndpoints,
    hasCredentials,
  };
}

class UbisoftAuth {
  constructor({
    enabled = false,
    clientId = "",
    clientSecret = "",
    authorizeUrl = "",
    tokenUrl = "",
    userInfoUrl = "",
    scope = "openid profile",
    callbackPath = "/auth/ubisoft/callback",
    allowedSubjects = [],
    allowedUsernames = [],
    sessionCookieName = "altered_admin_session",
    sessionTtlSeconds = 43200,
    oauthStateTtlSeconds = 600,
    allowlistResolver = null,
    sessionStore = null,
    logger = console,
  } = {}) {
    this.config = {
      enabled: Boolean(enabled),
      clientId: String(clientId || "").trim(),
      clientSecret: String(clientSecret || "").trim(),
      authorizeUrl: String(authorizeUrl || "").trim(),
      tokenUrl: String(tokenUrl || "").trim(),
      userInfoUrl: String(userInfoUrl || "").trim(),
      scope: String(scope || "openid profile").trim() || "openid profile",
      callbackPath: String(callbackPath || "/auth/ubisoft/callback").trim() || "/auth/ubisoft/callback",
      allowedSubjects: Array.isArray(allowedSubjects) ? allowedSubjects : [],
      allowedUsernames: Array.isArray(allowedUsernames)
        ? allowedUsernames.map((value) => String(value || "").toLowerCase()).filter(Boolean)
        : [],
      sessionCookieName: String(sessionCookieName || "altered_admin_session").trim(),
      sessionTtlSeconds: Math.max(300, Number(sessionTtlSeconds) || 43200),
      oauthStateTtlSeconds: Math.max(60, Number(oauthStateTtlSeconds) || 600),
    };
    this.logger = logger;
    this.allowlistResolver = typeof allowlistResolver === "function" ? allowlistResolver : null;
    this.sessionStore = sessionStore && typeof sessionStore === "object" ? sessionStore : null;
    this.states = new Map();
    this.sessions = new Map();
    this.pendingOAuthRefresh = new Map();
  }

  getStatus() {
    const status = deriveAuthConfigState(this.config);
    return {
      provider: "ubisoft-oauth",
      enabled: status.enabled,
      configured: status.hasEndpoints && status.hasCredentials,
      allowlist: {
        mode: this.allowlistResolver ? "resolver" : "static",
        subjects: this.config.allowedSubjects.length,
        usernames: this.config.allowedUsernames.length,
      },
    };
  }

  getSessionTokenFromRequest(req) {
    const cookies = parseCookies(req);
    return String(cookies[this.config.sessionCookieName] || "").trim();
  }

  getSessionByToken(token) {
    const sessionRecord = this.getSessionRecordByToken(token);
    if (!sessionRecord) return null;
    return {
      token: sessionRecord.token,
      user: sessionRecord.record.user,
      createdAt: sessionRecord.record.createdAt,
      expiresAt: sessionRecord.record.expiresAt,
    };
  }

  loadSessionFromStore(sessionToken) {
    if (!this.sessionStore || typeof this.sessionStore.getSessionRecordByToken !== "function") {
      return null;
    }
    try {
      const loaded = this.sessionStore.getSessionRecordByToken(sessionToken);
      if (!loaded) return null;
      if (loaded.record && typeof loaded.record === "object") {
        return {
          token: String(loaded.token || sessionToken).trim() || sessionToken,
          record: loaded.record,
        };
      }
      if (typeof loaded === "object") {
        return {
          token: sessionToken,
          record: loaded,
        };
      }
      return null;
    } catch (error) {
      this.logger.warn(`[altered-auth] load persisted session failed: ${error?.message || error}`);
      return null;
    }
  }

  persistSession(sessionToken, sessionRecord) {
    if (!this.sessionStore || typeof this.sessionStore.upsertSession !== "function") return;
    try {
      this.sessionStore.upsertSession({
        token: sessionToken,
        record: sessionRecord,
      });
    } catch (error) {
      this.logger.warn(`[altered-auth] persist session failed: ${error?.message || error}`);
    }
  }

  deletePersistedSession(sessionToken) {
    if (!this.sessionStore || typeof this.sessionStore.deleteSessionByToken !== "function") return;
    try {
      this.sessionStore.deleteSessionByToken(sessionToken);
    } catch (error) {
      this.logger.warn(`[altered-auth] delete persisted session failed: ${error?.message || error}`);
    }
  }

  cleanupPersistedSessions(nowMs = Date.now()) {
    if (!this.sessionStore || typeof this.sessionStore.deleteExpiredSessions !== "function") return;
    try {
      this.sessionStore.deleteExpiredSessions({
        beforeMs: nowMs,
      });
    } catch (error) {
      this.logger.warn(`[altered-auth] cleanup persisted sessions failed: ${error?.message || error}`);
    }
  }

  getSessionRecordByToken(token) {
    const sessionToken = String(token || "").trim();
    if (!sessionToken) return null;
    let record = this.sessions.get(sessionToken);
    if (!record) {
      const persisted = this.loadSessionFromStore(sessionToken);
      if (persisted?.record) {
        record = persisted.record;
        this.sessions.set(sessionToken, record);
      }
    }
    if (!record) return null;
    if (record.expiresAt <= Date.now()) {
      this.sessions.delete(sessionToken);
      this.deletePersistedSession(sessionToken);
      return null;
    }
    return {
      token: sessionToken,
      record,
    };
  }

  getSessionFromRequest(req) {
    return this.getSessionByToken(this.getSessionTokenFromRequest(req));
  }

  clearSession(res, req) {
    const token = this.getSessionTokenFromRequest(req);
    if (token) {
      this.sessions.delete(token);
      this.deletePersistedSession(token);
    }
    const secure = String(req.headers["x-forwarded-proto"] || req.protocol || "http")
      .toLowerCase()
      .includes("https");
    res.setHeader(
      "Set-Cookie",
      buildCookieHeader({
        name: this.config.sessionCookieName,
        value: "",
        maxAgeSeconds: 0,
        path: "/",
        httpOnly: true,
        secure,
        sameSite: "Lax",
      })
    );
  }

  buildLoginUrl({ req, returnTo = "/admin/" } = {}) {
    const status = deriveAuthConfigState(this.config);
    if (!status.enabled) return null;
    const state = crypto.randomBytes(20).toString("hex");
    const createdAt = Date.now();
    const expiresAt = createdAt + this.config.oauthStateTtlSeconds * 1000;
    const redirectUri = buildAbsoluteUrl(req, this.config.callbackPath);
    this.states.set(state, {
      returnTo: String(returnTo || "/admin/"),
      redirectUri,
      createdAt,
      expiresAt,
    });

    const url = new URL(this.config.authorizeUrl);
    url.searchParams.set("response_type", "code");
    url.searchParams.set("client_id", this.config.clientId);
    url.searchParams.set("redirect_uri", redirectUri);
    url.searchParams.set("scope", this.config.scope);
    url.searchParams.set("state", state);
    return url.toString();
  }

  async validateAllowlist(profile) {
    if (this.allowlistResolver) {
      try {
        const result = await this.allowlistResolver({
          subject: profile?.subject || "",
          username: profile?.username || "",
          profile,
        });
        if (result?.allowed) {
          return {
            allowed: true,
            user: result.user || null,
          };
        }
        return {
          allowed: false,
          reason:
            String(result?.reason || "").trim() ||
            "Authenticated Ubisoft user is not in the admin allowlist.",
        };
      } catch (error) {
        this.logger.error(`[altered-auth] allowlist lookup failed: ${error?.message || error}`);
        return {
          allowed: false,
          reason: "Admin allowlist lookup failed.",
        };
      }
    }

    const hasSubjectAllowlist = this.config.allowedSubjects.length > 0;
    const hasUsernameAllowlist = this.config.allowedUsernames.length > 0;

    if (!hasSubjectAllowlist && !hasUsernameAllowlist) {
      return {
        allowed: false,
        reason: "No allowlist configured. Set UBI_OAUTH_ALLOWED_SUBJECTS and/or UBI_OAUTH_ALLOWED_USERNAMES.",
      };
    }

    if (hasSubjectAllowlist && profile.subject) {
      if (this.config.allowedSubjects.includes(profile.subject)) {
        return { allowed: true };
      }
    }

    if (hasUsernameAllowlist && profile.username) {
      if (this.config.allowedUsernames.includes(profile.username.toLowerCase())) {
        return { allowed: true };
      }
    }

    return {
      allowed: false,
      reason: "Authenticated Ubisoft user is not in the admin allowlist.",
    };
  }

  async exchangeCode({ code, redirectUri }) {
    const payload = new URLSearchParams();
    payload.set("grant_type", "authorization_code");
    payload.set("code", code);
    payload.set("redirect_uri", redirectUri);
    payload.set("client_id", this.config.clientId);
    payload.set("client_secret", this.config.clientSecret);

    const response = await fetch(this.config.tokenUrl, {
      method: "POST",
      headers: {
        "content-type": "application/x-www-form-urlencoded",
      },
      body: payload.toString(),
    });

    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      const reason = String(data?.error_description || data?.error || "").trim();
      throw new Error(`OAuth token exchange failed (${response.status})${reason ? `: ${reason}` : ""}`);
    }
    if (!data?.access_token) {
      throw new Error("OAuth token exchange did not return access_token.");
    }
    return data;
  }

  async refreshOAuthAccessToken({ refreshToken }) {
    const token = String(refreshToken || "").trim();
    if (!token) {
      throw new Error("OAuth refresh_token is missing from session.");
    }

    const payload = new URLSearchParams();
    payload.set("grant_type", "refresh_token");
    payload.set("refresh_token", token);
    payload.set("client_id", this.config.clientId);
    payload.set("client_secret", this.config.clientSecret);

    const response = await fetch(this.config.tokenUrl, {
      method: "POST",
      headers: {
        "content-type": "application/x-www-form-urlencoded",
      },
      body: payload.toString(),
    });

    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      const reason = String(data?.error_description || data?.error || "").trim();
      throw new Error(`OAuth refresh failed (${response.status})${reason ? `: ${reason}` : ""}`);
    }
    if (!data?.access_token) {
      throw new Error("OAuth refresh did not return access_token.");
    }
    return data;
  }

  async fetchUserInfo(accessToken) {
    const response = await fetch(this.config.userInfoUrl, {
      method: "GET",
      headers: {
        authorization: `Bearer ${accessToken}`,
      },
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      const reason = String(data?.error_description || data?.error || "").trim();
      throw new Error(`OAuth userinfo failed (${response.status})${reason ? `: ${reason}` : ""}`);
    }
    return data;
  }

  isOAuthAccessFresh(sessionRecord, minLifetimeSeconds = 60) {
    const oauth = sessionRecord?.oauth || {};
    const accessToken = String(oauth.accessToken || "").trim();
    if (!accessToken) return false;
    const expiresAt = Number(oauth.expiresAt || 0);
    if (!Number.isFinite(expiresAt) || expiresAt <= 0) return true;
    return expiresAt - Date.now() > minLifetimeSeconds * 1000;
  }

  async ensureSessionOAuthAccessToken(req, { minLifetimeSeconds = 60 } = {}) {
    const sessionToken = this.getSessionTokenFromRequest(req);
    const sessionEntry = this.getSessionRecordByToken(sessionToken);
    if (!sessionEntry) return null;

    const { record } = sessionEntry;
    if (this.isOAuthAccessFresh(record, minLifetimeSeconds)) {
      return {
        accessToken: String(record.oauth?.accessToken || "").trim(),
        user: record.user,
      };
    }

    const refreshToken = String(record.oauth?.refreshToken || "").trim();
    if (!refreshToken) {
      return {
        accessToken: String(record.oauth?.accessToken || "").trim(),
        user: record.user,
      };
    }

    if (this.pendingOAuthRefresh.has(sessionToken)) {
      await this.pendingOAuthRefresh.get(sessionToken);
      const updated = this.getSessionRecordByToken(sessionToken);
      return {
        accessToken: String(updated?.record?.oauth?.accessToken || "").trim(),
        user: updated?.record?.user || record.user,
      };
    }

    const refreshPromise = (async () => {
      const refreshed = await this.refreshOAuthAccessToken({ refreshToken });
      const fallbackExpiry = Date.now() + 3600 * 1000;
      record.oauth = {
        ...record.oauth,
        accessToken: String(refreshed.access_token || "").trim(),
        refreshToken: String(refreshed.refresh_token || "").trim() || refreshToken,
        tokenType: String(refreshed.token_type || record.oauth?.tokenType || "Bearer").trim(),
        idToken: String(refreshed.id_token || record.oauth?.idToken || "").trim(),
        scope: String(refreshed.scope || record.oauth?.scope || this.config.scope).trim(),
        obtainedAt: Date.now(),
        expiresAt: getTokenExpiryMs(refreshed, fallbackExpiry),
      };
      this.persistSession(sessionToken, record);
    })();

    this.pendingOAuthRefresh.set(sessionToken, refreshPromise);
    try {
      await refreshPromise;
    } catch (error) {
      this.logger.warn(`[altered-auth] OAuth refresh failed: ${error?.message || error}`);
    } finally {
      this.pendingOAuthRefresh.delete(sessionToken);
    }

    const updated = this.getSessionRecordByToken(sessionToken);
    return {
      accessToken: String(updated?.record?.oauth?.accessToken || "").trim(),
      user: updated?.record?.user || record.user,
    };
  }

  async getNadeoAuthContextFromRequest(req) {
    const oauth = await this.ensureSessionOAuthAccessToken(req, {
      minLifetimeSeconds: 90,
    });
    if (!oauth || !oauth.accessToken) return null;
    return {
      ubisoftAccessToken: oauth.accessToken,
      user: oauth.user || null,
    };
  }

  async completeCallback({ req, code, state }) {
    const status = deriveAuthConfigState(this.config);
    if (!status.enabled) {
      return {
        ok: false,
        error: "Ubisoft OAuth is not configured.",
        code: "oauth_not_configured",
        statusCode: 503,
      };
    }
    const stateKey = String(state || "").trim();
    const stateRecord = this.states.get(stateKey);
    this.states.delete(stateKey);
    if (!stateRecord || stateRecord.expiresAt <= Date.now()) {
      return {
        ok: false,
        error: "OAuth state is invalid or expired.",
        code: "invalid_state",
        statusCode: 400,
      };
    }

    try {
      const tokenInfo = await this.exchangeCode({
        code,
        redirectUri: stateRecord.redirectUri || buildAbsoluteUrl(req, this.config.callbackPath),
      });
      const userInfo = await this.fetchUserInfo(tokenInfo.access_token);
      const profile = normalizeUserProfile(userInfo, tokenInfo);
      if (!profile.subject && !profile.username) {
        return {
          ok: false,
          error: "Could not identify Ubisoft user profile.",
          code: "profile_missing",
          statusCode: 403,
        };
      }

      const allow = await this.validateAllowlist(profile);
      if (!allow.allowed) {
        return {
          ok: false,
          error: allow.reason,
          code: "not_allowed",
          statusCode: 403,
        };
      }

      const now = Date.now();
      const sessionToken = crypto.randomBytes(32).toString("hex");
      const fallbackOauthExpiry = now + 3600 * 1000;
      const session = {
        user: {
          subject: profile.subject,
          username: profile.username,
          provider: "ubisoft",
          adminUserId: Number(allow?.user?.adminUserId || 0) || null,
          role: String(allow?.user?.role || "").trim() || null,
          displayName: String(allow?.user?.displayName || "").trim() || null,
        },
        oauth: {
          accessToken: String(tokenInfo?.access_token || "").trim(),
          refreshToken: String(tokenInfo?.refresh_token || "").trim(),
          tokenType: String(tokenInfo?.token_type || "Bearer").trim(),
          idToken: String(tokenInfo?.id_token || "").trim(),
          scope: String(tokenInfo?.scope || this.config.scope).trim(),
          obtainedAt: now,
          expiresAt: getTokenExpiryMs(tokenInfo, fallbackOauthExpiry),
        },
        createdAt: now,
        expiresAt: now + this.config.sessionTtlSeconds * 1000,
      };
      this.sessions.set(sessionToken, session);
      this.persistSession(sessionToken, session);

      return {
        ok: true,
        sessionToken,
        session,
        returnTo: String(stateRecord.returnTo || "/admin/"),
      };
    } catch (error) {
      this.logger.error(`[altered-auth] Ubisoft callback failed: ${error?.message || error}`);
      return {
        ok: false,
        error: error?.message || "OAuth callback failed.",
        code: "oauth_failed",
        statusCode: 500,
      };
    }
  }

  attachSessionCookie(res, req, sessionToken) {
    const secure = String(req.headers["x-forwarded-proto"] || req.protocol || "http")
      .toLowerCase()
      .includes("https");
    res.setHeader(
      "Set-Cookie",
      buildCookieHeader({
        name: this.config.sessionCookieName,
        value: sessionToken,
        maxAgeSeconds: this.config.sessionTtlSeconds,
        path: "/",
        httpOnly: true,
        secure,
        sameSite: "Lax",
      })
    );
  }

  cleanupExpired() {
    const now = Date.now();
    for (const [stateKey, state] of this.states.entries()) {
      if (state.expiresAt <= now) this.states.delete(stateKey);
    }
    for (const [token, session] of this.sessions.entries()) {
      if (session.expiresAt <= now) {
        this.sessions.delete(token);
        this.deletePersistedSession(token);
      }
    }
    this.cleanupPersistedSessions(now);
  }
}

export { UbisoftAuth, buildAbsoluteUrl };
