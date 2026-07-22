import { escapeHtml } from "../../../shared/htmlUtils.js";

function registerAdminSessionRoutes({ app, auth, repository, ubisoftAuth, sharedAuthStore, config }) {
  const { ADMIN_TOKEN, UBI_OAUTH_ENABLED, ALTERED_DEV_LOCAL_OPEN, XJK_SHARED_AUTH_ORIGIN } = config;
  const {
    getHeaderAdminToken,
    isConfiguredAdminToken,
    getStaticAdminSession,
    getOAuthLoginUrl,
    buildSharedLogoutCookie,
    isOAuthEnforced,
    isLocalRequest,
    getSharedAdminContext,
    isOAuthFallbackOpen,
    isOAuthRequiredButUnavailable,
    requireAdminMutationOrigin = (_req, _res, next) => next(),
  } = auth;

  app.get("/health", (_req, res) => {
    res.type("text").send("ok");
  });

  app.get("/auth/ubisoft/login", (req, res) => {
    if (sharedAuthStore) {
      const returnTo = String(req.query.return_to || "/admin/");
      return res.redirect(getOAuthLoginUrl(req, returnTo));
    }
    if (!isOAuthEnforced()) {
      if (isOAuthRequiredButUnavailable(req)) {
        return res.status(503).json({
          error: "Ubisoft OAuth admin login is required and is not fully configured on this service.",
        });
      }
      return res.redirect("/admin/");
    }

    const returnTo = String(req.query.return_to || "/admin/");
    const loginUrl = ubisoftAuth.buildLoginUrl({
      req,
      returnTo,
    });
    if (!loginUrl) {
      return res.status(503).json({
        error: "Ubisoft OAuth login is currently unavailable.",
      });
    }
    return res.redirect(loginUrl);
  });

  app.get("/auth/ubisoft/callback", async (req, res) => {
    if (sharedAuthStore) {
      const callbackUrl = new URL("/auth/ubisoft/callback", XJK_SHARED_AUTH_ORIGIN);
      callbackUrl.search = req.url.includes("?") ? req.url.slice(req.url.indexOf("?")) : "";
      return res.redirect(callbackUrl.toString());
    }
    if (!isOAuthEnforced()) {
      if (isOAuthRequiredButUnavailable(req)) {
        return res
          .status(503)
          .type("html")
          .send(
            "<h1>Ubisoft Login Unavailable</h1><p>OAuth admin login is required and not configured on this deployment.</p>"
          );
      }
      return res.redirect("/admin/");
    }

    const result = await ubisoftAuth.completeCallback({
      req,
      code: req.query.code,
      state: req.query.state,
    });
    if (!result.ok) {
      return res
        .status(result.statusCode || 400)
        .type("html")
        .send(
          `<h1>Ubisoft Login Failed</h1><p>${escapeHtml(result.error || "Unknown error.")}</p><p><a href="/auth/ubisoft/login?return_to=%2Fadmin%2F">Try again</a></p>`
        );
    }

    ubisoftAuth.attachSessionCookie(res, req, result.sessionToken);
    return res.redirect(result.returnTo || "/admin/");
  });

  app.post("/api/v1/admin/auth/login", requireAdminMutationOrigin, (req, res) => {
    res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate");
    res.setHeader("Pragma", "no-cache");
    res.setHeader("Expires", "0");

    if (sharedAuthStore || isOAuthEnforced()) {
      return res.status(409).json({
        error: "Token login is disabled while account login is configured.",
        loginUrl: getOAuthLoginUrl(req, "/admin/"),
      });
    }
    if (isOAuthRequiredButUnavailable(req)) {
      return res.status(503).json({
        error: "Ubisoft OAuth admin login is required and is not configured.",
      });
    }
    if (isOAuthFallbackOpen(req)) {
      return res.status(200).json({
        ok: true,
        authenticated: true,
        provider: "open-fallback",
      });
    }
    if (!ADMIN_TOKEN) {
      return res.status(503).json({
        error: "Admin token login is not configured.",
      });
    }

    const providedToken = String(req.body?.adminToken ?? req.body?.token ?? "").trim();
    if (!isConfiguredAdminToken(providedToken)) {
      return res.status(401).json({ error: "Invalid admin token." });
    }

    ubisoftAuth.clearSession(res, req);
    const created = ubisoftAuth.createSession({
      user: {
        provider: "admin-token",
        username: "token-admin",
        role: "admin",
      },
      persist: false,
    });
    ubisoftAuth.attachSessionCookie(res, req, created.token);
    return res.status(200).json({
      ok: true,
      authenticated: true,
      provider: "admin-token-session",
      user: created.session.user,
      expiresAt: new Date(created.session.expiresAt).toISOString(),
    });
  });

  app.get("/api/v1/admin/auth/status", (req, res) => {
    res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate");
    res.setHeader("Pragma", "no-cache");
    res.setHeader("Expires", "0");
    if (sharedAuthStore) {
      return getSharedAdminContext(req)
        .then((context) => {
          if (!context?.entry) {
            return res.status(200).json({
              authenticated: false,
              provider: "xjk-shared-auth",
              loginUrl: getOAuthLoginUrl(req, "/admin/"),
              allowlistMode: "database",
              allowlistedAccounts: repository.admin.countActiveAdminUsers(),
            });
          }
          if (!context.allowlist?.allowed) {
            return res.status(200).json({
              authenticated: false,
              provider: "xjk-shared-auth",
              user: context.user,
              denied: true,
              reason: context.allowlist?.reason || "This xjk account is not allowed to access Altered admin.",
              allowlistMode: "database",
              allowlistedAccounts: repository.admin.countActiveAdminUsers(),
            });
          }
          return res.status(200).json({
            authenticated: true,
            provider: "xjk-shared-auth",
            user: context.user,
            expiresAt: new Date(Number(context.entry.row.expires_at || 0)).toISOString(),
            hasLiveApiToken: Boolean(String(context.entry.row.access_token || "").trim()),
          });
        })
        .catch((error) => {
          return res.status(500).json({ error: error?.message || "Shared auth lookup failed." });
        });
    }
    if (ALTERED_DEV_LOCAL_OPEN && isLocalRequest(req)) {
      return res.status(200).json({
        authenticated: true,
        provider: "dev-local-open",
        warning: "ALTERED_DEV_LOCAL_OPEN is enabled. Admin auth is bypassed for local requests.",
      });
    }
    if (isOAuthEnforced()) {
      const session = ubisoftAuth.getSessionFromRequest(req);
      if (!session) {
        return res.status(200).json({
          authenticated: false,
          provider: "ubisoft",
          loginUrl: getOAuthLoginUrl(req, "/admin/"),
          allowlistMode: "database",
          allowlistedAccounts: repository.admin.countActiveAdminUsers(),
        });
      }
      return res.status(200).json({
        authenticated: true,
        provider: "ubisoft",
        user: session.user,
        expiresAt: new Date(session.expiresAt).toISOString(),
        hasLiveApiToken: Boolean(ubisoftAuth.getSessionRecordByToken(session.token)?.record?.oauth?.accessToken),
      });
    }

    if (isOAuthRequiredButUnavailable(req)) {
      return res.status(200).json({
        authenticated: false,
        provider: "ubisoft",
        oauthRequired: true,
        configError: "Ubisoft OAuth admin login is required and is not configured on this service.",
      });
    }

    if (isOAuthFallbackOpen(req)) {
      return res.status(200).json({
        authenticated: true,
        provider: "open-fallback",
        warning: "UBI_OAUTH_ENABLED=1 but OAuth is incomplete. Local fallback mode is active on this instance.",
      });
    }

    const tokenRequired = Boolean(ADMIN_TOKEN);
    if (!tokenRequired) {
      const oauthDisabled = !UBI_OAUTH_ENABLED;
      return res.status(200).json({
        authenticated: false,
        provider: oauthDisabled ? "ubisoft-disabled" : "unconfigured",
        oauthEnabled: UBI_OAUTH_ENABLED,
        configError: oauthDisabled
          ? "Ubisoft OAuth is disabled (UBI_OAUTH_ENABLED=0). Enable OAuth and set client/endpoint settings to use Ubisoft login."
          : "Admin auth is not configured. Set Ubisoft OAuth settings or ALTERED_ADMIN_TOKEN.",
        tokenRequired: false,
      });
    }
    const staticSession = getStaticAdminSession(req);
    if (staticSession) {
      return res.status(200).json({
        authenticated: true,
        provider: "admin-token-session",
        tokenRequired: true,
        user: staticSession.user,
        expiresAt: new Date(staticSession.expiresAt).toISOString(),
      });
    }
    const providedToken = getHeaderAdminToken(req);
    return res.status(200).json({
      authenticated: isConfiguredAdminToken(providedToken),
      provider: "admin-token",
      tokenRequired,
      tokenLoginEnabled: true,
      loginUrl: "/admin/login/",
    });
  });

  app.post("/api/v1/admin/auth/logout", requireAdminMutationOrigin, (req, res) => {
    if (sharedAuthStore) {
      const entry = sharedAuthStore.resolveSessionFromRequest(req);
      if (entry?.token) sharedAuthStore.deleteSessionByToken(entry.token);
      res.setHeader("Set-Cookie", buildSharedLogoutCookie(req));
      return res.status(200).json({ ok: true });
    }
    ubisoftAuth.clearSession(res, req);
    return res.status(200).json({ ok: true });
  });
}

function registerAdminAllowlistRoutes({ app, auth, repository }) {
  const { parseOptionalBoolean, requireApiAdmin, requireAdminMutationOrigin = (_req, _res, next) => next() } = auth;

  app.get("/api/v1/admin/auth/allowlist", requireApiAdmin, requireAdminMutationOrigin, (req, res) => {
    const includeInactive = parseOptionalBoolean(req.query.includeInactive);
    const users = repository.admin.listAdminUsers({
      includeInactive: includeInactive === undefined ? true : includeInactive,
      limit: Number(req.query.limit) || 500,
    });
    return res.status(200).json({
      users,
      count: users.length,
      activeCount: repository.admin.countActiveAdminUsers(),
    });
  });

  app.post("/api/v1/admin/auth/allowlist", requireApiAdmin, requireAdminMutationOrigin, (req, res) => {
    const body = req.body || {};
    const isActive = parseOptionalBoolean(body.isActive);
    const result = repository.admin.upsertAdminUser({
      subject: body.subject,
      username: body.username,
      displayName: body.displayName,
      role: body.role,
      isActive: isActive === undefined ? true : isActive,
      source: "admin-api",
      note: body.note,
    });
    if (result?.error) {
      return res.status(400).json(result);
    }
    return res.status(200).json({
      ok: true,
      adminUser: result.adminUser,
      activeCount: repository.admin.countActiveAdminUsers(),
    });
  });

  app.post(
    "/api/v1/admin/auth/allowlist/:adminUserId/active",
    requireApiAdmin,
    requireAdminMutationOrigin,
    (req, res) => {
      const adminUserId = Number(req.params.adminUserId) || 0;
      const active = parseOptionalBoolean(req.body?.active);
      if (active === undefined) {
        return res.status(400).json({ error: "active boolean is required." });
      }

      const existing = repository.admin.getAdminUserById(adminUserId);
      if (!existing) {
        return res.status(404).json({ error: "Admin user not found." });
      }
      if (!active && existing.isActive && repository.admin.countActiveAdminUsers() <= 1) {
        return res.status(400).json({
          error: "Cannot disable the last active admin allowlist entry.",
        });
      }

      const updated = repository.admin.updateAdminUserActive({ adminUserId, isActive: active });
      return res.status(200).json({
        ok: true,
        adminUser: updated,
        activeCount: repository.admin.countActiveAdminUsers(),
      });
    }
  );
}

export { registerAdminAllowlistRoutes, registerAdminSessionRoutes };
