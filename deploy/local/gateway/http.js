import fsp from "node:fs/promises";
import path from "node:path";
import { pipeline } from "node:stream/promises";
import { parseRequestCookies } from "../../../services/shared/httpAuth.js";

import {
  PORT,
  PREFER_LOCAL_SUBDOMAIN_REDIRECTS,
  REMOTE_SERVER_ENABLED,
  XJK_AUTH_PORT,
  XJK_AUTH_SESSION_COOKIE_NAME,
} from "./config.js";

const MIME_TYPES = Object.freeze({
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
  ".txt": "text/plain; charset=utf-8",
});

function getHost(req) {
  return String(req.headers.host || "")
    .split(":")[0]
    .trim()
    .toLowerCase();
}

function getPathname(req) {
  return req.url ? req.url.split("?")[0] : "/";
}

function getQuery(req) {
  if (!req.url || !req.url.includes("?")) return "";
  return req.url.slice(req.url.indexOf("?"));
}

function sendText(res, code, body) {
  if (res.headersSent || res.writableEnded) return;
  res.writeHead(code, { "content-type": "text/plain; charset=utf-8" });
  res.end(body);
}

function sendJson(res, code, body) {
  if (res.headersSent || res.writableEnded) return;
  res.writeHead(code, { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" });
  res.end(JSON.stringify(body));
}

function readRequestBody(req, maxBytes = 250_000) {
  return new Promise((resolve, reject) => {
    let body = "";

    req.setEncoding("utf8");
    req.on("data", (chunk) => {
      body += chunk;
      if (body.length > maxBytes) {
        reject(new Error("Request body is too large."));
        req.destroy();
      }
    });
    req.on("end", () => resolve(body));
    req.on("error", reject);
  });
}

function redirect(res, location) {
  res.writeHead(308, { location, "cache-control": "no-store" });
  res.end();
}

function redirectHostPreservePath(req, res, targetHost) {
  const rawUrl = String(req.url || "/");
  const safeUrl = rawUrl.startsWith("/") ? rawUrl : `/${rawUrl}`;
  redirect(res, `http://${targetHost}:${PORT}${safeUrl}`);
}

function redirectToTrackersSubpath(req, res, basePath) {
  const rawUrl = String(req.url || "/");
  const safeUrl = rawUrl.startsWith("/") ? rawUrl : `/${rawUrl}`;
  const suffix = safeUrl === "/" ? "/" : safeUrl;
  redirect(res, `http://trackers.localhost:${PORT}${basePath}${suffix}`);
}

function hasNonEmptyCookie(req, name) {
  const target = String(name || "").trim();
  if (!target) return false;
  return String(parseRequestCookies(req)[target] || "").trim() !== "";
}

function userHasAdminRole(user) {
  const roles = Array.isArray(user?.roles) ? user.roles : [];
  return Boolean(user?.admin || roles.includes("admin"));
}

async function fetchXjkAuthSession(req) {
  if (!Number.isInteger(XJK_AUTH_PORT) || XJK_AUTH_PORT <= 0) return null;

  const response = await fetch(`http://127.0.0.1:${XJK_AUTH_PORT}/api/v1/account/session`, {
    headers: {
      accept: "application/json",
      cookie: String(req.headers.cookie || ""),
      host: `127.0.0.1:${XJK_AUTH_PORT}`,
      "x-forwarded-host": String(req.headers.host || `localhost:${PORT}`),
      "x-forwarded-proto": "http",
      "x-forwarded-port": String(PORT),
    },
  });
  if (!response.ok) return null;
  return response.json();
}

async function requireAdminSession(req, res) {
  let payload = null;
  try {
    payload = await fetchXjkAuthSession(req);
  } catch (error) {
    sendJson(res, 502, { ok: false, error: `Admin auth unavailable: ${error.message}` });
    return null;
  }

  if (!payload?.authenticated || !payload?.session?.user) {
    sendJson(res, 401, { ok: false, error: "Log in with the configured admin Ubisoft account." });
    return null;
  }

  if (!userHasAdminRole(payload.session.user)) {
    sendJson(res, 403, { ok: false, error: "This xjk account does not have admin access." });
    return null;
  }

  return payload.session;
}

function maybeRedirectPathToSubdomain(req, res, prefix, subdomain) {
  if (REMOTE_SERVER_ENABLED || !PREFER_LOCAL_SUBDOMAIN_REDIRECTS) return false;
  if (hasNonEmptyCookie(req, XJK_AUTH_SESSION_COOKIE_NAME)) return false;

  const pathname = getPathname(req);
  if (pathname !== prefix && !pathname.startsWith(`${prefix}/`)) return false;

  const suffix = pathname.slice(prefix.length) || "/";
  redirect(res, `http://${subdomain}.localhost:${PORT}${suffix}${getQuery(req)}`);
  return true;
}

function isConsoleRuntimeRequest(pathname) {
  const normalizedPath = String(pathname || "").trim() || "/";
  return (
    normalizedPath === "/console/health" ||
    normalizedPath.startsWith("/console/bingo/api/") ||
    normalizedPath.startsWith("/console/bingo/auth/") ||
    normalizedPath.startsWith("/console/bingo/events/")
  );
}

function shouldFallbackToIndex(requestPath) {
  const extension = path.extname(requestPath).toLowerCase();
  if (!extension || extension === ".html") return true;
  return !Object.hasOwn(MIME_TYPES, extension);
}

function isMissingFileError(error) {
  return error?.code === "ENOENT" || error?.code === "ENOTDIR";
}

async function openStaticFile(filePath, fileSystem = fsp) {
  let candidatePath = filePath;
  let directory = false;

  try {
    const initialStat = await fileSystem.stat(candidatePath);
    directory = initialStat.isDirectory();
    if (directory) candidatePath = path.join(candidatePath, "index.html");
  } catch (error) {
    if (isMissingFileError(error)) return { kind: "missing", directory, path: candidatePath };
    throw error;
  }

  let handle;
  try {
    handle = await fileSystem.open(candidatePath, "r");
    const openedStat = await handle.stat();
    if (!openedStat.isFile()) {
      await handle.close();
      return { kind: "missing", directory, path: candidatePath };
    }
    return { kind: "file", directory, handle, path: candidatePath };
  } catch (error) {
    await handle?.close().catch(() => {});
    if (isMissingFileError(error) || error?.code === "EISDIR") {
      return { kind: "missing", directory, path: candidatePath };
    }
    throw error;
  }
}

async function serveStatic(req, res, rootDirectory, basePrefix = "", { fileSystem = fsp } = {}) {
  const resolvedRoot = path.resolve(rootDirectory);
  let requestPath = getPathname(req);

  if (basePrefix) {
    if (!requestPath.startsWith(basePrefix)) return sendText(res, 404, "Not Found");
    requestPath = requestPath.slice(basePrefix.length) || "/";
  }

  let relativePath = requestPath.startsWith("/") ? requestPath.slice(1) : requestPath;
  try {
    relativePath = decodeURIComponent(relativePath);
  } catch (error) {
    if (error instanceof URIError) return sendText(res, 400, "Malformed URL encoding.");
    throw error;
  }

  const normalizedPath = path.posix.normalize(`/${relativePath}`);
  if (normalizedPath.includes("..")) return sendText(res, 403, "Forbidden");

  const absolutePath = path.resolve(resolvedRoot, `.${normalizedPath}`);
  if (absolutePath !== resolvedRoot && !absolutePath.startsWith(`${resolvedRoot}${path.sep}`)) {
    return sendText(res, 403, "Forbidden");
  }
  let opened;
  try {
    opened = await openStaticFile(absolutePath, fileSystem);
    if (opened.kind === "missing" && !opened.directory && shouldFallbackToIndex(requestPath)) {
      opened = await openStaticFile(path.join(resolvedRoot, "index.html"), fileSystem);
    }
    if (opened.kind === "missing") return sendText(res, 404, "Not Found");

    const contentType = MIME_TYPES[path.extname(opened.path).toLowerCase()] || "application/octet-stream";
    res.writeHead(200, { "content-type": contentType, "cache-control": "no-store" });
    if (req.method === "HEAD") {
      await opened.handle.close();
      return res.end();
    }
    await pipeline(opened.handle.createReadStream({ autoClose: true }), res);
  } catch (error) {
    await opened?.handle?.close().catch(() => {});
    if (res.headersSent) {
      if (!res.writableEnded) res.destroy(error);
      return;
    }
    if (isMissingFileError(error) || error?.code === "EISDIR") return sendText(res, 404, "Not Found");
    if (error?.code === "EACCES" || error?.code === "EPERM") return sendText(res, 403, "Forbidden");
    return sendText(res, 500, `Static serve error: ${error.message}`);
  }
}

export {
  getHost,
  getPathname,
  getQuery,
  isConsoleRuntimeRequest,
  maybeRedirectPathToSubdomain,
  openStaticFile,
  readRequestBody,
  redirect,
  redirectHostPreservePath,
  redirectToTrackersSubpath,
  requireAdminSession,
  sendJson,
  sendText,
  serveStatic,
  userHasAdminRole,
};
