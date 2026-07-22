import { parseRequestCookies, readRequestToken, timingSafeEqualText } from "../../../shared/httpAuth.js";
import { escapeHtml } from "../../../shared/htmlUtils.js";
import { normalizeOriginRelativePath, requestIsSecure } from "../../../shared/xjkAuth.js";
import { DashSessionStore, DEFAULT_SESSION_TTL_MS } from "./dashSessionStore.js";

const DASH_COOKIE_NAME = "xjk_dash_auth";

function normalizeDashNextPath(value) {
  return normalizeOriginRelativePath(value, "/");
}

function renderDashLoginPage({ error = "", nextPath = "/" } = {}) {
  const safeError = escapeHtml(String(error || "").trim());
  const safeNext = escapeHtml(normalizeDashNextPath(nextPath));
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>xjk / dash login</title>
  <style>
    :root { color-scheme: dark; }
    body {
      margin: 0;
      min-height: 100vh;
      display: grid;
      place-items: center;
      font-family: "Segoe UI", Arial, sans-serif;
      background: radial-gradient(circle at 20% 10%, #102038, #05080f 58%);
      color: #d9e7ff;
    }
    .card {
      width: min(420px, calc(100% - 2rem));
      border: 1px solid rgba(80, 150, 255, 0.25);
      border-radius: 16px;
      background: rgba(9, 16, 28, 0.92);
      padding: 1.15rem;
      box-shadow: 0 16px 34px rgba(0, 0, 0, 0.35);
    }
    h1 { margin: 0 0 0.45rem; font-size: 1.15rem; }
    p { margin: 0.1rem 0 0.8rem; color: #9db6db; font-size: 0.9rem; }
    label { display: block; margin-bottom: 0.35rem; color: #c6dbff; font-size: 0.85rem; }
    input {
      width: 100%;
      min-height: 38px;
      border-radius: 10px;
      border: 1px solid rgba(120, 172, 255, 0.28);
      background: rgba(4, 10, 18, 0.85);
      color: #eff6ff;
      padding: 0.4rem 0.6rem;
      font: inherit;
      box-sizing: border-box;
    }
    button {
      margin-top: 0.7rem;
      min-height: 38px;
      border-radius: 10px;
      border: 1px solid rgba(88, 170, 255, 0.5);
      background: linear-gradient(135deg, #0a4c90, #1163b8);
      color: #f2f8ff;
      padding: 0.42rem 0.9rem;
      font: inherit;
      cursor: pointer;
    }
    .error {
      margin-bottom: 0.6rem;
      border: 1px solid rgba(255, 122, 122, 0.45);
      background: rgba(92, 16, 16, 0.65);
      color: #ffcdcd;
      padding: 0.45rem 0.55rem;
      border-radius: 9px;
      font-size: 0.84rem;
    }
  </style>
</head>
<body>
  <main class="card">
    <h1>Private Dashboard</h1>
    <p>Enter the dashboard token to continue.</p>
    ${safeError ? `<div class="error">${safeError}</div>` : ""}
    <form method="post" action="/dash/login">
      <label for="token">Token</label>
      <input id="token" name="token" type="password" required autocomplete="current-password" />
      <input type="hidden" name="next" value="${safeNext}" />
      <button type="submit">Sign in</button>
    </form>
  </main>
</body>
</html>`;
}

function createDashAuthentication({
  adminToken,
  allowInsecureOpen = false,
  isDashHostRequest = () => false,
  cookieName = DASH_COOKIE_NAME,
  sessionTtlMs = DEFAULT_SESSION_TTL_MS,
  sessionStore = new DashSessionStore({ ttlMs: sessionTtlMs }),
} = {}) {
  const configuredAdminToken = String(adminToken || "").trim();
  const cookieTtlMs = Math.max(
    1,
    Math.floor(Number(sessionStore.ttlMs) || Number(sessionTtlMs) || DEFAULT_SESSION_TTL_MS)
  );

  function getSessionToken(req) {
    return String(parseRequestCookies(req)[cookieName] || "").trim();
  }

  function hasValidCredentials(req) {
    const headerToken = readRequestToken(req, {
      headerNames: ["x-dash-token", "x-admin-token"],
    });
    if (headerToken && timingSafeEqualText(headerToken, configuredAdminToken)) return true;
    return sessionStore.validate(getSessionToken(req));
  }

  function cookieOptions(req, { includeMaxAge = true } = {}) {
    const options = {
      httpOnly: true,
      sameSite: "strict",
      secure: requestIsSecure(req),
      path: "/",
    };
    if (includeMaxAge) options.maxAge = cookieTtlMs;
    return options;
  }

  function middleware(req, res, next) {
    if (!configuredAdminToken) {
      if (allowInsecureOpen) return next();
      return res.status(503).json({ error: "Dashboard authentication is not configured." });
    }

    const dashApiRequest = req.path.startsWith("/api/v1/private/dash") || req.path.startsWith("/api/private/dash");
    if (!isDashHostRequest(req) && !dashApiRequest) return next();

    const pathLower = String(req.path || "").toLowerCase();
    if (pathLower === "/dash/login" || pathLower === "/dash/logout" || pathLower === "/health") {
      return next();
    }
    if (hasValidCredentials(req)) return next();
    if (req.path.startsWith("/api/")) return res.status(401).json({ error: "Unauthorized" });

    const nextPath = normalizeDashNextPath(req.originalUrl);
    return res.redirect(302, `/dash/login?next=${encodeURIComponent(nextPath)}`);
  }

  function showLogin(req, res) {
    if (!configuredAdminToken) {
      return res.status(503).type("text").send("Dash auth is not configured.");
    }
    return res
      .status(200)
      .type("html")
      .send(renderDashLoginPage({ nextPath: req.query.next }));
  }

  function login(req, res) {
    if (!configuredAdminToken) {
      return res.status(503).type("text").send("Dash auth is not configured.");
    }

    const token = String(req.body?.token || "").trim();
    const nextPath = normalizeDashNextPath(req.body?.next || req.query?.next);
    if (!timingSafeEqualText(token, configuredAdminToken)) {
      return res
        .status(401)
        .type("html")
        .send(renderDashLoginPage({ error: "Invalid token.", nextPath }));
    }

    const sessionToken = sessionStore.rotate(getSessionToken(req));
    res.cookie(cookieName, sessionToken, cookieOptions(req));
    return res.redirect(302, nextPath);
  }

  function logout(req, res) {
    sessionStore.revoke(getSessionToken(req));
    res.clearCookie(cookieName, cookieOptions(req, { includeMaxAge: false }));
    return res.redirect(302, "/dash/login");
  }

  return {
    cookieName,
    hasValidCredentials,
    login,
    logout,
    middleware,
    sessionStore,
    showLogin,
  };
}

export { createDashAuthentication, DASH_COOKIE_NAME, normalizeDashNextPath, renderDashLoginPage };
