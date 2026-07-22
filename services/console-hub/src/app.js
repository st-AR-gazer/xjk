import http from "node:http";

import { XjkAuthStore } from "../../shared/xjkAuth.js";
import { openConsoleHubDatabase } from "./database.js";
import { createConsoleHubRequestHandler } from "./router.js";
import { createConsoleHubServices } from "./services.js";

export async function createConsoleHubApp({
  config,
  db: suppliedDatabase = null,
  sharedAuthStore: suppliedSharedAuthStore,
  createServer = http.createServer,
  logger = console,
} = {}) {
  if (!config) throw new Error("Console Hub config is required.");

  const ownsDatabase = !suppliedDatabase;
  const db =
    suppliedDatabase ||
    (await openConsoleHubDatabase({
      dbFile: config.dbFile,
      dataDir: config.dataDir,
    }));
  const sharedAuthStore =
    suppliedSharedAuthStore !== undefined
      ? suppliedSharedAuthStore
      : config.sharedAuthEnabled
        ? new XjkAuthStore({
            dbFile: config.sharedAuthDbFile,
            sessionCookieName: config.sharedAuthSessionCookieName,
          })
        : null;
  const services = createConsoleHubServices({ config, db, sharedAuthStore });
  const requestHandler = createConsoleHubRequestHandler({
    config,
    helpers: services.helpers,
    httpSupport: services.httpSupport,
    routes: services.routes,
  });
  const server = createServer(requestHandler);
  const timers = new Set();
  let started = false;

  function schedule(task, intervalMs) {
    const timer = setInterval(task, intervalMs);
    timer.unref?.();
    timers.add(timer);
    return timer;
  }

  function startBackgroundWork() {
    schedule(() => {
      const now = services.helpers.nowMs();
      for (const [key, record] of services.auth.oauthStates.entries()) {
        if (Number(record.expiresAt || 0) <= now) services.auth.oauthStates.delete(key);
      }
    }, 30 * 1000);
    schedule(() => {
      services.roomRuntime.runBackgroundVerificationSweep().catch((error) => {
        logger.warn("[console-hub] background verification failed:", error?.message || error);
      });
    }, 15 * 1000);
    schedule(() => {
      services.lifecycle.runConsoleLifecycleSweep().catch((error) => {
        logger.warn("[console-hub] lifecycle cleanup failed:", error?.message || error);
      });
    }, config.lifecycleSweepIntervalMs);
    services.lifecycle.runConsoleLifecycleSweep().catch((error) => {
      logger.warn("[console-hub] initial lifecycle cleanup failed:", error?.message || error);
    });
  }

  async function start({ listen = true, connectDirectory = listen, background = true } = {}) {
    if (started) return server;
    started = true;
    if (background) startBackgroundWork();
    if (!listen) return server;

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
      server.listen(config.port);
    });

    const address = server.address();
    const port = typeof address === "object" && address ? address.port : config.port;
    logger.log(`[console-hub] listening on ${port}`);
    logger.log(`[console-hub] publicBasePath=${config.publicBasePath}`);
    logger.log(`[console-hub] frontend=${config.frontendDir}`);
    logger.log(`[console-hub] data=${config.dataDir}`);
    logger.log(`[console-hub] club=${config.clubId} root=${config.clubRootName}`);
    if (connectDirectory) {
      services.directory.ensureDirectoryConnection().catch((error) => {
        services.directory.directoryState.error = error?.message || String(error);
      });
    }
    return server;
  }

  async function stop() {
    for (const timer of timers) clearInterval(timer);
    timers.clear();
    services.directory.directoryConnection.client?.close();
    for (const connection of services.roomRuntime.playerConnections.values()) connection.close();
    services.roomRuntime.playerConnections.clear();
    if (server.listening) {
      await new Promise((resolve, reject) => {
        server.close((error) => (error ? reject(error) : resolve()));
      });
    }
    if (ownsDatabase) db.close();
    started = false;
  }

  return { config, db, sharedAuthStore, services, requestHandler, server, start, stop };
}
