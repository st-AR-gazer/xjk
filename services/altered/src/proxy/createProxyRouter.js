import express from "express";

const HOP_BY_HOP_HEADERS = new Set([
  "connection",
  "keep-alive",
  "proxy-authenticate",
  "proxy-authorization",
  "te",
  "trailers",
  "transfer-encoding",
  "upgrade",
  "host",
  "content-length",
  "expect",
]);

const RESPONSE_HEADERS = ["content-type", "cache-control", "etag", "last-modified"];
const BODYLESS_METHODS = new Set(["GET", "HEAD"]);

function toForwardHeaders(req, { defaultAdminToken = "" } = {}) {
  const headers = {};
  for (const [rawKey, rawValue] of Object.entries(req.headers || {})) {
    if (HOP_BY_HOP_HEADERS.has(String(rawKey || "").toLowerCase())) continue;
    if (rawValue === undefined) continue;
    headers[rawKey] = Array.isArray(rawValue) ? rawValue.join(", ") : String(rawValue);
  }
  if (!headers["x-admin-token"] && defaultAdminToken) {
    headers["x-admin-token"] = defaultAdminToken;
  }
  return headers;
}

function toRequestBody(req) {
  if (BODYLESS_METHODS.has(String(req.method || "").toUpperCase())) return undefined;
  if (req.body === undefined) return undefined;
  if (typeof req.body === "string") return req.body;
  return JSON.stringify(req.body);
}

function setResponseHeaders(res, upstreamResponse) {
  for (const key of RESPONSE_HEADERS) {
    const value = upstreamResponse.headers.get(key);
    if (!value) continue;
    res.setHeader(key, value);
  }
}

function createProxyRouter({
  baseUrl,
  timeoutMs = 15000,
  defaultAdminToken = "",
  logger = console,
} = {}) {
  const router = express.Router();

  router.use(async (req, res) => {
    const relativeUrl = String(req.url || "").replace(/^\/+/, "");
    const targetUrl = new URL(relativeUrl, `${String(baseUrl || "").replace(/\/+$/, "")}/`);
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const upstreamResponse = await fetch(targetUrl, {
        method: req.method,
        headers: toForwardHeaders(req, { defaultAdminToken }),
        body: toRequestBody(req),
        signal: controller.signal,
      });

      const buffer = Buffer.from(await upstreamResponse.arrayBuffer());
      setResponseHeaders(res, upstreamResponse);
      res.status(upstreamResponse.status).send(buffer);
    } catch (error) {
      const causeMessage = error?.cause?.message ? ` (${error.cause.message})` : "";
      const message =
        error?.name === "AbortError"
          ? "Tracker request timed out."
          : `${error?.message || "Tracker request failed."}${causeMessage}`;
      logger.error(`[altered-proxy] ${req.method} ${targetUrl} failed: ${message}`);
      res.status(502).json({
        error: "Tracker service request failed.",
        detail: message,
      });
    } finally {
      clearTimeout(timeout);
    }
  });

  return router;
}

export { createProxyRouter };
