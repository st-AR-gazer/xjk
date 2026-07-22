import path from "node:path";

function disableAdminApiCache(_req, res, next) {
  res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate");
  res.setHeader("Pragma", "no-cache");
  res.setHeader("Expires", "0");
  next();
}

function disableApiCache(req, res, next) {
  delete req.headers["if-none-match"];
  delete req.headers["if-modified-since"];
  res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate");
  res.setHeader("Pragma", "no-cache");
  res.setHeader("Expires", "0");
  res.setHeader("Surrogate-Control", "no-store");
  next();
}

function rejectMissingStaticAsset(req, res, next) {
  if (req.method !== "GET" && req.method !== "HEAD") return next();
  const ext = path.extname(req.path || "").toLowerCase();
  if (!ext || ext === ".html") return next();
  return res.status(404).type("text/plain").send("Not Found");
}

export { disableAdminApiCache, disableApiCache, rejectMissingStaticAsset };
