const API = {
  maps: "/api/v1/alterations/maps",
  campaigns: "/api/v1/alterations/campaigns",
  stats: "/api/v1/alterations/stats",
};
let allMaps = [];
let allCampaigns = [];
let activeCampaign = null;
let searchQuery = "";
let sortField = "newest";
let currentPage = 1;
const PAGE_SIZE = 24;
let ribbonOffset = 0;
let ribbonHalfWidth = 0;
let ribbonCurrentSpeed = 50;
let ribbonTargetSpeed = 50;
let ribbonLastTime = 0;
const RIBBON_NORMAL_SPEED = 50;
const RIBBON_SLOW_SPEED = 3;
const $mapGrid = document.getElementById("map-grid");
const $campaignsSection = document.getElementById("campaigns-section");
const $campaignsScroll = document.getElementById("campaigns-scroll");
const $searchInput = document.getElementById("map-search");
const $sortSelect = document.getElementById("map-sort");
const $loading = document.getElementById("loading-state");
const $empty = document.getElementById("empty-state");
const $error = document.getElementById("error-state");
const $pagination = document.getElementById("pagination");
const $ribbon = document.getElementById("ribbon-track");
const $modalBackdrop = document.getElementById("map-modal-backdrop");
const $modalContent = document.getElementById("map-modal-content");
const $modalClose = document.getElementById("map-modal-close");
function fmtTime(ms) {
  if (!ms || ms <= 0) return "\u2014";
  const m = Math.floor(ms / 60000);
  const s = Math.floor((ms % 60000) / 1000);
  const f = ms % 1000;
  return `${m}:${String(s).padStart(2, "0")}.${String(f).padStart(3, "0")}`;
}
function relTime(iso) {
  if (!iso) return "\u2014";
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 30) return `${days}d ago`;
  return new Date(iso).toLocaleDateString();
}
function esc(str) {
  if (!str) return "";
  const el = document.createElement("span");
  el.textContent = str;
  return el.innerHTML;
}
function renderStats(stats) {
  const set = (id, v) => {
    const el = document.getElementById(id);
    if (el) el.textContent = v ?? "\u2014";
  };
  set("stat-maps", stats.total_maps);
  set("stat-tracked", stats.actively_tracked);
  set("stat-wr-changes", stats.total_wr_changes);
  set("stat-last-run", relTime(stats.last_run_at));
}

function renderCampaigns(campaigns) {
  if (!campaigns.length) {
    $campaignsSection.hidden = true;
    return;
  }
  $campaignsSection.hidden = false;

  let html = `<button class="campaign-card active" data-campaign="">
    <span class="campaign-name">All Maps</span>
    <span class="campaign-count">${allMaps.length} maps</span>
  </button>`;

  for (const c of campaigns) {
    const id = c.id ?? c.name ?? "";
    html += `<button class="campaign-card" data-campaign="${esc(String(id))}">
      <span class="campaign-name">${esc(c.name)}</span>
      <span class="campaign-count">${c.map_count ?? 0} maps</span>
    </button>`;
  }

  $campaignsScroll.innerHTML = html;

  $campaignsScroll.querySelectorAll(".campaign-card").forEach((btn) => {
    btn.addEventListener("click", () => {
      $campaignsScroll.querySelector(".active")?.classList.remove("active");
      btn.classList.add("active");
      activeCampaign = btn.dataset.campaign || null;
      currentPage = 1;
      renderMaps();
    });
  });
}
function renderRibbon(campaigns) {
  if (!$ribbon || !campaigns.length) return;

  const shuffled = [...campaigns].sort(() => Math.random() - 0.5);

  const pill = (c) =>
    `<a class="ribbon-pill" href="#" data-campaign="${esc(String(c.id ?? c.name ?? ""))}">${esc(c.name)}</a>`;

  const pills = shuffled.map(pill).join("");
  $ribbon.innerHTML = pills + pills;

  $ribbon.querySelectorAll(".ribbon-pill").forEach((el) => {
    el.addEventListener("click", (e) => {
      e.preventDefault();
      const cId = el.dataset.campaign;
      if (cId) {
        activeCampaign = cId;
        currentPage = 1;
        $campaignsScroll.querySelector(".active")?.classList.remove("active");
        const match = $campaignsScroll.querySelector(`[data-campaign="${cId}"]`);
        if (match) match.classList.add("active");
        renderMaps();
      }
    });
  });

  const container = document.getElementById("campaign-ribbon");
  container.addEventListener("mouseenter", () => {
    ribbonTargetSpeed = RIBBON_SLOW_SPEED;
  });
  container.addEventListener("mouseleave", () => {
    ribbonTargetSpeed = RIBBON_NORMAL_SPEED;
  });

  requestAnimationFrame(() => {
    ribbonHalfWidth = $ribbon.scrollWidth / 2;
    ribbonCurrentSpeed = RIBBON_NORMAL_SPEED;
    ribbonLastTime = performance.now();
    requestAnimationFrame(tickRibbon);
  });
}

function tickRibbon(now) {
  const dt = Math.min((now - ribbonLastTime) / 1000, 0.1);
  ribbonLastTime = now;

  const ease = 1 - Math.pow(0.03, dt);
  ribbonCurrentSpeed += (ribbonTargetSpeed - ribbonCurrentSpeed) * ease;

  ribbonOffset += ribbonCurrentSpeed * dt;
  if (ribbonHalfWidth > 0 && ribbonOffset >= ribbonHalfWidth) {
    ribbonOffset -= ribbonHalfWidth;
  }

  $ribbon.style.transform = `translateX(-${ribbonOffset}px)`;
  requestAnimationFrame(tickRibbon);
}
function renderMaps() {
  let maps = [...allMaps];
  if (activeCampaign) {
    maps = maps.filter(
      (m) =>
        String(m.campaign_id) === activeCampaign ||
        m.campaign_name === activeCampaign
    );
  }
  if (searchQuery) {
    const q = searchQuery.toLowerCase();
    maps = maps.filter(
      (m) =>
        (m.name || "").toLowerCase().includes(q) ||
        (m.author || "").toLowerCase().includes(q) ||
        (m.wr_holder || "").toLowerCase().includes(q)
    );
  }
  maps.sort((a, b) => {
    switch (sortField) {
      case "newest":
        return (b._idx ?? 0) - (a._idx ?? 0);
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
  const totalFiltered = maps.length;
  const totalPages = Math.max(1, Math.ceil(totalFiltered / PAGE_SIZE));
  if (currentPage > totalPages) currentPage = totalPages;
  const start = (currentPage - 1) * PAGE_SIZE;
  const pageMaps = maps.slice(start, start + PAGE_SIZE);
  if (!maps.length) {
    $mapGrid.innerHTML = "";
    $mapGrid.hidden = true;
    $empty.hidden = false;
    if ($pagination) $pagination.hidden = true;
    return;
  }

  $empty.hidden = true;
  $mapGrid.hidden = false;

  $mapGrid.innerHTML = pageMaps
    .map((m) => {
      const st = m.tracking_status || "idle";
      const stClass = st === "active" ? "active" : st === "paused" ? "paused" : "idle";

      const thumb = m.thumbnail_url
        ? `<img src="${esc(m.thumbnail_url)}" alt="" loading="lazy" />`
        : "";

      const wrBlock = m.wr_ms
        ? `<span class="wr-time">${fmtTime(m.wr_ms)}</span>
           <span class="wr-holder">${esc(m.wr_holder)}</span>`
        : `<span class="wr-empty">No WR data</span>`;

      return `<article class="map-card" data-uid="${esc(m.map_uid)}">
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
    })
    .join("");

  renderPagination(totalFiltered, totalPages);
}
function renderPagination(total, totalPages) {
  if (!$pagination) return;
  if (totalPages <= 1) {
    $pagination.hidden = true;
    return;
  }
  $pagination.hidden = false;

  const start = (currentPage - 1) * PAGE_SIZE + 1;
  const end = Math.min(currentPage * PAGE_SIZE, total);

  let html = `<span class="page-info">Showing ${start}\u2013${end} of ${total}</span>`;
  html += `<div class="page-buttons">`;
  html += `<button class="page-btn" data-page="prev" ${currentPage <= 1 ? "disabled" : ""}>\u2039 Prev</button>`;

  for (let i = 1; i <= totalPages; i++) {
    if (totalPages > 7) {
      if (i === 1 || i === totalPages || (i >= currentPage - 1 && i <= currentPage + 1)) {
        html += `<button class="page-btn ${i === currentPage ? "active" : ""}" data-page="${i}">${i}</button>`;
      } else if (i === currentPage - 2 || i === currentPage + 2) {
        html += `<span class="page-ellipsis">\u2026</span>`;
      }
    } else {
      html += `<button class="page-btn ${i === currentPage ? "active" : ""}" data-page="${i}">${i}</button>`;
    }
  }

  html += `<button class="page-btn" data-page="next" ${currentPage >= totalPages ? "disabled" : ""}>Next \u203a</button>`;
  html += `</div>`;

  $pagination.innerHTML = html;

  $pagination.querySelectorAll(".page-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      const p = btn.dataset.page;
      if (p === "prev") currentPage = Math.max(1, currentPage - 1);
      else if (p === "next") currentPage = Math.min(totalPages, currentPage + 1);
      else currentPage = parseInt(p, 10);
      renderMaps();
      $mapGrid.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  });
}
function openMapModal(uid, updateUrl = true) {
  const m = allMaps.find((x) => x.map_uid === uid);
  if (!m || !$modalContent) return;

  const thumb = m.thumbnail_url
    ? `<img class="modal-thumb" src="${esc(m.thumbnail_url)}" alt="" />`
    : `<div class="modal-thumb modal-thumb-empty"></div>`;

  const st = m.tracking_status || "idle";
  const stClass = st === "active" ? "active" : st === "paused" ? "paused" : "idle";

  const wrSection = m.wr_ms
    ? `<div class="modal-wr">
        <div class="modal-wr-row">
          <span class="modal-wr-rank">1</span>
          <div class="modal-wr-detail">
            <span class="modal-wr-holder">${esc(m.wr_holder)}</span>
            <span class="modal-wr-ago">${relTime(m.wr_updated_at)}</span>
          </div>
          <span class="modal-wr-time">${fmtTime(m.wr_ms)}</span>
        </div>
      </div>`
    : `<div class="modal-wr modal-wr-empty"><span>No WR data recorded yet</span></div>`;

  $modalContent.innerHTML = `
    <div class="modal-hero">
      ${thumb}
      <div class="modal-info">
        <h2 class="modal-name">${esc(m.name || "Untitled")}</h2>
        <p class="modal-author">by ${esc(m.author || "Unknown")}</p>
        <div class="modal-tags">
          ${m.campaign_name ? `<span class="modal-campaign">${esc(m.campaign_name)}</span>` : ""}
          <span class="map-status map-status-${stClass}" style="position:static">${esc(st)}</span>
        </div>
      </div>
    </div>

    <div class="modal-medals">
      <div class="modal-medal modal-medal-at">
        <span class="modal-medal-label">Author</span>
        <span class="modal-medal-time">${fmtTime(m.author_time)}</span>
      </div>
      <div class="modal-medal modal-medal-gold">
        <span class="modal-medal-label">Gold</span>
        <span class="modal-medal-time">${fmtTime(m.gold_time)}</span>
      </div>
      <div class="modal-medal modal-medal-silver">
        <span class="modal-medal-label">Silver</span>
        <span class="modal-medal-time">${fmtTime(m.silver_time)}</span>
      </div>
      <div class="modal-medal modal-medal-bronze">
        <span class="modal-medal-label">Bronze</span>
        <span class="modal-medal-time">${fmtTime(m.bronze_time)}</span>
      </div>
    </div>

    <div class="modal-section">
      <h3 class="modal-section-title">World Record</h3>
      ${wrSection}
    </div>

    <div class="modal-section">
      <h3 class="modal-section-title">Tracking</h3>
      <div class="modal-stats">
        <div class="modal-stat">
          <span class="modal-stat-value">${m.check_count ?? 0}</span>
          <span class="modal-stat-label">Checks</span>
        </div>
        <div class="modal-stat">
          <span class="modal-stat-value">${m.change_count ?? 0}</span>
          <span class="modal-stat-label">WR Changes</span>
        </div>
      </div>
    </div>

    <div class="modal-uid">
      <span>UID:</span> ${esc(m.map_uid)}
    </div>
  `;

  $modalBackdrop.hidden = false;
  document.body.style.overflow = "hidden";
  if (updateUrl) {
    history.pushState({ map: uid }, "", `?map=${encodeURIComponent(uid)}`);
  }
}

function closeMapModal(updateUrl = true) {
  if ($modalBackdrop) {
    $modalBackdrop.hidden = true;
    document.body.style.overflow = "";
  }
  if (updateUrl) {
    const params = new URLSearchParams(window.location.search);
    if (params.has("map")) {
      history.pushState(null, "", window.location.pathname);
    }
  }
}
async function fetchJson(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

async function loadData() {
  $loading.hidden = false;
  $mapGrid.hidden = true;
  $empty.hidden = true;
  $error.hidden = true;

  const [statsRes, mapsRes, campaignsRes] = await Promise.allSettled([
    fetchJson(API.stats),
    fetchJson(API.maps),
    fetchJson(API.campaigns),
  ]);

  const anySuccess =
    statsRes.status === "fulfilled" ||
    mapsRes.status === "fulfilled" ||
    campaignsRes.status === "fulfilled";

  if (!anySuccess) {
    $loading.hidden = true;
    $error.hidden = false;
    return;
  }

  if (statsRes.status === "fulfilled") {
    renderStats(statsRes.value);
  }

  if (mapsRes.status === "fulfilled") {
    const body = mapsRes.value;
    allMaps = body.maps || body || [];
    allMaps.forEach((m, i) => { m._idx = i; });
  }

  if (campaignsRes.status === "fulfilled") {
    const body = campaignsRes.value;
    allCampaigns = body.campaigns || body || [];
  }

  renderCampaigns(allCampaigns);
  renderRibbon(allCampaigns);
  renderMaps();

  $loading.hidden = true;

  if (!allMaps.length) {
    $empty.querySelector("p").textContent = "No maps tracked yet.";
    $empty.hidden = false;
  }
}
$searchInput.addEventListener("input", (e) => {
  searchQuery = e.target.value;
  currentPage = 1;
  renderMaps();
});

$sortSelect.addEventListener("change", (e) => {
  sortField = e.target.value;
  currentPage = 1;
  renderMaps();
});

$mapGrid.addEventListener("click", (e) => {
  const card = e.target.closest(".map-card");
  if (!card) return;
  const uid = card.dataset.uid;
  if (uid) openMapModal(uid);
});

if ($modalClose) {
  $modalClose.addEventListener("click", closeMapModal);
}

if ($modalBackdrop) {
  $modalBackdrop.addEventListener("click", (e) => {
    if (e.target === $modalBackdrop) closeMapModal();
  });
}

document.addEventListener("keydown", (e) => {
  if (e.key === "Escape" && $modalBackdrop && !$modalBackdrop.hidden) {
    closeMapModal();
  }
});
loadData();

