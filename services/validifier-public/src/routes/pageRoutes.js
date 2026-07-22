import path from "node:path";

export function registerPageRoutes(app, { frontendDir } = {}) {
  app.get("/", (_req, res) => res.sendFile(path.join(frontendDir, "index.html")));
  app.get(["/api", "/api/"], (_req, res) => res.sendFile(path.join(frontendDir, "api", "index.html")));
  app.get("/api/endpoints/:endpointKey", (req, res) => {
    const endpointKey = encodeURIComponent(String(req.params.endpointKey || "").trim());
    res.redirect(302, `/api/?endpoint=${endpointKey}#ep-${endpointKey}`);
  });
  app.get(
    ["/live", "/records", "/records/:recordId", "/maps", "/maps/:mapUid", "/submit", "/clients", "/recent"],
    (_req, res) => res.sendFile(path.join(frontendDir, "index.html"))
  );
}
