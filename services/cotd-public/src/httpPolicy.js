import { readRequestToken, timingSafeEqualText } from "../../shared/httpAuth.js";
import { rawDebugAccessAllowed } from "./debugAccessPolicy.js";
import { setPrivateNoStore, shouldUsePrivateNoStore } from "./publicHttpPolicy.js";

function sendSuccess(res, data, statusCode = 200) {
  return res.status(statusCode).json({ ok: true, data });
}

function sendError(res, statusCode, code, message) {
  return res.status(statusCode).json({ ok: false, error: { code, message } });
}

function createCotdHttpPolicy({ adminToken, allowDebugRaw, cacheTtlMs, responseCache }) {
  function hasAdminAccess(req) {
    const token = readRequestToken(req, { headerNames: ["x-cotd-admin-token"] });
    return timingSafeEqualText(token, adminToken);
  }

  function requireAdmin(req, res, next) {
    if (!adminToken) {
      return sendError(
        res,
        503,
        "admin_not_configured",
        "COTD admin ingest is disabled until COTD_ADMIN_TOKEN is configured."
      );
    }
    if (!hasAdminAccess(req)) {
      return sendError(res, 401, "unauthorized", "A valid COTD admin token is required.");
    }
    return next();
  }

  function shouldIncludeRaw(req) {
    return rawDebugAccessAllowed({
      requested: req.query.debug,
      enabled: allowDebugRaw,
      adminConfigured: Boolean(adminToken),
      authenticated: hasAdminAccess(req),
    });
  }

  function privateResponseFor(req) {
    return shouldUsePrivateNoStore({
      debugValue: req.query?.debug,
      authenticated: hasAdminAccess(req),
      adminRoute: req.path === "/admin" || req.path.startsWith("/admin/"),
    });
  }

  function setCacheHeaders(res, cacheStatus = "miss") {
    const maxAgeSeconds = Math.floor(cacheTtlMs / 1000);
    res.setHeader("cache-control", maxAgeSeconds > 0 ? `public, max-age=${maxAgeSeconds}` : "no-store");
    res.setHeader("x-cotd-cache", cacheStatus);
  }

  function setRouteCacheHeaders(req, res, cacheStatus = "miss") {
    if (privateResponseFor(req)) setPrivateNoStore(res, "bypass");
    else setCacheHeaders(res, cacheStatus);
  }

  return {
    getCacheEntry: (key) => responseCache.get(key),
    hasAdminAccess,
    privateResponseFor,
    requireAdmin,
    sendError,
    sendSuccess,
    setCacheEntry: (key, value) => responseCache.set(key, value),
    setCacheHeaders,
    setRouteCacheHeaders,
    shouldIncludeRaw,
  };
}

export { createCotdHttpPolicy, sendError, sendSuccess };
