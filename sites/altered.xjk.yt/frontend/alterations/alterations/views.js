import { esc, escN, fmtTime } from "../../shared/formatters.js?v=2";
import {
  filterAndSortCampaignMaps,
  getActiveCampaignMaps,
  getAlterationBySlug,
  getAlterationStats,
  getCampaignKey,
} from "./state.js?v=2";

function createAlterationsViews({ documentObject, elements, state, actions }) {
  const { container, controlsBar, empty, mapSearch } = elements;
  const setHtml = (element, value) => globalThis.XjkSafeHtml.set(element, value);

  function setStatValue(id, value) {
    const element = documentObject.getElementById(id);
    if (element) element.textContent = value ?? "\u2014";
  }

  function renderStats() {
    if (state.activeAlterationSlug) {
      const stats = getAlterationStats(state, state.activeAlterationSlug);
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

  function renderMessage(message) {
    setHtml(container, `<div class="state-msg"><p>${esc(message)}</p></div>`);
  }

  function renderAlterationOverview() {
    const query = state.alterationSearch.trim().toLowerCase();
    const visibleAlterations = state.alterations.filter((alteration) => {
      if (!query) return true;
      const stats = getAlterationStats(state, alteration.slug);
      const haystack = [alteration.name, stats.latestSeason]
        .map((value) => String(value || "").toLowerCase())
        .join(" ");
      return haystack.includes(query);
    });

    empty.hidden = visibleAlterations.length > 0;
    setHtml(
      container,
      `
        <div class="alteration-toolbar">
          <label class="alteration-search-wrap">
            <span class="alteration-search-label">Find an alteration</span>
            <input class="alteration-search-input" id="alteration-search" type="search" placeholder="Search alteration names..." value="${esc(state.alterationSearch)}" />
          </label>
          ${
            visibleAlterations.length
              ? `<p class="alteration-toolbar-meta">${visibleAlterations.length} alterations with mapped campaigns</p>`
              : ""
          }
        </div>
        ${
          visibleAlterations.length
            ? `<section class="alteration-grid" aria-label="Alteration catalog">
                ${visibleAlterations
                  .map((alteration) => {
                    const stats = getAlterationStats(state, alteration.slug);
                    return `
                      <button class="alteration-card" type="button" data-slug="${esc(alteration.slug)}">
                        <span class="alteration-card-kicker">Alteration</span>
                        <h2 class="alteration-card-title">${esc(alteration.name)}</h2>
                        <p class="alteration-card-sub">Latest season: ${esc(stats.latestSeason)}</p>
                        <div class="alteration-card-stats">
                          <span><strong>${stats.campaignCount}</strong> campaigns</span>
                          <span><strong>${stats.mapCount}</strong> maps</span>
                        </div>
                      </button>`;
                  })
                  .join("")}
              </section>`
            : ""
        }`
    );

    documentObject.getElementById("alteration-search")?.addEventListener("input", (event) => {
      actions.searchAlterations(event.target.value || "");
    });
    container.querySelectorAll(".alteration-card").forEach((card) => {
      card.addEventListener("click", () => actions.openAlteration(card.dataset.slug || ""));
    });
  }

  function renderAlterationDetail(alteration, campaigns, stats) {
    empty.hidden = campaigns.length > 0;
    setHtml(
      container,
      `
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
        ${campaigns.length ? campaignCardsHtml(campaigns, alteration.name) : ""}`
    );

    documentObject.getElementById("alteration-back")?.addEventListener("click", actions.openOverview);
    container.querySelectorAll(".campaign-card").forEach((card) => {
      card.addEventListener("click", () => actions.openCampaign(card.dataset.campaign || ""));
    });
  }

  function campaignCardsHtml(campaigns, alterationName) {
    return `
      <section class="campaign-grid" aria-label="Campaigns for ${esc(alterationName)}">
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
              </button>`;
          })
          .join("")}
      </section>`;
  }

  function renderCampaignMaps(campaign) {
    const alteration = getAlterationBySlug(state, state.activeAlterationSlug);
    const maps = filterAndSortCampaignMaps(state, getActiveCampaignMaps(state));
    empty.hidden = maps.length > 0;
    setHtml(
      container,
      `
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
                .map(mapCardHtml)
                .join("")}</section>`
            : `<div class="state-msg"><p>${state.mapSearch ? "No maps match your search." : "No maps in this campaign yet."}</p></div>`
        }`
    );

    documentObject.getElementById("campaign-back")?.addEventListener("click", () => actions.openAlteration());
    documentObject.getElementById("campaign-maps-grid")?.addEventListener("click", (event) => {
      const card = event.target.closest(".map-card");
      if (card) actions.openMap(card.dataset.uid || "");
    });
  }

  function resetOverviewControls() {
    if (mapSearch) mapSearch.value = "";
    if (controlsBar) controlsBar.hidden = true;
  }

  function showCampaignControls() {
    if (controlsBar) controlsBar.hidden = false;
  }

  return {
    renderAlterationDetail,
    renderAlterationOverview,
    renderCampaignMaps,
    renderMessage,
    renderStats,
    resetOverviewControls,
    showCampaignControls,
  };
}

function mapCardHtml(map) {
  const tracking = map.tracking_status || "idle";
  const trackingClass =
    tracking === "active" || tracking === "live" ? "active" : tracking === "paused" ? "paused" : "idle";
  const thumbnail = map.thumbnail_url ? `<img src="${esc(map.thumbnail_url)}" alt="" loading="lazy" />` : "";
  const worldRecord = map.wr_ms
    ? `<span class="wr-time">${fmtTime(map.wr_ms)}</span><span class="wr-holder">${escN(map.wr_holder)}</span>`
    : '<span class="wr-empty">No WR data</span>';
  const metadata = [
    map.map_number ? `#${map.map_number}` : "",
    map.change_count ? `${map.change_count} WR changes` : "",
  ].filter(Boolean);

  return `
    <article class="map-card" data-uid="${esc(map.map_uid)}">
      <div class="map-thumb">${thumbnail}<span class="map-status map-status-${trackingClass}">${esc(tracking)}</span></div>
      <div class="map-body">
        <h3 class="map-name" title="${escN(map.name)}">${escN(map.name || "Untitled")}</h3>
        <p class="map-author">by ${escN(map.author || "Unknown")}</p>
        <div class="map-wr">${worldRecord}</div>
        <div class="map-medals">
          <span class="medal medal-at">${fmtTime(map.author_time)}</span>
          <span class="medal medal-gold">${fmtTime(map.gold_time)}</span>
          <span class="medal medal-silver">${fmtTime(map.silver_time)}</span>
          <span class="medal medal-bronze">${fmtTime(map.bronze_time)}</span>
        </div>
        ${metadata.length ? `<div class="map-card-meta">${metadata.map((item) => `<span>${esc(item)}</span>`).join("")}</div>` : ""}
      </div>
    </article>`;
}

export { createAlterationsViews, mapCardHtml };
