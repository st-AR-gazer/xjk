import { DEFAULT_MAP_SORT, PAGE_SIZE, SEASON_YEAR_RE, UUID_RE } from "./config.js?v=2";
import { state } from "./state.js?v=2";

export function createRandomSeed() {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  const bytes = new Uint8Array(16);
  if (globalThis.crypto?.getRandomValues) {
    globalThis.crypto.getRandomValues(bytes);
  } else {
    for (let i = 0; i < bytes.length; i += 1) {
      bytes[i] = Math.floor(Math.random() * 256);
    }
  }
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

export function normalizeSeed(value) {
  const seed = String(value || "")
    .trim()
    .toLowerCase();
  return UUID_RE.test(seed) ? seed : "";
}

export function classifySeasonTagKey(key) {
  const match = SEASON_YEAR_RE.exec(String(key || ""));
  if (match) return { kind: "season-year", base: match[1].toLowerCase(), year: match[2] };
  return { kind: "other" };
}

export function getSeasonTagBase(key) {
  const c = classifySeasonTagKey(key);
  return c.kind === "season-year" ? c.base : "";
}

export function uniqueList(values = []) {
  return [
    ...new Set((Array.isArray(values) ? values : [values]).map((value) => String(value || "").trim()).filter(Boolean)),
  ];
}

function parseListParam(params, key) {
  return uniqueList(String(params.get(key) || "").split(","));
}

function normalizeLegacySeasonKey(season, year) {
  const seasonKey = String(season || "")
    .trim()
    .toLowerCase();
  const yearText = String(year || "").trim();
  if (!seasonKey) return "";
  if (yearText && /^\d{4}$/.test(yearText)) return `${seasonKey}-${yearText}`;
  return seasonKey;
}

function partitionLegacySeasonKeys(legacyKeys) {
  const seasons = new Set();
  const years = new Set();
  const others = new Set();
  uniqueList(legacyKeys).forEach((key) => {
    const c = classifySeasonTagKey(key);
    if (c.kind === "season-year") {
      seasons.add(c.base);
      years.add(c.year);
    } else if (key) {
      others.add(key);
    }
  });
  return { seasons: [...seasons], years: [...years], others: [...others] };
}

export function readUrlState() {
  const params = new URLSearchParams(window.location.search);
  state.page = Math.max(1, Number(params.get("page") || 1) || 1);
  const hasSortParam = params.has("sort");
  const hasSeedParam = params.has("seed");
  const sort = params.get("sort") || DEFAULT_MAP_SORT;
  const legacySeasonKey = normalizeLegacySeasonKey(params.get("season"), params.get("year"));
  const legacyWrState = params.get("has_wr") === "1" ? "with_wr" : params.get("has_wr") === "0" ? "without_wr" : "";

  const legacyInclude = partitionLegacySeasonKeys([...parseListParam(params, "season_keys"), legacySeasonKey]);
  const legacyExclude = partitionLegacySeasonKeys(parseListParam(params, "exclude_season_keys"));

  state.filters = {
    q: params.get("q") || "",
    seasonInclude: uniqueList([...parseListParam(params, "seasons"), ...legacyInclude.seasons]),
    seasonExclude: uniqueList([...parseListParam(params, "exclude_seasons"), ...legacyExclude.seasons]),
    yearInclude: uniqueList([...parseListParam(params, "years"), ...legacyInclude.years]),
    yearExclude: uniqueList([...parseListParam(params, "exclude_years"), ...legacyExclude.years]),
    otherInclude: uniqueList([...parseListParam(params, "others"), ...legacyInclude.others]),
    otherExclude: uniqueList([...parseListParam(params, "exclude_others"), ...legacyExclude.others]),
    alterationInclude: uniqueList([...parseListParam(params, "alterations"), params.get("alteration") || ""]),
    alterationExclude: uniqueList([
      ...parseListParam(params, "exclude_alterations"),
      params.get("exclude_alteration") || "",
    ]),
    statusInclude: uniqueList([...parseListParam(params, "statuses"), params.get("status") || ""]),
    statusExclude: parseListParam(params, "exclude_statuses"),
    wrInclude: uniqueList([...parseListParam(params, "wr_states"), legacyWrState]),
    wrExclude: parseListParam(params, "exclude_wr_states"),
    mapNumber: params.get("map_number") || "",
    environmentInclude: uniqueList([...parseListParam(params, "environments"), params.get("environment") || ""]),
    environmentExclude: parseListParam(params, "exclude_environments"),
    mapTypeInclude: uniqueList([...parseListParam(params, "map_types"), params.get("map_type") || ""]),
    mapTypeExclude: parseListParam(params, "exclude_map_types"),
    sort,
  };
  state.explicitQuery = {
    sort: hasSortParam,
    seed: hasSeedParam,
  };
  state.randomSeed = sort === "random" ? normalizeSeed(params.get("seed")) || createRandomSeed() : "";
  return {
    map: params.get("map") || "",
  };
}

export function writeUrl({ replace = false, map = "" } = {}) {
  const params = new URLSearchParams();
  const sort = state.filters.sort || DEFAULT_MAP_SORT;
  const writeSort = sort !== DEFAULT_MAP_SORT || state.explicitQuery.sort || state.explicitQuery.seed;
  const writeSeed = sort === "random" && state.randomSeed && (state.explicitQuery.sort || state.explicitQuery.seed);
  if (state.filters.q) params.set("q", state.filters.q);
  if (state.filters.seasonInclude.length) params.set("seasons", state.filters.seasonInclude.join(","));
  if (state.filters.seasonExclude.length) params.set("exclude_seasons", state.filters.seasonExclude.join(","));
  if (state.filters.yearInclude.length) params.set("years", state.filters.yearInclude.join(","));
  if (state.filters.yearExclude.length) params.set("exclude_years", state.filters.yearExclude.join(","));
  if (state.filters.otherInclude.length) params.set("others", state.filters.otherInclude.join(","));
  if (state.filters.otherExclude.length) params.set("exclude_others", state.filters.otherExclude.join(","));
  if (state.filters.alterationInclude.length) params.set("alterations", state.filters.alterationInclude.join(","));
  if (state.filters.alterationExclude.length) {
    params.set("exclude_alterations", state.filters.alterationExclude.join(","));
  }
  if (state.filters.statusInclude.length) params.set("statuses", state.filters.statusInclude.join(","));
  if (state.filters.statusExclude.length) params.set("exclude_statuses", state.filters.statusExclude.join(","));
  if (state.filters.wrInclude.length) params.set("wr_states", state.filters.wrInclude.join(","));
  if (state.filters.wrExclude.length) params.set("exclude_wr_states", state.filters.wrExclude.join(","));
  if (state.filters.mapNumber) params.set("map_number", String(state.filters.mapNumber));
  if (state.filters.environmentInclude.length) params.set("environments", state.filters.environmentInclude.join(","));
  if (state.filters.environmentExclude.length) {
    params.set("exclude_environments", state.filters.environmentExclude.join(","));
  }
  if (state.filters.mapTypeInclude.length) params.set("map_types", state.filters.mapTypeInclude.join(","));
  if (state.filters.mapTypeExclude.length) params.set("exclude_map_types", state.filters.mapTypeExclude.join(","));
  if (writeSort) params.set("sort", sort);
  if (state.page > 1) params.set("page", String(state.page));
  if (writeSeed) params.set("seed", state.randomSeed);
  if (map) params.set("map", map);
  const target = params.toString() ? `?${params.toString()}` : window.location.pathname;
  const method = replace ? "replaceState" : "pushState";
  history[method]({ page: state.page, filters: state.filters, map }, "", target);
}

function resolveSeasonCampaignIds(keys = []) {
  const seasonTags = Array.isArray(state.options?.season_tags) ? state.options.season_tags : [];
  const campaignIds = new Set();
  uniqueList(keys).forEach((key) => {
    const match = seasonTags.find((row) => row.key === key);
    (Array.isArray(match?.campaign_ids) ? match.campaign_ids : []).forEach((campaignId) => {
      const id = String(campaignId || "").trim();
      if (id) campaignIds.add(id);
    });
  });
  return [...campaignIds];
}

function resolveCombinedSeasonKeys(side = "include") {
  const seasonTags = Array.isArray(state.options?.season_tags) ? state.options.season_tags : [];
  const seasons = state.filters[side === "include" ? "seasonInclude" : "seasonExclude"];
  const years = (state.filters[side === "include" ? "yearInclude" : "yearExclude"] || []).map(String);
  const others = state.filters[side === "include" ? "otherInclude" : "otherExclude"];

  const matched = new Set();
  if (seasons.length || years.length) {
    seasonTags.forEach((tag) => {
      const c = classifySeasonTagKey(tag.key);
      if (c.kind !== "season-year") return;
      const seasonOk = !seasons.length || seasons.includes(c.base);
      const yearOk = !years.length || years.includes(c.year);
      if (seasonOk && yearOk) matched.add(tag.key);
    });
  }
  others.forEach((key) => matched.add(String(key)));
  return [...matched];
}

export function buildMapQuery() {
  const seasonIncludeCampaignIds = resolveSeasonCampaignIds(resolveCombinedSeasonKeys("include"));
  const seasonExcludeCampaignIds = resolveSeasonCampaignIds(resolveCombinedSeasonKeys("exclude"));
  return new URLSearchParams({
    limit: String(PAGE_SIZE),
    offset: String((state.page - 1) * PAGE_SIZE),
    sort: state.filters.sort || DEFAULT_MAP_SORT,
    ...(state.filters.sort === "random" && state.randomSeed ? { seed: state.randomSeed } : {}),
    ...(state.filters.q ? { q: state.filters.q } : {}),
    ...(seasonIncludeCampaignIds.length ? { campaign_ids: seasonIncludeCampaignIds.join(",") } : {}),
    ...(seasonExcludeCampaignIds.length ? { exclude_campaign_ids: seasonExcludeCampaignIds.join(",") } : {}),
    ...(state.filters.alterationInclude.length ? { alteration_slugs: state.filters.alterationInclude.join(",") } : {}),
    ...(state.filters.alterationExclude.length
      ? { exclude_alteration_slugs: state.filters.alterationExclude.join(",") }
      : {}),
    ...(state.filters.statusInclude.length ? { statuses: state.filters.statusInclude.join(",") } : {}),
    ...(state.filters.statusExclude.length ? { exclude_statuses: state.filters.statusExclude.join(",") } : {}),
    ...(state.filters.wrInclude.length ? { wr_states: state.filters.wrInclude.join(",") } : {}),
    ...(state.filters.wrExclude.length ? { exclude_wr_states: state.filters.wrExclude.join(",") } : {}),
    ...(state.filters.mapNumber ? { map_number: state.filters.mapNumber } : {}),
    ...(state.filters.environmentInclude.length ? { environments: state.filters.environmentInclude.join(",") } : {}),
    ...(state.filters.environmentExclude.length
      ? { exclude_environments: state.filters.environmentExclude.join(",") }
      : {}),
    ...(state.filters.mapTypeInclude.length ? { map_types: state.filters.mapTypeInclude.join(",") } : {}),
    ...(state.filters.mapTypeExclude.length ? { exclude_map_types: state.filters.mapTypeExclude.join(",") } : {}),
  });
}
