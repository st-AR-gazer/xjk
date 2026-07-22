import { readRequestToken, timingSafeEqualText } from "../../../../shared/httpAuth.js";
import {
  buildCentralLoginUrl,
  buildCookie as buildSharedCookie,
  isLocalHostname as isSharedLocalHostname,
} from "../../../../shared/xjkAuth.js";
import { buildAbsoluteUrl } from "../../auth/ubisoftAuth.js";

function firstForwardedValue(value) {
  return String(value || "")
    .split(",")[0]
    .trim();
}

function extractRequestHost(req) {
  return firstForwardedValue(req.headers["x-forwarded-host"] || req.headers.host || req.hostname)
    .split(":")[0]
    .toLowerCase();
}

function isLoopbackAddress(value) {
  const ip = firstForwardedValue(value).toLowerCase();
  return (
    ip === "::1" || ip === "127.0.0.1" || ip === "::ffff:127.0.0.1" || ip.startsWith("127.") || ip === "::ffff:0:1"
  );
}

function resolveRequestOrigin(req) {
  const host = firstForwardedValue(req.headers["x-forwarded-host"] || req.headers.host);
  const protocol = firstForwardedValue(req.headers["x-forwarded-proto"] || req.protocol || "http").toLowerCase();
  if (!host || !/^[a-z][a-z0-9+.-]*$/.test(protocol)) return "";
  try {
    return new URL(`${protocol}://${host}`).origin;
  } catch {
    return "";
  }
}

function resolveSourceOrigin(req) {
  const source = firstForwardedValue(req.headers.origin || req.headers.referer);
  if (!source || source === "null") return "";
  try {
    return new URL(source).origin;
  } catch {
    return "";
  }
}

function createAdminRequestContext({ ubisoftAuth, sharedAuthStore, config }) {
  const {
    ADMIN_TOKEN,
    ALTERED_INTERNAL_TOKEN,
    XJK_SHARED_AUTH_ORIGIN,
    XJK_SHARED_AUTH_LOCAL_ORIGIN,
    XJK_SHARED_AUTH_SESSION_COOKIE_NAME,
    XJK_SHARED_AUTH_SESSION_COOKIE_DOMAIN,
    XJK_SHARED_AUTH_ALLOWED_RETURN_HOSTS,
  } = config;

  function getHeaderAdminToken(req) {
    return readRequestToken(req, {
      headerNames: ["x-admin-token"],
      includeAuthorization: true,
      acceptRawAuthorization: true,
    });
  }

  function tokensMatch(left, right) {
    return timingSafeEqualText(left, right);
  }

  function isConfiguredAdminToken(candidate) {
    return tokensMatch(String(candidate || "").trim(), String(ADMIN_TOKEN || "").trim());
  }

  function getStaticAdminSession(req) {
    if (!ADMIN_TOKEN) return null;
    const session = ubisoftAuth.getSessionFromRequest(req);
    return session?.user?.provider === "admin-token" ? session : null;
  }

  function getInternalServiceToken(req) {
    return readRequestToken(req, {
      headerNames: ["x-aggregator-token", "x-internal-token", "x-service-token"],
      includeAuthorization: false,
    });
  }

  function isLocalRequest(req) {
    const host = extractRequestHost(req);
    if (host) {
      return host === "localhost" || host === "127.0.0.1" || host === "::1" || host.endsWith(".localhost");
    }
    return isLoopbackAddress(req.headers["x-forwarded-for"] || req.socket?.remoteAddress);
  }

  function isTrustedServiceAdminRequest(req) {
    const token = getInternalServiceToken(req);
    if (!token || !isLocalRequest(req)) return false;
    const allowedTokens = [String(ALTERED_INTERNAL_TOKEN || "").trim()].filter(Boolean);
    return allowedTokens.some((allowedToken) => tokensMatch(token, allowedToken));
  }

  function buildAlteredPublicUrl(req, returnTo = "/admin/") {
    const returnPath = String(returnTo || "/admin/");
    const targetPath = returnPath.startsWith("/") ? returnPath : `/${returnPath}`;
    if (isSharedLocalHostname(extractRequestHost(req))) {
      return new URL(`/altered${targetPath}`, XJK_SHARED_AUTH_LOCAL_ORIGIN).toString();
    }
    return buildAbsoluteUrl(req, targetPath);
  }

  function getOAuthLoginUrl(req, returnTo = "/admin/") {
    if (sharedAuthStore) {
      return buildCentralLoginUrl({
        req,
        authOrigin: XJK_SHARED_AUTH_ORIGIN,
        returnTo: buildAlteredPublicUrl(req, returnTo),
        fallbackReturnTo: buildAlteredPublicUrl(req, "/admin/"),
        localOrigin: XJK_SHARED_AUTH_LOCAL_ORIGIN,
        allowedHosts: XJK_SHARED_AUTH_ALLOWED_RETURN_HOSTS,
      });
    }
    const encoded = encodeURIComponent(String(returnTo || "/admin/"));
    return buildAbsoluteUrl(req, `/auth/ubisoft/login?return_to=${encoded}`);
  }

  function buildSharedLogoutCookie(req) {
    const domain = isSharedLocalHostname(extractRequestHost(req)) ? "" : XJK_SHARED_AUTH_SESSION_COOKIE_DOMAIN;
    return buildSharedCookie({
      name: XJK_SHARED_AUTH_SESSION_COOKIE_NAME,
      value: "",
      maxAgeSeconds: 0,
      secure: firstForwardedValue(req.headers["x-forwarded-proto"] || req.protocol || "http").toLowerCase() === "https",
      domain,
      path: "/",
      sameSite: "Lax",
      httpOnly: true,
    });
  }

  return {
    buildAlteredPublicUrl,
    buildSharedLogoutCookie,
    extractRequestHost,
    getHeaderAdminToken,
    getInternalServiceToken,
    getOAuthLoginUrl,
    getStaticAdminSession,
    isConfiguredAdminToken,
    isLocalRequest,
    isTrustedServiceAdminRequest,
    resolveRequestOrigin,
    resolveSourceOrigin,
    tokensMatch,
  };
}

export { createAdminRequestContext };
