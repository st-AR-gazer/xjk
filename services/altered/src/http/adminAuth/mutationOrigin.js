const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);
const NON_COOKIE_AUTH_METHODS = new Set(["internal-service", "header-token", "dev-local-open"]);

function createAdminMutationOriginGuard({ resolveRequestOrigin, resolveSourceOrigin }) {
  return function requireAdminMutationOrigin(req, res, next) {
    if (SAFE_METHODS.has(String(req.method || "").toUpperCase())) return next();
    if (NON_COOKIE_AUTH_METHODS.has(req.alteredAdminAuthMethod)) return next();

    const requestOrigin = resolveRequestOrigin(req);
    const sourceOrigin = resolveSourceOrigin(req);
    const fetchSite = String(req.headers["sec-fetch-site"] || "")
      .trim()
      .toLowerCase();
    const isSameOrigin =
      Boolean(requestOrigin) && (sourceOrigin ? sourceOrigin === requestOrigin : fetchSite === "same-origin");
    if (isSameOrigin) return next();
    return res.status(403).json({ error: "Same-origin confirmation is required for admin mutations." });
  };
}

export { createAdminMutationOriginGuard };
