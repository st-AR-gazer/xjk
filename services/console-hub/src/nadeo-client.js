import { decodeJwtPayload } from "../../shared/xjkAuth.js";
import { DEFAULT_DEV_ACCESS_TOKEN_LIFETIME_MS } from "./constants.js";

export function createNadeoClient({ auth, config, helpers } = {}) {
  const { fetchJson, getOperatorOauthTokens, getSetting, setSetting } = auth;
  const { normalizeBridgeAccountId, nowMs, sanitizeBridgeDisplayName, tokenExpiryMs } = helpers;

  const tokenCache = new Map();

  async function requestBasicAudienceToken(audience) {
    const cacheKey = `service:${audience}`;
    const cached = tokenCache.get(cacheKey);
    if (cached && Number(cached.expiresAt || 0) - nowMs() > 45 * 1000) {
      return cached.accessToken;
    }
    if (!config.serviceLogin || !config.servicePassword) {
      return "";
    }
    const payload = await fetchJson(
      "https://prod.trackmania.core.nadeo.online/v2/authentication/token/basic",
      {
        method: "POST",
        headers: {
          authorization: `Basic ${Buffer.from(`${config.serviceLogin}:${config.servicePassword}`).toString("base64")}`,
          "content-type": "application/json",
          "user-agent": config.userAgent,
        },
        body: JSON.stringify({ audience }),
      },
      { throttleLabel: `bingo-bridge-service-${audience}` }
    );
    const accessToken = String(payload?.accessToken || "").trim();
    if (!accessToken) throw new Error(`Nadeo ${audience} basic auth did not return an access token.`);
    const decoded = decodeJwtPayload(accessToken) || {};
    if (decoded?.sub && decoded?.aun) {
      const accountId = normalizeBridgeAccountId(decoded.sub);
      const displayName = sanitizeBridgeDisplayName(decoded.aun, { accountId }) || String(decoded.aun || "").trim();
      setSetting("service_identity", {
        accountId,
        displayName,
        subject: accountId,
        source: "service-account",
        audience,
      });
    }
    tokenCache.set(cacheKey, {
      accessToken,
      expiresAt: tokenExpiryMs({ accessToken }, nowMs() + DEFAULT_DEV_ACCESS_TOKEN_LIFETIME_MS),
    });
    return accessToken;
  }

  async function requestOperatorAudienceToken(audience) {
    if (config.serviceLogin && config.servicePassword) {
      return requestBasicAudienceToken(audience);
    }
    const cacheKey = `operator:${audience}`;
    const cached = tokenCache.get(cacheKey);
    if (cached && Number(cached.expiresAt || 0) - nowMs() > 45 * 1000) {
      return cached.accessToken;
    }
    const operator = await getOperatorOauthTokens();
    if (!operator?.accessToken) {
      throw new Error("Operator Ubisoft OAuth session is not ready.");
    }
    const payload = await fetchJson(
      "https://prod.trackmania.core.nadeo.online/v2/authentication/token/ubiservices",
      {
        method: "POST",
        headers: {
          authorization: `ubi_v1 t=${operator.accessToken}`,
          "content-type": "application/json",
          "user-agent": config.userAgent,
        },
        body: JSON.stringify({ audience }),
      },
      { throttleLabel: `bingo-bridge-operator-${audience}` }
    );
    const accessToken = String(payload?.accessToken || "").trim();
    if (!accessToken) {
      throw new Error(`Nadeo ${audience} Ubisoft exchange did not return an access token.`);
    }
    tokenCache.set(cacheKey, {
      accessToken,
      expiresAt: tokenExpiryMs({ accessToken }, nowMs() + DEFAULT_DEV_ACCESS_TOKEN_LIFETIME_MS),
    });
    return accessToken;
  }

  async function ensureServiceIdentity() {
    if (!config.serviceLogin || !config.servicePassword) return null;
    const existing = getSetting("service_identity", null);
    if (existing?.accountId && existing?.displayName) return existing;
    try {
      await requestBasicAudienceToken("NadeoLiveServices");
    } catch {
      // Ignore bootstrap failures here; readiness will surface the actual problem.
    }
    const next = getSetting("service_identity", null);
    return next?.accountId && next?.displayName ? next : null;
  }

  async function nadeoCoreRequest(pathname, { query = {}, audience = "operator", method = "GET" } = {}) {
    const accessToken =
      audience === "service"
        ? await requestBasicAudienceToken("NadeoServices")
        : await requestOperatorAudienceToken("NadeoServices");
    if (!accessToken) {
      throw new Error("Nadeo Core credentials are not configured.");
    }
    const url = new URL(pathname.replace(/^\//, ""), "https://prod.trackmania.core.nadeo.online/");
    for (const [key, value] of Object.entries(query || {})) {
      if (value === undefined || value === null || value === "") continue;
      url.searchParams.set(key, String(value));
    }
    return fetchJson(
      url.toString(),
      {
        method,
        headers: {
          authorization: `nadeo_v1 t=${accessToken}`,
          "user-agent": config.userAgent,
        },
      },
      { throttleLabel: "bingo-bridge-core" }
    );
  }

  async function nadeoLiveRequest(pathname, { query = {}, method = "GET", body = null } = {}) {
    const accessToken = await requestOperatorAudienceToken("NadeoLiveServices");
    const url = new URL(pathname.replace(/^\//, ""), "https://live-services.trackmania.nadeo.live/api/token/");
    for (const [key, value] of Object.entries(query || {})) {
      if (value === undefined || value === null || value === "") continue;
      url.searchParams.set(key, String(value));
    }
    const headers = {
      authorization: `nadeo_v1 t=${accessToken}`,
      "user-agent": config.userAgent,
    };
    if (body !== null) headers["content-type"] = "application/json";
    return fetchJson(
      url.toString(),
      {
        method,
        headers,
        body: body !== null ? JSON.stringify(body) : undefined,
      },
      { throttleLabel: "bingo-bridge-live" }
    );
  }

  async function getMapInfoByUid(mapUid) {
    const payload = await nadeoCoreRequest("/maps/by-uid/", {
      query: { mapUidList: mapUid },
      audience: config.serviceLogin && config.servicePassword ? "service" : "operator",
    });
    return Array.isArray(payload) && payload.length ? payload[0] : null;
  }

  async function getMapRecordByAccount({ accountId, mapId, hasClones = false, mapType = "" }) {
    const gameMode = /TM_Stunt$/i.test(mapType || "")
      ? "Stunt"
      : /TM_Platform$/i.test(mapType || "")
        ? "Platform"
        : hasClones
          ? "TimeAttackClone"
          : "TimeAttack";
    const payload = await nadeoCoreRequest("/v2/mapRecords/by-account/", {
      query: {
        accountIdList: accountId,
        mapId,
        gameMode,
      },
      audience: config.serviceLogin && config.servicePassword ? "service" : "operator",
    });
    return Array.isArray(payload) && payload.length ? payload[0] : null;
  }

  return {
    tokenCache,
    requestBasicAudienceToken,
    requestOperatorAudienceToken,
    ensureServiceIdentity,
    nadeoCoreRequest,
    nadeoLiveRequest,
    getMapInfoByUid,
    getMapRecordByAccount,
  };
}
