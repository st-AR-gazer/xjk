const API = {
  stats: "/api/v1/alterations/stats",
  alterations: "/api/v1/alterations/types",
  campaigns: "/api/v1/alterations/campaigns",
  maps: "/api/v1/alterations/maps",
  mapDetail: "/api/v1/public/maps",
};
const alteredUrl = window.__alteredUrl || ((value) => value);

const state = {
  stats: null,
  alterations: [],
  campaigns: [],
  activeAlterationSlug: "",
  activeCampaignId: "",
  alterationSearch: "",
  mapSearch: "",
  mapSort: "name",
  alterationMaps: new Map(),
  campaignMaps: new Map(),
};

const NADEO_FMT_RE = /\$([0-9a-fA-F]{1,3}|[gimnostuwzGIMNOSTUWZ<>]|[hlpHLP](\[[^\]]+\])?)/g;
const TIMELINE_SEASON_ORDER = {
  winter: 1,
  spring: 2,
  summer: 3,
  fall: 4,
};
const DISCOVERY_TIMELINE = {
  "snow-discovery": { season: "fall", year: 2023, offset: 0.5 },
  "rally-discovery": { season: "winter", year: 2024, offset: 0.5 },
  "desert-discovery": { season: "spring", year: 2024, offset: 0.5 },
  "stunt-discovery": { season: "summer", year: 2024, offset: 0.5 },
  "platform-discovery": { season: "fall", year: 2024, offset: 0.5 },
};

const $container = document.getElementById("content-container");
const $controlsBar = document.getElementById("controls-bar");
const $searchInput = document.getElementById("map-search");
const $sortSelect = document.getElementById("map-sort");
const $loading = document.getElementById("loading-state");
const $empty = document.getElementById("empty-state");
const $error = document.getElementById("error-state");
const $modalBackdrop = document.getElementById("map-modal-backdrop");
const $modalContent = document.getElementById("map-modal-content");
const $modalClose = document.getElementById("map-modal-close");

function esc(value) {
  const node = document.createElement("span");
  node.textContent = String(value || "");
  return node.innerHTML;
}

function stripFmt(value) {
  return String(value ?? "").replace(NADEO_FMT_RE, "");
}

function escN(value) {
  return esc(stripFmt(value));
}

function fmtTime(ms) {
  if (!ms || ms <= 0) return "\u2014";
  const minutes = Math.floor(ms / 60000);
  const seconds = Math.floor((ms % 60000) / 1000);
  const millis = ms % 1000;
  return `${minutes}:${String(seconds).padStart(2, "0")}.${String(millis).padStart(3, "0")}`;
}

function relTime(iso) {
  if (!iso) return "\u2014";
  const diffMs = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diffMs / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  return new Date(iso).toLocaleDateString();
}

function fetchJson(url) {
  return fetch(alteredUrl(url), { cache: "no-store" }).then((res) => {
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return res.json();
  });
}

async function fetchPagedCollection(baseUrl, key, { limit = 250, maxPages = 20, params = {} } = {}) {
  const out = [];
  let offset = 0;

  for (let page = 0; page < maxPages; page += 1) {
    const query = new URLSearchParams({
      limit: String(limit),
      offset: String(offset),
    });
    Object.entries(params || {}).forEach(([paramKey, value]) => {
      if (value === undefined || value === null || value === "") return;
      query.set(paramKey, String(value));
    });
    const payload = await fetchJson(`${baseUrl}?${query.toString()}`);
    const rows = Array.isArray(payload?.[key]) ? payload[key] : [];
    out.push(...rows);
    if (!payload?.paging?.has_more) break;
    const nextOffset = Number(payload?.paging?.next_offset || 0);
    if (!nextOffset || nextOffset <= offset) break;
    offset = nextOffset;
  }

  return out;
}

function readUrlState() {
  const params = new URLSearchParams(window.location.search);
  return {
    alteration: params.get("alteration") || "",
    campaign: params.get("campaign") || "",
    map: params.get("map") || "",
  };
}

function writeUrl({ alteration = "", campaign = "", map = "" } = {}, replace = false) {
  const params = new URLSearchParams();
  if (alteration) params.set("alteration", alteration);
  if (campaign) params.set("campaign", campaign);
  if (map) params.set("map", map);
  const target = params.toString() ? `?${params.toString()}` : window.location.pathname;
  const method = replace ? "replaceState" : "pushState";
  history[method]({ alteration, campaign, map }, "", target);
}

function normalizeAlteration(item) {
  return {
    id: Number(item?.id || 0) || null,
    name: String(item?.name || "").trim(),
    slug: String(item?.slug || "").trim(),
    campaign_count: Number(item?.campaign_count || 0),
    map_count: Number(item?.map_count || 0),
  };
}

function getCampaignKey(campaign) {
  return String(campaign?.id || campaign?.campaign_external_id || campaign?.campaign_db_id || "");
}

function getAlterationBySlug(slug) {
  return state.alterations.find((item) => item.slug === slug) || null;
}

function getCampaignById(campaignId) {
  return state.campaigns.find((item) => getCampaignKey(item) === String(campaignId || "")) || null;
}

function getCampaignTimelineInfo(campaign) {
  const seasonKey = String(campaign?.season_key || "").trim().toLowerCase();
  if (DISCOVERY_TIMELINE[seasonKey]) {
    const special = DISCOVERY_TIMELINE[seasonKey];
    return {
      season: special.season,
      year: special.year,
      slot: Number(TIMELINE_SEASON_ORDER[special.season] || 0) + Number(special.offset || 0),
      value: special.year * 10 + Number(TIMELINE_SEASON_ORDER[special.season] || 0) + Number(special.offset || 0),
    };
  }

  const season = String(campaign?.season || "").trim().toLowerCase();
  const seasonYear = Number(campaign?.season_year || 0) || 0;
  if (TIMELINE_SEASON_ORDER[season] && seasonYear) {
    return {
      season,
      year: seasonYear,
      slot: TIMELINE_SEASON_ORDER[season],
      value: seasonYear * 10 + TIMELINE_SEASON_ORDER[season],
    };
  }

  const nameYear = Number(String(campaign?.name || "").match(/\b(20\d{2})\b/)?.[1] || 0) || 0;
  if (TIMELINE_SEASON_ORDER[season] && nameYear) {
    return {
      season,
      year: nameYear,
      slot: TIMELINE_SEASON_ORDER[season],
      value: nameYear * 10 + TIMELINE_SEASON_ORDER[season],
    };
  }

  return {
    season,
    year: seasonYear || nameYear || null,
    slot: null,
    value: null,
  };
}

function compareCampaignTimeline(left, right) {
  const leftTimeline = getCampaignTimelineInfo(left);
  const rightTimeline = getCampaignTimelineInfo(right);
  if (Number.isFinite(leftTimeline.value) && Number.isFinite(rightTimeline.value)) {
    const diff = rightTimeline.value - leftTimeline.value;
    if (diff !== 0) return diff;
  } else if (Number.isFinite(leftTimeline.value)) {
    return -1;
  } else if (Number.isFinite(rightTimeline.value)) {
    return 1;
  }

  const timestampDiff = Number(right?.sort_timestamp_ms || 0) - Number(left?.sort_timestamp_ms || 0);
  if (timestampDiff !== 0) return timestampDiff;
  return String(right?.id || "").localeCompare(String(left?.id || ""), undefined, {
    numeric: true,
    sensitivity: "base",
  });
}

function getAlterationCampaigns(slug) {
  return state.campaigns
    .filter((campaign) =>
      Array.isArray(campaign?.alterations) &&
      campaign.alterations.some((item) => item?.slug === slug)
    )
    .sort(compareCampaignTimeline);
}

function getAlterationStats(slug) {
  const campaigns = getAlterationCampaigns(slug);
  const alterationMaps = state.alterationMaps.get(String(slug || "")) || [];
  return {
    campaignCount: campaigns.length,
    mapCount: alterationMaps.length || campaigns.reduce((sum, campaign) => sum + Number(campaign?.map_count || 0), 0),
    trackedCount: alterationMaps.length
      ? alterationMaps.filter((map) => map?.tracking_status === "active" || map?.tracking_status === "live").length
      : campaigns.reduce((sum, campaign) => sum + Number(campaign?.map_count || 0), 0),
    wrChangeCount: alterationMaps.reduce((sum, map) => sum + Number(map?.change_count || 0), 0),
    latestSeason:
      campaigns.find((campaign) => campaign?.season_label)?.season_label ||
      campaigns[0]?.name ||
      "\u2014",
  };
}

function setStatValue(id, value) {
  const element = document.getElementById(id);
  if (element) element.textContent = value ?? "\u2014";
}

function renderStats() {
  if (state.activeAlterationSlug) {
    const stats = getAlterationStats(state.activeAlterationSlug);
    setStatValue("stat-alterations", 1);
    setStatValue("stat-campaigns", stats.campaignCount || "\u2014");
    setStatValue("stat-maps", stats.mapCount || "\u2014");
    setStatValue("stat-tracked", stats.trackedCount || "\u2014");
    setStatValue("stat-wr-changes", stats.wrChangeCount || 0);
    return;
  }

  setStatValue("stat-alterations", state.alterations.length || "\u2014");
  setStatValue("stat-campaigns", state.campaigns.length || "\u2014");
  setStatValue("stat-maps", state.stats?.total_maps || "\u2014");
  setStatValue("stat-tracked", state.stats?.actively_tracked || "\u2014");
  setStatValue("stat-wr-changes", state.stats?.total_wr_changes || "\u2014");
}

function mapCardHtml(map) {
  const tracking = map.tracking_status || "idle";
  const trackingClass =
    tracking === "active" || tracking === "live" ? "active" : tracking === "paused" ? "paused" : "idle";
  const thumb = map.thumbnail_url
    ? `<img src="${esc(map.thumbnail_url)}" alt="" loading="lazy" />`
    : "";
  const wrBlock = map.wr_ms
    ? `<span class="wr-time">${fmtTime(map.wr_ms)}</span><span class="wr-holder">${escN(map.wr_holder)}</span>`
    : `<span class="wr-empty">No WR data</span>`;
  const metaBits = [
    map.map_number ? `#${map.map_number}` : "",
    map.change_count ? `${map.change_count} WR changes` : "",
  ].filter(Boolean);

  return `
    <article class="map-card" data-uid="${esc(map.map_uid)}">
      <div class="map-thumb">
        ${thumb}
        <span class="map-status map-status-${trackingClass}">${esc(tracking)}</span>
      </div>
      <div class="map-body">
        <h3 class="map-name" title="${escN(map.name)}">${escN(map.name || "Untitled")}</h3>
        <p class="map-author">by ${escN(map.author || "Unknown")}</p>
        <div class="map-wr">${wrBlock}</div>
        <div class="map-medals">
          <span class="medal medal-at">${fmtTime(map.author_time)}</span>
          <span class="medal medal-gold">${fmtTime(map.gold_time)}</span>
          <span class="medal medal-silver">${fmtTime(map.silver_time)}</span>
          <span class="medal medal-bronze">${fmtTime(map.bronze_time)}</span>
        </div>
        ${
          metaBits.length
            ? `<div class="map-card-meta">${metaBits.map((bit) => `<span>${esc(bit)}</span>`).join("")}</div>`
            : ""
        }
      </div>
    </article>
  `;
}

function getActiveCampaignMaps() {
  const campaignId = String(state.activeCampaignId || "");
  return state.campaignMaps.get(campaignId) || [];
}

function filterAndSortCampaignMaps(maps) {
  let out = [...maps];
  const query = state.mapSearch.trim().toLowerCase();
  if (query) {
    out = out.filter((map) => {
      const haystack = [
        map.name,
        map.author,
        map.wr_holder,
        map.map_uid,
        map.campaign_name,
      ]
        .map((value) => String(value || "").toLowerCase())
        .join(" ");
      return haystack.includes(query);
    });
  }

  out.sort((left, right) => {
    if (state.mapSort === "wr_ms") {
      return (left.wr_ms || Number.MAX_SAFE_INTEGER) - (right.wr_ms || Number.MAX_SAFE_INTEGER);
    }
    if (state.mapSort === "author_time") {
      return (left.author_time || Number.MAX_SAFE_INTEGER) - (right.author_time || Number.MAX_SAFE_INTEGER);
    }
    if (state.mapSort === "wr_updated_at") {
      return new Date(right.wr_updated_at || 0) - new Date(left.wr_updated_at || 0);
    }
    if (state.mapSort === "change_count") {
      return Number(right.change_count || 0) - Number(left.change_count || 0);
    }
    return String(left.name || "").localeCompare(String(right.name || ""), undefined, {
      numeric: true,
      sensitivity: "base",
    });
  });

  return out;
}

function renderAlterationOverview() {
  state.activeAlterationSlug = "";
  state.activeCampaignId = "";
  state.mapSearch = "";
  if ($searchInput) $searchInput.value = "";
  if ($controlsBar) $controlsBar.hidden = true;
  renderStats();

  const query = state.alterationSearch.trim().toLowerCase();
  const visibleAlterations = state.alterations.filter((alteration) => {
    if (!query) return true;
    const stats = getAlterationStats(alteration.slug);
    const haystack = [alteration.name, stats.latestSeason]
      .map((value) => String(value || "").toLowerCase())
      .join(" ");
    return haystack.includes(query);
  });

  if (!visibleAlterations.length) {
    $container.innerHTML = `
      <div class="alteration-toolbar">
        <label class="alteration-search-wrap">
          <span class="alteration-search-label">Find an alteration</span>
          <input class="alteration-search-input" id="alteration-search" type="search" placeholder="Search alteration names..." value="${esc(state.alterationSearch)}" />
        </label>
      </div>
    `;
    $empty.hidden = false;
    return;
  }

  $empty.hidden = true;
  $container.innerHTML = `
    <div class="alteration-toolbar">
      <label class="alteration-search-wrap">
        <span class="alteration-search-label">Find an alteration</span>
        <input class="alteration-search-input" id="alteration-search" type="search" placeholder="Search alteration names..." value="${esc(state.alterationSearch)}" />
      </label>
      <p class="alteration-toolbar-meta">${visibleAlterations.length} alterations with mapped campaigns</p>
    </div>
    <section class="alteration-grid" aria-label="Alteration catalog">
      ${visibleAlterations
        .map((alteration) => {
          const stats = getAlterationStats(alteration.slug);
          return `
            <button class="alteration-card" type="button" data-slug="${esc(alteration.slug)}">
              <span class="alteration-card-kicker">Alteration</span>
              <h2 class="alteration-card-title">${esc(alteration.name)}</h2>
              <p class="alteration-card-sub">Latest season: ${esc(stats.latestSeason)}</p>
              <div class="alteration-card-stats">
                <span><strong>${stats.campaignCount}</strong> campaigns</span>
                <span><strong>${stats.mapCount}</strong> maps</span>
              </div>
            </button>
          `;
        })
        .join("")}
    </section>
  `;

  const search = document.getElementById("alteration-search");
  if (search) {
    search.addEventListener("input", (event) => {
      state.alterationSearch = event.target.value || "";
      renderAlterationOverview();
    });
  }

  $container.querySelectorAll(".alteration-card").forEach((card) => {
    card.addEventListener("click", () => {
      state.activeAlterationSlug = card.dataset.slug || "";
      writeUrl({ alteration: state.activeAlterationSlug }, false);
      renderCurrentView();
    });
  });
}

async function ensureAlterationMaps(slug) {
  const key = String(slug || "").trim();
  if (!key || state.alterationMaps.has(key)) return;
  const maps = await fetchPagedCollection(API.maps, "maps", {
    limit: 250,
    maxPages: 20,
    params: {
      alteration: key,
      sort: "change_count",
    },
  });
  state.alterationMaps.set(key, maps);
}

async function renderAlterationDetail() {
  const alteration = getAlterationBySlug(state.activeAlterationSlug);
  if (!alteration) {
    renderAlterationOverview();
    return;
  }

  state.activeCampaignId = "";
  state.mapSearch = "";
  if ($searchInput) $searchInput.value = "";
  if ($controlsBar) $controlsBar.hidden = true;

  if (!state.alterationMaps.has(state.activeAlterationSlug)) {
    $container.innerHTML = '<div class="state-msg"><p>Loading alteration campaigns...</p></div>';
    try {
      await ensureAlterationMaps(state.activeAlterationSlug);
    } catch (_error) {
      $container.innerHTML = '<div class="state-msg"><p>Could not load alteration data.</p></div>';
      return;
    }
  }

  const campaigns = getAlterationCampaigns(alteration.slug);
  const stats = getAlterationStats(alteration.slug);
  renderStats();

  $empty.hidden = campaigns.length > 0;
  $container.innerHTML = `
    <button class="back-link" id="alteration-back" type="button">
      <span aria-hidden="true">&larr;</span> All Alterations
    </button>
    <section class="alteration-spotlight">
      <div>
        <span class="alteration-spotlight-kicker">Alteration Type</span>
        <h2 class="alteration-spotlight-title">${esc(alteration.name)}</h2>
        <p class="alteration-spotlight-sub">Campaigns using this alteration, ordered from newest season to oldest.</p>
      </div>
      <div class="alteration-spotlight-stats">
        <span><strong>${stats.campaignCount}</strong> campaigns</span>
        <span><strong>${stats.mapCount}</strong> maps</span>
      </div>
    </section>
    ${
      campaigns.length
        ? `
          <section class="campaign-grid" aria-label="Campaigns for ${esc(alteration.name)}">
            ${campaigns
              .map((campaign) => {
                const thumb = campaign.thumbnail_url
                  ? `<div class="campaign-card-thumb"><img src="${esc(campaign.thumbnail_url)}" alt="" loading="lazy" /></div>`
                  : '<div class="campaign-card-thumb"></div>';
                return `
                  <button class="campaign-card campaign-card-season" type="button" data-campaign="${esc(getCampaignKey(campaign))}">
                    ${thumb}
                    <div class="campaign-card-body">
                      <span class="campaign-card-name">${esc(campaign.season_label || campaign.name || "Unknown season")}</span>
                      <span class="campaign-card-count">${Number(campaign.map_count || 0)} maps</span>
                    </div>
                    <span class="campaign-card-meta">${esc(campaign.name || "")}</span>
                    <span class="campaign-card-arrow">&rarr;</span>
                  </button>
                `;
              })
              .join("")}
          </section>
        `
        : ""
    }
  `;

  document.getElementById("alteration-back")?.addEventListener("click", () => {
    state.activeAlterationSlug = "";
    writeUrl({}, false);
    renderCurrentView();
  });

  $container.querySelectorAll(".campaign-card").forEach((card) => {
    card.addEventListener("click", async () => {
      state.activeCampaignId = card.dataset.campaign || "";
      writeUrl(
        {
          alteration: state.activeAlterationSlug,
          campaign: state.activeCampaignId,
        },
        false
      );
      await renderCurrentView();
    });
  });
}

async function ensureCampaignMaps(campaignId) {
  const key = String(campaignId || "");
  if (!key || state.campaignMaps.has(key)) return;
  const maps = await fetchPagedCollection(API.maps, "maps", {
    limit: 250,
    maxPages: 12,
    params: {
      campaignIds: key,
      sort: "name",
    },
  });
  state.campaignMaps.set(key, maps);
}

function renderCampaignMaps(campaign) {
  const alteration = getAlterationBySlug(state.activeAlterationSlug);
  const maps = filterAndSortCampaignMaps(getActiveCampaignMaps());
  $empty.hidden = maps.length > 0;

  $container.innerHTML = `
    <button class="back-link" id="campaign-back" type="button">
      <span aria-hidden="true">&larr;</span> ${esc(alteration?.name || "Alteration")}
    </button>
    <section class="alteration-spotlight">
      <div>
        <span class="alteration-spotlight-kicker">${esc(alteration?.name || "Alteration")}</span>
        <h2 class="alteration-spotlight-title">${esc(campaign?.name || "Campaign")}</h2>
        <p class="alteration-spotlight-sub">${esc(campaign?.season_label || campaign?.name || "")}</p>
      </div>
      <div class="alteration-spotlight-stats">
        <span><strong>${Number(campaign?.map_count || maps.length || 0)}</strong> maps</span>
        <span><strong>${maps.reduce((sum, map) => sum + Number(map?.change_count || 0), 0)}</strong> WR changes</span>
      </div>
    </section>
    ${
      maps.length
        ? `<section class="campaign-maps-grid" id="campaign-maps-grid" aria-label="Maps">${maps
            .map((map) => mapCardHtml(map))
            .join("")}</section>`
        : `<div class="state-msg"><p>${state.mapSearch ? "No maps match your search." : "No maps in this campaign yet."}</p></div>`
    }
  `;

  document.getElementById("campaign-back")?.addEventListener("click", () => {
    state.activeCampaignId = "";
    writeUrl({ alteration: state.activeAlterationSlug }, false);
    renderCurrentView();
  });

  document.getElementById("campaign-maps-grid")?.addEventListener("click", (event) => {
    const card = event.target.closest(".map-card");
    if (!card) return;
    openMapModal(card.dataset.uid || "");
  });
}

async function renderCampaignDetail() {
  const campaign = getCampaignById(state.activeCampaignId);
  if (!campaign) {
    state.activeCampaignId = "";
    renderCurrentView();
    return;
  }

  try {
    await ensureAlterationMaps(state.activeAlterationSlug);
  } catch (_error) {
    // Per-campaign data can still load even if the alteration-wide fetch failed.
  }
  renderStats();

  if ($controlsBar) $controlsBar.hidden = false;
  $container.innerHTML = '<div class="state-msg"><p>Loading maps...</p></div>';

  try {
    await ensureCampaignMaps(getCampaignKey(campaign));
    renderCampaignMaps(campaign);
  } catch (_error) {
    $container.innerHTML = '<div class="state-msg"><p>Could not load maps for this campaign.</p></div>';
  }
}

function openMapModal(mapUid, updateUrl = true) {
  if (!mapUid) return;
  const map = getActiveCampaignMaps().find((item) => item.map_uid === mapUid);
  if (!map || !$modalContent) return;

  const tracking = map.tracking_status || "idle";
  const trackingClass =
    tracking === "active" || tracking === "live" ? "active" : tracking === "paused" ? "paused" : "idle";
  const thumb = map.thumbnail_url
    ? `<img class="modal-thumb" src="${esc(map.thumbnail_url)}" alt="" />`
    : '<div class="modal-thumb modal-thumb-empty"></div>';
  const wrSection = map.wr_ms
    ? `
      <div class="modal-wr">
        <div class="modal-wr-row">
          <span class="modal-wr-rank">1</span>
          <div class="modal-wr-detail">
            <span class="modal-wr-holder">${escN(map.wr_holder)}</span>
            <span class="modal-wr-ago">${relTime(map.wr_updated_at)}</span>
          </div>
          <span class="modal-wr-time">${fmtTime(map.wr_ms)}</span>
        </div>
      </div>
    `
    : '<div class="modal-wr modal-wr-empty"><span>No WR data recorded yet</span></div>';

  $modalContent.innerHTML = `
    <div class="modal-hero">
      ${thumb}
      <div class="modal-info">
        <h2 class="modal-name">${escN(map.name || "Untitled")}</h2>
        <p class="modal-author">by ${escN(map.author || "Unknown")}</p>
        <div class="modal-tags">
          ${map.campaign_name ? `<span class="modal-campaign">${escN(map.campaign_name)}</span>` : ""}
          ${map.season_label ? `<span class="modal-campaign">${esc(map.season_label)}</span>` : ""}
          <span class="map-status map-status-${trackingClass}" style="position:static">${esc(tracking)}</span>
        </div>
      </div>
    </div>

    <div class="modal-medals">
      <div class="modal-medal modal-medal-at"><span class="modal-medal-label">Author</span><span class="modal-medal-time">${fmtTime(map.author_time)}</span></div>
      <div class="modal-medal modal-medal-gold"><span class="modal-medal-label">Gold</span><span class="modal-medal-time">${fmtTime(map.gold_time)}</span></div>
      <div class="modal-medal modal-medal-silver"><span class="modal-medal-label">Silver</span><span class="modal-medal-time">${fmtTime(map.silver_time)}</span></div>
      <div class="modal-medal modal-medal-bronze"><span class="modal-medal-label">Bronze</span><span class="modal-medal-time">${fmtTime(map.bronze_time)}</span></div>
    </div>

    <div class="modal-section">
      <h3 class="modal-section-title">World Record</h3>
      ${wrSection}
    </div>

    <div class="modal-section">
      <h3 class="modal-section-title">Map Meta</h3>
      <div class="modal-stats">
        <div class="modal-stat"><span class="modal-stat-value">${map.map_number || "\u2014"}</span><span class="modal-stat-label">Map #</span></div>
        <div class="modal-stat"><span class="modal-stat-value">${map.change_count ?? 0}</span><span class="modal-stat-label">WR Changes</span></div>
      </div>
    </div>

    <div class="modal-uid"><span>UID:</span> ${esc(map.map_uid)}</div>
  `;

  $modalBackdrop.hidden = false;
  document.body.style.overflow = "hidden";

  if (updateUrl) {
    writeUrl(
      {
        alteration: state.activeAlterationSlug,
        campaign: state.activeCampaignId,
        map: mapUid,
      },
      false
    );
  }
}

function closeMapModal(updateUrl = true) {
  if ($modalBackdrop) $modalBackdrop.hidden = true;
  document.body.style.overflow = "";
  if (updateUrl) {
    writeUrl(
      {
        alteration: state.activeAlterationSlug,
        campaign: state.activeCampaignId,
      },
      false
    );
  }
}

async function openMapModalByUid(mapUid) {
  const existing = getActiveCampaignMaps().find((item) => item.map_uid === mapUid);
  if (existing) {
    openMapModal(mapUid, false);
    return;
  }

  try {
    const payload = await fetchJson(`${API.mapDetail}/${encodeURIComponent(mapUid)}`);
    const map = payload?.map;
    if (!map || !$modalContent) return;
    $modalContent.innerHTML = `
      <div class="modal-hero">
        ${map.thumbnailUrl ? `<img class="modal-thumb" src="${esc(map.thumbnailUrl)}" alt="" />` : '<div class="modal-thumb modal-thumb-empty"></div>'}
        <div class="modal-info">
          <h2 class="modal-name">${escN(map.name || "Untitled")}</h2>
          <p class="modal-author">by ${escN(map.author || "Unknown")}</p>
          <div class="modal-tags">
            ${map.campaignName ? `<span class="modal-campaign">${escN(map.campaignName)}</span>` : ""}
          </div>
        </div>
      </div>
      <div class="modal-section">
        <h3 class="modal-section-title">World Record</h3>
        ${
          map.wrMs
            ? `<div class="modal-wr"><div class="modal-wr-row"><span class="modal-wr-rank">1</span><div class="modal-wr-detail"><span class="modal-wr-holder">${escN(map.wrHolder)}</span><span class="modal-wr-ago">${relTime(map.wrUpdatedAt)}</span></div><span class="modal-wr-time">${fmtTime(map.wrMs)}</span></div></div>`
            : '<div class="modal-wr modal-wr-empty"><span>No WR data recorded yet</span></div>'
        }
      </div>
      <div class="modal-uid"><span>UID:</span> ${esc(map.mapUid)}</div>
    `;
    $modalBackdrop.hidden = false;
    document.body.style.overflow = "hidden";
  } catch (_error) {
    // Ignore direct-link failures.
  }
}

async function renderCurrentView() {
  if (state.activeCampaignId) {
    await renderCampaignDetail();
    return;
  }
  if (state.activeAlterationSlug) {
    await renderAlterationDetail();
    return;
  }
  renderAlterationOverview();
}

async function bootstrap() {
  $loading.hidden = false;
  $error.hidden = true;
  $empty.hidden = true;

  try {
    const [statsPayload, alterationsPayload, campaignsPayload] = await Promise.all([
      fetchJson(API.stats),
      fetchJson(API.alterations),
      fetchJson(`${API.campaigns}?limit=2000&offset=0&catalog_only=1&linked_only=1`),
    ]);

    state.stats = statsPayload || null;
    state.alterations = (Array.isArray(alterationsPayload?.alterations) ? alterationsPayload.alterations : [])
      .map(normalizeAlteration)
      .filter((item) => item.slug);
    state.campaigns = Array.isArray(campaignsPayload?.campaigns) ? campaignsPayload.campaigns : [];

    renderStats();
    $loading.hidden = true;

    const urlState = readUrlState();
    if (urlState.campaign) {
      const campaign = getCampaignById(urlState.campaign);
      state.activeCampaignId = campaign ? getCampaignKey(campaign) : "";
      if (campaign) {
        state.activeAlterationSlug =
          urlState.alteration ||
          campaign?.primary_alteration?.slug ||
          campaign?.alterations?.[0]?.slug ||
          "";
      }
    } else if (urlState.alteration) {
      state.activeAlterationSlug = urlState.alteration;
    }

    await renderCurrentView();

    if (urlState.map) {
      await openMapModalByUid(urlState.map);
    }
  } catch (_error) {
    $loading.hidden = true;
    $error.hidden = false;
  }
}

$searchInput?.addEventListener("input", (event) => {
  state.mapSearch = event.target.value || "";
  if (state.activeCampaignId) renderCampaignMaps(getCampaignById(state.activeCampaignId));
});

$sortSelect?.addEventListener("change", (event) => {
  state.mapSort = event.target.value || "name";
  if (state.activeCampaignId) renderCampaignMaps(getCampaignById(state.activeCampaignId));
});

$modalClose?.addEventListener("click", () => closeMapModal());
$modalBackdrop?.addEventListener("click", (event) => {
  if (event.target === $modalBackdrop) closeMapModal();
});

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && $modalBackdrop && !$modalBackdrop.hidden) {
    closeMapModal();
  }
});

window.addEventListener("popstate", async () => {
  const urlState = readUrlState();
  if (!urlState.map && $modalBackdrop && !$modalBackdrop.hidden) {
    closeMapModal(false);
  }

  state.activeAlterationSlug = urlState.alteration || "";
  state.activeCampaignId = urlState.campaign || "";
  await renderCurrentView();

  if (urlState.map) {
    await openMapModalByUid(urlState.map);
  }
});

bootstrap();
