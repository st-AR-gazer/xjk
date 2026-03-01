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

async function fetchJson(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}
const $statMaps = document.getElementById("stat-maps");
const $statCampaigns = document.getElementById("stat-campaigns");
const $statPlayers = document.getElementById("stat-players");
const $statLatest = document.getElementById("stat-latest");
const $wrFeed = document.getElementById("wr-feed");
const $miniRankings = document.getElementById("mini-rankings");
const $wrSpotlight = document.getElementById("wr-spotlight");
const $wrSpotlightMap = document.getElementById("wr-spotlight-map");
const $wrSpotlightPlayer = document.getElementById("wr-spotlight-player");
const $wrSpotlightTime = document.getElementById("wr-spotlight-time");
const $wrSpotlightAgo = document.getElementById("wr-spotlight-ago");
function renderStats(summary, maps) {
  const holders = new Set();
  if (maps) {
    maps.forEach((m) => {
      if (m.wrHolder) holders.add(m.wrHolder);
    });
  }

  if ($statMaps) $statMaps.textContent = summary.trackedMaps ?? "\u2014";
  if ($statCampaigns) $statCampaigns.textContent = summary.campaignCount ?? "\u2014";
  if ($statPlayers) $statPlayers.textContent = holders.size || "\u2014";
  if ($statLatest) $statLatest.textContent = relTime(summary.latestWrAt);
}

function renderWrFeed(feed) {
  if (!$wrFeed) return;

  if (!feed || !feed.length) {
    $wrFeed.innerHTML = `<p class="activity-empty">No recent WR changes.</p>`;
    return;
  }

  const items = feed.slice(0, 6);
  $wrFeed.innerHTML = items
    .map(
      (entry) => `<div class="wr-feed-item">
      <span class="wr-feed-dot"></span>
      <div class="wr-feed-info">
        <span class="wr-feed-map">${esc(entry.name)}</span>
        <span class="wr-feed-player">by ${esc(entry.holder)}</span>
      </div>
      <div style="text-align:right">
        <span class="wr-feed-time">${fmtTime(entry.wrMs)}</span>
        <div class="wr-feed-ago">${relTime(entry.at)}</div>
      </div>
    </div>`
    )
    .join("");
}

function renderMiniRankings(maps) {
  if (!$miniRankings) return;

  if (!maps || !maps.length) {
    $miniRankings.innerHTML = `<li class="activity-empty">No data yet.</li>`;
    return;
  }

  const counts = {};
  maps.forEach((m) => {
    if (!m.wrHolder) return;
    if (!counts[m.wrHolder]) counts[m.wrHolder] = 0;
    counts[m.wrHolder] += 1;
  });

  const ranked = Object.entries(counts)
    .map(([player, count]) => ({ player, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 5);

  if (!ranked.length) {
    $miniRankings.innerHTML = `<li class="activity-empty">No WR holders found.</li>`;
    return;
  }

  const posClass = ["gold", "silver", "bronze"];

  $miniRankings.innerHTML = ranked
    .map(
      (r, i) => `<li class="mini-rank-item">
      <span class="mini-rank-pos ${posClass[i] || ""}">${i + 1}</span>
      <span class="mini-rank-name">${esc(r.player)}</span>
      <span class="mini-rank-count">${r.count} WR${r.count !== 1 ? "s" : ""}</span>
    </li>`
    )
    .join("");
}
function renderLatestWr(feedOrEntry) {
  if (!$wrSpotlight || !feedOrEntry) return;

  const latest = Array.isArray(feedOrEntry) ? feedOrEntry[0] : feedOrEntry;
  if (!latest) return;

  $wrSpotlightMap.textContent = latest.name || "\u2014";
  $wrSpotlightPlayer.textContent = "by " + (latest.holder || "Unknown");
  $wrSpotlightTime.textContent = fmtTime(latest.wrMs);
  $wrSpotlightAgo.textContent = relTime(latest.at);

  $wrSpotlight.hidden = false;
}
async function loadHubData() {
  try {
    const data = await fetchJson("/api/v1/dashboard");

    const maps = data.maps || [];
    const wrFeed = data.wrFeed || [];
    const latestWr = data.latestWr || (wrFeed.length ? wrFeed[0] : null);
    const summary = data.summary || {};

    renderStats(summary, maps);
    renderLatestWr(latestWr);
    renderWrFeed(wrFeed);
    renderMiniRankings(maps);
  } catch {
    if ($wrFeed) {
      $wrFeed.innerHTML = `<p class="activity-empty">Could not load data &mdash; the backend may not be running.</p>`;
    }
    if ($miniRankings) {
      $miniRankings.innerHTML = `<li class="activity-empty">Could not load rankings.</li>`;
    }
  }
}

loadHubData();

