import {
  buildServicePublicUrl,
  normalizeOriginRelativePath,
  normalizeUbisoftProfile,
  parseCookies,
} from "../../shared/xjkAuth.js";
import { createSharedIdentityNavigation } from "../../shared/xjkIdentityNavigation.js";

export function createIdentityService({ config, sharedAuthStore = null } = {}) {
  function oauthConfigured() {
    if (sharedAuthStore) return Boolean(config.sharedAuthOrigin);
    return Boolean(
      config.oauthEnabled &&
        config.clientId &&
        config.clientSecret &&
        config.authorizeUrl &&
        config.tokenUrl &&
        config.userInfoUrl
    );
  }

  function buildLearnPublicUrl(req, requestPath = "/#/profile") {
    return buildServicePublicUrl(req, requestPath, {
      localOrigin: config.sharedAuthLocalOrigin,
      localPathPrefix: "/learn",
    });
  }

  const { buildLoginUrl: buildSharedLoginUrl, buildLogoutCookie: buildSharedLogoutCookie } =
    createSharedIdentityNavigation({
      config,
      buildPublicUrl: buildLearnPublicUrl,
      defaultPath: "/#/profile",
    });

  function getSessionToken(req) {
    return String(parseCookies(req)[config.sessionCookieName] || "").trim();
  }

  function safeReturnTo(value, fallback = "/#/profile") {
    return normalizeOriginRelativePath(value, fallback);
  }

  function normalizeProfile(userInfo = {}, tokenInfo = {}) {
    const normalized = normalizeUbisoftProfile(
      userInfo,
      { id_token: tokenInfo.id_token || "" },
      { fallbackDisplayNameToAccountId: false }
    );
    const zone =
      userInfo.zone || userInfo.country || userInfo.countryCode || userInfo.country_code || userInfo.region || null;
    return {
      provider: "nadeo-profile",
      accountId: normalized.ubisoftAccountId,
      subject: normalized.subject,
      displayName: normalized.displayName,
      username: normalized.displayName,
      zone: typeof zone === "string" ? zone : null,
      providerPayloadKeys: Object.keys(userInfo || {}).sort(),
    };
  }

  function publicSession(session) {
    if (!session) return null;
    return {
      user: session.user || null,
      createdAt: new Date(session.createdAt).toISOString(),
      expiresAt: new Date(session.expiresAt).toISOString(),
      oauth: {
        hasAccessToken: Boolean(session.oauth?.accessToken),
        accessTokenExpiresAt: session.oauth?.expiresAt ? new Date(session.oauth.expiresAt).toISOString() : null,
      },
    };
  }

  return {
    oauthConfigured,
    buildLearnPublicUrl,
    buildSharedLoginUrl,
    buildSharedLogoutCookie,
    getSessionToken,
    safeReturnTo,
    normalizeProfile,
    publicSession,
  };
}
