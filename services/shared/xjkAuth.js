export { clampInt } from "./valueUtils.js";
export { decodeJwtPayload, oauthTokenExpiryMs as tokenExpiryMs } from "./tokenUtils.js";
export { parseBoolean as parseBool } from "./envUtils.js";
export { parseRequestCookies as parseCookies } from "./httpAuth.js";

export { firstDefined, loadEnvFile, normalizePath, parseList } from "./xjk-auth/configuration.js";
export {
  buildAbsoluteUrl,
  buildCentralLoginUrl,
  buildCookie,
  buildServicePublicUrl,
  buildSharedSessionLogoutCookie,
  canonicalizeLocalPathModeUrl,
  isLocalHostname,
  normalizeOriginRelativePath,
  normalizeReturnTo,
  requestHost,
  requestHostname,
  requestIsSecure,
} from "./xjk-auth/url-cookie-request.js";
export {
  exchangeUbisoftCode,
  fetchUbisoftUserInfo,
  normalizeUbisoftProfile,
  oauthConfigured,
  refreshUbisoftToken,
  requestJson,
} from "./xjk-auth/oauth-profile.js";
export {
  accountMatchesXjkAdminIdentity,
  decorateAccountWithXjkRoles,
  loadXjkAdminIdentityConfig,
  publicAccountFromRow,
  publicAccountWithRolesFromRow,
  publicSessionFromRow,
  publicSessionWithRolesFromRow,
  xjkAdminIdentityConfigured,
} from "./xjk-auth/role-row-mapping.js";
export { XjkAuthStore } from "./xjk-auth/sqlite-store.js";
export { DEFAULT_XJK_SESSION_TTL_SECONDS, ensureFreshSharedSession } from "./xjk-auth/session-policy.js";
