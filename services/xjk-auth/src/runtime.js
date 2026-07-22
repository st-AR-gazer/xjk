import http from "node:http";
import { BrowserBoundOauthStateStore } from "../../shared/xjk-auth/oauth-state-policy.js";
import { XjkAuthStore } from "../../shared/xjkAuth.js";
import { assertProductionCredentialsWhenProduction } from "../../shared/productionCredentials.js";
import { createXjkAuthApp } from "./app.js";
import { loadXjkAuthConfig } from "./config.js";

function createXjkAuthRuntime({ config = loadXjkAuthConfig(), logger = console } = {}) {
  assertProductionCredentialsWhenProduction("xjk-auth", process.env);
  const store = new XjkAuthStore({ dbFile: config.dbFile, sessionCookieName: config.sessionCookieName });
  const oauthStateStore = new BrowserBoundOauthStateStore({
    ttlMs: config.oauthStateTtlSeconds * 1000,
    maxStates: config.oauthStateMaxEntries,
    loginRateLimitMax: config.oauthLoginRateLimitMax,
    loginRateLimitWindowMs: config.oauthLoginRateLimitWindowSeconds * 1000,
  });
  const { handleRequest } = createXjkAuthApp({ config, store, oauthStateStore, logger });
  const server = http.createServer(handleRequest);

  function startServer({ port = config.port, host = "127.0.0.1", logger: startLogger = logger } = {}) {
    if (server.listening) return server;
    server.listen(port, host, () => {
      const address = server.address();
      const listeningPort = typeof address === "object" && address ? address.port : port;
      startLogger.log(`[xjk-auth] listening on http://${host}:${listeningPort}`);
    });
    return server;
  }

  return { config, handleRequest, oauthStateStore, server, startServer, store };
}

export { createXjkAuthRuntime };
