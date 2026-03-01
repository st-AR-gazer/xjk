const SEASON_BACKGROUNDS = {
  winter: "/bannerbuilder/assets/backgrounds/Winter.png",
  spring: "/bannerbuilder/assets/backgrounds/Spring.png",
  summer: "/bannerbuilder/assets/backgrounds/Summer.png",
  fall:   "/bannerbuilder/assets/backgrounds/Fall.png",
};
function parseSeasonParam() {
  const params = new URLSearchParams(window.location.search);
  const raw = (params.get("s") || "").trim().toLowerCase();
  if (!raw) return null;
  const match = raw.match(/^(winter|spring|summer|fall)-(\d{4})$/);
  if (!match) return null;

  return {
    key: raw,
    season: match[1].charAt(0).toUpperCase() + match[1].slice(1), // "Winter"
    seasonLower: match[1], // "winter"
    year: match[2], // "2026"
    label: `${match[1].charAt(0).toUpperCase() + match[1].slice(1)} ${match[2]}`, // "Winter 2026"
  };
}
const seasonInfo = parseSeasonParam();
let allMaps = [];
let allCampaigns = [];
let matchedCampaigns = [];
let searchQuery = "";
let sortField = "name";
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
function fmtTime(ms) {
  if (!ms || ms <= 0) return "\u2014";
  const m = Math.floor(ms / 60000);
  const s = Math.floor((ms % 60000) / 1000);
  const f = ms % 1000;
  return `${m}:${String(s).padStart(2, "0")}.${String(f).padStart(3, "0")}`;
}

function esc(str) {
  if (!str) return "";
  const el = document.createElement("span");
  el.textContent = str;
  return el.innerHTML;
}

async function fetchJson(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}
function setupHero() {
  if (!seasonInfo) return;

  const bg = SEASON_BACKGROUNDS[seasonInfo.seasonLower];
  if (bg) {
    $heroBg.src = bg;
    $heroBg.alt = seasonInfo.label;
  }

  $badge.textContent = `${seasonInfo.season} Season`;
  $title.textContent = seasonInfo.label;
  $sub.textContent = `All campaigns and maps for ${seasonInfo.label}.`;
  document.title = `${seasonInfo.label} | altered.xjk.yt`;
}
function filterCampaignsBySeason(campaigns) {
  if (!seasonInfo) return [];

  const seasonLower = seasonInfo.season.toLowerCase();
  const year = seasonInfo.year;

  return campaigns.filter((c) => {
    const name = (c.name || "").toLowerCase();
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

  const thumb = m.thumbnail_url
    ? `<img src="${esc(m.thumbnail_url)}" alt="" loading="lazy" />`
    : "";

  const wrBlock = m.wr_ms
    ? `<span class="wr-time">${fmtTime(m.wr_ms)}</span>
       <span class="wr-holder">${esc(m.wr_holder)}</span>`
    : `<span class="wr-empty">No WR data</span>`;

  return `<article class="map-card">
    <div class="map-thumb">
      ${thumb}
      <span class="map-status map-status-${stClass}">${esc(st)}</span>
    </div>
    <div class="map-body">
      <h3 class="map-name" title="${esc(m.name)}">${esc(m.name || "Untitled")}</h3>
      <p class="map-author">by ${esc(m.author || "Unknown")}</p>
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
  let totalMaps = 0;
  let totalTracked = 0;
  let totalChanges = 0;

  matchedCampaigns.forEach((c) => {
    const maps = getMapsForCampaign(c);
    totalMaps += maps.length;
    totalTracked += maps.filter((m) => m.tracking_status === "active" || m.tracking_status === "live").length;
    totalChanges += maps.reduce((sum, m) => sum + (m.change_count || 0), 0);
  });

  $statCampaigns.textContent = String(matchedCampaigns.length);
  $statMaps.textContent = String(totalMaps);
  $statTracked.textContent = String(totalTracked);
  $statChanges.textContent = String(totalChanges);
}
function renderCampaigns() {
  $container.innerHTML = "";

  if (!matchedCampaigns.length) {
    $empty.hidden = false;
    return;
  }

  $empty.hidden = true;

  matchedCampaigns.forEach((campaign, idx) => {
    const maps = filterAndSortMaps(getMapsForCampaign(campaign));
    const section = document.createElement("section");
    section.className = `campaign-section${idx === 0 ? " is-open" : ""}`;

    const header = document.createElement("div");
    header.className = "campaign-header";
    header.innerHTML = `
      <div class="campaign-header-left">
        <span class="campaign-toggle">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M9 18l6-6-6-6"/>
          </svg>
        </span>
        <span class="campaign-name">${esc(campaign.name)}</span>
      </div>
      <span class="campaign-map-count">${maps.length} maps</span>
    `;

    header.addEventListener("click", () => {
      section.classList.toggle("is-open");
    });

    const grid = document.createElement("div");
    grid.className = "campaign-maps";

    if (maps.length) {
      grid.innerHTML = maps.map(mapCardHtml).join("");
    } else {
      grid.innerHTML = '<p style="color:var(--ink-muted);padding:1rem;text-align:center;">No maps match the current search.</p>';
    }

    section.appendChild(header);
    section.appendChild(grid);
    $container.appendChild(section);
  });
}
function onFilterChange() {
  renderCampaigns();
}
async function loadData() {
  $loading.hidden = false;
  $container.innerHTML = "";
  $empty.hidden = true;
  $error.hidden = true;

  const [campaignsRes, mapsRes] = await Promise.allSettled([
    fetchJson("/api/v1/alterations/campaigns"),
    fetchJson("/api/v1/alterations/maps"),
  ]);

  const anySuccess =
    campaignsRes.status === "fulfilled" || mapsRes.status === "fulfilled";

  if (!anySuccess) {
    $loading.hidden = true;
    $error.hidden = false;
    return;
  }

  if (campaignsRes.status === "fulfilled") {
    const body = campaignsRes.value;
    allCampaigns = body.campaigns || body || [];
  }

  if (mapsRes.status === "fulfilled") {
    const body = mapsRes.value;
    allMaps = body.maps || body || [];
  }

  matchedCampaigns = filterCampaignsBySeason(allCampaigns);

  renderStats();
  renderCampaigns();

  $loading.hidden = true;

  if (!matchedCampaigns.length) {
    $empty.hidden = false;
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
if (!seasonInfo) {
  window.location.replace("/alterations/");
} else {
  setupHero();
  loadData();
}


