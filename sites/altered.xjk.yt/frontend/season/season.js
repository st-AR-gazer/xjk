import "/shared/xjk-core/safe-html.js?v=2";
import { fetchJson } from "/shared/xjk-core/http.js";
import {
  collectPendingDisplayNameAccountIds as collectPendingAccountIds,
  createDisplayNameRefreshController,
} from "../shared/display-name-refresh.js?v=2";
import { esc, escN, fmtTime, stripFmt } from "../shared/formatters.js?v=2";
import { fetchPagedCollection } from "../shared/paged-collection.js?v=2";

(() => {
  const alteredUrl = window.__alteredUrl || ((value) => value);
  const alteredPrefix = window.__alteredLocalPrefix || "";
  const currentPathname =
    alteredPrefix && window.location.pathname.startsWith(`${alteredPrefix}/`)
      ? window.location.pathname.slice(alteredPrefix.length) || "/"
      : window.location.pathname;
  const SEASON_BACKGROUNDS = {
    winter: alteredUrl("/bannerbuilder/assets/backgrounds/Winter.png"),
    spring: alteredUrl("/bannerbuilder/assets/backgrounds/Spring.png"),
    summer: alteredUrl("/bannerbuilder/assets/backgrounds/Summer.png"),
    fall: alteredUrl("/bannerbuilder/assets/backgrounds/Fall.png"),
  };
  const NONSTANDARD_SEASON_INFO = {
    training: { label: "Training", test: (n) => n.startsWith("training") },
    "snow-discovery": { label: "Snow Discovery", test: (n) => n.startsWith("snow") },
    "rally-discovery": { label: "Rally Discovery", test: (n) => n.startsWith("rally") },
    "desert-discovery": { label: "Desert Discovery", test: (n) => n.startsWith("desert") },
    "stunt-discovery": { label: "Stunt Discovery", test: (n) => n.startsWith("stunt") },
    "platform-discovery": { label: "Platform Discovery", test: (n) => n.startsWith("platform") },
  };
  function parseSeasonParam() {
    const params = new URLSearchParams(window.location.search);
    const pathMatch = currentPathname.match(/^\/season\/((winter|spring|summer|fall)-\d{4})\/?$/i);
    const raw = (params.get("s") || pathMatch?.[1] || "").trim().toLowerCase();
    if (!raw) return null;

    if (raw === "winter-2020") {
      window.location.replace(alteredUrl("/season/?s=training"));
      return { redirecting: true };
    }

    const nsInfo = NONSTANDARD_SEASON_INFO[raw];
    if (nsInfo) {
      return {
        key: raw,
        season: nsInfo.label,
        seasonLower: raw,
        year: null,
        label: nsInfo.label,
        nonstandard: true,
      };
    }

    const match = raw.match(/^(winter|spring|summer|fall)-(\d{4})$/);
    if (!match) return null;

    return {
      key: raw,
      season: match[1].charAt(0).toUpperCase() + match[1].slice(1),
      seasonLower: match[1],
      year: match[2],
      label: `${match[1].charAt(0).toUpperCase() + match[1].slice(1)} ${match[2]}`,
    };
  }
  const seasonInfo = parseSeasonParam();
  function slugify(name) {
    return (name || "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "");
  }
  function parseCampaignSlug() {
    const m = currentPathname.match(/^\/season\/([^/?#]+)/);
    return m ? decodeURIComponent(m[1]).toLowerCase() : "";
  }
  const campaignSlug = parseCampaignSlug();
  let allMaps = [];
  let allCampaigns = [];
  let matchedCampaigns = [];
  let searchQuery = "";
  let sortField = "campaign_slot";
  let mapsLoaded = false;
  const $heroBg = document.getElementById("season-hero-bg");
  const $badge = document.getElementById("season-badge");
  const $title = document.getElementById("season-title");
  const $sub = document.getElementById("season-sub");
  const $statCampaigns = document.getElementById("stat-campaigns");
  const $statMaps = document.getElementById("stat-maps");
  const $statTracked = document.getElementById("stat-tracked");
  const $statChanges = document.getElementById("stat-changes");
  const $container = document.getElementById("campaigns-container");
  const $searchInput = document.getElementById("map-search");
  const $sortSelect = document.getElementById("map-sort");
  const $loading = document.getElementById("loading-state");
  const $empty = document.getElementById("empty-state");
  const $error = document.getElementById("error-state");
  const $controlsBar = document.getElementById("controls-bar");
  const displayNameRefresh = createDisplayNameRefreshController({
    onRefresh: () => loadData({ silent: true, resetDisplayNameRefresh: false }),
  });

  function collectPendingDisplayNameAccountIds(maps = []) {
    return collectPendingAccountIds(maps, {
      accountKeys: ["wr_account_id", "wrAccountId", "wr_holder", "wrHolder"],
      displayKeys: ["wr_holder", "wrHolder"],
    });
  }

  function setupHero() {
    if (!seasonInfo) return;

    if (!seasonInfo.nonstandard) {
      const bg = SEASON_BACKGROUNDS[seasonInfo.seasonLower];
      if (bg) {
        $heroBg.src = bg;
        $heroBg.alt = seasonInfo.label;
      }
      $badge.textContent = `${seasonInfo.season} Season`;
    } else {
      $badge.textContent = seasonInfo.label;
    }

    $title.textContent = seasonInfo.label;
    $sub.textContent = `All campaigns and maps for ${seasonInfo.label}.`;
    document.title = `${seasonInfo.label} | altered.xjk.yt`;
  }
  function filterCampaignsBySeason(campaigns) {
    if (!seasonInfo) return [];

    if (seasonInfo.nonstandard) {
      const nsInfo = NONSTANDARD_SEASON_INFO[seasonInfo.key];
      if (!nsInfo) return [];
      return campaigns.filter((c) => nsInfo.test((c.name || "").toLowerCase()));
    }

    const seasonLower = seasonInfo.season.toLowerCase();
    const year = seasonInfo.year;

    return campaigns.filter((c) => {
      const name = (c.name || "").toLowerCase();
      const campaignYear = String(c.season_year || "").trim();
      if (campaignYear === year && (c.season || "").toLowerCase() === seasonLower) return true;
      if (name.includes(seasonLower) && name.includes(year)) return true;
      if ((c.season || "").toLowerCase() === seasonLower && name.includes(year)) return true;
      return false;
    });
  }
  function getMapsForCampaign(campaign) {
    const id = String(campaign.id ?? "");
    const name = campaign.name ?? "";

    return allMaps.filter((m) => {
      return String(m.campaign_id) === id || m.campaign_name === name;
    });
  }
  function getCampaignMapPosition(map) {
    const slot = Number(map?.slot || 0);
    if (Number.isFinite(slot) && slot > 0) return slot;

    const mapNumber = Number(map?.map_number || 0);
    if (Number.isFinite(mapNumber) && mapNumber > 0) return mapNumber;

    const mapNumbers = Array.isArray(map?.map_numbers) ? map.map_numbers : [];
    const firstMapNumber = Number(mapNumbers[0] || 0);
    return Number.isFinite(firstMapNumber) && firstMapNumber > 0 ? firstMapNumber : Infinity;
  }
  function filterAndSortMaps(maps) {
    let filtered = [...maps];

    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      filtered = filtered.filter(
        (m) =>
          (m.name || "").toLowerCase().includes(q) ||
          (m.author || "").toLowerCase().includes(q) ||
          (m.wr_holder || "").toLowerCase().includes(q)
      );
    }

    filtered.sort((a, b) => {
      switch (sortField) {
        case "campaign_slot":
          return (
            getCampaignMapPosition(a) - getCampaignMapPosition(b) ||
            (a.name || "").localeCompare(b.name || "") ||
            String(a.map_uid || "").localeCompare(String(b.map_uid || ""))
          );
        case "wr_ms":
          return (a.wr_ms || Infinity) - (b.wr_ms || Infinity);
        case "author_time":
          return (a.author_time || Infinity) - (b.author_time || Infinity);
        case "wr_updated_at":
          return new Date(b.wr_updated_at || 0) - new Date(a.wr_updated_at || 0);
        case "change_count":
          return (b.change_count || 0) - (a.change_count || 0);
        default:
          return (a.name || "").localeCompare(b.name || "");
      }
    });

    return filtered;
  }
  function mapCardHtml(m) {
    const st = m.tracking_status || "idle";
    const stClass = st === "active" || st === "live" ? "live" : st === "paused" ? "paused" : "idle";

    const thumb = m.thumbnail_url ? `<img src="${esc(m.thumbnail_url)}" alt="" loading="lazy" />` : "";

    const wrBlock = m.wr_ms
      ? `<span class="wr-time">${fmtTime(m.wr_ms)}</span>
       <span class="wr-holder">${escN(m.wr_holder)}</span>`
      : `<span class="wr-empty">No WR data</span>`;

    return `<article class="map-card">
    <div class="map-thumb">
      ${thumb}
      <span class="map-status map-status-${stClass}">${esc(st)}</span>
    </div>
    <div class="map-body">
      <h3 class="map-name" title="${escN(m.name)}">${escN(m.name || "Untitled")}</h3>
      <p class="map-author">by ${escN(m.author || "Unknown")}</p>
      <div class="map-wr">${wrBlock}</div>
      <div class="map-medals">
        <span class="medal medal-at" title="Author Time">${fmtTime(m.author_time)}</span>
        <span class="medal medal-gold" title="Gold">${fmtTime(m.gold_time)}</span>
        <span class="medal medal-silver" title="Silver">${fmtTime(m.silver_time)}</span>
        <span class="medal medal-bronze" title="Bronze">${fmtTime(m.bronze_time)}</span>
      </div>
    </div>
  </article>`;
  }
  function renderStats() {
    const totalMaps = mapsLoaded
      ? matchedCampaigns.reduce((sum, c) => sum + getMapsForCampaign(c).length, 0)
      : matchedCampaigns.reduce((sum, c) => sum + Number(c.map_count || 0), 0);
    let totalTracked = 0;
    let totalChanges = 0;

    if (mapsLoaded) {
      matchedCampaigns.forEach((c) => {
        const maps = getMapsForCampaign(c);
        totalTracked += maps.filter((m) => m.tracking_status === "active" || m.tracking_status === "live").length;
        totalChanges += maps.reduce((sum, m) => sum + (m.change_count || 0), 0);
      });
    }

    $statCampaigns.textContent = String(matchedCampaigns.length);
    $statMaps.textContent = String(totalMaps);
    $statTracked.textContent = mapsLoaded ? String(totalTracked) : "\u2014";
    $statChanges.textContent = mapsLoaded ? String(totalChanges) : "\u2014";
  }
  function renderCampaigns() {
    $container.replaceChildren();

    if (!matchedCampaigns.length) {
      $empty.hidden = false;
      return;
    }

    $empty.hidden = true;

    const grid = document.createElement("div");
    grid.className = "campaign-grid";

    matchedCampaigns.forEach((campaign) => {
      const slug = slugify(campaign.name);
      const mapCount = Number(campaign.map_count || 0);
      const thumb = campaign.thumbnail_url
        ? `<div class="campaign-card-thumb"><img src="${esc(campaign.thumbnail_url)}" alt="" loading="lazy" /></div>`
        : '<div class="campaign-card-thumb"></div>';

      const card = document.createElement("a");
      card.href = alteredUrl(`/season/${encodeURIComponent(slug)}/?s=${encodeURIComponent(seasonInfo.key)}`);
      card.className = "campaign-card";
      globalThis.XjkSafeHtml.set(
        card,
        `
      ${thumb}
      <div class="campaign-card-body">
        <span class="campaign-card-name">${escN(campaign.name)}</span>
        <span class="campaign-card-count">${mapCount}/25</span>
      </div>
      <span class="campaign-card-arrow">&rarr;</span>
    `
      );
      grid.appendChild(card);
    });

    $container.appendChild(grid);
  }

  let activeCampaign = null;

  function renderCampaignDetail() {
    if (!activeCampaign) return;
    $container.replaceChildren();

    const back = document.createElement("a");
    back.href = alteredUrl(`/season/?s=${encodeURIComponent(seasonInfo.key)}`);
    back.className = "back-link";
    globalThis.XjkSafeHtml.set(back, `&larr; ${esc(seasonInfo.label)}`);
    $container.appendChild(back);

    const heading = document.createElement("h2");
    heading.className = "campaign-detail-title";
    heading.textContent = stripFmt(activeCampaign.name);
    $container.appendChild(heading);

    if (!mapsLoaded) {
      const msg = document.createElement("p");
      msg.className = "state-msg";
      globalThis.XjkSafeHtml.set(msg, "Loading maps&hellip;");
      $container.appendChild(msg);
      return;
    }

    const maps = filterAndSortMaps(getMapsForCampaign(activeCampaign));
    if (!maps.length) {
      const msg = document.createElement("p");
      msg.className = "state-msg";
      msg.textContent = searchQuery ? "No maps match your search." : "No maps in this campaign.";
      $container.appendChild(msg);
      return;
    }

    const mapGrid = document.createElement("div");
    mapGrid.className = "campaign-maps-grid";
    globalThis.XjkSafeHtml.set(mapGrid, maps.map(mapCardHtml).join(""));
    $container.appendChild(mapGrid);
  }
  function onFilterChange() {
    if (campaignSlug) {
      renderCampaignDetail();
    } else {
      renderCampaigns();
    }
  }
  async function loadData({ silent = false, resetDisplayNameRefresh = true } = {}) {
    if (resetDisplayNameRefresh) {
      displayNameRefresh.clear();
    }
    if (!silent) {
      $loading.hidden = false;
      $container.replaceChildren();
      $empty.hidden = true;
      $error.hidden = true;
    }

    let campaigns = [];
    try {
      campaigns = await fetchPagedCollection(alteredUrl("/api/v1/alterations/campaigns"), "campaigns", {
        fetchPage: fetchJson,
        limit: 500,
        maxPages: 50,
        params: { catalog_only: 1 },
      });
    } catch {
      if (!silent) {
        $loading.hidden = true;
        $error.hidden = false;
      }
      return;
    }

    allCampaigns = campaigns || [];
    matchedCampaigns = filterCampaignsBySeason(allCampaigns);

    if (!silent) {
      $loading.hidden = true;
    }

    if (!matchedCampaigns.length) {
      $empty.hidden = false;
      renderStats();
      return;
    }

    if (campaignSlug) {
      activeCampaign = matchedCampaigns.find((c) => slugify(c.name) === campaignSlug);
      if (!activeCampaign) {
        renderStats();
        renderCampaigns();
        return;
      }
      document.title = `${stripFmt(activeCampaign.name)} | ${seasonInfo.label} | altered.xjk.yt`;
      if ($controlsBar) $controlsBar.hidden = false;
      allMaps = [];
      mapsLoaded = false;
      renderStats();
      renderCampaignDetail();

      try {
        const id = String(activeCampaign.id || "").trim();
        allMaps = await fetchPagedCollection(alteredUrl("/api/v1/alterations/maps"), "maps", {
          fetchPage: fetchJson,
          limit: 1200,
          maxPages: 25,
          params: id ? { campaignIds: id, sort: "campaign_slot" } : { sort: "campaign_slot" },
        });
        mapsLoaded = true;
        renderStats();
        renderCampaignDetail();
        displayNameRefresh.schedule(collectPendingDisplayNameAccountIds(allMaps));
      } catch {
        mapsLoaded = false;
      }
    } else {
      if ($controlsBar) $controlsBar.hidden = true;
      renderStats();
      renderCampaigns();
    }
  }
  $searchInput.addEventListener("input", (e) => {
    searchQuery = e.target.value;
    onFilterChange();
  });

  $sortSelect.addEventListener("change", (e) => {
    sortField = e.target.value;
    onFilterChange();
  });
  if (seasonInfo?.redirecting) {
    /* page is navigating away */
  } else if (!seasonInfo) {
    window.location.replace(alteredUrl("/alterations/"));
  } else {
    setupHero();
    loadData();
  }
})();
