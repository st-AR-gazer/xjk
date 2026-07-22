import http from "node:http";

import { createPluginHubApp } from "./app.js";
import { createOpenplanetClient } from "./openplanet-client.js";
import { createImagePaletteService } from "./palette.js";
import { createPluginService } from "./plugin-service.js";

export function createPluginHubRuntime({
  config,
  fetchImpl = fetch,
  logger = console,
  requestLogging = true,
  openplanetClient: suppliedOpenplanetClient = null,
  paletteService: suppliedPaletteService = null,
  pluginService: suppliedPluginService = null,
  createServer = http.createServer,
} = {}) {
  if (!config) throw new Error("Plugins Hub config is required.");
  let openplanetClient = suppliedOpenplanetClient;
  let paletteService = suppliedPaletteService;
  let pluginService = suppliedPluginService;

  if (!pluginService) {
    openplanetClient = openplanetClient || createOpenplanetClient({ config, fetchImpl });
    paletteService =
      paletteService ||
      createImagePaletteService({
        config,
        fetchImageBuffer: openplanetClient.fetchImageBuffer,
        logger,
      });
    pluginService = createPluginService({ config, openplanetClient, paletteService, logger });
  }

  const app = createPluginHubApp({ config, pluginService, logger, requestLogging });
  const server = createServer(app);

  async function start({ port = config.port, host = config.host } = {}) {
    if (server.listening) return server;
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
      server.listen(port, host);
    });
    const address = server.address();
    const listeningPort = typeof address === "object" && address ? address.port : port;
    logger.log?.(`Backend listening on http://${host}:${listeningPort}`);
    logger.log?.(`FRONTEND_DIR=${config.frontendDir}`);
    logger.log?.(`OPENPLANET_PROFILE_URL=${config.openplanetProfileUrl}`);
    logger.log?.(`PLUGINS_CACHE_TTL_MS=${config.pluginsCacheTtlMs}`);
    logger.log?.(`IMAGE_PALETTE_CACHE_TTL_MS=${config.imagePaletteCacheTtlMs}`);
    logger.log?.(`IMAGE_PALETTE_MAX_CONCURRENCY=${config.imagePaletteMaxConcurrency}`);
    return server;
  }

  async function stop() {
    if (!server.listening) return;
    await new Promise((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()));
    });
  }

  return { app, openplanetClient, paletteService, pluginService, server, start, stop };
}
