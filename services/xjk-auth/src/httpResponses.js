import { writeJsonResponse, writeRedirectResponse, writeTextResponse } from "../../shared/httpResponses.js";

const privateHeaders = {
  "cache-control": "no-store",
  "x-content-type-options": "nosniff",
};

function sendJson(res, statusCode, payload, headers = {}) {
  return writeJsonResponse(res, statusCode, payload, { headers: { ...privateHeaders, ...headers } });
}

function sendText(res, statusCode, body, contentType = "text/plain; charset=utf-8", headers = {}) {
  return writeTextResponse(res, statusCode, body, {
    contentType,
    headers: { ...privateHeaders, ...headers },
  });
}

function redirect(res, location, headers = {}) {
  return writeRedirectResponse(res, location, {
    headers: { "cache-control": "no-store", ...headers },
  });
}

export { redirect, sendJson, sendText };
