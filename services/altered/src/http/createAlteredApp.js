import cors from "cors";
import express from "express";
import helmet from "helmet";
import morgan from "morgan";

import { createAdminRoutes } from "../routes/adminRoutes.js";
import { createOpsAdminRoutes } from "../routes/opsAdminRoutes.js";
import { createPublicRoutes } from "../routes/publicRoutes.js";
import { registerAdminAllowlistRoutes, registerAdminSessionRoutes } from "./adminAuthRoutes.js";
import { registerAlteredFrontendRoutes } from "./frontendRoutes.js";

const DEFAULT_ROUTE_FACTORIES = {
  createAdminRoutes,
  createOpsAdminRoutes,
  createPublicRoutes,
};

function createAlteredApp({
  repository,
  alteredService,
  opsService,
  auth,
  ubisoftAuth,
  sharedAuthStore,
  frontendDir,
  wrWebhookSecret,
  authConfig,
  logger = console,
  routeFactories = {},
} = {}) {
  const routes = { ...DEFAULT_ROUTE_FACTORIES, ...routeFactories };
  const requireAdminMutationOrigin = auth.requireAdminMutationOrigin || ((_req, _res, next) => next());
  const app = express();
  app.disable("x-powered-by");
  app.use(
    helmet({
      crossOriginResourcePolicy: false,
      contentSecurityPolicy: {
        useDefaults: true,
        directives: {
          imgSrc: [
            "'self'",
            "data:",
            "https://core.trackmania.nadeo.live",
            "https://trackmania-prod-storage-map-thumbnail-s3.cdn.ubi.com",
          ],
        },
      },
    })
  );
  app.use(
    cors({
      origin: "*",
      methods: ["GET", "POST", "OPTIONS"],
    })
  );
  app.use(morgan("combined"));
  app.use(express.json({ limit: "20mb" }));

  registerAdminSessionRoutes({
    app,
    auth,
    repository,
    ubisoftAuth,
    sharedAuthStore,
    config: authConfig,
  });
  app.use("/api", auth.disableApiCache);
  registerAdminAllowlistRoutes({ app, auth, repository });
  app.use(
    "/api/v1/admin/ops",
    auth.disableAdminApiCache,
    auth.requireApiAdmin,
    requireAdminMutationOrigin,
    routes.createOpsAdminRoutes(opsService)
  );
  app.use(
    "/api/v1/admin",
    auth.disableAdminApiCache,
    auth.requireApiAdmin,
    requireAdminMutationOrigin,
    routes.createAdminRoutes(alteredService, {
      resolveLiveAuthContext: auth.resolveLiveAuthContext,
      opsService,
    })
  );
  app.use(
    "/api/v1",
    routes.createPublicRoutes(alteredService, {
      wrWebhookSecret,
    })
  );
  registerAlteredFrontendRoutes({
    app,
    frontendDir,
    requirePageAdmin: auth.requirePageAdmin,
    rejectMissingStaticAsset: auth.rejectMissingStaticAsset,
    logger,
  });
  return app;
}

export { createAlteredApp };
