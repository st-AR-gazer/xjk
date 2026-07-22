import { ThrottledHttpClientRuntime } from "./httpClientRuntime.js";
import { isTokenFresh, jwtExpiryMs } from "./tokenUtils.js";
import { normalizeBaseUrl, toText } from "./valueUtils.js";

const NADEO_CORE_BASE_URL = "https://prod.trackmania.core.nadeo.online";
const NADEO_LIVE_TOKEN_BASE_URL = "https://live-services.trackmania.nadeo.live/api/token";
const NADEO_SERVICES_AUDIENCE = "NadeoServices";
const NADEO_LIVE_SERVICES_AUDIENCE = "NadeoLiveServices";

class NadeoHttpError extends Error {
  constructor(
    message,
    { statusCode = 0, payload = null, responseText = "", requestUrl = "", requestMethod = "GET", cause } = {}
  ) {
    super(message, cause ? { cause } : undefined);
    this.name = "NadeoHttpError";
    this.statusCode = Number(statusCode || 0);
    this.payload = payload;
    this.responseText = String(responseText || "");
    this.requestUrl = String(requestUrl || "");
    this.requestMethod = String(requestMethod || "GET").toUpperCase();
  }
}

class NadeoTokenRequestCoordinator {
  constructor() {
    this.pendingRequests = new Map();
  }

  run(audience, requestToken) {
    const key = toText(audience) || NADEO_LIVE_SERVICES_AUDIENCE;
    const current = this.pendingRequests.get(key);
    if (current) return current;

    const pending = Promise.resolve()
      .then(requestToken)
      .finally(() => {
        if (this.pendingRequests.get(key) === pending) this.pendingRequests.delete(key);
      });
    this.pendingRequests.set(key, pending);
    return pending;
  }
}

class NadeoAccessTokenManager {
  constructor(client, { onTokenUpdated = null } = {}) {
    this.client = client;
    this.onTokenUpdated = typeof onTokenUpdated === "function" ? onTokenUpdated : null;
  }

  applyTokenPair(tokenPair) {
    Object.assign(this.client, mergeNadeoTokenPair(this.client, tokenPair));
    if (this.onTokenUpdated) this.onTokenUpdated(this.client);
    return this.client.accessToken;
  }

  async requestBasic(audience, { missingAccessTokenMessage } = {}) {
    const tokenPair = await requestNadeoBasicToken({
      requestJson: (url, options) => this.client.requestJson(url, options),
      coreBaseUrl: this.client.coreAuthBaseUrl,
      login: this.client.dediLogin,
      password: this.client.dediPassword,
      audience,
      userAgent: this.client.userAgent,
      missingAccessTokenMessage,
    });
    return this.applyTokenPair(tokenPair);
  }

  async requestRefresh({ missingAccessTokenMessage } = {}) {
    const tokenPair = await requestNadeoRefreshToken({
      requestJson: (url, options) => this.client.requestJson(url, options),
      coreBaseUrl: this.client.coreAuthBaseUrl,
      refreshToken: this.client.refreshToken,
      userAgent: this.client.userAgent,
      missingAccessTokenMessage,
    });
    return this.applyTokenPair(tokenPair);
  }
}

function readNadeoTokenPair(payload = {}) {
  const accessToken = toText(payload?.accessToken);
  const refreshToken = toText(payload?.refreshToken);
  return {
    accessToken,
    refreshToken,
    expiresAt: jwtExpiryMs(accessToken),
  };
}

function requireNadeoTokenPair(payload, missingAccessTokenMessage) {
  const tokenPair = readNadeoTokenPair(payload);
  if (!tokenPair.accessToken) {
    throw new Error(String(missingAccessTokenMessage || "Nadeo response did not include accessToken."));
  }
  return tokenPair;
}

function mergeNadeoTokenPair(currentState = {}, tokenPair = {}) {
  return {
    accessToken: toText(tokenPair.accessToken),
    refreshToken: toText(tokenPair.refreshToken) || toText(currentState.refreshToken),
    accessTokenExpiryMs: Number(tokenPair.expiresAt || 0),
  };
}

function buildNadeoBasicTokenRequest({ login, password, audience, userAgent } = {}) {
  const credentials = Buffer.from(`${toText(login)}:${toText(password)}`).toString("base64");
  return {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Basic ${credentials}`,
      "user-agent": toText(userAgent),
    },
    body: JSON.stringify({ audience: toText(audience) }),
  };
}

function buildNadeoRefreshTokenRequest({ refreshToken, userAgent } = {}) {
  return {
    method: "POST",
    headers: {
      authorization: `nadeo_v1 t=${toText(refreshToken)}`,
      "user-agent": toText(userAgent),
    },
  };
}

function normalizeNadeoRequestPolicy({
  requestTimeoutMs,
  defaultRequestTimeoutMs = 15000,
  minRequestGapMs = 0,
  globalThrottleFile = "",
  globalMinRequestGapMs = 0,
} = {}) {
  return {
    requestTimeoutMs: Math.max(1000, Number(requestTimeoutMs) || defaultRequestTimeoutMs),
    minRequestGapMs: Math.max(0, Number(minRequestGapMs) || 0),
    globalThrottleFile: toText(globalThrottleFile),
    globalMinRequestGapMs: Math.max(0, Number(globalMinRequestGapMs) || 0),
  };
}

function addNadeoQuery(url, query = null) {
  const target = url instanceof URL ? url : new URL(String(url));
  if (!query || typeof query !== "object") return target;
  for (const [key, value] of Object.entries(query)) {
    if (value === undefined || value === null || value === "") continue;
    target.searchParams.set(key, String(value));
  }
  return target;
}

async function requestNadeoJsonWithToken({
  requestJson,
  ensureAccessToken,
  url,
  userAgent,
  retryOnUnauthorized = true,
  onUnauthorized = null,
} = {}) {
  const send = async (token) =>
    requestJson(String(url), {
      method: "GET",
      headers: {
        authorization: `nadeo_v1 t=${toText(token)}`,
        "user-agent": toText(userAgent),
      },
    });

  try {
    return await send(await ensureAccessToken());
  } catch (error) {
    if (!retryOnUnauthorized || Number(error?.statusCode || 0) !== 401) throw error;
    if (typeof onUnauthorized === "function") onUnauthorized(error);
    return send(await ensureAccessToken({ forceRefresh: true }));
  }
}

async function requestNadeoBasicToken({
  requestJson,
  coreBaseUrl,
  login,
  password,
  audience,
  userAgent,
  throttleLabel = "",
  missingAccessTokenMessage = "Nadeo basic authentication response did not include accessToken.",
} = {}) {
  const requestOptions = buildNadeoBasicTokenRequest({ login, password, audience, userAgent });
  if (throttleLabel) requestOptions.throttleLabel = throttleLabel;
  const payload = await requestJson(
    `${normalizeBaseUrl(coreBaseUrl, NADEO_CORE_BASE_URL)}/v2/authentication/token/basic`,
    requestOptions
  );
  return requireNadeoTokenPair(payload, missingAccessTokenMessage);
}

async function requestNadeoRefreshToken({
  requestJson,
  coreBaseUrl,
  refreshToken,
  userAgent,
  throttleLabel = "",
  missingAccessTokenMessage = "Nadeo refresh response did not include accessToken.",
} = {}) {
  const requestOptions = buildNadeoRefreshTokenRequest({ refreshToken, userAgent });
  if (throttleLabel) requestOptions.throttleLabel = throttleLabel;
  const payload = await requestJson(
    `${normalizeBaseUrl(coreBaseUrl, NADEO_CORE_BASE_URL)}/v2/authentication/token/refresh`,
    requestOptions
  );
  return requireNadeoTokenPair(payload, missingAccessTokenMessage);
}

class NadeoRequestRuntime extends ThrottledHttpClientRuntime {
  constructor(options = {}) {
    super({
      defaultThrottleLabel: "nadeo-request",
      ...options,
      createError: ({ message, ...details }) => new NadeoHttpError(message, details),
    });
  }

  requestJson(url, options = {}) {
    return super.requestJson(url, {
      formatError: ({ status, method, requestUrl, details }) =>
        `Nadeo request failed (${status}) for ${method} ${requestUrl}: ${details}`,
      ...options,
    });
  }

  requestBinary(url, options = {}) {
    return super.requestBinary(url, {
      formatError: ({ status, details }) => `Nadeo binary request failed with HTTP ${status}: ${details}`,
      ...options,
    });
  }
}

export {
  addNadeoQuery,
  buildNadeoBasicTokenRequest,
  buildNadeoRefreshTokenRequest,
  isTokenFresh,
  jwtExpiryMs,
  NADEO_CORE_BASE_URL,
  NADEO_LIVE_SERVICES_AUDIENCE,
  NADEO_LIVE_TOKEN_BASE_URL,
  NADEO_SERVICES_AUDIENCE,
  NadeoAccessTokenManager,
  NadeoHttpError,
  NadeoRequestRuntime,
  NadeoTokenRequestCoordinator,
  mergeNadeoTokenPair,
  normalizeBaseUrl,
  normalizeNadeoRequestPolicy,
  readNadeoTokenPair,
  requestNadeoBasicToken,
  requestNadeoJsonWithToken,
  requestNadeoRefreshToken,
  requireNadeoTokenPair,
};
