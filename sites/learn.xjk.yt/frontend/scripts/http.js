import { assetPath } from "./utils.js";
export { fetchJson } from "../../../shared/xjk-core/http.js?v=2";

export function buildAppPath(basePath = "", path = "") {
  return assetPath(`${basePath}${path.startsWith("/") ? path : `/${path}`}`);
}
