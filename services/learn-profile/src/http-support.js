import { readTextBody } from "../../shared/httpJson.js";
import { writeJsonResponse, writeRedirectResponse, writeTextResponse } from "../../shared/httpResponses.js";

export function createHttpSupport() {
  async function readBody(req, limitBytes = 256 * 1024) {
    return readTextBody(req, { maxBytes: limitBytes });
  }

  function sendJson(res, code, payload, extraHeaders = {}) {
    writeJsonResponse(res, code, payload, {
      headers: {
        "cache-control": "no-store",
        "x-content-type-options": "nosniff",
        ...extraHeaders,
      },
    });
  }

  function sendText(res, code, body, contentType = "text/plain; charset=utf-8", extraHeaders = {}) {
    writeTextResponse(res, code, body, {
      contentType,
      headers: {
        "cache-control": "no-store",
        "x-content-type-options": "nosniff",
        ...extraHeaders,
      },
    });
  }

  function redirect(res, location, extraHeaders = {}) {
    writeRedirectResponse(res, location, {
      headers: { "cache-control": "no-store", ...extraHeaders },
    });
  }

  return { readBody, sendJson, sendText, redirect };
}
