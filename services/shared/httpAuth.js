import crypto from "node:crypto";

function readHeader(req, name) {
  const value = req?.headers?.[String(name || "").toLowerCase()];
  return String(Array.isArray(value) ? value[0] : value || "").trim();
}

function timingSafeEqualText(left, right) {
  const leftBuffer = Buffer.from(String(left || ""), "utf8");
  const rightBuffer = Buffer.from(String(right || ""), "utf8");
  if (!leftBuffer.length || leftBuffer.length !== rightBuffer.length) return false;
  return crypto.timingSafeEqual(leftBuffer, rightBuffer);
}

function parseRequestCookies(req) {
  const cookies = {};
  const decodeCookiePart = (value) => {
    try {
      return decodeURIComponent(value);
    } catch {
      return value;
    }
  };
  for (const part of readHeader(req, "cookie").split(";")) {
    const separatorIndex = part.indexOf("=");
    if (separatorIndex <= 0) continue;
    const name = decodeCookiePart(part.slice(0, separatorIndex).trim());
    const value = decodeCookiePart(part.slice(separatorIndex + 1).trim());
    if (name) cookies[name] = value;
  }
  return cookies;
}

function readAuthorizationToken(req, { acceptRaw = true } = {}) {
  const authorization = readHeader(req, "authorization");
  if (!authorization) return "";
  const bearer = authorization.match(/^Bearer\s+(.+)$/i);
  if (bearer) return bearer[1].trim();
  return acceptRaw ? authorization : "";
}

function readRequestToken(req, { headerNames = [], includeAuthorization = true, acceptRawAuthorization = true } = {}) {
  for (const headerName of headerNames) {
    const token = readHeader(req, headerName);
    if (token) return token;
  }
  return includeAuthorization ? readAuthorizationToken(req, { acceptRaw: acceptRawAuthorization }) : "";
}

export { parseRequestCookies, readAuthorizationToken, readHeader, readRequestToken, timingSafeEqualText };
