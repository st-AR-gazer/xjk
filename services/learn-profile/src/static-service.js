import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";

const CONTENT_TYPES = Object.freeze({
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".ico": "image/x-icon",
  ".md": "text/markdown; charset=utf-8",
});

export function createStaticService({ config, httpSupport } = {}) {
  const { sendText } = httpSupport;

  function isInside(root, target) {
    const resolvedRoot = path.resolve(root);
    const resolvedTarget = path.resolve(target);
    return resolvedTarget === resolvedRoot || resolvedTarget.startsWith(`${resolvedRoot}${path.sep}`);
  }

  function streamFile(res, target) {
    const type = CONTENT_TYPES[path.extname(target).toLowerCase()] || "application/octet-stream";
    res.writeHead(200, { "content-type": type, "x-content-type-options": "nosniff" });
    fs.createReadStream(target).pipe(res);
  }

  async function serveStatic(req, res, url) {
    let requestPath = decodeURIComponent(url.pathname || "/");
    if (requestPath.endsWith("/")) requestPath += "index.html";
    const normalized = path.posix.normalize(`/${requestPath.replace(/^\/+/, "")}`);
    if (normalized.includes("..")) return sendText(res, 403, "Forbidden");
    let target = path.resolve(config.frontendDir, `.${normalized}`);
    if (!isInside(config.frontendDir, target)) return sendText(res, 403, "Forbidden");
    try {
      const stat = await fsp.stat(target);
      if (stat.isDirectory()) target = path.join(target, "index.html");
    } catch {
      target = path.join(config.frontendDir, "index.html");
    }
    streamFile(res, target);
  }

  async function serveSharedStatic(req, res, url) {
    let requestPath = decodeURIComponent(url.pathname || "/");
    if (!requestPath.startsWith("/shared/")) return sendText(res, 404, "Not Found");
    requestPath = requestPath.slice("/shared".length) || "/";
    if (requestPath.endsWith("/")) requestPath += "index.html";

    const normalized = path.posix.normalize(`/${requestPath.replace(/^\/+/, "")}`);
    if (normalized.includes("..")) return sendText(res, 403, "Forbidden");

    let target = path.resolve(config.sharedDir, `.${normalized}`);
    if (!isInside(config.sharedDir, target)) return sendText(res, 403, "Forbidden");

    try {
      const stat = await fsp.stat(target);
      if (stat.isDirectory()) target = path.join(target, "index.html");
    } catch {
      return sendText(res, 404, "Not Found");
    }

    streamFile(res, target);
  }

  return { isInside, serveStatic, serveSharedStatic };
}
