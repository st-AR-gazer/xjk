export function requestIsSecure(req) {
  const forwarded = String(req?.headers?.["x-forwarded-proto"] || "")
    .split(",")[0]
    .trim()
    .toLowerCase();
  if (forwarded) return forwarded === "https";
  return Boolean(req?.socket?.encrypted);
}

export function requestHost(req) {
  return String(req?.headers?.["x-forwarded-host"] || req?.headers?.host || "localhost")
    .split(",")[0]
    .trim();
}

export function requestHostname(req) {
  return requestHost(req).split(":")[0].trim().toLowerCase();
}

export function isLocalHostname(value) {
  const host = String(value || "")
    .trim()
    .toLowerCase();
  return (
    host === "localhost" ||
    host === "127.0.0.1" ||
    host === "::1" ||
    host === "xjk.localhost" ||
    host.endsWith(".localhost")
  );
}

export function buildCookie({
  name,
  value,
  maxAgeSeconds,
  secure = false,
  domain = "",
  path: cookiePath = "/",
  sameSite = "Lax",
  httpOnly = true,
} = {}) {
  const parts = [`${encodeURIComponent(name)}=${encodeURIComponent(value || "")}`];
  if (Number.isFinite(maxAgeSeconds)) parts.push(`Max-Age=${Math.max(0, Math.floor(maxAgeSeconds))}`);
  if (cookiePath) parts.push(`Path=${cookiePath}`);
  if (domain) parts.push(`Domain=${domain}`);
  if (httpOnly) parts.push("HttpOnly");
  if (sameSite) parts.push(`SameSite=${sameSite}`);
  if (secure) parts.push("Secure");
  return parts.join("; ");
}

export function normalizeOriginRelativePath(value, fallback = "/") {
  const normalizePath = (candidate) => {
    const text = String(candidate || "").trim();
    if (!text || text.includes("\\")) return "";
    if (text.startsWith("#")) return `/${text}`;
    if (text.startsWith("/") && !text.startsWith("//")) return text;
    return "";
  };

  const raw = String(value || "").trim();
  if (/^https?:\/\//i.test(raw)) {
    try {
      const url = new URL(raw);
      return normalizePath(`${url.pathname || "/"}${url.search}${url.hash}`) || normalizePath(fallback) || "/";
    } catch {
      return normalizePath(fallback) || "/";
    }
  }

  return normalizePath(raw) || normalizePath(fallback) || "/";
}

export function buildAbsoluteUrl(req, requestPath, { publicOrigin = "" } = {}) {
  const rawPath = String(requestPath || "").trim();
  const safePath = normalizeOriginRelativePath(rawPath.startsWith("/") ? rawPath : `/${rawPath}`);
  const explicitOrigin = String(publicOrigin || "").trim();
  if (explicitOrigin) {
    const origin = new URL(explicitOrigin);
    const target = new URL(safePath, origin);
    return target.origin === origin.origin ? target.toString() : new URL("/", origin).toString();
  }
  const protocol = requestIsSecure(req) ? "https" : "http";
  return `${protocol}://${requestHost(req)}${safePath}`;
}

export function buildServicePublicUrl(
  req,
  requestPath = "/",
  { localOrigin = "", localPathPrefix = "", publicOrigin = "" } = {}
) {
  const safePath = normalizeOriginRelativePath(requestPath, "/");
  if (isLocalHostname(requestHostname(req)) && String(localOrigin || "").trim()) {
    const prefix = normalizeOriginRelativePath(localPathPrefix || "/", "/").replace(/\/$/, "");
    return new URL(`${prefix}${safePath}`, localOrigin).toString();
  }
  return buildAbsoluteUrl(req, safePath, { publicOrigin });
}

export function buildSharedSessionLogoutCookie(
  req,
  { cookieName = "xjk_session", cookieDomain = "", sameSite = "Lax" } = {}
) {
  return buildCookie({
    name: cookieName,
    value: "",
    maxAgeSeconds: 0,
    secure: requestIsSecure(req),
    domain: isLocalHostname(requestHostname(req)) ? "" : cookieDomain,
    path: "/",
    sameSite,
    httpOnly: true,
  });
}

function localHostPrefixForPathMode(hostname) {
  return localPathPrefixForXjkHost(hostname);
}

export function canonicalizeLocalPathModeUrl(rawUrl, { localOrigin = "http://localhost:8080" } = {}) {
  const text = String(rawUrl || "").trim();
  if (!text) return "";
  try {
    const url = new URL(text);
    const prefix = localHostPrefixForPathMode(url.hostname);
    if (prefix === null) return text;
    const pathname = `${prefix}${url.pathname === "/" && prefix ? "/" : url.pathname}`.replace(/\/{2,}/g, "/");
    return new URL(`${pathname}${url.search}${url.hash}`, localOrigin).toString();
  } catch {
    return text;
  }
}

export function normalizeReturnTo(
  value,
  { fallback = "/", publicOrigin = "", allowedHosts = [], localOrigin = "" } = {}
) {
  const fallbackValue = String(fallback || "/").trim() || "/";
  const explicitOrigin = String(publicOrigin || "").trim();
  const normalizedAllowedHosts = new Set(
    allowedHosts
      .map((item) =>
        String(item || "")
          .trim()
          .toLowerCase()
      )
      .filter(Boolean)
  );
  if (explicitOrigin) {
    try {
      normalizedAllowedHosts.add(new URL(explicitOrigin).hostname.toLowerCase());
    } catch {}
  }
  const withFallback = (nextValue) =>
    normalizeReturnTo(nextValue, {
      fallback: "/",
      publicOrigin: explicitOrigin,
      allowedHosts: [...normalizedAllowedHosts],
      localOrigin,
    });
  const raw = String(value || "").trim();
  if (!raw) return withFallback(fallbackValue);
  if (raw.startsWith("#")) {
    const target = `/${raw}`;
    return explicitOrigin ? new URL(target, explicitOrigin).toString() : target;
  }
  if (/^https?:\/\//i.test(raw)) {
    try {
      const parsed = new URL(raw);
      const host = parsed.hostname.toLowerCase();
      if (!normalizedAllowedHosts.has(host)) return withFallback(fallbackValue);
      const localCanonical = localOrigin ? canonicalizeLocalPathModeUrl(parsed.toString(), { localOrigin }) : "";
      if (localCanonical && localCanonical !== parsed.toString()) return localCanonical;
      return parsed.toString();
    } catch {
      return withFallback(fallbackValue);
    }
  }
  if (raw.startsWith("/")) {
    const isOriginRelativePath = !raw.startsWith("//") && !raw.includes("\\");
    if (!isOriginRelativePath) return withFallback(fallbackValue);
    if (!explicitOrigin) return raw;
    try {
      const origin = new URL(explicitOrigin);
      const target = new URL(raw, origin);
      return target.origin === origin.origin ? target.toString() : withFallback(fallbackValue);
    } catch {
      return withFallback(fallbackValue);
    }
  }
  return withFallback(fallbackValue);
}

export function buildCentralLoginUrl({
  authOrigin,
  returnTo,
  fallbackReturnTo = "/",
  localOrigin = "",
  allowedHosts = [],
} = {}) {
  const origin = String(authOrigin || "").trim();
  if (!origin) throw new Error("authOrigin is required to build the central login URL.");
  const safeReturnTo = normalizeReturnTo(returnTo, {
    fallback: fallbackReturnTo,
    publicOrigin: origin,
    allowedHosts,
    localOrigin,
  });
  const loginUrl = new URL("/auth/ubisoft/login", origin);
  loginUrl.searchParams.set("return_to", safeReturnTo);
  return loginUrl.toString();
}
import { localPathPrefixForXjkHost } from "./oauth-return-hosts.js";
