import { buildCentralLoginUrl, buildSharedSessionLogoutCookie } from "./xjkAuth.js";

function createSharedIdentityNavigation({ config = {}, buildPublicUrl, defaultPath = "/" } = {}) {
  if (typeof buildPublicUrl !== "function") {
    throw new TypeError("buildPublicUrl is required to create shared identity navigation.");
  }

  function buildLoginUrl(req, returnTo = buildPublicUrl(req, defaultPath)) {
    return buildCentralLoginUrl({
      authOrigin: config.sharedAuthOrigin,
      returnTo,
      fallbackReturnTo: buildPublicUrl(req, defaultPath),
      localOrigin: config.sharedAuthLocalOrigin,
      allowedHosts: config.sharedAuthAllowedReturnHosts,
    });
  }

  function buildLogoutCookie(req) {
    return buildSharedSessionLogoutCookie(req, {
      cookieName: config.sharedAuthSessionCookieName,
      cookieDomain: config.sharedAuthSessionCookieDomain,
    });
  }

  return { buildLoginUrl, buildLogoutCookie };
}

export { createSharedIdentityNavigation };
