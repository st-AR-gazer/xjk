import rateLimit from "express-rate-limit";
import { UpstreamHttpError } from "./internalClient.js";

export function sendSuccess(res, data, statusCode = 200) {
  return res.status(statusCode).json({ ok: true, data });
}

export function sendError(res, statusCode, code, message) {
  return res.status(statusCode).json({ ok: false, error: { code, message } });
}

export function setPublicCacheHeaders(res, ttlMs, cacheStatus) {
  res.setHeader("cache-control", `public, max-age=${Math.floor(Math.max(0, Number(ttlMs) || 0) / 1000)}`);
  if (cacheStatus) res.setHeader("x-validifier-cache", cacheStatus);
}

export function createPublicRateLimiter(maxRequests) {
  return rateLimit({
    windowMs: 5 * 60 * 1000,
    limit: maxRequests,
    standardHeaders: true,
    legacyHeaders: false,
    handler: (_req, res) => sendError(res, 429, "rate_limited", "Too many requests. Please try again in a moment."),
  });
}

export function upstreamIsUnavailable(error) {
  return (
    error instanceof TypeError ||
    error?.name === "TimeoutError" ||
    error?.name === "AbortError" ||
    error?.code === "upstream_unavailable" ||
    /fetch failed|ECONNREFUSED|ENOTFOUND|EAI_AGAIN|socket hang up/i.test(String(error?.message || ""))
  );
}

export function mapErrorToResponse(res, error, notFoundMessage) {
  if (error?.statusCode === 400 || error?.code === "invalid_request") {
    return sendError(res, 400, "invalid_request", error.message || "Invalid request.");
  }
  if (
    error?.statusCode === 429 &&
    (error?.code === "upload_quota_exceeded" || error?.code === "upload_concurrency_limited")
  ) {
    if (error.retryAfterSeconds) res.setHeader("retry-after", String(error.retryAfterSeconds));
    return sendError(res, 429, error.code, error.message);
  }
  if (error?.statusCode === 404) return sendError(res, 404, "not_found", notFoundMessage);
  if (error instanceof UpstreamHttpError) {
    if (error.statusCode === 404) return sendError(res, 404, "not_found", notFoundMessage);
    if (error.statusCode === 429) {
      return sendError(res, 429, "rate_limited", "The public service is temporarily rate limited.");
    }
    return sendError(
      res,
      error.statusCode === 401 || error.statusCode === 403 ? 503 : 502,
      "upstream_unavailable",
      "The public Validifier service could not reach its private validation backend."
    );
  }
  if (upstreamIsUnavailable(error)) {
    return sendError(
      res,
      503,
      "upstream_unavailable",
      "The public Validifier service could not reach its private validation backend."
    );
  }
  return sendError(res, 500, "internal_error", "The public Validifier service encountered an unexpected error.");
}
