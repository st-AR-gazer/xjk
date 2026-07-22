import path from "node:path";

import express from "express";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import morgan from "morgan";

export function createPluginHubApp({ config, pluginService, logger = console, requestLogging = true } = {}) {
  if (!config || !pluginService) throw new Error("Plugins Hub config and plugin service are required.");
  const app = express();
  app.disable("x-powered-by");
  app.use(
    helmet({
      crossOriginResourcePolicy: false,
      contentSecurityPolicy: {
        useDefaults: true,
        directives: {
          imgSrc: ["'self'", "data:", config.openplanetOrigin],
        },
      },
    })
  );
  if (requestLogging) app.use(morgan("combined"));
  app.use(express.json({ limit: "200kb" }));
  app.use(
    "/api/",
    rateLimit({
      windowMs: config.apiRateLimitWindowMs,
      limit: config.apiRateLimitMax,
      standardHeaders: true,
      legacyHeaders: false,
    })
  );

  app.get("/api/plugins", async (_request, response) => {
    try {
      const result = await pluginService.getPlugins();
      response.json({
        plugins: result.plugins,
        count: result.plugins.length,
        source: "openplanet",
        profile: config.openplanetProfileUrl,
        fetchedAt: result.fetchedAt,
        pageCount: result.pageCount,
        cached: result.cached,
        stale: result.stale,
        warning: result.warning,
      });
    } catch (error) {
      logger.error?.("Failed to load plugins from Openplanet:", error?.message || error);
      response.status(502).json({
        error: "Failed to load plugins from Openplanet profile.",
        details: error?.message || String(error),
        source: "openplanet",
        profile: config.openplanetProfileUrl,
      });
    }
  });

  app.get("/health", (_request, response) => {
    response.type("text").send("ok");
  });

  app.use(express.static(config.frontendDir));
  app.get("/", (_request, response) => {
    response.sendFile(path.join(config.frontendDir, "index.html"));
  });
  app.use((error, _request, response, _next) => {
    logger.error?.("Unexpected server error:", error);
    return response.status(500).json({ error: "Unexpected server error." });
  });

  return app;
}
