import path from "node:path";
import express from "express";
import helmet from "helmet";
import morgan from "morgan";
import { createPublicRateLimiter, sendError } from "./httpResponses.js";
import { registerApiIndexRoutes } from "./routes/apiIndexRoutes.js";
import { registerLookupRoutes } from "./routes/lookupRoutes.js";
import { registerPageRoutes } from "./routes/pageRoutes.js";
import { registerSubmissionRoutes } from "./routes/submissionRoutes.js";

export function createValidifierApp(options = {}) {
  const app = express();
  const sharedDir = path.resolve(options.frontendDir, "..", "..", "shared");
  app.disable("x-powered-by");
  app.set("trust proxy", "loopback");
  app.use(helmet({ crossOriginResourcePolicy: false }));
  app.use(morgan("combined"));
  app.use(express.json({ limit: "200kb" }));
  app.use("/shared", express.static(sharedDir));
  app.use(express.static(options.frontendDir));
  app.use("/api/v1/", createPublicRateLimiter(180));

  registerPageRoutes(app, options);
  registerApiIndexRoutes(app, options);
  registerLookupRoutes(app, options);
  registerSubmissionRoutes(app, options);

  app.use((error, _req, res, _next) => {
    if (error?.type === "entity.parse.failed" || error instanceof SyntaxError) {
      return sendError(res, 400, "invalid_request", "Request body must be valid JSON.");
    }
    options.logger?.error?.("[validifier-public] unexpected server error:", error);
    return sendError(res, 500, "internal_error", "The public Validifier service encountered an unexpected error.");
  });
  return app;
}
