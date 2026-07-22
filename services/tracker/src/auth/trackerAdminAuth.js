import crypto from "node:crypto";
import { readRequestToken, timingSafeEqualText } from "../../../shared/httpAuth.js";
import { buildCookie as buildCookieHeader, parseCookies, requestIsSecure } from "../../../shared/xjkAuth.js";

function getRemoteIp(req) {
  return String(req?.headers?.["x-forwarded-for"] || req?.socket?.remoteAddress || "")
    .split(",")[0]
    .trim();
}

class TrackerAdminAuth {
  constructor({
    adminToken = "",
    username = "",
    password = "",
    sessionCookieName = "tracker_admin_session",
    sessionTtlSeconds = 12 * 60 * 60,
    allowOpen = true,
    logger = console,
  } = {}) {
    this.adminToken = String(adminToken || "").trim();
    this.username = String(username || "").trim();
    this.password = String(password || "");
    this.sessionCookieName = String(sessionCookieName || "tracker_admin_session").trim() || "tracker_admin_session";
    this.sessionTtlSeconds = Math.max(300, Number(sessionTtlSeconds) || 12 * 60 * 60);
    this.allowOpen = Boolean(allowOpen);
    this.logger = logger;
    this.sessions = new Map();
  }

  get tokenEnabled() {
    return Boolean(this.adminToken);
  }

  get credentialsEnabled() {
    return Boolean(this.username) && Boolean(this.password);
  }

  get openMode() {
    return this.allowOpen && !this.tokenEnabled && !this.credentialsEnabled;
  }

  getModeSummary() {
    const methods = [];
    if (this.credentialsEnabled) methods.push("password");
    if (this.tokenEnabled) methods.push("token");
    if (this.openMode) methods.push("open");
    return {
      openMode: this.openMode,
      tokenEnabled: this.tokenEnabled,
      credentialsEnabled: this.credentialsEnabled,
      loginMethods: methods,
      sessionCookieName: this.sessionCookieName,
      sessionTtlSeconds: this.sessionTtlSeconds,
    };
  }

  extractRequestToken(req) {
    return readRequestToken(req, { headerNames: ["x-admin-token"] });
  }

  verifyRequestToken(req) {
    if (!this.tokenEnabled) return false;
    const token = this.extractRequestToken(req);
    if (!token) return false;
    return timingSafeEqualText(token, this.adminToken);
  }

  getSessionTokenFromRequest(req) {
    const cookies = parseCookies(req);
    return String(cookies[this.sessionCookieName] || "").trim();
  }

  getSessionByToken(rawToken) {
    const token = String(rawToken || "").trim();
    if (!token) return null;
    const session = this.sessions.get(token);
    if (!session) return null;
    if (session.expiresAt <= Date.now()) {
      this.sessions.delete(token);
      return null;
    }
    return {
      token,
      ...session,
    };
  }

  getSessionFromRequest(req) {
    const session = this.getSessionByToken(this.getSessionTokenFromRequest(req));
    if (!session) return null;
    const now = Date.now();
    this.sessions.set(session.token, {
      ...session,
      lastSeenAt: now,
    });
    return {
      ...session,
      lastSeenAt: now,
    };
  }

  createSession({ username, req }) {
    const now = Date.now();
    const token = crypto.randomBytes(32).toString("hex");
    const session = {
      username: String(username || "admin"),
      createdAt: now,
      updatedAt: now,
      lastSeenAt: now,
      expiresAt: now + this.sessionTtlSeconds * 1000,
      ip: getRemoteIp(req),
      userAgent: String(req?.headers?.["user-agent"] || "").slice(0, 256),
    };
    this.sessions.set(token, session);
    return {
      token,
      session,
    };
  }

  attachSessionCookie(res, req, token) {
    const secure = requestIsSecure(req);
    res.setHeader(
      "Set-Cookie",
      buildCookieHeader({
        name: this.sessionCookieName,
        value: token,
        maxAgeSeconds: this.sessionTtlSeconds,
        path: "/",
        httpOnly: true,
        secure,
        sameSite: "Lax",
      })
    );
  }

  clearSessionCookie(res, req) {
    const secure = requestIsSecure(req);
    res.setHeader(
      "Set-Cookie",
      buildCookieHeader({
        name: this.sessionCookieName,
        value: "",
        maxAgeSeconds: 0,
        path: "/",
        httpOnly: true,
        secure,
        sameSite: "Lax",
      })
    );
  }

  login({ username, password, adminToken, req, res } = {}) {
    if (this.openMode) {
      const created = this.createSession({
        username: "open-admin",
        req,
      });
      this.attachSessionCookie(res, req, created.token);
      return {
        ok: true,
        user: {
          username: created.session.username,
        },
        authenticatedVia: "open",
        session: {
          expiresAt: new Date(created.session.expiresAt).toISOString(),
        },
      };
    }

    const tokenInput = String(adminToken || "").trim();
    if (tokenInput) {
      if (!this.tokenEnabled || !timingSafeEqualText(tokenInput, this.adminToken)) {
        return {
          ok: false,
          statusCode: 401,
          error: "Invalid admin token.",
        };
      }
      const created = this.createSession({
        username: this.credentialsEnabled ? this.username : "token-admin",
        req,
      });
      this.attachSessionCookie(res, req, created.token);
      return {
        ok: true,
        user: {
          username: created.session.username,
        },
        authenticatedVia: "token",
        session: {
          expiresAt: new Date(created.session.expiresAt).toISOString(),
        },
      };
    }

    if (!this.credentialsEnabled) {
      return {
        ok: false,
        statusCode: 503,
        error:
          "Tracker username/password login is not configured. Set TRACKER_ADMIN_USERNAME and TRACKER_ADMIN_PASSWORD.",
      };
    }

    const userInput = String(username || "").trim();
    const passwordInput = String(password || "");
    const userValid = timingSafeEqualText(userInput, this.username);
    const passwordValid = timingSafeEqualText(passwordInput, this.password);
    if (!userValid || !passwordValid) {
      return {
        ok: false,
        statusCode: 401,
        error: "Invalid username or password.",
      };
    }

    const created = this.createSession({
      username: this.username,
      req,
    });
    this.attachSessionCookie(res, req, created.token);
    return {
      ok: true,
      user: {
        username: created.session.username,
      },
      authenticatedVia: "password",
      session: {
        expiresAt: new Date(created.session.expiresAt).toISOString(),
      },
    };
  }

  logout({ req, res } = {}) {
    const sessionToken = this.getSessionTokenFromRequest(req);
    if (sessionToken) {
      this.sessions.delete(sessionToken);
    }
    this.clearSessionCookie(res, req);
    return {
      ok: true,
    };
  }

  authenticate(req) {
    if (this.openMode) {
      return {
        ok: true,
        source: "open",
        user: {
          username: "open-admin",
        },
      };
    }

    if (this.verifyRequestToken(req)) {
      return {
        ok: true,
        source: "token",
        user: {
          username: this.credentialsEnabled ? this.username : "token-admin",
        },
      };
    }

    const session = this.getSessionFromRequest(req);
    if (session) {
      return {
        ok: true,
        source: "session",
        user: {
          username: session.username,
        },
      };
    }

    return {
      ok: false,
      statusCode: 401,
      error: "Unauthorized. Login or provide tracker admin token.",
    };
  }

  requireAdminMiddleware() {
    return (req, res, next) => {
      const auth = this.authenticate(req);
      if (!auth.ok) {
        return res.status(auth.statusCode || 401).json({ error: auth.error || "Unauthorized" });
      }
      req.trackerAdminAuth = auth;
      return next();
    };
  }

  getAuthStatus(req) {
    const auth = this.authenticate(req);
    const mode = this.getModeSummary();
    return {
      provider: "tracker-admin-local",
      ...mode,
      authenticated: Boolean(auth.ok),
      authenticatedVia: auth.ok ? auth.source : null,
      user: auth.ok ? auth.user : null,
    };
  }

  cleanupExpired() {
    const now = Date.now();
    for (const [token, session] of this.sessions.entries()) {
      if (Number(session?.expiresAt || 0) <= now) {
        this.sessions.delete(token);
      }
    }
  }
}

export { TrackerAdminAuth };
