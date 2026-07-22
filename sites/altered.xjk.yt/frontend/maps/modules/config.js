export const API = {
  stats: "/api/v1/alterations/stats",
  filters: "/api/v1/alterations/maps/filters",
  maps: "/api/v1/alterations/maps",
  mapDetail: "/api/v1/public/maps",
};

export const PAGE_SIZE = 48;
export const DEFAULT_MAP_SORT = "random";
export const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const NADEO_FMT_RE = /\$([0-9a-fA-F]{1,3}|[gimnostuwzGIMNOSTUWZ<>]|[hlpHLP](\[[^\]]+\])?)/g;
export const DISPLAY_NAME_REFRESH_DELAYS_MS = [250, 1000, 2500, 5000, 10000, 20000];
export const SEASON_BASES = ["winter", "spring", "summer", "fall"];
export const SEASON_BASE_LABEL = { winter: "Winter", spring: "Spring", summer: "Summer", fall: "Fall" };
export const SEASON_YEAR_RE = /^(winter|spring|summer|fall)-(\d{4})$/i;

export function alteredUrl(value) {
  const resolver = globalThis.window?.__alteredUrl;
  return typeof resolver === "function" ? resolver(value) : value;
}
