import { escapeHtml } from "../../../../shared/htmlUtils.js";

function createSharedPageMiddleware({ getSharedAdminContext, buildAlteredPublicUrl, sharedAuthOrigin }) {
  return function requireSharedPageAdmin(req, res, next) {
    getSharedAdminContext(req)
      .then((context) => {
        if (!context?.entry) {
          const encoded = encodeURIComponent(buildAlteredPublicUrl(req, req.originalUrl || "/admin/"));
          return res.redirect(`${sharedAuthOrigin}/auth/ubisoft/login?return_to=${encoded}`);
        }
        if (!context.allowlist?.allowed) {
          return res
            .status(403)
            .type("html")
            .send(
              `<h1>Access denied</h1><p>${escapeHtml(context.allowlist?.reason || "This xjk account is not allowed to access Altered admin.")}</p>`
            );
        }
        req.alteredAdmin = context.user;
        req.alteredAdminSession = context.entry;
        return next();
      })
      .catch((error) =>
        res
          .status(500)
          .type("html")
          .send(`<h1>Auth error</h1><p>${escapeHtml(error?.message || error)}</p>`)
      );
  };
}

function createSharedApiMiddleware({ getSharedAdminContext, getOAuthLoginUrl }) {
  return function requireSharedApiAdmin(req, res, next) {
    getSharedAdminContext(req)
      .then((context) => {
        if (!context?.entry) {
          return res.status(401).json({
            error: "Unauthorized",
            loginUrl: getOAuthLoginUrl(req, "/admin/"),
          });
        }
        if (!context.allowlist?.allowed) {
          return res.status(403).json({
            error: context.allowlist?.reason || "This xjk account is not allowed to access Altered admin.",
          });
        }
        req.alteredAdmin = context.user;
        req.alteredAdminSession = context.entry;
        req.alteredAdminAuthMethod = "shared-session";
        return next();
      })
      .catch((error) => res.status(500).json({ error: error?.message || "Shared auth lookup failed." }));
  };
}

function createAdminAuthorizationMiddleware({ ubisoftAuth, sharedAuthStore, config, requestContext, sessionContext }) {
  const { ADMIN_TOKEN, ALTERED_DEV_LOCAL_OPEN, XJK_SHARED_AUTH_ORIGIN } = config;
  const requireSharedPageAdmin = createSharedPageMiddleware({
    getSharedAdminContext: sessionContext.getSharedAdminContext,
    buildAlteredPublicUrl: requestContext.buildAlteredPublicUrl,
    sharedAuthOrigin: XJK_SHARED_AUTH_ORIGIN,
  });
  const requireSharedApiAdmin = createSharedApiMiddleware({
    getSharedAdminContext: sessionContext.getSharedAdminContext,
    getOAuthLoginUrl: requestContext.getOAuthLoginUrl,
  });

  function requirePageAdmin(req, res, next) {
    if (sharedAuthStore) return requireSharedPageAdmin(req, res, next);
    if (ALTERED_DEV_LOCAL_OPEN && requestContext.isLocalRequest(req)) return next();
    if (sessionContext.isOAuthEnforced()) {
      const session = ubisoftAuth.getSessionFromRequest(req);
      if (session) return next();
      const encoded = encodeURIComponent(req.originalUrl || "/admin/");
      return res.redirect(`/auth/ubisoft/login?return_to=${encoded}`);
    }
    if (sessionContext.isOAuthRequiredButUnavailable(req)) {
      return res
        .status(503)
        .type("html")
        .send(
          "<h1>Altered Admin Unavailable</h1><p>Ubisoft OAuth admin login is required and not configured on this deployment.</p>"
        );
    }
    if (sessionContext.isOAuthFallbackOpen(req)) return next();

    const staticSession = requestContext.getStaticAdminSession(req);
    if (staticSession) {
      req.alteredAdmin = staticSession.user;
      req.alteredAdminSession = staticSession;
      return next();
    }
    if (!ADMIN_TOKEN) {
      return res
        .status(503)
        .type("html")
        .send(
          "<h1>Admin Auth Not Configured</h1><p>Set Ubisoft OAuth settings or ALTERED_ADMIN_TOKEN to enable admin access.</p>"
        );
    }
    if (requestContext.isConfiguredAdminToken(requestContext.getHeaderAdminToken(req))) return next();
    return res.redirect("/admin/login/");
  }

  function requireApiAdmin(req, res, next) {
    if (requestContext.isTrustedServiceAdminRequest(req)) {
      req.alteredAdminAuthMethod = "internal-service";
      req.alteredAdmin = { provider: "internal-service", role: "service", username: "aggregator" };
      return next();
    }
    if (sharedAuthStore) return requireSharedApiAdmin(req, res, next);
    if (ALTERED_DEV_LOCAL_OPEN && requestContext.isLocalRequest(req)) {
      req.alteredAdminAuthMethod = "dev-local-open";
      return next();
    }
    if (sessionContext.isOAuthEnforced()) {
      const session = ubisoftAuth.getSessionFromRequest(req);
      if (session) {
        req.alteredAdmin = session.user;
        req.alteredAdminSession = session;
        req.alteredAdminAuthMethod = "oauth-session";
        return next();
      }
      return res.status(401).json({ error: "Unauthorized", loginUrl: requestContext.getOAuthLoginUrl(req, "/admin/") });
    }
    if (sessionContext.isOAuthRequiredButUnavailable(req)) {
      return res.status(503).json({
        error: "Ubisoft OAuth admin login is required and is not configured.",
        oauthRequired: true,
        configError: "Set UBI_OAUTH_CLIENT_ID, UBI_OAUTH_CLIENT_SECRET, and Ubisoft OAuth endpoint URLs.",
      });
    }
    if (sessionContext.isOAuthFallbackOpen(req)) {
      req.alteredAdminAuthMethod = "dev-local-open";
      return next();
    }

    const staticSession = requestContext.getStaticAdminSession(req);
    if (staticSession) {
      req.alteredAdmin = staticSession.user;
      req.alteredAdminSession = staticSession;
      req.alteredAdminAuthMethod = "static-session";
      return next();
    }
    if (!ADMIN_TOKEN) {
      return res.status(503).json({
        error: "Admin auth is not configured.",
        configError: "Set Ubisoft OAuth settings or ALTERED_ADMIN_TOKEN.",
      });
    }
    if (!requestContext.isConfiguredAdminToken(requestContext.getHeaderAdminToken(req))) {
      return res.status(401).json({ error: "Unauthorized" });
    }
    req.alteredAdminAuthMethod = "header-token";
    return next();
  }

  return { requireApiAdmin, requirePageAdmin };
}

export { createAdminAuthorizationMiddleware };
