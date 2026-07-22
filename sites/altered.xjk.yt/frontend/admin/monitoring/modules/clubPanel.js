import { esc, fmtCount, fmtTs, renderList, setLine } from "./context.js";

const CLUB_TAB_KEY = "altered_admin_monitor_club_tab_v1";
const VALID_CLUB_TABS = new Set(["maps", "campaigns", "uploads"]);

function createClubPanel({ state, el, api }) {
  function setClubTab(tab, persist = true) {
    state.clubTab = VALID_CLUB_TABS.has(tab) ? tab : "maps";
    if (persist) localStorage.setItem(CLUB_TAB_KEY, state.clubTab);
    el.clubTabs.forEach((b) => {
      const a = b.getAttribute("data-club-tab") === state.clubTab;
      b.classList.toggle("is-active", a);
      b.setAttribute("aria-selected", a ? "true" : "false");
    });
    el.clubPanels.forEach((p) => {
      const a = p.getAttribute("data-club-panel") === state.clubTab;
      p.classList.toggle("is-active", a);
      p.hidden = !a;
    });
  }

  function renderClub() {
    el.clubMapsSummary.textContent = `Loaded ${fmtCount(state.club.maps.length)} maps (${fmtTs(state.club.loadedAt)}).`;
    el.clubCampaignsSummary.textContent = `Loaded ${fmtCount(state.club.campaigns.length)} campaigns (${fmtTs(state.club.loadedAt)}).`;
    el.clubUploadsSummary.textContent = `Loaded ${fmtCount(state.club.uploads.length)} upload rows (${fmtTs(state.club.loadedAt)}).`;

    renderList(
      el.clubMapsList,
      state.club.maps.slice(0, 140),
      (r) =>
        `<strong>${esc(r.name || r.map_uid || "Unknown map")}</strong><span class="hook-map-meta">UID: ${esc(r.map_uid || "-")} | Campaign: ${esc(r.campaign_name || "Unassigned")} | Players: ${esc(fmtCount(r.player_count || 0))}</span>`,
      "No maps tracked yet."
    );

    renderList(
      el.clubCampaignsList,
      state.club.campaigns.slice(0, 140),
      (r) =>
        `<strong>${esc(r.name || "Unknown campaign")}</strong><span class="hook-map-meta">ID: ${esc(r.id || "-")} | Maps: ${esc(fmtCount(r.map_count || 0))}</span>`,
      "No campaigns tracked yet."
    );

    renderList(
      el.clubUploadsList,
      state.club.uploads.slice(0, 140),
      (r) =>
        `<strong>${esc(r.map_name || r.map_uid || "Unknown map")}</strong><span class="hook-map-meta">Bucket: ${esc(r.bucket_name || `Bucket ${r.bucket_id || "-"}`)} | UID: ${esc(r.map_uid || "-")} | Last Seen: ${esc(fmtTs(r.last_seen_at))}</span>`,
      "No upload maps tracked yet."
    );
  }

  async function loadClub(silent = false) {
    try {
      const [maps, campaigns, uploads] = await Promise.all([
        api("/api/v1/alterations/maps?limit=1500"),
        api("/api/v1/alterations/campaigns?limit=1200"),
        api("/api/v1/alterations/uploads?limit=1500"),
      ]);
      state.club.maps = Array.isArray(maps?.maps) ? maps.maps : [];
      state.club.campaigns = Array.isArray(campaigns?.campaigns) ? campaigns.campaigns : [];
      state.club.uploads = Array.isArray(uploads?.uploads) ? uploads.uploads : [];
      state.club.loadedAt = new Date().toISOString();
      renderClub();
    } catch (e) {
      if (!silent) setLine(el.configStatus, `Failed to load club data: ${e.message}`, "bad");
    }
  }

  function bindEvents() {
    el.clubTabs.forEach((button) =>
      button.addEventListener("click", () => setClubTab(button.getAttribute("data-club-tab") || "maps"))
    );
    el.refreshClubDataBtn?.addEventListener("click", () => loadClub(false));
  }

  function initialize() {
    setClubTab(localStorage.getItem(CLUB_TAB_KEY) || "maps", false);
  }

  return { bindEvents, initialize, load: loadClub, render: renderClub };
}

export { createClubPanel };
