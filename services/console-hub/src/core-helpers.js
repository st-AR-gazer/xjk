import crypto from "node:crypto";
import { normalizePossibleAccountId, validateSharedDisplayName } from "../../shared/displayNameResolution.js";
import {
  buildServicePublicUrl,
  decodeJwtPayload,
  normalizeOriginRelativePath,
  tokenExpiryMs as sharedTokenExpiryMs,
} from "../../shared/xjkAuth.js";
import { createSharedIdentityNavigation } from "../../shared/xjkIdentityNavigation.js";
import { BINGO_ROOM_IDENTIFIER_LENGTH, NADEO_NAME_LIMIT } from "./constants.js";
import { joinUrlPath } from "./config.js";

export function createCoreHelpers(dependencies = {}) {
  const { config, sharedAuthStore } = dependencies;

  function nowMs() {
    return Date.now();
  }

  function uuid() {
    return crypto.randomUUID();
  }

  function base64Url(input) {
    return Buffer.from(input).toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
  }

  function hmacBase64Url(secret, message) {
    return crypto.createHmac("sha256", secret).update(message).digest("base64url");
  }

  function safeReturnTo(value, fallback = "/") {
    return normalizeOriginRelativePath(value, fallback);
  }

  function stripPublicBasePath(requestPath) {
    const pathname = String(requestPath || "").trim() || "/";
    if (!config.publicBasePath) return pathname;
    if (pathname === config.publicBasePath) return "/";
    if (pathname.startsWith(`${config.publicBasePath}/`)) {
      return pathname.slice(config.publicBasePath.length) || "/";
    }
    return pathname;
  }

  function toPublicPath(pathname = "/") {
    return joinUrlPath(config.publicBasePath, pathname);
  }

  function buildConsolePublicUrl(req, pathname = "/") {
    const publicPath = toPublicPath(pathname);
    return buildServicePublicUrl(req, publicPath, {
      localOrigin: config.sharedAuthLocalOrigin,
      localPathPrefix: "/console",
    });
  }

  const { buildLoginUrl: buildSharedLoginUrl, buildLogoutCookie: buildSharedLogoutCookie } =
    createSharedIdentityNavigation({
      config,
      buildPublicUrl: buildConsolePublicUrl,
      defaultPath: "/",
    });

  function buildLoginUrl(req = null, returnTo = null) {
    const fallbackReturnTo = req ? buildConsolePublicUrl(req, "/") : toPublicPath("/");
    const nextReturnTo = returnTo || fallbackReturnTo;
    if (sharedAuthStore && req) {
      return buildSharedLoginUrl(req, nextReturnTo);
    }
    return `${toPublicPath("/auth/ubisoft/login")}?return_to=${encodeURIComponent(
      safeReturnTo(nextReturnTo, toPublicPath("/"))
    )}`;
  }

  function tokenExpiryMs(tokenInfo = {}, fallbackMs = 0) {
    return sharedTokenExpiryMs(
      {
        access_token: tokenInfo.accessToken || tokenInfo.access_token || "",
        id_token: tokenInfo.id_token || "",
        expires_in: tokenInfo.expiresIn || tokenInfo.expires_in || 0,
      },
      fallbackMs
    );
  }

  function normalizeProfile(userInfo = {}, tokenInfo = {}) {
    const jwt = decodeJwtPayload(tokenInfo.id_token || tokenInfo.access_token || "");
    const accountId = normalizeBridgeAccountId(userInfo.accountId || userInfo.account_id || jwt?.sub || "");
    const subject = String(jwt?.sub || userInfo.sub || accountId || "").trim();
    const rawDisplayName = String(
      userInfo.displayName || userInfo.display_name || userInfo.name || userInfo.login || accountId
    ).trim();
    const displayName = sanitizeBridgeDisplayName(rawDisplayName, { accountId }) || rawDisplayName || accountId;
    return {
      accountId,
      subject,
      displayName,
    };
  }

  function stripTmStyle(value) {
    return String(value || "")
      .replace(/\$([0-9a-fA-F]{1,3}|[gimnostuwzGIMNOSTUWZ<>]|[hlpHLP](\[[^\]]+\])?)/g, "")
      .replace(/\s+/g, " ")
      .trim();
  }

  function slugify(value, fallback = "item", maxLength = 44) {
    const cleaned = stripTmStyle(value)
      .normalize("NFKD")
      .replace(/[^\x00-\x7F]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "");
    if (!cleaned) return fallback;
    return cleaned.slice(0, maxLength).replace(/-+$/g, "") || fallback;
  }

  function shortStableId(value, length = 4) {
    const hash = crypto
      .createHash("sha1")
      .update(String(value || ""))
      .digest("base64url");
    return hash.slice(0, Math.max(2, length)).toUpperCase();
  }

  function shortReadableId(value, length = 3) {
    return crypto
      .createHash("sha1")
      .update(String(value || ""))
      .digest("hex")
      .slice(0, Math.max(2, length))
      .toUpperCase();
  }

  function folderDisplayName(value, fallback = "item", maxLength = 28) {
    const cleaned = stripTmStyle(value)
      .normalize("NFKD")
      .replace(/[^\x00-\x7F]/g, "")
      .replace(/[^a-zA-Z0-9 _.-]+/g, "")
      .replace(/\s+/g, " ")
      .trim();
    const label = cleaned || fallback;
    return label.slice(0, maxLength).trim() || fallback;
  }

  function prefixedFolderName(identifier, label, fallback) {
    const id = String(identifier || "")
      .trim()
      .slice(0, BINGO_ROOM_IDENTIFIER_LENGTH)
      .toUpperCase();
    const maxLabelLength = Math.max(1, NADEO_NAME_LIMIT - id.length - 1);
    const name = folderDisplayName(label, fallback, maxLabelLength);
    return `${id} ${name}`.slice(0, NADEO_NAME_LIMIT).trim();
  }

  function jsonTryParse(value, fallback = null) {
    if (!value) return fallback;
    try {
      return JSON.parse(value);
    } catch {
      return fallback;
    }
  }

  function normalizeBridgeAccountId(value) {
    return normalizePossibleAccountId(value);
  }

  function sanitizeBridgeDisplayName(value, { accountId = "" } = {}) {
    const validated = validateSharedDisplayName(value, { accountId: normalizeBridgeAccountId(accountId) });
    return validated.ok ? validated.displayName : "";
  }

  return {
    nowMs,
    uuid,
    base64Url,
    hmacBase64Url,
    safeReturnTo,
    stripPublicBasePath,
    toPublicPath,
    buildConsolePublicUrl,
    buildSharedLoginUrl,
    buildSharedLogoutCookie,
    buildLoginUrl,
    tokenExpiryMs,
    normalizeProfile,
    stripTmStyle,
    slugify,
    shortStableId,
    shortReadableId,
    folderDisplayName,
    prefixedFolderName,
    jsonTryParse,
    normalizeBridgeAccountId,
    sanitizeBridgeDisplayName,
  };
}
