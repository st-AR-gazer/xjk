function decodeJwtPayload(token) {
  const parts = String(token || "")
    .trim()
    .split(".");
  if (parts.length < 2) return null;

  try {
    const normalized = parts[1].replace(/-/g, "+").replace(/_/g, "/");
    const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "=");
    return JSON.parse(Buffer.from(padded, "base64").toString("utf8"));
  } catch {
    return null;
  }
}

function jwtExpiryMs(token) {
  const expirySeconds = Number(decodeJwtPayload(token)?.exp || 0);
  return Number.isFinite(expirySeconds) && expirySeconds > 0 ? expirySeconds * 1000 : 0;
}

function oauthTokenExpiryMs(tokenInfo = {}, fallbackMs = 0, { nowMs = Date.now() } = {}) {
  const jwtExpiry = jwtExpiryMs(tokenInfo.id_token || tokenInfo.access_token || "");
  if (jwtExpiry) return jwtExpiry;

  const expiresIn = Number(tokenInfo.expires_in || tokenInfo.expiresIn || 0);
  if (Number.isFinite(expiresIn) && expiresIn > 0) return nowMs + expiresIn * 1000;
  return fallbackMs;
}

function isTokenFresh(token, expiresAt = 0, { minLifetimeSeconds = 45, nowMs = Date.now() } = {}) {
  if (!String(token || "").trim()) return false;
  const expiry = Number(expiresAt || jwtExpiryMs(token) || 0);
  if (!expiry) return true;
  return expiry - nowMs > Math.max(0, Number(minLifetimeSeconds) || 0) * 1000;
}

export { decodeJwtPayload, isTokenFresh, jwtExpiryMs, oauthTokenExpiryMs };
