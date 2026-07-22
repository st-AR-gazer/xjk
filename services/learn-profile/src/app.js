import http from "node:http";

import { XjkAuthStore } from "../../shared/xjkAuth.js";
import { createLearnProfilePaths } from "./config.js";
import { createLearnProfileRequestHandler } from "./router.js";
import { createLearnProfileServices } from "./services.js";

export async function createLearnProfileApp({
  config,
  createServer = http.createServer,
  fetchImpl,
  logger = console,
  paths: suppliedPaths,
  sharedAuthStore: suppliedSharedAuthStore,
} = {}) {
  if (!config) throw new Error("Learn Profile config is required.");
  const paths = suppliedPaths || createLearnProfilePaths(config);
  const sharedAuthStore =
    suppliedSharedAuthStore !== undefined
      ? suppliedSharedAuthStore
      : config.sharedAuthEnabled
        ? new XjkAuthStore({
            dbFile: config.sharedAuthDbFile,
            sessionCookieName: config.sharedAuthSessionCookieName,
          })
        : null;
  const services = createLearnProfileServices({ config, fetchImpl, logger, paths, sharedAuthStore });
  await services.initialize();
  const requestHandler = createLearnProfileRequestHandler({
    adminRoutes: services.adminRoutes,
    auth: services.auth,
    config,
    httpSupport: services.httpSupport,
    logger,
    profileRoutes: services.profileRoutes,
    staticService: services.staticService,
  });
  const server = createServer(requestHandler);
  let sweepTimer = null;
  let started = false;

  async function start({ listen = true, background = true } = {}) {
    if (started) return server;
    started = true;
    const startBackgroundWork = () => {
      if (!background) return;
      sweepTimer = setInterval(() => services.sessions.sweepExpired(), 60 * 1000);
      sweepTimer.unref?.();
    };
    if (!listen) {
      startBackgroundWork();
      return server;
    }

    try {
      await new Promise((resolve, reject) => {
        const onError = (error) => {
          server.off("listening", onListening);
          reject(error);
        };
        const onListening = () => {
          server.off("error", onError);
          resolve();
        };
        server.once("error", onError);
        server.once("listening", onListening);
        server.listen(config.port, "127.0.0.1");
      });
    } catch (error) {
      started = false;
      throw error;
    }
    startBackgroundWork();

    const address = server.address();
    const port = typeof address === "object" && address ? address.port : config.port;
    logger.log(`Learn profile service listening on http://127.0.0.1:${port}`);
    logger.log(`FRONTEND_DIR=${config.frontendDir}`);
    logger.log(`LEARN_CONTENT_DIR=${config.contentDir}`);
    logger.log(`LEARN_PROFILE_DATA_DIR=${config.dataDir}`);
    logger.log(`LEARN_UBI_OAUTH=${services.identity.oauthConfigured() ? "configured" : "not-configured"}`);
    logger.log(`LEARN_ACCOUNTS=${services.accounts.accounts.length}`);
    return server;
  }

  async function stop() {
    if (sweepTimer) clearInterval(sweepTimer);
    sweepTimer = null;
    await services.sessions.stop();
    if (server.listening) {
      await new Promise((resolve, reject) => {
        server.close((error) => (error ? reject(error) : resolve()));
      });
    }
    started = false;
  }

  return { config, paths, requestHandler, server, services, sharedAuthStore, start, stop };
}
