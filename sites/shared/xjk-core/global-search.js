import "./safe-html.js?v=2";
import { createGlobalSearch } from "./global-search/controller.js";

const GLOBAL_SEARCH_KEY = "__xjkGlobalSearch";

function mountGlobalSearch() {
  if (typeof document === "undefined" || !document.body) return null;
  if (globalThis[GLOBAL_SEARCH_KEY]) {
    globalThis[GLOBAL_SEARCH_KEY].refresh();
    return globalThis[GLOBAL_SEARCH_KEY];
  }
  const api = createGlobalSearch();
  globalThis[GLOBAL_SEARCH_KEY] = api;
  globalThis.XjkSearch = api;
  return api;
}

export { mountGlobalSearch };
