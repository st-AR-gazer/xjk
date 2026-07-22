import { fetchJson } from "../../../../shared/xjk-core/http.js?v=2";
import { alteredUrl } from "./config.js?v=2";

export function getJson(path) {
  return fetchJson(alteredUrl(path));
}

export function postJson(path, body = {}) {
  return fetchJson(alteredUrl(path), { method: "POST", json: body });
}
