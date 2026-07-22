import { readJsonBody as readSharedJsonBody } from "../../shared/httpJson.js";
import { writeJsonResponse, writeRedirectResponse, writeTextResponse } from "../../shared/httpResponses.js";

export function createHttpSupport({ config, helpers } = {}) {
  const { nowMs } = helpers;

  const manualCheckWindows = new Map();

  function sendJson(res, status, payload, extraHeaders = {}) {
    writeJsonResponse(res, status, payload, {
      headers: { "cache-control": "no-store", ...extraHeaders },
    });
  }

  function sendText(res, status, text, extraHeaders = {}) {
    writeTextResponse(res, status, text, { headers: extraHeaders });
  }

  function redirect(res, target, extraHeaders = {}) {
    writeRedirectResponse(res, target, { headers: extraHeaders });
  }

  function consumeManualCheckSlot(accountId, matchUid) {
    const account = String(accountId || "").trim();
    const match = String(matchUid || "").trim();
    const key = `${account}:${match}`;
    const now = nowMs();
    const windowMs = config.manualCheckWindowMs;
    const limit = config.manualCheckLimit;
    const previous = Array.isArray(manualCheckWindows.get(key)) ? manualCheckWindows.get(key) : [];
    const recent = previous.filter((timestamp) => now - Number(timestamp || 0) < windowMs);
    if (recent.length >= limit) {
      const oldest = Math.min(...recent);
      const retryAfterSeconds = Math.max(1, Math.ceil((oldest + windowMs - now) / 1000));
      manualCheckWindows.set(key, recent);
      return {
        allowed: false,
        retryAfterSeconds,
        remaining: 0,
      };
    }
    recent.push(now);
    manualCheckWindows.set(key, recent);
    return {
      allowed: true,
      retryAfterSeconds: 0,
      remaining: Math.max(0, limit - recent.length),
    };
  }

  async function readJsonBody(req) {
    return readSharedJsonBody(req, { maxBytes: 1024 * 1024 });
  }

  return { manualCheckWindows, sendJson, sendText, redirect, consumeManualCheckSlot, readJsonBody };
}
