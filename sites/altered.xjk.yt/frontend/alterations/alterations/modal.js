import { esc, escN, fmtTime, relTime } from "../../shared/formatters.js?v=2";
import { getActiveCampaignMaps } from "./state.js?v=2";

function createMapModal({ documentObject, elements, state, transport, writeUrl }) {
  const { modalBackdrop, modalContent } = elements;
  const setHtml = (value) => globalThis.XjkSafeHtml.set(modalContent, value);

  function show() {
    modalBackdrop.hidden = false;
    documentObject.body.style.overflow = "hidden";
  }

  function open(mapUid, updateUrl = true) {
    if (!mapUid) return;
    const map = getActiveCampaignMaps(state).find((item) => item.map_uid === mapUid);
    if (!map || !modalContent) return;

    setHtml(mapModalHtml(map));
    show();
    if (updateUrl) {
      writeUrl({
        alteration: state.activeAlterationSlug,
        campaign: state.activeCampaignId,
        map: mapUid,
      });
    }
  }

  function close(updateUrl = true) {
    if (modalBackdrop) modalBackdrop.hidden = true;
    documentObject.body.style.overflow = "";
    if (updateUrl) {
      writeUrl({
        alteration: state.activeAlterationSlug,
        campaign: state.activeCampaignId,
      });
    }
  }

  async function openByUid(mapUid) {
    const existing = getActiveCampaignMaps(state).find((item) => item.map_uid === mapUid);
    if (existing) {
      open(mapUid, false);
      return;
    }

    try {
      const payload = await transport.loadMapDetail(mapUid);
      if (!payload?.map || !modalContent) return;
      setHtml(directMapModalHtml(payload.map));
      show();
    } catch (_error) {
      // Direct links are optional context; the surrounding page remains usable on failure.
    }
  }

  return { close, open, openByUid };
}

function mapModalHtml(map) {
  const tracking = map.tracking_status || "idle";
  const trackingClass =
    tracking === "active" || tracking === "live" ? "active" : tracking === "paused" ? "paused" : "idle";
  const thumbnail = map.thumbnail_url
    ? `<img class="modal-thumb" src="${esc(map.thumbnail_url)}" alt="" />`
    : '<div class="modal-thumb modal-thumb-empty"></div>';
  const worldRecord = map.wr_ms
    ? `<div class="modal-wr">
        <div class="modal-wr-row">
          <span class="modal-wr-rank">1</span>
          <div class="modal-wr-detail">
            <span class="modal-wr-holder">${escN(map.wr_holder)}</span>
            <span class="modal-wr-ago">${relTime(map.wr_updated_at)}</span>
          </div>
          <span class="modal-wr-time">${fmtTime(map.wr_ms)}</span>
        </div>
      </div>`
    : '<div class="modal-wr modal-wr-empty"><span>No WR data recorded yet</span></div>';

  return `
    <div class="modal-hero">
      ${thumbnail}
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
      ${medalHtml("Author", "at", map.author_time)}
      ${medalHtml("Gold", "gold", map.gold_time)}
      ${medalHtml("Silver", "silver", map.silver_time)}
      ${medalHtml("Bronze", "bronze", map.bronze_time)}
    </div>
    <div class="modal-section"><h3 class="modal-section-title">World Record</h3>${worldRecord}</div>
    <div class="modal-section">
      <h3 class="modal-section-title">Map Meta</h3>
      <div class="modal-stats">
        <div class="modal-stat"><span class="modal-stat-value">${map.map_number || "\u2014"}</span><span class="modal-stat-label">Map #</span></div>
        <div class="modal-stat"><span class="modal-stat-value">${map.change_count ?? 0}</span><span class="modal-stat-label">WR Changes</span></div>
      </div>
    </div>
    <div class="modal-uid"><span>UID:</span> ${esc(map.map_uid)}</div>`;
}

function directMapModalHtml(map) {
  const thumbnail = map.thumbnailUrl
    ? `<img class="modal-thumb" src="${esc(map.thumbnailUrl)}" alt="" />`
    : '<div class="modal-thumb modal-thumb-empty"></div>';
  const worldRecord = map.wrMs
    ? `<div class="modal-wr"><div class="modal-wr-row"><span class="modal-wr-rank">1</span><div class="modal-wr-detail"><span class="modal-wr-holder">${escN(map.wrHolder)}</span><span class="modal-wr-ago">${relTime(map.wrUpdatedAt)}</span></div><span class="modal-wr-time">${fmtTime(map.wrMs)}</span></div></div>`
    : '<div class="modal-wr modal-wr-empty"><span>No WR data recorded yet</span></div>';

  return `
    <div class="modal-hero">
      ${thumbnail}
      <div class="modal-info">
        <h2 class="modal-name">${escN(map.name || "Untitled")}</h2>
        <p class="modal-author">by ${escN(map.author || "Unknown")}</p>
        <div class="modal-tags">${map.campaignName ? `<span class="modal-campaign">${escN(map.campaignName)}</span>` : ""}</div>
      </div>
    </div>
    <div class="modal-section"><h3 class="modal-section-title">World Record</h3>${worldRecord}</div>
    <div class="modal-uid"><span>UID:</span> ${esc(map.mapUid)}</div>`;
}

function medalHtml(label, className, value) {
  return `<div class="modal-medal modal-medal-${className}"><span class="modal-medal-label">${label}</span><span class="modal-medal-time">${fmtTime(value)}</span></div>`;
}

export { createMapModal, directMapModalHtml, mapModalHtml };
