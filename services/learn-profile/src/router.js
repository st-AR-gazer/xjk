export function createLearnProfileRequestHandler({
  adminRoutes,
  auth,
  config,
  httpSupport,
  logger = console,
  profileRoutes,
  staticService,
} = {}) {
  const { readBody, sendJson, sendText } = httpSupport;

  async function handleRequest(req, res) {
    const url = new URL(req.url || "/", `http://${req.headers.host || "127.0.0.1"}`);
    const pathName = url.pathname;
    try {
      if (req.method === "GET" && pathName === "/health") return sendText(res, 200, "ok");
      if ((req.method === "GET" || req.method === "HEAD") && pathName.startsWith("/shared/")) {
        return staticService.serveSharedStatic(req, res, url);
      }
      if (req.method === "GET" && pathName === "/api/v1/profile/auth/status") {
        return sendJson(res, 200, auth.authStatus(req));
      }
      if (req.method === "GET" && pathName === "/api/v1/profile/me") return auth.handleProfileMe(req, res);
      if (req.method === "GET" && pathName === "/api/v1/profile/learn-data") {
        return profileRoutes.handleProfileLearnDataGet(req, res);
      }
      if (req.method === "PUT" && pathName === "/api/v1/profile/learn-data") {
        return profileRoutes.handleProfileLearnDataPut(req, res);
      }
      if (req.method === "POST" && pathName === "/api/v1/profile/suggestions") {
        return profileRoutes.handleProfileSuggestionCreate(req, res);
      }
      if (req.method === "POST" && pathName === "/api/v1/profile/logout") {
        await readBody(req).catch(() => "");
        return auth.handleLogout(req, res);
      }
      if (req.method === "GET" && pathName === "/api/v1/admin/session") {
        return adminRoutes.handleAdminSession(req, res);
      }
      if (req.method === "GET" && pathName === "/api/v1/admin/accounts") {
        return adminRoutes.handleAdminAccounts(req, res);
      }
      if (req.method === "POST" && pathName === "/api/v1/admin/accounts") {
        return adminRoutes.handleAdminAccountSave(req, res);
      }
      if (req.method === "GET" && pathName === "/api/v1/admin/content") {
        return adminRoutes.handleAdminContentList(req, res);
      }
      if (req.method === "GET" && pathName === "/api/v1/admin/content/page") {
        return adminRoutes.handleAdminContentGet(req, res, url);
      }
      if (req.method === "PUT" && pathName === "/api/v1/admin/content/page") {
        return adminRoutes.handleAdminContentSave(req, res);
      }
      if (req.method === "POST" && pathName === "/api/v1/admin/content/page") {
        return adminRoutes.handleAdminContentCreate(req, res);
      }
      if (req.method === "GET" && pathName === "/api/v1/admin/audit") {
        return adminRoutes.handleAdminAudit(req, res);
      }
      if (req.method === "GET" && pathName === "/api/v1/admin/suggestions") {
        return adminRoutes.handleAdminSuggestions(req, res);
      }
      if (req.method === "GET" && pathName === "/auth/ubisoft/login") return auth.handleLogin(req, res, url);
      if (req.method === "GET" && pathName === config.callbackPath) return auth.handleCallback(req, res, url);
      if (req.method === "GET" || req.method === "HEAD") return staticService.serveStatic(req, res, url);
      return sendJson(res, 405, { ok: false, error: "Method not allowed." });
    } catch (error) {
      logger.error("[learn-profile] request failed", error);
      return sendJson(res, 500, { ok: false, error: "Unexpected Learn profile service error." });
    }
  }

  return handleRequest;
}
