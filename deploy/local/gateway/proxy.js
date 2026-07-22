import http from "node:http";
import https from "node:https";
import net from "node:net";

import {
  AGGREGATOR_HUB_PORT,
  COTD_PUBLIC_FALLBACK_PORT,
  COTD_PUBLIC_PORT,
  LOCAL_AGGREGATOR_DASH_FIRST,
  PORT,
  REMOTE_AGGREGATOR_COOLDOWN_MS,
  REMOTE_AGGREGATOR_ENABLED,
  REMOTE_AGGREGATOR_HOST_HEADER,
  REMOTE_AGGREGATOR_TIMEOUT_MS,
  REMOTE_AGGREGATOR_URL,
  REMOTE_ALTERED_ENABLED,
  REMOTE_ALTERED_HOST_HEADER,
  REMOTE_ALTERED_URL,
  REMOTE_SERVER_ENABLED,
  REMOTE_SERVER_URL,
  REMOTE_TRACKER_ENABLED,
  REMOTE_TRACKER_HOST_HEADER,
  REMOTE_TRACKER_URL,
  VALIDIFIER_PUBLIC_FALLBACK_PORT,
  VALIDIFIER_PUBLIC_PORT,
} from "./config.js";
import { getPathname, sendText } from "./http.js";

let remoteAggregatorUnhealthyUntilMs = 0;

function isServiceRequest(pathname) {
  const normalizedPath = String(pathname || "").trim() || "/";
  return (
    normalizedPath === "/health" ||
    normalizedPath === "/api" ||
    normalizedPath === "/api/" ||
    normalizedPath.startsWith("/api/")
  );
}

function canConnectPort(port, timeoutMs = 150) {
  if (!Number.isInteger(port) || port <= 0) return Promise.resolve(false);

  return new Promise((resolve) => {
    const socket = net.connect({ host: "127.0.0.1", port }, () => {
      socket.destroy();
      resolve(true);
    });

    socket.setTimeout(timeoutMs, () => {
      socket.destroy();
      resolve(false);
    });
    socket.on("error", () => resolve(false));
  });
}

async function proxyToFirstAvailablePort(req, res, ports, stripPrefix = "") {
  const candidates = [...new Set(ports)].filter((port) => Number.isInteger(port) && port > 0);
  for (const port of candidates) {
    if (await canConnectPort(port)) {
      proxy(req, res, port, stripPrefix);
      return true;
    }
  }
  return false;
}

function proxyValidifierToAvailablePort(req, res, stripPrefix = "") {
  return proxyToFirstAvailablePort(req, res, [VALIDIFIER_PUBLIC_PORT, VALIDIFIER_PUBLIC_FALLBACK_PORT], stripPrefix);
}

function proxyCotdToAvailablePort(req, res, stripPrefix = "") {
  return proxyToFirstAvailablePort(req, res, [COTD_PUBLIC_PORT, COTD_PUBLIC_FALLBACK_PORT], stripPrefix);
}

function forwardedHeaders(req, host) {
  const headers = { ...req.headers, host };
  const incomingHost = String(req.headers.host || "").trim();
  if (incomingHost) headers["x-forwarded-host"] = incomingHost;
  if (!headers["x-forwarded-proto"]) {
    headers["x-forwarded-proto"] = req.socket?.encrypted ? "https" : "http";
  }
  if (!headers["x-forwarded-port"]) headers["x-forwarded-port"] = String(PORT);

  const remoteAddress = String(req.socket?.remoteAddress || "").trim();
  if (remoteAddress) {
    const existingForwardedFor = String(headers["x-forwarded-for"] || "").trim();
    headers["x-forwarded-for"] = existingForwardedFor ? `${existingForwardedFor}, ${remoteAddress}` : remoteAddress;
  }
  return headers;
}

function proxy(req, res, targetPort, stripPrefix = "") {
  const originalPath = getPathname(req);
  const query = req.url && req.url.includes("?") ? req.url.slice(req.url.indexOf("?")) : "";
  let proxiedPath = originalPath;

  if (stripPrefix && proxiedPath.startsWith(stripPrefix)) {
    proxiedPath = proxiedPath.slice(stripPrefix.length) || "/";
  }

  const upstream = http.request(
    {
      hostname: "127.0.0.1",
      port: targetPort,
      method: req.method,
      path: `${proxiedPath}${query}`,
      headers: forwardedHeaders(req, `127.0.0.1:${targetPort}`),
    },
    (upstreamResponse) => {
      const responseHeaders = { ...upstreamResponse.headers };
      const location = String(responseHeaders.location || "");
      if (
        stripPrefix &&
        location.startsWith("/") &&
        !location.startsWith("//") &&
        location !== stripPrefix &&
        !location.startsWith(`${stripPrefix}/`)
      ) {
        responseHeaders.location = `${stripPrefix}${location}`;
      }
      res.writeHead(upstreamResponse.statusCode || 502, responseHeaders);
      upstreamResponse.pipe(res);
    }
  );

  upstream.on("error", (error) => {
    sendText(res, 502, `Upstream ${targetPort} unavailable: ${error.message}`);
  });
  req.pipe(upstream);
}

function proxyRemote(
  req,
  res,
  remoteUrl,
  hostHeader,
  { stripPrefix = "", responseHeader = "", label = "Remote upstream" } = {}
) {
  if (!remoteUrl) return sendText(res, 502, `${label} is not configured.`);

  const query = req.url && req.url.includes("?") ? req.url.slice(req.url.indexOf("?")) : "";
  let proxiedPath = getPathname(req);
  if (!proxiedPath.startsWith("/")) proxiedPath = `/${proxiedPath}`;
  if (stripPrefix && proxiedPath.startsWith(stripPrefix)) {
    proxiedPath = proxiedPath.slice(stripPrefix.length) || "/";
  }

  const basePathRaw = String(remoteUrl.pathname || "/");
  const basePath = basePathRaw === "/" ? "" : basePathRaw.replace(/\/$/, "");
  const targetProtocol = remoteUrl.protocol === "https:" ? https : http;
  const targetPort = Number(remoteUrl.port || (remoteUrl.protocol === "https:" ? 443 : 80));
  const upstream = targetProtocol.request(
    {
      protocol: remoteUrl.protocol,
      hostname: remoteUrl.hostname,
      port: targetPort,
      method: req.method,
      path: `${basePath}${proxiedPath}${query}`,
      headers: forwardedHeaders(req, hostHeader || remoteUrl.host),
    },
    (upstreamResponse) => {
      const responseHeaders = { ...upstreamResponse.headers };
      if (responseHeader) responseHeaders[responseHeader] = "1";
      res.writeHead(upstreamResponse.statusCode || 502, responseHeaders);
      upstreamResponse.pipe(res);
    }
  );

  upstream.on("error", (error) => {
    sendText(res, 502, `${label} ${remoteUrl.origin} unavailable: ${error.message}`);
  });
  req.pipe(upstream);
}

function proxyRemoteTracker(req, res, options = {}) {
  if (!REMOTE_TRACKER_ENABLED) return sendText(res, 502, "Remote tracker proxy is not configured.");
  return proxyRemote(req, res, REMOTE_TRACKER_URL, REMOTE_TRACKER_HOST_HEADER, {
    responseHeader: "x-xjk-remote-tracker",
    label: "Remote tracker upstream",
    ...options,
  });
}

function proxyRemoteAltered(req, res, options = {}) {
  if (!REMOTE_ALTERED_ENABLED) return sendText(res, 502, "Remote altered proxy is not configured.");
  return proxyRemote(req, res, REMOTE_ALTERED_URL, REMOTE_ALTERED_HOST_HEADER, {
    responseHeader: "x-xjk-remote-altered",
    label: "Remote altered upstream",
    ...options,
  });
}

function proxyRemoteAggregator(req, res, options = {}) {
  if (!REMOTE_AGGREGATOR_ENABLED) return sendText(res, 502, "Remote aggregator proxy is not configured.");
  return proxyRemote(req, res, REMOTE_AGGREGATOR_URL, REMOTE_AGGREGATOR_HOST_HEADER, {
    responseHeader: "x-xjk-remote-aggregator",
    label: "Remote aggregator upstream",
    ...options,
  });
}

function markRemoteAggregatorUnhealthy() {
  remoteAggregatorUnhealthyUntilMs = Date.now() + REMOTE_AGGREGATOR_COOLDOWN_MS;
}

function isRemoteAggregatorCoolingDown() {
  return Date.now() < remoteAggregatorUnhealthyUntilMs;
}

function proxyRemoteAggregatorWithLocalFallback(req, res, options = {}) {
  if (!REMOTE_AGGREGATOR_ENABLED) {
    if (AGGREGATOR_HUB_PORT > 0) return proxy(req, res, AGGREGATOR_HUB_PORT, options.stripPrefix || "");
    return sendText(res, 502, "Remote aggregator proxy is not configured.");
  }

  const method = String(req.method || "GET").toUpperCase();
  const canFallback = (method === "GET" || method === "HEAD") && AGGREGATOR_HUB_PORT > 0;
  if (!canFallback) return proxyRemoteAggregator(req, res, options);
  if (LOCAL_AGGREGATOR_DASH_FIRST || isRemoteAggregatorCoolingDown()) {
    return proxy(req, res, AGGREGATOR_HUB_PORT, options.stripPrefix || "");
  }

  const stripPrefix = options.stripPrefix || "";
  const query = req.url && req.url.includes("?") ? req.url.slice(req.url.indexOf("?")) : "";
  let proxiedPath = getPathname(req);
  if (!proxiedPath.startsWith("/")) proxiedPath = `/${proxiedPath}`;
  if (stripPrefix && proxiedPath.startsWith(stripPrefix)) {
    proxiedPath = proxiedPath.slice(stripPrefix.length) || "/";
  }

  const basePathRaw = String(REMOTE_AGGREGATOR_URL.pathname || "/");
  const basePath = basePathRaw === "/" ? "" : basePathRaw.replace(/\/$/, "");
  const targetProtocol = REMOTE_AGGREGATOR_URL.protocol === "https:" ? https : http;
  const targetPort = Number(REMOTE_AGGREGATOR_URL.port || (REMOTE_AGGREGATOR_URL.protocol === "https:" ? 443 : 80));
  const requestOptions = {
    protocol: REMOTE_AGGREGATOR_URL.protocol,
    hostname: REMOTE_AGGREGATOR_URL.hostname,
    port: targetPort,
    method,
    path: `${basePath}${proxiedPath}${query}`,
    headers: forwardedHeaders(req, REMOTE_AGGREGATOR_HOST_HEADER || REMOTE_AGGREGATOR_URL.host),
  };

  let settled = false;
  const fallbackToLocal = () => {
    if (settled) return;
    settled = true;
    markRemoteAggregatorUnhealthy();
    return proxy(req, res, AGGREGATOR_HUB_PORT, options.stripPrefix || "");
  };
  const upstream = targetProtocol.request(requestOptions, (upstreamResponse) => {
    if (settled) {
      upstreamResponse.resume();
      return;
    }
    const statusCode = upstreamResponse.statusCode || 502;
    if (statusCode >= 500) {
      upstreamResponse.resume();
      return fallbackToLocal();
    }

    settled = true;
    res.writeHead(statusCode, { ...upstreamResponse.headers, "x-xjk-remote-aggregator": "1" });
    upstreamResponse.pipe(res);
  });

  upstream.on("error", fallbackToLocal);
  upstream.setTimeout(REMOTE_AGGREGATOR_TIMEOUT_MS, () => {
    upstream.destroy(new Error("Remote aggregator timed out."));
  });
  req.pipe(upstream);
}

function proxyRemoteServerHost(req, res, hostHeader, options = {}) {
  if (!REMOTE_SERVER_ENABLED) return sendText(res, 502, "Remote server proxy is not configured.");
  return proxyRemote(req, res, REMOTE_SERVER_URL, hostHeader, {
    responseHeader: "x-xjk-remote-server",
    label: "Remote server upstream",
    ...options,
  });
}

export {
  isServiceRequest,
  proxy,
  proxyCotdToAvailablePort,
  proxyRemoteAggregator,
  proxyRemoteAggregatorWithLocalFallback,
  proxyRemoteAltered,
  proxyRemoteServerHost,
  proxyRemoteTracker,
  proxyValidifierToAvailablePort,
};
