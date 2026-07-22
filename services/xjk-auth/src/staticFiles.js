import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import { sendText } from "./httpResponses.js";

const mimeByExtension = new Map([
  [".css", "text/css; charset=utf-8"],
  [".html", "text/html; charset=utf-8"],
  [".ico", "image/x-icon"],
  [".js", "application/javascript; charset=utf-8"],
  [".json", "application/json; charset=utf-8"],
  [".md", "text/markdown; charset=utf-8"],
  [".png", "image/png"],
  [".svg", "image/svg+xml"],
]);

function mimeForPath(filePath) {
  return mimeByExtension.get(path.extname(filePath).toLowerCase()) || "application/octet-stream";
}

function containedPath(root, requestPath) {
  const decoded = decodeURIComponent(requestPath);
  const target = path.resolve(root, `.${path.posix.normalize(decoded)}`);
  const relative = path.relative(root, target);
  if (relative.startsWith("..") || path.isAbsolute(relative)) return null;
  return target;
}

async function fileExists(filePath) {
  try {
    await fsp.access(filePath);
    return true;
  } catch {
    return false;
  }
}

function streamStaticFile(res, targetPath, mime, { logger = console } = {}) {
  const stream = fs.createReadStream(targetPath);
  stream.once("error", (error) => {
    logger.error(`[xjk-auth] static file read failed (${error?.code || "unknown"}): ${targetPath}`);
    if (!res.headersSent && !res.writableEnded) {
      const statusCode = ["EISDIR", "ENOENT", "ENOTDIR"].includes(error?.code) ? 404 : 500;
      sendText(res, statusCode, statusCode === 404 ? "Not Found" : "Unable to read static asset.");
      return;
    }
    if (!res.destroyed) res.destroy();
  });
  stream.once("open", () => {
    if (res.destroyed || res.writableEnded) return stream.destroy();
    res.writeHead(200, { "content-type": mime, "cache-control": "no-store" });
    stream.pipe(res);
  });
  res.once("close", () => {
    if (!stream.destroyed) stream.destroy();
  });
}

function createStaticFileService({ accountDir, sharedDir, isAccountHost, logger = console }) {
  async function serveAccount(req, res) {
    const root = path.resolve(accountDir);
    const url = new URL(req.url || "/", "http://localhost");
    let requestPath = url.pathname || "/";
    if (!isAccountHost(req)) {
      if (!requestPath.startsWith("/account")) return sendText(res, 404, "Not Found");
      requestPath = requestPath.slice("/account".length) || "/";
    }
    if (!requestPath.startsWith("/")) requestPath = `/${requestPath}`;
    let targetPath = containedPath(root, requestPath);
    if (!targetPath) return sendText(res, 403, "Forbidden");
    if (requestPath.endsWith("/")) targetPath = path.join(targetPath, "index.html");
    if (!(await fileExists(targetPath))) targetPath = path.join(root, "index.html");
    return streamStaticFile(res, targetPath, mimeForPath(targetPath), { logger });
  }

  async function serveShared(req, res) {
    const root = path.resolve(sharedDir);
    const url = new URL(req.url || "/", "http://localhost");
    let requestPath = url.pathname || "/";
    if (!requestPath.startsWith("/shared/")) return sendText(res, 404, "Not Found");
    requestPath = requestPath.slice("/shared".length) || "/";
    if (!requestPath.startsWith("/")) requestPath = `/${requestPath}`;
    let targetPath = containedPath(root, requestPath);
    if (!targetPath) return sendText(res, 403, "Forbidden");
    if (requestPath.endsWith("/")) targetPath = path.join(targetPath, "index.html");
    if (!(await fileExists(targetPath))) return sendText(res, 404, "Not Found");
    return streamStaticFile(res, targetPath, mimeForPath(targetPath), { logger });
  }

  return { serveAccount, serveShared };
}

export { containedPath, createStaticFileService, mimeForPath, streamStaticFile };
