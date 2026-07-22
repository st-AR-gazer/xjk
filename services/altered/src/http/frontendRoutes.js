import express from "express";
import path from "node:path";

function registerAlteredFrontendRoutes({
  app,
  frontendDir,
  requirePageAdmin,
  rejectMissingStaticAsset,
  logger = console,
}) {
  const FRONTEND_DIR = frontendDir;

  const ADMIN_FRONTEND_DIR = path.join(FRONTEND_DIR, "admin");

  app.get(["/admin", "/admin/"], requirePageAdmin, (req, res) => {
    if (req.path === "/admin") return res.redirect(308, "/admin/");
    res.sendFile(path.join(ADMIN_FRONTEND_DIR, "index.html"));
  });

  app.get("/admin.html", (_req, res) => {
    res.redirect(308, "/admin/");
  });

  app.get(["/admin/monitoring", "/admin/monitoring/"], requirePageAdmin, (req, res) => {
    if (req.path === "/admin/monitoring") return res.redirect(308, "/admin/monitoring/");
    res.sendFile(path.join(ADMIN_FRONTEND_DIR, "monitoring", "index.html"));
  });

  app.get("/admin-monitoring.html", (_req, res) => {
    res.redirect(308, "/admin/monitoring/");
  });

  app.get(["/admin/login", "/admin/login/"], (req, res) => {
    if (req.path === "/admin/login") return res.redirect(308, "/admin/login/");
    res.sendFile(path.join(ADMIN_FRONTEND_DIR, "login", "index.html"));
  });

  app.get("/admin-login", (_req, res) => {
    res.redirect(308, "/admin/login/");
  });

  app.get("/admin-login/", (_req, res) => {
    res.redirect(308, "/admin/login/");
  });

  app.get("/admin-login.html", (_req, res) => {
    res.redirect(308, "/admin/login/");
  });

  app.get(["/api", "/api/"], (req, res) => {
    if (req.path === "/api") return res.redirect(308, "/api/");
    res.sendFile(path.join(FRONTEND_DIR, "api", "index.html"));
  });

  app.get("/api/endpoints/:endpointKey", (req, res) => {
    if (req.path.endsWith("/")) {
      return res.redirect(308, `/api/endpoints/${encodeURIComponent(req.params.endpointKey)}`);
    }
    res.sendFile(path.join(FRONTEND_DIR, "api", "endpoint.html"));
  });

  app.get("/favicon.ico", (_req, res) => {
    res.redirect(308, "/favicon.svg");
  });

  app.get(["/season/:campaignSlug([a-z0-9-]+)", "/season/:campaignSlug([a-z0-9-]+)/"], (_req, res) => {
    res.sendFile(path.join(FRONTEND_DIR, "season", "index.html"));
  });

  const SHARED_DIR = path.resolve(FRONTEND_DIR, "..", "..", "shared");

  app.use("/shared", express.static(SHARED_DIR));
  app.use(express.static(FRONTEND_DIR));
  app.use(rejectMissingStaticAsset);

  app.get("/", (_req, res) => {
    res.sendFile(path.join(FRONTEND_DIR, "index.html"));
  });

  app.use((err, _req, res, _next) => {
    if (err) {
      logger.error("Unexpected altered service error:", err);
    }
    return res.status(500).json({ error: "Unexpected server error." });
  });
}

export { registerAlteredFrontendRoutes };
