import { decodeJwtPayload } from "../tokenUtils.js";

export function normalizeUbisoftProfile(userInfo = {}, tokenInfo = {}, { fallbackDisplayNameToAccountId = true } = {}) {
  const jwt = decodeJwtPayload(tokenInfo.id_token || tokenInfo.access_token || "") || {};
  const ubisoftAccountId =
    String(
      userInfo.accountId || userInfo.account_id || userInfo.account || userInfo.id || userInfo.sub || jwt.sub || ""
    ).trim() || null;
  const subject = String(userInfo.sub || jwt.sub || ubisoftAccountId || "").trim() || null;
  const displayName =
    String(
      userInfo.displayName ||
        userInfo.display_name ||
        userInfo.preferred_username ||
        userInfo.nickname ||
        userInfo.name ||
        userInfo.login ||
        jwt.preferred_username ||
        jwt.nickname ||
        (fallbackDisplayNameToAccountId ? ubisoftAccountId : "") ||
        ""
    ).trim() || null;
  const username =
    String(
      userInfo.preferred_username ||
        userInfo.nickname ||
        userInfo.login ||
        userInfo.display_name ||
        userInfo.displayName ||
        jwt.preferred_username ||
        jwt.nickname ||
        displayName ||
        ""
    ).trim() || null;
  return {
    provider: "ubisoft",
    ubisoftAccountId,
    subject,
    displayName,
    username,
    zone:
      typeof userInfo.zone === "string"
        ? userInfo.zone
        : typeof userInfo.country === "string"
          ? userInfo.country
          : null,
  };
}

export function oauthConfigured(config = {}) {
  return Boolean(
    config.enabled &&
      config.clientId &&
      config.clientSecret &&
      config.authorizeUrl &&
      config.tokenUrl &&
      config.userInfoUrl
  );
}

export async function requestJson(url, options = {}, { timeoutMs = 15000, fetchImpl = fetch } = {}) {
  const response = await fetchImpl(url, {
    ...options,
    signal: AbortSignal.timeout(timeoutMs),
  });
  const text = await response.text();
  let payload = {};
  if (text) {
    try {
      payload = JSON.parse(text);
    } catch {
      payload = {};
    }
  }
  if (!response.ok) {
    const reason =
      payload.error_description ||
      payload.error ||
      payload.message ||
      payload.detail ||
      String(text || "").trim() ||
      `HTTP ${response.status}`;
    const error = new Error(reason);
    error.statusCode = response.status;
    error.payload = payload;
    error.responseText = text;
    throw error;
  }
  return payload;
}

async function requestUbisoftTokenGrant(config, grantFields, { fetchImpl = fetch } = {}) {
  const form = new URLSearchParams();
  for (const [name, value] of Object.entries(grantFields)) form.set(name, value);
  form.set("client_id", config.clientId);
  form.set("client_secret", config.clientSecret);
  return requestJson(
    config.tokenUrl,
    {
      method: "POST",
      headers: {
        "content-type": "application/x-www-form-urlencoded",
        "user-agent": config.userAgent || "xjk auth",
      },
      body: form.toString(),
    },
    { timeoutMs: config.requestTimeoutMs || 15000, fetchImpl }
  );
}

export async function exchangeUbisoftCode(config, { code, redirectUri }, { fetchImpl = fetch } = {}) {
  return requestUbisoftTokenGrant(
    config,
    {
      grant_type: "authorization_code",
      code,
      redirect_uri: redirectUri,
    },
    { fetchImpl }
  );
}

export async function refreshUbisoftToken(config, refreshToken, { fetchImpl = fetch } = {}) {
  return requestUbisoftTokenGrant(
    config,
    {
      grant_type: "refresh_token",
      refresh_token: String(refreshToken || "").trim(),
    },
    { fetchImpl }
  );
}

export async function fetchUbisoftUserInfo(config, accessToken, { fetchImpl = fetch } = {}) {
  return requestJson(
    config.userInfoUrl,
    {
      method: "GET",
      headers: {
        authorization: `Bearer ${String(accessToken || "").trim()}`,
        "user-agent": config.userAgent || "xjk auth",
      },
    },
    { timeoutMs: config.requestTimeoutMs || 15000, fetchImpl }
  );
}
